const mongoose = require('mongoose');

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

const Account = mongoose.model('Account', accountSchema, 'accounts');

module.exports = Account; 