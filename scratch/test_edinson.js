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
      mo.zona,
      mo.estado_norm,
      mo.accion,
      mo.subaccion_homologada,
      mo.valor_orden
    FROM dbanalitica.historico_mo mo
    WHERE (UPPER(mo.tecnico) LIKE '%EDINSON%FONTALVO%' OR UPPER(mo.tecnico) LIKE '%FONTALVO%VIZCAINO%')
      AND EXTRACT(DAY FROM mo.fecha_cierre) = 16
    ORDER BY mo.fecha_cierre DESC
    LIMIT 50
  `);
  console.log('Resultados:', JSON.stringify(res.rows, null, 2));

  // Also query what queries_v2 returns for this technician on that date
  const resAgg = await pool.query(`
    SELECT 
      mo.fecha_cierre::text as "Fecha",
      mo.id_tecnico,
      MAX(mo.tecnico) as "Nombre",
      MAX(mo.brigada_homologada) as "Tipo_Brigada_Operaciones",
      MAX(mo.zona) as "zona",
      COUNT(*) as "Visitas",
      SUM(CASE WHEN mo.estado_norm = 'Efectiva' THEN 1 ELSE 0 END) as "Efectivas",
      SUM(CASE WHEN mo.estado_norm = 'Fallida' AND COALESCE(mo.valor_orden,0) > 0 THEN 1 ELSE 0 END) as "Fallida_Con_Pago",
      SUM(CASE WHEN mo.estado_norm = 'Fallida' AND COALESCE(mo.valor_orden,0) = 0 THEN 1 ELSE 0 END) as "Fallida_Sin_Pago",
      SUM(CASE WHEN mo.estado_norm = 'Perdida' THEN 1 ELSE 0 END) as "Perdidas",
      SUM(CASE WHEN COALESCE(mo.accion,'') <> 'SIN GESTION' THEN 1 ELSE 0 END) as "Gestionadas",
      MAX(COALESCE(mm.costo, 0)) as "Costo_Mensual_mm",
      (CASE
        WHEN MAX(mo.brigada_homologada) IN ('Brigada Pesada MT-AT','Brigada Minicanasta','Brigada Canasta')
          THEN MAX(COALESCE(mm.costo,0)/24.0) * LEAST(1.0, SUM(CASE WHEN COALESCE(mo.accion,'') <> 'SIN GESTION' THEN 1 ELSE 0 END)::numeric / (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 8 ELSE 11 END)) * 1.1300192
        ELSE 0
      END) as "Ingresos_queries_v2"
    FROM dbanalitica.historico_mo mo
    LEFT JOIN (
      SELECT (CASE "Tipo_Brigada"
                WHEN 'Brigada Tipo Pesada'      THEN 'Brigada Pesada'
                WHEN '(D) Brigada Tipo Pesada'  THEN '(D) Brigada Pesada'
                WHEN 'Brigada Tipo Liviana'     THEN 'Brigada Liviana'
                WHEN 'Brigada Pesada/ MT AT'    THEN 'Brigada Pesada MT-AT'
                WHEN 'Brigada Tipo Minicanasta' THEN 'Brigada Minicanasta'
                WHEN 'Brigada Tipo Canasta'     THEN 'Brigada Canasta'
                ELSE "Tipo_Brigada" END) AS brig,
             MAX("Costo"::numeric) AS costo
      FROM dbanalitica.maestro_metas
      GROUP BY 1
    ) mm ON mm.brig = mo.brigada_homologada
    WHERE (UPPER(mo.tecnico) LIKE '%EDINSON%FONTALVO%' OR UPPER(mo.tecnico) LIKE '%FONTALVO%VIZCAINO%')
      AND EXTRACT(DAY FROM mo.fecha_cierre) = 16
    GROUP BY mo.fecha_cierre, mo.id_tecnico, mo.brigada_homologada
    ORDER BY mo.fecha_cierre DESC
  `);
  console.log('Agregado queries_v2:', JSON.stringify(resAgg.rows, null, 2));

  pool.end();
}
run().catch(e => { console.error(e); pool.end(); });
