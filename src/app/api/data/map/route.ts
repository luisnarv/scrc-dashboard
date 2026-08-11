export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { getMapDataV2 } from '../../../../lib/queries_v2';



export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mes = searchParams.get('mes');
  const zona = searchParams.get('zona');
  const proceso = searchParams.get('proceso');

  try {
    const data = await getMapDataV2(mes || undefined, zona || undefined, undefined, proceso || undefined);
    return NextResponse.json(data);
  } catch (err) {
    console.error('Error fetching map data:', err);
    return NextResponse.json({ error: 'DB Error' }, { status: 500 });
  }
}
