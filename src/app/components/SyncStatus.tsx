'use client';

import { useEffect, useState } from 'react';
import { useDashboard } from './DashboardProvider';

function haceCuanto(ts: number | null): string {
  if (!ts) return 'sin sincronizar';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 45) return 'hace instantes';
  const m = Math.floor(s / 60);
  if (m < 1) return 'hace instantes';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

const pill: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
  background: 'rgba(255,255,255,0.15)', color: '#fff',
  border: '1px solid rgba(255,255,255,0.3)',
};

export default function SyncStatus() {
  const { lastSync, syncing, error, raw, refresh } = useDashboard();
  const [, tick] = useState(0);
  const [busy, setBusy] = useState(false);  // refresco manual en curso

  // Refresca el texto relativo ("hace X min") cada 30 s.
  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const hayDatos = !!raw && raw.raw.length > 0;
  // El error solo es "modo offline" cuando ya hay datos que mostrar.
  const offline = !!error && hayDatos;
  const girando = syncing || busy;

  const onRefresh = async () => {
    if (girando) return;
    setBusy(true);
    try { await refresh(); } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {offline && (
        <span style={{ ...pill, background: 'rgba(240,192,64,0.22)', borderColor: 'rgba(240,192,64,0.5)' }}
              title={error || ''}>
          ⚠ Sin conexión · datos guardados
        </span>
      )}

      {syncing && (
        <span style={pill}>
          <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
          Sincronizando histórico…
        </span>
      )}

      {busy && !syncing && (
        <span style={pill}>
          <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
          Actualizando…
        </span>
      )}

      {!girando && !offline && (
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
          Actualizado {haceCuanto(lastSync)}
        </span>
      )}

      <button
        onClick={onRefresh}
        disabled={girando}
        aria-label="Actualizar datos"
        title="Actualizar datos"
        style={{
          ...pill, cursor: girando ? 'default' : 'pointer', padding: '5px 9px',
          opacity: girando ? 0.6 : 1,
        }}
      >
        <span style={{
          display: 'inline-block',
          animation: girando ? 'spin 0.8s linear infinite' : 'none',
        }}>↻</span>
      </button>
    </div>
  );
}
