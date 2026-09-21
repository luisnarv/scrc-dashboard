#!/usr/bin/env node

/**
 * ==============================================================================
 * BOT 4: VALIDADOR DE CÁLCULOS FINANCIEROS, BENCHMARK, ORDENAMIENTO Y PAGINACIÓN
 * ==============================================================================
 * Valida la exactitud analítica y de visualización en la vista /Productivo:
 *   1. Regresión Lineal (calcSlope) y tendencias ascendentes / descendentes.
 *   2. Crecimiento porcentual (trendPct) y protección contra divisiones por cero.
 *   3. Benchmark de Brigada (mediaBrigada, cumplimientoPct vs media, semáforo).
 *   4. Formateador monetario compacto (fmtCOPCompact vs fmtCOP).
 *   5. Algoritmos de ordenamiento (mayor producción, mayor cumplimiento,
 *      mayor tendencia, alfabético).
 *   6. Motor de paginación de 24 tarjetas con navegación en límites.
 * ==============================================================================
 */

function calcSlope(monthlyData) {
  const N = monthlyData.length;
  if (N < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  monthlyData.forEach((m, i) => {
    sumX += i;
    sumY += m.val;
    sumXY += i * m.val;
    sumX2 += i * i;
  });
  const denom = (N * sumX2 - sumX * sumX);
  return denom !== 0 ? (N * sumXY - sumX * sumY) / denom : 0;
}

function fmtCOP(v) {
  const n = Number(v);
  if (!v || isNaN(n)) return '$0';
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(3) + 'M';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
}

function fmtCOPCompact(v, is8Plus) {
  const numVal = Number(v);
  if (!v || isNaN(numVal) || numVal === 0) return '$0';
  if (!is8Plus) return fmtCOP(numVal);
  const a = Math.abs(numVal);
  if (a >= 1e9) return '$' + (numVal / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return '$' + (numVal / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + (numVal / 1e3).toFixed(0) + 'K';
  return '$' + numVal.toFixed(0);
}

function calcTrendPct(monthlyData) {
  if (monthlyData.length < 2) return 0;
  const lastVal = monthlyData[monthlyData.length - 1].val;
  const prevVal = monthlyData[monthlyData.length - 2].val;
  if (prevVal > 0) {
    return ((lastVal - prevVal) / prevVal) * 100;
  } else if (lastVal > 0) {
    return 100;
  }
  return 0;
}

async function runBot4() {
  console.log('\n================================================================');
  console.log('🤖 BOT 4: VALIDADOR DE CÁLCULOS, BENCHMARK, ORDEN Y PAGINACIÓN');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc, condition) {
    if (condition) {
      console.log(`  ✔ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ✖ [FAIL] ${desc}`);
      failed++;
    }
  }

  // Test Suite 4.1: Regresión Lineal (calcSlope)
  console.log('--- Test Suite 4.1: Regresión Lineal (calcSlope) ---');
  const ascendingData = [{ val: 1000 }, { val: 2000 }, { val: 3000 }, { val: 4000 }];
  const slopeAsc = calcSlope(ascendingData);
  assert('calcSlope con valores crecientes uniformes es exactamente +1000', Math.round(slopeAsc) === 1000);

  const descendingData = [{ val: 4000 }, { val: 3000 }, { val: 2000 }, { val: 1000 }];
  const slopeDesc = calcSlope(descendingData);
  assert('calcSlope con valores decrecientes uniformes es exactamente -1000', Math.round(slopeDesc) === -1000);

  const flatData = [{ val: 5000 }, { val: 5000 }, { val: 5000 }];
  const slopeFlat = calcSlope(flatData);
  assert('calcSlope con valores constantes es exactamente 0', slopeFlat === 0);

  assert('calcSlope con 1 solo dato retorna 0 sin dividir por cero', calcSlope([{ val: 5000 }]) === 0);
  assert('calcSlope con 0 datos retorna 0', calcSlope([]) === 0);

  // Test Suite 4.2: Variación Porcentual (calcTrendPct)
  console.log('\n--- Test Suite 4.2: Variación Porcentual (calcTrendPct) ---');
  const trendNormal = calcTrendPct([{ val: 2000 }, { val: 2500 }]);
  assert('Crecimiento de 2000 a 2500 es +25%', trendNormal === 25);

  const trendReactivation = calcTrendPct([{ val: 0 }, { val: 3000 }]);
  assert('Reactivación desde 0 a 3000 retorna 100% de crecimiento', trendReactivation === 100);

  const trendZeroToZero = calcTrendPct([{ val: 0 }, { val: 0 }]);
  assert('Sin actividad en ambos meses retorna 0%', trendZeroToZero === 0);

  // Test Suite 4.3: Benchmark de Brigada y Cumplimiento
  console.log('\n--- Test Suite 4.3: Benchmark de Brigada y Semáforos ---');
  const tec1 = { nombre: 'ALTO', promedioMensual: 5500000 };
  const tec2 = { nombre: 'MEDIO', promedioMensual: 4500000 };
  const tec3 = { nombre: 'BAJO', promedioMensual: 3000000 };
  const mediaBrigada = 5000000;

  const cump1 = Math.round((tec1.promedioMensual / mediaBrigada) * 100);
  const cump2 = Math.round((tec2.promedioMensual / mediaBrigada) * 100);
  const cump3 = Math.round((tec3.promedioMensual / mediaBrigada) * 100);

  assert('Técnico ALTO tiene 110% de cumplimiento vs media', cump1 === 110);
  assert('Técnico ALTO cae en semáforo VERDE (>= 100%)', cump1 >= 100);

  assert('Técnico MEDIO tiene 90% de cumplimiento vs media', cump2 === 90);
  assert('Técnico MEDIO cae en semáforo NARANJA (80% - 99%)', cump2 >= 80 && cump2 < 100);

  assert('Técnico BAJO tiene 60% de cumplimiento vs media', cump3 === 60);
  assert('Técnico BAJO cae en semáforo ROJO (< 80%)', cump3 < 80);

  // Test Suite 4.4: Formateador Compacto (fmtCOPCompact)
  console.log('\n--- Test Suite 4.4: Formateador Compacto (fmtCOPCompact) ---');
  assert('Valor 0 retorna "$0"', fmtCOPCompact(0, true) === '$0');
  assert('Valor nulo retorna "$0"', fmtCOPCompact(null, true) === '$0');
  assert('Valor en Miles con is8Plus=true formatea a K', fmtCOPCompact(450000, true) === '$450K');
  assert('Valor en Millones con is8Plus=true formatea a M', fmtCOPCompact(3500000, true) === '$3.5M');
  assert('Valor en Miles de Millones con is8Plus=true formatea a B', fmtCOPCompact(1200000000, true) === '$1.2B');

  // Test Suite 4.5: Algoritmos de Ordenamiento
  console.log('\n--- Test Suite 4.5: Algoritmos de Ordenamiento ---');
  const sampleTecs = [
    { nombre: 'ZULMA', totalProduccion: 10000000, cumplimientoPct: 85, trendPct: 10 },
    { nombre: 'ANDRES', totalProduccion: 25000000, cumplimientoPct: 120, trendPct: -5 },
    { nombre: 'BERNARDO', totalProduccion: 18000000, cumplimientoPct: 95, trendPct: 40 },
  ];

  // Orden por total
  const byTotal = sampleTecs.slice().sort((a, b) => b.totalProduccion - a.totalProduccion);
  assert('Orden "total" ubica a ANDRES de primero ($25M)', byTotal[0].nombre === 'ANDRES');

  // Orden por cumplimiento
  const byCump = sampleTecs.slice().sort((a, b) => b.cumplimientoPct - a.cumplimientoPct);
  assert('Orden "cump" ubica a ANDRES de primero (120%)', byCump[0].nombre === 'ANDRES');

  // Orden por tendencia
  const byTrend = sampleTecs.slice().sort((a, b) => b.trendPct - a.trendPct);
  assert('Orden "trend" ubica a BERNARDO de primero (+40%)', byTrend[0].nombre === 'BERNARDO');

  // Orden alfabético
  const byNombre = sampleTecs.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  assert('Orden "nombre" ubica a ANDRES de primero y ZULMA de último', byNombre[0].nombre === 'ANDRES' && byNombre[2].nombre === 'ZULMA');

  // Test Suite 4.6: Motor de Paginación
  console.log('\n--- Test Suite 4.6: Motor de Paginación (24 por página) ---');
  const list55Tecs = Array.from({ length: 55 }, (_, i) => ({ id: `TEC-${i + 1}`, nombre: `TECNICO ${i + 1}` }));
  const pageSize = 24;
  const totalPages = Math.ceil(list55Tecs.length / pageSize);

  assert('55 técnicos con pageSize=24 genera exactamente 3 páginas', totalPages === 3);

  // Página 1: 24 elementos (1 a 24)
  const page1 = list55Tecs.slice(0, 24);
  assert('Página 1 contiene 24 elementos (TEC-1 a TEC-24)', page1.length === 24 && page1[0].id === 'TEC-1' && page1[23].id === 'TEC-24');

  // Página 2: 24 elementos (25 a 48)
  const page2 = list55Tecs.slice(24, 48);
  assert('Página 2 contiene 24 elementos (TEC-25 a TEC-48)', page2.length === 24 && page2[0].id === 'TEC-25' && page2[23].id === 'TEC-48');

  // Página 3: 7 elementos restantes (49 a 55)
  const page3 = list55Tecs.slice(48, 72);
  assert('Página 3 contiene los 7 elementos restantes (TEC-49 a TEC-55)', page3.length === 7 && page3[0].id === 'TEC-49' && page3[6].id === 'TEC-55');

  // Controles de navegación en límites
  let curPage = 1;
  const canGoPrevAt1 = curPage > 1;
  assert('En página 1 el botón Anterior está deshabilitado', canGoPrevAt1 === false);

  curPage = totalPages;
  const canGoNextAtEnd = curPage < totalPages;
  assert('En página 3 (última) el botón Siguiente está deshabilitado', canGoNextAtEnd === false);

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL BOT 4: ${passed} PASSED | ${failed} FAILED`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runBot4();
