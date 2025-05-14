const { getRandomGroup } = require('../services/PgGroupService');
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { Pool } = require('pg');
const pool = new Pool({
    host: process.env.PG_HOST,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
    database: process.env.PG_DATABASE,
});

class GroupController {
    async getRandomGroup(req, res) {
        try {
            res.set('Cache-Control', 'no-store');
            const group = await getRandomGroup();
            if (group) {
                res.json({ status: 'success', data: group });
            } else {
                res.status(404).json({ status: 'error', message: '未找到任何group数据' });
            }
        } catch (error) {
            res.status(500).json({ status: 'error', message: '服务器内部错误', error: error.message });
        }
    }

    async importGroups(req, res) {
        console.log('收到上传请求');
        if (!req.file) {
            console.log('未上传文件');
            return res.status(400).json({ error: '未上传文件' });
        }
        const filePath = req.file.path;
        const urls = [];
        try {
            console.log('开始读取文件', filePath);
            const rl = readline.createInterface({
                input: fs.createReadStream(filePath),
                crlfDelay: Infinity
            });
            for await (const line of rl) {
                const url = line.trim();
                if (url) urls.push(url);
            }
            console.log('文件读取完成', urls.length);
            if (urls.length === 0) {
                fs.unlinkSync(filePath);
                console.log('文件内容为空');
                return res.status(400).json({ error: '文件内容为空' });
            }
            const client = await pool.connect();
            try {
                console.log('开始数据库操作');
                await client.query('BEGIN');
                await client.query('TRUNCATE TABLE "group" RESTART IDENTITY');
                // 批量插入
                const batchSize = 200;
                for (let i = 0; i < urls.length; i += batchSize) {
                    const batch = urls.slice(i, i + batchSize);
                    const values = batch.map((url, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`).join(',');
                    const params = [];
                    batch.forEach(url => { params.push('', url); });
                    await client.query(
                        `INSERT INTO "group" (group_name, group_url) VALUES ${values}`,
                        params
                    );
                }
                await client.query('UPDATE "group" SET group_name = id');
                await client.query('COMMIT');
                console.log('数据库操作完成');
            } catch (e) {
                await client.query('ROLLBACK');
                fs.unlinkSync(filePath);
                console.log('数据库操作失败', e);
                return res.status(500).json({ error: '数据库操作失败', detail: e.message });
            } finally {
                client.release();
            }
            fs.unlinkSync(filePath);
            console.log('全部完成');
            res.json({ status: 'success', total: urls.length });
        } catch (err) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            console.log('文件处理失败', err);
            res.status(500).json({ error: '文件处理失败', detail: err.message });
        }
    }
}

module.exports = new GroupController(); 