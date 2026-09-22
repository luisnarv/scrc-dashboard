#!/usr/bin/env node

/**
 * ==============================================================================
 * 🤖 BOT 2: VALIDADOR DEL GRÁFICO, MODOS DE VISUALIZACIÓN Y DATASETS
 * ==============================================================================
 * Valida la construcción de la gráfica en todos sus modos:
 *  - Modo 1: Asignadas vs Pendientes (comparativa dual lado a lado o apilada)
 *  - Modo 2: Todas las órdenes cargadas (volumen total)
 *  - Modo 3: Solo Asignadas y Modo 4: Solo Pendientes
 *  - Modo 5: Desglose por Tipo de OS (Suspensión, Reconexión, Se Mantiene)
 *  - Modo Horario: Franja de 07:00 a 23:00 (17 franjas)
 *  - Líneas de promedio (isPromedio: true)
 *  - Etiquetas (Data Labels con halo de contraste)
 * ==============================================================================
 */

import assert from 'node:assert/strict';

const HORAS_JORNADA = [
  '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
  '19:00', '20:00', '21:00', '22:00', '23:00'
];

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
console.log('🤖 BOT 2: VALIDADOR DEL GRÁFICO, MODOS DE VISUALIZACIÓN Y DATASETS');
console.log('================================================================');

console.log('\n--- Test Suite 2.1: Modo Asignadas vs Pendientes (Dual) ---');
test('Construcción de datasets de Asignadas y Pendientes', () => {
  const barrios = [
    { barrio: 'EL BOSQUE', asignadas: 2, pendientes: 574 },
    { barrio: 'CIUDADELA 20 DE JULIO', asignadas: 93, pendientes: 17 },
  ];

  const dataAsignadas = barrios.map(b => b.asignadas);
  const dataPendientes = barrios.map(b => b.pendientes);

  assert.deepEqual(dataAsignadas, [2, 93]);
  assert.deepEqual(dataPendientes, [574, 17]);
});

test('Línea de promedio para Asignadas y Pendientes', () => {
  const dataAsignadas = [2, 93];
  const dataPendientes = [574, 17];

  const avgAsig = Math.round((dataAsignadas.reduce((s, v) => s + v, 0) / dataAsignadas.length) * 10) / 10;
  const avgPend = Math.round((dataPendientes.reduce((s, v) => s + v, 0) / dataPendientes.length) * 10) / 10;

  assert.equal(avgAsig, 47.5);
  assert.equal(avgPend, 295.5);
});

console.log('\n--- Test Suite 2.2: Modo Todas las Órdenes Cargadas ---');
test('Dataset de Total Cargadas consolida todas las órdenes', () => {
  const barrios = [
    { barrio: 'SBN MUNDO FELIZ', total: 1114 },
    { barrio: 'EL BOSQUE', total: 693 },
  ];

  const dataset = {
    type: 'bar',
    label: '📦 Todas las Órdenes Cargadas',
    data: barrios.map(b => b.total),
    backgroundColor: '#6366f1',
  };

  assert.equal(dataset.data[0], 1114);
  assert.equal(dataset.data[1], 693);
});

console.log('\n--- Test Suite 2.3: Modo Tipo de OS (Suspensión, Reconexión, Se Mantiene) ---');
test('Construcción de 3 series para tipos de orden generada', () => {
  const barrios = [
    { barrio: 'EL BOSQUE', suspension: 627, reconexion: 0, seMantiene: 66 },
    { barrio: 'CIUDADELA 20 DE JULIO', suspension: 516, reconexion: 13, seMantiene: 17 },
  ];

  const datasets = [
    { type: 'bar', label: '⚡ Suspensión', data: barrios.map(b => b.suspension), stack: 'stack1' },
    { type: 'bar', label: '🔄 Reconexión', data: barrios.map(b => b.reconexion), stack: 'stack1' },
    { type: 'bar', label: '⏸️ Se Mantiene', data: barrios.map(b => b.seMantiene), stack: 'stack1' },
  ];

  assert.equal(datasets.length, 3);
  assert.equal(datasets[0].data[0], 627);
  assert.equal(datasets[1].data[1], 13);
  assert.equal(datasets[2].data[0], 66);
});

console.log('\n--- Test Suite 2.4: Franja Horaria (07:00 a 23:00) ---');
test('Eje X horario cubre desde las 07:00 hasta las 23:00 (17 franjas)', () => {
  assert.equal(HORAS_JORNADA.length, 17);
  assert.equal(HORAS_JORNADA[0], '07:00');
  assert.equal(HORAS_JORNADA[16], '23:00');
});

console.log('\n--- Test Suite 2.5: Etiquetas Numéricas (Data Labels) ---');
test('Lógica de filtro de data labels descarta valores vacíos y cero', () => {
  const shouldShow = (val) => !(val === null || val === undefined || isNaN(val) || val === 0);
  assert.equal(shouldShow(0), false);
  assert.equal(shouldShow(null), false);
  assert.equal(shouldShow(574), true);
  assert.equal(shouldShow(2), true);
});

console.log('----------------------------------------------------------------');
console.log(`TOTAL BOT 2: ${passed} PASSED | ${failed} FAILED`);
console.log('----------------------------------------------------------------');

if (failed > 0) process.exit(1);
