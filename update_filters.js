const fs = require('fs');

let filtersCode = fs.readFileSync('src/app/components/utils/filters.ts', 'utf8');
if (!filtersCode.includes('filtPerdidas')) {
  filtersCode += `
export function filtPerdidas(rows: any[], F: any): any[] {
  const fFilter = F.fecha;
  const isAllFecha = fFilter === 'ALL';
  const fSet = (!isAllFecha && fFilter && fFilter.includes(','))
    ? new Set(fFilter.split(',').filter(Boolean))
    : null;

  return rows.filter(r => {
    if (F.proy !== 'ALL' && r._Proyecto !== F.proy) return false;
    if (F.zona !== 'ALL' && r._Zona !== F.zona && r._ZonaDet !== F.zona) return false;
    // F.mes already filtered by the Month cache usually, but to be sure:
    if (F.mes.length > 0 && !F.mes.includes(String(r.Fecha || '').slice(0, 7))) return false;
    if (!isAllFecha) {
      if (!fFilter) return false;
      const fOnly = String(r.Fecha || '').trim().slice(0, 10);
      if (!fechaMatches(fOnly, fFilter, fSet)) return false;
    }
    if (F.proceso === 'GESTOR' && String(r.Brigada || '') !== 'Gestor Integral Multi') return false;
    return true;
  });
}
`;
  fs.writeFileSync('src/app/components/utils/filters.ts', filtersCode, 'utf8');
}
console.log('filters updated');
