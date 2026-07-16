'use client';
import { useState, useRef, useEffect } from 'react';
import { useDashboard } from './DashboardProvider';

export default function Filters() {
  const { filters, setFilters, proyList, zonaList, mesList, fechaList } = useDashboard();
  const [mesOpen, setMesOpen] = useState(false);
  const mesRef = useRef<HTMLDivElement>(null);

  // Cerrar el desplegable al hacer clic fuera
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (mesRef.current && !mesRef.current.contains(e.target as Node)) setMesOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const toggleMes = (m: string) => {
    const next = filters.mes.includes(m)
      ? filters.mes.filter(x => x !== m)
      : [...filters.mes, m];
    setFilters({ mes: next, fecha: 'ALL' });
  };

  const mesLabel =
    filters.mes.length === 0
      ? 'Todos'
      : filters.mes.length === 1
      ? filters.mes[0]
      : `${filters.mes.length} meses`;

  const ctrl: React.CSSProperties = {
    padding: '5px 8px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 12,
    background: '#fff',
    fontFamily: 'inherit',
    cursor: 'pointer',
  };

  const row = (on: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 6px',
    fontSize: 12,
    borderRadius: 4,
    cursor: 'pointer',
    userSelect: 'none',
    fontWeight: on ? 600 : 400,
    color: on ? 'var(--text)' : '#333',
  });

  return (
    <div className="filtros">
      <label>Proyecto</label>
      <select
        value={filters.proy}
        onChange={e => setFilters({ proy: e.target.value, zona: 'ALL' })}
      >
        <option value="ALL">Todos</option>
        {proyList.map(p => <option key={p} value={p}>{p}</option>)}
      </select>

      <label>Zona</label>
      <select
        value={filters.zona}
        onChange={e => setFilters({ zona: e.target.value })}
      >
        <option value="ALL">Todas</option>
        {zonaList.map(z => <option key={z} value={z}>{z}</option>)}
      </select>

      <label>Mes</label>
      <div ref={mesRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setMesOpen(o => !o)}
          style={{ ...ctrl, display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 120 }}
        >
          <span>{mesLabel}</span>
          <span style={{ fontSize: 9, opacity: 0.55 }}>&#9662;</span>
        </button>
        {mesOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(20,30,60,.18)',
              zIndex: 120,
              padding: 6,
              minWidth: 150,
              maxHeight: 260,
              overflow: 'auto',
            }}
          >
            <label style={row(filters.mes.length === 0)}>
              <input
                type="checkbox"
                checked={filters.mes.length === 0}
                onChange={() => setFilters({ mes: [], fecha: 'ALL' })}
              />
              Todos
            </label>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />
            {mesList.map(m => {
              const on = filters.mes.includes(m);
              return (
                <label key={m} style={row(on)}>
                  <input type="checkbox" checked={on} onChange={() => toggleMes(m)} />
                  {m}
                </label>
              );
            })}
          </div>
        )}
      </div>

      <label>Fecha</label>
      <select
        value={filters.fecha}
        onChange={e => setFilters({ fecha: e.target.value })}
      >
        <option value="ALL">Todas</option>
        {fechaList.map(f => <option key={f} value={f}>{f}</option>)}
      </select>

      <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--muted)' }}>
        Filtros globales{filters.mes.length ? ` · ${filters.mes.length} mes(es)` : ''}
      </span>
    </div>
  );
}