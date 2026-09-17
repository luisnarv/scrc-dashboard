const { Pool } = require('pg');
let connStr = process.env.POSTGRES_URL || '';
if (connStr.includes('1q?YLKduq3r5')) connStr = connStr.replace('1q?YLKduq3r5', '1q%3FYLKduq3r5');
if (connStr.endsWith('?')) connStr = connStr.slice(0, -1);
const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

async function run() {
  const res = await pool.query(`
    SELECT 
      mo.fecha_cierre::text as fecha,
      mo.id_tecnico,
      mo.tecnico,
      mo.brigada_homologada,
      mo.estado_norm,
      mo.accion,
      mo.subaccion_homologada,
      mo.observacion
    FROM dbanalitica.historico_mo mo
    WHERE (UPPER(mo.tecnico) LIKE '%EDINSON%FONTALVO%')
      AND mo.fecha_cierre::text LIKE '2026-09-16%'
  `);
  console.log('Filas del 16:', JSON.stringify(res.rows, null, 2));
  pool.end();
}
run().catch(e => { console.error(e); pool.end(); });
