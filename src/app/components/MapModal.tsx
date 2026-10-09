'use client';
import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { canonBarrio, normBase } from './utils/barrio';
import { MapaCache } from '../lib/cache/mapaCache';
import ModalShell, { RailField, RailSelect } from './ModalShell';

const MapComponent = dynamic(() => import('./MapComponent'), { ssr: false });

/** true en viewport móvil (<=768px): los controles del panel pasan a 44px. */
function useMovil() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const f = () => setM(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return m;
}

/** Selector con búsqueda a ancho del panel (reemplaza a SearchableSelect, que tiene ancho fijo de 180px). La lista se despliega en línea. */
function RailCombo({ value, onChange, options, placeholder, label }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string; label: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const movil = useMovil();
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQ(''); }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const MAX = 200;
  const coincidencias = options.filter(o => o && o.toLowerCase().includes(q.toLowerCase()));
  const lista = coincidencias.slice(0, MAX);
  const pick = (v: string) => { onChange(v); setOpen(false); setQ(''); };
  const row = (activo: boolean): React.CSSProperties => ({
    padding: movil ? '12px 10px' : '6px 10px', fontSize: movil ? 14 : 12, cursor: 'pointer',
    color: 'var(--text-body)', background: activo ? 'var(--hover-bg)' : 'transparent',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  });
  return (
    <RailField label={label}>
      <div ref={ref}>
        <input
          className="ms-input"
          type="search"
          value={open ? q : (value === 'ALL' ? '' : value)}
          placeholder={placeholder}
          aria-label={label}
          onFocus={() => setOpen(true)}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); setQ(''); } }}
        />
        {open && (
          <div role="listbox" style={{ marginTop: 4, maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--card)' }}>
            <div role="option" aria-selected={value === 'ALL'} onClick={() => pick('ALL')} style={{ ...row(value === 'ALL'), color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Todos</div>
            {lista.length === 0 ? (
              <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text-muted)' }}>Sin resultados</div>
            ) : lista.map(opt => (
              <div key={opt} role="option" aria-selected={value === opt} title={opt} onClick={() => pick(opt)} style={row(value === opt)}>{opt}</div>
            ))}
            {coincidencias.length > MAX && (
              <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-muted)' }}>Mostrando {MAX} de {coincidencias.length}. Escriba para afinar.</div>
            )}
          </div>
        )}
      </div>
    </RailField>
  );
}

/** Rejilla 2×2 TOTAL / EFECTIVAS / FALLIDAS / PERDIDAS de las tarjetas de barrio y NIC. */
function Stats4({ total, efectivas, fallidas, perdidas }: { total?: number; efectivas?: number; fallidas?: number; perdidas?: number }) {
  const items = [
    { lbl: 'TOTAL', val: total, col: 'var(--text-title)' },
    { lbl: 'EFECTIVAS', val: efectivas, col: 'var(--ok)' },
    { lbl: 'FALLIDAS (CON PAGO)', val: fallidas, col: 'var(--warn)' },
    { lbl: 'PERDIDAS (SIN PAGO)', val: perdidas, col: 'var(--err)' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, textAlign: 'center' }}>
      {items.map((s, i) => (
        <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 4px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: s.col, opacity: 0.8, letterSpacing: '0.04em' }}>{s.lbl}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: s.col, marginTop: 1 }}>{s.val ?? 0}</div>
        </div>
      ))}
    </div>
  );
}

interface MapModalProps {
  onClose: () => void;
  filtrosBase: { mes: string; zona: string; proy: string; proceso: string };
  mesesDisponibles?: string[];
}

export default function MapModal({ onClose, filtrosBase, mesesDisponibles = [] }: MapModalProps) {
  const [data, setData] = useState<any[]>([]);
  const [apiFiltros, setApiFiltros] = useState<any>(null);
  
  const [localMes, setLocalMes] = useState(filtrosBase.mes);
  // Ordenes COMPLETAS del barrio seleccionado (traidas bajo demanda del server).
  // Cuando hay barrio, TODOS los indicadores se recalculan sobre este conjunto y
  // no sobre los 25k puntos limitados, para que KPIs/detalle/tecnicos sean exactos.
  const [barrioOrders, setBarrioOrders] = useState<any[] | null>(null);
  const [barrioLoading, setBarrioLoading] = useState(false);
  const [statsBarrios, setStatsBarrios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [geoMuni, setGeoMuni] = useState<any>(null);
  const [geoBarrios, setGeoBarrios] = useState<any>(null);
  const [geoZonas, setGeoZonas] = useState<any>(null);

  // Filters
  const [fAccion, setFAccion] = useState('ALL');
  const [fSubaccion, setFSubaccion] = useState('ALL');
  const [fTecnico, setFTecnico] = useState('ALL');
  const [fMuni, setFMuni] = useState('ALL');
  const [fBarrio, setFBarrio] = useState('ALL');
  const [fZona, setFZona] = useState('ALL');
  const [fDia, setFDia] = useState('ALL');
  const [fTipo, setFTipo] = useState('ALL');
  const [fEstado, setFEstado] = useState('ALL');

  const { zona, proy, proceso } = filtrosBase;
  const isMassive = localMes === 'ALL' || localMes.split(',').length > 3;

  useEffect(() => {
    let ignore = false;
    setLoading(true);

    const traerDeRed = () => fetch(`/api/data/map?mes=${localMes}&zona=${zona}&proy=${proy}&proceso=${proceso}`)
      .then(res => res.json())
      .then(d => {
        if (ignore) return;
        const pts = d.pts || [], stats = d.stats_barrios || [], filtros = d.filtros || null;
        setData(pts);
        setStatsBarrios(stats);
        setApiFiltros(filtros);
        setLoading(false);
        MapaCache.put(localMes, zona, proy, pts, stats, filtros, proceso);
      })
      .catch(() => { if (!ignore) { console.error("Error cargando puntos"); setLoading(false); } });

    (async () => {
      const cached = await MapaCache.get(localMes, zona, proy, proceso).catch(() => null);
      if (ignore) return;
      if (cached) {
        setData(cached.pts);
        setStatsBarrios(cached.stats);
        setApiFiltros(cached.filtros || null);
        setLoading(false);
        if (!cached.fresco) traerDeRed();
      } else {
        setLoading(true);
        traerDeRed();
      }
    })();

    fetch('/geojson/atlantico_municipios.geojson')
      .then(r => r.json())
      .then(d => !ignore && setGeoMuni(d))
      .catch(() => console.error("Error cargando municipios"));

    fetch('/geojson/atlantico_barrios.geojson')
      .then(r => r.json())
      .then(d => !ignore && setGeoBarrios(d))
      .catch(() => console.error("Error cargando barrios"));

    fetch('/geojson/zonas_atlantico.geojson')
      .then(r => r.json())
      .then(d => !ignore && setGeoZonas(d))
      .catch(() => console.error("Error cargando zonas"));

    return () => { ignore = true; };
  }, [localMes, zona, proy, proceso]);

  // Al seleccionar un barrio, traemos TODAS sus ordenes de la BD (no el subconjunto
  // de 25k). Homologamos: pedimos por todos los nombres de barrio de BD que mapean
  // al seleccionado (apiFiltros.barrios es la lista completa), asi cruza aunque el
  // nombre venga del poligono (GeoJSON) o del desplegable (BD).
  useEffect(() => {
    if (fBarrio === 'ALL') { setBarrioOrders(null); setBarrioLoading(false); return; }
    let ignore = false;
    const fuente: string[] = (apiFiltros?.barrios?.length ? apiFiltros.barrios
      : Array.from(new Set(data.map(r => r.ba).filter(Boolean)))) as string[];
    const objetivo = canonBarrio(fBarrio);
    const barriosDB = fuente.filter(b => canonBarrio(b) === objetivo);
    // Sin coincidencia de nombres de BD: caemos al filtrado en cliente (data) en
    // vez de mostrar vacio, dejando que preds.ba resuelva por homologacion.
    if (!barriosDB.length) { setBarrioOrders(null); setBarrioLoading(false); return; }
    setBarrioLoading(true);
    fetch(`/api/data/map/barrio?mes=${encodeURIComponent(localMes)}&zona=${encodeURIComponent(zona)}&barrios=${encodeURIComponent(barriosDB.join('||'))}`)
      .then(r => r.json())
      .then(d => { if (!ignore) { setBarrioOrders(d.pts || []); setBarrioLoading(false); } })
      .catch(() => { if (!ignore) { setBarrioOrders([]); setBarrioLoading(false); } });
    return () => { ignore = true; };
  }, [fBarrio, apiFiltros, localMes, zona, data]);

  const dia = (r: any) => String(Number(String(r.fe).slice(-2)) || '');

  const preds = React.useMemo(() => ({
    es: (r: any) => fEstado === 'ALL' || r.es === fEstado,
    zo: (r: any) => fZona === 'ALL' || r.zo === fZona,
    ac: (r: any) => fAccion === 'ALL' || r.ac === fAccion,
    su: (r: any) => fSubaccion === 'ALL' || r.su === fSubaccion,
    te: (r: any) => fTecnico === 'ALL' || r.te === fTecnico,
    mu: (r: any) => fMuni === 'ALL' || normBase(r.mu) === normBase(fMuni),
    ba: (r: any) => fBarrio === 'ALL' || canonBarrio(r.ba) === canonBarrio(fBarrio),
    to: (r: any) => fTipo === 'ALL' || r.to === fTipo,
    dia: (r: any) => fDia === 'ALL' || dia(r) === fDia,
  }), [fEstado, fZona, fAccion, fSubaccion, fTecnico, fMuni, fBarrio, fTipo, fDia]);

  // Base de calculo de TODOS los indicadores: si hay un barrio seleccionado y ya
  // llegaron sus ordenes completas, se usan esas (barrioOrders); si no, los puntos
  // cargados (data, limitados a 25k). Asi al filtrar barrio nada queda truncado ni
  // proviene de otros barrios.
  const baseOrders = (fBarrio !== 'ALL' && barrioOrders) ? barrioOrders : data;
  const filtered = React.useMemo(() => baseOrders.filter(r => Object.values(preds).every(fn => fn(r))), [baseOrders, preds]);

  // Si tenemos los filtros completos de BD (apiFiltros), los usamos (son más rápidos y no dependen de los 25k puntos limitados).
  // Si no, recaemos en iterar la data, pero al menos lo hacemos una sola vez gracias a useMemo.
  const cachedOptions = React.useMemo(() => {
    const opts: Record<string, string[]> = {};
    const keys = ['es', 'zo', 'ac', 'su', 'te', 'mu', 'ba', 'to', 'dia'];
    
    opts['es'] = ['Efectiva', 'Fallida', 'Perdida'];
    if (apiFiltros) {
      opts['zo'] = apiFiltros.zonas || [];
      opts['ac'] = apiFiltros.acciones || [];
      opts['su'] = apiFiltros.subacciones || [];
      opts['te'] = apiFiltros.tecnicos || [];
      opts['mu'] = apiFiltros.municipios || [];
      opts['ba'] = apiFiltros.barrios || [];
      opts['to'] = []; // No extrajimos 'tipo_os' en backend
    }
    
    for (const key of keys) {
      if (opts[key] && opts[key].length > 0) continue; // Ya los tenemos de BD
      const rows = data.filter(r => Object.entries(preds).every(([k, fn]) => k === key || fn(r)));
      const vals = key === 'dia' ? rows.map(dia) : rows.map(r => r[key]);
      opts[key] = Array.from(new Set(vals.filter(Boolean))).sort(
        key === 'dia' ? (a, b) => Number(a) - Number(b) : undefined
      ) as string[];
    }
    return opts;
  }, [data, preds, apiFiltros]);

  const optionsFor = (key: string) => cachedOptions[key] || [];

  // Color de los barrios en el mapa (heatmap de efectividad). Se calcula sobre
  // TODOS los datos de la ventana (data), NO sobre `filtered`: seleccionar una
  // zona/barrio/nic dirige el detalle del panel y el zoom, pero NO debe apagar el
  // color del mapa. Asi el heatmap de efectividad se mantiene estable siempre.
  const mapStatsBarrios = React.useMemo(() => {
    const map = new Map<string, any>();
    for (const r of data) {
      if (!r.mu || !r.ba) continue;
      const key = `${r.mu}|${r.ba}`;
      let s = map.get(key);
      if (!s) {
        s = { municipio: r.mu, barrio: r.ba, total: 0, efectivas: 0, fallidas: 0, perdidas: 0, motivos: {} };
        map.set(key, s);
      }
      s.total++;
      if (r.es === 'Efectiva') {
        s.efectivas++;
      } else {
        if (r.es === 'Fallida') s.fallidas++;
        else if (r.es === 'Perdida') s.perdidas++;
        // Las observaciones ya no viajan en el payload: se cargan bajo demanda
        // al abrir el popup del barrio. Los motivos si (usan subaccion).
        if (r.su) s.motivos[r.su] = (s.motivos[r.su] || 0) + 1;
      }
    }
    return Array.from(map.values());
  }, [data]);

  // Detalle del barrio seleccionado, calculado SOBRE EL CONJUNTO FILTRADO COMPLETO
  // (filtered ya usa barrioOrders como base). KPIs: Efectividad = efectivas/total;
  // Fallido = (Fallida + Perdida)/total. Incluye lista de tecnicos y de ordenes.
  const selectedBarrioStats = React.useMemo(() => {
    if (fBarrio === 'ALL') return null;
    let total = 0, efectivas = 0, fallidas = 0, perdidas = 0;
    const motivos: Record<string, number> = {};
    const tecMap = new Map<string, any>();
    for (const r of filtered) {
      total++;
      const esEf = r.es === 'Efectiva', esFa = r.es === 'Fallida', esPe = r.es === 'Perdida';
      if (esEf) efectivas++;
      else if (esFa) { fallidas++; if (r.su) motivos[r.su] = (motivos[r.su] || 0) + 1; }
      else if (esPe) { perdidas++; if (r.su) motivos[r.su] = (motivos[r.su] || 0) + 1; }
      const te = r.te || 'Sin técnico';
      let t = tecMap.get(te);
      if (!t) { t = { name: te, total: 0, efectivas: 0, fallido: 0 }; tecMap.set(te, t); }
      t.total++;
      if (esEf) t.efectivas++; else if (esFa || esPe) t.fallido++;
    }
    if (total === 0) return null;
    const fallido = fallidas + perdidas;
    return {
      barrio: fBarrio,
      municipio: fMuni !== 'ALL' ? fMuni : (filtered[0]?.mu || ''),
      total, efectivas, fallidas, perdidas, fallido,
      efectividadPct: Math.round((efectivas / total) * 100),
      fallidoPct: Math.round((fallido / total) * 100),
      motivos,
      tecnicos: Array.from(tecMap.values()).sort((a, b) => b.total - a.total),
      ordenes: filtered,
    };
  }, [fBarrio, fMuni, filtered]);

  const techCards = React.useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      if (!r.te) continue;
      if (!map.has(r.te)) map.set(r.te, { name: r.te, count: 0, efectivas: 0, fallidas: 0, perdidas: 0, pendiente: 0, zone: r.zo || '' });
      const d = map.get(r.te);
      d.count++;
      if (r.es === 'Efectiva') d.efectivas++;
      else if (r.es === 'Fallida') d.fallidas++;
      else if (r.es === 'Perdida') d.perdidas++;
      else d.pendiente++;
    }
    return Array.from(map.values()).map(t => {
      const parts = t.name.split('·')[1] ? t.name.split('·')[1].trim().replace(/\./g, '').split(' ') : t.name.split(' ');
      const initials = (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
      const rateColor = (r: number) => r >= 78 ? 'var(--ok)' : r >= 64 ? 'var(--warn)' : 'var(--err)';
      const pctEf = Math.round(t.efectivas / t.count * 100);
      const col = rateColor(pctEf);
      return { ...t, initials: initials.toUpperCase(), color: col };
    }).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [filtered]);

  const hotBarrios = React.useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      if (!r.ba) continue;
      if (!map.has(r.ba)) map.set(r.ba, { name: r.ba, count: 0, bad: 0, municipio: r.mu || '' });
      const d = map.get(r.ba);
      d.count++;
      if (r.es === 'Fallida' || r.es === 'Perdida') d.bad++;
    }
    return Array.from(map.values()).map(b => {
      const failPct = Math.round(b.bad / b.count * 100);
      return { ...b, failPct, color: failPct >= 34 ? 'var(--err)' : failPct >= 22 ? 'var(--warn)' : 'var(--ok)' };
    }).filter(b => b.count > 0).sort((a, b) => b.failPct - a.failPct).slice(0, 6);
  }, [filtered]);

  const [techOpen, setTechOpen] = useState(false);
  const [barriosOpen, setBarriosOpen] = useState(false);

  // NIC seleccionado en el mapa: su detalle se pinta en el panel derecho (bajo
  // los desplegables). Las observaciones se piden on-demand, igual que el popup.
  const [selectedNic, setSelectedNic] = useState<any>(null);
  const [nicObs, setNicObs] = useState<any[] | null>(null); // null = cargando
  const nicCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedNic?.nic) { setNicObs(null); return; }
    let ignore = false;
    setNicObs(null);
    fetch(`/api/data/map/obs?mes=${encodeURIComponent(localMes || 'ALL')}&nic=${encodeURIComponent(selectedNic.nic)}`)
      .then(r => r.json())
      .then(d => { if (!ignore) setNicObs(d.obs || []); })
      .catch(() => { if (!ignore) setNicObs([]); });
    return () => { ignore = true; };
  }, [selectedNic, localMes]);

  // Al seleccionar un NIC, desplazar el panel para que la tarjeta quede visible
  // aunque los desplegables de arriba esten expandidos.
  useEffect(() => {
    if (selectedNic) nicCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedNic]);

  const detailSections = React.useMemo(() => {
    const T = filtered.length || 1;
    const sect = (title: string, key: string, colorFn: (v: string) => string, limit: number) => {
      const c: Record<string, number> = {};
      filtered.forEach(o => { const val = o[key]; if (val) c[val] = (c[val] || 0) + 1; });
      const rows = Object.keys(c).sort((a, b) => c[b] - c[a]).slice(0, limit).map(v => {
        const col = colorFn(v);
        return { label: v, count: c[v], pct: Math.round(c[v] / T * 100), color: col, barColor: col };
      });
      return { title, rows };
    };
    return [
      sect('ESTADO', 'es', (v) => v === 'Efectiva' ? 'var(--ok)' : (v === 'Fallida' || v === 'Perdida') ? 'var(--err)' : 'var(--text-muted)', 3),
      sect('ZONA', 'zo', () => 'var(--brand-primary)', 4),
      sect('SUBACCIÓN', 'su', () => 'var(--brand-secondary)', 5),
      sect('TIPO DE ORDEN', 'to', () => 'var(--warn)', 4),
    ];
  }, [filtered]);

  // Resumen (KPIs) sobre el conjunto filtrado: mismas definiciones que la tarjeta de barrio
  // (Efectividad = efectivas/total; Fallido = (Fallida + Perdida)/total).
  const resumenKpis = React.useMemo(() => {
    const total = filtered.length;
    const nic = new Set(filtered.map(r => r.nic ?? `${r.la},${r.lo}`)).size;
    let ef = 0, fa = 0;
    for (const r of filtered) {
      if (r.es === 'Efectiva') ef++;
      else if (r.es === 'Fallida' || r.es === 'Perdida') fa++;
    }
    return {
      total, nic,
      efPct: total ? Math.round((ef / total) * 100) : 0,
      faPct: total ? Math.round((fa / total) * 100) : 0,
    };
  }, [filtered]);

  // Leaflet necesita recalcular su tamaño cuando cambia el del contenedor (p. ej. al plegar o
  // desplegar el panel lateral). Leaflet escucha el evento 'resize' de window (trackResize) y llama
  // a map.invalidateSize(); un ResizeObserver sobre el contenedor lo dispara sin tocar MapComponent.
  const mapBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = mapBoxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  const opts = (key: string, todos: string) => [
    { value: 'ALL', label: todos },
    ...optionsFor(key).map(x => ({ value: x, label: x })),
  ];
  const nf = (n: number) => n.toLocaleString('es-CO');

  const subtitulo = (data.length >= 25000 && fBarrio === 'ALL')
    ? <span style={{ color: 'var(--warn)' }}>⚠️ Mostrando muestra de 25k puntos recientes (filtre para afinar)</span>
    : fBarrio !== 'ALL'
      ? <span style={{ color: 'var(--ok)' }}>✓ Barrio con todas sus órdenes ({filtered.length})</span>
      : undefined;

  // Acordeón del panel: botón con etiqueta .ms-label.
  const accordionBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: 0,
    border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
  };
  const chev = (open: boolean) => <span style={{ fontSize: 11, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .16s' }}>▾</span>;
  const cardBox: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', overflow: 'hidden' };
  const cardHead: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', background: 'var(--panel)', borderBottom: '1px solid var(--border)' };
  const closeX: React.CSSProperties = { border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 4, flexShrink: 0 };
  const infoRow: React.CSSProperties = { display: 'flex', gap: 8, fontSize: 11.5 };
  const infoK: React.CSSProperties = { color: 'var(--text-muted)', width: 58, flexShrink: 0 };
  const infoV: React.CSSProperties = { color: 'var(--text-body)', fontWeight: 500, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

  return (
    <ModalShell
      title="Mapa Operativo Detallado"
      subtitle={subtitulo}
      onClose={onClose}
      rootId="map-modal-container"
      closeId="btn-close-map-modal"
      hideViewToggle
      filtros={
        <>
          <RailField label="Periodo">
            <select className="ms-select" value={localMes} onChange={e => setLocalMes(e.target.value)} aria-label="Periodo">
              <option value={filtrosBase.mes}>Meses Seleccionados</option>
              {mesesDisponibles.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </RailField>
          <RailSelect label="Estado" value={fEstado} onChange={setFEstado} options={opts('es', 'Todos los Estados')} />
          <RailCombo label="Municipio" value={fMuni} onChange={setFMuni} options={optionsFor('mu')} placeholder="Todos los Municipios" />
          <RailCombo label="Barrio" value={fBarrio} onChange={setFBarrio} options={optionsFor('ba')} placeholder="Todos los Barrios" />
        </>
      }
      filtrosMas={
        <>
          <RailSelect label="Zona" value={fZona} onChange={setFZona} options={opts('zo', 'Todas las Zonas')} />
          <RailSelect label="Acción" value={fAccion} onChange={setFAccion} options={opts('ac', 'Todas las Acciones')} />
          <RailSelect label="Subacción" value={fSubaccion} onChange={setFSubaccion} options={opts('su', 'Todas las Subacciones')} />
          <RailCombo label="Técnico" value={fTecnico} onChange={setFTecnico} options={optionsFor('te')} placeholder="Todos los Técnicos" />
          <RailSelect label="Tipo de orden" value={fTipo} onChange={setFTipo} options={opts('to', 'Todos los Tipos OS')} />
          <RailSelect label="Día" value={fDia} onChange={setFDia} options={opts('dia', 'Todos los días')} />
        </>
      }
      filtrosMasCount={6}
      resumen={[
        { label: 'NIC', value: nf(resumenKpis.nic) },
        { label: 'Órdenes', value: nf(resumenKpis.total) },
        { label: 'Efectividad', value: `${resumenKpis.efPct}%`, color: 'var(--ok)' },
        { label: 'Fallido', value: `${resumenKpis.faPct}%`, color: 'var(--err)' },
      ]}
      railExtra={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {selectedBarrioStats && !selectedNic && (
            <div id="map-barrio-card" style={cardBox}>
              <div style={cardHead}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="ms-label" style={{ display: 'block' }}>Barrio seleccionado</span>
                  <span id="map-barrio-name" style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text-title)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedBarrioStats.barrio}</span>
                </span>
                <button id="btn-map-close-barrio" onClick={() => { setFBarrio('ALL'); setFMuni('ALL'); }} title="Cerrar detalle" aria-label="Cerrar detalle del barrio" style={closeX}>✕</button>
              </div>
              <div style={{ padding: '10px 10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={infoRow}>
                  <span style={infoK}>Municipio</span>
                  <span style={infoV}>{selectedBarrioStats.municipio || '—'}</span>
                </div>
                {barrioLoading && <div style={{ fontSize: 10, color: 'var(--warn)' }}>Cargando todas las órdenes del barrio…</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ok)', letterSpacing: '0.08em' }}>EFECTIVIDAD</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ok)', marginTop: 2 }}>{selectedBarrioStats.efectividadPct}%</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{selectedBarrioStats.efectivas} / {selectedBarrioStats.total}</div>
                  </div>
                  <div style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--err)', letterSpacing: '0.08em' }}>FALLIDO</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--err)', marginTop: 2 }}>{selectedBarrioStats.fallidoPct}%</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{selectedBarrioStats.fallido} (fall.+perd.)</div>
                  </div>
                </div>
                <Stats4 total={selectedBarrioStats.total} efectivas={selectedBarrioStats.efectivas} fallidas={selectedBarrioStats.fallidas} perdidas={selectedBarrioStats.perdidas} />
                <div>
                  <div className="ms-label" style={{ marginBottom: 6 }}>Principales motivos de fallo</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {Object.entries(selectedBarrioStats.motivos || {})
                      .sort((a: any, b: any) => b[1] - a[1])
                      .slice(0, 5)
                      .map(([mot, cant]: any, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 8 }}>{mot}</span>
                          <span style={{ fontWeight: 700, color: 'var(--text-title)' }}>{cant}</span>
                        </div>
                      ))}
                    {Object.keys(selectedBarrioStats.motivos || {}).length === 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>No hay fallas registradas</div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="ms-label" style={{ marginBottom: 6 }}>Técnicos ({selectedBarrioStats.tecnicos.length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 160, overflowY: 'auto' }}>
                    {selectedBarrioStats.tecnicos.map((t: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                        <span style={{ flex: 1, minWidth: 0, color: 'var(--text-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                        <span title="Efectivas" style={{ color: 'var(--ok)', fontWeight: 700, width: 24, textAlign: 'right' }}>{t.efectivas}</span>
                        <span title="Fallido (fallidas + perdidas)" style={{ color: 'var(--err)', fontWeight: 700, width: 24, textAlign: 'right' }}>{t.fallido}</span>
                        <span title="Total" style={{ color: 'var(--text-muted)', width: 30, textAlign: 'right' }}>{t.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="ms-label" style={{ marginBottom: 6 }}>Órdenes ({selectedBarrioStats.total})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 260, overflowY: 'auto' }}>
                    {selectedBarrioStats.ordenes.slice(0, 500).map((o: any, i: number) => {
                      const col = o.es === 'Efectiva' ? 'var(--ok)' : (o.es === 'Fallida' || o.es === 'Perdida') ? 'var(--err)' : 'var(--brand-secondary)';
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 7px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 10.5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: col, flexShrink: 0 }}></span>
                          <span style={{ color: 'var(--text-body)', fontWeight: 600, width: 54, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.nic ?? 's/NIC'}</span>
                          <span style={{ flex: 1, minWidth: 0, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.te || 'Sin técnico'}</span>
                          <span style={{ color: col, flexShrink: 0 }}>{o.es}</span>
                        </div>
                      );
                    })}
                    {selectedBarrioStats.ordenes.length > 500 && (
                      <div style={{ fontSize: 10, color: 'var(--warn)', textAlign: 'center', padding: '4px 0' }}>Mostrando 500 de {selectedBarrioStats.ordenes.length} (KPIs calculados sobre el total)</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedNic && (
            <div id="map-nic-card" ref={nicCardRef} style={cardBox}>
              <div style={cardHead}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="ms-label" style={{ display: 'block' }}>NIC seleccionado</span>
                  <span id="map-nic-name" style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text-title)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedNic.nic ?? 'Sin NIC'}</span>
                </span>
                <button id="btn-map-close-nic" onClick={() => setSelectedNic(null)} title="Cerrar detalle" aria-label="Cerrar detalle del NIC" style={closeX}>✕</button>
              </div>
              <div style={{ padding: '10px 10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={infoRow}>
                    <span style={infoK}>Municipio</span>
                    <span style={infoV}>{selectedNic.mu || 'Sin dato'}</span>
                  </div>
                  <div style={infoRow}>
                    <span style={infoK}>Barrio</span>
                    <span style={infoV}>{selectedNic.ba || 'Sin dato'}</span>
                  </div>
                  {selectedNic.isNoGps && (
                    <div style={{ fontSize: 10, color: 'var(--brand-secondary)', marginTop: 2 }}>Ubicado por centroide de barrio (sin GPS)</div>
                  )}
                </div>
                <Stats4 total={selectedNic.total} efectivas={selectedNic.efectivas} fallidas={selectedNic.fallidas} perdidas={selectedNic.perdidas} />
                <div>
                  <div className="ms-label" style={{ marginBottom: 6 }}>Observaciones</div>
                  {nicObs === null ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cargando observaciones…</div>
                  ) : nicObs.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sin observaciones registradas.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 230, overflowY: 'auto' }}>
                      {nicObs.map((o, i) => {
                        const col = o.es === 'Efectiva' ? 'var(--ok)' : o.es === 'Fallida' ? 'var(--warn)' : 'var(--err)';
                        return (
                          <details key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 9px' }}>
                            <summary style={{ cursor: 'pointer', fontSize: 11, color: col, fontWeight: 600 }}>{o.fe} · {o.su || o.es}</summary>
                            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.4 }}>{`"${o.ob || 'Sin observación'}"`}</div>
                          </details>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Detalle del conjunto filtrado: ESTADO, ZONA, SUBACCIÓN, TIPO DE ORDEN */}
          {detailSections.map((sec, i) => (
            <div key={i} data-map-detail={sec.title}>
              <div className="ms-label" style={{ marginBottom: 8 }}>{sec.title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sec.rows.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sin datos</div>}
                {sec.rows.map((r, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span title={r.label} style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--text-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
                    <span style={{ width: 26, height: 5, borderRadius: 4, background: 'var(--border)', overflow: 'hidden', flexShrink: 0 }}>
                      <span style={{ display: 'block', height: '100%', width: `${r.pct}%`, background: r.barColor, borderRadius: 4 }}></span>
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: r.color, minWidth: 28, textAlign: 'right', flexShrink: 0 }}>{r.count}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 28, textAlign: 'right', flexShrink: 0 }}>{r.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div>
            <button id="btn-map-toggle-tech" className="ms-label" aria-expanded={techOpen} onClick={() => setTechOpen(!techOpen)} style={accordionBtn}>
              <span>Carga por técnico</span>
              {chev(techOpen)}
            </button>
            {techOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {techCards.map((t, i) => (
                  <div key={i} style={{ padding: '8px 9px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-title)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 26, height: 26, borderRadius: 8, background: `color-mix(in srgb, ${t.color} 16%, transparent)`, color: t.color, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{t.initials}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span title={t.name} style={{ display: 'block', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                        <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>{t.zone}</span>
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: t.color }}>{t.count}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 2, marginTop: 8, height: 5, borderRadius: 3, overflow: 'hidden', background: 'var(--border)' }}>
                      {t.efectivas > 0 && <span style={{ height: '100%', width: `${t.efectivas / t.count * 100}%`, background: 'var(--ok)' }}></span>}
                      {t.fallidas > 0 && <span style={{ height: '100%', width: `${t.fallidas / t.count * 100}%`, background: 'var(--warn)' }}></span>}
                      {t.perdidas > 0 && <span style={{ height: '100%', width: `${t.perdidas / t.count * 100}%`, background: 'var(--err)' }}></span>}
                      {t.pendiente > 0 && <span style={{ height: '100%', width: `${t.pendiente / t.count * 100}%`, background: 'var(--brand-secondary)' }}></span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <button id="btn-map-toggle-barrios" className="ms-label" aria-expanded={barriosOpen} onClick={() => setBarriosOpen(!barriosOpen)} style={accordionBtn}>
              <span>Barrios críticos</span>
              {chev(barriosOpen)}
            </button>
            {barriosOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {hotBarrios.map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 10, background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <span style={{ width: 5, height: 24, borderRadius: 3, background: b.color, flexShrink: 0 }}></span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span title={b.name} style={{ display: 'block', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-title)' }}>{b.name}</span>
                      <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.municipio} · riesgo {b.failPct >= 34 ? 'alto' : b.failPct >= 22 ? 'medio' : 'bajo'}</span>
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: b.color }}>{b.failPct}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      }
    >
      <div ref={mapBoxRef} style={{ position: 'relative', flex: '1 1 auto', minHeight: 320 }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          {loading ? <div style={{ padding: 20, color: 'var(--text-muted)' }}>Cargando coordenadas...</div> : <MapComponent points={filtered} mes={localMes} geoMuni={geoMuni} geoBarrios={geoBarrios} geoZonas={geoZonas} statsBarrios={mapStatsBarrios} selectedBarrio={fBarrio} selectedMuni={fMuni} selectedZona={fZona} isMassive={isMassive}
            onSelectNic={setSelectedNic}
            onSelectBarrio={(mu, ba) => {
              setSelectedNic(null);
              setFBarrio(prev => {
                if (prev === ba) {
                  setFMuni('ALL');
                  return 'ALL';
                }
                setFMuni(mu || 'ALL');
                return ba || 'ALL';
              });
            }}
            onReset={() => { setFBarrio('ALL'); setFMuni('ALL'); setSelectedNic(null); }} />}
        </div>

        {!loading && (
          <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 1000, background: 'rgba(11, 15, 22, 0.85)', backdropFilter: 'blur(8px)', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'auto', color: '#F2F7FF', fontFamily: 'inherit', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ fontSize: 10.5, letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2 }}>EFECTIVIDAD DE BARRIO</div>
            {[
              { color: 'var(--ok)', label: '≥ 85%', title: 'Verde fuerte: Efectividad ≥ 85% (Rendimiento muy bueno).' },
              { color: 'var(--ef-70)', label: '≥ 70%', title: 'Verde lima: Efectividad ≥ 70% (Rendimiento bueno).' },
              { color: 'var(--ef-50)', label: '≥ 50%', title: 'Amarillo: Efectividad ≥ 50% (Rendimiento regular).' },
              { color: 'var(--ef-30)', label: '≥ 30%', title: 'Naranja: Efectividad ≥ 30% (Riesgo medio).' },
              { color: 'var(--err)', label: '< 30%', title: 'Rojo: Efectividad < 30% (Riesgo alto / muy baja efectividad).' },
              { color: 'var(--ef-nan)', label: '0%', title: 'Gris: Sin órdenes registradas.' }
            ].map((leg, i) => (
              <div key={i} title={leg.title} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'help' }}>
                <span style={{ width: 14, height: 14, borderRadius: 3, background: leg.color }}></span>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{leg.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
