'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { filtRaw } from '../components/utils/filters';
import { fmtN } from '../components/utils/formatters';

/* Paleta del dashboard */
const TEAL = '#00897B';
const INK = '#141b2d';
const MUT = '#8a93a6';
const OK = '#2E7D32';
const WARN = '#F57C00';
const ERR = '#C62828';
const LINE = '#e7eaf0';

/* ---------- modelo de fila (sirve para brigada y para técnico) ---------- */
interface Row {
  key: string;
  label: string;
  susp: number;
  reco: number;
  seMant: number;
  efec: number;
  fall: number;   // fallidas sin pago
  pagos: number;  // fallidas con pago
  perd: number;
  totVis: number;
  dias: number;   // técnico-días (denominador de los promedios)
  tecnicos?: Row[];
}

type SortKey =
  | 'label' | 'susp' | 'reco' | 'seMant' | 'efec' | 'fall' | 'pagos' | 'perd'
  | 'totVis' | 'promVis' | 'promEfec' | 'promSusp' | 'promSeMant';

const num = (v: unknown) => Number(v) || 0;

/* columnas de la tabla: clave, título, ¿es promedio? */
const COLS: { key: SortKey; label: string; prom?: boolean; accent?: string }[] = [
  { key: 'susp', label: 'Susp.' },
  { key: 'reco', label: 'Reco.' },
  { key: 'seMant', label: 'Se Mant.' },
  { key: 'efec', label: 'Efectivas', accent: OK },
  { key: 'fall', label: 'Fallidas', accent: WARN },
  { key: 'pagos', label: 'Pagos' },
  { key: 'perd', label: 'Perdidas', accent: ERR },
  { key: 'totVis', label: 'Total Visitas' },
  { key: 'promVis', label: 'Prom Vis.', prom: true },
  { key: 'promEfec', label: 'Prom Efec.', prom: true },
  { key: 'promSusp', label: 'Prom Susp.', prom: true },
  { key: 'promSeMant', label: 'Prom Se Mant.', prom: true },
];

function promValue(r: Row, key: SortKey): number {
  const d = r.dias || 1;
  switch (key) {
    case 'promVis': return r.totVis / d;
    case 'promEfec': return r.efec / d;
    case 'promSusp': return r.susp / d;
    case 'promSeMant': return r.seMant / d;
    default: return num((r as unknown as Record<string, number>)[key]);
  }
}

export default function BrigadasDetalleModal({ onClose }: { onClose: () => void }) {
  const { raw, filters } = useDashboard();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>('totVis');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [q, setQ] = useState('');

  /* cerrar con Escape + bloquear scroll del fondo */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  /* ------- agregación: por tipo de cuadrilla, con drill-down a técnico ------- */
  const { brigadas, total, periodo } = useMemo(() => {
    const empty = { brigadas: [] as Row[], total: null as Row | null, periodo: '—' };
    if (!raw) return empty;
    const rows = filtRaw(raw.raw, filters);

    // brigada -> (cedula -> acumulador)
    const briMap: Record<string, { agg: Row; tecs: Record<string, Row> }> = {};
    for (const r of rows) {
      const bKey = String(r.Tipo_Cuadrilla || '—');
      const b = (briMap[bKey] ??= {
        agg: { key: bKey, label: bKey, susp: 0, reco: 0, seMant: 0, efec: 0, fall: 0, pagos: 0, perd: 0, totVis: 0, dias: 0 },
        tecs: {},
      });
      const ced = String(r.Cedula || '');
      const t = (b.tecs[ced] ??= {
        key: `${bKey}::${ced}`, label: String(r.Nombre || ced),
        susp: 0, reco: 0, seMant: 0, efec: 0, fall: 0, pagos: 0, perd: 0, totVis: 0, dias: 0,
      });

      const susp = num(r.Suspensiones), reco = num(r.Reconexiones), seMant = num(r.Se_Mantiene);
      const efec = num(r.Efectivas), perd = num(r.Perdidas);
      const pagos = num(r.Fallida_Con_Pago);
      const fall = num(r.Fallida_Sin_Pago);
      const totVis = efec + fall + pagos + perd;

      for (const acc of [b.agg, t]) {
        acc.susp += susp; acc.reco += reco; acc.seMant += seMant;
        acc.efec += efec; acc.fall += fall; acc.pagos += pagos; acc.perd += perd;
        acc.totVis += totVis; acc.dias += 1; // cada registro = un técnico-día
      }
    }

    const brigadas = Object.values(briMap).map(({ agg, tecs }) => ({
      ...agg,
      tecnicos: Object.values(tecs).sort((a, b) => b.efec - a.efec),
    }));

    const total: Row = brigadas.reduce((s, b) => {
      (['susp', 'reco', 'seMant', 'efec', 'fall', 'pagos', 'perd', 'totVis', 'dias'] as const)
        .forEach(k => { s[k] += b[k]; });
      return s;
    }, { key: '__total', label: 'Total', susp: 0, reco: 0, seMant: 0, efec: 0, fall: 0, pagos: 0, perd: 0, totVis: 0, dias: 0 } as Row);

    // etiqueta de periodo (a partir de fechas filtradas)
    const fechas = [...new Set(rows.map(r => String(r.Fecha || '')).filter(Boolean))].sort();
    const periodo = fechas.length ? (fechas.length === 1 ? fechas[0] : `${fechas[0]} … ${fechas[fechas.length - 1]}`) : '—';

    return { brigadas, total, periodo };
  }, [raw, filters]);

  const brigadasSort = useMemo(() => {
    const arr = q.trim()
      ? brigadas.filter(b => b.label.toLowerCase().includes(q.trim().toLowerCase()))
      : brigadas.slice();
    const mult = dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      if (sort === 'label') return a.label.localeCompare(b.label) * mult;
      return (promValue(a, sort) - promValue(b, sort)) * mult;
    });
    return arr;
  }, [brigadas, sort, dir, q]);

  const toggle = (k: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const clickSort = (k: SortKey) => {
    if (sort === k) setDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(k); setDir(k === 'label' ? 'asc' : 'desc'); }
  };

  /* --------------------------------- estilos --------------------------------- */
  const th: React.CSSProperties = {
    padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap',
    textTransform: 'uppercase', letterSpacing: 0.4, userSelect: 'none', cursor: 'pointer',
    position: 'sticky', top: 0, background: TEAL, zIndex: 2,
  };
  const tdBase: React.CSSProperties = { padding: '9px 12px', fontSize: 13, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  const numCell = (v: number, prom = false, accent?: string): React.CSSProperties => ({
    ...tdBase, textAlign: 'right', color: v === 0 ? '#c2c8d4' : (accent || INK),
    fontWeight: prom ? 600 : 500,
  });
  const arrow = (k: SortKey) => (sort === k ? (dir === 'asc' ? ' ▲' : ' ▼') : '');

  /* fila de datos reutilizable (brigada o técnico) */
  const dataCells = (r: Row, prom = false) => COLS.map(c => {
    const v = c.prom ? promValue(r, c.key) : num((r as unknown as Record<string, number>)[c.key]);
    return (
      <td key={c.key} style={numCell(v, !!c.prom, c.accent)}>
        {c.prom ? v.toFixed(2) : fmtN(v)}
      </td>
    );
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,27,45,.55)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Detalle por brigadas"
        style={{
          background: '#fff', borderRadius: 16, width: 'min(1180px, 96vw)', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(20,30,60,.28)',
        }}
      >
        {/* encabezado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: `1px solid ${LINE}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 1.5, color: INK }}>DETALLE POR BRIGADAS</div>
            <div style={{ fontSize: 12, color: MUT, marginTop: 2 }}>
              Tipificación de efectivas y visitas · toca una fila para ver sus técnicos · Periodo <b style={{ color: INK }}>{periodo}</b>
            </div>
          </div>
          <input
            value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar brigada…"
            style={{ padding: '8px 12px', border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 13, width: 190, outline: 'none', color: INK }}
          />
          <button
            onClick={onClose} aria-label="Cerrar"
            style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${LINE}`, background: '#fff', color: MUT, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
          >×</button>
        </div>

        {/* tabla */}
        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left', cursor: 'pointer' }} onClick={() => clickSort('label')}>
                  Tipo de cuadrilla{arrow('label')}
                </th>
                {COLS.map(c => (
                  <th key={c.key} style={{ ...th, textAlign: 'right' }} onClick={() => clickSort(c.key)}>
                    {c.label}{arrow(c.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {brigadasSort.map((b, i) => {
                const open = expanded.has(b.key);
                return (
                  <BrigadaGroup
                    key={b.key} b={b} open={open} zebra={i % 2 === 1}
                    onToggle={() => toggle(b.key)} dataCells={dataCells}
                  />
                );
              })}
              {brigadasSort.length === 0 && (
                <tr><td colSpan={COLS.length + 1} style={{ ...tdBase, textAlign: 'center', color: MUT, padding: 28 }}>
                  No hay registros para el filtro actual.
                </td></tr>
              )}
            </tbody>
            {total && (
              <tfoot>
                <tr style={{ position: 'sticky', bottom: 0 }}>
                  <td style={{ ...tdBase, fontWeight: 800, color: INK, background: '#f4f6fa', borderTop: `2px solid ${TEAL}` }}>Total</td>
                  {COLS.map(c => {
                    const v = c.prom ? promValue(total, c.key) : num((total as unknown as Record<string, number>)[c.key]);
                    return (
                      <td key={c.key} style={{ ...tdBase, textAlign: 'right', fontWeight: 800, color: INK, background: '#f4f6fa', borderTop: `2px solid ${TEAL}` }}>
                        {c.prom ? v.toFixed(2) : fmtN(v)}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* pie */}
        <div style={{ padding: '10px 20px', borderTop: `1px solid ${LINE}`, fontSize: 11.5, color: MUT, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span>{brigadasSort.length} brigada(s) · {total ? fmtN(total.dias) : 0} técnico-días</span>
          <span>Prom = valor ÷ técnico-días · Total Visitas = Efectivas + Fallidas + Pagos + Perdidas</span>
        </div>
      </div>
    </div>
  );
}

/* ------- fila de brigada + sub-filas de técnico (expandible) ------- */
function BrigadaGroup({
  b, open, zebra, onToggle, dataCells,
}: {
  b: Row; open: boolean; zebra: boolean; onToggle: () => void;
  dataCells: (r: Row, prom?: boolean) => React.ReactNode;
}) {
  const rowBg = open ? '#eef7f5' : zebra ? '#fafbfc' : '#fff';
  const chev: React.CSSProperties = {
    display: 'inline-block', width: 16, transition: 'transform .18s',
    transform: open ? 'rotate(90deg)' : 'none', color: TEAL, fontSize: 12,
  };
  return (
    <>
      <tr
        onClick={onToggle}
        style={{ background: rowBg, cursor: 'pointer', borderBottom: `1px solid ${LINE}` }}
      >
        <td style={{ padding: '10px 12px', fontSize: 13.5, fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>
          <span style={chev}>▶</span>{b.label}
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: MUT }}>
            {b.tecnicos?.length ?? 0} téc.
          </span>
        </td>
        {dataCells(b)}
      </tr>
      {open && b.tecnicos?.map(t => (
        <tr key={t.key} style={{ background: '#fff', borderBottom: `1px solid ${LINE}` }}>
          <td style={{ padding: '7px 12px 7px 34px', fontSize: 12.5, color: '#42506b', whiteSpace: 'nowrap' }}>
            <span style={{ color: '#c2c8d4', marginRight: 6 }}>└</span>{t.label}
            <span style={{ marginLeft: 8, fontSize: 10.5, color: MUT }}>{fmtN(t.dias)} días</span>
          </td>
          {dataCells(t)}
        </tr>
      ))}
    </>
  );
}