#!/usr/bin/env node

/**
 * ==============================================================================
 * BOT 1: VALIDADOR DE FUNCIONALIDAD GENERAL Y CASCADA DE FILTROS
 * ==============================================================================
 * Valida la lógica de filtrado de Asignación Operativa y Metas:
 *  - Filtrado por Proyecto, Zona y Municipio
 *  - Filtrado por Tipo de OS (Suspensión consolidada TO501/TO504/TO503/TO506, Reconexión TO502)
 *  - Filtrado por Estado de Asignación (Asignado vs No asignado)
 *  - Filtrado por Técnico específico
 *  - Cascada jerárquica de reducción de dataset
 *  - Función de reseteo "Limpiar filtros"
 * ==============================================================================
 */

import assert from 'node:assert/strict';

// Réplicas de funciones de filtrado de src/app/cierre_diario/page.tsx
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
  if (['TO501', 'TO504', 'TO503', 'TO506'].includes(t)) return 'Suspensión';
  if (t === 'TO502') return 'Reconexión';
  return 'Otro';
}

const MOCK_ORDENES = [
  { proyecto: 'AIR22200-100 SCRC ATLANTICO SUR', zona: 'SUR', municipio: 'GALAPA', barrio: 'MUNDO FELIZ', tipo_orden: 'TO501', asignacion_status: 'No asignado', tecnico: 'No asignado', cantidad: 50 },
  { proyecto: 'AIR22200-100 SCRC ATLANTICO SUR', zona: 'SUR', municipio: 'GALAPA', barrio: 'MUNDO FELIZ', tipo_orden: 'TO502', asignacion_status: 'Asignado', tecnico: 'CARLOS PEREZ', cantidad: 20 },
  { proyecto: 'AIR22200-100 SCRC ATLANTICO SUR', zona: 'SUR', municipio: 'BARANOA', barrio: 'CENTRO', tipo_orden: 'TO501', asignacion_status: 'No asignado', tecnico: 'No asignado', cantidad: 30 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'NORTE', municipio: 'BARRANQUILLA', barrio: 'EL BOSQUE', tipo_orden: 'TO501', asignacion_status: 'No asignado', tecnico: 'No asignado', cantidad: 100 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'NORTE', municipio: 'BARRANQUILLA', barrio: 'EL BOSQUE', tipo_orden: 'TO503', asignacion_status: 'No asignado', tecnico: 'No asignado', cantidad: 40 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'NORTE', municipio: 'BARRANQUILLA', barrio: 'EL BOSQUE', tipo_orden: 'TO501', asignacion_status: 'Asignado', tecnico: 'WILMER PERTUZ', cantidad: 60 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'CENTRO', municipio: 'BARRANQUILLA', barrio: 'CIUDADELA 20 DE JULIO', tipo_orden: 'TO502', asignacion_status: 'Asignado', tecnico: 'LUIS TORRENEGRA', cantidad: 80 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'CENTRO', municipio: 'SOLEDAD', barrio: 'METROPOLITANA', tipo_orden: 'TO504', asignacion_status: 'Asignado', tecnico: 'ALEXANDER LECHUGA', cantidad: 45 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'CENTRO', municipio: 'SOLEDAD', barrio: 'METROPOLITANA', tipo_orden: 'TO506', asignacion_status: 'No asignado', tecnico: 'No asignado', cantidad: 15 },
];

const MOCK_METAS = [
  { dia_operativo: '2026-09-22', proyecto: 'AIR22200-100 SCRC ATLANTICO SUR', zona: 'SUR', tipo_brigada: 'Pesada (SCR)', brigadas_activas: 5, metaTotal: 75, asignadas: 70, ejecutadas: 50, pctAsignado: 93.3 },
  { dia_operativo: '2026-09-22', proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'NORTE', tipo_brigada: 'Liviana', brigadas_activas: 4, metaTotal: 80, asignadas: 60, ejecutadas: 40, pctAsignado: 75.0 },
  { dia_operativo: '2026-09-22', proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'CENTRO', tipo_brigada: 'Canasta', brigadas_activas: 2, metaTotal: 30, asignadas: 15, ejecutadas: 10, pctAsignado: 50.0 },
];

function aplicarFiltrosOperativos(rows, f) {
  return rows.filter(r => {
    if (!proyCoincide(r.proyecto, f.proy)) return false;
    if (!zonaCoincide(r.zona, f.zona)) return false;
    if (f.municipio && f.municipio !== 'ALL' && (r.municipio || '').toUpperCase() !== f.municipio.toUpperCase()) return false;
    if (f.busqueda && f.busqueda.trim()) {
      const q = f.busqueda.toLowerCase().trim();
      const b = (r.barrio || '').toLowerCase();
      const m = (r.municipio || '').toLowerCase();
      if (!b.includes(q) && !m.includes(q)) return false;
    }
    if (f.tipoOS && f.tipoOS !== 'ALL') {
      if (f.tipoOS === 'SUSPENSION' && !['TO501', 'TO504', 'TO503', 'TO506'].includes(r.tipo_orden)) return false;
      if (f.tipoOS === 'RECONEXION' && r.tipo_orden !== 'TO502') return false;
      if (!['SUSPENSION', 'RECONEXION'].includes(f.tipoOS) && r.tipo_orden !== f.tipoOS) return false;
    }
    if (f.asignacion === 'ASIGNADO' && r.asignacion_status !== 'Asignado') return false;
    if (f.asignacion === 'NO_ASIGNADO' && r.asignacion_status !== 'No asignado') return false;
    if (f.tecnico && f.tecnico !== 'ALL' && r.tecnico !== f.tecnico) return false;
    return true;
  });
}

function aplicarFiltrosMetas(rows, f) {
  return rows.filter(m => {
    if (!proyCoincide(m.proyecto, f.proy)) return false;
    if (!zonaCoincide(m.zona, f.zona)) return false;
    if (f.metaZona && f.metaZona !== 'ALL' && m.zona.toUpperCase() !== f.metaZona.toUpperCase()) return false;
    if (f.metaBrigada && f.metaBrigada !== 'ALL') {
      const tb = (m.tipo_brigada || '').toUpperCase();
      if (f.metaBrigada === 'PESADA' && !tb.includes('PESADA')) return false;
      if (f.metaBrigada === 'LIVIANA' && !tb.includes('LIVIANA')) return false;
      if (f.metaBrigada === 'CANASTA' && (!tb.includes('CANASTA') || tb.includes('MINI'))) return false;
    }
    if (f.metaCumplimiento && f.metaCumplimiento !== 'ALL') {
      if (f.metaCumplimiento === 'ALTA' && m.pctAsignado < 90) return false;
      if (f.metaCumplimiento === 'MEDIA' && (m.pctAsignado < 70 || m.pctAsignado >= 90)) return false;
      if (f.metaCumplimiento === 'BAJA' && m.pctAsignado >= 70) return false;
    }
    return true;
  });
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
console.log('BOT 1: VALIDADOR DE FUNCIONALIDAD GENERAL Y CASCADA DE FILTROS');
console.log('================================================================');

console.log('\n--- Suite 1.1: Filtro Geografico y Proyecto ---');
test('Proyecto ALL incluye el 100% de los registros', () => {
  const r = aplicarFiltrosOperativos(MOCK_ORDENES, { proy: 'ALL' });
  assert.equal(r.length, 9);
});

test('Proyecto "Sur" solo retorna registros pertenecientes a la zona SUR', () => {
  const r = aplicarFiltrosOperativos(MOCK_ORDENES, { proy: 'Sur' });
  assert.equal(r.length, 3);
  r.forEach(x => assert.equal(x.zona, 'SUR'));
});

test('Proyecto "Norte-Centro" agrupa zonas NORTE y CENTRO', () => {
  const r = aplicarFiltrosOperativos(MOCK_ORDENES, { proy: 'Norte-Centro' });
  assert.equal(r.length, 6);
  r.forEach(x => assert.ok(['NORTE', 'CENTRO'].includes(x.zona)));
});

test('Filtro por Municipio "SOLEDAD" acota unicamente a ese municipio', () => {
  const r = aplicarFiltrosOperativos(MOCK_ORDENES, { municipio: 'SOLEDAD' });
  assert.equal(r.length, 2);
  r.forEach(x => assert.equal(x.municipio, 'SOLEDAD'));
});

console.log('\n--- Suite 1.2: Consolidacion y Filtro de Tipos de OS ---');
test('Filtro "SUSPENSION" consolida TO501, TO504, TO503 y TO506', () => {
  const r = aplicarFiltrosOperativos(MOCK_ORDENES, { tipoOS: 'SUSPENSION' });
  assert.equal(r.length, 7);
  r.forEach(x => assert.ok(['TO501', 'TO504', 'TO503', 'TO506'].includes(x.tipo_orden)));
});

test('Filtro individual TO503 retorna unicamente registros de esa OS', () => {
  const r = aplicarFiltrosOperativos(MOCK_ORDENES, { tipoOS: 'TO503' });
  assert.equal(r.length, 1);
  assert.equal(r[0].tipo_orden, 'TO503');
  assert.equal(r[0].cantidad, 40);
});

test('Filtro "RECONEXION" retorna unicamente TO502', () => {
  const r = aplicarFiltrosOperativos(MOCK_ORDENES, { tipoOS: 'RECONEXION' });
  assert.equal(r.length, 2);
  r.forEach(x => assert.equal(x.tipo_orden, 'TO502'));
});

console.log('\n--- Suite 1.3: Filtros de Asignacion y Tecnicos ---');
test('Filtro ASIGNADO retorna solo registros con asignacion_status "Asignado"', () => {
  const r = aplicarFiltrosOperativos(MOCK_ORDENES, { asignacion: 'ASIGNADO' });
  assert.equal(r.length, 4);
  r.forEach(x => assert.equal(x.asignacion_status, 'Asignado'));
});

test('Filtro por tecnico puntual retorna solo sus ordenes correspondientes', () => {
  const r = aplicarFiltrosOperativos(MOCK_ORDENES, { tecnico: 'LUIS TORRENEGRA' });
  assert.equal(r.length, 1);
  assert.equal(r[0].cantidad, 80);
});

console.log('\n--- Suite 1.4: Filtros de la Seccion de Metas ---');
test('Filtro de brigada PESADA selecciona la brigada pesada', () => {
  const r = aplicarFiltrosMetas(MOCK_METAS, { metaBrigada: 'PESADA' });
  assert.equal(r.length, 1);
  assert.equal(r[0].zona, 'SUR');
});

test('Filtro de cumplimiento ALTA (>= 90%) filtra correctamente', () => {
  const r = aplicarFiltrosMetas(MOCK_METAS, { metaCumplimiento: 'ALTA' });
  assert.equal(r.length, 1);
  assert.equal(r[0].pctAsignado, 93.3);
});

console.log('\n--- Suite 1.5: Reseteo de Filtros ("Limpiar filtros") ---');
test('Limpiar filtros restablece todos los parametros a ALL o vacio', () => {
  const state = {
    tipoOS: 'SUSPENSION',
    asignacion: 'ASIGNADO',
    tecnico: 'LUIS TORRENEGRA',
    municipio: 'BARRANQUILLA',
    busqueda: 'BOSQUE'
  };
  // Ejecucion de reseteo
  state.tipoOS = 'ALL';
  state.asignacion = 'ALL';
  state.tecnico = 'ALL';
  state.municipio = 'ALL';
  state.busqueda = '';

  const r = aplicarFiltrosOperativos(MOCK_ORDENES, state);
  assert.equal(r.length, 9);
});

console.log('\n--- Suite 1.6: Transición Directa entre Zonas (Sin salto involuntario a "ALL") ---');
test('Cambio directo de Centro a Norte conmuta a NORTE sin pasar por ALL', () => {
  let filtroZona = 'CENTRO';

  function onZonaClick(currentZona, nuevaZona, isCtrl = false) {
    if (nuevaZona === 'ALL') return 'ALL';
    if (isCtrl) {
      const list = currentZona === 'ALL' ? [] : currentZona.split(',');
      if (list.includes(nuevaZona)) {
        const next = list.filter(z => z !== nuevaZona);
        return next.length === 0 ? 'ALL' : next.join(',');
      }
      return [...list, nuevaZona].join(',');
    }
    return nuevaZona;
  }

  // Usuario pasa de CENTRO a NORTE con clic estándar
  filtroZona = onZonaClick(filtroZona, 'NORTE', false);
  assert.equal(filtroZona, 'NORTE', 'El filtro debe cambiar inmediatamente a NORTE');

  const r = aplicarFiltrosOperativos(MOCK_ORDENES, { proy: 'Norte-Centro', zona: filtroZona });
  assert.ok(r.every(row => row.zona === 'NORTE'), 'Todas las órdenes deben pertenecer a NORTE');
  assert.equal(r.length, 3);
});

console.log('----------------------------------------------------------------');
console.log(`TOTAL BOT 1: ${passed} PASSED | ${failed} FAILED`);
console.log('----------------------------------------------------------------');

if (failed > 0) process.exit(1);
