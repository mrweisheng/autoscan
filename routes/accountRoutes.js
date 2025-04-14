const express = require('express');
const router = express.Router();
const { accountController } = require('../controllers');

// 获取不活跃账号
router.get('/accounts/inactive', accountController.getInactiveAccounts);

// 更新账号最后登录时间
router.get('/accounts/update-login', accountController.updateLastLogin);

// 获取被封禁账号
router.get('/accounts/random-banned', accountController.getRandomBannedAccount);

// 标记账号处理成功
router.get('/accounts/mark-handled', accountController.markAccountAsHandled);

module.exports = router; 