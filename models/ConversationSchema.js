const mongoose = require('mongoose');

// 获取视频通话数据库配置
const conversationDbUri = process.env.CONVERSATION_DB_URI || 'mongodb://smartchat:szpzclljxk@104.37.187.30:27017/chat_gift';
const collectionName = process.env.CONVERSATION_COLLECTION_NAME || 'conversations';

// 创建独立连接到视频通话数据库
const conversationConnection = mongoose.createConnection(conversationDbUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// 监听连接事件
conversationConnection.on('connected', () => {
    console.log('已连接到视频通话数据库');
});

conversationConnection.on('error', (err) => {
    console.error('视频通话数据库连接错误:', err);
});

// 创建会话模式
const conversationSchema = new mongoose.Schema({
    conversationKey: { 
        type: String, 
        required: true, 
        unique: true,
        index: true
    },
    hasVideoCall: { 
        type: Boolean, 
        default: false 
    }
}, { 
    timestamps: true,
    versionKey: false
});

// 创建生成conversationKey的静态方法
conversationSchema.statics.generateConversationKey = function(accountPhone, recipientPhone) {
    // 确保格式一致，去掉所有非数字字符
    const cleanAccount = accountPhone.replace(/\D/g, "");
    const cleanRecipient = recipientPhone.replace(/\D/g, "");

    // 按字典顺序排序，以确保唯一性（无论谁是发送者或接收者）
    const phones = [cleanAccount, cleanRecipient].sort();

    return `${phones[0]}_${phones[1]}`;
};

// 在专用连接上创建模型
const Conversation = conversationConnection.model('Conversation', conversationSchema, collectionName);

module.exports = Conversation; 