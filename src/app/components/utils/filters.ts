import type { RawRecord, CostoRecord, OrdenDetalle, Filters } from './types';

const mesDe = (fecha: unknown) => String(fecha || '').slice(0, 7);

// mes vacío ([]) = sin filtro de mes (equivale al viejo 'ALL')
const mesOK = (m: string, F: Filters) => F.mes.length === 0 || F.mes.includes(m);

export function filtRaw(rows: RawRecord[], F: Filters): RawRecord[] {
  return rows.filter(r => {
    if (F.proy !== 'ALL' && r._Proyecto !== F.proy) return false;
    if (F.zona !== 'ALL' && r._Zona !== F.zona && r._ZonaDet !== F.zona) return false;
    if (!mesOK(mesDe(r.Fecha), F)) return false;
    if (F.fecha !== 'ALL' && r.Fecha !== F.fecha) return false;
    return true;
  });
}

export function filtCos(rows: CostoRecord[], F: Filters): CostoRecord[] {
  return rows.filter(r => {
    if (F.proy !== 'ALL' && r._Proyecto !== F.proy) return false;
    if (F.zona !== 'ALL' && r._Zona !== F.zona) return false;
    if (!mesOK(String(r.Mes || ''), F)) return false;
    return true;
  });
}

export function filtCosSinMes(rows: CostoRecord[], F: Filters): CostoRecord[] {
  return rows.filter(r => {
    if (F.proy !== 'ALL' && r._Proyecto !== F.proy) return false;
    if (F.zona !== 'ALL' && r._Zona !== F.zona) return false;
    return true;
  });
}

export function filtDet(rows: OrdenDetalle[], F: Filters): OrdenDetalle[] {
  return rows.filter(d => {
    if (F.proy !== 'ALL' && d._Proyecto !== F.proy) return false;
    if (F.zona !== 'ALL' && d._Zona !== F.zona && d._ZonaDet !== F.zona) return false;
    if (!mesOK(mesDe(d.Fecha), F)) return false;
    if (F.fecha !== 'ALL' && d.Fecha !== F.fecha) return false;
    return true;
  });
}

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

/** Meses efectivamente seleccionados, ordenados. Si no hay selección → todos los meses. */
export function mesesSel(F: Filters, mesList: string[]): string[] {
  return F.mes.length ? [...F.mes].sort() : [...mesList];
}

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