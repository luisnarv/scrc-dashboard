import React, { useMemo, useState } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import DisponibilidadAnalysisModal from './DisponibilidadAnalysisModal';

const TEAL = '#00897B';
const INK = '#141b2d';
const MUT = '#8a93a6';
const LINE = '#e7eaf0';

const sectionH: React.CSSProperties = { 
  fontSize: 15, fontWeight: 700, color: INK, display: 'flex', 
  alignItems: 'center', gap: 8, margin: '22px 0 10px', 
  borderLeft: `3px solid ${TEAL}`, paddingLeft: 10 
};
const card: React.CSSProperties = { 
  background: '#fff', borderRadius: 14, padding: '16px 18px', 
  boxShadow: '0 1px 4px rgba(20,30,60,.07)' 
};

export default function DisponibilidadSection() {
  const { raw, filters } = useDashboard();
  const [modalOpen, setModalOpen] = useState(false);

  const { matrix, days, brigadas, totalsByDay, totalsByBrigada } = useMemo(() => {
    if (!raw || !raw.disp) return { matrix: {}, days: [], brigadas: [], totalsByDay: {}, totalsByBrigada: {} };

    let data = raw.disp;
    if (filters.mes && filters.mes.length > 0) {
      data = data.filter(r => r.Fecha && filters.mes.some(m => r.Fecha!.startsWith(m)));
    }
    if (filters.proy && filters.proy !== 'ALL') {
      data = data.filter(r => r._Proyecto === filters.proy);
    }
    if (filters.zona && filters.zona !== 'ALL') {
      data = data.filter(r => r._Zona === filters.zona || r._ZonaDet === filters.zona);
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

    return { matrix, days, brigadas, totalsByDay, totalsByBrigada };
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

  if (!raw || !raw.disp) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={sectionH}>
        Disponibilidad de Brigadas por Día
        <button 
          onClick={() => setModalOpen(true)}
          style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 6, border: `1px solid ${TEAL}`, background: 'transparent', color: TEAL, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          Ver Evolución →
        </button>
      </div>
      
      <div style={{ ...card, overflowX: 'auto' }}>
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

      {modalOpen && <DisponibilidadAnalysisModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
