'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { filtRaw } from '../components/utils/filters';
import { fmtPct, fmtN } from '../components/utils/formatters';
import BrigadasDetalleModal from './BrigadasDetalleModal';
import DisponibilidadSection from './DisponibilidadSection';
import ChartCard from '../components/ChartCard';

const TEAL = 'var(--sip)';
const INDIGO = 'var(--otc)';
const OK = 'var(--ok)';
const WARN = 'var(--warn)';
const ERR = 'var(--err)';
const INK = 'var(--text-title)';
const MUT = 'var(--text-muted)';

function diasHabilesMes(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return 0;
  const dim = new Date(y, m, 0).getDate();
  let c = 0;
  for (let day = 1; day <= dim; day++) { if (new Date(y, m - 1, day).getDay() !== 0) c++; }
  return c;
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 3px rgba(20,30,60,.05)' };
const secH = (c: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: c, margin: '24px 2px 12px' });
const dot = (c: string): React.CSSProperties => ({ width: 8, height: 8, borderRadius: '50%', background: c });

/* Barra de progreso simple con semáforo */
function ProgBar({ pct, color }: { pct: number; color: string }) {
  return (
    <span style={{ display: 'block', height: 10, background: '#eef0f5', borderRadius: 5, overflow: 'hidden' }}>
      <span style={{ display: 'block', height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`, background: color, borderRadius: 5, transition: 'width .5s' }} />
    </span>
  );
}

function sem(v: number, good: number, warn: number) { return v >= good ? OK : v >= warn ? WARN : ERR; }

export default function OperativoPage() {
  const { raw, filters, mesList, loading, error } = useDashboard();
  const [modalOpen, setModalOpen] = useState(false);

  const d = useMemo(() => {
    if (!raw) return null;
    const F = filters;
    const n = (v: unknown) => Number(v) || 0;
    const rawF = filtRaw(raw.raw, F);

    const efect = rawF.reduce((s, r) => s + n(r.Efectivas), 0);
    const fallidas = rawF.reduce((s, r) => s + n(r.Fallida_Con_Pago), 0);
    const perdidas = rawF.reduce((s, r) => s + n(r.Fallida_Sin_Pago) + n(r.Perdidas), 0);
    const visitas = rawF.reduce((s, r) => s + n(r.Visitas), 0);
    const asignado = rawF.reduce((s, r) => s + n(r.Asignacion), 0);
    const brigadasDisp = new Set(rawF.map(r => r.Cedula)).size;

    // Agrupación Diaria para Evolutivos y Tendencias
    const byDay: Record<string, { efec: number, fall: number, perd: number, disp: number, oper: number, brigadas: Set<unknown> }> = {};
    const byTypeDay: Record<string, Record<string, { efec: number, vis: number }>> = {};

    rawF.forEach(r => {
      const day = String(r.Fecha || '');
      if (!day) return;
      const t = String(r.Tipo_Cuadrilla || r.Tipo_Brigada_Operaciones || 'Sin tipo');
      
      const e = n(r.Efectivas);
      const f = n(r.Fallida_Con_Pago);
      const p = n(r.Fallida_Sin_Pago) + n(r.Perdidas);
      const v = n(r.Visitas);
      
      const bd = (byDay[day] ??= { efec: 0, fall: 0, perd: 0, disp: 0, oper: 0, brigadas: new Set() });
      bd.efec += e; bd.fall += f; bd.perd += p;
      bd.brigadas.add(r.Cedula);

      const btd = (byTypeDay[t] ??= {});
      const td = (btd[day] ??= { efec: 0, vis: 0 });
      td.efec += e; td.vis += v;
    });

    const dias = Object.keys(byDay).sort();
    const diasEjec = dias.length;

    // Calcular disponibles diarios desde raw.disp (si está disponible)
    if (raw.disp) {
      const dispData = raw.disp;
      dias.forEach(d => {
        const matchingDisp = dispData.filter(r => r.Fecha === d);
        const operativas = byDay[d].brigadas.size;
        // Total activo en el pool de disponibilidad ese día
        const totalDisp = matchingDisp.reduce((sum, r) => sum + (Number(r.BrigadasActivas) || 0), 0);
        byDay[d].oper = operativas;
        byDay[d].disp = totalDisp > 0 ? totalDisp : operativas; // Fallback si no hay meta
      });
    } else {
      dias.forEach(d => {
        byDay[d].oper = byDay[d].brigadas.size;
        byDay[d].disp = brigadasDisp;
      });
    }

    const brigadasOper = dias.length ? Math.round(dias.reduce((s, f) => s + byDay[f].oper, 0) / dias.length) : 0;

    const meses12 = mesList.slice(-12);
    const selWin = F.mes.length ? [...F.mes].sort() : [meses12[meses12.length - 1]].filter(Boolean) as string[];
    const diasHabiles = selWin.reduce((s, m) => s + diasHabilesMes(m), 0);

    // Cumplimientos
    const cEfect = asignado ? efect / asignado : 0;
    const cDias = diasHabiles ? diasEjec / diasHabiles : 0;
    const cAsignEjec = asignado ? visitas / asignado : 0;
    const disponibilidad = brigadasDisp ? brigadasOper / brigadasDisp : 0;
    const totOrd = efect + fallidas + perdidas || 1;
    const efectividad = visitas ? efect / visitas : 0;
    const perdRate = perdidas / totOrd;

    // Deltas de tendencia (último día vs día anterior)
    let dEfec = null, dFall = null, dDisp = null, ultD = '', antD = '';
    if (dias.length >= 2) {
      ultD = dias[dias.length - 1];
      antD = dias[dias.length - 2];
      const ult = byDay[ultD];
      const ant = byDay[antD];
      if (ant.efec) dEfec = (ult.efec - ant.efec) / ant.efec;
      if (ant.fall) dFall = (ult.fall - ant.fall) / ant.fall;
      const dispUlt = ult.disp ? ult.oper / ult.disp : 0;
      const dispAnt = ant.disp ? ant.oper / ant.disp : 0;
      dDisp = dispUlt - dispAnt; // Variación porcentual absoluta
    }

    // Narrativa Automática
    let narrativa = 'No hay suficientes datos diarios para generar una tendencia.';
    if (dias.length >= 2 && dEfec !== null) {
      const maxEfecDay = dias.reduce((a, b) => byDay[a].efec > byDay[b].efec ? a : b);
      const efecTrend = dEfec > 0.05 ? 'al alza' : dEfec < -0.05 ? 'a la baja' : 'estable';
      narrativa = `La operación muestra una tendencia ${efecTrend} en efectivas respecto al día anterior. El día de mayor volumen fue el ${maxEfecDay.slice(-2)} con ${fmtN(byDay[maxEfecDay].efec)} efectivas. `;
      
      if (disponibilidad < 0.7) narrativa += `La disponibilidad promedio es preocupantemente baja (${fmtPct(disponibilidad)}). `;
      else narrativa += `La disponibilidad promedio se mantiene en ${fmtPct(disponibilidad)}. `;

      if (perdRate > 0.1) narrativa += `Atención: Hay un volumen alto de órdenes perdidas (${fmtPct(perdRate)}).`;
    }

    // Configuración de Gráficos (Evolutivos Diarios)
    const baseOpt = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom' as const, labels: { boxWidth: 12, font: { size: 10 } } } } };
    
    // Gráfico 1: Evolutivo Diario de Órdenes
    const chartOrd = {
      type: 'bar',
      data: {
        labels: dias.map(d => d.slice(-2)),
        datasets: [
          { label: 'Efectivas', data: dias.map(d => byDay[d].efec), backgroundColor: OK },
          { label: 'Fallidas', data: dias.map(d => byDay[d].fall), backgroundColor: WARN },
          { label: 'Perdidas', data: dias.map(d => byDay[d].perd), backgroundColor: ERR },
        ]
      },
      options: { ...baseOpt, scales: { x: { stacked: true }, y: { stacked: true } } }
    };

    // Gráfico 2: Evolutivo Diario de Brigadas
    const chartBrig = {
      type: 'line',
      data: {
        labels: dias.map(d => d.slice(-2)),
        datasets: [
          { label: 'Brigadas Operativas', data: dias.map(d => byDay[d].oper), borderColor: INDIGO, backgroundColor: 'var(--otc-bg)', fill: true, tension: 0.3 },
          { label: 'Brigadas Disponibles', data: dias.map(d => byDay[d].disp), borderColor: MUT, borderDash: [5, 5], fill: false, tension: 0 },
        ]
      },
      options: { ...baseOpt, scales: { y: { min: 0 } } }
    };

    // Gráfico 3: Evolutivo por Tipo de Brigada
    const tiposArr = Object.keys(byTypeDay);
    const colors = ['var(--warn)', 'var(--sip)', 'var(--ok)', 'var(--otc)', 'var(--text-muted)', 'var(--brand-primary)'];
    const chartTipos = {
      type: 'line',
      data: {
        labels: dias.map(d => d.slice(-2)),
        datasets: tiposArr.map((t, i) => ({
          label: t,
          data: dias.map(d => byTypeDay[t][d]?.efec || 0),
          borderColor: colors[i % colors.length],
          fill: false, tension: 0.3
        }))
      },
      options: { ...baseOpt, scales: { y: { min: 0 } } }
    };

    // Estado global + alertas accionables
    const alertas: string[] = [];
    if (disponibilidad < 0.40) alertas.push(`Disponibilidad de brigadas en ${fmtPct(disponibilidad)}`);
    if (efectividad < 0.65) alertas.push(`Efectividad en ${fmtPct(efectividad)}`);
    if (perdRate > 0.08) alertas.push(`Órdenes perdidas en ${fmtPct(perdRate)} del total`);
    const critico = disponibilidad < 0.30 || efectividad < 0.55 || perdRate > 0.15;
    const nivel: 'ok' | 'amber' | 'red' = alertas.length === 0 ? 'ok' : critico ? 'red' : 'amber';

    const winLbl = selWin.length ? (selWin.length === 1 ? selWin[0] : `${selWin[0]} … ${selWin[selWin.length - 1]}`) : '—';

    return {
      efect, fallidas, perdidas, visitas, asignado, brigadasDisp, brigadasOper, diasEjec, diasHabiles,
      cEfect, cDias, cAsignEjec, disponibilidad, efectividad, perdRate, totOrd, alertas, nivel,
      periodoLabel: winLbl, dEfec, dFall, dDisp, narrativa, chartOrd, chartBrig, chartTipos
    };
  }, [raw, filters, mesList]);

  if (loading) return <div className="loading-wrap"><div className="spinner" /><span>Cargando…</span></div>;
  if (error) return <div className="status err">{error}</div>;
  if (!d) return null;

  const kLbl: React.CSSProperties = { fontSize: 11, color: MUT, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 600 };
  const kVal: React.CSSProperties = { fontSize: 30, fontWeight: 700, color: INK, marginTop: 6, fontVariantNumeric: 'tabular-nums', lineHeight: 1 };
  const kSub: React.CSSProperties = { fontSize: 11, color: MUT, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 };
  
  const TrendIcon = ({ val, invert }: { val: number | null, invert?: boolean }) => {
    if (val === null) return null;
    if (Math.abs(val) < 0.01) return <span style={{ color: MUT }}>→</span>;
    const isUp = val > 0;
    const isGood = invert ? !isUp : isUp;
    return <span style={{ color: isGood ? OK : ERR, fontWeight: 700 }}>{isUp ? '↑' : '↓'} {(Math.abs(val) * 100).toFixed(1)}%</span>;
  };

  const kpi = (label: string, value: string, sub?: string, accent?: string, delta?: number | null, invertDelta?: boolean) => (
    <div style={card}>
      <div style={kLbl}>{label}</div>
      <div style={{ ...kVal, color: accent || INK }}>{value}</div>
      {(sub || delta !== undefined) && (
        <div style={kSub}>
          {delta !== undefined && <TrendIcon val={delta} invert={invertDelta} />}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </div>
  );

  // ---- Cumplimiento (Meta vs Real con barra) ----
  const cumplCard = (label: string, meta: number, real: number, fmt: (v: number) => string) => {
    const pct = meta ? (real / meta) * 100 : 0;
    const color = sem(pct, 90, 70);
    return (
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={kLbl}>{label}</span>
          <span style={{ fontSize: 20, fontWeight: 700, color }}>{pct.toFixed(0)}%</span>
        </div>
        <div style={{ margin: '10px 0 8px' }}><ProgBar pct={pct} color={color} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: MUT }}>
          <span>Real <b style={{ color: INK }}>{fmt(real)}</b></span>
          <span>Meta <b style={{ color: INK }}>{fmt(meta)}</b></span>
        </div>
      </div>
    );
  };

  // ---- VISTA PRINCIPAL ----
  const nivelCfg = {
    ok: { c: OK, t: 'La operación está en línea', s: 'Sin desviaciones que requieran atención inmediata.' },
    amber: { c: WARN, t: 'Requiere atención', s: 'Hay indicadores fuera de rango:' },
    red: { c: ERR, t: 'Desviación crítica', s: 'Indicadores en nivel crítico:' },
  }[d.nivel];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '4px 2px 12px' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, color: INK }}>OPERATIVO</div>
          <div style={{ fontSize: 12.5, color: MUT, marginTop: 2 }}>¿Cómo está la operación hoy y qué requiere atención?</div>
        </div>
        <button onClick={() => setModalOpen(true)}
          style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: TEAL, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,137,123,.3)' }}>
          Ver Detalle Operativo →
        </button>
      </div>

      <div style={{ ...card, borderLeft: `4px solid ${nivelCfg.c}`, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: nivelCfg.c, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: nivelCfg.c }}>{nivelCfg.t}</div>
          <div style={{ fontSize: 12.5, color: MUT, marginTop: 2 }}>
            {nivelCfg.s} {d.alertas.length > 0 && <b style={{ color: INK }}>{d.alertas.join(' · ')}</b>}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: MUT }}>Periodo · <b style={{ color: INK, fontWeight: 600 }}>{d.periodoLabel}</b></div>
      </div>

      {/* Narrativa Automática */}
      <div style={{ background: '#f8fafc', padding: '14px 18px', borderRadius: 10, marginTop: 12, fontSize: 13, color: '#475569', borderLeft: '3px solid #cbd5e1', lineHeight: 1.5 }}>
        <strong style={{ color: '#0f172a' }}>⚡ Resumen Diario:</strong> {d.narrativa}
      </div>

      {/* 1 · Resumen Operativo */}
      <div style={secH(TEAL)}><span style={dot(TEAL)} /> Resumen operativo</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 12 }}>
        {kpi('Brigadas operativas', fmtN(d.brigadasOper), 'promedio activo/día', TEAL, d.dDisp, false)}
        {kpi('Brigadas disponibles', fmtN(d.brigadasDisp), 'pool del periodo')}
        {kpi('Total asignado', fmtN(d.asignado), 'meta de efectivas')}
        {kpi('Días ejecutados', fmtN(d.diasEjec), `de ${d.diasHabiles} hábiles`)}
        {kpi('Órdenes efectivas', fmtN(d.efect), undefined, OK, d.dEfec, false)}
        {kpi('Órdenes fallidas', fmtN(d.fallidas), undefined, WARN, d.dFall, true)}
        {kpi('Órdenes perdidas', fmtN(d.perdidas), undefined, ERR)}
      </div>

      {/* Evolutivos Diarios (NUEVO) */}
      <div style={secH(TEAL)}><span style={dot(TEAL)} /> Seguimiento Diario de Operación</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 12 }}>
        <ChartCard id="op-ord" title="Evolutivo Diario de Órdenes" config={d.chartOrd as never} height="short" hasDetail />
        <ChartCard id="op-brig" title="Evolutivo Diario de Brigadas" config={d.chartBrig as never} height="short" hasDetail />
        <ChartCard id="op-tipos" title="Efectivas por Tipo de Brigada" config={d.chartTipos as never} height="short" hasDetail />
      </div>

      {/* 2 · Cumplimiento */}
      <div style={secH(TEAL)}><span style={dot(TEAL)} /> Cumplimiento · Meta vs Real</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {cumplCard('Órdenes efectivas', d.asignado, d.efect, fmtN)}
        {cumplCard('Días ejecutados', d.diasHabiles, d.diasEjec, fmtN)}
        {cumplCard('Asignado vs ejecutado', d.asignado, d.visitas, fmtN)}
      </div>

      {/* 3 · Estado de la Operación */}
      <div style={secH(INDIGO)}><span style={dot(INDIGO)} /> Estado de la operación</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <div style={card}>
          <div style={kLbl}>Disponibilidad de brigadas</div>
          <div style={{ ...kVal, color: sem(d.disponibilidad * 100, 90, 80) }}>{fmtPct(d.disponibilidad)}</div>
          <div style={{ margin: '10px 0 6px' }}><ProgBar pct={d.disponibilidad * 100} color={sem(d.disponibilidad * 100, 90, 80)} /></div>
          <div style={kSub}>{fmtN(d.brigadasOper)} operativas de {fmtN(d.brigadasDisp)} disponibles</div>
        </div>

        <div style={card}>
          <div style={kLbl}>Distribución de órdenes</div>
          <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', margin: '12px 0 10px' }}>
            <span style={{ width: `${(d.efect / d.totOrd) * 100}%`, background: OK }} />
            <span style={{ width: `${(d.fallidas / d.totOrd) * 100}%`, background: WARN }} />
            <span style={{ width: `${(d.perdidas / d.totOrd) * 100}%`, background: ERR }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12, color: MUT }}>
            <span><b style={{ color: OK }}>●</b> Efectivas {fmtN(d.efect)} ({fmtPct(d.efect / d.totOrd)})</span>
            <span><b style={{ color: WARN }}>●</b> Fallidas {fmtN(d.fallidas)} ({fmtPct(d.fallidas / d.totOrd)})</span>
            <span><b style={{ color: ERR }}>●</b> Perdidas {fmtN(d.perdidas)} ({fmtPct(d.perdidas / d.totOrd)})</span>
          </div>
        </div>

        <div style={card}>
          <div style={kLbl}>Asignado vs ejecutado</div>
          <div style={{ ...kVal, color: sem(d.cAsignEjec * 100, 80, 60) }}>{fmtPct(d.cAsignEjec)}</div>
          <div style={{ margin: '10px 0 6px' }}><ProgBar pct={d.cAsignEjec * 100} color={sem(d.cAsignEjec * 100, 80, 60)} /></div>
          <div style={kSub}>{fmtN(d.visitas)} ejecutadas de {fmtN(d.asignado)} asignadas</div>
        </div>
      </div>
      
      <DisponibilidadSection />

      {modalOpen && <BrigadasDetalleModal onClose={() => setModalOpen(false)} />}
    </>
  );
}