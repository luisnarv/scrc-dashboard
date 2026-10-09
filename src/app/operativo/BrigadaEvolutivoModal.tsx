'use client';
import { useState, useRef, useMemo, type ReactNode } from 'react';
import type { ChartConfiguration } from 'chart.js';
import ModalShell, { RailField, RailSearch, RailToggle, type RailSerie } from '../components/ModalShell';
import ModalChart from '../components/ModalChart';
import { useDashboard } from '../components/DashboardProvider';
import { cloneConfig, cssVar, withAlpha } from '../components/utils/chartTheme';
import { descargarCsv, descargarPngDeCanvas } from '../components/utils/exportFile';

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

type Dataset = Record<string, unknown> & { label?: string; borderColor?: unknown; borderDash?: unknown };

/** Series de referencia (período anterior, meta, promedio): líneas punteadas que NO se apilan. */
const esReferencia = (ds: Dataset) =>
  (Array.isArray(ds.borderDash) && ds.borderDash.length > 0) || /^(meta|promedio)/i.test(String(ds.label || ''));

/** Color con transparencia: tokens 'var(--x)' → 'var(--x|a)'; hex/rgb → rgba. */
const conAlfa = (color: string, a: number) => {
  const t = color.match(/^var\((--[\w-]+)\)$/);
  return t ? `var(${t[1]}|${a})` : withAlpha(color, a);
};

const colorDe = (ds: Dataset) => (typeof ds.borderColor === 'string' && ds.borderColor ? ds.borderColor : 'var(--brand-primary)');

/**
 * Convierte la configuración de la página en un ÁREA APILADA: cada serie de tipo de brigada va rellena y
 * apilada; las series de referencia (anterior / meta / promedio) quedan como líneas punteadas sin apilar.
 * Los colores de las series se conservan tal cual vienen en `config`.
 */
function aAreaApilada(config: ChartConfiguration, ocultas: string[]): ChartConfiguration {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base = cloneConfig(config) as unknown as { data: { datasets: Dataset[] }; options?: Record<string, any> };
  const dss = (base.data?.datasets ?? []).filter(ds => !ocultas.includes(String(ds.label ?? '')));
  let prevArea = -1;
  let nAreas = 0;
  base.data.datasets = dss.map((ds, i) => {
    if (esReferencia(ds)) {
      return { ...ds, type: 'line', fill: false, stack: `ref-${i}`, pointBackgroundColor: 'var(--card)' };
    }
    const out = {
      ...ds,
      type: 'line',
      fill: prevArea < 0 ? 'origin' : { target: prevArea },
      stack: 'tipos',
      backgroundColor: conAlfa(colorDe(ds), 0.3),
      pointBackgroundColor: 'var(--card)',
    };
    prevArea = i;
    nAreas++;
    return out;
  });
  const options = (base.options = base.options || {});
  const scales = (options.scales = options.scales || {});
  scales.x = { ...(scales.x || {}), stacked: true, ticks: { ...(scales.x?.ticks || {}), color: 'var(--text-muted)' } };
  scales.y = { ...(scales.y || {}), stacked: true, grid: { ...(scales.y?.grid || {}), color: 'var(--border)' } };
  // El máximo de la página se calculó para una sola serie; apilado debe ajustarse solo.
  if (nAreas > 1) delete scales.y.max;
  return base as unknown as ChartConfiguration;
}

/** Filtro de selección múltiple que se despliega en línea dentro del panel (un popup quedaría recortado por el scroll del panel). */
function RailMulti({ label, resumen, open, onToggle, children }: { label: string; resumen: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <RailField label={label}>
      <button
        type="button"
        className="ms-select"
        aria-expanded={open}
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, textAlign: 'left', cursor: 'pointer' }}
      >
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resumen}</span>
        <span aria-hidden style={{ fontSize: 10, flexShrink: 0 }}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 7, background: 'var(--card)', padding: 4, maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {children}
        </div>
      )}
    </RailField>
  );
}

export default function BrigadaEvolutivoModal({ open, onClose, title, subtitle, config, brigadaDetalle, tecnicoDetalle, varHeader }: Props) {
  const [viewMode, setViewMode] = useState<'chart' | 'split' | 'table'>('split');
  const [search, setSearch] = useState('');
  const [onlyAlert, setOnlyAlert] = useState(false);
  const [ocultas, setOcultas] = useState<string[]>([]);   // etiquetas de series ocultas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pngPendiente = useRef(false);

  // Filtros globales editables desde el modal (mes/día). Al cambiarlos, el gráfico y la
  // tabla se recalculan en la página y llegan como nuevos props (config/brigadaDetalle).
  const { filters, setFilters, mesList, fechaList } = useDashboard();
  const [mesOpen, setMesOpen] = useState(false);
  const [diaOpen, setDiaOpen] = useState(false);

  // Gráfico: área apilada por tipo de brigada
  const cfg = useMemo(() => (config ? aAreaApilada(config, ocultas) : null), [config, ocultas]);

  const series: RailSerie[] = useMemo(
    () => ((config?.data?.datasets ?? []) as unknown as Dataset[]).map(ds => ({
      key: String(ds.label ?? ''),
      label: String(ds.label ?? ''),
      color: colorDe(ds),
      active: !ocultas.includes(String(ds.label ?? '')),
    })),
    [config, ocultas],
  );
  const toggleSerie = (k: string) => setOcultas(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));

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

  // RESUMEN: total de órdenes, tipo líder, técnicos y variación del líder (último vs. anterior período)
  const lider = useMemo(() => brigadaDetalle.reduce<BrigadaRow | null>((m, b) => (!m || b.total > m.total ? b : m), null), [brigadaDetalle]);
  const totalOrdenes = useMemo(() => brigadaDetalle.reduce((s, b) => s + (Number(b.total) || 0), 0), [brigadaDetalle]);

  const descargarPng = () => descargarPngDeCanvas(canvasRef.current, 'evolutivo-brigada', cssVar('--card'));
  const exportPng = () => {
    if (descargarPng()) return;
    // Vista "Tabla": el lienzo no existe. Se pasa a "Ambos" y se exporta cuando el gráfico esté creado.
    pngPendiente.current = true;
    setViewMode('split');
  };
  const alCrearGrafico = () => {
    if (!pngPendiente.current) return;
    pngPendiente.current = false;
    setTimeout(descargarPng, 900);   // espera a que termine la animación de entrada
  };
  const exportCsv = () => {
    descargarCsv(
      'detallado-por-tecnico',
      ['Tipo de Brigada', 'Técnico', 'Cuentas', 'Ejecutadas', 'Suspensión', 'Se Mantiene', 'Reconexión', 'Pagos', 'Imposibilidades', 'Resistencias', 'Días Lab.', 'Prom./Día', 'Eficacia %'],
      tecFiltered.map(t => [
        t.tipoBrigada, t.tecnico, t.cuentas, t.ejecutadas, t.suspension, t.mantiene, t.reconexion, t.pagos,
        t.imposibilidades, t.resistencias, t.diasLab, Number(t.promDia.toFixed(1)), Math.round(t.eficacia * 100),
      ]),
    );
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

  const fRow = (on: boolean): React.CSSProperties => ({ padding: '4px 6px', borderRadius: 6, background: on ? 'var(--hover-bg)' : 'transparent' });
  const miniBtn = (on: boolean): React.CSSProperties => ({ flex: 1, padding: '4px 6px', borderRadius: 5, border: '1px solid var(--border)', background: on ? 'var(--ok-bg)' : 'transparent', color: on ? 'var(--ok)' : 'var(--text-body)', fontSize: 11, fontWeight: 700, cursor: 'pointer' });

  const filtros = (
    <>
      <RailMulti label="Mes" resumen={mesLabel} open={mesOpen} onToggle={() => { setMesOpen(o => !o); setDiaOpen(false); }}>
        <label className="ms-check" style={fRow(filters.mes.length === 0)}>
          <input type="checkbox" checked={filters.mes.length === 0} onChange={() => setFilters({ mes: [], fecha: 'ALL' })} /> Todos
        </label>
        {mesList.map(m => {
          const on = filters.mes.includes(m);
          return (
            <label key={m} className="ms-check" style={fRow(on)}>
              <input type="checkbox" checked={on} onChange={() => toggleMes(m)} /> {fmtMes(m)}
            </label>
          );
        })}
      </RailMulti>

      <RailMulti label="Día" resumen={diaLabel} open={diaOpen} onToggle={() => { setDiaOpen(o => !o); setMesOpen(false); }}>
        <div style={{ display: 'flex', gap: 4, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
          <button type="button" onClick={() => setFilters({ fecha: 'ALL' })} style={miniBtn(isTodosDias)}>✓ Todos</button>
          <button type="button" onClick={() => setFilters({ fecha: '' })} style={{ ...miniBtn(false), flex: '0 0 auto', color: 'var(--text-muted)', fontWeight: 600 }}>Limpiar</button>
        </div>
        {uniqueDays.map(d => {
          const on = isDiaChecked(d);
          return (
            <label key={d} className="ms-check" style={fRow(on)}>
              <input type="checkbox" checked={on} onChange={() => toggleDia(d)} /> Día {d}
            </label>
          );
        })}
      </RailMulti>

      <RailSearch label="Técnico" value={search} onChange={setSearch} placeholder="Buscar técnico" />
      <RailToggle checked={onlyAlert} onChange={setOnlyAlert} label={`⚠ Solo con alerta (${alertCount})`} />
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Mes y día cambian el gráfico y la tabla en vivo.</div>
    </>
  );

  const detalleBrigada = (
    <div data-brigada-detalle>
      <div className="ms-label" style={{ marginBottom: 6 }}>Detalle por brigada</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ ...th, position: 'static', background: 'transparent', padding: '4px 4px', fontSize: 10, textAlign: 'left' }}>Brigada</th>
            <th style={{ ...th, position: 'static', background: 'transparent', padding: '4px 4px', fontSize: 10, textAlign: 'right' }}>Total</th>
            <th style={{ ...th, position: 'static', background: 'transparent', padding: '4px 4px', fontSize: 10, textAlign: 'right' }}>Part.</th>
          </tr>
        </thead>
        <tbody>
          {brigadaDetalle.map((b, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '5px 4px', maxWidth: 110 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ width: 4, height: 14, borderRadius: 2, background: b.color, flexShrink: 0 }} />
                  <span title={b.brigada} style={{ color: 'var(--text-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.brigada}</span>
                </span>
              </td>
              <td style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 700, color: 'var(--text-title)' }}>{nf(b.total)}</td>
              <td style={{ padding: '5px 4px', textAlign: 'right', color: 'var(--text-muted)' }}>{b.partPct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const varPct = lider?.varPct;
  const varTxt = varPct === null || varPct === undefined ? '—' : `${varPct > 0 ? '+' : ''}${varPct}%`;
  const varColor = varPct === null || varPct === undefined ? 'var(--text-muted)' : varPct >= 0 ? 'var(--ok)' : 'var(--err)';

  return (
    <ModalShell
      title={title}
      subtitle={subtitle ? `Evolutivo Mensual · ${subtitle}` : 'Evolutivo Mensual'}
      onClose={onClose}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      filtros={filtros}
      series={series}
      seriesTitle="Series"
      onToggleSerie={toggleSerie}
      onResetSeries={() => setOcultas([])}
      resumen={[
        { label: 'Total órdenes', value: nf(totalOrdenes) },
        { label: 'Tipo líder', value: lider ? lider.brigada : '—' },
        { label: 'Técnicos', value: nf(tecFiltered.length) },
        { label: `Var. líder ${varHeader}`, value: varTxt, color: varColor },
      ]}
      railExtra={detalleBrigada}
      exportes={[
        { label: 'PNG ⬇', onClick: exportPng, title: 'Descarga el gráfico como imagen' },
        { label: 'CSV ↓', onClick: exportCsv, primary: true, title: 'Exporta la tabla de técnicos (CSV, compatible con Excel)' },
      ]}
      chartLabel="ÁREA APILADA · órdenes"
      chart={<ModalChart config={cfg} canvasRef={canvasRef} onChart={alCrearGrafico} ariaLabel="Área apilada de órdenes por tipo de brigada" />}
      table={
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-title)' }}>Detallado por técnico</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tecFiltered.length} técnicos · todas las brigadas</span>
          </div>
          <div className="mobile-scroll-tip">Desliza horizontalmente para ver todas las métricas &rarr;</div>
          <table style={{ width: '100%', minWidth: 1120, borderCollapse: 'collapse' }}>
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
        </>
      }
    />
  );
}
