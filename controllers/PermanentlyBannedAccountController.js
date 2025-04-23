const { permanentlyBannedAccountService } = require('../services');
const { logger } = require('../config');

class PermanentlyBannedAccountController {
    /**
     * 添加疑似永久封禁账号 - 更新为新逻辑：在两个数据库查询记录并标记为isPermanentBan=true
     * @param {Object} req 请求对象
     * @param {Object} res 响应对象
     * @returns {Promise<void>}
     */
    async addPermanentlyBannedAccount(req, res) {
        try {
            const { phoneNumber, remarks } = req.query;
            
            // 验证参数
            if (!phoneNumber) {
                return res.status(400).json({
                    status: "error",
                    message: "缺少必填参数: phoneNumber"
                });
            }
            
            // 调用服务方法查询并更新账号
            const result = await permanentlyBannedAccountService.addPermanentlyBannedAccount({
                phoneNumber,
                remarks: remarks || ''
            });
            
            if (result.success) {
                logger.info(`成功将账号标记为永久封禁: ${phoneNumber}`);
                return res.json({
                    status: "success",
                    data: {
                        phoneNumber: result.data.phoneNumber,
                        source: result.source,
                        isPermanentBan: result.data.isPermanentBan
                    },
                    message: "成功将账号标记为永久封禁"
                });
            } else {
                // 未找到账号记录
                return res.status(404).json({
                    status: "error",
                    message: result.message
                });
            }
            
        } catch (error) {
            logger.error(`标记永久封禁账号失败: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "服务器内部错误"
            });
        }
    }
    
    /**
     * 获取所有疑似永久封禁账号列表
     * @param {Object} req 请求对象
     * @param {Object} res 响应对象
     * @returns {Promise<void>}
     */
    async getPermanentlyBannedAccounts(req, res) {
        try {
            const { source, status } = req.query;
            
            // 构建过滤条件
            const filter = {};
            if (source) filter.source = source;
            if (status) filter.status = status;
            
            // 获取列表
            const accounts = await permanentlyBannedAccountService.getPermanentlyBannedAccounts(filter);
            
            return res.json({
                status: "success",
                data: accounts,
                message: `成功获取 ${accounts.length} 条记录`
            });
            
        } catch (error) {
            logger.error(`获取疑似永久封禁账号列表失败: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "服务器内部错误"
            });
        }
    }
    
    /**
     * 更新疑似永久封禁账号状态
     * @param {Object} req 请求对象
     * @param {Object} res 响应对象
     * @returns {Promise<void>}
     */
    async updatePermanentlyBannedAccountStatus(req, res) {
        try {
            const { phoneNumber, status, remarks } = req.query;
            
            // 验证参数
            if (!phoneNumber) {
                return res.status(400).json({
                    status: "error",
                    message: "缺少必填参数: phoneNumber"
                });
            }
            
            if (!status || !['pending', 'confirmed', 'invalid'].includes(status)) {
                return res.status(400).json({
                    status: "error",
                    message: "状态参数无效，必须是: pending, confirmed, invalid"
                });
            }
            
            // 构建更新数据
            const updateData = { status };
            if (remarks !== undefined) updateData.remarks = remarks;
            
            // 更新记录
            const updatedAccount = await permanentlyBannedAccountService.updatePermanentlyBannedAccount(
                phoneNumber,
                updateData
            );
            
            if (!updatedAccount) {
                return res.status(404).json({
                    status: "error",
                    message: "未找到指定的账号记录"
                });
            }
            
            return res.json({
                status: "success",
                data: updatedAccount,
                message: "成功更新疑似永久封禁账号状态"
            });
            
        } catch (error) {
            logger.error(`更新疑似永久封禁账号状态失败: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "服务器内部错误"
            });
        }
    }
}

module.exports = new PermanentlyBannedAccountController(); 