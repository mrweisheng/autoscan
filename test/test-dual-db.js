/**
 * 测试双数据库配置
 * 用于测试 /accounts/random-banned 和 /accounts/mark-handled API
 */
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

// 测试配置
const config = {
    baseURL: process.env.API_BASE_URL || 'http://localhost:5000',
    timeout: 5000,
    maxRetries: 3
};

// 创建axios实例
const api = axios.create({
    baseURL: config.baseURL,
    timeout: config.timeout
});

// 测试获取被封禁账号API
async function testGetRandomBannedAccount() {
    try {
        console.log('\n===== 测试 获取被封禁账号 =====');
        const response = await api.get('/accounts/random-banned');
        
        console.log('状态:', response.status);
        console.log('响应:', JSON.stringify(response.data, null, 2));
        
        return response.data?.data;
    } catch (error) {
        console.error('错误:', error.response?.data || error.message);
        return null;
    }
}

// 测试标记账号为已处理
async function testMarkAccountAsHandled(phoneNumber) {
    if (!phoneNumber) {
        console.log('没有获取到账号，跳过测试标记已处理');
        return;
    }
    
    try {
        console.log('\n===== 测试 标记账号为已处理 =====');
        console.log('要标记的手机号:', phoneNumber);
        
        const response = await api.get(`/accounts/mark-handled?phoneNumber=${phoneNumber}`);
        
        console.log('状态:', response.status);
        console.log('响应:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('错误:', error.response?.data || error.message);
    }
}

// 执行测试
async function runTests() {
    console.log('开始测试双数据库配置...');
    console.log(`API基础URL: ${config.baseURL}`);
    console.log(`当前数据源配置: ${process.env.ACCOUNTS_API_SOURCE || 'main'}`);
    
    // 测试获取被封禁账号
    const account = await testGetRandomBannedAccount();
    
    // 测试标记已处理
    if (account && account.phoneNumber) {
        await testMarkAccountAsHandled(account.phoneNumber);
    }
    
    console.log('\n测试完成');
}

// 运行测试
runTests().catch(console.error); 