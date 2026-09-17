const { Pool } = require('pg');
let connStr = process.env.POSTGRES_URL || '';
if (connStr.includes('1q?YLKduq3r5')) connStr = connStr.replace('1q?YLKduq3r5', '1q%3FYLKduq3r5');
if (connStr.endsWith('?')) connStr = connStr.slice(0, -1);
const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

async function checkMonths() {
  const fetch = (await import('node-fetch')).default || global.fetch;
  // Test direct query
  console.log('Testing Postgres connection...');
  const r = await pool.query('SELECT 1 as test');
  console.log('Postgres OK:', r.rows);
  pool.end();
}

checkMonths().catch(e => { console.error(e); pool.end(); });
