'use client';
import { useState, useEffect, useRef } from 'react';
import type { ChartConfiguration } from 'chart.js';

export interface AnalysisModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: string;
  config: ChartConfiguration | null;
  tableData?: {
    columns: string[];
    rows: (string | number | null | undefined)[][];
    hierarchicalRows?: {
      row: (string | number | null | undefined)[];
      children?: { row: (string | number | null | undefined)[] }[];
    }[];
  };
  activeFilters?: { label: string; value: string }[];
}

export default function AnalysisModal({ open, onClose, title, description, config, tableData, activeFilters }: AnalysisModalProps) {
  const [tab, setTab] = useState<'chart' | 'table' | 'insights'>('chart');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import('chart.js').Chart | null>(null);

  // Escuchar tecla Esc para cerrar
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  // Renderizar Chart.js
  useEffect(() => {
    if (!open || tab !== 'chart' || !config || !canvasRef.current) return;
    let isMounted = true;
    import('chart.js').then(({ Chart, registerables }) => {
      if (!isMounted || !canvasRef.current) return;
      Chart.register(...registerables);
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
      
      // Ajustamos config para que sea más legible en modal (e.g., leyendas, aspecto)
      const modalConfig = JSON.parse(JSON.stringify(config));
      if (modalConfig.options) {
        modalConfig.options.maintainAspectRatio = false;
        if (modalConfig.options.plugins?.legend) {
          modalConfig.options.plugins.legend.display = true; // Forzar leyenda en el modal
        }
      }

      chartRef.current = new Chart(canvasRef.current, modalConfig as ChartConfiguration);
    });
    return () => {
      isMounted = false;
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    };
  }, [open, tab, config]);

  if (!open) return null;

  return (
    <div className={`modal-back${open ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ zIndex: 9999 }}>
      <div className="modal-box" style={{ width: '90%', maxWidth: '1200px', height: '85vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Encabezado */}
        <div className="modal-head" style={{ flexShrink: 0, paddingBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px', color: '#141b2d' }}>{title}</h3>
            {description && <div className="sub" style={{ fontSize: 13, color: '#8a93a6' }}>{description}</div>}
            
            {/* Filtros Activos */}
            {activeFilters && activeFilters.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {activeFilters.map((f, i) => (
                  <span key={i} style={{ fontSize: 11, background: '#eef0f5', color: '#5d6785', padding: '4px 8px', borderRadius: 4, fontWeight: 600 }}>
                    {f.label}: <span style={{ color: '#141b2d' }}>{f.value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button title="Exportar PNG (Próximamente)" style={{ background: '#f5f7fa', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: 6, cursor: 'not-allowed', color: '#8a93a6', fontSize: 12, fontWeight: 600 }}>PNG ⬇</button>
              <button title="Exportar Excel (Próximamente)" style={{ background: '#f5f7fa', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: 6, cursor: 'not-allowed', color: '#8a93a6', fontSize: 12, fontWeight: 600 }}>XLSX ⬇</button>
            </div>
            <button className="modal-close" onClick={onClose} title="Cerrar (Esc)">✕</button>
          </div>
        </div>

        {/* Pestañas */}
        <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid #eef0f5', marginBottom: 16, flexShrink: 0 }}>
          <button onClick={() => setTab('chart')} style={{ padding: '8px 4px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: tab === 'chart' ? '#3949AB' : '#8a93a6', borderBottom: tab === 'chart' ? '2px solid #3949AB' : '2px solid transparent' }}>Visualización</button>
          <button onClick={() => setTab('table')} style={{ padding: '8px 4px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: tab === 'table' ? '#3949AB' : '#8a93a6', borderBottom: tab === 'table' ? '2px solid #3949AB' : '2px solid transparent' }}>Tabla de Respaldo</button>
          <button onClick={() => setTab('insights')} style={{ padding: '8px 4px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: tab === 'insights' ? '#3949AB' : '#8a93a6', borderBottom: tab === 'insights' ? '2px solid #3949AB' : '2px solid transparent' }}>Insights ✨</button>
        </div>

        {/* Contenido (Scrollable) */}
        <div style={{ flex: 1, overflowY: 'auto', position: 'relative', minHeight: 0 }}>
          {tab === 'chart' && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 16 }}>
              <canvas ref={canvasRef} />
            </div>
          )}

          {tab === 'table' && (
            <div style={{ padding: '0 8px' }}>
              {!tableData ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#8a93a6' }}>No hay tabla de respaldo configurada para esta vista.</div>
              ) : (
                <table className="det" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>{tableData.columns.map((c, i) => <th key={i} style={{ borderBottom: '2px solid #eef0f5', padding: '12px 8px', textAlign: 'left', color: '#5d6785', fontSize: 12, textTransform: 'uppercase' }}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {tableData.hierarchicalRows ? (
                      tableData.hierarchicalRows.map((hRow, i) => (
                        <HierarchicalRowComponent key={i} hRow={hRow} />
                      ))
                    ) : (
                      tableData.rows.map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f5f7fa' }}>
                          {row.map((cell, j) => <td key={j} style={{ padding: '12px 8px', color: '#141b2d', fontSize: 13 }}>{cell}</td>)}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'insights' && (
            <div style={{ padding: 40, textAlign: 'center', color: '#8a93a6' }}>
              <div style={{ fontSize: 32, marginBottom: 16 }}>✨</div>
              <h4 style={{ margin: '0 0 8px', color: '#141b2d', fontSize: 16 }}>Análisis Automático (Próximamente)</h4>
              <p style={{ margin: 0, maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>La arquitectura está preparada para inyectar narrativas generadas por IA sobre estos datos.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function HierarchicalRowComponent({ hRow }: { hRow: { row: any[]; children?: { row: any[] }[] } }) {
  const [open, setOpen] = useState(false);
  const hasChildren = hRow.children && hRow.children.length > 0;
  return (
    <>
      <tr onClick={() => hasChildren && setOpen(!open)} style={{ borderBottom: '1px solid #f5f7fa', background: open ? '#eef7f5' : '#fff', cursor: hasChildren ? 'pointer' : 'default' }}>
        {hRow.row.map((cell, j) => (
          <td key={j} style={{ padding: '12px 8px', color: '#141b2d', fontSize: 13, fontWeight: hasChildren && j === 0 ? 700 : 400 }}>
            {j === 0 && hasChildren ? <span style={{ display: 'inline-block', width: 16, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', color: '#3949AB' }}>▶</span> : null}
            {cell}
          </td>
        ))}
      </tr>
      {open && hRow.children && hRow.children.map((child, k) => (
        <tr key={k} style={{ borderBottom: '1px solid #f5f7fa', background: '#fafbfc' }}>
          {child.row.map((cell, j) => (
            <td key={j} style={{ padding: '8px 8px 8px 32px', color: '#5d6785', fontSize: 12 }}>
              {j === 0 ? <><span style={{ color: '#c2c8d4', marginRight: 6 }}>└</span>{cell}</> : cell}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
