export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { getBarrioDataV2 } from '../../../../../lib/queries_v2';

// Órdenes completas de un barrio.
//   /api/data/map/barrio?mes=2026-07&zona=ALL&barrios=SANTA HELENA||EL RECREO
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mes = searchParams.get('mes') ?? undefined;
  const zona = searchParams.get('zona') ?? undefined;
  const barriosParam = searchParams.get('barrios') ?? undefined;

  try {
    const res = await getBarrioDataV2(mes, zona, barriosParam);
    return NextResponse.json({ pts: res.rows });
  } catch {
    console.error('Error al procesar la solicitud');
    return NextResponse.json({ error: 'Error al procesar la solicitud' }, { status: 500 });
  }
}
