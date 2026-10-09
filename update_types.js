const fs = require('fs');

let types = fs.readFileSync('src/app/components/utils/types.ts', 'utf8');

if (!types.includes('PerdidaRecord')) {
  types += `
export interface PerdidaRecord {
  Fecha?: string;
  Proyecto?: string;
  Zona?: string;
  Brigada?: string;
  Tecnico?: string;
  Accion?: string;
  Subaccion?: string;
  Observacion?: string;
  Estado?: string;
  _Proyecto?: string;
  _Zona?: string;
  _ZonaDet?: string;
}
`;
}

types = types.replace(
  /export interface RawData \{[\s\S]*?\}/,
  (match) => {
    if (!match.includes('perdidas: PerdidaRecord[]')) {
      return match.replace('}', '  perdidas: PerdidaRecord[];\n}');
    }
    return match;
  }
);
fs.writeFileSync('src/app/components/utils/types.ts', types, 'utf8');

let cacheTypes = fs.readFileSync('src/app/lib/cache/types.ts', 'utf8');
if (!cacheTypes.includes('PerdidaRecord')) {
  cacheTypes = cacheTypes.replace(/HorarioRecord,/, 'HorarioRecord, PerdidaRecord,');
  cacheTypes = cacheTypes.replace(
    /export interface MonthPayload \{[\s\S]*?\}/,
    (match) => {
      if (!match.includes('perdidas: PerdidaRecord[]')) {
        return match.replace('}', '  perdidas: PerdidaRecord[];\n}');
      }
      return match;
    }
  );
  fs.writeFileSync('src/app/lib/cache/types.ts', cacheTypes, 'utf8');
}
console.log('Types updated');
