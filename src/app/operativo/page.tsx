'use client';

import { useMemo, useState, useEffect } from 'react';
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
import BrigadaTiposModal from './BrigadaTiposModal';
import { ButtonPrimary, ButtonGhost, SegmentedControl,ButtonMenuOperativo } from '../components/Buttons';
import { getMetaDiariaEfectivas, getMetaHorariaEfectivas, getMinutosTrabajoHora } from '../components/utils/metasBrigadas';


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
  'BRIGADA TIPO PESADA': '#38764C',   // verde oscuro
  'GESTOR INTEGRAL MULTI': '#78BE20', // verde lima
  'BRIGADA LIVIANA': '#2E6FB5',       // azul
  'BRIGADA TIPO LIVIANA': '#2E6FB5',  // azul
  'PESADA MT-AT': '#B5BD00',          // oliva
  'BRIGADA PESADA/ MT AT': '#B5BD00', // oliva
  'BRIGADA CANASTA': '#D64A2A',       // rojo-naranja
  'BRIGADA TIPO CANASTA': '#D64A2A',  // rojo-naranja
  'BRIGADA MINICANASTA': '#7E56C2',   // morado
  'BRIGADA TIPO MINICANASTA': '#7E56C2', // morado
  '(D) BRIGADA PESADA': '#4FA3E0',    // azul claro
  '(D) BRIGADA TIPO PESADA': '#4FA3E0',// azul claro
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

const bandsPluginBands = {
  id: 'bandsPluginBands',
  beforeDatasetsDraw(chart: any, args: any, options: any) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales || !scales.x) return;
    const { top, bottom, left, right } = chartArea;
    const { x } = scales;
    const fecha = options?.fecha || '';
    const zona = options?.zona || '';
    const esHora = options?.esHora;

    const ticks = x.ticks || [];
    ticks.forEach((tick: any, index: number) => {
      const label = x.getLabelForValue ? x.getLabelForValue(tick.value) : tick.label;
      if (typeof label !== 'string') return;
      
      let isNonWorking = false;
      let text = '';
      if (esHora) {
        isNonWorking = getMinutosTrabajoHora(label, fecha, zona) === 0;
        text = label === '12:00' ? 'Almuerzo' : 'Fuera de jornada';
      } else {
        const dateStr = chart.data?.labels?.[tick.value] || label;
        const fullDateStr = typeof dateStr === 'string' && dateStr.length === 2 ? `${fecha.slice(0, 7)}-${dateStr}` : String(dateStr);
        const parts = fullDateStr.split('-').map(Number);
        if (parts.length === 3) {
          const dt = new Date(parts[0], parts[1] - 1, parts[2]);
          isNonWorking = dt.getDay() === 0 || esFestivo(dt);
          text = dt.getDay() === 0 ? 'Domingo' : 'Festivo';
        }
      }

      if (isNonWorking) {
        const xPos = x.getPixelForTick(index);
        let nextPos = index < ticks.length - 1 ? x.getPixelForTick(index + 1) : null;
        let prevPos = index > 0 ? x.getPixelForTick(index - 1) : null;
        let halfWidth = 14;
        if (nextPos !== null) halfWidth = Math.abs(nextPos - xPos) / 2;
        else if (prevPos !== null) halfWidth = Math.abs(xPos - prevPos) / 2;

        const slotLeft = Math.max(left, xPos - halfWidth);
        const slotRight = Math.min(right, xPos + halfWidth);
        const slotWidth = slotRight - slotLeft;
        const slotHeight = bottom - top;

        if (slotWidth <= 0) return;

        ctx.save();

        ctx.fillStyle = '#F4F6EF';
        ctx.fillRect(slotLeft, top, slotWidth, slotHeight);

        ctx.save();
        ctx.beginPath();
        ctx.rect(slotLeft, top, slotWidth, slotHeight);
        ctx.clip();

        ctx.strokeStyle = '#E2E6DC';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const step = 8;
        for (let xLine = slotLeft - slotHeight; xLine < slotRight + slotHeight; xLine += step) {
          ctx.moveTo(xLine, bottom);
          ctx.lineTo(xLine + slotHeight, top);
        }
        ctx.stroke();
        ctx.restore();

        if (text) {
          ctx.font = '600 10px sans-serif';
          ctx.fillStyle = '#8C9382';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          ctx.save();
          ctx.translate(xPos, top + slotHeight / 2);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(text, 0, 0);
          ctx.restore();
        }

        ctx.restore();
      }
    });
  }
};

export default function OperativoPage() {
  const { raw, filters, setFilters, mesList, fechaList, loading, error, refresh, syncing } = useDashboard();
  const { colors, theme } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [brigadaModalOpen, setBrigadaModalOpen] = useState(false);
  const [brigTiposOpen, setBrigTiposOpen] = useState(false);
  const [filtroEvolutivo, setFiltroEvolutivo] = useState<string | null>(null);
  const [vistaEvolutivo, setVistaEvolutivo] = useState<'mes' | 'dia' | 'hora'>('mes');

  // Al recargar o ingresar a la página operativa, asegurar que el filtro por defecto sea el Mes en Ejecución
  useEffect(() => {
    if (mesList && mesList.length > 0) {
      const mesEjecucion = mesList[mesList.length - 1];
      if (!filters.mes || filters.mes.length === 0) {
        setFilters({ mes: [mesEjecucion] });
      }
    }
  }, [mesList, filters.mes, setFilters]);

  useEffect(() => {
    if (filters.fecha && filters.fecha !== 'ALL') {
      setVistaEvolutivo('hora');
    } else {
      const selectedCount = filters.mes ? filters.mes.length : 0;
      if (selectedCount === 1) {
        setVistaEvolutivo('dia');
      } else {
        setVistaEvolutivo('mes');
      }
    }
  }, [filters.mes, filters.fecha]);

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
    const F = filters;
    const zonaOrProy = F.zona !== 'ALL' ? F.zona : F.proy;
    const HOMOLOGACION_BRIGADA: Record<string, string> = {
      'BRIGADA PESADA': 'SCR PESADA',
      'BRIGADA TIPO PESADA': 'SCR PESADA',
      'PESADA': 'SCR PESADA',
      'BRIGADA LIVIANA': 'SCR LIVIANA',
      'BRIGADA TIPO LIVIANA': 'SCR LIVIANA',
      'LIVIANA': 'SCR LIVIANA',
      'GESTOR INTEGRAL MULTI': 'SCR MULTIFAMILIAR',
      'GESTOR INTEGRAL': 'SCR MULTIFAMILIAR',
      'GESTOR MULTI': 'SCR MULTIFAMILIAR',
      'PESADA MT-AT': 'PESADA MT-AT',
      'BRIGADA PESADA/ MT AT': 'PESADA MT-AT',
      'BRIGADA PESADA MT-AT': 'PESADA MT-AT',
      'PESADA MT': 'PESADA MT-AT',
      'PESADA/ MT AT': 'PESADA MT-AT',
      'BRIGADA MINICANASTA': 'SCR MINI CANASTA',
      'BRIGADA TIPO MINICANASTA': 'SCR MINI CANASTA',
      'BRIGADA CANASTA': 'CANASTA',
      'BRIGADA TIPO CANASTA': 'CANASTA',
      'SCR CANASTA': 'CANASTA',
      '(D) BRIGADA PESADA': 'SCR PESADA DISPONIBILIDAD',
      '(D) BRIGADA TIPO PESADA': 'SCR PESADA DISPONIBILIDAD',
      'PESADA DISPONIBLE': 'SCR PESADA DISPONIBILIDAD',
    };

    const getBrigadaTipo = (r: any): string => {
      if (!r) return 'Sin tipo';
      const val = String(r.Tipo_Brigada_Operaciones || r.Tipo_Brigada_Mes || r.Tipo_Cuadrilla || '').trim();
      if (!val) return 'Sin tipo';
      return HOMOLOGACION_BRIGADA[val.toUpperCase()] || val;
    };
    const rawF = filtRaw(raw.raw, F);

    const efect = rawF.reduce((s, r) => s + n(r.Efectivas), 0);
    const fallidas = rawF.reduce((s, r) => s + n(r.Fallida_Con_Pago), 0);
    const perdidas = rawF.reduce((s, r) => s + n(r.Fallida_Sin_Pago) + n(r.Perdidas), 0);
    const visitas = rawF.reduce((s, r) => s + n(r.Visitas), 0);
    const asignado = rawF.reduce((s, r) => s + n(r.Asignacion), 0);
    const brigadasDisp = new Set(rawF.map(r => r.Cedula)).size;

    // Meta Total Oficial de Órdenes según la matriz por tipo de brigada y día
    const brigadaDiasVistas = new Set<string>();
    let metaTotalOrdenes = 0;
    rawF.forEach(r => {
      const day = String(r.Fecha || '');
      const ced = String(r.Cedula || '');
      if (!day || !ced) return;
      const key = `${ced}_${day}`;
      if (!brigadaDiasVistas.has(key)) {
        brigadaDiasVistas.add(key);
        const tipo = getBrigadaTipo(r);
        const zona = String(r._Zona || r.Zona || '');
        metaTotalOrdenes += getMetaDiariaEfectivas(tipo, day, zona);
      }
    });

    const totalAsignadoOrds = efect + fallidas + perdidas;
    const pctCumplimientoMeta = metaTotalOrdenes > 0 ? (totalAsignadoOrds / metaTotalOrdenes) * 100 : null;
    const pctEfectivasTotal = totalAsignadoOrds > 0 ? (efect / totalAsignadoOrds) * 100 : null;
    const pctFallidasTotal = totalAsignadoOrds > 0 ? (fallidas / totalAsignadoOrds) * 100 : null;
    const pctPerdidasTotal = totalAsignadoOrds > 0 ? (perdidas / totalAsignadoOrds) * 100 : null;

    // Brigadas que cuentan como "disponibles" (Pool). Definido UNA vez y reutilizado
    // tanto en el mes actual como en el cálculo del mes anterior (deltas mes vs mes).
    const DISPONIBLES_TYPES = [
      'brigada canasta',
      'brigada minicanasta',
      'brigada pesada mt-at',
      'gestor integral multi',
      'pesada disponible',
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

    // Agrupación (Hora / Día) para Evolutivos y Tendencias
    const HORAS_JORNADA = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
    const esHora = vistaEvolutivo === 'hora';

    // Jornada horaria completa (07:00 a 18:00): muestra todas las franjas del día
    // en el eje X, pero sin datos ficticios en horas/días futuros.
    const HORAS_VISIBLES = HORAS_JORNADA;

    const _now = new Date();
    const _hoyStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;
    const _horaActual = _now.getHours();

    const isFuturePeriod = (p: string) => {
      if (esHora) {
        if (filters.fecha === _hoyStr) {
          const hNum = parseInt(p, 10);
          return !isNaN(hNum) && hNum > _horaActual;
        }
        return false;
      }
      if (vistaEvolutivo === 'dia') {
        const curMes = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`;
        const mesSel = (filters.mes && filters.mes.length > 0) ? filters.mes[0] : '';
        if (mesSel === curMes || (!mesSel && _hoyStr.startsWith(curMes))) {
          const pDate = p.split('-').map(Number);
          if (pDate.length === 3 && pDate[0] === _now.getFullYear() && pDate[1] === _now.getMonth() + 1) {
            return pDate[2] > _now.getDate();
          }
        }
        return false;
      }
      return false;
    };

    const getPeriodKey = (r: any, dateStr: string) => {
      if (esHora) {
        const hRaw = r.Hora || r.hora || r.hora_fin || r.hora_inicio || r.Hora_Fin || r.Hora_Inicio || r.fecha_cierre || r.Fecha_Cierre || r.Hora_Ejecucion || r.Fecha_Ejecucion;
        if (hRaw) {
          const str = String(hRaw).trim();
          const match = str.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
          if (match) {
            const hNum = parseInt(match[1], 10);
            const clampedH = Math.max(7, Math.min(18, hNum));
            return `${String(clampedH).padStart(2, '0')}:00`;
          }
        }
        return null;
      }
      return dateStr;
    };

    const byDay: Record<string, { efec: number, fall: number, perd: number, disp: number, oper: number, brigadas: Set<unknown> }> = {};
    const byTypeDay: Record<string, Record<string, { efec: number, vis: number, fall: number, perd: number, brigadas: Set<unknown> }>> = {};

    if (esHora) {
      HORAS_VISIBLES.forEach(h => {
        byDay[h] = { efec: 0, fall: 0, perd: 0, disp: 0, oper: 0, brigadas: new Set() };
      });
    }

    rawF.forEach(r => {
      const day = String(r.Fecha || '');
      if (!day) return;
      const t = getBrigadaTipo(r);
      
      const e = n(r.Efectivas);
      const f = n(r.Fallida_Con_Pago);
      const p = n(r.Fallida_Sin_Pago) + n(r.Perdidas);
      const v = n(r.Visitas);

      if (esHora) {
        const explicitH = getPeriodKey(r, day);
        if (explicitH) {
          const bd = (byDay[explicitH] ??= { efec: 0, fall: 0, perd: 0, disp: 0, oper: 0, brigadas: new Set() });
          bd.efec += e; bd.fall += f; bd.perd += p;
          bd.brigadas.add(r.Cedula);

          const btd = (byTypeDay[t] ??= {});
          const td = (btd[explicitH] ??= { efec: 0, vis: 0, fall: 0, perd: 0, brigadas: new Set() });
          td.efec += e; td.vis += v; td.fall += f; td.perd += p;
          td.brigadas.add(r.Cedula);
        } else {
          const currentZona = r._Zona || zonaOrProy;
          const workingHours = HORAS_VISIBLES.filter(h => getMinutosTrabajoHora(h, day, currentZona) > 0);
          const totalMin = workingHours.reduce((sum, h) => sum + getMinutosTrabajoHora(h, day, currentZona), 0);

          if (workingHours.length > 0 && totalMin > 0) {
            workingHours.forEach(h => {
              const weight = getMinutosTrabajoHora(h, day, currentZona) / totalMin;
              const hE = e * weight;
              const hF = f * weight;
              const hP = p * weight;
              const hV = v * weight;

              const bd = (byDay[h] ??= { efec: 0, fall: 0, perd: 0, disp: 0, oper: 0, brigadas: new Set() });
              bd.efec += hE; bd.fall += hF; bd.perd += hP;
              if (hE > 0 || hF > 0 || hP > 0 || hV > 0) {
                bd.brigadas.add(r.Cedula);
              }

              const btd = (byTypeDay[t] ??= {});
              const td = (btd[h] ??= { efec: 0, vis: 0, fall: 0, perd: 0, brigadas: new Set() });
              td.efec += hE; td.vis += hV; td.fall += hF; td.perd += hP;
              if (hE > 0 || hF > 0 || hP > 0 || hV > 0) {
                td.brigadas.add(r.Cedula);
              }
            });
          } else {
            const fallbackH = '07:00';
            const bd = (byDay[fallbackH] ??= { efec: 0, fall: 0, perd: 0, disp: 0, oper: 0, brigadas: new Set() });
            bd.efec += e; bd.fall += f; bd.perd += p;
            bd.brigadas.add(r.Cedula);

            const btd = (byTypeDay[t] ??= {});
            const td = (btd[fallbackH] ??= { efec: 0, vis: 0, fall: 0, perd: 0, brigadas: new Set() });
            td.efec += e; td.vis += v; td.fall += f; td.perd += p;
            td.brigadas.add(r.Cedula);
          }
        }
      } else {
        const period = day;
        const bd = (byDay[period] ??= { efec: 0, fall: 0, perd: 0, disp: 0, oper: 0, brigadas: new Set() });
        bd.efec += e; bd.fall += f; bd.perd += p;
        bd.brigadas.add(r.Cedula);

        const btd = (byTypeDay[t] ??= {});
        const td = (btd[period] ??= { efec: 0, vis: 0, fall: 0, perd: 0, brigadas: new Set() });
        td.efec += e; td.vis += v; td.fall += f; td.perd += p;
        td.brigadas.add(r.Cedula);
      }
    });

    const dias = Object.keys(byDay).sort();
    const diasEjec = esHora ? 1 : dias.length;

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
    // Agrupación Mensual general para las gráficas dinámicas
    const byTypeMonth: Record<string, Record<string, number>> = {};
    const _meses = new Set<string>();
    rawF.forEach(r => {
      const day = String(r.Fecha || '');
      if (!day) return;
      const month = day.substring(0, 7);
      _meses.add(month);
      const t = getBrigadaTipo(r);
      const btm = (byTypeMonth[t] ??= {});
      btm[month] = (btm[month] || 0) + n(r.Efectivas);
    });
    const mesesArr = Array.from(_meses).sort();

    // Gráfico 1: Evolutivo Diario de Órdenes con Meta Diaria
    const techDaysMap = new Map<string, { tipo: string; zona: string; day: string; ced: string }>();
    rawF.forEach(r => {
      const day = String(r.Fecha || '');
      const ced = String(r.Cedula || '');
      if (!day || !ced) return;
      const key = `${ced}_${day}`;
      if (!techDaysMap.has(key)) {
        const tipo = getBrigadaTipo(r);
        const zona = String(r._Zona || r.Zona || '');
        techDaysMap.set(key, { tipo, zona, day, ced });
      }
    });

    const metaByDay: Record<string, number> = {};
    if (esHora) {
      dias.forEach(h => {
        let sumH = 0;
        techDaysMap.forEach(({ tipo, zona, day }) => {
          sumH += getMetaHorariaEfectivas(tipo, day, h, zona);
        });
        metaByDay[h] = sumH;
      });
    } else {
      dias.forEach(d => {
        let sumD = 0;
        techDaysMap.forEach(({ tipo, zona, day }) => {
          if (day === d) sumD += getMetaDiariaEfectivas(tipo, day, zona);
        });
        metaByDay[d] = sumD;
      });
    }

    // Métricas específicas para vista horario o diaria
    let picoLabel = '—';
    let cumpMetaVal = 0;
    let bajoMetaCount = 0;
    let maxActivasVal = 0;
    let ocupacionPicoVal = 0;

    const listPeriodos = esHora ? HORAS_VISIBLES : dias;
    let maxEfecP = -1;
    let sumEfecWorking = 0;
    let sumMetaWorking = 0;

    listPeriodos.forEach(p => {
      const bd = byDay[p] || { efec: 0, fall: 0, perd: 0, oper: 0 };
      const totalOrdP = bd.efec + bd.fall + bd.perd;
      if (bd.efec > maxEfecP) {
        maxEfecP = bd.efec;
        picoLabel = esHora ? `${p} (${fmtN(bd.efec)} ord)` : `Día ${p.slice(-2)} (${fmtN(bd.efec)} ord)`;
      }
      if (bd.oper > maxActivasVal) {
        maxActivasVal = bd.oper;
      }

      let isWorking = true;
      if (esHora) {
        isWorking = getMinutosTrabajoHora(p, filters.fecha, zonaOrProy) > 0;
      } else if (vistaEvolutivo === 'dia') {
        const parts = p.split('-').map(Number);
        if (parts.length === 3) {
          const dt = new Date(parts[0], parts[1] - 1, parts[2]);
          isWorking = dt.getDay() !== 0 && !esFestivo(dt);
        }
      }

      if (isWorking) {
        sumEfecWorking += totalOrdP;
        const metaP = metaByDay[p] || 0;
        sumMetaWorking += metaP;
        if (totalOrdP < metaP) {
          bajoMetaCount++;
        }
      }
    });

    cumpMetaVal = sumMetaWorking > 0 ? (sumEfecWorking / sumMetaWorking) * 100 : 0;
    ocupacionPicoVal = brigadasDispPool > 0 ? (maxActivasVal / brigadasDispPool) * 100 : 0;

    // Brigadas digitando por franja/día (únicas con órdenes) -> mejor/peor y brecha media
    // vs contratadas (pool). Extremos SOLO sobre franjas laborables (si no, "Peor" sería el almuerzo).
    const digCount = (p: string) => Object.keys(byTypeDay).reduce((s, t) => s + (byTypeDay[t]?.[p]?.brigadas.size || 0), 0);
    let digMejorLbl = '—', digPeorLbl = '—', digMejorVal = -1, digPeorVal = Infinity, digSumBrecha = 0, digNWork = 0;
    listPeriodos.forEach(p => {
      let isWork = true;
      if (esHora) isWork = getMinutosTrabajoHora(p, filters.fecha, zonaOrProy) > 0;
      else if (vistaEvolutivo === 'dia') {
        const parts = p.split('-').map(Number);
        if (parts.length === 3) { const dt = new Date(parts[0], parts[1] - 1, parts[2]); isWork = dt.getDay() !== 0 && !esFestivo(dt); }
      }
      if (!isWork) return;
      const n = digCount(p);
      const lbl = `${esHora ? p : 'Día ' + p.slice(-2)} · ${n}`;
      if (n > digMejorVal) { digMejorVal = n; digMejorLbl = lbl; }
      if (n < digPeorVal) { digPeorVal = n; digPeorLbl = lbl; }
      digSumBrecha += Math.max(0, brigadasDispPool - n); digNWork++;
    });
    const digBrechaMedia = digNWork > 0 ? digSumBrecha / digNWork : 0;

    const isHoraOrDia = vistaEvolutivo === 'hora' || vistaEvolutivo === 'dia';

    const chartOrdDatasets = (() => {
      if (esHora) {
        let accMeta = 0, accEfec = 0, accFall = 0, accPerd = 0;
        const dataMeta: (number | null)[] = [];
        const dataEfec: (number | null)[] = [];
        const dataFall: (number | null)[] = [];
        const dataPerd: (number | null)[] = [];

        dias.forEach(d => {
          const isFut = isFuturePeriod(d);
          accMeta += metaByDay[d] || 0;
          dataMeta.push(accMeta);

          if (isFut) {
            dataEfec.push(null);
            dataFall.push(null);
            dataPerd.push(null);
          } else {
            accEfec += byDay[d]?.efec || 0;
            accFall += byDay[d]?.fall || 0;
            accPerd += byDay[d]?.perd || 0;
            dataEfec.push(accEfec);
            dataFall.push(accFall);
            dataPerd.push(accPerd);
          }
        });

        return [
          {
            type: 'line' as const,
            label: 'Meta esperada',
            data: dataMeta,
            borderColor: '#F57C00',
            backgroundColor: '#F57C00',
            borderWidth: 2.5,
            borderDash: [5, 4],
            pointStyle: 'rectRot',
            pointRadius: 4,
            pointBackgroundColor: theme === 'dark' ? '#0F2744' : '#fff',
            pointBorderWidth: 2,
            pointBorderColor: '#F57C00',
            fill: false,
            stack: 'metaStack',
          },
          { type: 'bar' as const, label: 'Efectivas', data: dataEfec, backgroundColor: OK, stack: 'barStack', maxBarThickness: 26 },
          { type: 'bar' as const, label: 'Fallidas', data: dataFall, backgroundColor: WARN, stack: 'barStack', maxBarThickness: 26 },
          { type: 'bar' as const, label: 'Perdidas', data: dataPerd, backgroundColor: ERR, stack: 'barStack', maxBarThickness: 26, borderRadius: { topLeft: 3, topRight: 3 } },
        ];
      } else {
        return [
          {
            type: 'line' as const,
            label: 'Meta',
            data: dias.map(d => metaByDay[d] || 0),
            borderColor: '#F57C00',
            backgroundColor: '#F57C00',
            borderWidth: 2.5,
            borderDash: [5, 4],
            pointStyle: 'rectRot',
            pointRadius: 4,
            pointBackgroundColor: theme === 'dark' ? '#0F2744' : '#fff',
            pointBorderWidth: 2,
            pointBorderColor: '#F57C00',
            fill: false,
            stack: 'metaStack',
          },
          { type: 'bar' as const, label: 'Efectivas', data: dias.map(d => isFuturePeriod(d) ? null : byDay[d].efec), backgroundColor: OK, stack: 'barStack', maxBarThickness: isHoraOrDia ? 26 : undefined },
          { type: 'bar' as const, label: 'Fallidas', data: dias.map(d => isFuturePeriod(d) ? null : byDay[d].fall), backgroundColor: WARN, stack: 'barStack', maxBarThickness: isHoraOrDia ? 26 : undefined },
          { type: 'bar' as const, label: 'Perdidas', data: dias.map(d => isFuturePeriod(d) ? null : byDay[d].perd), backgroundColor: ERR, stack: 'barStack', maxBarThickness: isHoraOrDia ? 26 : undefined, borderRadius: isHoraOrDia ? { topLeft: 3, topRight: 3 } : undefined },
        ];
      }
    })();

    const chartOrd = {
      type: 'bar',
      data: {
        labels: dias.map(d => (vistaEvolutivo === 'dia' ? d.slice(-2) : d)),
        datasets: chartOrdDatasets
      },
      plugins: isHoraOrDia ? [bandsPluginBands] : [],
      options: {
        ...baseOpt,
        plugins: {
          legend: { display: !isHoraOrDia, position: 'bottom' as const, labels: { boxWidth: 12, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              title: (items: any[]) => {
                const label = items[0]?.label || '';
                if (!isHoraOrDia) return label;
                const fullKey = esHora ? label : (dias.find(dStr => dStr.endsWith(label)) || label);
                const metaVal = metaByDay[fullKey] || 0;
                const pctMeta = metaTotalOrdenes > 0 ? (metaVal / metaTotalOrdenes) * 100 : 0;
                if (esHora) {
                  const min = getMinutosTrabajoHora(label, filters.fecha, zonaOrProy);
                  const tag = min === 0 ? (label === '12:00' ? ' · Almuerzo' : ' · Fuera de jornada') : '';
                  return `Franja ${label}${tag} (Acumulado día)`;
                } else {
                  return `Día ${label} (Meta: ${fmtN(metaVal)} · ${pctMeta.toFixed(1)}% meta período)`;
                }
              },
              label: (context: any) => {
                const label = context.dataset.label || '';
                const val = context.raw || 0;
                if (isHoraOrDia && metaTotalOrdenes > 0) {
                  const pctMeta = (val / metaTotalOrdenes) * 100;
                  return `${label}: ${fmtN(val)} (${pctMeta.toFixed(1)}% de meta día)`;
                }
                return `${label}: ${fmtN(val)}`;
              }
            }
          },
          ...(isHoraOrDia ? { bandsPluginBands: { fecha: filters.fecha, zona: zonaOrProy, esHora } } : {})
        },
        scales: {
          x: { stacked: true, ticks: { autoSkip: false } },
          y: { stacked: true }
        }
      }
    };

    // Gráfico 2: Evolutivo de Brigadas por Tipo (Dinámico con Meta)
    const tiposArr = Object.keys(byTypeDay);
    const brigMensual: Record<string, Record<string, number>> = {};
    if (vistaEvolutivo === 'mes') {
      tiposArr.forEach(t => {
        brigMensual[t] = {};
        const daysInMonth: Record<string, number> = {};
        const sumInMonth: Record<string, number> = {};
        Object.keys(byTypeDay[t]).forEach(day => {
          const month = day.substring(0, 7);
          daysInMonth[month] = (daysInMonth[month] || 0) + 1;
          sumInMonth[month] = (sumInMonth[month] || 0) + (byTypeDay[t][day]?.brigadas.size || 0);
        });
        Object.keys(sumInMonth).forEach(month => {
          brigMensual[t][month] = Math.round(sumInMonth[month] / daysInMonth[month]);
        });
      });
    }

    // Brigadas que DIGITAN órdenes en cada franja/día (únicas con órdenes) — la lectura real.
    const digitandoSerie = dias.map(d => isFuturePeriod(d) ? null : tiposArr.reduce((s, t) => s + (byTypeDay[t]?.[d]?.brigadas.size || 0), 0));

    const chartBrigDatasets = isHoraOrDia
      ? [
          // Orden importa: 'Digitando' (índice +1) es la referencia del relleno de la brecha.
          {
            type: 'line' as const,
            label: 'Contratadas',
            data: dias.map(() => brigadasDispPool),
            borderColor: MUT,
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 0,
            fill: '+1',
            backgroundColor: 'rgba(192,57,43,.16)',
            order: 0,
          },
          {
            type: 'line' as const,
            label: 'Digitando',
            data: digitandoSerie,
            borderColor: TEAL,
            borderWidth: 2.8,
            tension: 0.34,
            spanGaps: false,
            fill: false,
            pointRadius: dias.length > 14 ? 0 : 3.5,
            pointBackgroundColor: '#fff',
            pointBorderColor: TEAL,
            pointBorderWidth: 2.4,
            order: 1,
          }
        ]
      : filtroEvolutivo
      ? [
          {
            label: `${filtroEvolutivo} (Operativas)`,
            data: vistaEvolutivo === 'mes'
              ? mesesArr.map(m => brigMensual[filtroEvolutivo]?.[m] || 0)
              : dias.map(d => byTypeDay[filtroEvolutivo]?.[d]?.brigadas.size || 0),
            borderColor: COLOR_BRIGADA[String(filtroEvolutivo).trim().toUpperCase()] || '#1976D2',
            backgroundColor: (COLOR_BRIGADA[String(filtroEvolutivo).trim().toUpperCase()] || '#1976D2') + '33',
            fill: false, tension: 0.3, spanGaps: false,
          }
        ]
      : tiposArr.map((t, idx) => ({
          label: t,
          data: vistaEvolutivo === 'mes'
            ? mesesArr.map(m => brigMensual[t]?.[m] || 0)
            : dias.map(d => byTypeDay[t][d]?.brigadas.size || 0),
          borderColor: chartColors[idx % chartColors.length],
          backgroundColor: chartColors[idx % chartColors.length] + '33',
          fill: false, tension: 0.3, spanGaps: false,
        }));

    const chartBrig = {
      type: 'line',
      data: {
        labels: vistaEvolutivo === 'mes' ? mesesArr : vistaEvolutivo === 'hora' ? dias : dias.map(d => d.slice(-2)),
        datasets: chartBrigDatasets
      },
      plugins: isHoraOrDia ? [bandsPluginBands] : [],
      options: {
        ...baseOpt,
        plugins: {
          legend: { display: !isHoraOrDia, position: 'bottom' as const, labels: { boxWidth: 12, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              title: (items: any[]) => {
                const label = items[0]?.label || '';
                if (!isHoraOrDia) return label;
                return esHora ? `Franja ${label}` : `Día ${label}`;
              },
              ...(isHoraOrDia ? {
                label: (ctx: any) => {
                  if (ctx.raw === null || ctx.raw === undefined) return '';
                  const n = Number(ctx.raw) || 0;
                  if (ctx.dataset.label === 'Contratadas') return `Contratadas: ${fmtN(n)}`;
                  return `Digitando: ${fmtN(n)} · sin digitar ${fmtN(brigadasDispPool - n)}`;
                }
              } : {})
            }
          },
          ...(isHoraOrDia ? { bandsPluginBands: { fecha: filters.fecha, zona: zonaOrProy, esHora } } : {})
        },
        scales: {
          x: { ticks: { autoSkip: isHoraOrDia ? dias.length > 14 : false } },
          y: isHoraOrDia
            ? { beginAtZero: true, max: brigadasDispPool + 2, ticks: { stepSize: 3, precision: 0 }, title: { display: true, text: 'Brigadas digitando' } }
            : { min: 0 }
        }
      }
    };

    // Modal de op-brig (solo hora/día): una línea por tipo — "cuáles están trabajando".
    // Eje Y al máximo de un solo tipo + 2 (no al pool) para que las curvas no queden aplastadas.
    const maxPorTipo = Math.max(0, ...tiposArr.flatMap(t => dias.map(d => byTypeDay[t]?.[d]?.brigadas.size || 0)));
    const chartBrigTipos = isHoraOrDia ? {
      type: 'line',
      data: {
        labels: vistaEvolutivo === 'hora' ? dias : dias.map(d => d.slice(-2)),
        datasets: tiposArr.map(t => {
          const col = COLOR_BRIGADA[String(t).trim().toUpperCase()] || '#97999B';
          return {
            label: t,
            data: dias.map(d => isFuturePeriod(d) ? null : (byTypeDay[t]?.[d]?.brigadas.size || 0)),
            borderColor: col,
            backgroundColor: col + '1F',
            fill: false,
            spanGaps: false,
            borderWidth: 2.8,
            tension: 0.34,
            pointRadius: dias.length > 14 ? 0 : 4,
            pointBackgroundColor: '#fff',
            pointBorderColor: col,
            pointBorderWidth: 2,
          };
        })
      },
      plugins: [bandsPluginBands],
      options: {
        ...baseOpt,
        interaction: { mode: 'index' as const, intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: (it: any) => it.parsed.y > 0,   // no listar los tipos inactivos de la franja
            callbacks: {
              title: (items: any[]) => {
                const label = items[0]?.label || '';
                if (esHora) {
                  const min = getMinutosTrabajoHora(label, filters.fecha, zonaOrProy);
                  const tag = min === 0 ? (label === '12:00' ? ' · Almuerzo' : ' · Fuera de jornada') : '';
                  return `Franja ${label}${tag}`;
                }
                return `Día ${label}`;
              },
              label: (ctx: any) => {
                if (ctx.raw === null || ctx.raw === undefined) return '';
                return `${ctx.dataset.label}: ${fmtN(Number(ctx.raw) || 0)}`;
              }
            }
          },
          bandsPluginBands: { fecha: filters.fecha, zona: zonaOrProy, esHora }
        },
        scales: {
          x: { ticks: { autoSkip: dias.length > 14, maxRotation: 0 } },
          y: { beginAtZero: true, ticks: { precision: 0 }, max: maxPorTipo + 2, title: { display: true, text: 'Brigadas digitando' } }
        }
      }
    } : null;

    // Datos ricos para el modal propio de op-brig (Expandir): serie + métricas por tipo.
    const _mmAbrev = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const _fmtFecha = (f: string) => {
      const p = f.split('-').map(Number);
      return p.length === 3 ? `${p[2]} ${_mmAbrev[p[1] - 1]} ${p[0]}` : f;
    };
    const _fmtMes = (m: string) => {
      const p = String(m).split('-').map(Number);
      return p.length >= 2 ? `${_mmAbrev[p[1] - 1]} ${p[0]}` : m;
    };
    const brigTiposModal = isHoraOrDia ? {
      esHora,
      fecha: filters.fecha,
      zona: zonaOrProy,
      pool: brigadasDispPool,
      labels: vistaEvolutivo === 'hora' ? dias : dias.map(d => d.slice(-2)),
      jornada: 'Jornada 07:30 – 17:00',
      fechaTexto: esHora ? (filters.fecha && filters.fecha !== 'ALL' ? _fmtFecha(filters.fecha) : '') : _fmtMes(mesesArr[mesesArr.length - 1] || ''),
      tipos: tiposArr.map(t => {
        const col = COLOR_BRIGADA[String(t).trim().toUpperCase()] || '#97999B';
        const serie = dias.map(d => isFuturePeriod(d) ? null : (byTypeDay[t]?.[d]?.brigadas.size || 0));
        const uni = new Set<unknown>();
        let ord = 0;
        dias.forEach(d => { const c = byTypeDay[t]?.[d]; if (c) { c.brigadas.forEach(x => uni.add(x)); ord += c.efec + c.fall + c.perd; } });
        const serieW = dias
          .filter(d => {
            if (esHora) return getMinutosTrabajoHora(d, filters.fecha, zonaOrProy) > 0;
            const p = d.split('-').map(Number);
            if (p.length === 3) { const dt = new Date(p[0], p[1] - 1, p[2]); return dt.getDay() !== 0 && !esFestivo(dt); }
            return true;
          })
          .map(d => byTypeDay[t]?.[d]?.brigadas.size || 0);
        const pico = Math.max(0, ...serieW);
        const mean = serieW.length ? serieW.reduce((a, b) => a + b, 0) / serieW.length : 0;
        const sd = serieW.length ? Math.sqrt(serieW.reduce((a, b) => a + (b - mean) ** 2, 0) / serieW.length) : 0;
        const cv = mean > 0 ? sd / mean : 0;
        const constancia = cv < 0.35 ? 'Alta' : cv <= 0.7 ? 'Media' : 'Baja';
        return { label: t, color: col, serie, brigadas: uni.size, pico, promedio: mean, ordenes: ord, cv, constancia };
      })
    } : null;

    // Gráfico 3: Evolutivo de Efectivas por Tipo de Brigada
    const periodosListTipos = vistaEvolutivo === 'mes' ? mesesArr : dias;
    const periodLabelsTipos = vistaEvolutivo === 'mes'
      ? mesesArr.map(m => {
          const parts = m.split('-');
          const names = ['—', 'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
          return names[Number(parts[1]) || 0] || m;
        })
      : vistaEvolutivo === 'hora'
      ? dias
      : dias.map(d => d.slice(-2));

    const periodTotalsTipos = periodosListTipos.map(p => {
      if (isFuturePeriod(p)) return null;
      return tiposArr.reduce((sum, t) => {
        const val = vistaEvolutivo === 'mes'
          ? (byTypeMonth[t]?.[p] || 0)
          : (byTypeDay[t]?.[p]?.efec || 0);
        return sum + val;
      }, 0);
    });
    const granTotalEfectivas = periodTotalsTipos.reduce((s: number, v) => s + (v || 0), 0);

    const tiposTotales = tiposArr.map(t => {
      const total = vistaEvolutivo === 'mes'
        ? mesesArr.reduce((s, m) => s + (byTypeMonth[t]?.[m] || 0), 0)
        : dias.reduce((s, d) => s + (byTypeDay[t]?.[d]?.efec || 0), 0);
      const color = COLOR_BRIGADA[String(t).trim().toUpperCase()] || '#97999B';
      return { t, total, color };
    }).sort((a, b) => b.total - a.total);

    const tipoLider = tiposTotales[0] || { t: '—', total: 0, color: '#97999B' };
    const tipoLiderPct = granTotalEfectivas > 0 ? (tipoLider.total / granTotalEfectivas) * 100 : 0;

    let picoPeriodoIdx = 0;
    let picoPeriodoVal = -1;
    periodTotalsTipos.forEach((val, idx) => {
      if (val !== null && val > picoPeriodoVal) {
        picoPeriodoVal = val;
        picoPeriodoIdx = idx;
      }
    });
    const picoPeriodoKey = periodLabelsTipos[picoPeriodoIdx] || '—';
    const picoFormatted = `${picoPeriodoKey} · ${fmtN(Math.max(0, picoPeriodoVal))}`;

    let workingPeriodsCount = 0;
    const totalPeriodsCount = periodosListTipos.length;
    periodosListTipos.forEach(p => {
      let isWork = true;
      if (esHora) isWork = getMinutosTrabajoHora(p, filters.fecha, zonaOrProy) > 0;
      else if (vistaEvolutivo === 'dia') {
        const parts = p.split('-').map(Number);
        if (parts.length === 3) {
          const dt = new Date(parts[0], parts[1] - 1, parts[2]);
          isWork = dt.getDay() !== 0 && !esFestivo(dt);
        }
      }
      if (isWork) workingPeriodsCount++;
    });

    const datasetsTipos = [
      {
        label: 'Total Efectivas (Suma brigadas)',
        data: periodTotalsTipos,
        borderColor: TEAL,
        backgroundColor: 'rgba(0, 137, 123, 0.14)',
        borderWidth: 2.8,
        tension: 0.34,
        spanGaps: false,
        fill: true,
        pointRadius: dias.length > 14 ? 0 : 3.5,
        pointBackgroundColor: '#fff',
        pointBorderColor: TEAL,
        pointBorderWidth: 2,
      }
    ];

    const chartTipos = {
      type: 'line',
      data: {
        labels: periodLabelsTipos,
        datasets: datasetsTipos,
      },
      plugins: isHoraOrDia ? [bandsPluginBands] : [],
      options: {
        ...baseOpt,
        interaction: { mode: 'index' as const, intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items: any[]) => {
                const label = items[0]?.label || '';
                if (esHora) {
                  const min = getMinutosTrabajoHora(label, filters.fecha, zonaOrProy);
                  const tag = min === 0 ? (label === '12:00' ? ' · Almuerzo' : ' · Fuera de jornada') : '';
                  return `Franja ${label}${tag}`;
                }
                return vistaEvolutivo === 'mes' ? `Mes ${label}` : `Día ${label}`;
              },
              label: (ctx: any) => {
                if (ctx.raw === null || ctx.raw === undefined) return '';
                const val = Number(ctx.raw) || 0;
                return `${ctx.dataset.label}: ${fmtN(val)} efectivas`;
              },
            }
          },
          ...(isHoraOrDia ? { bandsPluginBands: { fecha: filters.fecha, zona: zonaOrProy, esHora } } : {})
        },
        scales: {
          x: {
            ticks: { autoSkip: dias.length > 14, maxRotation: 0 }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Órdenes efectivas' }
          }
        }
      }
    };

    // Datasets para la vista expandida (modal): una serie por cada brigada
    const datasetsTiposModal = tiposTotales.map(item => {
      const t = item.t;
      const col = item.color;
      const rawData = periodosListTipos.map(p => {
        if (isFuturePeriod(p)) return null;
        return vistaEvolutivo === 'mes'
          ? (byTypeMonth[t]?.[p] || 0)
          : (byTypeDay[t]?.[p]?.efec || 0);
      });

      return {
        label: t,
        data: rawData,
        borderColor: col,
        backgroundColor: col + '26',
        borderWidth: 2.8,
        tension: 0.34,
        spanGaps: false,
        fill: true,
        pointRadius: dias.length > 14 ? 0 : 4,
        pointBackgroundColor: '#fff',
        pointBorderColor: col,
        pointBorderWidth: 2,
      };
    });

    const chartTiposModal = {
      type: 'line',
      data: {
        labels: periodLabelsTipos,
        datasets: datasetsTiposModal,
      },
      plugins: isHoraOrDia ? [bandsPluginBands] : [],
      options: {
        ...baseOpt,
        interaction: { mode: 'index' as const, intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items: any[]) => {
                const label = items[0]?.label || '';
                if (esHora) {
                  const min = getMinutosTrabajoHora(label, filters.fecha, zonaOrProy);
                  const tag = min === 0 ? (label === '12:00' ? ' · Almuerzo' : ' · Fuera de jornada') : '';
                  return `Franja ${label}${tag}`;
                }
                return vistaEvolutivo === 'mes' ? `Mes ${label}` : `Día ${label}`;
              },
              label: (ctx: any) => {
                if (ctx.raw === null || ctx.raw === undefined) return '';
                return `${ctx.dataset.label}: ${fmtN(Number(ctx.raw) || 0)} efectivas`;
              },
            }
          },
          ...(isHoraOrDia ? { bandsPluginBands: { fecha: filters.fecha, zona: zonaOrProy, esHora } } : {})
        },
        scales: {
          x: {
            ticks: { autoSkip: dias.length > 14, maxRotation: 0 }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Órdenes efectivas' }
          }
        }
      }
    };

    // tableDataTipos para AnalysisModal (Expandir)
    const tableDataTiposColHeaders = esHora
      ? HORAS_VISIBLES.map(h => h.slice(0, 2))
      : vistaEvolutivo === 'mes'
      ? mesesArr.map(m => m.slice(-2))
      : dias.map(d => d.slice(-2));

    const tableDataTipos = {
      columns: ['Tipo de Brigada', ...tableDataTiposColHeaders, 'Total', 'Pico'],
      categoryIndex: 0,
      rows: tiposTotales.map(item => {
        const t = item.t;
        let maxVal = -1;
        let maxLabel = '—';

        const periodVals = periodosListTipos.map((p, idx) => {
          if (isFuturePeriod(p)) return '—';
          let isWork = true;
          if (esHora) isWork = getMinutosTrabajoHora(p, filters.fecha, zonaOrProy) > 0;
          else if (vistaEvolutivo === 'dia') {
            const parts = p.split('-').map(Number);
            if (parts.length === 3) {
              const dt = new Date(parts[0], parts[1] - 1, parts[2]);
              isWork = dt.getDay() !== 0 && !esFestivo(dt);
            }
          }

          const val = vistaEvolutivo === 'mes'
            ? (byTypeMonth[t]?.[p] || 0)
            : (byTypeDay[t]?.[p]?.efec || 0);

          if (isWork && val > maxVal) {
            maxVal = val;
            maxLabel = esHora ? p : (vistaEvolutivo === 'dia' ? `Día ${p.slice(-2)}` : p);
          }

          if (!isWork && val === 0) return '—';
          return fmtN(val);
        });

        const picoCol = maxVal >= 0 ? `${maxLabel} · ${fmtN(maxVal)}` : '—';
        return [t, ...periodVals, fmtN(item.total), picoCol];
      })
    };

    // Tablas Modales
    const tableDataOrd = {
      columns: esHora
        ? ['Hora', 'Estado', 'Meta Horaria', '% Meta Día (Esp.)', 'Efectivas', '% Meta Día (Real)', '% Cump. Hora', 'Fallidas', 'Perdidas']
        : vistaEvolutivo === 'dia'
        ? ['Día', 'Estado', 'Meta Diaria', '% Meta Período (Esp.)', 'Efectivas', '% Meta Período (Real)', '% Cump. Día', 'Fallidas', 'Perdidas']
        : ['Mes', 'Total Órdenes', 'Efectivas', 'Fallidas', 'Perdidas'],
      rows: dias.map(d => {
        const bd = byDay[d];
        const isFut = isFuturePeriod(d);
        const total = bd.efec + bd.fall + bd.perd;
        if (isHoraOrDia) {
          let estado = isFut ? 'Pendiente' : 'Laborable';
          if (esHora) {
            const min = getMinutosTrabajoHora(d, filters.fecha, filters.zona);
            if (min === 0) estado = d === '12:00' ? 'Almuerzo' : 'Fuera de jornada';
          } else {
            const parts = d.split('-').map(Number);
            if (parts.length === 3) {
              const dt = new Date(parts[0], parts[1] - 1, parts[2]);
              if (dt.getDay() === 0) estado = 'Domingo';
              else if (esFestivo(dt)) estado = 'Festivo';
            }
          }
          const metaVal = metaByDay[d] || 0;
          const pctEsp = metaTotalOrdenes > 0 ? fmtPct(metaVal / metaTotalOrdenes) : '0%';
          if (isFut) {
            return [esHora ? d : d.slice(-2), estado, fmtN(metaVal), pctEsp, '—', '—', '—', '—', '—'];
          }
          const pctReal = metaTotalOrdenes > 0 ? fmtPct(bd.efec / metaTotalOrdenes) : '0%';
          const pctCump = metaVal > 0 ? fmtPct(bd.efec / metaVal) : '—';
          return [esHora ? d : d.slice(-2), estado, fmtN(metaVal), pctEsp, fmtN(bd.efec), pctReal, pctCump, fmtN(bd.fall), fmtN(bd.perd)];
        }
        return [d.slice(-2), fmtN(total), fmtN(bd.efec), fmtN(bd.fall), fmtN(bd.perd)];
      })
    };

    const tableDataBrig = {
      columns: esHora
        ? ['Hora', 'Estado', 'Activas en Campo', 'Pool Disponible', '% Ocupación']
        : vistaEvolutivo === 'dia'
        ? ['Día', 'Estado', 'Activas en Campo', 'Pool Disponible', '% Ocupación']
        : ['Mes', 'Brigadas Operativas', 'Brigadas Disponibles'],
      rows: dias.map(d => {
        const bd = byDay[d];
        const isFut = isFuturePeriod(d);
        if (isHoraOrDia) {
          let estado = isFut ? 'Pendiente' : 'Laborable';
          if (esHora) {
            const min = getMinutosTrabajoHora(d, filters.fecha, filters.zona);
            if (min === 0) estado = d === '12:00' ? 'Almuerzo' : 'Fuera de jornada';
          } else {
            const parts = d.split('-').map(Number);
            if (parts.length === 3) {
              const dt = new Date(parts[0], parts[1] - 1, parts[2]);
              if (dt.getDay() === 0) estado = 'Domingo';
              else if (esFestivo(dt)) estado = 'Festivo';
            }
          }
          if (isFut) {
            return [esHora ? d : d.slice(-2), estado, '—', fmtN(brigadasDispPool), '—'];
          }
          const pctOcup = brigadasDispPool > 0 ? fmtPct(bd.oper / brigadasDispPool) : '—';
          return [esHora ? d : d.slice(-2), estado, fmtN(bd.oper), fmtN(brigadasDispPool), pctOcup];
        }
        return [d.slice(-2), fmtN(bd.oper), fmtN(bd.disp)];
      })
    };

    // Modal op-brig (hora/día): una fila por tipo. categoryIndex=0 -> AnalysisModal genera
    // los chips de categoría y el filtrado cruzado gráfico/tabla.
    const tableDataBrigTipos = {
      columns: ['Tipo de Brigada', 'Brigadas', 'Pico', 'Promedio', 'Órdenes', 'Constancia'],
      categoryIndex: 0,
      rows: tiposArr.map(t => {
        const uni = new Set<unknown>();
        let ord = 0;
        dias.forEach(d => {
          const c = byTypeDay[t]?.[d];
          if (!c) return;
          c.brigadas.forEach(x => uni.add(x));
          ord += c.efec + c.fall + c.perd;
        });
        // Pico y promedio SOLO sobre franjas/días laborables.
        const serieW = dias
          .filter(d => {
            if (esHora) return getMinutosTrabajoHora(d, filters.fecha, zonaOrProy) > 0;
            const parts = d.split('-').map(Number);
            if (parts.length === 3) { const dt = new Date(parts[0], parts[1] - 1, parts[2]); return dt.getDay() !== 0 && !esFestivo(dt); }
            return true;
          })
          .map(d => byTypeDay[t]?.[d]?.brigadas.size || 0);
        const pico = Math.max(0, ...serieW);
        const mean = serieW.length ? serieW.reduce((a, b) => a + b, 0) / serieW.length : 0;
        const sd = serieW.length ? Math.sqrt(serieW.reduce((a, b) => a + (b - mean) ** 2, 0) / serieW.length) : 0;
        const cv = mean > 0 ? sd / mean : 0;
        const constancia = cv < 0.35 ? 'Alta' : cv <= 0.7 ? 'Media' : 'Baja';
        return [t, fmtN(uni.size), fmtN(pico), mean.toFixed(1), fmtN(ord), constancia];
      })
    };


    // Gráfico 4: Evolutivo Mensual por Tipo de Brigada (Dinámico, reacciona a filtros globales)
    const rawEvolutivo = vistaEvolutivo === 'mes' ? filtRaw(raw.raw, { ...F, mes: [], fecha: 'ALL' }) : rawF;
    const evValRealMap = new Map<string, number>();
    const evValMetaMap = new Map<string, number>();
    const techDaysEvolutivo = new Map<string, { tipo: string; zona: string; day: string; ced: string }>();

    rawEvolutivo.forEach(r => {
      const day = String(r.Fecha || '');
      const ced = String(r.Cedula || '');
      if (day && ced) {
        const key = `${ced}_${day}`;
        if (!techDaysEvolutivo.has(key)) {
          const tipo = getBrigadaTipo(r);
          const zona = String(r._Zona || r.Zona || '');
          techDaysEvolutivo.set(key, { tipo, zona, day, ced });
        }
      }

      if (!day) return;
      const t = getBrigadaTipo(r);
      if (!t) return;
      const totalOrd = n(r.Efectivas) + n(r.Fallida_Con_Pago) + n(r.Fallida_Sin_Pago) + n(r.Perdidas);

      if (vistaEvolutivo === 'hora') {
        const explicitH = getPeriodKey(r, day);
        if (explicitH) {
          const key = `${explicitH}|${t}`;
          evValRealMap.set(key, (evValRealMap.get(key) || 0) + totalOrd);
        } else {
          const currentZona = r._Zona || zonaOrProy;
          const workingHours = HORAS_VISIBLES.filter(h => getMinutosTrabajoHora(h, day, currentZona) > 0);
          const totalMin = workingHours.reduce((sum, h) => sum + getMinutosTrabajoHora(h, day, currentZona), 0);

          if (workingHours.length > 0 && totalMin > 0) {
            workingHours.forEach(h => {
              const weight = getMinutosTrabajoHora(h, day, currentZona) / totalMin;
              const key = `${h}|${t}`;
              evValRealMap.set(key, (evValRealMap.get(key) || 0) + totalOrd * weight);
            });
          } else {
            const key = `07:00|${t}`;
            evValRealMap.set(key, (evValRealMap.get(key) || 0) + totalOrd);
          }
        }
      } else if (vistaEvolutivo === 'dia') {
        const key = `${day}|${t}`;
        evValRealMap.set(key, (evValRealMap.get(key) || 0) + totalOrd);
      } else {
        const mesYM = day.substring(0, 7);
        const key = `${mesYM}|${t}`;
        evValRealMap.set(key, (evValRealMap.get(key) || 0) + totalOrd);
      }
    });

    techDaysEvolutivo.forEach(({ tipo, zona, day }) => {
      if (!tipo) return;
      if (vistaEvolutivo === 'hora') {
        HORAS_VISIBLES.forEach(h => {
          const key = `${h}|${tipo}`;
          const metaVal = getMetaHorariaEfectivas(tipo, day, h, zona);
          evValMetaMap.set(key, (evValMetaMap.get(key) || 0) + metaVal);
        });
      } else if (vistaEvolutivo === 'dia') {
        const key = `${day}|${tipo}`;
        const metaVal = getMetaDiariaEfectivas(tipo, day, zona);
        evValMetaMap.set(key, (evValMetaMap.get(key) || 0) + metaVal);
      } else {
        const mesYM = day.substring(0, 7);
        const key = `${mesYM}|${tipo}`;
        const metaVal = getMetaDiariaEfectivas(tipo, day, zona);
        evValMetaMap.set(key, (evValMetaMap.get(key) || 0) + metaVal);
      }
    });

    // Datos para la 3ra línea: Período Anterior (Mes o Día anterior)
    const evValPrevMap = new Map<string, number>();
    let labelPeriodoActual = 'Período actual';
    let labelPeriodoAnterior = 'Período anterior';

    const fmtMesName = (ym: string) => {
      if (!ym) return '';
      const parts = ym.split('-');
      if (parts.length < 2) return ym;
      const dObj = new Date(Number(parts[0]), Number(parts[1]) - 1, 15);
      const name = dObj.toLocaleString('es-CO', { month: 'short' }).replace('.', '');
      return name.charAt(0).toUpperCase() + name.slice(1);
    };

    const fmtFechaLabel = (fStr: string) => {
      if (!fStr) return '';
      const parts = fStr.split('-');
      if (parts.length !== 3) return fStr;
      const dObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return dObj.toLocaleString('es-CO', { day: 'numeric', month: 'short' }).replace('.', '');
    };

    if (vistaEvolutivo === 'hora') {
      const curFecha = F.fecha && F.fecha !== 'ALL' ? F.fecha : (fechaList && fechaList.length > 0 ? fechaList[fechaList.length - 1] : '');
      let prevFecha = '';
      if (curFecha) {
        const idx = fechaList ? fechaList.indexOf(curFecha) : -1;
        if (idx > 0) {
          prevFecha = fechaList[idx - 1];
        } else {
          const parts = curFecha.split('-').map(Number);
          if (parts.length === 3) {
            const dObj = new Date(parts[0], parts[1] - 1, parts[2] - 1);
            prevFecha = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;
          }
        }
      }
      labelPeriodoActual = curFecha ? `Día actual (${fmtFechaLabel(curFecha)})` : 'Día actual';
      labelPeriodoAnterior = prevFecha ? `Día anterior (${fmtFechaLabel(prevFecha)})` : 'Día anterior';

      if (prevFecha) {
        const F_prev = { ...F, fecha: prevFecha, mes: [prevFecha.substring(0, 7)] };
        const rawF_prev = filtRaw(raw.raw, F_prev);
        rawF_prev.forEach(r => {
          const day = String(r.Fecha || '');
          if (!day) return;
          const t = getBrigadaTipo(r);
          if (!t) return;
          const totalOrd = n(r.Efectivas) + n(r.Fallida_Con_Pago) + n(r.Fallida_Sin_Pago) + n(r.Perdidas);
          
          const explicitH = getPeriodKey(r, day);
          if (explicitH) {
            const key = `${explicitH}|${t}`;
            evValPrevMap.set(key, (evValPrevMap.get(key) || 0) + totalOrd);
          } else {
            const currentZona = r._Zona || zonaOrProy;
            const workingHours = HORAS_JORNADA.filter(h => getMinutosTrabajoHora(h, day, currentZona) > 0);
            const totalMin = workingHours.reduce((sum, h) => sum + getMinutosTrabajoHora(h, day, currentZona), 0);

            if (workingHours.length > 0 && totalMin > 0) {
              workingHours.forEach(h => {
                const weight = getMinutosTrabajoHora(h, day, currentZona) / totalMin;
                const key = `${h}|${t}`;
                evValPrevMap.set(key, (evValPrevMap.get(key) || 0) + totalOrd * weight);
              });
            } else {
              const key = `07:00|${t}`;
              evValPrevMap.set(key, (evValPrevMap.get(key) || 0) + totalOrd);
            }
          }
        });
      }

    } else if (vistaEvolutivo === 'dia') {
      const curMes = F.mes && F.mes.length > 0 && F.mes[0] !== 'ALL' ? F.mes[0] : (mesList && mesList.length > 0 ? mesList[mesList.length - 1] : '');
      const idxMes = mesList ? mesList.indexOf(curMes) : -1;
      const prevMes = idxMes > 0 ? mesList[idxMes - 1] : '';

      labelPeriodoActual = curMes ? `Mes actual (${fmtMesName(curMes)})` : 'Mes actual';
      labelPeriodoAnterior = prevMes ? `Mes anterior (${fmtMesName(prevMes)})` : 'Mes anterior';

      if (prevMes) {
        const F_prev = { ...F, mes: [prevMes], fecha: 'ALL' };
        const rawF_prev = filtRaw(raw.raw, F_prev);
        rawF_prev.forEach(r => {
          const dayStr = String(r.Fecha || '');
          if (!dayStr) return;
          const dayParts = dayStr.split('-');
          if (dayParts.length !== 3) return;
          const dayDD = dayParts[2];
          const mappedKeyDay = `${curMes}-${dayDD}`;
          const t = getBrigadaTipo(r);
          if (!t) return;
          const totalOrd = n(r.Efectivas) + n(r.Fallida_Con_Pago) + n(r.Fallida_Sin_Pago) + n(r.Perdidas);
          const key = `${mappedKeyDay}|${t}`;
          evValPrevMap.set(key, (evValPrevMap.get(key) || 0) + totalOrd);
        });
      }

    } else {
      labelPeriodoActual = 'Mes actual';
      labelPeriodoAnterior = 'Mes anterior';
    }

    const uniqueKeys = Array.from(new Set([...evValRealMap.keys(), ...evValMetaMap.keys()]));
    const evMeses = vistaEvolutivo === 'hora'
      ? HORAS_VISIBLES
      : vistaEvolutivo === 'mes'
      ? (mesList && mesList.length > 0 ? mesList : Array.from(new Set(uniqueKeys.map(k => k.split('|')[0]))).sort())
      : Array.from(new Set(uniqueKeys.map(k => k.split('|')[0]))).sort();
    const evTipos = Array.from(new Set(uniqueKeys.map(k => k.split('|')[1]))).filter(Boolean).sort();

    const evValReal = (m: string, t: string) => evValRealMap.get(`${m}|${t}`) || 0;
    const evValMeta = (m: string, t: string) => evValMetaMap.get(`${m}|${t}`) || 0;

    const evValPrev = (m: string, t: string) => {
      if (vistaEvolutivo === 'mes') {
        const idx = mesList ? mesList.indexOf(m) : -1;
        const prevM = idx > 0 ? mesList[idx - 1] : '';
        return prevM ? evValReal(prevM, t) : 0;
      }
      return evValPrevMap.get(`${m}|${t}`) || 0;
    };

    const evTotales = evTipos
      .map(t => ({ t, total: evMeses.reduce((s, m) => s + evValReal(m, t), 0) }))
      .sort((a, b) => b.total - a.total);

    const evPal = ['#38764C', '#78BE20', '#2f6f8f', '#B5BD00', '#c2410c'];
    const evColor = (t: string, idx: number) => COLOR_BRIGADA[String(t).trim().toUpperCase()] || evPal[idx % evPal.length] || '#97999B';

    const evTop = evTotales.slice(0, 5).map((x, idx) => ({ ...x, color: evColor(x.t, idx) }));
    const evGran = evTotales.reduce((s, x) => s + x.total, 0);
    const evRestN = Math.max(0, evTotales.length - evTop.length);
    const evRestPct = evGran ? Math.round(evTotales.slice(5).reduce((s, x) => s + x.total, 0) / evGran * 100) : 0;
    const evSubtitle = `Las ${evRestN} restantes suman ${evRestPct}% del volumen`;

    const tiposConColor = evTotales.map((x, idx) => ({ ...x, color: evColor(x.t, idx) }));
    const brigadaActiva = (filtroEvolutivo && evTipos.includes(filtroEvolutivo))
      ? filtroEvolutivo
      : (tiposConColor.length > 0 ? tiposConColor[0].t : null);
    const evSubtitleFull = brigadaActiva ? `Mostrando órdenes ejecutadas (${labelPeriodoActual}), período anterior (${labelPeriodoAnterior}) y meta de: ${brigadaActiva} · Clic en otra brigada para cambiar` : `Tendencia por brigada`;

    const evLineChart = (tipos: { t: string, color?: string }[]) => {
      const activeType = (filtroEvolutivo && evTipos.includes(filtroEvolutivo))
        ? filtroEvolutivo
        : (tipos.length > 0 ? tipos[0].t : null);
      const activeColor = activeType ? (COLOR_BRIGADA[String(activeType).trim().toUpperCase()] || '#1976D2') : '#1976D2';

      const maxY = activeType
        ? Math.max(...evMeses.map(m => Math.max(evValReal(m, activeType), evValPrev(m, activeType), evValMeta(m, activeType))), 1)
        : 1;

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

      const datasets = activeType ? [
        {
          label: `${activeType} (${labelPeriodoActual})`,
          data: evMeses.map(m => isFuturePeriod(m) ? null : evValReal(m, activeType)),
          borderColor: activeColor,
          backgroundColor: activeColor,
          borderWidth: 3.2,
          borderJoinStyle: 'round' as const,
          borderCapStyle: 'round' as const,
          pointStyle: 'circle',
          pointRadius: 4,
          pointBackgroundColor: theme === 'dark' ? '#0F2744' : '#fff',
          pointBorderWidth: 2,
          pointBorderColor: activeColor,
          tension: 0.1,
          spanGaps: false,
          fill: false,
        },
        {
          label: `${activeType} (${labelPeriodoAnterior})`,
          data: evMeses.map(m => evValPrev(m, activeType)),
          borderColor: '#78909C',
          backgroundColor: '#78909C',
          borderWidth: 2.2,
          borderDash: [4, 4],
          borderJoinStyle: 'round' as const,
          borderCapStyle: 'round' as const,
          pointStyle: 'triangle',
          pointRadius: 4,
          pointBackgroundColor: theme === 'dark' ? '#0F2744' : '#fff',
          pointBorderWidth: 2,
          pointBorderColor: '#78909C',
          tension: 0.1,
          spanGaps: false,
          fill: false,
        },
        {
          label: `Meta (${activeType})`,
          data: evMeses.map(m => evValMeta(m, activeType)),
          borderColor: '#F57C00',
          backgroundColor: '#F57C00',
          borderWidth: 2.5,
          borderDash: [6, 4],
          borderJoinStyle: 'round' as const,
          borderCapStyle: 'round' as const,
          pointStyle: 'rectRot',
          pointRadius: 4,
          pointBackgroundColor: theme === 'dark' ? '#0F2744' : '#fff',
          pointBorderWidth: 2,
          pointBorderColor: '#F57C00',
          tension: 0.1,
          spanGaps: false,
          fill: false,
        }
      ] : [];

      return {
        type: 'line',
        data: {
          labels: evMeses.map(m => {
             if (vistaEvolutivo === 'hora') {
               return m;
             } else if (vistaEvolutivo === 'dia') {
               const parts = m.split('-');
               if (parts.length !== 3) return m;
               const mDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
               return mDate.toLocaleString('es', { day: 'numeric', month: 'short' }).toLowerCase();
             } else {
               const mDate = new Date(m + '-02');
               return mDate.toLocaleString('es', { month: 'short' }).toLowerCase();
             }
          }),
          datasets,
        },
        plugins: [customTicksPlugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'nearest', intersect: true },
          plugins: { 
            legend: { display: true, position: 'top' as const, labels: { boxWidth: 12, font: { size: 11, weight: 600 } } },
            tooltip: {
              enabled: true,
              mode: 'index',
              intersect: false,
              callbacks: {
                label: (context: any) => {
                  if (context.raw === null || context.raw === undefined) return '';
                  const rawVal = Number(context.raw) || 0;
                  const formattedVal = rawVal.toLocaleString('es-CO');
                  const datasetLabel = context.dataset.label || '';
                  const dataIndex = context.dataIndex;
                  const key = evMeses[dataIndex];
                  const metaVal = (activeType && key) ? evValMeta(key, activeType) : 0;

                  if (activeType && metaVal > 0 && !datasetLabel.startsWith('Meta')) {
                    const pct = ((rawVal / metaVal) * 100).toFixed(1);
                    return `${datasetLabel}: ${formattedVal} (${pct}% de meta)`;
                  }
                  return `${datasetLabel}: ${formattedVal}`;
                }
              }
            }
          },
          scales: {
            y: {
              min: 0,
              max: roundedMax,
              position: 'left',
              grid: {
                color: theme === 'dark' ? '#1E3A5F' : '#EDF0E7',
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
                color: colors.mut,
              }
            }
          }
        }
      };
    };
    const chartEvolutivo = evLineChart(tiposConColor);
    const chartEvolutivoFull = evLineChart(tiposConColor);

      // Detalle por brigada (vista "Ambos"): total, participacion (%) y variacion
      // mes-a-mes (ultimo vs anterior). El grafico muestra el top-5; la tabla, todas.
      const evLast = evMeses[evMeses.length - 1];
      const evPrev = evMeses[evMeses.length - 2];
      const brigadaDetalle = evTotales.map((x, idx) => {
        const lastV = evLast ? evValReal(evLast, x.t) : 0;
        const prevV = evPrev ? evValReal(evPrev, x.t) : 0;
        return {
          brigada: x.t,
          total: x.total,
          partPct: evGran ? Math.round(x.total / evGran * 100) : 0,
          varPct: prevV > 0 ? Math.round((lastV - prevV) / prevV * 100) : null,
          color: evColor(x.t, idx),
        };
      });
      const formatHeader = (m: string) => {
        const parts = String(m).split('-');
        const names = ['—', 'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
        if (vistaEvolutivo === 'hora') {
          return m;
        }
        if (vistaEvolutivo === 'dia' && parts.length === 3) {
          return `${Number(parts[2])} ${names[Number(parts[1])] || ''}`;
        }
        return names[Number(parts.pop()) || 0] || String(m);
      };
      const varHeader = (evLast && evPrev) ? `${formatHeader(evLast)}/${formatHeader(evPrev)}` : 'VAR';

      // Detallado por tecnico: respeta el filtro GLOBAL de meses (F.mes). Con varios
      // meses seleccionados, agrega por técnico (suma) a través de TODOS esos meses;
      // con "Todos" (F.mes vacío) toma todos los meses. Alerta = Eficacia < 65%.
      const colorPorBrigada = new Map<string, string>(evTotales.map((x, idx) => [x.t, evColor(x.t, idx)]));
      const mesesSelTec = F.mes;   // [] = todos los meses
      const tecAgg = new Map<string, {
        tipoBrigada: string; tecnico: string; cuentas: number; ejecutadas: number;
        suspension: number; mantiene: number; reconexion: number; pagos: number;
        imposibilidades: number; resistencias: number; diasLab: number;
        efectivas: number; ordenes: number;
      }>();
      filtMes(raw.mes || [], F)
        .filter(e => !mesesSelTec.length || mesesSelTec.includes(String(e.Mes_YM)))
        .forEach(t => {
          const key = `${t.Cedula || ''}|${t.Tipo_Brigada_Mes || ''}`;
          let a = tecAgg.get(key);
          if (!a) {
            a = { tipoBrigada: t.Tipo_Brigada_Mes || '—', tecnico: t.Tecnico || 'Desconocido',
              cuentas: 0, ejecutadas: 0, suspension: 0, mantiene: 0, reconexion: 0, pagos: 0,
              imposibilidades: 0, resistencias: 0, diasLab: 0, efectivas: 0, ordenes: 0 };
            tecAgg.set(key, a);
          }
          a.cuentas += n(t.Cantidad_NIC);
          a.ejecutadas += n(t.Visitas);
          a.suspension += n(t.Total_Suspension);
          a.mantiene += n(t.Total_Mantiene_Susp);
          a.reconexion += n(t.Total_Reconexion);
          a.pagos += n(t.Total_Pagos);
          a.imposibilidades += n(t.Total_Imposibilidades);
          a.resistencias += n(t.Total_Resistencia);
          a.diasLab += n(t.Dias_Laborados);
          a.efectivas += n(t.Efectivas);
          a.ordenes += n(t.Ordenes);
        });
      const tecnicoDetalle = Array.from(tecAgg.values()).map(a => {
        const efi = a.ordenes > 0 ? a.efectivas / a.ordenes : 0;
        return {
          tipoBrigada: a.tipoBrigada,
          tecnico: a.tecnico,
          color: colorPorBrigada.get(a.tipoBrigada) || MUT,
          cuentas: a.cuentas,
          ejecutadas: a.ejecutadas,
          suspension: a.suspension,
          mantiene: a.mantiene,
          reconexion: a.reconexion,
          pagos: a.pagos,
          imposibilidades: a.imposibilidades,
          resistencias: a.resistencias,
          diasLab: a.diasLab,
          promDia: a.diasLab > 0 ? a.ejecutadas / a.diasLab : 0,
          eficacia: efi,
          alerta: efi < 0.65,
        };
      }).sort((a, b) => b.ejecutadas - a.ejecutadas);

      const tableDataEvolutivo = (() => {
        // Respeta el filtro global de meses: todos los meses seleccionados (o todos si F.mes vacío).
        const tecBase = filtMes(raw.mes || [], F);
        const tecCurrent = F.mes.length ? tecBase.filter(e => F.mes.includes(String(e.Mes_YM))) : tecBase;
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
      efect, fallidas, perdidas, visitas, asignado, totalAsignadoOrds, brigadasDisp, brigadasDispPool, brigadasOper, diasEjec, diasHabiles,
      metaTotalOrdenes, pctCumplimientoMeta, pctEfectivasTotal, pctFallidasTotal, pctPerdidasTotal,
      cEfect, cDias, cAsignEjec, disponibilidad, efectividad, perdRate, totOrd, alertas, nivel,
      periodoLabel: winLbl, dEfec, dFall, dOper, dDisp, modoDelta, narrativa,
      chartOrd, chartBrig, chartBrigTipos, brigTiposModal, chartTipos, chartTiposModal, chartEvolutivo, evSubtitle, chartEvolutivoFull, evSubtitleFull,
      brigadaDetalle, varHeader, tecnicoDetalle,
      tableDataOrd, tableDataBrig, tableDataBrigTipos, tableDataTipos, tableDataEvolutivo,
      evolutivo: raw.evolutivo, evTop, tiposConColor, brigadaActiva,
      mesesArr,
      picoLabel, cumpMetaVal, bajoMetaCount, maxActivasVal, ocupacionPicoVal, isHoraOrDia,
      digMejorLbl, digPeorLbl, digBrechaMedia,
      granTotalEfectivas, picoFormatted, tipoLider, tipoLiderPct, workingPeriodsCount, totalPeriodsCount, tiposTotales
    };
  }, [raw, filters, mesList, fechaList, filtroEvolutivo, vistaEvolutivo]);

  if (loading) return <div className="loading-wrap"><div className="spinner" /><span>Cargando…</span></div>;
  if (error) return <div className="status err">{error}</div>;
  if (!d) return null;

  const kLbl: React.CSSProperties = { fontSize: 11, color: MUT, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 600 };
  const kVal: React.CSSProperties = { fontSize: 30, fontWeight: 700, color: INK, marginTop: 6, fontVariantNumeric: 'tabular-nums', lineHeight: 1 };
  const kSub: React.CSSProperties = { fontSize: 11, color: MUT, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 };
  
  const nivelCfg = d.nivel === 'ok'
    ? { c: OK, t: 'Operación dentro de parámetros esperados', s: 'Sin alertas críticas activas.' }
    : d.nivel === 'amber'
    ? { c: WARN, t: 'Atención requerida', s: 'Desviación en:' }
    : { c: ERR, t: 'Alerta crítica operativa', s: 'Acción inmediata en:' };

  const kpi = (lbl: string, val: string, sub?: string, color?: string) => (
    <div key={lbl} style={{ ...card, borderLeft: color ? `3.5px solid ${color}` : card.borderLeft }}>
      <div style={kLbl}>{lbl}</div>
      <div style={{ ...kVal, color: color || INK }}>{val}</div>
      {sub && <div style={kSub}>{sub}</div>}
    </div>
  );

  const cumplCard = (lbl: string, den: number, num: number, fmt: (v: number) => string) => {
    const pct = den > 0 ? (num / den) * 100 : 0;
    const c = pct >= 90 ? OK : pct >= 70 ? WARN : ERR;
    return (
      <div key={lbl} style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={kLbl}>{lbl}</div>
            <div style={{ ...kVal, fontSize: 24, marginTop: 4 }}>{fmt(num)}</div>
            <div style={kSub}>de {fmt(den)} meta</div>
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, color: c, padding: '4px 10px', background: 'var(--hover-bg)', borderRadius: 8 }}>
            {pct.toFixed(0)}%
          </span>
        </div>
        <div style={{ marginTop: 12 }}>
          <ProgBar pct={pct} color={c} />
        </div>
      </div>
    );
  };

  return (
    <>
     <ButtonMenuOperativo/>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '4px 2px 12px' }}>
          
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, color: INK }}>OPERATIVO</div>
          <div style={{ fontSize: 12.5, color: MUT, marginTop: 2 }}>¿Cómo está la operación hoy y qué requiere atención?</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setModalOpen(true)}
            style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: theme === 'dark' ? 'var(--brand-primary)' : 'var(--brand-primary)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: `0 1px 3px rgba(25,118,210,${theme === 'dark' ? 0.1 : 0.3})` }}>
            Detalle de Brigadas
          </button>
          <a href="https://app.powerbi.com/view?r=eyJrIjoiNmRkNzk5ZDQtZTI3OS00MzczLWE1OTAtYmE3MGIxZGQxZGJkIiwidCI6IjAwOGU1MWNkLTNiNzItNDA0NS05MjUwLWI0MzY4MzM0NzBkNyJ9" target="_blank" rel="noopener noreferrer"
            style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: TEAL, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            Ver Detalle Operativo (Norte-Centro) ↗
          </a>
          <a href="https://app.powerbi.com/view?r=eyJrIjoiMTU3ZjE4ZmItMWZjMy00ZjBkLTlkNGMtODQ1YTMwMmZlMDQ2IiwidCI6IjAwOGU1MWNkLTNiNzItNDA0NS05MjUwLWI0MzY4MzM0NzBkNyJ9" target="_blank" rel="noopener noreferrer"
            style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: theme === 'dark' ? 'var(--brand-secondary)' : 'var(--brand-secondary)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
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
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 12 }}>
        {kpi('Brigadas operativas', fmtN(d.brigadasOper), 'promedio activo/día', TEAL)}
        {kpi('Pool de disponibles', fmtN(d.brigadasDispPool), 'plantilla teórica', INDIGO)}
        {kpi(
          'Total asignado',
          fmtN(d.totalAsignadoOrds || d.asignado),
          d.pctCumplimientoMeta !== null
            ? `${d.pctCumplimientoMeta.toFixed(1)}% cump. meta (${fmtN(d.metaTotalOrdenes)})`
            : undefined
        )}
        {kpi('Días ejecutados', fmtN(d.diasEjec), `de ${d.diasHabiles} hábiles`)}
        {kpi(
          'Órdenes efectivas',
          fmtN(d.efect),
          d.pctEfectivasTotal !== null
            ? `${d.pctEfectivasTotal.toFixed(1)}% del total asignado`
            : undefined,
          OK
        )}
        {kpi(
          'Órdenes fallidas',
          fmtN(d.fallidas),
          d.pctFallidasTotal !== null
            ? `${d.pctFallidasTotal.toFixed(1)}% del total asignado`
            : undefined,
          WARN
        )}
        {kpi(
          'Órdenes perdidas',
          fmtN(d.perdidas),
          d.pctPerdidasTotal !== null
            ? `${d.pctPerdidasTotal.toFixed(1)}% del total asignado`
            : undefined,
          ERR
        )}
      </div>

      {/* Evolutivos Diarios (NUEVO) */}
      <div style={secH(TEAL)}><span style={dot(TEAL)} /> {vistaEvolutivo === 'mes' ? 'Seguimiento Mensual de Operación' : vistaEvolutivo === 'hora' ? 'Seguimiento Horario de Operación' : 'Seguimiento Diario de Operación'}</div>
      {vistaEvolutivo === 'hora' && (
        <div style={{ fontSize: 11.5, color: MUT, marginTop: -6, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: INK }}>
            {String(filters.proy !== 'ALL' ? filters.proy : filters.zona).toLowerCase().includes('sur') ? 'Sur: L-V 07:30–17:00 (almuerzo 12:00–13:00) · Sáb 07:30–12:00' : 'Norte-Centro: L-J 07:30–17:00, V 07:30–15:40 (almuerzo 12:00–13:00) · Sáb 07:30–12:00'}
          </span>
          <span>· {filters.fecha !== 'ALL' ? filters.fecha : 'Fecha'} · Franjas sombreadas: no laborable / almuerzo</span>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 12 }}>
        {/* Card 1 */}
        <div>
          <ChartCard
            id="op-ord"
            title={vistaEvolutivo === 'mes' ? "Evolutivo Mensual de Órdenes" : vistaEvolutivo === 'hora' ? "Evolutivo Horario de Órdenes" : "Evolutivo Diario de Órdenes"}
            subtitle={vistaEvolutivo === 'hora' ? `Ejecución acumulada por franja horaria vs meta esperada (${fmtN(d.metaTotalOrdenes)} efectivas total día).` : vistaEvolutivo === 'dia' ? `Ejecución acumulada por día vs meta esperada (${fmtN(d.metaTotalOrdenes)} efectivas total mes).` : undefined}
            config={d.chartOrd as never}
            height="short"
            hasDetail
            detailTableData={d.tableDataOrd as any}
          />
          {(vistaEvolutivo === 'hora' || vistaEvolutivo === 'dia') && (
            <div style={{ background: 'var(--panel)', padding: '10px 14px', borderRadius: '0 0 10px 10px', marginTop: -4, border: '1px solid var(--border)', borderTop: 'none' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, textAlign: 'center', marginBottom: 8, paddingBottom: 8, borderBottom: '1px dashed var(--border)' }}>
                <div>
                  <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, color: MUT, fontWeight: 700 }}>{vistaEvolutivo === 'hora' ? 'Meta Total Día' : 'Meta Total Mes'}</div>
                  <strong style={{ fontSize: 13, color: INK }}>{fmtN(d.metaTotalOrdenes)}</strong>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, color: MUT, fontWeight: 700 }}>{vistaEvolutivo === 'hora' ? 'Hora pico' : 'Día pico'}</div>
                  <strong style={{ fontSize: 12.5, color: INK }}>{d.picoLabel}</strong>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, color: MUT, fontWeight: 700 }}>Cump. meta</div>
                  <strong style={{ fontSize: 13, color: d.cumpMetaVal >= 90 ? OK : WARN }}>{d.cumpMetaVal.toFixed(0)}%</strong>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, color: MUT, fontWeight: 700 }}>{vistaEvolutivo === 'hora' ? 'Horas bajo meta' : 'Días bajo meta'}</div>
                  <strong style={{ fontSize: 13, color: d.bajoMetaCount > 0 ? WARN : OK }}>{d.bajoMetaCount} {vistaEvolutivo === 'hora' ? 'hrs' : 'días'}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, fontSize: 11, color: MUT }}>
                <span><b style={{ color: '#F57C00' }}>--</b> {vistaEvolutivo === 'hora' ? 'Meta horaria' : 'Meta diaria'}</span>
                <span><b style={{ color: OK }}>■</b> Efectivas</span>
                <span><b style={{ color: WARN }}>■</b> Fallidas</span>
                <span><b style={{ color: ERR }}>■</b> Perdidas</span>
              </div>
            </div>
          )}
        </div>

        {/* Card 2 */}
        <div>
          <ChartCard
            id="op-brig"
            title={vistaEvolutivo === 'mes' ? "Evolutivo Mensual de Brigadas" : vistaEvolutivo === 'hora' ? "Evolutivo Horario de Brigadas" : "Evolutivo Diario de Brigadas"}
            subtitle={vistaEvolutivo === 'hora' ? "Brigadas reportando actividad en cada hora vs pool contratado." : vistaEvolutivo === 'dia' ? "Brigadas reportando actividad en cada día vs pool contratado." : (d.brigadaActiva ? `Mostrando operativas vs meta de: ${d.brigadaActiva}` : undefined)}
            config={d.chartBrig as never}
            modalConfig={d.isHoraOrDia ? (d.chartBrigTipos as never) : null}
            height="short"
            hasDetail
            onExpand={d.isHoraOrDia ? () => setBrigTiposOpen(true) : undefined}
            detailTableData={(d.isHoraOrDia ? d.tableDataBrigTipos : d.tableDataBrig) as any}
          />
          {(vistaEvolutivo === 'hora' || vistaEvolutivo === 'dia') && (
            <div style={{ background: 'var(--panel)', padding: '10px 14px', borderRadius: '0 0 10px 10px', marginTop: -4, border: '1px solid var(--border)', borderTop: 'none' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center', marginBottom: 8, paddingBottom: 8, borderBottom: '1px dashed var(--border)' }}>
                <div>
                  <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, color: MUT, fontWeight: 700 }}>{vistaEvolutivo === 'hora' ? 'Mejor franja' : 'Mejor día'}</div>
                  <strong style={{ fontSize: 12.5, color: OK }}>{d.digMejorLbl}</strong>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, color: MUT, fontWeight: 700 }}>{vistaEvolutivo === 'hora' ? 'Peor franja' : 'Peor día'}</div>
                  <strong style={{ fontSize: 12.5, color: ERR }}>{d.digPeorLbl}</strong>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, color: MUT, fontWeight: 700 }}>Brecha media</div>
                  <strong style={{ fontSize: 13, color: ERR }}>{d.digBrechaMedia.toFixed(1)} brig</strong>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, color: MUT, fontWeight: 700 }}>Contratadas</div>
                  <strong style={{ fontSize: 13, color: INK }}>{fmtN(d.brigadasDispPool)}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 14, fontSize: 11, color: MUT, flexWrap: 'wrap' }}>
                <span><b style={{ color: TEAL }}>—</b> Digitando</span>
                <span><b style={{ color: MUT }}>--</b> Contratadas ({fmtN(d.brigadasDispPool)})</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 12, height: 8, background: 'rgba(192,57,43,.16)', border: '1px solid rgba(192,57,43,.4)', display: 'inline-block', borderRadius: 2 }} /> Sin digitar
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Card 3: Evolutivo de Efectivas por Tipo de Brigada */}
        <div>
          <ChartCard
            id="op-tipos"
            title={vistaEvolutivo === 'mes' ? "Evolutivo Mensual de Efectivas por Tipo" : vistaEvolutivo === 'hora' ? "Evolutivo Horario de Efectivas por Tipo" : "Evolutivo Diario de Efectivas por Tipo"}
            subtitle={vistaEvolutivo === 'hora' ? "Suma total de órdenes efectivas por franja horaria. Clic en Expandir para ver el detalle por cada tipo de brigada." : vistaEvolutivo === 'dia' ? "Suma total de órdenes efectivas por día. Clic en Expandir para ver el detalle por cada tipo de brigada." : "Suma total de órdenes efectivas por mes. Clic en Expandir para ver el detalle por cada tipo de brigada."}
            config={d.chartTipos as never}
            modalConfig={d.chartTiposModal as never}
            singleCategorySelect
            defaultSelectedCategory={d.tipoLider?.t || d.tiposTotales[0]?.t}
            height="short"
            hasDetail
            detailTableData={d.tableDataTipos as any}
            customLayout={(canvas) => (
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                {/* Cifras de resumen */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, paddingBottom: 10, marginBottom: 8, borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, color: MUT }}>TOTAL EFECTIVAS</div>
                    <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: OK, marginTop: 2 }}>{fmtN(d.granTotalEfectivas)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, color: MUT }}>{vistaEvolutivo === 'hora' ? 'FRANJA PICO' : vistaEvolutivo === 'dia' ? 'DÍA PICO' : 'MES PICO'}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: INK, marginTop: 2 }}>{d.picoFormatted}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, color: MUT }}>TIPO LÍDER</div>
                    <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: INK, marginTop: 2 }}>{d.tipoLider.t} · {d.tipoLiderPct.toFixed(0)}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, color: MUT }}>{vistaEvolutivo === 'hora' ? 'FRANJAS LABORABLES' : 'DÍAS LABORABLES'}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: INK, marginTop: 2 }}>{d.workingPeriodsCount} de {d.totalPeriodsCount}</div>
                  </div>
                </div>

                {/* Canvas del gráfico */}
                <div style={{ height: 200, width: '100%', position: 'relative' }}>
                  {canvas}
                </div>
              </div>
            )}
          />
        </div>
      </div>

      {/* Evolutivo Mensual por Tipo de Brigada */}
      <div style={secH(INDIGO)}><span style={dot(INDIGO)} /> Evolutivo Mensual por Tipo de Brigada</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', marginBottom: 20 }}>
        <ChartCard
          id="op-evolutivo"
          title={vistaEvolutivo === 'mes' ? "Órdenes Mensuales por Tipo de Brigada" : vistaEvolutivo === 'hora' ? "Órdenes Horarias por Tipo de Brigada" : "Órdenes Diarias por Tipo de Brigada"}
          subtitle={d.evSubtitleFull}
          config={d.chartEvolutivo as never}
          hasDetail={false}
          detailTableData={d.tableDataEvolutivo as any}
          headerExtra={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
              <SegmentedControl
                options={[
                  { value: 'mes', label: 'Por mes' },
                  { value: 'dia', label: 'Por día' },
                  { value: 'hora', label: 'Por hora' }
                ]}
                value={vistaEvolutivo}
                onChange={(val) => setVistaEvolutivo(val as 'mes' | 'dia' | 'hora')}
              />

              <ButtonPrimary onClick={() => setMapOpen(true)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Ver en Mapa
              </ButtonPrimary>

              <ButtonGhost onClick={() => setBrigadaModalOpen(true)}>
                <span style={{ fontSize: 14 }}>⤢</span> Expandir
              </ButtonGhost>
            </div>
          }
          customLayout={(canvas) => (
            <div style={{ display: 'flex', flexDirection: 'row', gap: '20px', minHeight: '340px' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.1, color: MUT }}>
                    {vistaEvolutivo === 'mes' ? 'Órdenes por mes' : vistaEvolutivo === 'hora' ? 'Órdenes por hora' : 'Órdenes por día'} {d.brigadaActiva ? `· ${d.brigadaActiva}` : '· por tipo de brigada'}
                  </span>
                </div>
                <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                  {canvas}
                </div>
                {/* Leyenda Chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '12px' }}>
                  {d.tiposConColor.map((x: any) => {
                     const isSelected = d.brigadaActiva === x.t;
                     return (
                       <div key={x.t} onClick={() => setFiltroEvolutivo(x.t)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: isSelected ? 'var(--hover-bg)' : 'var(--panel)', border: isSelected ? `1.5px solid ${x.color}` : '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', opacity: isSelected ? 1 : 0.55 }}>
                         <span style={{ width: 9, height: 9, borderRadius: 3, background: x.color, display: 'inline-block', flexShrink: 0 }} />
                         <span style={{ fontSize: 11.5, color: 'var(--text-body)', fontWeight: isSelected ? 700 : 500 }}>{x.t}</span>
                       </div>
                     );
                  })}
                </div>
              </div>
              {/* Panel Lateral Ranking */}
              <div style={{ width: '280px', borderLeft: '1px solid var(--border)', paddingLeft: '20px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-title)', marginBottom: 12 }}>Detalle por brigada</div>
                {(() => {
                  const bActive = d.brigadaDetalle.find((x: any) => x.brigada === d.brigadaActiva);
                  if (!bActive) return null;
                  const varVal = bActive.varPct === null || bActive.varPct === undefined 
                    ? '—' 
                    : (bActive.varPct >= 0 ? `+${bActive.varPct}%` : `${bActive.varPct}%`);
                  const varColor = bActive.varPct === null || bActive.varPct === undefined 
                    ? MUT 
                    : (bActive.varPct >= 0 ? OK : ERR);

                  return (
                    <div style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, borderLeft: `3px solid ${bActive.color}` }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-title)' }}>{bActive.brigada}</div>
                      <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
                        <div>
                          <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, color: MUT, display: 'block' }}>Total</span>
                          <strong style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--text-title)' }}>{fmtN(bActive.total)}</strong>
                        </div>
                        <div>
                          <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, color: MUT, display: 'block' }}>Participación</span>
                          <strong style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--text-title)' }}>{bActive.partPct}%</strong>
                        </div>
                        <div>
                          <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, color: MUT, display: 'block' }}>{d.varHeader}</span>
                          <strong style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: varColor }}>{varVal}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>
                  {d.brigadaDetalle.slice(0, 10).map((b: any) => {
                    const isSelected = d.brigadaActiva === b.brigada;
                    const bVarVal = b.varPct === null || b.varPct === undefined 
                      ? '—' 
                      : (b.varPct >= 0 ? `+${b.varPct}%` : `${b.varPct}%`);
                    const bVarColor = b.varPct === null || b.varPct === undefined 
                      ? MUT 
                      : (b.varPct >= 0 ? OK : ERR);

                    return (
                      <div key={b.brigada} onClick={() => setFiltroEvolutivo(b.brigada)} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', opacity: isSelected ? 1 : 0.55, padding: '4px 6px', borderRadius: 6, background: isSelected ? 'var(--hover-bg)' : 'transparent' }}>
                        <span style={{ width: 4, height: '100%', minHeight: '24px', background: b.color, borderRadius: 2 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: isSelected ? 700 : 600, color: 'var(--text-body)' }}>{b.brigada}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            <span>{fmtN(b.total)} ({b.partPct}%)</span>
                            <span style={{ fontWeight: 700, color: bVarColor }}>{bVarVal}</span>
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
      {brigTiposOpen && d && d.brigTiposModal && (
        <BrigadaTiposModal
          data={d.brigTiposModal as never}
          vista={vistaEvolutivo === 'hora' ? 'hora' : 'dia'}
          onToggleVista={setVistaEvolutivo}
          onClose={() => setBrigTiposOpen(false)}
        />
      )}
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
        proceso: (filters as any).proceso,
      }} />}
    </>
  );
}