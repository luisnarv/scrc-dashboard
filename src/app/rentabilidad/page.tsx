'use client';

import { useMemo } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { filtCos, filtCosSinMes } from '../components/utils/filters';
import { otcAgg, otcAggMes, mesAnterior } from '../components/utils/aggregators';
import { fmtCOP, fmtPct, fmtN, deltaPct } from '../components/utils/formatters';
import KpiCard from '../components/KpiCard';
import ChartCard from '../components/ChartCard';
import SortableTable from '../components/SortableTable';

const CFG = { ok: '#2E7D32', warn: '#F57C00', err: '#C62828', otc: '#3949AB', sip: '#00897B', neu: '#5d6785' };

const baseOpt = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { font: { size: 10 }, boxWidth: 10 } } },
};

const COLS_C = ['#3949AB', '#00897B', '#F57C00', '#7B1FA2', '#546E7A'];
const T_COLS = ['#3949AB', '#00897B', '#F57C00', '#7B1FA2', '#00838F', '#5D4037', '#546E7A', '#C0392B', '#0288D1', '#8E24AA'];

function shortProv(s: string): string {
  let t = String(s || '').trim();
  t = t.replace(/^(PS|PB|PI|CN|ISE?|CV)\d+\s+/i, '');
  t = t.replace(/\s+(S\.?A\.?S?\.?( E\.?S\.?P\.?)?|LTDA\.?|E\.?U\.?|Y CIA\.? S\.?C\.?A\.?|CIA\.? LTDA\.?)\s*$/i, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t.length > 22 ? t.slice(0, 20) + '…' : t;
}

export default function RentabilidadPage() {
  const { raw, filters, mesList, loading, error } = useDashboard();

  const data = useMemo(() => {
    if (!raw) return null;
    const cosF = filtCos(raw.costos, filters);
    const cosAll = filtCosSinMes(raw.costos, filters);
    const mActual = filters.mes === 'ALL' ? mesList[mesList.length - 1] : filters.mes;
    const mAnt = mesAnterior(mActual, mesList);

    const p = otcAgg(cosF);
    const acum = otcAgg(cosAll);
    const cosAnt = raw.costos.filter(r =>
      r.Mes === mAnt &&
      (filters.proy === 'ALL' || r._Proyecto === filters.proy) &&
      (filters.zona === 'ALL' || r._Zona === filters.zona)
    );
    const pAnt = otcAgg(cosAnt);

    const totCos = p.costos || 1;
    const gPers = cosF.filter(r => String(r.CuentaMayor || '').toUpperCase().includes('PERSONAL')).reduce((s, r) => s + (Number(r.Valor) || 0), 0);
    const emps = (raw.emps || []).filter(e => filters.proy === 'ALL' || e.Proyecto === filters.proy);
    const nEmps = new Set(emps.map(e => e.Empleado)).size || 1;
    const combusCat = cosF.filter(r => String(r.CuentaMayor || '').toUpperCase().includes('COMBUSTIBLE') || String(r.NombreCuenta || '').toUpperCase().includes('COMBUSTIBLE'));
    const mant = cosF.filter(r => String(r.CuentaMayor || '').toUpperCase().includes('MANTEN'));

    // Proveedores
    const esProv = (t: unknown) => /^(PS|PB|PI|CN)\d/.test(String(t || '').trim().toUpperCase());
    const esGasto = (r: { Categoria?: string; Grupo?: string }) => !String(r.Categoria || '').toLowerCase().includes('ingres') && !String(r.Grupo || '').startsWith('01');
    const provs: Record<string, number> = {};
    cosF.forEach(r => {
      const t = r.Tercero || r.Proveedor;
      if (t && esProv(t) && esGasto(r)) provs[String(t)] = (provs[String(t)] || 0) + (Number(r.Valor) || 0);
    });
    const provArr = Object.entries(provs).sort((a, b) => b[1] - a[1]);
    const topProv = provArr[0];

    // 12 month series
    const meses12 = mesList.slice(-12);
    const filtBase = (r: { _Proyecto?: string; _Zona?: string; _ZonaDet?: string }) =>
      (filters.proy === 'ALL' || r._Proyecto === filters.proy) &&
      (filters.zona === 'ALL' || r._Zona === filters.zona || r._ZonaDet === filters.zona);
    const series = meses12.map(m => otcAggMes(raw.costos.filter(filtBase), m));

    const persMes = meses12.map(m =>
      raw.costos.filter(r => r.Mes === m && filtBase(r) && String(r.CuentaMayor || '').toUpperCase().includes('PERSONAL'))
        .reduce((s, r) => s + (Number(r.Valor) || 0), 0)
    );

    // Categorías top 5
    const catsSet = [...new Set(cosF.map(r => r.CuentaMayor).filter((c): c is string => !!c && !String(c).toLowerCase().includes('ingres')))];
    const topCats = catsSet.map(c => ({ c, v: cosF.filter(r => r.CuentaMayor === c).reduce((s, r) => s + (Number(r.Valor) || 0), 0) }))
      .sort((a, b) => b.v - a.v).slice(0, 5).map(x => x.c);

    // Zonas / Proyectos
    const zonas = [...new Set(cosF.map(r => r.Zona).filter((z): z is string => !!z))];
    const zData = zonas.map(z => otcAgg(cosF.filter(r => r.Zona === z)));
    const proysL = [...new Set(cosF.map(r => r.Proyecto).filter((pr): pr is string => !!pr))];
    const pData = proysL.map(pp => otcAgg(cosF.filter(r => r.Proyecto === pp)));

    // Treemap (horizontal bar)
    const treeData = catsSet.map(c => ({ c, v: cosF.filter(r => r.CuentaMayor === c).reduce((s, r) => s + (Number(r.Valor) || 0), 0) })).sort((a, b) => b.v - a.v);

    // Desglose personal
    const persCuentas: Record<string, number> = {};
    cosF.filter(r => String(r.CuentaMayor || '').toUpperCase().includes('PERSONAL')).forEach(r => {
      persCuentas[String(r.NombreCuenta || '—')] = (persCuentas[String(r.NombreCuenta || '—')] || 0) + (Number(r.Valor) || 0);
    });
    const persArr = Object.entries(persCuentas).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // Depreciación
    const depr: Record<string, number> = {};
    cosF.filter(r => String(r.CuentaMayor || '').toUpperCase().includes('DEPREC')).forEach(r => {
      const a = String(r.NombreActivo || r.Descripcion || '—');
      depr[a] = (depr[a] || 0) + (Number(r.Valor) || 0);
    });
    const dArr = Object.entries(depr).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // Drivers
    const drivers: { tipo: 'pos' | 'neg' | 'info'; label: string; text: string }[] = [];
    if (treeData.length) { const t = treeData[0]; drivers.push({ tipo: 'info', label: '💰 Estructura', text: `${t.c} representa el ${(t.v / totCos * 100).toFixed(0)}% del costo total.` }); }
    const dCos = deltaPct(p.costos, pAnt.costos);
    if (dCos !== null && Math.abs(dCos) >= 0.05) drivers.push({ tipo: dCos < 0 ? 'pos' : 'neg', label: '📊 Δ Costos', text: `Costos ${dCos >= 0 ? 'crecieron' : 'bajaron'} ${(Math.abs(dCos) * 100).toFixed(1)}% vs ${mAnt}.` });
    if (topProv && topProv[1] / totCos > 0.15) drivers.push({ tipo: 'neg', label: '⚠️ Concentración', text: `${topProv[0].slice(0, 50)} concentra ${(topProv[1] / totCos * 100).toFixed(0)}% del gasto.` });
    const worstZ = zData.map((x, i) => ({ z: zonas[i], m: x.margen })).sort((a, b) => (a.m ?? 0) - (b.m ?? 0))[0];
    if (worstZ && worstZ.m !== null && worstZ.m < 0.1) drivers.push({ tipo: 'neg', label: '📍 Zona', text: `Zona ${worstZ.z} con margen del ${fmtPct(worstZ.m)} — revisar costo operativo.` });

    // Oportunidades
    const oport: string[] = [];
    if (topProv && topProv[1] / totCos > 0.25) oport.push(`Proveedores: Evaluar dependencia de ${topProv[0].slice(0, 40)} (concentra ${(topProv[1] / totCos * 100).toFixed(0)}%).`);
    if (gPers / totCos > 0.65) oport.push(`Personal: Estructura de gasto altamente dependiente de nómina (${(gPers / totCos * 100).toFixed(0)}%) — optimizar productividad por empleado.`);
    if (worstZ && worstZ.m !== null && worstZ.m < 0.1) oport.push(`Zona: Redistribuir esfuerzos hacia zonas más rentables o intervenir estructura de costos en ${worstZ.z}.`);

    // Tables
    const provTableData = provArr.slice(0, 20).map(([n, v]) => ({ n: n.slice(0, 50), v, pct: Number((totCos ? v / totCos * 100 : 0).toFixed(1)) }));

    const empMap: Record<string, { total: number; zonas: Set<string>; brig: string }> = {};
    emps.forEach(e => {
      const k = String(e.Empleado || '—');
      if (!empMap[k]) empMap[k] = { total: 0, zonas: new Set(), brig: String(e.EnBrigadas || '—') };
      empMap[k].total += Number(e.Valor_Total) || 0;
      if (e.Zona) empMap[k].zonas.add(String(e.Zona));
      if (e.EnBrigadas === 'Sí') empMap[k].brig = 'Sí';
    });
    const empArr = Object.entries(empMap).map(([n, v]) => ({ n, total: v.total, zonas: [...v.zonas].join(', ') || '—', brig: v.brig })).sort((a, b) => b.total - a.total).slice(0, 20);

    return { p, pAnt, acum, gPers, nEmps, combusCat, mant, totCos, topProv, provArr, series, persMes, topCats, zonas, zData, proysL, pData, treeData, persArr, dArr, drivers, oport, provTableData, empArr, meses12, filtBase, catsSet };
  }, [raw, filters, mesList]);

  if (loading) return <div className="loading-wrap"><div className="spinner" /><span>Cargando datos…</span></div>;
  if (error) return <div className="status err">{error}</div>;
  if (!data || !raw) return null;

  const { p, pAnt, acum, gPers, nEmps, combusCat, mant, totCos, topProv, provArr, series, persMes, topCats, zonas, zData, proysL, pData, treeData, persArr, dArr, drivers, oport, provTableData, empArr, meses12 } = data;

  // Charts
  const icuCfg = {
    type: 'bar' as const,
    data: {
      labels: meses12,
      datasets: [
        { type: 'line' as const, label: 'Ingresos', data: series.map(s => s.ingresos), borderColor: CFG.otc, tension: 0.3 },
        { type: 'bar' as const, label: 'Costos', data: series.map(s => s.costos), backgroundColor: CFG.err + '99' },
        { type: 'line' as const, label: 'Utilidad', data: series.map(s => s.utilidad), borderColor: CFG.ok, tension: 0.3 },
      ],
    },
    options: { ...baseOpt, scales: { y: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } } } },
  };

  const margenCfg = {
    type: 'line' as const,
    data: { labels: meses12, datasets: [{ label: 'Margen %', data: series.map(s => s.margen ? s.margen * 100 : 0), borderColor: CFG.otc, backgroundColor: CFG.otc + '22', fill: true, tension: 0.3 }] },
    options: { ...baseOpt, scales: { y: { ticks: { callback: (v: unknown) => Number(v).toFixed(1) + '%' } } } },
  };

  const personalCfg = {
    type: 'line' as const,
    data: { labels: meses12, datasets: [{ label: 'Costo Personal', data: persMes, borderColor: CFG.otc, backgroundColor: CFG.otc + '22', fill: true, tension: 0.3 }] },
    options: { ...baseOpt, scales: { y: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } } } },
  };

  const catsCfg = {
    type: 'line' as const,
    data: {
      labels: meses12,
      datasets: topCats.map((c, i) => ({
        label: c,
        data: meses12.map(m => (raw.costos || []).filter((r: { Mes?: string; CuentaMayor?: string; _Proyecto?: string; _Zona?: string; _ZonaDet?: string }) =>
          r.Mes === m && r.CuentaMayor === c &&
          (filters.proy === 'ALL' || r._Proyecto === filters.proy) &&
          (filters.zona === 'ALL' || r._Zona === filters.zona)
        ).reduce((s: number, r: { Valor?: string | number }) => s + (Number(r.Valor) || 0), 0)),
        borderColor: COLS_C[i],
        backgroundColor: COLS_C[i] + '22',
        tension: 0.3,
      })),
    },
    options: { ...baseOpt, scales: { y: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } } } },
  };

  const zonaRentCfg = {
    type: 'bar' as const,
    data: {
      labels: zonas,
      datasets: [
        { label: 'Ingresos', data: zData.map(x => x.ingresos), backgroundColor: CFG.otc + 'CC' },
        { label: 'Costos', data: zData.map(x => x.costos), backgroundColor: CFG.err + 'CC' },
        { label: 'Utilidad', data: zData.map(x => x.utilidad), backgroundColor: CFG.ok + 'CC' },
      ],
    },
    options: { ...baseOpt, scales: { y: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } } } },
  };

  const proyRentCfg = {
    type: 'bar' as const,
    data: {
      labels: proysL,
      datasets: [
        { label: 'Ingresos', data: pData.map(x => x.ingresos), backgroundColor: CFG.otc + 'CC' },
        { label: 'Costos', data: pData.map(x => x.costos), backgroundColor: CFG.err + 'CC' },
        { label: 'Utilidad', data: pData.map(x => x.utilidad), backgroundColor: CFG.ok + 'CC' },
      ],
    },
    options: { ...baseOpt, scales: { y: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } } } },
  };

  const treemapCfg = {
    type: 'bar' as const,
    data: {
      labels: treeData.slice(0, 10).map(x => x.c),
      datasets: [{ label: 'Costo', data: treeData.slice(0, 10).map(x => x.v), backgroundColor: T_COLS }],
    },
    options: { ...baseOpt, indexAxis: 'y' as const, plugins: { ...baseOpt.plugins, legend: { display: false } }, scales: { x: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } } } },
  };

  const provTop = provArr.slice(0, 10);
  const totP = provArr.reduce((s, x) => s + x[1], 0);
  let ac = 0;
  const acP = provTop.map(x => { ac += x[1]; return totP ? ac / totP * 100 : 0; });
  const provCfg = {
    type: 'bar' as const,
    data: {
      labels: provTop.map(x => shortProv(x[0])),
      datasets: [
        { type: 'bar' as const, label: 'Gasto', data: provTop.map(x => x[1]), backgroundColor: CFG.otc + 'CC', yAxisID: 'y' },
        { type: 'line' as const, label: '% Acumulado', data: acP, borderColor: CFG.warn, tension: 0.2, yAxisID: 'y1' },
      ],
    },
    options: { ...baseOpt, scales: { y: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } }, y1: { position: 'right' as const, max: 100, ticks: { callback: (v: unknown) => Number(v).toFixed(0) + '%' }, grid: { display: false } } } },
  };

  const desgPersCfg = {
    type: 'bar' as const,
    data: { labels: persArr.map(x => x[0].slice(0, 25)), datasets: [{ label: 'Costo', data: persArr.map(x => x[1]), backgroundColor: CFG.otc + 'CC' }] },
    options: { ...baseOpt, indexAxis: 'y' as const, plugins: { ...baseOpt.plugins, legend: { display: false } }, scales: { x: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } } } },
  };

  const deprCfg = {
    type: 'bar' as const,
    data: { labels: dArr.map(x => String(x[0]).slice(0, 25)), datasets: [{ label: 'Depreciación', data: dArr.map(x => x[1]), backgroundColor: CFG.warn + 'CC' }] },
    options: { ...baseOpt, indexAxis: 'y' as const, plugins: { ...baseOpt.plugins, legend: { display: false } }, scales: { x: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } } } },
  };

  return (
    <>
      <div className="section">
        <h2>💰 Rentabilidad y Costos <span className="tag-otc">OTC</span></h2>
        <div className="sec-sub">Realidad financiera del proyecto — ingresos, costos y utilidad contables</div>
      </div>

      <div className="section">
        <h2>Indicadores Nivel 1</h2>
        <div className="kpi-grid">
          <KpiCard cls="otc" lbl="Utilidad Contable" val={fmtCOP(p.utilidad)} delta={deltaPct(p.utilidad, pAnt.utilidad)} help="Ingresos − Costos del periodo." />
          <KpiCard cls="otc" lbl="Margen %" val={fmtPct(p.margen)} delta={deltaPct(p.margen ?? 0, pAnt.margen ?? 0)} help="Utilidad / Ingresos." />
          <KpiCard cls="otc" lbl="Margen Acumulado" val={fmtPct(acum.margen)} help="Margen acumulado del año." />
          <KpiCard cls="otc" lbl="Ingresos" val={fmtCOP(p.ingresos)} delta={deltaPct(p.ingresos, pAnt.ingresos)} help="Ingresos contables del periodo." />
        </div>
      </div>

      <div className="section">
        <h2>Indicadores Nivel 2 — Costos Unitarios</h2>
        <div className="kpi-grid">
          <KpiCard cls="otc" lbl="Costo Personal / Empleado" val={fmtCOP(gPers / nEmps)} help={`Costo total de personal ${fmtCOP(gPers)} / ${nEmps} empleados.`} />
          <KpiCard cls="otc" lbl="Combustible (mes)" val={fmtCOP(combusCat.reduce((s, r) => s + (Number(r.Valor) || 0), 0))} help="Gasto en combustible del periodo." />
          <KpiCard cls="otc" lbl="Mantenimiento (mes)" val={fmtCOP(mant.reduce((s, r) => s + (Number(r.Valor) || 0), 0))} help="Gasto en mantenimientos." />
          <KpiCard cls="otc" lbl="Top Proveedor" val={topProv ? fmtCOP(topProv[1]) : '—'} help={topProv ? `${topProv[0]} representa ${(topProv[1] / totCos * 100).toFixed(1)}% del gasto.` : ''} />
        </div>
      </div>

      <div className="section">
        <h2>📈 Evolutivos</h2>
        <div className="grid-2">
          <ChartCard id="v3-icu" title="Ingresos · Costos · Utilidad (12M)" config={icuCfg as never} />
          <ChartCard id="v3-margen" title="Margen %" config={margenCfg as never} />
          <ChartCard id="v3-personal" title="Costo Personal (12M)" config={personalCfg as never} />
          <ChartCard id="v3-cats" title="Costos por categoría (12M)" config={catsCfg as never} />
        </div>
      </div>

      <div className="section">
        <h2>⚖️ Comparativos</h2>
        <div className="grid-2">
          <ChartCard id="v3-zona" title="Rentabilidad por Zona" config={zonaRentCfg as never} />
          <ChartCard id="v3-proy" title="Rentabilidad por Proyecto" config={proyRentCfg as never} />
        </div>
      </div>

      <div className="section">
        <h2>📊 Distribuciones</h2>
        <div className="grid-2">
          <ChartCard id="v3-treemap" title="Estructura de Costos (Treemap)" subtitle="Por categoría" config={treemapCfg as never} height="tall" />
          <ChartCard id="v3-prov" title="Pareto de Proveedores" config={provCfg as never} height="tall" />
          <ChartCard id="v3-desg-pers" title="Desglose Costo Personal" config={desgPersCfg as never} />
          <ChartCard id="v3-depr" title="Depreciación de Activos (Top 10)" config={deprCfg as never} />
        </div>
      </div>

      <div className="section">
        <h2>🔎 Drivers de Rentabilidad</h2>
        {drivers.length ? drivers.map((d, i) => (
          <div key={i} className="driver">
            <span className={`tipo ${d.tipo}`}>{d.label}</span>
            {d.text}
          </div>
        )) : <div className="driver">Sin drivers destacados en el periodo.</div>}
      </div>

      <div className="section">
        <h2>💡 Oportunidades de Optimización</h2>
        {oport.length ? oport.map((o, i) => <div key={i} className="oport">{o}</div>) : <div className="oport">Estructura de costos dentro de parámetros aceptables.</div>}
      </div>

      <div className="section">
        <h2>📋 Detalle de Proveedores (Top 20)</h2>
        <SortableTable
          id="tabla-prov"
          columns={[
            { key: 'n', label: 'Proveedor' },
            { key: 'v', label: 'Gasto', type: 'num', render: v => fmtCOP(Number(v)) },
            { key: 'pct', label: '% del total', type: 'num', render: v => Number(v).toFixed(1) + '%' },
          ]}
          data={provTableData as never}
          defaultSort="v"
          searchPlaceholder="Buscar proveedor…"
          searchKeys={['n']}
        />
      </div>

      <div className="section">
        <h2>📋 Detalle de Personal (Top 20)</h2>
        <SortableTable
          id="tabla-pers"
          columns={[
            { key: 'n', label: 'Empleado' },
            { key: 'total', label: 'Costo', type: 'num', render: v => fmtCOP(Number(v)) },
            { key: 'brig', label: 'En Brigadas' },
            { key: 'zonas', label: 'Zona' },
          ]}
          data={empArr as never}
          defaultSort="total"
          searchPlaceholder="Buscar empleado o zona…"
          searchKeys={['n', 'zonas']}
        />
      </div>
    </>
  );
}
