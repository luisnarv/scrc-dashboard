import type { CostoRecord, OtcAgg, RawRecord } from './types';
import { num } from './formatters';

// Ingreso de INGENIERÍA ELÉCTRICA del OTC = la cuenta 4180 'INGRESOS POR INGENIERIA
// ELECTRICA' (factura definitiva). Match EXACTO: excluye provisión (4199), consorcios
// (4190) y devoluciones (4175). El valor ya viene POSITIVO desde la query.
export const OTC_CUENTA_INGRESO = 'INGRESOS POR INGENIERIA ELECTRICA';

/** Suma del ingreso de ingeniería eléctrica (cuenta única) sobre filas OTC ya filtradas. */
export function ingresoElectrica(rows: CostoRecord[]): number {
  return rows
    .filter(r => String(r.Categoria || '').toUpperCase() === OTC_CUENTA_INGRESO)
    .reduce((s, r) => s + (Number(r.Valor) || 0), 0);
}

export function otcAgg(rows: CostoRecord[]): OtcAgg {
  const ing = ingresoElectrica(rows);
  // Costos = todo lo que NO es una cuenta de ingreso (clase 4 lleva 'ingres' en el nombre).
  const cos = rows
    .filter(r => !String(r.Categoria || '').toLowerCase().includes('ingres'))
    .reduce((s, r) => s + (Number(r.Valor) || 0), 0);
  return { ingresos: ing, costos: cos, utilidad: ing - cos, margen: ing ? (ing - cos) / ing : null };
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