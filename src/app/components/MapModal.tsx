'use client';
import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { normBarrio, normBase } from './utils/barrio';

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
    // Guarda de carrera: si cambian los filtros antes de resolver, se ignora
    // la respuesta vieja. Depende de valores primitivos (no del objeto) para no
    // refetch en bucle cuando el padre re-renderiza con un filtrosBase nuevo.
    let ignore = false;
    setLoading(true);
    fetch(`/api/data/map?mes=${mes}&zona=${zona}&proy=${proy}`)
      .then(res => res.json())
      .then(d => {
        if (ignore) return;
        setData(d.pts || []);
        setStatsBarrios(d.stats_barrios || []);
        setLoading(false);
      })
      .catch(e => { if (!ignore) { console.error("Error cargando puntos:", e); setLoading(false); } });

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
    ba: r => fBarrio === 'ALL' || normBarrio(r.ba) === normBarrio(fBarrio),
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

  const dynamicStatsBarrios = React.useMemo(() => {
    const map = new Map<string, any>();
    for (const r of filtered) {
      if (!r.mu || !r.ba) continue;
      const key = `${r.mu}|${r.ba}`;
      let s = map.get(key);
      if (!s) {
        s = { municipio: r.mu, barrio: r.ba, total: 0, efectivas: 0, fallidas: 0, perdidas: 0, motivos: {}, observaciones: [] };
        map.set(key, s);
      }
      s.total++;
      if (r.es === 'Efectiva') {
        s.efectivas++;
      } else {
        if (r.es === 'Fallida') s.fallidas++;
        else if (r.es === 'Perdida') s.perdidas++;
        
        if (r.su) {
          s.motivos[r.su] = (s.motivos[r.su] || 0) + 1;
        }
        
        // Guardar la observación para mostrar en el popup del barrio (limitado a unas cuantas para no desbordar)
        if (r.ob && s.observaciones.length < 50) {
           s.observaciones.push({ fecha: r.fe, nic: r.nic, estado: r.es, subaccion: r.su, texto: r.ob });
        }
      }
    }
    return Array.from(map.values());
  }, [filtered]);

  return (
    <div className="modal-back open" style={{ zIndex: 9999 }}>
      <div className="modal-box" style={{ maxWidth: '1600px', width: '95vw', height: '90vh', maxHeight: '90vh' }}>
        <div className="modal-head">
          <h3>Mapa Operativo Detallado</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-tools">
          <select value={fEstado} onChange={e => setFEstado(e.target.value)}><option value="ALL">Todos los Estados</option>{optionsFor('es').map(x => <option key={x} value={x}>{x}</option>)}</select>
          <select value={fZona} onChange={e => setFZona(e.target.value)}><option value="ALL">Todas las Zonas</option>{optionsFor('zo').map(x => <option key={x} value={x}>{x}</option>)}</select>
          <select value={fAccion} onChange={e => setFAccion(e.target.value)}><option value="ALL">Todas las Acciones</option>{optionsFor('ac').map(x => <option key={x} value={x}>{x}</option>)}</select>
          <select value={fSubaccion} onChange={e => setFSubaccion(e.target.value)}><option value="ALL">Todas las Subacciones</option>{optionsFor('su').map(x => <option key={x} value={x}>{x}</option>)}</select>
          <select value={fTecnico} onChange={e => setFTecnico(e.target.value)}><option value="ALL">Todos los Técnicos</option>{optionsFor('te').map(x => <option key={x} value={x}>{x}</option>)}</select>
          <select value={fMuni} onChange={e => setFMuni(e.target.value)}><option value="ALL">Todos los Municipios</option>{optionsFor('mu').map(x => <option key={x} value={x}>{x}</option>)}</select>
          <select value={fBarrio} onChange={e => setFBarrio(e.target.value)}><option value="ALL">Todos los Barrios</option>{optionsFor('ba').map(x => <option key={x} value={x}>{x}</option>)}</select>
          <select value={fTipo} onChange={e => setFTipo(e.target.value)}><option value="ALL">Todos los Tipos OS</option>{optionsFor('to').map(x => <option key={x} value={x}>{x}</option>)}</select>
          <select value={fDia} onChange={e => setFDia(e.target.value)}><option value="ALL">Día</option>{optionsFor('dia').map(x => <option key={x} value={x}>{x}</option>)}</select>
          <div className="stats">{new Set(filtered.map(r => r.nic ?? `${r.la},${r.lo}`)).size} NIC · {filtered.length} órdenes</div>
        </div>
        <div className="modal-body" style={{ position: 'relative' }}>
          {loading ? <div style={{ padding: 20, color: 'var(--text-muted)' }}>Cargando coordenadas...</div> : <MapComponent points={filtered} geoMuni={geoMuni} geoBarrios={geoBarrios} geoZonas={geoZonas} statsBarrios={dynamicStatsBarrios} selectedBarrio={fBarrio} selectedMuni={fMuni}
              onSelectBarrio={(mu, ba) => { setFMuni(mu || 'ALL'); setFBarrio(ba || 'ALL'); }}
              onReset={() => { setFBarrio('ALL'); setFMuni('ALL'); }} />}
        </div>
      </div>
    </div>
  );
}
