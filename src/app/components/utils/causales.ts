import type { PerdidaRecord } from './types';

// Lógica pura del gráfico "Evolutivo de Causales de No Efectividad (Fallidas y Pérdidas)".
// Vive aparte de la página para poder validarla con los bots (scripts/bot-causales-*.mjs).
//
// Cada registro de entrada es una agrupación de órdenes (Cantidad; si falta, vale 1) con su Estado:
// 'Fallida' o 'Perdida'. El filtro "Estado" del gráfico las separa o las suma.

export type VistaEvolutivo = 'mes' | 'dia' | 'hora';
export type EstadoCausal = 'TODAS' | 'Fallida' | 'Perdida';

export const OTRAS_CAUSALES = 'Otras causales';
export const COLUMNA_CAUSAL = 'Causal (Acción / Subacción)';
export const ESTADOS_CAUSAL: { value: EstadoCausal; label: string }[] = [
  { value: 'TODAS', label: 'Todas' },
  { value: 'Fallida', label: 'Fallidas' },
  { value: 'Perdida', label: 'Pérdidas' },
];
export const tituloEstado = (e: EstadoCausal) =>
  e === 'Fallida' ? 'Fallidas' : e === 'Perdida' ? 'Pérdidas' : 'Fallidas y Pérdidas';

export interface CausalesSerie {
  label: string;
  data: number[];
  /** Desglose por estado de cada punto (suman `data`): para identificar fallida vs pérdida en el tooltip. */
  fallidas: number[];
  perdidas: number[];
  /** Órdenes de cada periodo SIN acumular (con `acumulado` falso es igual a `data`). Alimenta la tabla. */
  periodo: number[];
}

export interface CausalesTabla {
  columns: string[];
  categoryIndex: number;
  firstColMinWidth: number;
  /** Posición de cada columna fija (varía según el estado filtrado). */
  col: { total: number; fallidas: number | null; perdidas: number | null; part: number; visitas: number; primerPeriodo: number };
  hierarchicalRows: FilaCausal[];
  /**
   * Filas que reemplazan a una categoría cuando se filtra SOLO por ella: para "Otras causales", una fila
   * por cada causal que agrupa (con su detalle por brigada), de modo que se vean todas.
   */
  categoryDetail: Record<string, FilaCausal[]>;
}

export interface FilaCausal { row: (string | number)[]; children: { row: (string | number)[] }[] }

export interface CausalesResultado {
  topCausales: string[];
  labels: string[];
  series: CausalesSerie[];
  total: number;
  totalFallidas: number;
  totalPerdidas: number;
  /** Total de no efectivas por periodo (acumulado hasta ese periodo si `acumulado`). */
  perdidasPorPeriodo: Record<string, number>;
  /** Visitas por periodo (acumuladas hasta ese periodo si `acumulado`). */
  visitasPorPeriodo: Record<string, number>;
  /** true = cada punto es el acumulado desde el primer periodo (evolutivo horario). */
  acumulado: boolean;
  tableData: CausalesTabla;
}

const limpiar = (v: unknown, vacio: string) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s || vacio;
};

export const cantidadDe = (p: PerdidaRecord) => {
  const n = Number(p.Cantidad);
  return Number.isFinite(n) && p.Cantidad !== undefined && p.Cantidad !== null ? n : 1;
};
export const sumaCantidad = (rows: PerdidaRecord[]) => rows.reduce((s, p) => s + cantidadDe(p), 0);
export const esFallida = (p: PerdidaRecord) => String(p.Estado || '') === 'Fallida';

export const filtEstado = (rows: PerdidaRecord[], estado: EstadoCausal): PerdidaRecord[] =>
  estado === 'TODAS' ? rows : rows.filter(p => String(p.Estado || '') === estado);

export const causalKey = (p: PerdidaRecord) =>
  `${limpiar(p.Accion, 'SIN ACCION')} / ${limpiar(p.Subaccion, 'SIN SUBACCION')}`;

export const periodoDe = (p: PerdidaRecord, vista: VistaEvolutivo): string => {
  if (vista === 'hora') return p.Hora || '00:00';
  const f = String(p.Fecha || '');
  return vista === 'mes' ? f.slice(0, 7) : f.slice(0, 10);
};

const pct = (num: number, den: number) => (den > 0 ? `${(num / den * 100).toFixed(1)}%` : '—');
const etiqueta = (per: string, vista: VistaEvolutivo) => (vista === 'hora' ? per.slice(0, 2) + 'h' : per);

/**
 * Agrupa los registros (ya filtrados por proyecto/zona/mes/fecha/proceso) por causal y periodo.
 * @param estado  'TODAS' suma Fallidas+Pérdidas; 'Fallida' o 'Perdida' deja solo ese estado.
 * @param baseLabels  periodos que ya muestra el eje X del evolutivo; se completan con los periodos
 *                    que traigan registros para que ninguno se pierda por no estar en rawRecords.
 * @param visitasPorPeriodo  efectivas+fallidas+perdidas por periodo (denominador de "% s/ Visitas").
 */
export function buildCausales(
  registros: PerdidaRecord[],
  vista: VistaEvolutivo,
  baseLabels: string[],
  visitasPorPeriodo: Record<string, number>,
  estado: EstadoCausal = 'TODAS',
  topN = 6,
  acumulado = false,
): CausalesResultado {
  const perdidas = filtEstado(registros, estado);
  const conteo: Record<string, number> = {};
  perdidas.forEach(p => { const k = causalKey(p); conteo[k] = (conteo[k] || 0) + cantidadDe(p); });
  // Desempate alfabético: el top no cambia entre renders si dos causales empatan.
  const topCausales = Object.entries(conteo)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(e => e[0]);
  const enTop = new Set(topCausales);
  const grupoDe = (p: PerdidaRecord) => (enTop.has(causalKey(p)) ? causalKey(p) : OTRAS_CAUSALES);

  const periodos = new Set(baseLabels);
  const porPeriodo: Record<string, Record<string, { f: number; p: number }>> = {};
  const perdidasPorPeriodo: Record<string, number> = {};
  perdidas.forEach(p => {
    const per = periodoDe(p, vista);
    if (!per) return;
    periodos.add(per);
    const k = grupoDe(p);
    const celda = ((porPeriodo[per] ??= {})[k] ??= { f: 0, p: 0 });
    if (esFallida(p)) celda.f += cantidadDe(p); else celda.p += cantidadDe(p);
    perdidasPorPeriodo[per] = (perdidasPorPeriodo[per] || 0) + cantidadDe(p);
  });
  const labels = vista === 'hora' ? baseLabels.slice() : Array.from(periodos).sort();
  if (vista === 'hora') { periodos.forEach(h => { if (!labels.includes(h)) labels.push(h); }); labels.sort(); }

  const grupos = [...topCausales];
  if (perdidas.some(p => !enTop.has(causalKey(p)))) grupos.push(OTRAS_CAUSALES);
  // Acumulado (evolutivo horario): cada punto suma todo lo ocurrido desde el primer periodo hasta ese periodo.
  const acum = (a: number[]) => { let s = 0; return a.map(v => (s += v)); };
  const acumRec = (rec: Record<string, number>) => {
    let s = 0;
    const o: Record<string, number> = {};
    labels.forEach(l => { s += rec[l] || 0; o[l] = s; });
    return o;
  };
  const series: CausalesSerie[] = grupos.map(g => {
    const f = labels.map(per => porPeriodo[per]?.[g]?.f || 0);
    const pe = labels.map(per => porPeriodo[per]?.[g]?.p || 0);
    const periodo = f.map((x, i) => x + pe[i]);
    return acumulado
      ? { label: g, data: acum(periodo), fallidas: acum(f), perdidas: acum(pe), periodo }
      : { label: g, data: periodo, fallidas: f, perdidas: pe, periodo };
  });
  const perdidasPorPeriodoOut = acumulado ? acumRec(perdidasPorPeriodo) : perdidasPorPeriodo;
  const visitasPorPeriodoOut = acumulado ? acumRec(visitasPorPeriodo) : visitasPorPeriodo;

  const total = sumaCantidad(perdidas);
  const totalFallidas = sumaCantidad(perdidas.filter(esFallida));
  const totalPerdidas = total - totalFallidas;
  const totalVisitas = labels.reduce((s, per) => s + (visitasPorPeriodo[per] || 0), 0);

  // ---- Tabla: una fila por causal (misma etiqueta que la serie, para que el filtro del modal
  // por categoría funcione) y, desplegable, el detalle por brigada. Columnas por periodo.
  // Solo se muestra la columna del estado filtrado; con 'Todas' aparecen Fallidas y Pérdidas.
  const verF = estado !== 'Perdida';
  const verP = estado !== 'Fallida';
  const fila = (items: PerdidaRecord[], nombre: string, base: number, vis: string): (string | number)[] => {
    const tot = sumaCantidad(items);
    const f = sumaCantidad(items.filter(esFallida));
    const r: (string | number)[] = [nombre, tot];
    if (verF) r.push(f);
    if (verP) r.push(tot - f);
    r.push(pct(tot, base), vis);
    labels.forEach(per => r.push(sumaCantidad(items.filter(p => periodoDe(p, vista) === per))));
    return r;
  };
  // Detalle de un conjunto de registros: por brigada, o por causal (para "Otras causales").
  const detallePor = (items: PerdidaRecord[], clave: (p: PerdidaRecord) => string) => {
    const grupo = new Map<string, PerdidaRecord[]>();
    items.forEach(p => {
      const k = clave(p);
      if (!grupo.has(k)) grupo.set(k, []);
      grupo.get(k)!.push(p);
    });
    return Array.from(grupo.entries())
      .map(([k, its]) => ({ its, k, n: sumaCantidad(its) }))
      .sort((a, b) => b.n - a.n || a.k.localeCompare(b.k));
  };
  const porBrigada = (p: PerdidaRecord) => limpiar(p.Brigada, 'Sin brigada');
  const hierarchicalRows: FilaCausal[] = grupos.map(g => {
    const items = perdidas.filter(p => grupoDe(p) === g);
    // El detalle de una causal es por brigada; el de "Otras causales" lista las causales que agrupa.
    const children = detallePor(items, g === OTRAS_CAUSALES ? causalKey : porBrigada)
      .map(({ its, k }) => ({ row: fila(its, k, sumaCantidad(items), '—') }));
    return { row: fila(items, g, total, pct(sumaCantidad(items), totalVisitas)), children };
  });
  // Al filtrar solo por "Otras causales" la tabla debe mostrar TODAS las causales que agrupa, cada una como
  // fila propia (con su participación sobre el total y su detalle por brigada).
  const categoryDetail: Record<string, FilaCausal[]> = {};
  if (grupos.includes(OTRAS_CAUSALES)) {
    const otras = perdidas.filter(p => grupoDe(p) === OTRAS_CAUSALES);
    categoryDetail[OTRAS_CAUSALES] = detallePor(otras, causalKey).map(({ its, k }) => ({
      row: fila(its, k, total, pct(sumaCantidad(its), totalVisitas)),
      children: detallePor(its, porBrigada).map(({ its: bi, k: b }) => ({ row: fila(bi, b, sumaCantidad(its), '—') })),
    }));
  }

  const columns = [COLUMNA_CAUSAL, 'Total'];
  if (verF) columns.push('Fallidas');
  if (verP) columns.push('Pérdidas');
  columns.push('% Part.', '% s/ Visitas');
  const primerPeriodo = columns.length;
  labels.forEach(l => columns.push(etiqueta(l, vista)));

  let c = 2;
  const col = {
    total: 1,
    fallidas: verF ? c++ : null,
    perdidas: verP ? c++ : null,
    part: c++,
    visitas: c++,
    primerPeriodo,
  };

  return {
    topCausales, labels, series, total, totalFallidas, totalPerdidas,
    perdidasPorPeriodo: perdidasPorPeriodoOut, visitasPorPeriodo: visitasPorPeriodoOut, acumulado,
    tableData: { columns, categoryIndex: 0, firstColMinWidth: 300, col, hierarchicalRows, categoryDetail },
  };
}
