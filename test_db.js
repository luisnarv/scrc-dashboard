const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.chpgdjwmpeygylqlgmgh:Scr1043122351*@aws-0-ca-central-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function test() {
  try {
    console.time('Query Time');
    const res = await pool.query(`
      SELECT fecha::text, cedula, tipo_brigada as "Tipo_Brigada_Operaciones", mes_ym, zona, supervisor,
             efectivas as "Efectivas", visitas as "Visitas", valor_produccion as "Ingresos", 
             meta_dia as "Meta_Facturacion", valor_fact_base, fact_ajustada, margen_neto,
             (SELECT SUM(valor) FROM scr.costos_otc WHERE es_ingreso = false AND mes_ym = scr.tecnico_dia.mes_ym) as "Costo_Operativo",
             0 as "Asignacion"
      FROM scr.tecnico_dia
    `);
    console.timeEnd('Query Time');
    console.log('Filas obtenidas:', res.rows.length);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    pool.end();
  }
}

test();
