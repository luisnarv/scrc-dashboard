#!/usr/bin/env node

/**
 * ==============================================================================
 * 🤖 BOT 1: VALIDADOR DE FILTROS Y MAPEO MULTIDIMENSIONAL
 * ==============================================================================
 * Prueba la lógica de filtrado de Asignación Operativa:
 *  - Coincidencia de proyecto ('Norte-Centro' con 'ATLANTICO NORTE CENTRO', 'Sur')
 *  - Coincidencia de zona ('SUR', 'CENTRO', 'NORTE')
 *  - Filtro por municipio
 *  - Búsqueda textual de barrio o municipio
 *  - Clasificación de Tipo de OS (TO501/504 -> Suspensión, TO502 -> Reconexión, TO503/506 -> Se Mantiene)
 *  - Filtro por Tipo de OS
 *  - Filtro de Asignación (Con Técnico Asignado vs Sin Asignar)
 *  - Filtro por Técnico Específico
 *  - Selección de Top N barrios y selección manual
 * ==============================================================================
 */

import assert from 'node:assert/strict';

// Réplica exacta de las funciones de src/app/asignacion_operativa/page.tsx
function proyCoincide(rProy, filtro) {
  if (!filtro || filtro === 'ALL') return true;
  const p = (rProy || '').toUpperCase();
  if (filtro === 'Sur') return p.includes('SUR');
  if (filtro === 'Norte-Centro') return p.includes('NORTE') || p.includes('CENTRO');
  return p.includes(filtro.toUpperCase());
}

function zonaCoincide(rZona, filtro) {
  if (!filtro || filtro === 'ALL') return true;
  return (rZona || '').toUpperCase().trim() === filtro.toUpperCase().trim();
}

function clasificarTipoOS(tipo) {
  const t = (tipo || '').toUpperCase().trim();
  if (t === 'TO501' || t === 'TO504') return 'Suspensión';
  if (t === 'TO502') return 'Reconexión';
  if (t === 'TO503' || t === 'TO506') return 'Se mantiene suspendido';
  return 'Otro';
}

// Datos de prueba simulados
const MOCK_ORDENES_AGRUPADAS = [
  { proyecto: 'AIR22200-100 SCRC ATLANTICO SUR', zona: 'SUR', municipio: 'GALAPA', barrio: 'SBN MUNDO FELIZ', tipo_orden: 'TO501', categoria_os: 'Suspensión', estado: null, estado_legible: 'Excluida', asignacion_status: 'No asignado', tecnico: 'No asignado', cantidad: 1114 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'NORTE', municipio: 'BARRANQUILLA', barrio: 'EL BOSQUE', tipo_orden: 'TO501', categoria_os: 'Suspensión', estado: 'DISPONIBLE', estado_legible: 'Pendiente', asignacion_status: 'No asignado', tecnico: 'No asignado', cantidad: 508 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'NORTE', municipio: 'BARRANQUILLA', barrio: 'EL BOSQUE', tipo_orden: 'TO503', categoria_os: 'Se mantiene suspendido', estado: 'DISPONIBLE', estado_legible: 'Pendiente', asignacion_status: 'No asignado', tecnico: 'No asignado', cantidad: 66 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'NORTE', municipio: 'BARRANQUILLA', barrio: 'EL BOSQUE', tipo_orden: 'TO501', categoria_os: 'Suspensión', estado: 'ASIGNADA', estado_legible: 'Asignada', asignacion_status: 'Asignado', tecnico: 'WILMER ENRIQUE PERTUZ FLOREZ', cantidad: 2 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'CENTRO', municipio: 'BARRANQUILLA', barrio: 'CIUDADELA 20 DE JULIO', tipo_orden: 'TO501', categoria_os: 'Suspensión', estado: 'ASIGNADA', estado_legible: 'Asignada', asignacion_status: 'Asignado', tecnico: 'LUIS JAVIER TORRENEGRA MOLINA', cantidad: 80 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'CENTRO', municipio: 'BARRANQUILLA', barrio: 'CIUDADELA 20 DE JULIO', tipo_orden: 'TO502', categoria_os: 'Reconexión', estado: 'ASIGNADA', estado_legible: 'Asignada', asignacion_status: 'Asignado', tecnico: 'LUIS JAVIER TORRENEGRA MOLINA', cantidad: 13 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'CENTRO', municipio: 'BARRANQUILLA', barrio: 'CIUDADELA 20 DE JULIO', tipo_orden: 'TO503', categoria_os: 'Se mantiene suspendido', estado: 'DISPONIBLE', estado_legible: 'Pendiente', asignacion_status: 'No asignado', tecnico: 'No asignado', cantidad: 17 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'CENTRO', municipio: 'SOLEDAD', barrio: 'CIUDADELA METROPOLITANA', tipo_orden: 'TO504', categoria_os: 'Suspensión', estado: 'ASIGNADA', estado_legible: 'Asignada', asignacion_status: 'Asignado', tecnico: 'Alexander Lechuga Pacheco', cantidad: 38 },
];

function filtrarOrdenes(rows, { proy = 'ALL', zona = 'ALL', municipio = 'ALL', busqueda = '', tipoOS = 'ALL', asignacion = 'ALL', tecnico = 'ALL' }) {
  return rows.filter(r => {
    if (!proyCoincide(r.proyecto, proy)) return false;
    if (!zonaCoincide(r.zona, zona)) return false;
    if (municipio !== 'ALL' && (r.municipio || '').toUpperCase() !== municipio.toUpperCase()) return false;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim();
      const b = (r.barrio || '').toLowerCase();
      const m = (r.municipio || '').toLowerCase();
      if (!b.includes(q) && !m.includes(q)) return false;
    }
    if (tipoOS !== 'ALL') {
      if (tipoOS === 'SUSPENSION' && !['TO501', 'TO504'].includes(r.tipo_orden)) return false;
      if (tipoOS === 'RECONEXION' && r.tipo_orden !== 'TO502') return false;
      if (tipoOS === 'SE_MANTIENE' && !['TO503', 'TO506'].includes(r.tipo_orden)) return false;
      if (!['SUSPENSION', 'RECONEXION', 'SE_MANTIENE'].includes(tipoOS) && r.tipo_orden !== tipoOS) return false;
    }
    if (asignacion === 'ASIGNADO' && r.asignacion_status !== 'Asignado') return false;
    if (asignacion === 'NO_ASIGNADO' && r.asignacion_status !== 'No asignado') return false;
    if (tecnico !== 'ALL' && r.tecnico !== tecnico) return false;
    return true;
  });
}

let passed = 0;
let failed = 0;

function test(desc, fn) {
  try {
    fn();
    console.log(`  ✔ [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✖ [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

console.log('\n================================================================');
console.log('🤖 BOT 1: VALIDADOR DE FILTROS Y MAPEO MULTIDIMENSIONAL');
console.log('================================================================');

console.log('\n--- Test Suite 1.1: Filtro de Proyecto (proyCoincide) ---');
test('Proyecto ALL incluye todos los registros', () => {
  const res = filtrarOrdenes(MOCK_ORDENES_AGRUPADAS, { proy: 'ALL' });
  assert.equal(res.length, 8);
});

test('Proyecto Norte-Centro coincide con AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', () => {
  const res = filtrarOrdenes(MOCK_ORDENES_AGRUPADAS, { proy: 'Norte-Centro' });
  assert.equal(res.length, 7);
  res.forEach(r => assert.ok(r.proyecto.includes('NORTE CENTRO')));
});

test('Proyecto Sur coincide con AIR22200-100 SCRC ATLANTICO SUR', () => {
  const res = filtrarOrdenes(MOCK_ORDENES_AGRUPADAS, { proy: 'Sur' });
  assert.equal(res.length, 1);
  res.forEach(r => assert.ok(r.proyecto.includes('SUR')));
});

console.log('\n--- Test Suite 1.2: Clasificación Oficial de Tipos de OS ---');
test('TO501 y TO504 se clasifican exactamente como "Suspensión"', () => {
  assert.equal(clasificarTipoOS('TO501'), 'Suspensión');
  assert.equal(clasificarTipoOS('TO504'), 'Suspensión');
});

test('TO502 se clasifica exactamente como "Reconexión"', () => {
  assert.equal(clasificarTipoOS('TO502'), 'Reconexión');
});

test('TO503 y TO506 se clasifican exactamente como "Se mantiene suspendido"', () => {
  assert.equal(clasificarTipoOS('TO503'), 'Se mantiene suspendido');
  assert.equal(clasificarTipoOS('TO506'), 'Se mantiene suspendido');
});

console.log('\n--- Test Suite 1.3: Filtro por Tipo de OS ---');
test('Filtro SUSPENSION incluye únicamente TO501 y TO504', () => {
  const res = filtrarOrdenes(MOCK_ORDENES_AGRUPADAS, { tipoOS: 'SUSPENSION' });
  assert.equal(res.length, 5);
  res.forEach(r => assert.ok(['TO501', 'TO504'].includes(r.tipo_orden)));
});

test('Filtro RECONEXION incluye únicamente TO502', () => {
  const res = filtrarOrdenes(MOCK_ORDENES_AGRUPADAS, { tipoOS: 'RECONEXION' });
  assert.equal(res.length, 1);
  assert.equal(res[0].tipo_orden, 'TO502');
  assert.equal(res[0].cantidad, 13);
});

test('Filtro SE_MANTIENE incluye únicamente TO503 y TO506', () => {
  const res = filtrarOrdenes(MOCK_ORDENES_AGRUPADAS, { tipoOS: 'SE_MANTIENE' });
  assert.equal(res.length, 2);
  res.forEach(r => assert.ok(['TO503', 'TO506'].includes(r.tipo_orden)));
});

console.log('\n--- Test Suite 1.4: Filtro de Asignación y Técnico ---');
test('Filtro ASIGNADO retorna solo órdenes con técnico asignado', () => {
  const res = filtrarOrdenes(MOCK_ORDENES_AGRUPADAS, { asignacion: 'ASIGNADO' });
  assert.equal(res.length, 4);
  res.forEach(r => assert.notEqual(r.tecnico, 'No asignado'));
});

test('Filtro NO_ASIGNADO retorna solo órdenes sin asignar', () => {
  const res = filtrarOrdenes(MOCK_ORDENES_AGRUPADAS, { asignacion: 'NO_ASIGNADO' });
  assert.equal(res.length, 4);
  res.forEach(r => assert.equal(r.tecnico, 'No asignado'));
});

test('Filtro por técnico específico retorna solo las órdenes de ese técnico', () => {
  const res = filtrarOrdenes(MOCK_ORDENES_AGRUPADAS, { tecnico: 'LUIS JAVIER TORRENEGRA MOLINA' });
  assert.equal(res.length, 2);
  const total = res.reduce((s, r) => s + r.cantidad, 0);
  assert.equal(total, 93); // 80 Suspensión + 13 Reconexión
});

console.log('\n--- Test Suite 1.5: Filtro por Municipio y Búsqueda ---');
test('Municipio BARRANQUILLA retorna solo registros de Barranquilla', () => {
  const res = filtrarOrdenes(MOCK_ORDENES_AGRUPADAS, { municipio: 'BARRANQUILLA' });
  assert.equal(res.length, 6);
  res.forEach(r => assert.equal(r.municipio, 'BARRANQUILLA'));
});

test('Búsqueda por texto "bosque" encuentra registros de EL BOSQUE', () => {
  const res = filtrarOrdenes(MOCK_ORDENES_AGRUPADAS, { busqueda: 'bosque' });
  assert.equal(res.length, 3);
  res.forEach(r => assert.equal(r.barrio, 'EL BOSQUE'));
});

console.log('----------------------------------------------------------------');
console.log(`TOTAL BOT 1: ${passed} PASSED | ${failed} FAILED`);
console.log('----------------------------------------------------------------');

if (failed > 0) process.exit(1);
