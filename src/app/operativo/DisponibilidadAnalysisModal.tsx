import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';

const TEAL = 'var(--sip)';
const INK = 'var(--text-title)';
const MUT = 'var(--text-muted)';
const LINE = 'var(--border)';
const COLORS = ['#B5BD00', '#78BE20', '#509E2F', '#38764C', '#97999B', '#B5BD00', '#78BE20', '#509E2F'];

const overlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20
};

const modalStyle: React.CSSProperties = {
  background: 'var(--card)', borderRadius: 16, width: '95vw', maxWidth: '1600px',
  height: '95vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 10px 40px rgba(0,0,0,0.15)'
};

export default function DisponibilidadAnalysisModal({ onClose }: { onClose: () => void }) {
  const { raw, filters } = useDashboard();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'chart' | 'split' | 'table'>('split');
  const [splitRatio, setSplitRatio] = useState(60);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
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
  }, [onClose]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const { chartData, matrix, days, brigadas, totalsByDay, totalsByBrigada } = useMemo(() => {
    if (!raw || !raw.disp) return { chartData: [], matrix: {}, days: [], brigadas: [], totalsByDay: {}, totalsByBrigada: {} };

    let data = raw.disp;
    if (filters.mes && filters.mes.length > 0) {
      data = data.filter(r => r.Fecha && filters.mes.some(m => r.Fecha!.startsWith(m)));
    }

    const daySet = new Set<string>();
    const brigadaSet = new Set<string>();
    
    data.forEach(r => {
      if (r.Fecha) {
        const dayMatch = r.Fecha.match(/-(\d{2})$/);
        if (dayMatch) daySet.add(String(Number(dayMatch[1])));
      }
      if (r.Tipo_Brigada) brigadaSet.add(r.Tipo_Brigada);
    });

    const maxDay = Math.max(...Array.from(daySet).map(d => Number(d) || 0), 0);
    const days = Array.from({ length: maxDay }, (_, i) => String(i + 1));
    const brigadas = Array.from(brigadaSet).sort();

    const matrix: Record<string, Record<string, number>> = {};
    const totalsByDay: Record<string, number> = {};
    const totalsByBrigada: Record<string, number> = {};

    brigadas.forEach(b => {
      matrix[b] = {};
      days.forEach(d => { matrix[b][d] = 0; });
      totalsByBrigada[b] = 0;
    });
    days.forEach(d => { totalsByDay[d] = 0; });

    data.forEach(r => {
      if (r.Fecha && r.Tipo_Brigada) {
        const dayMatch = r.Fecha.match(/-(\d{2})$/);
        if (dayMatch) {
          const d = String(Number(dayMatch[1]));
          const val = Number(r.BrigadasActivas) || 0;
          matrix[r.Tipo_Brigada][d] = (matrix[r.Tipo_Brigada][d] || 0) + val;
          totalsByDay[d] = (totalsByDay[d] || 0) + val;
          totalsByBrigada[r.Tipo_Brigada] = (totalsByBrigada[r.Tipo_Brigada] || 0) + val;
        }
      }
    });

    const chartData = days.map(d => {
      const point: any = { day: d };
      brigadas.forEach(b => { point[b] = matrix[b][d] || 0; });
      return point;
    });

    return { chartData, matrix, days, brigadas, totalsByDay, totalsByBrigada };
  }, [raw, filters.mes]);

  const visibleBrigadas = selectedCategories.length > 0 ? brigadas.filter(b => selectedCategories.includes(b)) : brigadas;

  const visibleTotalsByDay: Record<string, number> = {};
  days.forEach(d => {
    visibleTotalsByDay[d] = visibleBrigadas.reduce((sum, b) => sum + (matrix[b]?.[d] || 0), 0);
  });

  const getCellColor = (val: number) => {
    if (val === 0) return '#f5f6f8';
    if (val <= 2) return '#b2dfdb';
    if (val <= 5) return '#4db6ac';
    return '#00695c';
  };

  const getTextColor = (val: number) => {
    if (val === 0) return MUT;
    if (val <= 5) return INK;
    return '#fff';
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        
        <div style={{ flexShrink: 0, padding: '24px 28px 12px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: '0 0 4px', fontSize: 24, color: INK, fontWeight: 800 }}>Evolución de Disponibilidad de Brigadas</h2>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 4, background: 'var(--panel)', padding: 4, borderRadius: 8 }}>
                <button onClick={() => setViewMode('chart')} style={{ padding: '6px 12px', background: viewMode === 'chart' ? 'var(--card)' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: viewMode === 'chart' ? 'var(--text-title)' : 'var(--text-muted)', boxShadow: viewMode === 'chart' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>📈 Gráfico</button>
                <button onClick={() => setViewMode('split')} style={{ padding: '6px 12px', background: viewMode === 'split' ? 'var(--card)' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: viewMode === 'split' ? 'var(--text-title)' : 'var(--text-muted)', boxShadow: viewMode === 'split' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>🗂 Ambos</button>
                <button onClick={() => setViewMode('table')} style={{ padding: '6px 12px', background: viewMode === 'table' ? 'var(--card)' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: viewMode === 'table' ? 'var(--text-title)' : 'var(--text-muted)', boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>📋 Tabla</button>
              </div>

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
              <button onClick={onClose} style={{ background: 'var(--panel)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: MUT, cursor: 'pointer', fontWeight: 'bold' }}>&times;</button>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {brigadas.map((b, i) => {
              const isActive = selectedCategories.length === 0 || selectedCategories.includes(b);
              const color = COLORS[i % COLORS.length];
              return (
                <button
                  key={b}
                  onClick={() => toggleCategory(b)}
                  style={{
                    background: isActive ? 'rgba(143,209,79,0.12)' : 'var(--card)',
                    border: `1px solid ${isActive ? 'var(--brand-primary)' : 'var(--border)'}`,
                    color: isActive ? 'var(--text-title)' : 'var(--text-body)',
                    padding: '6px 14px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    height: 32,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.25s'
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: isActive ? color : 'var(--text-muted)' }} />
                  {b}
                </button>
              );
            })}
          </div>
        </div>

        <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 28px 24px 28px' }}>
          
          {(viewMode === 'chart' || viewMode === 'split') && (
            <div style={{ height: viewMode === 'chart' ? '100%' : `${splitRatio}%`, position: 'relative', flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(234,243,226,0.08)" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-title)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
                    itemStyle={{ fontSize: 13, fontWeight: 600 }}
                  />
                  {visibleBrigadas.map((b, i) => {
                    const isActive = selectedCategories.length === 0 || selectedCategories.includes(b);
                    return (
                      <Line 
                        key={b} 
                        type="monotone" 
                        dataKey={b} 
                        stroke={COLORS[brigadas.indexOf(b) % COLORS.length]} 
                        strokeWidth={3} 
                        strokeOpacity={isActive ? 1 : 0.45}
                        dot={{ r: 5, strokeWidth: 0, fill: COLORS[brigadas.indexOf(b) % COLORS.length] }} 
                        activeDot={{ r: 8, onClick: () => toggleCategory(b) }} 
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {viewMode === 'split' && (
            <div style={{ height: 20, flexShrink: 0 }} />
          )}

          {(viewMode === 'table' || viewMode === 'split') && (
            <div style={{ flex: viewMode === 'table' ? 1 : undefined, height: viewMode === 'split' ? `calc(${100 - splitRatio}% - 20px)` : undefined, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, textAlign: 'center' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 3, textAlign: 'left', padding: '12px 16px', background: 'var(--card)', borderBottom: `2px solid var(--border)`, borderRight: `1px solid var(--border)`, color: MUT, fontWeight: 600 }}>Tipo Brigada</th>
                    {days.map(d => (
                      <th key={d} style={{ position: 'sticky', top: 0, zIndex: 2, padding: '12px 4px', background: 'var(--card)', borderBottom: `2px solid var(--border)`, color: MUT, fontWeight: 600, width: 24 }}>{d}</th>
                    ))}
                    <th style={{ position: 'sticky', top: 0, zIndex: 2, padding: '12px 16px', background: 'var(--card)', borderBottom: `2px solid var(--border)`, color: INK, fontWeight: 700 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBrigadas.map(b => (
                    <tr key={b} onClick={() => toggleCategory(b)} style={{ cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--card)', textAlign: 'left', padding: '8px 16px', borderBottom: `1px solid var(--border)`, borderRight: `1px solid var(--border)`, fontWeight: 600, color: INK, whiteSpace: 'nowrap' }}>{b}</td>
                      {days.map(d => {
                        const val = matrix[b][d];
                        return (
                          <td key={d} style={{ padding: 4, borderBottom: `1px solid ${LINE}`, background: 'inherit' }}>
                            <div style={{ background: getCellColor(val), color: getTextColor(val), width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, margin: '0 auto', fontSize: 11, fontWeight: val > 0 ? 600 : 400 }}>
                              {val}
                            </div>
                          </td>
                        );
                      })}
                      <td style={{ padding: '8px 16px', borderBottom: `1px solid ${LINE}`, background: 'inherit', fontWeight: 700, color: TEAL }}>{totalsByBrigada[b]}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--hover-bg)', textAlign: 'left', padding: '12px 16px', borderTop: `2px solid var(--ok)`, borderRight: `1px solid var(--border)`, fontWeight: 700, color: 'var(--text-title)' }}>Total por día</td>
                    {days.map(d => (
                      <td key={d} style={{ padding: '12px 4px', borderTop: `2px solid var(--ok)`, background: 'var(--hover-bg)', fontWeight: 700, color: 'var(--text-title)' }}>{visibleTotalsByDay[d]}</td>
                    ))}
                    <td style={{ padding: '12px 16px', borderTop: `2px solid var(--ok)`, background: 'var(--hover-bg)', fontWeight: 800, color: 'var(--text-title)' }}>
                      {Object.values(visibleTotalsByDay).reduce((a, b) => a + b, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
