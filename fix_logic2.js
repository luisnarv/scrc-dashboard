const fs = require('fs');

let page = fs.readFileSync('src/app/operativo/page.tsx', 'utf8');

const regex = /rawF\.forEach\(r => \{\s*const per = esHora \? '\?\?' : vistaEvolutivo === 'mes' \? r\.Fecha\?\.slice\(0, 7\) \|\| '\?\?' : r\.Fecha \|\| '\?\?';\s*if \(per !== '\?\?'\) visitasPorPeriodo\[per\] = \(visitasPorPeriodo\[per\] \|\| 0\) \+ \(Number\(r\.Visitas\) \|\| 0\);\s*\}\);/g;

const replacement = `if (esHora) {
        const rowsH_causales = filtHorario(raw.horario || [], F);
        rowsH_causales.forEach(r => {
          const per = r.Hora || '00:00';
          const vis = (Number(r.Efectivas) || 0) + (Number(r.Fallidas) || 0) + (Number(r.Perdidas) || 0);
          visitasPorPeriodo[per] = (visitasPorPeriodo[per] || 0) + vis;
        });
      } else {
        rawF.forEach(r => {
          const per = vistaEvolutivo === 'mes' ? r.Fecha?.slice(0, 7) || '??' : r.Fecha || '??';
          const vis = (Number(r.Efectivas) || 0) + (Number(r.Fallidas) || 0) + (Number(r.Perdidas) || 0);
          if (per !== '??') visitasPorPeriodo[per] = (visitasPorPeriodo[per] || 0) + vis;
        });
      }`;

page = page.replace(regex, replacement);

fs.writeFileSync('src/app/operativo/page.tsx', page, 'utf8');
console.log('Fixed visitasPorPeriodo logic');
