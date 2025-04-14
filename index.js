require('dotenv').config();
const express = require('express');
const path = require('path');
const { DatabaseConnection, logger } = require('./config');
const routes = require('./routes');

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 9000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 应用路由
app.use('/', routes);

// 错误处理中间件
app.use((err, req, res, next) => {
    logger.error(`未捕获的错误: ${err.message}`);
    res.status(500).json({
        status: 'error',
        message: 'Internal server error'
    });
});

// 启动服务器的函数
const startServer = async () => {
    try {
        // 初始化数据库连接
        await DatabaseConnection.getInstance();

        // 启动HTTP服务器
        app.listen(PORT, () => {
            logger.info(`服务器已启动，监听端口: ${PORT}`);
            logger.info(`服务器时间: ${new Date().toISOString()}`);
        });
    } catch (error) {
        logger.error(`服务器启动失败: ${error.message}`);
        process.exit(1);
    }
};

// 启动服务器
startServer(); 