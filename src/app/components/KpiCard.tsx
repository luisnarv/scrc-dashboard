'use client';

import { useState } from 'react';

export interface KpiDetalleRow {
  label: string;
  value: string;
  extra?: string;
}

interface KpiCardProps {
  cls: 'otc' | 'sip' | 'neu' | 'ok' | 'err';
  lbl: string;
  val: string;
  delta?: number | null;
  help?: string;
  detalle?: KpiDetalleRow[];
  detalleTitulo?: string;
}

export default function KpiCard({ cls, lbl, val, delta, help, detalle, detalleTitulo = 'Por tipo de brigada' }: KpiCardProps) {
  const [abierto, setAbierto] = useState(false);
  let deltaEl = null;
  if (delta !== null && delta !== undefined) {
    const up = delta >= 0;
    const dir = up ? '▲' : '▼';
    const cls2 = Math.abs(delta) < 0.01 ? 'neu' : up ? 'up' : 'down';
    deltaEl = <div className={`delta ${cls2}`}>{dir} {(delta * 100).toFixed(1)}% vs mes ant.</div>;
  }
  const hayDetalle = !!detalle && detalle.length > 0;
  return (
    <div className={`kpi ${cls}`} title={help || ''}>
      <div className="lbl">{lbl} <span className="info">ⓘ</span></div>
      <div className="val">{val}</div>
      {deltaEl}
      {hayDetalle && (
        <>
          <button
            type="button"
            className="kpi-toggle"
            aria-expanded={abierto}
            onClick={() => setAbierto(o => !o)}
          >
            {detalleTitulo} <span aria-hidden>{abierto ? '▴' : '▾'}</span>
          </button>
          {abierto && (
            <ul className="kpi-detail">
              {detalle!.map(d => (
                <li key={d.label}>
                  <span className="kd-lbl">{d.label}</span>
                  <span className="kd-val">{d.value}{d.extra && <small>{d.extra}</small>}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
