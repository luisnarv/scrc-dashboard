'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { filtRaw } from '../components/utils/filters';
import { fmtPct, fmtN } from '../components/utils/formatters';
import BrigadasDetalleModal from './BrigadasDetalleModal';

const TEAL = '#00897B';
const INDIGO = '#3949AB';
const OK = '#2E7D32';
const WARN = '#F57C00';
const ERR = '#C62828';
const INK = '#141b2d';
const MUT = '#8a93a6';

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
    // Para el negocio, "Perdidas" = "Fallidas sin pago" + las perdidas originales (sin precio)
    const fallidas = rawF.reduce((s, r) => s + n(r.Fallida_Con_Pago), 0);
    const perdidas = rawF.reduce((s, r) => s + n(r.Fallida_Sin_Pago) + n(r.Perdidas), 0);
    const visitas = rawF.reduce((s, r) => s + n(r.Visitas), 0);
    const asignado = rawF.reduce((s, r) => s + n(r.Asignacion), 0);
    const brigadasDisp = new Set(rawF.map(r => r.Cedula)).size;

    // días + promedio diario de brigadas activas
    const dayCed: Record<string, Set<unknown>> = {};
    rawF.forEach(r => { const f = String(r.Fecha || ''); (dayCed[f] ??= new Set()).add(r.Cedula); });
    const dias = Object.keys(dayCed);
    const diasEjec = dias.length;
    const brigadasOper = dias.length ? Math.round(dias.reduce((s, f) => s + dayCed[f].size, 0) / dias.length) : 0;

    const meses12 = mesList.slice(-12);
    const selWin = F.mes.length ? [...F.mes].sort() : [meses12[meses12.length - 1]].filter(Boolean) as string[];
    const diasHabiles = selWin.reduce((s, m) => s + diasHabilesMes(m), 0);

    // Cumplimientos
    const cEfect = asignado ? efect / asignado : 0;
    const cDias = diasHabiles ? diasEjec / diasHabiles : 0;
    const cAsignEjec = asignado ? visitas / asignado : 0;

    // Estado de la operación
    const disponibilidad = brigadasDisp ? brigadasOper / brigadasDisp : 0;
    const totOrd = efect + fallidas + perdidas || 1;
    const efectividad = visitas ? efect / visitas : 0;
    const perdRate = perdidas / totOrd;

    // Estado global + alertas accionables
    const alertas: string[] = [];
    if (disponibilidad < 0.85) alertas.push(`Disponibilidad de brigadas en ${fmtPct(disponibilidad)}`);
    if (efectividad < 0.65) alertas.push(`Efectividad en ${fmtPct(efectividad)}`);
    if (perdRate > 0.08) alertas.push(`Órdenes perdidas en ${fmtPct(perdRate)} del total`);
    const critico = disponibilidad < 0.75 || efectividad < 0.55 || perdRate > 0.15;
    const nivel: 'ok' | 'amber' | 'red' = alertas.length === 0 ? 'ok' : critico ? 'red' : 'amber';

    // Detalle por cédula (brigada≈técnico en esta data)
    type C = { nombre: string; brigada: string; zona: string; asign: number; efec: number; fall: number; perd: number; vis: number; ing: number; dias: Set<string>; horas: number[] };
    const ced: Record<string, C> = {};
    rawF.forEach(r => {
      const k = String(r.Cedula);
      const c = (ced[k] ??= { nombre: '', brigada: '', zona: '', asign: 0, efec: 0, fall: 0, perd: 0, vis: 0, ing: 0, dias: new Set(), horas: [] });
      c.nombre = String(r.Nombre || k);
      c.brigada = String(r.Tipo_Brigada_Operaciones || '—');
      c.zona = String(r._Zona || r.Zona || '—');
      c.asign += n(r.Asignacion); c.efec += n(r.Efectivas); c.fall += n(r.Fallida_Con_Pago);
      c.perd += n(r.Fallida_Sin_Pago) + n(r.Perdidas); c.vis += n(r.Visitas); c.ing += n(r.Ingresos);
      c.dias.add(String(r.Fecha || ''));
      const p = Number(r.Primera_Digitacion), u = Number(r.Ultima_Digitacion);
      if (isFinite(p) && isFinite(u) && u > p) c.horas.push(u - p);
    });
    const brigadaRows = Object.values(ced).map(c => {
      const nd = c.dias.size || 1;
      return { brigada: c.brigada, zona: c.zona, tecnico: c.nombre, asignadas: Math.round(c.asign), ejecutadas: c.efec, fallidas: c.fall, ingreso: c.ing, productividad: c.efec / nd, efectividad: c.vis ? c.efec / c.vis : 0 };
    });
    const tecnicoRows = Object.values(ced).map(c => {
      const nd = c.dias.size || 1;
      const horas = c.horas.length ? c.horas.reduce((s, h) => s + h, 0) / c.horas.length : 0;
      return { tecnico: c.nombre, brigada: c.brigada, asignadas: Math.round(c.asign), ejecutadas: c.efec, fallidas: c.fall, horas, productividad: c.efec / nd, efectividad: c.vis ? c.efec / c.vis : 0 };
    });

    const winLbl = selWin.length ? (selWin.length === 1 ? selWin[0] : `${selWin[0]} … ${selWin[selWin.length - 1]}`) : '—';

    return {
      efect, fallidas, perdidas, visitas, asignado, brigadasDisp, brigadasOper, diasEjec, diasHabiles,
      cEfect, cDias, cAsignEjec, disponibilidad, efectividad, perdRate, totOrd, alertas, nivel,
      brigadaRows, tecnicoRows, periodoLabel: winLbl,
    };
  }, [raw, filters, mesList]);

  if (loading) return <div className="loading-wrap"><div className="spinner" /><span>Cargando…</span></div>;
  if (error) return <div className="status err">{error}</div>;
  if (!d) return null;

  const kLbl: React.CSSProperties = { fontSize: 11, color: MUT, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 600 };
  const kVal: React.CSSProperties = { fontSize: 30, fontWeight: 700, color: INK, marginTop: 6, fontVariantNumeric: 'tabular-nums', lineHeight: 1 };
  const kSub: React.CSSProperties = { fontSize: 11, color: MUT, marginTop: 4 };
  const kpi = (label: string, value: string, sub?: string, accent?: string) => (
    <div style={card}><div style={kLbl}>{label}</div><div style={{ ...kVal, color: accent || INK }}>{value}</div>{sub && <div style={kSub}>{sub}</div>}</div>
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
      {/* Título + acción de detalle */}
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

      {/* Banner de estado */}
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

      {/* 1 · Resumen Operativo */}
      <div style={secH(TEAL)}><span style={dot(TEAL)} /> Resumen operativo</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 12 }}>
        {kpi('Brigadas disponibles', fmtN(d.brigadasDisp), 'pool del periodo')}
        {kpi('Brigadas operativas', fmtN(d.brigadasOper), 'promedio activo/día', TEAL)}
        {kpi('Total asignado', fmtN(d.asignado), 'meta de efectivas')}
        {kpi('Días ejecutados', fmtN(d.diasEjec), `de ${d.diasHabiles} hábiles`)}
        {kpi('Órdenes efectivas', fmtN(d.efect), undefined, OK)}
        {kpi('Órdenes fallidas', fmtN(d.fallidas), undefined, WARN)}
        {kpi('Órdenes perdidas', fmtN(d.perdidas), undefined, ERR)}
      </div>

      {/* 2 · Cumplimiento */}
      <div style={secH(TEAL)}><span style={dot(TEAL)} /> Cumplimiento · Meta vs Real</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {cumplCard('Órdenes efectivas', d.asignado, d.efect, fmtN)}
        {cumplCard('Días ejecutados', d.diasHabiles, d.diasEjec, fmtN)}
        {cumplCard('Asignado vs ejecutado', d.asignado, d.visitas, fmtN)}
      </div>

      {/* 3 · Estado de la Operación (un solo panel) */}
      <div style={secH(INDIGO)}><span style={dot(INDIGO)} /> Estado de la operación</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {/* Disponibilidad */}
        <div style={card}>
          <div style={kLbl}>Disponibilidad de brigadas</div>
          <div style={{ ...kVal, color: sem(d.disponibilidad * 100, 90, 80) }}>{fmtPct(d.disponibilidad)}</div>
          <div style={{ margin: '10px 0 6px' }}><ProgBar pct={d.disponibilidad * 100} color={sem(d.disponibilidad * 100, 90, 80)} /></div>
          <div style={kSub}>{fmtN(d.brigadasOper)} operativas de {fmtN(d.brigadasDisp)} disponibles</div>
        </div>

        {/* Distribución de órdenes */}
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

        {/* Asignado vs Ejecutado */}
        <div style={card}>
          <div style={kLbl}>Asignado vs ejecutado</div>
          <div style={{ ...kVal, color: sem(d.cAsignEjec * 100, 80, 60) }}>{fmtPct(d.cAsignEjec)}</div>
          <div style={{ margin: '10px 0 6px' }}><ProgBar pct={d.cAsignEjec * 100} color={sem(d.cAsignEjec * 100, 80, 60)} /></div>
          <div style={kSub}>{fmtN(d.visitas)} ejecutadas de {fmtN(d.asignado)} asignadas</div>
        </div>
      </div>
      {modalOpen && <BrigadasDetalleModal onClose={() => setModalOpen(false)} />}
    </>
  );
}