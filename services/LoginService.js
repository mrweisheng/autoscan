const { UserLoginStatus } = require('../models');
const { logger } = require('../config');
const { executeWithRetry } = require('../utils/helper');

class LoginService {
    /**
     * 手机端推送登录需求
     * @param {String} name 用户名
     * @param {String} phone_device 设备标识
     * @returns {Promise<Object>} 创建或更新的记录
     */
    async mobilePushNeedLogin(name, phone_device) {
        const result = await executeWithRetry(async () => {
            return await UserLoginStatus.findOneAndUpdate(
                { phone_device },
                { 
                    name, 
                    phone_device,
                    login_status: 'offline'
                },
                { upsert: true, new: true }
            );
        });

        logger.info(`成功记录登录请求，设备: ${phone_device}`);
        return result;
    }

    /**
     * PC端获取需要登录的账号信息
     * @param {String} phone_device 设备标识
     * @returns {Promise<Object>} 账号信息
     */
    async pcGetNeedLogin(phone_device) {
        const result = await executeWithRetry(async () => {
            const record = await UserLoginStatus.findOneAndDelete({ phone_device }).select('-__v');
            return record;
        });

        return result;
    }

    /**
     * PC端推送扫码需求
     * @param {String} name 用户名
     * @param {String} phone_device 设备标识
     * @returns {Promise<Object>} 创建或更新的记录
     */
    async pcPushNeedScan(name, phone_device) {
        const result = await executeWithRetry(async () => {
            return await UserLoginStatus.findOneAndUpdate(
                { phone_device },
                {
                    name,
                    phone_device,
                    login_status: 'scan'
                },
                { upsert: true, new: true }
            );
        });

        logger.info(`成功处理扫码请求: name=${name}, phone_device=${phone_device}`);
        return result;
    }

    /**
     * 手机端获取需要扫码的记录
     * @param {String} phone_device 设备标识
     * @returns {Promise<Object>} 扫码记录
     */
    async mobileGetNeedScan(phone_device) {
        const result = await executeWithRetry(async () => {
            const record = await UserLoginStatus.findOneAndDelete({
                phone_device,
                login_status: 'scan'
            }).select('-__v');
            return record;
        });

        return result;
    }
}

module.exports = new LoginService(); 