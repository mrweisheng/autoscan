const conversationService = require('../services/ConversationService');
const { logger } = require('../config');

class ConversationController {
    /**
     * 检查会话视频通话状态
     * @param {Express.Request} req - 请求对象
     * @param {Express.Response} res - 响应对象
     */
    async checkVideoCallStatus(req, res) {
        try {
            const { accountPhone, recipientPhone } = req.query;
            
            // 验证请求参数
            if (!accountPhone || !recipientPhone) {
                logger.warn(`缺少必要参数: accountPhone=${accountPhone}, recipientPhone=${recipientPhone}`);
                return res.status(400).json({
                    status: "error",
                    message: "缺少必要参数: accountPhone和recipientPhone"
                });
            }
            
            // 查询会话状态
            const result = await conversationService.checkVideoCallStatus(accountPhone, recipientPhone);
            
            // 如果会话不存在
            if (result.reason === "conversation_not_found") {
                return res.json({
                    status: "success",
                    canCall: false,
                    conversationKey: result.conversationKey,
                    reason: result.reason,
                    message: "会话不存在"
                });
            }
            
            // 如果是新创建的会话或存在的可通话会话
            if (result.canCall) {
                return res.json({
                    status: "success",
                    canCall: true,
                    conversationKey: result.conversationKey,
                    message: "可以视频通话"
                });
            }
            
            // 如果会话存在但已有通话
            return res.json({
                status: "success",
                canCall: false,
                conversationKey: result.conversationKey,
                message: "已存在视频通话，无法再次发起"
            });
            
        } catch (error) {
            logger.error(`检查视频通话状态出错: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "服务器内部错误"
            });
        }
    }
    
    /**
     * 完成视频通话处理
     * @param {Express.Request} req - 请求对象
     * @param {Express.Response} res - 响应对象
     */
    async completeVideoCall(req, res) {
        try {
            const { conversationKey } = req.query;
            
            // 验证请求参数
            if (!conversationKey) {
                logger.warn(`缺少必要参数: conversationKey`);
                return res.status(400).json({
                    status: "error",
                    message: "缺少必要参数: conversationKey"
                });
            }
            
            // 处理完成视频通话的逻辑
            const result = await conversationService.completeVideoCall(conversationKey);
            
            // 根据处理结果返回响应
            if (!result.success) {
                let statusCode = 400;
                let message = "处理视频通话请求失败";
                
                // 根据错误类型设置特定的消息
                if (result.error === "conversation_not_found") {
                    message = "指定的会话不存在";
                } else if (result.error === "call_already_active") {
                    message = "已存在视频通话记录";
                } else if (result.error === "webhook_failed") {
                    statusCode = 500;
                    message = `Webhook通知失败: ${result.details}`;
                }
                
                return res.status(statusCode).json({
                    status: "error",
                    error: result.error,
                    message
                });
            }
            
            // 成功处理
            return res.json({
                status: "success",
                message: result.message,
                webhookResponse: result.webhookResponse
            });
            
        } catch (error) {
            logger.error(`完成视频通话处理出错: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "服务器内部错误"
            });
        }
    }
}

module.exports = new ConversationController(); 