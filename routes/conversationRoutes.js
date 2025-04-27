const express = require('express');
const conversationController = require('../controllers/ConversationController');
const router = express.Router();

// 检查视频通话状态
router.get('/video-call-status', conversationController.checkVideoCallStatus);

// 完成视频通话处理
router.get('/video-call-complete', conversationController.completeVideoCall);

// 获取所有已完成视频通话的会话
router.get('/video-calls', conversationController.getVideoCallConversations);

// 重置指定的视频通话记录
router.get('/reset-video-call', conversationController.resetVideoCall);

module.exports = router; 