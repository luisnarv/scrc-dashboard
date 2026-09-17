'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { filtRaw } from '../components/utils/filters';
import { fmtN, fmtCOP, num } from '../components/utils/formatters';

/* Paleta del dashboard */
const TEAL = 'var(--sip)';
const INK = 'var(--text-title)';
const MUT = 'var(--text-muted)';
const OK = 'var(--ok)';
const WARN = '#8A6D00'; // Ámbar/oliva accesible sobre fondo claro
const ERR = 'var(--err)';
const LINE = 'var(--border)';

// Color FIJO por tipo de brigada para los rieles
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
  'PESADA DISPONIBLE': 'SCR PESADA DISPONIBILIDAD',
};

/* ---------- modelo de fila (jerárquico) ---------- */
interface Row {
  key: string;
  label: string;
  efec: number;
  fall: number;   // fallidas con pago
  perd: number;   // fallidas sin pago + perdidas
  totVis: number;
  dias: number;   // técnico-días (denominador de los promedios)
  ingreso: number; // Producción valorizada acumulada ($ COP)
  costo: number;   // Costo real de la brigada ($ COP)
  children?: Row[];
}

type SortKey =
  | 'label' | 'efec' | 'fall' | 'perd'
  | 'totVis' | 'ingreso' | 'costo' | 'cump' | 'promVis' | 'promEfec';

/* columnas de la tabla */
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
    s.includes('disponibilidad') ||
    s.includes('multifamiliar') ||
    s.includes('multi')
  );
};

function promValue(r: Row, key: SortKey): number {
  const d = r.dias || 1;
  switch (key) {
    case 'cump': return r.costo > 0 ? (r.ingreso / r.costo) * 100 : 0;
    case 'promVis': return r.totVis / d;
    case 'promEfec': return r.efec / d;
    default: return num((r as unknown as Record<string, number>)[key]);
  }
}

export default function BrigadasDetalleModal({ onClose }: { onClose: () => void }) {
  const { raw, filters } = useDashboard();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>('totVis');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [q, setQ] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState<'ALL' | 'OPERATIVA' | 'DISPONIBLE'>('ALL');

  const isDiaSelected = Boolean(filters.fecha && filters.fecha !== 'ALL');
  const metaLabel = isDiaSelected ? 'META DÍA' : 'META MES';

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

  /* cerrar con Escape + bloquear scroll del fondo */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  /* ------- agregación: Tipo -> Zona -> Técnico ------- */
  const { brigadas, total, periodo } = useMemo(() => {
    const empty = { brigadas: [] as Row[], total: null as Row | null, periodo: '—' };
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

      // Create/Get Type
      if (!rootMap[typeKey]) rootMap[typeKey] = { key: typeKey, label: typeKey, efec: 0, fall: 0, perd: 0, totVis: 0, dias: 0, ingreso: 0, costo: 0, children: [] };
      const typeNode = rootMap[typeKey];

      // Create/Get Zone (find inside Type's children)
      let zoneNode = typeNode.children!.find(c => c.key === `${typeKey}::${zoneKey}`);
      if (!zoneNode) {
        zoneNode = { key: `${typeKey}::${zoneKey}`, label: zoneKey, efec: 0, fall: 0, perd: 0, totVis: 0, dias: 0, ingreso: 0, costo: 0, children: [] };
        typeNode.children!.push(zoneNode);
      }

      // Create/Get Tech (find inside Zone's children)
      let techNode = zoneNode.children!.find(c => c.key === `${typeKey}::${zoneKey}::${techKey}`);
      if (!techNode) {
        techNode = { key: `${typeKey}::${zoneKey}::${techKey}`, label: techLabel, efec: 0, fall: 0, perd: 0, totVis: 0, dias: 0, ingreso: 0, costo: 0 };
        zoneNode.children!.push(techNode);
      }

      const efec = num(r.Efectivas);
      const fall = num(r.Fallida_Con_Pago);
      const perd = num(r.Fallida_Sin_Pago) + num(r.Perdidas);
      const totVis = efec + fall + perd;
      const ingreso = num(r.Ingresos);
      const costo = num(r.Meta_Facturacion);

      for (const acc of [typeNode, zoneNode, techNode]) {
        acc.efec += efec; acc.fall += fall; acc.perd += perd;
        acc.totVis += totVis; acc.dias += 1; acc.ingreso += ingreso; acc.costo += costo;
      }
    }

    // Sort children
    const brigadas = Object.values(rootMap).map(typeNode => {
      typeNode.children!.forEach(zoneNode => {
        zoneNode.children!.sort((a, b) => b.efec - a.efec);
      });
      typeNode.children!.sort((a, b) => b.efec - a.efec);
      return typeNode;
    });

    const total: Row = brigadas.reduce((s, b) => {
      (['efec', 'fall', 'perd', 'totVis', 'dias', 'ingreso', 'costo'] as const)
        .forEach(k => { s[k] += b[k]; });
      return s;
    }, { key: '__total', label: 'Total', efec: 0, fall: 0, perd: 0, totVis: 0, dias: 0, ingreso: 0, costo: 0 } as Row);

    const fechas = [...new Set(rows.map(r => String(r.Fecha || '')).filter(Boolean))].sort();
    const periodo = fechas.length ? (fechas.length === 1 ? fechas[0] : `${fechas[0]} … ${fechas[fechas.length - 1]}`) : '—';

    return { brigadas, total, periodo };
  }, [raw, filters]);

  /* Filtro recursivo para q (tipo, zona o técnico) */
  const filterTreeRecursive = (node: Row, query: string): Row | null => {
    const qLower = query.toLowerCase();
    const matchesSelf = node.label.toLowerCase().includes(qLower);
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
      return (promValue(a, sort) - promValue(b, sort)) * mult;
    });
    return arr;
  }, [brigadas, sort, dir, q, categoriaFiltro]);

  /* Total del pie: SOLO sobre lo mostrado (respeta operativas/disponibles y la búsqueda). */
  const totalMostrado = useMemo(() => {
    const t: Row = { key: '__total', label: 'Total', efec: 0, fall: 0, perd: 0, totVis: 0, dias: 0, ingreso: 0, costo: 0 };
    for (const b of brigadasSort) {
      (['efec', 'fall', 'perd', 'totVis', 'dias', 'ingreso', 'costo'] as const).forEach(k => { t[k] += b[k]; });
    }
    return t;
  }, [brigadasSort]);

  /* Todas las claves jerárquicas para Desplegar / Contraer todo */
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

  const toggle = (k: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const clickSort = (k: SortKey) => {
    if (sort === k) setDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(k); setDir(k === 'label' ? 'asc' : 'desc'); }
  };

  const exportCSV = () => {
    if (!raw) return;
    const rows = [];
    rows.push(['Mes', 'Zona', 'Tipo de Brigada', 'Categoría Brigada', 'Técnico / Brigada', 'Efectivas', 'Fallidas (con pago)', 'Perdidas', 'Total visitas', 'Producción valorizada', 'Meta de facturación', '% Cumplimiento', 'PROM vis', 'Prom efec'].join(';'));
    
    const rowsF = filtRaw(raw.raw, filters);
    
    // Agrupar por Mes -> Tipo -> Zona -> Técnico
    const monthMap: Record<string, Record<string, Record<string, Record<string, { efec: number; fall: number; perd: number; totVis: number; dias: number; ingreso: number; costo: number; techName: string }>>>> = {};

    for (const r of rowsF) {
      const month = String(r.Fecha || '').slice(0, 7) || '—';
      const rawType = String(r.Tipo_Brigada_Operaciones || r.Tipo_Brigada_Mes || r.Tipo_Cuadrilla || 'Sin tipo').trim();
      const typeKey = HOMOLOGACION_BRIGADA[rawType.toUpperCase()] || rawType || 'Sin tipo';
      const zoneKey = String(r._Zona || r.Zona || 'Sin Zona');
      const rawTech = String(r.Cedula || '').trim();
      const techKey = rawTech ? rawTech.replace(/\.0+$/, '').replace(/\D/g, '') : '';
      const techLabel = String(r.Nombre || techKey || 'Sin Identificación');

      const mNode = (monthMap[month] ??= {});
      const tNode = (mNode[typeKey] ??= {});
      const zNode = (tNode[zoneKey] ??= {});
      const tech = (zNode[techKey] ??= { efec: 0, fall: 0, perd: 0, totVis: 0, dias: 0, ingreso: 0, costo: 0, techName: techLabel });

      const efec = num(r.Efectivas);
      const fall = num(r.Fallida_Con_Pago);
      const perd = num(r.Fallida_Sin_Pago) + num(r.Perdidas);
      const totVis = efec + fall + perd;
      const ingreso = num(r.Ingresos);
      const costo = num(r.Meta_Facturacion);

      tech.efec += efec;
      tech.fall += fall;
      tech.perd += perd;
      tech.totVis += totVis;
      tech.dias += 1;
      tech.ingreso += ingreso;
      tech.costo += costo;
    }

    const sortedMonths = Object.keys(monthMap).sort();
    for (const month of sortedMonths) {
      const types = monthMap[month];
      for (const typeKey of Object.keys(types).sort()) {
        const categoria = isDisponibleType(typeKey) ? 'Disponible' : 'Operativa';
        const zones = types[typeKey];
        for (const zoneKey of Object.keys(zones).sort()) {
          const techs = zones[zoneKey];
          for (const techKey of Object.keys(techs).sort()) {
            const tech = techs[techKey];
            const promVis = tech.dias ? tech.totVis / tech.dias : 0;
            const promEfec = tech.dias ? tech.efec / tech.dias : 0;
            const cumpPct = tech.costo > 0 ? (tech.ingreso / tech.costo) * 100 : 0;
            rows.push([
              month,
              zoneKey,
              typeKey.replace(/;/g, ''),
              categoria,
              tech.techName.replace(/;/g, ''),
              tech.efec,
              tech.fall,
              tech.perd,
              tech.totVis,
              Math.round(tech.ingreso),
              Math.round(tech.costo),
              `${cumpPct.toFixed(1)}%`,
              promVis.toFixed(2),
              promEfec.toFixed(2)
            ].join(';'));
          }
        }
      }
    }
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + rows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Detalle_Brigadas.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* --------------------------------- estilos --------------------------------- */
  const tdBase: React.CSSProperties = { padding: '8px 12px', fontSize: 12.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  const numCell = (v: number, prom = false, accent?: string, borderLeft = false): React.CSSProperties => ({
    ...tdBase, textAlign: 'right', color: v === 0 ? MUT : (accent || INK),
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
    const v = (c.prom || c.isPct) ? promValue(r, c.key) : num((r as unknown as Record<string, number>)[c.key]);
    
    if (c.isPct) {
      const pctVal = promValue(r, 'cump');
      const pctColor = getPctColor(pctVal);
      const fillW = Math.min(100, Math.max(0, pctVal));
      return (
        <td key={c.key} style={numCell(v, true, pctColor, c.borderLeft)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7 }}>
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
      
    const cellAccent = c.accent;

    return (
      <td key={c.key} style={numCell(v, !!c.prom, cellAccent, c.borderLeft)}>
        {displayVal}
      </td>
    );
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,27,45,.55)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Detalle por brigadas"
        style={{
          background: 'var(--bg)', borderRadius: 16, width: 'min(1180px, 96vw)', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(20,30,60,.28)',
        }}
      >
        {/* Fila 1: Título y Cerrar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 10px', gap: 14 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 1.5, color: INK }}>DETALLE OPERATIVO POR BRIGADAS</div>
            <div style={{ fontSize: 12, color: MUT, marginTop: 2 }}>
              Tipo de Brigada › Zona › Técnico · Periodo <b style={{ color: INK }}>{periodo}</b>
            </div>
          </div>
          <button
            onClick={onClose} aria-label="Cerrar"
            style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${LINE}`, background: 'var(--panel)', color: MUT, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >×</button>
        </div>

        {/* Fila 2: Franja de resumen del periodo */}
        {total && (
          <div style={{ padding: '0 20px 12px' }}>
            <div style={{
              background: 'var(--hover-bg)',
              borderRadius: 10,
              padding: '12px 14px',
              borderLeft: `3px solid ${TEAL}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 16,
            }}>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, color: MUT }}>EFECTIVAS</div>
                  <div style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: OK }}>{fmtN(total.efec)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, color: MUT }}>TOTAL VISITAS</div>
                  <div style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: INK }}>{fmtN(total.totVis)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, color: MUT }}>PERDIDAS</div>
                  <div style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: ERR }}>{fmtN(total.perd)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, color: MUT }}>VALORIZADA</div>
                  <div style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--otc)' }}>{fmtCOP(total.ingreso)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, color: MUT }}>{metaLabel}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: INK }}>{fmtCOP(total.costo)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, color: MUT }}>% CUMPLIMIENTO</div>
                  <div style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: getPctColor(promValue(total, 'cump')) }}>{promValue(total, 'cump').toFixed(1)}%</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, color: MUT }}>TÉCNICO-DÍAS</div>
                <div style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: INK }}>{fmtN(total.dias)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Fila 3: Barra de herramientas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px 14px', flexWrap: 'wrap' }}>
          {/* Segmentado de categoría */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--panel)', padding: 3, borderRadius: 8, border: `1px solid ${LINE}` }}>
            <button
              onClick={() => setCategoriaFiltro('ALL')}
              style={{
                padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
                background: categoriaFiltro === 'ALL' ? TEAL : 'transparent',
                color: categoriaFiltro === 'ALL' ? '#fff' : MUT,
              }}
            >
              Todas ({brigadas.length})
            </button>
            <button
              onClick={() => setCategoriaFiltro('OPERATIVA')}
              style={{
                padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
                background: categoriaFiltro === 'OPERATIVA' ? TEAL : 'transparent',
                color: categoriaFiltro === 'OPERATIVA' ? '#fff' : MUT,
              }}
            >
              Operativas ({brigadas.filter(b => !isDisponibleType(b.label)).length})
            </button>
            <button
              onClick={() => setCategoriaFiltro('DISPONIBLE')}
              style={{
                padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
                background: categoriaFiltro === 'DISPONIBLE' ? TEAL : 'transparent',
                color: categoriaFiltro === 'DISPONIBLE' ? '#fff' : MUT,
              }}
            >
              Disponibles ({brigadas.filter(b => isDisponibleType(b.label)).length})
            </button>
          </div>

          <input
            value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar tipo, zona o técnico"
            style={{ padding: '6px 12px', border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12.5, width: 220, outline: 'none', background: 'var(--card)', color: INK }}
          />

          <button
            onClick={toggleAll}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${LINE}`, background: 'var(--card)', color: INK, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            {allExpanded ? 'Contraer todo' : 'Desplegar todo'}
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11.5, color: MUT }}>
              {brigadasSort.length} agrupaciones · {fmtN(totalMostrado.dias)} técnico-días
            </span>
            <button
              onClick={exportCSV}
              style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${TEAL}`, background: 'transparent', color: TEAL, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
            >
              Exportar CSV
            </button>
          </div>
        </div>

        {/* Tabla jerárquica con encabezado de 2 niveles y celdas fijas */}
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 980 }}>
            <thead>
              {/* Nivel 1 de encabezado: Grupos */}
              <tr>
                <th
                  rowSpan={2}
                  onClick={() => clickSort('label')}
                  style={{
                    position: 'sticky', top: 0, left: 0, zIndex: 10,
                    background: 'var(--panel)', padding: '8px 14px',
                    fontSize: 10, fontWeight: 800, color: MUT, textTransform: 'uppercase', letterSpacing: 0.8,
                    borderBottom: `2px solid ${TEAL}`, borderRight: `1px solid ${LINE}`,
                    textAlign: 'left', cursor: 'pointer', userSelect: 'none', minWidth: 260,
                  }}
                >
                  AGRUPACIÓN{arrow('label')}
                </th>
                <th
                  colSpan={4}
                  style={{
                    position: 'sticky', top: 0, zIndex: 6,
                    background: 'var(--panel)', padding: '6px 8px',
                    fontSize: 9.5, fontWeight: 800, color: MUT, textTransform: 'uppercase', letterSpacing: 1,
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
                    fontSize: 9.5, fontWeight: 800, color: MUT, textTransform: 'uppercase', letterSpacing: 1,
                    borderBottom: `1px solid ${LINE}`, borderLeft: `1px solid ${LINE}`,
                    textAlign: 'center', userSelect: 'none',
                  }}
                >
                  PRODUCCIÓN
                </th>
                <th
                  colSpan={2}
                  style={{
                    position: 'sticky', top: 0, zIndex: 6,
                    background: 'var(--panel)', padding: '6px 8px',
                    fontSize: 9.5, fontWeight: 800, color: MUT, textTransform: 'uppercase', letterSpacing: 1,
                    borderBottom: `1px solid ${LINE}`, borderLeft: `1px solid ${LINE}`,
                    textAlign: 'center', userSelect: 'none',
                  }}
                >
                  PROMEDIO / DÍA
                </th>
              </tr>
              {/* Nivel 2 de encabezado: Columnas individuales */}
              <tr>
                {COLS.map(c => (
                  <th
                    key={c.key}
                    onClick={() => clickSort(c.key)}
                    style={{
                      position: 'sticky', top: 27, zIndex: 5,
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
                  <td colSpan={COLS.length + 1} style={{ ...tdBase, textAlign: 'center', color: MUT, padding: 32 }}>
                    No hay registros para el filtro actual.
                  </td>
                </tr>
              )}
            </tbody>
            {brigadasSort.length > 0 && (
              <tfoot>
                <tr style={{ position: 'sticky', bottom: 0, zIndex: 4 }}>
                  <td
                    style={{
                      ...tdBase, fontWeight: 800, color: INK,
                      position: 'sticky', left: 0, zIndex: 5,
                      background: 'var(--panel)', borderTop: `2px solid ${TEAL}`, borderRight: `1px solid ${LINE}`,
                    }}
                  >
                    Total
                  </td>
                  {COLS.map(c => {
                    const v = (c.prom || c.isPct) ? promValue(totalMostrado, c.key) : num((totalMostrado as unknown as Record<string, number>)[c.key]);
                    
                    if (c.isPct) {
                      const pctVal = promValue(totalMostrado, 'cump');
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
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7 }}>
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
                    const cellAccent = c.accent;

                    return (
                      <td
                        key={c.key}
                        style={{
                          ...tdBase, textAlign: 'right', fontWeight: 800, color: cellAccent || INK,
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
        <div style={{ padding: '10px 20px', borderTop: `1px solid ${LINE}`, fontSize: 11, color: MUT, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span>Clic en una fila para desplegar zonas y técnicos · clic en un encabezado para ordenar</span>
          <span>% Cumplimiento = (producción ÷ meta) × 100</span>
        </div>
      </div>
    </div>
  );
}

/* ------- Fila recursiva con riel de color y columna fija ------- */
function RowRecursive({
  node, level, zebra, expanded, onToggle, dataCells, autoOpen,
}: {
  node: Row; level: number; zebra: boolean; expanded: Set<string>; onToggle: (k: string) => void;
  dataCells: (r: Row) => React.ReactNode; autoOpen?: boolean;
}) {
  const open = autoOpen || expanded.has(node.key);
  const isLeaf = !node.children || node.children.length === 0;
  
  let rowBg = 'var(--panel)';
  if (level === 0) rowBg = open ? 'var(--hover-bg)' : zebra ? 'var(--card)' : 'var(--panel)';
  else if (level === 1) rowBg = open ? 'var(--hover-bg)' : 'var(--card)';

  const railColor = level === 0 
    ? (COLOR_BRIGADA[node.label.trim().toUpperCase()] || '#97999B')
    : level === 1 
    ? '#9E9E9E' 
    : 'var(--border)';

  const chev: React.CSSProperties = {
    display: 'inline-block', width: 12, transition: 'transform .18s',
    transform: open ? 'rotate(90deg)' : 'none', color: railColor, fontSize: 8.5,
    marginRight: 4, textAlign: 'center',
  };

  const padLeft = level * 20 + 12;

  return (
    <>
      <tr
        onClick={() => !isLeaf && onToggle(node.key)}
        style={{ background: rowBg, cursor: isLeaf ? 'default' : 'pointer', borderBottom: `1px solid ${LINE}` }}
      >
        <td
          style={{
            padding: `7px 12px 7px ${padLeft}px`, fontSize: 13 - level * 0.5, fontWeight: level === 0 ? 700 : 500,
            color: isLeaf ? 'var(--text-body)' : INK, whiteSpace: 'nowrap',
            position: 'sticky', left: 0, zIndex: 2, background: rowBg, borderRight: `1px solid ${LINE}`,
          }}
        >
          {/* Riel de color vertical */}
          <span style={{
            display: 'inline-block',
            width: 3,
            height: level === 0 ? 17 : 13,
            borderRadius: 2,
            background: railColor,
            marginRight: 8,
            verticalAlign: 'middle',
            flexShrink: 0,
          }} />

          {!isLeaf ? <span style={chev}>▶</span> : <span style={{ color: 'var(--border)', marginRight: 6, fontSize: 11 }}>└</span>}
          {node.label}
          {level === 0 && (
            <span style={{
              marginLeft: 8, padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700,
              background: isDisponibleType(node.label) ? 'rgba(57,73,171,.12)' : 'rgba(46,125,50,.12)',
              color: isDisponibleType(node.label) ? 'var(--otc)' : 'var(--ok)',
            }}>
              {isDisponibleType(node.label) ? 'Disponible' : 'Operativa'}
            </span>
          )}
          {!isLeaf && (
            <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500, color: MUT }}>
              ({node.children!.length})
            </span>
          )}
          {isLeaf && <span style={{ marginLeft: 8, fontSize: 10.5, color: MUT }}>{fmtN(node.dias)} días</span>}
        </td>
        {dataCells(node)}
      </tr>
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