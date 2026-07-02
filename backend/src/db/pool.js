require('dotenv').config();
const { Pool } = require('pg');

const dbUrl = process.env.DATABASE_URL || '';

// Use SSL for Render cloud DB (external connections require it)
const useSSL = dbUrl.includes('render.com') ||
               dbUrl.includes('amazonaws.com') ||
               process.env.DB_SSL === 'true';

const pool = new Pool({
  connectionString: dbUrl,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => console.error('DB pool error:', err.message));

async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

module.exports = { pool, query };
