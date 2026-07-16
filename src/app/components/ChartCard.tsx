'use client';
import { useEffect, useRef } from 'react';
import type { ChartConfiguration } from 'chart.js';

interface ChartCardProps {
  id: string;
  title: React.ReactNode;
  subtitle?: string;
  config: ChartConfiguration | null;
  height?: 'normal' | 'tall' | 'short';
  headerExtra?: React.ReactNode;
}

export default function ChartCard({ id, title, subtitle, config, height = 'normal', headerExtra }: ChartCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import('chart.js').Chart | null>(null);

  useEffect(() => {
    if (!config || !canvasRef.current) return;
    let isMounted = true;
    import('chart.js').then(({ Chart, registerables }) => {
      if (!isMounted || !canvasRef.current) return;
      Chart.register(...registerables);
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
    <div className="card">
      <div className="ch-title">
        {title}
        {headerExtra}
      </div>
      {subtitle && <div className="ch-sub">{subtitle}</div>}
      <div className={boxCls}>
        <canvas ref={canvasRef} id={id} />
      </div>
    </div>
  );
}
