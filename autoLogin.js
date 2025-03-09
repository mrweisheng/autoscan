require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const winston = require('winston');

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

// 配置日志
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} - ${level}: ${message}`;
        })
    ),
    transports: [
        new winston.transports.File({ filename: process.env.LOG_FILE }),
        new winston.transports.Console()
    ]
});

// 定义MongoDB Schema
const userLoginStatusSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone_device: { type: String, required: true, unique: true },
    login_status: { type: String, default: null }
}, { 
    timestamps: true,
    versionKey: false  // 禁用 __v 字段
});

const UserLoginStatus = mongoose.model('UserLoginStatus', userLoginStatusSchema);

// 修改 Account Schema
const accountSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true },
    name: { type: String },
    lastLogin: { type: Date, required: true },
    proxy: {
        host: { type: String },
        port: { type: String },
        username: { type: String },
        password: { type: String }
    }
}, { 
    timestamps: true,
    versionKey: false
});

const Account = mongoose.model('Account', accountSchema, 'accounts');

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
                logger.info('Already connected to MongoDB');
                return mongoose.connection;
            }

            logger.info('Connecting to MongoDB...');
            const conn = await mongoose.connect(process.env.MONGODB_URI, MONGODB_OPTIONS);
            logger.info('Successfully connected to MongoDB');
            
            // 检查数据库是否存在集合，不存在则创建
            const collections = await mongoose.connection.db.listCollections().toArray();
            if (!collections.find(c => c.name === 'userloginstatuses')) {
                logger.info('Creating user_login_status collection');
                await mongoose.connection.db.createCollection('userloginstatuses');
            }

            return conn;
        } catch (error) {
            logger.error('MongoDB connection error:', error);
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

class AutoLoginService {
    constructor() {
        this.db = new DatabaseConnection();
    }

    async executeWithRetry(operation, maxRetries = 3) {
        let lastError = null;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                logger.warn(`操作失败，尝试次数: ${attempt + 1}, 错误: ${error.message}`);
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
        throw lastError;
    }

    async mobilePushNeedLogin(req, res) {
        try {
            const { name, phone_device } = req.query;

            if (!name || !phone_device) {
                return res.status(400).json({
                    status: "error",
                    message: "Missing required parameters: name and phone_device"
                });
            }

            await this.executeWithRetry(async () => {
                await UserLoginStatus.findOneAndUpdate(
                    { phone_device },
                    { name, phone_device },
                    { upsert: true, new: true }
                );
            });

            logger.info(`Successfully recorded login request for device: ${phone_device}`);
            return res.json({
                status: "success",
                message: "Login request recorded"
            });

        } catch (error) {
            logger.error(`Error in mobilePushNeedLogin: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "Internal server error"
            });
        }
    }

    async pcGetNeedLogin(req, res) {
        try {
            const { phone_device } = req.query;

            if (!phone_device) {
                return res.status(400).json({
                    status: "error",
                    message: "Missing phone_device parameter"
                });
            }

            const result = await this.executeWithRetry(async () => {
                const record = await UserLoginStatus.findOneAndDelete({ phone_device }).select('-__v');
                return record;
            });

            if (!result) {
                return res.status(404).json({
                    status: "success",
                    data: null,
                    message: "No record found for this device"
                });
            }

            return res.json({
                status: "success",
                data: result
            });

        } catch (error) {
            logger.error(`Error in pcGetNeedLogin: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "Internal server error"
            });
        }
    }

    async pcPushNeedScan(req, res) {
        try {
            const { name, phone_device } = req.query;

            if (!name || !phone_device) {
                return res.status(400).json({
                    status: "error",
                    message: "Missing required parameters: name and phone_device"
                });
            }

            await this.executeWithRetry(async () => {
                await UserLoginStatus.findOneAndUpdate(
                    { phone_device },
                    {
                        name,
                        phone_device,
                        login_status: 'scan'
                    },
                    { upsert: true, new: true }
                );
            });

            logger.info(`成功处理扫码请求: name=${name}, phone_device=${phone_device}`);
            return res.json({
                status: "success",
                message: `Successfully processed scan record for: ${name}`
            });

        } catch (error) {
            logger.error(`处理扫码请求失败: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "Internal server error"
            });
        }
    }

    async mobileGetNeedScan(req, res) {
        try {
            const { phone_device } = req.query;

            if (!phone_device) {
                return res.status(400).json({
                    status: "error",
                    message: "Missing phone_device parameter"
                });
            }

            const result = await this.executeWithRetry(async () => {
                const record = await UserLoginStatus.findOneAndDelete({
                    phone_device,
                    login_status: 'scan'
                }).select('-__v');
                return record;
            });

            if (!result) {
                return res.status(404).json({
                    status: "success",
                    data: null,
                    message: "No scan record found for this device"
                });
            }

            return res.json({
                status: "success",
                data: result
            });

        } catch (error) {
            logger.error(`Error in mobileGetNeedScan: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "Internal server error"
            });
        }
    }

    async getInactiveAccounts(req, res) {
        try {
            let { days } = req.query;
            let inactiveDays = parseInt(process.env.INACTIVE_DAYS);

            // 如果用户传入了 days 参数
            if (days !== undefined) {
                days = parseInt(days);
                // 验证参数是否在有效范围内
                if (isNaN(days) || days < 1 || days > 20) {
                    return res.status(400).json({
                        status: "error",
                        message: "Days parameter must be an integer between 1 and 20"
                    });
                }
                inactiveDays = days;
            }

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

            const inactiveAccounts = await Account.find({
                lastLogin: { $lt: cutoffDate }
            }).select('-_id phoneNumber name lastLogin proxy');

            logger.info(`Found ${inactiveAccounts.length} inactive accounts for ${inactiveDays} days`);
            return res.json({
                status: "success",
                data: inactiveAccounts.map(account => ({
                    phoneNumber: account.phoneNumber,
                    name: account.name,
                    lastLogin: account.lastLogin,
                    proxy: {
                        host: account.proxy?.host || '',
                        port: account.proxy?.port || '',
                        username: account.proxy?.username || '',
                        password: account.proxy?.password || ''
                    }
                }))
            });

        } catch (error) {
            logger.error(`Error in getInactiveAccounts: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "Internal server error"
            });
        }
    }

    async updateLastLogin(req, res) {
        try {
            const { phoneNumber } = req.query;

            if (!phoneNumber) {
                return res.status(400).json({
                    status: "error",
                    message: "Missing phoneNumber parameter"
                });
            }

            const result = await Account.findOneAndUpdate(
                { phoneNumber },
                { lastLogin: new Date() },
                { new: true }
            );

            if (!result) {
                return res.status(404).json({
                    status: "success",
                    message: "Account not found"
                });
            }

            logger.info(`Updated lastLogin for phoneNumber: ${phoneNumber}`);
            return res.json({
                status: "success",
                data: {
                    phoneNumber: result.phoneNumber,
                    lastLogin: result.lastLogin
                }
            });

        } catch (error) {
            logger.error(`Error in updateLastLogin: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "Internal server error"
            });
        }
    }
}

// Express应用实例
const app = express();

// 创建服务器但不立即启动
const createServer = async () => {
    // 确保数据库连接已建立
    await DatabaseConnection.getInstance();
    
    const autoLoginService = new AutoLoginService();

    // 路由定义
    app.get('/mobile/push-need-login', (req, res) => autoLoginService.mobilePushNeedLogin(req, res));
    app.get('/pc/get_need_login', (req, res) => autoLoginService.pcGetNeedLogin(req, res));
    app.get('/pc/push_need_scan', (req, res) => autoLoginService.pcPushNeedScan(req, res));
    app.get('/mobile/get-need-scan', (req, res) => autoLoginService.mobileGetNeedScan(req, res));
    app.get('/accounts/inactive', (req, res) => autoLoginService.getInactiveAccounts(req, res));
    app.get('/accounts/update-login', (req, res) => autoLoginService.updateLastLogin(req, res));
    app.get('/health', async (req, res) => {
        try {
            // 检查数据库连接
            if (mongoose.connection.readyState !== 1) {
                throw new Error('Database connection is not ready');
            }

            // 尝试简单的数据库操作
            await mongoose.connection.db.admin().ping();

            res.json({
                status: 'ok',
                message: 'Service is healthy',
                dbState: 'connected',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Health check failed:', error);
            res.status(503).json({
                status: 'error',
                message: 'Service is not healthy',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    return app;
};

// 只在直接运行时启动服务器
if (require.main === module) {
    createServer().then(app => {
        const PORT = process.env.PORT || 5000;
        const HOST = process.env.HOST || '0.0.0.0';
        
        app.listen(PORT, HOST, () => {
            logger.info(`Server is running on ${HOST}:${PORT}`);
        });
    }).catch(error => {
        logger.error('Failed to start server:', error);
        process.exit(1);
    });
}

module.exports = {
    createServer,
    logger
}; 