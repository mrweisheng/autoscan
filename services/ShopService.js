const { Shop, Product } = require('../models');
const logger = require('../config/logger');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { generateRequestId } = require('../utils/helper');

class ShopService {
    /**
     * 导入店铺数据
     * @param {Object} file 上传的Excel文件
     * @returns {Promise<Object>} 导入结果
     */
    async importShopData(file) {
        try {
            // 解析Excel文件
            const workbook = XLSX.readFile(file.path);
            
            // 验证必要的Sheet是否存在
            if (!workbook.SheetNames.includes('店铺资料') || !workbook.SheetNames.includes('商品')) {
                throw new Error('Excel文件中缺少必要的sheet：店铺资料或商品');
            }
            
            const shopSheet = workbook.Sheets['店铺资料'];
            const productSheet = workbook.Sheets['商品'];
            
            // 转换为JSON
            const shops = XLSX.utils.sheet_to_json(shopSheet);
            
            // 验证数据
            if (shops.length === 0) {
                throw new Error('Excel文件中没有有效的店铺数据');
            }
            
            // 处理商品数据，包括图片
            const products = [];
            const productWorksheet = productSheet;
            const rows = XLSX.utils.sheet_to_json(productWorksheet);
            
            for (const row of rows) {
                let imageUrl = '';
                
                // 处理图片字段
                // 跳过URL格式的图片，只处理内嵌图片
                products.push({
                    shopType: row['店铺类型'] || '',
                    productName: row['商品名称'] || '',
                    originalPrice: row['商品价格'] || 0,
                    discountPrice: row['优惠价格'] || 0,
                    imageUrl: imageUrl,
                    productDescription: row['商品简介'] || ''
                });
            }
            
            // 验证数据
            if (products.length === 0) {
                throw new Error('Excel文件中没有有效的商品数据');
            }
            
            // 创建图片目录
            const imagesDir = path.join(__dirname, '../uploads/images');
            if (!fs.existsSync(imagesDir)) {
                fs.mkdirSync(imagesDir, { recursive: true });
            }
            
            // 提取图片并转为base64
            const rawData = XLSX.utils.sheet_to_json(productWorksheet, { raw: true });
            for (let i = 0; i < rawData.length; i++) {
                const row = rawData[i];
                if (row['商品图片'] && workbook.Sheets[productSheet.name]['!images']) {
                    const images = workbook.Sheets[productSheet.name]['!images'];
                    const image = images.find(img => 
                        img.ref.includes(`商品图片`) && 
                        img.ref.includes(`R${i+2}`)
                    );
                    
                    if (image) {
                        const base64Data = image.data.toString('base64');
                        const mimeType = image.type || 'image/jpeg';
                        products[i].imageUrl = `data:${mimeType};base64,${base64Data}`;
                    }
                }
            }
            
            // 批量插入数据 - 先插入店铺，再插入商品
            await Shop.insertMany(shops);
            await ShopProduct.insertMany(products);
            
            logger.info(`成功导入 ${shops.length} 家店铺和 ${products.length} 件商品`);
            
            return {
                shopCount: shops.length,
                productCount: products.length
            };
        } catch (error) {
            logger.error(`导入店铺数据失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 获取随机商品
     * @returns {Promise<Object>} 随机商品
     */
    async getRandomProduct() {
        // 生成请求ID和时间戳，用于日志和调试
        const now = Date.now();
        const requestId = generateRequestId();
        logger.info(`[${requestId}] 接收到获取随机商品请求`);
        
        try {
            // 处理并发请求 - 使用聚合管道确保随机性
            // 获取商品总数
            const count = await ShopProduct.countDocuments();
            
            if (count === 0) {
                logger.info(`[${requestId}] 商品表为空，没有可返回的记录`);
                return null;
            }
            
            // 使用聚合管道实现真正的随机
            // 1. 生成一个随机数作为跳过的文档数
            // 2. 但为避免偏向性（特别是在数据量大的情况下），我们使用sample
            const randomProduct = await ShopProduct.aggregate([
                { $sample: { size: 1 } },
                { $project: { _id: 0, __v: 0 } }
            ]);
            
            if (!randomProduct || randomProduct.length === 0) {
                logger.warn(`[${requestId}] 未能获取随机商品记录`);
                return null;
            }
            
            logger.info(`[${requestId}] 成功获取随机商品: ${randomProduct[0].productName}`);
            return randomProduct[0];
            
        } catch (error) {
            logger.error(`[${requestId}] 获取随机商品失败: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new ShopService(); 