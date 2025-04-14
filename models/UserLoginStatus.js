const mongoose = require('mongoose');

// 定义MongoDB Schema
const userLoginStatusSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone_device: { type: String, required: true, unique: true },
    login_status: { type: String, default: null }
}, { 
    timestamps: true,
    versionKey: false  // 禁用 __v 字段
});

const UserLoginStatus = mongoose.model('UserLoginStatus', userLoginStatusSchema);

module.exports = UserLoginStatus; 