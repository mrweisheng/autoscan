const mongoose = require('mongoose');

// 定义ShopProduct Schema
const shopProductSchema = new mongoose.Schema({
    shopType: { type: String, required: true },
    productName: { type: String, required: true },
    originalPrice: { type: Number, default: 0 },
    discountPrice: { type: Number, default: 0 },
    imageUrl: { type: String },
    productDescription: { type: String }
}, { 
    timestamps: true,
    versionKey: false
});

const ShopProduct = mongoose.model('ShopProduct', shopProductSchema);

module.exports = ShopProduct; 