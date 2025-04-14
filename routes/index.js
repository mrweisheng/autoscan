const express = require('express');
const router = express.Router();

const loginRoutes = require('./loginRoutes');
const accountRoutes = require('./accountRoutes');
const fileRoutes = require('./fileRoutes');
const shopRoutes = require('./shopRoutes');
const emailRoutes = require('./emailRoutes');

// 将路由模块组装到主路由中
router.use('/', loginRoutes);
router.use('/', accountRoutes);
router.use('/', fileRoutes);
router.use('/', shopRoutes);
router.use('/', emailRoutes);

// 首页路由
router.get('/', (req, res) => {
    res.json({
        status: 'success',
        message: 'Auto Login Service API'
    });
});

// 测试路由
router.get('/test/cache-status', (req, res) => {
    res.json({
        status: 'success',
        message: 'Server is running',
        timestamp: new Date()
    });
});

module.exports = router; 