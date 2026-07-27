import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';

export const revalidate = 3600; // Caché de 1 hora para evitar consultas pesadas repetidas

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mes = searchParams.get('mes');
  const zona = searchParams.get('zona');

  // Filtros semanticos (mes/zona). NO exigen coordenada: un NIC entra al
  // cohorte por haber tenido orden ese mes, tenga o no lat/long propia.
  const filterClauses: string[] = [];
  const values: any[] = [];

  if (mes && mes !== 'ALL') {
    values.push(`${mes}-01`);
    filterClauses.push(`fecha_cierre >= $${values.length}::date`);
    values.push(`${mes}-01`);
    filterClauses.push(`fecha_cierre < $${values.length}::date + interval '1 month'`);
  }
  if (zona && zona !== 'ALL') {
    values.push(`%${zona}%`);
    filterClauses.push(`zona ILIKE $${values.length}`);
  }

  const andFilters = filterClauses.length ? 'AND ' + filterClauses.join(' AND ') : '';
  const whereFilters = filterClauses.length ? 'WHERE ' + filterClauses.join(' AND ') : '';

  try {
    // Estado de barrios (mapa de calor). El barrio ya no depende del GPS, asi
    // que se cuentan todas las ordenes del mes, no solo las georreferenciadas.
    const statsQuery = `
      SELECT
        municipio,
        barrio,
        COUNT(*) as total,
        SUM(CASE WHEN estado = 'Efectiva' THEN 1 ELSE 0 END) as efectivas,
        SUM(CASE WHEN estado = 'Fallida' THEN 1 ELSE 0 END) as fallidas,
        SUM(CASE WHEN estado = 'Perdida' THEN 1 ELSE 0 END) as perdidas
      FROM dbanalitica.ordenes
      WHERE barrio IS NOT NULL ${andFilters}
      GROUP BY municipio, barrio
    `;
    const statsRes = await query(statsQuery, values);

    // Puntos GPS: una fila por ORDEN del mes (para que los filtros del modal
    // sigan operando). El ETL ya rellena latitud/longitud por NIC en la propia
    // orden (~97% cobertura), asi que se lee directo -sin el CTE coord_nic que
    // escaneaba toda la tabla (~1 s)-. Las pocas ordenes sin coord llegan con
    // la/lo nulos y el cliente las ubica en el centroide de su barrio.
    const ptsQuery = `
      SELECT
        o.nic as "nic",
        o.latitud as "la",
        o.longitud as "lo",
        o.accion as "ac",
        o.subaccion as "su",
        o.tecnico as "te",
        o.municipio as "mu",
        o.barrio as "ba",
        o.zona as "zo",
        o.estado as "es",
        o.tipo_os as "to",
        o.fecha_cierre::text as "fe"
      FROM dbanalitica.ordenes o
      ${whereFilters}
    `;
    const ptsRes = await query(ptsQuery, values);

    return NextResponse.json({
      pts: ptsRes.rows,
      stats_barrios: statsRes.rows
    });
  } catch (err) {
    console.error('Error fetching map data:', err);
    return NextResponse.json({ error: 'DB Error' }, { status: 500 });
  }
}
