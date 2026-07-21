import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';

export async function GET() {
  try {
    const rawRes = await query(`
      SELECT fecha::text, cedula, tecnico as "Nombre", tipo_brigada as "Tipo_Brigada_Operaciones",
             tipo_brigada_mes as "Tipo_Brigada_Mes", mes_ym, zona, supervisor,
             efectivas as "Efectivas", fallidas as "Fallidas", perdidas as "Perdidas",
             fallida_con_pago as "Fallida_Con_Pago", fallida_sin_pago as "Fallida_Sin_Pago",
             visitas as "Visitas", fact_ajustada as "Ingresos", 
             meta_dia as "Meta_Facturacion", valor_fact_base, valor_produccion, margen_neto,
             asignacion as "Asignacion", perdidas_cop as "Perdidas_COP", costo_operativo as "Costo_Operativo"
      FROM scr.tecnico_dia
    `);
    
    // 2. Costos OTC
    const cosRes = await query(`
      SELECT mes_ym as "Mes", zona as "Zona", cuenta_mayor as "Categoria", es_ingreso, valor as "Valor"
      FROM scr.costos_otc
    `);
    
    const costos = cosRes.rows.map(r => ({
      Mes: r.Mes,
      Zona: r.Zona,
      Categoria: r.es_ingreso ? 'INGRESOS ' + r.Categoria : 'COSTO',
      Valor: Number(r.Valor),
      Tercero: ''
    }));

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

    // Restauramos categorias originales para el frontend
    const costosFinal = cosRes.rows.map(r => ({
      Mes: r.Mes,
      Zona: r.Zona,
      Categoria: r.es_ingreso ? 'INGRESOS ' + r.Categoria : r.Categoria,
      Valor: Number(r.Valor),
      Tercero: ''
    }));

    // 3. Empleados
    const empRes = await query(`
      SELECT mes_ym, empleado as "Empleado", valor_total as "Valor_Total", en_brigadas as "EnBrigadas", cedula_brigada as "Cedula"
      FROM scr.costos_empleado
    `);
    const emps = empRes.rows.map(r => ({
      Empleado: r.Empleado,
      Valor_Total: Number(r.Valor_Total),
      EnBrigadas: r.EnBrigadas ? 'SI' : 'NO'
    }));

    // 4. Tecnico Mes (Resumen Mensual)
    const mesRes = await query(`
      SELECT mes_ym as "Mes_YM", cedula as "Cedula", tecnico as "Tecnico", 
             tipo_brigada_mes as "Tipo_Brigada_Mes", ordenes as "Ordenes", 
             efectivas as "Efectivas", fallidas as "Fallidas", perdidas as "Perdidas", 
             visitas as "Visitas", ingresos_cop as "Ingresos_COP"
      FROM scr.tecnico_mes
    `);

    const dispRes = await query(`
      SELECT fecha::text as "Fecha", tipo_brigada as "Tipo_Brigada", zona as "Zona", COUNT(DISTINCT cedula) as "BrigadasActivas"
      FROM scr.tecnico_dia
      GROUP BY fecha, tipo_brigada, zona
      ORDER BY fecha, tipo_brigada
    `);

    // Retornamos todo el JSON compacto
    return NextResponse.json({ rawRecords, costos: costosFinal, emps, mesRecords: mesRes.rows, dispDiaria: dispRes.rows });
  } catch (error) {
    console.error('DB Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
