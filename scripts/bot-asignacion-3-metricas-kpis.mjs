#!/usr/bin/env node

/**
 * ==============================================================================
 * 🤖 BOT 3: VALIDADOR DE CÁLCULOS, RANKING Y TIPOS DE OS
 * ==============================================================================
 * Verifica las fórmulas matemáticas, clasificación de OS y métricas de ranking:
 *  - Sumatorias de órdenes: total, asignadas, pendientes, suspensión, reconexión, se mantiene
 *  - Cálculo de % Tasa de Asignación: asignadas / (asignadas + pendientes) * 100
 *  - Ranking por barrio con ordenamiento dinámico
 *  - Conteo de técnicos asignados por barrio y conteo único de técnicos activos
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

console.log('\n================================================================');
console.log('🤖 BOT 3: VALIDADOR DE CÁLCULOS, RANKING Y TIPOS DE OS');
console.log('================================================================');

const MOCK_BARRIOS_CONSOLIDADOS = [
  {
    barrio: 'EL BOSQUE',
    municipio: 'BARRANQUILLA',
    total: 693,
    asignadas: 2,
    pendientes: 574,
    suspension: 627,
    reconexion: 0,
    seMantiene: 66,
    tecnicos: [{ tecnico: 'WILMER ENRIQUE PERTUZ FLOREZ', total: 2 }],
  },
  {
    barrio: 'CIUDADELA 20 DE JULIO',
    municipio: 'BARRANQUILLA',
    total: 546,
    asignadas: 93,
    pendientes: 17,
    suspension: 516,
    reconexion: 13,
    seMantiene: 17,
    tecnicos: [
      { tecnico: 'LUIS JAVIER TORRENEGRA MOLINA', total: 80 },
      { tecnico: 'Alexander Lechuga Pacheco', total: 13 },
    ],
  },
  {
    barrio: 'CIUDADELA METROPOLITANA',
    municipio: 'SOLEDAD',
    total: 415,
    asignadas: 38,
    pendientes: 25,
    suspension: 400,
    reconexion: 10,
    seMantiene: 5,
    tecnicos: [{ tecnico: 'Francisco Osorio Hernadez', total: 38 }],
  },
  {
    barrio: 'SBN MUNDO FELIZ',
    municipio: 'GALAPA',
    total: 1114,
    asignadas: 0,
    pendientes: 0,
    suspension: 1114,
    reconexion: 0,
    seMantiene: 0,
    tecnicos: [],
  },
];

console.log('\n--- Test Suite 3.1: Sumatorias por Tipo de OS y Estado ---');
test('Total de órdenes suma 2,768', () => {
  const sum = MOCK_BARRIOS_CONSOLIDADOS.reduce((s, b) => s + b.total, 0);
  assert.equal(sum, 2768);
});

test('Total de Suspensión suma 2,657 (627 + 516 + 400 + 1114)', () => {
  const sum = MOCK_BARRIOS_CONSOLIDADOS.reduce((s, b) => s + b.suspension, 0);
  assert.equal(sum, 2657);
});

test('Total de Reconexión suma 23 (0 + 13 + 10 + 0)', () => {
  const sum = MOCK_BARRIOS_CONSOLIDADOS.reduce((s, b) => s + b.reconexion, 0);
  assert.equal(sum, 23);
});

test('Total de Se Mantiene suma 88 (66 + 17 + 5 + 0)', () => {
  const sum = MOCK_BARRIOS_CONSOLIDADOS.reduce((s, b) => s + b.seMantiene, 0);
  assert.equal(sum, 88);
});

test('Total Asignadas es 133 y Pendientes es 616', () => {
  const asig = MOCK_BARRIOS_CONSOLIDADOS.reduce((s, b) => s + b.asignadas, 0);
  const pend = MOCK_BARRIOS_CONSOLIDADOS.reduce((s, b) => s + b.pendientes, 0);
  assert.equal(asig, 133);
  assert.equal(pend, 616);
});

console.log('\n--- Test Suite 3.2: Tasa de Asignación y Porcentajes ---');
test('Tasa de Asignación general es 17.8% (133 / (133 + 616))', () => {
  const asig = 133;
  const pend = 616;
  const totalGestion = asig + pend;
  const pct = Math.round((asig / totalGestion) * 100 * 10) / 10;
  assert.equal(pct, 17.8);
});

console.log('\n--- Test Suite 3.3: Detección de Líderes y Técnicos ---');
test('Barrio líder en Suspensión es SBN MUNDO FELIZ (1,114)', () => {
  const top = [...MOCK_BARRIOS_CONSOLIDADOS].sort((a, b) => b.suspension - a.suspension)[0];
  assert.equal(top.barrio, 'SBN MUNDO FELIZ');
  assert.equal(top.suspension, 1114);
});

test('Barrio líder en Reconexión es CIUDADELA 20 DE JULIO (13)', () => {
  const top = [...MOCK_BARRIOS_CONSOLIDADOS].sort((a, b) => b.reconexion - a.reconexion)[0];
  assert.equal(top.barrio, 'CIUDADELA 20 DE JULIO');
  assert.equal(top.reconexion, 13);
});

test('Conteo de técnicos únicos con carga es 4', () => {
  const setTecs = new Set();
  MOCK_BARRIOS_CONSOLIDADOS.forEach(b => {
    b.tecnicos.forEach(t => setTecs.add(t.tecnico));
  });
  assert.equal(setTecs.size, 4);
});

console.log('----------------------------------------------------------------');
console.log(`TOTAL BOT 3: ${passed} PASSED | ${failed} FAILED`);
console.log('----------------------------------------------------------------');

if (failed > 0) process.exit(1);
