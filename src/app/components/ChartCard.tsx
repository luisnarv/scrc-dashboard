'use client';
import { useEffect, useRef, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import AnalysisModal from './AnalysisModal';
import { ButtonGhost } from './Buttons';

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
  singleCategorySelect?: boolean;
  defaultSelectedCategory?: string;
  onExpand?: () => void;
  customBody?: React.ReactNode;
  customLayout?: (canvas: React.ReactNode) => React.ReactNode;
}

export default function ChartCard({ id, title, subtitle, config, modalConfig, height = 'normal', headerExtra, hasDetail, detailTableData, detailActiveFilters, singleCategorySelect, defaultSelectedCategory, onExpand, customBody, customLayout }: ChartCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import('chart.js').Chart | null>(null);

  useEffect(() => {
    if (!config || !canvasRef.current) return;
    let isMounted = true;
    import('chart.js').then(({ Chart, registerables }) => {
      if (!isMounted || !canvasRef.current) return;
      Chart.register(...registerables);

      const computed = getComputedStyle(document.body);
      const getVar = (v: string) => computed.getPropertyValue(v).trim();

      Chart.defaults.color = getVar('--text-muted');
      Chart.defaults.font.family = computed.fontFamily;
      Chart.defaults.borderColor = getVar('--border');
      Chart.defaults.elements.line.borderWidth = 3;
      Chart.defaults.elements.point.radius = 5;
      Chart.defaults.elements.point.hoverRadius = 8;
      
      if (!(Chart.defaults.plugins as any).tooltip) (Chart.defaults.plugins as any).tooltip = {};
      const tooltipOpts = Chart.defaults.plugins.tooltip as any;
      tooltipOpts.backgroundColor = getVar('--card');
      tooltipOpts.titleColor = getVar('--text-title');
      tooltipOpts.bodyColor = getVar('--text-body');
      tooltipOpts.borderColor = getVar('--border');
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
      <div id={`card-${id}`} className="card">
        <div className="ch-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            {title}
            {headerExtra}
          </div>
          {hasDetail && (
            <ButtonGhost
              id={`btn-expand-${id}`}
              onClick={() => onExpand ? onExpand() : setModalOpen(true)}
            >
              <span style={{ fontSize: 14 }}>⤢</span> Expandir
            </ButtonGhost>
          )}
        </div>
        {subtitle && <div className="ch-sub">{subtitle}</div>}
        {customBody ? customBody : customLayout ? customLayout(<canvas ref={canvasRef} id={id} />) : (
          <div className={boxCls}>
            <canvas ref={canvasRef} id={id} />
          </div>
        )}
      </div>

      {hasDetail && !onExpand && modalOpen && (
        <AnalysisModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={title}
          description={subtitle}
          config={config}
          modalConfig={modalConfig}
          tableData={detailTableData as any}
          activeFilters={detailActiveFilters}
          singleCategorySelect={singleCategorySelect}
          defaultSelectedCategory={defaultSelectedCategory}
        />
      )}
    </>
  );
}
