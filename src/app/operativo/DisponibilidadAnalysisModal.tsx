import React, { useMemo } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts';

const TEAL = '#00897B';
const INK = '#141b2d';
const MUT = '#8a93a6';
const LINE = '#e7eaf0';
const COLORS = ['#00897B', '#E91E63', '#FF9800', '#3F51B5', '#4CAF50', '#9C27B0', '#795548', '#607D8B'];

const overlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(20, 27, 45, 0.4)', backdropFilter: 'blur(3px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20
};

const modalStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 16, width: '100%', maxWidth: 1000,
  maxHeight: '90vh', overflowY: 'auto', padding: '24px 28px',
  boxShadow: '0 10px 40px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: 20
};

const card: React.CSSProperties = { 
  background: '#fff', borderRadius: 14, padding: '16px 18px', 
  boxShadow: '0 1px 4px rgba(20,30,60,.07)' 
};

export default function DisponibilidadAnalysisModal({ onClose }: { onClose: () => void }) {
  const { raw, filters } = useDashboard();

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 20, color: INK }}>Evolución de Disponibilidad de Brigadas</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 24, color: MUT, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
        </div>

        <div style={{ height: 300, width: '100%', marginTop: 10 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={LINE} />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: MUT }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: MUT }} />
              <Tooltip 
                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                itemStyle={{ fontSize: 13, fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ fontSize: 13, paddingTop: 10 }} />
              {brigadas.map((b, i) => (
                <Line key={b} type="monotone" dataKey={b} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3, strokeWidth: 1 }} activeDot={{ r: 6 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={{ ...card, overflowX: 'auto', padding: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'center' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: `1px solid ${LINE}`, color: MUT, fontWeight: 600 }}>Tipo Brigada</th>
                {days.map(d => (
                  <th key={d} style={{ padding: '8px 4px', borderBottom: `1px solid ${LINE}`, color: MUT, fontWeight: 600, width: 24 }}>{d}</th>
                ))}
                <th style={{ padding: '8px', borderBottom: `1px solid ${LINE}`, color: INK, fontWeight: 700 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {brigadas.map(b => (
                <tr key={b}>
                  <td style={{ textAlign: 'left', padding: '8px', borderBottom: `1px solid ${LINE}`, fontWeight: 500, color: INK, whiteSpace: 'nowrap' }}>{b}</td>
                  {days.map(d => {
                    const val = matrix[b][d];
                    return (
                      <td key={d} style={{ padding: 2, borderBottom: `1px solid ${LINE}` }}>
                        <div style={{ background: getCellColor(val), color: getTextColor(val), width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, margin: '0 auto', fontSize: 11, fontWeight: val > 0 ? 600 : 400 }}>
                          {val}
                        </div>
                      </td>
                    );
                  })}
                  <td style={{ padding: '8px', borderBottom: `1px solid ${LINE}`, fontWeight: 700, color: TEAL }}>{totalsByBrigada[b]}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 700, color: INK }}>Total por día</td>
                {days.map(d => (
                  <td key={d} style={{ padding: '10px 4px', fontWeight: 700, color: INK }}>{totalsByDay[d]}</td>
                ))}
                <td style={{ padding: '10px 8px', fontWeight: 800, color: INK }}>
                  {Object.values(totalsByDay).reduce((a, b) => a + b, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style={{ ...card, border: '1px dashed #ccc', textAlign: 'center', color: MUT, padding: 24, boxShadow: 'none' }}>
          Insights automáticos (próximamente)
        </div>
      </div>
    </div>
  );
}
