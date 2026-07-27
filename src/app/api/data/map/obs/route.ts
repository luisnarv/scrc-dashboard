import { NextResponse } from 'next/server';
import { query } from '../../../../lib/db';

// Observaciones BAJO DEMANDA: se piden solo al abrir un popup (NIC o barrio),
// no en el payload masivo del mapa (donde pesaban ~8 MB / 52%).
//   /api/data/map/obs?mes=2026-07&nic=123456
//   /api/data/map/obs?mes=2026-07&barrios=SANTA HELENA||ALTOS DEL PRADO
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mes = searchParams.get('mes');
  const nic = searchParams.get('nic');
  const barriosParam = searchParams.get('barrios');

  const where: string[] = ["observacion IS NOT NULL", "observacion <> ''"];
  const values: unknown[] = [];

  if (mes && mes !== 'ALL') {
    values.push(mes + '%');
    where.push(`fecha_cierre::text LIKE $${values.length}`);
  }

  if (nic) {
    values.push(nic);
    where.push(`nic = $${values.length}`);
  } else if (barriosParam) {
    const lista = barriosParam.split('||').map(s => s.trim()).filter(Boolean);
    if (!lista.length) return NextResponse.json({ obs: [] });
    values.push(lista);
    where.push(`barrio = ANY($${values.length}::text[])`);
  } else {
    return NextResponse.json({ obs: [] });
  }

  try {
    // Primero las no-efectivas (las que reportan problema), luego por fecha.
    const res = await query(`
      SELECT fecha_cierre::text as "fe", nic, estado as "es", subaccion as "su", observacion as "ob"
      FROM dbanalitica.ordenes
      WHERE ${where.join(' AND ')}
      ORDER BY (estado = 'Efectiva'), fecha_cierre DESC
      LIMIT 40
    `, values);
    return NextResponse.json({ obs: res.rows });
  } catch (err) {
    console.error('Error obs:', err);
    return NextResponse.json({ error: 'DB Error' }, { status: 500 });
  }
}
