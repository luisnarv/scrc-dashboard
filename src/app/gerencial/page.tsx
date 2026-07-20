'use client';

import { useMemo, useEffect, useRef } from 'react';
import type { ChartConfiguration } from 'chart.js';
import { useDashboard } from '../components/DashboardProvider';
import { filtRaw, ventanaPrevia } from '../components/utils/filters';
import { fmtCOP, fmtPct, fmtN, deltaPct } from '../components/utils/formatters';
import ChartCard from '../components/ChartCard';

const TEAL = '#00897B';
const INDIGO = '#3949AB';
const INK = '#141b2d';
const MUT = '#8a93a6';

/* Sparkline de tendencia */
function Trend({ data, labels, color, fmt }: { data: number[]; labels: string[]; color: string; fmt: (v: number) => string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import('chart.js').Chart | null>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    let mounted = true;
    import('chart.js').then(({ Chart, registerables }) => {
      if (!mounted || !canvasRef.current) return;
      Chart.register(...registerables);
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
      const cfg = {
        type: 'line',
        data: { labels, datasets: [{ data, borderColor: color, backgroundColor: color + '14', borderWidth: 2.5, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: color }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { displayColors: false, backgroundColor: INK, padding: 8, callbacks: { label: (t: { parsed: { y: number } }) => fmt(Number(t.parsed.y)) } } },
          scales: { x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 9 }, color: MUT, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } }, y: { display: false } },
        },
      } as unknown as ChartConfiguration;
      chartRef.current = new Chart(canvasRef.current, cfg);
    });
    return () => { mounted = false; if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data), JSON.stringify(labels), color]);
  return <div style={{ position: 'relative', height: 120 }}><canvas ref={canvasRef} /></div>;
}

/* Meta vs Real — dos barras */
function MetaReal({ meta, real, color, fmt }: { meta: number; real: number; color: string; fmt: (v: number) => string }) {
  const max = Math.max(meta, real, 1);
  const cumpl = meta ? (real / meta) * 100 : null;
  const bar = (label: string, value: number, c: string, muted?: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
      <span style={{ width: 34, fontSize: 11, color: MUT, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      <span style={{ flex: 1, height: 8, background: '#eef0f5', borderRadius: 4, overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${(value / max) * 100}%`, background: c, borderRadius: 4, transition: 'width .5s' }} />
      </span>
      <span style={{ width: 84, textAlign: 'right', fontSize: 12.5, fontWeight: 600, color: muted ? MUT : INK, fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}</span>
    </div>
  );
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 12, color: MUT, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Meta vs Real</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: INK }}>{cumpl !== null ? cumpl.toFixed(0) + '%' : '—'}</span>
      </div>
      {bar('Real', real, color)}
      {bar('Meta', meta, '#c9cede', true)}
    </div>
  );
}

function Delta({ d }: { d: number | null }) {
  if (d === null) return <span style={{ fontSize: 12, color: MUT }}>—</span>;
  const flat = Math.abs(d) < 0.001;
  const color = flat ? MUT : d >= 0 ? '#2E7D32' : '#C62828';
  const arrow = flat ? '' : d >= 0 ? '↑' : '↓';
  return <span style={{ fontSize: 13, fontWeight: 700, color }}>{arrow} {(Math.abs(d) * 100).toFixed(1)}%</span>;
}



export default function GerencialPage() {
  const { raw, filters, mesList, loading, error } = useDashboard();

  const d = useMemo(() => {
    if (!raw) return null;
    const F = filters;
    const n = (v: unknown) => Number(v) || 0;
    const rawF = filtRaw(raw.raw, F);
    const base = (r: { _Proyecto?: string; _Zona?: string; _ZonaDet?: string }) =>
      (F.proy === 'ALL' || r._Proyecto === F.proy) && (F.zona === 'ALL' || r._Zona === F.zona || r._ZonaDet === F.zona);

    const efect = rawF.reduce((s, r) => s + n(r.Efectivas), 0);
    const visitas = rawF.reduce((s, r) => s + n(r.Visitas), 0);
    const metaEfec = rawF.reduce((s, r) => s + n(r.Asignacion), 0);
    const ingreso = rawF.reduce((s, r) => s + n(r.Ingresos), 0);
    const metaFact = rawF.reduce((s, r) => s + n(r.Meta_Facturacion), 0);
    const perdidas = rawF.reduce((s, r) => s + n(r.Perdidas_COP), 0);

    const eficiencia = visitas ? efect / visitas : null;
    const cumplEfic = metaEfec ? efect / metaEfec : null;
    const cumplFact = metaFact ? ingreso / metaFact : null;

    // Unit Economics (Productividad y Costo por Brigada)
    const tmap: Record<string, { b: Set<unknown>; ing: number; co: number; ef: number }> = {};
    rawF.forEach(r => {
      const t = String(r.Tipo_Brigada_Operaciones || 'Sin tipo');
      if (!tmap[t]) tmap[t] = { b: new Set(), ing: 0, co: 0, ef: 0 };
      tmap[t].b.add(r.Cedula);
      tmap[t].ing += n(r.Ingresos);
      tmap[t].co += n(r.Costo_Operativo);
      tmap[t].ef += n(r.Efectivas);
    });
    const tipoRows = Object.entries(tmap)
      .map(([tipo, v]) => { const nb = v.b.size; return { tipo, brigadas: nb, ingreso: v.ing, ingXbrig: nb ? v.ing / nb : 0, costXbrig: nb ? v.co / nb : 0 }; })
      .sort((a, b) => b.ingreso - a.ingreso);

    // Ventanas para comparativo/deltas
    const meses12 = mesList.slice(-12);
    const selWin = F.mes.length ? [...F.mes].sort() : [meses12[meses12.length - 1]].filter(Boolean) as string[];
    const prevWin = ventanaPrevia(selWin, mesList);
    const aggWin = (arr: string[]) => {
      const set = new Set(arr);
      const rr = raw.raw.filter(x => set.has(String(x.Fecha || '').slice(0, 7)) && base(x));
      const ef = rr.reduce((s, x) => s + n(x.Efectivas), 0);
      const vi = rr.reduce((s, x) => s + n(x.Visitas), 0);
      const ing = rr.reduce((s, x) => s + n(x.Ingresos), 0);
      return { efic: vi ? ef / vi : null, ing };
    };
    const wA = aggWin(selWin);
    const wB = aggWin(prevWin);
    const dEfic = wA.efic !== null && wB.efic !== null ? deltaPct(wA.efic, wB.efic) : null;
    const dFact = wB.ing ? deltaPct(wA.ing, wB.ing) : null;

    // Tendencias 12m
    const perMes = meses12.map(m => {
      const rr = raw.raw.filter(x => String(x.Fecha || '').startsWith(m) && base(x));
      const ef = rr.reduce((s, x) => s + n(x.Efectivas), 0);
      const vi = rr.reduce((s, x) => s + n(x.Visitas), 0);
      const ing = rr.reduce((s, x) => s + n(x.Ingresos), 0);
      return { efic: vi ? (ef / vi) * 100 : 0, ing };
    });

    const winLbl = (arr: string[]) => (arr.length ? (arr.length === 1 ? arr[0] : `${arr[0]} … ${arr[arr.length - 1]}`) : '—');

    return {
      efect, metaEfec, eficiencia, cumplEfic,
      ingreso, metaFact, cumplFact, perdidas,
      dEfic, dFact, acumA: wA.ing, acumB: wB.ing,
      selLbl: winLbl(selWin), prevLbl: winLbl(prevWin),
      xlabels: meses12.map(m => m.slice(2)),
      eficTrend: perMes.map(x => x.efic),
      factTrend: perMes.map(x => x.ing),
      periodoLabel: winLbl(selWin),
      tipoRows,
    };
  }, [raw, filters, mesList]);

  if (loading) return <div className="loading-wrap"><div className="spinner" /><span>Cargando…</span></div>;
  if (error) return <div className="status err">{error}</div>;
  if (!d) return null;

  const eyebrow = (c: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', color: c });
  const dot = (c: string): React.CSSProperties => ({ width: 8, height: 8, borderRadius: '50%', background: c });
  const bigNum: React.CSSProperties = { fontSize: 'clamp(40px, 5vw, 54px)', fontWeight: 700, letterSpacing: '-1.6px', color: INK, lineHeight: 1, fontVariantNumeric: 'tabular-nums' };
  const kLabel: React.CSSProperties = { fontSize: 12.5, color: MUT, marginTop: 8, fontWeight: 500 };
  const sepRow: React.CSSProperties = { borderTop: '1px solid #eef0f5', paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' };
  const secLbl: React.CSSProperties = { fontSize: 12, color: MUT, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 600 };
  const secVal: React.CSSProperties = { fontSize: 22, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' };
  const chartCap: React.CSSProperties = { fontSize: 11, color: MUT, marginBottom: 4 };
  const col = (accent: string): React.CSSProperties => ({ background: '#fff', borderRadius: 14, padding: '30px 30px 24px', borderTop: `3px solid ${accent}`, boxShadow: '0 1px 3px rgba(20,30,60,.05)', display: 'flex', flexDirection: 'column', gap: 22 });


  // Configuración del gráfico de Drivers
  const tipoCfg = {
    type: 'bar' as const,
    data: {
      labels: d.tipoRows.map(r => r.tipo),
      datasets: [
        { label: 'Prod. Val. / Brig', data: d.tipoRows.map(r => r.ingXbrig), backgroundColor: INDIGO + 'CC' },
        { label: 'Costo Promedio / Brig', data: d.tipoRows.map(r => r.costXbrig), backgroundColor: '#C62828CC' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' as const } },
      scales: { y: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } } }
    }
  };

  const tipoTableData = {
    columns: ['Tipo de brigada', '# Brigadas', 'Prod. Valorizada', 'Prod. Val. / Brig', 'Costo / Brig'],
    categoryIndex: 0,
    rows: d.tipoRows.map(r => [r.tipo, fmtN(r.brigadas), fmtCOP(r.ingreso), fmtCOP(r.ingXbrig), fmtCOP(r.costXbrig)])
  };

  return (
    <>
      {/* Título */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '4px 2px 18px' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, color: INK }}>GERENCIAL</div>
          <div style={{ fontSize: 12.5, color: MUT, marginTop: 2 }}>Explicación de los drivers del negocio y rentabilidad</div>
        </div>
        <div style={{ fontSize: 12, color: MUT }}>Periodo · <b style={{ color: INK, fontWeight: 600 }}>{d.periodoLabel}</b></div>
      </div>

      {/* Dos columnas */}
      <div className="grid-2" style={{ alignItems: 'stretch', gap: 16 }}>
        {/* EFICIENCIA */}
        <div style={col(TEAL)}>
          <div style={eyebrow(TEAL)}><span style={dot(TEAL)} /> Eficiencia y Operación</div>
          <div>
            <div style={bigNum}>{d.eficiencia !== null ? fmtPct(d.eficiencia) : '—'}</div>
            <div style={kLabel}>Órdenes efectivas sobre el total de visitas</div>
          </div>
          <div style={sepRow}>
            <div style={secLbl}>% Cumplimiento de meta</div>
            <div style={secVal}>{d.cumplEfic !== null ? fmtPct(d.cumplEfic) : '—'}</div>
          </div>
          <MetaReal meta={d.metaEfec} real={d.efect} color={TEAL} fmt={fmtN} />
          <div>
            <div style={chartCap}>Tendencia · eficiencia (12 meses)</div>
            <Trend data={d.eficTrend} labels={d.xlabels} color={TEAL} fmt={(v) => v.toFixed(1) + '%'} />
          </div>
        </div>

        {/* PRODUCTIVIDAD */}
        <div style={col(INDIGO)}>
          <div style={eyebrow(INDIGO)}><span style={dot(INDIGO)} /> Financiero (P&L)</div>
          <div>
            <div style={bigNum}>{d.cumplFact !== null ? fmtPct(d.cumplFact) : '—'}</div>
            <div style={kLabel}>Prod. Valorizada vs meta del periodo</div>
          </div>
          <div style={sepRow}>
            <div style={secLbl}>Producción valorizada</div>
            <div style={secVal}>{fmtCOP(d.ingreso)}</div>
          </div>
          <MetaReal meta={d.metaFact} real={d.ingreso} color={INDIGO} fmt={fmtCOP} />
          <div>
            <div style={chartCap}>Tendencia · producción valorizada (12 meses)</div>
            <Trend data={d.factTrend} labels={d.xlabels} color={INDIGO} fmt={fmtCOP} />
          </div>
        </div>
      </div>

      {/* Franja inferior — resumen ejecutivo */}
      <div className="grid-3" style={{ marginTop: 16, gap: 16 }}>
        <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 3px rgba(20,30,60,.05)' }}>
          <div style={secLbl}>Comparativo acumulado</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: INK }}>{fmtCOP(d.acumA)}</span>
            <Delta d={d.dFact} />
          </div>
          <div style={{ fontSize: 11, color: MUT, marginTop: 4 }}>{d.selLbl} vs {d.prevLbl}</div>
        </div>

        <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 3px rgba(20,30,60,.05)' }}>
          <div style={secLbl}>Producción valorizada</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: INK, marginTop: 8 }}>{fmtCOP(d.ingreso)}</div>
          <div style={{ fontSize: 11, color: MUT, marginTop: 4 }}>Valor calculado de producción operativa del periodo</div>
        </div>

        <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 3px rgba(20,30,60,.05)' }}>
          <div style={secLbl}>Descuentos / pérdidas</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: d.perdidas > 0 ? '#C62828' : INK, marginTop: 8 }}>{fmtCOP(d.perdidas)}</div>
          <div style={{ fontSize: 11, color: MUT, marginTop: 4 }}>Valor no reconocido (Perdidas_COP)</div>
        </div>
      </div>

      {/* Productividad por tipo de brigada (Unit Economics) convertido a Gráfico */}
      <div className="section" style={{ marginTop: 24 }}>
        <h2>⚙️ Drivers de Producción (Unit Economics)</h2>
        <div style={{ height: 400 }}>
          <ChartCard 
            id="r-tipos" 
            title="Prod. Valorizada vs Costo Promedio por Tipo de Brigada" 
            subtitle="Análisis de rentabilidad unitaria por perfil de cuadrilla"
            config={tipoCfg as never} 
            height="tall" 
            hasDetail 
            detailTableData={tipoTableData} 
          />
        </div>
      </div>
    </>
  );
}