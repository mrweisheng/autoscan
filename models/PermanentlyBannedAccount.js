const mongoose = require('mongoose');
const { DB_CONFIG } = require('../config/database');

// 定义PermanentlyBannedAccount Schema
const permanentlyBannedAccountSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true },
    source: { type: String, required: true }, // 数据来源: 'main', 'shu', 'both' (根据配置)
    reportedAt: { type: Date, default: Date.now },
    status: { type: String, default: 'pending' }, // pending, confirmed, invalid
    remarks: { type: String }, // 备注信息
}, { 
    timestamps: true,
    versionKey: false
});

// 创建模型 - 始终使用主数据库
const PermanentlyBannedAccount = mongoose.model('PermanentlyBannedAccount', permanentlyBannedAccountSchema, 'permanently_banned_accounts');

module.exports = PermanentlyBannedAccount; 