'use client';
import React, { useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, LayersControl, useMapEvents, useMap, LayerGroup, CircleMarker, Tooltip } from 'react-leaflet';
import { createLayerComponent } from '@react-leaflet/core';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import 'leaflet-defaulticon-compatibility';
import { canonBarrio, normBarrio, normBase } from './utils/barrio';
import { useTheme } from './ThemeProvider';

// Auto-zoom removido para no sacar de foco al usuario.

// ---- Capa de puntos por NIC, imperativa y en canvas ----
// Un solo LayerGroup con L.circleMarker por punto. Evita crear 19.5k elementos
// React (la reconciliacion era lo que congelaba ~18s al re-filtrar); Leaflet
// dibuja miles de circulos en canvas sin problema.
const colorEfectividad = (e: any) => {
  const totalEval = e.efectivas + e.fallidas + e.perdidas;
  if (totalEval <= 0) return 'var(--ef-nan)';
  const ef = e.efectivas / totalEval;
  if (ef >= 0.85) return 'var(--ok)';
  if (ef >= 0.50) return 'var(--ef-50)';
  return 'var(--err)';
};

  // Detecta clic en el fondo del mapa (fuera de un barrio). Si el clic cae cerca
  // de un NIC se notifica a MapModal (onSelectNic) para pintar su detalle en el
  // panel derecho; si cae en vacio, se restablece la seleccion (onReset).
  function MapInteractionHandler({ allNicPoints, onReset, onSelectNic }: { allNicPoints: any[]; onReset?: () => void; onSelectNic?: (nic: any) => void }) {
    const map = useMapEvents({
      click: (e) => {
        const clickPt = map.latLngToContainerPoint(e.latlng);
        let best: any = null, bestD = Infinity;
        for (const p of allNicPoints) {
          if (p.la == null || p.lo == null) continue;
          if (Math.abs(p.la - e.latlng.lat) > 0.004 || Math.abs(p.lo - e.latlng.lng) > 0.004) continue;
          const pt = map.latLngToContainerPoint([p.la, p.lo]);
          const d = clickPt.distanceTo(pt);
          if (d < bestD) { bestD = d; best = p; }
        }

        if (bestD <= 9 && best) {
          onSelectNic?.(best);
        } else {
          onReset?.();
        }
      }
    });
    return null;
  }

  const CanvasHeatLayer = L.Layer.extend({
    initialize: function(points: any[], options: any) {
      this.points = points;
      this.drawGlow = options.drawGlow !== false;
      this.drawDots = options.drawDots !== false;
      L.setOptions(this, options);
    },
    onAdd: function(map: L.Map) {
      this._map = map;
      this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated');
      this._canvas.style.pointerEvents = 'none';
      map.getPane('overlayPane')?.appendChild(this._canvas);
      map.on('move viewreset resize zoom', this._update, this);
      this._update();
    },
    onRemove: function(map: L.Map) {
      map.getPane('overlayPane')?.removeChild(this._canvas);
      map.off('move viewreset resize zoom', this._update, this);
    },
    setPoints: function(points: any[]) {
      this.points = points;
      this._update();
    },
    _update: function() {
      if (!this._map || !this._canvas) return;
      const map = this._map;
      const size = map.getSize();
      const bounds = map.getBounds();
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, topLeft);
      
      this._canvas.width = size.x;
      this._canvas.height = size.y;
      
      const ctx = this._canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, size.x, size.y);
      
      const computed = getComputedStyle(document.body);
      const getHex = (v: string) => computed.getPropertyValue(v).trim() || '#9ca3af';
      const C_OK = getHex('--ok');
      const C_WARN = getHex('--ef-50');
      const C_ERR = getHex('--err');
      const C_NAN = getHex('--ef-nan');
      
      const getPtColor = (e: any) => {
          const totalEval = (e.efectivas || 0) + (e.fallidas || 0) + (e.perdidas || 0);
          if (totalEval <= 0) return C_NAN;
          if (e.efectivas > 0) return C_OK;
          if (e.fallidas > 0) return C_WARN;
          if (e.perdidas > 0) return C_ERR;
          return C_NAN;
      };

      const hexA = (hex: string, alpha: number) => {
          let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
          if (isNaN(r)) return `rgba(150,150,150,${alpha})`;
          return `rgba(${r},${g},${b},${alpha})`;
      };

      if (this.drawGlow) {
        const R = 26;
        ctx.globalCompositeOperation = 'lighter';
        for (const p of this.points) {
          let la = parseFloat(p.la);
          let lo = parseFloat(p.lo);
          if (isNaN(la) || isNaN(lo)) continue;
          if (la < bounds.getSouth() - 0.1 || la > bounds.getNorth() + 0.1 || lo < bounds.getWest() - 0.1 || lo > bounds.getEast() + 0.1) continue;
          
          const pt = map.latLngToContainerPoint([la, lo]);
          const col = getPtColor(p);
          
          const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, R);
          grad.addColorStop(0, hexA(col, 0.2));
          grad.addColorStop(0.5, hexA(col, 0.08));
          grad.addColorStop(1, hexA(col, 0));
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, R, 0, 2 * Math.PI); ctx.fill();
        }
      }
      
      if (this.drawDots) {
        ctx.globalCompositeOperation = 'source-over';
        for (const p of this.points) {
          let la = parseFloat(p.la);
          let lo = parseFloat(p.lo);
          if (isNaN(la) || isNaN(lo)) continue;
          if (la < bounds.getSouth() - 0.1 || la > bounds.getNorth() + 0.1 || lo < bounds.getWest() - 0.1 || lo > bounds.getEast() + 0.1) continue;
          
          const pt = map.latLngToContainerPoint([la, lo]);
          const col = getPtColor(p);
          
          ctx.fillStyle = hexA(col, 0.90);
          ctx.beginPath(); ctx.arc(pt.x, pt.y, 4.0, 0, 2 * Math.PI); ctx.fill();
        }
      }
    }
  });

  const ContinuousHeatLayer = createLayerComponent<L.Layer, { points: any[]; drawGlow?: boolean; drawDots?: boolean; children?: React.ReactNode }>(
    (props, ctx) => {
      const layer = new (CanvasHeatLayer as any)(props.points, { drawGlow: props.drawGlow, drawDots: props.drawDots });
      return { instance: layer, context: ctx };
    },
    (layer, props, prev) => {
      if (props.points !== prev.points) {
        (layer as any).setPoints(props.points);
      }
    }
  );

function BoundsUpdater({ geoBarrios, geoMuni, geoZonas }: { geoBarrios: any, geoMuni: any, geoZonas: any }) {
  const map = useMap();
  React.useEffect(() => {
    let bounds = L.latLngBounds([]);
    let hasBounds = false;

    // Solo reencuadramos cuando hay una SELECCION explicita: barrio > municipio >
    // zona. Sin seleccion NO se hace nada, de modo que al cargar el mapa conserva
    // su centro/zoom configurado y no se mueve de la ubicacion por defecto.
    if (geoBarrios?.features?.length === 1) {
       bounds.extend(L.geoJSON(geoBarrios).getBounds());
       hasBounds = true;
    } else if (geoMuni?.features?.length === 1) {
       bounds.extend(L.geoJSON(geoMuni).getBounds());
       hasBounds = true;
    } else if (geoZonas?.features?.length) {
       bounds.extend(L.geoJSON(geoZonas).getBounds());
       hasBounds = true;
    }

    if (hasBounds && bounds.isValid()) {
      map.flyToBounds(bounds, { padding: [20, 20], maxZoom: 15, duration: 1.5 });
    }
  }, [geoBarrios, geoMuni, geoZonas, map]);
  return null;
}

export default function MapComponent({ points, mes, geoMuni, geoBarrios, geoZonas, statsBarrios, selectedBarrio = 'ALL', selectedMuni = 'ALL', selectedZona = 'ALL', isMassive = false, onSelectBarrio, onReset, onSelectNic }: { points: any[], mes?: string, geoMuni: any, geoBarrios: any, geoZonas?: any, statsBarrios?: any[], selectedBarrio?: string, selectedMuni?: string, selectedZona?: string, isMassive?: boolean, onSelectBarrio?: (muni: string, barrio: string) => void, onReset?: () => void, onSelectNic?: (nic: any) => void }) {
  const { theme } = useTheme();

  // Nombres de barrio UNICOS en el GeoJSON (aparecen en un solo municipio). Para
  // ellos se cruza SOLO por nombre, porque el municipio de la BD suele venir mal
  // (ej. "Santa Helena": la BD la pone en BARANOA pero geograficamente es de
  // BARRANQUILLA). Los nombres repetidos entre municipios si exigen municipio.
  const nombresUnicos = React.useMemo(() => {
    const porNombre = new Map<string, Set<string>>();
    if (geoBarrios?.features) {
      for (const f of geoBarrios.features) {
        const n = normBarrio(f.properties?.nombre);
        if (!n) continue;
        let set = porNombre.get(n);
        if (!set) { set = new Set(); porNombre.set(n, set); }
        set.add(normBase(f.properties?.municipio));
      }
    }
    const unicos = new Set<string>();
    porNombre.forEach((munis, n) => { if (munis.size === 1) unicos.add(n); });
    return unicos;
  }, [geoBarrios]);

  // Clave de cruce: solo-nombre si es unico en el GeoJSON, sino municipio|nombre.
  //  keyGeo: lado GeoJSON (nombre canonico, SIN homologacion).
  //  keyDB : lado BD (aplica HOMOLOGACION_BARRIO al texto de LOCALIDAD/BARRIO).
  // Cuando un barrio de la BD homologa al nombre del poligono, ambos producen la
  // misma clave y cruzan.
  const keyGeo = React.useCallback((municipio?: string, nombre?: string) => {
    const n = normBarrio(nombre);
    return nombresUnicos.has(n) ? n : `${normBase(municipio)}|${n}`;
  }, [nombresUnicos]);
  const keyDB = React.useCallback((municipio?: string, barrio?: string) => {
    const c = canonBarrio(barrio);
    return nombresUnicos.has(c) ? c : `${normBase(municipio)}|${c}`;
  }, [nombresUnicos]);

  const colorEfectiv = (efectivas: number, fallidas: number, perdidas: number) => {
    const totalEval = efectivas + fallidas + perdidas;
    if (totalEval <= 0) return 'var(--ef-nan)';
    const ef = efectivas / totalEval;
    if (ef >= 0.85) return 'var(--ok)';
    if (ef >= 0.70) return 'var(--ef-70)';
    if (ef >= 0.50) return 'var(--ef-50)';
    if (ef >= 0.30) return 'var(--ef-30)';
    return 'var(--err)';
  };

  const statsMap = React.useMemo(() => {
    const map = new Map<string, any>();
    if (statsBarrios) {
      for (const s of statsBarrios) {
        if (!s.barrio) continue;
        const key = keyDB(s.municipio, s.barrio);
        let e = map.get(key);
        if (!e) { e = { total: 0, efectivas: 0, fallidas: 0, perdidas: 0, motivos: {}, bas: new Set<string>() }; map.set(key, e); }
        e.total += Number(s.total) || 0;
        e.efectivas += Number(s.efectivas) || 0;
        e.fallidas += Number(s.fallidas) || 0;
        e.perdidas += Number(s.perdidas) || 0;
        if (s.motivos) for (const [m, c] of Object.entries(s.motivos)) e.motivos[m] = (e.motivos[m] || 0) + (Number(c) || 0);
        // Guardamos los nombres de barrio de la BD que caen en este poligono
        // para poder pedir SUS observaciones on-demand al abrir el popup.
        if (s.barrio) e.bas.add(String(s.barrio));
      }
      map.forEach((e) => { e.color = colorEfectiv(e.efectivas, e.fallidas, e.perdidas); });
    }
    return map;
  }, [statsBarrios, keyDB]);
  const centroidesBarrio = React.useMemo(() => {
    const centroids = new Map<string, [number, number]>();
    if (!geoBarrios?.features) return centroids;
    for (const feat of geoBarrios.features) {
      const bName = normBarrio(feat.properties?.nombre);
      if (!bName) continue;
      
      let pts: any[] = [];
      const geom = feat.geometry;
      if (!geom) continue;
      
      if (geom.type === 'Polygon' && geom.coordinates[0]) {
        pts = geom.coordinates[0];
      } else if (geom.type === 'MultiPolygon' && geom.coordinates[0]?.[0]) {
        pts = geom.coordinates[0][0];
      }
      
      if (pts.length > 0) {
        let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
        for (const pt of pts) {
          const lon = pt[0], lat = pt[1];
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
        }
        centroids.set(keyGeo(feat.properties?.municipio, feat.properties?.nombre), [(minLat + maxLat) / 2, (minLon + maxLon) / 2]);
      }
    }
    return centroids;
  }, [geoBarrios, keyGeo]);

  // Un punto por NIC: colapsa las ordenes (ya filtradas) del mismo NIC en un marcador
  const { nicPoints, nicPointsNoGps } = React.useMemo(() => {
    const m = new Map<string, any>();
    const mNoGps = new Map<string, any>();
    
    for (const p of points) {
      let isNoGps = false;
      let lat = typeof p.la === 'string' ? parseFloat(p.la) : p.la;
      let lon = typeof p.lo === 'string' ? parseFloat(p.lo) : p.lo;
      
      if (isNaN(lat)) lat = null;
      if (isNaN(lon)) lon = null;
      
      if (lat == null || lon == null) {
        if (!p.ba) continue;
        const center = centroidesBarrio.get(keyDB(p.mu, p.ba));
        if (!center) continue;
        
        lat = center[0];
        lon = center[1];
        isNoGps = true;
      }
      
      const key = String(p.nic ?? `${lat},${lon}`);
      const targetMap = isNoGps ? mNoGps : m;
      let e = targetMap.get(key);
      if (!e) {
        e = { nic: p.nic, la: lat, lo: lon, mu: p.mu, ba: p.ba, total: 0, efectivas: 0, fallidas: 0, perdidas: 0, isNoGps };
        targetMap.set(key, e);
      }
      e.total++;
      if (p.es === 'Efectiva') e.efectivas++;
      else if (p.es === 'Fallida') e.fallidas++;
      else if (p.es === 'Perdida') e.perdidas++;
      // Las observaciones del NIC se cargan on-demand al abrir su popup.
    }
    return { nicPoints: Array.from(m.values()), nicPointsNoGps: Array.from(mNoGps.values()) };
  }, [points, centroidesBarrio, keyDB]);

  // Los limites (muni/barrio/zona) van en SVG por defecto (sin preferCanvas en el
  // MapContainer). Los puntos usan su propia capa canvas (ContinuousHeatLayer), asi
  // que NO se comparte un renderer: un L.svg() compartido crasheaba en StrictMode
  // (_initContainer / getPane().appendChild) al re-agregarse en el remonte.
  const styleMuni = { color: 'var(--ef-nan)', weight: 2, fillOpacity: 0.0, dashArray: '4, 4' };

  // Limites de zona: color fijo por zona (no el del GeoJSON), sin relleno para
  // no tapar el calor de barrios.
  const COLOR_ZONA: Record<string, string> = {
    NORTE: 'var(--zona-norte)',
    CENTRO: 'var(--zona-centro)',
    SUR: 'var(--zona-sur)',
  };
  const getStyleZona = (feature: any) => ({
    color: COLOR_ZONA[normBarrio(feature?.properties?.zona)] || 'var(--ef-nan)',
    weight: 3,
    opacity: 0.9,
    fillOpacity: 0.2,
  });

  const onEachZona = (feature: any, layer: any) => {
    const z = feature?.properties?.zona;
    if (z) layer.bindTooltip(`Zona ${z}`, { sticky: true });
  };
  
  const getStyleBarrio = (feature: any) => {
    const bName = normBarrio(feature.properties?.nombre);
    const key = keyGeo(feature.properties?.municipio, feature.properties?.nombre);
    if (bName && statsMap.has(key)) {
      const s = statsMap.get(key);
      if (s.total > 0) {
        return { color: s.color, weight: 1, fillOpacity: 0.45, fillColor: s.color };
      }
    }
    // Gris para barrios sin información o con 0 órdenes
    return { color: 'var(--ef-nan)', weight: 1, fillOpacity: 0.3, fillColor: 'var(--ef-nan)' };
  };

  // NIC (punto) mas cercano al clic, en pixeles de pantalla. Sirve para que un
  // clic sobre un punto dentro de un barrio tome la accion del NIC, no del barrio.
  const puntoNicCercano = (map: L.Map, latlng: L.LatLng) => {
    const clickPt = map.latLngToContainerPoint(latlng);
    let best: any = null, bestD = Infinity;
    const allPts = [...nicPoints, ...nicPointsNoGps];
    for (const p of allPts) {
      if (p.la == null || p.lo == null) continue;
      if (Math.abs(p.la - latlng.lat) > 0.004 || Math.abs(p.lo - latlng.lng) > 0.004) continue; // pre-filtro barato
      const d = clickPt.distanceTo(map.latLngToContainerPoint([p.la, p.lo]));
      if (d < bestD) { bestD = d; best = p; }
    }
    return bestD <= 9 ? best : null;  // radio del marcador (4) + tolerancia
  };

  const onEachFeature = (feature: any, layer: any) => {
    // El clic no burbujea al mapa (no cuenta como "clic afuera"/reset).
    layer.options.bubblingMouseEvents = false;

    // El barrio ya NO abre popup (se elimino el "detallado" del
    // leaflet-popup-pane): su detalle se muestra en el panel derecho al
    // seleccionarlo. El clic solo selecciona el barrio, o el NIC si el clic
    // cae sobre uno.
    layer.on('click', (e: any) => {
      const map = layer._map as L.Map | undefined;
      const nic = map ? puntoNicCercano(map, e.latlng) : null;
      if (nic) {
        // Prioridad NIC: su detalle se muestra en el panel derecho, no en un popup.
        onSelectNic?.(nic);
        return;
      }
      // Si YA hay un barrio seleccionado, cualquier clic de barrio lo deselecciona
      // (sea el mismo -"2 veces dentro"- u otro -"afuera de el"-) y vuelve a
      // mostrar todos. Solo se selecciona cuando no hay ninguno activo.
      if (selectedBarrio !== 'ALL') {
        onReset?.();
      } else {
        onSelectBarrio?.(feature.properties?.municipio || '', feature.properties?.nombre || '');
      }
    });
  };

  const filteredGeoMuni = React.useMemo(() => {
    if (!geoMuni || selectedMuni === 'ALL') return geoMuni;
    return { ...geoMuni, features: geoMuni.features.filter((f: any) => normBarrio(f.properties?.nombre) === normBarrio(selectedMuni) || normBarrio(f.properties?.MPIO_CNMBR) === normBarrio(selectedMuni)) };
  }, [geoMuni, selectedMuni]);

  const filteredGeoZonas = React.useMemo(() => {
    if (!geoZonas || selectedZona === 'ALL') return geoZonas;
    return { ...geoZonas, features: geoZonas.features.filter((f: any) => {
      const zName = normBarrio(f.properties?.zona);
      const selName = normBarrio(selectedZona);
      return zName && selName.includes(zName);
    }) };
  }, [geoZonas, selectedZona]);

  const filteredGeoBarrios = React.useMemo(() => {
    if (!geoBarrios) return geoBarrios;
    let features = geoBarrios.features;
    if (selectedMuni !== 'ALL') {
      features = features.filter((f: any) => normBarrio(f.properties?.municipio) === normBarrio(selectedMuni));
    }
    if (selectedBarrio !== 'ALL') {
      features = features.filter((f: any) => normBarrio(f.properties?.nombre) === normBarrio(selectedBarrio));
    }
    return { ...geoBarrios, features };
  }, [geoBarrios, selectedMuni, selectedBarrio]);

  const allPts = [...nicPoints, ...nicPointsNoGps];

  return (
    <div id="map-leaflet-container" style={{ height: '100%', width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: '#080c12' }}>
      <MapContainer
        id="map-instance"
        center={[10.75, -74.9]}
        zoom={10}
        style={{ height: '100%', width: '100%', background: 'var(--bg)' }}
        maxZoom={18}
        minZoom={8}
      >
        <BoundsUpdater geoBarrios={selectedBarrio !== 'ALL' ? filteredGeoBarrios : null} geoMuni={selectedMuni !== 'ALL' ? filteredGeoMuni : null} geoZonas={selectedZona !== 'ALL' ? filteredGeoZonas : null} />
        <MapInteractionHandler allNicPoints={allPts} onReset={onReset} onSelectNic={onSelectNic} />
        
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Mapa Base">
            <TileLayer
              key={theme}
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              url={theme === 'dark' ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satélite">
            <TileLayer
              attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>

          {filteredGeoZonas && (
            <LayersControl.Overlay checked name="Límites de Zona">
                <GeoJSON 
                  key={`zona-${selectedZona}`}
                  data={filteredGeoZonas} 
                  style={getStyleZona}
                  onEachFeature={onEachZona}
                />
            </LayersControl.Overlay>
          )}

          {filteredGeoMuni && (
            <LayersControl.Overlay name="Municipios">
              <GeoJSON key={`muni-${selectedMuni}`} data={filteredGeoMuni} style={styleMuni} />
            </LayersControl.Overlay>
          )}

            {filteredGeoBarrios && (
              <LayersControl.Overlay checked name="Estado de Barrios (Efectividad)">
                <GeoJSON
                  key={`barrio-${selectedZona}-${selectedMuni}-${selectedBarrio}-${statsBarrios?.length || 0}-${mes}`}
                  data={filteredGeoBarrios}
                  style={getStyleBarrio}
                  onEachFeature={onEachFeature}
                />
              </LayersControl.Overlay>
            )}

          {(!isMassive && nicPoints.length > 0) && (
            <LayersControl.Overlay checked name="NIC con orden (Puntos GPS)">
              <ContinuousHeatLayer points={nicPoints} drawGlow={false} />
            </LayersControl.Overlay>
          )}
          {(!isMassive && nicPointsNoGps.length > 0) && (
            <LayersControl.Overlay checked name="NIC sin GPS (Ubicados por Barrio)">
              <ContinuousHeatLayer points={nicPointsNoGps} drawGlow={false} />
            </LayersControl.Overlay>
          )}
          {(!isMassive && nicPoints.length > 0) && (
            <LayersControl.Overlay name="Resplandor de Calor (Puntos GPS)">
              <ContinuousHeatLayer points={nicPoints} drawDots={false} />
            </LayersControl.Overlay>
          )}
          {(!isMassive && nicPointsNoGps.length > 0) && (
            <LayersControl.Overlay name="Resplandor de Calor (Sin GPS)">
              <ContinuousHeatLayer points={nicPointsNoGps} drawDots={false} />
            </LayersControl.Overlay>
          )}
          {isMassive && statsBarrios && statsBarrios.length > 0 && (
            <LayersControl.Overlay checked name="Centros de Barrio (Masivo)">
              <LayerGroup>
                {statsBarrios.map((st, i) => {
                  const k = keyDB(st.municipio, st.barrio);
                  const c = centroidesBarrio.get(k);
                  if (!c) return null;
                  const pct = st.total > 0 ? (st.efectivas / st.total) * 100 : 0;
                  let color = 'var(--ef-nan)';
                  if (st.total > 0) {
                    color = pct >= 85 ? 'var(--ok)' : pct >= 70 ? 'var(--ef-70)' : pct >= 50 ? 'var(--ef-50)' : pct >= 30 ? 'var(--ef-30)' : 'var(--err)';
                  }
                  return (
                    <CircleMarker
                      key={i}
                      center={c}
                      radius={6}
                      fillColor={color}
                      fillOpacity={0.9}
                      color="var(--bg)"
                      weight={1.5}
                      eventHandlers={{
                        click: (e) => {
                          e.originalEvent?.stopPropagation(); // stop bubbling
                          // Seleccionar el barrio para abrir su panel
                          if (selectedBarrio !== 'ALL') onReset?.();
                          else onSelectBarrio?.(st.municipio, st.barrio);
                        }
                      }}
                    >
                      <Tooltip direction="top">{st.barrio} ({st.municipio}) - {st.total} órdenes</Tooltip>
                    </CircleMarker>
                  );
                })}
              </LayerGroup>
            </LayersControl.Overlay>
          )}
        </LayersControl>
      </MapContainer>
    </div>
  );
}
