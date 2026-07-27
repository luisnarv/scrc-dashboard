'use client';
import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { canonBarrio, normBase } from './utils/barrio';
import { MapaCache } from '../lib/cache/mapaCache';
import SearchableSelect from './SearchableSelect';

const MapComponent = dynamic(() => import('./MapComponent'), { ssr: false });

interface MapModalProps {
  onClose: () => void;
  filtrosBase: { mes: string; zona: string; proy: string };
}

export default function MapModal({ onClose, filtrosBase }: MapModalProps) {
  const [data, setData] = useState<any[]>([]);
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

  const { mes, zona, proy } = filtrosBase;
  useEffect(() => {
    // Guarda de carrera: si cambian los filtros antes de resolver, se ignora la
    // respuesta vieja. Cache-first: si hay datos locales frescos (TTL) se muestran
    // al instante SIN consultar la BD; si estan viejos o no hay, se pide a la red.
    let ignore = false;

    const traerDeRed = () => fetch(`/api/data/map?mes=${mes}&zona=${zona}&proy=${proy}`)
      .then(res => res.json())
      .then(d => {
        if (ignore) return;
        const pts = d.pts || [], stats = d.stats_barrios || [];
        setData(pts);
        setStatsBarrios(stats);
        setLoading(false);
        MapaCache.put(mes, zona, proy, pts, stats);
      })
      .catch(e => { if (!ignore) { console.error("Error cargando puntos:", e); setLoading(false); } });

    (async () => {
      const cached = await MapaCache.get(mes, zona, proy).catch(() => null);
      if (ignore) return;
      if (cached) {
        setData(cached.pts);
        setStatsBarrios(cached.stats);
        setLoading(false);
        if (!cached.fresco) traerDeRed();   // stale-while-revalidate en 2do plano
      } else {
        setLoading(true);
        traerDeRed();                       // miss: hay que esperar a la red
      }
    })();

    fetch('/geojson/atlantico_municipios.geojson')
      .then(r => r.json())
      .then(d => !ignore && setGeoMuni(d))
      .catch(e => console.error("Error cargando municipios:", e));

    fetch('/geojson/atlantico_barrios.geojson')
      .then(r => r.json())
      .then(d => !ignore && setGeoBarrios(d))
      .catch(e => console.error("Error cargando barrios:", e));

    fetch('/geojson/zonas_atlantico.geojson')
      .then(r => r.json())
      .then(d => !ignore && setGeoZonas(d))
      .catch(e => console.error("Error cargando zonas:", e));

    return () => { ignore = true; };
  }, [mes, zona, proy]);

  // Un predicado por filtro. Se componen para el filtrado y, dejando fuera el
  // propio, para calcular las opciones disponibles de cada select (cascada).
  const dia = (r: any) => String(Number(String(r.fe).slice(-2)) || '');
  // Barrio/municipio usan la MISMA homologacion que el heatmap (normBarrio quita
  // prefijos como "BARRIO"): al clicar un poligono, su nombre (GeoJSON) puede
  // diferir del texto de la BD ("BARRIO ABAJO" vs "ABAJO").
  const preds: Record<string, (r: any) => boolean> = {
    es: r => fEstado === 'ALL' || r.es === fEstado,
    zo: r => fZona === 'ALL' || r.zo === fZona,
    ac: r => fAccion === 'ALL' || r.ac === fAccion,
    su: r => fSubaccion === 'ALL' || r.su === fSubaccion,
    te: r => fTecnico === 'ALL' || r.te === fTecnico,
    mu: r => fMuni === 'ALL' || normBase(r.mu) === normBase(fMuni),
    ba: r => fBarrio === 'ALL' || canonBarrio(r.ba) === canonBarrio(fBarrio),
    to: r => fTipo === 'ALL' || r.to === fTipo,
    dia: r => fDia === 'ALL' || dia(r) === fDia,
  };

  const filtered = data.filter(r => Object.values(preds).every(fn => fn(r)));

  // Opciones disponibles de un campo = valores que sobreviven a TODOS los demas
  // filtros activos (menos el propio). Asi cada select solo ofrece lo alcanzable.
  const optionsFor = (key: string) => {
    const rows = data.filter(r => Object.entries(preds).every(([k, fn]) => k === key || fn(r)));
    const vals = key === 'dia' ? rows.map(dia) : rows.map(r => r[key]);
    return Array.from(new Set(vals.filter(Boolean))).sort(
      key === 'dia' ? (a, b) => Number(a) - Number(b) : undefined
    );
  };

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
      const rateColor = (r: number) => r >= 78 ? '#34d399' : r >= 64 ? '#fbbf24' : '#f87171';
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
      return { ...b, failPct, color: failPct >= 34 ? '#f87171' : failPct >= 22 ? '#fbbf24' : '#34d399' };
    }).filter(b => b.count > 0).sort((a, b) => b.failPct - a.failPct).slice(0, 6);
  }, [filtered]);

  const [detailOpen, setDetailOpen] = useState(false);
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
    fetch(`/api/data/map/obs?mes=${encodeURIComponent(mes || 'ALL')}&nic=${encodeURIComponent(selectedNic.nic)}`)
      .then(r => r.json())
      .then(d => { if (!ignore) setNicObs(d.obs || []); })
      .catch(() => { if (!ignore) setNicObs([]); });
    return () => { ignore = true; };
  }, [selectedNic, mes]);

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
        return { label: v, count: c[v], pct: Math.round(c[v] / T * 100), color: col, barColor: `rgba(${parseInt(col.slice(1,3),16)},${parseInt(col.slice(3,5),16)},${parseInt(col.slice(5,7),16)},0.85)` };
      });
      return { title, rows };
    };
    return [
      sect('ESTADO', 'es', v => v === 'Efectiva' ? '#34d399' : v === 'Fallida' ? '#fbbf24' : v === 'Perdida' ? '#f87171' : '#a78bfa', 4),
      sect('ZONA', 'zo', () => '#22d3ee', 4),
      sect('ACCIÓN', 'ac', () => '#38bdf8', 4),
      sect('SUBACCIÓN', 'su', () => '#818cf8', 5),
      sect('TIPO DE ORDEN', 'to', () => '#fb923c', 4),
    ];
  }, [filtered]);

  return (
    <div className="modal-back open" style={{ zIndex: 9999 }}>
      <div className="modal-box" style={{ maxWidth: '1600px', width: '95vw', height: '90vh', maxHeight: '90vh' }}>
        <div className="modal-head">
          <h3>Mapa Operativo Detallado</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-tools">
          <select value={fEstado} onChange={e => setFEstado(e.target.value)}><option value="ALL">Todos los Estados</option>{optionsFor('es').map(x => <option key={x} value={x}>{x}</option>)}</select>
          <select value={fZona} onChange={e => setFZona(e.target.value)}><option value="ALL">Todas las Zonas</option>{optionsFor('zo').map(x => <option key={x} value={x}>{x}</option>)}</select>
          <select value={fAccion} onChange={e => setFAccion(e.target.value)}><option value="ALL">Todas las Acciones</option>{optionsFor('ac').map(x => <option key={x} value={x}>{x}</option>)}</select>
          <select value={fSubaccion} onChange={e => setFSubaccion(e.target.value)}><option value="ALL">Todas las Subacciones</option>{optionsFor('su').map(x => <option key={x} value={x}>{x}</option>)}</select>
          <SearchableSelect value={fTecnico} onChange={setFTecnico} options={optionsFor('te')} placeholder="Todos los Técnicos" />
          <SearchableSelect value={fMuni} onChange={setFMuni} options={optionsFor('mu')} placeholder="Todos los Municipios" />
          <SearchableSelect value={fBarrio} onChange={setFBarrio} options={optionsFor('ba')} placeholder="Todos los Barrios" />
          <select value={fTipo} onChange={e => setFTipo(e.target.value)}><option value="ALL">Todos los Tipos OS</option>{optionsFor('to').map(x => <option key={x} value={x}>{x}</option>)}</select>
          <select value={fDia} onChange={e => setFDia(e.target.value)}><option value="ALL">Día</option>{optionsFor('dia').map(x => <option key={x} value={x}>{x}</option>)}</select>
          <div className="stats">{new Set(filtered.map(r => r.nic ?? `${r.la},${r.lo}`)).size} NIC · {filtered.length} órdenes</div>
        </div>
        <div className="modal-body" style={{ position: 'relative', display: 'flex', flexDirection: 'row' }}>
          <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            {loading ? <div style={{ padding: 20, color: 'var(--text-muted)' }}>Cargando coordenadas...</div> : <MapComponent points={filtered} mes={mes} geoMuni={geoMuni} geoBarrios={geoBarrios} geoZonas={geoZonas} statsBarrios={mapStatsBarrios} selectedBarrio={fBarrio} selectedMuni={fMuni} selectedZona={fZona}
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
                
            {!loading && (
              <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 1000, background: 'rgba(11, 15, 22, 0.85)', backdropFilter: 'blur(8px)', padding: '12px 14px', borderRadius: 12, border: '1px solid #1a2330', display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'auto', color: '#e6ebf2', fontFamily: 'sans-serif', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }}>
                <div style={{ fontSize: 10.5, letterSpacing: '0.05em', fontWeight: 600, color: '#94a3b8', marginBottom: 2 }}>EFECTIVIDAD DE BARRIO</div>
                {[
                  { color: '#22c55e', label: '≥ 85%', title: 'Verde fuerte: Efectividad ≥ 85% (Rendimiento muy bueno).' },
                  { color: '#84cc16', label: '≥ 70%', title: 'Verde lima: Efectividad ≥ 70% (Rendimiento bueno).' },
                  { color: '#eab308', label: '≥ 50%', title: 'Amarillo: Efectividad ≥ 50% (Rendimiento regular).' },
                  { color: '#f97316', label: '≥ 30%', title: 'Naranja: Efectividad ≥ 30% (Riesgo medio).' },
                  { color: '#ef4444', label: '< 30%', title: 'Rojo: Efectividad < 30% (Riesgo alto / muy baja efectividad).' },
                  { color: '#d1d5db', label: '0%', title: 'Gris: Sin órdenes registradas.' }
                ].map((leg, i) => (
                  <div key={i} title={leg.title} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'help' }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, background: leg.color }}></span>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{leg.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div style={{ width: 334, flexShrink: 0, borderLeft: '1px solid #1a2330', background: '#0c1017', overflowY: 'auto', padding: 17, display: 'flex', flexDirection: 'column', gap: 20 }}>
             
             <div>
               <button onClick={() => setDetailOpen(!detailOpen)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 13px', border: 'none', borderRadius: detailOpen ? '11px 11px 0 0' : '11px', cursor: 'pointer', fontFamily: 'sans-serif', fontSize: 12.5, fontWeight: 600, background: detailOpen ? '#12212e' : 'rgba(13,17,25,0.86)', color: detailOpen ? '#7dd3fc' : '#c8d3e0' }}>
                 <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/></svg>
                 <span>{detailOpen ? 'Ocultar detalle' : 'Ver detalle'} · {filtered.length}</span>
                 <span style={{ display: 'flex', marginLeft: 'auto', transition: 'transform .16s', transform: `rotate(${detailOpen ? 180 : 0}deg)` }}>
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                 </span>
               </button>
               {detailOpen && (
                 <div style={{ padding: '14px 14px 15px', border: '1px solid #24303f', borderTop: 'none', borderRadius: '0 0 11px 11px', background: '#0b0f16', display: 'flex', flexDirection: 'column', gap: 14 }}>
                   {detailSections.map((sec, i) => (
                     <div key={i}>
                       <div style={{ fontSize: 9.5, letterSpacing: '0.14em', fontWeight: 700, color: '#5f7085', marginBottom: 8, fontFamily: 'sans-serif' }}>{sec.title}</div>
                       <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                         {sec.rows.map((r, j) => (
                           <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                             <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: '#dbe3ed', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'sans-serif' }}>{r.label}</span>
                             <span style={{ width: 40, height: 5, borderRadius: 4, background: '#161f2b', overflow: 'hidden', flexShrink: 0 }}>
                               <span style={{ display: 'block', height: '100%', width: `${r.pct}%`, background: r.barColor, borderRadius: 4 }}></span>
                             </span>
                             <span style={{ fontSize: 11, fontWeight: 700, color: r.color, width: 32, textAlign: 'right', flexShrink: 0, fontFamily: 'sans-serif' }}>{r.count}</span>
                             <span style={{ fontSize: 10, color: '#63748a', width: 28, textAlign: 'right', flexShrink: 0, fontFamily: 'sans-serif' }}>{r.pct}%</span>
                           </div>
                         ))}
                       </div>
                     </div>
                   ))}
                 </div>
               )}
             </div>

             <div>
               <button onClick={() => setTechOpen(!techOpen)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 13px', border: 'none', borderRadius: techOpen ? '11px 11px 0 0' : '11px', cursor: 'pointer', fontFamily: 'sans-serif', fontSize: 11.5, letterSpacing: '0.14em', fontWeight: 600, background: 'transparent', color: '#5f7085' }}>
                 <span>CARGA POR TÉCNICO</span>
                 <span style={{ display: 'flex', marginLeft: 'auto', transition: 'transform .16s', transform: `rotate(${techOpen ? 180 : 0}deg)` }}>
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                 </span>
               </button>
               {techOpen && (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 4px' }}>
                   {techCards.map((t, i) => {
                      const hexA = (hex: string, alpha: number) => {
                        let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
                        return `rgba(${r},${g},${b},${alpha})`;
                      };
                      const bg = hexA(t.color, 0.16);
                      return (
                        <div key={i} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 12px', borderRadius: 12, border: '1px solid #182230', background: '#0e141d', color: '#e6ebf2', fontFamily: 'sans-serif' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ width: 29, height: 29, borderRadius: 9, background: bg, color: t.color, fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{t.initials}</span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                              <span style={{ display: 'block', fontSize: 10.5, color: '#63748a', marginTop: 1 }}>{t.zone}</span>
                            </span>
                            <span style={{ fontSize: 16, fontWeight: 700, color: t.color }}>{t.count}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 2, marginTop: 9, height: 5, borderRadius: 3, overflow: 'hidden', background: '#161f2b' }}>
                             {t.efectivas > 0 && <span style={{ height: '100%', width: `${t.efectivas/t.count*100}%`, background: '#34d399' }}></span>}
                             {t.fallidas > 0 && <span style={{ height: '100%', width: `${t.fallidas/t.count*100}%`, background: '#fbbf24' }}></span>}
                             {t.perdidas > 0 && <span style={{ height: '100%', width: `${t.perdidas/t.count*100}%`, background: '#f87171' }}></span>}
                             {t.pendiente > 0 && <span style={{ height: '100%', width: `${t.pendiente/t.count*100}%`, background: '#a78bfa' }}></span>}
                          </div>
                        </div>
                      );
                   })}
                 </div>
               )}
             </div>

             <div>
               <button onClick={() => setBarriosOpen(!barriosOpen)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 13px', border: 'none', borderRadius: barriosOpen ? '11px 11px 0 0' : '11px', cursor: 'pointer', fontFamily: 'sans-serif', fontSize: 11.5, letterSpacing: '0.14em', fontWeight: 600, background: 'transparent', color: '#5f7085' }}>
                 <span>BARRIOS CRÍTICOS</span>
                 <span style={{ display: 'flex', marginLeft: 'auto', transition: 'transform .16s', transform: `rotate(${barriosOpen ? 180 : 0}deg)` }}>
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                 </span>
               </button>
               {barriosOpen && (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 4px' }}>
                   {hotBarrios.map((b, i) => (
                     <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, background: '#0e141d', border: '1px solid #182230', fontFamily: 'sans-serif' }}>
                       <span style={{ width: 5, height: 24, borderRadius: 3, background: b.color, flexShrink: 0 }}></span>
                       <span style={{ flex: 1, minWidth: 0 }}>
                         <span style={{ display: 'block', fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#e6ebf2' }}>{b.name}</span>
                         <span style={{ display: 'block', fontSize: 10.5, color: '#63748a' }}>{b.municipio} · riesgo {b.failPct >= 34 ? 'alto' : b.failPct >= 22 ? 'medio' : 'bajo'}</span>
                       </span>
                       <span style={{ fontSize: 13.5, fontWeight: 700, color: b.color }}>{b.failPct}%</span>
                     </div>
                   ))}
                 </div>
               )}
             </div>

             {selectedNic && (
               <div ref={nicCardRef} style={{ border: '1px solid #24303f', borderRadius: 12, background: '#0b0f16', overflow: 'hidden' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', background: '#12212e' }}>
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7dd3fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                   <span style={{ flex: 1, minWidth: 0, fontFamily: 'sans-serif' }}>
                     <span style={{ display: 'block', fontSize: 9.5, letterSpacing: '0.14em', fontWeight: 700, color: '#5f7085' }}>NIC SELECCIONADO</span>
                     <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: '#e6ebf2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedNic.nic ?? 'Sin NIC'}</span>
                   </span>
                   <button onClick={() => setSelectedNic(null)} title="Cerrar detalle" style={{ border: 'none', background: 'transparent', color: '#63748a', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 4, flexShrink: 0 }}>✕</button>
                 </div>
                 <div style={{ padding: '12px 13px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'sans-serif' }}>
                     <div style={{ display: 'flex', gap: 8, fontSize: 11.5 }}>
                       <span style={{ color: '#63748a', width: 62, flexShrink: 0 }}>Municipio</span>
                       <span style={{ color: '#dbe3ed', fontWeight: 500, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedNic.mu || 'Sin dato'}</span>
                     </div>
                     <div style={{ display: 'flex', gap: 8, fontSize: 11.5 }}>
                       <span style={{ color: '#63748a', width: 62, flexShrink: 0 }}>Barrio</span>
                       <span style={{ color: '#dbe3ed', fontWeight: 500, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedNic.ba || 'Sin dato'}</span>
                     </div>
                     {selectedNic.isNoGps && (
                       <div style={{ fontSize: 10, color: '#a78bfa', marginTop: 2 }}>Ubicado por centroide de barrio (sin GPS)</div>
                     )}
                   </div>
                   <div style={{ display: 'flex', gap: 5, textAlign: 'center' }}>
                     {[
                       { lbl: 'TOTAL', val: selectedNic.total, col: '#e6ebf2' },
                       { lbl: 'EFECT.', val: selectedNic.efectivas, col: '#34d399' },
                       { lbl: 'FALLAS', val: selectedNic.fallidas, col: '#fbbf24' },
                       { lbl: 'PERD.', val: selectedNic.perdidas, col: '#f87171' },
                     ].map((s, i) => (
                       <div key={i} style={{ flex: 1, background: '#0e141d', border: '1px solid #182230', borderRadius: 8, padding: '7px 2px' }}>
                         <div style={{ fontSize: 8.5, fontWeight: 700, color: s.col, opacity: 0.75, letterSpacing: '0.04em' }}>{s.lbl}</div>
                         <div style={{ fontSize: 15, fontWeight: 700, color: s.col, marginTop: 1 }}>{s.val ?? 0}</div>
                       </div>
                     ))}
                   </div>
                   <div>
                     <div style={{ fontSize: 9.5, letterSpacing: '0.14em', fontWeight: 700, color: '#5f7085', marginBottom: 8, fontFamily: 'sans-serif' }}>OBSERVACIONES</div>
                     {nicObs === null ? (
                       <div style={{ fontSize: 11, color: '#63748a', fontFamily: 'sans-serif' }}>Cargando observaciones…</div>
                     ) : nicObs.length === 0 ? (
                       <div style={{ fontSize: 11, color: '#63748a', fontFamily: 'sans-serif' }}>Sin observaciones registradas.</div>
                     ) : (
                       <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 230, overflowY: 'auto' }}>
                         {nicObs.map((o, i) => {
                           const col = o.es === 'Efectiva' ? '#34d399' : o.es === 'Fallida' ? '#fbbf24' : '#f87171';
                           return (
                             <details key={i} style={{ background: '#0e141d', border: '1px solid #182230', borderRadius: 8, padding: '7px 9px', fontFamily: 'sans-serif' }}>
                               <summary style={{ cursor: 'pointer', fontSize: 11, color: col, fontWeight: 600 }}>{o.fe} · {o.su || o.es}</summary>
                               <div style={{ marginTop: 6, fontSize: 11, color: '#b6c2d0', fontStyle: 'italic', lineHeight: 1.4 }}>{`"${o.ob || 'Sin observación'}"`}</div>
                             </details>
                           );
                         })}
                       </div>
                     )}
                   </div>
                 </div>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
