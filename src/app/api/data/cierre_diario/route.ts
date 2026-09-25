import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// Endpoint de Cierre Diario: "Ejecutada"/"Cancelada"
// se toman del resultado real registrado en mano de obra (dbanalitica.historico_mo), usando `estado_norm` como fuente de
// verdad de qué se cerró (Efectiva/Fallida/Perdida/Sin Clasificar -- "Sin Clasificar" son cierres
// hechos antes de la asignación formal, ej. accion='SIN GESTION', pero siguen siendo cierres
// reales) y `valor_orden` para separar Ejecutada de Cancelada:
//   - Ejecutada  = Efectiva o Fallida (siempre valor_orden > 0)
//   - Cancelada  = Perdida o Sin Clasificar (siempre valor_orden = 0)
// Validado contra un total real conocido (CENTRO, septiembre: Efectiva 6.434 + Fallida 2.881 +
// Perdida 751 ≈ 10.064 -- ese número específico corresponde al gráfico mensual, que además excluye
// Sin Clasificar por representar cierres previos a la asignación, ver sqlMesBarrios más abajo).
//
// El cruce es por número de orden (mo.orden = v.orden). Se validó que no hay problema de formato
// (ambas columnas son text limpio, sin espacios/ceros) -- el 100% de las órdenes que NO cruzan son
// Reconexión (TO502) que el sistema origen ya marca "Ejecutada"/"Cerrada" y por eso salen de
// analitica.v_ordenes_dia (esa vista representa la cola operativa vigente, no el historial
// cerrado). Como esas órdenes sí existen en historico_mo con todos sus datos, se agregan aparte
// vía UNION ALL, reconstruyendo la fila desde historico_mo en vez de perderlas.
//
// Todo esto se resuelve una sola vez en el CTE `v_ord`, que reemplaza a `analitica.v_ordenes_dia`
// en el resto de consultas, para que TODAS las secciones (KPIs, Metas, Ranking, Horas, Resumen,
// Detalle) queden consistentes.
const MO_CERRADA_HOY_WHERE = `fecha_cierre = CURRENT_DATE
          AND estado_norm IN ('Efectiva', 'Fallida', 'Perdida', 'Sin Clasificar')`;

// Depuración de "Pendiente": v_ordenes_dia puede mostrar una orden como Pendiente por un desfase
// de sincronización, aunque mano de obra YA la haya tocado en algún momento del mes (con
// cualquier resultado, no solo los cerrados hoy). Si tiene cualquier registro en historico_mo
// este mes, ya no cuenta como "nunca tocada" -- se reclasifica como Asignada (alguien la trabajó).
// Rango (no DATE_TRUNC sobre la columna): permite usar el índice de fecha_cierre -- pasó de 17s a <1s.
const MO_MES_CUALQUIERA_WHERE = `fecha_cierre >= DATE_TRUNC('month', CURRENT_DATE) AND fecha_cierre < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'`;

const V_ORD_CTE = `v_ord AS (
      SELECT
        v.dia_operativo, v.proyecto_id, v.proyecto, v.zona, v.actividad, v.orden, v.nic,
        v.exclusiones, v.resultado, v.tipo_orden, v.sector, v.prioridad, v.municipio, v.barrio,
        v.deuda, v.tecnico, v.lat, v.lng, v.actualizado_en,
        CASE
          WHEN mo.orden IS NOT NULL AND COALESCE(mo.valor_orden, 0) > 0 THEN 'EJECUTADA'
          WHEN mo.orden IS NOT NULL THEN 'BAJA_POR_WEBSERVICE'
          WHEN v.estado_legible = 'Pendiente' AND mo_mes.orden IS NOT NULL THEN 'ASIGNADA'
          ELSE v.estado
        END as estado,
        CASE
          WHEN mo.orden IS NOT NULL AND COALESCE(mo.valor_orden, 0) > 0 THEN 'Ejecutada'
          WHEN mo.orden IS NOT NULL THEN 'Baja por WebService'
          WHEN v.estado_legible = 'Pendiente' AND mo_mes.orden IS NOT NULL THEN 'Asignada'
          ELSE v.estado_legible
        END as estado_legible,
        v.facturas_vencidas
      FROM analitica.v_ordenes_dia v
      LEFT JOIN (
        SELECT orden, valor_orden FROM dbanalitica.historico_mo
        WHERE ${MO_CERRADA_HOY_WHERE}
      ) mo ON mo.orden = v.orden
      LEFT JOIN (
        SELECT DISTINCT orden FROM dbanalitica.historico_mo
        WHERE ${MO_MES_CUALQUIERA_WHERE}
      ) mo_mes ON mo_mes.orden = v.orden

      UNION ALL

      SELECT
        CURRENT_DATE as dia_operativo,
        NULL::integer as proyecto_id,
        CASE
          WHEN UPPER(TRIM(COALESCE(NULLIF(h.zona_maestro, ''), REPLACE(UPPER(h.zona), 'ATLANTICO ', '')))) = 'SUR'
            THEN 'Sur' ELSE 'Norte-Centro'
        END as proyecto,
        UPPER(TRIM(COALESCE(NULLIF(h.zona_maestro, ''), REPLACE(UPPER(h.zona), 'ATLANTICO ', '')))) as zona,
        'SCR'::text as actividad,
        h.orden,
        h.nic,
        NULL::text as exclusiones,
        NULL::text as resultado,
        h.tipo_os as tipo_orden,
        NULL::text as sector,
        NULL::text as prioridad,
        h.municipio,
        h.localidad_barrio as barrio,
        COALESCE(h.deuda_cierre::text, '0') as deuda,
        COALESCE(NULLIF(TRIM(h.tecnico), ''), 'No asignado') as tecnico,
        NULL::double precision as lat,
        NULL::double precision as lng,
        (h.fecha_cierre + COALESCE(h.hora_fin, '00:00'::time))::timestamptz as actualizado_en,
        CASE WHEN COALESCE(h.valor_orden, 0) > 0 THEN 'EJECUTADA' ELSE 'BAJA_POR_WEBSERVICE' END as estado,
        CASE WHEN COALESCE(h.valor_orden, 0) > 0 THEN 'Ejecutada' ELSE 'Baja por WebService' END as estado_legible,
        NULL::integer as facturas_vencidas
      FROM dbanalitica.historico_mo h
      WHERE h.fecha_cierre = CURRENT_DATE
        AND h.estado_norm IN ('Efectiva', 'Fallida', 'Perdida', 'Sin Clasificar')
        AND NOT EXISTS (SELECT 1 FROM analitica.v_ordenes_dia v2 WHERE v2.orden = h.orden)
    )`;

export async function GET(request: Request) {
  const url = new URL(request.url, 'http://localhost:3000');
  const proy = url.searchParams.get('proy');
  const zona = url.searchParams.get('zona');
  const municipio = url.searchParams.get('municipio');
  const barrio = url.searchParams.get('barrio');
  const tipoOrden = url.searchParams.get('tipo_orden');
  const categoriaOs = url.searchParams.get('categoria_os');
  const estado = url.searchParams.get('estado');
  const tecnico = url.searchParams.get('tecnico');
  const q = url.searchParams.get('q');
  const detalle = url.searchParams.get('detalle') === 'true';

  try {
    // Si solicitan el detalle completo de órdenes (equivalente a v_ordenes_dia, ya con el ajuste de MO)
    if (detalle) {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (proy && proy !== 'ALL') {
        params.push(proy);
        conditions.push(`(proyecto ILIKE '%' || $${params.length} || '%')`);
      }
      if (zona && zona !== 'ALL') {
        params.push(zona);
        conditions.push(`zona = $${params.length}`);
      }
      if (municipio && municipio !== 'ALL') {
        params.push(municipio);
        conditions.push(`municipio = $${params.length}`);
      }
      if (barrio && barrio !== 'ALL') {
        params.push(barrio);
        conditions.push(`barrio = $${params.length}`);
      }
      if (tipoOrden && tipoOrden !== 'ALL') {
        params.push(tipoOrden);
        conditions.push(`tipo_orden = $${params.length}`);
      }
      if (categoriaOs && categoriaOs !== 'ALL') {
        if (categoriaOs === 'Suspensión') {
          conditions.push(`tipo_orden IN ('TO501', 'TO504', 'TO503', 'TO506')`);
        } else if (categoriaOs === 'Se mantiene suspendido') {
          conditions.push(`tipo_orden IN ('TO503', 'TO506')`);
        } else if (categoriaOs === 'Reconexión') {
          conditions.push(`tipo_orden = 'TO502'`);
        }
      }
      if (estado && estado !== 'ALL') {
        params.push(estado);
        conditions.push(`(estado = $${params.length} OR estado_legible ILIKE $${params.length})`);
      }
      if (tecnico && tecnico !== 'ALL') {
        if (tecnico === 'ASIGNADO') {
          conditions.push(`tecnico IS NOT NULL AND TRIM(tecnico) != '' AND TRIM(tecnico) != 'No asignado'`);
        } else if (tecnico === 'NO_ASIGNADO') {
          conditions.push(`(tecnico IS NULL OR TRIM(tecnico) = '' OR TRIM(tecnico) = 'No asignado')`);
        } else {
          params.push(tecnico);
          conditions.push(`TRIM(tecnico) = $${params.length}`);
        }
      }
      if (q && q.trim()) {
        params.push(`%${q.trim()}%`);
        conditions.push(`(orden ILIKE $${params.length} OR nic ILIKE $${params.length} OR barrio ILIKE $${params.length})`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sqlDetalle = `
        WITH ${V_ORD_CTE}
        SELECT
          dia_operativo::text as dia_operativo,
          proyecto_id,
          proyecto,
          zona,
          actividad,
          orden,
          nic,
          estado,
          estado_legible,
          exclusiones,
          resultado,
          tipo_orden,
          sector,
          prioridad,
          municipio,
          barrio,
          deuda,
          tecnico,
          lat,
          lng,
          actualizado_en,
          facturas_vencidas
        FROM v_ord
        ${whereClause}
        ORDER BY orden DESC
        LIMIT 600;
      `;
      const resDetalle = await query(sqlDetalle, params);
      return NextResponse.json({ ordenes: resDetalle.rows });
    }

    // Consulta 1: analitica.v_ordenes_dia_barrio (resumen consolidado oficial por barrio) -- no se
    // toca: es una vista pre-agregada aparte, y esta sección no se renderiza en el frontend.
    const sqlBarrios = `
      WITH deuda_barrio AS (
        SELECT proyecto, zona, municipio, barrio,
               SUM(NULLIF(deuda, '')::numeric) as deuda_total
        FROM analitica.v_ordenes_dia
        GROUP BY proyecto, zona, municipio, barrio
      )
      SELECT
        b.dia_operativo::text as dia_operativo,
        b.proyecto_id,
        b.proyecto,
        b.zona,
        b.actividad,
        b.municipio,
        b.barrio,
        b.pendientes::int as pendientes,
        b.asignadas::int as asignadas,
        b.bajas_webservice::int as bajas_webservice,
        b.ejecutadas::int as ejecutadas,
        b.ejecutadas_exitosas::int as ejecutadas_exitosas,
        b.ejecutadas_fallidas::int as ejecutadas_fallidas,
        b.excluidas::int as excluidas,
        b.sin_ubicar::int as sin_ubicar,
        b.sin_estado::int as sin_estado,
        b.total::int as total,
        COALESCE(d.deuda_total, 0) as deuda_total
      FROM analitica.v_ordenes_dia_barrio b
      LEFT JOIN deuda_barrio d
        ON d.proyecto = b.proyecto AND d.zona = b.zona
        AND d.municipio = b.municipio AND d.barrio = b.barrio
      ORDER BY b.total DESC;
    `;

    // Consulta 2: Desglose multidimensional (por barrio, OS, estado y técnico) -- estado/estado_legible
    // ya vienen ajustados por mano de obra desde v_ord.
    const sqlOrdenesAgrupadas = `
      WITH ${V_ORD_CTE}
      SELECT
        proyecto,
        zona,
        municipio,
        barrio,
        tipo_orden,
        CASE
          WHEN tipo_orden IN ('TO501', 'TO504', 'TO503', 'TO506') THEN 'Suspensión'
          WHEN tipo_orden = 'TO502' THEN 'Reconexión'
          ELSE 'Otro'
        END as categoria_os,
        estado,
        estado_legible,
        CASE
          WHEN tecnico IS NOT NULL AND TRIM(tecnico) != '' AND TRIM(tecnico) != 'No asignado' THEN 'Asignado'
          ELSE 'No asignado'
        END as asignacion_status,
        CASE
          WHEN tecnico IS NOT NULL AND TRIM(tecnico) != '' AND TRIM(tecnico) != 'No asignado' THEN TRIM(tecnico)
          ELSE 'No asignado'
        END as tecnico,
        COUNT(*)::int as cantidad,
        SUM(NULLIF(deuda, '')::numeric) as deuda_total,
        COUNT(*) FILTER (WHERE facturas_vencidas = 0)::int as fac_venc_0,
        COUNT(*) FILTER (WHERE facturas_vencidas = 1)::int as fac_venc_1,
        COUNT(*) FILTER (WHERE facturas_vencidas = 2)::int as fac_venc_2,
        COUNT(*) FILTER (WHERE facturas_vencidas = 3)::int as fac_venc_3,
        COUNT(*) FILTER (WHERE facturas_vencidas > 3)::int as fac_venc_mas_3
      FROM v_ord
      GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
      ORDER BY cantidad DESC;
    `;

    // Consulta 3: Lista de técnicos activos con métricas de asignación y especialidad
    const sqlTecnicos = `
      WITH ${V_ORD_CTE}
      SELECT
        TRIM(tecnico) as tecnico,
        proyecto,
        zona,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE estado = 'ASIGNADA')::int as asignadas,
        COUNT(*) FILTER (WHERE tipo_orden IN ('TO501', 'TO504', 'TO503', 'TO506'))::int as suspension,
        COUNT(*) FILTER (WHERE tipo_orden = 'TO502')::int as reconexion,
        COUNT(*) FILTER (WHERE tipo_orden IN ('TO503', 'TO506'))::int as se_mantiene,
        COUNT(DISTINCT barrio)::int as barrios_count
      FROM v_ord
      WHERE tecnico IS NOT NULL AND TRIM(tecnico) != '' AND TRIM(tecnico) != 'No asignado'
      GROUP BY 1, 2, 3
      ORDER BY total DESC;
    `;

    // Consulta 4: agrupada por hora y barrio para la vista temporal
    const sqlHoras = `
      WITH ${V_ORD_CTE}
      SELECT
        TO_CHAR(actualizado_en AT TIME ZONE 'America/Bogota', 'HH24:00') as hora,
        proyecto,
        zona,
        municipio,
        barrio,
        tipo_orden,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE estado = 'ASIGNADA')::int as asignadas,
        COUNT(*) FILTER (WHERE estado = 'DISPONIBLE')::int as pendientes,
        COUNT(*) FILTER (WHERE estado = 'EJECUTADA')::int as ejecutadas
      FROM v_ord
      GROUP BY 1, 2, 3, 4, 5, 6
      ORDER BY 1, total DESC;
    `;

    // Consulta 5: Resumen global por estados legibles
    const sqlResumenDia = `
      WITH ${V_ORD_CTE}
      SELECT
        estado_legible,
        COUNT(*)::int as cantidad
      FROM v_ord
      GROUP BY estado_legible
      ORDER BY cantidad DESC;
    `;

    // Consulta 6: Metas de órdenes, asignación y cumplimiento por Zona y Tipo de Brigada
    const sqlMetasBrigadas = `
      WITH ${V_ORD_CTE},
      tec_brig AS (
        SELECT DISTINCT ON (UPPER(TRIM("Tecnico")))
          UPPER(TRIM("Tecnico")) as tecnico,
          "Tipo Brigada" as tipo_brigada,
          "Zona" as zona
        FROM dbanalitica.maestro_brigadas
        WHERE "Tecnico" IS NOT NULL
      )
      SELECT
        v.dia_operativo::text as dia_operativo,
        v.proyecto,
        v.zona,
        COALESCE(tb.tipo_brigada, 'SCR PESADA') as tipo_brigada,
        COUNT(DISTINCT v.tecnico)::int as brigadas_activas,
        COUNT(v.orden)::int as total_ordenes,
        COUNT(v.orden) FILTER (WHERE v.estado = 'ASIGNADA')::int as asignadas,
        COUNT(v.orden) FILTER (WHERE v.estado = 'EJECUTADA')::int as ejecutadas,
        COUNT(v.orden) FILTER (WHERE v.estado = 'DISPONIBLE')::int as pendientes
      FROM v_ord v
      LEFT JOIN tec_brig tb ON UPPER(TRIM(v.tecnico)) = tb.tecnico
      WHERE v.tecnico IS NOT NULL AND TRIM(v.tecnico) != '' AND TRIM(v.tecnico) != 'No asignado'
      GROUP BY 1, 2, 3, 4
      ORDER BY asignadas DESC;
    `;

    // Consulta 7: Cierres del MES completo por barrio -- alimenta el gráfico "Comparativa de
    // Órdenes Asignadas vs. Pendientes por Barrio" cuando el usuario activa "Ver todo el mes"
    // (las Pendientes ahí siguen siendo las de HOY, porque "pendiente" es un concepto de ahora
    // mismo, no acumulable por mes). A diferencia de v_ord (que sí cuenta Sin Clasificar como
    // Cancelada), aquí se excluye Sin Clasificar: son cierres hechos ANTES de la asignación
    // formal, así que no deben sumar como "Asignadas" en esta comparación. Validado contra un
    // total real conocido: CENTRO, septiembre -> Efectiva + Fallida + Perdida ≈ 10.064.
    const sqlMesBarrios = `
      WITH mo_mes AS (
        SELECT
          CASE
            WHEN UPPER(TRIM(COALESCE(NULLIF(zona_maestro, ''), REPLACE(UPPER(zona), 'ATLANTICO ', '')))) = 'SUR'
              THEN 'Sur' ELSE 'Norte-Centro'
          END as proyecto,
          UPPER(TRIM(COALESCE(NULLIF(zona_maestro, ''), REPLACE(UPPER(zona), 'ATLANTICO ', '')))) as zona,
          municipio,
          localidad_barrio as barrio,
          tipo_os,
          orden,
          deuda_cierre
        FROM dbanalitica.historico_mo
        WHERE fecha_cierre >= DATE_TRUNC('month', CURRENT_DATE) AND fecha_cierre < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
          AND estado_norm IN ('Efectiva', 'Fallida', 'Perdida')
          AND localidad_barrio IS NOT NULL AND TRIM(localidad_barrio) != ''
      )
      SELECT
        proyecto, zona, municipio, barrio,
        COUNT(DISTINCT orden)::int as asignadas,
        COUNT(DISTINCT orden) FILTER (WHERE tipo_os IN ('TO501', 'TO504', 'TO503', 'TO506'))::int as suspension,
        COUNT(DISTINCT orden) FILTER (WHERE tipo_os = 'TO502')::int as reconexion,
        SUM(COALESCE(deuda_cierre, 0)) as deuda
      FROM mo_mes
      GROUP BY 1, 2, 3, 4
      ORDER BY asignadas DESC;
    `;

    // Consulta 8: "Asignadas" combinado = (Asignada HOY en el sistema) UNIÓN (mano de obra del
    // MES, Efectiva/Fallida/Perdida) -- una orden que está en mano de obra este mes pero YA NO
    // está en v_ordenes_dia (ej. reconexiones que SIPREM ya sacó de la cola, ver nota de v_ord)
    // también cuenta como asignada. DISTINCT ON (orden) evita contar dos veces una orden que cae
    // en ambos conjuntos (ej. asignada hoy Y con cierre este mes).
    const sqlAsignadasTotal = `
      WITH asig_hoy AS (
        SELECT orden, proyecto, zona, municipio, barrio, tipo_orden,
          COALESCE(NULLIF(TRIM(tecnico), ''), 'No asignado') as tecnico,
          COALESCE(NULLIF(deuda, ''), '0') as deuda
        FROM analitica.v_ordenes_dia
        WHERE estado_legible = 'Asignada'
      ),
      mo_mes_asig AS (
        SELECT
          orden,
          CASE
            WHEN UPPER(TRIM(COALESCE(NULLIF(zona_maestro, ''), REPLACE(UPPER(zona), 'ATLANTICO ', '')))) = 'SUR'
              THEN 'Sur' ELSE 'Norte-Centro'
          END as proyecto,
          UPPER(TRIM(COALESCE(NULLIF(zona_maestro, ''), REPLACE(UPPER(zona), 'ATLANTICO ', '')))) as zona,
          municipio,
          localidad_barrio as barrio,
          tipo_os as tipo_orden,
          COALESCE(NULLIF(TRIM(tecnico), ''), 'No asignado') as tecnico,
          COALESCE(deuda_cierre::text, '0') as deuda
        FROM dbanalitica.historico_mo
        WHERE fecha_cierre >= DATE_TRUNC('month', CURRENT_DATE) AND fecha_cierre < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
          AND estado_norm IN ('Efectiva', 'Fallida', 'Perdida')
      ),
      combinado AS (
        SELECT DISTINCT ON (orden) orden, proyecto, zona, municipio, barrio, tipo_orden, tecnico, deuda
        FROM (SELECT * FROM asig_hoy UNION ALL SELECT * FROM mo_mes_asig) x
        ORDER BY orden
      )
      SELECT
        proyecto, zona, municipio, barrio, tipo_orden,
        CASE
          WHEN tipo_orden IN ('TO501', 'TO504', 'TO503', 'TO506') THEN 'Suspensión'
          WHEN tipo_orden = 'TO502' THEN 'Reconexión'
          ELSE 'Otro'
        END as categoria_os,
        tecnico,
        COUNT(*)::int as cantidad,
        SUM(NULLIF(deuda, '')::numeric) as deuda_total
      FROM combinado
      GROUP BY 1, 2, 3, 4, 5, 6, 7
      ORDER BY cantidad DESC;
    `;

    // Consulta 9: Cierres de mano de obra del MES agrupados por DÍA (para el eje X del gráfico
    // "Comparativa..." cuando está activo "Ver Todo el Mes") -- mismo criterio que sqlMesBarrios
    // (Efectiva/Fallida/Perdida, excluye Sin Clasificar). "resultado" separa Ejecutada
    // (Efectiva+Fallida, valor_orden>0) de Cancelada (Perdida, valor_orden=0) para poder mostrar
    // el % de cada una por día sin bajar el detalle a nivel de orden individual en el frontend.
    const sqlMesPorDia = `
      SELECT
        fecha_cierre::text as fecha,
        CASE
          WHEN UPPER(TRIM(COALESCE(NULLIF(zona_maestro, ''), REPLACE(UPPER(zona), 'ATLANTICO ', '')))) = 'SUR'
            THEN 'Sur' ELSE 'Norte-Centro'
        END as proyecto,
        UPPER(TRIM(COALESCE(NULLIF(zona_maestro, ''), REPLACE(UPPER(zona), 'ATLANTICO ', '')))) as zona,
        municipio,
        localidad_barrio as barrio,
        CASE
          WHEN tipo_os IN ('TO501', 'TO504', 'TO503', 'TO506') THEN 'Suspensión'
          WHEN tipo_os = 'TO502' THEN 'Reconexión'
          ELSE 'Otro'
        END as categoria_os,
        COALESCE(NULLIF(TRIM(tecnico), ''), 'No asignado') as tecnico,
        CASE WHEN estado_norm IN ('Efectiva', 'Fallida') THEN 'Ejecutada' ELSE 'Cancelada' END as resultado,
        estado_norm,
        COUNT(DISTINCT orden)::int as cantidad
      FROM dbanalitica.historico_mo
      WHERE fecha_cierre >= DATE_TRUNC('month', CURRENT_DATE) AND fecha_cierre < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
        AND estado_norm IN ('Efectiva', 'Fallida', 'Perdida', 'Sin Clasificar')
      GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9
      ORDER BY fecha;
    `;

    // Los pendientes por día (v_ordenes_mes) viven en /api/data/cierre_diario_pendientes: son la
    // consulta más pesada y se cargan aparte, con caché por día, para no bloquear esta respuesta.
    const [resBarrios, resAgrupadas, resTecnicos, resHoras, resResumen, resMetas, resMes, resAsigTotal, resMesPorDia] = await Promise.all([
      query(sqlBarrios),
      query(sqlOrdenesAgrupadas),
      query(sqlTecnicos),
      query(sqlHoras),
      query(sqlResumenDia),
      query(sqlMetasBrigadas),
      query(sqlMesBarrios),
      query(sqlAsignadasTotal),
      query(sqlMesPorDia),
    ]);

    return NextResponse.json({
      barrios: resBarrios.rows,
      ordenesAgrupadas: resAgrupadas.rows,
      tecnicos: resTecnicos.rows,
      barriosHoras: resHoras.rows,
      resumenEstados: resResumen.rows,
      metasBrigadas: resMetas.rows,
      barriosMes: resMes.rows,
      asignadasTotal: resAsigTotal.rows,
      mesPorDia: resMesPorDia.rows,
    });
  } catch {
    console.error('Error al procesar la solicitud');
    return NextResponse.json({ error: 'Error al procesar la solicitud' }, { status: 500 });
  }
}
