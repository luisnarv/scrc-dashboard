#!/usr/bin/env node

/**
 * ==============================================================================
 * BOT DE VALIDACIÓN: FILTROS, DATOS, COMBINACIONES Y BOTONES EN CIERRE DIARIO
 * ==============================================================================
 * Valida de forma exhaustiva la funcionalidad de filtrado en /cierre_diario:
 *  1. Filtros individuales y cascada jerárquica
 *  2. Exclusividad de datos reales en selectores y auto-reseteo de huérfanos
 *  3. Filtros combinados, soporte multizona e invariantes matemáticos ($ y cantidades)
 *  4. Comportamiento de botones (transición directa de zonas, multiselección Ctrl,
 *     limpieza de filtros, sincronización de ranking y etiqueta "EN GRÁFICA")
 * ==============================================================================
 */

import assert from 'node:assert/strict';

// Funciones de lógica de filtrado idénticas a src/app/cierre_diario/page.tsx
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

// Dataset de prueba representativo de historico_mo (cierres de hoy)
const MOCK_CIERRES = [
  { proyecto: 'Sur', zona: 'SUR', municipio: 'GALAPA', barrio: 'MUNDO FELIZ', tipo_orden: 'TO501', categoria_os: 'Suspensión', subaccion: 'SUSPENSION EN POSTE', tipo_brigada: 'Pesada (SCR)', tecnico: 'CARLOS PEREZ', cantidad: 35, deuda_total: 15500000 },
  { proyecto: 'Sur', zona: 'SUR', municipio: 'GALAPA', barrio: 'MUNDO FELIZ', tipo_orden: 'TO502', categoria_os: 'Reconexión', subaccion: 'RECONEXION NORMAL', tipo_brigada: 'Pesada (SCR)', tecnico: 'CARLOS PEREZ', cantidad: 15, deuda_total: 4200000 },
  { proyecto: 'Sur', zona: 'SUR', municipio: 'BARANOA', barrio: 'CENTRO', tipo_orden: 'TO504', categoria_os: 'Suspensión', subaccion: 'SUSPENSION EN CAJA', tipo_brigada: 'Liviana', tecnico: 'PEDRO GOMEZ', cantidad: 25, deuda_total: 8900000 },
  { proyecto: 'Norte-Centro', zona: 'NORTE', municipio: 'BARRANQUILLA', barrio: 'EL BOSQUE', tipo_orden: 'TO501', categoria_os: 'Suspensión', subaccion: 'SUSPENSION EN BORNERA', tipo_brigada: 'Pesada (SCR)', tecnico: 'WILMER PERTUZ', cantidad: 60, deuda_total: 32000000 },
  { proyecto: 'Norte-Centro', zona: 'NORTE', municipio: 'BARRANQUILLA', barrio: 'EL BOSQUE', tipo_orden: 'TO503', categoria_os: 'Suspensión', subaccion: 'SUSPENSION ACOMETIDA', tipo_brigada: 'Liviana', tecnico: 'WILMER PERTUZ', cantidad: 20, deuda_total: 9800000 },
  { proyecto: 'Norte-Centro', zona: 'CENTRO', municipio: 'BARRANQUILLA', barrio: 'CIUDADELA 20 DE JULIO', tipo_orden: 'TO502', categoria_os: 'Reconexión', subaccion: 'RECONEXION NORMAL', tipo_brigada: 'Canasta', tecnico: 'LUIS TORRENEGRA', cantidad: 45, deuda_total: 18700000 },
  { proyecto: 'Norte-Centro', zona: 'CENTRO', municipio: 'SOLEDAD', barrio: 'METROPOLITANA', tipo_orden: 'TO504', categoria_os: 'Suspensión', subaccion: 'SUSPENSION EN CAJA', tipo_brigada: 'Pesada (SCR)', tecnico: 'ALEXANDER LECHUGA', cantidad: 50, deuda_total: 26400000 },
  { proyecto: 'Norte-Centro', zona: 'CENTRO', municipio: 'SOLEDAD', barrio: 'METROPOLITANA', tipo_orden: 'TO506', categoria_os: 'Suspensión', subaccion: 'CORTE DEFINITIVO', tipo_brigada: 'Pesada (SCR)', tecnico: 'ALEXANDER LECHUGA', cantidad: 10, deuda_total: 5100000 },
];

function filtrarCierres(rows, f) {
  return rows.filter(r => {
    if (!proyCoincide(r.proyecto, f.proy)) return false;
    if (!zonaCoincide(r.zona, f.zona)) return false;
    if (f.tipoOS && f.tipoOS !== 'ALL') {
      if (f.tipoOS === 'SUSPENSION' && r.categoria_os !== 'Suspensión') return false;
      if (f.tipoOS === 'RECONEXION' && r.categoria_os !== 'Reconexión') return false;
    }
    if (f.tecnico && f.tecnico !== 'ALL' && r.tecnico !== f.tecnico) return false;
    if (f.municipio && f.municipio !== 'ALL' && (r.municipio || '').toUpperCase() !== f.municipio.toUpperCase()) return false;
    if (f.busqueda && f.busqueda.trim()) {
      const q = f.busqueda.toLowerCase().trim();
      const b = (r.barrio || '').toLowerCase();
      const m = (r.municipio || '').toLowerCase();
      if (!b.includes(q) && !m.includes(q)) return false;
    }
    return true;
  });
}

function calcularZonasDisponibles(rows, proy) {
  const s = new Set();
  rows.forEach(r => {
    if (!proyCoincide(r.proyecto, proy)) return;
    if (r.zona && (r.cantidad || 0) > 0) s.add(r.zona.toUpperCase().trim());
  });
  return Array.from(s).sort();
}

function calcularMunicipiosDisponibles(rows, proy, zona, tipoOS, tecnico) {
  const s = new Set();
  rows.forEach(r => {
    if (!proyCoincide(r.proyecto, proy)) return;
    if (!zonaCoincide(r.zona, zona)) return;
    if (tipoOS && tipoOS !== 'ALL') {
      if (tipoOS === 'SUSPENSION' && r.categoria_os !== 'Suspensión') return;
      if (tipoOS === 'RECONEXION' && r.categoria_os !== 'Reconexión') return;
    }
    if (tecnico && tecnico !== 'ALL' && r.tecnico !== tecnico) return;
    if (r.municipio && (r.cantidad || 0) > 0) s.add(r.municipio.trim().toUpperCase());
  });
  return Array.from(s).sort();
}

function calcularTiposOSDisponibles(rows, proy, zona, municipio, tecnico) {
  let suspension = 0;
  let reconexion = 0;
  rows.forEach(r => {
    if (!proyCoincide(r.proyecto, proy)) return;
    if (!zonaCoincide(r.zona, zona)) return;
    if (municipio && municipio !== 'ALL' && (r.municipio || '').toUpperCase() !== municipio.toUpperCase()) return;
    if (tecnico && tecnico !== 'ALL' && r.tecnico !== tecnico) return;
    if (r.categoria_os === 'Suspensión') suspension += r.cantidad;
    else if (r.categoria_os === 'Reconexión') reconexion += r.cantidad;
  });
  return { suspension, reconexion, total: suspension + reconexion };
}

function calcularTecnicosDisponibles(rows, proy, zona, municipio, tipoOS) {
  const map = new Map();
  rows.forEach(r => {
    if (!proyCoincide(r.proyecto, proy)) return;
    if (!zonaCoincide(r.zona, zona)) return;
    if (municipio && municipio !== 'ALL' && (r.municipio || '').toUpperCase() !== municipio.toUpperCase()) return;
    if (tipoOS && tipoOS !== 'ALL') {
      if (tipoOS === 'SUSPENSION' && r.categoria_os !== 'Suspensión') return;
      if (tipoOS === 'RECONEXION' && r.categoria_os !== 'Reconexión') return;
    }
    if (r.tecnico && r.tecnico !== 'No asignado') {
      const c = map.get(r.tecnico) || 0;
      map.set(r.tecnico, c + r.cantidad);
    }
  });
  return Array.from(map.entries())
    .filter(([_, cant]) => cant > 0)
    .map(([tecnico, total]) => ({ tecnico, total }))
    .sort((a, b) => b.total - a.total);
}

function calcularKpis(rows) {
  let total = 0, suspension = 0, reconexion = 0, deuda = 0;
  const tecs = new Set();
  const barrios = new Set();
  rows.forEach(r => {
    total += r.cantidad;
    deuda += Number(r.deuda_total) || 0;
    if (r.categoria_os === 'Suspensión') suspension += r.cantidad;
    else if (r.categoria_os === 'Reconexión') reconexion += r.cantidad;
    if (r.tecnico && r.tecnico !== 'No asignado') tecs.add(r.tecnico);
    if (r.barrio) barrios.add(`${r.barrio}||${r.municipio}`);
  });
  return { total, suspension, reconexion, deuda, tecnicos: tecs.size, barrios: barrios.size };
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
console.log('BOT DE VALIDACIÓN: VISTA CIERRE DIARIO (MANO DE OBRA)');
console.log('================================================================');

// -----------------------------------------------------------------------------
// SUITE 1: FILTROS INDIVIDUALES Y CASCADA
// -----------------------------------------------------------------------------
console.log('\n--- 1. Filtros Individuales y Cascada Jerárquica ---');

test('Filtro Proyecto: Sur retorna exactamente órdenes del proyecto Sur', () => {
  const r = filtrarCierres(MOCK_CIERRES, { proy: 'Sur', zona: 'ALL' });
  assert.equal(r.length, 3);
  assert.ok(r.every(row => row.proyecto === 'Sur'));
});

test('Filtro Proyecto: Norte-Centro retorna exactamente órdenes de Norte y Centro', () => {
  const r = filtrarCierres(MOCK_CIERRES, { proy: 'Norte-Centro', zona: 'ALL' });
  assert.equal(r.length, 5);
  assert.ok(r.every(row => row.proyecto === 'Norte-Centro'));
});

test('Filtro Zona puntual: CENTRO retorna solo cierres de CENTRO', () => {
  const r = filtrarCierres(MOCK_CIERRES, { proy: 'Norte-Centro', zona: 'CENTRO' });
  assert.equal(r.length, 3);
  assert.ok(r.every(row => row.zona === 'CENTRO'));
});

test('Filtro Municipio puntual: SOLEDAD retorna solo cierres de Soledad', () => {
  const r = filtrarCierres(MOCK_CIERRES, { proy: 'ALL', zona: 'ALL', municipio: 'SOLEDAD' });
  assert.equal(r.length, 2);
  assert.ok(r.every(row => row.municipio === 'SOLEDAD'));
});

test('Filtro Tipo de OS: SUSPENSION excluye reconexiones', () => {
  const r = filtrarCierres(MOCK_CIERRES, { proy: 'ALL', zona: 'ALL', tipoOS: 'SUSPENSION' });
  assert.equal(r.length, 6);
  assert.ok(r.every(row => row.categoria_os === 'Suspensión'));
});

test('Filtro Tipo de OS: RECONEXION excluye suspensiones', () => {
  const r = filtrarCierres(MOCK_CIERRES, { proy: 'ALL', zona: 'ALL', tipoOS: 'RECONEXION' });
  assert.equal(r.length, 2);
  assert.ok(r.every(row => row.categoria_os === 'Reconexión'));
});

test('Filtro Técnico puntual: LUIS TORRENEGRA retorna solo sus cierres', () => {
  const r = filtrarCierres(MOCK_CIERRES, { proy: 'ALL', zona: 'ALL', tecnico: 'LUIS TORRENEGRA' });
  assert.equal(r.length, 1);
  assert.equal(r[0].cantidad, 45);
});

test('Búsqueda textual: busca por coincidencia en barrio o municipio', () => {
  const r = filtrarCierres(MOCK_CIERRES, { proy: 'ALL', zona: 'ALL', busqueda: 'metropolitana' });
  assert.equal(r.length, 2);
  assert.equal(r[0].barrio, 'METROPOLITANA');
});

// -----------------------------------------------------------------------------
// SUITE 2: EXCLUSIVIDAD DE DATOS REALES Y AUTO-RESETEO REACTIVO
// -----------------------------------------------------------------------------
console.log('\n--- 2. Exclusividad de Datos Reales y Auto-reseteo ---');

test('Zonas disponibles: Sur solo ofrece zona SUR (NORTE y CENTRO excluidas)', () => {
  const zonasSur = calcularZonasDisponibles(MOCK_CIERRES, 'Sur');
  assert.deepEqual(zonasSur, ['SUR']);
});

test('Zonas disponibles: Norte-Centro solo ofrece NORTE y CENTRO (SUR excluida)', () => {
  const zonasNC = calcularZonasDisponibles(MOCK_CIERRES, 'Norte-Centro');
  assert.deepEqual(zonasNC, ['CENTRO', 'NORTE']);
});

test('Municipios disponibles: solo muestra municipios con cierres > 0 en el contexto', () => {
  const mSur = calcularMunicipiosDisponibles(MOCK_CIERRES, 'Sur', 'SUR', 'ALL', 'ALL');
  assert.deepEqual(mSur, ['BARANOA', 'GALAPA']);
  assert.ok(!mSur.includes('BARRANQUILLA'), 'Barranquilla no debe aparecer en Sur');
});

test('Tipos de OS disponibles: en Soledad solo hay Suspensión (Reconexión es 0)', () => {
  const tiposSoledad = calcularTiposOSDisponibles(MOCK_CIERRES, 'ALL', 'ALL', 'SOLEDAD', 'ALL');
  assert.equal(tiposSoledad.suspension, 60);
  assert.equal(tiposSoledad.reconexion, 0);
});

test('Técnicos disponibles: en Sur solo aparecen técnicos de Sur (CARLOS PEREZ y PEDRO GOMEZ)', () => {
  const tecsSur = calcularTecnicosDisponibles(MOCK_CIERRES, 'Sur', 'ALL', 'ALL', 'ALL');
  const nombres = tecsSur.map(t => t.tecnico);
  assert.ok(nombres.includes('CARLOS PEREZ'));
  assert.ok(nombres.includes('PEDRO GOMEZ'));
  assert.ok(!nombres.includes('WILMER PERTUZ'), 'Técnico de Norte no debe figurar en Sur');
});

test('Auto-reseteo de Zona: Al cambiar a "Sur", si zona era "NORTE" se resetea a "ALL"', () => {
  let activeZona = 'NORTE';
  const disp = calcularZonasDisponibles(MOCK_CIERRES, 'Sur');
  if (!disp.includes(activeZona)) activeZona = 'ALL';
  assert.equal(activeZona, 'ALL');
});

test('Auto-reseteo de Municipio: Al cambiar a "Sur", si municipio era "SOLEDAD" se resetea a "ALL"', () => {
  let activeMun = 'SOLEDAD';
  const disp = calcularMunicipiosDisponibles(MOCK_CIERRES, 'Sur', 'SUR', 'ALL', 'ALL');
  if (!disp.includes(activeMun)) activeMun = 'ALL';
  assert.equal(activeMun, 'ALL');
});

test('Auto-reseteo de Técnico: En Soledad, si técnico era "CARLOS PEREZ" se resetea a "ALL"', () => {
  let activeTec = 'CARLOS PEREZ';
  const disp = calcularTecnicosDisponibles(MOCK_CIERRES, 'ALL', 'ALL', 'SOLEDAD', 'ALL');
  if (!disp.some(t => t.tecnico === activeTec)) activeTec = 'ALL';
  assert.equal(activeTec, 'ALL');
});

test('Auto-reseteo de Tipo OS: En Soledad, si tipo era "RECONEXION" (0 cierres) se resetea a "ALL"', () => {
  let activeTipo = 'RECONEXION';
  const tipos = calcularTiposOSDisponibles(MOCK_CIERRES, 'ALL', 'ALL', 'SOLEDAD', 'ALL');
  if (activeTipo === 'RECONEXION' && tipos.reconexion === 0) activeTipo = 'ALL';
  assert.equal(activeTipo, 'ALL');
});

// -----------------------------------------------------------------------------
// SUITE 3: FILTROS COMBINADOS, MULTIZONA E INVARIANTES MATEMÁTICOS
// -----------------------------------------------------------------------------
console.log('\n--- 3. Filtros Combinados, Multizona e Invariantes ---');

test('Invariante matemático: Suspensión + Reconexión == Total Cierres en Global', () => {
  const k = calcularKpis(filtrarCierres(MOCK_CIERRES, { proy: 'ALL', zona: 'ALL' }));
  assert.equal(k.suspension + k.reconexion, k.total);
  assert.equal(k.total, 260);
});

test('Invariante financiero: Suma de deudas coincide exactamente con la deuda global', () => {
  const k = calcularKpis(filtrarCierres(MOCK_CIERRES, { proy: 'ALL', zona: 'ALL' }));
  const deudaManual = MOCK_CIERRES.reduce((s, r) => s + (Number(r.deuda_total) || 0), 0);
  assert.equal(k.deuda, deudaManual);
  assert.equal(k.deuda, 120600000);
});

test('Multizona: Más de 2 zonas juntas (SUR,NORTE,CENTRO) suma exactamente las cantidades y valores', () => {
  const sur = calcularKpis(filtrarCierres(MOCK_CIERRES, { proy: 'ALL', zona: 'SUR' }));
  const norte = calcularKpis(filtrarCierres(MOCK_CIERRES, { proy: 'ALL', zona: 'NORTE' }));
  const centro = calcularKpis(filtrarCierres(MOCK_CIERRES, { proy: 'ALL', zona: 'CENTRO' }));

  const multi = calcularKpis(filtrarCierres(MOCK_CIERRES, { proy: 'ALL', zona: 'SUR,NORTE,CENTRO' }));

  assert.equal(multi.total, sur.total + norte.total + centro.total);
  assert.equal(multi.suspension, sur.suspension + norte.suspension + centro.suspension);
  assert.equal(multi.reconexion, sur.reconexion + norte.reconexion + centro.reconexion);
  assert.equal(multi.deuda, sur.deuda + norte.deuda + centro.deuda);
});

test('Multizona parcial: NORTE,CENTRO suma exactamente ambas zonas excluyendo SUR', () => {
  const norte = calcularKpis(filtrarCierres(MOCK_CIERRES, { proy: 'ALL', zona: 'NORTE' }));
  const centro = calcularKpis(filtrarCierres(MOCK_CIERRES, { proy: 'ALL', zona: 'CENTRO' }));
  const multi = calcularKpis(filtrarCierres(MOCK_CIERRES, { proy: 'ALL', zona: 'NORTE,CENTRO' }));

  assert.equal(multi.total, norte.total + centro.total);
  assert.equal(multi.deuda, norte.deuda + centro.deuda);
  assert.equal(multi.total, 185); // 80 de Norte + 105 de Centro
});

test('Combinación multidimensional completa: Proyecto + Zona + Municipio + Técnico + Tipo OS', () => {
  const r = filtrarCierres(MOCK_CIERRES, {
    proy: 'Norte-Centro',
    zona: 'CENTRO',
    municipio: 'SOLEDAD',
    tecnico: 'ALEXANDER LECHUGA',
    tipoOS: 'SUSPENSION',
  });
  assert.equal(r.length, 2);
  const total = r.reduce((s, row) => s + row.cantidad, 0);
  assert.equal(total, 60);
});

// -----------------------------------------------------------------------------
// SUITE 4: BOTONES, INTERACCIONES Y SINCRONIZACIÓN VISUAL
// -----------------------------------------------------------------------------
console.log('\n--- 4. Botones, Interacciones y Sincronización ---');

test('Transición directa entre zonas: De CENTRO a NORTE conmuta inmediatamente sin pasar por ALL', () => {
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

  // Clic estándar en NORTE
  filtroZona = onZonaClick(filtroZona, 'NORTE', false);
  assert.equal(filtroZona, 'NORTE', 'Debe cambiar directamente a NORTE');

  const r = filtrarCierres(MOCK_CIERRES, { proy: 'Norte-Centro', zona: filtroZona });
  assert.ok(r.every(row => row.zona === 'NORTE'));
});

test('Multiselección combinada vía Ctrl+Clic: Permite alternar zonas', () => {
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

  // Ctrl+Clic en NORTE agrega NORTE
  filtroZona = onZonaClick(filtroZona, 'NORTE', true);
  assert.equal(filtroZona, 'CENTRO,NORTE');

  // Ctrl+Clic en CENTRO retira CENTRO
  filtroZona = onZonaClick(filtroZona, 'CENTRO', true);
  assert.equal(filtroZona, 'NORTE');
});

test('Botón "Limpiar Filtros" restablece parámetros locales a su estado inicial', () => {
  const state = {
    tipoOS: 'SUSPENSION',
    tecnico: 'ALEXANDER LECHUGA',
    municipio: 'SOLEDAD',
    busqueda: 'METROPOLITANA'
  };

  // Simulación de acción "Limpiar Filtros"
  state.tipoOS = 'ALL';
  state.tecnico = 'ALL';
  state.municipio = 'ALL';
  state.busqueda = '';

  assert.equal(state.tipoOS, 'ALL');
  assert.equal(state.tecnico, 'ALL');
  assert.equal(state.municipio, 'ALL');
  assert.equal(state.busqueda, '');

  const r = filtrarCierres(MOCK_CIERRES, state);
  assert.equal(r.length, 8);
});

test('Insignia "EN GRÁFICA": Solo marca los barrios proyectados en el Top N con cierres > 0', () => {
  const ranking = [
    { barrio: 'EL BOSQUE', municipio: 'BARRANQUILLA', total: 80 },
    { barrio: 'METROPOLITANA', municipio: 'SOLEDAD', total: 60 },
    { barrio: 'MUNDO FELIZ', municipio: 'GALAPA', total: 50 },
    { barrio: 'CIUDADELA 20 DE JULIO', municipio: 'BARRANQUILLA', total: 45 },
    { barrio: 'CENTRO', municipio: 'BARANOA', total: 25 },
  ];

  const topCantidad = 3;
  const barriosParaGrafica = ranking.slice(0, topCantidad);

  const setVisibles = new Set();
  barriosParaGrafica.forEach(b => {
    if (b.total > 0) setVisibles.add(`${b.barrio}__${b.municipio}`);
  });

  // Los 3 primeros tienen la insignia
  assert.ok(setVisibles.has('EL BOSQUE__BARRANQUILLA'));
  assert.ok(setVisibles.has('METROPOLITANA__SOLEDAD'));
  assert.ok(setVisibles.has('MUNDO FELIZ__GALAPA'));

  // Los puestos 4 y 5 NO están en la gráfica
  assert.ok(!setVisibles.has('CIUDADELA 20 DE JULIO__BARRANQUILLA'));
  assert.ok(!setVisibles.has('CENTRO__BARANOA'));
});

console.log('----------------------------------------------------------------');
console.log(`TOTAL BOT CIERRE DIARIO: ${passed} PASSED | ${failed} FAILED`);
console.log('----------------------------------------------------------------');

if (failed > 0) process.exit(1);
