const fs = require('fs');

let page = fs.readFileSync('src/app/operativo/page.tsx', 'utf8');

// 1. Add import for filtPerdidas
if (!page.includes('filtPerdidas')) {
  page = page.replace('filtHorario } from', 'filtHorario, filtPerdidas } from');
}

// 2. Inject causal logic inside useMemo
if (!page.includes('const perdidasF = filtPerdidas(raw.perdidas || [], F);')) {
  // Inject right after const rawF = filtRaw(...)
  page = page.replace(
    /const rawF = filtRaw\(raw\.raw, F\);/,
    `const rawF = filtRaw(raw.raw, F);
      const perdidasF = filtPerdidas(raw.perdidas || [], F);`
  );

  // Now, calculate the causales aggregated
  // We will inject it right before `return { ... }` in the useMemo
  const useMemoReturnRegex = /(return \{\s*periodoLabel: winLbl,)/;
  
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
        // Note: rawF does not have Hour detail for orders. If it's esHora, Visitas is calculated differently using raw.horario or we don't calculate % over execution per hour.
        // For simplicity, if esHora, we'll use totalVisitasFull as a baseline or just show 0 for execution. Actually, per hour execution is complex. Let's just sum it per day/month.
        if (per !== '??') visitasPorPeriodo[per] = (visitasPorPeriodo[per] || 0) + (Number(r.Visitas) || 0);
      });
      // If esHora, we can use the same logic as chartTipos for hourly visitas. We'll skip hourly visitas % if not available and just show 'N/A' or calculate it using horF.

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
                  // if hourly, maybe we don't have exact visitas
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

      // Table Data for Modal "Expandir"
      // "Brigada, Tcnico, Estado, Accin, Subaccin, Observacin"
      const rowsCausales = perdidasF.map(p => {
        return {
          cols: [
            p.Brigada || '-',
            p.Tecnico || '-',
            p.Estado || 'PERDIDO',
            p.Accion || '-',
            p.Subaccion || '-',
            p.Observacion || '-'
          ]
        };
      });
      const tableDataCausales = {
        columns: ['Brigada', 'Tcnico', 'Estado', 'Accin', 'Subaccin', 'Observacin'],
        categoryIndex: 0,
        rows: rowsCausales
      };
      // --- FIN NUEVO ---
`;
  
  page = page.replace(useMemoReturnRegex, causalesLogic + '\n$1');

  // Inject into return
  page = page.replace(
    /(tableDataOrd, tableDataBrig, tableDataBrigTipos, tableDataTipos, tableDataEvolutivo,)/,
    '$1 chartCausales, tableDataCausales,'
  );

  // 3. Inject JSX
  // We need to find the specific ChartCard for "Evolutivo Horario de Efectividad por Tipo"
  // Its id is "op-tipos"
  const jsxInjection = `
            {/* NUEVO GRFICO: CAUSALES DE NO EFECTIVIDAD */}
            <ChartCard
              id="op-causales"
              title={\`Evolutivo \${winLbl} de Causales de No Efectividad (Perdidas)\`}
              subtitle={\`Top \${topCausales.length} causales | Muestra cantidad y su participacin porcentual\` }
              config={d.chartCausales as never}
              height="short"
              hasDetail
              detailTableData={d.tableDataCausales as any}
            />
`;

  // We find <ChartCard id="op-tipos" ... />
  // Since we don't know the exact lines, we will find `id="op-tipos"` and place it AFTER that component.
  // Wait, op-tipos uses `customLayout` which makes it multiline.
  // We can just find `id="op-tipos"` and the matching closing `/>` or `</ChartCard>` or we can inject it right after the `d.tableDataTipos as any}` because `customLayout` closes right after.
  // Let's replace the closing `</div>` of the `<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>` inside the Operativa view.
  // Wait, the charts are inside a `div` with `display: 'flex', flexDirection: 'column'`.
  // Let's find `id="op-tipos"`.
  const opTiposIndex = page.indexOf('id="op-tipos"');
  if (opTiposIndex > -1) {
    // Find the next ChartCard or the end of the flex container
    // Let's just insert it before `<div className="grid-2">` which is typically the layout following the evolutivos.
    // Wait, the evolutivos are full width now. Let's find `id="op-evolutivo"` and `id="op-tipos"`.
    // We can inject it right after `id="op-tipos"` component finishes.
    // The `op-tipos` component finishes with:
    //             />
    //           </div>
    //         ) : ( ...
    // Let's just do a specific replace.
    page = page.replace(
      /(<ChartCard[^>]*id="op-tipos"[\s\S]*?\/>\s*)(?=<\/div>|\{vistaEvolutivo === 'hora'|\<div className="grid-2">|\<ChartCard|\<AnalysisModal)/,
      '$1' + jsxInjection
    );
  }

  fs.writeFileSync('src/app/operativo/page.tsx', page, 'utf8');
}
console.log('page updated');
