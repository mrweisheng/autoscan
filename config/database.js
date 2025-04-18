require('dotenv').config();
const mongoose = require('mongoose');
const winston = require('winston');

// 导入日志配置
const logger = require('./logger');

// MongoDB配置
const MONGODB_OPTIONS = {
    serverSelectionTimeoutMS: parseInt(process.env.MONGODB_TIMEOUT_MS),
    connectTimeoutMS: parseInt(process.env.MONGODB_TIMEOUT_MS),
    socketTimeoutMS: parseInt(process.env.MONGODB_TIMEOUT_MS),
    maxPoolSize: parseInt(process.env.MONGODB_POOL_SIZE_MAX),
    minPoolSize: parseInt(process.env.MONGODB_POOL_SIZE_MIN),
    maxIdleTimeMS: parseInt(process.env.MONGODB_IDLE_TIME_MS),
    waitQueueTimeoutMS: parseInt(process.env.MONGODB_QUEUE_TIMEOUT_MS),
    heartbeatFrequencyMS: parseInt(process.env.MONGODB_HEARTBEAT_FREQUENCY_MS),
    retryWrites: true,
    retryReads: true,
    family: 4
};

// 数据库连接选择配置
const DB_CONFIG = {
    // 主数据库连接
    main: {
        uri: process.env.MONGODB_URI,
        options: MONGODB_OPTIONS
    },
    // Shu数据库连接
    shu: {
        uri: process.env.MONGODB_SHU_URI || 'mongodb://test:test@104.37.187.30:27017/whatsapp_manager_test',
        options: MONGODB_OPTIONS
    },
    // 账号数据API使用哪个数据库：'main'、'shu'或'both'
    accountsApiSource: process.env.ACCOUNTS_API_SOURCE || 'main'
};

class DatabaseConnection {
    constructor() {
        if (!DatabaseConnection.instance) {
            DatabaseConnection.instance = this;
            this.isReconnecting = false;
            this.connections = {
                main: null,
                shu: null
            };
            this.setupConnectionMonitoring();
        }
        return DatabaseConnection.instance;
    }

    setupConnectionMonitoring() {
        // 监听连接断开事件
        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB主连接断开，尝试重新连接...');
            this.safeReconnect('main');
        });

        // 监听连接错误事件
        mongoose.connection.on('error', (error) => {
            logger.error('MongoDB主连接错误:', error);
            this.safeReconnect('main');
        });

        // 定期检查连接状态
        setInterval(() => {
            if (mongoose.connection.readyState !== 1) {
                logger.warn('MongoDB主连接状态异常，尝试重新连接...');
                this.safeReconnect('main');
            }
            
            // 检查Shu数据库连接状态
            if (this.connections.shu && this.connections.shu.readyState !== 1) {
                logger.warn('MongoDB Shu连接状态异常，尝试重新连接...');
                this.safeReconnect('shu');
            }
        }, 30000);

        // 延迟启动连接池监控，给连接池足够的初始化时间
        setTimeout(() => {
            // 监控连接池状态
            setInterval(() => {
                // 监控主连接池
                this.monitorConnectionPool('main', mongoose.connection);
                
                // 监控Shu连接池
                if (this.connections.shu) {
                    this.monitorConnectionPool('shu', this.connections.shu);
                }
            }, 60000);
        }, 10000); // 延迟10秒启动监控
    }
    
    monitorConnectionPool(name, connection) {
        if (connection.readyState === 1) {
            try {
                const client = connection.client;
                if (!client || !client.topology) {
                    return; // 静默返回，不记录警告
                }

                const pool = client.topology.s.pool;
                if (!pool) {
                    return; // 静默返回，不记录警告
                }

                const poolStatus = {
                    totalConnections: pool.totalConnectionCount || 0,
                    availableConnections: pool.availableConnectionCount || 0,
                    waitQueueSize: pool.waitQueueSize || 0,
                    maxPoolSize: pool.maxPoolSize || 0
                };

                // 只在连接池状态发生变化时记录日志
                if (poolStatus.totalConnections > 0) {
                    logger.info(`MongoDB ${name} 连接池状态:`, poolStatus);
                }
            } catch (error) {
                // 静默处理错误，避免日志污染
            }
        }
    }

    safeReconnect(dbName = 'main') {
        // 防止重复重连
        if (this.isReconnecting) {
            logger.warn(`已经在尝试重新连接 ${dbName}，跳过重复操作`);
            return;
        }

        this.isReconnecting = true;
        this.reconnect(dbName)
            .finally(() => {
                // 无论成功失败，都重置重连标志
                setTimeout(() => {
                    this.isReconnecting = false;
                }, 5000); // 5秒后允许再次重连
            });
    }

    async reconnect(dbName = 'main') {
        try {
            if (dbName === 'main' && mongoose.connection.readyState === 1) {
                await mongoose.connection.close();
            } else if (this.connections[dbName] && this.connections[dbName].readyState === 1) {
                await this.connections[dbName].close();
            }
            
            await this.initializeConnection(dbName);
        } catch (error) {
            logger.error(`重新连接 ${dbName} 失败:`, error);
            // 5秒后重试
            return new Promise(resolve => {
                setTimeout(() => {
                    this.isReconnecting = false;
                    resolve();
                }, 5000);
            });
        }
    }

    async initializeConnection(dbName = 'main') {
        try {
            if (dbName === 'main') {
                if (mongoose.connection.readyState === 1) {
                    logger.info('已连接到 MongoDB 主数据库');
                    this.connections.main = mongoose.connection;
                    return mongoose.connection;
                }

                logger.info('正在连接 MongoDB 主数据库...');
                const conn = await mongoose.connect(DB_CONFIG.main.uri, DB_CONFIG.main.options);
                logger.info('成功连接到 MongoDB 主数据库');
                
                this.connections.main = conn.connection;
                
                // 检查数据库是否存在集合，不存在则创建
                const collections = await mongoose.connection.db.listCollections().toArray();
                if (!collections.find(c => c.name === 'userloginstatuses')) {
                    logger.info('创建 user_login_status 集合');
                    await mongoose.connection.db.createCollection('userloginstatuses');
                }

                return conn.connection;
            } else if (dbName === 'shu') {
                // 如果已连接到Shu数据库
                if (this.connections.shu && this.connections.shu.readyState === 1) {
                    logger.info('已连接到 MongoDB Shu数据库');
                    return this.connections.shu;
                }
                
                // 创建新的连接
                logger.info('正在连接 MongoDB Shu数据库...');
                const shuConn = await mongoose.createConnection(DB_CONFIG.shu.uri, DB_CONFIG.shu.options);
                logger.info('成功连接到 MongoDB Shu数据库');
                
                this.connections.shu = shuConn;
                return shuConn;
            }
        } catch (error) {
            logger.error(`MongoDB ${dbName} 连接错误:`, error);
            throw error;
        }
    }
    
    // 获取主连接
    getMainConnection() {
        return this.connections.main || mongoose.connection;
    }
    
    // 获取Shu连接
    getShuConnection() {
        return this.connections.shu;
    }
    
    // 根据配置获取账号API使用的连接
    getAccountsApiConnections() {
        const source = DB_CONFIG.accountsApiSource;
        
        if (source === 'main') {
            return [this.getMainConnection()];
        } else if (source === 'shu') {
            return [this.getShuConnection()];
        } else if (source === 'both') {
            return [this.getMainConnection(), this.getShuConnection()];
        }
        
        // 默认返回主连接
        return [this.getMainConnection()];
    }

    static async getInstance() {
        if (!DatabaseConnection.instance) {
            DatabaseConnection.instance = new DatabaseConnection();
            await DatabaseConnection.instance.initializeConnection('main');
            
            // 初始化Shu数据库连接，如果需要的话
            if (['shu', 'both'].includes(DB_CONFIG.accountsApiSource)) {
                await DatabaseConnection.instance.initializeConnection('shu');
            }
        }
        return DatabaseConnection.instance;
    }
}

module.exports = {
    DatabaseConnection,
    MONGODB_OPTIONS,
    DB_CONFIG
}; 