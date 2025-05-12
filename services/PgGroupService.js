const { Pool } = require('pg');

const pool = new Pool({
    host: '104.37.187.30',
    user: 'gsgj',
    password: 'wktjsw1688',
    port: 5432,
    database: 'vcf_config',
});

async function getRandomGroup() {
    // 使用ORDER BY RANDOM() LIMIT 1高效获取一条随机数据
    const sql = 'SELECT * FROM "group" ORDER BY RANDOM() LIMIT 1';
    const { rows } = await pool.query(sql);
    return rows[0] || null;
}

module.exports = { getRandomGroup }; 