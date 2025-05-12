const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.PG_HOST,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
    database: process.env.PG_DATABASE,
});

async function getRandomGroup() {
    // 使用ORDER BY RANDOM() LIMIT 1高效获取一条随机数据
    const sql = 'SELECT * FROM "group" ORDER BY RANDOM() LIMIT 1';
    const { rows } = await pool.query(sql);
    return rows[0] || null;
}

module.exports = { getRandomGroup }; 