import type { CostoRecord, OtcAgg, RawRecord } from './types';
import { num } from './formatters';

// Cuentas de Ingreso Real y Provisión de OTC
export const OTC_CUENTA_INGRESO = 'INGRESOS POR INGENIERIA ELECTRICA';
export const OTC_CUENTA_PROVISION = 'PROVISION DE INGRESOS POR INGENIERIA ELECTRICA';

function isRealAccount(cat: string): boolean {
  const c = String(cat || '').toUpperCase();
  // Ingreso Real Facturado = Facturación bruta principal (clase 4180 / 4105)
  // Excluye las cuentas de devengo/provisión y las notas/reversiones de cruce
  return (
    (c.includes('INGRESOS POR INGENIERIA') || c.includes('CLIENTES NACIONALES')) &&
    !c.includes('PROVISION') &&
    !c.includes('NO FACTURADO') &&
    !c.includes('DEVENGADO')
  );
}

function isProvAccount(cat: string): boolean {
  const c = String(cat || '').toUpperCase();
  // Ingreso Provisional = Devengo o estimación de periodo no facturado (clase 4199)
  // Ej: 'PROVISION DE INGRESOS POR INGENIERIA ELECTRICA' o 'DEVENGADO PERIODO ACTUAL NO FACTURADO'
  return c.includes('PROVISION') || c.includes('NO FACTURADO');
}

/**
 * Agregación financiera real de la OTC (Opción A: Neto contable exacto igual a la tabla dinámica de Excel).
 * Suma algebraicamente todos los registros del grupo 01 Ingresos (devengados no facturados vs devengados facturados)
 * y los costos reales (02 Costos Directos + 03 Otros Costos).
 */
export function otcAgg(rows: CostoRecord[]): OtcAgg {
  let ing = 0;
  let cos = 0;

  for (const r of rows) {
    const v = Number(r.Valor) || 0;
    const cat = (String(r.Categoria || '') + ' ' + String(r.NombreCuenta || '') + ' ' + String(r.CuentaMayor || '')).toUpperCase();
    const grp = String(r.Grupo || '').toUpperCase();
    
    const isIngreso = r.es_ingreso === true || 
      grp.startsWith('01') ||
      grp.includes('INGRES') ||
      cat.includes('DEVENGADO') ||
      cat.includes('INGRES') ||
      cat.includes('CLIENTES NACIONALES') ||
      cat.includes('DEVOLUCIONES EN VENTAS');

    if (isIngreso) {
      ing += v;
    } else {
      cos += v;
    }
  }

  const ingPositivo = Math.abs(ing);
  const utilidad = ingPositivo - cos;
  const margen = ingPositivo > 0 ? utilidad / ingPositivo : null;

  return { ingresos: ingPositivo, costos: cos, utilidad, margen };
}

export function ingresoElectrica(rows: CostoRecord[]): number {
  return otcAgg(rows).ingresos;
}

export function otcAggMes(rows: CostoRecord[], mes: string): OtcAgg {
  return otcAgg(rows.filter(r => r.Mes === mes));
}

export interface TipoEconomics {
  tipo: string;
  brigadas: number;
  ingreso: number;
  ingXbrig: number;
  costXbrig: number;
}

/**
 * Unit economics por Tipo_Brigada_Operaciones sobre filas SIPREM ya filtradas:
 * ingreso valorizado, # brigadas (cédulas únicas) e ingreso/costo por brigada.
 * Ordenado de mayor a menor ingreso.
 */
export function unitEconomicsPorTipo(rows: RawRecord[]): TipoEconomics[] {
  const tmap: Record<string, { b: Set<unknown>; ing: number; co: number }> = {};
  rows.forEach(r => {
    const t = String(r.Tipo_Brigada_Operaciones || 'Sin tipo');
    if (!tmap[t]) tmap[t] = { b: new Set(), ing: 0, co: 0 };
    tmap[t].b.add(r.Cedula);
    tmap[t].ing += num(r.Ingresos);
    tmap[t].co += num(r.Costo_Operativo);
  });
  return Object.entries(tmap)
    .map(([tipo, v]) => { const nb = v.b.size; return { tipo, brigadas: nb, ingreso: v.ing, ingXbrig: nb ? v.ing / nb : 0, costXbrig: nb ? v.co / nb : 0 }; })
    .sort((a, b) => b.ingreso - a.ingreso);
}

/**
 * Agregado de una ventana de meses (para acumulados dinámicos): suma efectivas/visitas/
 * ingresos y cuenta brigadas (cédulas únicas) sobre las filas cuyo mes (YYYY-MM) está en
 * `meses` y que cumplen el predicado `pred` (típicamente proyecto+zona).
 */
export function aggVentana(rows: RawRecord[], meses: string[], pred: (r: RawRecord) => boolean) {
  const set = new Set(meses);
  const rr = rows.filter(x => set.has(String(x.Fecha || '').slice(0, 7)) && pred(x));
  const ef = rr.reduce((s, x) => s + num(x.Efectivas), 0);
  const vi = rr.reduce((s, x) => s + num(x.Visitas), 0);
  const ing = rr.reduce((s, x) => s + num(x.Ingresos), 0);
  return { ing, ef, vi, efic: vi ? ef / vi : null, brig: new Set(rr.map(x => x.Cedula)).size };
}

export function mesAnterior(m: string | undefined, mesList: string[]): string | null {
  if (!m) return null;
  const i = mesList.indexOf(m);
  return i > 0 ? mesList[i - 1] : null;
}