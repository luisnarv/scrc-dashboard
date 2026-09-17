const { Pool } = require('pg');
let connStr = process.env.POSTGRES_URL || '';
if (connStr.includes('1q?YLKduq3r5')) connStr = connStr.replace('1q?YLKduq3r5', '1q%3FYLKduq3r5');
if (connStr.endsWith('?')) connStr = connStr.slice(0, -1);
const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

const META_SUR = {
  pesada:  { semana: 650_000, sabado: 425_000 },
  liviana: { semana: 380_000, sabado: 310_000 },
};

const COSTO_MENSUAL_SQL = `(CASE 
  WHEN mo.fecha_cierre >= '2026-06-01' THEN
    CASE mo.brigada_homologada
      WHEN 'Brigada Liviana'         THEN 6183910.20
      WHEN 'Gestor Integral Multi'   THEN 8576399.37
      WHEN 'Brigada Minicanasta'     THEN 56697622.89
      WHEN 'Brigada Pesada'          THEN 15267057.00
      WHEN '(D) Brigada Pesada'      THEN 15267057.00
      WHEN 'Brigada Pesada MT-AT'    THEN 24673468.63
      WHEN 'Pesada Disponible'       THEN 24673468.63
      WHEN 'Brigada Canasta'         THEN 72631786.33
      ELSE COALESCE(mm.costo, 0)
    END
  ELSE COALESCE(mm.costo, 0)
END)`;

const META_DIARIA_SQL = `MAX(CASE
          WHEN UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%' AND mo.brigada_homologada = 'Brigada Pesada'
            THEN (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN ${META_SUR.pesada.sabado} ELSE ${META_SUR.pesada.semana} END)
          WHEN UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%' AND mo.brigada_homologada = 'Brigada Liviana'
            THEN (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN ${META_SUR.liviana.sabado} ELSE ${META_SUR.liviana.semana} END)
          WHEN UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%' THEN
            ${COSTO_MENSUAL_SQL} / 24.0
          WHEN mo.fecha_cierre >= '2026-09-01' AND UPPER(COALESCE(mo.zona,'')) NOT LIKE '%SUR%' THEN
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
              ELSE ${COSTO_MENSUAL_SQL} / 24.0
            END
          WHEN mo.brigada_homologada IN ('Brigada Pesada','(D) Brigada Pesada','Brigada Liviana')
            THEN (${COSTO_MENSUAL_SQL} / 184.0) * (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 6 ELSE 8 END)
          ELSE ${COSTO_MENSUAL_SQL} / 24.0
        END)`;

const SQL_CLEAN_MO_ID = "REGEXP_REPLACE(REGEXP_REPLACE(TRIM(mo.id_tecnico), '\\.0+$', ''), '\\D', '', 'g')";
const SQL_CLEAN_MB_CED = "REGEXP_REPLACE(REGEXP_REPLACE(TRIM(mb.\"Cedula\"), '\\.0+$', ''), '\\D', '', 'g')";

async function testQuery() {
  const sql = `
      SELECT 
        mo.fecha_cierre::text as "Fecha", 
        ${SQL_CLEAN_MO_ID} as cedula, 
        MAX(mo.tecnico) as "Nombre", 
        MAX(mo.brigada_homologada) as "Tipo_Brigada_Operaciones",
        MAX(mo.brigada_homologada) as "Tipo_Brigada_Mes",
        MAX(to_char(mo.fecha_cierre, 'YYYY-MM')) as "mes_ym",
        MAX(mo.zona) as "zona",
        MAX(mb."Supervisor") as "supervisor",
        SUM(CASE WHEN mo.estado_norm = 'Efectiva' THEN 1 ELSE 0 END) as "Efectivas",
        SUM(CASE WHEN mo.estado_norm = 'Fallida' THEN 1 ELSE 0 END) as "Fallidas",
        SUM(CASE WHEN mo.estado_norm = 'Perdida' THEN 1 ELSE 0 END) as "Perdidas",
        SUM(CASE WHEN mo.estado_norm = 'Fallida' AND COALESCE(mo.valor_orden,0) > 0 THEN 1 ELSE 0 END) as "Fallida_Con_Pago",
        SUM(CASE WHEN mo.estado_norm = 'Fallida' AND COALESCE(mo.valor_orden,0) = 0 THEN 1 ELSE 0 END) as "Fallida_Sin_Pago",
        COUNT(*) as "Visitas",

        (CASE
          WHEN MAX(mo.brigada_homologada) = 'Pesada Disponible'
            THEN MAX(${COSTO_MENSUAL_SQL}/24.0 * (CASE WHEN UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%' THEN 1.0 ELSE 1.1300192 END))
          WHEN MAX(mo.brigada_homologada) IN ('Brigada Pesada MT-AT','Brigada Minicanasta','Brigada Canasta')
            THEN MAX(${COSTO_MENSUAL_SQL}/24.0 * (CASE WHEN UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%' THEN 1.0 ELSE 1.1300192 END)) * LEAST(1.0, SUM(CASE WHEN COALESCE(mo.accion,'') <> 'SIN GESTION' THEN 1 ELSE 0 END)::numeric / (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 8 ELSE 11 END))
          WHEN MAX(mo.brigada_homologada) = 'Gestor Integral Multi'
            THEN MAX(${COSTO_MENSUAL_SQL}/24.0 * (CASE WHEN UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%' THEN 1.0 ELSE 1.1300192 END)) * LEAST(1.0, (
              SUM(CASE WHEN mo.estado_norm='Efectiva' THEN 1 ELSE 0 END) 
              + SUM(CASE WHEN UPPER(mo.subaccion_homologada) LIKE '%CLIENTE HA CANCELADO%' THEN 1 ELSE 0 END)
            )::numeric / (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 13 ELSE 18 END))
          ELSE SUM(
            CASE 
              WHEN mo.brigada_homologada IN ('Brigada Pesada', '(D) Brigada Pesada') AND (
                UPPER(COALESCE(mo.subaccion_subanomalia,'')) LIKE '%CANASTA%' 
                OR UPPER(COALESCE(mo.subaccion_subanomalia,'')) LIKE '%OTRAS TECNOLOG%'
                OR UPPER(COALESCE(mo.subaccion_subanomalia,'')) LIKE '%MEDIA TENSI%'
              ) THEN 0
              WHEN (mo.estado_norm = 'Efectiva' OR (mo.estado_norm = 'Fallida' AND COALESCE(mo.valor_orden,0) > 0))
                AND UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%'
                THEN COALESCE(mo.valor_orden,0)
              WHEN mo.estado_norm = 'Efectiva' OR (mo.estado_norm = 'Fallida' AND COALESCE(mo.valor_orden,0) > 0)
                THEN COALESCE(mo.valor_orden,0) * 1.1300192
              ELSE 0
            END
          )
        END) as "Ingresos",

        (CASE
          WHEN MAX(mo.brigada_homologada) = 'Pesada Disponible'
            THEN MAX(${COSTO_MENSUAL_SQL}/24.0)
          WHEN MAX(mo.brigada_homologada) IN ('Brigada Pesada MT-AT','Brigada Minicanasta','Brigada Canasta')
            THEN MAX(${COSTO_MENSUAL_SQL}/24.0) * LEAST(1.0, SUM(CASE WHEN COALESCE(mo.accion,'') <> 'SIN GESTION' THEN 1 ELSE 0 END)::numeric / (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 8 ELSE 11 END))
          WHEN MAX(mo.brigada_homologada) = 'Gestor Integral Multi'
            THEN MAX(${COSTO_MENSUAL_SQL}/24.0) * LEAST(1.0, (
              SUM(CASE WHEN mo.estado_norm='Efectiva' THEN 1 ELSE 0 END) 
              + SUM(CASE WHEN UPPER(mo.subaccion_homologada) LIKE '%CLIENTE HA CANCELADO%' THEN 1 ELSE 0 END)
            )::numeric / (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 13 ELSE 18 END))
          ELSE SUM(
            CASE 
              WHEN mo.brigada_homologada IN ('Brigada Pesada', '(D) Brigada Pesada') AND (
                UPPER(COALESCE(mo.subaccion_subanomalia,'')) LIKE '%CANASTA%' 
                OR UPPER(COALESCE(mo.subaccion_subanomalia,'')) LIKE '%OTRAS TECNOLOG%'
                OR UPPER(COALESCE(mo.subaccion_subanomalia,'')) LIKE '%MEDIA TENSI%'
              ) THEN 0
              WHEN mo.estado_norm = 'Efectiva' OR (mo.estado_norm = 'Fallida' AND COALESCE(mo.valor_orden,0) > 0) 
                THEN COALESCE(mo.valor_orden,0) 
              ELSE 0 
            END
          )
        END) as "Ingresos_Base",

        ${META_DIARIA_SQL} as "Meta_Facturacion",
        SUM(COALESCE(mo.valor_orden,0)) as "valor_fact_base",
        0 as "valor_produccion",
        0 as "margen_neto",
        (SUM(CASE WHEN mo.estado_norm = 'Efectiva' THEN 1 ELSE 0 END)
         + SUM(CASE WHEN mo.estado_norm = 'Fallida' THEN 1 ELSE 0 END)
         + SUM(CASE WHEN mo.estado_norm = 'Perdida' THEN 1 ELSE 0 END)) as "Asignacion",
        SUM(CASE WHEN mo.estado_norm = 'Perdida' THEN COALESCE(mo.valor_orden,0) ELSE 0 END) as "Perdidas_COP",
        0 as "Costo_Operativo"
      FROM dbanalitica.historico_mo mo
      LEFT JOIN dbanalitica.maestro_brigadas mb
        ON ${SQL_CLEAN_MO_ID} = ${SQL_CLEAN_MB_CED}
        AND (
          mb."Fecha" IS NULL
          OR to_char(mo.fecha_cierre, 'YYYY-MM') = left(mb."Fecha"::text, 7)
        )
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
      WHERE mo.fecha_cierre >= '2026-09-01' AND mo.fecha_cierre < '2026-10-01'
      GROUP BY mo.fecha_cierre, ${SQL_CLEAN_MO_ID}, mo.brigada_homologada
      LIMIT 10
  `;

  try {
    const res = await pool.query(sql);
    console.log('Query exitoso! Filas:', res.rows.length);
  } catch (err) {
    console.error('Error en SQL:', err.message);
  } finally {
    pool.end();
  }
}

testQuery();
