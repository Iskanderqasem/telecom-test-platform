require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

// SSL required for Render external PostgreSQL connections
const dbUrl = process.env.DATABASE_URL || '';
const useSSL = dbUrl.includes('render.com') ||
               dbUrl.includes('amazonaws.com') ||
               process.env.DB_SSL === 'true';

async function ensureMigrationsTable(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}

async function getApplied(pool) {
  const res = await pool.query('SELECT filename FROM schema_migrations');
  return new Set(res.rows.map(r => r.filename));
}

async function run() {
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
  });

  try {
    await ensureMigrationsTable(pool);
    const applied = await getApplied(pool);
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

    if (files.length === 0) { console.log('No migrations found.'); return; }

    for (const file of files) {
      if (applied.has(file)) { console.log(`skip: ${file}`); continue; }
      console.log(`applying: ${file}`);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`done: ${file}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
    console.log('All migrations applied.');
  } finally {
    await pool.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
