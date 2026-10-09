'use client';
import { useEffect, useRef, useState } from 'react';
import type { Chart as ChartJS, ChartConfiguration } from 'chart.js';
import { cssVar, resolveChartConfig } from './utils/chartTheme';

/** 'light' | 'dark' según la clase que ThemeProvider pone en <body>; reacciona al toggle del header. */
export function useThemeKey(): 'light' | 'dark' {
  const read = () => (typeof document !== 'undefined' && document.body.classList.contains('theme-dark') ? 'dark' : 'light');
  const [key, setKey] = useState<'light' | 'dark'>(read);
  useEffect(() => {
    setKey(read());
    const mo = new MutationObserver(() => setKey(read()));
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return key;
}

interface ModalChartProps {
  /** Configuración de Chart.js. Los colores pueden ser tokens 'var(--ok)' / 'var(--ok|0.22)'. */
  config: ChartConfiguration | null;
  /** Para exportar PNG desde fuera. */
  canvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
  /** Se llama con cada gráfico creado (incluye re-creaciones por cambio de tema). */
  onChart?: (chart: ChartJS) => void;
  /** Click en un punto/barra: devuelve la etiqueta de la serie (o de la barra) pulsada. */
  onPick?: (label: string) => void;
  ariaLabel?: string;
}

/**
 * Lienzo Chart.js de los modales. Resuelve los colores en el momento de crear el gráfico y lo recrea al
 * cambiar de tema, así nunca queda con los colores del tema anterior.
 */
export default function ModalChart({ config, canvasRef, onChart, onPick, ariaLabel }: ModalChartProps) {
  const localRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<ChartJS | null>(null);
  const themeKey = useThemeKey();
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onChartRef = useRef(onChart);
  onChartRef.current = onChart;
  // Las funciones (callbacks de tooltip) no se serializan: la firma solo mira los datos y se re-crea
  // cuando cambian los datos o el tema.
  const firma = config ? JSON.stringify(config) : '';

  useEffect(() => {
    const canvas = localRef.current;
    if (!config || !canvas) return;
    let vivo = true;
    import('chart.js').then(({ Chart, registerables }) => {
      if (!vivo || !localRef.current) return;
      Chart.register(...registerables);
      (window as unknown as { Chart?: unknown }).Chart = Chart; // lo usan los bots de validación

      Chart.defaults.color = cssVar('--text-muted-aa') || cssVar('--text-muted');
      Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
      Chart.defaults.borderColor = cssVar('--border');
      Chart.defaults.elements.line.borderWidth = 2.5;
      Chart.defaults.elements.point.radius = 3;
      Chart.defaults.elements.point.hoverRadius = 6;
      const tip = (Chart.defaults.plugins.tooltip ?? {}) as unknown as Record<string, unknown>;
      Object.assign(tip, {
        backgroundColor: cssVar('--card'), titleColor: cssVar('--text-title'), bodyColor: cssVar('--text-body'),
        borderColor: cssVar('--border'), borderWidth: 1, padding: 12, cornerRadius: 8,
      });

      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
      const cfg = resolveChartConfig(config) as ChartConfiguration;
      cfg.options = cfg.options || {};
      cfg.options.maintainAspectRatio = false;
      cfg.options.responsive = true;
      const plugins = (cfg.options.plugins = cfg.options.plugins || {});
      // La leyenda vive en el panel lateral (sección SERIES), no dentro del lienzo.
      plugins.legend = { ...(plugins.legend || {}), display: false };
      cfg.options.onClick = (_e, elements, chart) => {
        if (!elements.length || !onPickRef.current) return;
        const el = elements[0];
        const tipo = (chart.config as unknown as { type?: string }).type;
        const label = tipo === 'bar' && chart.data.datasets.length === 1
          ? String(chart.data.labels?.[el.index])
          : String(chart.data.datasets[el.datasetIndex].label);
        onPickRef.current(label);
      };
      chartRef.current = new Chart(localRef.current, cfg);
      onChartRef.current?.(chartRef.current);
    });
    return () => {
      vivo = false;
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, themeKey]);

  return (
    <canvas
      ref={el => { localRef.current = el; if (canvasRef) canvasRef.current = el; }}
      role="img"
      aria-label={ariaLabel || 'Gráfico'}
      data-modal-chart
      data-theme-key={themeKey}
    />
  );
}
