// Homologacion de barrios: cruza el nombre del GeoJSON (poligono) con el
// `barrio` de la BD (campo LOCALIDAD/BARRIO), que muchas veces no coinciden.
//
// Capa 1 - Normalizacion (normBarrio): mayusculas, sin tildes, sin puntuacion,
//          y quita prefijos genericos (BARRIO, URB, EL, LA…). Resuelve casos
//          como "BARRIO ABAJO"<->"ABAJO" o "EL RECREO"<->"RECREO ".
// Capa 2 - Tabla manual (HOMOLOGACION_BARRIO): para nombres realmente distintos
//          (abreviaturas, etapas, otro nombre). Se aplica via canonBarrio().

// Prefijos que no cambian la identidad del barrio: descriptivos (BARRIO, URB…)
// y articulos (EL, LA…). El GeoJSON y la BD los ponen de forma inconsistente,
// asi que se quitan de AMBOS lados para que casen.
const PREFIJOS_RUIDO = /^(BARRIO|BRR|BARR|URBANIZACION|URBANIZACON|URB|CIUDADELA|SECTOR|B\/|EL|LA|LOS|LAS)\s+/;

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
// Clave:  normBase(barrio_BD)  -> el texto de LOCALIDAD/BARRIO en MAYUSCULAS,
//         sin tildes ni puntuacion, PERO conservando prefijos (para no
//         colisionar "URB PRADO" con "EL PRADO", que normBarrio unificaria).
// Valor:  el nombre del barrio TAL CUAL viene en el GeoJSON (o equivalente);
//         canonBarrio() le aplica normBarrio para producir la clave final.
// ---------------------------------------------------------------------------
export const HOMOLOGACION_BARRIO: Record<string, string> = {
  'ALTOS DEL PRADO': 'ALTO PRADO',
  'SANTO DOMINGO': 'SANTODOMINGO',
  'VICTORIA VIEJA C HERMOSA': 'LA VICTORIA',
  'SOLUCIONES MINIMAS V HERMOSA': 'SOLUCIONES MINIMAS',
  'VILLA SAN PEDRO': 'VILLA SAN PEDRO II',
  'URB VILLA DE SEVILLA': 'URBANIZACION SEVILLA REAL',
  'LOS ALMENDROS 2 ETAPA': 'LOS ALMENDROS II',
  'LOS ROBLES 4 ETAPA': 'LOS ROBLES IV',
  'JARDINES DE VILLA ESTADIO': 'JARDIN DE VILLA ESTADIO',
  'VILLA ESTADIO 2 ETAPA': 'VILLA ESTADIO II',
  'LAS MORAS 4 ETAPA': 'MORAS IV ETAPA',
  'LAS MORAS': 'URBANIZACION LAS MORAS',
  'VILLA KATANGA 2 ETAPA': 'VILLA KATANGA II',
  'URB PARQUE MUVDI 2': 'VILLA MUVDI',
  'JOSE A GALAN': 'JOSE ANTONIO GALAN',
  'EL PARQUE': 'URBANIZACION EL PARQUE',
  'VILLA ARAGON': 'VILLA DE ARAGON',
  'URB LA VIOLA': 'VILLA VIOLA',
  'LAS COLONIAS 2 ETAPA': 'LAS COLONIAS II',
  'VILLA STEFANNY': 'VILLA ESTEFANY',
  'VILLA ADELA': 'VILLA ADELA I',
  'URB PRADO': 'PRADO DE SOLEDAD',
  'URB MARTHA GUISELLA': 'MARTHA GISELLA',
  'CIUDADELA METROPOLITANA': 'ALTOS DE LA METROPOLITANA',
  'LA CANDELARIA 2 ETAPA': 'LA CANDELARIA II',
  'EL CONCORD': 'EL CONCONDE',
  'URB SAN FERNANDO 1 ETAPA': 'SAN FERNANDO',
  'VILLA RICA 2': 'VILLA RICA II',
  'VILLA RICA 1': 'VILLA RICA I',
  'SAN JUAN XXIII': 'JUAN XXIII',
  'EL EDEN': 'EL EDEN I',
  'LAGOS DE CAUJARAL': 'CAUJARAL',
  'SALAMAR': 'VILLA SALAMAR',
  'LA FLORESTA': 'FLORESTA I',
  'TAJAMARES': 'TAJAMAR',
};

// Nombre canonico del barrio (normalizado, con homologacion aplicada). Se usa
// IGUAL para la BD y para el GeoJSON: producen la misma clave y cruzan.
export function canonBarrio(barrio?: string): string {
  const homolog = HOMOLOGACION_BARRIO[normBase(barrio)];
  return homolog ? normBarrio(homolog) : normBarrio(barrio);
}

// Clave municipio|barrio (para nombres duplicados entre municipios). Usa el
// canonico. Para nombres unicos, MapComponent cruza solo por canonBarrio().
export function claveBarrio(municipio?: string, barrio?: string): string {
  return `${normBase(municipio)}|${canonBarrio(barrio)}`;
}
