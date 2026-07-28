import { NextResponse } from 'next/server';
import { getBarrioDataV2 } from '../../../../../lib/queries_v2';

// Órdenes COMPLETAS de un barrio (arquitectura V2: historico_mo + maestro_estados).
//   /api/data/map/barrio?mes=2026-07&zona=ALL&barrios=SANTA HELENA||EL RECREO
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mes = searchParams.get('mes') ?? undefined;
  const zona = searchParams.get('zona') ?? undefined;
  const barriosParam = searchParams.get('barrios') ?? undefined;

  try {
    const res = await getBarrioDataV2(mes, zona, barriosParam);
    return NextResponse.json({ pts: res.rows });
  } catch (err) {
    console.error('Error barrio V2:', err);
    return NextResponse.json({ error: 'DB Error' }, { status: 500 });
  }
}
