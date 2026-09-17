'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import type { ChartConfiguration } from 'chart.js';
import Papa from 'papaparse';
import { SegmentedControl } from '../components/Buttons';
import { useDashboard } from '../components/DashboardProvider';

export interface BrigadaRow { brigada: string; total: number; partPct: number; varPct: number | null; color: string; }
export interface TecnicoRow {
  tipoBrigada: string; tecnico: string; color: string;
  cuentas: number; ejecutadas: number;
  suspension: number; mantiene: number; reconexion: number; pagos: number;
  imposibilidades: number; resistencias: number;
  diasLab: number; promDia: number; eficacia: number; alerta: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  config: ChartConfiguration | null;
  brigadaDetalle: BrigadaRow[];
  tecnicoDetalle: TecnicoRow[];
  varHeader: string;      // p.ej. "JUL/JUN"
}

const nf = (n: number) => (Number(n) || 0).toLocaleString('es-CO');
const df = (n: number) => (Number(n) || 0).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const BROWN = 'var(--warn)';
const MESES_C = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtMes = (m: string) => { const [y, mm] = String(m).split('-'); return `${MESES_C[Number(mm) - 1] || mm} ${y}`; };

export default function BrigadaEvolutivoModal({ open, onClose, title, subtitle, config, brigadaDetalle, tecnicoDetalle, varHeader }: Props) {
  const [viewMode, setViewMode] = useState<'chart' | 'split' | 'table'>('split');
  const [search, setSearch] = useState('');
  const [onlyAlert, setOnlyAlert] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import('chart.js').Chart | null>(null);

  // Filtros globales editables desde el modal (mes/día). Al cambiarlos, el gráfico y la
  // tabla se recalculan en la página y llegan como nuevos props (config/brigadaDetalle).
  const { filters, setFilters, mesList, fechaList } = useDashboard();
  const [mesOpen, setMesOpen] = useState(false);
  const mesRef = useRef<HTMLDivElement>(null);
  const [diaOpen, setDiaOpen] = useState(false);
  const diaRef = useRef<HTMLDivElement>(null);

  // Cerrar con Esc
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);

  // Cerrar los dropdowns al hacer click afuera
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (mesRef.current && !mesRef.current.contains(e.target as Node)) setMesOpen(false);
      if (diaRef.current && !diaRef.current.contains(e.target as Node)) setDiaOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Render del grafico (Gráfico / Ambos)
  useEffect(() => {
    if (!open || viewMode === 'table' || !config || !canvasRef.current) return;
    let mounted = true;
    import('chart.js').then(({ Chart, registerables }) => {
      if (!mounted || !canvasRef.current) return;
      Chart.register(...registerables);
      const cs = getComputedStyle(document.body);
      const gv = (v: string) => cs.getPropertyValue(v).trim();
      Chart.defaults.color = gv('--text-muted');
      Chart.defaults.font.family = cs.fontFamily;
      Chart.defaults.borderColor = gv('--border');
      Chart.defaults.elements.line.borderWidth = 3;
      Chart.defaults.elements.point.radius = 4;
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
      const cfg = { ...config, options: { ...(config?.options || {}), maintainAspectRatio: false } } as any;
      chartRef.current = new Chart(canvasRef.current, cfg as ChartConfiguration);
    });
    return () => { mounted = false; if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, viewMode, config]);

  const alertCount = useMemo(() => tecnicoDetalle.filter(t => t.alerta).length, [tecnicoDetalle]);
  const maxProm = useMemo(() => Math.max(1, ...tecnicoDetalle.map(t => t.promDia)), [tecnicoDetalle]);

  const tecFiltered = useMemo(() => {
    let rows = tecnicoDetalle;
    if (onlyAlert) rows = rows.filter(t => t.alerta);
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter(t => t.tecnico.toLowerCase().includes(q) || t.tipoBrigada.toLowerCase().includes(q));
    return rows;
  }, [tecnicoDetalle, onlyAlert, search]);

  const tot = useMemo(() => {
    const a = { cuentas: 0, ejecutadas: 0, suspension: 0, mantiene: 0, reconexion: 0, pagos: 0, imposibilidades: 0, resistencias: 0, diasLab: 0 };
    for (const t of tecFiltered) { a.cuentas += t.cuentas; a.ejecutadas += t.ejecutadas; a.suspension += t.suspension; a.mantiene += t.mantiene; a.reconexion += t.reconexion; a.pagos += t.pagos; a.imposibilidades += t.imposibilidades; a.resistencias += t.resistencias; a.diasLab += t.diasLab; }
    return { ...a, promDia: a.diasLab > 0 ? a.ejecutadas / a.diasLab : 0 };
  }, [tecFiltered]);

  const exportPng = () => {
    if (!chartRef.current) return;
    const a = document.createElement('a');
    a.href = chartRef.current.toBase64Image();
    a.download = 'evolutivo-brigada.png';
    a.click();
  };
  const exportCsv = () => {
    const rows = tecFiltered.map(t => ({
      'Tipo de Brigada': t.tipoBrigada, 'Técnico': t.tecnico,
      'Cuentas': t.cuentas, 'Ejecutadas': t.ejecutadas,
      'Suspensión': t.suspension, 'Se Mantiene': t.mantiene, 'Reconexión': t.reconexion, 'Pagos': t.pagos,
      'Imposibilidades': t.imposibilidades, 'Resistencias': t.resistencias,
      'Días Lab.': t.diasLab, 'Prom./Día': Number(t.promDia.toFixed(1)), 'Eficacia %': Math.round(t.eficacia * 100),
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'detallado-por-tecnico.csv';
    a.click();
  };

  if (!open) return null;

  const th: React.CSSProperties = { position: 'sticky', top: 0, background: 'var(--card)', padding: '8px 10px', fontSize: 10.5, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap', zIndex: 2 };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12, whiteSpace: 'nowrap' };
  const grp: React.CSSProperties = { ...th, top: 0, textAlign: 'center', borderBottom: '1px solid var(--border)', color: 'var(--text-title)' };

  // --- Filtros mes/día ---
  const toggleMes = (m: string) => {
    const next = filters.mes.includes(m) ? filters.mes.filter(x => x !== m) : [...filters.mes, m];
    setFilters({ mes: next, fecha: 'ALL' });
  };
  const mesLabel = filters.mes.length === 0 ? 'Todos' : filters.mes.length === 1 ? fmtMes(filters.mes[0]) : `${filters.mes.length} meses`;

  const uniqueDays = [...new Set(fechaList.map(f => String(f).slice(8, 10)))].filter(Boolean).sort();
  const selectedDays = new Set(
    filters.fecha === 'ALL'
      ? uniqueDays
      : (filters.fecha ? filters.fecha.split(',').filter(Boolean).map(f => f.slice(8, 10)) : [])
  );
  const isTodosDias = filters.fecha === 'ALL' || (uniqueDays.length > 0 && selectedDays.size === uniqueDays.length);
  const isDiaChecked = (d: string) => isTodosDias || selectedDays.has(d);

  const toggleDia = (d: string) => {
    let nextDays: string[];
    if (isTodosDias) {
      nextDays = uniqueDays.filter(x => x !== d);
    } else if (selectedDays.has(d)) {
      nextDays = Array.from(selectedDays).filter(x => x !== d);
    } else {
      nextDays = [...Array.from(selectedDays), d].sort();
    }
    if (nextDays.length === 0) {
      setFilters({ fecha: '' });
    } else if (nextDays.length === uniqueDays.length) {
      setFilters({ fecha: 'ALL' });
    } else {
      const matchingFechas = fechaList.filter(f => nextDays.includes(f.slice(8, 10)));
      setFilters({ fecha: matchingFechas.join(',') });
    }
  };

  const diaLabel = (() => {
    if (uniqueDays.length === 0) return 'Sin días';
    if (isTodosDias) return `Todos (${uniqueDays.length})`;
    if (selectedDays.size === 0) return 'Seleccionar días…';
    if (selectedDays.size === 1) return `Día ${Array.from(selectedDays)[0]}`;
    return `${selectedDays.size} días`;
  })();

  const fBtn: React.CSSProperties = { padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text-body)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };
  const fRow = (on: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer', background: on ? 'var(--hover-bg)' : 'transparent', color: 'var(--text-body)' });

  // Panel "Detalle por brigada" (vista Ambos y cabecera)
  const brigadaTable = (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ fontSize: 11, letterSpacing: 1, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '4px 4px 10px' }}>Detalle por brigada</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Brigada</th>
            <th style={{ ...th, textAlign: 'right' }}>Total</th>
            <th style={{ ...th, textAlign: 'right' }}>Part.</th>
          </tr>
        </thead>
        <tbody>
          {brigadaDetalle.map((b, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ ...td, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 4, height: 16, borderRadius: 2, background: b.color, flexShrink: 0 }} />
                <span style={{ color: 'var(--text-body)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.brigada}</span>
              </td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--text-title)' }}>{nf(b.total)}</td>
              <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>{b.partPct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="modal-back open" onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ zIndex: 9999 }}>
      <div className="modal-box" style={{ width: '95vw', maxWidth: '1600px', height: '95vh', display: 'flex', flexDirection: 'column' }}>
        {/* Encabezado */}
        <div className="modal-head" style={{ flexShrink: 0, paddingBottom: 12, display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, letterSpacing: 1.4, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Evolutivo Mensual</div>
            <h3 style={{ fontSize: 22, fontWeight: 800, margin: '2px 0 4px', color: 'var(--text-title)' }}>{title}</h3>
            {subtitle && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{subtitle}</div>}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <SegmentedControl
              options={[
                { value: 'chart', label: '📈 Gráfico' },
                { value: 'split', label: '📁 Ambos' },
                { value: 'table', label: '📋 Tabla' }
              ]}
              value={viewMode}
              onChange={(val: string) => setViewMode(val as 'chart' | 'split' | 'table')}
            />
            <button onClick={exportPng} style={{ background: 'var(--panel)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>PNG ⬇</button>
            <button onClick={exportCsv} title="Exporta la tabla de técnicos (CSV, compatible con Excel)" style={{ background: 'var(--brand-primary)', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', color: 'var(--brand-grad-text)', fontSize: 12, fontWeight: 700 }}>XLSX ⬇</button>
            <button className="modal-close" onClick={onClose} title="Cerrar (Esc)">✕</button>
          </div>
        </div>

        {/* Filtros de fecha y día — editables desde el modal (afectan gráfico + tabla en vivo) */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '2px 0 12px', marginBottom: 4, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--text-muted)' }}>Filtros</span>
          {/* Mes (multi-select) */}
          <div ref={mesRef} style={{ position: 'relative' }}>
            <button onClick={() => setMesOpen(o => !o)} style={fBtn}>Mes: {mesLabel} ▾</button>
            {mesOpen && (
              <div style={{ position: 'absolute', top: '112%', left: 0, zIndex: 20, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, minWidth: 170, maxHeight: 300, overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,.18)' }}>
                <label style={fRow(filters.mes.length === 0)}>
                  <input type="checkbox" checked={filters.mes.length === 0} onChange={() => setFilters({ mes: [], fecha: 'ALL' })} /> Todos
                </label>
                {mesList.map(m => {
                  const on = filters.mes.includes(m);
                  return (
                    <label key={m} style={fRow(on)}>
                      <input type="checkbox" checked={on} onChange={() => toggleMes(m)} /> {fmtMes(m)}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          {/* Día (multi-select con casillas) */}
          <div ref={diaRef} style={{ position: 'relative' }}>
            <button onClick={() => { setDiaOpen(o => !o); setMesOpen(false); }} style={fBtn}>
              Día: {diaLabel} ▾
            </button>
            {diaOpen && (
              <div style={{ position: 'absolute', top: '112%', left: 0, zIndex: 20, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, minWidth: 190, maxHeight: 300, overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,.18)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', gap: 4, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
                  <button type="button" onClick={() => setFilters({ fecha: 'ALL' })} style={{ flex: 1, padding: '4px 6px', borderRadius: 5, border: '1px solid var(--border)', background: isTodosDias ? 'rgba(0, 137, 123, 0.12)' : 'transparent', color: isTodosDias ? '#00897B' : 'var(--text-body)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    ✓ Todos
                  </button>
                  <button type="button" onClick={() => setFilters({ fecha: '' })} style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    Limpiar
                  </button>
                </div>
                <label style={fRow(isTodosDias)}>
                  <input
                    type="checkbox"
                    checked={isTodosDias}
                    onChange={() => {
                      if (isTodosDias) setFilters({ fecha: '' });
                      else setFilters({ fecha: 'ALL' });
                    }}
                  />
                  Todos los días ({uniqueDays.length})
                </label>
                <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
                {uniqueDays.map(d => {
                  const on = isDiaChecked(d);
                  return (
                    <label key={d} style={fRow(on)}>
                      <input type="checkbox" checked={on} onChange={() => toggleDia(d)} /> Día {d}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Cambian el mes/día del gráfico y la tabla en vivo</span>
        </div>

        {/* Cuerpo */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Fila Superior (Gráfico + Resumen) para Chart o Split */}
          {(viewMode === 'chart' || viewMode === 'split') && (
            <div style={{ flex: viewMode === 'chart' ? 1 : '0 0 45%', minHeight: 0, display: 'flex', flexDirection: 'row', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                <canvas ref={canvasRef} />
              </div>
              {viewMode === 'split' && (
                <div style={{ width: 380, flexShrink: 0, borderLeft: '1px solid var(--border)', paddingLeft: 16, minHeight: 0 }}>
                  {brigadaTable}
                </div>
              )}
            </div>
          )}

          {/* Fila Inferior (Tabla Detallada) para Table o Split */}
          {(viewMode === 'table' || viewMode === 'split') && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {/* Controles */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-title)' }}>Detallado por técnico</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tecFiltered.length} técnicos · todas las brigadas</div>
                <div style={{ flex: 1 }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍  Buscar técnico" style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text-body)', fontSize: 13, width: 220 }} />
                <button onClick={() => setOnlyAlert(v => !v)} style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${onlyAlert ? 'var(--err)' : 'var(--border)'}`, background: onlyAlert ? 'var(--err-bg)' : 'var(--panel)', color: onlyAlert ? 'var(--err)' : 'var(--text-muted)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                  ⚠ Solo con alerta ( {alertCount} )
                </button>
              </div>
              {/* Tabla */}
              <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...grp, textAlign: 'left', left: 0, zIndex: 3 }} rowSpan={2}>Tipo de Brigada</th>
                      <th style={{ ...grp, textAlign: 'left' }} rowSpan={2}>Técnico</th>
                      <th style={grp} colSpan={2}>Carga</th>
                      <th style={grp} colSpan={4}>Acciones Ejecutadas</th>
                      <th style={grp} colSpan={2}>No Ejecutadas</th>
                      <th style={grp} colSpan={3}>Rendimiento</th>
                    </tr>
                    <tr>
                      {['Cuentas', 'Ejecutadas', 'Suspensión', 'Se Mantiene', 'Reconexión', 'Pagos', 'Imposibilidades', 'Resistencias', 'Días Lab.', 'Prom./Día', 'Eficacia'].map((c, i) => (
                        <th key={i} style={{ ...th, top: 32, textAlign: 'right' }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tecFiltered.map((t, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ ...td, position: 'sticky', left: 0, background: 'var(--card)', display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 4, height: 16, borderRadius: 2, background: t.color, flexShrink: 0 }} />
                          <span style={{ color: 'var(--text-body)' }}>{t.tipoBrigada}</span>
                        </td>
                        <td style={{ ...td, color: 'var(--text-title)', fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.tecnico}>{t.tecnico}</td>
                        <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>{nf(t.cuentas)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--text-title)' }}>{nf(t.ejecutadas)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{nf(t.suspension)}</td>
                        <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>{t.mantiene || '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{nf(t.reconexion)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{nf(t.pagos)}</td>
                        <td style={{ ...td, textAlign: 'right', color: 'var(--warn)' }}>{nf(t.imposibilidades)}</td>
                        <td style={{ ...td, textAlign: 'right', color: 'var(--err)' }}>{nf(t.resistencias)}</td>
                        <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>{nf(t.diasLab)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{df(t.promDia)}</td>
                        <td style={{ ...td, minWidth: 120 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--hover-bg)', overflow: 'hidden' }}>
                              <span style={{ display: 'block', height: '100%', width: `${Math.min(100, Math.max(6, t.promDia / maxProm * 100))}%`, background: t.alerta ? BROWN : 'var(--ok)', borderRadius: 3 }} />
                            </span>
                            <span style={{ width: 34, textAlign: 'right', fontWeight: 700, color: t.alerta ? BROWN : 'var(--ok)' }}>{Math.round(t.eficacia * 100)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border)', position: 'sticky', bottom: 0, background: 'var(--panel)' }}>
                      <td style={{ ...td, position: 'sticky', left: 0, background: 'var(--panel)', fontWeight: 800, color: 'var(--text-title)' }}>TOTAL</td>
                      <td style={{ ...td, color: 'var(--text-muted)' }}>{tecFiltered.length} técnicos</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{nf(tot.cuentas)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{nf(tot.ejecutadas)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{nf(tot.suspension)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{nf(tot.mantiene)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{nf(tot.reconexion)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{nf(tot.pagos)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--warn)' }}>{nf(tot.imposibilidades)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--err)' }}>{nf(tot.resistencias)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{nf(tot.diasLab)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{df(tot.promDia)}</td>
                      <td style={td} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
