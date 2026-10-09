import React, { useMemo, useState, useRef } from 'react';
import ModalShell from '../components/ModalShell';
import { useDashboard } from '../components/DashboardProvider';
import { useTheme } from '../components/ThemeProvider';
import { filtDisp } from '../components/utils/filters';
import { cssVar } from '../components/utils/chartTheme';
import { descargarCsv, descargarPngDeCanvas } from '../components/utils/exportFile';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';

const TEAL = 'var(--sip)';
const INK = 'var(--text-title)';
const MUT = 'var(--text-muted)';
const LINE = 'var(--border)';

const MESES_C = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtMes = (m: string) => { const [y, mm] = String(m).split('-'); return `${MESES_C[Number(mm) - 1] || mm} ${y}`; };
const df = (n: number) => (Number(n) || 0).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Recharts dibuja en <svg>, no en <canvas>: para el PNG se serializa el SVG del gráfico (resolviendo las
 * variables CSS, que fuera de la página no existen) y se dibuja sobre un canvas con fondo sólido.
 */
function descargarPngDeSvg(host: HTMLElement | null, nombre: string, fondo: string): boolean {
  const svg = host?.querySelector('svg.recharts-surface') as SVGSVGElement | null;
  if (!svg) return false;
  const r = svg.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  const clon = svg.cloneNode(true) as SVGSVGElement;
  clon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clon.setAttribute('width', String(w));
  clon.setAttribute('height', String(h));
  clon.setAttribute('viewBox', `0 0 ${w} ${h}`);
  clon.setAttribute('style', `font-family:${getComputedStyle(document.body).fontFamily.replace(/"/g, "'")}`);
  const resolver = (s: string) => s.replace(/var\((--[\w-]+)\)/g, (_m, n: string) => cssVar(n) || 'currentColor');
  [clon, ...Array.from(clon.querySelectorAll('*'))].forEach(el => {
    Array.from(el.attributes).forEach(a => { if (a.value.includes('var(')) el.setAttribute(a.name, resolver(a.value)); });
  });
  const xml = new XMLSerializer().serializeToString(clon);
  const img = new Image();
  img.onload = () => {
    const esc = 2;
    const c = document.createElement('canvas');
    c.width = w * esc;
    c.height = h * esc;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(esc, esc);
    ctx.drawImage(img, 0, 0, w, h);
    descargarPngDeCanvas(c, nombre, fondo);
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  return true;
}

export default function DisponibilidadAnalysisModal({ onClose }: { onClose: () => void }) {
  const { raw, filters } = useDashboard();
  const { colors } = useTheme();
  const COLORS = colors.series;
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const chartHostRef = useRef<HTMLDivElement>(null);

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const { chartData, matrix, days, brigadas, totalsByBrigada, esVistaMensual } = useMemo(() => {
    if (!raw || !raw.disp) return { chartData: [], matrix: {}, days: [], brigadas: [], totalsByDay: {}, totalsByBrigada: {}, esVistaMensual: false };

    let data = filtDisp(raw.disp, filters);   // Proceso: solo Gestor si aplica
    if (filters.mes && filters.mes.length > 0) {
      data = data.filter(r => r.Fecha && filters.mes.some(m => r.Fecha!.startsWith(m)));
    }

    // Con 2+ meses seleccionados se agrupa por mes en vez de por día-del-mes (ver
    // misma nota en DisponibilidadSection.tsx).
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

    const chartData = days.map(d => {
      const point: any = { day: esVistaMensual ? fmtMes(d) : d };
      brigadas.forEach(b => { point[b] = matrix[b][d] || 0; });
      return point;
    });

    return { chartData, matrix, days, brigadas, totalsByDay, totalsByBrigada, esVistaMensual };
  }, [raw, filters.mes, filters.proceso]);

  const visibleBrigadas = selectedCategories.length > 0 ? brigadas.filter(b => selectedCategories.includes(b)) : brigadas;

  const visibleTotalsByDay: Record<string, number> = {};
  days.forEach(d => {
    visibleTotalsByDay[d] = visibleBrigadas.reduce((sum, b) => sum + (matrix[b]?.[d] || 0), 0);
  });
  const totalVisible = Object.values(visibleTotalsByDay).reduce((a, b) => a + b, 0);

  // RESUMEN: brigadas visibles, período pico, máximo y promedio por período (día o mes)
  const pico = days.reduce<string | null>((best, d) => (best === null || visibleTotalsByDay[d] > visibleTotalsByDay[best] ? d : best), null);
  const maximo = pico !== null ? visibleTotalsByDay[pico] : 0;
  const promedio = days.length ? totalVisible / days.length : 0;
  const etiquetaPeriodo = (d: string) => (esVistaMensual ? fmtMes(d) : d);

  const getCellColor = (val: number) => {
    if (val === 0) return 'var(--panel)';
    if (val <= 2) return colors.sip + '33';
    if (val <= 5) return colors.sip + '99';
    return 'var(--ok)'; // Verde primario
  };

  const getTextColor = (val: number) => {
    if (val === 0) return 'var(--text-muted)';
    if (val <= 2) return 'var(--text-title)'; // Contraste automático (blanco/negro) según el modo
    return '#ffffff'; // Para fondos oscuros o intensos
  };

  const exportPng = () => { descargarPngDeSvg(chartHostRef.current, 'disponibilidad-brigadas', cssVar('--card')); };
  const exportCsv = () => {
    descargarCsv(
      'disponibilidad-brigadas',
      ['Tipo Brigada', ...days.map(etiquetaPeriodo), 'Total'],
      [
        ...visibleBrigadas.map(b => [b, ...days.map(d => matrix[b]?.[d] ?? 0), totalsByBrigada[b] ?? 0]),
        [esVistaMensual ? 'Total por mes' : 'Total por día', ...days.map(d => visibleTotalsByDay[d]), totalVisible],
      ],
    );
  };

  return (
    <ModalShell
      title="Evolución de Disponibilidad de Brigadas"
      onClose={onClose}
      series={brigadas.map((b, i) => ({
        key: b,
        label: b,
        color: COLORS[i % COLORS.length],
        active: selectedCategories.length === 0 || selectedCategories.includes(b),
      }))}
      seriesTitle="Brigadas"
      onToggleSerie={toggleCategory}
      onResetSeries={() => setSelectedCategories([])}
      resumen={[
        { label: 'Brigadas', value: visibleBrigadas.length },
        { label: esVistaMensual ? 'Mes pico' : 'Día pico', value: pico !== null ? etiquetaPeriodo(pico) : '—', color: 'var(--warn)' },
        { label: 'Máximo', value: maximo.toLocaleString('es-CO'), color: 'var(--ok)' },
        { label: esVistaMensual ? 'Prom. por mes' : 'Prom. por día', value: df(promedio) },
      ]}
      exportes={[
        { label: 'PNG ⬇', onClick: exportPng, title: 'Descarga el gráfico como imagen' },
        { label: 'CSV ↓', onClick: exportCsv, primary: true, title: 'Exporta la tabla de disponibilidad (CSV, compatible con Excel)' },
      ]}
      chartLabel="LÍNEAS · brigadas disponibles"
      chart={
        <div ref={chartHostRef} style={{ position: 'absolute', inset: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-title)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
                itemStyle={{ fontSize: 13, fontWeight: 600 }}
              />
              {visibleBrigadas.map(b => {
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
      }
      table={
        <>
          <div className="mobile-scroll-tip" style={{ padding: '4px 12px' }}>Desliza horizontalmente para ver todos los días &rarr;</div>
          <table style={{ width: '100%', minWidth: Math.max(650, days.length * 28 + 190), borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, textAlign: 'center' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 3, textAlign: 'left', padding: '12px 16px', background: 'var(--card)', borderBottom: `2px solid var(--border)`, borderRight: `1px solid var(--border)`, color: MUT, fontWeight: 600 }}>Tipo Brigada</th>
                {days.map(d => (
                  <th key={d} style={{ position: 'sticky', top: 0, zIndex: 2, padding: '12px 4px', background: 'var(--card)', borderBottom: `2px solid var(--border)`, color: MUT, fontWeight: 600, width: esVistaMensual ? 64 : 24 }}>{etiquetaPeriodo(d)}</th>
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
                <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--hover-bg)', textAlign: 'left', padding: '12px 16px', borderTop: `2px solid var(--ok)`, borderRight: `1px solid var(--border)`, fontWeight: 700, color: 'var(--text-title)' }}>{esVistaMensual ? 'Total por mes' : 'Total por día'}</td>
                {days.map(d => (
                  <td key={d} style={{ padding: '12px 4px', borderTop: `2px solid var(--ok)`, background: 'var(--hover-bg)', fontWeight: 700, color: 'var(--text-title)' }}>{visibleTotalsByDay[d]}</td>
                ))}
                <td style={{ padding: '12px 16px', borderTop: `2px solid var(--ok)`, background: 'var(--hover-bg)', fontWeight: 800, color: 'var(--text-title)' }}>
                  {totalVisible}
                </td>
              </tr>
            </tfoot>
          </table>
        </>
      }
    />
  );
}
