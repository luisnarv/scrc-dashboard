'use client';
import { useDashboard } from './DashboardProvider';

export default function Filters() {
  const { filters, setFilters, proyList, zonaList, mesList, fechaList } = useDashboard();

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
      <select
        value={filters.mes}
        onChange={e => setFilters({ mes: e.target.value, fecha: 'ALL' })}
      >
        <option value="ALL">Todos</option>
        {mesList.map(m => <option key={m} value={m}>{m}</option>)}
      </select>

      <label>Fecha</label>
      <select
        value={filters.fecha}
        onChange={e => setFilters({ fecha: e.target.value })}
      >
        <option value="ALL">Todas</option>
        {fechaList.map(f => <option key={f} value={f}>{f}</option>)}
      </select>

      <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--muted)' }}>Filtros globales</span>
    </div>
  );
}
