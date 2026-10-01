const fs = require('fs');
let code = fs.readFileSync('src/app/operativo/page.tsx', 'utf8');

// 1. Layout: change grid to column flex
code = code.replace(
  /gridTemplateColumns: 'repeat\(auto-fit, minmax\(min\(320px, 100%\), 1fr\)\)'/,
  "flexDirection: 'column'"
);

// 2. periodTotalsTipos to Effectiveness %
code = code.replace(
  /const periodTotalsTipos = periodosListTipos\.map\(p => \{\s+if \(isFuturePeriod\(p\)\) return null;\s+return tiposArr\.reduce\(\(sum, t\) => \{\s+const val = vistaEvolutivo === 'mes'\s+\? \(byTypeMonth\[t\]\?\.\[p\] \|\| 0\)\s+: \(byTypeDay\[t\]\?\.\[p\]\?\.efec \|\| 0\);\s+return sum \+ val;\s+\}, 0\);\s+\}\);/g,
  `const periodTotalsEfectivas = periodosListTipos.map(p => {
      if (isFuturePeriod(p)) return null;
      return tiposArr.reduce((sum, t) => {
        const val = vistaEvolutivo === 'mes'
          ? (byTypeMonth[t]?.[p] || 0)
          : (byTypeDay[t]?.[p]?.efec || 0);
        return sum + val;
      }, 0);
    });

    const periodTotalsTipos = periodosListTipos.map(p => {
      if (isFuturePeriod(p)) return null;
      let sumE = 0;
      let sumT = 0;
      tiposArr.forEach(t => {
        if (vistaEvolutivo === 'mes') {
          sumE += byTypeMonth[t]?.[p] || 0;
          sumT += byTypeMonthOrd[\`\${t}__\${p}\`] || 0;
        } else {
          const bd = byTypeDay[t]?.[p];
          if (bd) {
            sumE += bd.efec;
            sumT += bd.efec + bd.fall + bd.perd;
          }
        }
      });
      return sumT > 0 ? (sumE / sumT) * 100 : 0;
    });`
);

// 3. granTotalEfectivas should use periodTotalsEfectivas
code = code.replace(
  /const granTotalEfectivas = periodTotalsTipos\.reduce\(\(s: number, v\) => s \+ \(v \|\| 0\), 0\);/g,
  `const granTotalEfectivas = periodTotalsEfectivas.reduce((s: number, v) => s + (v || 0), 0);`
);

// 4. Update the chartTipos title for Y-axis
code = code.replace(
  /title: \{ display: true, text: 'Órdenes efectivas' \}/g,
  "title: { display: true, text: 'Efectividad (%)' }, ticks: { callback: (v: any) => v + '%' }"
);
code = code.replace(
  /title: \{ display: true, text: '"rdenes efectivas' \}/g,
  "title: { display: true, text: 'Efectividad (%)' }, ticks: { callback: (v: any) => v + '%' }"
);

// 5. Update chartTipos dataset label
code = code.replace(
  /label: 'Total Efectivas \(Suma brigadas\)'/g,
  "label: 'Efectividad General (%)'"
);

// 6. Update datasetsTiposModal
code = code.replace(
  /const rawData = periodosListTipos\.map\(p => \{\s+if \(isFuturePeriod\(p\)\) return null;\s+return vistaEvolutivo === 'mes'\s+\? \(byTypeMonth\[t\]\?\.\[p\] \|\| 0\)\s+: \(byTypeDay\[t\]\?\.\[p\]\?\.efec \|\| 0\);\s+\}\);/g,
  `const rawData = periodosListTipos.map(p => {
          if (isFuturePeriod(p)) return null;
          let e = 0, tot = 0;
          if (vistaEvolutivo === 'mes') {
            e = byTypeMonth[t]?.[p] || 0;
            tot = byTypeMonthOrd[\`\${t}__\${p}\`] || 0;
          } else {
            e = byTypeDay[t]?.[p]?.efec || 0;
            tot = e + (byTypeDay[t]?.[p]?.fall || 0) + (byTypeDay[t]?.[p]?.perd || 0);
          }
          return tot > 0 ? (e / tot) * 100 : 0;
        });`
);

// 7. Update tooltips to show %
code = code.replace(
  /return `\$\{ctx\.dataset\.label\}: \$\{fmtN\(val\)\} efectivas`;/g,
  "return `${ctx.dataset.label}: ${Number(val).toFixed(1)}%`;"
);
code = code.replace(
  /return `\$\{ctx\.dataset\.label\}: \$\{fmtN\(Number\(ctx\.raw\) \|\| 0\)\} efectivas`;/g,
  "return `${ctx.dataset.label}: ${Number(ctx.raw || 0).toFixed(1)}%`;"
);

// 8. Fix picoFormatted for Effectiveness
code = code.replace(
  /const picoFormatted = `\$\{picoPeriodoKey\} — \$\{fmtN\(Math\.max\(0, picoPeriodoVal\)\)\}`;/g,
  "const picoFormatted = `${picoPeriodoKey} — ${Math.max(0, picoPeriodoVal).toFixed(1)}%`;"
);
code = code.replace(
  /const picoFormatted = `\$\{picoPeriodoKey\}  \$\{fmtN\(Math\.max\(0, picoPeriodoVal\)\)\}`;/g,
  "const picoFormatted = `${picoPeriodoKey} — ${Math.max(0, picoPeriodoVal).toFixed(1)}%`;"
);

// 9. Update the main chart titles to say "Evolutivo de efectividad"
code = code.replace(
  /"Evolutivo Mensual de Efectivas por Tipo"/g,
  '"Evolutivo Mensual de Efectividad por Tipo"'
);
code = code.replace(
  /"Evolutivo Horario de Efectivas por Tipo"/g,
  '"Evolutivo Horario de Efectividad por Tipo"'
);
code = code.replace(
  /"Evolutivo Diario de Efectivas por Tipo"/g,
  '"Evolutivo Diario de Efectividad por Tipo"'
);
code = code.replace(
  /"Suma total de órdenes efectivas por franja horaria/g,
  '"Porcentaje de efectividad por franja horaria'
);
code = code.replace(
  /"Suma total de órdenes efectivas por día/g,
  '"Porcentaje de efectividad por día'
);
code = code.replace(
  /"Suma total de órdenes efectivas por mes/g,
  '"Porcentaje de efectividad por mes'
);


fs.writeFileSync('src/app/operativo/page.tsx', code, 'utf8');
console.log('Fixed');
