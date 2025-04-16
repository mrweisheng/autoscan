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

class DatabaseConnection {
    constructor() {
        if (!DatabaseConnection.instance) {
            DatabaseConnection.instance = this;
            this.isReconnecting = false;
            this.setupConnectionMonitoring();
        }
        return DatabaseConnection.instance;
    }

    setupConnectionMonitoring() {
        // 监听连接断开事件
        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB连接断开，尝试重新连接...');
            this.safeReconnect();
        });

        // 监听连接错误事件
        mongoose.connection.on('error', (error) => {
            logger.error('MongoDB连接错误:', error);
            this.safeReconnect();
        });

        // 定期检查连接状态
        setInterval(() => {
            if (mongoose.connection.readyState !== 1) {
                logger.warn('MongoDB连接状态异常，尝试重新连接...');
                this.safeReconnect();
            }
        }, 30000);

        // 延迟启动连接池监控，给连接池足够的初始化时间
        setTimeout(() => {
            // 监控连接池状态
            setInterval(() => {
                if (mongoose.connection.readyState === 1) {
                    try {
                        const client = mongoose.connection.client;
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
                            logger.info('MongoDB连接池状态:', poolStatus);
                        }
                    } catch (error) {
                        // 静默处理错误，避免日志污染
                    }
                }
            }, 60000);
        }, 10000); // 延迟10秒启动监控
    }

    safeReconnect() {
        // 防止重复重连
        if (this.isReconnecting) {
            logger.warn('已经在尝试重新连接，跳过重复操作');
            return;
        }

        this.isReconnecting = true;
        this.reconnect()
            .finally(() => {
                // 无论成功失败，都重置重连标志
                setTimeout(() => {
                    this.isReconnecting = false;
                }, 5000); // 5秒后允许再次重连
            });
    }

    async reconnect() {
        try {
            if (mongoose.connection.readyState === 1) {
                await mongoose.connection.close();
            }
            await this.initializeConnection();
        } catch (error) {
            logger.error('重新连接失败:', error);
            // 5秒后重试
            return new Promise(resolve => {
                setTimeout(() => {
                    this.isReconnecting = false;
                    resolve();
                }, 5000);
            });
        }
    }

    async initializeConnection() {
        try {
            if (mongoose.connection.readyState === 1) {
                logger.info('已连接到MongoDB');
                return mongoose.connection;
            }

            logger.info('正在连接MongoDB...');
            const conn = await mongoose.connect(process.env.MONGODB_URI, MONGODB_OPTIONS);
            logger.info('成功连接到MongoDB');
            
            // 检查数据库是否存在集合，不存在则创建
            const collections = await mongoose.connection.db.listCollections().toArray();
            if (!collections.find(c => c.name === 'userloginstatuses')) {
                logger.info('创建user_login_status集合');
                await mongoose.connection.db.createCollection('userloginstatuses');
            }

            return conn;
        } catch (error) {
            logger.error('MongoDB连接错误:', error);
            throw error;
        }
    }

    static async getInstance() {
        if (!DatabaseConnection.instance) {
            DatabaseConnection.instance = new DatabaseConnection();
            await DatabaseConnection.instance.initializeConnection();
        }
        return DatabaseConnection.instance;
    }
}

module.exports = {
    DatabaseConnection,
    MONGODB_OPTIONS
}; 