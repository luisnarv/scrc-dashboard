'use client';
import { useEffect, useRef, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import AnalysisModal from './AnalysisModal';

interface ChartCardProps {
  id: string;
  title: React.ReactNode;
  subtitle?: string;
  config: ChartConfiguration | null;
  modalConfig?: ChartConfiguration | null;
  height?: 'normal' | 'tall' | 'short';
  headerExtra?: React.ReactNode;
  hasDetail?: boolean;
  detailTableData?: {
    columns: string[];
    rows?: (string | number | null | undefined)[][];
    hierarchicalRows?: any[];
    categoryIndex?: number;
  };
  detailActiveFilters?: { label: string; value: string }[];
}

export default function ChartCard({ id, title, subtitle, config, modalConfig, height = 'normal', headerExtra, hasDetail, detailTableData, detailActiveFilters }: ChartCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import('chart.js').Chart | null>(null);

  useEffect(() => {
    if (!config || !canvasRef.current) return;
    let isMounted = true;
    import('chart.js').then(({ Chart, registerables }) => {
      if (!isMounted || !canvasRef.current) return;
      Chart.register(...registerables);

      const isDark = document.body.classList.contains('theme-dark');
      Chart.defaults.color = isDark ? '#9FB0A4' : '#97999B';
      Chart.defaults.borderColor = isDark ? 'rgba(234,243,226,0.08)' : '#E0E0E0';
      Chart.defaults.elements.line.borderWidth = 3;
      Chart.defaults.elements.point.radius = 5;
      Chart.defaults.elements.point.hoverRadius = 8;
      
      if (!(Chart.defaults.plugins as any).tooltip) (Chart.defaults.plugins as any).tooltip = {};
      const tooltipOpts = Chart.defaults.plugins.tooltip as any;
      tooltipOpts.backgroundColor = isDark ? '#1E2C24' : '#FFFFFF';
      tooltipOpts.titleColor = isDark ? '#EAF3E2' : '#38764C';
      tooltipOpts.bodyColor = isDark ? '#EAF3E2' : '#3A3A3A';
      tooltipOpts.borderColor = isDark ? '#33443A' : '#E0E0E0';
      tooltipOpts.borderWidth = 1;
      tooltipOpts.padding = 12;
      tooltipOpts.cornerRadius = 8;

      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
      chartRef.current = new Chart(canvasRef.current, config as ChartConfiguration);
    });
    return () => {
      isMounted = false;
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(config)]);

  const boxCls = `chart-box${height === 'tall' ? ' tall' : height === 'short' ? ' short' : ''}`;

  return (
    <>
      <div className="card">
        <div className="ch-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            {title}
            {headerExtra}
          </div>
          {hasDetail && (
            <button
              onClick={() => setModalOpen(true)}
              style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 4, background: 'var(--panel)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              ⤢ Expandir
            </button>
          )}
        </div>
        {subtitle && <div className="ch-sub">{subtitle}</div>}
        <div className={boxCls}>
          <canvas ref={canvasRef} id={id} />
        </div>
      </div>

      {hasDetail && modalOpen && (
        <AnalysisModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={title}
          description={subtitle}
          config={config}
          modalConfig={modalConfig}
          tableData={detailTableData as any}
          activeFilters={detailActiveFilters}
        />
      )}
    </>
  );
}
