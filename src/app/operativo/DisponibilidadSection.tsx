import React, { useMemo, useState } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import DisponibilidadAnalysisModal from './DisponibilidadAnalysisModal';
import { useTheme } from '../components/ThemeProvider';
import { filtDisp } from '../components/utils/filters';

const TEAL = 'var(--sip)';
const INK = 'var(--text-title)';
const MUT = 'var(--text-muted)';
const LINE = 'var(--border)';

const MESES_C = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtMes = (m: string) => { const [y, mm] = String(m).split('-'); return `${MESES_C[Number(mm) - 1] || mm} ${y}`; };

const sectionH: React.CSSProperties = { 
  fontSize: 15, fontWeight: 700, color: INK, display: 'flex', 
  alignItems: 'center', gap: 8, margin: '22px 0 10px', 
  borderLeft: `3px solid ${TEAL}`, paddingLeft: 10 
};
const card: React.CSSProperties = {
  background: 'var(--card)', borderRadius: 14, padding: '16px 18px',
  boxShadow: '0 1px 4px rgba(0,0,0,.07)'
};
// Sin background/color explicitos el select cae al estilo nativo del
// navegador (blanco) y es lo unico que no sigue el tema.
const selectStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6, border: `1px solid ${LINE}`,
  fontSize: 12, outline: 'none',
  background: 'var(--panel)', color: 'var(--text-body)', fontFamily: 'inherit'
};

export default function DisponibilidadSection() {
  const { raw, filters } = useDashboard();
  const { colors } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const [locFilterTipo, setLocFilterTipo] = useState('ALL');
  const [locFilterZona, setLocFilterZona] = useState('ALL');

  const { matrix, days, brigadas, totalsByDay, totalsByBrigada, esVistaMensual, availableTipos, availableZonas } = useMemo(() => {
    if (!raw || !raw.disp) return { matrix: {}, days: [], brigadas: [], totalsByDay: {}, totalsByBrigada: {}, esVistaMensual: false, availableTipos: [], availableZonas: [] };

    let data = filtDisp(raw.disp, filters);   // Proceso: solo Gestor si aplica
    // Aplicar filtros globales obligatorios
    if (filters.mes && filters.mes.length > 0) {
      data = data.filter(r => r.Fecha && filters.mes.some(m => r.Fecha!.startsWith(m)));
    }
    if (filters.proy && filters.proy !== 'ALL') {
      data = data.filter(r => r._Proyecto === filters.proy);
    }
    if (filters.zona && filters.zona !== 'ALL') {
      data = data.filter(r => r._Zona === filters.zona || r._ZonaDet === filters.zona);
    }

    // Obtener listas para filtros locales (ignorando 'SIN CLASIFICAR')
    data = data.filter(r => r.Tipo_Brigada && r.Tipo_Brigada.toUpperCase() !== 'SIN CLASIFICAR');

    const tiposSet = new Set<string>();
    const zonasSet = new Set<string>();
    data.forEach(r => {
      if (r.Tipo_Brigada) tiposSet.add(r.Tipo_Brigada);
      if (r._Zona) zonasSet.add(r._Zona);
    });

    // Aplicar filtros locales
    if (locFilterTipo !== 'ALL') {
      data = data.filter(r => r.Tipo_Brigada === locFilterTipo);
    }
    if (locFilterZona !== 'ALL') {
      data = data.filter(r => r._Zona === locFilterZona);
    }

    // Con 2+ meses seleccionados se agrupa por mes (igual que los demás evolutivos
    // de la página) en vez de por día-del-mes: agrupar por día-del-mes con varios
    // meses mezclaba silenciosamente Jul+Ago+Sep en la misma columna "día 1".
    const esVistaMensual = (filters.mes?.length || 0) >= 2;
    const periodOf = (fecha: string): string | null => {
      if (esVistaMensual) return fecha.slice(0, 7);
      const dayMatch = fecha.match(/-(\d{2})$/);
      return dayMatch ? String(Number(dayMatch[1])) : null;
    };

    const daySet = new Set<string>();
    const brigadaSet = new Set<string>();

    data.forEach(r => {
      if (r.Fecha) {
        const p = periodOf(r.Fecha);
        if (p) daySet.add(p);
      }
      if (r.Tipo_Brigada) brigadaSet.add(r.Tipo_Brigada);
    });

    const days = esVistaMensual
      ? Array.from(daySet).sort()
      : Array.from({ length: Math.max(...Array.from(daySet).map(d => Number(d) || 0), 0) }, (_, i) => String(i + 1));
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
        const d = periodOf(r.Fecha);
        if (d) {
          const val = Number(r.BrigadasActivas) || 0;
          matrix[r.Tipo_Brigada][d] = (matrix[r.Tipo_Brigada][d] || 0) + val;
          totalsByDay[d] = (totalsByDay[d] || 0) + val;
          totalsByBrigada[r.Tipo_Brigada] = (totalsByBrigada[r.Tipo_Brigada] || 0) + val;
        }
      }
    });

    return {
      matrix, days, brigadas, totalsByDay, totalsByBrigada, esVistaMensual,
      availableTipos: Array.from(tiposSet).sort(),
      availableZonas: Array.from(zonasSet).sort()
    };
  }, [raw, filters.mes, filters.proy, filters.zona, filters.proceso, locFilterTipo, locFilterZona]);

  const getCellColor = (val: number) => {
    if (val === 0) return 'var(--hover-bg)';
    if (val <= 2) return colors.sip + '44'; // 26% opacity
    if (val <= 5) return colors.sip + 'AA'; // 66% opacity
    return colors.sip;
  };

  const getTextColor = (val: number) => {
    if (val === 0) return 'var(--text-muted)';
    if (val <= 2) return 'var(--text-body)';
    return '#fff';
  };

  if (!raw || !raw.disp) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={sectionH}>
        Disponibilidad de Brigadas por Día
        
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', marginRight: 16 }}>
          <select 
            value={locFilterTipo}
            onChange={e => setLocFilterTipo(e.target.value)}
            style={selectStyle}
          >
            <option value="ALL">Todos los Tipos</option>
            {availableTipos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select 
            value={locFilterZona}
            onChange={e => setLocFilterZona(e.target.value)}
            style={selectStyle}
          >
            <option value="ALL">Todas las Zonas</option>
            {availableZonas.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>

        <button 
          onClick={() => setModalOpen(true)}
          style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${TEAL}`, background: 'transparent', color: TEAL, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
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
                <th key={d} style={{ padding: '8px 4px', borderBottom: `1px solid ${LINE}`, color: MUT, fontWeight: 600, width: esVistaMensual ? 64 : 24 }}>{esVistaMensual ? fmtMes(d) : d}</th>
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
              <td style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 700, color: INK }}>{esVistaMensual ? 'Total por mes' : 'Total por día'}</td>
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
