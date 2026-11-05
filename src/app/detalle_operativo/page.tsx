'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { filtRaw } from '../components/utils/filters';
import { fmtN, fmtCOP, num } from '../components/utils/formatters';
import { descargarCsv } from '../components/utils/exportFile';

/* Paleta y tokens de diseño */
const TEAL = 'var(--sip)';
const INK = 'var(--text-title)';
const MUT = 'var(--text-muted)';
const OK = 'var(--ok)';
const WARN = '#8A6D00';
const ERR = 'var(--err)';
const LINE = 'var(--border)';

// Color fijo por tipo de brigada para los rieles
const COLOR_BRIGADA: Record<string, string> = {
  'SCR PESADA': '#38764C',                // verde oscuro
  'SCR LIVIANA': '#2E6FB5',               // azul
  'SCR MULTIFAMILIAR': '#78BE20',         // verde lima
  'SCR PESADA DISPONIBILIDAD': '#3E9E56', // verde
  'SCR MINI CANASTA': '#7E56C2',          // morado
  'SCR MEDIDA ESPECIAL': '#B5BD00',       // oliva
  'CANASTA': '#D64A2A',                   // rojo-naranja
  'WEB': '#8F5A24',                       // cafe
  'SCR DISPONIBLE': '#97999B',            // gris
  'BRIGADA PESADA': '#38764C',
  'BRIGADA TIPO PESADA': '#38764C',
  'GESTOR INTEGRAL MULTI': '#78BE20',
  'BRIGADA LIVIANA': '#2E6FB5',
  'BRIGADA TIPO LIVIANA': '#2E6FB5',
  'PESADA MT-AT': '#B5BD00',
  'BRIGADA PESADA/ MT AT': '#B5BD00',
  'BRIGADA CANASTA': '#D64A2A',
  'BRIGADA TIPO CANASTA': '#D64A2A',
  'BRIGADA MINICANASTA': '#7E56C2',
  'BRIGADA TIPO MINICANASTA': '#7E56C2',
  '(D) BRIGADA PESADA': '#4FA3E0',
  '(D) BRIGADA TIPO PESADA': '#4FA3E0',
  'BRIGADA PESADA MT-AT': '#8F5A24',
  'PESADA DISPONIBLE': '#3E9E56',
  'SCR PESADA DISPONIBI': '#3E9E56',
  'Pesada Disponible': '#3E9E56',
  'Scr Pesada Disponibi': '#3E9E56',
};

const HOMOLOGACION_BRIGADA: Record<string, string> = {
  'BRIGADA PESADA': 'SCR PESADA',
  'BRIGADA TIPO PESADA': 'SCR PESADA',
  'PESADA': 'SCR PESADA',
  'BRIGADA LIVIANA': 'SCR LIVIANA',
  'BRIGADA TIPO LIVIANA': 'SCR LIVIANA',
  'LIVIANA': 'SCR LIVIANA',
  'GESTOR INTEGRAL MULTI': 'SCR MULTIFAMILIAR',
  'GESTOR INTEGRAL': 'SCR MULTIFAMILIAR',
  'GESTOR MULTI': 'SCR MULTIFAMILIAR',
  'PESADA MT-AT': 'PESADA MT-AT',
  'BRIGADA PESADA/ MT AT': 'PESADA MT-AT',
  'BRIGADA PESADA MT-AT': 'PESADA MT-AT',
  'PESADA MT': 'PESADA MT-AT',
  'PESADA/ MT AT': 'PESADA MT-AT',
  'BRIGADA MINICANASTA': 'SCR MINI CANASTA',
  'BRIGADA TIPO MINICANASTA': 'SCR MINI CANASTA',
  'BRIGADA CANASTA': 'CANASTA',
  'BRIGADA TIPO CANASTA': 'CANASTA',
  'SCR CANASTA': 'CANASTA',
  '(D) BRIGADA PESADA': 'SCR PESADA DISPONIBILIDAD',
  '(D) BRIGADA TIPO PESADA': 'SCR PESADA DISPONIBILIDAD',
  'PESADA DISPONIBLE': 'Pesada Disponible',
  'SCR PESADA DISPONIBI': 'Scr Pesada Disponibi',
};

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function getDiaSemana(fechaStr: string): string {
  if (!fechaStr || !fechaStr.includes('-')) return '';
  const [y, m, d] = fechaStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(y, m - 1, d);
  return DIAS_SEMANA[dt.getDay()] || '';
}

function getDiaNumero(fechaStr: string): number {
  if (!fechaStr || !fechaStr.includes('-')) return 0;
  const parts = fechaStr.split('-');
  return parseInt(parts[2] || '0', 10);
}

/* Identificación de brigadas de disponibilidad (cumplimiento tope 100%) */
const isDisponibleType = (tLabel: string) => {
  const s = String(tLabel || '').toLowerCase().trim();
  return (
    s.includes('canasta') ||
    s.includes('minicanasta') ||
    s.includes('mini canasta') ||
    s.includes('mt-at') ||
    s.includes('mt at') ||
    s.includes('medida especial') ||
    s.includes('gestor') ||
    s.includes('disponible') ||
    s.includes('disponibi') ||
    s.includes('disponibilidad') ||
    s.includes('multifamiliar') ||
    s.includes('multi')
  );
};

/* Modelo de fila jerárquico (Nivel 0: Tipo -> Nivel 1: Zona -> Nivel 2: Técnico -> Nivel 3: Día) */
export interface Row {
  key: string;
  label: string;
  cedula?: string;
  fechaStr?: string;
  diaSemana?: string;
  diaNum?: number;
  efec: number;
  fall: number;   // fallidas con pago
  perd: number;   // fallidas sin pago + perdidas
  totVis: number;
  dias: number;   // técnico-días (denominador de los promedios)
  ingreso: number; // Producción valorizada acumulada ($ COP)
  costo: number;   // Meta Facturación / Costo ($ COP)
  children?: Row[];
}

export type SortKey =
  | 'label' | 'efec' | 'fall' | 'perd'
  | 'totVis' | 'ingreso' | 'costo' | 'cump' | 'promVis' | 'promEfec';

const isRowDisponible = (r: Row, filtroCat?: 'ALL' | 'OPERATIVA' | 'DISPONIBLE'): boolean => {
  if (r.key === '__total') {
    return filtroCat === 'DISPONIBLE';
  }
  const rootType = r.key.split('::')[0];
  return isDisponibleType(rootType) || isDisponibleType(r.label);
};

function promValue(r: Row, key: SortKey, filtroCat?: 'ALL' | 'OPERATIVA' | 'DISPONIBLE'): number {
  const d = r.dias || 1;
  switch (key) {
    case 'cump': {
      const raw = r.costo > 0 ? (r.ingreso / r.costo) * 100 : 0;
      if (isRowDisponible(r, filtroCat)) {
        return raw > 100 ? 100 : raw;
      }
      return raw;
    }
    case 'promVis': return r.totVis / d;
    case 'promEfec': return r.efec / d;
    default: return num((r as unknown as Record<string, number>)[key]);
  }
}

export default function DetalleOperativoPage() {
  const { raw, filters } = useDashboard();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>('efec');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [q, setQ] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState<'ALL' | 'OPERATIVA' | 'DISPONIBLE'>('ALL');

  const isDiaSelected = Boolean(filters.fecha && filters.fecha !== 'ALL');
  const metaLabel = isDiaSelected ? 'META DÍA' : 'META FACTURACIÓN';

  const COLS: { key: SortKey; label: string; prom?: boolean; accent?: string; isMoney?: boolean; isPct?: boolean; borderLeft?: boolean }[] = useMemo(() => [
    { key: 'efec', label: 'EFECTIVAS', accent: OK },
    { key: 'fall', label: 'FALLIDAS C/PAGO', accent: WARN },
    { key: 'perd', label: 'PERDIDAS', accent: ERR },
    { key: 'totVis', label: 'TOTAL' },
    { key: 'ingreso', label: 'VALORIZADA', accent: 'var(--otc)', isMoney: true, borderLeft: true },
    { key: 'costo', label: metaLabel, accent: INK, isMoney: true },
    { key: 'cump', label: '% CUMPL.', isPct: true },
    { key: 'promVis', label: 'VISITAS', prom: true, borderLeft: true },
    { key: 'promEfec', label: 'EFECTIVAS', prom: true },
  ], [metaLabel]);

  /* ------- Construcción de la jerarquía de 4 niveles: Tipo -> Zona -> Técnico -> Día ------- */
  const { brigadas, periodo } = useMemo(() => {
    const empty = { brigadas: [] as Row[], periodo: '—' };
    if (!raw) return empty;
    const rows = filtRaw(raw.raw, filters);

    const rootMap: Record<string, Row> = {};

    for (const r of rows) {
      const rawType = String(r.Tipo_Brigada_Operaciones || r.Tipo_Brigada_Mes || r.Tipo_Cuadrilla || 'Sin tipo').trim();
      const typeKey = HOMOLOGACION_BRIGADA[rawType.toUpperCase()] || rawType || 'Sin tipo';
      const zoneKey = String(r._Zona || r.Zona || 'Sin Zona');
      const rawTech = String(r.Cedula || '').trim();
      const techKey = rawTech ? rawTech.replace(/\.0+$/, '').replace(/\D/g, '') : '';
      const techLabel = String(r.Nombre || techKey || 'Sin Identificación');
      const fechaStr = String(r.Fecha || '').trim().slice(0, 10);
      if (!fechaStr) continue;

      // 1. Tipo de brigada (Nivel 0)
      if (!rootMap[typeKey]) {
        rootMap[typeKey] = {
          key: typeKey,
          label: typeKey,
          efec: 0, fall: 0, perd: 0, totVis: 0, dias: 0, ingreso: 0, costo: 0,
          children: []
        };
      }
      const typeNode = rootMap[typeKey];

      // 2. Zona / Proyecto (Nivel 1)
      let zoneNode = typeNode.children!.find(c => c.key === `${typeKey}::${zoneKey}`);
      if (!zoneNode) {
        zoneNode = {
          key: `${typeKey}::${zoneKey}`,
          label: zoneKey,
          efec: 0, fall: 0, perd: 0, totVis: 0, dias: 0, ingreso: 0, costo: 0,
          children: []
        };
        typeNode.children!.push(zoneNode);
      }

      // 3. Técnico (Nivel 2)
      let techNode = zoneNode.children!.find(c => c.key === `${typeKey}::${zoneKey}::${techKey}`);
      if (!techNode) {
        techNode = {
          key: `${typeKey}::${zoneKey}::${techKey}`,
          label: techLabel,
          cedula: techKey,
          efec: 0, fall: 0, perd: 0, totVis: 0, dias: 0, ingreso: 0, costo: 0,
          children: []
        };
        zoneNode.children!.push(techNode);
      }

      // 4. Día de producción (Nivel 3)
      const dayKey = `${typeKey}::${zoneKey}::${techKey}::${fechaStr}`;
      let dayNode = techNode.children!.find(c => c.key === dayKey);
      const isNewDay = !dayNode;
      if (!dayNode) {
        const diaNum = getDiaNumero(fechaStr);
        const diaSemana = getDiaSemana(fechaStr);
        dayNode = {
          key: dayKey,
          label: `Día ${diaNum} · ${fechaStr} (${diaSemana})`,
          fechaStr,
          diaSemana,
          diaNum,
          efec: 0, fall: 0, perd: 0, totVis: 0, dias: 1, ingreso: 0, costo: 0
        };
        techNode.children!.push(dayNode);
      }

      const efec = num(r.Efectivas);
      const fall = num(r.Fallida_Con_Pago);
      const perd = num(r.Fallida_Sin_Pago) + num(r.Perdidas);
      const totVis = efec + fall + perd;
      const ingreso = num(r.Ingresos);
      const costo = num(r.Meta_Facturacion);

      // Acumula métricas en el registro diario
      dayNode.efec += efec;
      dayNode.fall += fall;
      dayNode.perd += perd;
      dayNode.totVis += totVis;
      dayNode.ingreso += ingreso;
      dayNode.costo += costo;

      // Acumula métricas en técnico, zona y tipo
      for (const acc of [typeNode, zoneNode, techNode]) {
        acc.efec += efec;
        acc.fall += fall;
        acc.perd += perd;
        acc.totVis += totVis;
        if (isNewDay) {
          acc.dias += 1;
        }
        acc.ingreso += ingreso;
        acc.costo += costo;
      }
    }

    // Ordenamiento por defecto:
    // - Días: siempre cronológicos ascendente
    // - Técnicos: por efectivas descendente
    // - Zonas: por efectivas descendente
    // - Brigadas: por efectivas descendente
    const brigadas = Object.values(rootMap).map(typeNode => {
      typeNode.children!.forEach(zoneNode => {
        zoneNode.children!.forEach(techNode => {
          techNode.children!.sort((a, b) => (a.fechaStr || '').localeCompare(b.fechaStr || ''));
        });
        zoneNode.children!.sort((a, b) => b.efec - a.efec);
      });
      typeNode.children!.sort((a, b) => b.efec - a.efec);
      return typeNode;
    });

    const fechas = [...new Set(rows.map(r => String(r.Fecha || '')).filter(Boolean))].sort();
    const periodo = fechas.length
      ? (fechas.length === 1 ? fechas[0] : `${fechas[0]} … ${fechas[fechas.length - 1]}`)
      : '—';

    return { brigadas, periodo };
  }, [raw, filters]);

  /* Apertura inicial sugerida: abre el primer tipo, zona y técnico para mostrar la jerarquía */
  useEffect(() => {
    if (expanded.size === 0 && brigadas.length > 0) {
      const initialSet = new Set<string>();
      const firstType = brigadas[0];
      if (firstType) {
        initialSet.add(firstType.key);
        const firstZone = firstType.children?.[0];
        if (firstZone) {
          initialSet.add(firstZone.key);
          const firstTech = firstZone.children?.[0];
          if (firstTech) {
            initialSet.add(firstTech.key);
          }
        }
      }
      setExpanded(initialSet);
    }
  }, [brigadas]);

  /* Búsqueda recursiva: busca en tipo, zona, técnico (nombre y cédula) o fecha/día */
  const filterTreeRecursive = (node: Row, query: string): Row | null => {
    const qLower = query.toLowerCase();
    const matchesSelf =
      node.label.toLowerCase().includes(qLower) ||
      (node.cedula && node.cedula.includes(qLower)) ||
      (node.fechaStr && node.fechaStr.includes(qLower));

    if (!node.children || node.children.length === 0) {
      return matchesSelf ? node : null;
    }

    const matchedChildren: Row[] = [];
    for (const child of node.children) {
      const filteredChild = filterTreeRecursive(child, query);
      if (filteredChild) {
        matchedChildren.push(filteredChild);
      }
    }

    if (matchesSelf || matchedChildren.length > 0) {
      return {
        ...node,
        children: matchesSelf && matchedChildren.length === 0 ? node.children : matchedChildren,
      };
    }
    return null;
  };

  /* Filtrado y ordenamiento de brigadas */
  const brigadasSort = useMemo(() => {
    let arr = brigadas.slice();

    if (categoriaFiltro === 'OPERATIVA') {
      arr = arr.filter(b => !isDisponibleType(b.label));
    } else if (categoriaFiltro === 'DISPONIBLE') {
      arr = arr.filter(b => isDisponibleType(b.label));
    }

    if (q.trim()) {
      const filtered: Row[] = [];
      for (const b of arr) {
        const res = filterTreeRecursive(b, q.trim());
        if (res) filtered.push(res);
      }
      arr = filtered;
    }

    const mult = dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      if (sort === 'label') return a.label.localeCompare(b.label) * mult;
      return (promValue(a, sort, categoriaFiltro) - promValue(b, sort, categoriaFiltro)) * mult;
    });

    return arr;
  }, [brigadas, sort, dir, q, categoriaFiltro]);

  /* Total del pie: exclusivamente sobre lo visible en pantalla */
  const totalMostrado = useMemo(() => {
    const t: Row = { key: '__total', label: 'Total', efec: 0, fall: 0, perd: 0, totVis: 0, dias: 0, ingreso: 0, costo: 0 };
    for (const b of brigadasSort) {
      (['efec', 'fall', 'perd', 'totVis', 'dias', 'ingreso', 'costo'] as const).forEach(k => { t[k] += b[k]; });
    }
    return t;
  }, [brigadasSort]);

  /* Claves para Desplegar / Colapsar todo */
  const allParentKeys = useMemo(() => {
    const keys = new Set<string>();
    const collect = (nodes: Row[]) => {
      for (const n of nodes) {
        if (n.children && n.children.length > 0) {
          keys.add(n.key);
          collect(n.children);
        }
      }
    };
    collect(brigadasSort);
    return keys;
  }, [brigadasSort]);

  const allExpanded = useMemo(() => {
    if (allParentKeys.size === 0) return false;
    for (const k of allParentKeys) {
      if (!expanded.has(k)) return false;
    }
    return true;
  }, [allParentKeys, expanded]);

  const toggleAll = () => {
    if (allExpanded) {
      setExpanded(new Set());
    } else {
      setExpanded(new Set(allParentKeys));
    }
  };

  const toggle = (k: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const clickSort = (k: SortKey) => {
    if (sort === k) setDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(k);
      setDir(k === 'label' ? 'asc' : 'desc');
    }
  };

  /* Exportación de CSV detallado que incluye los 4 niveles (con fecha y día) */
  const exportCSV = () => {
    if (!raw) return;
    const exportRows: (string | number)[][] = [];
    const columnas = [
      'Fecha',
      'Día',
      'Día Semana',
      'Mes',
      'Zona / Proyecto',
      'Tipo de Brigada',
      'Categoría Brigada',
      'Cédula',
      'Técnico',
      'Efectivas',
      'Fallidas (con pago)',
      'Perdidas',
      'Total visitas',
      'Producción valorizada ($ COP)',
      'Meta de facturación ($ COP)',
      '% Cumplimiento',
      'Visitas / Día',
      'Efectivas / Día'
    ];

    for (const b of brigadasSort) {
      const isDisp = isDisponibleType(b.label);
      const cat = isDisp ? 'Disponible' : 'Operativa';
      for (const z of (b.children || [])) {
        for (const t of (z.children || [])) {
          for (const d of (t.children || [])) {
            const rawCump = d.costo > 0 ? (d.ingreso / d.costo) * 100 : 0;
            const cumpCap = isDisp && rawCump > 100 ? 100 : rawCump;
            exportRows.push([
              d.fechaStr || '',
              d.diaNum || '',
              d.diaSemana || '',
              d.fechaStr ? d.fechaStr.slice(0, 7) : '',
              z.label,
              b.label,
              cat,
              t.cedula || '',
              t.label,
              d.efec,
              d.fall,
              d.perd,
              d.totVis,
              Math.round(d.ingreso),
              Math.round(d.costo),
              `${cumpCap.toFixed(1)}%`,
              d.totVis.toFixed(2),
              d.efec.toFixed(2),
            ]);
          }
        }
      }
    }

    const fechaExport = filters.fecha && filters.fecha !== 'ALL' ? filters.fecha : filters.mes.join('_') || 'Periodo';
    descargarCsv(`Detalle_Operativo_${fechaExport}.csv`, columnas, exportRows);
  };

  /* Estilos y celdas */
  const tdBase: React.CSSProperties = {
    padding: '7px 12px',
    fontSize: 12.5,
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums'
  };

  const numCell = (v: number, prom = false, accent?: string, borderLeft = false): React.CSSProperties => ({
    ...tdBase,
    textAlign: 'right',
    color: v === 0 ? MUT : (accent || INK),
    fontWeight: prom ? 600 : 500,
    borderLeft: borderLeft ? `1px solid ${LINE}` : undefined,
  });

  const arrow = (k: SortKey) => (sort === k ? (dir === 'asc' ? ' ▲' : ' ▼') : '');

  const getPctColor = (val: number) => {
    if (val >= 100) return OK;
    if (val >= 85) return WARN;
    return ERR;
  };

  const dataCells = (r: Row) => COLS.map(c => {
    const v = (c.prom || c.isPct)
      ? promValue(r, c.key, categoriaFiltro)
      : num((r as unknown as Record<string, number>)[c.key]);

    if (c.isPct) {
      const pctVal = promValue(r, 'cump', categoriaFiltro);
      const pctColor = getPctColor(pctVal);
      const fillW = Math.min(100, Math.max(0, pctVal));
      return (
        <td key={c.key} style={numCell(v, true, pctColor, c.borderLeft)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
            <div style={{ width: 44, height: 6, borderRadius: 3, background: 'var(--hover-bg)', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ width: `${fillW}%`, height: '100%', borderRadius: 3, background: pctColor }} />
            </div>
            <span style={{ minWidth: 46, textAlign: 'right', fontWeight: 700, color: pctColor }}>
              {pctVal.toFixed(1)}%
            </span>
          </div>
        </td>
      );
    }

    const displayVal = c.isMoney
      ? fmtCOP(v)
      : c.prom
      ? v.toFixed(2)
      : fmtN(v);

    return (
      <td key={c.key} style={numCell(v, !!c.prom, c.accent, c.borderLeft)}>
        {displayVal}
      </td>
    );
  });

  const countOperativas = brigadas.filter(b => !isDisponibleType(b.label)).length;
  const countDisponibles = brigadas.filter(b => isDisponibleType(b.label)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', paddingBottom: 24 }}>
      {/* ─────────────────────────────────────────────────────────────
          1. BARRA DE CONTROL SUPERIOR (Independiente y Limpia)
          ───────────────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--card)',
        border: `1px solid ${LINE}`,
        borderRadius: 14,
        padding: '16px 20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>
        {/* Cabecera del módulo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: TEAL,
                display: 'inline-block'
              }} />
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: INK, letterSpacing: 0.5 }}>
                DETALLE OPERATIVO DE BRIGADAS
              </h2>
              <span style={{
                background: 'var(--hover-bg)',
                color: TEAL,
                padding: '2px 8px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                border: `1px solid ${LINE}`
              }}>
                4 NIVELES
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: MUT }}>
              Tipo de Brigada › Proyecto / Zona › Técnico › Días de producción · Periodo: <b style={{ color: INK }}>{periodo}</b>
            </p>
          </div>

          {/* Botones de acción rápida: Colapsar todo y Exportar CSV */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={toggleAll}
              style={{
                background: 'var(--panel)',
                border: `1px solid ${LINE}`,
                color: INK,
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease'
              }}
            >
              <span>{allExpanded ? '⊟' : '⊞'}</span>
              <span>{allExpanded ? 'Colapsar todo' : 'Desplegar todo'}</span>
            </button>

            <button
              onClick={exportCSV}
              style={{
                background: 'var(--brand-grad)',
                border: 'none',
                color: '#FFFFFF',
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                transition: 'all 0.15s ease'
              }}
            >
              <span>⬇</span>
              <span>Exportar CSV detallado</span>
            </button>
          </div>
        </div>

        {/* Fila de filtros internos: Categoría de Brigada y Buscador interactivo */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          paddingTop: 10,
          borderTop: `1px solid ${LINE}`
        }}>
          {/* Tabs segmentadas */}
          <div style={{ display: 'flex', background: 'var(--panel)', padding: 3, borderRadius: 8, border: `1px solid ${LINE}` }}>
            <button
              onClick={() => setCategoriaFiltro('ALL')}
              style={{
                border: 'none',
                background: categoriaFiltro === 'ALL' ? 'var(--card)' : 'transparent',
                color: categoriaFiltro === 'ALL' ? INK : MUT,
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: categoriaFiltro === 'ALL' ? 700 : 500,
                cursor: 'pointer',
                boxShadow: categoriaFiltro === 'ALL' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s'
              }}
            >
              Todas ({brigadas.length})
            </button>
            <button
              onClick={() => setCategoriaFiltro('OPERATIVA')}
              style={{
                border: 'none',
                background: categoriaFiltro === 'OPERATIVA' ? 'var(--card)' : 'transparent',
                color: categoriaFiltro === 'OPERATIVA' ? OK : MUT,
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: categoriaFiltro === 'OPERATIVA' ? 700 : 500,
                cursor: 'pointer',
                boxShadow: categoriaFiltro === 'OPERATIVA' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s'
              }}
            >
              Operativas ({countOperativas})
            </button>
            <button
              onClick={() => setCategoriaFiltro('DISPONIBLE')}
              style={{
                border: 'none',
                background: categoriaFiltro === 'DISPONIBLE' ? 'var(--card)' : 'transparent',
                color: categoriaFiltro === 'DISPONIBLE' ? 'var(--otc)' : MUT,
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: categoriaFiltro === 'DISPONIBLE' ? 700 : 500,
                cursor: 'pointer',
                boxShadow: categoriaFiltro === 'DISPONIBLE' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s'
              }}
            >
              Disponibles ({countDisponibles})
            </button>
          </div>

          {/* Campo de búsqueda en vivo */}
          <div style={{ flex: '1 1 260px', maxWidth: 420 }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Buscar tipo, zona, técnico, cédula o día..."
                style={{
                  width: '100%',
                  background: 'var(--panel)',
                  border: `1px solid ${LINE}`,
                  borderRadius: 8,
                  padding: '8px 12px 8px 34px',
                  fontSize: 12.5,
                  color: INK,
                  outline: 'none',
                }}
              />
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: MUT, fontSize: 13 }}>
                🔍
              </span>
              {q && (
                <button
                  onClick={() => setQ('')}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: MUT,
                    cursor: 'pointer',
                    fontSize: 14,
                    padding: 0
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. TABLA JERÁRQUICA DE 4 NIVELES (Responsiva con primera col fija)
          ───────────────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--card)',
        border: `1px solid ${LINE}`,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Sugerencia de deslizamiento horizontal en pantallas móviles */}
        <div style={{
          padding: '6px 14px',
          background: 'var(--hover-bg)',
          fontSize: 11,
          color: MUT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${LINE}`
        }}>
          <span>↔ Desliza horizontalmente para ver todas las métricas de producción</span>
          <span>{brigadasSort.length} agrupaciones mostradas · {fmtN(totalMostrado.dias)} técnico-días</span>
        </div>

        <div style={{
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          width: '100%',
          maxHeight: 'calc(100vh - 280px)',
        }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 980 }}>
            <thead>
              {/* Nivel 1 de encabezado: Grupos de métricas */}
              <tr>
                <th
                  rowSpan={2}
                  onClick={() => clickSort('label')}
                  style={{
                    position: 'sticky', top: 0, left: 0, zIndex: 12,
                    background: 'var(--panel)', padding: '10px 14px',
                    fontSize: 10.5, fontWeight: 800, color: MUT, textTransform: 'uppercase', letterSpacing: 0.8,
                    borderBottom: `2px solid ${TEAL}`, borderRight: `1px solid ${LINE}`,
                    textAlign: 'left', cursor: 'pointer', userSelect: 'none', minWidth: 320,
                  }}
                >
                  AGRUPACIÓN / JERARQUÍA{arrow('label')}
                </th>
                <th
                  colSpan={4}
                  style={{
                    position: 'sticky', top: 0, zIndex: 6,
                    background: 'var(--panel)', padding: '6px 8px',
                    fontSize: 10, fontWeight: 800, color: MUT, textTransform: 'uppercase', letterSpacing: 1,
                    borderBottom: `1px solid ${LINE}`, textAlign: 'center', userSelect: 'none',
                  }}
                >
                  VISITAS
                </th>
                <th
                  colSpan={3}
                  style={{
                    position: 'sticky', top: 0, zIndex: 6,
                    background: 'var(--panel)', padding: '6px 8px',
                    fontSize: 10, fontWeight: 800, color: MUT, textTransform: 'uppercase', letterSpacing: 1,
                    borderBottom: `1px solid ${LINE}`, borderLeft: `1px solid ${LINE}`,
                    textAlign: 'center', userSelect: 'none',
                  }}
                >
                  PRODUCCIÓN ($ COP)
                </th>
                <th
                  colSpan={2}
                  style={{
                    position: 'sticky', top: 0, zIndex: 6,
                    background: 'var(--panel)', padding: '6px 8px',
                    fontSize: 10, fontWeight: 800, color: MUT, textTransform: 'uppercase', letterSpacing: 1,
                    borderBottom: `1px solid ${LINE}`, borderLeft: `1px solid ${LINE}`,
                    textAlign: 'center', userSelect: 'none',
                  }}
                >
                  PROMEDIO / DÍA
                </th>
              </tr>
              {/* Nivel 2 de encabezado: Columnas individuales ordenables */}
              <tr>
                {COLS.map(c => (
                  <th
                    key={c.key}
                    onClick={() => clickSort(c.key)}
                    style={{
                      position: 'sticky', top: 29, zIndex: 6,
                      background: 'var(--panel)', padding: '8px 10px',
                      fontSize: 10, fontWeight: 700, color: MUT, textTransform: 'uppercase', letterSpacing: 0.4,
                      borderBottom: `2px solid ${TEAL}`, borderLeft: c.borderLeft ? `1px solid ${LINE}` : undefined,
                      textAlign: 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                    }}
                  >
                    {c.label}{arrow(c.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {brigadasSort.map((b, i) => (
                <RowRecursive
                  key={b.key}
                  node={b}
                  level={0}
                  zebra={i % 2 === 1}
                  expanded={expanded}
                  onToggle={toggle}
                  dataCells={dataCells}
                  autoOpen={Boolean(q.trim())}
                />
              ))}
              {brigadasSort.length === 0 && (
                <tr>
                  <td colSpan={COLS.length + 1} style={{ ...tdBase, textAlign: 'center', color: MUT, padding: '40px 16px' }}>
                    No se encontraron registros de producción para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
            {brigadasSort.length > 0 && (
              <tfoot>
                <tr style={{ position: 'sticky', bottom: 0, zIndex: 8 }}>
                  <td
                    style={{
                      ...tdBase, fontWeight: 800, color: INK,
                      position: 'sticky', left: 0, zIndex: 10,
                      background: 'var(--panel)', borderTop: `2px solid ${TEAL}`, borderRight: `1px solid ${LINE}`,
                    }}
                  >
                    Total mostrados
                  </td>
                  {COLS.map(c => {
                    const v = (c.prom || c.isPct)
                      ? promValue(totalMostrado, c.key, categoriaFiltro)
                      : num((totalMostrado as unknown as Record<string, number>)[c.key]);

                    if (c.isPct) {
                      const pctVal = promValue(totalMostrado, 'cump', categoriaFiltro);
                      const pctColor = getPctColor(pctVal);
                      const fillW = Math.min(100, Math.max(0, pctVal));
                      return (
                        <td
                          key={c.key}
                          style={{
                            ...tdBase, textAlign: 'right', fontWeight: 800,
                            background: 'var(--panel)', borderTop: `2px solid ${TEAL}`,
                            borderLeft: c.borderLeft ? `1px solid ${LINE}` : undefined,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                            <div style={{ width: 44, height: 6, borderRadius: 3, background: 'var(--hover-bg)', overflow: 'hidden', flexShrink: 0 }}>
                              <div style={{ width: `${fillW}%`, height: '100%', borderRadius: 3, background: pctColor }} />
                            </div>
                            <span style={{ minWidth: 46, textAlign: 'right', fontWeight: 800, color: pctColor }}>
                              {pctVal.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      );
                    }

                    const displayVal = c.isMoney
                      ? fmtCOP(v)
                      : c.prom
                      ? v.toFixed(2)
                      : fmtN(v);

                    return (
                      <td
                        key={c.key}
                        style={{
                          ...tdBase, textAlign: 'right', fontWeight: 800, color: c.accent || INK,
                          background: 'var(--panel)', borderTop: `2px solid ${TEAL}`,
                          borderLeft: c.borderLeft ? `1px solid ${LINE}` : undefined,
                        }}
                      >
                        {displayVal}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pie informativo */}
        <div style={{
          padding: '10px 16px',
          background: 'var(--panel)',
          borderTop: `1px solid ${LINE}`,
          fontSize: 11,
          color: MUT,
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}>
          <span>Clic en una fila para desplegar su desglose (Tipo › Zona › Técnico › Días) · Clic en un encabezado para ordenar</span>
          <span>% Cumplimiento = (producción ÷ meta) × 100</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   COMPONENTE DE FILA RECURSIVA CON 4 NIVELES
   Level 0: Tipo de Brigada
   Level 1: Proyecto / Zona
   Level 2: Técnico
   Level 3: Día de producción (Leaf)
   ───────────────────────────────────────────────────────────── */
function RowRecursive({
  node, level, zebra, expanded, onToggle, dataCells, autoOpen,
}: {
  node: Row; level: number; zebra: boolean; expanded: Set<string>; onToggle: (k: string) => void;
  dataCells: (r: Row) => React.ReactNode; autoOpen?: boolean;
}) {
  const open = autoOpen || expanded.has(node.key);
  const isLeaf = !node.children || node.children.length === 0;

  // Fondo según nivel y estado de apertura
  let rowBg = 'var(--panel)';
  if (level === 0) {
    rowBg = open ? 'var(--hover-bg)' : (zebra ? 'var(--card)' : 'var(--panel)');
  } else if (level === 1) {
    rowBg = open ? 'var(--hover-bg)' : 'var(--card)';
  } else if (level === 2) {
    rowBg = open ? 'var(--hover-bg)' : 'var(--panel)';
  } else if (level === 3) {
    rowBg = 'var(--card)';
  }

  // Color de guía o riel vertical
  const railColor = level === 0
    ? (COLOR_BRIGADA[node.label.trim().toUpperCase()] || '#97999B')
    : level === 1
    ? '#94A3B8'
    : level === 2
    ? '#64748B'
    : 'var(--border)';

  const chev: React.CSSProperties = {
    display: 'inline-block',
    width: 12,
    transition: 'transform .18s ease',
    transform: open ? 'rotate(90deg)' : 'none',
    color: railColor,
    fontSize: 10,
    marginRight: 6,
    textAlign: 'center',
  };

  const padLeft = level === 0 ? 12 : level === 1 ? 32 : level === 2 ? 52 : 72;

  return (
    <>
      <tr
        onClick={() => !isLeaf && onToggle(node.key)}
        style={{
          background: rowBg,
          cursor: isLeaf ? 'default' : 'pointer',
          borderBottom: `1px solid ${LINE}`,
          transition: 'background 0.15s ease',
        }}
      >
        <td
          style={{
            padding: `7px 12px 7px ${padLeft}px`,
            fontSize: level === 0 ? 13 : level === 1 ? 12.5 : level === 2 ? 12 : 11.5,
            fontWeight: level === 0 ? 700 : level === 1 ? 600 : level === 2 ? 600 : 500,
            color: level === 3 ? 'var(--text-body)' : INK,
            whiteSpace: 'nowrap',
            position: 'sticky',
            left: 0,
            zIndex: 2,
            background: rowBg,
            borderRight: `1px solid ${LINE}`,
          }}
        >
          {/* Riel de color vertical */}
          <span style={{
            display: 'inline-block',
            width: level === 3 ? 2 : 3,
            height: level === 0 ? 17 : level === 1 ? 14 : level === 2 ? 12 : 10,
            borderRadius: 2,
            background: railColor,
            marginRight: 8,
            verticalAlign: 'middle',
            flexShrink: 0,
          }} />

          {/* Flecha o conector de rama */}
          {!isLeaf ? (
            <span style={chev}>▶</span>
          ) : (
            <span style={{ color: 'var(--border)', marginRight: 6, fontSize: 12, fontFamily: 'monospace' }}>
              └─
            </span>
          )}

          {/* Texto del nodo */}
          {level === 3 ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontFamily: 'monospace',
                fontSize: 11,
                fontWeight: 700,
                color: TEAL,
              }}>
                📅 {node.fechaStr}
              </span>
              <span style={{
                fontSize: 10.5,
                padding: '1px 6px',
                borderRadius: 4,
                background: 'var(--panel)',
                color: MUT,
                border: `1px solid ${LINE}`
              }}>
                Día {node.diaNum} · {node.diaSemana}
              </span>
            </span>
          ) : (
            <span>{node.label}</span>
          )}

          {/* Badge para Nivel 0 (Operativa / Disponible) */}
          {level === 0 && (
            <span style={{
              marginLeft: 8,
              padding: '2px 7px',
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 700,
              background: isDisponibleType(node.label) ? 'rgba(57,73,171,.12)' : 'rgba(46,125,50,.12)',
              color: isDisponibleType(node.label) ? 'var(--otc)' : 'var(--ok)',
            }}>
              {isDisponibleType(node.label) ? 'Disponible' : 'Operativa'}
            </span>
          )}

          {/* Badge para Nivel 2 (Cédula de ciudadanía) */}
          {level === 2 && node.cedula && (
            <span style={{
              marginLeft: 8,
              padding: '1px 6px',
              borderRadius: 4,
              fontSize: 10,
              fontFamily: 'monospace',
              background: 'var(--card)',
              color: MUT,
              border: `1px solid ${LINE}`
            }}>
              CC {node.cedula}
            </span>
          )}

          {/* Conteo de elementos hijos */}
          {!isLeaf && (
            <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500, color: MUT }}>
              ({node.children!.length} {level === 0 ? 'zonas' : level === 1 ? 'técnicos' : 'días'})
            </span>
          )}
        </td>
        {dataCells(node)}
      </tr>

      {/* Renderizado de hijos si el nodo está expandido */}
      {open && !isLeaf && node.children!.map((child) => (
        <RowRecursive
          key={child.key}
          node={child}
          level={level + 1}
          zebra={false}
          expanded={expanded}
          onToggle={onToggle}
          dataCells={dataCells}
          autoOpen={autoOpen}
        />
      ))}
    </>
  );
}
