const { logger } = require('../config');
const path = require('path');
const fs = require('fs');

/**
 * 计算指数退避延迟时间
 * @param {Number} attempt 当前尝试次数
 * @param {Number} baseDelay 基础延迟时间（毫秒）
 * @returns {Number} 延迟时间（毫秒）
 */
function calculateBackoffDelay(attempt, baseDelay = 1000) {
    return Math.min(baseDelay * Math.pow(2, attempt), 30000); // 最大延迟30秒
}

/**
 * 带重试机制的操作执行函数
 * @param {Function} operation 要执行的操作
 * @param {Number} maxRetries 最大重试次数
 * @returns {Promise} 操作结果
 */
async function executeWithRetry(operation, maxRetries = 3) {
    let lastError = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            const delay = calculateBackoffDelay(attempt);
            logger.warn(`操作失败，尝试次数: ${attempt + 1}/${maxRetries}, 错误: ${error.message}, 将在 ${delay}ms 后重试`);
            
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    logger.error(`操作最终失败，已重试 ${maxRetries} 次，最后错误: ${lastError.message}`);
    throw lastError;
}

/**
 * 确保目录存在
 * @param {String} dirPath 目录路径
 */
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * 获取规范化的文件路径
 * @param {String} filePath 文件路径
 * @param {String} baseDir 基础目录
 * @returns {String} 规范化后的路径
 */
function getNormalizedPath(filePath, baseDir) {
    const normalizedPath = path.normalize(filePath).replace(/^(\.\.\/|\.\.\\)/g, '');
    return path.join(baseDir, normalizedPath);
}

/**
 * 获取公网URL前缀
 * @param {Object} req Express请求对象
 * @returns {String} URL前缀
 */
function getBaseUrl(req) {
    return process.env.PUBLIC_URL || `http://${req.headers.host}`;
}

/**
 * 生成请求ID
 * @returns {String} 唯一请求ID
 */
function generateRequestId() {
    return Math.random().toString(36).substring(2, 10);
}

module.exports = {
    executeWithRetry,
    ensureDirectoryExists,
    getNormalizedPath,
    getBaseUrl,
    generateRequestId
}; 