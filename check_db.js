const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.chpgdjwmpeygylqlgmgh:Scr1043122351*@aws-0-ca-central-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const resRaw = await pool.query("SELECT COUNT(*) FROM scr.tecnico_dia WHERE mes_ym = '2026-06'");
    console.log('Count 2026-06:', resRaw.rows);

    const resRaw2 = await pool.query("SELECT * FROM scr.tecnico_dia WHERE mes_ym = '2026-06' LIMIT 1");
    console.log('Sample 2026-06:', resRaw2.rows);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
