const express = require('express');
const router = express.Router();
const { shopController } = require('../controllers');
const { upload } = require('../config');

// 导入店铺数据 - 使用文件上传
router.post('/import/shop-data', upload.single('file'), shopController.importShopData);

// 随机获取商品
router.get('/products/random', shopController.getRandomProduct);

module.exports = router; 