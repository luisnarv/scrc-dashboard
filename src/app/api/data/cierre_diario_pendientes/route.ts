import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// Órdenes Pendientes (DISPONIBLE) y Asignadas (ASIGNADA, se hayan ejecutado o no) por día, barrio y
// municipio del mes en curso, para las columnas de barrios del gráfico de cierre diario. Fuente:
// analitica.v_ordenes_mes (snapshot diario, vista sin materializar), SIN cruce con mano de obra.
//
// Consultar el mes completo en una sola query tarda 40-80s (la vista se recalcula entera). Filtrar
// por un solo `dia_operativo` sí se empuja hasta la tabla base y baja a 2-6s, así que se consulta
// día por día y se cachean en memoria los días ya cerrados (no cambian salvo cargas tardías de
// mano de obra, de ahí el TTL). Solo hoy se refresca seguido.
type Fila = {
  fecha: string; proyecto: string; zona: string; municipio: string; barrio: string;
  categoria_os: string; pendientes: number; asignadas: number;
};
type Entrada = { rows: Fila[]; at: number };

const TTL_PASADO_MS = 6 * 60 * 60 * 1000;
const TTL_HOY_MS = 5 * 60 * 1000;
const CONCURRENCIA = 4;

const g = globalThis as unknown as { __pendientesDiaCacheV2?: Map<string, Entrada> };
const cache: Map<string, Entrada> = (g.__pendientesDiaCacheV2 ??= new Map());
const enVuelo = new Map<string, Promise<Fila[]>>();

const sqlDia = `
  SELECT
    vm.dia_operativo::text as fecha,
    vm.proyecto,
    vm.zona,
    vm.municipio,
    vm.barrio,
    CASE
      WHEN vm.tipo_orden IN ('TO501', 'TO504', 'TO503', 'TO506') THEN 'Suspensión'
      WHEN vm.tipo_orden = 'TO502' THEN 'Reconexión'
      ELSE 'Otro'
    END as categoria_os,
    COUNT(DISTINCT vm.orden) FILTER (WHERE vm.estado = 'DISPONIBLE')::int as pendientes,
    COUNT(DISTINCT vm.orden) FILTER (WHERE vm.estado = 'ASIGNADA')::int as asignadas
  FROM analitica.v_ordenes_mes vm
  WHERE vm.estado IN ('DISPONIBLE', 'ASIGNADA')
    AND vm.dia_operativo = $1::date
  GROUP BY 1, 2, 3, 4, 5, 6;
`;

function cargarDia(fecha: string): Promise<Fila[]> {
  let p = enVuelo.get(fecha);
  if (!p) {
    p = query(sqlDia, [fecha])
      .then(r => {
        cache.set(fecha, { rows: r.rows as Fila[], at: Date.now() });
        return r.rows as Fila[];
      })
      .finally(() => enVuelo.delete(fecha));
    enVuelo.set(fecha, p);
  }
  return p;
}

export async function GET() {
  try {
    const resDias = await query(`
      SELECT to_char(d, 'YYYY-MM-DD') as fecha, (d = CURRENT_DATE) as es_hoy
      FROM generate_series(date_trunc('month', CURRENT_DATE), CURRENT_DATE, interval '1 day') d
      ORDER BY d
    `);
    const dias = resDias.rows as { fecha: string; es_hoy: boolean }[];

    const ahora = Date.now();
    const faltantes = dias.filter(({ fecha, es_hoy }) => {
      const c = cache.get(fecha);
      return !c || ahora - c.at > (es_hoy ? TTL_HOY_MS : TTL_PASADO_MS);
    }).map(d => d.fecha);

    for (let i = 0; i < faltantes.length; i += CONCURRENCIA) {
      await Promise.all(faltantes.slice(i, i + CONCURRENCIA).map(cargarDia));
    }

    const rows = dias.flatMap(({ fecha }) => cache.get(fecha)?.rows ?? []);
    return NextResponse.json({ mesPendientesPorDia: rows });
  } catch (error) {
    console.error('Error en /api/data/cierre_diario_pendientes:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
