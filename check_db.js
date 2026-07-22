const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');

let url = '';
envFile.split('\n').forEach(line => {
  if (line.trim().startsWith('POSTGRES_URL=')) {
    url = line.split('=')[1].trim().replace(/['"]/g, '');
  }
});

console.log('Testing connection to:', url ? url.replace(/:[^:@]+@/, ':***@') : 'UNDEFINED');

const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false }
});

async function test() {
  try {
    const res = await pool.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
    `);
    console.log('Tablas encontradas en la BD:');
    res.rows.forEach(r => console.log(` - ${r.table_schema}.${r.table_name}`));
  } catch (err) {
    console.error('Error conectando a BD:', err.message);
  } finally {
    await pool.end();
  }
}
test();