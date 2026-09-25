export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { getMapDataV2 } from '../../../../lib/queries_v2';



export async function GET(request: Request) {
  const url = new URL(request.url, 'http://localhost:3000');
  const mes = url.searchParams.get('mes');
  const zona = url.searchParams.get('zona');
  const proceso = url.searchParams.get('proceso');

  if (mes === '__NINGUNO__') {
    return NextResponse.json({
      geojson: { type: 'FeatureCollection', features: [] },
      count: 0,
      isAggregated: false,
    });
  }

  try {
    const data = await getMapDataV2(mes || undefined, zona || undefined, undefined, proceso || undefined);
    return NextResponse.json(data);
  } catch {
    console.error('Error al procesar la solicitud');
    return NextResponse.json({ error: 'Error al procesar la solicitud' }, { status: 500 });
  }
}
