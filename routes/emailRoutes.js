const express = require('express');
const router = express.Router();
const { emailController } = require('../controllers');

/**
 * @api {post} /send-email 发送邮件
 * @apiName SendEmail
 * @apiGroup Email
 * 
 * @apiParam {String} to 收件人邮箱地址
 * @apiParam {String} subject 邮件主题
 * @apiParam {String} [text] 纯文本内容
 * @apiParam {String} [html] HTML格式内容
 * 
 * @apiSuccess {String} status 状态
 * @apiSuccess {String} message 成功消息
 * 
 * @apiError {String} status 错误状态
 * @apiError {String} message 错误消息
 */
router.post('/send-email', emailController.sendEmail);

module.exports = router; 