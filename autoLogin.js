require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const winston = require('winston');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const imageSize = require('image-size');

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
    status: { type: String, default: 'active' },  // 修改为 status 字段
    isHandle: { type: Boolean, default: false },  // 改回布尔类型
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

// 文件过滤器配置
const fileFilter = (req, file, cb) => {
    const allowedExtensions = ['.txt', '.vcf', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Only .txt, .vcf and .xlsx files are allowed'), false);
    }
};

// 图片文件过滤器
const imageFileFilter = (req, file, cb) => {
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Only .jpg, .jpeg, .png, .gif and .webp files are allowed'), false);
    }
};

// 图片存储配置
const imageStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads', 'images');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `${timestamp}${ext}`);
    }
});

// 修改 multer 配置
const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 20 * 1024 * 1024 // 限制文件大小为 20MB
    }
});

// 图片上传配置
const uploadImage = multer({
    storage: imageStorage,
    fileFilter: imageFileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 限制图片大小为 10MB
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
        if (AutoLoginService.instance) {
            logger.info("返回已存在的 AutoLoginService 实例");
            return AutoLoginService.instance;
        }
        
        logger.info("创建新的 AutoLoginService 实例");
        this.db = new DatabaseConnection();
        // 添加缓存相关属性
        this.bannedAccountsCache = [];  // 缓存的被封禁账号列表
        this.cacheIndex = 0;           // 当前的指针位置
        this.cacheTimestamp = 0;       // 缓存创建时间
        this.cacheMaxAge = 1000 * 60 * 60; // 缓存有效期：1小时
        this.cacheExhausted = false;   // 标记缓存是否已耗尽
        this.processingRequest = false; // 请求处理锁，防止并发访问导致的问题
        
        AutoLoginService.instance = this;
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

            // 验证上传目录是否存在
            const uploadDir = path.join(__dirname, 'uploads');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            // 验证文件大小
            if (req.file.size > 20 * 1024 * 1024) { // 20MB
                fs.unlinkSync(req.file.path); // 删除超大文件
                return res.status(400).json({
                    status: "error",
                    message: "File size exceeds limit (20MB)"
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

    async uploadImage(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    status: "error",
                    message: "No image uploaded or image type not allowed"
                });
            }

            // 构建图片的公网访问URL
            const baseUrl = process.env.PUBLIC_URL || `http://${req.headers.host}`;
            const imageUrl = `${baseUrl}/uploads/images/${req.file.filename}`;
            const downloadUrl = `${baseUrl}/download/${req.file.filename}`;

            // 获取图片尺寸信息
            const dimensions = imageSize(req.file.path);

            logger.info(`Image uploaded successfully: ${req.file.filename}`);
            return res.json({
                status: "success",
                data: {
                    filename: req.file.filename,
                    originalname: req.file.originalname,
                    size: req.file.size,
                    width: dimensions.width,
                    height: dimensions.height,
                    type: req.file.mimetype,
                    url: imageUrl,
                    downloadUrl: downloadUrl
                },
                message: "Image uploaded successfully"
            });

        } catch (error) {
            logger.error(`Error in uploadImage: ${error.message}`);
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
            
            // 验证文件名是否包含非法字符
            if (/[\\/:*?"<>|]/.test(filename)) {
                logger.warn(`Invalid filename detected: ${filename}`);
                return res.status(400).json({
                    status: "error",
                    message: "Invalid filename"
                });
            }

            // 尝试解码 URL 编码的文件名
            try {
                filename = decodeURIComponent(filename);
            } catch (e) {
                logger.warn(`Failed to decode filename: ${filename}, ${e.message}`);
                return res.status(400).json({
                    status: "error",
                    message: "Invalid filename encoding"
                });
            }
            
            logger.info(`Download request for file: ${filename}`);
            
            // 构建文件路径，并确保路径不会超出uploads目录
            const normalizedPath = path.normalize(filename).replace(/^(\.\.\/|\.\.\\)/g, '');
            const filePath = path.join(__dirname, 'uploads', normalizedPath);
            
            // 验证文件路径是否在允许的目录内
            const uploadsDir = path.join(__dirname, 'uploads');
            if (!filePath.startsWith(uploadsDir)) {
                logger.warn(`Attempted path traversal: ${filePath}`);
                return res.status(403).json({
                    status: "error",
                    message: "Access denied"
                });
            }
            
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

    async getRandomBannedAccount(req, res) {
        // 生成请求ID和时间戳，用于日志和调试
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
                        'proxy.host': 1,
                        'proxy.port': 1,
                        'proxy.username': 1,
                        'proxy.password': 1
                    }
                ).sort({ _id: 1 }).exec();  // 按_id排序
                
                this.cacheIndex = 0;
                this.cacheTimestamp = now;
                this.cacheExhausted = false;
                
                logger.info(`[${requestId}] 缓存加载了 ${this.bannedAccountsCache.length} 个被封禁账号`);
            } else {
                logger.info(`[${requestId}] 使用现有缓存, 当前索引: ${this.cacheIndex}/${this.bannedAccountsCache.length}, 缓存状态: ${this.cacheExhausted ? '已耗尽' : '可用'}`);
            }

            // 如果缓存中没有数据
            if (this.bannedAccountsCache.length === 0) {
                logger.info(`[${requestId}] 没有找到可用的被封禁账号`);
                this.processingRequest = false; // 释放锁
                return res.status(404).json({
                    status: "success",
                    data: null,
                    message: "没有找到可用的被封禁账号"
                });
            }

            // 如果缓存已用完
            if (this.cacheExhausted) {
                // 计算缓存过期还需要的时间（分钟）
                const remainingMinutes = Math.ceil((this.cacheTimestamp + this.cacheMaxAge - now) / (1000 * 60));
                logger.info(`[${requestId}] 缓存已耗尽，还需等待 ${remainingMinutes} 分钟后刷新`);
                this.processingRequest = false; // 释放锁
                return res.status(404).json({
                    status: "success",
                    data: null,
                    message: `当前时段的所有账号已被获取完毕，请在 ${remainingMinutes} 分钟后再试`
                });
            }

            // 如果当前指针已到达缓存末尾
            if (this.cacheIndex >= this.bannedAccountsCache.length) {
                this.cacheExhausted = true;
                // 计算缓存过期还需要的时间（分钟）
                const remainingMinutes = Math.ceil((this.cacheTimestamp + this.cacheMaxAge - now) / (1000 * 60));
                logger.info(`[${requestId}] 缓存索引到达末尾，设置为已耗尽，还需等待 ${remainingMinutes} 分钟后刷新`);
                this.processingRequest = false; // 释放锁
                return res.status(404).json({
                    status: "success",
                    data: null,
                    message: `当前时段的所有账号已被获取完毕，请在 ${remainingMinutes} 分钟后再试`
                });
            }

            // 获取当前指针位置的账号
            const result = this.bannedAccountsCache[this.cacheIndex];
            const currentIndex = this.cacheIndex;
            
            // 更新指针位置，不循环
            this.cacheIndex++;
            
            logger.info(`[${requestId}] 成功获取被封禁账号: ${result.phoneNumber}，缓存位置: ${currentIndex}/${this.bannedAccountsCache.length - 1}，更新索引至: ${this.cacheIndex}`);
            this.processingRequest = false; // 释放锁
            return res.json({
                status: "success",
                data: result
            });

        } catch (error) {
            logger.error(`[${requestId}] 获取被封禁账号失败: ${error.message}`);
            this.processingRequest = false; // 确保错误情况下也释放锁
            return res.status(500).json({
                status: "error",
                message: "服务器内部错误"
            });
        }
    }

    async getAccountsByStatus(req, res) {
        try {
            const { status } = req.query;

            // 验证status参数
            if (!status || !['banned', 'online', 'offline', 'logout'].includes(status)) {
                return res.status(400).json({
                    status: "error",
                    message: "Invalid status parameter. Must be one of: banned, online, offline, logout"
                });
            }

            // 查询数据库
            const accounts = await Account.find(
                { status },
                { 
                    _id: 0,
                    name: 1,
                    phoneNumber: 1
                }
            ).sort({ phoneNumber: 1 }).exec();

            logger.info(`Found ${accounts.length} accounts with status: ${status}`);
            return res.json({
                status: "success",
                data: accounts,
                totalCount: accounts.length
            });

        } catch (error) {
            logger.error(`Error in getAccountsByStatus: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "Internal server error"
            });
        }
    }

    async markAccountAsHandled(req, res) {
    }

    async uploadImage(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    status: "error",
                    message: "No image uploaded or image type not allowed"
                });
            }

            // 获取图片尺寸信息
            const dimensions = imageSize(req.file.path);
            
            // 构建URL
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const fileUrl = `${baseUrl}/uploads/images/${req.file.filename}`;
            const downloadUrl = `${baseUrl}/download/${req.file.filename}`;

            return res.json({
                status: "success",
                data: {
                    filename: req.file.filename,
                    originalname: req.file.originalname,
                    size: req.file.size,
                    width: dimensions.width,
                    height: dimensions.height,
                    type: req.file.mimetype,
                    url: fileUrl,
                    downloadUrl: downloadUrl
                },
                message: "Image uploaded successfully"
            });

        } catch (error) {
            logger.error(`Error in uploadImage: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "Internal server error"
            });
        }
    }

    async importShopData(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    status: "error",
                    message: "No file uploaded"
                });
            }

            const filePath = path.join(__dirname, 'uploads', req.file.originalname);
            
            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                return res.status(400).json({
                    status: "error",
                    message: "Uploaded file not found"
                });
            }

            // 解析Excel文件
            const workbook = XLSX.readFile(filePath);
            
            // 处理店铺资料sheet
            const shopSheetName = workbook.SheetNames.find(name => name.includes('店铺资料'));
            if (!shopSheetName) {
                return res.status(400).json({
                    status: "error",
                    message: "Excel文件中缺少店铺资料sheet"
                });
            }
            
            const shopWorksheet = workbook.Sheets[shopSheetName];
            const shops = XLSX.utils.sheet_to_json(shopWorksheet).map(row => ({
                shopType: row['店铺类型'] || '',
                shopAddress: row['店铺地址'] || '',
                shopDescription: row['店铺简介'] || '',
                shopLink: row['店铺链接'] || ''
            }));

            // 处理商品sheet
            const productSheetName = workbook.SheetNames.find(name => name.includes('商品'));
            if (!productSheetName) {
                return res.status(400).json({
                    status: "error",
                    message: "Excel文件中缺少商品sheet"
                });
            }
            
            const productWorksheet = workbook.Sheets[productSheetName];
            // 处理商品数据并提取图片
            const products = [];
            const rows = XLSX.utils.sheet_to_json(productWorksheet);
            
            for (const row of rows) {
                let imageUrl = '';
                
                // 处理图片字段
                // 跳过URL格式的图片，只处理内嵌图片

                products.push({
                    shopType: row['店铺类型'] || '',
                    productName: row['商品名称'] || '',
                    originalPrice: row['商品价格'] || 0,
                    discountPrice: row['优惠价格'] || 0,
                    imageUrl: imageUrl,
                    productDescription: row['商品简介'] || ''
                });
            }

            // 验证数据
            if (shops.length === 0 || products.length === 0) {
                return res.status(400).json({
                    status: "error",
                    message: "Excel文件中没有有效数据"
                });
            }

            // 创建图片目录
            const imagesDir = path.join(__dirname, 'uploads', 'images');
            if (!fs.existsSync(imagesDir)) {
                fs.mkdirSync(imagesDir, { recursive: true });
            }

            // 提取图片并转为base64
            const rawData = XLSX.utils.sheet_to_json(productWorksheet, { raw: true });
            for (let i = 0; i < rawData.length; i++) {
                const row = rawData[i];
                if (row['商品图片'] && workbook.Sheets[productSheetName]['!images']) {
                    const images = workbook.Sheets[productSheetName]['!images'];
                    const image = images.find(img => 
                        img.ref.includes(`商品图片`) && 
                        img.ref.includes(`R${i+2}`)
                    );
                    
                    if (image) {
                        const base64Data = image.data.toString('base64');
                        const mimeType = image.type || 'image/jpeg';
                        products[i].imageUrl = `data:${mimeType};base64,${base64Data}`;
                    }
                }
            }

            // 批量插入数据 - 先插入店铺，再插入商品
            await Shop.insertMany(shops);
            await ShopProduct.insertMany(products);

            logger.info(`成功导入 ${shops.length} 家店铺和 ${products.length} 件商品`);
            return res.json({
                status: "success",
                data: {
                    shopCount: shops.length,
                    productCount: products.length
                },
                message: "店铺和商品数据导入成功"
            });

        } catch (error) {
            logger.error(`导入店铺数据失败: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "服务器内部错误"
            });
        }
        try {
            const { phoneNumber } = req.query;

            if (!phoneNumber) {
                return res.status(400).json({
                    status: "error",
                    message: "缺少必填参数: phoneNumber"
                });
            }

            const result = await Account.findOneAndUpdate(
                { 
                    phoneNumber
                },
                { 
                    $set: { isHandle: true } 
                },
                { new: true, projection: { _id: 0, phoneNumber: 1, isHandle: 1 } }
            );

            if (!result) {
                return res.status(404).json({
                    status: "success",
                    data: null,
                    message: "未找到该账号"
                });
            }

            logger.info(`成功标记账号处理状态: ${phoneNumber}, isHandle=true`);
            return res.json({
                status: "success",
                data: {
                    phoneNumber: result.phoneNumber,
                    isHandle: result.isHandle
                },
                message: "账号标记为已处理"
            });

        } catch (error) {
            logger.error(`标记账号处理状态失败: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "服务器内部错误"
            });
        }
    }
}

// 添加ShopProduct模型定义
// 店铺模型
const shopSchema = new mongoose.Schema({
    shopType: { type: String, required: true, index: true },
    shopAddress: { type: String, required: true },
    shopDescription: { type: String },
    shopLink: { type: String, required: true }
}, { 
    timestamps: true,
    versionKey: false
});

const Shop = mongoose.model('Shop', shopSchema, 'shops');

// 商品模型
const shopProductSchema = new mongoose.Schema({
    shopType: { type: String, required: true, index: true },
    productName: { type: String, required: true },
    originalPrice: { type: Number, required: true },
    discountPrice: { type: Number, required: true },
    imageUrl: { 
        type: String, 
        required: true,
        validate: {
            validator: function(v) {
                return v.startsWith('data:image/') && v.includes(';base64,');
            },
            message: props => `${props.value} 不是有效的base64图片数据`
        }
    },
    productDescription: { type: String }
}, { 
    timestamps: true,
    versionKey: false
});

const ShopProduct = mongoose.model('ShopProduct', shopProductSchema, 'shop_products');

// 在类外部添加静态实例属性
AutoLoginService.instance = null;

// Express应用实例
const app = express();

// 创建服务器但不立即启动
const createServer = async () => {
    // 确保数据库连接已建立
    await DatabaseConnection.getInstance();
    
    // 使用单例模式创建服务实例
    const autoLoginService = new AutoLoginService();
    logger.info("服务器启动时创建的 AutoLoginService 实例");

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

    // 添加获取随机被封禁账号的路由
    app.get('/accounts/random-banned', (req, res) => autoLoginService.getRandomBannedAccount(req, res));

    // 添加根据状态查询账号的路由
    app.get('/accounts/by-status', (req, res) => autoLoginService.getAccountsByStatus(req, res));

    // 添加标记账号处理成功的路由
    app.get('/accounts/mark-handled', (req, res) => autoLoginService.markAccountAsHandled(req, res));

    // 添加导入店铺数据路由
    app.post('/import/shop-data', upload.single('file'), (req, res) => autoLoginService.importShopData(req, res));

    // 添加图片上传路由
    app.post('/upload/image', uploadImage.single('file'), (req, res) => autoLoginService.uploadImage(req, res));

    // 在路由定义部分添加一个测试路由
    app.get('/test/cache-status', (req, res) => {
        const now = Date.now();
        const status = {
            cacheLength: autoLoginService.bannedAccountsCache.length,
            currentIndex: autoLoginService.cacheIndex,
            cacheTimestamp: autoLoginService.cacheTimestamp,
            cacheExhausted: autoLoginService.cacheExhausted,
            processingRequest: autoLoginService.processingRequest,
            timeRemaining: Math.max(0, autoLoginService.cacheTimestamp + autoLoginService.cacheMaxAge - now),
            remainingMinutes: Math.ceil(Math.max(0, autoLoginService.cacheTimestamp + autoLoginService.cacheMaxAge - now) / (1000 * 60)),
            instanceInfo: autoLoginService.constructor.name + '-' + Date.now().toString().slice(-4)
        };
        
        logger.info(`缓存状态请求: ${JSON.stringify(status)}`);
        
        return res.json({
            status: "success",
            data: status
        });
    });

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
    // 定义存储服务器实例的变量
    let serverInstance = null;
    
    createServer().then(app => {
        const PORT = process.env.PORT || 5000;
        const HOST = process.env.HOST || '0.0.0.0';
        
        // 确保只有一个服务器实例在运行
        if (!serverInstance) {
            serverInstance = app.listen(PORT, HOST, () => {
                logger.info(`服务器实例已启动并监听 ${HOST}:${PORT}`);
                
                // 每天执行一次清理
                const cleanupDays = parseInt(process.env.FILE_CLEANUP_DAYS) || 0;
                if (cleanupDays > 0) {
                    logger.info(`文件清理已启用: ${cleanupDays} 天前的文件将被每日删除`);
                    setInterval(cleanupOldFiles, 24 * 60 * 60 * 1000);
                    // 启动时也执行一次清理
                    cleanupOldFiles();
                } else {
                    logger.info('文件清理已禁用 (FILE_CLEANUP_DAYS=0)');
                }
            });
        } else {
            logger.info(`服务器实例已存在，跳过重复启动`);
        }
    }).catch(error => {
        logger.error('启动服务器失败:', error);
        process.exit(1);
    });
}

module.exports = {
    createServer,
    logger
};
