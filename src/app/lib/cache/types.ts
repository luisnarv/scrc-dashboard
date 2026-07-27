import type {
  RawRecord, CostoRecord, EmpleadoRecord, MesRecord, DispDiariaRecord, EvolutivoRecord,
} from '../../components/utils/types';

// Payload de UN mes tal como lo devuelve /api/data/base?mes=YYYY-MM
export interface MonthPayload {
  rawRecords: RawRecord[];
  costos: CostoRecord[];
  emps: EmpleadoRecord[];
  mesRecords: MesRecord[];
  dispDiaria: DispDiariaRecord[];
}

// Un mes disponible en el servidor (de /api/data/months)
export interface MonthMeta {
  mes: string;      // 'YYYY-MM'
  count: number;    // filas en tecnico_dia
  version: string;  // MAX(creado_en) -> huella para invalidar
}

// Metadatos transversales
export interface MonthsMeta {
  months: MonthMeta[];
  evolutivo: EvolutivoRecord[];
}

// Entrada persistida por mes en IndexedDB
export interface CachedMonth {
  mes: string;
  payload: MonthPayload;
  version: string | null;  // version del servidor con la que se guardo
  fetchedAt: number;       // epoch ms
}

// Entrada persistida para los metadatos
export interface CachedMeta {
  key: string;
  data: MonthsMeta;
  fetchedAt: number;
}

// Origen de un resultado servido por el repositorio
export type Origin = 'cache' | 'network';

export interface MonthResult {
  mes: string;
  payload: MonthPayload;
  origin: Origin;
  version: string | null;
}
