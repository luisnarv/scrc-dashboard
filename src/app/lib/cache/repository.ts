import { LocalSource } from './localSource';
import { RemoteSource } from './remoteSource';
import { TTL_MES_ACTUAL_MS, TTL_MES_CERRADO_MS, TTL_META_MS, SYNC_YIELD_MS } from './config';
import type { CachedMonth, MonthResult, MonthsMeta } from './types';

// Evento emitido cuando datos frescos llegan en segundo plano.
export type RepoEvent =
  | { type: 'month'; mes: string; result: MonthResult }
  | { type: 'meta'; data: MonthsMeta };

type Listener = (e: RepoEvent) => void;
type Estado = 'fresh' | 'stale' | 'miss';

const yieldIdle = () =>
  new Promise<void>((r) => {
    if (typeof (window as any)?.requestIdleCallback === 'function') {
      (window as any).requestIdleCallback(() => r(), { timeout: SYNC_YIELD_MS });
    } else {
      setTimeout(r, SYNC_YIELD_MS);
    }
  });

// REPOSITORY: encapsula TODA la politica de sincronizacion (cache-first,
// stale-while-revalidate, TTL e invalidacion por version). Ni el provider ni las
// data sources repiten esta logica. Es un singleton framework-agnostico.
class DashboardRepository {
  private listeners = new Set<Listener>();
  private inflight = new Set<string>();   // evita revalidaciones duplicadas
  private currentMes: string | null = null;

  setCurrentMonth(mes: string) { this.currentMes = mes; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(e: RepoEvent) { this.listeners.forEach((l) => l(e)); }

  private ttlFor(mes: string) {
    return mes === this.currentMes ? TTL_MES_ACTUAL_MS : TTL_MES_CERRADO_MS;
  }

  // Version manda: si coincide, el dato es identico -> fresco sin importar TTL.
  // Si difiere -> stale. Si no conocemos version (aun sin meta) -> caemos a TTL.
  private decide(cached: CachedMonth | undefined, serverVersion: string | null, mes: string): Estado {
    if (!cached) return 'miss';
    if (serverVersion != null) return cached.version === serverVersion ? 'fresh' : 'stale';
    return Date.now() - cached.fetchedAt < this.ttlFor(mes) ? 'fresh' : 'stale';
  }

  // ---- Metadatos transversales (lista de meses + evolutivo) ----
  async getMonthsMeta({ force = false } = {}): Promise<{ data: MonthsMeta; origin: 'cache' | 'network' }> {
    const cached = await LocalSource.getMeta();
    // Una lista de meses vacia es una respuesta degenerada (ej. fallo transitorio
    // o un bug ya corregido): NUNCA se toma como cache valida -> se re-consulta.
    const cacheUtil = !!cached && cached.data.months.length > 0;
    const fresh = cacheUtil && !force && Date.now() - cached!.fetchedAt < TTL_META_MS;
    if (cacheUtil && !force) {
      if (!fresh) this.revalidateMeta();       // SWR: sirve cache y revalida
      return { data: cached!.data, origin: 'cache' };
    }
    const data = await RemoteSource.fetchMonthsMeta();
    if (data.months.length > 0) await LocalSource.putMeta(data); // no cachear vacio
    return { data, origin: 'network' };
  }

  private async revalidateMeta() {
    if (this.inflight.has('meta')) return;
    this.inflight.add('meta');
    try {
      const data = await RemoteSource.fetchMonthsMeta();
      if (data.months.length > 0) {            // no persistir/emitir una meta vacia
        await LocalSource.putMeta(data);
        this.emit({ type: 'meta', data });
      }
    } catch { /* silencioso: seguimos con cache */ }
    finally { this.inflight.delete('meta'); }
  }

  // ---- Un mes (cache-first + SWR) ----
  async getMonth(mes: string, { force = false, serverVersion = null as string | null } = {}): Promise<MonthResult> {
    const cached = await LocalSource.getMonth(mes);
    const estado = force ? 'stale' : this.decide(cached, serverVersion, mes);

    if (cached && estado === 'fresh') {
      return { mes, payload: cached.payload, origin: 'cache', version: cached.version };
    }
    if (cached && !force) {
      // Stale-While-Revalidate: devolvemos cache YA y refrescamos en 2do plano.
      this.revalidateMonth(mes, serverVersion);
      return { mes, payload: cached.payload, origin: 'cache', version: cached.version };
    }
    // Miss o refresh forzado: hay que esperar a la red.
    const payload = await RemoteSource.fetchMonth(mes);
    if (payload.rawRecords.length) await LocalSource.putMonth(mes, payload, serverVersion);
    return { mes, payload, origin: 'network', version: serverVersion };
  }

  private async revalidateMonth(mes: string, serverVersion: string | null) {
    const k = `month:${mes}`;
    if (this.inflight.has(k)) return;
    this.inflight.add(k);
    try {
      const payload = await RemoteSource.fetchMonth(mes);
      if (!payload.rawRecords.length) return;  // fetch vacio: no pisar la cache
      await LocalSource.putMonth(mes, payload, serverVersion);
      this.emit({ type: 'month', mes, result: { mes, payload, origin: 'network', version: serverVersion } });
    } catch { /* silencioso */ }
    finally { this.inflight.delete(k); }
  }

  // ---- Sincronizacion progresiva en segundo plano ----
  // Recorre los meses en orden (los mas recientes primero) y trae solo los que
  // no esten frescos, cediendo el hilo entre cada uno. Emite por cada mes nuevo.
  async syncMonths(meses: string[], versions: Record<string, string | null>) {
    for (const mes of meses) {
      const cached = await LocalSource.getMonth(mes);
      if (this.decide(cached, versions[mes] ?? null, mes) === 'fresh') continue;
      try {
        const payload = await RemoteSource.fetchMonth(mes);
        if (!payload.rawRecords.length) { await yieldIdle(); continue; }
        await LocalSource.putMonth(mes, payload, versions[mes] ?? null);
        this.emit({ type: 'month', mes, result: { mes, payload, origin: 'network', version: versions[mes] ?? null } });
      } catch { /* si un mes falla, seguimos con el resto */ }
      await yieldIdle();
    }
  }

  async clear() { await LocalSource.clearAll(); }
}

export const dashboardRepo = new DashboardRepository();
