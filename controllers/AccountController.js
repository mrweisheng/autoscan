const { accountService } = require('../services');
const { logger } = require('../config');

class AccountController {
    async getInactiveAccounts(req, res) {
        try {
            let { days } = req.query;
            let inactiveDays = parseInt(process.env.INACTIVE_DAYS);

            // 如果用户传入了 days 参数
            if (days !== undefined) {
                days = parseInt(days);
                // 验证参数是否在有效范围内
                if (isNaN(days) || days < 1 || days > 20) {
                    return res.status(400).json({
                        status: "error",
                        message: "Days parameter must be an integer between 1 and 20"
                    });
                }
                inactiveDays = days;
            }

            const inactiveAccounts = await accountService.getInactiveAccounts(inactiveDays);

            logger.info(`返回不活跃账号列表，共 ${inactiveAccounts.length} 条记录`);
            return res.json({
                status: "success",
                data: inactiveAccounts
            });

        } catch (error) {
            logger.error(`获取不活跃账号失败: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "Internal server error"
            });
        }
    }

    async updateLastLogin(req, res) {
        try {
            const { phoneNumber } = req.query;

            if (!phoneNumber) {
                return res.status(400).json({
                    status: "error",
                    message: "Missing phoneNumber parameter"
                });
            }

            const updatedAccount = await accountService.updateLastLogin(phoneNumber);

            if (!updatedAccount) {
                return res.status(404).json({
                    status: "success",
                    message: "Account not found"
                });
            }

            logger.info(`成功更新账号最后登录时间: ${phoneNumber}`);
            return res.json({
                status: "success",
                data: updatedAccount
            });

        } catch (error) {
            logger.error(`更新账号最后登录时间失败: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "Internal server error"
            });
        }
    }

    async getRandomBannedAccount(req, res) {
        try {
            const account = await accountService.getRandomBannedAccount();
            
            if (!account) {
                return res.status(404).json({
                    status: "success",
                    data: null,
                    message: "没有找到可用的被封禁账号"
                });
            }
            
            if (account.exhausted) {
                return res.status(404).json({
                    status: "success",
                    data: null,
                    message: `当前时段的所有账号已被获取完毕，请在 ${account.remainingMinutes} 分钟后再试`
                });
            }
            
            return res.json({
                status: "success",
                data: account
            });

        } catch (error) {
            logger.error(`获取随机被封禁账号失败: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "服务器内部错误"
            });
        }
    }

    async markAccountAsHandled(req, res) {
        try {
            const { phoneNumber } = req.query;

            if (!phoneNumber) {
                return res.status(400).json({
                    status: "error",
                    message: "缺少必填参数: phoneNumber"
                });
            }

            const result = await accountService.markAccountAsHandled(phoneNumber);

            if (!result) {
                return res.status(404).json({
                    status: "success",
                    data: null,
                    message: "未找到该账号"
                });
            }

            logger.info(`成功标记账号处理状态: ${phoneNumber}, isHandle=true`);
            return res.json({
                status: "success",
                data: {
                    phoneNumber: result.phoneNumber,
                    isHandle: result.isHandle
                },
                message: "账号标记为已处理"
            });

        } catch (error) {
            logger.error(`标记账号处理状态失败: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "服务器内部错误"
            });
        }
    }

    async getHandledBannedAccounts(req, res) {
        try {
            const { fromShu } = req.query;
            
            // 根据参数决定查询的数据库
            const useShufromShu = fromShu === 'true' || fromShu === '1';
            
            // 获取数据
            const accounts = await accountService.getHandledBannedAccounts(useShufromShu);
            
            logger.info(`成功获取已处理的被封禁账号，共 ${accounts.length} 条记录，数据源: ${useShufromShu ? 'Shu数据库' : '主数据库'}`);
            return res.json({
                status: "success",
                data: accounts,
                totalCount: accounts.length,
                source: useShufromShu ? 'shu' : 'main'
            });

        } catch (error) {
            logger.error(`获取已处理的被封禁账号失败: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "服务器内部错误"
            });
        }
    }

    async getAccountStatus(req, res) {
        try {
            const { phoneNumber } = req.query;
            
            // 验证参数
            if (!phoneNumber) {
                return res.status(400).json({
                    status: "error",
                    message: "缺少必填参数: phoneNumber"
                });
            }
            
            // 获取账号状态
            const result = await accountService.getAccountStatus(phoneNumber);
            
            // 返回结果
            return res.json({
                status: "success",
                data: {
                    phoneNumber: result.phoneNumber,
                    statusCode: result.statusCode
                }
            });
            
        } catch (error) {
            logger.error(`获取账号状态失败: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "服务器内部错误"
            });
        }
    }
}

module.exports = new AccountController(); 