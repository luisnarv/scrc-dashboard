import { NextResponse } from 'next/server';
import { getMonthsDataV2 } from '../../../../lib/queries_v2';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getMonthsDataV2();
    return NextResponse.json(data);
  } catch (error) {
    console.error('DB Error (months):', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
