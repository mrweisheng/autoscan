afterAll(async () => {
    try {
        logger.info('Starting final cleanup...');
        
        // 只清理 userloginstatuses 集合
        await mongoose.connection.db.collection('userloginstatuses').deleteMany({});
        
        // 关闭数据库连接
        await mongoose.connection.close();
        logger.info('Test cleanup completed');
    } catch (error) {
        logger.error('Test cleanup failed:', error);
        throw error;
    }
}); 

// 注意：accounts 相关的 API 不参与自动化测试，避免影响生产数据

// 测试账号相关API
/*
describe('Account Management', () => {
    // 使用固定的测试账号，不清理数据
    const testAccount = {
        phoneNumber: '639999999999',  // 使用固定的测试号码
        name: 'API Test Account',
        lastLogin: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        proxy: {
            host: '72.1.123.123',
            port: '8080',
            username: 'proxyuser',
            password: 'proxypass'
        }
    };

    // 在测试前确保测试账号存在
    beforeAll(async () => {
        // 使用 findOneAndUpdate 确保测试账号存在，不会删除数据
        await mongoose.connection.db.collection('accounts')
            .findOneAndUpdate(
                { phoneNumber: testAccount.phoneNumber },
                { $set: testAccount },
                { upsert: true }
            );
    });

    it('should get inactive accounts with custom days', async () => {
        // 测试代码...
    });

    it('should update account last login time', async () => {
        // 测试代码...
    });

    // 其他测试...
});
*/

// ... 其他测试代码 ...