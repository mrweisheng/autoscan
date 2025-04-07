require('dotenv').config();
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// 复用数据库连接配置
const MONGODB_OPTIONS = {
    serverSelectionTimeoutMS: parseInt(process.env.MONGODB_TIMEOUT_MS),
    connectTimeoutMS: parseInt(process.env.MONGODB_TIMEOUT_MS),
    socketTimeoutMS: parseInt(process.env.MONGODB_TIMEOUT_MS),
    maxPoolSize: parseInt(process.env.MONGODB_POOL_SIZE_MAX),
    minPoolSize: parseInt(process.env.MONGODB_POOL_SIZE_MIN),
    maxIdleTimeMS: parseInt(process.env.MONGODB_IDLE_TIME_MS),
    waitQueueTimeoutMS: parseInt(process.env.MONGODB_QUEUE_TIMEOUT_MS),
    family: 4
};

// 定义商品店铺Schema
const shopProductSchema = new mongoose.Schema({
    shopType: { type: String, required: true, index: true },
    shopAddress: { type: String, required: true },
    shopDescription: { type: String },
    shopLink: { type: String, required: true },
    productName: { type: String, required: true },
    originalPrice: { type: Number, required: true },
    discountPrice: { type: Number, required: true },
    imageUrl: { type: String, required: true },
    productDescription: { type: String },
    imageHash: { type: String, index: true }
}, { 
    timestamps: true,
    versionKey: false
});

const ShopProduct = mongoose.model('ShopProduct', shopProductSchema, 'shop_products');

// 删除旧的 processImage 函数，我们不再需要它

async function importData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, MONGODB_OPTIONS);
        console.log('数据库连接成功');

        const workbook = XLSX.readFile('店铺.xlsx', { cellDates: true, cellStyles: true });
        const shopSheet = workbook.Sheets['店铺资料'];
        const productSheet = workbook.Sheets['商品'];
        
        // 获取商品图片列的单元格
        const range = XLSX.utils.decode_range(productSheet['!ref']);
        
        // 找到商品图片列
        let imageColIndex = null;
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({r: 0, c: C});
            const cell = productSheet[cellAddress];
            if (cell && cell.v === '商品图片') {
                imageColIndex = C;
                break;
            }
        }

        console.log('找到图片列索引:', imageColIndex);  // 添加调试信息

        // 创建图片存储目录
        const imageDir = path.join(__dirname, 'uploads', 'images');
        if (!fs.existsSync(imageDir)) {
            fs.mkdirSync(imageDir, { recursive: true });
        }

        // 处理每一行数据，提取并保存图片
        const products = [];
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
            const row = {};
            const cellAddress = XLSX.utils.encode_cell({r: R, c: imageColIndex});
            const cell = productSheet[cellAddress];
            
            // 处理其他列数据
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const currentCellAddress = XLSX.utils.encode_cell({r: R, c: C});
                const currentCell = productSheet[currentCellAddress];
                if (currentCell) {
                    const header = productSheet[XLSX.utils.encode_cell({r: 0, c: C})].v;
                    row[header] = currentCell.v;
                }
            }

            // 单独处理图片列
            if (cell && cell.l && cell.l[0] && cell.l[0].Pic) {
                const imageData = cell.l[0].Pic.data;
                const imageId = row['商品图片'].match(/ID_[A-F0-9]+/)[0];
                const imagePath = path.join(imageDir, `${imageId}.jpg`);

                console.log(`处理图片: ${imageId}`);  // 添加调试信息

                // 保存图片文件
                if (!fs.existsSync(imagePath)) {
                    fs.writeFileSync(imagePath, imageData, 'binary');
                    console.log(`保存图片: ${imagePath}`);  // 添加调试信息
                }
            }
            
            products.push(row);
        }

        const shops = XLSX.utils.sheet_to_json(shopSheet);
        console.log('第一个商品数据:', products[0]);

        // 按店铺类型分组
        const shopsByType = {};
        shops.forEach(shop => {
            if (!shopsByType[shop.店铺类型]) {
                shopsByType[shop.店铺类型] = [];
            }
            shopsByType[shop.店铺类型].push(shop);
        });

        const productsByType = {};
        products.forEach(product => {
            if (!productsByType[product.店铺类型]) {
                productsByType[product.店铺类型] = [];
            }
            productsByType[product.店铺类型].push(product);
        });

        const combinedData = [];
        for (const type in shopsByType) {
            const typeShops = shopsByType[type];
            const typeProducts = productsByType[type] || [];

            for (const shop of typeShops) {
                for (const product of typeProducts) {
                    const imageId = extractImageId(product.商品图片);
                    if (imageId) {
                        combinedData.push({
                            shopType: type,
                            shopAddress: shop.店铺地址,
                            shopDescription: shop.店铺简介,
                            shopLink: shop.店铺链接,
                            productName: product.商品名称,
                            originalPrice: product.商品价格,
                            discountPrice: product.优惠价格,
                            imageUrl: `${process.env.PUBLIC_URL}/images/${imageId}`,
                            productDescription: product.商品简介,
                            imageHash: imageId
                        });
                    }
                }
            }
        }

        // 批量插入数据库
        await ShopProduct.insertMany(combinedData);
        console.log(`成功导入 ${combinedData.length} 条数据`);

        // 关闭数据库连接
        await mongoose.connection.close();
        console.log('数据库连接已关闭');

    } catch (error) {
        console.error(`导入失败: ${error}`);
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
    }
}

// 执行导入
importData();