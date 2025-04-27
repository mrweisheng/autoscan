const express = require('express');
const router = express.Router();

// 导入各模块路由
const loginRoutes = require('./loginRoutes');
const accountRoutes = require('./accountRoutes');
const fileRoutes = require('./fileRoutes');
const shopRoutes = require('./shopRoutes');
const emailRoutes = require('./emailRoutes');
const conversationRoutes = require('./conversationRoutes');

// 应用各模块路由
router.use('/', loginRoutes);
router.use('/accounts', accountRoutes);
router.use('/', fileRoutes);
router.use('/', shopRoutes);
router.use('/', emailRoutes);
router.use('/conversations', conversationRoutes);

// 首页路由
router.get('/', (req, res) => {
    res.json({
        status: 'success',
        message: 'Auto Login Service API',
        version: '1.0'
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