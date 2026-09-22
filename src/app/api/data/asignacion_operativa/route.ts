import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';

export const dynamic = 'force-dynamic';

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
    // Si solicitan el detalle completo de órdenes de v_ordenes_dia
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
          conditions.push(`tipo_orden IN ('TO501', 'TO504')`);
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
          actualizado_en
        FROM analitica.v_ordenes_dia
        ${whereClause}
        ORDER BY orden DESC
        LIMIT 600;
      `;
      const resDetalle = await query(sqlDetalle, params);
      return NextResponse.json({ ordenes: resDetalle.rows });
    }

    // Consulta 1: analitica.v_ordenes_dia_barrio (resumen consolidado oficial por barrio)
    const sqlBarrios = `
      SELECT 
        dia_operativo::text as dia_operativo,
        proyecto_id,
        proyecto,
        zona,
        actividad,
        municipio,
        barrio,
        pendientes::int as pendientes,
        asignadas::int as asignadas,
        bajas_webservice::int as bajas_webservice,
        ejecutadas::int as ejecutadas,
        ejecutadas_exitosas::int as ejecutadas_exitosas,
        ejecutadas_fallidas::int as ejecutadas_fallidas,
        excluidas::int as excluidas,
        sin_ubicar::int as sin_ubicar,
        sin_estado::int as sin_estado,
        total::int as total
      FROM analitica.v_ordenes_dia_barrio
      ORDER BY total DESC;
    `;

    // Consulta 2: Desglose multidimensional de analitica.v_ordenes_dia (por barrio, OS, estado y técnico)
    const sqlOrdenesAgrupadas = `
      SELECT 
        proyecto,
        zona,
        municipio,
        barrio,
        tipo_orden,
        CASE 
          WHEN tipo_orden IN ('TO501', 'TO504') THEN 'Suspensión'
          WHEN tipo_orden IN ('TO503', 'TO506') THEN 'Se mantiene suspendido'
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
        COUNT(*)::int as cantidad
      FROM analitica.v_ordenes_dia
      GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
      ORDER BY cantidad DESC;
    `;

    // Consulta 3: Lista de técnicos activos con métricas de asignación y especialidad
    const sqlTecnicos = `
      SELECT 
        TRIM(tecnico) as tecnico,
        proyecto,
        zona,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE estado = 'ASIGNADA')::int as asignadas,
        COUNT(*) FILTER (WHERE tipo_orden IN ('TO501', 'TO504'))::int as suspension,
        COUNT(*) FILTER (WHERE tipo_orden = 'TO502')::int as reconexion,
        COUNT(*) FILTER (WHERE tipo_orden IN ('TO503', 'TO506'))::int as se_mantiene,
        COUNT(DISTINCT barrio)::int as barrios_count
      FROM analitica.v_ordenes_dia
      WHERE tecnico IS NOT NULL AND TRIM(tecnico) != '' AND TRIM(tecnico) != 'No asignado'
      GROUP BY 1, 2, 3
      ORDER BY total DESC;
    `;

    // Consulta 4: analitica.v_ordenes_dia agrupada por hora y barrio para la vista temporal
    const sqlHoras = `
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
      FROM analitica.v_ordenes_dia
      GROUP BY 1, 2, 3, 4, 5, 6
      ORDER BY 1, total DESC;
    `;

    // Consulta 5: Resumen global por estados legibles
    const sqlResumenDia = `
      SELECT 
        estado_legible,
        COUNT(*)::int as cantidad
      FROM analitica.v_ordenes_dia
      GROUP BY estado_legible
      ORDER BY cantidad DESC;
    `;

    // Consulta 6: Metas de órdenes, asignación y cumplimiento por Zona y Tipo de Brigada
    const sqlMetasBrigadas = `
      WITH tec_brig AS (
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
      FROM analitica.v_ordenes_dia v
      LEFT JOIN tec_brig tb ON UPPER(TRIM(v.tecnico)) = tb.tecnico
      WHERE v.tecnico IS NOT NULL AND TRIM(v.tecnico) != '' AND TRIM(v.tecnico) != 'No asignado'
      GROUP BY 1, 2, 3, 4
      ORDER BY asignadas DESC;
    `;

    const [resBarrios, resAgrupadas, resTecnicos, resHoras, resResumen, resMetas] = await Promise.all([
      query(sqlBarrios),
      query(sqlOrdenesAgrupadas),
      query(sqlTecnicos),
      query(sqlHoras),
      query(sqlResumenDia),
      query(sqlMetasBrigadas),
    ]);

    return NextResponse.json({
      barrios: resBarrios.rows,
      ordenesAgrupadas: resAgrupadas.rows,
      tecnicos: resTecnicos.rows,
      barriosHoras: resHoras.rows,
      resumenEstados: resResumen.rows,
      metasBrigadas: resMetas.rows,
    });
  } catch (error) {
    console.error('Error en /api/data/asignacion_operativa:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
