'use client';
import { useDashboard } from './DashboardProvider';

export default function Filters() {
  const { filters, setFilters, proyList, zonaList, mesList, fechaList } = useDashboard();

  const toggleMes = (m: string) => {
    const next = filters.mes.includes(m)
      ? filters.mes.filter(x => x !== m)
      : [...filters.mes, m];
    setFilters({ mes: next, fecha: 'ALL' });
  };

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
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 10px',
          alignItems: 'center',
          maxWidth: 620,
        }}
      >
        <button
          type="button"
          onClick={() => setFilters({ mes: [], fecha: 'ALL' })}
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '3px 8px',
            borderRadius: 6,
            cursor: 'pointer',
            border: '1px solid var(--border)',
            background: filters.mes.length === 0 ? 'var(--text)' : '#fff',
            color: filters.mes.length === 0 ? '#fff' : 'var(--muted)',
            fontFamily: 'inherit',
          }}
        >
          Todos
        </button>
        {mesList.map(m => {
          const on = filters.mes.includes(m);
          return (
            <label
              key={m}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
                color: on ? 'var(--text)' : 'var(--muted)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input type="checkbox" checked={on} onChange={() => toggleMes(m)} />
              {m}
            </label>
          );
        })}
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