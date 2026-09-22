#!/usr/bin/env node

/**
 * ==============================================================================
 * 🤖 BOT 2: VALIDADOR DE CÁLCULOS, PORCENTAJES Y CUMPLIMIENTO VS ASIGNADO
 * ==============================================================================
 * Valida la lógica de:
 *  - Meta Total Cuota = brigadas_activas * meta_unitaria
 *  - % Asignación vs Meta = (asignadas / metaTotal) * 100
 *  - % Cumplimiento vs Asignado = (ejecutadas / asignadas) * 100
 *  - % Cumplimiento vs Meta Global = (ejecutadas / metaTotal) * 100
 *  - Brecha de meta = max(0, metaTotal - asignadas)
 *  - Manejo de bordes (división por cero, sin brigadas, sin asignadas)
 *  - Semáforos de porcentaje (Verde >= 90%, Ámbar 70%-89.9%, Rojo < 70%)
 * ==============================================================================
 */

import assert from 'node:assert/strict';

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

function calcularMetasItem(row, metaUnit) {
  const metaTotal = (row.brigadas_activas || 0) * metaUnit;
  const pctAsignado = metaTotal > 0 ? Math.round(((row.asignadas || 0) / metaTotal) * 1000) / 10 : (row.asignadas > 0 ? 100 : 0);
  const pctCumplidoVsAsignado = (row.asignadas || 0) > 0 ? Math.round(((row.ejecutadas || 0) / row.asignadas) * 1000) / 10 : 0;
  const pctCumplidoVsMeta = metaTotal > 0 ? Math.round(((row.ejecutadas || 0) / metaTotal) * 1000) / 10 : 0;
  const brecha = Math.max(0, metaTotal - (row.asignadas || 0));

  let semaforo = 'ROJO';
  if (pctAsignado >= 90) semaforo = 'VERDE';
  else if (pctAsignado >= 70) semaforo = 'AMBAR';

  return {
    metaTotal,
    pctAsignado,
    pctCumplidoVsAsignado,
    pctCumplidoVsMeta,
    brecha,
    semaforo,
  };
}

console.log('\n================================================================');
console.log('🤖 BOT 2: VALIDADOR DE CÁLCULOS, PORCENTAJES Y CUMPLIMIENTO');
console.log('================================================================');

console.log('\n--- Test Suite 2.1: Cálculo de Metas y Cobertura de Asignación ---');

test('Cálculo de meta total cuota con 24 brigadas de meta 20 = 480 órdenes', () => {
  const res = calcularMetasItem({ brigadas_activas: 24, asignadas: 461, ejecutadas: 89 }, 20);
  assert.equal(res.metaTotal, 480);
  // 461 / 480 = 96.04% -> 96.0%
  assert.equal(res.pctAsignado, 96.0);
  assert.equal(res.semaforo, 'VERDE');
  assert.equal(res.brecha, 19);
});

test('Cálculo de % Cumplido vs Asignado (89 / 461) = 19.3%', () => {
  const res = calcularMetasItem({ brigadas_activas: 24, asignadas: 461, ejecutadas: 89 }, 20);
  assert.equal(res.pctCumplidoVsAsignado, 19.3);
});

test('Cálculo de % Cumplido vs Meta Global (89 / 480) = 18.5%', () => {
  const res = calcularMetasItem({ brigadas_activas: 24, asignadas: 461, ejecutadas: 89 }, 20);
  assert.equal(res.pctCumplidoVsMeta, 18.5);
});

console.log('\n--- Test Suite 2.2: Semáforos y Rangos de Cobertura ---');

test('Cobertura óptima (>= 90%) se clasifica en semáforo VERDE', () => {
  const res = calcularMetasItem({ brigadas_activas: 10, asignadas: 190, ejecutadas: 100 }, 20);
  assert.equal(res.pctAsignado, 95.0);
  assert.equal(res.semaforo, 'VERDE');
  assert.equal(res.brecha, 10);
});

test('Cobertura en alerta (70% - 89.9%) se clasifica en semáforo AMBAR', () => {
  const res = calcularMetasItem({ brigadas_activas: 10, asignadas: 150, ejecutadas: 75 }, 20);
  assert.equal(res.pctAsignado, 75.0);
  assert.equal(res.semaforo, 'AMBAR');
  assert.equal(res.brecha, 50);
});

test('Cobertura deficiente (< 70%) se clasifica en semáforo ROJO', () => {
  const res = calcularMetasItem({ brigadas_activas: 10, asignadas: 110, ejecutadas: 20 }, 20);
  assert.equal(res.pctAsignado, 55.0);
  assert.equal(res.semaforo, 'ROJO');
  assert.equal(res.brecha, 90);
});

console.log('\n--- Test Suite 2.3: Casos Borde y Seguridad contra División por Cero ---');

test('Cero brigadas activas no produce NaN ni Infinity', () => {
  const res = calcularMetasItem({ brigadas_activas: 0, asignadas: 0, ejecutadas: 0 }, 20);
  assert.equal(res.metaTotal, 0);
  assert.equal(res.pctAsignado, 0);
  assert.equal(res.pctCumplidoVsAsignado, 0);
  assert.equal(res.pctCumplidoVsMeta, 0);
  assert.equal(res.brecha, 0);
});

test('Cero órdenes asignadas no produce división por cero en % Cumplido', () => {
  const res = calcularMetasItem({ brigadas_activas: 5, asignadas: 0, ejecutadas: 0 }, 20);
  assert.equal(res.metaTotal, 100);
  assert.equal(res.pctAsignado, 0);
  assert.equal(res.pctCumplidoVsAsignado, 0);
  assert.equal(res.brecha, 100);
});

test('Sobreasignación (> 100% de la meta) brecha es 0 y porcentaje correcto', () => {
  const res = calcularMetasItem({ brigadas_activas: 5, asignadas: 120, ejecutadas: 110 }, 20);
  assert.equal(res.metaTotal, 100);
  assert.equal(res.pctAsignado, 120.0);
  assert.equal(res.brecha, 0);
  assert.equal(res.semaforo, 'VERDE');
});

console.log('----------------------------------------------------------------');
console.log(`TOTAL BOT 2: ${passed} PASSED | ${failed} FAILED`);
console.log('----------------------------------------------------------------');

if (failed > 0) process.exit(1);
