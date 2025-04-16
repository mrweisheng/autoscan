const axios = require('axios');

// 测试配置
const config = {
    baseURL: 'http://localhost:9000',
    testCount: 100,        // 测试次数
    concurrentUsers: 20,   // 并发用户数
    testPrefix: 'perf_test_', // 测试数据前缀
    requestInterval: 100   // 请求间隔(ms)
};

// 生成随机设备ID和用户名
function generateTestData() {
    return {
        deviceId: `${config.testPrefix}device_${Math.random().toString(36).substr(2, 9)}`,
        userName: `${config.testPrefix}user_${Math.random().toString(36).substr(2, 6)}`
    };
}

// 打印请求信息
function logRequest(step, deviceId, params) {
    console.log(`[${deviceId}] ${step}`);
    console.log(`  参数:`, params);
}

// 打印响应信息
function logResponse(step, deviceId, response) {
    console.log(`[${deviceId}] ${step} 响应:`, response.data);
}

// 模拟完整的登录流程
async function testLoginFlow(deviceId, userName) {
    try {
        // 1. 手机端推送登录需求
        const pushParams = { name: userName, phone_device: deviceId };
        logRequest('1. 手机端推送登录需求', deviceId, pushParams);
        const pushResult = await axios.get(`${config.baseURL}/mobile/push-need-login`, {
            params: pushParams,
            timeout: 5000  // 添加超时设置
        });
        logResponse('1. 手机端推送登录需求', deviceId, pushResult);

        // 2. PC端获取需要登录的账号信息
        const loginParams = { phone_device: deviceId };
        logRequest('2. PC端获取登录信息', deviceId, loginParams);
        const loginInfo = await axios.get(`${config.baseURL}/pc/get_need_login`, {
            params: loginParams,
            timeout: 5000
        });
        logResponse('2. PC端获取登录信息', deviceId, loginInfo);

        // 3. PC端推送扫码需求
        const scanPushParams = { name: userName, phone_device: deviceId };
        logRequest('3. PC端推送扫码需求', deviceId, scanPushParams);
        const scanPushResult = await axios.get(`${config.baseURL}/pc/push_need_scan`, {
            params: scanPushParams,
            timeout: 5000
        });
        logResponse('3. PC端推送扫码需求', deviceId, scanPushResult);

        // 4. 手机端获取需要扫码的记录
        const scanParams = { phone_device: deviceId };
        logRequest('4. 手机端获取扫码记录', deviceId, scanParams);
        const scanInfo = await axios.get(`${config.baseURL}/mobile/get-need-scan`, {
            params: scanParams,
            timeout: 5000
        });
        logResponse('4. 手机端获取扫码记录', deviceId, scanInfo);

        console.log(`[${deviceId}] 测试完成 - 成功\n`);
        return true;
    } catch (error) {
        console.error(`[${deviceId}] 测试失败:`);
        if (error.code === 'ECONNREFUSED') {
            console.error(`  连接被拒绝 - 请检查服务器是否正在运行，以及端口 ${config.baseURL.split(':')[2]} 是否正确`);
        } else if (error.code === 'ETIMEDOUT') {
            console.error(`  请求超时 - 服务器响应时间过长`);
        } else if (error.response) {
            console.error(`  服务器响应错误:`);
            console.error(`    状态码: ${error.response.status}`);
            console.error(`    错误信息: ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
            console.error(`  请求错误: ${error.message}`);
        } else {
            console.error(`  其他错误: ${error.message}`);
        }
        console.log('\n');
        return false;
    }
}

// 运行并发测试
async function runConcurrentTests() {
    console.log('开始并发API测试...\n');
    console.log(`并发用户数: ${config.concurrentUsers}`);
    console.log(`每个用户测试次数: ${Math.ceil(config.testCount / config.concurrentUsers)}\n`);
    
    let successCount = 0;
    let failCount = 0;
    const startTime = Date.now();

    // 创建并发用户
    const userPromises = Array(config.concurrentUsers).fill().map(async (_, userIndex) => {
        const testsPerUser = Math.ceil(config.testCount / config.concurrentUsers);
        
        for (let i = 0; i < testsPerUser; i++) {
            const { deviceId, userName } = generateTestData();
            console.log(`\n开始新的测试流程 [用户${userIndex + 1}/${config.concurrentUsers}, 测试${i + 1}/${testsPerUser}]`);
            console.log(`设备ID: ${deviceId}`);
            console.log(`用户名: ${userName}\n`);
            
            const success = await testLoginFlow(deviceId, userName);
            
            if (success) {
                successCount++;
            } else {
                failCount++;
            }

            // 请求间隔
            await new Promise(resolve => setTimeout(resolve, config.requestInterval));
        }
    });

    // 等待所有并发测试完成
    await Promise.all(userPromises);
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    // 打印测试报告
    console.log('\n测试总结:');
    console.log(`总测试次数: ${config.testCount}`);
    console.log(`成功次数: ${successCount}`);
    console.log(`失败次数: ${failCount}`);
    console.log(`成功率: ${((successCount / config.testCount) * 100).toFixed(2)}%`);
    console.log(`总耗时: ${duration.toFixed(2)}秒`);
    console.log(`平均每秒请求数: ${(config.testCount / duration).toFixed(2)}`);
}

// 启动测试
runConcurrentTests(); 