const express = require('express');
const router = express.Router();
const { accountController, permanentlyBannedAccountController } = require('../controllers');

// 获取不活跃账号
router.get('/accounts/inactive', accountController.getInactiveAccounts);

// 更新账号最后登录时间
router.get('/accounts/update-login', accountController.updateLastLogin);

// 获取被封禁账号
router.get('/accounts/random-banned', accountController.getRandomBannedAccount);

// 标记账号处理成功
router.get('/accounts/mark-handled', accountController.markAccountAsHandled);

// 获取已处理的被封禁账号
router.get('/accounts/handled-banned', accountController.getHandledBannedAccounts);

// 添加疑似永久封禁账号
router.get('/accounts/report-permanent-ban', permanentlyBannedAccountController.addPermanentlyBannedAccount);

// 获取疑似永久封禁账号列表
router.get('/accounts/permanently-banned', permanentlyBannedAccountController.getPermanentlyBannedAccounts);

// 更新疑似永久封禁账号状态
router.get('/accounts/update-permanent-status', permanentlyBannedAccountController.updatePermanentlyBannedAccountStatus);

module.exports = router; 