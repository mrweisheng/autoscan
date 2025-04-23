const { PermanentlyBannedAccount } = require('../models');
const { logger } = require('../config');
const { DB_CONFIG } = require('../config/database');
const { Account } = require('../models');
const { getShuAccount } = require('../models/Account');
const mongoose = require('mongoose');

class PermanentlyBannedAccountService {
    /**
     * 添加疑似永久封禁账号 - 高性能优化版本
     * @param {Object} accountData 账号数据
     * @param {string} accountData.phoneNumber 手机号码
     * @param {string} accountData.remarks 备注信息，可选
     * @returns {Promise<Object>} 已更新的账号记录
     */
    async addPermanentlyBannedAccount(accountData) {
        try {
            const { phoneNumber, remarks } = accountData;
            let source = null;
            
            // 1. 同时查询main和shu数据库，使用Promise.all并行处理
            const [mainAccount, ShuAccount] = await Promise.all([
                // 查询main数据库
                Account.findOne({ phoneNumber }).exec(),
                // 获取shu数据库模型
                getShuAccount()
            ]);
            
            // 2. 如果获取到shu数据库模型，同时启动查询
            let shuAccount = null;
            if (ShuAccount) {
                shuAccount = await ShuAccount.findOne({ phoneNumber });
            }
            
            // 3. 根据查询结果决定更新哪个数据库
            if (mainAccount) {
                // 在main数据库中找到记录
                source = 'main';
                
                // 直接更新，不再二次查询
                await mongoose.connection.db.collection('accounts').updateOne(
                    { phoneNumber },
                    { $set: { isPermanentBan: true } }
                );
                
                logger.info(`成功在main数据库中将账号标记为永久封禁: ${phoneNumber}`);
                
                // 返回结果
                return { 
                    success: true, 
                    data: {
                        phoneNumber,
                        source: 'main',
                        isPermanentBan: true
                    }, 
                    source: 'main'
                };
            } 
            else if (shuAccount) {
                // 在shu数据库中找到记录
                source = 'shu';
                
                // 直接更新
                await ShuAccount.db.collection('accounts').updateOne(
                    { phoneNumber },
                    { $set: { isPermanentBan: true } }
                );
                
                logger.info(`成功在shu数据库中将账号标记为永久封禁: ${phoneNumber}`);
                
                // 返回结果
                return { 
                    success: true, 
                    data: {
                        phoneNumber,
                        source: 'shu',
                        isPermanentBan: true
                    }, 
                    source: 'shu'
                };
            }
            else {
                // 两个数据库都没找到
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