'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { SegmentedControl } from './Buttons';
import type { ChartConfiguration } from 'chart.js';

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
  };
  activeFilters?: { label: string; value: string }[];
  singleCategorySelect?: boolean;
  defaultSelectedCategory?: string;
}

export default function AnalysisModal({ open, onClose, title, description, config, modalConfig, tableData, activeFilters, singleCategorySelect, defaultSelectedCategory }: AnalysisModalProps) {
  const [viewMode, setViewMode] = useState<'chart' | 'split' | 'table'>('split');
  const [splitRatio, setSplitRatio] = useState(60); // % of chart
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    if (singleCategorySelect && defaultSelectedCategory) {
      return [defaultSelectedCategory];
    }
    return [];
  });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import('chart.js').Chart | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Escuchar tecla Esc para cerrar y eventos de mouse para el redimensionador
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);

    const handleMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      let ratio = (offsetY / rect.height) * 100;
      if (ratio < 20) ratio = 20;
      if (ratio > 80) ratio = 80;
      setSplitRatio(ratio);
    };
    const handleUp = () => { dragging.current = false; };
    
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => { 
      window.removeEventListener('keydown', handleEsc);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [open, onClose]);

  const activeConfig = modalConfig || config;

  const isDatasetCategory = activeConfig?.data?.datasets && activeConfig.data.datasets.length > 1;

  const allCategories = useMemo(() => {
    if (!activeConfig) return [];
    if (isDatasetCategory) {
      return activeConfig.data.datasets.map((d: any) => String(d.label));
    }
    if (activeConfig.type === 'bar' && activeConfig.data.labels) {
      return activeConfig.data.labels.map(String);
    }
    if (activeConfig.data && activeConfig.data.datasets) {
      return activeConfig.data.datasets.map((d: any) => String(d.label));
    }
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

  const toggleCategory = (cat: string) => {
    if (singleCategorySelect) {
      setSelectedCategories([cat]);
      return;
    }
    setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const filteredConfig = useMemo(() => {
    if (!activeConfig) return null;
    if (selectedCategories.length === 0) return activeConfig;
    const clone = JSON.parse(JSON.stringify(activeConfig));
    
    if (clone.data && clone.data.datasets) {
      if (isDatasetCategory || clone.type === 'line' || (clone.type !== 'bar' && clone.data.datasets.some((d: any) => selectedCategories.includes(String(d.label))))) {
        clone.data.datasets = clone.data.datasets.filter((d: any) => selectedCategories.includes(String(d.label)));
      } else if (clone.type === 'bar' && clone.data.labels) {
        const indices = clone.data.labels
          .map((label: string, i: number) => selectedCategories.includes(String(label)) ? i : -1)
          .filter((i: number) => i !== -1);
        
        if (indices.length > 0) {
          clone.data.labels = indices.map((i: number) => clone.data.labels[i]);
          clone.data.datasets.forEach((d: any) => {
            if (Array.isArray(d.data)) d.data = indices.map((i: number) => d.data[i]);
            if (Array.isArray(d.backgroundColor)) d.backgroundColor = indices.map((i: number) => d.backgroundColor[i]);
            if (Array.isArray(d.borderColor)) d.borderColor = indices.map((i: number) => d.borderColor[i]);
          });
        }
      }
    }
    return clone;
  }, [activeConfig, selectedCategories]);

  const filteredTableData = useMemo(() => {
    if (!tableData) return undefined;
    if (selectedCategories.length === 0 || tableData.categoryIndex === undefined) return tableData;
    const catIdx = tableData.categoryIndex;
    
    if (tableData.hierarchicalRows) {
      return {
        ...tableData,
        hierarchicalRows: tableData.hierarchicalRows.filter(r => selectedCategories.includes(String(r.row[catIdx])))
      };
    }
    if (tableData.rows) {
      return {
        ...tableData,
        rows: tableData.rows.filter(r => selectedCategories.includes(String(r[catIdx])))
      };
    }
    return tableData;
  }, [tableData, selectedCategories]);

  // Renderizar Chart.js
  useEffect(() => {
    if (!open || viewMode === 'table' || !filteredConfig || !canvasRef.current) return;
    let isMounted = true;
    import('chart.js').then(({ Chart, registerables }) => {
      if (!isMounted || !canvasRef.current) return;
      Chart.register(...registerables);

      const computed = getComputedStyle(document.body);
      const getVar = (v: string) => computed.getPropertyValue(v).trim();

      Chart.defaults.color = getVar('--text-muted');
      Chart.defaults.font.family = computed.fontFamily;
      Chart.defaults.borderColor = getVar('--border');
      Chart.defaults.elements.line.borderWidth = 3;
      Chart.defaults.elements.point.radius = 5;
      Chart.defaults.elements.point.hoverRadius = 8;
      
      if (!(Chart.defaults.plugins as any).tooltip) (Chart.defaults.plugins as any).tooltip = {};
      const tooltipOpts = Chart.defaults.plugins.tooltip as any;
      tooltipOpts.backgroundColor = getVar('--card');
      tooltipOpts.titleColor = getVar('--text-title');
      tooltipOpts.bodyColor = getVar('--text-body');
      tooltipOpts.borderColor = getVar('--border');
      tooltipOpts.borderWidth = 1;
      tooltipOpts.padding = 12;
      tooltipOpts.cornerRadius = 8;

      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
      
      const mCfg = JSON.parse(JSON.stringify(filteredConfig));
      if (mCfg.options) {
        mCfg.options.maintainAspectRatio = false;
        
        mCfg.options.onClick = (e: any, elements: any[], chart: any) => {
          if (elements.length > 0) {
            const el = elements[0];
            if (chart.config.type === 'bar') {
              const label = String(chart.data.labels[el.index]);
              toggleCategory(label);
            } else {
              const label = String(chart.data.datasets[el.datasetIndex].label);
              toggleCategory(label);
            }
          }
        };

        if (!mCfg.options.plugins) mCfg.options.plugins = {};
        if (!mCfg.options.plugins.legend) mCfg.options.plugins.legend = {};
        mCfg.options.plugins.legend.display = false;
      }

      chartRef.current = new Chart(canvasRef.current, mCfg as ChartConfiguration);
    });
    return () => {
      isMounted = false;
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, viewMode, filteredConfig]); // Depende de viewMode para montar/desmontar y redibujar

  if (!open) return null;

  return (
    <div className={`modal-back${open ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ zIndex: 9999 }}>
      <div className="modal-box" style={{ width: '95vw', maxWidth: '1600px', height: '95vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Encabezado */}
        <div className="modal-head" style={{ flexShrink: 0, paddingBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px', color: 'var(--text-title)' }}>{title}</h3>
            {description && <div className="sub" style={{ fontSize: 13, color: 'var(--text-muted)' }}>{description}</div>}
            
            {/* Filtros Activos (Etiquetas) */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {activeFilters?.map((f, i) => (
                <span key={i} style={{ fontSize: 11, background: 'var(--panel)', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 4, fontWeight: 600 }}>
                  {f.label}: <span style={{ color: 'var(--text-title)' }}>{f.value}</span>
                </span>
              ))}
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            
            {/* Selector de Modos de Vista */}
            <SegmentedControl
                options={[
                  { value: 'chart', label: '📈 Gráfico' },
                  { value: 'split', label: '📁 Ambos' },
                  { value: 'table', label: '📋 Tabla' }
                ]}
                value={viewMode}
                onChange={(val: string) => setViewMode(val as 'chart' | 'split' | 'table')}
              />

            <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

            <div style={{ display: 'flex', gap: 8 }}>
              {selectedCategories.length > 0 && (
                <button onClick={() => setSelectedCategories([])} style={{ background: 'var(--warn-bg, var(--hover-bg))', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', color: 'var(--warn)', fontSize: 12, fontWeight: 700 }}>
                  Restablecer Vista
                </button>
              )}
              <button title="Exportar PNG (Próximamente)" style={{ background: 'var(--panel)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, cursor: 'not-allowed', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>PNG ⬇</button>
              <button title="Exportar Excel (Próximamente)" style={{ background: 'var(--panel)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, cursor: 'not-allowed', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>XLSX ⬇</button>
            </div>
            <button className="modal-close" onClick={onClose} title="Cerrar (Esc)">✕</button>
          </div>
        </div>

        {/* Custom HTML Legend / Filter Buttons */}
        {allCategories.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingBottom: 12, paddingLeft: 20, paddingRight: 20, flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
            {allCategories.map((cat, i) => {
              const isActive = singleCategorySelect
                ? selectedCategories.includes(cat)
                : (selectedCategories.length === 0 || selectedCategories.includes(cat));
              const COLORS = ['var(--warn)', 'var(--brand-primary)', 'var(--ok)', 'var(--otc)', 'var(--text-muted)'];
              const datasetMatch = activeConfig?.data?.datasets?.find((d: any) => String(d.label) === cat);
              const color = (datasetMatch?.borderColor && typeof datasetMatch.borderColor === 'string')
                ? datasetMatch.borderColor
                : COLORS[i % COLORS.length];

              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  style={{
                    background: isActive ? 'var(--hover-bg, var(--ok-bg))' : 'var(--card)',
                    border: `1.5px solid ${isActive ? color : 'var(--border)'}`,
                    color: isActive ? 'var(--text-title)' : 'var(--text-muted)',
                    padding: '6px 14px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: isActive ? 700 : 500,
                    height: 32,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    opacity: (!isActive && singleCategorySelect) ? 0.6 : 1,
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  {cat}
                </button>
              );
            })}
          </div>
        )}

        {/* Contenido (Split View) */}
        <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          
          {(viewMode === 'chart' || viewMode === 'split') && (
            <div style={{ flex: viewMode === 'chart' ? 1 : `0 0 ${splitRatio}%`, position: 'relative', minHeight: 0 }}>
              <canvas ref={canvasRef} />
            </div>
          )}

          {viewMode === 'split' && (
            <div 
              onMouseDown={() => dragging.current = true}
              style={{ 
                height: 12, flexShrink: 0, 
                background: 'var(--panel)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', 
                cursor: 'row-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' 
              }}
            >
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
            </div>
          )}

          {(viewMode === 'table' || viewMode === 'split') && (
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              {!filteredTableData ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No hay tabla de respaldo configurada para esta vista.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, textAlign: 'center' }}>
                  <thead>
                    <tr>
                      {filteredTableData.columns.map((c, i) => (
                        <th key={i} style={{ 
                          position: 'sticky', top: 0, zIndex: i === 0 ? 3 : 2, 
                          left: i === 0 ? 0 : undefined,
                          background: 'var(--card)', 
                          borderBottom: '2px solid var(--border)', 
                          borderRight: i === 0 ? '2px solid var(--border)' : 'none',
                          padding: '12px 16px', 
                          textAlign: i === 0 ? 'left' : 'center', 
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          fontSize: 12
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
                          onRowClick={(val) => toggleCategory(val)}
                          categoryIndex={filteredTableData.categoryIndex}
                        />
                      ))
                    ) : filteredTableData.rows ? (
                      filteredTableData.rows.map((row, i) => (
                        <tr 
                          key={i} 
                          onClick={() => {
                            if (filteredTableData.categoryIndex !== undefined) {
                              toggleCategory(String(row[filteredTableData.categoryIndex]));
                            }
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
                              fontWeight: j === 0 ? 600 : 400
                            }}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : null}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function HierarchicalRowComponent({ hRow, onRowClick, categoryIndex }: { hRow: { row: any[]; children?: { row: any[] }[] }, onRowClick?: (val: string) => void, categoryIndex?: number }) {
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
            fontWeight: hasChildren && j === 0 ? 700 : (j === 0 ? 600 : 400)
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
              paddingLeft: j === 0 ? 32 : 16
            }}>
              {j === 0 ? <><span style={{ color: 'var(--border)', marginRight: 6 }}>└</span>{cell}</> : cell}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
