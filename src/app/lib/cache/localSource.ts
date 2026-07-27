import { idbGet, idbPut, idbGetAll, idbDelete, idbClear } from './idb';
import { STORE_MONTHS, STORE_META } from './config';
import type { CachedMonth, CachedMeta, MonthPayload, MonthsMeta } from './types';

const META_KEY = 'monthsMeta';

// Data Source LOCAL: unica puerta a la persistencia (IndexedDB). No conoce red
// ni politicas de TTL; solo guarda y devuelve lo que hay.
export const LocalSource = {
  async getMonth(mes: string): Promise<CachedMonth | undefined> {
    return idbGet<CachedMonth>(STORE_MONTHS, mes);
  },

  async putMonth(mes: string, payload: MonthPayload, version: string | null): Promise<void> {
    const entry: CachedMonth = { mes, payload, version, fetchedAt: Date.now() };
    await idbPut(STORE_MONTHS, entry);
  },

  async allMonths(): Promise<CachedMonth[]> {
    return idbGetAll<CachedMonth>(STORE_MONTHS);
  },

  async deleteMonth(mes: string): Promise<void> {
    await idbDelete(STORE_MONTHS, mes);
  },

  async getMeta(): Promise<CachedMeta | undefined> {
    return idbGet<CachedMeta>(STORE_META, META_KEY);
  },

  async putMeta(data: MonthsMeta): Promise<void> {
    const entry: CachedMeta = { key: META_KEY, data, fetchedAt: Date.now() };
    await idbPut(STORE_META, entry);
  },

  async clearAll(): Promise<void> {
    await idbClear(STORE_MONTHS);
    await idbClear(STORE_META);
  },
};
