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

      // 处理收件人格式 - 可以是字符串或数组
      const recipients = Array.isArray(to) ? to : to.split(/\s*,\s*/);
      
      // 验证每个邮箱地址格式
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = recipients.filter(email => !emailRegex.test(email));
      
      if (invalidEmails.length > 0) {
        return res.status(400).json({
          status: "error",
          message: `以下邮箱格式不正确: ${invalidEmails.join(', ')}`
        });
      }

      // 发送邮件
      await emailService.sendEmail(recipients, subject, text, html);

      logger.info(`成功发送邮件至 ${recipients.join(', ')}`);
      return res.json({
        status: "success",
        message: `邮件成功发送给 ${recipients.length} 个收件人`
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