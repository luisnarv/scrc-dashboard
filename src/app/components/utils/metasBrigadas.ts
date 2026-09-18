/**
 * metasBrigadas.ts — Configuración oficial de Metas de Órdenes Efectivas por Tipo de Brigada
 * 
 * Reglas de Metas de Órdenes Efectivas por Proyecto / Zona:
 * 
 * NORTE Y CENTRO (Norte-Centro):
 * - Pesadas: 20 L-V, sábados 75% (15)
 * - Livianas: 25 L-V, sábados 75% (18.75)
 * - Minicanasta y Canasta: 11 L-V, 8 sábados
 * - Pesada MT: 15 L-V, 11 sábados
 * - Pesada Disponibles: 11 domingos
 * - Gestor Integral: 18 L-V, 13 sábados
 * 
 * SUR (Proyecto Sur):
 * - Livianas: 23 efectivas
 * - Pesadas: 20 efectivas
 * - Disponibilidad: 15 efectivas
 * - Canasta: 8 efectivas
 * - Minicanasta: 11 efectivas
 */

export interface MetaBrigadaConfig {
  categoria: string;
  aliases: string[];
  lunesAViernes: number;
  sabado: number;
  domingo: number;
  descripcion: string;
}

export const METAS_NORTE_CENTRO: Record<string, MetaBrigadaConfig> = {
  PESADAS: {
    categoria: 'Pesadas',
    aliases: ['SCR PESADA', 'BRIGADA PESADA', 'PESADA', 'BRIGADA TIPO PESADA'],
    lunesAViernes: 20,
    sabado: 15, // 75% de 20
    domingo: 0,
    descripcion: '20 efectivas L-V, 15 sábados (75%)',
  },
  LIVIANAS: {
    categoria: 'Livianas',
    aliases: ['SCR LIVIANA', 'BRIGADA LIVIANA', 'LIVIANA', 'BRIGADA TIPO LIVIANA'],
    lunesAViernes: 25,
    sabado: 18.75, // 75% de 25
    domingo: 0,
    descripcion: '25 efectivas L-V, 18.75 sábados (75%)',
  },
  MINICANASTA_CANASTA: {
    categoria: 'Minicanasta y Canasta',
    aliases: [
      'SCR MINI CANASTA',
      'CANASTA',
      'BRIGADA MINICANASTA',
      'BRIGADA CANASTA',
      'SCR CANASTA',
      'BRIGADA TIPO MINICANASTA',
      'BRIGADA TIPO CANASTA',
    ],
    lunesAViernes: 11,
    sabado: 8,
    domingo: 0,
    descripcion: '11 efectivas L-V, 8 sábados',
  },

  PESADA_MT: {
    categoria: 'Pesada MT',
    aliases: [
      'PESADA MT-AT',
      'BRIGADA PESADA MT-AT',
      'SCR MEDIDA ESPECIAL',
      'PESADA MT',
      'PESADA/ MT AT',
      'BRIGADA PESADA/ MT AT',
    ],
    lunesAViernes: 15,
    sabado: 11,
    domingo: 0,
    descripcion: '15 efectivas L-V, 11 sábados',
  },
  PESADA_DISPONIBLES: {
    categoria: 'Pesada Disponibles',
    aliases: [
      'SCR PESADA DISPONIBILIDAD',
      'PESADA DISPONIBLE',
      'SCR DISPONIBLE',
      '(D) BRIGADA PESADA',
      '(D) BRIGADA TIPO PESADA',
    ],
    lunesAViernes: 0,
    sabado: 0,
    domingo: 11,
    descripcion: '11 efectivas domingos',
  },
  GESTOR_INTEGRAL: {
    categoria: 'Gestor Integral',
    aliases: [
      'GESTOR INTEGRAL MULTI',
      'SCR MULTIFAMILIAR',
      'GESTOR INTEGRAL',
      'GESTOR MULTI',
    ],
    lunesAViernes: 18,
    sabado: 13,
    domingo: 0,
    descripcion: '18 efectivas L-V, 13 sábados',
  },
};

export const METAS_SUR: Record<string, MetaBrigadaConfig> = {
  LIVIANAS: {
    categoria: 'Livianas',
    aliases: ['SCR LIVIANA', 'BRIGADA LIVIANA', 'LIVIANA', 'BRIGADA TIPO LIVIANA'],
    lunesAViernes: 23,
    sabado: 23,
    domingo: 0,
    descripcion: '23 efectivas (Proyecto Sur)',
  },
  PESADAS: {
    categoria: 'Pesadas',
    aliases: ['SCR PESADA', 'BRIGADA PESADA', 'PESADA', 'BRIGADA TIPO PESADA'],
    lunesAViernes: 20,
    sabado: 20,
    domingo: 0,
    descripcion: '20 efectivas (Proyecto Sur)',
  },
  PESADA_DISPONIBILIDAD: {
    categoria: 'Disponibilidad',
    aliases: [
      'SCR PESADA DISPONIBILIDAD',
      'PESADA DISPONIBLE',
      'SCR DISPONIBLE',
      'DISPONIBILIDAD',
      '(D) BRIGADA PESADA',
      '(D) BRIGADA TIPO PESADA',
    ],
    lunesAViernes: 15,
    sabado: 15,
    domingo: 15,
    descripcion: '15 efectivas (Proyecto Sur)',
  },
  CANASTA: {
    categoria: 'Canasta',
    aliases: ['CANASTA', 'BRIGADA CANASTA', 'SCR CANASTA', 'BRIGADA TIPO CANASTA'],
    lunesAViernes: 8,
    sabado: 8,
    domingo: 0,
    descripcion: '8 efectivas (Proyecto Sur)',
  },
  MINICANASTA: {
    categoria: 'Minicanasta',
    aliases: ['SCR MINI CANASTA', 'MINICANASTA', 'BRIGADA MINICANASTA', 'BRIGADA TIPO MINICANASTA'],
    lunesAViernes: 11,
    sabado: 11,
    domingo: 0,
    descripcion: '11 efectivas (Proyecto Sur)',
  },
};

/**
 * Normaliza y resuelve la configuración de metas según el tipo de brigada y zona.
 */
export function obtenerConfigMeta(tipoBrigada: string, zona?: string): MetaBrigadaConfig | null {
  const norm = String(tipoBrigada || '').trim().toUpperCase();
  if (!norm) return null;

  const esSur = zona ? String(zona).trim().toLowerCase().includes('sur') : false;
  const dicMetas = esSur ? METAS_SUR : METAS_NORTE_CENTRO;

  for (const key of Object.keys(dicMetas)) {
    const config = dicMetas[key];
    if (config.aliases.some(alias => norm.includes(alias.toUpperCase()))) {
      return config;
    }
  }

  // Fallbacks por patrones de texto
  if (esSur) {
    if (/disponib|\(d\)/i.test(norm)) return METAS_SUR.PESADA_DISPONIBILIDAD;
    if (/liviana/i.test(norm)) return METAS_SUR.LIVIANAS;
    if (/pesada/i.test(norm)) return METAS_SUR.PESADAS;
    if (/minicanasta/i.test(norm)) return METAS_SUR.MINICANASTA;
    if (/canasta/i.test(norm)) return METAS_SUR.CANASTA;
  } else {
    if (/pesada.*mt|mt.*at|medida/i.test(norm)) return METAS_NORTE_CENTRO.PESADA_MT;
    if (/disponib|\(d\)/i.test(norm)) return METAS_NORTE_CENTRO.PESADA_DISPONIBLES;
    if (/pesada/i.test(norm)) return METAS_NORTE_CENTRO.PESADAS;
    if (/liviana/i.test(norm)) return METAS_NORTE_CENTRO.LIVIANAS;
    if (/minicanasta|canasta/i.test(norm)) return METAS_NORTE_CENTRO.MINICANASTA_CANASTA;
    if (/gestor|multi/i.test(norm)) return METAS_NORTE_CENTRO.GESTOR_INTEGRAL;
  }

  return null;
}

/**
 * Obtiene la meta diaria de órdenes efectivas para un tipo de brigada, fecha y zona.
 * 
 * @param tipoBrigada Nombre o tipo de cuadrilla/brigada
 * @param fecha Date o string 'YYYY-MM-DD'
 * @param zona Zona o proyecto (ej: 'Norte-Centro' o 'Sur')
 * @returns Meta de órdenes efectivas (number)
 */
export function getMetaDiariaEfectivas(
  tipoBrigada: string,
  fecha: Date | string,
  zona?: string
): number {
  let dayOfWeek = 0; // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  if (typeof fecha === 'string') {
    const parts = fecha.split('-').map(Number);
    if (parts.length === 3) {
      dayOfWeek = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
    } else {
      dayOfWeek = new Date(fecha).getDay();
    }
  } else if (fecha instanceof Date) {
    dayOfWeek = fecha.getDay();
  }

  const config = obtenerConfigMeta(tipoBrigada, zona);
  if (!config) {
    if (dayOfWeek === 0) return 0;
    if (dayOfWeek === 6) return 15;
    return 20;
  }

  if (dayOfWeek === 0) return config.domingo;
  if (dayOfWeek === 6) return config.sabado;
  return config.lunesAViernes;
}

/**
 * Calcula la meta acumulada de órdenes efectivas para una lista de fechas trabajadas.
 */
export function getMetaPeriodoEfectivas(
  tipoBrigada: string,
  fechas: string[],
  zona?: string
): number {
  if (!fechas || !fechas.length) return 0;
  return fechas.reduce((sum, f) => sum + getMetaDiariaEfectivas(tipoBrigada, f, zona), 0);
}

/**
 * Retorna los minutos de trabajo activos en una hora de la jornada ('07:00'..'18:00')
 * según la zona y el día de la semana.
 * 
 * Reglas de Horarios Oficiales:
 * - Norte-Centro:
 *   - Lunes a Jueves: 7:30 AM - 5:00 PM (Almuerzo 12:00 PM - 1:00 PM) -> 8.5 hrs (510 min)
 *   - Viernes: 7:30 AM - 3:40 PM (Almuerzo 12:00 PM - 1:00 PM) -> 7.1667 hrs (430 min)
 *   - Sábado: 7:30 AM - 12:00 PM (Sin almuerzo) -> 4.5 hrs (270 min)
 * - Sur:
 *   - Lunes a Viernes: 7:30 AM - 5:00 PM (Almuerzo 12:00 PM - 1:00 PM) -> 8.5 hrs (510 min)
 *   - Sábado: 7:30 AM - 12:00 PM (Sin almuerzo) -> 4.5 hrs (270 min)
 */
export function getMinutosTrabajoHora(
  horaString: string,
  fecha: Date | string,
  zona?: string
): number {
  let dayOfWeek = 0; // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  if (typeof fecha === 'string') {
    const fStr = fecha.includes(',') ? fecha.split(',')[0] : fecha;
    const parts = fStr.split('-').map(Number);
    if (parts.length === 3) {
      dayOfWeek = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
    } else {
      dayOfWeek = new Date(fStr).getDay();
    }
  } else if (fecha instanceof Date) {
    dayOfWeek = fecha.getDay();
  }

  const esSur = zona ? String(zona).trim().toLowerCase().includes('sur') : false;
  const hNum = parseInt(horaString.split(':')[0], 10);
  if (isNaN(hNum)) return 0;

  // Determinar horario según zona y día
  // Lunes = 1, Martes = 2, Miércoles = 3, Jueves = 4, Viernes = 5, Sábado = 6, Domingo = 0
  let horaInicioMin = 7 * 60 + 30; // 7:30 AM = 450 min
  let horaFinMin = 17 * 60;        // 5:00 PM = 1020 min
  let tieneAlmuerzo = true;

  if (dayOfWeek === 6) { // Sábado
    horaInicioMin = 7 * 60 + 30; // 7:30 AM
    horaFinMin = 12 * 60;        // 12:00 PM
    tieneAlmuerzo = false;
  } else if (!esSur && dayOfWeek === 5) { // Viernes Norte-Centro
    horaInicioMin = 7 * 60 + 30; // 7:30 AM
    horaFinMin = 15 * 60 + 40;   // 3:40 PM = 940 min
    tieneAlmuerzo = true;
  } else if (dayOfWeek === 0) { // Domingo
    horaInicioMin = 7 * 60 + 30;
    horaFinMin = 17 * 60;
    tieneAlmuerzo = true;
  }

  // Rango del slot horaria (ej. '07:00' -> 420 a 480 min)
  const slotStart = hNum * 60;
  const slotEnd = (hNum + 1) * 60;

  // Si está completamente fuera de la jornada
  if (slotEnd <= horaInicioMin || slotStart >= horaFinMin) {
    return 0;
  }

  // Solapamiento bruto con la jornada laboral
  const startEffective = Math.max(slotStart, horaInicioMin);
  const endEffective = Math.min(slotEnd, horaFinMin);
  let minEfectivos = Math.max(0, endEffective - startEffective);

  // Si hay hora de almuerzo (12:00 PM - 1:00 PM, i.e., 720 a 780 min)
  if (tieneAlmuerzo) {
    const lunchStart = 12 * 60; // 720
    const lunchEnd = 13 * 60;   // 780
    const lStart = Math.max(startEffective, lunchStart);
    const lEnd = Math.min(endEffective, lunchEnd);
    if (lEnd > lStart) {
      minEfectivos -= (lEnd - lStart);
    }
  }

  return Math.max(0, minEfectivos);
}

export function getMinutosTrabajoDia(fecha: Date | string, zona?: string): number {
  const HORAS_JORNADA = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
  return HORAS_JORNADA.reduce((sum, h) => sum + getMinutosTrabajoHora(h, fecha, zona), 0);
}

/**
 * Obtiene la meta horaria de órdenes efectivas proporcional a los minutos laborables de esa hora.
 */
export function getMetaHorariaEfectivas(
  tipoBrigada: string,
  fecha: Date | string,
  horaString: string,
  zona?: string
): number {
  const metaDiaria = getMetaDiariaEfectivas(tipoBrigada, fecha, zona);
  if (!metaDiaria) return 0;

  const minHora = getMinutosTrabajoHora(horaString, fecha, zona);
  if (minHora <= 0) return 0;

  const HORAS_JORNADA = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
  const horasActivas = HORAS_JORNADA.filter(h => getMinutosTrabajoHora(h, fecha, zona) > 0).length || 8;

  return metaDiaria / horasActivas;
}
