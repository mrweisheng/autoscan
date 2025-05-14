const express = require('express');
const conversationController = require('../controllers/ConversationController');
const GroupController = require('../controllers/GroupController');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const router = express.Router();

// 检查视频通话状态
router.get('/video-call-status', conversationController.checkVideoCallStatus);

// 完成视频通话处理
router.get('/video-call-complete', conversationController.completeVideoCall);

// 获取所有已完成视频通话的会话
router.get('/video-calls', conversationController.getVideoCallConversations);

// 重置指定的视频通话记录
router.get('/reset-video-call', conversationController.resetVideoCall);

// 获取group表随机一条数据
router.get('/group/random', GroupController.getRandomGroup);

// 导入group表数据（全量覆盖）
router.post('/group/import', upload.single('file'), GroupController.importGroups);

module.exports = router; 