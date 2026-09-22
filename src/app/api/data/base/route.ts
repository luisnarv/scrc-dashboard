import { NextResponse } from 'next/server';
import { getDashboardDataV2 } from '../../../../lib/queries_v2';

export const dynamic = 'force-dynamic';

// Datos ACOTADOS A UN MES. El dashboard pide un mes a la vez (Offline-First):
//   /api/data/base?mes=2026-07  -> solo julio
//   /api/data/base              -> todo el historico (compatibilidad)
// Lo transversal (evolutivo, lista de meses) vive en /api/data/months.
export async function GET(request: Request) {
  const url = new URL(request.url, 'http://localhost:3000');
  const mes = url.searchParams.get('mes');

  if (mes === '__NINGUNO__') {
    return NextResponse.json({
      mes: '__NINGUNO__',
      rawRecords: [],
      costos: [],
      emps: [],
      mesRecords: [],
      dispDiaria: [],
      horario: [],
      horarioTec: [],
    });
  }

  try {
    const data = await getDashboardDataV2(mes || undefined);
    return NextResponse.json(data);
  } catch (error) {
    console.error('DB Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
