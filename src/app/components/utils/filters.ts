import type { RawRecord, CostoRecord, MesRecord, Filters } from './types';

const mesDe = (fecha: unknown) => String(fecha || '').slice(0, 7);

// mes vacío ([]) = sin filtro de mes (equivale al viejo 'ALL')
const mesOK = (m: string, F: Filters) => F.mes.length === 0 || F.mes.includes(m);

// Proceso: 'ALL' (SCR = muestra todo) o 'GESTOR' (solo la brigada 'Gestor Integral Multi').
const BRIG_GESTOR = 'Gestor Integral Multi';
const procesoOK = (brig: unknown, F: Filters) =>
  F.proceso !== 'GESTOR' || String(brig || '') === BRIG_GESTOR;

export function filtRaw(rows: RawRecord[], F: Filters): RawRecord[] {
  return rows.filter(r => {
    if (F.proy !== 'ALL' && r._Proyecto !== F.proy) return false;
    if (F.zona !== 'ALL' && r._Zona !== F.zona && r._ZonaDet !== F.zona) return false;
    if (!mesOK(mesDe(r.Fecha), F)) return false;
    if (F.fecha !== 'ALL' && r.Fecha !== F.fecha) return false;
    if (!procesoOK(r.Tipo_Brigada_Mes, F)) return false;
    return true;
  });
}

// Registros mensuales por técnico (tabla de técnicos): aplica el filtro de Proceso
// sobre la brigada del mes (brigada_homologada).
export function filtMes(rows: MesRecord[], F: Filters): MesRecord[] {
  return rows.filter(r => procesoOK(r.Tipo_Brigada_Mes, F));
}

// Disponibilidad de brigadas (raw.disp): aplica el filtro de Proceso sobre Tipo_Brigada
// (= brigada_homologada). Genérico para preservar el resto de campos del registro.
export function filtDisp<T extends { Tipo_Brigada?: string }>(rows: T[], F: Filters): T[] {
  return rows.filter(r => procesoOK(r.Tipo_Brigada, F));
}

export function filtCos(rows: CostoRecord[], F: Filters): CostoRecord[] {
  return rows.filter(r => {
    if (F.proy !== 'ALL' && r._Proyecto !== F.proy) return false;
    if (!mesOK(String(r.Mes || ''), F)) return false;
    // Proceso: si es 'GESTOR', solo filas OTC de esa brigada (ingresos/costos sin
    // brigada quedan fuera). En 'ALL'/SCR pasa todo.
    if (!procesoOK(r.Brigada, F)) return false;
    return true;
  });
}

/**
 * Predicado proyecto+zona sobre los campos ya normalizados (_Proyecto/_Zona/_ZonaDet).
 * Sirve para RawRecord y CostoRecord por igual; no aplica mes/fecha/proceso.
 */
export const matchProyZona = (F: Filters) =>
  (r: { _Proyecto?: string; _Zona?: string; _ZonaDet?: string }): boolean =>
    (F.proy === 'ALL' || r._Proyecto === F.proy) &&
    (F.zona === 'ALL' || r._Zona === F.zona || r._ZonaDet === F.zona);

export function normProy(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (/sur/i.test(s)) return 'Sur';
  if (/norte|centro/i.test(s)) return 'Norte-Centro';
  return null;
}

export function normZonaDet(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  if (!s || s === 'nan') return null;
  if (/\bsur\b/.test(s)) return 'Sur';
  if (/\bcentro\b/.test(s)) return 'Centro';
  if (/\bnorte\b/.test(s)) return 'Norte';
  return null;
}

// ---- Ventanas para acumulados dinámicos ----

/**
 * Ventana previa equivalente: los N meses inmediatamente anteriores al primer mes
 * seleccionado, donde N = cantidad de meses seleccionados. Puede devolver menos de N
 * si no hay suficiente historia (la vista debe avisar si el bimestre queda incompleto).
 */
export function ventanaPrevia(sel: string[], mesList: string[]): string[] {
  if (!sel.length) return [];
  const n = sel.length;
  const startIdx = mesList.indexOf([...sel].sort()[0]);
  if (startIdx <= 0) return [];
  return mesList.slice(Math.max(0, startIdx - n), startIdx);
}