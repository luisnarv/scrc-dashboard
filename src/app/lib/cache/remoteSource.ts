import type { MonthPayload, MonthsMeta } from './types';

// Data Source REMOTO: unica puerta a la red. No sabe de cache ni de estado.
export const RemoteSource = {
  async fetchMonthsMeta(): Promise<MonthsMeta> {
    const res = await fetch('/api/data/months', { cache: 'no-store' });
    if (!res.ok) throw new Error('No se pudo obtener la lista de meses');
    const data = await res.json();
    if (data.error) throw new Error('Error al procesar los meses');
    return { months: data.months || [], evolutivo: data.evolutivo || [] };
  },

  async fetchMonth(mes: string): Promise<MonthPayload> {
    const res = await fetch(`/api/data/base?mes=${encodeURIComponent(mes)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Error de conexión al obtener los datos');
    const data = await res.json();
    if (data.error) throw new Error('Error al procesar la información');
    return {
      rawRecords: data.rawRecords || [],
      costos: data.costos || [],
      emps: data.emps || [],
      mesRecords: data.mesRecords || [],
      dispDiaria: data.dispDiaria || [],
      horario: data.horario || [],
      horarioTec: data.horarioTec || [],
    };
  },
};
