const { PermanentlyBannedAccount } = require('../models');
const { logger } = require('../config');
const { DB_CONFIG } = require('../config/database');

class PermanentlyBannedAccountService {
    /**
     * 添加疑似永久封禁账号
     * @param {Object} accountData 账号数据
     * @param {string} accountData.phoneNumber 手机号码
     * @param {string} accountData.remarks 备注信息，可选
     * @returns {Promise<Object>} 已添加的账号记录
     */
    async addPermanentlyBannedAccount(accountData) {
        try {
            // 获取当前配置的数据源作为来源字段
            const source = DB_CONFIG.accountsApiSource || 'main';
            
            // 创建新记录
            const newAccount = new PermanentlyBannedAccount({
                phoneNumber: accountData.phoneNumber,
                source: source,
                remarks: accountData.remarks || ''
            });
            
            // 保存到主数据库
            const savedAccount = await newAccount.save();
            
            logger.info(`已添加疑似永久封禁账号: ${accountData.phoneNumber}, 数据来源: ${source}`);
            return savedAccount;
        } catch (error) {
            logger.error(`添加疑似永久封禁账号失败: ${error.message}`);
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