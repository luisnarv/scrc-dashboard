'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { filtRaw, filtMes, filtDisp } from '../components/utils/filters';
import { fmtPct, fmtN, num as n, fmtRangoMeses } from '../components/utils/formatters';
import BrigadasDetalleModal from './BrigadasDetalleModal';
import DisponibilidadSection from './DisponibilidadSection';
import ChartCard from '../components/ChartCard';
import { useTheme } from '../components/ThemeProvider';
import { esFestivo } from '../components/utils/holidays';
import MapModal from '../components/MapModal';
import BrigadaEvolutivoModal from './BrigadaEvolutivoModal';

function diasHabilesMes(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return 0;
  const dim = new Date(y, m, 0).getDate();
  let c = 0;
  for (let day = 1; day <= dim; day++) { 
    const date = new Date(y, m - 1, day);
    if (date.getDay() !== 0 && !esFestivo(date)) c++; 
  }
  return c;
}

const card: React.CSSProperties = { background: 'var(--panel)', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 3px rgba(20,30,60,.05)' };
const secH = (c: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: c, margin: '24px 2px 12px' });
const dot = (c: string): React.CSSProperties => ({ width: 8, height: 8, borderRadius: '50%', background: c });

// Color FIJO por tipo de brigada (por nombre, no por ranking), segun la paleta
// solicitada. La clave se normaliza a MAYUSCULAS. Nombres no listados caen a la
// paleta de reserva (evPal).
const COLOR_BRIGADA: Record<string, string> = {
  // Nombres reales de la data V2 (historico_mo.tipo_brigada), mapeados a la paleta.
  'SCR PESADA': '#38764C',                // verde oscuro
  'SCR LIVIANA': '#2E6FB5',               // azul
  'SCR MULTIFAMILIAR': '#78BE20',         // verde lima
  'SCR PESADA DISPONIBILIDAD': '#3E9E56', // verde
  'SCR MINI CANASTA': '#7E56C2',          // morado
  'SCR MEDIDA ESPECIAL': '#B5BD00',       // oliva
  'CANASTA': '#D64A2A',                   // rojo-naranja
  'WEB': '#8F5A24',                       // cafe
  'SCR DISPONIBLE': '#97999B',            // gris
  // Nombres homologados (data vieja / si se homologa el nombre en la consulta).
  'BRIGADA PESADA': '#38764C',        // verde oscuro
  'GESTOR INTEGRAL MULTI': '#78BE20', // verde lima
  'BRIGADA LIVIANA': '#2E6FB5',       // azul
  'PESADA MT-AT': '#B5BD00',          // oliva
  'BRIGADA CANASTA': '#D64A2A',       // rojo-naranja
  'BRIGADA MINICANASTA': '#7E56C2',   // morado
  '(D) BRIGADA PESADA': '#4FA3E0',    // azul claro
  'BRIGADA PESADA MT-AT': '#8F5A24',  // cafe
  'PESADA DISPONIBLE': '#3E9E56',     // verde
};

/* Barra de progreso simple con semáforo */
function ProgBar({ pct, color }: { pct: number; color: string }) {
  return (
    <span style={{ display: 'block', height: 10, background: 'var(--hover-bg)', borderRadius: 5, overflow: 'hidden' }}>
      <span style={{ display: 'block', height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`, background: color, borderRadius: 5, transition: 'width .5s' }} />
    </span>
  );
}

export default function OperativoPage() {
  const { raw, filters, mesList, loading, error } = useDashboard();
  const { colors, theme } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [brigadaModalOpen, setBrigadaModalOpen] = useState(false);
  const [filtroEvolutivo, setFiltroEvolutivo] = useState<string | null>(null);

  const TEAL = colors.sip;
  const INDIGO = colors.otc;
  const OK = colors.ok;
  const WARN = colors.warn;
  const ERR = colors.err;
  const INK = colors.ink;
  const MUT = colors.mut;
  const chartColors = colors.series;

  const sem = (v: number, good: number, warn: number) => v >= good ? OK : v >= warn ? WARN : ERR;

  const d = useMemo(() => {
    if (!raw) return null;
    const F = filters;    const rawF = filtRaw(raw.raw, F);

    const efect = rawF.reduce((s, r) => s + n(r.Efectivas), 0);
    const fallidas = rawF.reduce((s, r) => s + n(r.Fallida_Con_Pago), 0);
    const perdidas = rawF.reduce((s, r) => s + n(r.Fallida_Sin_Pago) + n(r.Perdidas), 0);
    const visitas = rawF.reduce((s, r) => s + n(r.Visitas), 0);
    const asignado = rawF.reduce((s, r) => s + n(r.Asignacion), 0);
    const brigadasDisp = new Set(rawF.map(r => r.Cedula)).size;

    // Brigadas que cuentan como "disponibles" (Pool). Definido UNA vez y reutilizado
    // tanto en el mes actual como en el cálculo del mes anterior (deltas mes vs mes).
    const DISPONIBLES_TYPES = [
      'brigada canasta',
      'brigada minicanasta',
      'brigada pesada mt-at',
      'gestor integral multi',
    ];
    const isDisponible = (tb: string | undefined, dateStr: string) => {
      if (!tb) return false;
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        if (dateObj.getDay() === 0) return true; // domingo: todas las que trabajan cuentan
      }
      return DISPONIBLES_TYPES.includes(String(tb).trim().toLowerCase());
    };

    // Agrupación Diaria para Evolutivos y Tendencias
    const byDay: Record<string, { efec: number, fall: number, perd: number, disp: number, oper: number, brigadas: Set<unknown> }> = {};
    const byTypeDay: Record<string, Record<string, { efec: number, vis: number, fall: number, perd: number }>> = {};

    rawF.forEach(r => {
      const day = String(r.Fecha || '');
      if (!day) return;
      const t = String(r.Tipo_Cuadrilla || r.Tipo_Brigada_Operaciones || 'Sin tipo');
      
      const e = n(r.Efectivas);
      const f = n(r.Fallida_Con_Pago);
      const p = n(r.Fallida_Sin_Pago) + n(r.Perdidas);
      const v = n(r.Visitas);
      
      const bd = (byDay[day] ??= { efec: 0, fall: 0, perd: 0, disp: 0, oper: 0, brigadas: new Set() });
      bd.efec += e; bd.fall += f; bd.perd += p;
      bd.brigadas.add(r.Cedula);

      const btd = (byTypeDay[t] ??= {});
      const td = (btd[day] ??= { efec: 0, vis: 0, fall: 0, perd: 0 });
      td.efec += e; td.vis += v; td.fall += f; td.perd += p;
    });

    const dias = Object.keys(byDay).sort();
    const diasEjec = dias.length;

    if (raw.disp) {
      const dispData = filtDisp(raw.disp, F);

      dias.forEach(d => {
        const matchingDisp = dispData.filter((r: any) => {
          if (r.Fecha !== d) return false;
          if (F.proy !== 'ALL' && r._Proyecto !== F.proy) return false;
          if (F.zona !== 'ALL' && r._Zona !== F.zona && r._ZonaDet !== F.zona) return false;
          return true;
        });
        
        const operativas = byDay[d].brigadas.size;
        
        // Pool Disponible = las predefinidas + todas en domingo
        const totalDisp = matchingDisp
          .filter((r: any) => isDisponible(r.Tipo_Brigada, d))
          .reduce((sum: number, r: any) => sum + (Number(r.BrigadasActivas) || 0), 0);
        
        byDay[d].oper = operativas; // Mantenemos todas las que trabajaron como operativas
        byDay[d].disp = totalDisp;  // Este es el Pool 
      });
    } else {
      dias.forEach(d => {
        byDay[d].oper = byDay[d].brigadas.size;
        byDay[d].disp = 0;
      });
    }

    const brigadasOper = dias.length ? Math.round(dias.reduce((s, f) => s + byDay[f].oper, 0) / dias.length) : 0;
    // Pool de disponibles del PERIODO = técnicos DISTINTOS que estuvieron en una
    // brigada disponible durante los días seleccionados (no el promedio diario).
    // Así, al ver el mes completo, es el total del pool y nunca queda por debajo
    // de un día individual.
    const dispTecPeriodo = new Set<unknown>();
    rawF.forEach(r => {
      const day = String(r.Fecha || '');
      const tb = String(r.Tipo_Brigada_Operaciones || r.Tipo_Brigada_Mes || '');
      if (day && isDisponible(tb, day)) dispTecPeriodo.add(r.Cedula);
    });
    const brigadasDispPool = dispTecPeriodo.size;

    const meses12 = mesList.slice(-12);
    const selWin = F.mes.length ? [...F.mes].sort() : [meses12[meses12.length - 1]].filter(Boolean) as string[];
    const diasHabiles = selWin.reduce((s, m) => s + diasHabilesMes(m), 0);

    // Cumplimientos
    const cEfect = asignado ? efect / asignado : 0;
    const cDias = diasHabiles ? diasEjec / diasHabiles : 0;
    const cAsignEjec = asignado ? visitas / asignado : 0;
    const totOrd = efect + fallidas + perdidas || 1;
    const efectividad = visitas ? efect / visitas : 0;
    const perdRate = perdidas / totOrd;
    const disponibilidad = brigadasDispPool ? brigadasOper / brigadasDispPool : 0;

    // Deltas de tendencia.
    //  - Si se ve el MES COMPLETO (Fecha = Todas y un solo mes): mes vs mes anterior.
    //  - Si no: último día ejecutado vs el día ejecutado anterior.
    let dEfec = null, dFall = null, dOper = null, dDisp = null, ultD = '', antD = '';
    let modoDelta: 'mes' | 'dia' = 'dia';

    const mesAnteriorStr = (ym: string) => {
      const [y, m] = ym.split('-').map(Number);
      const dt = new Date(y, m - 2, 1);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    };

    // Métricas {efec, fall, oper, disp} de un subconjunto de filas (para el mes anterior).
    const metricasDe = (rows: typeof rawF) => {
      let efec = 0, fall = 0;
      const bd: Record<string, { brig: Set<unknown> }> = {};
      const dispTec = new Set<unknown>();   // técnicos distintos disponibles en el periodo
      rows.forEach(r => {
        const day = String(r.Fecha || ''); if (!day) return;
        efec += n(r.Efectivas); fall += n(r.Fallida_Con_Pago);
        (bd[day] ??= { brig: new Set() }).brig.add(r.Cedula);
        const tb = String(r.Tipo_Brigada_Operaciones || r.Tipo_Brigada_Mes || '');
        if (isDisponible(tb, day)) dispTec.add(r.Cedula);
      });
      const ds = Object.keys(bd);
      const oper = ds.length ? Math.round(ds.reduce((s, day) => s + bd[day].brig.size, 0) / ds.length) : 0;
      return { efec, fall, oper, disp: dispTec.size };
    };

    if (F.fecha === 'ALL' && selWin.length === 1) {
      // MES COMPLETO -> comparar contra el mes anterior.
      modoDelta = 'mes';
      const prevRows = filtRaw(raw.raw, { ...F, mes: [mesAnteriorStr(selWin[0])] });
      if (prevRows.length) {
        const prev = metricasDe(prevRows);
        if (prev.efec) dEfec = (efect - prev.efec) / prev.efec;
        if (prev.fall) dFall = (fallidas - prev.fall) / prev.fall;
        if (prev.oper) dOper = (brigadasOper - prev.oper) / prev.oper;
        if (prev.disp) dDisp = (brigadasDispPool - prev.disp) / prev.disp;
      }
    } else if (dias.length >= 2) {
      // DÍA a DÍA (último día ejecutado vs el anterior).
      ultD = dias[dias.length - 1];
      antD = dias[dias.length - 2];
      const ult = byDay[ultD];
      const ant = byDay[antD];
      if (ant.efec) dEfec = (ult.efec - ant.efec) / ant.efec;
      if (ant.fall) dFall = (ult.fall - ant.fall) / ant.fall;
      if (ant.oper) dOper = (ult.oper - ant.oper) / ant.oper;
      if (ant.disp) dDisp = (ult.disp - ant.disp) / ant.disp;
    }

    // Narrativa Automática
    let narrativa = 'No hay suficientes datos diarios para generar una tendencia.';
    if (dEfec !== null && dias.length >= 1) {
      const maxEfecDay = dias.reduce((a, b) => byDay[a].efec > byDay[b].efec ? a : b);
      const efecTrend = dEfec > 0.05 ? 'al alza' : dEfec < -0.05 ? 'a la baja' : 'estable';
      const refTxt = modoDelta === 'mes' ? 'respecto al mes anterior' : 'respecto al día anterior';
      narrativa = `La operación muestra una tendencia ${efecTrend} en efectivas ${refTxt}. El día de mayor volumen fue el ${maxEfecDay.slice(-2)} con ${fmtN(byDay[maxEfecDay].efec)} efectivas. `;
      
      if (disponibilidad < 0.7) narrativa += `La disponibilidad promedio es preocupantemente baja (${fmtPct(disponibilidad)}). `;
      else narrativa += `La disponibilidad promedio se mantiene en ${fmtPct(disponibilidad)}. `;

      if (perdRate > 0.1) narrativa += `Atención: Hay un volumen alto de órdenes perdidas (${fmtPct(perdRate)}).`;
    }

    // Configuración de Gráficos (Evolutivos Diarios)
    const baseOpt = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom' as const, labels: { boxWidth: 12, font: { size: 10 } } } } };
    
    // Gráfico 1: Evolutivo Diario de Órdenes
    const chartOrd = {
      type: 'bar',
      data: {
        labels: dias.map(d => d.slice(-2)),
        datasets: [
          { label: 'Efectivas', data: dias.map(d => byDay[d].efec), backgroundColor: OK },
          { label: 'Fallidas', data: dias.map(d => byDay[d].fall), backgroundColor: WARN },
          { label: 'Perdidas', data: dias.map(d => byDay[d].perd), backgroundColor: ERR },
        ]
      },
      options: { ...baseOpt, scales: { x: { stacked: true }, y: { stacked: true } } }
    };

    // Gráfico 2: Evolutivo Diario de Brigadas
    const chartBrig = {
      type: 'line',
      data: {
        labels: dias.map(d => d.slice(-2)),
        datasets: [
          { label: 'Brigadas Operativas', data: dias.map(d => byDay[d].oper), borderColor: INDIGO, backgroundColor: INDIGO + '33', fill: true, tension: 0.3 },
          { label: 'Brigadas Disponibles', data: dias.map(d => byDay[d].disp), borderColor: MUT, borderDash: [5, 5], fill: false, tension: 0 },
        ]
      },
      options: { ...baseOpt, scales: { y: { min: 0 } } }
    };

    // Gráfico 3: Evolutivo por Tipo de Brigada
    const tiposArr = Object.keys(byTypeDay);
    const chartTipos = {
      type: 'line',
      data: {
        labels: dias.map(d => d.slice(-2)),
        datasets: tiposArr.map((t, idx) => ({
          label: t,
          data: dias.map(d => byTypeDay[t][d]?.efec || 0),
          borderColor: chartColors[idx % chartColors.length],
          backgroundColor: chartColors[idx % chartColors.length] + '33',
          fill: false, tension: 0.3
        }))
      },
      options: { ...baseOpt, scales: { y: { min: 0 } } }
    };

    // Tablas Modales
    const tableDataOrd = {
      columns: ['Día', 'Total Órdenes', 'Efectivas', 'Fallidas', 'Perdidas'],
      rows: dias.map(d => {
        const bd = byDay[d];
        const total = bd.efec + bd.fall + bd.perd;
        return [d.slice(-2), fmtN(total), fmtN(bd.efec), fmtN(bd.fall), fmtN(bd.perd)];
      })
    };

    const tableDataBrig = {
      columns: ['Día', 'Brigadas Operativas', 'Brigadas Disponibles'],
      rows: dias.map(d => {
        const bd = byDay[d];
        return [d.slice(-2), fmtN(bd.oper), fmtN(bd.disp)];
      })
    };

    const tableDataTipos = {
      columns: ['Efectivas', 'Total Órdenes', '% Efectividad', 'Tipo de Brigada'],
      rows: tiposArr.map(t => {
        let tEfec = 0; let tFall = 0; let tPerd = 0;
        Object.values(byTypeDay[t]).forEach(dayData => {
          tEfec += dayData.efec;
          tFall += dayData.fall;
          tPerd += dayData.perd;
        });
        const tTotal = tEfec + tFall + tPerd;
        const tPct = tTotal > 0 ? (tEfec / tTotal) : 0;
        return [fmtN(tEfec), fmtN(tTotal), fmtPct(tPct), t];
      })
    };

    // Gráfico 4: Evolutivo Mensual por Tipo de Brigada (Dinámico, reacciona a filtros globales)
    const tecBaseParaEvolutivo = filtMes(raw.mes || [], F);
    const evMeses = Array.from(new Set(tecBaseParaEvolutivo.map(e => e.Mes_YM).filter(Boolean) as string[])).sort();
    const evTipos = Array.from(new Set(tecBaseParaEvolutivo.map(e => e.Tipo_Brigada_Mes).filter(Boolean) as string[])).sort();

    const evValMap = new Map<string, number>();
    tecBaseParaEvolutivo.forEach(e => {
      if (!e.Mes_YM || !e.Tipo_Brigada_Mes) return;
      const key = `${e.Mes_YM}|${e.Tipo_Brigada_Mes}`;
      evValMap.set(key, (evValMap.get(key) || 0) + (Number(e.Ordenes) || 0));
    });

    // Total de ordenes por (mes, tipo) — acceso rapido.
    const evVal = (m: string, t: string) => evValMap.get(`${m}|${t}`) || 0;
    // El grafico principal muestra la TENDENCIA de las 5 brigadas de mayor volumen
    // (lineas); el resto se resume en la nota "las N restantes suman X% del volumen".
    const evTotales = evTipos
      .map(t => ({ t, total: evMeses.reduce((s, m) => s + evVal(m, t), 0) }))
      .sort((a, b) => b.total - a.total);

    // Paleta por rango de brigada, consistente entre el grafico colapsado, el
    // completo y las tablas: extiende la paleta de series con tonos extra para que
    // cada tipo tenga color propio cuando se muestran TODAS las brigadas.
    const evPal = ['#38764C', '#78BE20', '#2f6f8f', '#B5BD00', '#c2410c'];
    // Color FIJO por brigada (COLOR_BRIGADA, por nombre homologado); si no está,
    // cae a la paleta de reserva por posición y por último a gris.
    const evColor = (t: string, idx: number) => COLOR_BRIGADA[String(t).trim().toUpperCase()] || evPal[idx % evPal.length] || '#97999B';

    const evTop = evTotales.slice(0, 5).map((x, idx) => ({ ...x, color: evColor(x.t, idx) }));
    const evGran = evTotales.reduce((s, x) => s + x.total, 0);
    const evRestN = Math.max(0, evTotales.length - evTop.length);
    const evRestPct = evGran ? Math.round(evTotales.slice(5).reduce((s, x) => s + x.total, 0) / evGran * 100) : 0;
    const evSubtitle = `Las ${evRestN} restantes suman ${evRestPct}% del volumen`;
    // La vista COMPLETA (modal) muestra TODAS las brigadas, no solo el top-5.
    const evSubtitleFull = `Tendencia de todas las brigadas (${evTotales.length} tipos) · clic en una brigada para filtrar`;

    const evLineChart = (tipos: { t: string, color?: string }[]) => {
      const isFiltered = (t: string) => filtroEvolutivo ? t === filtroEvolutivo : true;
      const opacity = (t: string) => isFiltered(t) ? '' : '33';
      const width = (t: string) => (filtroEvolutivo && t === filtroEvolutivo) ? 3.2 : 2.4;

      const maxY = Math.max(...tipos.flatMap(x => evMeses.map(m => evVal(m, x.t))));
      const mag = Math.pow(10, Math.floor(Math.log10(maxY || 1)));
      const normalized = maxY / mag;
      let factor = normalized <= 1.5 ? 1.5 : normalized <= 5 ? 5 : 10; 
      const roundedMax = factor * mag;

      const customTicksPlugin = {
        id: 'customTicksPlugin',
        beforeUpdate(chart: any) {
          const h = chart.chartArea ? chart.chartArea.bottom - chart.chartArea.top : chart.height;
          chart.options.scales.y.ticks.maxTicksLimit = h < 90 ? 2 : h < 150 ? 3 : 5;
        }
      };

      return {
        type: 'line',
        data: {
          labels: evMeses.map(m => {
             const mDate = new Date(m + '-02');
             return mDate.toLocaleString('es', { month: 'short' }).toLowerCase();
          }),
          datasets: tipos.map((x, idx) => {
            const color = x.color || evColor(x.t, idx);
            return {
              label: x.t,
              data: evMeses.map(m => evVal(m, x.t)),
              borderColor: color + opacity(x.t),
              borderWidth: width(x.t),
              borderJoinStyle: 'round',
              borderCapStyle: 'round',
              pointStyle: 'circle',
              pointRadius: 3.4,
              pointBackgroundColor: '#fff',
              pointBorderWidth: 2,
              pointBorderColor: color + opacity(x.t),
              tension: 0,
              fill: false,
            };
          })
        },
        plugins: [customTicksPlugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'nearest', intersect: true },
          onClick: (event: any, elements: any, chart: any) => {
            if (elements.length > 0) {
              const datasetIndex = elements[0].datasetIndex;
              const label = chart.data.datasets[datasetIndex].label;
              setFiltroEvolutivo(prev => prev === label ? null : label);
            }
          },
          plugins: { 
            legend: { display: false },
            tooltip: { enabled: false }
          },
          scales: {
            y: {
              min: 0,
              max: roundedMax,
              position: 'left',
              grid: {
                color: '#EDF0E7',
                lineWidth: 1,
                drawBorder: false,
              },
              border: { display: false },
              ticks: {
                maxTicksLimit: 5,
                align: 'right',
                callback: (v: number) => v.toLocaleString('es-CO'),
              }
            },
            x: {
              grid: { display: false, drawBorder: false },
              border: { display: false },
              ticks: {
                font: { size: 11.5, weight: 600 },
                color: '#5c5f5a',
              }
            }
          }
        }
      };
    };
    const chartEvolutivo = evLineChart(evTop);          // colapsado: top-5
    const chartEvolutivoFull = evLineChart(evTotales);  // modal (vista completa): todas

      // Detalle por brigada (vista "Ambos"): total, participacion (%) y variacion
      // mes-a-mes (ultimo vs anterior). El grafico muestra el top-5; la tabla, todas.
      const evLast = evMeses[evMeses.length - 1];
      const evPrev = evMeses[evMeses.length - 2];
      const brigadaDetalle = evTotales.map((x, idx) => {
        const lastV = evLast ? evVal(evLast, x.t) : 0;
        const prevV = evPrev ? evVal(evPrev, x.t) : 0;
        return {
          brigada: x.t,
          total: x.total,
          partPct: evGran ? Math.round(x.total / evGran * 100) : 0,
          varPct: prevV > 0 ? Math.round((lastV - prevV) / prevV * 100) : null,
          color: evColor(x.t, idx),
        };
      });
      const mesAbbr = (m: string) => { const n = Number(String(m).split('-').pop()) || 0; return ['—', 'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'][n] || String(m); };
      const varHeader = (evLast && evPrev) ? `${mesAbbr(evLast)}/${mesAbbr(evPrev)}` : 'VAR';

      // Detallado por tecnico (vista "Tabla"): tecnicos del mes actual. Alerta =
      // Eficacia por debajo del umbral (65%). PROM./DIA = ejecutadas / dias laborados.
      const evTecMes = selWin.length ? selWin[selWin.length - 1] : (mesList.length ? mesList[0] : null);
      const colorPorBrigada = new Map<string, string>(evTotales.map((x, idx) => [x.t, evColor(x.t, idx)]));
      const tecnicoDetalle = (evTecMes ? filtMes(raw.mes || [], F).filter(e => e.Mes_YM === evTecMes) : filtMes(raw.mes || [], F)).map(t => {
        const ejec = Number(t.Visitas) || 0;
        const dias = Number(t.Dias_Laborados) || 0;
        const efi = Number(t.Eficacia) || 0;
        return {
          tipoBrigada: t.Tipo_Brigada_Mes || '—',
          tecnico: t.Tecnico || 'Desconocido',
          color: colorPorBrigada.get(t.Tipo_Brigada_Mes || '') || MUT,
          cuentas: Number(t.Cantidad_NIC) || 0,
          ejecutadas: ejec,
          suspension: Number(t.Total_Suspension) || 0,
          mantiene: Number(t.Total_Mantiene_Susp) || 0,
          reconexion: Number(t.Total_Reconexion) || 0,
          pagos: Number(t.Total_Pagos) || 0,
          imposibilidades: Number(t.Total_Imposibilidades) || 0,
          resistencias: Number(t.Total_Resistencia) || 0,
          diasLab: dias,
          promDia: dias > 0 ? ejec / dias : 0,
          eficacia: efi,
          alerta: efi < 0.65,
        };
      }).sort((a, b) => b.ejecutadas - a.ejecutadas);

      const tableDataEvolutivo = (() => {
        const currentMes = selWin.length ? selWin[selWin.length - 1] : (mesList.length ? mesList[0] : null);
        const tecBase = filtMes(raw.mes || [], F);
        const tecCurrent = currentMes ? tecBase.filter(e => e.Mes_YM === currentMes) : tecBase;
        const filteredCurrent = filtroEvolutivo ? tecCurrent.filter(e => e.Tipo_Brigada_Mes === filtroEvolutivo) : tecCurrent;

        return {
          columns: ['Tipo de Brigada', 'Técnico', 'Cuentas', 'Total Órdenes Ejecutadas', 'Total Suspensión', 'Total Se Mantiene Suspensión', 'Total Reconexión', 'Total Pagos', 'Total Imposibilidades', 'Total Resistencias', 'Días Laborados en Total', 'Eficacia'],
          categoryIndex: 0,
          rows: filteredCurrent.map(t => [
            t.Tipo_Brigada_Mes,
            t.Tecnico || 'Desconocido',
            fmtN(t.Cantidad_NIC),
            fmtN(t.Visitas),
            fmtN(t.Total_Suspension),
            fmtN(t.Total_Mantiene_Susp),
            fmtN(t.Total_Reconexion),
            fmtN(t.Total_Pagos),
            fmtN(t.Total_Imposibilidades),
            fmtN(t.Total_Resistencia),
            fmtN(t.Dias_Laborados),
            fmtPct(Number(t.Eficacia) || 0)
          ])
        };
      })();

    // Estado global + alertas accionables
    const alertas: string[] = [];
    if (disponibilidad < 0.40) alertas.push(`Disponibilidad de brigadas en ${fmtPct(disponibilidad)}`);
    if (efectividad < 0.65) alertas.push(`Efectividad en ${fmtPct(efectividad)}`);
    if (perdRate > 0.08) alertas.push(`Órdenes perdidas en ${fmtPct(perdRate)} del total`);
    const critico = disponibilidad < 0.30 || efectividad < 0.55 || perdRate > 0.15;
    const nivel: 'ok' | 'amber' | 'red' = alertas.length === 0 ? 'ok' : critico ? 'red' : 'amber';

    const winLbl = fmtRangoMeses(selWin);

    return {
      efect, fallidas, perdidas, visitas, asignado, brigadasDisp, brigadasDispPool, brigadasOper, diasEjec, diasHabiles,
      cEfect, cDias, cAsignEjec, disponibilidad, efectividad, perdRate, totOrd, alertas, nivel,
      periodoLabel: winLbl, dEfec, dFall, dOper, dDisp, modoDelta, narrativa,
      chartOrd, chartBrig, chartTipos, chartEvolutivo, evSubtitle, chartEvolutivoFull, evSubtitleFull,
      brigadaDetalle, varHeader, tecnicoDetalle,
      tableDataOrd, tableDataBrig, tableDataTipos, tableDataEvolutivo,
      evolutivo: raw.evolutivo, evTop
    };
  }, [raw, filters, mesList, filtroEvolutivo]);

  if (loading) return <div className="loading-wrap"><div className="spinner" /><span>Cargando…</span></div>;
  if (error) return <div className="status err">{error}</div>;
  if (!d) return null;

  const kLbl: React.CSSProperties = { fontSize: 11, color: MUT, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 600 };
  const kVal: React.CSSProperties = { fontSize: 30, fontWeight: 700, color: INK, marginTop: 6, fontVariantNumeric: 'tabular-nums', lineHeight: 1 };
  const kSub: React.CSSProperties = { fontSize: 11, color: MUT, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 };
  
  const TrendIcon = ({ val, invert }: { val: number | null, invert?: boolean }) => {
    if (val === null) return null;
    if (Math.abs(val) < 0.01) return <span style={{ color: MUT }}>→</span>;
    const isUp = val > 0;
    const isGood = invert ? !isUp : isUp;
    return <span style={{ color: isGood ? OK : ERR, fontWeight: 700 }}>{isUp ? '↑' : '↓'} {(Math.abs(val) * 100).toFixed(1)}%</span>;
  };

  const kpi = (label: string, value: string, sub?: string, accent?: string, delta?: number | null, invertDelta?: boolean) => (
    <div style={card}>
      <div style={kLbl}>{label}</div>
      <div style={{ ...kVal, color: accent || INK }}>{value}</div>
      {(sub || delta !== undefined) && (
        <div style={kSub}>
          {delta !== undefined && <TrendIcon val={delta} invert={invertDelta} />}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </div>
  );

  // ---- Cumplimiento (Meta vs Real con barra) ----
  const cumplCard = (label: string, meta: number, real: number, fmt: (v: number) => string) => {
    const pct = meta ? (real / meta) * 100 : 0;
    const color = sem(pct, 90, 70);
    return (
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={kLbl}>{label}</span>
          <span style={{ fontSize: 20, fontWeight: 700, color }}>{pct.toFixed(0)}%</span>
        </div>
        <div style={{ margin: '10px 0 8px' }}><ProgBar pct={pct} color={color} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: MUT }}>
          <span>Real <b style={{ color: INK }}>{fmt(real)}</b></span>
          <span>Meta <b style={{ color: INK }}>{fmt(meta)}</b></span>
        </div>
      </div>
    );
  };

  // ---- VISTA PRINCIPAL ----
  const nivelCfg = {
    ok: { c: OK, t: 'La operación está en línea', s: 'Sin desviaciones que requieran atención inmediata.' },
    amber: { c: WARN, t: 'Requiere atención', s: 'Hay indicadores fuera de rango:' },
    red: { c: ERR, t: 'Desviación crítica', s: 'Indicadores en nivel crítico:' },
  }[d.nivel];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '4px 2px 12px' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, color: INK }}>OPERATIVO</div>
          <div style={{ fontSize: 12.5, color: MUT, marginTop: 2 }}>¿Cómo está la operación hoy y qué requiere atención?</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setModalOpen(true)}
            style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: theme === 'dark' ? '#3b82f6' : '#1976D2', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: `0 1px 3px rgba(25,118,210,${theme === 'dark' ? 0.1 : 0.3})` }}>
            Detalle de Brigadas
          </button>
          <a href="https://app.powerbi.com/view?r=eyJrIjoiNmRkNzk5ZDQtZTI3OS00MzczLWE1OTAtYmE3MGIxZGQxZGJkIiwidCI6IjAwOGU1MWNkLTNiNzItNDA0NS05MjUwLWI0MzY4MzM0NzBkNyJ9" target="_blank" rel="noopener noreferrer"
            style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: TEAL, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            Ver Detalle Operativo (Norte-Centro) ↗
          </a>
          <a href="https://app.powerbi.com/view?r=eyJrIjoiMTU3ZjE4ZmItMWZjMy00ZjBkLTlkNGMtODQ1YTMwMmZlMDQ2IiwidCI6IjAwOGU1MWNkLTNiNzItNDA0NS05MjUwLWI0MzY4MzM0NzBkNyJ9" target="_blank" rel="noopener noreferrer"
            style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: theme === 'dark' ? '#14b8a6' : '#0f766e', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            Ver Detalle Operativo (Sur) ↗
          </a>
        </div>
      </div>

      <div style={{ ...card, borderLeft: `4px solid ${nivelCfg.c}`, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: nivelCfg.c, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: nivelCfg.c }}>{nivelCfg.t}</div>
          <div style={{ fontSize: 12.5, color: MUT, marginTop: 2 }}>
            {nivelCfg.s} {d.alertas.length > 0 && <b style={{ color: INK }}>{d.alertas.join(' · ')}</b>}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: MUT }}>Periodo · <b style={{ color: INK, fontWeight: 600 }}>{d.periodoLabel}</b></div>
      </div>

      {/* Narrativa Automática */}
      <div style={{ background: 'var(--hover-bg)', padding: '14px 18px', borderRadius: 10, marginTop: 12, fontSize: 13, color: 'var(--text)', borderLeft: '3px solid var(--border)', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--text-title)' }}>⚡ Resumen Diario:</strong> {d.narrativa}
      </div>

      {/* 1 · Resumen Operativo */}
      <div style={secH(TEAL)}>
        <span style={dot(TEAL)} /> Resumen operativo
        <span style={{ fontSize: 10, fontWeight: 600, color: MUT, textTransform: 'none', letterSpacing: 0 }}>
          · Δ {d.modoDelta === 'mes' ? 'vs mes anterior' : 'vs día anterior'}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 12 }}>
        {kpi('Brigadas operativas', fmtN(d.brigadasOper), 'promedio activo/día', TEAL, d.dOper, false)}
        {kpi('Pool de disponibles', fmtN(d.brigadasDispPool), 'plantilla teórica', INDIGO, d.dDisp, false)}
        {kpi('Total asignado', fmtN(d.asignado), 'efectivas + fallidas + perdidas')}
        {kpi('Días ejecutados', fmtN(d.diasEjec), `de ${d.diasHabiles} hábiles`)}
        {kpi('Órdenes efectivas', fmtN(d.efect), undefined, OK, d.dEfec, false)}
        {kpi('Órdenes fallidas', fmtN(d.fallidas), undefined, WARN, d.dFall, true)}
        {kpi('Órdenes perdidas', fmtN(d.perdidas), undefined, ERR)}
      </div>

      {/* Evolutivos Diarios (NUEVO) */}
      <div style={secH(TEAL)}><span style={dot(TEAL)} /> Seguimiento Diario de Operación</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 12 }}>
        <ChartCard id="op-ord" title="Evolutivo Diario de Órdenes" config={d.chartOrd as never} height="short" hasDetail detailTableData={d.tableDataOrd as any} />
        <ChartCard id="op-brig" title="Evolutivo Diario de Brigadas" config={d.chartBrig as never} height="short" hasDetail detailTableData={d.tableDataBrig as any} />
        <ChartCard id="op-tipos" title="Efectivas por Tipo de Brigada" config={d.chartTipos as never} height="short" hasDetail detailTableData={d.tableDataTipos as any} />
      </div>

      {/* Evolutivo Mensual por Tipo de Brigada */}
      <div style={secH(INDIGO)}><span style={dot(INDIGO)} /> Evolutivo Mensual por Tipo de Brigada</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', marginBottom: 20 }}>
        <ChartCard
          id="op-evolutivo"
          title="Órdenes Mensuales por Tipo de Brigada"
          subtitle={d.evSubtitle}
          config={d.chartEvolutivo as never}
          height="normal"
          hasDetail
          onExpand={() => setBrigadaModalOpen(true)}
          detailTableData={d.tableDataEvolutivo as any}
          headerExtra={
            <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
              {filtroEvolutivo && (
                <button onClick={() => setFiltroEvolutivo(null)} style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6, background: '#EDF0E7', color: '#3A3A3A', border: '1px solid #E0E0E0', cursor: 'pointer', fontWeight: 600 }}>Quitar filtro</button>
              )}
              <button onClick={() => setMapOpen(true)} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, background: 'var(--brand-primary)', color: 'var(--brand-grad-text)', border: 'none', cursor: 'pointer', marginLeft: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>📍 Ver en Mapa</button>
            </div>
          }
          customLayout={(canvas) => (
            <div style={{ display: 'flex', flexDirection: 'row', gap: '20px', minHeight: '320px' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                  {canvas}
                </div>
                {/* Leyenda Chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '12px' }}>
                  {d.evTop.map((x: any) => {
                     const isFiltered = !filtroEvolutivo || filtroEvolutivo === x.t;
                     return (
                       <div key={x.t} onClick={() => setFiltroEvolutivo(prev => prev === x.t ? null : x.t)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: '#F4F6EF', borderRadius: '8px', cursor: 'pointer', opacity: isFiltered ? 1 : 0.4 }}>
                         <span style={{ width: 14, height: 3, background: x.color, display: 'inline-block', borderRadius: 2 }} />
                         <span style={{ fontSize: 11.5, color: '#3A3A3A', fontWeight: 500 }}>{x.t}</span>
                       </div>
                     );
                  })}
                </div>
              </div>
              {/* Panel Lateral Ranking */}
              <div style={{ width: '280px', borderLeft: '1px solid #EDF0E7', paddingLeft: '20px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#3A3A3A', marginBottom: 16 }}>Detalle por brigada</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>
                  {d.brigadaDetalle.slice(0, 10).map((b: any) => {
                    const isFiltered = !filtroEvolutivo || filtroEvolutivo === b.brigada;
                    return (
                      <div key={b.brigada} onClick={() => setFiltroEvolutivo(prev => prev === b.brigada ? null : b.brigada)} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', opacity: isFiltered ? 1 : 0.4 }}>
                        <span style={{ width: 4, height: '100%', minHeight: '24px', background: b.color, borderRadius: 2 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#3A3A3A' }}>{b.brigada}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6E7174', marginTop: 2 }}>
                            <span>{fmtN(b.total)} ({b.partPct}%)</span>
                            {b.varPct !== null && (
                              <span style={{ color: b.varPct > 0 ? '#3d7a24' : b.varPct < 0 ? '#a5281c' : '#97999B', fontWeight: 600 }}>
                                {b.varPct > 0 ? '+' : ''}{b.varPct}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        />
      </div>

      {/* 2 · Cumplimiento */}
      <div style={secH(TEAL)}><span style={dot(TEAL)} /> Cumplimiento · Meta vs Real</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {cumplCard('Órdenes efectivas', d.asignado, d.efect, fmtN)}
        {cumplCard('Días ejecutados', d.diasHabiles, d.diasEjec, fmtN)}
        {cumplCard('Asignado vs ejecutado', d.asignado, d.visitas, fmtN)}
      </div>

      {/* 3 · Estado de la Operación */}
      <div style={secH(INDIGO)}><span style={dot(INDIGO)} /> Estado de la operación</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <div style={card}>
          <div style={kLbl}>Pool de Disponibles</div>
          <div style={{ ...kVal, color: INDIGO }}>{fmtN(d.brigadasDispPool)}</div>
          <div style={kSub}>Plantilla teórica del periodo</div>
        </div>

        <div style={card}>
          <div style={kLbl}>Total Operativas</div>
          <div style={{ ...kVal, color: TEAL }}>{fmtN(d.brigadasOper)}</div>
          <div style={kSub}>Promedio que trabajó por día</div>
        </div>

        <div style={card}>
          <div style={kLbl}>Distribución de órdenes</div>
          <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', margin: '12px 0 10px' }}>
            <span style={{ width: `${(d.efect / d.totOrd) * 100}%`, background: OK }} />
            <span style={{ width: `${(d.fallidas / d.totOrd) * 100}%`, background: WARN }} />
            <span style={{ width: `${(d.perdidas / d.totOrd) * 100}%`, background: ERR }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12, color: MUT }}>
            <span><b style={{ color: OK }}>●</b> Efectivas {fmtN(d.efect)} ({fmtPct(d.efect / d.totOrd)})</span>
            <span><b style={{ color: WARN }}>●</b> Fallidas {fmtN(d.fallidas)} ({fmtPct(d.fallidas / d.totOrd)})</span>
            <span><b style={{ color: ERR }}>●</b> Perdidas {fmtN(d.perdidas)} ({fmtPct(d.perdidas / d.totOrd)})</span>
          </div>
        </div>

        <div style={card}>
          <div style={kLbl}>Asignado vs ejecutado</div>
          <div style={{ ...kVal, color: sem(d.cAsignEjec * 100, 80, 60) }}>{fmtPct(d.cAsignEjec)}</div>
          <div style={{ margin: '10px 0 6px' }}><ProgBar pct={d.cAsignEjec * 100} color={sem(d.cAsignEjec * 100, 80, 60)} /></div>
          <div style={kSub}>{fmtN(d.visitas)} ejecutadas de {fmtN(d.asignado)} asignadas</div>
        </div>
      </div>
      
      <DisponibilidadSection />

      {modalOpen && <BrigadasDetalleModal onClose={() => setModalOpen(false)} />}
      {brigadaModalOpen && d && (
        <BrigadaEvolutivoModal
          open={brigadaModalOpen}
          onClose={() => setBrigadaModalOpen(false)}
          title="Órdenes Mensuales por Tipo de Brigada"
          subtitle={d.evSubtitleFull}
          config={d.chartEvolutivoFull as never}
          brigadaDetalle={d.brigadaDetalle as never}
          tecnicoDetalle={d.tecnicoDetalle as never}
          varHeader={d.varHeader}
        />
      )}
      {mapOpen && <MapModal onClose={() => setMapOpen(false)} mesesDisponibles={mesList} filtrosBase={{
        // El mapa recibe todos los meses seleccionados para aplicar la lógica híbrida:
        // si son > 3 meses, se contrae a puntos de barrio, si son <= 3 meses, puntos individuales.
        mes: filters.mes.length ? filters.mes.join(',') : 'ALL',
        zona: filters.zona,
        proy: filters.proy,
        proceso: filters.proceso,
      }} />}
    </>
  );
}