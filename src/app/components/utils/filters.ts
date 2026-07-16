import type { RawRecord, CostoRecord, OrdenDetalle, Filters } from './types';

export function filtRaw(rows: RawRecord[], F: Filters): RawRecord[] {
  return rows.filter(r => {
    if (F.proy !== 'ALL' && r._Proyecto !== F.proy) return false;
    if (F.zona !== 'ALL' && r._Zona !== F.zona && r._ZonaDet !== F.zona) return false;
    if (F.mes !== 'ALL' && !String(r.Fecha || '').startsWith(F.mes)) return false;
    if (F.fecha !== 'ALL' && r.Fecha !== F.fecha) return false;
    return true;
  });
}

export function filtCos(rows: CostoRecord[], F: Filters): CostoRecord[] {
  return rows.filter(r => {
    if (F.proy !== 'ALL' && r._Proyecto !== F.proy) return false;
    if (F.zona !== 'ALL' && r._Zona !== F.zona) return false;
    if (F.mes !== 'ALL' && r.Mes !== F.mes) return false;
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
    if (F.mes !== 'ALL' && !String(d.Fecha || '').startsWith(F.mes)) return false;
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
