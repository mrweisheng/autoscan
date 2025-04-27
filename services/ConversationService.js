const Conversation = require('../models/ConversationSchema');
const { logger } = require('../config');
const fetch = require('node-fetch');

// 从环境变量获取webhook URL
const videoCallWebhookUrl = process.env.VIDEO_CALL_WEBHOOK_URL || 'http://104.37.187.30:5002/webhooks/video-call';

class ConversationService {
    /**
     * 检查两个电话号码之间是否可以进行视频通话
     * @param {string} accountPhone - 账号电话号码
     * @param {string} recipientPhone - 接收者电话号码
     * @returns {Promise<Object>} - 包含通话状态和会话键的对象
     */
    async checkVideoCallStatus(accountPhone, recipientPhone) {
        try {
            const requestId = Date.now().toString();
            logger.info(`[${requestId}] 检查视频通话状态: ${accountPhone} -> ${recipientPhone}`);
            
            // 调试信息
            logger.info(`[${requestId}] 视频通话数据库URI: ${process.env.CONVERSATION_DB_URI || '使用默认连接'}`);
            logger.info(`[${requestId}] 集合名称: ${process.env.CONVERSATION_COLLECTION_NAME || 'conversations'}`);

            // 生成会话键
            const conversationKey = Conversation.generateConversationKey(accountPhone, recipientPhone);
            logger.info(`[${requestId}] 生成的会话键: ${conversationKey}`);
            
            // 查找会话
            logger.info(`[${requestId}] 开始查询会话，查询条件: { conversationKey: "${conversationKey}" }`);
            const conversation = await Conversation.findOne({ conversationKey });
            logger.info(`[${requestId}] 查询结果: ${conversation ? JSON.stringify(conversation) : '未找到记录'}`);
            
            // 如果会话不存在
            if (!conversation) {
                logger.info(`[${requestId}] 会话不存在: ${conversationKey}`);
                return {
                    canCall: false,
                    reason: "conversation_not_found",
                    conversationKey
                };
            }
            
            // 检查是否已有视频通话
            const canCall = !conversation.hasVideoCall;
            
            logger.info(`[${requestId}] 会话 ${conversationKey} 的通话状态: ${canCall ? '可以通话' : '已有通话'}`);
            
            return {
                canCall,
                conversationKey,
                conversation
            };
        } catch (error) {
            logger.error(`检查视频通话状态时出错: ${error.message}`);
            logger.error(`错误堆栈: ${error.stack}`);
            throw error;
        }
    }
    
    /**
     * 完成视频通话处理
     * @param {string} conversationKey - 会话键
     * @returns {Promise<Object>} - 处理结果
     */
    async completeVideoCall(conversationKey) {
        try {
            const requestId = Date.now().toString();
            logger.info(`[${requestId}] 完成视频通话: ${conversationKey}`);
            
            // 查找会话
            const conversation = await Conversation.findOne({ conversationKey });
            
            // 如果会话不存在
            if (!conversation) {
                logger.info(`[${requestId}] 会话不存在: ${conversationKey}`);
                return {
                    success: false,
                    error: "conversation_not_found"
                };
            }
            
            // 检查是否已有视频通话
            if (conversation.hasVideoCall) {
                logger.info(`[${requestId}] 会话 ${conversationKey} 已有通话记录`);
                return {
                    success: false,
                    error: "call_already_active"
                };
            }
            
            // 更新会话状态
            await Conversation.updateOne(
                { conversationKey },
                { $set: { hasVideoCall: true } }
            );
            
            logger.info(`[${requestId}] 会话 ${conversationKey} 的hasVideoCall已更新为true`);
            
            // 发送webhook通知
            try {
                const webhookUrl = `${videoCallWebhookUrl}/${conversationKey}`;
                const response = await fetch(webhookUrl, { method: 'POST' });
                const webhookData = await response.json();
                
                logger.info(`[${requestId}] Webhook通知发送成功: ${JSON.stringify(webhookData)}`);
                
                return {
                    success: true,
                    message: "视频通话已记录并通知",
                    webhookResponse: webhookData
                };
            } catch (webhookError) {
                logger.error(`[${requestId}] Webhook通知失败: ${webhookError.message}`);
                
                return {
                    success: false,
                    error: "webhook_failed",
                    details: webhookError.message
                };
            }
        } catch (error) {
            logger.error(`完成视频通话处理时出错: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new ConversationService(); 