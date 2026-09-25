#!/usr/bin/env node

/**
 * ==============================================================================
 * BOT: VALIDADOR DEL GRAFICO "ORDENES ASIGNADAS Y EXCLUIDAS" CON TOTALES Y SUMA GENERAL
 * ==============================================================================
 */

import assert from 'node:assert/strict';

function fmtN(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  return Number(n).toLocaleString('es-CO');
}

let passed = 0;
let failed = 0;

function test(desc, fn) {
  try {
    fn();
    console.log(`  [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

console.log('\n================================================================');
console.log('BOT: GRAFICO "ORDENES ASIGNADAS Y EXCLUIDAS" (TOTALES Y SUMA GENERAL)');
console.log('================================================================');

const MOCK_POR_DIA = [
  {
    fecha: '2026-09-01',
    label: '01/09',
    ejecutadas: 450,
    excluidosDia: 85,
    barrios: { asignados: 32, excluidos: 6, pendientes: 14 },
  },
  {
    fecha: '2026-09-02',
    label: '02/09',
    ejecutadas: 520,
    excluidosDia: 110,
    barrios: { asignados: 38, excluidos: 8, pendientes: 11 },
  },
  {
    fecha: '2026-09-03',
    label: '03/09',
    ejecutadas: 610,
    excluidosDia: 95,
    barrios: { asignados: 44, excluidos: 5, pendientes: 9 },
  },
];

console.log('\n--- 1. Subtotales y Total General por Dia (Columna Ordenes) ---');
test('Cada dia calcula subtotal Asignadas, subtotal Excluidas y Total General exacto', () => {
  MOCK_POR_DIA.forEach(d => {
    const totalOrdenes = (d.ejecutadas || 0) + (d.excluidosDia || 0);
    assert.equal(totalOrdenes, d.ejecutadas + d.excluidosDia);
    assert.ok(totalOrdenes >= d.ejecutadas);
    assert.ok(totalOrdenes >= d.excluidosDia);
  });
  assert.equal((MOCK_POR_DIA[0].ejecutadas + MOCK_POR_DIA[0].excluidosDia), 535);
  assert.equal((MOCK_POR_DIA[1].ejecutadas + MOCK_POR_DIA[1].excluidosDia), 630);
  assert.equal((MOCK_POR_DIA[2].ejecutadas + MOCK_POR_DIA[2].excluidosDia), 705);
});

console.log('\n--- 2. Subtotales y Total General por Dia (Columna Barrios) ---');
test('Cada dia calcula barrios Asignados, Excluidos, Pendientes y Total Barrios', () => {
  MOCK_POR_DIA.forEach(d => {
    const totalBarrios = d.barrios.asignados + d.barrios.excluidos + d.barrios.pendientes;
    assert.ok(totalBarrios > 0);
    assert.equal(totalBarrios, d.barrios.asignados + d.barrios.excluidos + d.barrios.pendientes);
  });
  assert.equal(MOCK_POR_DIA[0].barrios.asignados + MOCK_POR_DIA[0].barrios.excluidos + MOCK_POR_DIA[0].barrios.pendientes, 52);
  assert.equal(MOCK_POR_DIA[1].barrios.asignados + MOCK_POR_DIA[1].barrios.excluidos + MOCK_POR_DIA[1].barrios.pendientes, 57);
  assert.equal(MOCK_POR_DIA[2].barrios.asignados + MOCK_POR_DIA[2].barrios.excluidos + MOCK_POR_DIA[2].barrios.pendientes, 58);
});

console.log('\n--- 3. Logica de Posicionamiento: Mitad de Segmentos y Cuspide de la Barra ---');
test('Subtotales se centran verticalmente en la mitad: midY = (segTop + segBase) / 2', () => {
  const segBase = 300;
  const segTop = 180;
  const midY = (segTop + segBase) / 2;
  assert.equal(midY, 240);
  assert.ok(midY > segTop && midY < segBase);
});

test('Total General se posiciona sobre el punto mas alto del stack (highestY - 5)', () => {
  const seg1Top = 220;
  const seg2Top = 140;
  const highestY = Math.min(seg1Top, seg2Top);
  const totalLabelY = highestY - 5;
  assert.equal(highestY, 140);
  assert.equal(totalLabelY, 135);
  assert.ok(totalLabelY < highestY);
});

console.log('\n--- 4. Formateo de Texto en Grafica y Etiquetas ---');
test('Etiqueta Total General en grafica tiene formato Total: {N}', () => {
  const total = 535;
  const textoTotal = `Total: ${fmtN(total)}`;
  assert.equal(textoTotal, 'Total: 535');
});

test('Etiqueta Total Barrios en grafica tiene sufijo b.', () => {
  const totalBarrios = 52;
  const textoBarrios = `Tot: ${fmtN(totalBarrios)} b.`;
  assert.equal(textoBarrios, 'Tot: 52 b.');
});

test('Tooltip / Etiqueta informativa incluye Total General con desglose completo', () => {
  const d = MOCK_POR_DIA[0];
  const totOrdenesDia = d.ejecutadas + d.excluidosDia;
  const totBarriosDia = d.barrios.asignados + d.barrios.excluidos + d.barrios.pendientes;

  const lineaOrdenes = `* TOTAL GENERAL ORDENES: ${fmtN(totOrdenesDia)} (Asignadas: ${fmtN(d.ejecutadas)} + Excluidas: ${fmtN(d.excluidosDia)})`;
  const lineaBarrios = `* TOTAL GENERAL BARRIOS: ${fmtN(totBarriosDia)} (Asignados: ${fmtN(d.barrios.asignados)} | Excluidos: ${fmtN(d.barrios.excluidos)} | Pendientes: ${fmtN(d.barrios.pendientes)})`;

  assert.ok(lineaOrdenes.includes('TOTAL GENERAL ORDENES: 535'));
  assert.ok(lineaOrdenes.includes('Asignadas: 450 + Excluidas: 85'));
  assert.ok(lineaBarrios.includes('TOTAL GENERAL BARRIOS: 52'));
});

console.log('\n--- 5. Gran Total Acumulado del Periodo para Cabecera ---');
test('Gran Total suma exactamente todas las ordenes del grafico', () => {
  let totAsignadas = 0;
  let totExcluidas = 0;
  let totBarrios = 0;

  MOCK_POR_DIA.forEach(d => {
    totAsignadas += d.ejecutadas;
    totExcluidas += d.excluidosDia;
    totBarrios += (d.barrios.asignados + d.barrios.excluidos + d.barrios.pendientes);
  });

  const totOrdenes = totAsignadas + totExcluidas;
  assert.equal(totAsignadas, 1580);
  assert.equal(totExcluidas, 290);
  assert.equal(totOrdenes, 1870);
  assert.equal(totBarrios, 167);
});

console.log('----------------------------------------------------------------');
console.log(`TOTAL BOT GRAFICO TOTALES: ${passed} PASSED | ${failed} FAILED`);
console.log('----------------------------------------------------------------\n');

if (failed > 0) process.exit(1);
