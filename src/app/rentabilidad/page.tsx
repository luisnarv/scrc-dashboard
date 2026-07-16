'use client';

import { useMemo, type ReactNode } from 'react';
import type { ChartConfiguration } from 'chart.js';
import { useDashboard } from '../components/DashboardProvider';
import { filtCos, filtCosSinMes } from '../components/utils/filters';
import { fmtCOP, fmtPct, deltaPct } from '../components/utils/formatters';
import { otcAgg, otcAggMes, mesAnterior } from '../components/utils/aggregators';
import type { CostoRecord } from '../components/utils/types';
import KpiCard from '../components/KpiCard';
import ChartCard from '../components/ChartCard';
import Driver from '../components/Driver';
import SortableTable from '../components/SortableTable';

const CFG = { ok: '#2E7D32', warn: '#F57C00', err: '#C62828', otc: '#3949AB', sip: '#00897B', neu: '#5d6785' };

const baseOpt = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { font: { size: 10 }, boxWidth: 10 } } },
};

// chart.js + strict TS: los datasets mixtos (bar/line) y las opciones anidadas
// pelean con los genéricos. Casteamos la config completa, igual que hace ChartCard.
const cc = (c: unknown): ChartConfiguration => c as ChartConfiguration;

export default function RentabilidadPage() {
  const { raw, filters, mesList, loading, error } = useDashboard();

  const data = useMemo(() => {
    if (!raw) return null;
    const F = filters;

    // ---- Periodo actual / anterior / acumulado ----
    const cos = filtCos(raw.costos, F);
    const p = otcAgg(cos);
    const mActual = F.mes.length ? [...F.mes].sort().at(-1)! : mesList[mesList.length - 1];
    const mAnt = mesAnterior(mActual, mesList);
    const cosAnt = raw.costos.filter(
      r =>
        r.Mes === mAnt &&
        (F.proy === 'ALL' || r._Proyecto === F.proy) &&
        (F.zona === 'ALL' || r._Zona === F.zona || r._ZonaDet === F.zona)
    );
    const pAnt = otcAgg(cosAnt);
    const acum = otcAgg(filtCosSinMes(raw.costos, F));

    // ---- KPIs nivel 2 (costos unitarios) ----
    const num = (v: unknown) => Number(v) || 0;
    const gPers = cos
      .filter(r => String(r.CuentaMayor || '').toUpperCase().includes('PERSONAL'))
      .reduce((s, r) => s + num(r.Valor), 0);
    const empsF = (raw.emps || []).filter(e => F.proy === 'ALL' || e.Proyecto === F.proy);
    const nEmps = new Set(empsF.map(e => e.Empleado)).size || 1;
    const combusTot = cos
      .filter(
        r =>
          String(r.CuentaMayor || '').toUpperCase().includes('COMBUSTIBLE') ||
          String(r.NombreCuenta || '').toUpperCase().includes('COMBUSTIBLE')
      )
      .reduce((s, r) => s + num(r.Valor), 0);
    const mantTot = cos
      .filter(r => String(r.CuentaMayor || '').toUpperCase().includes('MANTEN'))
      .reduce((s, r) => s + num(r.Valor), 0);
    const totCos = p.costos || 1;

    // ---- Proveedores ----
    const esProv = (t: unknown) => /^(PS|PB|PI|CN)\d/.test(String(t || '').trim().toUpperCase());
    const esGasto = (r: CostoRecord) =>
      !String(r.Categoria || '').toLowerCase().includes('ingres') &&
      !String(r.Grupo || '').startsWith('01');
    const provs: Record<string, number> = {};
    cos.forEach(r => {
      const t = r.Tercero || r.Proveedor;
      if (t && esProv(t) && esGasto(r)) provs[String(t)] = (provs[String(t)] || 0) + num(r.Valor);
    });
    const provArr = Object.entries(provs).sort((a, b) => b[1] - a[1]);
    const topProv = provArr[0];

    const shortProv = (s: unknown) => {
      let t = String(s || '').trim();
      t = t.replace(/^(PS|PB|PI|CN|ISE?|CV)\d+\s+/i, '');
      t = t.replace(
        /\s+(S\.?A\.?S?\.?( E\.?S\.?P\.?)?|LTDA\.?|E\.?U\.?|Y CIA\.? S\.?C\.?A\.?|CIA\.? LTDA\.?)\s*$/i,
        ''
      );
      t = t.replace(/\s+/g, ' ').trim();
      return t.length > 22 ? t.slice(0, 20) + '…' : t;
    };

    // ---- Series 12 meses (base proy+zona, sin filtro de mes) ----
    const meses12 = mesList.slice(-12);
    const base = (r: CostoRecord) =>
      (F.proy === 'ALL' || r._Proyecto === F.proy) &&
      (F.zona === 'ALL' || r._Zona === F.zona || r._ZonaDet === F.zona);
    const series = meses12.map(m => otcAggMes(raw.costos.filter(base), m));
    const persMes = meses12.map(m =>
      raw.costos
        .filter(
          r => r.Mes === m && base(r) && String(r.CuentaMayor || '').toUpperCase().includes('PERSONAL')
        )
        .reduce((s, r) => s + num(r.Valor), 0)
    );

    // ---- Categorías de costo ----
    const catsSet = [
      ...new Set(cos.map(r => r.CuentaMayor).filter(c => c && !String(c).toLowerCase().includes('ingres'))),
    ] as string[];
    const topCats = catsSet
      .map(c => ({ c, v: cos.filter(r => r.CuentaMayor === c).reduce((s, r) => s + num(r.Valor), 0) }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 5)
      .map(x => x.c);
    const catSeries = topCats.map(c =>
      meses12.map(m =>
        raw.costos
          .filter(r => r.Mes === m && r.CuentaMayor === c && base(r))
          .reduce((s, r) => s + num(r.Valor), 0)
      )
    );

    // ---- Comparativos zona / proyecto ----
    const zonas = [...new Set(cos.map(r => r.Zona))].filter(Boolean) as string[];
    const zData = zonas.map(z => otcAgg(cos.filter(r => r.Zona === z)));
    const proys = [...new Set(cos.map(r => r.Proyecto))].filter(Boolean) as string[];
    const pData = proys.map(pp => otcAgg(cos.filter(r => r.Proyecto === pp)));
    const worstZ = zData
      .map((x, i) => ({ z: zonas[i], m: x.margen }))
      .sort((a, b) => (a.m || 0) - (b.m || 0))[0];

    // ---- Distribuciones ----
    const treeData = catsSet
      .map(c => ({ c, v: cos.filter(r => r.CuentaMayor === c).reduce((s, r) => s + num(r.Valor), 0) }))
      .sort((a, b) => b.v - a.v);

    const provTop = provArr.slice(0, 10);
    const totP = provArr.reduce((s, x) => s + x[1], 0);
    let ac = 0;
    const acP = provTop.map(x => {
      ac += x[1];
      return totP ? (ac / totP) * 100 : 0;
    });

    const persCuentas: Record<string, number> = {};
    cos
      .filter(r => String(r.CuentaMayor || '').toUpperCase().includes('PERSONAL'))
      .forEach(r => {
        const k = String(r.NombreCuenta || '—');
        persCuentas[k] = (persCuentas[k] || 0) + num(r.Valor);
      });
    const persArr = Object.entries(persCuentas).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const depr: Record<string, number> = {};
    cos
      .filter(r => String(r.CuentaMayor || '').toUpperCase().includes('DEPREC'))
      .forEach(r => {
        const a = String(r.NombreActivo || r.Descripcion || '—');
        depr[a] = (depr[a] || 0) + num(r.Valor);
      });
    const dArr = Object.entries(depr).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // ---- Configs de gráficos ----
    const colsC = ['#3949AB', '#00897B', '#F57C00', '#7B1FA2', '#546E7A'];
    const tCols = ['#3949AB', '#00897B', '#F57C00', '#7B1FA2', '#00838F', '#5D4037', '#546E7A', '#C0392B', '#0288D1', '#8E24AA'];
    const copY = { ...baseOpt, scales: { y: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } } } };
    const copX = {
      ...baseOpt,
      indexAxis: 'y',
      plugins: { ...baseOpt.plugins, legend: { display: false } },
      scales: { x: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } } },
    };

    const charts = {
      icu: cc({
        type: 'bar',
        data: {
          labels: meses12,
          datasets: [
            { type: 'line', label: 'Ingresos', data: series.map(s => s.ingresos), borderColor: CFG.otc, tension: 0.3 },
            { type: 'bar', label: 'Costos', data: series.map(s => s.costos), backgroundColor: CFG.err + '99' },
            { type: 'line', label: 'Utilidad', data: series.map(s => s.utilidad), borderColor: CFG.ok, tension: 0.3 },
          ],
        },
        options: copY,
      }),
      margen: cc({
        type: 'line',
        data: {
          labels: meses12,
          datasets: [
            {
              label: 'Margen %',
              data: series.map(s => (s.margen ? s.margen * 100 : 0)),
              borderColor: CFG.otc,
              backgroundColor: CFG.otc + '22',
              fill: true,
              tension: 0.3,
            },
          ],
        },
        options: { ...baseOpt, scales: { y: { ticks: { callback: (v: unknown) => Number(v).toFixed(1) + '%' } } } },
      }),
      personal: cc({
        type: 'line',
        data: {
          labels: meses12,
          datasets: [
            {
              label: 'Costo Personal',
              data: persMes,
              borderColor: CFG.otc,
              backgroundColor: CFG.otc + '22',
              fill: true,
              tension: 0.3,
            },
          ],
        },
        options: copY,
      }),
      cats: cc({
        type: 'line',
        data: {
          labels: meses12,
          datasets: topCats.map((c, i) => ({
            label: c,
            data: catSeries[i],
            borderColor: colsC[i],
            backgroundColor: colsC[i] + '22',
            tension: 0.3,
          })),
        },
        options: copY,
      }),
      zona: cc({
        type: 'bar',
        data: {
          labels: zonas,
          datasets: [
            { label: 'Ingresos', data: zData.map(x => x.ingresos), backgroundColor: CFG.otc + 'CC' },
            { label: 'Costos', data: zData.map(x => x.costos), backgroundColor: CFG.err + 'CC' },
            { label: 'Utilidad', data: zData.map(x => x.utilidad), backgroundColor: CFG.ok + 'CC' },
          ],
        },
        options: copY,
      }),
      proy: cc({
        type: 'bar',
        data: {
          labels: proys,
          datasets: [
            { label: 'Ingresos', data: pData.map(x => x.ingresos), backgroundColor: CFG.otc + 'CC' },
            { label: 'Costos', data: pData.map(x => x.costos), backgroundColor: CFG.err + 'CC' },
            { label: 'Utilidad', data: pData.map(x => x.utilidad), backgroundColor: CFG.ok + 'CC' },
          ],
        },
        options: copY,
      }),
      treemap: cc({
        type: 'bar',
        data: {
          labels: treeData.slice(0, 10).map(x => x.c),
          datasets: [{ label: 'Costo', data: treeData.slice(0, 10).map(x => x.v), backgroundColor: tCols }],
        },
        options: copX,
      }),
      prov: cc({
        type: 'bar',
        data: {
          labels: provTop.map(x => shortProv(x[0])),
          datasets: [
            { type: 'bar', label: 'Gasto', data: provTop.map(x => x[1]), backgroundColor: CFG.otc + 'CC', yAxisID: 'y' },
            { type: 'line', label: '% Acumulado', data: acP, borderColor: CFG.warn, tension: 0.2, yAxisID: 'y1' },
          ],
        },
        options: {
          ...baseOpt,
          plugins: {
            ...baseOpt.plugins,
            tooltip: {
              callbacks: {
                title: (items: { dataIndex: number }[]) => String(provTop[items[0].dataIndex][0]),
                label: (c: { dataset: { type?: string }; parsed: { y: number } }) =>
                  c.dataset.type === 'line'
                    ? `% Acumulado: ${Number(c.parsed.y).toFixed(1)}%`
                    : `Gasto: ${fmtCOP(Number(c.parsed.y))}`,
              },
            },
          },
          scales: {
            y: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } },
            y1: {
              position: 'right',
              max: 100,
              ticks: { callback: (v: unknown) => Number(v).toFixed(0) + '%' },
              grid: { display: false },
            },
          },
        },
      }),
      desgPers: cc({
        type: 'bar',
        data: {
          labels: persArr.map(x => String(x[0]).slice(0, 25)),
          datasets: [{ label: 'Costo', data: persArr.map(x => x[1]), backgroundColor: CFG.otc + 'CC' }],
        },
        options: copX,
      }),
      depr: cc({
        type: 'bar',
        data: {
          labels: dArr.map(x => String(x[0]).slice(0, 25)),
          datasets: [{ label: 'Depreciación', data: dArr.map(x => x[1]), backgroundColor: CFG.warn + 'CC' }],
        },
        options: copX,
      }),
    };

    // ---- Drivers ----
    const drivers: ReactNode[] = [];
    if (treeData.length) {
      const t = treeData[0];
      drivers.push(
        <Driver key="d1" tipo="info" tipoLabel="💰 Estructura">
          <b>{t.c}</b> representa el <b>{((t.v / totCos) * 100).toFixed(0)}%</b> del costo total.
        </Driver>
      );
    }
    const dCos = deltaPct(p.costos, pAnt.costos);
    if (dCos !== null && Math.abs(dCos) >= 0.05) {
      drivers.push(
        <Driver key="d2" tipo={dCos < 0 ? 'pos' : 'neg'} tipoLabel="📊 Δ Costos">
          Costos {dCos >= 0 ? 'crecieron' : 'bajaron'} <b>{(Math.abs(dCos) * 100).toFixed(1)}%</b> vs {mAnt}.
        </Driver>
      );
    }
    if (topProv && topProv[1] / totCos > 0.15) {
      drivers.push(
        <Driver key="d3" tipo="neg" tipoLabel="⚠️ Concentración">
          <b>{topProv[0].slice(0, 50)}</b> concentra <b>{((topProv[1] / totCos) * 100).toFixed(0)}%</b> del gasto.
        </Driver>
      );
    }
    if (worstZ && worstZ.m !== null && worstZ.m < 0.1) {
      drivers.push(
        <Driver key="d4" tipo="neg" tipoLabel="📍 Zona">
          Zona <b>{worstZ.z}</b> con margen del <b>{fmtPct(worstZ.m)}</b> — revisar costo operativo.
        </Driver>
      );
    }

    // ---- Oportunidades ----
    const oport: ReactNode[] = [];
    if (topProv && topProv[1] / totCos > 0.25) {
      oport.push(
        <div key="o1" className="oport">
          <b>Proveedores:</b> Evaluar dependencia de {topProv[0].slice(0, 40)} (concentra{' '}
          {((topProv[1] / totCos) * 100).toFixed(0)}%).
        </div>
      );
    }
    if (gPers / totCos > 0.65) {
      oport.push(
        <div key="o2" className="oport">
          <b>Personal:</b> Estructura de gasto altamente dependiente de nómina ({((gPers / totCos) * 100).toFixed(0)}%) —
          optimizar productividad por empleado.
        </div>
      );
    }
    if (worstZ && worstZ.m !== null && worstZ.m < 0.1) {
      oport.push(
        <div key="o3" className="oport">
          <b>Zona:</b> Redistribuir esfuerzos hacia zonas más rentables o intervenir estructura de costos en {worstZ.z}.
        </div>
      );
    }

    // ---- Tablas ----
    const provRows = provArr.slice(0, 20).map(([n, v]) => ({
      n,
      v,
      pct: totCos ? (v / totCos) * 100 : 0,
      cat: '—',
    }));

    const empMap: Record<string, { total: number; zonas: Set<string>; brig: string }> = {};
    empsF.forEach(e => {
      const k = e.Empleado || '—';
      if (!empMap[k]) empMap[k] = { total: 0, zonas: new Set(), brig: e.EnBrigadas || '—' };
      empMap[k].total += num(e.Valor_Total);
      if (e.Zona) empMap[k].zonas.add(e.Zona);
      if (e.EnBrigadas === 'Sí') empMap[k].brig = 'Sí';
    });
    const persRows = Object.entries(empMap)
      .map(([n, v]) => ({ n, total: v.total, zonas: [...v.zonas].join(', ') || '—', brig: v.brig }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);

    return {
      p, pAnt, acum,
      gPers, nEmps, combusTot, mantTot, topProv, totCos,
      charts, drivers, oport, provRows, persRows,
    };
  }, [raw, filters, mesList]);

  if (loading) {
    return (
      <div className="loading-wrap">
        <div className="spinner" />
        <div>Cargando datos…</div>
      </div>
    );
  }
  if (error) return <div className="status err">{error}</div>;
  if (!data) return null;

  const { p, pAnt, acum, gPers, nEmps, combusTot, mantTot, topProv, totCos, charts, drivers, oport, provRows, persRows } =
    data;

  return (
    <>
      <div className="section">
        <h2>
          💰 Rentabilidad y Costos <span className="tag-otc">OTC</span>
        </h2>
        <div className="sec-sub">Realidad financiera del proyecto — ingresos, costos y utilidad contables</div>
      </div>

      {/* Indicadores Nivel 1 */}
      <div className="section">
        <h2>Indicadores Nivel 1</h2>
        <div className="kpi-grid">
          <KpiCard
            cls="otc"
            lbl="Utilidad Contable"
            val={fmtCOP(p.utilidad)}
            delta={deltaPct(p.utilidad, pAnt.utilidad)}
            help="Ingresos − Costos del periodo."
          />
          <KpiCard
            cls="otc"
            lbl="Margen %"
            val={fmtPct(p.margen)}
            delta={p.margen !== null && pAnt.margen !== null ? deltaPct(p.margen, pAnt.margen) : null}
            help="Utilidad / Ingresos."
          />
          <KpiCard cls="otc" lbl="Margen Acumulado" val={fmtPct(acum.margen)} help="Margen acumulado del año." />
          <KpiCard
            cls="otc"
            lbl="Ingresos"
            val={fmtCOP(p.ingresos)}
            delta={deltaPct(p.ingresos, pAnt.ingresos)}
            help="Ingresos contables del periodo."
          />
        </div>
      </div>

      {/* Indicadores Nivel 2 */}
      <div className="section">
        <h2>Indicadores Nivel 2 — Costos Unitarios</h2>
        <div className="kpi-grid">
          <KpiCard
            cls="otc"
            lbl="Costo Personal / Empleado"
            val={fmtCOP(gPers / nEmps)}
            help={`Costo total de personal ${fmtCOP(gPers)} / ${nEmps} empleados.`}
          />
          <KpiCard cls="otc" lbl="Combustible (mes)" val={fmtCOP(combusTot)} help="Gasto en combustible del periodo." />
          <KpiCard cls="otc" lbl="Mantenimiento (mes)" val={fmtCOP(mantTot)} help="Gasto en mantenimientos." />
          <KpiCard
            cls="otc"
            lbl="Top Proveedor"
            val={topProv ? fmtCOP(topProv[1]) : '—'}
            help={topProv ? `${topProv[0]} representa ${((topProv[1] / totCos) * 100).toFixed(1)}% del gasto.` : ''}
          />
        </div>
      </div>

      {/* Evolutivos */}
      <div className="section">
        <h2>📈 Evolutivos</h2>
        <div className="grid-2">
          <ChartCard id="v3-icu" title="Ingresos · Costos · Utilidad (12M)" config={charts.icu} />
          <ChartCard id="v3-margen" title="Margen %" config={charts.margen} />
          <ChartCard id="v3-personal" title="Costo Personal (12M)" config={charts.personal} />
          <ChartCard id="v3-cats" title="Costos por categoría (12M)" config={charts.cats} />
        </div>
      </div>

      {/* Comparativos */}
      <div className="section">
        <h2>⚖️ Comparativos</h2>
        <div className="grid-2">
          <ChartCard id="v3-zona" title="Rentabilidad por Zona" config={charts.zona} />
          <ChartCard id="v3-proy" title="Rentabilidad por Proyecto" config={charts.proy} />
        </div>
      </div>

      {/* Distribuciones */}
      <div className="section">
        <h2>📊 Distribuciones</h2>
        <div className="grid-2">
          <ChartCard
            id="v3-treemap"
            title="Estructura de Costos"
            subtitle="Por categoría — top 10"
            config={charts.treemap}
            height="tall"
          />
          <ChartCard id="v3-prov" title="Pareto de Proveedores" config={charts.prov} height="tall" />
          <ChartCard id="v3-desg-pers" title="Desglose Costo Personal" config={charts.desgPers} />
          <ChartCard id="v3-depr" title="Depreciación de Activos (Top 10)" config={charts.depr} />
        </div>
      </div>

      {/* Drivers */}
      <div className="section">
        <h2>🔎 Drivers de Rentabilidad</h2>
        {drivers.length ? drivers : <div className="driver">Sin drivers destacados en el periodo.</div>}
      </div>

      {/* Oportunidades */}
      <div className="section">
        <h2>💡 Oportunidades de Optimización</h2>
        {oport.length ? oport : <div className="oport">Estructura de costos dentro de parámetros aceptables.</div>}
      </div>

      {/* Detalle Proveedores */}
      <div className="section">
        <h2>📋 Detalle de Proveedores (Top 20)</h2>
        <SortableTable
          id="tabla-prov"
          data={provRows}
          defaultSort="v"
          defaultDir="desc"
          searchPlaceholder="Buscar proveedor…"
          searchKeys={['n']}
          columns={[
            { key: 'n', label: 'Proveedor', render: v => String(v).slice(0, 50) },
            { key: 'v', label: 'Gasto', type: 'num', render: v => fmtCOP(Number(v)) },
            { key: 'pct', label: '% del total', type: 'num', render: v => Number(v).toFixed(1) + '%' },
            { key: 'cat', label: 'Categoría' },
          ]}
        />
      </div>

      {/* Detalle Personal */}
      <div className="section">
        <h2>📋 Detalle de Personal (Top 20)</h2>
        <SortableTable
          id="tabla-pers"
          data={persRows}
          defaultSort="total"
          defaultDir="desc"
          searchPlaceholder="Buscar empleado o zona…"
          searchKeys={['n', 'zonas']}
          columns={[
            { key: 'n', label: 'Empleado' },
            { key: 'total', label: 'Costo', type: 'num', render: v => fmtCOP(Number(v)) },
            { key: 'brig', label: 'En Brigadas' },
            { key: 'zonas', label: 'Zona' },
          ]}
        />
      </div>
    </>
  );
}