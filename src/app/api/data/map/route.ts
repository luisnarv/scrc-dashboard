import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mes = searchParams.get('mes');
  const zona = searchParams.get('zona');

  // Filtros semanticos (mes/zona). NO exigen coordenada: un NIC entra al
  // cohorte por haber tenido orden ese mes, tenga o no lat/long propia.
  const filterClauses: string[] = [];
  const values: any[] = [];

  if (mes && mes !== 'ALL') {
    values.push(mes + '%');
    filterClauses.push(`fecha_cierre::text LIKE $${values.length}`);
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
    // sigan operando), pero con la coordenada del NIC rellenada por COALESCE
    // -> maxima cobertura. El mapa colapsa a un punto por NIC en el cliente.
    // coord_nic toma la ubicacion conocida del NIC en CUALQUIER fecha.
    const ptsQuery = `
      WITH coord_nic AS (
        SELECT DISTINCT ON (nic) nic, latitud, longitud
        FROM dbanalitica.ordenes
        WHERE nic IS NOT NULL AND latitud IS NOT NULL AND longitud IS NOT NULL
        ORDER BY nic, fecha_cierre DESC NULLS LAST
      )
      SELECT
        o.nic as "nic",
        COALESCE(o.latitud, c.latitud) as "la",
        COALESCE(o.longitud, c.longitud) as "lo",
        o.accion as "ac",
        o.subaccion as "su",
        o.tecnico as "te",
        o.municipio as "mu",
        o.barrio as "ba",
        o.zona as "zo",
        o.estado as "es",
        o.tipo_os as "to",
        o.fecha_cierre::text as "fe",
        o.observacion as "ob"
      FROM dbanalitica.ordenes o
      LEFT JOIN coord_nic c ON c.nic = o.nic
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
