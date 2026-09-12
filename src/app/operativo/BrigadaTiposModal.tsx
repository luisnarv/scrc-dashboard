'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import { esFestivo } from '../components/utils/holidays';
import { getMinutosTrabajoHora } from '../components/utils/metasBrigadas';
import { fmtN } from '../components/utils/formatters';
import { SegmentedControl } from '../components/Buttons';

/* Bandas de franja no laborable (almuerzo / fuera de jornada / domingo / festivo). */
const bandsPlugin = {
  id: 'bandsBrigTipos',
  beforeDatasetsDraw(chart: any, _args: any, options: any) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales || !scales.x) return;
    const { top, bottom, left, right } = chartArea;
    const { x } = scales;
    const fecha = options?.fecha || '';
    const zona = options?.zona || '';
    const esHora = options?.esHora;
    const ticks = x.ticks || [];
    ticks.forEach((tick: any, index: number) => {
      const label = x.getLabelForValue ? x.getLabelForValue(tick.value) : tick.label;
      if (typeof label !== 'string') return;
      let isNonWorking = false;
      let text = '';
      if (esHora) {
        isNonWorking = getMinutosTrabajoHora(label, fecha, zona) === 0;
        text = label === '12:00' ? 'Almuerzo' : 'Fuera de jornada';
      } else {
        const dateStr = chart.data?.labels?.[tick.value] || label;
        const fullDateStr = typeof dateStr === 'string' && dateStr.length === 2 ? `${fecha.slice(0, 7)}-${dateStr}` : String(dateStr);
        const parts = fullDateStr.split('-').map(Number);
        if (parts.length === 3) {
          const dt = new Date(parts[0], parts[1] - 1, parts[2]);
          isNonWorking = dt.getDay() === 0 || esFestivo(dt);
          text = dt.getDay() === 0 ? 'Domingo' : 'Festivo';
        }
      }
      if (!isNonWorking) return;
      const xPos = x.getPixelForTick(index);
      const nextPos = index < ticks.length - 1 ? x.getPixelForTick(index + 1) : null;
      const prevPos = index > 0 ? x.getPixelForTick(index - 1) : null;
      let halfWidth = 14;
      if (nextPos !== null) halfWidth = Math.abs(nextPos - xPos) / 2;
      else if (prevPos !== null) halfWidth = Math.abs(xPos - prevPos) / 2;
      const slotLeft = Math.max(left, xPos - halfWidth);
      const slotRight = Math.min(right, xPos + halfWidth);
      const slotWidth = slotRight - slotLeft;
      const slotHeight = bottom - top;
      if (slotWidth <= 0) return;
      ctx.save();
      ctx.fillStyle = 'rgba(140,147,130,.10)';
      ctx.fillRect(slotLeft, top, slotWidth, slotHeight);
      ctx.save();
      ctx.beginPath(); ctx.rect(slotLeft, top, slotWidth, slotHeight); ctx.clip();
      ctx.strokeStyle = 'rgba(140,147,130,.22)'; ctx.lineWidth = 1.4; ctx.beginPath();
      for (let xLine = slotLeft - slotHeight; xLine < slotRight + slotHeight; xLine += 8) {
        ctx.moveTo(xLine, bottom); ctx.lineTo(xLine + slotHeight, top);
      }
      ctx.stroke(); ctx.restore();
      if (text) {
        ctx.font = '600 10px sans-serif'; ctx.fillStyle = 'rgba(120,127,110,.9)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.save(); ctx.translate(xPos, top + slotHeight / 2); ctx.rotate(-Math.PI / 2);
        ctx.fillText(text, 0, 0); ctx.restore();
      }
      ctx.restore();
    });
  }
};

const SHORT_BRIG: Record<string, string> = {
  'BRIGADA PESADA': 'Pesada', 'SCR PESADA': 'Pesada', 'BRIGADA TIPO PESADA': 'Pesada',
  'BRIGADA LIVIANA': 'Liviana', 'SCR LIVIANA': 'Liviana', 'BRIGADA TIPO LIVIANA': 'Liviana',
  'GESTOR INTEGRAL MULTI': 'Multifam.', 'SCR MULTIFAMILIAR': 'Multifam.',
  'BRIGADA MINICANASTA': 'Minicanasta', 'SCR MINI CANASTA': 'Minicanasta', 'BRIGADA TIPO MINICANASTA': 'Minicanasta',
  'BRIGADA PESADA MT-AT': 'Medida esp.', 'SCR MEDIDA ESPECIAL': 'Medida esp.', 'BRIGADA PESADA/ MT AT': 'Medida esp.',
  'BRIGADA CANASTA': 'Canasta', 'CANASTA': 'Canasta', 'BRIGADA TIPO CANASTA': 'Canasta',
  '(D) BRIGADA PESADA': 'Pesada Disp.', 'PESADA DISPONIBLE': 'Pesada Disp.', '(D) BRIGADA TIPO PESADA': 'Pesada Disp.',
};
const shortBrig = (t: string) => SHORT_BRIG[String(t).trim().toUpperCase()] || t;

export interface TipoData {
  label: string; color: string; serie: (number | null)[];
  brigadas: number; pico: number; promedio: number; ordenes: number; cv: number; constancia: string;
}
export interface BrigTiposData {
  esHora: boolean; fecha: string; zona: string; pool: number;
  labels: string[]; jornada: string; fechaTexto: string; tipos: TipoData[];
}

const OK = 'var(--ok)'; const ERR = 'var(--err)'; const WARN = '#8A6D00';
const INK = 'var(--text-title)'; const MUT = 'var(--text-muted)'; const LINE = 'var(--border)'; const TEAL = 'var(--sip)';
const constColor = (c: string) => (c === 'Alta' ? OK : c === 'Media' ? WARN : ERR);

export default function BrigadaTiposModal({ data, vista, onToggleVista, onClose }: {
  data: BrigTiposData; vista: 'hora' | 'dia'; onToggleVista: (v: 'hora' | 'dia') => void; onClose: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'chart' | 'split' | 'table'>('split');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import('chart.js').Chart | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const activos = useMemo(
    () => data.tipos.filter(t => sel.size === 0 || sel.has(t.label)),
    [data.tipos, sel]
  );

  const config = useMemo<ChartConfiguration>(() => {
    const maxTipo = Math.max(0, ...data.tipos.flatMap(t => t.serie.map(v => Number(v) || 0)));
    return {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: activos.map(t => ({
          label: t.label,
          data: t.serie,
          borderColor: t.color,
          backgroundColor: t.color + '1F',
          fill: false,
          spanGaps: false,
          borderWidth: 2.8,
          tension: 0.34,
          pointRadius: data.labels.length > 14 ? 0 : 4,
          pointBackgroundColor: '#fff',
          pointBorderColor: t.color,
          pointBorderWidth: 2,
        })),
      },
      plugins: [bandsPlugin as any],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: (it: any) => it.parsed.y > 0,
            callbacks: {
              title: (items: any[]) => {
                const label = items[0]?.label || '';
                if (data.esHora) {
                  const min = getMinutosTrabajoHora(label, data.fecha, data.zona);
                  const tag = min === 0 ? (label === '12:00' ? ' · Almuerzo' : ' · Fuera de jornada') : '';
                  return `Franja ${label}${tag}`;
                }
                return `Día ${label}`;
              },
              label: (ctx: any) => `${ctx.dataset.label}: ${fmtN(Number(ctx.raw) || 0)}`,
            },
          },
          bandsBrigTipos: { fecha: data.fecha, zona: data.zona, esHora: data.esHora },
        },
        scales: {
          x: { ticks: { autoSkip: data.labels.length > 14, maxRotation: 0 } },
          y: { beginAtZero: true, max: maxTipo + 2, ticks: { precision: 0 }, title: { display: true, text: 'Brigadas digitando' } },
        },
      },
    } as ChartConfiguration;
  }, [activos, data]);

  useEffect(() => {
    if (view === 'table' || !canvasRef.current) return;
    let mounted = true;
    import('chart.js').then(({ Chart, registerables }) => {
      if (!mounted || !canvasRef.current) return;
      Chart.register(...registerables);
      const cs = getComputedStyle(document.body);
      Chart.defaults.color = cs.getPropertyValue('--text-muted').trim();
      Chart.defaults.borderColor = cs.getPropertyValue('--border').trim();
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
      chartRef.current = new Chart(canvasRef.current, config);
    });
    return () => { mounted = false; if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [config, view]);

  const toggle = (label: string) =>
    setSel(prev => { const n = new Set(prev); n.has(label) ? n.delete(label) : n.add(label); return n; });

  /* stats */
  const conDatos = data.tipos.filter(t => t.pico > 0);
  const masConstante = conDatos.length ? conDatos.reduce((a, b) => (b.cv < a.cv ? b : a)) : null;
  const masIrregular = conDatos.length ? conDatos.reduce((a, b) => (b.cv > a.cv ? b : a)) : null;
  const picoTotal = data.tipos.reduce((s, t) => s + t.pico, 0);

  const tot = activos.reduce((s, t) => {
    s.brigadas += t.brigadas; s.pico += t.pico; s.promedio += t.promedio; s.ordenes += t.ordenes; return s;
  }, { brigadas: 0, pico: 0, promedio: 0, ordenes: 0 });

  const exportCSV = () => {
    const rows = [['Tipo de Brigada', 'Brigadas', 'Pico', 'Promedio', 'Órdenes', 'Constancia'].join(';')];
    activos.forEach(t => rows.push([t.label.replace(/;/g, ''), t.brigadas, t.pico, t.promedio.toFixed(1), t.ordenes, t.constancia].join(';')));
    rows.push(['TOTAL', tot.brigadas, tot.pico, tot.promedio.toFixed(1), tot.ordenes, ''].join(';'));
    const uri = encodeURI('data:text/csv;charset=utf-8,﻿' + rows.join('\n'));
    const a = document.createElement('a'); a.href = uri; a.download = `Brigadas_por_tipo_${vista}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 10.5, fontWeight: 700, color: MUT, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--card)', borderBottom: `1px solid ${LINE}` };
  const td: React.CSSProperties = { padding: '9px 12px', fontSize: 13, whiteSpace: 'nowrap', textAlign: 'right', color: INK, fontVariantNumeric: 'tabular-nums' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,27,45,.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Evolutivo de brigadas por tipo"
        style={{ background: 'var(--bg)', borderRadius: 16, width: 'min(1520px, 97vw)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(20,30,60,.28)' }}>

        {/* Encabezado */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 20px', borderBottom: `1px solid ${LINE}`, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 300 }}>
            <span style={{ background: TEAL, color: '#fff', fontWeight: 800, fontSize: 12, borderRadius: 8, padding: '4px 8px' }}>2ª</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>Evolutivo {vista === 'hora' ? 'Horario' : 'Diario'} de Brigadas</div>
              <div style={{ fontSize: 12, color: MUT, marginTop: 2 }}>Una línea por tipo de brigada · cuántas digitaron en cada {vista === 'hora' ? 'franja horaria' : 'día'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <SegmentedControl options={[{ value: 'hora', label: 'Horario' }, { value: 'dia', label: 'Diario' }]} value={vista} onChange={v => onToggleVista(v as 'hora' | 'dia')} />
            <SegmentedControl options={[{ value: 'chart', label: '📈 Gráfico' }, { value: 'split', label: '🗂 Ambos' }, { value: 'table', label: '📋 Tabla' }]} value={view} onChange={v => setView(v as any)} />
            <button onClick={exportCSV} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: TEAL, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>XLSX ↓</button>
            <button onClick={onClose} aria-label="Cerrar" style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${LINE}`, background: 'var(--panel)', color: MUT, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Barra de stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '10px 20px', borderBottom: `1px solid ${LINE}`, flexWrap: 'wrap', fontSize: 12.5 }}>
          <span><b style={{ color: MUT, fontWeight: 700, marginRight: 5 }}>TIPOS</b><span style={{ color: INK, fontWeight: 800 }}>{data.tipos.length}</span></span>
          <span><b style={{ color: MUT, fontWeight: 700, marginRight: 5 }}>MÁS CONSTANTE</b><span style={{ color: OK, fontWeight: 800 }}>{masConstante ? shortBrig(masConstante.label) : '—'}</span></span>
          <span><b style={{ color: MUT, fontWeight: 700, marginRight: 5 }}>MÁS IRREGULAR</b><span style={{ color: ERR, fontWeight: 800 }}>{masIrregular ? shortBrig(masIrregular.label) : '—'}</span></span>
          <span><b style={{ color: MUT, fontWeight: 700, marginRight: 5 }}>PICO TOTAL</b><span style={{ color: INK, fontWeight: 800 }}>{picoTotal} de {data.pool}</span></span>
          <span style={{ marginLeft: 'auto', color: MUT }}>{data.jornada} · {data.fechaTexto} · {data.pool} brigadas contratadas</span>
        </div>

        {/* Chips por tipo */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 20px', flexWrap: 'wrap', borderBottom: `1px solid ${LINE}` }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: MUT, textTransform: 'uppercase', letterSpacing: 0.6, alignSelf: 'center', marginRight: 2 }}>Tipos</span>
          {data.tipos.map(t => {
            const on = sel.size === 0 || sel.has(t.label);
            return (
              <button key={t.label} onClick={() => toggle(t.label)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: on ? 'var(--panel)' : 'transparent', border: `1px solid ${on ? t.color : LINE}`, color: on ? INK : MUT, opacity: on ? 1 : 0.6 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: t.color, display: 'inline-block' }} />
                {shortBrig(t.label)}
              </button>
            );
          })}
        </div>

        {/* Contenido: gráfico y/o tabla */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {(view === 'chart' || view === 'split') && (
            <div style={{ flex: view === 'chart' ? '1 1 auto' : '1 1 56%', minHeight: 190, position: 'relative', padding: '10px 16px' }}>
              <canvas ref={canvasRef} />
            </div>
          )}
          {(view === 'table' || view === 'split') && (
            <div style={{ flex: view === 'table' ? '1 1 auto' : '1 1 44%', minHeight: 0, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }}>Tipo de Brigada</th>
                    {['Brigadas', 'Pico', 'Promedio', 'Órdenes', 'Constancia'].map(c => <th key={c} style={th}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {activos.map(t => (
                    <tr key={t.label} style={{ borderBottom: `1px solid ${LINE}`, cursor: 'pointer' }} onClick={() => toggle(t.label)}>
                      <td style={{ ...td, textAlign: 'left', color: t.color, fontWeight: 700 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, display: 'inline-block', marginRight: 8 }} />{t.label}
                      </td>
                      <td style={td}>{fmtN(t.brigadas)}</td>
                      <td style={td}>{fmtN(t.pico)}</td>
                      <td style={td}>{t.promedio.toFixed(1)}</td>
                      <td style={td}>{fmtN(t.ordenes)}</td>
                      <td style={{ ...td, color: constColor(t.constancia), fontWeight: 700 }}>{t.constancia}</td>
                    </tr>
                  ))}
                  {activos.length === 0 && (
                    <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: MUT, padding: 24 }}>Sin tipos seleccionados.</td></tr>
                  )}
                </tbody>
                {activos.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${TEAL}`, background: 'var(--panel)' }}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 800 }}>TOTAL</td>
                      <td style={{ ...td, fontWeight: 800 }}>{fmtN(tot.brigadas)}</td>
                      <td style={{ ...td, fontWeight: 800 }}>{fmtN(tot.pico)}</td>
                      <td style={{ ...td, fontWeight: 800 }}>{tot.promedio.toFixed(1)}</td>
                      <td style={{ ...td, fontWeight: 800 }}>{fmtN(tot.ordenes)}</td>
                      <td style={td} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
