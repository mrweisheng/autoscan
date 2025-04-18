const mongoose = require('mongoose');
const { DatabaseConnection } = require('../config/database');

// 定义Account Schema
const accountSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true },
    name: { type: String },
    lastLogin: { type: Date, required: true },
    status: { type: String, default: 'active' },  // 状态字段
    isHandle: { type: Boolean, default: false },  // 是否已处理
    proxy: {
        host: { type: String },
        port: { type: String },
        username: { type: String },
        password: { type: String }
    }
}, { 
    timestamps: true,
    versionKey: false
});

// 创建模型
const Account = mongoose.model('Account', accountSchema, 'accounts');

// 获取Shu数据库的Account模型（如果连接存在）
async function getShuAccount() {
    try {
        const dbInstance = await DatabaseConnection.getInstance();
        const shuConnection = dbInstance.getShuConnection();
        
        if (!shuConnection) {
            return null;
        }
        
        // 使用相同的Schema创建Shu数据库的模型
        return shuConnection.model('Account', accountSchema, 'accounts');
    } catch (error) {
        console.error('获取Shu数据库Account模型失败:', error);
        return null;
    }
}

module.exports = Account;
module.exports.getShuAccount = getShuAccount; 