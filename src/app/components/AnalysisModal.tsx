'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
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
}

export default function AnalysisModal({ open, onClose, title, description, config, modalConfig, tableData, activeFilters }: AnalysisModalProps) {
  const [viewMode, setViewMode] = useState<'chart' | 'split' | 'table'>('split');
  const [splitRatio, setSplitRatio] = useState(60); // % of chart
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  
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

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const allCategories = useMemo(() => {
    if (!activeConfig) return [];
    if (activeConfig.type === 'bar' && activeConfig.data.labels) {
      return activeConfig.data.labels.map(String);
    }
    if (activeConfig.data && activeConfig.data.datasets) {
      return activeConfig.data.datasets.map((d: any) => String(d.label));
    }
    return [];
  }, [activeConfig]);

  const filteredConfig = useMemo(() => {
    if (!activeConfig) return null;
    if (selectedCategories.length === 0) return activeConfig;
    const clone = JSON.parse(JSON.stringify(activeConfig));
    
    if (clone.data && clone.data.datasets) {
      if (clone.type === 'line' || (clone.type !== 'bar' && clone.data.datasets.some((d: any) => selectedCategories.includes(d.label)))) {
        clone.data.datasets = clone.data.datasets.filter((d: any) => selectedCategories.includes(d.label));
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
        <div className="modal-head" style={{ flexShrink: 0, paddingBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px', color: '#141b2d' }}>{title}</h3>
            {description && <div className="sub" style={{ fontSize: 13, color: '#8a93a6' }}>{description}</div>}
            
            {/* Filtros Activos (Etiquetas) */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {activeFilters?.map((f, i) => (
                <span key={i} style={{ fontSize: 11, background: '#eef0f5', color: '#5d6785', padding: '4px 8px', borderRadius: 4, fontWeight: 600 }}>
                  {f.label}: <span style={{ color: '#141b2d' }}>{f.value}</span>
                </span>
              ))}
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            
            {/* Selector de Modos de Vista */}
            <div style={{ display: 'flex', gap: 4, background: '#f5f7fa', padding: 4, borderRadius: 8 }}>
              <button onClick={() => setViewMode('chart')} style={{ padding: '6px 12px', background: viewMode === 'chart' ? '#fff' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: viewMode === 'chart' ? '#141b2d' : '#8a93a6', boxShadow: viewMode === 'chart' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>📈 Gráfico</button>
              <button onClick={() => setViewMode('split')} style={{ padding: '6px 12px', background: viewMode === 'split' ? '#fff' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: viewMode === 'split' ? '#141b2d' : '#8a93a6', boxShadow: viewMode === 'split' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>📊 Ambos</button>
              <button onClick={() => setViewMode('table')} style={{ padding: '6px 12px', background: viewMode === 'table' ? '#fff' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: viewMode === 'table' ? '#141b2d' : '#8a93a6', boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>📋 Tabla</button>
            </div>

            <div style={{ width: 1, height: 24, background: '#e2e8f0', margin: '0 4px' }} />

            <div style={{ display: 'flex', gap: 8 }}>
              {selectedCategories.length > 0 && (
                <button onClick={() => setSelectedCategories([])} style={{ background: '#fff3e0', border: '1px solid #ffe0b2', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', color: '#e65100', fontSize: 12, fontWeight: 700 }}>
                  Restablecer Vista
                </button>
              )}
              <button title="Exportar PNG (Próximamente)" style={{ background: '#f5f7fa', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: 6, cursor: 'not-allowed', color: '#8a93a6', fontSize: 12, fontWeight: 600 }}>PNG ↓</button>
              <button title="Exportar Excel (Próximamente)" style={{ background: '#f5f7fa', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: 6, cursor: 'not-allowed', color: '#8a93a6', fontSize: 12, fontWeight: 600 }}>XLSX ↓</button>
            </div>
            <button className="modal-close" onClick={onClose} title="Cerrar (Esc)">✕</button>
          </div>
        </div>

        {/* Custom HTML Legend for Multi-Select */}
        {allCategories.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingBottom: 16, borderBottom: '1px solid #eef0f5', flexShrink: 0 }}>
            {allCategories.map((cat, i) => {
              const isActive = selectedCategories.length === 0 || selectedCategories.includes(cat);
              const COLORS = ['#3949AB', '#00796b', '#F57C00', '#C62828', '#8E24AA', '#039BE5', '#43A047', '#E53935'];
              const color = COLORS[i % COLORS.length];
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  style={{
                    background: isActive ? color + '1A' : '#f5f7fa',
                    border: `1px solid ${isActive ? color : '#e2e8f0'}`,
                    color: isActive ? color : '#8a93a6',
                    padding: '4px 10px',
                    borderRadius: 16,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: isActive ? color : '#cbd5e1' }} />
                  {cat}
                </button>
              );
            })}
          </div>
        )}

        {/* Contenido (Split View) */}
        <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingTop: 16 }}>
          
          {(viewMode === 'chart' || viewMode === 'split') && (
            <div style={{ height: viewMode === 'chart' ? '100%' : `${splitRatio}%`, position: 'relative', flexShrink: 0, paddingBottom: viewMode === 'split' ? 16 : 0 }}>
              <canvas ref={canvasRef} />
            </div>
          )}

          {viewMode === 'split' && (
            <div 
              onMouseDown={() => { dragging.current = true; }}
              style={{ height: 16, background: '#f8fafc', cursor: 'row-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', flexShrink: 0, borderRadius: 4 }}
            >
              <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2 }} />
            </div>
          )}

          {(viewMode === 'table' || viewMode === 'split') && (
            <div style={{ flex: viewMode === 'table' ? 1 : undefined, height: viewMode === 'split' ? `calc(${100 - splitRatio}% - 16px)` : undefined, overflow: 'auto', paddingTop: viewMode === 'split' ? 16 : 0 }}>
              {!filteredTableData ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#8a93a6' }}>No hay tabla de respaldo configurada para esta vista.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, textAlign: 'center' }}>
                  <thead>
                    <tr>
                      {filteredTableData.columns.map((c, i) => (
                        <th key={i} style={{ 
                          position: 'sticky', top: 0, zIndex: i === 0 ? 3 : 2, 
                          left: i === 0 ? 0 : undefined,
                          background: '#fff', 
                          borderBottom: '2px solid #eef0f5', 
                          borderRight: i === 0 ? '2px solid #eef0f5' : 'none',
                          padding: '12px 16px', 
                          textAlign: i === 0 ? 'left' : 'center', 
                          color: '#5d6785', 
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
                          onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          {row.map((cell, j) => (
                            <td key={j} style={{ 
                              position: j === 0 ? 'sticky' : 'static', 
                              left: j === 0 ? 0 : undefined, 
                              zIndex: j === 0 ? 1 : 0, 
                              background: 'inherit',
                              backgroundColor: j === 0 ? '#fff' : undefined, // Ensure first column is opaque
                              borderBottom: '1px solid #f5f7fa', 
                              borderRight: j === 0 ? '2px solid #eef0f5' : 'none',
                              padding: '12px 16px', 
                              color: '#141b2d', 
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
        style={{ background: open ? '#eef7f5' : 'transparent', cursor: (hasChildren || categoryIndex !== undefined) ? 'pointer' : 'default', transition: 'background 0.2s' }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = '#f8fafc'; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        {hRow.row.map((cell, j) => (
          <td key={j} style={{ 
            position: j === 0 ? 'sticky' : 'static', 
            left: j === 0 ? 0 : undefined, 
            zIndex: j === 0 ? 1 : 0, 
            background: 'inherit',
            backgroundColor: j === 0 ? (open ? '#eef7f5' : '#fff') : undefined,
            borderBottom: '1px solid #f5f7fa', 
            borderRight: j === 0 ? '2px solid #eef0f5' : 'none',
            padding: '12px 16px', 
            color: '#141b2d', 
            textAlign: j === 0 ? 'left' : 'center',
            fontWeight: hasChildren && j === 0 ? 700 : (j === 0 ? 600 : 400)
          }}>
            {j === 0 && hasChildren ? <span style={{ display: 'inline-block', width: 16, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', color: '#3949AB' }}>▶</span> : null}
            {cell}
          </td>
        ))}
      </tr>
      {open && hRow.children && hRow.children.map((child, k) => (
        <tr key={k} style={{ background: '#fafbfc' }}>
          {child.row.map((cell, j) => (
            <td key={j} style={{ 
              position: j === 0 ? 'sticky' : 'static', 
              left: j === 0 ? 0 : undefined, 
              zIndex: j === 0 ? 1 : 0, 
              background: 'inherit',
              backgroundColor: j === 0 ? '#fafbfc' : undefined,
              borderBottom: '1px solid #f5f7fa', 
              borderRight: j === 0 ? '2px solid #eef0f5' : 'none',
              padding: '8px 16px', 
              color: '#5d6785', 
              fontSize: 12,
              textAlign: j === 0 ? 'left' : 'center',
              paddingLeft: j === 0 ? 32 : 16
            }}>
              {j === 0 ? <><span style={{ color: '#c2c8d4', marginRight: 6 }}>└</span>{cell}</> : cell}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
