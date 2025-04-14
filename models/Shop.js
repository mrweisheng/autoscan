const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const shopSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  address: {
    type: String,
    trim: true,
    default: '未提供'
  },
  contactInfo: {
    type: String,
    trim: true,
    default: '未提供'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: null
  }
}, { collection: 'shops' });

// 索引
shopSchema.index({ name: 1 });

const Shop = mongoose.model('Shop', shopSchema);

module.exports = Shop; 