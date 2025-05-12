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
            
            // 生成会话键
            const conversationKey = await conversationService.generateConversationKey(accountPhone, recipientPhone);
            // 查找会话
            const conversation = await conversationService.findConversationByKey(conversationKey);
            if (!conversation) {
                return res.json({
                    status: "success",
                    canCall: false,
                    conversationKey,
                    reason: "conversation_not_found",
                    message: "会话不存在"
                });
            }
            const replyFlow = conversation.replyFlow || {};
            const flowId = replyFlow.flowId;
            const currentStep = replyFlow.currentStep;
            if (!flowId) {
                return res.json({
                    status: "success",
                    canCall: false,
                    conversationKey,
                    reason: "flow_not_started",
                    message: "会话流程未进行"
                });
            }
            // 查找replyflow
            const replyFlowDoc = await conversationService.findReplyFlowById(flowId);
            if (!replyFlowDoc) {
                return res.json({
                    status: "success",
                    canCall: false,
                    conversationKey,
                    reason: "replyflow_not_found",
                    message: "未找到流程定义"
                });
            }
            let steps = [];
            try {
                steps = typeof replyFlowDoc.steps === 'string' ? JSON.parse(replyFlowDoc.steps) : replyFlowDoc.steps;
            } catch (e) {
                return res.json({
                    status: "success",
                    canCall: false,
                    conversationKey,
                    reason: "steps_parse_error",
                    message: "流程步骤解析失败"
                });
            }
            if (!Array.isArray(steps) || !steps[currentStep]) {
                return res.json({
                    status: "success",
                    canCall: false,
                    conversationKey,
                    reason: "step_not_found",
                    message: "未找到当前流程步骤"
                });
            }
            const step = steps[currentStep];
            if (step.triggerType === 'video_call') {
                return res.json({
                    status: "success",
                    canCall: true,
                    conversationKey,
                    message: "可以视频通话"
                });
            } else {
                return res.json({
                    status: "success",
                    canCall: false,
                    conversationKey,
                    reason: "not_video_call_step",
                    message: "当前流程步骤不允许视频通话"
                });
            }
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

    /**
     * 获取所有已完成视频通话的会话记录
     * @param {Express.Request} req - 请求对象
     * @param {Express.Response} res - 响应对象
     */
    async getVideoCallConversations(req, res) {
        try {
            const result = await conversationService.getVideoCallConversations();
            
            return res.json({
                status: "success",
                data: result.conversations,
                count: result.count,
                message: `找到 ${result.count} 条已完成视频通话的会话记录`
            });
        } catch (error) {
            logger.error(`获取视频通话会话记录出错: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "服务器内部错误"
            });
        }
    }

    /**
     * 重置指定的视频通话记录
     * @param {Express.Request} req - 请求对象
     * @param {Express.Response} res - 响应对象
     */
    async resetVideoCall(req, res) {
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
            
            // 重置视频通话记录
            const result = await conversationService.resetVideoCall(conversationKey);
            
            if (!result.success) {
                let statusCode = 400;
                let message = "重置视频通话记录失败";
                
                if (result.error === "conversation_not_found") {
                    message = "指定的会话不存在";
                } else if (result.error === "call_not_active") {
                    message = "该会话没有活跃的视频通话记录";
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
                message: "视频通话记录已重置",
                data: {
                    conversationKey,
                    hasVideoCall: false
                }
            });
            
        } catch (error) {
            logger.error(`重置视频通话记录出错: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "服务器内部错误"
            });
        }
    }
}

module.exports = new ConversationController(); 