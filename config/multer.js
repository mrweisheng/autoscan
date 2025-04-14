const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 文件存储配置
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads');
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
        const uploadDir = path.join(__dirname, '../uploads/images');
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

// 通用文件上传配置
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

module.exports = {
    upload,
    uploadImage
}; 