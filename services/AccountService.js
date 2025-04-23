const { Account } = require('../models');
const { getShuAccount } = require('../models/Account');
const { logger } = require('../config');
const { executeWithRetry } = require('../utils/helper');
const { DB_CONFIG, DatabaseConnection } = require('../config/database');

class AccountService {
    constructor() {
        // 添加缓存相关属性
        this.bannedAccountsCache = [];  // 缓存的被封禁账号列表
        this.cacheIndex = 0;           // 当前的指针位置
        this.cacheTimestamp = 0;       // 缓存创建时间
        this.cacheMaxAge = 1000 * 60 * 60; // 缓存有效期：1小时
        this.cacheExhausted = false;   // 标记缓存是否已耗尽
        this.processingRequest = false; // 请求处理锁，防止并发访问导致的问题
        this.currentSource = 'main';   // 当前数据源
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
        logger.info(`[${requestId}] 接收到获取被封禁账号请求，当前数据源: ${DB_CONFIG.accountsApiSource}`);
        
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
                
                // 根据配置选择数据库源
                await this.loadBannedAccountsFromAllSources();
                
                this.cacheIndex = 0;
                this.cacheTimestamp = now;
                this.cacheExhausted = false;
                
                logger.info(`[${requestId}] 已加载 ${this.bannedAccountsCache.length} 个被封禁账号到缓存，数据源: ${this.currentSource}`);
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
            
            logger.info(`[${requestId}] 返回被封禁账号: ${account.phoneNumber}，缓存位置: ${this.cacheIndex}/${this.bannedAccountsCache.length}，数据源: ${this.currentSource}`);
            this.processingRequest = false;
            return account;
            
        } catch (error) {
            logger.error(`[${requestId}] 获取被封禁账号失败: ${error.message}`);
            this.processingRequest = false;
            throw error;
        }
    }
    
    /**
     * 从配置的所有数据源加载被封禁账号
     * @private
     */
    async loadBannedAccountsFromAllSources() {
        const dataSource = DB_CONFIG.accountsApiSource;
        this.currentSource = dataSource;
        
        if (dataSource === 'main') {
            // 只从主数据库加载
            this.bannedAccountsCache = await this.loadBannedAccountsFromMainDB();
        } else if (dataSource === 'shu') {
            // 只从Shu数据库加载
            this.bannedAccountsCache = await this.loadBannedAccountsFromShuDB();
        } else if (dataSource === 'both') {
            // 从两个数据库加载并合并结果
            const mainAccounts = await this.loadBannedAccountsFromMainDB();
            const shuAccounts = await this.loadBannedAccountsFromShuDB();
            
            // 合并账号列表，避免重复（基于phoneNumber去重）
            const phoneNumbers = new Set();
            const mergedAccounts = [];
            
            // 处理主数据库账号
            mainAccounts.forEach(account => {
                if (!phoneNumbers.has(account.phoneNumber)) {
                    phoneNumbers.add(account.phoneNumber);
                    // 标记来源数据库
                    account.dbSource = 'main';
                    mergedAccounts.push(account);
                }
            });
            
            // 处理Shu数据库账号
            shuAccounts.forEach(account => {
                if (!phoneNumbers.has(account.phoneNumber)) {
                    phoneNumbers.add(account.phoneNumber);
                    // 标记来源数据库
                    account.dbSource = 'shu';
                    mergedAccounts.push(account);
                }
            });
            
            this.bannedAccountsCache = mergedAccounts;
        }
    }
    
    /**
     * 从主数据库加载被封禁账号
     * @private
     * @returns {Promise<Array>} 被封禁账号列表
     */
    async loadBannedAccountsFromMainDB() {
        return await Account.find(
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
    }
    
    /**
     * 从Shu数据库加载被封禁账号
     * @private
     * @returns {Promise<Array>} 被封禁账号列表
     */
    async loadBannedAccountsFromShuDB() {
        try {
            const ShuAccount = await getShuAccount();
            if (!ShuAccount) {
                logger.warn('未能获取Shu数据库连接，无法加载被封禁账号');
                return [];
            }
            
            return await ShuAccount.find(
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
        } catch (error) {
            logger.error(`从Shu数据库加载被封禁账号失败: ${error.message}`);
            return [];
        }
    }

    /**
     * 标记账号为已处理
     * @param {String} phoneNumber 手机号码
     * @returns {Promise<Object>} 更新后的账号
     */
    async markAccountAsHandled(phoneNumber) {
        // 根据配置选择数据源
        const dataSource = DB_CONFIG.accountsApiSource;
        
        let result = null;
        
        if (dataSource === 'main' || dataSource === 'both') {
            // 尝试在主数据库更新
            result = await Account.findOneAndUpdate(
                { phoneNumber },
                { $set: { isHandle: true } },
                { new: true, projection: { _id: 0, phoneNumber: 1, isHandle: 1 } }
            );
            
            if (result) {
                logger.info(`在主数据库中标记账号为已处理: ${phoneNumber}`);
            }
        }
        
        if ((dataSource === 'shu' || (dataSource === 'both' && !result)) && !result) {
            // 在Shu数据库中尝试更新
            try {
                const ShuAccount = await getShuAccount();
                if (ShuAccount) {
                    result = await ShuAccount.findOneAndUpdate(
                        { phoneNumber },
                        { $set: { isHandle: true } },
                        { new: true, projection: { _id: 0, phoneNumber: 1, isHandle: 1 } }
                    );
                    
                    if (result) {
                        logger.info(`在Shu数据库中标记账号为已处理: ${phoneNumber}`);
                    }
                }
            } catch (error) {
                logger.error(`在Shu数据库中标记账号失败: ${error.message}`);
            }
        }

        return result;
    }

    /**
     * 获取已处理的被封禁账号
     * @param {boolean} fromShu 是否从Shu数据库查询
     * @returns {Promise<Array>} 账号列表
     */
    async getHandledBannedAccounts(fromShu = false) {
        try {
            const requestId = Math.random().toString(36).substring(2, 10);
            const dbSource = fromShu ? 'Shu' : '主';
            logger.info(`[${requestId}] 从${dbSource}数据库获取已处理的被封禁账号`);
            
            let accounts = [];
            
            if (fromShu) {
                // 从Shu数据库查询
                const ShuAccount = await getShuAccount();
                if (!ShuAccount) {
                    logger.warn(`[${requestId}] 未能获取Shu数据库连接，无法加载已处理的被封禁账号`);
                    return [];
                }
                
                accounts = await ShuAccount.find(
                    { 
                        status: 'banned',
                        isHandle: true
                    },
                    {
                        _id: 0,
                        name: 1,
                        phoneNumber: 1,
                        proxy: 1
                    }
                ).lean();
            } else {
                // 从主数据库查询
                accounts = await Account.find(
                    { 
                        status: 'banned',
                        isHandle: true
                    },
                    {
                        _id: 0,
                        name: 1,
                        phoneNumber: 1,
                        proxy: 1
                    }
                ).lean();
            }
            
            logger.info(`[${requestId}] 从${dbSource}数据库获取了 ${accounts.length} 个已处理的被封禁账号`);
            return accounts;
        } catch (error) {
            logger.error(`获取已处理的被封禁账号失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 获取账号状态
     * @param {string} phoneNumber 手机号码
     * @returns {Promise<Object>} 账号状态信息
     */
    async getAccountStatus(phoneNumber) {
        try {
            const requestId = Math.random().toString(36).substring(2, 10);
            logger.info(`[${requestId}] 获取账号状态: ${phoneNumber}`);
            
            // 定义返回结构
            const result = {
                phoneNumber,
                statusCode: 0 // 0:不存在 1:封禁 2:解封可接码 3:永久封禁 4:已扫码 5:其他状态
            };
            
            // 从主数据库查询
            const mainAccount = await Account.findOne(
                { phoneNumber },
                { 
                    _id: 0,
                    status: 1,
                    isHandle: 1,
                    isPermanentBan: 1
                }
            ).lean();
            
            // 从Shu数据库查询
            let shuAccount = null;
            const ShuAccount = await getShuAccount();
            if (ShuAccount) {
                shuAccount = await ShuAccount.findOne(
                    { phoneNumber },
                    { 
                        _id: 0,
                        status: 1,
                        isHandle: 1,
                        isPermanentBan: 1
                    }
                ).lean();
            }
            
            // 确定使用哪个账号数据（优先主数据库）
            const account = mainAccount || shuAccount;
            
            // 判断状态
            if (!account) {
                // 账号不存在
                result.statusCode = 0;
            } else if (account.isPermanentBan === true) {
                // 永久封禁
                result.statusCode = 3;
            } else if (account.status === 'banned' && account.isHandle === false) {
                // 封禁状态
                result.statusCode = 1;
            } else if (account.status === 'banned' && account.isHandle === true) {
                // 解封可接码
                result.statusCode = 2;
            } else if (account.status === 'online') {
                // 已扫码
                result.statusCode = 4;
            } else {
                // 其他状态
                result.statusCode = 5;
            }
            
            logger.info(`[${requestId}] 账号 ${phoneNumber} 状态查询结果: ${result.statusCode}`);
            return result;
            
        } catch (error) {
            logger.error(`获取账号状态失败: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new AccountService(); 