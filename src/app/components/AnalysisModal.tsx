'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import type { ChartConfiguration } from 'chart.js';
import ModalShell, { type RailKpi, type RailSerie, type ViewMode } from './ModalShell';
import ModalChart, { useThemeKey } from './ModalChart';
import { cloneConfig, cssVar, resolveColor, withAlpha } from './utils/chartTheme';
import { aplanarJerarquia, descargarCsv, descargarPngDeCanvas, nombreArchivo, type Celda } from './utils/exportFile';

export interface AnalysisModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: string;
  config: ChartConfiguration | null;
  modalConfig?: ChartConfiguration | null;
  tableData?: {
    columns: string[];
    rows?: (string | number | null | undefined)[][];
    hierarchicalRows?: {
      row: (string | number | null | undefined)[];
      children?: { row: (string | number | null | undefined)[] }[];
    }[];
    categoryIndex?: number;
    /**
     * Filas que sustituyen a la fila de una categoría cuando está seleccionada (p. ej. "Otras causales" se
     * reemplaza por cada una de las causales que agrupa).
     */
    categoryDetail?: Record<string, {
      row: (string | number | null | undefined)[];
      children?: { row: (string | number | null | undefined)[] }[];
    }[]>;
    // Ancho mínimo de la primera columna (sticky) para tablas con textos largos en esa columna.
    firstColMinWidth?: number;
  };
  activeFilters?: { label: string; value: string }[];
  singleCategorySelect?: boolean;
  defaultSelectedCategory?: string;
  /** Controles extra que van en la sección FILTROS del panel lateral (p. ej. un filtro que recalcula el gráfico). */
  headerExtra?: React.ReactNode;
  /** KPIs de la sección RESUMEN (máx. 4). */
  resumen?: RailKpi[];
  /** Etiqueta sobre el gráfico: "TIPO DE GRÁFICO · unidad". */
  chartLabel?: string;
}

const FALLBACK_COLORS = ['var(--warn)', 'var(--brand-primary)', 'var(--ok)', 'var(--otc)', 'var(--text-muted)'];

/** Texto plano de un título que puede ser JSX (para aria-label y nombre de archivo). */
function tituloPlano(title: React.ReactNode): string {
  if (typeof title === 'string') return title;
  if (typeof title === 'number') return String(title);
  return 'Detalle del gráfico';
}

export default function AnalysisModal({
  onClose, title, description, config, modalConfig, tableData, activeFilters, singleCategorySelect,
  defaultSelectedCategory, headerExtra, resumen, chartLabel,
}: AnalysisModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    if (singleCategorySelect && defaultSelectedCategory) return [defaultSelectedCategory];
    return [];
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const themeKey = useThemeKey();
  const titulo = tituloPlano(title);

  const activeConfig = modalConfig || config;
  const isDatasetCategory = !!(activeConfig?.data?.datasets && activeConfig.data.datasets.length > 1);

  const allCategories = useMemo(() => {
    if (!activeConfig) return [];
    if (isDatasetCategory) return activeConfig.data.datasets.map((d) => String(d.label));
    if (activeConfig.type === 'bar' && activeConfig.data.labels) return activeConfig.data.labels.map(String);
    if (activeConfig.data && activeConfig.data.datasets) return activeConfig.data.datasets.map((d) => String(d.label));
    return [];
  }, [activeConfig, isDatasetCategory]);

  useEffect(() => {
    if (singleCategorySelect && selectedCategories.length === 0 && allCategories.length > 0) {
      const initial = (defaultSelectedCategory && allCategories.includes(defaultSelectedCategory))
        ? defaultSelectedCategory
        : allCategories[0];
      setSelectedCategories([initial]);
    }
  }, [singleCategorySelect, defaultSelectedCategory, allCategories, selectedCategories.length]);

  // Si el gráfico cambia (p. ej. otro Estado) y una categoría seleccionada ya no existe, se descarta:
  // de lo contrario el gráfico y la tabla quedarían vacíos.
  useEffect(() => {
    setSelectedCategories(prev => {
      const vigentes = prev.filter(c => allCategories.includes(c));
      return vigentes.length === prev.length ? prev : vigentes;
    });
  }, [allCategories]);

  const toggleCategory = (cat: string) => {
    if (singleCategorySelect) {
      setSelectedCategories([cat]);
      return;
    }
    setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  // Configuración que se dibuja: filtra por categorías seleccionadas. En selección única de líneas
  // (efectividad por tipo) NO se ocultan los demás: el elegido va relleno y los otros atenuados.
  const filteredConfig = useMemo(() => {
    if (!activeConfig) return null;
    if (selectedCategories.length === 0) return activeConfig;
    const clone = cloneConfig(activeConfig) as ChartConfiguration;
    const datasets = clone.data?.datasets as unknown as Record<string, unknown>[] | undefined;
    if (!clone.data || !datasets) return clone;

    const tipo = (clone as unknown as { type?: string }).type;
    if (singleCategorySelect && tipo === 'line') {
      datasets.forEach(d => {
        const sel = selectedCategories.includes(String(d.label));
        const base = resolveColor(String(typeof d.borderColor === 'string' ? d.borderColor : (d.backgroundColor ?? 'var(--text-muted)')));
        if (/^meta/i.test(String(d.label))) return; // la línea de meta se queda tal cual
        if (sel) {
          d.fill = true;
          d.backgroundColor = withAlpha(base, 0.22);
          d.borderColor = base;
          d.borderWidth = 3;
          d.order = 0;
        } else {
          const tenue = withAlpha(base, 0.28);
          d.fill = false;
          d.borderColor = tenue;
          d.backgroundColor = tenue;
          d.pointBackgroundColor = tenue;
          d.pointBorderColor = tenue;
          d.borderWidth = 1.5;
          d.order = 1;
        }
      });
      return clone;
    }

    if (isDatasetCategory || tipo === 'line' || (tipo !== 'bar' && datasets.some(d => selectedCategories.includes(String(d.label))))) {
      clone.data.datasets = datasets.filter(d => selectedCategories.includes(String(d.label))) as never;
    } else if (tipo === 'bar' && clone.data.labels) {
      const labels = clone.data.labels as string[];
      const indices = labels.map((label, i) => selectedCategories.includes(String(label)) ? i : -1).filter(i => i !== -1);
      if (indices.length > 0) {
        clone.data.labels = indices.map(i => labels[i]);
        datasets.forEach(d => {
          if (Array.isArray(d.data)) d.data = indices.map(i => (d.data as unknown[])[i]);
          if (Array.isArray(d.backgroundColor)) d.backgroundColor = indices.map(i => (d.backgroundColor as unknown[])[i]);
          if (Array.isArray(d.borderColor)) d.borderColor = indices.map(i => (d.borderColor as unknown[])[i]);
        });
      }
    }
    return clone;
    // themeKey: los colores resueltos dependen del tema
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConfig, selectedCategories, singleCategorySelect, themeKey]);

  const filteredTableData = useMemo(() => {
    if (!tableData) return undefined;
    if (selectedCategories.length === 0 || tableData.categoryIndex === undefined) return tableData;
    const catIdx = tableData.categoryIndex;
    if (tableData.hierarchicalRows) {
      const detalle = tableData.categoryDetail || {};
      const filas = tableData.hierarchicalRows.flatMap(r => {
        const cat = String(r.row[catIdx]);
        if (!selectedCategories.includes(cat)) return [];
        // Categoría con detalle propio (Otras causales): se muestran todas las filas que agrupa
        return detalle[cat] ? detalle[cat] : [r];
      });
      return { ...tableData, hierarchicalRows: filas };
    }
    if (tableData.rows) {
      return { ...tableData, rows: tableData.rows.filter(r => selectedCategories.includes(String(r[catIdx]))) };
    }
    return tableData;
  }, [tableData, selectedCategories]);

  // ── Series del panel lateral (reemplazan los chips de la leyenda) ──
  const series: RailSerie[] = allCategories.map((cat, i) => {
    const active = singleCategorySelect
      ? selectedCategories.includes(cat)
      : (selectedCategories.length === 0 || selectedCategories.includes(cat));
    const ds = activeConfig?.data?.datasets?.find(d => String(d.label) === cat) as unknown as Record<string, unknown> | undefined;
    const porEtiqueta = !isDatasetCategory && activeConfig?.type === 'bar'
      ? (activeConfig?.data?.datasets?.[0] as unknown as { backgroundColor?: unknown })?.backgroundColor
      : undefined;
    const color =
      (ds && typeof ds.borderColor === 'string' && ds.borderColor) ||
      (ds && typeof ds.backgroundColor === 'string' && ds.backgroundColor) ||
      (Array.isArray(porEtiqueta) && typeof porEtiqueta[i] === 'string' && (porEtiqueta[i] as string)) ||
      FALLBACK_COLORS[i % FALLBACK_COLORS.length];
    return { key: cat, label: cat, color: color as string, active };
  });

  // ── Exportación ──
  const exportarCsv = () => {
    if (filteredTableData) {
      const filas = filteredTableData.hierarchicalRows ? aplanarJerarquia(filteredTableData.hierarchicalRows) : (filteredTableData.rows || []);
      descargarCsv(nombreArchivo(titulo), filteredTableData.columns, filas as Celda[][]);
      return;
    }
    const cfg = filteredConfig;
    const labels = (cfg?.data?.labels || []).map(String);
    const ds = (cfg?.data?.datasets || []) as unknown as { label?: string; data: unknown[] }[];
    descargarCsv(nombreArchivo(titulo), ['Periodo', ...ds.map(d => String(d.label))], labels.map((l, i) => [l, ...ds.map(d => d.data[i] as Celda)]));
  };
  const exportarPng = () => {
    const hacer = () => descargarPngDeCanvas(canvasRef.current, nombreArchivo(titulo), cssVar('--card'));
    if (viewMode === 'table') { setViewMode('chart'); setTimeout(hacer, 700); } else hacer();
  };

  // ── Tabla de respaldo ──
  const tabla = !filteredTableData ? (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No hay tabla de respaldo configurada para esta vista.</div>
  ) : (
    <>
      <div className="mobile-scroll-tip" style={{ padding: '4px 12px' }}>Desliza horizontalmente para ver todas las columnas &rarr;</div>
      <table style={{ width: '100%', minWidth: Math.max(520, (filteredTableData.columns?.length || 0) * 85), borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, textAlign: 'center' }}>
        <thead>
          <tr>
            {filteredTableData.columns.map((c, i) => (
              <th key={i} style={{
                position: 'sticky', top: 0, zIndex: i === 0 ? 3 : 2,
                left: i === 0 ? 0 : undefined,
                background: 'var(--th-bg)',
                borderBottom: '2px solid var(--border)',
                borderRight: i === 0 ? '2px solid var(--border)' : 'none',
                padding: '12px 16px',
                textAlign: i === 0 ? 'left' : 'center',
                minWidth: i === 0 ? filteredTableData.firstColMinWidth : undefined,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                fontSize: 12,
              }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredTableData.hierarchicalRows ? (
            filteredTableData.hierarchicalRows.map((hRow, i) => (
              <HierarchicalRowComponent
                key={i}
                hRow={hRow}
                onRowClick={(val) => { if (allCategories.includes(val)) toggleCategory(val); }}
                categoryIndex={filteredTableData.categoryIndex}
                firstColMinWidth={filteredTableData.firstColMinWidth}
              />
            ))
          ) : filteredTableData.rows ? (
            filteredTableData.rows.map((row, i) => (
              <tr
                key={i}
                onClick={() => {
                  if (filteredTableData.categoryIndex !== undefined) toggleCategory(String(row[filteredTableData.categoryIndex]));
                }}
                style={{ cursor: filteredTableData.categoryIndex !== undefined ? 'pointer' : 'default', transition: 'background 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {row.map((cell, j) => (
                  <td key={j} style={{
                    position: j === 0 ? 'sticky' : 'static',
                    left: j === 0 ? 0 : undefined,
                    zIndex: j === 0 ? 1 : 0,
                    background: 'inherit',
                    backgroundColor: j === 0 ? 'var(--card)' : undefined,
                    borderBottom: '1px solid var(--border)',
                    borderRight: j === 0 ? '2px solid var(--border)' : 'none',
                    padding: '12px 16px',
                    color: 'var(--text-title)',
                    textAlign: j === 0 ? 'left' : 'center',
                    minWidth: j === 0 ? filteredTableData.firstColMinWidth : undefined,
                    fontWeight: j === 0 ? 600 : 400,
                  }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          ) : null}
        </tbody>
      </table>
    </>
  );

  return (
    <ModalShell
      title={titulo}
      subtitle={description}
      onClose={onClose}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      filtros={(activeFilters && activeFilters.length > 0) || headerExtra ? (
        <>
          {headerExtra}
          {activeFilters?.map((f, i) => (
            <div key={i} className="ms-field">
              <div className="ms-field-l">{f.label}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-title)' }}>{f.value}</div>
            </div>
          ))}
        </>
      ) : undefined}
      series={series}
      singleSeries={singleCategorySelect}
      onToggleSerie={toggleCategory}
      onResetSeries={() => setSelectedCategories([])}
      seriesTitle="Series"
      resumen={resumen}
      exportes={[
        { label: 'PNG ⬇', onClick: exportarPng },
        { label: 'CSV ⬇', onClick: exportarCsv, primary: true },
      ]}
      chartLabel={chartLabel}
      chart={filteredConfig ? <ModalChart config={filteredConfig} canvasRef={canvasRef} onPick={toggleCategory} ariaLabel={titulo} /> : <div style={{ padding: 40, color: 'var(--text-muted)' }}>Sin datos para graficar.</div>}
      table={tabla}
    />
  );
}

function HierarchicalRowComponent({ hRow, onRowClick, categoryIndex, firstColMinWidth }: { hRow: { row: any[]; children?: { row: any[] }[] }, onRowClick?: (val: string) => void, categoryIndex?: number, firstColMinWidth?: number }) {
  const [open, setOpen] = useState(false);
  const hasChildren = hRow.children && hRow.children.length > 0;
  return (
    <>
      <tr
        onClick={() => {
          if (hasChildren) setOpen(!open);
          if (onRowClick && categoryIndex !== undefined) onRowClick(String(hRow.row[categoryIndex]));
        }}
        style={{ background: open ? 'var(--hover-bg)' : 'transparent', cursor: (hasChildren || categoryIndex !== undefined) ? 'pointer' : 'default', transition: 'background 0.2s' }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'var(--hover-bg)'; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        {hRow.row.map((cell, j) => (
          <td key={j} style={{
            position: j === 0 ? 'sticky' : 'static',
            left: j === 0 ? 0 : undefined,
            zIndex: j === 0 ? 1 : 0,
            background: 'inherit',
            backgroundColor: j === 0 ? (open ? 'var(--hover-bg)' : 'var(--card)') : undefined,
            borderBottom: '1px solid var(--border)',
            borderRight: j === 0 ? '2px solid var(--border)' : 'none',
            padding: '12px 16px',
            color: 'var(--text-title)',
            textAlign: j === 0 ? 'left' : 'center',
            minWidth: j === 0 ? firstColMinWidth : undefined,
            fontWeight: hasChildren && j === 0 ? 700 : (j === 0 ? 600 : 400),
          }}>
            {j === 0 && hasChildren ? <span style={{ display: 'inline-block', width: 16, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', color: 'var(--text-muted)' }}>▶</span> : null}
            {cell}
          </td>
        ))}
      </tr>
      {open && hRow.children && hRow.children.map((child, k) => (
        <tr key={k} style={{ background: 'var(--panel)' }}>
          {child.row.map((cell, j) => (
            <td key={j} style={{
              position: j === 0 ? 'sticky' : 'static',
              left: j === 0 ? 0 : undefined,
              zIndex: j === 0 ? 1 : 0,
              background: 'inherit',
              backgroundColor: j === 0 ? 'var(--panel)' : undefined,
              borderBottom: '1px solid var(--border)',
              borderRight: j === 0 ? '2px solid var(--border)' : 'none',
              padding: '8px 16px',
              color: 'var(--text-muted)',
              fontSize: 12,
              textAlign: j === 0 ? 'left' : 'center',
              minWidth: j === 0 ? firstColMinWidth : undefined,
              paddingLeft: j === 0 ? 32 : 16,
            }}>
              {j === 0 ? <><span style={{ color: 'var(--border)', marginRight: 6 }}>└</span>{cell}</> : cell}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
