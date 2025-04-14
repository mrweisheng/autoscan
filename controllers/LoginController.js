const { loginService } = require('../services');
const { logger } = require('../config');

class LoginController {
    async mobilePushNeedLogin(req, res) {
        try {
            const { name, phone_device } = req.query;

            if (!name || !phone_device) {
                return res.status(400).json({
                    status: "error",
                    message: "Missing required parameters: name and phone_device"
                });
            }

            await loginService.mobilePushNeedLogin(name, phone_device);

            logger.info(`Successfully recorded login request for device: ${phone_device}`);
            return res.json({
                status: "success",
                message: "Login request recorded"
            });

        } catch (error) {
            logger.error(`Error in mobilePushNeedLogin: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "Internal server error"
            });
        }
    }

    async pcGetNeedLogin(req, res) {
        try {
            const { phone_device } = req.query;

            if (!phone_device) {
                return res.status(400).json({
                    status: "error",
                    message: "Missing phone_device parameter"
                });
            }

            const result = await loginService.pcGetNeedLogin(phone_device);

            if (!result) {
                return res.status(404).json({
                    status: "success",
                    data: null,
                    message: "No record found for this device"
                });
            }

            return res.json({
                status: "success",
                data: result
            });

        } catch (error) {
            logger.error(`Error in pcGetNeedLogin: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "Internal server error"
            });
        }
    }

    async pcPushNeedScan(req, res) {
        try {
            const { name, phone_device } = req.query;

            if (!name || !phone_device) {
                return res.status(400).json({
                    status: "error",
                    message: "Missing required parameters: name and phone_device"
                });
            }

            await loginService.pcPushNeedScan(name, phone_device);

            return res.json({
                status: "success",
                message: `Successfully processed scan record for: ${name}`
            });

        } catch (error) {
            logger.error(`处理扫码请求失败: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "Internal server error"
            });
        }
    }

    async mobileGetNeedScan(req, res) {
        try {
            const { phone_device } = req.query;

            if (!phone_device) {
                return res.status(400).json({
                    status: "error",
                    message: "Missing phone_device parameter"
                });
            }

            const result = await loginService.mobileGetNeedScan(phone_device);

            if (!result) {
                return res.status(404).json({
                    status: "success",
                    data: null,
                    message: "No scan record found for this device"
                });
            }

            return res.json({
                status: "success",
                data: result
            });

        } catch (error) {
            logger.error(`Error in mobileGetNeedScan: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "Internal server error"
            });
        }
    }
}

module.exports = new LoginController(); 