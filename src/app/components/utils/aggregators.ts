import type { CostoRecord, OtcAgg } from './types';

export function otcAgg(rows: CostoRecord[]): OtcAgg {
  const ing = rows
    .filter(r => String(r.Categoria || '').toLowerCase().includes('ingres'))
    .reduce((s, r) => s + (Number(r.Valor) || 0), 0);
  const cos = rows
    .filter(r => !String(r.Categoria || '').toLowerCase().includes('ingres'))
    .reduce((s, r) => s + (Number(r.Valor) || 0), 0);
  return { ingresos: ing, costos: cos, utilidad: ing - cos, margen: ing ? (ing - cos) / ing : null };
}

export function otcAggMes(rows: CostoRecord[], mes: string): OtcAgg {
  return otcAgg(rows.filter(r => r.Mes === mes));
}

/** Agrega OTC sobre un conjunto de meses (para ventanas / acumulados). */
export function otcAggMeses(rows: CostoRecord[], meses: string[]): OtcAgg {
  const set = new Set(meses);
  return otcAgg(rows.filter(r => set.has(String(r.Mes || ''))));
}

export function mesAnterior(m: string | undefined, mesList: string[]): string | null {
  if (!m) return null;
  const i = mesList.indexOf(m);
  return i > 0 ? mesList[i - 1] : null;
}