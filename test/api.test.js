const request = require('supertest');
const mongoose = require('mongoose');
const { createServer, logger } = require('../autoLogin');

// 在测试开始前加载测试环境配置
process.env.NODE_ENV = 'test';
require('dotenv').config({ path: '.env.test' });

describe('Auto Login API Tests', () => {
    let app;
    let server;
    const testDevice = 'test_device_' + Date.now();
    const testName = 'test_user_' + Date.now();

    // 在所有测试开始前设置
    beforeAll(async () => {
        jest.setTimeout(30000);
        
        try {
            app = await createServer();
            server = app.listen(0);
            logger.info('Test server started');
        } catch (error) {
            logger.error('Test setup failed:', error);
            throw error;
        }
    });

    // 在所有测试结束后清理
    afterAll(async () => {
        try {
            logger.info('Starting final cleanup...');
            
            // 1. 先获取集合的索引信息
            const indexes = await mongoose.connection.db
                .collection('userloginstatuses')
                .indexes();
            logger.info('Saved collection indexes:', indexes);

            // 2. 删除集合
            await mongoose.connection.db.collection('userloginstatuses').drop();
            logger.info('Collection dropped');

            // 3. 重新创建集合
            await mongoose.connection.db.createCollection('userloginstatuses');
            logger.info('Collection recreated');

            // 4. 重新创建索引
            for (const index of indexes) {
                if (index.name !== '_id_') { // 跳过默认的_id索引
                    await mongoose.connection.db
                        .collection('userloginstatuses')
                        .createIndex(
                            index.key,
                            {
                                name: index.name,
                                unique: index.unique,
                                sparse: index.sparse,
                                background: true
                            }
                        );
                }
            }
            logger.info('Indexes recreated');

            // 5. 验证集合是否为空且结构完整
            const count = await mongoose.connection.db
                .collection('userloginstatuses')
                .countDocuments();
            
            const newIndexes = await mongoose.connection.db
                .collection('userloginstatuses')
                .indexes();
            
            logger.info(`Collection is empty: ${count === 0}`);
            logger.info(`Collection structure verified: ${newIndexes.length === indexes.length}`);

            // 6. 关闭连接
            await mongoose.connection.close();
            await new Promise(resolve => server.close(resolve));
            logger.info('Test cleanup completed: data cleared, structure preserved');
        } catch (error) {
            logger.error('Test cleanup failed:', error);
            throw error;
        }
    });

    // 在每个测试后清理数据
    afterEach(async () => {
        try {
            // 每个测试后清理数据
            await mongoose.connection.db.collection('userloginstatuses').deleteMany({});
            logger.info('Individual test data cleaned up');
        } catch (error) {
            logger.error('Individual test cleanup failed:', error);
            throw error;
        }
    });

    // 测试手机端推送登录需求
    describe('Mobile Push Need Login', () => {
        it('should create a login request successfully', async () => {
            const uniqueDevice = `${testDevice}_push_${Date.now()}`;
            const response = await request(app)
                .get('/mobile/push-need-login')
                .query({
                    name: testName,
                    phone_device: uniqueDevice
                });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('success');
            expect(response.body.message).toBe('Login request recorded');
        });

        it('should fail without required parameters', async () => {
            const response = await request(app)
                .get('/mobile/push-need-login')
                .query({
                    name: testName
                });

            expect(response.status).toBe(400);
            expect(response.body.status).toBe('error');
            expect(response.body.message).toBe('Missing required parameters: name and phone_device');
        });
    });

    // 测试PC端获取需要登录的账号信息
    describe('PC Get Need Login', () => {
        it('should get login request successfully', async () => {
            const uniqueDevice = `${testDevice}_get_${Date.now()}`;
            // 先创建一个登录请求
            await request(app)
                .get('/mobile/push-need-login')
                .query({
                    name: testName,
                    phone_device: uniqueDevice
                });

            // 然后获取这个登录请求
            const response = await request(app)
                .get('/pc/get_need_login')
                .query({
                    phone_device: uniqueDevice
                });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('success');
            expect(response.body.data).toHaveProperty('name', testName);
            expect(response.body.data).toHaveProperty('phone_device', uniqueDevice);
        });

        it('should return 404 when no login request exists', async () => {
            const response = await request(app)
                .get('/pc/get_need_login')
                .query({
                    phone_device: 'non_existent_device'
                });

            expect(response.status).toBe(404);
            expect(response.body.status).toBe('success');
            expect(response.body.data).toBeNull();
        });
    });

    // 测试PC端推送扫码需求
    describe('PC Push Need Scan', () => {
        it('should create a scan request successfully', async () => {
            const uniqueDevice = `${testDevice}_scan_${Date.now()}`;
            const response = await request(app)
                .get('/pc/push_need_scan')
                .query({
                    name: testName,
                    phone_device: uniqueDevice
                });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('success');
            expect(response.body.message).toBe(`Successfully inserted scan record for: ${testName}`);
        });

        it('should fail without required parameters', async () => {
            const response = await request(app)
                .get('/pc/push_need_scan')
                .query({
                    name: testName
                });

            expect(response.status).toBe(400);
            expect(response.body.status).toBe('error');
            expect(response.body.message).toBe('Missing required parameters: name and phone_device');
        });
    });

    // 测试手机端获取需要扫码的记录
    describe('Mobile Get Need Scan', () => {
        it('should get scan request successfully', async () => {
            const uniqueDevice = `${testDevice}_get_scan_${Date.now()}`;
            // 先创建一个扫码请求
            await request(app)
                .get('/pc/push_need_scan')
                .query({
                    name: testName,
                    phone_device: uniqueDevice
                });

            // 然后获取这个扫码请求
            const response = await request(app)
                .get('/mobile/get-need-scan')
                .query({
                    phone_device: uniqueDevice
                });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('success');
            expect(response.body.data).toHaveProperty('name', testName);
            expect(response.body.data).toHaveProperty('phone_device', uniqueDevice);
            expect(response.body.data).toHaveProperty('login_status', 'scan');
        });

        it('should return 404 when no scan request exists', async () => {
            const response = await request(app)
                .get('/mobile/get-need-scan')
                .query({
                    phone_device: 'non_existent_device'
                });

            expect(response.status).toBe(404);
            expect(response.body.status).toBe('success');
            expect(response.body.data).toBeNull();
        });
    });

    // 测试完整流程
    describe('Complete Flow Test', () => {
        it('should complete the entire login and scan flow', async () => {
            const flowDevice = `flow_test_device_${Date.now()}`;
            const flowName = `flow_test_user_${Date.now()}`;

            // 1. 手机端推送登录需求
            let response = await request(app)
                .get('/mobile/push-need-login')
                .query({
                    name: flowName,
                    phone_device: flowDevice
                });
            expect(response.status).toBe(200);

            // 2. PC端获取登录需求
            response = await request(app)
                .get('/pc/get_need_login')
                .query({
                    phone_device: flowDevice
                });
            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('name', flowName);

            // 3. PC端推送扫码需求
            response = await request(app)
                .get('/pc/push_need_scan')
                .query({
                    name: flowName,
                    phone_device: flowDevice
                });
            expect(response.status).toBe(200);

            // 4. 手机端获取扫码需求
            response = await request(app)
                .get('/mobile/get-need-scan')
                .query({
                    phone_device: flowDevice
                });
            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('name', flowName);
            expect(response.body.data).toHaveProperty('login_status', 'scan');
        });
    });

    // 批量插入测试
    describe('Batch Insert Test', () => {
        it('should insert 100 random login requests', async () => {
            const timestamp = Date.now();
            const testData = Array.from({ length: 100 }, (_, index) => ({
                name: `test_user_${timestamp}_${index}`,
                phone_device: `test_device_${timestamp}_${index}`,
                timestamp: new Date(timestamp + index * 1000).toISOString()
            }));

            logger.info(`Starting batch insert of 100 records with timestamp: ${timestamp}`);

            // 使用 Promise.all 并行处理所有请求
            const responses = await Promise.all(
                testData.map(data =>
                    request(app)
                        .get('/mobile/push-need-login')
                        .query({
                            name: data.name,
                            phone_device: data.phone_device
                        })
                )
            );

            // 验证所有请求都成功
            responses.forEach((response, index) => {
                expect(response.status).toBe(200);
                expect(response.body.status).toBe('success');
                expect(response.body.message).toBe('Login request recorded');
                
                logger.info(`Successfully inserted test data ${index + 1}/100: ${testData[index].name}`);
            });

            // 验证数据库中的记录数并输出统计信息
            const count = await mongoose.connection.db
                .collection('userloginstatuses')
                .countDocuments();
            
            expect(count).toBeGreaterThanOrEqual(100); // 使用大于等于，因为可能有其他测试的数据
            logger.info('Collection statistics after batch insert:');
            logger.info(`- Total documents: ${count}`);

            // 输出前5条记录作为样本
            const sampleRecords = await mongoose.connection.db
                .collection('userloginstatuses')
                .find()
                .sort({ createdAt: -1 }) // 按创建时间倒序，确保看到最新数据
                .limit(5)
                .toArray();
            
            logger.info('Sample records from database:');
            sampleRecords.forEach(record => {
                logger.info(`- ${record.name} (${record.phone_device})`);
            });

            // 添加延迟，确保有足够时间查看数据
            await new Promise(resolve => setTimeout(resolve, 2000));
        });

        it('should verify random inserted data is retrievable', async () => {
            const timestamp = Date.now();
            const randomIndex = Math.floor(Math.random() * 100);
            const testDevice = `test_device_${timestamp}_${randomIndex}`;
            
            // 创建一条新记录
            await request(app)
                .get('/mobile/push-need-login')
                .query({
                    name: `test_user_${timestamp}_${randomIndex}`,
                    phone_device: testDevice
                });

            // 验证可以获取到该记录
            const response = await request(app)
                .get('/pc/get_need_login')
                .query({
                    phone_device: testDevice
                });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('success');
            expect(response.body.data).toHaveProperty('name', `test_user_${timestamp}_${randomIndex}`);
            expect(response.body.data).toHaveProperty('phone_device', testDevice);
        });
    });

    // 测试账号相关API
    describe('Account Management', () => {
        // 在测试前插入一些测试数据
        beforeEach(async () => {
            const testAccount = {
                phoneNumber: '639123456789',
                name: 'Test User',
                lastLogin: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15天前
                proxy: {
                    host: '72.1.123.123',
                    port: '8080',
                    username: 'proxyuser',
                    password: 'proxypass'
                }
            };

            await mongoose.connection.db.collection('accounts')
                .insertOne(testAccount);
        });

        // 在测试后清理测试数据
        afterEach(async () => {
            await mongoose.connection.db.collection('accounts')
                .deleteMany({});
        });

        it('should get inactive accounts with default days', async () => {
            const response = await request(app)
                .get('/accounts/inactive');

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('success');
            expect(Array.isArray(response.body.data)).toBe(true);
            
            if (response.body.data.length > 0) {
                const account = response.body.data[0];
                expect(account).toHaveProperty('phoneNumber');
                expect(account).toHaveProperty('name');
                expect(account).toHaveProperty('lastLogin');
                expect(account).toHaveProperty('proxy');
                expect(account.proxy).toHaveProperty('host');
                expect(account.proxy).toHaveProperty('port');
                expect(account.proxy).toHaveProperty('username');
                expect(account.proxy).toHaveProperty('password');
            }
        });

        it('should get inactive accounts with custom days', async () => {
            const response = await request(app)
                .get('/accounts/inactive')
                .query({ days: 5 });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('success');
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should reject invalid days parameter', async () => {
            const response = await request(app)
                .get('/accounts/inactive')
                .query({ days: 25 }); // 超出范围的值

            expect(response.status).toBe(400);
            expect(response.body.status).toBe('error');
            expect(response.body.message).toBe('Days parameter must be an integer between 1 and 20');
        });

        it('should update account last login time', async () => {
            const testPhone = '639123456789';
            const response = await request(app)
                .get('/accounts/update-login')
                .query({ phoneNumber: testPhone });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('success');
            expect(response.body.data).toHaveProperty('phoneNumber', testPhone);
            expect(response.body.data).toHaveProperty('lastLogin');
        });

        it('should fail to update non-existent account', async () => {
            const response = await request(app)
                .get('/accounts/update-login')
                .query({ phoneNumber: 'nonexistent' });

            expect(response.status).toBe(404);
            expect(response.body.status).toBe('success');
            expect(response.body.message).toBe('Account not found');
        });
    });
}); 