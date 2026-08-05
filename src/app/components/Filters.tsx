'use client';
import { useState, useRef, useEffect } from 'react';
import { useDashboard } from './DashboardProvider';

export default function Filters() {
  const { filters, setFilters, proyList, zonaList, anoList, mesList, fechaList } = useDashboard();
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

  const formatMes = (m: string) => {
    // Si están viendo "Todos los años", dejamos el año visible para no confundir.
    if (filters.ano === 'ALL') return m; 
    const partes = m.split('-');
    if (partes.length !== 2) return m;
    const n = parseInt(partes[1], 10);
    const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return nombres[n - 1] || partes[1];
  };

  const mesLabel =
    filters.mes.length === 0
      ? 'Todos'
      : filters.mes.length === 1
      ? formatMes(filters.mes[0])
      : `${filters.mes.length} meses`;

  const ctrl: React.CSSProperties = {
    padding: '5px 8px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 12,
    background: 'var(--panel)',
    color: 'var(--text)',
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
    color: on ? 'var(--text)' : 'var(--text-muted)',
  });

  const visibleMeses = filters.ano === 'ALL' ? mesList : mesList.filter(m => m.startsWith(filters.ano));

  return (
    <div id="filters-container" className="filtros">
      <label htmlFor="select-proy">Proyecto</label>
      <select
        id="select-proy"
        value={filters.proy}
        onChange={e => setFilters({ proy: e.target.value, zona: 'ALL' })}
      >
        <option value="ALL">Todos</option>
        {proyList.map(p => <option key={p} value={p}>{p}</option>)}
      </select>

      <label htmlFor="select-zona">Zona</label>
      <select
        id="select-zona"
        value={filters.zona}
        onChange={e => setFilters({ zona: e.target.value })}
      >
        <option value="ALL">Todas</option>
        {zonaList.map(z => <option key={z} value={z}>{z}</option>)}
      </select>

      <label htmlFor="select-ano">Año</label>
      <select
        id="select-ano"
        value={filters.ano}
        onChange={e => setFilters({ ano: e.target.value, mes: [], fecha: 'ALL' })}
      >
        <option value="ALL">Todos</option>
        {anoList.map(a => <option key={a} value={a}>{a}</option>)}
      </select>

      <label htmlFor="btn-mes">Mes</label>
      <div ref={mesRef} style={{ position: 'relative' }}>
        <button
          id="btn-mes"
          type="button"
          onClick={() => setMesOpen(o => !o)}
          style={{ ...ctrl, display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 120 }}
        >
          <span>{mesLabel}</span>
          <span style={{ fontSize: 9, opacity: 0.55 }}>&#9662;</span>
        </button>
        {mesOpen && (
          <div
            id="mes-dropdown"
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              background: 'var(--panel)',
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
            <label htmlFor="chk-mes-todos" style={row(filters.mes.length === 0)}>
              <input
                id="chk-mes-todos"
                type="checkbox"
                checked={filters.mes.length === 0}
                onChange={() => setFilters({ mes: [], fecha: 'ALL' })}
              />
              Todos
            </label>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />
            {visibleMeses.map((m, idx) => {
              const on = filters.mes.includes(m);
              return (
                <label key={m} htmlFor={`chk-mes-${idx}`} style={row(on)}>
                  <input id={`chk-mes-${idx}`} type="checkbox" checked={on} onChange={() => toggleMes(m)} />
                  {formatMes(m)}
                </label>
              );
            })}
          </div>
        )}
      </div>

      <label htmlFor="select-fecha">Día</label>
      <select
        id="select-fecha"
        value={filters.fecha}
        onChange={e => setFilters({ fecha: e.target.value })}
      >
        <option value="ALL">Todos</option>
        {/* value = fecha COMPLETA (el filtro compara r.Fecha === F.fecha); se muestra solo el día */}
        {fechaList.map(f => <option key={f} value={f}>{String(f).slice(0, 10).split('-')[2] || f}</option>)}
      </select>

      <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--muted)' }}>
        Filtros globales{filters.mes.length ? ` · ${filters.mes.length} mes(es)` : ''}
      </span>
    </div>
  );
}