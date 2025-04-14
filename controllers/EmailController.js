const { emailService } = require('../services');
const { logger } = require('../config');

class EmailController {
  /**
   * 发送邮件
   * @param {Object} req 请求对象
   * @param {Object} res 响应对象
   * @returns {Object} 响应
   */
  async sendEmail(req, res) {
    try {
      const { to, subject, text, html } = req.body;

      // 验证必填字段
      if (!to || !subject || (!text && !html)) {
        return res.status(400).json({
          status: "error",
          message: "收件人(to)、主题(subject)和内容(text或html)为必填项"
        });
      }

      // 简单的邮箱格式验证
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(to)) {
        return res.status(400).json({
          status: "error",
          message: "收件人邮箱格式不正确"
        });
      }

      // 发送邮件
      await emailService.sendEmail(to, subject, text, html);

      logger.info(`成功发送邮件至 ${to}`);
      return res.json({
        status: "success",
        message: "邮件发送成功"
      });
    } catch (error) {
      logger.error(`邮件发送控制器错误: ${error.message}`);
      return res.status(500).json({
        status: "error",
        message: `邮件发送失败: ${error.message}`
      });
    }
  }
}

module.exports = new EmailController(); 