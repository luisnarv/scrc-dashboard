const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.chpgdjwmpeygylqlgmgh:Scr1043122351*@aws-0-ca-central-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const res = await pool.query('SELECT COUNT(*) FROM scr.costos_otc');
    console.log(`Total de registros en scr.costos_otc: ${res.rows[0].count}`);
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
