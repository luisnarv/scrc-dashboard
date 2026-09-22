#!/usr/bin/env node

/**
 * ==============================================================================
 * 🤖 BOT 1: VALIDADOR DE REGLAS OFICIALES DE METAS POR ZONA Y TIPO DE BRIGADA
 * ==============================================================================
 * Valida que la configuración y funciones de metas de órdenes apliquen exactamente:
 * 
 * NORTE Y CENTRO:
 * - Pesadas: 20 L-V, sábados 15 (75%), domingos 0
 * - Livianas: 25 L-V, sábados 18.75 (75%), domingos 0
 * - Minicanasta y Canasta: 11 L-V, sábados 8, domingos 0
 * - Pesada MT: 15 L-V, sábados 11, domingos 0
 * - Pesada Disponibles: domingos 11
 * - Gestor Integral: 18 L-V, sábados 13, domingos 0
 * 
 * SUR:
 * - Livianas: 23 efectivas L-V y sábados
 * - Pesadas: 20 efectivas L-V y sábados
 * - Disponibilidad: 15 efectivas
 * - Canasta: 8 efectivas
 * - Minicanasta: 11 efectivas
 * ==============================================================================
 */

import assert from 'node:assert/strict';
import {
  METAS_NORTE_CENTRO,
  METAS_SUR,
  obtenerConfigMeta,
  getMetaDiariaEfectivas
} from '../src/app/components/utils/metasBrigadas.ts';

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
console.log('🤖 BOT 1: VALIDADOR DE REGLAS OFICIALES DE METAS (ZONA Y BRIGADA)');
console.log('================================================================');

console.log('\n--- Test Suite 1.1: Reglas Oficiales Norte y Centro ---');

test('Pesadas Norte-Centro: 20 L-V, 15 Sábados (75%), 0 Domingos', () => {
  const p = METAS_NORTE_CENTRO.PESADAS;
  assert.equal(p.lunesAViernes, 20);
  assert.equal(p.sabado, 15);
  assert.equal(p.domingo, 0);

  // Martes
  assert.equal(getMetaDiariaEfectivas('SCR PESADA', '2026-09-22', 'Norte-Centro'), 20);
  // Sábado
  assert.equal(getMetaDiariaEfectivas('SCR PESADA', '2026-09-26', 'Norte-Centro'), 15);
  // Domingo
  assert.equal(getMetaDiariaEfectivas('SCR PESADA', '2026-09-27', 'Norte-Centro'), 0);
});

test('Livianas Norte-Centro: 25 L-V, 18.75 Sábados (75%), 0 Domingos', () => {
  const l = METAS_NORTE_CENTRO.LIVIANAS;
  assert.equal(l.lunesAViernes, 25);
  assert.equal(l.sabado, 18.75);
  assert.equal(l.domingo, 0);

  // Miércoles
  assert.equal(getMetaDiariaEfectivas('SCR LIVIANA', '2026-09-23', 'Norte-Centro'), 25);
  // Sábado
  assert.equal(getMetaDiariaEfectivas('Brigada Tipo Liviana', '2026-09-26', 'Norte-Centro'), 18.75);
  // Domingo
  assert.equal(getMetaDiariaEfectivas('Brigada Liviana', '2026-09-27', 'Norte-Centro'), 0);
});

test('Minicanasta y Canasta Norte-Centro: 11 L-V, 8 Sábados, 0 Domingos', () => {
  const c = METAS_NORTE_CENTRO.MINICANASTA_CANASTA;
  assert.equal(c.lunesAViernes, 11);
  assert.equal(c.sabado, 8);
  assert.equal(c.domingo, 0);

  assert.equal(getMetaDiariaEfectivas('SCR MINI CANASTA', '2026-09-22', 'Norte-Centro'), 11);
  assert.equal(getMetaDiariaEfectivas('CANASTA', '2026-09-26', 'Norte-Centro'), 8);
  assert.equal(getMetaDiariaEfectivas('Brigada Tipo Minicanasta', '2026-09-27', 'Norte-Centro'), 0);
});

test('Pesada MT Norte-Centro: 15 L-V, 11 Sábados, 0 Domingos', () => {
  const mt = METAS_NORTE_CENTRO.PESADA_MT;
  assert.equal(mt.lunesAViernes, 15);
  assert.equal(mt.sabado, 11);
  assert.equal(mt.domingo, 0);

  assert.equal(getMetaDiariaEfectivas('Brigada Pesada/ MT AT', '2026-09-22', 'Norte-Centro'), 15);
  assert.equal(getMetaDiariaEfectivas('PESADA MT-AT', '2026-09-26', 'Norte-Centro'), 11);
  assert.equal(getMetaDiariaEfectivas('SCR MEDIDA ESPECIAL', '2026-09-27', 'Norte-Centro'), 0);
});

test('Pesada Disponibles Norte-Centro: 11 Domingos', () => {
  const d = METAS_NORTE_CENTRO.PESADA_DISPONIBLES;
  assert.equal(d.domingo, 11);

  assert.equal(getMetaDiariaEfectivas('(D) Brigada Tipo Pesada', '2026-09-27', 'Norte-Centro'), 11);
  assert.equal(getMetaDiariaEfectivas('SCR PESADA DISPONIBILIDAD', '2026-09-27', 'Norte-Centro'), 11);
});

test('Gestor Integral Norte-Centro: 18 L-V, 13 Sábados', () => {
  const g = METAS_NORTE_CENTRO.GESTOR_INTEGRAL;
  assert.equal(g.lunesAViernes, 18);
  assert.equal(g.sabado, 13);

  assert.equal(getMetaDiariaEfectivas('Gestor Integral Multi', '2026-09-22', 'Norte-Centro'), 18);
  assert.equal(getMetaDiariaEfectivas('SCR MULTIFAMILIAR', '2026-09-26', 'Norte-Centro'), 13);
});

console.log('\n--- Test Suite 1.2: Reglas Oficiales Proyecto Sur ---');

test('Livianas Sur: 23 efectivas', () => {
  const l = METAS_SUR.LIVIANAS;
  assert.equal(l.lunesAViernes, 23);
  assert.equal(l.sabado, 23);

  assert.equal(getMetaDiariaEfectivas('SCR LIVIANA', '2026-09-22', 'Sur'), 23);
  assert.equal(getMetaDiariaEfectivas('Brigada Tipo Liviana', '2026-09-26', 'Sur'), 23);
});

test('Pesadas Sur: 20 efectivas', () => {
  const p = METAS_SUR.PESADAS;
  assert.equal(p.lunesAViernes, 20);
  assert.equal(p.sabado, 20);

  assert.equal(getMetaDiariaEfectivas('SCR PESADA', '2026-09-22', 'Sur'), 20);
  assert.equal(getMetaDiariaEfectivas('Brigada Tipo Pesada', '2026-09-26', 'Sur'), 20);
});

test('Disponibilidad Sur: 15 efectivas', () => {
  const d = METAS_SUR.PESADA_DISPONIBILIDAD;
  assert.equal(d.lunesAViernes, 15);
  assert.equal(d.sabado, 15);
  assert.equal(d.domingo, 15);

  assert.equal(getMetaDiariaEfectivas('SCR PESADA DISPONIBILIDAD', '2026-09-22', 'Sur'), 15);
  assert.equal(getMetaDiariaEfectivas('(D) BRIGADA PESADA', '2026-09-27', 'Sur'), 15);
});

test('Canasta Sur: 8 efectivas', () => {
  const c = METAS_SUR.CANASTA;
  assert.equal(c.lunesAViernes, 8);
  assert.equal(c.sabado, 8);

  assert.equal(getMetaDiariaEfectivas('CANASTA', '2026-09-22', 'Sur'), 8);
  assert.equal(getMetaDiariaEfectivas('BRIGADA CANASTA', '2026-09-26', 'Sur'), 8);
});

test('Minicanasta Sur: 11 efectivas', () => {
  const m = METAS_SUR.MINICANASTA;
  assert.equal(m.lunesAViernes, 11);
  assert.equal(m.sabado, 11);

  assert.equal(getMetaDiariaEfectivas('SCR MINI CANASTA', '2026-09-22', 'Sur'), 11);
  assert.equal(getMetaDiariaEfectivas('BRIGADA MINICANASTA', '2026-09-26', 'Sur'), 11);
});

console.log('\n--- Test Suite 1.3: Detección Automática de Zona y Normalización de Alias ---');

test('Detección automática de Sur en zona o proyecto', () => {
  const cfg1 = obtenerConfigMeta('Brigada Tipo Liviana', 'AIR22200-100 SCRC ATLANTICO SUR');
  assert.equal(cfg1.lunesAViernes, 23);

  const cfg2 = obtenerConfigMeta('Brigada Tipo Liviana', 'SUR');
  assert.equal(cfg2.lunesAViernes, 23);

  const cfg3 = obtenerConfigMeta('Brigada Tipo Liviana', 'ATLANTICO NORTE');
  assert.equal(cfg3.lunesAViernes, 25);
});

console.log('----------------------------------------------------------------');
console.log(`TOTAL BOT 1: ${passed} PASSED | ${failed} FAILED`);
console.log('----------------------------------------------------------------');

if (failed > 0) process.exit(1);
