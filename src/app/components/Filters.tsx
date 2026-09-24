'use client';
import { useState, useRef, useEffect } from 'react';
import { useDashboard } from './DashboardProvider';

export default function Filters() {
  const { filters, setFilters, proyList, zonaList, anoList, mesList, fechaList } = useDashboard();
  const [mesOpen, setMesOpen] = useState(false);
  const mesRef = useRef<HTMLDivElement>(null);
  const [diaOpen, setDiaOpen] = useState(false);
  const diaRef = useRef<HTMLDivElement>(null);

  // Cerrar desplegables al hacer clic fuera
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (mesRef.current && !mesRef.current.contains(e.target as Node)) setMesOpen(false);
      if (diaRef.current && !diaRef.current.contains(e.target as Node)) setDiaOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const visibleMeses = filters.ano === 'ALL' ? mesList : mesList.filter(m => m.startsWith(filters.ano));

  // Centinela para "ningún mes seleccionado": `mes: []` ya significa "todos" en
  // ~10 archivos del dashboard (convención legacy muy extendida para no filtrar
  // por defecto), así que no puede reusarse también para "ninguno" sin tocar todo
  // eso. Un mes falso que no matchea nada real logra el mismo efecto (0 resultados
  // en cualquier `.includes()`/`.length` existente) sin cambiar esa convención.
  const MES_NINGUNO = '__NINGUNO__';
  const esNingunMes = filters.mes.length === 1 && filters.mes[0] === MES_NINGUNO;

  // Todos los meses están seleccionados si todos los visibleMeses están en filters.mes o si filters.mes está vacío (comportamiento legacy de 'todos')
  const todosMeses = !esNingunMes && visibleMeses.length > 0 && (
    filters.mes.length === 0 || visibleMeses.every(m => filters.mes.includes(m))
  );

  const isMesChecked = (m: string) => todosMeses || filters.mes.includes(m);

  const toggleMes = (m: string) => {
    let next: string[];
    if (todosMeses) {
      next = visibleMeses.filter(x => x !== m);
    } else if (esNingunMes) {
      next = [m];
    } else if (filters.mes.includes(m)) {
      next = filters.mes.filter(x => x !== m);
    } else {
      next = [...filters.mes, m];
    }
    setFilters({ mes: next.length === 0 ? [MES_NINGUNO] : next, fecha: 'ALL' });
  };

  const seleccionarTodosMeses = () => {
    setFilters({ mes: [...visibleMeses], fecha: 'ALL' });
  };

  const limpiarMeses = () => {
    setFilters({ mes: [MES_NINGUNO], fecha: 'ALL' });
  };

  const formatMes = (m: string) => {
    if (!m) return '';
    if (filters.ano === 'ALL') return m;
    const partes = m.split('-');
    if (partes.length !== 2) return m;
    const n = parseInt(partes[1], 10);
    const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return nombres[n - 1] || partes[1];
  };

  const mesEjecucion = mesList[mesList.length - 1] || '';

  const mesLabel = (() => {
    if (visibleMeses.length === 0) return 'Sin meses';
    if (esNingunMes) return 'Ningún mes';
    if (todosMeses) return `Todos los meses (${visibleMeses.length})`;
    if (filters.mes.length === 0) return `Todos (${formatMes(mesEjecucion)})`;
    if (filters.mes.length === 1) return formatMes(filters.mes[0]);
    return `${filters.mes.length} meses`;
  })();

  // ---- Días ----
  const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const formatDia = (fechaStr: string) => {
    const partes = String(fechaStr || '').split('-');
    if (partes.length !== 3) return fechaStr;
    const y = parseInt(partes[0], 10);
    const m = parseInt(partes[1], 10);
    const d = parseInt(partes[2], 10);
    const dateObj = new Date(y, m - 1, d);
    const nomDia = diasSemana[dateObj.getDay()] || '';
    return `${partes[2]} - ${nomDia}`;
  };

  // Extraer días únicos disponibles (01 a 31) sin repetirlos por mes
  const uniqueDays = [...new Set(fechaList.map(f => String(f).slice(8, 10)))].filter(Boolean).sort();

  const selectedDays = new Set(
    filters.fecha === 'ALL'
      ? uniqueDays
      : (filters.fecha ? filters.fecha.split(',').filter(Boolean).map(f => f.slice(8, 10)) : [])
  );

  const isTodosDias = filters.fecha === 'ALL' || (uniqueDays.length > 0 && selectedDays.size === uniqueDays.length);

  const isDiaChecked = (d: string) => isTodosDias || selectedDays.has(d);

  const toggleDia = (d: string) => {
    let nextDays: string[];
    if (isTodosDias) {
      nextDays = uniqueDays.filter(x => x !== d);
    } else if (selectedDays.has(d)) {
      nextDays = Array.from(selectedDays).filter(x => x !== d);
    } else {
      nextDays = [...Array.from(selectedDays), d].sort();
    }

    if (nextDays.length === 0) {
      setFilters({ fecha: '' });
    } else if (nextDays.length === uniqueDays.length) {
      setFilters({ fecha: 'ALL' });
    } else {
      const matchingFechas = fechaList.filter(f => nextDays.includes(f.slice(8, 10)));
      setFilters({ fecha: matchingFechas.join(',') });
    }
  };

  const seleccionarTodosDias = () => {
    setFilters({ fecha: 'ALL' });
  };

  const limpiarDias = () => {
    setFilters({ fecha: '' });
  };

  const diaLabel = (() => {
    if (uniqueDays.length === 0) return 'Sin días';
    if (isTodosDias) return `Todos los días (${uniqueDays.length})`;
    if (selectedDays.size === 0) return 'Seleccionar días…';
    if (selectedDays.size === 1) {
      const d = Array.from(selectedDays)[0];
      if (filters.mes.length === 1) {
        return `1 día (${formatDia(`${filters.mes[0]}-${d}`)})`;
      }
      return `Día ${d}`;
    }
    return `${selectedDays.size} días`;
  })();

  const ctrl: React.CSSProperties = {
    padding: '5px 8px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 12,
    background: 'var(--panel)',
    color: 'var(--text-body)',
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
    color: on ? 'var(--text-title)' : 'var(--text-muted)',
  });

  const btnAction = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '4px 6px',
    borderRadius: 5,
    border: '1px solid var(--border)',
    background: active ? 'rgba(0, 137, 123, 0.12)' : 'transparent',
    color: active ? '#00897B' : 'var(--text-body)',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
  });

  const btnClear: React.CSSProperties = {
    padding: '4px 8px',
    borderRadius: 5,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-muted)',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  };

  return (
    <div id="filters-container" className="filtros" style={{ position: 'relative' }}>
      <label htmlFor="select-proceso">Proceso</label>
      <select
        id="select-proceso"
        value={filters.proceso}
        onChange={e => setFilters({ proceso: e.target.value })}
      >
        <option value="ALL">SCR</option>
        <option value="GESTOR">Multifamiliar</option>
      </select>

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

      {/* Mes */}
      <label htmlFor="btn-mes">Mes</label>
      <div ref={mesRef} style={{ position: 'relative' }}>
        <button
          id="btn-mes"
          type="button"
          onClick={() => { setMesOpen(o => !o); setDiaOpen(false); }}
          style={{ ...ctrl, display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 130 }}
        >
          <span>{mesLabel}</span>
          <span style={{ fontSize: 10, opacity: 0.55 }}>&#9662;</span>
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
              minWidth: 170,
              maxHeight: 280,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', gap: 4, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
              <button type="button" onClick={seleccionarTodosMeses} style={btnAction(todosMeses)}>
                ✓ Seleccionar todos
              </button>
              <button type="button" onClick={limpiarMeses} style={btnClear}>
                Limpiar
              </button>
            </div>
            <label htmlFor="chk-mes-todos" style={row(todosMeses)}>
              <input
                id="chk-mes-todos"
                type="checkbox"
                checked={todosMeses}
                onChange={() => {
                  if (todosMeses) limpiarMeses();
                  else seleccionarTodosMeses();
                }}
              />
              Todos los meses ({visibleMeses.length})
            </label>
            <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
            <div style={{ overflowY: 'auto', maxHeight: 180 }}>
              {visibleMeses.map((m, idx) => {
                const on = isMesChecked(m);
                return (
                  <label key={m} htmlFor={`chk-mes-${idx}`} style={row(on)}>
                    <input id={`chk-mes-${idx}`} type="checkbox" checked={on} onChange={() => toggleMes(m)} />
                    {formatMes(m)}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Día */}
      <label htmlFor="btn-fecha">Día</label>
      <div ref={diaRef} style={{ position: 'relative' }}>
        <button
          id="btn-fecha"
          type="button"
          onClick={() => { setDiaOpen(o => !o); setMesOpen(false); }}
          style={{ ...ctrl, display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 140 }}
        >
          <span>{diaLabel}</span>
          <span style={{ fontSize: 10, opacity: 0.55 }}>&#9662;</span>
        </button>
        {diaOpen && (
          <div
            id="dia-dropdown"
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
              minWidth: 200,
              maxHeight: 280,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', gap: 4, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
              <button type="button" onClick={seleccionarTodosDias} style={btnAction(isTodosDias)}>
                ✓ Seleccionar todos
              </button>
              <button type="button" onClick={limpiarDias} style={btnClear}>
                Limpiar
              </button>
            </div>
            <label htmlFor="chk-dia-todos" style={row(isTodosDias)}>
              <input
                id="chk-dia-todos"
                type="checkbox"
                checked={isTodosDias}
                onChange={() => {
                  if (isTodosDias) limpiarDias();
                  else seleccionarTodosDias();
                }}
              />
              Todos los días ({uniqueDays.length})
            </label>
            <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
            <div style={{ overflowY: 'auto', maxHeight: 180 }}>
              {uniqueDays.map((d, idx) => {
                const on = isDiaChecked(d);
                const labelText = filters.mes.length === 1
                  ? formatDia(`${filters.mes[0]}-${d}`)
                  : `Día ${d}`;
                return (
                  <label key={d} htmlFor={`chk-dia-${idx}`} style={row(on)}>
                    <input id={`chk-dia-${idx}`} type="checkbox" checked={on} onChange={() => toggleDia(d)} />
                    {labelText}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>
        Filtros globales{todosMeses ? ` · Todos los meses (${visibleMeses.length})` : esNingunMes ? ' · Ningún mes' : filters.mes.length ? ` · ${filters.mes.length} mes(es)` : ''}{isTodosDias ? ' · Todos los días' : selectedDays.size ? ` · ${selectedDays.size} día(s)` : ''}
      </span>
    </div>
  );
}