const express = require('express');
const router = express.Router();
const { loginController } = require('../controllers');

// 手机端推送登录需求
router.get('/mobile/push-need-login', loginController.mobilePushNeedLogin);

// PC端获取需要登录的账号信息
router.get('/pc/get_need_login', loginController.pcGetNeedLogin);

// PC端推送扫码需求
router.get('/pc/push_need_scan', loginController.pcPushNeedScan);

// 手机端获取需要扫码的记录
router.get('/mobile/get-need-scan', loginController.mobileGetNeedScan);

module.exports = router; 