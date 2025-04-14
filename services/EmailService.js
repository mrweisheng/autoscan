const nodemailer = require('nodemailer');
const postmark = require('postmark');
const { logger } = require('../config');

// 阿里云邮件推送客户端导入
let aliCloudClient = null;
try {
  const Core = require('@alicloud/pop-core');
  aliCloudClient = Core;
} catch (error) {
  logger.warn('未安装@alicloud/pop-core包，阿里云邮件推送功能不可用');
}

class EmailService {
  constructor() {
    // 根据环境变量决定使用哪种邮件服务
    this.usePostmark = !!process.env.POSTMARK_API_TOKEN;
    this.useAliCloud = !this.usePostmark && !!process.env.ALICLOUD_ACCESS_KEY_ID;
    
    if (this.usePostmark) {
      // 使用Postmark
      logger.info('使用Postmark API发送邮件');
      this.client = new postmark.ServerClient(process.env.POSTMARK_API_TOKEN);
    } else if (this.useAliCloud && aliCloudClient) {
      // 使用阿里云邮件推送
      logger.info('使用阿里云邮件推送服务');
      this.aliClient = new aliCloudClient({
        accessKeyId: process.env.ALICLOUD_ACCESS_KEY_ID,
        accessKeySecret: process.env.ALICLOUD_ACCESS_KEY_SECRET,
        endpoint: 'https://dm.aliyuncs.com',
        apiVersion: '2015-11-23'
      });
    } else {
      // 使用SMTP
      const port = parseInt(process.env.EMAIL_PORT || '587');
      const secure = port === 465; // 端口465使用SSL加密
      
      logger.info(`使用SMTP服务发送邮件: ${process.env.EMAIL_HOST}:${port}, SSL加密: ${secure}`);
      
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: port,
        secure: secure, // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        tls: {
          // 如果是自签名证书，可能需要设置
          rejectUnauthorized: false
        }
      });
      
      // 验证SMTP配置
      this.verifyTransporter();
    }
  }

  /**
   * 验证SMTP传输器配置
   */
  async verifyTransporter() {
    if (!this.usePostmark && !this.useAliCloud && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        await this.transporter.verify();
        logger.info('SMTP邮件服务配置有效');
      } catch (error) {
        logger.error(`SMTP邮件服务配置无效: ${error.message}`);
      }
    }
  }

  /**
   * 发送邮件
   * @param {String} to 收件人邮箱
   * @param {String} subject 邮件主题
   * @param {String} text 纯文本内容
   * @param {String} html HTML内容
   * @returns {Promise<Object>} 发送结果
   */
  async sendEmail(to, subject, text, html) {
    try {
      if (this.usePostmark) {
        // 使用Postmark发送
        return await this.sendWithPostmark(to, subject, text, html);
      } else if (this.useAliCloud) {
        // 使用阿里云邮件推送发送
        return await this.sendWithAliCloud(to, subject, text, html);
      } else {
        // 使用SMTP发送
        return await this.sendWithSMTP(to, subject, text, html);
      }
    } catch (error) {
      logger.error(`邮件发送失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 使用Postmark发送邮件
   */
  async sendWithPostmark(to, subject, text, html) {
    const response = await this.client.sendEmail({
      From: process.env.EMAIL_FROM,
      To: to,
      Subject: subject,
      TextBody: text,
      HtmlBody: html || text,
      MessageStream: 'outbound'
    });

    logger.info(`Postmark邮件发送成功 [${response.MessageID}]: 发送给 ${to}, 主题: ${subject}`);
    return { 
      success: true, 
      messageId: response.MessageID,
      details: response
    };
  }

  /**
   * 使用阿里云邮件推送发送邮件
   */
  async sendWithAliCloud(to, subject, text, html) {
    if (!this.aliClient) {
      throw new Error('阿里云邮件推送客户端未初始化，请安装@alicloud/pop-core包');
    }

    const params = {
      AccountName: process.env.ALICLOUD_SENDER_EMAIL,
      AddressType: 1,
      ReplyToAddress: true,
      ToAddress: to,
      Subject: subject,
      FromAlias: process.env.ALICLOUD_SENDER_NAME || '系统通知',
      TagName: process.env.ALICLOUD_TAG_NAME || 'AutoScan',
    };

    // 设置邮件内容，优先使用HTML内容
    if (html) {
      params.HtmlBody = html;
    } else {
      params.TextBody = text;
    }

    const response = await this.aliClient.request('SingleSendMail', params, {
      method: 'POST'
    });

    logger.info(`阿里云邮件发送成功 [${response.RequestId}]: 发送给 ${to}, 主题: ${subject}`);
    return {
      success: true,
      messageId: response.RequestId,
      details: response
    };
  }

  /**
   * 使用SMTP发送邮件
   */
  async sendWithSMTP(to, subject, text, html) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      throw new Error('SMTP邮件服务未配置，请先配置EMAIL_USER和EMAIL_PASS环境变量');
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      text,
      html: html || text,
      headers: {
        'X-Priority': '3',
        'X-MSMail-Priority': 'Normal',
        'X-Mailer': 'AutoScan Service'
      }
    };

    // 添加日志，显示详细信息
    logger.info(`准备发送邮件到: ${to}, 主题: ${subject}, 使用SMTP服务: ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}`);
    
    try {
      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`SMTP邮件发送成功 [${info.messageId}]: 发送给 ${to}, 主题: ${subject}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error(`SMTP邮件发送失败: ${error.message}`);
      if (error.code) {
        logger.error(`错误代码: ${error.code}`);
      }
      if (error.command) {
        logger.error(`失败命令: ${error.command}`);
      }
      throw error;
    }
  }
}

module.exports = new EmailService(); 