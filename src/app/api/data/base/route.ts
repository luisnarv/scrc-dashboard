import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';

export async function GET() {
  try {
    // 1. Tecnico Dia (raw)
    const rawRes = await query(`
      SELECT fecha::text, cedula, tipo_brigada as "Tipo_Brigada_Operaciones", mes_ym, zona, supervisor,
             efectivas as "Efectivas", visitas as "Visitas", valor_produccion as "Ingresos", 
             meta_dia as "Meta_Facturacion", valor_fact_base, fact_ajustada, margen_neto,
             0 as "Asignacion"
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

    // Pre-calcular costos mensuales para distribución
    const costosPorMes: Record<string, number> = {};
    costos.forEach(c => {
      if (c.Categoria === 'COSTO' && c.Mes) {
        costosPorMes[c.Mes] = (costosPorMes[c.Mes] || 0) + c.Valor;
      }
    });

    const conteoPorMes: Record<string, number> = {};
    rawRes.rows.forEach(r => {
      const m = r.mes_ym;
      if (m) conteoPorMes[m] = (conteoPorMes[m] || 0) + 1;
    });

    const rawRecords = rawRes.rows.map(r => {
      const m = r.mes_ym;
      const costoTotalMes = costosPorMes[m] || 0;
      const filasMes = conteoPorMes[m] || 1;
      const costoDistribuido = costoTotalMes / filasMes;

      return {
        Fecha: r.fecha,
        Cedula: r.cedula,
        Tipo_Brigada_Operaciones: r.Tipo_Brigada_Operaciones,
        Zona: r.zona, 
        Visitas: Number(r.Visitas),
        Efectivas: Number(r.Efectivas),
        Ingresos: Number(r.Ingresos),
        Meta_Facturacion: Number(r.Meta_Facturacion),
        Costo_Operativo: costoDistribuido,
        Asignacion: Number(r.Asignacion) || 0
      };
    });

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

    // Retornamos todo el JSON compacto
    return NextResponse.json({ rawRecords, costos: costosFinal, emps });
  } catch (error) {
    console.error('DB Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
