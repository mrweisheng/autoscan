require('dotenv').config();
const winston = require('winston');
const path = require('path');

// 配置日志
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} - ${level}: ${message}`;
        })
    ),
    transports: [
        new winston.transports.File({ 
            filename: process.env.LOG_FILE || path.join(__dirname, '../logs/app.log') 
        }),
        new winston.transports.Console()
    ]
});

module.exports = logger; 