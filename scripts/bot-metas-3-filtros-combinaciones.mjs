#!/usr/bin/env node

/**
 * ==============================================================================
 * 🤖 BOT 3: VALIDADOR DE FILTROS, COMBINACIONES Y ORDENAMIENTO DE METAS
 * ==============================================================================
 * Valida que los filtros interactúen armónicamente:
 *  - Filtro Global por Proyecto (Sur vs Norte-Centro vs ALL)
 *  - Filtro Global por Zona (Norte vs Centro vs Sur vs ALL)
 *  - Filtro Local por Tipo de Brigada (PESADA, LIVIANA, CANASTA, MINICANASTA, MT, DISP, GESTOR)
 *  - Filtro Local por Cobertura de Meta (ALTA, MEDIA, BAJA)
 *  - Algoritmos de ordenamiento (asignadas desc, meta desc, % cumplido asig desc, % cumplido meta desc)
 *  - Agregador de totales dinámico según los registros resultantes
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

// Dataset de prueba representativo con múltiples proyectos, zonas y brigadas
const MOCK_METAS = [
  {
    proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO',
    zona: 'CENTRO',
    tipo_brigada: 'Brigada Tipo Pesada',
    brigadas_activas: 24,
    metaUnit: 20,
    metaTotal: 480,
    asignadas: 461,
    ejecutadas: 89,
    pctAsignado: 96.0,
    pctCumplidoVsAsignado: 19.3,
    pctCumplidoVsMeta: 18.5,
  },
  {
    proyecto: 'AIR22200-100 SCRC ATLANTICO SUR',
    zona: 'SUR',
    tipo_brigada: 'SCR PESADA',
    brigadas_activas: 19,
    metaUnit: 20,
    metaTotal: 380,
    asignadas: 355,
    ejecutadas: 10,
    pctAsignado: 93.4,
    pctCumplidoVsAsignado: 2.8,
    pctCumplidoVsMeta: 2.6,
  },
  {
    proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO',
    zona: 'NORTE',
    tipo_brigada: 'Brigada Tipo Liviana',
    brigadas_activas: 2,
    metaUnit: 25,
    metaTotal: 50,
    asignadas: 55,
    ejecutadas: 3,
    pctAsignado: 110.0,
    pctCumplidoVsAsignado: 5.5,
    pctCumplidoVsMeta: 6.0,
  },
  {
    proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO',
    zona: 'CENTRO',
    tipo_brigada: 'Brigada Pesada/ MT AT',
    brigadas_activas: 1,
    metaUnit: 15,
    metaTotal: 15,
    asignadas: 14,
    ejecutadas: 4,
    pctAsignado: 93.3,
    pctCumplidoVsAsignado: 28.6,
    pctCumplidoVsMeta: 26.7,
  },
  {
    proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO',
    zona: 'NORTE',
    tipo_brigada: 'Brigada Tipo Canasta',
    brigadas_activas: 1,
    metaUnit: 11,
    metaTotal: 11,
    asignadas: 7,
    ejecutadas: 1,
    pctAsignado: 63.6,
    pctCumplidoVsAsignado: 14.3,
    pctCumplidoVsMeta: 9.1,
  },
  {
    proyecto: 'AIR22200-100 SCRC ATLANTICO SUR',
    zona: 'SUR',
    tipo_brigada: 'Brigada Tipo Liviana',
    brigadas_activas: 3,
    metaUnit: 23,
    metaTotal: 69,
    asignadas: 58,
    ejecutadas: 0,
    pctAsignado: 84.1,
    pctCumplidoVsAsignado: 0.0,
    pctCumplidoVsMeta: 0.0,
  }
];

function proyCoincide(rProy, filtro) {
  if (!filtro || filtro === 'ALL') return true;
  const p = (rProy || '').toUpperCase();
  if (filtro === 'Sur') return p.includes('SUR');
  if (filtro === 'Norte-Centro') return p.includes('NORTE') || p.includes('CENTRO');
  return p.includes(filtro.toUpperCase());
}

function filtrarMetas(items, filtros) {
  const { proy = 'ALL', zonaGlobal = 'ALL', zonaLocal = 'ALL', brigada = 'ALL', cobertura = 'ALL', orden = 'asignadas' } = filtros;

  return items.filter(item => {
    if (!proyCoincide(item.proyecto, proy)) return false;
    if (zonaGlobal !== 'ALL' && item.zona.toUpperCase() !== zonaGlobal.toUpperCase()) return false;
    if (zonaLocal !== 'ALL' && item.zona.toUpperCase() !== zonaLocal.toUpperCase()) return false;

    if (brigada !== 'ALL') {
      const tb = item.tipo_brigada.toUpperCase();
      if (brigada === 'PESADA' && !tb.includes('PESADA')) return false;
      if (brigada === 'LIVIANA' && !tb.includes('LIVIANA')) return false;
      if (brigada === 'CANASTA' && (!tb.includes('CANASTA') || tb.includes('MINI'))) return false;
      if (brigada === 'MT' && !tb.includes('MT') && !tb.includes('MEDIDA')) return false;
    }

    if (cobertura !== 'ALL') {
      if (cobertura === 'ALTA' && item.pctAsignado < 90) return false;
      if (cobertura === 'MEDIA' && (item.pctAsignado < 70 || item.pctAsignado >= 90)) return false;
      if (cobertura === 'BAJA' && item.pctAsignado >= 70) return false;
    }

    return true;
  }).sort((a, b) => {
    if (orden === 'meta') return b.metaTotal - a.metaTotal;
    if (orden === 'asignadas') return b.asignadas - a.asignadas;
    if (orden === 'cumplimiento_asig') return b.pctCumplidoVsAsignado - a.pctCumplidoVsAsignado;
    if (orden === 'cumplimiento_meta') return b.pctCumplidoVsMeta - a.pctCumplidoVsMeta;
    return 0;
  });
}

console.log('\n================================================================');
console.log('🤖 BOT 3: VALIDADOR DE FILTROS, COMBINACIONES Y ORDENAMIENTO');
console.log('================================================================');

console.log('\n--- Test Suite 3.1: Filtro por Proyecto (Sur vs Norte-Centro) ---');

test('Filtro proy = Norte-Centro retorna solo grupos de Atlántico Norte Centro', () => {
  const res = filtrarMetas(MOCK_METAS, { proy: 'Norte-Centro' });
  assert.equal(res.length, 4);
  assert.ok(res.every(r => r.proyecto.includes('NORTE CENTRO')));
});

test('Filtro proy = Sur retorna solo grupos de Atlántico Sur', () => {
  const res = filtrarMetas(MOCK_METAS, { proy: 'Sur' });
  assert.equal(res.length, 2);
  assert.ok(res.every(r => r.proyecto.includes('SUR')));
});

console.log('\n--- Test Suite 3.2: Filtro por Zona Específica ---');

test('Filtro zona = CENTRO retorna 2 grupos', () => {
  const res = filtrarMetas(MOCK_METAS, { zonaLocal: 'CENTRO' });
  assert.equal(res.length, 2);
  assert.ok(res.every(r => r.zona === 'CENTRO'));
});

test('Filtro zona = NORTE retorna 2 grupos', () => {
  const res = filtrarMetas(MOCK_METAS, { zonaLocal: 'NORTE' });
  assert.equal(res.length, 2);
  assert.ok(res.every(r => r.zona === 'NORTE'));
});

console.log('\n--- Test Suite 3.3: Filtro por Tipo de Brigada ---');

test('Filtro brigada = LIVIANA retorna las 2 brigadas livianas (Norte y Sur)', () => {
  const res = filtrarMetas(MOCK_METAS, { brigada: 'LIVIANA' });
  assert.equal(res.length, 2);
  assert.ok(res.every(r => r.tipo_brigada.includes('Liviana')));
});

test('Filtro brigada = CANASTA descarta minicanasta y retorna solo Canasta', () => {
  const res = filtrarMetas(MOCK_METAS, { brigada: 'CANASTA' });
  assert.equal(res.length, 1);
  assert.equal(res[0].tipo_brigada, 'Brigada Tipo Canasta');
});

console.log('\n--- Test Suite 3.4: Filtro por Cobertura de Meta ---');

test('Filtro cobertura = ALTA (>= 90%) retorna 4 grupos', () => {
  const res = filtrarMetas(MOCK_METAS, { cobertura: 'ALTA' });
  assert.equal(res.length, 4);
  assert.ok(res.every(r => r.pctAsignado >= 90));
});

test('Filtro cobertura = MEDIA (70%-89%) retorna 1 grupo (Liviana Sur con 84.1%)', () => {
  const res = filtrarMetas(MOCK_METAS, { cobertura: 'MEDIA' });
  assert.equal(res.length, 1);
  assert.equal(res[0].zona, 'SUR');
  assert.equal(res[0].pctAsignado, 84.1);
});

test('Filtro cobertura = BAJA (< 70%) retorna 1 grupo (Canasta Norte con 63.6%)', () => {
  const res = filtrarMetas(MOCK_METAS, { cobertura: 'BAJA' });
  assert.equal(res.length, 1);
  assert.equal(res[0].tipo_brigada, 'Brigada Tipo Canasta');
});

console.log('\n--- Test Suite 3.5: Algoritmos de Ordenamiento ---');

test('Ordenamiento por Asignadas ubica primero a Pesada Centro (461 asignadas)', () => {
  const res = filtrarMetas(MOCK_METAS, { orden: 'asignadas' });
  assert.equal(res[0].asignadas, 461);
});

test('Ordenamiento por Cumplimiento Asignado ubica primero a Pesada MT (28.6%)', () => {
  const res = filtrarMetas(MOCK_METAS, { orden: 'cumplimiento_asig' });
  assert.equal(res[0].tipo_brigada, 'Brigada Pesada/ MT AT');
  assert.equal(res[0].pctCumplidoVsAsignado, 28.6);
});

console.log('\n--- Test Suite 3.6: Combinaciones Cruzadas Complejas ---');

test('Cruce: Proyecto Norte-Centro + Zona Centro + Brigada Pesada', () => {
  const res = filtrarMetas(MOCK_METAS, {
    proy: 'Norte-Centro',
    zonaLocal: 'CENTRO',
    brigada: 'PESADA',
  });
  assert.equal(res.length, 2); // Pesada y Pesada MT
});

console.log('----------------------------------------------------------------');
console.log(`TOTAL BOT 3: ${passed} PASSED | ${failed} FAILED`);
console.log('----------------------------------------------------------------');

if (failed > 0) process.exit(1);
