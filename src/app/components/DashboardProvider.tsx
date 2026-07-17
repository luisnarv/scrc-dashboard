'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import Papa from 'papaparse';
import type { RawData, RawRecord, CostoRecord, EmpleadoRecord, OrdenDetalle, Filters } from './utils/types';
import { normProy, normZonaDet } from './utils/filters';

interface DashboardContextValue {
  raw: RawData | null;
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  mesList: string[];
  proyList: string[];
  zonaList: string[];
  fechaList: string[];
  loading: boolean;
  error: string | null;
}

const DashboardContext = createContext<DashboardContextValue>({
  raw: null,
  filters: { proy: 'ALL', zona: 'ALL', mes: 'ALL', fecha: 'ALL' },
  setFilters: () => {},
  mesList: [],
  proyList: [],
  zonaList: [],
  fechaList: [],
  loading: true,
  error: null,
});

export function useDashboard() {
  return useContext(DashboardContext);
}

function parseCSV<T>(text: string): T[] {
  if (!text || !text.trim()) return [];
  const result = Papa.parse<T>(text.trim(), {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  return result.data;
}

async function loadCSV(url: string): Promise<string> {
  try {
    const r = await fetch(url);
    if (!r.ok) return '';
    return r.text();
  } catch {
    return '';
  }
}

const PROYS_VAL = ['Norte-Centro', 'Sur'];

function mesesValidos(counts: Record<string, number>): string[] {
  const vals = Object.values(counts);
  if (!vals.length) return [];
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  const umbral = Math.max(10, avg * 0.05);
  return Object.entries(counts)
    .filter(([, c]) => c >= umbral)
    .map(([m]) => m);
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState<RawData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<Filters>({ proy: 'ALL', zona: 'ALL', mes: 'ALL', fecha: 'ALL' });
  const [mesList, setMesList] = useState<string[]>([]);
  const [proyList, setProyList] = useState<string[]>([]);
  const [zonaList, setZonaList] = useState<string[]>([]);
  const [fechaList, setFechaList] = useState<string[]>([]);

  const setFilters = useCallback((f: Partial<Filters>) => {
    setFiltersState(prev => ({ ...prev, ...f }));
  }, []);

  useEffect(() => {
    Promise.all([
      loadCSV('/api/data/dashboard_raw_records.csv'),
      loadCSV('/api/data/dashboard_costos.csv'),
      loadCSV('/api/data/dashboard_costos_empleado.csv'),
      loadCSV('/api/data/dashboard_ordenes_detalle.csv'),
    ]).then(([r, c, e, d]) => {
      if (!r) {
        setError('No se encontraron los archivos CSV. Verifique public/data/');
        setLoading(false);
        return;
      }

      const rawRecords = parseCSV<RawRecord>(r).filter(x => x && x.Fecha);
      const costos = parseCSV<CostoRecord>(c).filter(x => x && x.Proyecto && x.Mes);
      const emps = parseCSV<EmpleadoRecord>(e).filter(x => x && x.Empleado);
      const det = parseCSV<OrdenDetalle>(d).filter(x => x && x.Orden);

      // Normalize zones
      rawRecords.forEach(rec => {
        const p = normProy(rec.Zona);
        const z = normZonaDet(rec.Zona);
        if (p) rec._Proyecto = p;
        rec._Zona = z || p || undefined;
        const dz = normZonaDet(rec.Zona_Detalle || rec.Zona);
        rec._ZonaDet = dz || rec._Zona;
      });
      costos.forEach(rec => {
        const p = normProy(rec.Zona) || normProy(rec.Proyecto);
        const z = normZonaDet(rec.Zona) || normZonaDet(rec.Proyecto);
        if (p) rec._Proyecto = p;
        rec._Zona = z || p || undefined;
        rec._ZonaDet = rec._Zona;
      });
      det.forEach(rec => {
        const p = normProy(rec.Zona);
        const z = normZonaDet(rec.Zona);
        if (p) rec._Proyecto = p;
        rec._Zona = z || p || undefined;
        const dz = normZonaDet(rec.Zona);
        rec._ZonaDet = dz || rec._Zona;
      });

      const data: RawData = { raw: rawRecords, costos, emps, det };
      setRaw(data);

      // Build filters
      const proys = PROYS_VAL.filter(
        p => rawRecords.some(r => r._Proyecto === p) || costos.some(r => r._Proyecto === p)
      );
      setProyList(proys);

      const mRawC: Record<string, number> = {};
      const mCosC: Record<string, number> = {};
      rawRecords.forEach(r => {
        const m = String(r.Fecha || '').slice(0, 7);
        if (m) mRawC[m] = (mRawC[m] || 0) + 1;
      });
      costos.forEach(r => {
        if (r.Mes) mCosC[String(r.Mes)] = (mCosC[String(r.Mes)] || 0) + 1;
      });
      const mR = new Set(mesesValidos(mRawC));
      const mC = new Set(mesesValidos(mCosC));
      const meses = [...new Set([...mR, ...mC])].sort();
      setMesList(meses);

      // Default: último mes preseleccionado (como casilla marcada)
      const mesDef = meses[meses.length - 1];
      const newFilters: Filters = { proy: 'ALL', zona: 'ALL', mes: mesDef || 'ALL' , fecha: 'ALL' };
      setFiltersState(newFilters);

      // Fechas para el mes por defecto
      const fechas = [...new Set(
        rawRecords.filter(r => !mesDef || String(r.Fecha || '').startsWith(mesDef)).map(r => r.Fecha)
      )].filter((x): x is string => !!x).sort();
      setFechaList(fechas);

      setLoading(false);
    }).catch(err => {
      setError(String(err));
      setLoading(false);
    });
  }, []);

  // Actualiza zona list cuando cambia proyecto o raw
  useEffect(() => {
    if (!raw) return;
    const { raw: rawRecords, costos } = raw;

    const filteredRaw = filters.proy === 'ALL' ? rawRecords : rawRecords.filter(r => r._Proyecto === filters.proy);
    const filteredCos = filters.proy === 'ALL' ? costos : costos.filter(r => r._Proyecto === filters.proy);
    const zonaSet = new Set<string>();
    filteredRaw.forEach(r => { if (r._Zona) zonaSet.add(r._Zona); });
    filteredCos.forEach(r => { if (r._Zona) zonaSet.add(String(r._Zona)); });
    const zonas = [...zonaSet].sort();
    setZonaList(zonas);
  }, [raw, filters.proy]);

  // Actualiza fecha list según los meses seleccionados ([] = todos)
  useEffect(() => {
    if (!raw) return;
    const sel = filters.mes;
    const fechas = [...new Set(
      raw.raw
        .filter(r => sel.length === 0 || sel.includes(String(r.Fecha || '').slice(0, 7)))
        .map(r => r.Fecha)
    )].filter((x): x is string => !!x).sort();
    setFechaList(fechas);
    if (filters.fecha !== 'ALL') setFilters({ fecha: 'ALL' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, filters.mes]);

  return (
    <DashboardContext.Provider value={{ raw, filters, setFilters, mesList, proyList, zonaList, fechaList, loading, error }}>
      {children}
    </DashboardContext.Provider>
  );
}