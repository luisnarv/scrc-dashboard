import { NextResponse } from 'next/server';
import { getMonthsDataV2 } from '../../../../lib/queries_v2';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getMonthsDataV2();
    return NextResponse.json(data);
  } catch {
    console.error('Error al procesar la solicitud');
    return NextResponse.json({ error: 'Error al procesar la solicitud' }, { status: 500 });
  }
}
