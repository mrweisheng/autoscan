const { PermanentlyBannedAccount } = require('../models');
const { logger } = require('../config');
const { DB_CONFIG } = require('../config/database');
const { Account } = require('../models');
const { getShuAccount } = require('../models/Account');
const mongoose = require('mongoose');

class PermanentlyBannedAccountService {
    /**
     * 添加疑似永久封禁账号 - 更新为新逻辑：在两个数据库查询记录并标记为isPermanentBan=true
     * @param {Object} accountData 账号数据
     * @param {string} accountData.phoneNumber 手机号码
     * @param {string} accountData.remarks 备注信息，可选
     * @returns {Promise<Object>} 已更新的账号记录
     */
    async addPermanentlyBannedAccount(accountData) {
        try {
            const { phoneNumber, remarks } = accountData;
            let result = null;
            let source = null;
            
            // 首先在main数据库中查询
            logger.info(`在main数据库中查询手机号: ${phoneNumber}`);
            // 直接使用Account模型查询main数据库
            const mainAccount = await Account.findOne({ phoneNumber: phoneNumber });
            
            if (mainAccount) {
                // 在main数据库中找到了记录
                logger.info(`在main数据库中找到手机号: ${phoneNumber}`);
                source = 'main';
                
                // 使用MongoDB原生方法强制更新字段，不受模型Schema限制
                try {
                    // 获取数据库连接
                    const db = mongoose.connection.db;
                    // 直接使用原生方法更新
                    await db.collection('accounts').updateOne(
                        { phoneNumber: phoneNumber },
                        { $set: { isPermanentBan: true } }
                    );
                    
                    // 获取更新后的数据
                    result = await Account.findOne({ phoneNumber: phoneNumber });
                    logger.info(`成功在main数据库中更新账号状态为永久封禁: ${phoneNumber}`);
                } catch (updateError) {
                    logger.error(`使用原生方法更新main数据库时出错: ${updateError.message}`);
                    // 尝试使用模型方法
                    result = await Account.findOneAndUpdate(
                        { phoneNumber: phoneNumber },
                        { $set: { isPermanentBan: true } },
                        { new: true }
                    );
                }
            } else {
                // 在main数据库中没有找到，尝试在shu数据库中查询
                logger.info(`在shu数据库中查询手机号: ${phoneNumber}`);
                
                try {
                    // 获取Shu数据库模型
                    const ShuAccount = await getShuAccount();
                    
                    if (ShuAccount) {
                        const shuAccount = await ShuAccount.findOne({ phoneNumber: phoneNumber });
                        
                        if (shuAccount) {
                            // 在shu数据库中找到了记录
                            logger.info(`在shu数据库中找到手机号: ${phoneNumber}`);
                            source = 'shu';
                            
                            try {
                                // 获取shu数据库连接
                                const shuDb = ShuAccount.db;
                                // 直接使用原生方法更新
                                await shuDb.collection('accounts').updateOne(
                                    { phoneNumber: phoneNumber },
                                    { $set: { isPermanentBan: true } }
                                );
                                
                                // 获取更新后的数据
                                result = await ShuAccount.findOne({ phoneNumber: phoneNumber });
                                logger.info(`成功在shu数据库中更新账号状态为永久封禁: ${phoneNumber}`);
                            } catch (updateError) {
                                logger.error(`使用原生方法更新shu数据库时出错: ${updateError.message}`);
                                // 尝试使用模型方法
                                result = await ShuAccount.findOneAndUpdate(
                                    { phoneNumber: phoneNumber },
                                    { $set: { isPermanentBan: true } },
                                    { new: true }
                                );
                            }
                        } else {
                            logger.warn(`在shu数据库中未找到手机号: ${phoneNumber}`);
                        }
                    } else {
                        logger.error('无法获取Shu数据库连接');
                    }
                } catch (shuError) {
                    logger.error(`查询shu数据库时出错: ${shuError.message}`);
                }
            }
            
            if (result) {
                logger.info(`成功将手机号 ${phoneNumber} 标记为永久封禁，数据源: ${source}`);
                return { 
                    success: true, 
                    data: {
                        phoneNumber: phoneNumber,
                        source: source,
                        isPermanentBan: true  // 无论数据库是否返回此字段，都在响应中包含
                    },
                    source
                };
            } else {
                logger.warn(`未找到手机号: ${phoneNumber}`);
                return { 
                    success: false, 
                    message: '未找到指定手机号的账号记录' 
                };
            }
        } catch (error) {
            logger.error(`标记永久封禁账号失败: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * 获取所有疑似永久封禁账号
     * @param {Object} filter 过滤条件，可选
     * @returns {Promise<Array>} 账号列表
     */
    async getPermanentlyBannedAccounts(filter = {}) {
        try {
            // 执行查询
            const accounts = await PermanentlyBannedAccount.find(filter)
                .sort({ createdAt: -1 }) // 按创建时间降序排列
                .lean();
                
            return accounts;
        } catch (error) {
            logger.error(`获取疑似永久封禁账号列表失败: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * 更新疑似永久封禁账号状态
     * @param {string} phoneNumber 手机号码
     * @param {Object} updateData 更新数据
     * @returns {Promise<Object>} 更新后的账号记录
     */
    async updatePermanentlyBannedAccount(phoneNumber, updateData) {
        try {
            const updatedAccount = await PermanentlyBannedAccount.findOneAndUpdate(
                { phoneNumber },
                { $set: updateData },
                { new: true } // 返回更新后的文档
            );
            
            if (updatedAccount) {
                logger.info(`已更新疑似永久封禁账号: ${phoneNumber}`);
            } else {
                logger.warn(`未找到要更新的疑似永久封禁账号: ${phoneNumber}`);
            }
            
            return updatedAccount;
        } catch (error) {
            logger.error(`更新疑似永久封禁账号失败: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * The same phone number in the same source can only be reported once
     * @param {string} phoneNumber 
     * @returns {Promise<boolean>}
     */
    async exists(phoneNumber) {
        try {
            // 获取当前配置的数据源
            const source = DB_CONFIG.accountsApiSource || 'main';
            
            // 检查是否存在相同号码和来源的记录
            const exists = await PermanentlyBannedAccount.exists({
                phoneNumber,
                source
            });
            
            return !!exists;
        } catch (error) {
            logger.error(`检查疑似永久封禁账号是否存在失败: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new PermanentlyBannedAccountService(); 