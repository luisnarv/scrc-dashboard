'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { SegmentedControl, ModalCloseButton, modalBtnStyle } from './Buttons';

/**
 * Armazón común de los modales de /operativo ("Panel lateral").
 *
 * Contrato DOM (lo usan los bots scripts/bot-modales-op-*.mjs, no lo renombre sin actualizarlos):
 *   [role=dialog][data-modal-shell][aria-label=<título>]
 *   [data-rail] (panel; data-folded, data-open en móvil)  ·  [data-rail-toggle]  ·  [data-filters-btn] (móvil)
 *   [data-rail-section=filtros|series|resumen|extra|export]  ·  [data-more-filters]
 *   [data-serie=<key>]  ·  [data-kpi]  ·  [data-export=<etiqueta>]  ·  [data-apply]
 *   [data-chart-area] [data-chart-label] [data-table-area] [data-divider]  ·  [data-view-mode]
 */

export type ViewMode = 'chart' | 'split' | 'table';

export interface RailSerie { key: string; label: string; color: string; active: boolean; disabled?: boolean }
export interface RailKpi { label: string; value: ReactNode; color?: string }
export interface RailExport { label: string; onClick: () => void; primary?: boolean; disabled?: boolean; title?: string }

export interface ModalShellProps {
  title: string;
  subtitle?: ReactNode;
  badge?: string;
  onClose: () => void;
  /** id del contenedor del modal (p. ej. 'map-modal-container') y del botón cerrar. */
  rootId?: string;
  closeId?: string;

  /** Modo Gráfico/Ambos/Tabla. Si no se pasa, el armazón lo maneja solo (por defecto 'split'). */
  viewMode?: ViewMode;
  onViewModeChange?: (m: ViewMode) => void;
  /** Oculta el segmentado Gráfico/Ambos/Tabla (p. ej. cuando solo hay mapa o solo tabla). */
  hideViewToggle?: boolean;

  headerExtra?: ReactNode;

  /** FILTROS: contenido ya maquetado al ancho del panel (use RailField/RailSelect/RailSearch/RailSegmented). */
  filtros?: ReactNode;
  /** Filtros adicionales: quedan plegados bajo "+N filtros más". */
  filtrosMas?: ReactNode;
  filtrosMasCount?: number;

  /** SERIES: reemplaza la fila de chips de la leyenda. */
  series?: RailSerie[];
  onToggleSerie?: (key: string) => void;
  /** true = selección única (radios). */
  singleSeries?: boolean;
  onResetSeries?: () => void;
  seriesTitle?: string;

  /** RESUMEN: KPIs en rejilla 2×2. */
  resumen?: RailKpi[];
  /** Secciones adicionales del panel, entre RESUMEN y la exportación (p. ej. bloques de detalle del mapa). */
  railExtra?: ReactNode;
  /** Botones de exportación al pie del panel. El último con `primary` va en acento de marca. */
  exportes?: RailExport[];

  chartLabel?: string;
  chart?: ReactNode;
  table?: ReactNode;
  /** Contenido libre a ancho completo (mapa, tabla jerárquica). Se usa cuando no hay chart/table. */
  children?: ReactNode;
  /** % de alto del gráfico en modo Ambos (por defecto 55). */
  defaultSplit?: number;
}

const RAIL_KEY = 'op-modal-rail';

// Colores semánticos de KPI -> variante de texto con contraste AA (>= 4.5:1) en ambos temas.
const KPI_TEXTO: Record<string, string> = {
  'var(--ok)': 'var(--ok-text)',
  'var(--warn)': 'var(--warn-text)',
  'var(--err)': 'var(--err-text)',
};
const kpiColor = (c?: string) => (c ? (KPI_TEXTO[c] || c) : 'var(--text-title)');

function leerPlegado(): boolean {
  try { return localStorage.getItem(RAIL_KEY) === '1'; } catch { return false; }
}

export default function ModalShell(props: ModalShellProps) {
  const {
    title, subtitle, badge, onClose, rootId, closeId, viewMode: viewModeProp, onViewModeChange, hideViewToggle, headerExtra,
    filtros, filtrosMas, filtrosMasCount, series, onToggleSerie, singleSeries, onResetSeries, seriesTitle,
    resumen, railExtra, exportes, chartLabel, chart, table, children, defaultSplit = 55,
  } = props;

  const [folded, setFolded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [viewLocal, setViewLocal] = useState<ViewMode>('split');
  const [split, setSplit] = useState(defaultSplit);
  const mainRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => { setFolded(leerPlegado()); }, []);

  // Bloquea el scroll de la página mientras el modal está abierto (así el viewport no cambia de ancho al
  // aparecer/desaparecer la barra de desplazamiento y el modal siempre cabe en pantalla).
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, []);

  const toggleRail = () => {
    setFolded(prev => {
      const next = !prev;
      try { localStorage.setItem(RAIL_KEY, next ? '1' : '0'); } catch { /* sin almacenamiento */ }
      return next;
    });
  };

  // Esc cierra la hoja (móvil) si está abierta y, si no, el modal; arrastre del divisor.
  const sheetRef = useRef(sheetOpen);
  sheetRef.current = sheetOpen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (sheetRef.current) setSheetOpen(false); else onClose();
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !mainRef.current) return;
      const r = mainRef.current.getBoundingClientRect();
      setSplit(Math.min(80, Math.max(20, ((e.clientY - r.top) / r.height) * 100)));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onClose]);

  const hasSplit = chart !== undefined || table !== undefined;
  const mode: ViewMode = !hasSplit ? 'chart'
    : chart === undefined ? 'table'
    : table === undefined ? 'chart'
    : (viewModeProp ?? viewLocal);
  const setMode = useCallback((m: ViewMode) => { onViewModeChange ? onViewModeChange(m) : setViewLocal(m); }, [onViewModeChange]);
  const showToggle = hasSplit && !hideViewToggle && chart !== undefined && table !== undefined;

  const hayRail = !!(filtros || filtrosMas || (series && series.length) || (resumen && resumen.length) || railExtra || (exportes && exportes.length));
  const nSeriesOff = series ? series.filter(s => !s.active).length : 0;

  return (
    <div className="modal-back open" style={{ zIndex: 9999 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ms-box" id={rootId} role="dialog" aria-modal="true" aria-label={title} data-modal-shell>
        {/* ───── Encabezado de una línea ───── */}
        <div className="ms-head">
          <div className="ms-head-left">
            {hayRail && (
              <button
                type="button"
                className="ms-rail-toggle"
                data-rail-toggle
                aria-label={folded ? 'Mostrar panel lateral' : 'Ocultar panel lateral'}
                aria-expanded={!folded}
                title={folded ? 'Mostrar panel' : 'Ocultar panel'}
                onClick={toggleRail}
              >
                <span style={{ display: 'inline-block', transform: folded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>‹</span>
              </button>
            )}
            {badge && <span className="ms-badge">{badge}</span>}
            <div className="ms-titles">
              <h3 className="ms-title" title={title}>{title}</h3>
              {subtitle ? <div className="ms-sub">{subtitle}</div> : null}
            </div>
          </div>
          <div className="ms-head-right">
            {hayRail && (
              <button
                type="button"
                className="ms-filters-btn"
                data-filters-btn
                aria-expanded={sheetOpen}
                onClick={() => setSheetOpen(true)}
                style={{ ...modalBtnStyle(), display: undefined }}
              >
                ☰ Filtros
              </button>
            )}
            {headerExtra}
            {showToggle && (
              <span data-view-mode style={{ display: 'inline-flex' }}>
                <SegmentedControl
                  size="sm"
                  options={[
                    { value: 'chart', label: '📈 Gráfico' },
                    { value: 'split', label: '📁 Ambos' },
                    { value: 'table', label: '📋 Tabla' },
                  ]}
                  value={mode}
                  onChange={(v: string) => setMode(v as ViewMode)}
                />
              </span>
            )}
            <ModalCloseButton className="ms-close" id={closeId} onClick={onClose} title="Cerrar (Esc)" />
          </div>
        </div>

        <div className="ms-body">
          {/* ───── Panel lateral (en móvil, hoja inferior) ───── */}
          {hayRail && (
            <>
              {sheetOpen && <div className="ms-sheet-bg" onClick={() => setSheetOpen(false)} />}
              <aside className={`ms-rail${sheetOpen ? ' ms-open' : ''}`} data-rail data-folded={folded} data-open={sheetOpen} aria-label="Panel lateral">
                {(filtros || filtrosMas) && (
                  <section className="ms-sec" data-rail-section="filtros">
                    <div className="ms-label">Filtros</div>
                    {filtros}
                    {filtrosMas && (
                      <>
                        <button type="button" className="ms-more" data-more-filters aria-expanded={moreOpen} onClick={() => setMoreOpen(o => !o)}>
                          {moreOpen ? '− Menos filtros' : `+${filtrosMasCount ?? ''} filtros más ▾`}
                        </button>
                        {moreOpen && <div className="ms-more-body" data-more-body>{filtrosMas}</div>}
                      </>
                    )}
                  </section>
                )}

                {series && series.length > 0 && (
                  <section className="ms-sec" data-rail-section="series">
                    <div className="ms-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{seriesTitle || 'Series'}</span>
                      {onResetSeries && nSeriesOff > 0 && (
                        <button type="button" className="ms-link" onClick={onResetSeries}>Restablecer</button>
                      )}
                    </div>
                    <div className="ms-series">
                      {series.map(s => (
                        <label key={s.key} className={`ms-serie${s.active ? ' on' : ''}`} data-serie={s.key} title={s.label}>
                          <input
                            type={singleSeries ? 'radio' : 'checkbox'}
                            name={singleSeries ? 'ms-serie' : undefined}
                            checked={s.active}
                            disabled={s.disabled}
                            onChange={() => onToggleSerie?.(s.key)}
                            style={{ accentColor: s.color }}
                          />
                          <span className="ms-swatch" style={{ background: s.color }} />
                          <span className="ms-serie-l">{s.label}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                )}

                {resumen && resumen.length > 0 && (
                  <section className="ms-sec" data-rail-section="resumen">
                    <div className="ms-label">Resumen</div>
                    <div className="ms-kpis">
                      {resumen.slice(0, 4).map((k, i) => (
                        <div key={i} className="ms-kpi" data-kpi>
                          <div className="ms-kpi-l">{k.label}</div>
                          <div className="ms-kpi-v" style={{ color: kpiColor(k.color) }}>{k.value}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {railExtra && <section className="ms-sec" data-rail-section="extra">{railExtra}</section>}

                {exportes && exportes.length > 0 && (
                  <section className="ms-sec ms-export" data-rail-section="export">
                    <div className="ms-label">Exportar</div>
                    <div className="ms-export-btns">
                      {exportes.map((x, i) => (
                        <button
                          key={i}
                          type="button"
                          data-export={x.label}
                          disabled={x.disabled}
                          title={x.title}
                          onClick={x.onClick}
                          style={{
                            ...modalBtnStyle(!!x.primary),
                            ...(x.primary ? {} : { background: 'var(--card)' }),
                            opacity: x.disabled ? 0.5 : 1,
                            cursor: x.disabled ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {x.label}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <button type="button" className="ms-apply" data-apply onClick={() => setSheetOpen(false)}>Aplicar</button>
              </aside>
            </>
          )}

          {/* ───── Área principal ───── */}
          <div className="ms-main" ref={mainRef}>
            {hasSplit ? (
              <>
                {(mode === 'chart' || mode === 'split') && chart !== undefined && (
                  <div
                    className="ms-chartwrap"
                    data-chart-area
                    style={{ height: mode === 'chart' ? '100%' : `${split}%` }}
                  >
                    {chartLabel && <div className="ms-chartlabel" data-chart-label>{chartLabel}</div>}
                    <div className="ms-chartbox">{chart}</div>
                  </div>
                )}
                {mode === 'split' && (
                  <div
                    className="ms-divider"
                    data-divider
                    role="separator"
                    aria-orientation="horizontal"
                    title="Arrastre para redimensionar"
                    onMouseDown={() => { dragging.current = true; }}
                  />
                )}
                {(mode === 'table' || mode === 'split') && table !== undefined && (
                  <div className="ms-tablewrap" data-table-area>{table}</div>
                )}
              </>
            ) : (
              <div className="ms-free" data-free-area>{children}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── Piezas para maquetar el panel ───────── */

export function RailField({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="ms-field">
      {label && <div className="ms-field-l">{label}</div>}
      {children}
    </div>
  );
}

export function RailSelect({
  value, onChange, options, label, ariaLabel,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label?: string; ariaLabel?: string }) {
  return (
    <RailField label={label}>
      <select className="ms-select" value={value} aria-label={ariaLabel || label} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </RailField>
  );
}

export function RailSearch({
  value, onChange, placeholder, label,
}: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  return (
    <RailField label={label}>
      <input className="ms-input" type="search" value={value} placeholder={placeholder} aria-label={label || placeholder} onChange={e => onChange(e.target.value)} />
    </RailField>
  );
}

export function RailSegmented({
  value, onChange, options, label,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: ReactNode }[]; label?: string }) {
  return (
    <RailField label={label}>
      <SegmentedControl size="sm" fill wrap options={options} value={value} onChange={onChange} />
    </RailField>
  );
}

export function RailToggle({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="ms-check">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
