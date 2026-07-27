import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';

// Metadatos TRANSVERSALES (no dependen de un mes), pequenos y baratos:
//   - months:    lista de meses disponibles con su conteo y "version"
//                (MAX(creado_en)). La version permite invalidar cache: si el
//                ETL recargo un mes, su version avanza y el cliente lo re-baja;
//                si no cambio, se evita la consulta pesada de ese mes.
//   - evolutivo: serie mensual completa (~decenas de filas) para el grafico de
//                tendencia, que por naturaleza es multi-mes.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // tecnico_dia no tiene mes_ym poblado: el mes se deriva de `fecha`.
    const monthsRes = await query(`
      SELECT to_char(fecha, 'YYYY-MM') as "mes",
             COUNT(*)::int as "count",
             MAX(creado_en)::text as "version"
      FROM dbanalitica.tecnico_dia
      WHERE fecha IS NOT NULL
      GROUP BY to_char(fecha, 'YYYY-MM')
      ORDER BY 1
    `);

    const evolutivoRes = await query(`
      SELECT mes_ym as "Mes", tipo_brigada as "TipoBrigada", cantidad_nic as "Cantidad_NIC",
             total_ordenes as "Total_Ordenes", total_suspension as "Total_Suspension",
             total_mantiene_susp as "Total_Mantiene_Susp", total_reconexion as "Total_Reconexion",
             total_pagos as "Total_Pagos", total_imposibilidades as "Total_Imposibilidades",
             total_resistencia as "Total_Resistencia", total_pqr as "Total_PQR",
             eficacia as "Eficacia"
      FROM dbanalitica.evolutivo_brigada_mes
    `);

    return NextResponse.json({
      months: monthsRes.rows,          // [{ mes, count, version }]
      evolutivo: evolutivoRes.rows,
    });
  } catch (error) {
    console.error('DB Error (months):', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
