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
const WARN = 'var(--warn)';
const ERR = 'var(--err)';
const LINE = 'var(--border)';

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

/* columnas de la tabla: clave, título, ¿es promedio? */
const isDisponibleType = (tLabel: string) => {
  const s = tLabel.toLowerCase();
  return (
    s.includes('canasta') ||
    s.includes('minicanasta') ||
    s.includes('mini canasta') ||
    s.includes('mt-at') ||
    s.includes('gestor') ||
    s.includes('disponible')
  );
};

const COLS: { key: SortKey; label: string; prom?: boolean; accent?: string; isMoney?: boolean; isPct?: boolean }[] = [
  { key: 'efec', label: 'Efectivas', accent: OK },
  { key: 'fall', label: 'Fallidas (Con Pago)', accent: WARN },
  { key: 'perd', label: 'Perdidas', accent: ERR },
  { key: 'totVis', label: 'Total Visitas' },
  { key: 'ingreso', label: 'Producción Valorizada', accent: 'var(--otc)', isMoney: true },
  { key: 'cump', label: '% Cumplimiento', isPct: true },
  { key: 'promVis', label: 'Prom Vis.', prom: true },
  { key: 'promEfec', label: 'Prom Efec.', prom: true },
];

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
      const typeKey = String(r.Tipo_Cuadrilla || r.Tipo_Brigada_Operaciones || 'Sin Tipo');
      const zoneKey = String(r._Zona || r.Zona || 'Sin Zona');
      const techKey = String(r.Cedula || '');
      const techLabel = String(r.Nombre || techKey);

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

  const brigadasSort = useMemo(() => {
    let arr = brigadas.slice();
    if (categoriaFiltro === 'OPERATIVA') {
      arr = arr.filter(b => !isDisponibleType(b.label));
    } else if (categoriaFiltro === 'DISPONIBLE') {
      arr = arr.filter(b => isDisponibleType(b.label));
    }
    if (q.trim()) {
      arr = arr.filter(b => b.label.toLowerCase().includes(q.trim().toLowerCase()));
    }
    const mult = dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      if (sort === 'label') return a.label.localeCompare(b.label) * mult;
      return (promValue(a, sort) - promValue(b, sort)) * mult;
    });
    return arr;
  }, [brigadas, sort, dir, q, categoriaFiltro]);

  const toggle = (k: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const clickSort = (k: SortKey) => {
    if (sort === k) setDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(k); setDir(k === 'label' ? 'asc' : 'desc'); }
  };

  const exportCSV = () => {
    if (!raw) return;
    const rows = [];
    rows.push(['Mes', 'Zona', 'Tipo de Brigada', 'Categoría Brigada', 'Técnico / Brigada', 'Efectivas', 'Fallidas (con pago)', 'Perdidas', 'Total visitas', 'Producción valorizada', '% Cumplimiento', 'PROM vis', 'Prom efec'].join(';'));
    
    const rowsF = filtRaw(raw.raw, filters);
    
    // Agrupar por Mes -> Tipo -> Zona -> Técnico
    const monthMap: Record<string, Record<string, Record<string, Record<string, { efec: number; fall: number; perd: number; totVis: number; dias: number; ingreso: number; costo: number; techName: string }>>>> = {};

    for (const r of rowsF) {
      const month = String(r.Fecha || '').slice(0, 7) || '—';
      const typeKey = String(r.Tipo_Cuadrilla || r.Tipo_Brigada_Operaciones || 'Sin Tipo');
      const zoneKey = String(r._Zona || r.Zona || 'Sin Zona');
      const techKey = String(r.Cedula || '');
      const techLabel = String(r.Nombre || techKey);

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
  const th: React.CSSProperties = {
    padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap',
    textTransform: 'uppercase', letterSpacing: 0.4, userSelect: 'none', cursor: 'pointer',
    position: 'sticky', top: 0, background: TEAL, zIndex: 2,
  };
  const tdBase: React.CSSProperties = { padding: '9px 12px', fontSize: 13, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  const numCell = (v: number, prom = false, accent?: string): React.CSSProperties => ({
    ...tdBase, textAlign: 'right', color: v === 0 ? 'var(--text-muted)' : (accent || INK),
    fontWeight: prom ? 600 : 500,
  });
  const arrow = (k: SortKey) => (sort === k ? (dir === 'asc' ? ' ▲' : ' ▼') : '');

  const getPctColor = (val: number) => {
    if (val >= 100) return OK;
    if (val >= 85) return WARN;
    return ERR;
  };

  const dataCells = (r: Row, prom = false) => COLS.map(c => {
    const v = (c.prom || c.isPct) ? promValue(r, c.key) : num((r as unknown as Record<string, number>)[c.key]);
    const displayVal = c.isMoney 
      ? fmtCOP(v) 
      : c.isPct 
      ? `${v.toFixed(1)}%` 
      : c.prom 
      ? v.toFixed(2) 
      : fmtN(v);
      
    const cellAccent = c.isPct ? getPctColor(v) : c.accent;

    return (
      <td key={c.key} style={numCell(v, !!(c.prom || c.isPct), cellAccent)}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: `1px solid ${LINE}`, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 1.5, color: INK }}>DETALLE OPERATIVO POR BRIGADAS</div>
            <div style={{ fontSize: 12, color: MUT, marginTop: 2 }}>
              Jerarquía: Tipo de Brigada → Zona → Técnico · Periodo <b style={{ color: INK }}>{periodo}</b>
            </div>
          </div>
          
          {/* Selector de categoría: Operativas vs Disponibles */}
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
              ⚡ Operativas ({brigadas.filter(b => !isDisponibleType(b.label)).length})
            </button>
            <button
              onClick={() => setCategoriaFiltro('DISPONIBLE')}
              style={{
                padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
                background: categoriaFiltro === 'DISPONIBLE' ? TEAL : 'transparent',
                color: categoriaFiltro === 'DISPONIBLE' ? '#fff' : MUT,
              }}
            >
              📋 Disponibles ({brigadas.filter(b => isDisponibleType(b.label)).length})
            </button>
          </div>

          <button
            onClick={exportCSV}
            style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${TEAL}`, background: 'transparent', color: TEAL, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            Exportar CSV
          </button>
          <input
            value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar tipo…"
            style={{ padding: '8px 12px', border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 13, width: 160, outline: 'none', color: INK }}
          />
          <button
            onClick={onClose} aria-label="Cerrar"
            style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${LINE}`, background: 'var(--panel)', color: MUT, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
          >×</button>
        </div>

        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left', cursor: 'pointer' }} onClick={() => clickSort('label')}>
                  Agrupación{arrow('label')}
                </th>
                {COLS.map(c => (
                  <th key={c.key} style={{ ...th, textAlign: 'right' }} onClick={() => clickSort(c.key)}>
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
                />
              ))}
              {brigadasSort.length === 0 && (
                <tr><td colSpan={COLS.length + 1} style={{ ...tdBase, textAlign: 'center', color: MUT, padding: 28 }}>
                  No hay registros para el filtro actual.
                </td></tr>
              )}
            </tbody>
            {total && (
              <tfoot>
                <tr style={{ position: 'sticky', bottom: 0 }}>
                  <td style={{ ...tdBase, fontWeight: 800, color: INK, background: 'var(--th-bg)', borderTop: `2px solid ${TEAL}` }}>Total</td>
                  {COLS.map(c => {
                    const v = (c.prom || c.isPct) ? promValue(total, c.key) : num((total as unknown as Record<string, number>)[c.key]);
                    const displayVal = c.isMoney 
                      ? fmtCOP(v) 
                      : c.isPct 
                      ? `${v.toFixed(1)}%` 
                      : c.prom 
                      ? v.toFixed(2) 
                      : fmtN(v);
                    const cellAccent = c.isPct ? getPctColor(v) : c.accent;
                    return (
                      <td key={c.key} style={{ ...tdBase, textAlign: 'right', fontWeight: 800, color: cellAccent || INK, background: 'var(--th-bg)', borderTop: `2px solid ${TEAL}` }}>
                        {displayVal}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div style={{ padding: '10px 20px', borderTop: `1px solid ${LINE}`, fontSize: 11.5, color: MUT, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span>{brigadasSort.length} agrupaciones principales · {total ? fmtN(total.dias) : 0} técnico-días</span>
          <span>Producción = Ingresos valorizados · % Cumplimiento = (Producción ÷ Costo) × 100</span>
        </div>
      </div>
    </div>
  );
}

/* ------- Fila recursiva ------- */
function RowRecursive({
  node, level, zebra, expanded, onToggle, dataCells,
}: {
  node: Row; level: number; zebra: boolean; expanded: Set<string>; onToggle: (k: string) => void;
  dataCells: (r: Row, prom?: boolean) => React.ReactNode;
}) {
  const open = expanded.has(node.key);
  const isLeaf = !node.children || node.children.length === 0;
  
  let rowBg = 'var(--panel)';
  if (level === 0) rowBg = open ? 'var(--hover-bg)' : zebra ? 'var(--card)' : 'var(--panel)';
  else if (level === 1) rowBg = open ? 'var(--hover-bg)' : 'var(--panel)';

  const chev: React.CSSProperties = {
    display: 'inline-block', width: 16, transition: 'transform .18s',
    transform: open ? 'rotate(90deg)' : 'none', color: level === 0 ? TEAL : MUT, fontSize: 12,
  };

  const padLeft = level * 24 + 12;

  return (
    <>
      <tr
        onClick={() => !isLeaf && onToggle(node.key)}
        style={{ background: rowBg, cursor: isLeaf ? 'default' : 'pointer', borderBottom: `1px solid ${LINE}` }}
      >
        <td style={{ padding: `8px 12px 8px ${padLeft}px`, fontSize: 13.5 - level * 0.5, fontWeight: level === 0 ? 700 : 500, color: isLeaf ? 'var(--text-body)' : INK, whiteSpace: 'nowrap' }}>
          {!isLeaf ? <span style={chev}>▶</span> : <span style={{ color: 'var(--border)', marginRight: 6 }}>└</span>}
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
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: MUT }}>
              ({node.children!.length})
            </span>
          )}
          {isLeaf && <span style={{ marginLeft: 8, fontSize: 10.5, color: MUT }}>{fmtN(node.dias)} días</span>}
        </td>
        {dataCells(node)}
      </tr>
      {open && !isLeaf && node.children!.map((child, i) => (
        <RowRecursive 
          key={child.key} 
          node={child} 
          level={level + 1} 
          zebra={false} 
          expanded={expanded} 
          onToggle={onToggle} 
          dataCells={dataCells} 
        />
      ))}
    </>
  );
}