'use client';
import React, { useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, LayersControl, useMapEvents } from 'react-leaflet';
import { createLayerComponent } from '@react-leaflet/core';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import 'leaflet-defaulticon-compatibility';
import { claveBarrio, normBarrio } from './utils/barrio';

// Auto-zoom removido para no sacar de foco al usuario.

// ---- Capa de puntos por NIC, imperativa y en canvas ----
// Un solo LayerGroup con L.circleMarker por punto. Evita crear 19.5k elementos
// React (la reconciliacion era lo que congelaba ~18s al re-filtrar); Leaflet
// dibuja miles de circulos en canvas sin problema.
const colorEfectividad = (e: any) => {
  if (!e.total) return '#9ca3af';
  const ef = e.efectivas / e.total;
  if (ef >= 0.85) return '#22c55e';
  if (ef >= 0.50) return '#eab308';
  return '#ef4444';
};

const popupNic = (e: any) => {
  let obsHtml = '';
  if (e.observaciones && e.observaciones.length > 0) {
    obsHtml = '<div style="margin-top: 8px; max-height: 120px; overflow-y: auto; font-size: 11px; border-top: 1px solid #e5e7eb; padding-top: 4px;">';
    for (const ob of e.observaciones) {
      const colorEstado = ob.estado === 'Efectiva' ? '#16a34a' : (ob.estado === 'Fallida' ? '#ca8a04' : '#dc2626');
      obsHtml += `<div style="margin-bottom: 8px;">
        <strong style="color: ${colorEstado};">${ob.fecha} - ${ob.subaccion || ob.estado}:</strong>
        <div style="margin-top: 4px; padding: 6px 8px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; color: #475569; font-style: italic; line-height: 1.3;">"${ob.texto || 'Sin observación'}"</div>
      </div>`;
    }
    obsHtml += '</div>';
  }

  return `
    <div style="font-family: var(--font-sans); font-size: 13px; width: 220px;">
      <strong style="color: var(--primary);">NIC:</strong> ${e.nic ?? 'Sin NIC'}<br/>
      <strong>Ubicación:</strong> ${e.mu ?? ''} - ${e.ba ?? ''}<br/>
      <strong>Órdenes del mes:</strong> ${e.total}<br/>
      <span style="color:#16a34a;"><strong>Efectivas:</strong> ${e.efectivas}</span><br/>
      <span style="color:#ca8a04;"><strong>Fallidas:</strong> ${e.fallidas}</span><br/>
      <span style="color:#dc2626;"><strong>Perdidas:</strong> ${e.perdidas}</span>
      ${obsHtml}
    </div>`;
};

  // Detecta clic en el fondo del mapa (fuera de un barrio) para restablecer la
  // seleccion. Si se hace clic cerca de un NIC, abre su popup.
  function MapInteractionHandler({ allNicPoints, onReset }: { allNicPoints: any[]; onReset?: () => void }) {
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
          L.popup({ autoPan: false })
            .setLatLng([best.la, best.lo])
            .setContent(popupNic(best))
            .openOn(map);
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
      
      const R = 26;
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.points) {
        if (p.la == null || p.lo == null) continue;
        if (p.la < bounds.getSouth() - 0.1 || p.la > bounds.getNorth() + 0.1 || p.lo < bounds.getWest() - 0.1 || p.lo > bounds.getEast() + 0.1) continue;
        
        const pt = map.latLngToContainerPoint([p.la, p.lo]);
        const col = colorEfectividad(p);
        const hexA = (hex: string, alpha: number) => {
          let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
          return `rgba(${r},${g},${b},${alpha})`;
        };
        
        const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, R);
        grad.addColorStop(0, hexA(col, 0.2));
        grad.addColorStop(0.5, hexA(col, 0.08));
        grad.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, R, 0, 2 * Math.PI); ctx.fill();
      }
      
      ctx.globalCompositeOperation = 'source-over';
      for (const p of this.points) {
        if (p.la == null || p.lo == null) continue;
        if (p.la < bounds.getSouth() - 0.1 || p.la > bounds.getNorth() + 0.1 || p.lo < bounds.getWest() - 0.1 || p.lo > bounds.getEast() + 0.1) continue;
        
        const pt = map.latLngToContainerPoint([p.la, p.lo]);
        const col = colorEfectividad(p);
        const hexA = (hex: string, alpha: number) => {
          let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
          return `rgba(${r},${g},${b},${alpha})`;
        };
        ctx.fillStyle = hexA(col, 0.55);
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 1.3, 0, 2 * Math.PI); ctx.fill();
      }
    }
  });

  const ContinuousHeatLayer = createLayerComponent<L.Layer, { points: any[]; children?: React.ReactNode }>(
    (props, ctx) => {
      const layer = new CanvasHeatLayer(props.points, {});
      return { instance: layer, context: ctx };
    },
    (layer, props, prev) => {
      if (props.points !== prev.points) {
        (layer as any).setPoints(props.points);
      }
    }
  );

export default function MapComponent({ points, geoMuni, geoBarrios, geoZonas, statsBarrios, selectedBarrio = 'ALL', selectedMuni = 'ALL', onSelectBarrio, onReset }: { points: any[], geoMuni: any, geoBarrios: any, geoZonas?: any, statsBarrios?: any[], selectedBarrio?: string, selectedMuni?: string, onSelectBarrio?: (muni: string, barrio: string) => void, onReset?: () => void }) {
  const statsMap = React.useMemo(() => {
    const map = new Map();
    if (statsBarrios) {
      for (const s of statsBarrios) {
        if (!s.barrio || !s.municipio) continue;
        const total = Number(s.total) || 0;
        const efectivas = Number(s.efectivas) || 0;
        const fallidas = Number(s.fallidas) || 0;
        const perdidas = Number(s.perdidas) || 0;
        
        let color = '#d1d5db'; // Gris por defecto si no hay o hay 0
        if (total > 0) {
          const efectividad = efectivas / total;
          // Escala de color más granular según % de efectividad
          if (efectividad >= 0.85) color = '#22c55e'; // Verde fuerte (Muy bueno)
          else if (efectividad >= 0.70) color = '#84cc16'; // Verde lima (Bueno)
          else if (efectividad >= 0.50) color = '#eab308'; // Amarillo (Regular)
          else if (efectividad >= 0.30) color = '#f97316'; // Naranja (Riesgo medio)
          else color = '#ef4444'; // Rojo (Riesgo alto / muy baja efectividad)
        }
        
        const key = claveBarrio(s.municipio, s.barrio);
        map.set(key, { color, total, efectivas, fallidas, perdidas, motivos: s.motivos, observaciones: s.observaciones });
      }
    }
    return map;
  }, [statsBarrios]);
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
        centroids.set(claveBarrio(feat.properties?.municipio, feat.properties?.nombre), [(minLat + maxLat) / 2, (minLon + maxLon) / 2]);
      }
    }
    return centroids;
  }, [geoBarrios]);

  // Un punto por NIC: colapsa las ordenes (ya filtradas) del mismo NIC en un marcador
  const { nicPoints, nicPointsNoGps } = React.useMemo(() => {
    const m = new Map<string, any>();
    const mNoGps = new Map<string, any>();
    
    for (const p of points) {
      let isNoGps = false;
      let lat = p.la;
      let lon = p.lo;
      
      if (lat == null || lon == null) {
        if (!p.ba) continue;
        const center = centroidesBarrio.get(claveBarrio(p.mu, p.ba));
        if (!center) continue;
        
        lat = center[0];
        lon = center[1];
        isNoGps = true;
      }
      
      const key = String(p.nic ?? `${lat},${lon}`);
      const targetMap = isNoGps ? mNoGps : m;
      let e = targetMap.get(key);
      if (!e) {
        e = { nic: p.nic, la: lat, lo: lon, mu: p.mu, ba: p.ba, total: 0, efectivas: 0, fallidas: 0, perdidas: 0, observaciones: [], isNoGps };
        targetMap.set(key, e);
      }
      e.total++;
      if (p.es === 'Efectiva') e.efectivas++;
      else if (p.es === 'Fallida') e.fallidas++;
      else if (p.es === 'Perdida') e.perdidas++;

      if (p.es !== 'Efectiva' || p.ob) {
        e.observaciones.push({ fecha: p.fe, estado: p.es, subaccion: p.su, texto: p.ob });
      }
    }
    return { nicPoints: Array.from(m.values()), nicPointsNoGps: Array.from(mNoGps.values()) };
  }, [points, centroidesBarrio]);

  // Los poligonos de frontera van en SVG (crisp, predecible) aunque el mapa use
  // preferCanvas para los 19.5k puntos. En canvas, MultiPolygons grandes como
  // las zonas (5-6k vertices) se dibujaban mal.
  const svgRenderer = React.useMemo(() => L.svg({ padding: 0.5 }), []);

  const styleMuni = { color: '#9ca3af', weight: 2, fillOpacity: 0.0, dashArray: '4, 4', renderer: svgRenderer };

  // Limites de zona: color fijo por zona (no el del GeoJSON), sin relleno para
  // no tapar el calor de barrios.
  const COLOR_ZONA: Record<string, string> = {
    NORTE: '#4d7a5b',
    CENTRO: '#ad7e42',
    SUR: '#823c32',
  };
  const getStyleZona = (feature: any) => ({
    color: COLOR_ZONA[normBarrio(feature?.properties?.zona)] || '#6366f1',
    weight: 3,
    opacity: 0.9,
    fillOpacity: 0.0,
    renderer: svgRenderer,
  });

  const onEachZona = (feature: any, layer: any) => {
    const z = feature?.properties?.zona;
    if (z) layer.bindTooltip(`Zona ${z}`, { sticky: true });
  };
  
  const getStyleBarrio = (feature: any) => {
    const bName = normBarrio(feature.properties?.nombre);
    const key = claveBarrio(feature.properties?.municipio, feature.properties?.nombre);
    if (bName && statsMap.has(key)) {
      const s = statsMap.get(key);
      if (s.total > 0) {
        return { color: s.color, weight: 1, fillOpacity: 0.45, fillColor: s.color, renderer: svgRenderer };
      }
    }
    // Gris para barrios sin información o con 0 órdenes
    return { color: '#9ca3af', weight: 1, fillOpacity: 0.3, fillColor: '#d1d5db', renderer: svgRenderer };
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
    const bName = normBarrio(feature.properties?.nombre);
    const key = claveBarrio(feature.properties?.municipio, feature.properties?.nombre);

    // El clic no burbujea al mapa (no cuenta como "clic afuera"/reset).
    layer.options.bubblingMouseEvents = false;

    if (bName && statsMap.has(key)) {
      const s = statsMap.get(key);
      if (s.total > 0) {
        const pctEf = ((s.efectivas / s.total) * 100).toFixed(1);
        const pctFa = ((s.fallidas / s.total) * 100).toFixed(1);
        const pctPe = ((s.perdidas / s.total) * 100).toFixed(1);

        // Calcular top 3 motivos
        const motivos = s.motivos || {};
        const topMotivos = Object.entries(motivos)
          .sort((a: any, b: any) => b[1] - a[1])
          .slice(0, 4);
        
        let motivosHtml = topMotivos.length === 0 ? '<div style="font-size: 11px; color: #9ca3af;">No hay fallas ni pérdidas registradas.</div>' : '';
        topMotivos.forEach(([motivo, count]: any) => {
          const mPct = ((count / (s.fallidas + s.perdidas)) * 100).toFixed(1);
          motivosHtml += `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 11px;">
              <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px;" title="${motivo}">${motivo}</span>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="color: #6b7280;">${mPct}%</span>
                <strong>${count}</strong>
              </div>
            </div>
            <div style="background: #e5e7eb; height: 4px; border-radius: 2px; margin-bottom: 6px; overflow: hidden;">
              <div style="background: #9ca3af; height: 100%; width: ${mPct}%;"></div>
            </div>
          `;
        });

        layer.bindPopup(`
          <div style="font-family: var(--font-sans); font-size: 12px; width: 260px; color: #374151;">
            <div style="background: #1e3a2d; color: white; padding: 10px; border-radius: 6px 6px 0 0;">
              <strong style="font-size: 15px;">${bName}</strong>
              <div style="font-size: 10px; opacity: 0.8; margin-top: 2px;">Resumen de Operación</div>
            </div>
            
            <div style="padding: 12px; background: #f8fafc; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 6px 6px;">
              
              <!-- Cajas principales -->
              <div style="display: flex; gap: 4px; text-align: center; margin-bottom: 15px;">
                <div style="flex: 1; background: white; border: 1px solid #e5e7eb; border-radius: 4px; padding: 4px 2px;">
                  <div style="font-size: 9px; color: #6b7280; font-weight: bold;">TOTAL</div>
                  <div style="font-size: 12px; font-weight: bold;">${s.total}</div>
                </div>
                <div style="flex: 1; background: white; border: 1px solid #e5e7eb; border-radius: 4px; padding: 4px 2px;">
                  <div style="font-size: 9px; color: #16a34a; font-weight: bold;">EFECT.</div>
                  <div style="font-size: 12px; font-weight: bold; color: #16a34a;">${s.efectivas}</div>
                </div>
                <div style="flex: 1; background: white; border: 1px solid #e5e7eb; border-radius: 4px; padding: 4px 2px;">
                  <div style="font-size: 9px; color: #ca8a04; font-weight: bold;">FALLAS</div>
                  <div style="font-size: 12px; font-weight: bold; color: #ca8a04;">${s.fallidas}</div>
                </div>
                <div style="flex: 1; background: white; border: 1px solid #e5e7eb; border-radius: 4px; padding: 4px 2px;">
                  <div style="font-size: 9px; color: #dc2626; font-weight: bold;">PERD.</div>
                  <div style="font-size: 12px; font-weight: bold; color: #dc2626;">${s.perdidas}</div>
                </div>
              </div>

              <!-- Efectividad Global -->
              <div style="font-size: 10px; font-weight: bold; color: #1e3a2d; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 8px;">EFECTIVIDAD GLOBAL</div>
              
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span>Efectividad bruta</span>
                <strong>${pctEf}%</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span>Tasa de pérdida</span>
                <strong style="color: #dc2626;">${pctPe}%</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                <span>Tasa de fallas</span>
                <strong style="color: #ca8a04;">${pctFa}%</strong>
              </div>

              <!-- Motivos de no efectividad -->
              <div style="font-size: 10px; font-weight: bold; color: #1e3a2d; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 8px;">MOTIVOS DE NO EFECTIVIDAD</div>
              ${motivosHtml}
              
              <!-- Observaciones -->
              ${s.observaciones && s.observaciones.length > 0 ? `
              <div style="font-size: 10px; font-weight: bold; color: #1e3a2d; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-top: 12px; margin-bottom: 8px;">OBSERVACIONES REGISTRADAS</div>
              <div style="max-height: 120px; overflow-y: auto; font-size: 11px; padding-right: 4px;">
                ${s.observaciones.map((ob: any) => `
                  <div style="margin-bottom: 8px; padding: 6px; background: white; border-radius: 6px; border: 1px solid #e5e7eb; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                      <strong style="color: ${ob.estado === 'Fallida' ? '#ca8a04' : '#dc2626'};">${ob.nic ?? 'NIC'}</strong>
                      <span style="color: #9ca3af; font-size: 9px;">${ob.fecha}</span>
                    </div>
                    <div style="padding: 6px 8px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; color: #475569; font-style: italic; line-height: 1.3;">"${ob.texto || ob.subaccion || 'Sin observación'}"</div>
                  </div>
                `).join('')}
              </div>
              ` : ''}
            </div>
          </div>
        `);
      } else {
        layer.bindPopup(`
          <div style="font-family: var(--font-sans); font-size: 13px; color: #6b7280;">
            <strong style="color: #374151; font-size: 14px;">${bName}</strong><br/>
            No hay órdenes registradas o sin coordenadas.
          </div>
        `);
      }
    } else if (bName) {
      layer.bindPopup(`
        <div style="font-family: var(--font-sans); font-size: 13px; color: #6b7280;">
          <strong style="color: #374151; font-size: 14px;">${bName}</strong><br/>
          Sin información en la base de datos para los filtros actuales.
        </div>
      `);
    }

    // Se registra DESPUES del bindPopup, asi que su handler corre de ultimo y
    // "gana": si el clic cayo sobre un NIC, mostramos el popup del NIC (su accion)
    // en vez de seleccionar el barrio.
    layer.on('click', (e: any) => {
      const map = layer._map as L.Map | undefined;
      const nic = map ? puntoNicCercano(map, e.latlng) : null;
      if (nic) {
        L.popup().setLatLng([nic.la, nic.lo]).setContent(popupNic(nic)).openOn(map!);
        return;
      }
      onSelectBarrio?.(feature.properties?.municipio || '', feature.properties?.nombre || '');
    });
  };

    const allPts = [...nicPoints, ...nicPointsNoGps];
    return (
      <MapContainer preferCanvas center={[10.96854, -74.78132]} zoom={12} style={{ height: '100%', width: '100%' }}>
        <MapInteractionHandler allNicPoints={allPts} onReset={onReset} />
        <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Mapa Claro">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name="Mapa Satélite">
          <TileLayer
            attribution='&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGO, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        </LayersControl.BaseLayer>

        {geoMuni && (
          <LayersControl.Overlay checked name="Límites de Municipios">
            <GeoJSON 
              key={`muni-${selectedMuni}`}
              data={geoMuni} 
              style={styleMuni} 
              filter={(feat) => selectedMuni === 'ALL' || normBarrio(feat.properties?.MPIO_CNMBR) === normBarrio(selectedMuni)}
            />
          </LayersControl.Overlay>
        )}

        {geoBarrios && (
          <LayersControl.Overlay checked name="Estado de Barrios (Calor)">
            <GeoJSON 
              key={`barrio-${selectedBarrio}-${selectedMuni}`}
              data={geoBarrios} 
              style={getStyleBarrio} 
              onEachFeature={onEachFeature} 
              filter={(feat) => {
                const matchB = selectedBarrio === 'ALL' || normBarrio(feat.properties?.nombre) === normBarrio(selectedBarrio);
                const matchM = selectedMuni === 'ALL' || normBarrio(feat.properties?.municipio) === normBarrio(selectedMuni);
                return matchB && matchM;
              }}
            />
          </LayersControl.Overlay>
        )}

        {geoZonas && (
          <LayersControl.Overlay name="Límites de Zonas">
            <GeoJSON data={geoZonas} style={getStyleZona} onEachFeature={onEachZona} />
          </LayersControl.Overlay>
        )}

        {/* Capa imperativa de Canvas Custom: soporta el renderizado "Lighter" de heatmaps. */}
        {nicPoints.length > 0 && (
          <LayersControl.Overlay checked name="NIC con orden (Puntos GPS)">
            <ContinuousHeatLayer points={nicPoints} />
          </LayersControl.Overlay>
        )}
        {nicPointsNoGps.length > 0 && (
          <LayersControl.Overlay checked name="NIC sin GPS (Ubicados por Barrio)">
            <ContinuousHeatLayer points={nicPointsNoGps} />
          </LayersControl.Overlay>
        )}
      </LayersControl>
    </MapContainer>
  );
}
