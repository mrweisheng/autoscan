const { Account } = require('../models');
const { logger } = require('../config');
const { executeWithRetry } = require('../utils/helper');

class AccountService {
    constructor() {
        // 添加缓存相关属性
        this.bannedAccountsCache = [];  // 缓存的被封禁账号列表
        this.cacheIndex = 0;           // 当前的指针位置
        this.cacheTimestamp = 0;       // 缓存创建时间
        this.cacheMaxAge = 1000 * 60 * 60; // 缓存有效期：1小时
        this.cacheExhausted = false;   // 标记缓存是否已耗尽
        this.processingRequest = false; // 请求处理锁，防止并发访问导致的问题
    }

    /**
     * 获取不活跃账号
     * @param {Number} inactiveDays 不活跃天数
     * @returns {Promise<Array>} 账号列表
     */
    async getInactiveAccounts(inactiveDays) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

        const inactiveAccounts = await Account.find({
            lastLogin: { $lt: cutoffDate }
        }).select('-__v -createdAt -updatedAt').lean();

        return inactiveAccounts;
    }

    /**
     * 更新账号最后登录时间
     * @param {String} phoneNumber 手机号码
     * @returns {Promise<Object>} 更新后的账号
     */
    async updateLastLogin(phoneNumber) {
        const now = new Date();

        const updatedAccount = await executeWithRetry(async () => {
            return await Account.findOneAndUpdate(
                { phoneNumber },
                { $set: { lastLogin: now } },
                { new: true, projection: { phoneNumber: 1, lastLogin: 1, _id: 0 } }
            );
        });

        return updatedAccount;
    }

    /**
     * 获取随机被封禁账号
     * @returns {Promise<Object>} 账号信息
     */
    async getRandomBannedAccount() {
        const now = Date.now();
        const requestId = Math.random().toString(36).substring(2, 10);
        logger.info(`[${requestId}] 接收到获取被封禁账号请求`);
        
        try {
            // 并发请求处理 - 如果有请求正在处理，等待它完成
            while (this.processingRequest) {
                logger.info(`[${requestId}] 等待其他请求处理完成`);
                await new Promise(resolve => setTimeout(resolve, 50)); // 等待50ms后再检查
            }
            
            // 标记正在处理请求
            this.processingRequest = true;
            
            // 检查缓存是否过期或为空
            if (this.bannedAccountsCache.length === 0 || now - this.cacheTimestamp > this.cacheMaxAge) {
                // 缓存过期或为空，重新查询数据库并重置指针
                logger.info(`[${requestId}] 重新加载被封禁账号缓存 - 原因: ${this.bannedAccountsCache.length === 0 ? '缓存为空' : '缓存过期'}`);
                
                this.bannedAccountsCache = await Account.find(
                    { 
                        status: 'banned',
                        isHandle: false
                    },
                    {
                        _id: 0,
                        name: 1,
                        phoneNumber: 1,
                        proxy: 1
                    }
                ).lean();
                
                this.cacheIndex = 0;
                this.cacheTimestamp = now;
                this.cacheExhausted = false;
                
                logger.info(`[${requestId}] 已加载 ${this.bannedAccountsCache.length} 个被封禁账号到缓存`);
            }
            
            // 如果缓存为空，返回null
            if (this.bannedAccountsCache.length === 0) {
                logger.info(`[${requestId}] 没有找到可用的被封禁账号`);
                this.processingRequest = false;
                return null;
            }
            
            // 如果所有账号已被返回，返回null和等待时间
            if (this.cacheExhausted || this.cacheIndex >= this.bannedAccountsCache.length) {
                this.cacheExhausted = true;
                const remainingTime = this.cacheMaxAge - (now - this.cacheTimestamp);
                const remainingMinutes = Math.ceil(remainingTime / (1000 * 60));
                
                logger.info(`[${requestId}] 当前时段的所有账号已被获取完毕，需等待 ${remainingMinutes} 分钟后重试`);
                this.processingRequest = false;
                return { exhausted: true, remainingMinutes };
            }
            
            // 获取当前账号并递增指针
            const account = this.bannedAccountsCache[this.cacheIndex++];
            
            logger.info(`[${requestId}] 返回被封禁账号: ${account.phoneNumber}，缓存位置: ${this.cacheIndex}/${this.bannedAccountsCache.length}`);
            this.processingRequest = false;
            return account;
            
        } catch (error) {
            logger.error(`[${requestId}] 获取被封禁账号失败: ${error.message}`);
            this.processingRequest = false;
            throw error;
        }
    }

    /**
     * 标记账号为已处理
     * @param {String} phoneNumber 手机号码
     * @returns {Promise<Object>} 更新后的账号
     */
    async markAccountAsHandled(phoneNumber) {
        const result = await Account.findOneAndUpdate(
            { 
                phoneNumber
            },
            { 
                $set: { isHandle: true } 
            },
            { new: true, projection: { _id: 0, phoneNumber: 1, isHandle: 1 } }
        );

        return result;
    }
}

module.exports = new AccountService(); 