import type { HealthResult } from './utils/health';

const C = 2 * Math.PI * 52;

export default function HealthScore({ h }: { h: HealthResult }) {
  const offset = (C * (1 - h.score / 100)).toFixed(1);
  return (
    <div className={`section health-section ${h.cls}`}>
      <div className="health-grid">
        <div className="health-left">
          <div className="health-label">Salud del Proyecto <span className="info" style={{ fontSize: 11 }}>ⓘ</span></div>
          <div className={`health-status ${h.cls}`}>{h.estado}</div>
          <div className="health-narr">{h.narr}</div>
        </div>
        <div className="health-right">
          <div className="health-ring">
            <svg viewBox="0 0 120 120" width={140} height={140}>
              <circle cx={60} cy={60} r={52} fill="none" stroke="#e3e7ef" strokeWidth={10} />
              <circle
                cx={60} cy={60} r={52} fill="none"
                stroke={h.color} strokeWidth={10} strokeLinecap="round"
                strokeDasharray={C.toFixed(1)}
                strokeDashoffset={offset}
                transform="rotate(-90 60 60)"
                style={{ transition: 'stroke-dashoffset .6s ease, stroke .3s' }}
              />
            </svg>
            <div className="health-score">
              <div className="health-score-num">{h.score}</div>
              <div className="health-score-den">/ 100</div>
            </div>
          </div>
          <div className="health-bars">
            {h.dims.map(({ label, value, weight }) => {
              const c = value >= 80 ? '#2E7D32' : value >= 60 ? '#F57C00' : '#C62828';
              return (
                <div key={label} className="health-bar">
                  <span className="hb-lbl">{label} {weight}%</span>
                  <span className="hb-track">
                    <span className="hb-fill" style={{ width: `${value}%`, background: c }} />
                  </span>
                  <span className="hb-val">{Math.round(value)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
