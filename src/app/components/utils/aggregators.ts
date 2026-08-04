import type { CostoRecord, OtcAgg } from './types';

// Ingreso de INGENIERÍA ELÉCTRICA del OTC. Se toma por subcadena para captar TANTO
// la factura definitiva (4180 'INGRESOS POR INGENIERIA ELECTRICA') COMO la PROVISIÓN
// (4199 'PROVISION DE INGRESOS POR INGENIERIA ELECTRICA'), que es como se registra el
// ingreso de los meses aún no facturados (p.ej. junio, todo en provisión). Excluye
// consorcios (4190) y devoluciones (4175). El valor ya viene POSITIVO desde la query.
export const OTC_CUENTA_INGRESO = 'INGENIERIA ELECTRICA';

export function otcAgg(rows: CostoRecord[]): OtcAgg {
  const ing = rows
    .filter(r => String(r.Categoria || '').toUpperCase().includes(OTC_CUENTA_INGRESO))
    .reduce((s, r) => s + (Number(r.Valor) || 0), 0);
  // Costos = todo lo que NO es una cuenta de ingreso (clase 4 lleva 'ingres' en el nombre).
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