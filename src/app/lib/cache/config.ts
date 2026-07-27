// Configuracion de la estrategia de cache local.

// TTL: ventana en la que un mes cacheado se considera "fresco" y NO se revalida.
// 30 min es el punto de partida pedido. Evaluacion: los datos provienen de un
// ETL que corre por lotes (no en tiempo real), asi que un TTL corto solo genera
// consultas de mas. Por eso el mes EN CURSO usa 30 min (puede recibir cargas del
// dia) y los meses CERRADOS usan un TTL largo (rara vez cambian) apoyandose en la
// invalidacion por "version" (MAX(creado_en)) para detectar recargas del ETL.
export const TTL_MES_ACTUAL_MS = 30 * 60 * 1000;        // 30 min
export const TTL_MES_CERRADO_MS = 24 * 60 * 60 * 1000;  // 24 h
export const TTL_META_MS = 30 * 60 * 1000;              // 30 min (lista de meses)

// IndexedDB
export const DB_NAME = 'scrc-cache';
export const DB_VERSION = 3;
export const STORE_MONTHS = 'months';   // key = 'YYYY-MM'
export const STORE_META = 'meta';       // key = string
export const STORE_MAPA = 'mapa';        // key = 'mes|zona|proy'

// TTL del mapa: 30 min. Reabrir el modal dentro de esa ventana no consulta la BD.
export const TTL_MAPA_MS = 30 * 60 * 1000;

// Pausa entre meses durante la sincronizacion en segundo plano (progresiva).
export const SYNC_YIELD_MS = 400;
