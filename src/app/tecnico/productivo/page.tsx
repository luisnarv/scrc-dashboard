'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '../../components/DashboardProvider';
import { filtRaw, normProy } from '../../components/utils/filters';
import { fmtCOP, num as n } from '../../components/utils/formatters';
import { useTheme } from '../../components/ThemeProvider';
import {ButtonMenuOperativo} from '../../components/Buttons'

interface MonthVal {
  monthLabel: string;
  monthNum: string;
  val: number;
  orders?: number;
}

interface TecnicoProductivoData {
  id: string;
  nombre: string;
  tipoBrigada: string;
  zona: string;
  totalProduccion: number;
  promedioMensual: number;
  trendPct: number;
  slope: number;
  mediaBrigada: number;
  cumplimientoPct: number;
  diffMedia: number;
  estadoTecnico: 'BAJA' | 'NUEVO' | 'ACTIVO';
  esRetirado?: boolean;
  cambioProyecto: 'SIN_CAMBIO' | 'SUR_A_NORTE' | 'NORTE_A_SUR' | 'OTRO_CAMBIO';
  proyectoInicial?: string;
  proyectoActual?: string;
  monthlyData: MonthVal[];
}

interface BrigadaProductivaData {
  tipoCuadrilla: string;
  totalProduccion: number;
  promedioMensual: number;
  trendPct: number;
  slope: number;
  monthlyData: MonthVal[];
}

const isDisponibleType = (tLabel: string) => {
  const s = String(tLabel || '').toLowerCase().trim();
  return (
    s.includes('canasta') ||
    s.includes('minicanasta') ||
    s.includes('mini canasta') ||
    s.includes('mt-at') ||
    s.includes('mt at') ||
    s.includes('gestor') ||
    s.includes('disponible') ||
    s.includes('disponibilidad') ||
    s.includes('multi')
  );
};

function calcSlope(monthlyData: MonthVal[]): number {
  const N = monthlyData.length;
  if (N < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  monthlyData.forEach((m, i) => {
    sumX += i;
    sumY += m.val;
    sumXY += i * m.val;
    sumX2 += i * i;
  });
  const denom = (N * sumX2 - sumX * sumX);
  return denom !== 0 ? (N * sumXY - sumX * sumY) / denom : 0;
}

function getEstadoTecnico(
  monthlyData: MonthVal[],
  porDia: boolean = false,
  esRetirado: boolean = false
): 'BAJA' | 'NUEVO' | 'ACTIVO' {
  // 1. Registro oficial en la tabla de novedades como RETIRO -> BAJA inmediata
  if (esRetirado) {
    return 'BAJA';
  }

  const N = monthlyData.length;
  if (N === 0) return 'BAJA';

  // Helper para validar si un período tuvo actividad de órdenes asignadas/ejecutadas
  // "no es que tenga cero es que no tenga órdenes asignadas": si tiene órdenes o ingresos, estuvo activo
  const tieneActividad = (m: MonthVal) => ((m.orders ?? 0) > 0 || m.val > 0);

  // Si estamos en desglose diario (un solo mes seleccionado):
  // Si el técnico tiene órdenes asignadas/ejecutadas o ingresos en este mes, está ACTIVO
  if (porDia) {
    const totalOrders = monthlyData.reduce((s, m) => s + (m.orders || 0), 0);
    const totalIngresos = monthlyData.reduce((s, m) => s + m.val, 0);
    return (totalOrders > 0 || totalIngresos > 0) ? 'ACTIVO' : 'BAJA';
  }

  // 2. Validación de los 2 meses:
  // Solo se clasifica como BAJA si en los últimos 2 meses consecutivos NO tiene órdenes asignadas/ejecutadas.
  // Si el técnico sí tuvo órdenes asignadas en alguno de esos 2 meses, NO es baja, aunque sus ingresos hayan sido $0.
  if (N >= 2 && !tieneActividad(monthlyData[N - 1]) && !tieneActividad(monthlyData[N - 2])) {
    return 'BAJA';
  }

  // 3. Si tiene un solo mes con órdenes asignadas/actividad y es el último mes de la serie -> NUEVO
  const activeMonths = monthlyData.filter(m => tieneActividad(m));
  if (activeMonths.length === 1 && tieneActividad(monthlyData[N - 1])) {
    return 'NUEVO';
  }

  return 'ACTIVO';
}

function fmtCOPCompact(v: number | string | undefined | null, is8Plus: boolean): string {
  const numVal = Number(v);
  if (!v || isNaN(numVal) || numVal === 0) return '$0';
  if (!is8Plus) return fmtCOP(numVal);
  const a = Math.abs(numVal);
  if (a >= 1e9) return '$' + (numVal / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return '$' + (numVal / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + (numVal / 1e3).toFixed(0) + 'K';
  return '$' + numVal.toFixed(0);
}

/* ---------------- TARJETA DE PRODUCCIÓN POR BRIGADA ($ COP) ---------------- */
function BrigadaProductivaCard({ brig, porDia }: { brig: BrigadaProductivaData; porDia: boolean }) {
  const perLabel = porDia ? '/día' : '/mes';
  const maxVal = Math.max(...brig.monthlyData.map(m => m.val), 1);
  const chartHeight = 85;
  const barCount = brig.monthlyData.length || 1;
  const esDisponible = isDisponibleType(brig.tipoCuadrilla);

  const valFontSize = barCount >= 8 ? 10 : 10.5;
  const monthFontSize = 10;
  const barMaxWidth = barCount >= 8 ? 14 : barCount >= 6 ? 18 : 22;
  const barWidth = barCount >= 8 ? '55%' : '68%';

  const points = brig.monthlyData.map((m, i) => {
    const pctX = ((i + 0.5) / barCount) * 100;
    const hPct = (m.val / maxVal) * 100;
    const y = chartHeight - (hPct * (chartHeight - 24)) / 100 - 4;
    return `${pctX}% ${y}px`;
  }).join(', ');

  const N = brig.monthlyData.length;
  const slope = brig.slope;
  const intercept = (brig.monthlyData.reduce((s, m) => s + m.val, 0) - slope * (N * (N - 1) / 2)) / (N || 1);

  const yStartVal = Math.max(0, intercept);
  const yEndVal = Math.max(0, slope * (N - 1) + intercept);

  const pctXStart = (0.5 / (N || 1)) * 100;
  const pctXEnd = ((N - 0.5) / (N || 1)) * 100;

  const yStartPx = chartHeight - ((yStartVal / maxVal) * (chartHeight - 24)) - 4;
  const yEndPx = chartHeight - ((yEndVal / maxVal) * (chartHeight - 24)) - 4;

  const trendColor = slope >= 0 ? '#2E7D32' : '#C62828';

  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: '14px 16px',
      boxShadow: '0 2px 6px rgba(20,30,60,.05)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      height: 250,
      boxSizing: 'border-box',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', height: 75, overflow: 'hidden' }}>
        <div style={{ overflow: 'hidden', paddingRight: 8 }}>
          <div
            title={brig.tipoCuadrilla}
            style={{
              fontSize: 13.5,
              fontWeight: 800,
              color: 'var(--text-title)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: 0.2
            }}
          >
            {brig.tipoCuadrilla}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span style={{
              padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
              background: esDisponible ? 'rgba(57,73,171,.12)' : 'rgba(46,125,50,.12)',
              color: esDisponible ? 'var(--otc)' : 'var(--ok)',
            }}>
              {esDisponible ? 'Disponible' : 'Productiva'}
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-title)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtCOP(brig.totalProduccion)}
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
            Prom: {fmtCOP(brig.promedioMensual)}{perLabel}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: trendColor, marginTop: 1 }}>
            {slope >= 0 ? '▲ +' : '▼ '}{brig.trendPct.toFixed(1)}%{perLabel}
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', marginTop: 'auto', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: chartHeight, position: 'relative', zIndex: 2 }}>
          {brig.monthlyData.map((m, i) => {
            const hPct = (m.val / maxVal) * 100;
            const barColor = esDisponible ? '#3949AB' : '#00897B';
            return (
              <div key={m.monthLabel} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, overflow: 'hidden' }}>
                <span style={{
                  fontSize: valFontSize,
                  fontWeight: 700,
                  color: 'var(--text-title)',
                  marginBottom: 2,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  lineHeight: 1,
                  textAlign: 'center'
                }}>
                  {m.val > 0 ? fmtCOPCompact(m.val, barCount >= 8) : '$0'}
                </span>
                <div style={{
                  width: barWidth,
                  maxWidth: barMaxWidth,
                  height: `${Math.max(4, (hPct * (chartHeight - 20)) / 100)}px`,
                  background: barColor,
                  borderRadius: '4px 4px 0 0',
                  opacity: 0.85 + (i / barCount) * 0.15,
                }} />
              </div>
            );
          })}
        </div>

        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: chartHeight, overflow: 'visible', pointerEvents: 'none', zIndex: 3 }}>
          {points && (
            <polyline
              fill="none"
              stroke="rgba(80,90,100,0.35)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              points={points}
            />
          )}

          {N >= 2 && (
            <line
              x1={`${pctXStart}%`}
              y1={`${yStartPx}px`}
              x2={`${pctXEnd}%`}
              y2={`${yEndPx}px`}
              stroke={trendColor}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          )}

          {brig.monthlyData.map((m, i) => {
            const pctX = ((i + 0.5) / barCount) * 100;
            const hPct = (m.val / maxVal) * 100;
            const yPx = chartHeight - (hPct * (chartHeight - 24)) / 100 - 4;
            return (
              <circle
                key={i}
                cx={`${pctX}%`}
                cy={`${yPx}px`}
                r="3"
                fill="#ffffff"
                stroke={trendColor}
                strokeWidth="1.8"
              />
            );
          })}
        </svg>

        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 3 }}>
          {brig.monthlyData.map(m => (
            <span key={m.monthLabel} style={{ fontSize: monthFontSize, color: 'var(--text-muted)', fontWeight: 600, flex: 1, textAlign: 'center', lineHeight: 1 }}>
              {m.monthNum}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- TARJETA DE PRODUCCIÓN MONETARIA POR TÉCNICO ---------------- */
function TecnicoProductivoCard({ tec, porDia }: { tec: TecnicoProductivoData; porDia: boolean }) {
  const perLabel = porDia ? '/día' : '/mes';
  const maxVal = Math.max(...tec.monthlyData.map(m => m.val), tec.mediaBrigada, 1);
  const chartHeight = 85;
  const barCount = tec.monthlyData.length || 1;
  const esDisponible = isDisponibleType(tec.tipoBrigada);

  const valFontSize = barCount >= 8 ? 10 : 10.5;
  const monthFontSize = 10;
  const barMaxWidth = barCount >= 8 ? 14 : barCount >= 6 ? 18 : 22;
  const barWidth = barCount >= 8 ? '55%' : '68%';

  const palette = [
    '#d1eae5', '#b5dfd7', '#86cdbe', '#5ebaa7',
    '#41a390', '#288876', '#1c6f60', '#12564a',
    '#0c4238', '#062c25'
  ];

  const points = tec.monthlyData.map((m, i) => {
    const pctX = ((i + 0.5) / barCount) * 100;
    const hPct = (m.val / maxVal) * 100;
    const y = chartHeight - (hPct * (chartHeight - 24)) / 100 - 4;
    return `${pctX}% ${y}px`;
  }).join(', ');

  const N = tec.monthlyData.length;
  const slope = tec.slope;
  const intercept = (tec.monthlyData.reduce((s, m) => s + m.val, 0) - slope * (N * (N - 1) / 2)) / (N || 1);

  const yStartVal = Math.max(0, intercept);
  const yEndVal = Math.max(0, slope * (N - 1) + intercept);

  const pctXStart = (0.5 / (N || 1)) * 100;
  const pctXEnd = ((N - 0.5) / (N || 1)) * 100;

  const yStartPx = chartHeight - ((yStartVal / maxVal) * (chartHeight - 24)) - 4;
  const yEndPx = chartHeight - ((yEndVal / maxVal) * (chartHeight - 24)) - 4;

  const trendColor = slope >= 0 ? '#2E7D32' : '#C62828';

  // Benchmark / Media de Brigada
  const mediaYPx = chartHeight - ((tec.mediaBrigada / maxVal) * (chartHeight - 24)) - 4;
  const cump = tec.cumplimientoPct;
  const cumpColor = cump >= 100 ? '#2E7D32' : cump >= 80 ? '#F57C00' : '#C62828';
  const cumpBg = cump >= 100 ? 'rgba(46,125,50,0.12)' : cump >= 80 ? 'rgba(245,124,0,0.12)' : 'rgba(198,40,40,0.12)';
  const cumpIcon = cump >= 100 ? '🟢' : cump >= 80 ? '🟡' : '🔴';

  // Badge de Estado (BAJA / NUEVO / ACTIVO)
  const estBg = tec.estadoTecnico === 'BAJA' ? 'rgba(198,40,40,0.12)' : tec.estadoTecnico === 'NUEVO' ? 'rgba(25,118,210,0.12)' : 'rgba(46,125,50,0.12)';
  const estColor = tec.estadoTecnico === 'BAJA' ? '#C62828' : tec.estadoTecnico === 'NUEVO' ? '#1976D2' : '#2E7D32';
  const estLabel = tec.estadoTecnico === 'BAJA'
    ? (tec.esRetirado ? '🔴 Retirado' : '🔴 Baja')
    : tec.estadoTecnico === 'NUEVO'
      ? '🆕 Nuevo'
      : '⚡ Activo';

  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: '14px 16px',
      boxShadow: '0 2px 6px rgba(20,30,60,.05)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      height: 250,
      boxSizing: 'border-box',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', height: 80, overflow: 'hidden' }}>
        <div style={{ overflow: 'hidden', paddingRight: 8 }}>
          <div
            title={tec.nombre}
            style={{
              fontSize: 13.5,
              fontWeight: 800,
              color: 'var(--text-title)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: 0.2
            }}
          >
            {tec.nombre}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {tec.tipoBrigada} · <span style={{ opacity: 0.8 }}>{tec.zona}</span>
            </span>
            <span style={{
              padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700,
              background: esDisponible ? 'rgba(57,73,171,.12)' : 'rgba(46,125,50,.12)',
              color: esDisponible ? 'var(--otc)' : 'var(--ok)',
            }}>
              {esDisponible ? 'Disponible' : 'Productiva'}
            </span>
            <span style={{
              padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700,
              background: estBg, color: estColor,
            }}>
              {estLabel}
            </span>
            {tec.cambioProyecto !== 'SIN_CAMBIO' && (
              <span style={{
                padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                background: 'rgba(103,58,183,.12)', color: '#673AB7',
              }}>
                🔄 {tec.proyectoInicial} ➔ {tec.proyectoActual}
              </span>
            )}
          </div>

          {/* Badge de Comparación vs Media de Brigada en $ COP */}
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              padding: '2px 6px',
              borderRadius: 5,
              fontSize: 10,
              fontWeight: 800,
              background: cumpBg,
              color: cumpColor,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3
            }}>
              <span>{cumpIcon}</span> {cump}% vs Media ({fmtCOP(tec.mediaBrigada)}/m)
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-title)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtCOP(tec.totalProduccion)}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
            Prom: {fmtCOP(tec.promedioMensual)}{perLabel}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: trendColor, marginTop: 1 }}>
            {slope >= 0 ? '▲ +' : '▼ '}{tec.trendPct.toFixed(1)}%{perLabel}
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', marginTop: 'auto', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: chartHeight, position: 'relative', zIndex: 2 }}>
          {tec.monthlyData.map((m, i) => {
            const hPct = (m.val / maxVal) * 100;
            const barColor = palette[i % palette.length];
            return (
              <div key={m.monthLabel} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, overflow: 'hidden' }}>
                <span style={{
                  fontSize: valFontSize,
                  fontWeight: 700,
                  color: 'var(--text-title)',
                  marginBottom: 2,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  lineHeight: 1,
                  textAlign: 'center'
                }}>
                  {m.val > 0 ? fmtCOPCompact(m.val, barCount >= 8) : '$0'}
                </span>
                <div style={{
                  width: barWidth,
                  maxWidth: barMaxWidth,
                  height: `${Math.max(4, (hPct * (chartHeight - 20)) / 100)}px`,
                  background: barColor,
                  borderRadius: '4px 4px 0 0',
                  opacity: 0.85 + (i / barCount) * 0.15,
                  transition: 'height .3s',
                }} />
              </div>
            );
          })}
        </div>

        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: chartHeight, overflow: 'visible', pointerEvents: 'none', zIndex: 3 }}>
          {/* Línea horizontal de Media de Brigada en Ingresos */}
          <line
            x1="0"
            y1={`${mediaYPx}px`}
            x2="100%"
            y2={`${mediaYPx}px`}
            stroke="#00897B"
            strokeWidth="1.2"
            strokeDasharray="4 2"
            opacity="0.75"
          />

          {points && (
            <polyline
              fill="none"
              stroke="rgba(80,90,100,0.35)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              points={points}
            />
          )}

          {N >= 2 && (
            <line
              x1={`${pctXStart}%`}
              y1={`${yStartPx}px`}
              x2={`${pctXEnd}%`}
              y2={`${yEndPx}px`}
              stroke={trendColor}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          )}

          {tec.monthlyData.map((m, i) => {
            const pctX = ((i + 0.5) / barCount) * 100;
            const hPct = (m.val / maxVal) * 100;
            const yPx = chartHeight - (hPct * (chartHeight - 24)) / 100 - 4;
            return (
              <circle
                key={i}
                cx={`${pctX}%`}
                cy={`${yPx}px`}
                r="3"
                fill="#ffffff"
                stroke={trendColor}
                strokeWidth="1.8"
              />
            );
          })}
        </svg>

        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 3 }}>
          {tec.monthlyData.map(m => (
            <span key={m.monthLabel} style={{ fontSize: monthFontSize, color: 'var(--text-muted)', fontWeight: 600, flex: 1, textAlign: 'center', lineHeight: 1 }}>
              {m.monthNum}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TecnicoProductivoPage() {
  const { raw, filters, loading, error } = useDashboard();
  const { colors } = useTheme();

  const [q, setQ] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('ALL');
  const [categoriaFiltro, setCategoriaFiltro] = useState<'ALL' | 'OPERATIVA' | 'DISPONIBLE'>('ALL');
  const [trendFiltro, setTrendFiltro] = useState<'ALL' | 'UP' | 'DOWN'>('ALL');
  const [estadoFiltro, setEstadoFiltro] = useState<'ALL' | 'ACTIVO' | 'NUEVO' | 'BAJA'>('ALL');
  const [movilidadFiltro, setMovilidadFiltro] = useState<'ALL' | 'CAMBIO' | 'SUR_A_NORTE' | 'NORTE_A_SUR' | 'SIN_CAMBIO'>('ALL');
  const [sortOrder, setSortOrder] = useState<'total' | 'cump' | 'trend' | 'nombre'>('total');
  const [pageSize, setPageSize] = useState(24);
  const [page, setPage] = useState(1);

  const TEAL = colors.sip;
  const INDIGO = colors.otc;
  const INK = colors.ink;
  const MUT = colors.mut;
  const LINE = 'var(--border)';

  const { cardsData, brigadasCardsData, availableBrigadas, mesesList, porDia } = useMemo(() => {
    if (!raw) {
      return {
        cardsData: [] as TecnicoProductivoData[],
        brigadasCardsData: [] as BrigadaProductivaData[],
        availableBrigadas: [] as string[],
        mesesList: [] as string[],
        porDia: false
      };
    }

    // Filtrar los registros según los Filtros Generales del Dashboard
    const rows = filtRaw(raw.raw, filters);

    // Eje temporal adaptable: con UN solo mes seleccionado el desglose es por DÍA
    // (YYYY-MM-DD); con varios meses (o ninguno) se agrega por MES (YYYY-MM).
    const porDia = filters.mes.length === 1;
    const bucketKey = (f: string) => (porDia ? f.substring(0, 10) : f.substring(0, 7));
    const bucketNum = (b: string) => (porDia ? b.slice(-2) : (b.split('-')[1] || b));

    const mesesSet = new Set<string>();
    rows.forEach(r => {
      const d = String(r.Fecha || '');
      if (d) mesesSet.add(bucketKey(d));
    });
    const mesesList = Array.from(mesesSet).sort();

    // 1. Agrupar por Tipo de Brigada para ingresos ($ COP)
    const brigMap: Record<string, {
      tipoBrigada: string;
      tecnicosSet: Set<string>;
      byMonth: Record<string, number>;
    }> = {};

    // 2. Agrupar por Técnico para ingresos ($ COP), órdenes asignadas y trazabilidad
    const tecMap: Record<string, {
      id: string;
      nombre: string;
      zona: string;
      tipoCounts: Record<string, number>;
      byMonth: Record<string, number>;
      ordersByMonth: Record<string, number>;
      proyByMonth: Record<string, string>;
      esRetirado: boolean;
    }> = {};

    const tiposSet = new Set<string>();

    for (const r of rows) {
      const rawCed = String(r.Cedula || '').trim();
      const cleanCed = rawCed ? rawCed.replace(/\.0+$/, '').replace(/\D/g, '') : '';
      const id = cleanCed || String(r.Nombre || '').trim();
      if (!id) continue;
      const nombre = String(r.Nombre || id);
      const tipo = String(
        r.Tipo_Brigada_Operaciones ||
        r.Tipo_Brigada_Mes ||
        r.Tipo_Cuadrilla ||
        r.Tipo_Brigada ||
        'Sin Tipo'
      ).trim();
      const zona = String(r._Zona || r.Zona || 'Sin Zona');
      const proy = String(r._Proyecto || normProy(r.Zona) || r.Zona || 'Sin Proyecto');
      const month = bucketKey(String(r.Fecha || ''));
      const ing = n(r.Ingresos);
      const ords = n(r.Asignacion) || n(r.Visitas) || (n(r.Efectivas) + n(r.Fallidas) + n(r.Perdidas)) || (ing > 0 ? 1 : 0);
      const obs = String(r.Observacion || (r as Record<string, unknown>).observacion || '').toUpperCase();
      const esRetiro = obs.includes('RETIRO');

      if (tipo && tipo !== 'Sin Tipo') tiposSet.add(tipo);

      // Agrupación Brigada
      if (tipo && tipo !== 'Sin Tipo') {
        const bEntry = (brigMap[tipo] ??= { tipoBrigada: tipo, tecnicosSet: new Set(), byMonth: {} });
        bEntry.tecnicosSet.add(id);
        bEntry.byMonth[month] = (bEntry.byMonth[month] || 0) + ing;
      }

      // Agrupación Técnico
      const entry = (tecMap[id] ??= {
        id,
        nombre,
        zona,
        tipoCounts: {},
        byMonth: {},
        ordersByMonth: {},
        proyByMonth: {},
        esRetirado: false,
      });
      entry.byMonth[month] = (entry.byMonth[month] || 0) + ing;
      entry.ordersByMonth[month] = (entry.ordersByMonth[month] || 0) + ords;
      entry.tipoCounts[tipo] = (entry.tipoCounts[tipo] || 0) + (ing || 1);
      if (month && proy) entry.proyByMonth[month] = proy;
      if (esRetiro) entry.esRetirado = true;
    }

    // Tarjetas de Producción por Brigadas ($ COP)
    const brigadasCardsData: BrigadaProductivaData[] = Object.values(brigMap).map(b => {
      const monthlyData: MonthVal[] = mesesList.map(m => ({
        monthLabel: m,
        monthNum: bucketNum(m),
        val: b.byMonth[m] || 0,
      }));

      const activeVals = monthlyData.filter(m => m.val > 0);
      const totalProduccion = activeVals.reduce((s, m) => s + m.val, 0);
      const promedioMensual = Math.round(totalProduccion / (activeVals.length || 1));
      const slope = calcSlope(monthlyData);

      let trendPct = 0;
      if (monthlyData.length >= 2) {
        const lastVal = monthlyData[monthlyData.length - 1].val;
        const prevVal = monthlyData[monthlyData.length - 2].val;
        if (prevVal > 0) {
          trendPct = ((lastVal - prevVal) / prevVal) * 100;
        } else if (lastVal > 0) {
          trendPct = 100;
        }
      }

      return {
        tipoCuadrilla: b.tipoBrigada,
        totalProduccion,
        promedioMensual,
        trendPct,
        slope,
        monthlyData,
      };
    }).sort((a, b) => b.totalProduccion - a.totalProduccion);

    // Pre-calcular lista de técnicos y su media de brigada en $ COP
    const tecsListRaw = Object.values(tecMap).map(tec => {
      const tipoBrigada = Object.entries(tec.tipoCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Sin Tipo';

      const monthlyData: MonthVal[] = mesesList.map(m => ({
        monthLabel: m,
        monthNum: bucketNum(m),
        val: tec.byMonth[m] || 0,
        orders: tec.ordersByMonth[m] || 0,
      }));

      const activeVals = monthlyData.filter(m => m.val > 0);
      const totalProduccion = activeVals.reduce((s, m) => s + m.val, 0);
      const promedioMensual = Math.round(totalProduccion / (activeVals.length || 1));
      const slope = calcSlope(monthlyData);

      let trendPct = 0;
      if (monthlyData.length >= 2) {
        const lastVal = monthlyData[monthlyData.length - 1].val;
        const prevVal = monthlyData[monthlyData.length - 2].val;
        if (prevVal > 0) {
          trendPct = ((lastVal - prevVal) / prevVal) * 100;
        } else if (lastVal > 0) {
          trendPct = 100;
        }
      }

      const estadoTecnico = getEstadoTecnico(monthlyData, porDia, tec.esRetirado);

      // Evaluar Movilidad de Proyecto (Traslado)
      const sortedMonthsProy = Object.keys(tec.proyByMonth).sort();
      let cambioProyecto: 'SIN_CAMBIO' | 'SUR_A_NORTE' | 'NORTE_A_SUR' | 'OTRO_CAMBIO' = 'SIN_CAMBIO';
      let proyectoInicial = '';
      let proyectoActual = '';

      if (sortedMonthsProy.length >= 2) {
        proyectoInicial = tec.proyByMonth[sortedMonthsProy[0]];
        proyectoActual = tec.proyByMonth[sortedMonthsProy[sortedMonthsProy.length - 1]];
        const proysSet = new Set(Object.values(tec.proyByMonth));

        if (proysSet.size > 1) {
          if (proyectoInicial === 'Sur' && (proyectoActual === 'Norte-Centro' || proyectoActual.includes('Norte'))) {
            cambioProyecto = 'SUR_A_NORTE';
          } else if ((proyectoInicial === 'Norte-Centro' || proyectoInicial.includes('Norte')) && proyectoActual === 'Sur') {
            cambioProyecto = 'NORTE_A_SUR';
          } else {
            cambioProyecto = 'OTRO_CAMBIO';
          }
        }
      }

      return {
        id: tec.id,
        nombre: tec.nombre,
        tipoBrigada,
        zona: tec.zona,
        totalProduccion,
        promedioMensual,
        trendPct,
        slope,
        estadoTecnico,
        esRetirado: tec.esRetirado,
        cambioProyecto,
        proyectoInicial,
        proyectoActual,
        monthlyData,
      };
    });

    // Calcular media por tipo de brigada en $ COP
    const brigadaSumProm: Record<string, number> = {};
    const brigadaCountTec: Record<string, number> = {};

    tecsListRaw.forEach(t => {
      if (t.tipoBrigada && t.tipoBrigada !== 'Sin Tipo') {
        brigadaSumProm[t.tipoBrigada] = (brigadaSumProm[t.tipoBrigada] || 0) + t.promedioMensual;
        brigadaCountTec[t.tipoBrigada] = (brigadaCountTec[t.tipoBrigada] || 0) + 1;
      }
    });

    const mediaBrigadaMap: Record<string, number> = {};
    Object.keys(brigadaSumProm).forEach(tipo => {
      mediaBrigadaMap[tipo] = Math.round(brigadaSumProm[tipo] / (brigadaCountTec[tipo] || 1));
    });

    // Tarjetas de Técnicos en $ COP
    const cardsData: TecnicoProductivoData[] = tecsListRaw.map(tec => {
      const mediaBrigada = mediaBrigadaMap[tec.tipoBrigada] || tec.promedioMensual || 1;
      const cumplimientoPct = Math.round((tec.promedioMensual / mediaBrigada) * 100);
      const diffMedia = tec.promedioMensual - mediaBrigada;

      return {
        ...tec,
        mediaBrigada,
        cumplimientoPct,
        diffMedia,
      };
    });

    const availableBrigadas = Array.from(tiposSet).sort();

    return { cardsData, brigadasCardsData, availableBrigadas, mesesList, porDia };
  }, [raw, filters]);

  // Options de brigadas con filtros aplicados
  const filteredAvailableBrigadas = useMemo(() => {
    let pool = cardsData;
    if (categoriaFiltro === 'OPERATIVA') {
      pool = pool.filter(c => !isDisponibleType(c.tipoBrigada));
    } else if (categoriaFiltro === 'DISPONIBLE') {
      pool = pool.filter(c => isDisponibleType(c.tipoBrigada));
    }
    if (trendFiltro === 'UP') {
      pool = pool.filter(c => c.slope >= 0);
    } else if (trendFiltro === 'DOWN') {
      pool = pool.filter(c => c.slope < 0);
    }
    if (estadoFiltro !== 'ALL') {
      pool = pool.filter(c => c.estadoTecnico === estadoFiltro);
    }
    if (movilidadFiltro === 'CAMBIO') {
      pool = pool.filter(c => c.cambioProyecto !== 'SIN_CAMBIO');
    } else if (movilidadFiltro === 'SUR_A_NORTE') {
      pool = pool.filter(c => c.cambioProyecto === 'SUR_A_NORTE');
    } else if (movilidadFiltro === 'NORTE_A_SUR') {
      pool = pool.filter(c => c.cambioProyecto === 'NORTE_A_SUR');
    } else if (movilidadFiltro === 'SIN_CAMBIO') {
      pool = pool.filter(c => c.cambioProyecto === 'SIN_CAMBIO');
    }
    if (q.trim()) {
      const query = q.trim().toLowerCase();
      pool = pool.filter(c => c.nombre.toLowerCase().includes(query) || c.id.includes(query));
    }
    const set = new Set<string>();
    pool.forEach(c => {
      if (c.tipoBrigada && c.tipoBrigada !== 'Sin Tipo') set.add(c.tipoBrigada);
    });
    return Array.from(set).sort();
  }, [cardsData, categoriaFiltro, trendFiltro, estadoFiltro, movilidadFiltro, q]);

  if (tipoFiltro !== 'ALL' && !filteredAvailableBrigadas.includes(tipoFiltro)) {
    setTipoFiltro('ALL');
  }

  // Filtrado de tarjetas de brigadas de producción ($ COP)
  const filteredBrigadaCards = useMemo(() => {
    let arr = brigadasCardsData.slice();
    if (categoriaFiltro === 'OPERATIVA') {
      arr = arr.filter(b => !isDisponibleType(b.tipoCuadrilla));
    } else if (categoriaFiltro === 'DISPONIBLE') {
      arr = arr.filter(b => isDisponibleType(b.tipoCuadrilla));
    }
    if (tipoFiltro !== 'ALL') {
      arr = arr.filter(b => b.tipoCuadrilla === tipoFiltro);
    }
    if (trendFiltro === 'UP') {
      arr = arr.filter(b => b.slope >= 0);
    } else if (trendFiltro === 'DOWN') {
      arr = arr.filter(b => b.slope < 0);
    }
    return arr;
  }, [brigadasCardsData, categoriaFiltro, tipoFiltro, trendFiltro]);

  // Filtrado y ordenamiento de tarjetas de técnicos ($ COP)
  const filteredCards = useMemo(() => {
    let arr = cardsData.slice();

    if (categoriaFiltro === 'OPERATIVA') {
      arr = arr.filter(c => !isDisponibleType(c.tipoBrigada));
    } else if (categoriaFiltro === 'DISPONIBLE') {
      arr = arr.filter(c => isDisponibleType(c.tipoBrigada));
    }

    if (tipoFiltro !== 'ALL') {
      arr = arr.filter(c => c.tipoBrigada === tipoFiltro);
    }

    if (trendFiltro === 'UP') {
      arr = arr.filter(c => c.slope >= 0);
    } else if (trendFiltro === 'DOWN') {
      arr = arr.filter(c => c.slope < 0);
    }

    if (estadoFiltro !== 'ALL') {
      arr = arr.filter(c => c.estadoTecnico === estadoFiltro);
    }

    if (movilidadFiltro === 'CAMBIO') {
      arr = arr.filter(c => c.cambioProyecto !== 'SIN_CAMBIO');
    } else if (movilidadFiltro === 'SUR_A_NORTE') {
      arr = arr.filter(c => c.cambioProyecto === 'SUR_A_NORTE');
    } else if (movilidadFiltro === 'NORTE_A_SUR') {
      arr = arr.filter(c => c.cambioProyecto === 'NORTE_A_SUR');
    } else if (movilidadFiltro === 'SIN_CAMBIO') {
      arr = arr.filter(c => c.cambioProyecto === 'SIN_CAMBIO');
    }

    if (q.trim()) {
      const query = q.trim().toLowerCase();
      arr = arr.filter(c => c.nombre.toLowerCase().includes(query) || c.id.includes(query));
    }

    arr.sort((a, b) => {
      if (sortOrder === 'total') return b.totalProduccion - a.totalProduccion;
      if (sortOrder === 'cump') return b.cumplimientoPct - a.cumplimientoPct;
      if (sortOrder === 'trend') return b.trendPct - a.trendPct;
      return a.nombre.localeCompare(b.nombre);
    });

    return arr;
  }, [cardsData, categoriaFiltro, tipoFiltro, trendFiltro, estadoFiltro, movilidadFiltro, q, sortOrder]);

  // Paginación
  const totalPages = Math.ceil(filteredCards.length / pageSize) || 1;
  const paginatedCards = filteredCards.slice((page - 1) * pageSize, page * pageSize);

  if (loading) return <div className="loading-wrap"><div className="spinner" /><span>Cargando datos de producción por técnico…</span></div>;
  if (error) return <div className="status err">{error}</div>;

  const countOperativas = cardsData.filter(c => !isDisponibleType(c.tipoBrigada)).length;
  const countDisponibles = cardsData.filter(c => isDisponibleType(c.tipoBrigada)).length;

  const countActivos = cardsData.filter(c => c.estadoTecnico === 'ACTIVO').length;
  const countNuevos = cardsData.filter(c => c.estadoTecnico === 'NUEVO').length;
  const countBajas = cardsData.filter(c => c.estadoTecnico === 'BAJA').length;

  const countCambios = cardsData.filter(c => c.cambioProyecto !== 'SIN_CAMBIO').length;
  const countSurANorte = cardsData.filter(c => c.cambioProyecto === 'SUR_A_NORTE').length;
  const countNorteASur = cardsData.filter(c => c.cambioProyecto === 'NORTE_A_SUR').length;

  const dot = (c: string): React.CSSProperties => ({
    display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: c, marginRight: 8
  });
  const secH = (c: string): React.CSSProperties => ({
    fontSize: 13, fontWeight: 700, color: c, textTransform: 'uppercase', letterSpacing: 0.8,
    display: 'flex', alignItems: 'center', marginBottom: 12
  });


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Cabecera del Módulo */}
      <ButtonMenuOperativo/>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, color: INK }}>Evolutivo Monetario por Brigada y Técnico (Producción $ COP)</div>
          <div style={{ fontSize: 12.5, color: MUT, marginTop: 2 }}>
            Monitoreo en tiempo real de ingresos monetarios ($ COP) por brigada y técnico
          </div>
        </div>

        {/* Barra de Filtros Locales */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Buscar técnico por nombre o cédula..."
            value={q}
            onChange={e => { setQ(e.target.value); setPage(1); }}
            style={{
              padding: '8px 14px', borderRadius: 8, border: `1px solid ${LINE}`,
              background: 'var(--panel)', color: INK, fontSize: 12.5, outline: 'none', width: 250
            }}
          />

          <select
            value={categoriaFiltro}
            onChange={e => { setCategoriaFiltro(e.target.value as any); setTipoFiltro('ALL'); setPage(1); }}
            style={{
              padding: '8px 12px', borderRadius: 8, border: `1px solid ${LINE}`,
              background: 'var(--panel)', color: INK, fontSize: 12.5, outline: 'none', fontWeight: 700
            }}
          >
            <option value="ALL">Categoría: Todas ({cardsData.length})</option>
            <option value="OPERATIVA">⚡ Productivas / Operativas ({countOperativas})</option>
            <option value="DISPONIBLE">📋 Disponibles ({countDisponibles})</option>
          </select>

          <select
            value={estadoFiltro}
            onChange={e => { setEstadoFiltro(e.target.value as any); setPage(1); }}
            style={{
              padding: '8px 12px', borderRadius: 8, border: `1px solid ${LINE}`,
              background: 'var(--panel)', color: INK, fontSize: 12.5, outline: 'none', fontWeight: 700
            }}
          >
            <option value="ALL">Estado Técnico: Todos ({cardsData.length})</option>
            <option value="ACTIVO">⚡ Activos ({countActivos})</option>
            <option value="NUEVO">🆕 Nuevos (1er mes activo) ({countNuevos})</option>
            <option value="BAJA">🔴 Bajas / Retirados ({countBajas})</option>
          </select>

          <select
            value={movilidadFiltro}
            onChange={e => { setMovilidadFiltro(e.target.value as any); setPage(1); }}
            style={{
              padding: '8px 12px', borderRadius: 8, border: `1px solid ${LINE}`,
              background: 'var(--panel)', color: INK, fontSize: 12.5, outline: 'none', fontWeight: 700
            }}
          >
            <option value="ALL">Movilidad: Todos los Proyectos</option>
            <option value="CAMBIO">🔄 Cambió de Proyecto (Cualquiera) ({countCambios})</option>
            <option value="SUR_A_NORTE">🔄 De Sur ➔ Norte-Centro ({countSurANorte})</option>
            <option value="NORTE_A_SUR">🔄 De Norte-Centro ➔ Sur ({countNorteASur})</option>
            <option value="SIN_CAMBIO">🏠 Mismo Proyecto (Sin traslado)</option>
          </select>

          <select
            value={tipoFiltro}
            onChange={e => { setTipoFiltro(e.target.value); setPage(1); }}
            style={{
              padding: '8px 12px', borderRadius: 8, border: `1px solid ${LINE}`,
              background: 'var(--panel)', color: INK, fontSize: 12.5, outline: 'none'
            }}
          >
            <option value="ALL">Tipo de Brigada: Todas ({filteredAvailableBrigadas.length})</option>
            {filteredAvailableBrigadas.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <select
            value={trendFiltro}
            onChange={e => { setTrendFiltro(e.target.value as any); setPage(1); }}
            style={{
              padding: '8px 12px', borderRadius: 8, border: `1px solid ${LINE}`,
              background: 'var(--panel)', color: INK, fontSize: 12.5, outline: 'none', fontWeight: 700
            }}
          >
            <option value="ALL">Mostrar Tendencia: Todas</option>
            <option value="UP">📈 Mostrar: Solo Aumento (▲ verde)</option>
            <option value="DOWN">📉 Mostrar: Solo Disminución (▼ rojo)</option>
          </select>

          <select
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value as 'total' | 'cump' | 'trend' | 'nombre')}
            style={{
              padding: '8px 12px', borderRadius: 8, border: `1px solid ${LINE}`,
              background: 'var(--panel)', color: INK, fontSize: 12.5, outline: 'none'
            }}
          >
            <option value="total">Ordenar por: Mayor producción ($ COP)</option>
            <option value="cump">Ordenar por: Mayor % Cumplimiento vs Media</option>
            <option value="trend">Ordenar por: Mayor crecimiento %</option>
            <option value="nombre">Ordenar por: Nombre (A-Z)</option>
          </select>
        </div>
      </div>

      {/* SECCIÓN 1: EVOLUTIVO MENSUAL DE PRODUCCIÓN POR BRIGADA ($ COP) */}
      {filteredBrigadaCards.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={secH(INDIGO)}>
            <span style={dot(INDIGO)} /> Evolutivo Mensual de Producción por Brigada ({filteredBrigadaCards.length} especialidades · $ COP)
          </div>

          <div className="cards-grid-3">
            {filteredBrigadaCards.map(brig => (
              <BrigadaProductivaCard key={brig.tipoCuadrilla} brig={brig} porDia={porDia} />
            ))}
          </div>
        </section>
      )}

      {/* SECCIÓN 2: GRID DE TARJETAS DE PRODUCCIÓN MONETARIA POR TÉCNICO ($ COP) */}
      <section style={{ marginTop: 8 }}>
        <div style={secH(TEAL)}><span style={dot(TEAL)} /> Evolutivo Mensual de Producción por Técnico ({filteredCards.length} técnicos · $ COP)</div>
        {paginatedCards.length > 0 ? (
          <div className="cards-grid-3">
            {paginatedCards.map(tec => (
              <TecnicoProductivoCard key={tec.id} tec={tec} porDia={porDia} />
            ))}
          </div>
        ) : (
          <div style={{
            padding: 40, textAlign: 'center', background: 'var(--panel)',
            borderRadius: 14, border: `1px solid ${LINE}`, color: MUT, fontSize: 13
          }}>
            No se encontraron técnicos con la combinación de filtros ingresada.
          </div>
        )}
      </section>

      {/* Barra de Paginación */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 18px', background: 'var(--panel)', borderRadius: 12,
          border: `1px solid ${LINE}`, marginTop: 4
        }}>
          <span style={{ fontSize: 12, color: MUT }}>
            Página <b style={{ color: INK }}>{page}</b> de <b style={{ color: INK }}>{totalPages}</b> · {filteredCards.length} técnicos
          </span>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{
                padding: '6px 14px', borderRadius: 8, border: `1px solid ${LINE}`,
                background: page <= 1 ? 'transparent' : TEAL,
                color: page <= 1 ? MUT : '#fff', fontWeight: 700, cursor: page <= 1 ? 'not-allowed' : 'pointer'
              }}
            >
              ← Anterior
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              style={{
                padding: '6px 14px', borderRadius: 8, border: `1px solid ${LINE}`,
                background: page >= totalPages ? 'transparent' : TEAL,
                color: page >= totalPages ? MUT : '#fff', fontWeight: 700, cursor: page >= totalPages ? 'not-allowed' : 'pointer'
              }}
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
