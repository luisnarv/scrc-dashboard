// Homologacion de barrios: cruza el nombre del GeoJSON (poligono) con el
// `barrio` de la BD (campo LOCALIDAD/BARRIO), que muchas veces no coinciden
// exactamente. Se aplica LA MISMA funcion en ambos lados (BD y GeoJSON) para
// que produzcan la misma "clave" y el heatmap/filtro casen.
//
// Capa 1 - Normalizacion: mayusculas, sin tildes, sin puntuacion, y quita
//          prefijos genericos que no distinguen el barrio (BARRIO, URB, etc.).
//          Resuelve solo casos como "BARRIO ABAJO" <-> "ABAJO".
// Capa 2 - Tabla manual: para nombres realmente distintos (abreviaturas,
//          errores, otro nombre). Editar HOMOLOGACION_BARRIO abajo.

// Prefijos descriptivos que no cambian la identidad del barrio.
const PREFIJOS_RUIDO = /^(BARRIO|BRR|BARR|URBANIZACION|URBANIZACON|URB|CIUDADELA|SECTOR|B\/)\s+/;

// Base: mayusculas, sin tildes, solo alfanumerico + espacios colapsados.
export function normBase(s?: string): string {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Nombre de barrio normalizado (base + sin prefijo de ruido).
export function normBarrio(s?: string): string {
  return normBase(s).replace(PREFIJOS_RUIDO, '').trim();
}

// ---------------------------------------------------------------------------
// TABLA DE HOMOLOGACION MANUAL
// Clave:  `${MUNICIPIO_NORM}|${BARRIO_BD_NORM}`  (usa normBase para el muni y
//         normBarrio para el barrio, tal como salen de esta libreria).
// Valor:  el nombre del barrio TAL CUAL viene en el GeoJSON (o su equivalente).
// Ejemplo:
//   'BARRANQUILLA|LA MANGA': 'LAS MANGAS',
// ---------------------------------------------------------------------------
export const HOMOLOGACION_BARRIO: Record<string, string> = {
  // Agregar aqui los casos que la normalizacion no resuelva.
};

// Clave canonica para cruzar BD <-> GeoJSON. Se usa IGUAL en ambos lados.
export function claveBarrio(municipio?: string, barrio?: string): string {
  const m = normBase(municipio);
  const b = normBarrio(barrio);
  const homolog = HOMOLOGACION_BARRIO[`${m}|${b}`];
  return `${m}|${homolog ? normBarrio(homolog) : b}`;
}
