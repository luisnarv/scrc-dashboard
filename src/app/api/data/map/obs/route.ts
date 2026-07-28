import { NextResponse } from 'next/server';
import { getObsDataV2 } from '../../../../../lib/queries_v2';

// Observaciones BAJO DEMANDA (popup de NIC o de barrio). Arquitectura V2.
//   /api/data/map/obs?mes=2026-07&nic=123456
//   /api/data/map/obs?mes=2026-07&barrios=SANTA HELENA||ALTOS DEL PRADO
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mes = searchParams.get('mes') ?? undefined;
  const nic = searchParams.get('nic') ?? undefined;
  const barriosParam = searchParams.get('barrios') ?? undefined;

  try {
    const res = await getObsDataV2(mes, nic, barriosParam);
    return NextResponse.json({ obs: res.rows });
  } catch (err) {
    console.error('Error obs V2:', err);
    return NextResponse.json({ error: 'DB Error' }, { status: 500 });
  }
}
