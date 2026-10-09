'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import { esFestivo } from '../components/utils/holidays';
import { getMinutosTrabajoHora } from '../components/utils/metasBrigadas';
import { fmtN } from '../components/utils/formatters';
import { useTheme } from '../components/ThemeProvider';
import ModalShell, { RailSegmented, RailSelect, RailSearch, type RailSerie, type RailKpi, type ViewMode } from '../components/ModalShell';
import ModalChart from '../components/ModalChart';
import { CHART_FIXED, cssVar, withAlpha } from '../components/utils/chartTheme';
import { descargarCsv, descargarPngDeCanvas, nombreArchivo } from '../components/utils/exportFile';

/* Bandas de franja no laborable (almuerzo / fuera de jornada / domingo / festivo). */
const bandsPlugin = {
  id: 'bandsBrigTipos',
  beforeDatasetsDraw(chart: any, _args: any, options: any) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales || !scales.x) return;
    const { top, bottom, left, right } = chartArea;
    const { x } = scales;
    const fecha = options?.fecha || '';
    const zona = options?.zona || '';
    const esHora = options?.esHora;
    const ticks = x.ticks || [];
    // Color de la franja según el tema (el canvas no entiende var()).
    const base = cssVar('--text-muted') || '#8c9382';
    const cFondo = withAlpha(base, 0.10);
    const cTrama = withAlpha(base, 0.22);
    const cTexto = withAlpha(base, 0.9);
    ticks.forEach((tick: any, index: number) => {
      const label = x.getLabelForValue ? x.getLabelForValue(tick.value) : tick.label;
      if (typeof label !== 'string') return;
      let isNonWorking = false;
      let text = '';
      if (esHora) {
        isNonWorking = getMinutosTrabajoHora(label, fecha, zona) === 0;
        text = label === '12:00' ? 'Almuerzo' : 'Fuera de jornada';
      } else {
        const fullDateStr = options?.diasFull?.[tick.value] || chart.data?.labels?.[tick.value] || label;
        const resolvedDateStr = typeof fullDateStr === 'string' && fullDateStr.length === 2 ? `${fecha.slice(0, 7)}-${fullDateStr}` : String(fullDateStr);
        const parts = resolvedDateStr.split('-').map(Number);
        if (parts.length === 3) {
          const dt = new Date(parts[0], parts[1] - 1, parts[2]);
          isNonWorking = dt.getDay() === 0 || esFestivo(dt);
          text = dt.getDay() === 0 ? 'Domingo' : 'Festivo';
        }
      }
      if (!isNonWorking) return;
      const xPos = x.getPixelForTick(index);
      const nextPos = index < ticks.length - 1 ? x.getPixelForTick(index + 1) : null;
      const prevPos = index > 0 ? x.getPixelForTick(index - 1) : null;
      let halfWidth = 14;
      if (nextPos !== null) halfWidth = Math.abs(nextPos - xPos) / 2;
      else if (prevPos !== null) halfWidth = Math.abs(xPos - prevPos) / 2;
      const slotLeft = Math.max(left, xPos - halfWidth);
      const slotRight = Math.min(right, xPos + halfWidth);
      const slotWidth = slotRight - slotLeft;
      const slotHeight = bottom - top;
      if (slotWidth <= 0) return;
      ctx.save();
      ctx.fillStyle = cFondo;
      ctx.fillRect(slotLeft, top, slotWidth, slotHeight);
      ctx.save();
      ctx.beginPath(); ctx.rect(slotLeft, top, slotWidth, slotHeight); ctx.clip();
      ctx.strokeStyle = cTrama; ctx.lineWidth = 1.4; ctx.beginPath();
      for (let xLine = slotLeft - slotHeight; xLine < slotRight + slotHeight; xLine += 8) {
        ctx.moveTo(xLine, bottom); ctx.lineTo(xLine + slotHeight, top);
      }
      ctx.stroke(); ctx.restore();
      if (text) {
        ctx.font = '600 10px sans-serif'; ctx.fillStyle = cTexto;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.save(); ctx.translate(xPos, top + slotHeight / 2); ctx.rotate(-Math.PI / 2);
        ctx.fillText(text, 0, 0); ctx.restore();
      }
      ctx.restore();
    });
  }
};

const SHORT_BRIG: Record<string, string> = {
  'BRIGADA PESADA': 'Pesada', 'SCR PESADA': 'Pesada', 'BRIGADA TIPO PESADA': 'Pesada',
  'BRIGADA LIVIANA': 'Liviana', 'SCR LIVIANA': 'Liviana', 'BRIGADA TIPO LIVIANA': 'Liviana',
  'GESTOR INTEGRAL MULTI': 'Multifam.', 'SCR MULTIFAMILIAR': 'Multifam.',
  'BRIGADA MINICANASTA': 'Minicanasta', 'SCR MINI CANASTA': 'Minicanasta', 'BRIGADA TIPO MINICANASTA': 'Minicanasta',
  'BRIGADA PESADA MT-AT': 'Medida esp.', 'SCR MEDIDA ESPECIAL': 'Medida esp.', 'BRIGADA PESADA/ MT AT': 'Medida esp.',
  'BRIGADA CANASTA': 'Canasta', 'CANASTA': 'Canasta', 'BRIGADA TIPO CANASTA': 'Canasta',
  '(D) BRIGADA PESADA': 'Pesada Disp.', 'PESADA DISPONIBLE': 'Pesada Disp.', '(D) BRIGADA TIPO PESADA': 'Pesada Disp.',
};
const shortBrig = (t: string) => SHORT_BRIG[String(t).trim().toUpperCase()] || t;

export interface ModalTipoItem {
  label: string;
  color: string;
  total: number;
  efec: number;
  fall: number;
  perd: number;
  brigadas: number;
  pico: number;
  promedio: number;
  constancia: string;
  serieHora: (number | null)[];
  serieDia: (number | null)[];
  serieMes: (number | null)[];
}

export interface ModalTechItem {
  ced: string;
  nom: string;
  tipo: string;
  total: number;
  efec: number;
  fall: number;
  perd: number;
  byHour: (number | null)[];
  byDay: (number | null)[];
  byMonth: (number | null)[];
  pico: number;
  promedio: number;
}

export interface BrigTiposData {
  esHora: boolean;
  fecha: string;
  zona: string;
  pool: number;
  jornada: string;
  fechaTexto: string;
  labelsHora: string[];
  labelsDia: string[];
  labelsMes: string[];
  diasFull: string[];
  tipos: ModalTipoItem[];
  techs: ModalTechItem[];
  promedioSerieHora?: (number | null)[];
  promedioSerieDia?: (number | null)[];
  promedioSerieMes?: (number | null)[];
}

const OK = 'var(--ok)';
const INK = 'var(--text-title)';
const MUT = 'var(--text-muted)';
const LINE = 'var(--border)';
const TEAL = 'var(--sip)';

export default function BrigadaTiposModal({
  data,
  vista,
  subVista = 'cuadrilla',
  initialBrigada,
  onToggleVista,
  onClose
}: {
  data: BrigTiposData;
  vista: 'hora' | 'dia' | 'mes';
  subVista?: 'cuadrilla' | 'tipo';
  initialBrigada?: string;
  onToggleVista: (v: 'hora' | 'dia' | 'mes') => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [nivel, setNivel] = useState<'brigadas' | 'tecnicos'>(subVista === 'cuadrilla' ? 'tecnicos' : 'brigadas');
  const [brigadaFiltro, setBrigadaFiltro] = useState<string>(
    initialBrigada || (subVista === 'tipo' && data.tipos.length > 0 ? data.tipos[0].label : 'ALL')
  );
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [view, setView] = useState<ViewMode>('split');
  // Series ocultas desde la lista SERIES del panel (clave de serie → oculta).
  const [ocultas, setOcultas] = useState<Set<string>>(() => new Set());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (initialBrigada) {
      setBrigadaFiltro(initialBrigada);
    }
  }, [initialBrigada]);

  // Esc y el cierre los maneja ModalShell; aquí solo se bloquea el scroll del fondo.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Lista de tipos de brigada disponibles para el selector
  const listaTiposBrigada = useMemo(() => {
    return data.tipos.map(t => t.label);
  }, [data.tipos]);

  // Técnicos filtrados por brigada y búsqueda
  const tecnicosFiltrados = useMemo(() => {
    return data.techs.filter(tech => {
      if (brigadaFiltro !== 'ALL' && tech.tipo !== brigadaFiltro) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchNom = tech.nom.toLowerCase().includes(q);
        const matchCed = tech.ced.includes(q);
        const matchTipo = tech.tipo.toLowerCase().includes(q);
        if (!matchNom && !matchCed && !matchTipo) return false;
      }
      return true;
    });
  }, [data.techs, brigadaFiltro, searchTerm]);

  // Tipos de brigada filtrados
  const tiposFiltrados = useMemo(() => {
    if (brigadaFiltro === 'ALL') return data.tipos;
    return data.tipos.filter(t => t.label === brigadaFiltro);
  }, [data.tipos, brigadaFiltro]);

  // Etiquetas según la vista temporal
  const labels = useMemo(() => {
    if (vista === 'mes') return data.labelsMes;
    if (vista === 'hora') return data.labelsHora;
    return data.labelsDia;
  }, [vista, data.labelsMes, data.labelsHora, data.labelsDia]);

  const esBarras = subVista === 'tipo';
  const promSerie = vista === 'mes' ? data.promedioSerieMes : vista === 'hora' ? data.promedioSerieHora : data.promedioSerieDia;

  // Todas las series posibles del gráfico (según `nivel`); el panel decide cuáles se pintan.
  const todasSeries = useMemo(() => {
    const items: { key: string; color: string; ds: Record<string, unknown> }[] = [];
    const puntos = labels.length > 14 ? 0 : 3.5;

    const dsDe = (label: string, color: string, serie: (number | null)[], extra: Record<string, unknown> = {}) =>
      esBarras
        ? {
            label, data: serie, backgroundColor: withAlpha(color, 0.85), borderColor: color,
            borderWidth: 1, borderRadius: 3, ...extra,
          }
        : {
            label, data: serie, borderColor: color, backgroundColor: withAlpha(color, 0.12),
            fill: false, spanGaps: false, borderWidth: 2.8, tension: 0.32,
            pointRadius: puntos, pointBackgroundColor: 'var(--card)', pointBorderColor: color, pointBorderWidth: 2,
            ...extra,
          };

    if (nivel === 'brigadas') {
      tiposFiltrados.forEach(t => {
        const serie = vista === 'mes' ? t.serieMes : vista === 'hora' ? t.serieHora : t.serieDia;
        items.push({ key: `t:${t.label}`, color: t.color, ds: dsDe(t.label, t.color, serie) });
      });
    } else {
      // nivel === 'tecnicos': Top 7 técnicos de la selección
      tecnicosFiltrados.slice(0, 7).forEach((tech, idx) => {
        const col = colors.series[idx % colors.series.length];
        const shortNom = tech.nom.split(' ').filter(Boolean).slice(0, 2).join(' ') || tech.ced;
        const serie = vista === 'mes' ? tech.byMonth : vista === 'hora' ? tech.byHour : tech.byDay;
        items.push({
          key: `k:${tech.ced}`, color: col,
          ds: dsDe(shortNom, col, serie, { techFullName: tech.nom, techTipo: tech.tipo }),
        });
      });
    }

    // Línea de promedio como contraste: con todos los técnicos, o con una sola brigada seleccionada.
    if (promSerie && (nivel === 'tecnicos' || brigadaFiltro !== 'ALL')) {
      items.push({
        key: 'prom', color: CHART_FIXED.PROMEDIO,
        ds: {
          type: 'line', label: 'Promedio Brigadas', data: promSerie,
          borderColor: CHART_FIXED.PROMEDIO, backgroundColor: CHART_FIXED.PROMEDIO,
          borderWidth: 2, borderDash: [6, 4], pointRadius: 0, fill: false, tension: 0.25, order: 0,
        },
      });
    }
    return items;
  }, [nivel, tiposFiltrados, tecnicosFiltrados, vista, labels, brigadaFiltro, promSerie, esBarras, colors]);

  const seriesPanel = useMemo<RailSerie[]>(
    () => todasSeries.map(s => ({ key: s.key, label: String(s.ds.label), color: s.color, active: !ocultas.has(s.key) })),
    [todasSeries, ocultas],
  );
  const toggleSerie = (key: string) =>
    setOcultas(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  // Configuración de Chart.js (colores con tokens var(--x); ModalChart los resuelve)
  const config = useMemo<ChartConfiguration>(() => {
    const datasets = todasSeries.filter(s => !ocultas.has(s.key)).map(s => s.ds);

    return {
      type: esBarras ? 'bar' : 'line',
      data: {
        labels,
        datasets,
      },
      plugins: [bandsPlugin as any],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items: any[]) => {
                const label = items[0]?.label || '';
                if (vista === 'mes') return `Mes ${label}`;
                if (vista === 'hora') return `Franja ${label}`;
                return `Día ${label}`;
              },
              label: (ctx: any) => {
                if (ctx.raw === null || ctx.raw === undefined) return '';
                const fullNom = ctx.dataset.techFullName ? ` (${ctx.dataset.techFullName})` : '';
                return `${ctx.dataset.label}${fullNom}: ${fmtN(Number(ctx.raw) || 0)} órdenes`;
              },
            },
          },
          bandsBrigTipos: { fecha: data.fecha, zona: data.zona, esHora: vista === 'hora', diasFull: data.diasFull },
        },
        scales: {
          x: { ticks: { autoSkip: labels.length > 14, maxRotation: 0 } },
          y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Órdenes Registradas' } },
        },
      },
    } as unknown as ChartConfiguration;
  }, [todasSeries, ocultas, esBarras, labels, vista, data]);

  // Exportar a CSV según la vista activa
  const exportCSV = () => {
    if (nivel === 'brigadas') {
      descargarCsv(
        `Digitacion_por_brigadas_${vista}.csv`,
        ['Tipo de Brigada', 'Total Órdenes', 'Efectivas', 'Fallidas', 'Perdidas', 'Pico', 'Promedio', 'Constancia'],
        tiposFiltrados.map(t => [t.label, t.total, t.efec, t.fall, t.perd, t.pico, t.promedio.toFixed(1), t.constancia]),
      );
    } else {
      descargarCsv(
        `Digitacion_tecnicos_${nombreArchivo(brigadaFiltro)}_${vista}.csv`,
        ['Cédula', 'Técnico', 'Tipo de Brigada', 'Total Órdenes', 'Efectivas', 'Fallidas', 'Perdidas', 'Pico (Máx)', 'Promedio/Día'],
        tecnicosFiltrados.map(tech => [tech.ced, tech.nom, tech.tipo, tech.total, tech.efec, tech.fall, tech.perd, tech.pico, tech.promedio.toFixed(1)]),
      );
    }
  };

  // Exportar el gráfico a PNG. Si el gráfico no está en pantalla (modo Tabla), se muestra y se reintenta.
  const exportPNG = () => {
    const nombre = `evolutivo_${vista}_${nivel}`;
    if (descargarPngDeCanvas(canvasRef.current, nombre, cssVar('--card'))) return;
    setView('split');
    setTimeout(() => descargarPngDeCanvas(canvasRef.current, nombre, cssVar('--card')), 900);
  };

  // Stats para la barra superior
  const stats = useMemo(() => {
    if (nivel === 'brigadas') {
      const totOrd = tiposFiltrados.reduce((s, t) => s + t.total, 0);
      const lider = tiposFiltrados[0] || null;
      return {
        totalOrd: totOrd,
        liderLbl: lider ? `${lider.label} (${fmtN(lider.total)} ord)` : '—',
        conteo: `${tiposFiltrados.length} tipos`,
        promedio: tiposFiltrados.length > 0 ? (totOrd / tiposFiltrados.length).toFixed(0) : '0'
      };
    } else {
      const totOrd = tecnicosFiltrados.reduce((s, t) => s + t.total, 0);
      const lider = tecnicosFiltrados[0] || null;
      return {
        totalOrd: totOrd,
        liderLbl: lider ? `${lider.nom.split(' ').slice(0, 2).join(' ')} (${fmtN(lider.total)} ord)` : '—',
        conteo: `${tecnicosFiltrados.length} técnicos`,
        promedio: tecnicosFiltrados.length > 0 ? (totOrd / tecnicosFiltrados.length).toFixed(1) : '0'
      };
    }
  }, [nivel, tiposFiltrados, tecnicosFiltrados]);

  const th: React.CSSProperties = {
    padding: '9px 12px',
    fontSize: 10.5,
    fontWeight: 700,
    color: MUT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    whiteSpace: 'nowrap',
    textAlign: 'right',
    position: 'sticky',
    top: 0,
    background: 'var(--card)',
    borderBottom: `1px solid ${LINE}`
  };
  const td: React.CSSProperties = {
    padding: '9px 12px',
    fontSize: 12.5,
    whiteSpace: 'nowrap',
    textAlign: 'right',
    color: INK,
    fontVariantNumeric: 'tabular-nums'
  };

  const resumen: RailKpi[] = [
    { label: 'Total', value: `${fmtN(stats.totalOrd)} ord`, color: INK },
    { label: 'Líder', value: stats.liderLbl, color: OK },
    { label: 'Registros', value: stats.conteo, color: INK },
    { label: 'Promedio', value: `${stats.promedio} ord`, color: INK },
  ];

  const filtros = (
    <>
      <RailSegmented
        label="Nivel"
        value={nivel}
        onChange={v => setNivel(v as 'brigadas' | 'tecnicos')}
        options={[
          { value: 'brigadas', label: '🏷️ Por Brigadas' },
          { value: 'tecnicos', label: '👤 Por Técnicos' },
        ]}
      />
      <RailSegmented
        label="Vista"
        value={vista}
        onChange={v => onToggleVista(v as 'hora' | 'dia' | 'mes')}
        options={[
          { value: 'hora', label: 'Horario' },
          { value: 'dia', label: 'Diario' },
          { value: 'mes', label: 'Mensual' },
        ]}
      />
      <RailSelect
        label="Brigada"
        value={brigadaFiltro}
        onChange={setBrigadaFiltro}
        options={[
          { value: 'ALL', label: `Todas las brigadas (${data.tipos.length})` },
          ...listaTiposBrigada.map(t => ({ value: t, label: t })),
        ]}
      />
      {nivel === 'tecnicos' && (
        <RailSearch label="Buscar técnico" placeholder="Nombre o cédula…" value={searchTerm} onChange={setSearchTerm} />
      )}
    </>
  );

  const tabla = (
    <>
    <div className="mobile-scroll-tip" style={{ padding: '4px 12px' }}>Desliza horizontalmente para ver todas las métricas &rarr;</div>
    {nivel === 'brigadas' ? (
      <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Tipo de Brigada</th>
            <th style={th}>Total Órdenes</th>
            <th style={th}>Efectivas</th>
            <th style={th}>Fallidas</th>
            <th style={th}>Perdidas</th>
            <th style={th}>Pico</th>
            <th style={th}>Promedio</th>
            <th style={th}>% Part.</th>
          </tr>
        </thead>
        <tbody>
          {tiposFiltrados.map(t => {
            const pctPart = stats.totalOrd > 0 ? (t.total / stats.totalOrd) * 100 : 0;
            return (
              <tr key={t.label} style={{ borderBottom: `1px solid ${LINE}` }}>
                <td style={{ ...td, textAlign: 'left', color: t.color, fontWeight: 700 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, display: 'inline-block', marginRight: 8 }} />
                  {t.label}
                </td>
                <td style={{ ...td, fontWeight: 700 }}>{fmtN(t.total)}</td>
                <td style={td}>{fmtN(t.efec)}</td>
                <td style={td}>{fmtN(t.fall)}</td>
                <td style={td}>{fmtN(t.perd)}</td>
                <td style={td}>{fmtN(t.pico)}</td>
                <td style={td}>{t.promedio.toFixed(1)}</td>
                <td style={td}>{pctPart.toFixed(1)}%</td>
              </tr>
            );
          })}
          {tiposFiltrados.length === 0 && (
            <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: MUT, padding: 24 }}>No hay brigadas con datos para este filtro.</td></tr>
          )}
        </tbody>
        {tiposFiltrados.length > 0 && (
          <tfoot>
            <tr style={{ borderTop: `2px solid ${TEAL}`, background: 'var(--panel)' }}>
              <td style={{ ...td, textAlign: 'left', fontWeight: 800 }}>TOTAL</td>
              <td style={{ ...td, fontWeight: 800 }}>{fmtN(stats.totalOrd)}</td>
              <td style={{ ...td, fontWeight: 800 }}>{fmtN(tiposFiltrados.reduce((s, t) => s + t.efec, 0))}</td>
              <td style={{ ...td, fontWeight: 800 }}>{fmtN(tiposFiltrados.reduce((s, t) => s + t.fall, 0))}</td>
              <td style={{ ...td, fontWeight: 800 }}>{fmtN(tiposFiltrados.reduce((s, t) => s + t.perd, 0))}</td>
              <td style={td} />
              <td style={td} />
              <td style={{ ...td, fontWeight: 800 }}>100%</td>
            </tr>
          </tfoot>
        )}
      </table>
    ) : (
      <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>#</th>
            <th style={{ ...th, textAlign: 'left' }}>Cédula</th>
            <th style={{ ...th, textAlign: 'left' }}>Técnico</th>
            <th style={{ ...th, textAlign: 'left' }}>Tipo de Brigada</th>
            <th style={th}>Total Órdenes</th>
            <th style={th}>Efectivas</th>
            <th style={th}>Fallidas</th>
            <th style={th}>Perdidas</th>
            <th style={th}>Pico (Máx)</th>
            <th style={th}>Promedio/Día</th>
          </tr>
        </thead>
        <tbody>
          {tecnicosFiltrados.map((tech, idx) => (
            <tr key={tech.ced} style={{ borderBottom: `1px solid ${LINE}` }}>
              <td style={{ ...td, textAlign: 'left', color: MUT, width: 30 }}>{idx + 1}</td>
              <td style={{ ...td, textAlign: 'left', color: MUT, fontFamily: 'monospace' }}>{tech.ced}</td>
              <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{tech.nom}</td>
              <td style={{ ...td, textAlign: 'left', color: MUT }}>{tech.tipo}</td>
              <td style={{ ...td, fontWeight: 700 }}>{fmtN(tech.total)}</td>
              <td style={td}>{fmtN(tech.efec)}</td>
              <td style={td}>{fmtN(tech.fall)}</td>
              <td style={td}>{fmtN(tech.perd)}</td>
              <td style={td}>{fmtN(tech.pico)}</td>
              <td style={td}>{tech.promedio.toFixed(1)}</td>
            </tr>
          ))}
          {tecnicosFiltrados.length === 0 && (
            <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: MUT, padding: 24 }}>No se encontraron técnicos para los filtros seleccionados.</td></tr>
          )}
        </tbody>
        {tecnicosFiltrados.length > 0 && (
          <tfoot>
            <tr style={{ borderTop: `2px solid ${TEAL}`, background: 'var(--panel)' }}>
              <td colSpan={4} style={{ ...td, textAlign: 'left', fontWeight: 800 }}>TOTAL ({tecnicosFiltrados.length} técnicos)</td>
              <td style={{ ...td, fontWeight: 800 }}>{fmtN(stats.totalOrd)}</td>
              <td style={{ ...td, fontWeight: 800 }}>{fmtN(tecnicosFiltrados.reduce((s, t) => s + t.efec, 0))}</td>
              <td style={{ ...td, fontWeight: 800 }}>{fmtN(tecnicosFiltrados.reduce((s, t) => s + t.fall, 0))}</td>
              <td style={{ ...td, fontWeight: 800 }}>{fmtN(tecnicosFiltrados.reduce((s, t) => s + t.perd, 0))}</td>
              <td style={td} />
              <td style={td} />
            </tr>
          </tfoot>
        )}
      </table>
    )}
    </>
  );

  return (
    <ModalShell
      title={`Evolutivo ${vista === 'hora' ? 'Horario' : vista === 'dia' ? 'Diario' : 'Mensual'} de Digitación`}
      subtitle={
        nivel === 'brigadas'
          ? 'Órdenes registradas por especialidad/tipo de brigada'
          : `Órdenes registradas por técnicos ${brigadaFiltro !== 'ALL' ? `de la brigada "${shortBrig(brigadaFiltro)}"` : 'de todas las brigadas'}`
      }
      badge="2ª"
      onClose={onClose}
      viewMode={view}
      onViewModeChange={setView}
      filtros={filtros}
      series={seriesPanel}
      onToggleSerie={toggleSerie}
      onResetSeries={() => setOcultas(new Set())}
      resumen={resumen}
      exportes={[
        { label: 'PNG ⬇', onClick: exportPNG },
        { label: 'CSV ↓', onClick: exportCSV, primary: true },
      ]}
      chartLabel={`${esBarras ? 'BARRAS AGRUPADAS' : 'LÍNEAS'} · órdenes registradas`}
      chart={<ModalChart config={config} canvasRef={canvasRef} ariaLabel="Evolutivo de digitación" />}
      table={tabla}
    />
  );
}
