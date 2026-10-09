const fs = require('fs');

// 1. Update PerdidaRecord in types.ts
let types = fs.readFileSync('src/app/components/utils/types.ts', 'utf8');
if (!types.includes('Hora?: string;')) {
  types = types.replace(/export interface PerdidaRecord \{/, 'export interface PerdidaRecord {\n  Hora?: string;');
  fs.writeFileSync('src/app/components/utils/types.ts', types, 'utf8');
}

// 2. Update queries_v2.ts to select Hora
let queries = fs.readFileSync('src/lib/queries_v2.ts', 'utf8');
queries = queries.replace(
  /mo\.fecha_cierre::text as "Fecha",\s*mo\.zona as "Zona",/,
  `mo.fecha_cierre::text as "Fecha",
        (LPAD(LEAST(22, GREATEST(7, EXTRACT(HOUR FROM mo.hora_fin::time)::int))::text, 2, '0') || ':00') as "Hora",
        mo.zona as "Zona",`
);
fs.writeFileSync('src/lib/queries_v2.ts', queries, 'utf8');

// 3. Update operativo/page.tsx to use p.Hora instead of p.Fecha.slice(11,13)
let page = fs.readFileSync('src/app/operativo/page.tsx', 'utf8');
page = page.replace(
  /const per = esHora \? \(p\.Fecha\?\.slice\(11, 13\) \|\| '00'\) : vistaEvolutivo === 'mes' \? p\.Fecha\?\.slice\(0, 7\) \|\| '\?\?' : p\.Fecha \|\| '\?\?';/g,
  `const per = esHora ? (p.Hora?.slice(0, 2) || '00') : vistaEvolutivo === 'mes' ? p.Fecha?.slice(0, 7) || '??' : p.Fecha || '??';`
);

fs.writeFileSync('src/app/operativo/page.tsx', page, 'utf8');
console.log('Fixed hourly logic');
