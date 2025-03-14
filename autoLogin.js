require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const winston = require('winston');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

// 修改文件存储配置
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
        // 确保目录存在
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // 直接使用原始文件名，不添加时间戳
        cb(null, file.originalname);
    }
});

// 文件过滤器保持不变
const fileFilter = (req, file, cb) => {
    const allowedExtensions = ['.txt', '.vcf'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Only .txt and .vcf files are allowed'), false);
    }
};

// 修改 multer 配置
const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 限制文件大小为 5MB
    }
});

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
                    { 
                        name, 
                        phone_device,
                        login_status: 'offline'
                    },
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

    async uploadFile(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    status: "error",
                    message: "No file uploaded or file type not allowed"
                });
            }

            // 构建文件的公网访问URL，使用原始文件名
            const baseUrl = process.env.PUBLIC_URL || `http://${req.headers.host}`;
            const fileUrl = `${baseUrl}/uploads/${req.file.originalname}`;

            logger.info(`File uploaded successfully: ${req.file.originalname}`);
            return res.json({
                status: "success",
                data: {
                    filename: req.file.originalname,
                    originalname: req.file.originalname,
                    size: req.file.size,
                    url: fileUrl
                },
                message: "File uploaded successfully"
            });

        } catch (error) {
            logger.error(`Error in uploadFile: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "Internal server error"
            });
        }
    }

    async downloadFile(req, res) {
        try {
            let { filename } = req.params;
            
            if (!filename) {
                return res.status(400).json({
                    status: "error",
                    message: "Missing filename parameter"
                });
            }
            
            // 尝试解码 URL 编码的文件名
            try {
                filename = decodeURIComponent(filename);
            } catch (e) {
                logger.warn(`Failed to decode filename: ${filename}, ${e.message}`);
                // 继续使用原始文件名
            }
            
            logger.info(`Download request for file: ${filename}`);
            
            // 构建文件路径
            const filePath = path.join(__dirname, 'uploads', filename);
            
            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                logger.warn(`File not found: ${filePath}`);
                return res.status(404).json({
                    status: "error",
                    message: "File not found"
                });
            }
            
            // 获取文件信息
            const stat = fs.statSync(filePath);
            
            // 设置响应头
            res.setHeader('Content-Length', stat.size);
            
            // 根据文件扩展名设置正确的 Content-Type
            const ext = path.extname(filename).toLowerCase();
            if (ext === '.txt') {
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            } else if (ext === '.vcf') {
                res.setHeader('Content-Type', 'text/vcard');
            } else {
                res.setHeader('Content-Type', 'application/octet-stream');
            }
            
            // 设置下载文件名，处理中文文件名
            const encodedFilename = encodeURIComponent(filename);
            res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
            
            // 记录下载
            logger.info(`Sending file: ${filename}, size: ${stat.size} bytes`);
            
            // 发送文件
            fs.createReadStream(filePath).pipe(res);
            
        } catch (error) {
            logger.error(`Error in downloadFile: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "Internal server error"
            });
        }
    }

    async getFilesByType(req, res) {
        try {
            const { type } = req.query;
            
            // 验证文件类型
            if (!type || !['txt', 'vcf'].includes(type.toLowerCase())) {
                return res.status(400).json({
                    status: "error",
                    message: "Invalid or missing type parameter. Must be 'txt' or 'vcf'"
                });
            }
            
            const uploadDir = path.join(__dirname, 'uploads');
            
            // 确保目录存在
            if (!fs.existsSync(uploadDir)) {
                return res.json({
                    status: "success",
                    data: {
                        files: []
                    },
                    message: `No ${type} files found`
                });
            }
            
            // 读取目录中的所有文件
            const files = fs.readdirSync(uploadDir);
            
            // 过滤指定类型的文件
            const typeFiles = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return ext === `.${type.toLowerCase()}`;
            });
            
            // 如果没有找到文件
            if (typeFiles.length === 0) {
                return res.json({
                    status: "success",
                    data: {
                        files: []
                    },
                    message: `No ${type} files found`
                });
            }
            
            // 构建文件URL列表
            const baseUrl = process.env.PUBLIC_URL || `http://${req.headers.host}`;
            const fileUrls = typeFiles.map(file => {
                return {
                    filename: file,
                    url: `${baseUrl}/uploads/${file}`,
                    downloadUrl: `${baseUrl}/download/${file}`,
                    size: fs.statSync(path.join(uploadDir, file)).size
                };
            });
            
            // 记录请求
            logger.info(`File list requested for type: ${type}, found ${fileUrls.length} files`);
            
            return res.json({
                status: "success",
                data: {
                    files: fileUrls
                },
                message: `Found ${fileUrls.length} ${type} files`
            });
            
        } catch (error) {
            logger.error(`Error in getFilesByType: ${error.message}`);
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

    // 添加静态文件服务
    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

    // 添加文件上传路由
    app.post('/upload', upload.single('file'), (req, res) => autoLoginService.uploadFile(req, res));

    // 在 createServer 函数中添加下载路由
    app.get('/download/:filename', (req, res) => autoLoginService.downloadFile(req, res));

    // 添加获取文件列表的路由
    app.get('/files', (req, res) => autoLoginService.getFilesByType(req, res));

    return app;
};

// 添加文件清理函数
function cleanupOldFiles() {
    const uploadDir = path.join(__dirname, 'uploads');
    const cleanupDays = parseInt(process.env.FILE_CLEANUP_DAYS) || 0;
    
    // 如果设置为0，表示不删除文件
    if (cleanupDays === 0) {
        logger.info('File cleanup disabled (FILE_CLEANUP_DAYS=0)');
        return;
    }
    
    fs.readdir(uploadDir, (err, files) => {
        if (err) {
            logger.error(`Error reading upload directory: ${err.message}`);
            return;
        }
        
        if (files.length === 0) {
            logger.info('No files to clean up');
            return;
        }
        
        const now = Date.now();
        const maxAge = cleanupDays * 24 * 60 * 60 * 1000; // 转换为毫秒
        let cleanedCount = 0;
        
        files.forEach(file => {
            const filePath = path.join(uploadDir, file);
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    logger.error(`Error getting file stats: ${err.message}`);
                    return;
                }
                
                // 如果文件超过最大保存时间，则删除
                if (now - stats.mtime.getTime() > maxAge) {
                    fs.unlink(filePath, err => {
                        if (err) {
                            logger.error(`Error deleting old file: ${err.message}`);
                            return;
                        }
                        cleanedCount++;
                        logger.info(`Deleted old file: ${file}`);
                    });
                }
            });
        });
        
        // 记录清理结果
        setTimeout(() => {
            logger.info(`File cleanup completed: ${cleanedCount} files deleted`);
        }, 1000);
    });
}

// 在服务器启动时设置定时清理任务
if (require.main === module) {
    createServer().then(app => {
        const PORT = process.env.PORT || 5000;
        const HOST = process.env.HOST || '0.0.0.0';
        
        app.listen(PORT, HOST, () => {
            logger.info(`Server is running on ${HOST}:${PORT}`);
            
            // 每天执行一次清理
            const cleanupDays = parseInt(process.env.FILE_CLEANUP_DAYS) || 0;
            if (cleanupDays > 0) {
                logger.info(`File cleanup enabled: files older than ${cleanupDays} days will be deleted daily`);
                setInterval(cleanupOldFiles, 24 * 60 * 60 * 1000);
                // 启动时也执行一次清理
                cleanupOldFiles();
            } else {
                logger.info('File cleanup disabled (FILE_CLEANUP_DAYS=0)');
            }
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