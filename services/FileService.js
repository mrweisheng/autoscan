const path = require('path');
const fs = require('fs');
const { logger } = require('../config');
const { getBaseUrl, getNormalizedPath } = require('../utils/helper');

class FileService {
    /**
     * 处理文件上传
     * @param {Object} req 请求对象
     * @param {Object} file 上传的文件
     * @returns {Object} 文件信息
     */
    processUploadedFile(req, file) {
        // 构建文件的公网访问URL，使用原始文件名
        const baseUrl = getBaseUrl(req);
        const fileUrl = `${baseUrl}/uploads/${file.originalname}`;
        const downloadUrl = `${baseUrl}/download/${file.originalname}`;

        return {
            filename: file.originalname,
            originalname: file.originalname,
            size: file.size,
            url: fileUrl,
            downloadUrl: downloadUrl
        };
    }

    /**
     * 处理图片上传
     * @param {Object} req 请求对象
     * @param {Object} file 上传的文件
     * @returns {Object} 图片信息
     */
    processUploadedImage(req, file) {
        // 构建图片的公网访问URL
        const baseUrl = getBaseUrl(req);
        const imageUrl = `${baseUrl}/uploads/images/${file.filename}`;
        const downloadUrl = `${baseUrl}/download/${file.filename}`;

        return {
            filename: file.filename,
            originalname: file.originalname,
            size: file.size,
            type: file.mimetype,
            url: imageUrl,
            downloadUrl: downloadUrl
        };
    }

    /**
     * 获取文件下载路径
     * @param {String} filename 文件名
     * @returns {Object} 文件路径和是否存在
     */
    getDownloadFilePath(filename) {
        // 构建文件路径，并确保路径不会超出uploads目录
        const normalizedPath = path.normalize(filename).replace(/^(\.\.\/|\.\.\\)/g, '');
        
        // 尝试多个可能的路径：直接在uploads目录或在uploads/images子目录
        let filePath = path.join(__dirname, '../uploads', normalizedPath);
        let fileExists = fs.existsSync(filePath);
        
        // 如果在uploads目录下没找到，尝试在uploads/images目录查找
        if (!fileExists) {
            const imageFilePath = path.join(__dirname, '../uploads/images', normalizedPath);
            if (fs.existsSync(imageFilePath)) {
                filePath = imageFilePath;
                fileExists = true;
            }
        }

        return { filePath, fileExists };
    }

    /**
     * 获取文件MIME类型
     * @param {String} ext 文件扩展名
     * @returns {String} MIME类型
     */
    getContentType(ext) {
        const extension = ext.toLowerCase();
        
        if (extension === '.txt') {
            return 'text/plain; charset=utf-8';
        } else if (extension === '.vcf') {
            return 'text/vcard';
        } else if (extension === '.png') {
            return 'image/png';
        } else if (extension === '.jpg' || extension === '.jpeg') {
            return 'image/jpeg';
        } else if (extension === '.gif') {
            return 'image/gif';
        } else if (extension === '.webp') {
            return 'image/webp';
        } else {
            return 'application/octet-stream';
        }
    }

    /**
     * 根据文件类型获取文件列表
     * @param {String} type 文件类型
     * @param {Object} req 请求对象
     * @returns {Array} 文件列表
     */
    async getFilesByType(type, req) {
        const uploadDir = path.join(__dirname, '../uploads');
        
        // 确保目录存在
        if (!fs.existsSync(uploadDir)) {
            return [];
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
            return [];
        }
        
        // 构建文件URL列表
        const baseUrl = getBaseUrl(req);
        const fileUrls = typeFiles.map(file => {
            return {
                filename: file,
                url: `${baseUrl}/uploads/${file}`,
                downloadUrl: `${baseUrl}/download/${file}`,
                size: fs.statSync(path.join(uploadDir, file)).size
            };
        });
        
        return fileUrls;
    }
}

module.exports = new FileService(); 