import { idbGet, idbPut, idbClear } from './idb';
import { STORE_MAPA, TTL_MAPA_MS } from './config';

// Cache local del Mapa Operativo Detallado, por combinacion mes|zona|proy.
// Reabrir el modal dentro del TTL sirve directamente desde IndexedDB.
interface MapaEntry {
  key: string;
  pts: any[];
  stats: any[];
  filtros: any;
  fetchedAt: number;
}

const clave = (mes: string, zona: string, proy: string, proceso = 'ALL') => `${mes}|${zona}|${proy}|${proceso}`;

export const MapaCache = {
  async get(mes: string, zona: string, proy: string, proceso = 'ALL'): Promise<{ pts: any[]; stats: any[]; filtros: any; fresco: boolean } | null> {
    const e = await idbGet<MapaEntry>(STORE_MAPA, clave(mes, zona, proy, proceso));
    if (!e) return null;
    return { pts: e.pts, stats: e.stats, filtros: e.filtros, fresco: Date.now() - e.fetchedAt < TTL_MAPA_MS };
  },
  async put(mes: string, zona: string, proy: string, pts: any[], stats: any[], filtros: any, proceso = 'ALL'): Promise<void> {
    if (!pts.length && !stats.length) return; // no cachear respuestas vacias
    await idbPut(STORE_MAPA, { key: clave(mes, zona, proy, proceso), pts, stats, filtros, fetchedAt: Date.now() });
  },
  // Vacia toda la cache del mapa (usado por el boton "Actualizar").
  async clear(): Promise<void> {
    await idbClear(STORE_MAPA);
  },
};
