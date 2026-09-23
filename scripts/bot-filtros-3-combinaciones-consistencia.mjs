#!/usr/bin/env node

/**
 * ==============================================================================
 * BOT 3: VALIDADOR DE COMBINACIONES CRUZADAS Y CONSISTENCIA MATEMÁTICA
 * ==============================================================================
 * Valida que ante cualquier combinación de filtros (Proyecto, Zona individual,
 * más de 2 zonas juntas, Municipio, Tipo de OS, Asignación y Técnico):
 *  - La suma de Asignadas + Pendientes sea exactamente igual al Total de Gestión.
 *  - La suma de valores monetarios (Deuda $) sea exactamente igual al Total de Deuda.
 *  - La suma por Barrio coincida al 100% con los KPIs consolidados.
 *  - Los KPIs de las 2 cards principales (Asignadas y Pendientes) mantengan
 *    consistencia exacta con los tipos de OS (Suspensión y Reconexión).
 *  - Los porcentajes calculados se encuentren en rango válido [0%, 100%].
 * ==============================================================================
 */

import assert from 'node:assert/strict';

// Réplicas oficiales
function proyCoincide(rProy, filtro) {
  if (!filtro || filtro === 'ALL') return true;
  const p = (rProy || '').toUpperCase();
  if (filtro === 'Sur') return p.includes('SUR');
  if (filtro === 'Norte-Centro') return p.includes('NORTE') || p.includes('CENTRO');
  return p.includes(filtro.toUpperCase());
}

function zonaCoincide(rZona, filtro) {
  if (!filtro || filtro === 'ALL') return true;
  const r = (rZona || '').toUpperCase().trim();
  if (filtro.includes(',')) {
    const list = filtro.split(',').map(s => s.toUpperCase().trim()).filter(Boolean);
    return list.includes(r);
  }
  return r === filtro.toUpperCase().trim();
}

const DATA_ORDENES = [
  { proyecto: 'AIR22200-100 SCRC ATLANTICO SUR', zona: 'SUR', municipio: 'GALAPA', barrio: 'MUNDO FELIZ', tipo_orden: 'TO501', asignacion_status: 'No asignado', estado: 'DISPONIBLE', estado_legible: 'Pendiente', tecnico: 'No asignado', cantidad: 120, deuda_total: 3500000 },
  { proyecto: 'AIR22200-100 SCRC ATLANTICO SUR', zona: 'SUR', municipio: 'GALAPA', barrio: 'MUNDO FELIZ', tipo_orden: 'TO502', asignacion_status: 'Asignado', estado: 'ASIGNADA', estado_legible: 'Asignada', tecnico: 'CARLOS PEREZ', cantidad: 45, deuda_total: 1200000 },
  { proyecto: 'AIR22200-100 SCRC ATLANTICO SUR', zona: 'SUR', municipio: 'BARANOA', barrio: 'CENTRO', tipo_orden: 'TO501', asignacion_status: 'Asignado', estado: 'ASIGNADA', estado_legible: 'Asignada', tecnico: 'PEDRO GOMEZ', cantidad: 60, deuda_total: 1800000 },
  { proyecto: 'AIR22200-100 SCRC ATLANTICO SUR', zona: 'SUR', municipio: 'BARANOA', barrio: 'CENTRO', tipo_orden: 'TO504', asignacion_status: 'No asignado', estado: 'DISPONIBLE', estado_legible: 'Pendiente', tecnico: 'No asignado', cantidad: 35, deuda_total: 950000 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'NORTE', municipio: 'BARRANQUILLA', barrio: 'EL BOSQUE', tipo_orden: 'TO501', asignacion_status: 'No asignado', estado: 'DISPONIBLE', estado_legible: 'Pendiente', tecnico: 'No asignado', cantidad: 200, deuda_total: 5000000 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'NORTE', municipio: 'BARRANQUILLA', barrio: 'EL BOSQUE', tipo_orden: 'TO503', asignacion_status: 'No asignado', estado: 'DISPONIBLE', estado_legible: 'Pendiente', tecnico: 'No asignado', cantidad: 80, deuda_total: 2100000 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'NORTE', municipio: 'BARRANQUILLA', barrio: 'EL BOSQUE', tipo_orden: 'TO501', asignacion_status: 'Asignado', estado: 'ASIGNADA', estado_legible: 'Asignada', tecnico: 'WILMER PERTUZ', cantidad: 150, deuda_total: 4200000 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'CENTRO', municipio: 'BARRANQUILLA', barrio: 'CIUDADELA 20 DE JULIO', tipo_orden: 'TO502', asignacion_status: 'Asignado', estado: 'ASIGNADA', estado_legible: 'Asignada', tecnico: 'LUIS TORRENEGRA', cantidad: 110, deuda_total: 3100000 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'CENTRO', municipio: 'BARRANQUILLA', barrio: 'CIUDADELA 20 DE JULIO', tipo_orden: 'TO503', asignacion_status: 'No asignado', estado: 'DISPONIBLE', estado_legible: 'Pendiente', tecnico: 'No asignado', cantidad: 40, deuda_total: 1050000 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'CENTRO', municipio: 'SOLEDAD', barrio: 'METROPOLITANA', tipo_orden: 'TO504', asignacion_status: 'Asignado', estado: 'ASIGNADA', estado_legible: 'Asignada', tecnico: 'ALEXANDER LECHUGA', cantidad: 95, deuda_total: 2400000 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'CENTRO', municipio: 'SOLEDAD', barrio: 'METROPOLITANA', tipo_orden: 'TO506', asignacion_status: 'No asignado', estado: 'DISPONIBLE', estado_legible: 'Pendiente', tecnico: 'No asignado', cantidad: 25, deuda_total: 700000 },
];

function procesarDashboard(filtros) {
  // 1. Filtrado de órdenes agrupadas
  const filtradas = DATA_ORDENES.filter(r => {
    if (!proyCoincide(r.proyecto, filtros.proy)) return false;
    if (!zonaCoincide(r.zona, filtros.zona)) return false;
    if (filtros.municipio && filtros.municipio !== 'ALL' && (r.municipio || '').toUpperCase() !== filtros.municipio.toUpperCase()) return false;
    if (filtros.tipoOS && filtros.tipoOS !== 'ALL') {
      if (filtros.tipoOS === 'SUSPENSION' && !['TO501', 'TO504', 'TO503', 'TO506'].includes(r.tipo_orden)) return false;
      if (filtros.tipoOS === 'RECONEXION' && r.tipo_orden !== 'TO502') return false;
      if (!['SUSPENSION', 'RECONEXION'].includes(filtros.tipoOS) && r.tipo_orden !== filtros.tipoOS) return false;
    }
    if (filtros.asignacion === 'ASIGNADO' && r.asignacion_status !== 'Asignado') return false;
    if (filtros.asignacion === 'NO_ASIGNADO' && r.asignacion_status !== 'No asignado') return false;
    if (filtros.tecnico && filtros.tecnico !== 'ALL' && r.tecnico !== filtros.tecnico) return false;
    return true;
  });

  // 2. Ranking de Barrios
  const mapa = new Map();
  filtradas.forEach(r => {
    const key = `${r.barrio}__${r.municipio}`;
    let item = mapa.get(key);
    if (!item) {
      item = {
        barrio: r.barrio,
        municipio: r.municipio,
        total: 0,
        asignadas: 0,
        pendientes: 0,
        suspension: 0,
        reconexion: 0,
        deuda: 0,
      };
      mapa.set(key, item);
    }
    const c = r.cantidad || 0;
    const d = r.deuda_total || 0;
    item.total += c;
    item.deuda += d;
    if (r.asignacion_status === 'Asignado' || r.estado === 'ASIGNADA') item.asignadas += c;
    if (r.asignacion_status === 'No asignado' || r.estado === 'DISPONIBLE') item.pendientes += c;
    if (['TO501', 'TO504', 'TO503', 'TO506'].includes(r.tipo_orden)) item.suspension += c;
    else if (r.tipo_orden === 'TO502') item.reconexion += c;
  });

  const barrios = Array.from(mapa.values());

  // 3. KPIs Consolidados
  const total = barrios.reduce((s, b) => s + b.total, 0);
  const totalAsignadas = barrios.reduce((s, b) => s + b.asignadas, 0);
  const totalPendientes = barrios.reduce((s, b) => s + b.pendientes, 0);
  const totalSuspension = barrios.reduce((s, b) => s + b.suspension, 0);
  const totalReconexion = barrios.reduce((s, b) => s + b.reconexion, 0);
  const totalDeuda = barrios.reduce((s, b) => s + b.deuda, 0);
  const totalGestion = totalAsignadas + totalPendientes;
  const pctAsignacion = totalGestion > 0 ? (totalAsignadas / totalGestion) * 100 : 0;

  // 4. Cards KPIs
  let asigTotal = 0, asigSusp = 0, asigRec = 0, asigDeuda = 0;
  let pendTotal = 0, pendSusp = 0, pendRec = 0, pendDeuda = 0;

  filtradas.forEach(r => {
    const c = r.cantidad || 0;
    const d = r.deuda_total || 0;
    const isAsig = r.asignacion_status === 'Asignado';
    const isPend = r.asignacion_status === 'No asignado';
    const isSusp = ['TO501', 'TO504', 'TO503', 'TO506'].includes(r.tipo_orden);
    const isRec = r.tipo_orden === 'TO502';

    if (isAsig) {
      asigTotal += c;
      asigDeuda += d;
      if (isSusp) asigSusp += c;
      if (isRec) asigRec += c;
    }
    if (isPend) {
      pendTotal += c;
      pendDeuda += d;
      if (isSusp) pendSusp += c;
      if (isRec) pendRec += c;
    }
  });

  return {
    filtradas,
    barrios,
    kpis: {
      total,
      totalAsignadas,
      totalPendientes,
      totalSuspension,
      totalReconexion,
      totalDeuda,
      totalGestion,
      pctAsignacion,
    },
    cards: {
      asignadas: { total: asigTotal, suspension: asigSusp, reconexion: asigRec, deuda: asigDeuda },
      pendientes: { total: pendTotal, suspension: pendSusp, reconexion: pendRec, deuda: pendDeuda },
    },
  };
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

console.log('================================================================');
console.log('BOT 3: VALIDADOR DE COMBINACIONES CRUZADAS Y CONSISTENCIA MATEMÁTICA');
console.log('================================================================');

const COMBINACIONES_PRUEBA = [
  { desc: 'Sin filtros (Global)', f: { proy: 'ALL', zona: 'ALL', municipio: 'ALL', tipoOS: 'ALL', asignacion: 'ALL', tecnico: 'ALL' } },
  { desc: 'Proyecto Sur', f: { proy: 'Sur', zona: 'ALL', municipio: 'ALL', tipoOS: 'ALL', asignacion: 'ALL', tecnico: 'ALL' } },
  { desc: 'Proyecto Norte-Centro + Zona Norte', f: { proy: 'Norte-Centro', zona: 'NORTE', municipio: 'ALL', tipoOS: 'ALL', asignacion: 'ALL', tecnico: 'ALL' } },
  { desc: 'Proyecto Norte-Centro + Zona Centro + Municipio Soledad', f: { proy: 'Norte-Centro', zona: 'CENTRO', municipio: 'SOLEDAD', tipoOS: 'ALL', asignacion: 'ALL', tecnico: 'ALL' } },
  { desc: 'Más de 2 Zonas Juntas (SUR, NORTE, CENTRO)', f: { proy: 'ALL', zona: 'SUR,NORTE,CENTRO', municipio: 'ALL', tipoOS: 'ALL', asignacion: 'ALL', tecnico: 'ALL' } },
  { desc: '2 Zonas Juntas (NORTE, CENTRO)', f: { proy: 'ALL', zona: 'NORTE,CENTRO', municipio: 'ALL', tipoOS: 'ALL', asignacion: 'ALL', tecnico: 'ALL' } },
  { desc: '2 Zonas Juntas (SUR, CENTRO)', f: { proy: 'ALL', zona: 'SUR,CENTRO', municipio: 'ALL', tipoOS: 'ALL', asignacion: 'ALL', tecnico: 'ALL' } },
  { desc: 'Tipo OS Suspensión (Consolidada)', f: { proy: 'ALL', zona: 'ALL', municipio: 'ALL', tipoOS: 'SUSPENSION', asignacion: 'ALL', tecnico: 'ALL' } },
  { desc: 'Tipo OS Reconexión (TO502)', f: { proy: 'ALL', zona: 'ALL', municipio: 'ALL', tipoOS: 'RECONEXION', asignacion: 'ALL', tecnico: 'ALL' } },
  { desc: 'Solo Asignadas con Técnico', f: { proy: 'ALL', zona: 'ALL', municipio: 'ALL', tipoOS: 'ALL', asignacion: 'ASIGNADO', tecnico: 'ALL' } },
  { desc: 'Solo Pendientes sin Técnico', f: { proy: 'ALL', zona: 'ALL', municipio: 'ALL', tipoOS: 'ALL', asignacion: 'NO_ASIGNADO', tecnico: 'ALL' } },
  { desc: 'Técnico ALEXANDER LECHUGA', f: { proy: 'ALL', zona: 'ALL', municipio: 'ALL', tipoOS: 'ALL', asignacion: 'ALL', tecnico: 'ALEXANDER LECHUGA' } },
  { desc: 'Técnico WILMER PERTUZ + Suspensión', f: { proy: 'ALL', zona: 'ALL', municipio: 'ALL', tipoOS: 'SUSPENSION', asignacion: 'ALL', tecnico: 'WILMER PERTUZ' } },
];

console.log('\n--- 3.1: Invariante Matemático en Todas las Combinaciones ---');
COMBINACIONES_PRUEBA.forEach(({ desc, f }) => {
  test(`Invariante: Asignadas + Pendientes == Total en "${desc}"`, () => {
    const res = procesarDashboard(f);
    assert.equal(res.kpis.totalAsignadas + res.kpis.totalPendientes, res.kpis.totalGestion);
    assert.equal(res.cards.asignadas.total, res.kpis.totalAsignadas);
    assert.equal(res.cards.pendientes.total, res.kpis.totalPendientes);
    assert.equal(res.cards.asignadas.total + res.cards.pendientes.total, res.kpis.total);
  });
});

console.log('\n--- 3.2: Consistencia entre Cards y Desglose por OS ---');
COMBINACIONES_PRUEBA.forEach(({ desc, f }) => {
  test(`Desglose OS coincide entre Cards y KPIs en "${desc}"`, () => {
    const res = procesarDashboard(f);
    const sumaSusp = res.cards.asignadas.suspension + res.cards.pendientes.suspension;
    const sumaRec = res.cards.asignadas.reconexion + res.cards.pendientes.reconexion;

    assert.equal(sumaSusp, res.kpis.totalSuspension, 'Suma de Suspensión no coincide');
    assert.equal(sumaRec, res.kpis.totalReconexion, 'Suma de Reconexión no coincide');
  });
});

console.log('\n--- 3.3: Integridad de Porcentajes ---');
COMBINACIONES_PRUEBA.forEach(({ desc, f }) => {
  test(`Porcentaje en rango válido [0, 100] en "${desc}"`, () => {
    const res = procesarDashboard(f);
    assert.ok(res.kpis.pctAsignacion >= 0 && res.kpis.pctAsignacion <= 100);
    assert.ok(!isNaN(res.kpis.pctAsignacion), 'Porcentaje no debe ser NaN');
  });
});

console.log('\n--- 3.4: Consistencia de Valores Financieros ($ COP / Deuda) en Multi-Zona ---');
COMBINACIONES_PRUEBA.forEach(({ desc, f }) => {
  test(`Consistencia de Valores: Deuda Asignada + Deuda Pendiente == Deuda Total en "${desc}"`, () => {
    const res = procesarDashboard(f);
    assert.equal(res.cards.asignadas.deuda + res.cards.pendientes.deuda, res.kpis.totalDeuda);
  });
});

console.log('----------------------------------------------------------------');
console.log(`TOTAL BOT 3: ${passed} PASSED | ${failed} FAILED`);
console.log('----------------------------------------------------------------');

if (failed > 0) process.exit(1);
