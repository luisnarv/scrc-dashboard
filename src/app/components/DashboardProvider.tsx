'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';

import type { RawData, RawRecord, CostoRecord, Filters } from './utils/types';
import { normProy, normZonaDet } from './utils/filters';
import { dashboardRepo } from '../lib/cache/repository';
import { MapaCache } from '../lib/cache/mapaCache';
import type { MonthPayload, MonthsMeta } from '../lib/cache/types';

interface DashboardContextValue {
  raw: RawData | null;
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  mesList: string[];
  anoList: string[];
  proyList: string[];
  zonaList: string[];
  fechaList: string[];
  loading: boolean;      // solo hasta que el mes actual esta en pantalla
  syncing: boolean;      // sincronizacion de meses previos en 2do plano
  lastSync: number | null;
  error: string | null;
  refresh: () => Promise<void>;   // pull-to-refresh: fuerza red para lo visible
}

const DashboardContext = createContext<DashboardContextValue>({
  raw: null,
  filters: { proy: 'ALL', zona: 'ALL', ano: 'ALL', mes: [], fecha: 'ALL', proceso: 'ALL' },
  setFilters: () => {},
  mesList: [], anoList: [], proyList: [], zonaList: [], fechaList: [],
  loading: true, syncing: false, lastSync: null, error: null,
  refresh: async () => {},
});

export function useDashboard() { return useContext(DashboardContext); }

const PROYS_VAL = ['Norte-Centro', 'Sur'];

// Descarta meses cargados a medias por el ETL (menos del 5% del promedio),
// PERO siempre conserva el mes más reciente: es el mes en curso y aunque tenga
// pocas órdenes (los primeros días) debe verse en el dashboard.
function mesesValidos(counts: Record<string, number>): string[] {
  const vals = Object.values(counts);
  if (!vals.length) return [];
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  const umbral = Math.max(10, avg * 0.05);
  const todos = Object.keys(counts).sort();
  const ultimo = todos[todos.length - 1];            // mes en curso: siempre visible
  return todos.filter(m => counts[m] >= umbral || m === ultimo);
}

// Normaliza zonas/proyecto de un mes una sola vez, al entrar en memoria.
function normalizeMonth(p: MonthPayload): MonthPayload {
  p.rawRecords.forEach((rec: RawRecord) => {
    const proj = normProy(rec.Zona);
    const z = normZonaDet(rec.Zona);
    if (proj) rec._Proyecto = proj;
    rec._Zona = z || proj || undefined;
    const dz = normZonaDet(rec.Zona_Detalle || rec.Zona);
    rec._ZonaDet = dz || rec._Zona;
  });
  p.costos.forEach((rec: CostoRecord) => {
    const proj = normProy(rec.Zona) || normProy(rec.Proyecto);
    const z = normZonaDet(rec.Zona) || normZonaDet(rec.Proyecto);
    if (proj) rec._Proyecto = proj;
    rec._Zona = z || proj || undefined;
    rec._ZonaDet = rec._Zona;
  });
  p.dispDiaria.forEach((rec: any) => {
    const proj = normProy(rec.Zona);
    const z = normZonaDet(rec.Zona);
    if (proj) rec._Proyecto = proj;
    rec._Zona = z || proj || undefined;
    rec._ZonaDet = rec._Zona;
  });
  return p;
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [monthsData, setMonthsData] = useState<Record<string, MonthPayload>>({});
  const [evolutivo, setEvolutivo] = useState<MonthsMeta['evolutivo']>([]);
  const [mesList, setMesList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<Filters>({ proy: 'ALL', zona: 'ALL', ano: 'ALL', mes: [], fecha: 'ALL', proceso: 'ALL' });
  const [anoList, setAnoList] = useState<string[]>([]);
  const [proyList, setProyList] = useState<string[]>([]);
  const [zonaList, setZonaList] = useState<string[]>([]);
  const [fechaList, setFechaList] = useState<string[]>([]);

  const versionsRef = useRef<Record<string, string | null>>({});
  const loadingMonths = useRef<Set<string>>(new Set());
  const initialDateSet = useRef(false);

  const setFilters = useCallback((f: Partial<Filters>) => {
    setFiltersState(prev => ({ ...prev, ...f }));
  }, []);

  const mergeMonth = useCallback((mes: string, payload: MonthPayload) => {
    setMonthsData(prev => ({ ...prev, [mes]: normalizeMonth(payload) }));
    setLastSync(Date.now());
    setError(null); // llego dato bueno -> se sale del estado "sin conexion"
  }, []);

  // Carga bajo demanda de un mes (cache-first). Evita duplicados concurrentes.
  const loadMonth = useCallback(async (mes: string, force = false) => {
    if (loadingMonths.current.has(mes)) return;
    loadingMonths.current.add(mes);
    try {
      const res = await dashboardRepo.getMonth(mes, { force, serverVersion: versionsRef.current[mes] ?? null });
      mergeMonth(mes, res.payload);
    } catch (e) {
      setError(String(e));
    } finally {
      loadingMonths.current.delete(mes);
    }
  }, [mergeMonth]);

  // Aplica metadatos (lista de meses + evolutivo + versiones).
  const applyMeta = useCallback((meta: MonthsMeta) => {
    const counts: Record<string, number> = {};
    const versions: Record<string, string | null> = {};
    meta.months.forEach(m => { counts[m.mes] = m.count; versions[m.mes] = m.version ?? null; });
    versionsRef.current = versions;
    const lista = mesesValidos(counts);
    setMesList(lista);
    
    const anos = [...new Set(lista.map(m => m.split('-')[0]))].sort().reverse();
    setAnoList(anos);
    
    setEvolutivo(meta.evolutivo);
    return lista;
  }, []);

  // ---- Arranque: meta -> mes actual -> sync en 2do plano ----
  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        // 1) Metadatos (cache-first): sabemos que meses hay y cual es el actual.
        const { data: meta } = await dashboardRepo.getMonthsMeta();
        if (cancel) return;
        const lista = applyMeta(meta);
        const actual = lista[lista.length - 1];
        if (!actual) { setLoading(false); return; }
        dashboardRepo.setCurrentMonth(actual);

        // 2) Mes actual: revalida con el servidor para traer la información más reciente.
        const actualAno = actual.split('-')[0];
        setFiltersState(prev => ({ ...prev, ano: actualAno, mes: [actual] }));
        const res = await dashboardRepo.getMonth(actual, { force: true, serverVersion: versionsRef.current[actual] ?? null });
        if (cancel) return;
        mergeMonth(actual, res.payload);
        // 3) Resto de meses (recientes primero) en segundo plano, pero SOLO DEL AÑO ACTUAL.
        // Los otros años se bajarán bajo demanda si el usuario cambia el filtro 'Año'.
        const previos = lista.filter(m => m !== actual && m.startsWith(actualAno)).reverse();
        // syncing=true ANTES de loading=false: así no queda un frame (loading=false &
        // syncing=false) que revele los gráficos a medias antes de terminar el sync.
        if (previos.length) setSyncing(true);
        setLoading(false);
        if (previos.length) {
          await dashboardRepo.syncMonths(previos, versionsRef.current);
          if (!cancel) setSyncing(false);
        }
      } catch (e) {
        if (!cancel) { setError(String(e)); setLoading(false); }
      }
    })();

    // 4) Suscripcion: datos que llegan en 2do plano (sync o revalidacion SWR).
    const unsub = dashboardRepo.subscribe((ev) => {
      if (cancel) return;
      if (ev.type === 'month') {
        mergeMonth(ev.mes, ev.result.payload);
      } else if (ev.type === 'meta') {
        // La lista/versiones cambiaron (ETL recargo algo): re-sincroniza lo movido.
        const prevVersions = { ...versionsRef.current };
        const lista = applyMeta(ev.data);
        const cambiados = lista.filter(m => prevVersions[m] !== versionsRef.current[m]);
        if (cambiados.length) dashboardRepo.syncMonths(cambiados, versionsRef.current);
      }
    });

    return () => { cancel = true; unsub(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carga bajo demanda cuando el usuario selecciona un Año o Meses aún no cargados.
  useEffect(() => {
    if (loading) return;
    if (filters.ano !== 'ALL') {
      const delAno = mesList.filter(m => m.startsWith(filters.ano));
      delAno.forEach(m => { if (!(m in monthsData)) loadMonth(m); });
    }
    filters.mes.forEach(m => { if (!(m in monthsData)) loadMonth(m); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.ano, filters.mes, loading]);

  // Boton "Actualizar" = HARD REFRESH: borra TODA la cache local (meses, meta y
  // mapa) y recarga la pagina. Con la cache vacia, el arranque vuelve a bajar
  // TODO fresco desde la BD, asi los ajustes del backend (homologacion, estados,
  // etc.) se ven de inmediato sin quedar servidos por cache vieja.
  const refresh = useCallback(async () => {
    try { await dashboardRepo.clear(); } catch { /* ignore */ }
    try { await MapaCache.clear(); } catch { /* ignore */ }
    if (typeof window !== 'undefined') window.location.reload();
  }, []);

  // ---- Derivar RawData a partir de los meses cargados y el filtro de Año ----
  const raw: RawData | null = useMemo(() => {
    const meses = Object.entries(monthsData)
      .filter(([m]) => filters.ano === 'ALL' || m.startsWith(filters.ano))
      .map(([_, p]) => p);
    if (!meses.length) return null;
    return {
      raw: meses.flatMap(m => m.rawRecords),
      costos: meses.flatMap(m => m.costos),
      emps: meses.flatMap(m => m.emps),
      det: [],
      mes: meses.flatMap(m => m.mesRecords),
      disp: meses.flatMap(m => m.dispDiaria),
      evolutivo,
    };
  }, [monthsData, evolutivo, filters.ano]);

  // Listas de filtros derivadas de lo cargado (se amplian con el sync).
  useEffect(() => {
    if (!raw) return;
    const proys = PROYS_VAL.filter(
      p => raw.raw.some(r => r._Proyecto === p) || raw.costos.some(r => r._Proyecto === p)
    );
    setProyList(proys);
  }, [raw]);

  useEffect(() => {
    if (!raw) return;
    const filteredRaw = filters.proy === 'ALL' ? raw.raw : raw.raw.filter(r => r._Proyecto === filters.proy);
    const filteredCos = filters.proy === 'ALL' ? raw.costos : raw.costos.filter(r => r._Proyecto === filters.proy);
    const zonaSet = new Set<string>();
    filteredRaw.forEach(r => { if (r._Zona) zonaSet.add(r._Zona); });
    filteredCos.forEach(r => { if (r._Zona) zonaSet.add(String(r._Zona)); });
    setZonaList([...zonaSet].sort());
  }, [raw, filters.proy]);

  useEffect(() => {
    if (!raw) return;
    const sel = filters.mes;
    const fechas = [...new Set(
      raw.raw.filter(r => sel.length === 0 || sel.includes(String(r.Fecha || '').slice(0, 7))).map(r => r.Fecha)
    )].filter((x): x is string => !!x).sort();
    setFechaList(fechas);

    // Solo en la recarga / arranque inicial fija el último día;
    // al seleccionar un mes por el filtro, se mantienen todos los días ('ALL').
    if (!initialDateSet.current && fechas.length > 0) {
      initialDateSet.current = true;
      const ultimoDia = fechas[fechas.length - 1];
      setFiltersState(prev => ({ ...prev, fecha: ultimoDia }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, filters.mes]);

  return (
    <DashboardContext.Provider value={{
      raw, filters, setFilters, mesList, anoList, proyList, zonaList, fechaList,
      loading, syncing, lastSync, error, refresh,
    }}>
      {children}
    </DashboardContext.Provider>
  );
}
