const fs = require('fs');

// 1. Fix types.ts
let types = fs.readFileSync('src/app/components/utils/types.ts', 'utf8');
types = types.replace(/det:\s*OrdenDetalle\[\];\s*/, '');
fs.writeFileSync('src/app/components/utils/types.ts', types, 'utf8');

// 2. Fix filters.ts
let filters = fs.readFileSync('src/app/components/utils/filters.ts', 'utf8');
filters = filters.replace(/new Set\(fFilter\.split/g, 'new Set<string>(fFilter.split');
fs.writeFileSync('src/app/components/utils/filters.ts', filters, 'utf8');

// 3. Fix remoteSource.ts
let remote = fs.readFileSync('src/app/lib/cache/remoteSource.ts', 'utf8');
remote = remote.replace(/horarioTec:\s*\[\]/g, 'horarioTec: [], perdidas: []');
remote = remote.replace(/horarioTec:\s*json\.horarioTec\s*\|\|\s*\[\],/g, 'horarioTec: json.horarioTec || [], perdidas: json.perdidas || [],');
fs.writeFileSync('src/app/lib/cache/remoteSource.ts', remote, 'utf8');

// 4. Fix operativo/page.tsx
let page = fs.readFileSync('src/app/operativo/page.tsx', 'utf8');
page = page.replace(
  /chartCausales, tableDataCausales,/,
  'chartCausales, tableDataCausales, topCausales,'
);

// also fix rowsCausales format from `{ cols: [...] }` to `[...]`
page = page.replace(
  /return \{\n\s*cols: \[\n(.*?)\n\s*\]\n\s*\};/gs,
  'return [\n$1\n          ];'
);

// fix the JSX references
page = page.replace(
  /title=\{\`Evolutivo \$\{winLbl\} de Causales de No Efectividad \(Perdidas\)\`\}/g,
  'title={`Evolutivo ${d.periodoLabel} de Causales de No Efectividad (Perdidas)`}'
);
page = page.replace(
  /subtitle=\{\`Top \$\{topCausales\.length\} causales \| Muestra cantidad y su participacin porcentual\` \}/g,
  'subtitle={`Top ${d.topCausales.length} causales | Muestra cantidad y su participación porcentual`}'
);

fs.writeFileSync('src/app/operativo/page.tsx', page, 'utf8');
console.log('Fixed TS errors');
