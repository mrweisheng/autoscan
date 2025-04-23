const { PermanentlyBannedAccount } = require('../models');
const { logger } = require('../config');
const { DB_CONFIG } = require('../config/database');
const { Account } = require('../models');
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
            const mainAccount = await Account.findOne(
                { phoneNumber: phoneNumber },
                null,
                { connectionName: 'main' }
            );
            
            if (mainAccount) {
                // 在main数据库中找到了记录
                logger.info(`在main数据库中找到手机号: ${phoneNumber}`);
                source = 'main';
                
                // 更新记录，设置isPermanentBan为true
                result = await Account.findOneAndUpdate(
                    { phoneNumber: phoneNumber },
                    { $set: { isPermanentBan: true } },
                    { new: true, connectionName: 'main' }
                );
            } else {
                // 在main数据库中没有找到，尝试在shu数据库中查询
                logger.info(`在shu数据库中查询手机号: ${phoneNumber}`);
                const shuAccount = await Account.findOne(
                    { phoneNumber: phoneNumber },
                    null,
                    { connectionName: 'shu' }
                );
                
                if (shuAccount) {
                    // 在shu数据库中找到了记录
                    logger.info(`在shu数据库中找到手机号: ${phoneNumber}`);
                    source = 'shu';
                    
                    // 更新记录，设置isPermanentBan为true
                    result = await Account.findOneAndUpdate(
                        { phoneNumber: phoneNumber },
                        { $set: { isPermanentBan: true } },
                        { new: true, connectionName: 'shu' }
                    );
                }
            }
            
            if (result) {
                logger.info(`成功将手机号 ${phoneNumber} 标记为永久封禁，数据源: ${source}`);
                return { 
                    success: true, 
                    data: result, 
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