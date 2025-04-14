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
    family: 4
};

class DatabaseConnection {
    constructor() {
        if (!DatabaseConnection.instance) {
            DatabaseConnection.instance = this;
        }
        return DatabaseConnection.instance;
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