const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const productSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: '未提供描述'
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  imageUrl: {
    type: String,
    default: null
  },
  stock: {
    type: Number,
    default: 0,
    min: 0
  },
  shopId: {
    type: Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: null
  }
}, { collection: 'products' });

// 索引
productSchema.index({ name: 1 });
productSchema.index({ category: 1 });
productSchema.index({ shopId: 1 });

const Product = mongoose.model('Product', productSchema);

module.exports = Product; 