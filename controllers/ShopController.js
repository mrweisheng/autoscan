const { shopService } = require('../services');
const logger = require('../config/logger');

class ShopController {
    /**
     * 导入店铺数据
     * @param {Object} req - Express请求对象
     * @param {Object} res - Express响应对象
     * @returns {Object} 响应结果
     */
    async importShopData(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    status: "error",
                    message: "文件未上传或文件类型不支持"
                });
            }

            const result = await shopService.importShopData(req.file);

            logger.info(`成功导入店铺和商品数据, 店铺: ${result.shopCount}, 商品: ${result.productCount}`);
            return res.json({
                status: "success",
                data: result,
                message: "店铺和商品数据导入成功"
            });

        } catch (error) {
            logger.error(`导入店铺数据失败: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: error.message || "服务器内部错误"
            });
        }
    }

    /**
     * 获取随机商品
     * @param {Object} req - Express请求对象
     * @param {Object} res - Express响应对象
     * @returns {Object} 响应结果
     */
    async getRandomProduct(req, res) {
        try {
            const randomProduct = await shopService.getRandomProduct();
            
            if (!randomProduct) {
                return res.status(404).json({
                    status: "success",
                    data: null,
                    message: "商品表为空，没有可返回的记录"
                });
            }
            
            return res.json({
                status: "success",
                data: randomProduct,
                message: "成功获取随机商品"
            });
            
        } catch (error) {
            logger.error(`获取随机商品失败: ${error.message}`);
            return res.status(500).json({
                status: "error",
                message: "服务器内部错误"
            });
        }
    }
}

module.exports = new ShopController(); 