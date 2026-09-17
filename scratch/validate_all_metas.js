const { Pool } = require('pg');
let connStr = process.env.POSTGRES_URL || '';
if (connStr.includes('1q?YLKduq3r5')) connStr = connStr.replace('1q?YLKduq3r5', '1q%3FYLKduq3r5');
if (connStr.endsWith('?')) connStr = connStr.slice(0, -1);
const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

async function validateMetas() {
  const sql = `
    SELECT 
      CASE WHEN UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%' THEN 'SUR' ELSE 'NORTE-CENTRO' END as zona_agrupada,
      mo.brigada_homologada,
      to_char(mo.fecha_cierre, 'Day') as dia_semana,
      EXTRACT(DOW FROM mo.fecha_cierre) as dow,
      COUNT(DISTINCT mo.fecha_cierre) as dias_muestreados,
      ROUND(AVG(
        CASE
          -- ZONA SUR
          WHEN UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%' AND mo.brigada_homologada = 'Brigada Pesada'
            THEN (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 425000 ELSE 650000 END)
          WHEN UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%' AND mo.brigada_homologada = 'Brigada Liviana'
            THEN (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 310000 ELSE 380000 END)
          WHEN UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%' AND mo.brigada_homologada = 'Brigada Canasta' THEN 3026324.43
          WHEN UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%' AND mo.brigada_homologada = 'Brigada Minicanasta' THEN 2362400.95
          WHEN UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%' AND mo.brigada_homologada = 'Brigada Pesada MT-AT' THEN 1028061.19
          WHEN UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%' AND mo.brigada_homologada = 'Pesada Disponible' THEN 1028061.19
          WHEN UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%' AND mo.brigada_homologada = 'Gestor Integral Multi' THEN 357349.97

          -- ZONA NORTE-CENTRO (Desde Septiembre 2026 - Jornada 44h)
          WHEN mo.fecha_cierre >= '2026-09-01' THEN
            CASE mo.brigada_homologada
              WHEN 'Brigada Liviana' THEN
                (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 175679.27
                      WHEN EXTRACT(DOW FROM mo.fecha_cierre)=5 THEN 245950.97
                      ELSE 281086.83 END)
              WHEN 'Brigada Pesada' THEN
                (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 433723.21
                      WHEN EXTRACT(DOW FROM mo.fecha_cierre)=5 THEN 607212.49
                      ELSE 693957.14 END)
              WHEN '(D) Brigada Pesada' THEN
                (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 433723.21
                      WHEN EXTRACT(DOW FROM mo.fecha_cierre)=5 THEN 607212.49
                      ELSE 693957.14 END)
              WHEN 'Gestor Integral Multi' THEN 357349.97
              WHEN 'Brigada Minicanasta' THEN 2362400.95
              WHEN 'Brigada Pesada MT-AT' THEN 1028061.19
              WHEN 'Pesada Disponible' THEN
                (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=0 THEN 1387882.61 ELSE 1028061.19 END)
              WHEN 'Brigada Canasta' THEN 3026324.43
              ELSE 0
            END
          ELSE 0
        END
      )) as meta_diaria_calculada
    FROM dbanalitica.historico_mo mo
    WHERE mo.fecha_cierre >= '2026-09-01' AND mo.fecha_cierre < '2026-10-01'
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 2, 4
  `;

  const res = await pool.query(sql);
  console.table(res.rows);
  pool.end();
}

validateMetas().catch(e => { console.error(e); pool.end(); });
