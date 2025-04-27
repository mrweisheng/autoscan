const express = require('express');
const conversationController = require('../controllers/ConversationController');
const router = express.Router();

// 检查视频通话状态
router.get('/video-call-status', conversationController.checkVideoCallStatus);

// 完成视频通话处理
router.get('/video-call-complete', conversationController.completeVideoCall);

module.exports = router; 