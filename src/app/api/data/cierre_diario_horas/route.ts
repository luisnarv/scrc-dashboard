import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url, 'http://localhost:3000');
    const fechasParam = url.searchParams.get('fechas');

    let sqlHoras = '';
    let params: string[] = [];

    if (!fechasParam || fechasParam === 'HOY') {
      sqlHoras = `
        WITH v_ord AS (
          SELECT
            v.proyecto, v.zona, v.municipio, v.barrio, v.tipo_orden, v.actualizado_en,
            CASE
              WHEN mo.orden IS NOT NULL AND COALESCE(mo.valor_orden, 0) > 0 THEN 'EJECUTADA'
              WHEN mo.orden IS NOT NULL THEN 'BAJA_POR_WEBSERVICE'
              WHEN v.estado_legible = 'Pendiente' AND mo_mes.orden IS NOT NULL THEN 'ASIGNADA'
              ELSE v.estado
            END as estado,
            CASE WHEN v.actividad = 'MULTIFAMILIAR SCR' THEN 'GESTOR' ELSE 'SCR' END as proceso
          FROM analitica.v_ordenes_dia v
          LEFT JOIN (
            SELECT orden, valor_orden FROM dbanalitica.historico_mo
            WHERE fecha_cierre = CURRENT_DATE AND estado_norm IN ('Efectiva', 'Fallida', 'Perdida', 'Sin Clasificar')
          ) mo ON mo.orden = v.orden
          LEFT JOIN (
            SELECT DISTINCT orden FROM dbanalitica.historico_mo
            WHERE fecha_cierre >= DATE_TRUNC('month', CURRENT_DATE) AND fecha_cierre < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
          ) mo_mes ON mo_mes.orden = v.orden
          
          UNION ALL
          
          SELECT
            CASE
              WHEN UPPER(TRIM(COALESCE(NULLIF(h.zona_maestro, ''), REPLACE(UPPER(h.zona), 'ATLANTICO ', '')))) = 'SUR' THEN 'Sur'
              ELSE 'Norte-Centro'
            END as proyecto,
            COALESCE(NULLIF(h.zona_maestro, ''), REPLACE(UPPER(h.zona), 'ATLANTICO ', '')) as zona,
            h.municipio, h.localidad_barrio as barrio, h.tipo_os as tipo_orden,
            COALESCE(h.fecha_cierre + h.hora_fin, CURRENT_TIMESTAMP) as actualizado_en,
            CASE WHEN COALESCE(h.valor_orden, 0) > 0 THEN 'EJECUTADA' ELSE 'BAJA_POR_WEBSERVICE' END as estado,
            CASE WHEN h.brigada_homologada = 'Gestor Integral Multi' THEN 'GESTOR' ELSE 'SCR' END as proceso
          FROM dbanalitica.historico_mo h
          WHERE h.fecha_cierre = CURRENT_DATE
            AND h.estado_norm IN ('Efectiva', 'Fallida', 'Perdida', 'Sin Clasificar')
            AND NOT EXISTS (SELECT 1 FROM analitica.v_ordenes_dia v2 WHERE v2.orden = h.orden)
        )
        SELECT
          TO_CHAR(actualizado_en AT TIME ZONE 'America/Bogota', 'HH24:00') as hora,
          proyecto, zona, municipio, barrio, tipo_orden, proceso,
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE estado = 'ASIGNADA')::int as asignadas,
          COUNT(*) FILTER (WHERE estado = 'DISPONIBLE')::int as pendientes,
          COUNT(*) FILTER (WHERE estado = 'EJECUTADA')::int as ejecutadas
        FROM v_ord
        GROUP BY 1, 2, 3, 4, 5, 6, 7
        ORDER BY 1, total DESC;
      `;
    } else {
      const fechas = fechasParam.split(',').map(f => f.trim());
      const inClause = fechas.map((_, i) => `$${i + 1}::date`).join(', ');
      params = fechas;
      
      sqlHoras = `
        SELECT
          TO_CHAR(COALESCE(h.hora_fin, '12:00:00'::time), 'HH24:00') as hora,
          CASE
            WHEN UPPER(TRIM(COALESCE(NULLIF(h.zona_maestro, ''), REPLACE(UPPER(h.zona), 'ATLANTICO ', '')))) = 'SUR' THEN 'Sur'
            ELSE 'Norte-Centro'
          END as proyecto,
          COALESCE(NULLIF(h.zona_maestro, ''), REPLACE(UPPER(h.zona), 'ATLANTICO ', '')) as zona,
          h.municipio,
          h.localidad_barrio as barrio,
          h.tipo_os as tipo_orden,
          CASE WHEN h.brigada_homologada = 'Gestor Integral Multi' THEN 'GESTOR' ELSE 'SCR' END as proceso,
          COUNT(*)::int as total,
          COUNT(*)::int as asignadas,
          0 as pendientes,
          COUNT(*) FILTER (WHERE COALESCE(h.valor_orden, 0) > 0)::int as ejecutadas
        FROM dbanalitica.historico_mo h
        WHERE h.fecha_cierre IN (${inClause})
          AND h.estado_norm IN ('Efectiva', 'Fallida', 'Perdida', 'Sin Clasificar')
        GROUP BY 1, 2, 3, 4, 5, 6, 7
        ORDER BY 1, total DESC;
      `;
    }

    const resHoras = await query(sqlHoras, params);

    return NextResponse.json({
      barriosHoras: resHoras.rows
    });
  } catch (e: any) {
    console.error('Error en horas:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
