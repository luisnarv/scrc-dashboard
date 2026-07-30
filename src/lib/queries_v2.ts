import { query } from '../app/lib/db';

// Formas de fila que devuelve `pg` en cada consulta. Los agregados (COUNT/SUM)
// llegan como string, por eso el mapeo los envuelve en Number().
interface RawRowV2 {
  Fecha: string | null;
  cedula: string | null;
  Nombre: string | null;
  Tipo_Brigada_Operaciones: string | null;
  Tipo_Brigada_Mes: string | null;
  zona: string | null;
  Visitas: string;
  Efectivas: string;
  Fallidas: string;
  Perdidas: string;
  Fallida_Con_Pago: string;
  Fallida_Sin_Pago: string;
  Ingresos: string;
  Meta_Facturacion: string;
  Perdidas_COP: string;
  Costo_Operativo: string;
  Asignacion: string;
}

interface CostoRowV2 {
  Mes: string | null;
  Zona: string | null;
  Categoria: string | null;
  es_ingreso: boolean | null;
  Valor: string;
}

interface EmpRowV2 {
  Empleado: string | null;
  Valor_Total: string;
  EnBrigadas: boolean | null;
}

// Homologación de tipo de brigada — réplica EXACTA de homologar_brigada_dinamica
// (Prueba_etl_validation.py §3.A). Convierte el nombre crudo de SIPREM
// (tipo_brigada = "SCR PESADA"…) al nombre oficial que usan el dashboard y los
// colores ("Brigada Pesada"…). Regla especial (D) por suspensión "D - DISPONIBLE".
const brigadaHomol = (a: string) => `CASE
    WHEN UPPER(TRIM(${a}.tipo_brigada)) = 'SCR PESADA' AND UPPER(TRIM(COALESCE(${a}.tipo_suspension_solicitada,''))) = 'D - DISPONIBLE' THEN '(D) Brigada Pesada'
    WHEN UPPER(TRIM(${a}.tipo_brigada)) = 'SCR PESADA' THEN 'Brigada Pesada'
    WHEN UPPER(TRIM(${a}.tipo_brigada)) = 'SCR PESADA DISPONIBILIDAD' THEN 'SCR DISPONIBLE'
    WHEN UPPER(TRIM(${a}.tipo_brigada)) = 'SCR MINI CANASTA' THEN 'Brigada Minicanasta'
    WHEN UPPER(TRIM(${a}.tipo_brigada)) = 'SCR LIVIANA' THEN 'Brigada Liviana'
    WHEN UPPER(TRIM(${a}.tipo_brigada)) = 'SCR MULTIFAMILIAR' THEN 'Gestor Integral Multi'
    WHEN UPPER(TRIM(${a}.tipo_brigada)) = 'SCR MEDIDA ESPECIAL' THEN 'Brigada Pesada MT-AT'
    WHEN UPPER(TRIM(${a}.tipo_brigada)) = 'CANASTA' THEN 'Brigada Canasta'
    WHEN ${a}.tipo_brigada IS NULL THEN 'SIN CLASIFICAR'
    ELSE INITCAP(${a}.tipo_brigada)
  END`;

export async function getDashboardDataV2(mes?: string) {
  const params: unknown[] = [];
  const activo = !!(mes && mes !== 'ALL');
  if (activo) params.push(mes);

  const fechaCond = activo ? "WHERE to_char(fecha_cierre, 'YYYY-MM') = $1" : '';
  const mesymCond = activo ? 'WHERE mes_ym = $1' : '';

  try {
    const rawRes = await query(`
      SELECT 
        mo.fecha_cierre::text as "Fecha", 
        mo.id_tecnico as cedula, 
        MAX(mo.tecnico) as "Nombre", 
        MAX(${brigadaHomol('mo')}) as "Tipo_Brigada_Operaciones",
        MAX(${brigadaHomol('mo')}) as "Tipo_Brigada_Mes", 
        MAX(to_char(mo.fecha_cierre, 'YYYY-MM')) as "mes_ym", 
        MAX(mo.zona) as "zona", 
        MAX(mb."Supervisor") as "supervisor",
        SUM(CASE WHEN COALESCE(me."Estado", mo.estado_osf) = 'Efectiva' THEN 1 ELSE 0 END) as "Efectivas",
        SUM(CASE WHEN COALESCE(me."Estado", mo.estado_osf) = 'Fallida' THEN 1 ELSE 0 END) as "Fallidas",
        SUM(CASE WHEN COALESCE(me."Estado", mo.estado_osf) = 'Perdida' THEN 1 ELSE 0 END) as "Perdidas",
        SUM(CASE WHEN COALESCE(me."Estado", mo.estado_osf) = 'Fallida' AND mt."Valor"::numeric > 0 THEN 1 ELSE 0 END) as "Fallida_Con_Pago",
        SUM(CASE WHEN COALESCE(me."Estado", mo.estado_osf) = 'Fallida' AND (mt."Valor"::numeric IS NULL OR mt."Valor"::numeric = 0) THEN 1 ELSE 0 END) as "Fallida_Sin_Pago",
        COUNT(*) as "Visitas",
        
        -- Multiplicador dinámico de tarifa basado en la fecha
        SUM(
          CASE WHEN COALESCE(me."Estado", mo.estado_osf) = 'Efectiva' THEN
            COALESCE(mt."Valor"::numeric, 0) * 
            CASE 
              WHEN mo.fecha_cierre >= '2026-06-01' THEN 1.1300192 
              ELSE 1.1584 
            END
          ELSE 0 END
        ) as "Ingresos",
        
        0 as "Meta_Facturacion", 
        SUM(COALESCE(mt."Valor"::numeric, 0)) as "valor_fact_base", 
        0 as "valor_produccion", 
        0 as "margen_neto",
        -- "Total asignado" = ordenes realmente recibidas = efectivas + fallidas + perdidas
        -- (no la meta; asi refleja el trabajo real y crece si asignan mas).
        (SUM(CASE WHEN COALESCE(me."Estado", mo.estado_osf) = 'Efectiva' THEN 1 ELSE 0 END)
         + SUM(CASE WHEN COALESCE(me."Estado", mo.estado_osf) = 'Fallida' THEN 1 ELSE 0 END)
         + SUM(CASE WHEN COALESCE(me."Estado", mo.estado_osf) = 'Perdida' THEN 1 ELSE 0 END)) as "Asignacion",
        SUM(
          CASE WHEN COALESCE(me."Estado", mo.estado_osf) = 'Perdida' THEN
            COALESCE(mt."Valor"::numeric, 0)
          ELSE 0 END
        ) as "Perdidas_COP", 
        0 as "Costo_Operativo"
      FROM dbanalitica.historico_mo mo
      LEFT JOIN dbanalitica.maestro_brigadas mb 
        ON mo.id_tecnico = mb."Cedula" 
        AND (
          mb."Fecha" IS NULL 
          OR to_char(mo.fecha_cierre, 'YYYY-MM') = mb."Fecha"
        )
      LEFT JOIN (SELECT dbanalitica.fn_normalizar("SUBACCION/SUBANOMALIA") as sub, MAX(estado) as "Estado" FROM dbanalitica.maestro_tarifas GROUP BY 1) me ON dbanalitica.fn_normalizar(mo.subaccion_subanomalia) = me.sub
      LEFT JOIN dbanalitica.maestro_tarifas mt ON 
           mo.zona = mt."ZONA" AND 
           mo.av_resultado = mt."AV/RESULTADO" AND 
           mo.accion = mt."ACCION" AND 
           COALESCE(mb."Tipo Brigada", mo.tipo_brigada) = mt."TIPO BRIGADA" AND
           mo.subaccion_subanomalia = mt."SUBACCION/SUBANOMALIA"
      ${fechaCond ? "WHERE to_char(mo.fecha_cierre, 'YYYY-MM') = $1" : ""}
      GROUP BY mo.fecha_cierre, mo.id_tecnico
    `, params);

    const cosRes = await query(`
      SELECT 
        mes_ym as "Mes", 
        zona as "Zona", 
        cuenta_mayor as "Categoria", 
        es_ingreso, 
        SUM(COALESCE(valor, 0)) as "Valor"
      FROM dbanalitica.historico_otc
      ${mesymCond}
      GROUP BY mes_ym, zona, cuenta_mayor, es_ingreso
    `, params);

    const rawRecords = rawRes.rows.map((r: RawRowV2) => ({
      Fecha: r.Fecha,
      Cedula: r.cedula,
      Nombre: r.Nombre,
      Tipo_Brigada_Operaciones: r.Tipo_Brigada_Operaciones,
      Tipo_Brigada_Mes: r.Tipo_Brigada_Mes,
      Zona: r.zona,
      Visitas: Number(r.Visitas),
      Efectivas: Number(r.Efectivas),
      Fallidas: Number(r.Fallidas),
      Perdidas: Number(r.Perdidas),
      Fallida_Con_Pago: Number(r.Fallida_Con_Pago),
      Fallida_Sin_Pago: Number(r.Fallida_Sin_Pago),
      Ingresos: Number(r.Ingresos),
      Meta_Facturacion: Number(r.Meta_Facturacion),
      Perdidas_COP: Number(r.Perdidas_COP),
      Costo_Operativo: Number(r.Costo_Operativo) || 0,
      Asignacion: Number(r.Asignacion) || 0
    }));

    const costosFinal = cosRes.rows.map((r: CostoRowV2) => ({
      Mes: r.Mes,
      Zona: r.Zona,
      Categoria: r.es_ingreso ? 'INGRESOS ' + r.Categoria : r.Categoria,
      Valor: Number(r.Valor),
      Tercero: ''
    }));

    // Replicando las otras consultas requeridas para la compatibilidad (emps, mesRes, dispRes)
    // Asumiendo que tecnico_mes, costos_empleado y la disponibilidad se mantienen o se derivan igual.
    const empRes = await query(`
      SELECT mes_ym, empleado as "Empleado", valor_total as "Valor_Total", en_brigadas as "EnBrigadas", cedula_brigada as "Cedula"
      FROM dbanalitica.costos_empleado
      ${mesymCond}
    `, params);
    
    const emps = empRes.rows.map((r: EmpRowV2) => ({
      Empleado: r.Empleado,
      Valor_Total: Number(r.Valor_Total),
      EnBrigadas: r.EnBrigadas ? 'SI' : 'NO'
    }));

      const mesRes = await query(`
        SELECT to_char(mo.fecha_cierre, 'YYYY-MM') as "Mes_YM", mo.id_tecnico as "Cedula", MAX(mo.tecnico) as "Tecnico", MAX(mb."Supervisor") as "Supervisor",
               MAX(mo.contrata) as "Contratista", MAX(mo.vehiculo) as "Vehiculo",
               MAX(${brigadaHomol('mo')}) as "Tipo_Brigada_Mes", COUNT(*) as "Ordenes",
               SUM(CASE WHEN COALESCE(me."Estado", mo.estado_osf) = 'Efectiva' THEN 1 ELSE 0 END) as "Efectivas", 
               SUM(CASE WHEN COALESCE(me."Estado", mo.estado_osf) = 'Fallida' THEN 1 ELSE 0 END) as "Fallidas", 
               SUM(CASE WHEN COALESCE(me."Estado", mo.estado_osf) = 'Perdida' THEN 1 ELSE 0 END) as "Perdidas",
               COUNT(*) as "Visitas", 0 as "Ingresos_COP",
               COUNT(DISTINCT mo.nic) as "Cantidad_NIC", 
               -- Conteos por tipo de gestión (réplica de las banderas _EV_* del ETL):
               -- suspensión/mantiene/reconexión/pqr = sobre Efectivas; imposibilidad = Fallida; resistencia = Perdida.
               SUM(CASE WHEN UPPER(mo.subaccion_subanomalia) LIKE '%SUSPENSI%' AND COALESCE(me."Estado", mo.estado_osf) = 'Efectiva' THEN 1 ELSE 0 END) as "Total_Suspension",
               SUM(CASE WHEN UPPER(mo.accion) LIKE '%MANTIENE%' AND COALESCE(me."Estado", mo.estado_osf) = 'Efectiva' THEN 1 ELSE 0 END) as "Total_Mantiene_Susp",
               SUM(CASE WHEN mo.tipo_os = 'TO502' AND COALESCE(me."Estado", mo.estado_osf) = 'Efectiva' THEN 1 ELSE 0 END) as "Total_Reconexion",
               SUM(CASE WHEN UPPER(mo.subaccion_subanomalia) LIKE '%CLIENTE HA CANCELADO%' THEN 1 ELSE 0 END) as "Total_Pagos",
               SUM(CASE WHEN UPPER(mo.accion) LIKE '%IMPOSIBILIDAD TECNICA%' AND COALESCE(me."Estado", mo.estado_osf) = 'Fallida' THEN 1 ELSE 0 END) as "Total_Imposibilidades",
               SUM(CASE WHEN UPPER(mo.accion) LIKE '%RESISTENCIA DEL CLIENTE%' AND COALESCE(me."Estado", mo.estado_osf) = 'Perdida' THEN 1 ELSE 0 END) as "Total_Resistencia",
               SUM(CASE WHEN UPPER(mo.accion) LIKE '%NORMALIZACION PQR%' AND COALESCE(me."Estado", mo.estado_osf) = 'Efectiva' THEN 1 ELSE 0 END) as "Total_PQR",
               COUNT(DISTINCT mo.fecha_cierre) as "Dias_Laborados", 
               (SUM(CASE WHEN COALESCE(me."Estado", mo.estado_osf) = 'Efectiva' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0)) * 100 as "Eficacia"
        FROM dbanalitica.historico_mo mo
        LEFT JOIN dbanalitica.maestro_brigadas mb ON mo.id_tecnico = mb."Cedula" AND (mb."Fecha" IS NULL OR to_char(mo.fecha_cierre, 'YYYY-MM') = mb."Fecha")
        LEFT JOIN (SELECT dbanalitica.fn_normalizar("SUBACCION/SUBANOMALIA") as sub, MAX(estado) as "Estado" FROM dbanalitica.maestro_tarifas GROUP BY 1) me ON dbanalitica.fn_normalizar(mo.subaccion_subanomalia) = me.sub
        ${fechaCond ? "WHERE to_char(mo.fecha_cierre, 'YYYY-MM') = $1" : ""}
        GROUP BY to_char(mo.fecha_cierre, 'YYYY-MM'), mo.id_tecnico
      `, params);

    const dispRes = await query(`
        SELECT mo.fecha_cierre::text as "Fecha",
               ${brigadaHomol('mo')} as "Tipo_Brigada",
               mo.zona as "Zona",
               COUNT(DISTINCT mo.id_tecnico) as "BrigadasActivas"
        FROM dbanalitica.historico_mo mo
        LEFT JOIN dbanalitica.maestro_brigadas mb ON mo.id_tecnico = mb."Cedula" AND (mb."Fecha" IS NULL OR to_char(mo.fecha_cierre, 'YYYY-MM') = mb."Fecha")
        ${fechaCond ? "WHERE to_char(mo.fecha_cierre, 'YYYY-MM') = $1" : ""}
        GROUP BY mo.fecha_cierre, ${brigadaHomol('mo')}, mo.zona
        ORDER BY mo.fecha_cierre, ${brigadaHomol('mo')}
      `, params);

    return {
      mes: mes || 'ALL',
      rawRecords,
      costos: costosFinal,
      emps,
      mesRecords: mesRes.rows,
      dispDiaria: dispRes.rows
    };
  } catch (error) {
    console.error('DB Error en V2:', error);
    throw error;
  }
}

export async function getMapDataV2(mes?: string, zona?: string) {
  const filterClauses: string[] = [];
  const values: unknown[] = [];

  if (mes && mes !== 'ALL') {
    const meses = mes.split(',');
    const monthClauses = meses.map(m => {
      values.push(`${m}-01`);
      const i1 = values.length;
      values.push(`${m}-01`);
      const i2 = values.length;
      return `(fecha_cierre >= $${i1}::date AND fecha_cierre < $${i2}::date + interval '1 month')`;
    });
    filterClauses.push(`(${monthClauses.join(' OR ')})`);
  }
  if (zona && zona !== 'ALL') {
    values.push(`%${zona}%`);
    filterClauses.push(`zona ILIKE $${values.length}`);
  }

  const andFilters = filterClauses.length ? 'AND ' + filterClauses.join(' AND ') : '';
  const whereFilters = filterClauses.length ? 'WHERE ' + filterClauses.join(' AND ') : '';

  try {
    const statsQuery = `
      SELECT
        municipio,
        split_part(localidad_barrio, '/', 2) as barrio,
        COUNT(*) as total,
        SUM(CASE WHEN COALESCE(me."Estado", mo.estado_osf) = 'Efectiva' THEN 1 ELSE 0 END) as efectivas,
        SUM(CASE WHEN COALESCE(me."Estado", mo.estado_osf) = 'Fallida' THEN 1 ELSE 0 END) as fallidas,
        SUM(CASE WHEN COALESCE(me."Estado", mo.estado_osf) = 'Perdida' THEN 1 ELSE 0 END) as perdidas
      FROM dbanalitica.historico_mo mo
      LEFT JOIN (SELECT dbanalitica.fn_normalizar("SUBACCION/SUBANOMALIA") as sub, MAX(estado) as "Estado" FROM dbanalitica.maestro_tarifas GROUP BY 1) me ON dbanalitica.fn_normalizar(mo.subaccion_subanomalia) = me.sub
      WHERE mo.localidad_barrio IS NOT NULL ${andFilters}
      GROUP BY municipio, split_part(localidad_barrio, '/', 2)
    `;
    const statsRes = await query(statsQuery, values);

    const ptsQuery = `
      SELECT
        nic,
        TRIM(split_part(gps, ',', 1)) as la,
        TRIM(split_part(gps, ',', 2)) as lo,
        accion as ac,
        subaccion_subanomalia as su,
        tecnico as te,
        municipio as mu,
        split_part(localidad_barrio, '/', 2) as ba,
        zona as zo,
        COALESCE(me."Estado", mo.estado_osf) as es,
        tipo_os as "to",
        fecha_cierre::text as fe
      FROM dbanalitica.historico_mo mo
      LEFT JOIN (SELECT dbanalitica.fn_normalizar("SUBACCION/SUBANOMALIA") as sub, MAX(estado) as "Estado" FROM dbanalitica.maestro_tarifas GROUP BY 1) me ON dbanalitica.fn_normalizar(mo.subaccion_subanomalia) = me.sub
      ${whereFilters}
      ORDER BY fecha_cierre DESC NULLS LAST
      LIMIT 25000
    `;
    const ptsRes = await query(ptsQuery, values);

    const listsQuery = `
      SELECT
        array_agg(DISTINCT tecnico) FILTER (WHERE tecnico IS NOT NULL) as tecnicos,
        array_agg(DISTINCT accion) FILTER (WHERE accion IS NOT NULL) as acciones,
        array_agg(DISTINCT subaccion_subanomalia) FILTER (WHERE subaccion_subanomalia IS NOT NULL) as subacciones,
        array_agg(DISTINCT estado_osf) FILTER (WHERE estado_osf IS NOT NULL) as estados,
        array_agg(DISTINCT municipio) FILTER (WHERE municipio IS NOT NULL) as municipios,
        array_agg(DISTINCT split_part(localidad_barrio, '/', 2)) FILTER (WHERE localidad_barrio IS NOT NULL) as barrios,
        array_agg(DISTINCT zona) FILTER (WHERE zona IS NOT NULL) as zonas
      FROM dbanalitica.historico_mo
      ${whereFilters}
    `;
    const listsRes = await query(listsQuery, values);

    return {
      pts: ptsRes.rows,
      stats_barrios: statsRes.rows,
      filtros: listsRes.rows[0]
    };
  } catch (err) {
    console.error('Error fetching map data V2:', err);
    throw err;
  }
}

export async function getMonthsDataV2() {
  try {
    const monthsRes = await query(`
      SELECT to_char(fecha_cierre, 'YYYY-MM') as "mes",
             COUNT(*)::int as "count",
             MAX(fecha_carga)::text as "version"
      FROM dbanalitica.historico_mo
      WHERE fecha_cierre IS NOT NULL
      GROUP BY to_char(fecha_cierre, 'YYYY-MM')
      ORDER BY 1
    `);

    const evolutivoRes = await query(`
      SELECT 
        to_char(fecha_cierre, 'YYYY-MM') as "Mes",
        ${brigadaHomol('mo')} as "TipoBrigada",
        COUNT(DISTINCT nic) as "Cantidad_NIC",
        COUNT(*) as "Total_Ordenes", 
        SUM(CASE WHEN UPPER(mo.subaccion_subanomalia) LIKE '%SUSPENSI%' AND COALESCE(me."Estado", mo.estado_osf) = 'Efectiva' THEN 1 ELSE 0 END) as "Total_Suspension",
        SUM(CASE WHEN UPPER(mo.accion) LIKE '%MANTIENE%' AND COALESCE(me."Estado", mo.estado_osf) = 'Efectiva' THEN 1 ELSE 0 END) as "Total_Mantiene_Susp",
        SUM(CASE WHEN mo.tipo_os = 'TO502' AND COALESCE(me."Estado", mo.estado_osf) = 'Efectiva' THEN 1 ELSE 0 END) as "Total_Reconexion",
        SUM(CASE WHEN UPPER(mo.subaccion_subanomalia) LIKE '%CLIENTE HA CANCELADO%' THEN 1 ELSE 0 END) as "Total_Pagos",
        SUM(CASE WHEN UPPER(mo.accion) LIKE '%IMPOSIBILIDAD TECNICA%' AND COALESCE(me."Estado", mo.estado_osf) = 'Fallida' THEN 1 ELSE 0 END) as "Total_Imposibilidades",
        SUM(CASE WHEN UPPER(mo.accion) LIKE '%RESISTENCIA DEL CLIENTE%' AND COALESCE(me."Estado", mo.estado_osf) = 'Perdida' THEN 1 ELSE 0 END) as "Total_Resistencia",
        SUM(CASE WHEN UPPER(mo.accion) LIKE '%NORMALIZACION PQR%' AND COALESCE(me."Estado", mo.estado_osf) = 'Efectiva' THEN 1 ELSE 0 END) as "Total_PQR",
        (SUM(CASE WHEN COALESCE(me."Estado", mo.estado_osf) = 'Efectiva' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0)) * 100 as "Eficacia"
      FROM dbanalitica.historico_mo mo
      LEFT JOIN (SELECT dbanalitica.fn_normalizar("SUBACCION/SUBANOMALIA") as sub, MAX(estado) as "Estado" FROM dbanalitica.maestro_tarifas GROUP BY 1) me ON dbanalitica.fn_normalizar(mo.subaccion_subanomalia) = me.sub
      GROUP BY to_char(mo.fecha_cierre, 'YYYY-MM'), ${brigadaHomol('mo')}
    `);

    return {
      months: monthsRes.rows,
      evolutivo: evolutivoRes.rows,
    };
  } catch (err) {
    console.error('Error fetching months data V2:', err);
    throw err;
  }
}

// Órdenes COMPLETAS de un barrio (o de los barrios homologados) dentro de la
// ventana mes/zona. V2: lee historico_mo, parte gps -> la/lo y localidad_barrio
// -> barrio, y cruza con maestro_estados para el estado OFICIAL (por subacción).
//   getBarrioDataV2('2026-07', 'ALL', 'SANTA HELENA||EL RECREO')
export async function getBarrioDataV2(mes?: string, zona?: string, barriosParam?: string): Promise<{ rows: unknown[] }> {
  const lista = (barriosParam || '').split('||').map(s => s.trim()).filter(Boolean);
  if (!lista.length) return { rows: [] };

  const where: string[] = [];
  const values: unknown[] = [];

  if (mes && mes !== 'ALL') {
    const monthClauses = mes.split(',').map(m => {
      values.push(`${m}-01`); const i1 = values.length;
      values.push(`${m}-01`); const i2 = values.length;
      return `(h.fecha_cierre >= $${i1}::date AND h.fecha_cierre < $${i2}::date + interval '1 month')`;
    });
    where.push(`(${monthClauses.join(' OR ')})`);
  }
  if (zona && zona !== 'ALL') {
    values.push(`%${zona}%`);
    where.push(`h.zona ILIKE $${values.length}`);
  }
  values.push(lista);
  where.push(`split_part(h.localidad_barrio, '/', 2) = ANY($${values.length}::text[])`);
  const res = await query(`
    SELECT
      h.nic                                    as "nic",
      TRIM(split_part(h.gps, ',', 1))          as "la",
      TRIM(split_part(h.gps, ',', 2))          as "lo",
      h.accion                                 as "ac",
      h.subaccion_subanomalia                  as "su",
      h.tecnico                                as "te",
      h.municipio                              as "mu",
      split_part(h.localidad_barrio, '/', 2)   as "ba",
      h.zona                                   as "zo",
      COALESCE(me."Estado", h.estado_osf)      as "es",
      h.tipo_os                                as "to",
      h.fecha_cierre::text                     as "fe"
    FROM dbanalitica.historico_mo h
    LEFT JOIN (SELECT dbanalitica.fn_normalizar("SUBACCION/SUBANOMALIA") as sub, MAX(estado) as "Estado" FROM dbanalitica.maestro_tarifas GROUP BY 1) me
        ON dbanalitica.fn_normalizar(h.subaccion_subanomalia) = me.sub
    WHERE ${where.join(' AND ')}
    ORDER BY h.fecha_cierre DESC NULLS LAST
    LIMIT 20000
  `, values);
  return { rows: res.rows };
}

// Observaciones BAJO DEMANDA (popup de NIC o de barrio). V2: igual que arriba pero
// solo filas con observación, priorizando las 'Fallida'. LIMIT 40.
//   getObsDataV2('2026-07', '123456')            -> por NIC
//   getObsDataV2('2026-07', undefined, 'A||B')   -> por barrios
export async function getObsDataV2(mes?: string, nic?: string, barriosParam?: string): Promise<{ rows: unknown[] }> {
  const where: string[] = ["h.observacion IS NOT NULL", "h.observacion <> ''"];
  const values: unknown[] = [];

  if (mes && mes !== 'ALL') {
    const monthClauses = mes.split(',').map(m => {
      values.push(`${m}-01`); const i1 = values.length;
      values.push(`${m}-01`); const i2 = values.length;
      return `(h.fecha_cierre >= $${i1}::date AND h.fecha_cierre < $${i2}::date + interval '1 month')`;
    });
    where.push(`(${monthClauses.join(' OR ')})`);
  }

  if (nic) {
    values.push(nic);
    where.push(`h.nic = $${values.length}`);
  } else {
    const lista = (barriosParam || '').split('||').map(s => s.trim()).filter(Boolean);
    if (!lista.length) return { rows: [] };
    values.push(lista);
    where.push(`split_part(h.localidad_barrio, '/', 2) = ANY($${values.length}::text[])`);
  }

  const res = await query(`
    SELECT
      h.fecha_cierre::text                as "fe",
      h.nic                               as "nic",
      COALESCE(me."Estado", h.estado_osf) as "es",
      h.subaccion_subanomalia             as "su",
      h.observacion                       as "ob"
    FROM dbanalitica.historico_mo h
    LEFT JOIN (SELECT dbanalitica.fn_normalizar("SUBACCION/SUBANOMALIA") as sub, MAX(estado) as "Estado" FROM dbanalitica.maestro_tarifas GROUP BY 1) me
        ON dbanalitica.fn_normalizar(h.subaccion_subanomalia) = me.sub
    WHERE ${where.join(' AND ')}
    ORDER BY (COALESCE(me."Estado", h.estado_osf) = 'Fallida') DESC, h.fecha_cierre DESC
    LIMIT 40
  `, values);
  return { rows: res.rows };
}


