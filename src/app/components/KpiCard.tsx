interface KpiCardProps {
  cls: 'otc' | 'sip';
  lbl: string;
  val: string;
  delta?: number | null;
  help?: string;
}

export default function KpiCard({ cls, lbl, val, delta, help }: KpiCardProps) {
  let deltaEl = null;
  if (delta !== null && delta !== undefined) {
    const up = delta >= 0;
    const dir = up ? '▲' : '▼';
    const cls2 = Math.abs(delta) < 0.01 ? 'neu' : up ? 'up' : 'down';
    deltaEl = <div className={`delta ${cls2}`}>{dir} {(delta * 100).toFixed(1)}% vs mes ant.</div>;
  }
  return (
    <div className={`kpi ${cls}`} title={help || ''}>
      <div className="lbl">{lbl} <span className="info">ⓘ</span></div>
      <div className="val">{val}</div>
      {deltaEl}
    </div>
  );
}
