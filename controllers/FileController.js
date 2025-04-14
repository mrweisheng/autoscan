const path = require('path');
const fs = require('fs');
const { fileService } = require('../services');
const { logger } = require('../config');

class FileController {
    async uploadFile(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    status: "error",
                    message: "No file uploaded or file type not allowed"
                });
            }

            // 验证上传目录是否存在
            const uploadDir = path.join(__dirname, '../uploads');
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

            const fileData = fileService.processUploadedFile(req, req.file);

            logger.info(`File uploaded successfully: ${req.file.originalname}`);
            return res.json({
                status: "success",
                data: fileData,
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

            const imageData = fileService.processUploadedImage(req, req.file);

            logger.info(`Image uploaded successfully: ${req.file.filename}`);
            return res.json({
                status: "success",
                data: imageData,
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
            
            // 获取文件路径
            const { filePath, fileExists } = fileService.getDownloadFilePath(filename);
            
            // 验证文件路径是否在允许的目录内
            const uploadsDir = path.join(__dirname, '../uploads');
            if (!filePath.startsWith(uploadsDir)) {
                logger.warn(`Attempted path traversal: ${filePath}`);
                return res.status(403).json({
                    status: "error",
                    message: "Access denied"
                });
            }
            
            // 检查文件是否存在
            if (!fileExists) {
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
            const ext = path.extname(filename);
            res.setHeader('Content-Type', fileService.getContentType(ext));
            
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
            
            const fileUrls = await fileService.getFilesByType(type, req);
            
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

module.exports = new FileController(); 