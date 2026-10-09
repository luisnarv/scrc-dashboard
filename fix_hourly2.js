const fs = require('fs');

let page = fs.readFileSync('src/app/operativo/page.tsx', 'utf8');

// Fix the key used for causales storage when esHora is true
page = page.replace(
  /const per = esHora \? \(p\.Hora\?\.slice\(0, 2\) \|\| '00'\) : vistaEvolutivo === 'mes' \? p\.Fecha\?\.slice\(0, 7\) \|\| '\?\?' : p\.Fecha \|\| '\?\?';/g,
  `const per = esHora ? (p.Hora || '00:00') : vistaEvolutivo === 'mes' ? p.Fecha?.slice(0, 7) || '??' : p.Fecha || '??';`
);

fs.writeFileSync('src/app/operativo/page.tsx', page, 'utf8');
console.log('Fixed hourly grouping matching');
