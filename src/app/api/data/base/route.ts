import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';

// Datos ACOTADOS A UN MES. El dashboard pide un mes a la vez (Offline-First):
//   /api/data/base?mes=2026-07  -> solo julio
//   /api/data/base              -> todo el historico (compatibilidad)
// Lo transversal (evolutivo, lista de meses) vive en /api/data/months.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mes = searchParams.get('mes');

  // tecnico_dia NO tiene mes_ym poblado: su mes se deriva de `fecha`.
  // Las tablas mensuales (costos_otc, costos_empleado, tecnico_mes) si usan mes_ym.
  const params: unknown[] = [];
  const activo = !!(mes && mes !== 'ALL');
  if (activo) params.push(mes);
  const fechaCond = activo ? "WHERE to_char(fecha, 'YYYY-MM') = $1" : '';  // tecnico_dia
  const mesymCond = activo ? 'WHERE mes_ym = $1' : '';                     // mensuales

  try {
    const rawRes = await query(`
      SELECT fecha::text, cedula, tecnico as "Nombre", tipo_brigada as "Tipo_Brigada_Operaciones",
             tipo_brigada_mes as "Tipo_Brigada_Mes", mes_ym, zona, supervisor,
             efectivas as "Efectivas", fallidas as "Fallidas", perdidas as "Perdidas",
             fallida_con_pago as "Fallida_Con_Pago", fallida_sin_pago as "Fallida_Sin_Pago",
             visitas as "Visitas", fact_ajustada as "Ingresos",
             meta_dia as "Meta_Facturacion", valor_fact_base, valor_produccion, margen_neto,
             asignacion as "Asignacion", perdidas_cop as "Perdidas_COP", costo_operativo as "Costo_Operativo"
      FROM dbanalitica.tecnico_dia
      ${fechaCond}
    `, params);

    const cosRes = await query(`
      SELECT mes_ym as "Mes", zona as "Zona", cuenta_mayor as "Categoria", es_ingreso, valor as "Valor"
      FROM dbanalitica.costos_otc
      ${mesymCond}
    `, params);

    const rawRecords = rawRes.rows.map(r => ({
      Fecha: r.fecha,
      Cedula: r.cedula,
      Nombre: r.Nombre,
      Tipo_Brigada_Operaciones: r.Tipo_Brigada_Operaciones,
      Tipo_Brigada_Mes: r.Tipo_Brigada_Mes,
      Zona: r.zona,
      Visitas: Number(r.Visitas),
      Efectivas: Number(r.Efectivas),
      Fallidas: Number(r.Fallidas),
      Perdidas: Number(r.Perdidas),
      Fallida_Con_Pago: Number(r.Fallida_Con_Pago),
      Fallida_Sin_Pago: Number(r.Fallida_Sin_Pago),
      Ingresos: Number(r.Ingresos),
      Meta_Facturacion: Number(r.Meta_Facturacion),
      Perdidas_COP: Number(r.Perdidas_COP),
      Costo_Operativo: Number(r.Costo_Operativo) || 0,
      Asignacion: Number(r.Asignacion) || 0
    }));

    const costosFinal = cosRes.rows.map(r => ({
      Mes: r.Mes,
      Zona: r.Zona,
      Categoria: r.es_ingreso ? 'INGRESOS ' + r.Categoria : r.Categoria,
      Valor: Number(r.Valor),
      Tercero: ''
    }));

    const empRes = await query(`
      SELECT mes_ym, empleado as "Empleado", valor_total as "Valor_Total", en_brigadas as "EnBrigadas", cedula_brigada as "Cedula"
      FROM dbanalitica.costos_empleado
      ${mesymCond}
    `, params);
    const emps = empRes.rows.map(r => ({
      Empleado: r.Empleado,
      Valor_Total: Number(r.Valor_Total),
      EnBrigadas: r.EnBrigadas ? 'SI' : 'NO'
    }));

    const mesRes = await query(`
      SELECT mes_ym as "Mes_YM", cedula as "Cedula", tecnico as "Tecnico", supervisor as "Supervisor",
             contratista as "Contratista", vehiculo as "Vehiculo",
             tipo_brigada_mes as "Tipo_Brigada_Mes", ordenes as "Ordenes",
             efectivas as "Efectivas", fallidas as "Fallidas", perdidas as "Perdidas",
             visitas as "Visitas", ingresos_cop as "Ingresos_COP",
             cantidad_nic as "Cantidad_NIC", total_suspension as "Total_Suspension",
             total_mantiene_susp as "Total_Mantiene_Susp", total_reconexion as "Total_Reconexion",
             total_pagos as "Total_Pagos", total_imposibilidades as "Total_Imposibilidades",
             total_resistencia as "Total_Resistencia", total_pqr as "Total_PQR",
             dias_laborados as "Dias_Laborados", eficacia as "Eficacia"
      FROM dbanalitica.tecnico_mes
      ${mesymCond}
    `, params);

    const dispRes = await query(`
      SELECT fecha::text as "Fecha", tipo_brigada as "Tipo_Brigada", zona as "Zona", COUNT(DISTINCT cedula) as "BrigadasActivas"
      FROM dbanalitica.tecnico_dia
      ${fechaCond}
      GROUP BY fecha, tipo_brigada, zona
      ORDER BY fecha, tipo_brigada
    `, params);

    return NextResponse.json({
      mes: mes || 'ALL',
      rawRecords,
      costos: costosFinal,
      emps,
      mesRecords: mesRes.rows,
      dispDiaria: dispRes.rows
    });
  } catch (error) {
    console.error('DB Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
