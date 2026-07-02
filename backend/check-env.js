const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query('SELECT tc_id, work_type, work_ref_number, environment, test_reason_type FROM test_cases ORDER BY tc_id')
.then(r => { r.rows.forEach(row => console.log(JSON.stringify(row))); pool.end(); })
.catch(e => { console.error(e.message); pool.end(); });
