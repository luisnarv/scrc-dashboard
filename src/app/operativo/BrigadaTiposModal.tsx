'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import { esFestivo } from '../components/utils/holidays';
import { getMinutosTrabajoHora } from '../components/utils/metasBrigadas';
import { fmtN, fmtPct } from '../components/utils/formatters';
import { SegmentedControl } from '../components/Buttons';

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
      ctx.fillStyle = 'rgba(140,147,130,.10)';
      ctx.fillRect(slotLeft, top, slotWidth, slotHeight);
      ctx.save();
      ctx.beginPath(); ctx.rect(slotLeft, top, slotWidth, slotHeight); ctx.clip();
      ctx.strokeStyle = 'rgba(140,147,130,.22)'; ctx.lineWidth = 1.4; ctx.beginPath();
      for (let xLine = slotLeft - slotHeight; xLine < slotRight + slotHeight; xLine += 8) {
        ctx.moveTo(xLine, bottom); ctx.lineTo(xLine + slotHeight, top);
      }
      ctx.stroke(); ctx.restore();
      if (text) {
        ctx.font = '600 10px sans-serif'; ctx.fillStyle = 'rgba(120,127,110,.9)';
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
const ERR = 'var(--err)';
const WARN = '#8A6D00';
const INK = 'var(--text-title)';
const MUT = 'var(--text-muted)';
const LINE = 'var(--border)';
const TEAL = 'var(--sip)';
const constColor = (c: string) => (c === 'Alta' ? OK : c === 'Media' ? WARN : ERR);

const TOP_TECH_COLORS = [
  '#00897B', '#1E88E5', '#8E24AA', '#FB8C00', '#43A047', '#E53935', '#3949AB', '#D81B60'
];

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
  const [nivel, setNivel] = useState<'brigadas' | 'tecnicos'>(subVista === 'cuadrilla' ? 'tecnicos' : 'brigadas');
  const [brigadaFiltro, setBrigadaFiltro] = useState<string>(
    initialBrigada || (subVista === 'tipo' && data.tipos.length > 0 ? data.tipos[0].label : 'ALL')
  );
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [view, setView] = useState<'chart' | 'split' | 'table'>('split');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import('chart.js').Chart | null>(null);

  useEffect(() => {
    if (initialBrigada) {
      setBrigadaFiltro(initialBrigada);
    }
  }, [initialBrigada]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

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

  // Configuración de Chart.js
  const config = useMemo<ChartConfiguration>(() => {
    const datasets: any[] = [];

    if (nivel === 'brigadas') {
      tiposFiltrados.forEach(t => {
        const serie = vista === 'mes' ? t.serieMes : vista === 'hora' ? t.serieHora : t.serieDia;
        datasets.push({
          label: t.label,
          data: serie,
          borderColor: t.color,
          backgroundColor: t.color + '1F',
          fill: false,
          spanGaps: false,
          borderWidth: 2.8,
          tension: 0.32,
          pointRadius: labels.length > 14 ? 0 : 3.5,
          pointBackgroundColor: '#fff',
          pointBorderColor: t.color,
          pointBorderWidth: 2,
        });
      });

      // Si seleccionó una sola brigada, agregar la línea de promedio como contraste
      if (brigadaFiltro !== 'ALL') {
        const promSerie = vista === 'mes' ? data.promedioSerieMes : vista === 'hora' ? data.promedioSerieHora : data.promedioSerieDia;
        if (promSerie) {
          datasets.push({
            label: 'Promedio Brigadas',
            data: promSerie,
            borderColor: '#78909C',
            backgroundColor: '#78909C',
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 0,
            fill: false,
            tension: 0.25,
          });
        }
      }
    } else {
      // nivel === 'tecnicos'
      // Graficar los Top 7 técnicos de la selección
      const topTechs = tecnicosFiltrados.slice(0, 7);
      topTechs.forEach((tech, idx) => {
        const col = TOP_TECH_COLORS[idx % TOP_TECH_COLORS.length];
        const shortNom = tech.nom.split(' ').filter(Boolean).slice(0, 2).join(' ') || tech.ced;
        const serie = vista === 'mes' ? tech.byMonth : vista === 'hora' ? tech.byHour : tech.byDay;
        datasets.push({
          label: shortNom,
          techFullName: tech.nom,
          techTipo: tech.tipo,
          data: serie,
          borderColor: col,
          backgroundColor: col + '1F',
          fill: false,
          spanGaps: false,
          borderWidth: 2.8,
          tension: 0.32,
          pointRadius: labels.length > 14 ? 0 : 3.5,
          pointBackgroundColor: '#fff',
          pointBorderColor: col,
          pointBorderWidth: 2,
        });
      });

      // Línea de promedio para contrastar técnicos
      const promSerie = vista === 'mes' ? data.promedioSerieMes : vista === 'hora' ? data.promedioSerieHora : data.promedioSerieDia;
      if (promSerie) {
        datasets.push({
          label: 'Promedio Brigadas',
          data: promSerie,
          borderColor: '#78909C',
          backgroundColor: '#78909C',
          borderWidth: 2,
          borderDash: [5, 4],
          pointRadius: 0,
          fill: false,
          tension: 0.25,
        });
      }
    }

    return {
      type: 'line',
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
          legend: { display: true, position: 'top' as const, labels: { boxWidth: 12, font: { size: 10.5 } } },
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
    } as ChartConfiguration;
  }, [nivel, tiposFiltrados, tecnicosFiltrados, vista, labels, brigadaFiltro, data]);

  // Montar Chart.js en el canvas
  useEffect(() => {
    if (view === 'table' || !canvasRef.current) return;
    let mounted = true;
    import('chart.js').then(({ Chart, registerables }) => {
      if (!mounted || !canvasRef.current) return;
      Chart.register(...registerables);
      const cs = getComputedStyle(document.body);
      Chart.defaults.color = cs.getPropertyValue('--text-muted').trim();
      Chart.defaults.borderColor = cs.getPropertyValue('--border').trim();
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
      chartRef.current = new Chart(canvasRef.current, config);
    });
    return () => {
      mounted = false;
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    };
  }, [config, view]);

  // Exportar a CSV según la vista activa
  const exportCSV = () => {
    if (nivel === 'brigadas') {
      const rows = [['Tipo de Brigada', 'Total Órdenes', 'Efectivas', 'Fallidas', 'Perdidas', 'Pico', 'Promedio', 'Constancia'].join(';')];
      tiposFiltrados.forEach(t => {
        rows.push([
          t.label.replace(/;/g, ''),
          t.total,
          t.efec,
          t.fall,
          t.perd,
          t.pico,
          t.promedio.toFixed(1),
          t.constancia
        ].join(';'));
      });
      const uri = encodeURI('data:text/csv;charset=utf-8,\uFEFF' + rows.join('\n'));
      const a = document.createElement('a');
      a.href = uri;
      a.download = `Digitacion_por_brigadas_${vista}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      const rows = [['Cédula', 'Técnico', 'Tipo de Brigada', 'Total Órdenes', 'Efectivas', 'Fallidas', 'Perdidas', 'Pico (Máx)', 'Promedio/Día'].join(';')];
      tecnicosFiltrados.forEach(tech => {
        rows.push([
          tech.ced,
          tech.nom.replace(/;/g, ''),
          tech.tipo.replace(/;/g, ''),
          tech.total,
          tech.efec,
          tech.fall,
          tech.perd,
          tech.pico,
          tech.promedio.toFixed(1)
        ].join(';'));
      });
      const uri = encodeURI('data:text/csv;charset=utf-8,\uFEFF' + rows.join('\n'));
      const a = document.createElement('a');
      a.href = uri;
      a.download = `Digitacion_tecnicos_${brigadaFiltro}_${vista}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
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

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,27,45,.55)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de digitación por brigadas y técnicos"
        style={{
          background: 'var(--bg)',
          borderRadius: 16,
          width: 'min(1520px, 97vw)',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(20,30,60,.28)'
        }}
      >
        {/* Encabezado */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 20px', borderBottom: `1px solid ${LINE}`, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 280 }}>
            <span style={{ background: TEAL, color: '#fff', fontWeight: 800, fontSize: 12, borderRadius: 8, padding: '4px 8px' }}>2ª</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>
                Evolutivo {vista === 'hora' ? 'Horario' : vista === 'dia' ? 'Diario' : 'Mensual'} de Digitación
              </div>
              <div style={{ fontSize: 12, color: MUT, marginTop: 2 }}>
                {nivel === 'brigadas'
                  ? 'Órdenes registradas por especialidad/tipo de brigada'
                  : `Órdenes registradas por técnicos ${brigadaFiltro !== 'ALL' ? `de la brigada "${shortBrig(brigadaFiltro)}"` : 'de todas las brigadas'}`}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Selector de Nivel: Por Brigadas vs Por Técnicos */}
            <SegmentedControl
              options={[
                { value: 'brigadas', label: '🏷️ Por Brigadas' },
                { value: 'tecnicos', label: '👤 Por Técnicos' },
              ]}
              value={nivel}
              onChange={v => setNivel(v as 'brigadas' | 'tecnicos')}
            />

            {/* Selector de Vista Temporal */}
            <SegmentedControl
              options={[
                { value: 'hora', label: 'Horario' },
                { value: 'dia', label: 'Diario' },
                { value: 'mes', label: 'Mensual' },
              ]}
              value={vista}
              onChange={v => onToggleVista(v as 'hora' | 'dia' | 'mes')}
            />

            {/* Selector de Modo Gráfico / Tabla */}
            <SegmentedControl
              options={[
                { value: 'chart', label: '📈 Gráfico' },
                { value: 'split', label: '🗂 Ambos' },
                { value: 'table', label: '📋 Tabla' },
              ]}
              value={view}
              onChange={v => setView(v as any)}
            />

            <button
              onClick={exportCSV}
              style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: TEAL, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
            >
              CSV ↓
            </button>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${LINE}`, background: 'var(--panel)', color: MUT, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Barra de Filtros secundarios: Selector de Brigada y Buscador */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 20px', borderBottom: `1px solid ${LINE}`, flexWrap: 'wrap', background: 'var(--panel)' }}>
          {/* Dropdown de Brigadas */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: MUT, textTransform: 'uppercase', letterSpacing: 0.5 }}>Brigada:</span>
            <select
              value={brigadaFiltro}
              onChange={e => setBrigadaFiltro(e.target.value)}
              style={{
                padding: '5px 10px',
                borderRadius: 7,
                border: `1px solid ${LINE}`,
                background: 'var(--card)',
                color: INK,
                fontSize: 12.5,
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">Todas las brigadas ({data.tipos.length})</option>
              {listaTiposBrigada.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Buscador de Técnicos (visible si está en nivel técnicos) */}
          {nivel === 'tecnicos' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: MUT, textTransform: 'uppercase', letterSpacing: 0.5 }}>Buscar técnico:</span>
              <input
                type="text"
                placeholder="Nombre o cédula…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 7,
                  border: `1px solid ${LINE}`,
                  background: 'var(--card)',
                  color: INK,
                  fontSize: 12.5,
                  outline: 'none',
                  minWidth: 200
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: MUT, fontSize: 14 }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Stats resumidos */}
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginLeft: 'auto', fontSize: 12 }}>
            <span><b style={{ color: MUT, marginRight: 4 }}>TOTAL:</b><strong style={{ color: INK }}>{fmtN(stats.totalOrd)} ord</strong></span>
            <span><b style={{ color: MUT, marginRight: 4 }}>LÍDER:</b><strong style={{ color: OK }}>{stats.liderLbl}</strong></span>
            <span><b style={{ color: MUT, marginRight: 4 }}>REGISTROS:</b><strong style={{ color: INK }}>{stats.conteo}</strong></span>
            <span><b style={{ color: MUT, marginRight: 4 }}>PROMEDIO:</b><strong style={{ color: INK }}>{stats.promedio} ord</strong></span>
          </div>
        </div>

        {/* Contenido: Gráfico y/o Tabla */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {(view === 'chart' || view === 'split') && (
            <div style={{ flex: view === 'chart' ? '1 1 auto' : '1 1 54%', minHeight: 200, position: 'relative', padding: '10px 16px' }}>
              <canvas ref={canvasRef} />
            </div>
          )}

          {(view === 'table' || view === 'split') && (
            <div style={{ flex: view === 'table' ? '1 1 auto' : '1 1 46%', minHeight: 0, overflow: 'auto' }}>
              {nivel === 'brigadas' ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
