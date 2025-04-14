const express = require('express');
const router = express.Router();
const { fileController } = require('../controllers');
const { upload, uploadImage } = require('../config');

// 文件上传
router.post('/upload', upload.single('file'), fileController.uploadFile);

// 图片上传
router.post('/upload/image', uploadImage.single('file'), fileController.uploadImage);

// 文件下载
router.get('/download/:filename', fileController.downloadFile);

// 获取文件列表
router.get('/files', fileController.getFilesByType);

module.exports = router; 