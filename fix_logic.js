const fs = require('fs');

let page = fs.readFileSync('src/app/operativo/page.tsx', 'utf8');

const causalesLogic = `
      // --- NUEVO: Evolutivo de Causales de No Efectividad ---
      // Calcular totales generales
      const totalPerdidasFull = perdidasF.length;
      let totalVisitasFull = 0;
      rawF.forEach(r => { totalVisitasFull += Number(r.Visitas) || 0; });

      // Agrupar por causal globalmente para hallar el Top N
      const causalCounts: Record<string, number> = {};
      perdidasF.forEach(p => {
        const accion = p.Accion || 'SIN ACCION';
        const subaccion = p.Subaccion || 'SIN SUBACCION';
        const key = accion + ' / ' + subaccion;
        causalCounts[key] = (causalCounts[key] || 0) + 1;
      });

      const topCausales = Object.entries(causalCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(e => e[0]);
      const COLORS_CAUSALES = ['#e53935', '#d81b60', '#8e24aa', '#5e35b1', '#3949ab', '#1e88e5'];

      // Estructura para el grfico: periodos (X) y causales (Lneas)
      const causalPeriodCounts: Record<string, Record<string, number>> = {};
      const perdidasPorPeriodo: Record<string, number> = {};
      const visitasPorPeriodo: Record<string, number> = {};

      perdidasF.forEach(p => {
        const per = esHora ? (p.Fecha?.slice(11, 13) || '00') : vistaEvolutivo === 'mes' ? p.Fecha?.slice(0, 7) || '??' : p.Fecha || '??';
        if (!causalPeriodCounts[per]) causalPeriodCounts[per] = {};
        perdidasPorPeriodo[per] = (perdidasPorPeriodo[per] || 0) + 1;
        
        const accion = p.Accion || 'SIN ACCION';
        const subaccion = p.Subaccion || 'SIN SUBACCION';
        let key = accion + ' / ' + subaccion;
        if (!topCausales.includes(key)) key = 'Otras causales';
        causalPeriodCounts[per][key] = (causalPeriodCounts[per][key] || 0) + 1;
      });

      rawF.forEach(r => {
        const per = esHora ? '??' : vistaEvolutivo === 'mes' ? r.Fecha?.slice(0, 7) || '??' : r.Fecha || '??';
        if (per !== '??') visitasPorPeriodo[per] = (visitasPorPeriodo[per] || 0) + (Number(r.Visitas) || 0);
      });

      const xLabelsCausales = esHora ? HORAS_VISIBLES : vistaEvolutivo === 'mes' ? mesesArr : dias;

      const datasetsCausales = topCausales.map((c, i) => {
        const data = xLabelsCausales.map(per => {
          const val = causalPeriodCounts[per]?.[c] || 0;
          return val;
        });
        return {
          label: c,
          data,
          borderColor: COLORS_CAUSALES[i % COLORS_CAUSALES.length],
          backgroundColor: COLORS_CAUSALES[i % COLORS_CAUSALES.length],
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5
        };
      });

      // Dataset "Otras"
      datasetsCausales.push({
        label: 'Otras causales',
        data: xLabelsCausales.map(per => causalPeriodCounts[per]?.['Otras causales'] || 0),
        borderColor: '#9e9e9e',
        backgroundColor: '#9e9e9e',
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 5
      });

      const chartCausales = {
        type: 'line',
        data: { labels: esHora ? xLabelsCausales.map(h => h.slice(0,2)+'h') : xLabelsCausales, datasets: datasetsCausales },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
            tooltip: {
              callbacks: {
                label: function(ctx: any) {
                  const val = ctx.raw;
                  const per = xLabelsCausales[ctx.dataIndex];
                  const totPerd = perdidasPorPeriodo[per] || 0;
                  const part = totPerd > 0 ? (val / totPerd * 100).toFixed(1) : '0.0';
                  const vis = visitasPorPeriodo[per] || 0;
                  const peso = vis > 0 ? (val / vis * 100).toFixed(1) + '%' : (esHora ? 'N/A' : '0.0%');
                  return ctx.dataset.label + ': ' + val + ' perdidas (' + part + '% part. | ' + peso + ' sobre ejec.)';
                }
              }
            }
          },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, grid: { color: isDark ? '#333' : '#eee' } }
          }
        }
      };

      const rowsCausales = perdidasF.map(p => {
        return [
          p.Brigada || '-',
          p.Tecnico || '-',
          p.Estado || 'PERDIDO',
          p.Accion || '-',
          p.Subaccion || '-',
          p.Observacion || '-'
        ];
      });

      const tableDataCausales = {
        columns: ['Brigada', 'Tcnico', 'Estado', 'Accin', 'Subaccin', 'Observacin'],
        categoryIndex: 0,
        rows: rowsCausales
      };
      // --- FIN NUEVO ---
`;

if (!page.includes('// --- NUEVO: Evolutivo de Causales de No Efectividad ---')) {
  page = page.replace(
    /(const winLbl = fmtRangoMeses\(selWin\);\s*return \{)/,
    causalesLogic + '\n    $1'
  );
  fs.writeFileSync('src/app/operativo/page.tsx', page, 'utf8');
}
console.log('Fixed Logic');
