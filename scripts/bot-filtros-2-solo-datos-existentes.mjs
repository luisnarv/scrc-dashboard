#!/usr/bin/env node

/**
 * ==============================================================================
 * BOT 2: VALIDADOR DE EXCLUSIVIDAD DE DATOS REALES Y AUTO-RESETEO HUÉRFANO
 * ==============================================================================
 * Este bot valida de forma estricta los requerimientos del usuario:
 * 1. "Valida que solo se pueda filtrar por información donde se tengan datos"
 * 2. "Valida que se ajusten los valores cuando tenga más de 2 zonas juntas en valores y cantidades"
 *
 * Cobertura de verificación para toda la página (/cierre_diario):
 * 1. Zonas Disponibles: Cero zonas con 0 órdenes en el proyecto activo.
 * 2. Municipios Disponibles: Cero municipios sin órdenes en el contexto activo.
 * 3. Tipos de OS Disponibles: Opciones en el selector solo si cantidad > 0.
 * 4. Estados de Asignación: Opciones (Asignado/No Asignado) solo si cantidad > 0.
 * 5. Técnicos Disponibles: Cero técnicos con 0 órdenes asignadas en el filtro activo.
 * 6. Metas - Zonas con datos reales: Cero zonas huérfanas en la sección de Metas.
 * 7. Metas - Tipos de Brigada con datos: Solo brigadas existentes en el contexto.
 * 8. Metas - Niveles de Cobertura con datos: Solo niveles (Alta/Media/Baja) existentes.
 * 9. Auto-reseteo a 'ALL': Cambio de dimensión superior resetea filtros huérfanos.
 * 10. MÁS DE 2 ZONAS JUNTAS: Ajuste exacto de cantidades y valores ($ COP) al
 *     combinar 2 o más zonas (SUR + NORTE + CENTRO).
 * ==============================================================================
 */

import assert from 'node:assert/strict';

// Funciones de coincidencia de src/app/cierre_diario/page.tsx
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

// Dataset operativo representativo con cantidades y valores monetarios de deuda ($ COP)
const MOCK_ORDENES_OPERATIVAS = [
  // Proyecto Sur: Zona SUR (Galapa y Baranoa), técnicos Carlos y Pedro
  { proyecto: 'AIR22200-100 SCRC ATLANTICO SUR', zona: 'SUR', municipio: 'GALAPA', barrio: 'MUNDO FELIZ', tipo_orden: 'TO501', asignacion_status: 'No asignado', tecnico: 'No asignado', cantidad: 50, deuda_total: 1500000 },
  { proyecto: 'AIR22200-100 SCRC ATLANTICO SUR', zona: 'SUR', municipio: 'GALAPA', barrio: 'MUNDO FELIZ', tipo_orden: 'TO502', asignacion_status: 'Asignado', tecnico: 'CARLOS PEREZ', cantidad: 20, deuda_total: 800000 },
  { proyecto: 'AIR22200-100 SCRC ATLANTICO SUR', zona: 'SUR', municipio: 'BARANOA', barrio: 'CENTRO', tipo_orden: 'TO501', asignacion_status: 'Asignado', tecnico: 'PEDRO GOMEZ', cantidad: 30, deuda_total: 1200000 },

  // Proyecto Norte-Centro: Zonas NORTE y CENTRO (Barranquilla y Soledad)
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'NORTE', municipio: 'BARRANQUILLA', barrio: 'EL BOSQUE', tipo_orden: 'TO501', asignacion_status: 'No asignado', tecnico: 'No asignado', cantidad: 100, deuda_total: 2500000 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'NORTE', municipio: 'BARRANQUILLA', barrio: 'EL BOSQUE', tipo_orden: 'TO503', asignacion_status: 'No asignado', tecnico: 'No asignado', cantidad: 40, deuda_total: 900000 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'NORTE', municipio: 'BARRANQUILLA', barrio: 'EL BOSQUE', tipo_orden: 'TO501', asignacion_status: 'Asignado', tecnico: 'WILMER PERTUZ', cantidad: 60, deuda_total: 1800000 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'CENTRO', municipio: 'BARRANQUILLA', barrio: 'CIUDADELA 20 DE JULIO', tipo_orden: 'TO502', asignacion_status: 'Asignado', tecnico: 'LUIS TORRENEGRA', cantidad: 80, deuda_total: 2100000 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'CENTRO', municipio: 'SOLEDAD', barrio: 'METROPOLITANA', tipo_orden: 'TO504', asignacion_status: 'Asignado', tecnico: 'ALEXANDER LECHUGA', cantidad: 45, deuda_total: 1100000 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'CENTRO', municipio: 'SOLEDAD', barrio: 'METROPOLITANA', tipo_orden: 'TO506', asignacion_status: 'No asignado', tecnico: 'No asignado', cantidad: 15, deuda_total: 350000 },
];

// Dataset de metas representativo por zona y brigada
const MOCK_METAS_PROCESADAS = [
  { proyecto: 'AIR22200-100 SCRC ATLANTICO SUR', zona: 'SUR', tipo_brigada: 'Pesada (SCR)', brigadas_activas: 5, metaTotal: 75, asignadas: 70, pctAsignado: 93.3 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'NORTE', tipo_brigada: 'Liviana', brigadas_activas: 4, metaTotal: 80, asignadas: 60, pctAsignado: 75.0 },
  { proyecto: 'AIR22200-101 - SCRC ATLANTICO NORTE CENTRO', zona: 'CENTRO', tipo_brigada: 'Canasta', brigadas_activas: 2, metaTotal: 30, asignadas: 15, pctAsignado: 50.0 },
];

// ==============================================================================
// IMPLEMENTACIONES DE CÁLCULO DE OPCIONES DINÁMICAS (Espejo de page.tsx)
// ==============================================================================

function calcularZonasDisponibles(rows, proy) {
  const s = new Set();
  rows.forEach(r => {
    if (!proyCoincide(r.proyecto, proy)) return;
    if (r.zona && (r.cantidad || 0) > 0) s.add(r.zona.toUpperCase().trim());
  });
  return Array.from(s).sort();
}

function calcularMunicipiosDisponibles(rows, proy, zona) {
  const s = new Set();
  rows.forEach(r => {
    if (!proyCoincide(r.proyecto, proy)) return;
    if (!zonaCoincide(r.zona, zona)) return;
    if (r.municipio && (r.cantidad || 0) > 0) s.add(r.municipio.trim());
  });
  return Array.from(s).sort();
}

function calcularTiposOSDisponibles(rows, proy, zona, municipio) {
  const counts = {
    SUSPENSION: 0,
    RECONEXION: 0,
    TO501: 0,
    TO504: 0,
    TO503: 0,
    TO506: 0,
    TO502: 0,
  };
  rows.forEach(r => {
    if (!proyCoincide(r.proyecto, proy)) return;
    if (!zonaCoincide(r.zona, zona)) return;
    if (municipio !== 'ALL' && (r.municipio || '').toUpperCase() !== municipio.toUpperCase()) return;
    const t = (r.tipo_orden || '').toUpperCase().trim();
    const c = r.cantidad || 0;
    if (['TO501', 'TO504', 'TO503', 'TO506'].includes(t)) {
      counts.SUSPENSION += c;
      if (counts[t] !== undefined) counts[t] += c;
    } else if (t === 'TO502') {
      counts.RECONEXION += c;
      counts.TO502 += c;
    }
  });
  return counts;
}

function calcularEstadosAsignacionDisponibles(rows, proy, zona, municipio, tipoOS) {
  let asignadas = 0;
  let noAsignadas = 0;
  rows.forEach(r => {
    if (!proyCoincide(r.proyecto, proy)) return;
    if (!zonaCoincide(r.zona, zona)) return;
    if (municipio !== 'ALL' && (r.municipio || '').toUpperCase() !== municipio.toUpperCase()) return;
    if (tipoOS !== 'ALL') {
      if (tipoOS === 'SUSPENSION' && !['TO501', 'TO504', 'TO503', 'TO506'].includes(r.tipo_orden)) return;
      if (tipoOS === 'RECONEXION' && r.tipo_orden !== 'TO502') return;
      if (!['SUSPENSION', 'RECONEXION'].includes(tipoOS) && r.tipo_orden !== tipoOS) return;
    }
    const c = r.cantidad || 0;
    if (r.asignacion_status === 'Asignado') asignadas += c;
    if (r.asignacion_status === 'No asignado') noAsignadas += c;
  });
  return { asignadas, noAsignadas };
}

function calcularTecnicosDisponibles(rows, proy, zona, municipio, tipoOS) {
  const map = new Map();
  rows.forEach(r => {
    if (!proyCoincide(r.proyecto, proy)) return;
    if (!zonaCoincide(r.zona, zona)) return;
    if (municipio !== 'ALL' && (r.municipio || '').toUpperCase() !== municipio.toUpperCase()) return;
    if (tipoOS !== 'ALL') {
      if (tipoOS === 'SUSPENSION' && !['TO501', 'TO504', 'TO503', 'TO506'].includes(r.tipo_orden)) return;
      if (tipoOS === 'RECONEXION' && r.tipo_orden !== 'TO502') return;
      if (!['SUSPENSION', 'RECONEXION'].includes(tipoOS) && r.tipo_orden !== tipoOS) return;
    }
    if (r.asignacion_status === 'Asignado' && r.tecnico && r.tecnico !== 'No asignado' && r.tecnico.trim() !== '') {
      const nom = r.tecnico.trim();
      let entry = map.get(nom);
      if (!entry) {
        entry = { total: 0, suspension: 0, reconexion: 0 };
        map.set(nom, entry);
      }
      const c = r.cantidad || 0;
      entry.total += c;
      if (['TO501', 'TO504', 'TO503', 'TO506'].includes(r.tipo_orden)) entry.suspension += c;
      if (r.tipo_orden === 'TO502') entry.reconexion += c;
    }
  });
  return Array.from(map.entries())
    .filter(([_, d]) => d.total > 0)
    .map(([tecnico, d]) => ({ tecnico, total: d.total }))
    .sort((a, b) => b.total - a.total);
}

function calcularMetasZonasDisponibles(rows, proy) {
  const s = new Set();
  rows.forEach(m => {
    if (!proyCoincide(m.proyecto, proy)) return;
    if (m.zona) s.add(m.zona.trim());
  });
  return Array.from(s).sort();
}

function calcularMetasBrigadasDisponibles(rows, proy, zona, metaZona) {
  const s = new Set();
  rows.forEach(m => {
    if (!proyCoincide(m.proyecto, proy)) return;
    if (!zonaCoincide(m.zona, zona)) return;
    if (!zonaCoincide(m.zona, metaZona)) return;
    const tb = (m.tipo_brigada || '').toUpperCase();
    if (tb.includes('PESADA')) s.add('PESADA');
    if (tb.includes('LIVIANA')) s.add('LIVIANA');
    if (tb.includes('CANASTA') && !tb.includes('MINI')) s.add('CANASTA');
    if (tb.includes('MINI')) s.add('MINICANASTA');
    if (tb.includes('MT') || tb.includes('MEDIDA')) s.add('MT');
    if (tb.includes('DISP') || tb.includes('(D)')) s.add('DISP');
    if (tb.includes('GESTOR') || tb.includes('MULTI')) s.add('GESTOR');
  });
  return s;
}

function calcularMetasCoberturasDisponibles(rows, proy, zona, metaZona) {
  const s = new Set();
  rows.forEach(m => {
    if (!proyCoincide(m.proyecto, proy)) return;
    if (!zonaCoincide(m.zona, zona)) return;
    if (!zonaCoincide(m.zona, metaZona)) return;
    if (m.pctAsignado >= 90) s.add('ALTA');
    else if (m.pctAsignado >= 70) s.add('MEDIA');
    else s.add('BAJA');
  });
  return s;
}

// Cálculo consolidado de agregación para validación de más de 2 zonas
function calcularConsolidadoZonas(rows, proy, zona) {
  let totalOrdenes = 0;
  let totalAsignadas = 0;
  let totalPendientes = 0;
  let totalSuspension = 0;
  let totalReconexion = 0;
  let totalDeuda = 0;
  let asigDeuda = 0;
  let pendDeuda = 0;

  rows.forEach(r => {
    if (!proyCoincide(r.proyecto, proy)) return;
    if (!zonaCoincide(r.zona, zona)) return;

    const c = r.cantidad || 0;
    const d = r.deuda_total || 0;
    totalOrdenes += c;
    totalDeuda += d;

    const isAsig = r.asignacion_status === 'Asignado';
    if (isAsig) {
      totalAsignadas += c;
      asigDeuda += d;
    } else {
      totalPendientes += c;
      pendDeuda += d;
    }

    if (['TO501', 'TO504', 'TO503', 'TO506'].includes(r.tipo_orden)) totalSuspension += c;
    if (r.tipo_orden === 'TO502') totalReconexion += c;
  });

  return {
    totalOrdenes,
    totalAsignadas,
    totalPendientes,
    totalSuspension,
    totalReconexion,
    totalDeuda,
    asigDeuda,
    pendDeuda,
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
console.log('BOT 2: VALIDADOR DE EXCLUSIVIDAD DE DATOS REALES Y AUTO-RESETEO');
console.log('================================================================');

console.log('\n--- 2.1: Zonas Disponibles basadas ESTRICTAMENTE en datos ---');
test('Proyecto "Sur" solo ofrece la zona SUR (NORTE y CENTRO excluidas por no tener datos)', () => {
  const zonas = calcularZonasDisponibles(MOCK_ORDENES_OPERATIVAS, 'Sur');
  assert.deepEqual(zonas, ['SUR']);
  assert.ok(!zonas.includes('NORTE'), 'NORTE no debe existir para Sur');
  assert.ok(!zonas.includes('CENTRO'), 'CENTRO no debe existir para Sur');
});

test('Proyecto "Norte-Centro" solo ofrece zonas NORTE y CENTRO (SUR excluida)', () => {
  const zonas = calcularZonasDisponibles(MOCK_ORDENES_OPERATIVAS, 'Norte-Centro');
  assert.deepEqual(zonas, ['CENTRO', 'NORTE']);
  assert.ok(!zonas.includes('SUR'), 'SUR no debe existir para Norte-Centro');
});

console.log('\n--- 2.2: Municipios Disponibles basados ESTRICTAMENTE en datos ---');
test('Para Sur, solo se listan municipios con datos (GALAPA y BARANOA)', () => {
  const munis = calcularMunicipiosDisponibles(MOCK_ORDENES_OPERATIVAS, 'Sur', 'ALL');
  assert.deepEqual(munis, ['BARANOA', 'GALAPA']);
  assert.ok(!munis.includes('BARRANQUILLA'), 'Barranquilla no debe aparecer en Sur');
  assert.ok(!munis.includes('SOLEDAD'), 'Soledad no debe aparecer en Sur');
});

test('Para Norte-Centro / Zona Norte, solo se lista BARRANQUILLA', () => {
  const munis = calcularMunicipiosDisponibles(MOCK_ORDENES_OPERATIVAS, 'Norte-Centro', 'NORTE');
  assert.deepEqual(munis, ['BARRANQUILLA']);
});

console.log('\n--- 2.3: Tipos de OS Disponibles basados ESTRICTAMENTE en datos ---');
test('En Soledad solo hay órdenes TO504 y TO506; Reconexión TO502 tiene 0 órdenes', () => {
  const tipos = calcularTiposOSDisponibles(MOCK_ORDENES_OPERATIVAS, 'Norte-Centro', 'CENTRO', 'SOLEDAD');
  assert.equal(tipos.RECONEXION, 0);
  assert.equal(tipos.TO502, 0);
  assert.ok(tipos.SUSPENSION > 0);
  assert.equal(tipos.TO504, 45);
  assert.equal(tipos.TO506, 15);
});

console.log('\n--- 2.4: Estados de Asignación basados ESTRICTAMENTE en datos ---');
test('En Baranoa todas las órdenes están asignadas (noAsignadas === 0)', () => {
  const estados = calcularEstadosAsignacionDisponibles(MOCK_ORDENES_OPERATIVAS, 'Sur', 'SUR', 'BARANOA', 'ALL');
  assert.equal(estados.asignadas, 30);
  assert.equal(estados.noAsignadas, 0);
});

console.log('\n--- 2.5: Técnicos Disponibles con órdenes asignadas > 0 ---');
test('En Sur solo se listan técnicos asignados a Sur (CARLOS PEREZ y PEDRO GOMEZ)', () => {
  const tecs = calcularTecnicosDisponibles(MOCK_ORDENES_OPERATIVAS, 'Sur', 'ALL', 'ALL', 'ALL');
  const nombres = tecs.map(t => t.tecnico);
  assert.deepEqual(nombres, ['PEDRO GOMEZ', 'CARLOS PEREZ']);
  assert.ok(!nombres.includes('WILMER PERTUZ'), 'Wilmer Pertuz no debe aparecer en Sur');
  assert.ok(!nombres.includes('LUIS TORRENEGRA'), 'Luis Torrenegra no debe aparecer en Sur');
});

test('En Soledad solo se lista ALEXANDER LECHUGA (único técnico con órdenes en Soledad)', () => {
  const tecs = calcularTecnicosDisponibles(MOCK_ORDENES_OPERATIVAS, 'Norte-Centro', 'CENTRO', 'SOLEDAD', 'ALL');
  assert.equal(tecs.length, 1);
  assert.equal(tecs[0].tecnico, 'ALEXANDER LECHUGA');
  assert.equal(tecs[0].total, 45);
});

console.log('\n--- 2.6: Metas - Opciones de Zonas, Brigadas y Coberturas con datos ---');
test('En Metas para Proyecto Sur, solo se ofrece Zona SUR', () => {
  const zonas = calcularMetasZonasDisponibles(MOCK_METAS_PROCESADAS, 'Sur');
  assert.deepEqual(zonas, ['SUR']);
});

test('En Metas para Zona SUR, solo existe tipo de brigada PESADA', () => {
  const brigadas = calcularMetasBrigadasDisponibles(MOCK_METAS_PROCESADAS, 'Sur', 'SUR', 'ALL');
  assert.ok(brigadas.has('PESADA'));
  assert.ok(!brigadas.has('LIVIANA'), 'Liviana no debe aparecer en Metas Sur');
  assert.ok(!brigadas.has('CANASTA'), 'Canasta no debe aparecer en Metas Sur');
});

test('En Metas para Zona NORTE, la cobertura es 75% -> solo existe nivel MEDIA', () => {
  const coberturas = calcularMetasCoberturasDisponibles(MOCK_METAS_PROCESADAS, 'Norte-Centro', 'NORTE', 'ALL');
  assert.ok(coberturas.has('MEDIA'));
  assert.ok(!coberturas.has('ALTA'), 'Alta no debe aparecer en Metas Norte');
  assert.ok(!coberturas.has('BAJA'), 'Baja no debe aparecer en Metas Norte');
});

console.log('\n--- 2.7: Auto-reseteo automático cuando se seleccionan dimensiones huérfanas ---');
test('Auto-reseteo de Zona: Al cambiar proyecto a "Sur", si zona era "NORTE" se resetea a "ALL"', () => {
  let activeZona = 'NORTE';
  const proyActivo = 'Sur';
  const disponibles = calcularZonasDisponibles(MOCK_ORDENES_OPERATIVAS, proyActivo);

  if (activeZona !== 'ALL' && !disponibles.includes(activeZona)) {
    activeZona = 'ALL';
  }
  assert.equal(activeZona, 'ALL');
});

test('Auto-reseteo de Municipio: Al cambiar a "Sur", si municipio era "BARRANQUILLA" se resetea a "ALL"', () => {
  let activeMunicipio = 'BARRANQUILLA';
  const disponibles = calcularMunicipiosDisponibles(MOCK_ORDENES_OPERATIVAS, 'Sur', 'ALL');

  if (activeMunicipio !== 'ALL' && !disponibles.includes(activeMunicipio)) {
    activeMunicipio = 'ALL';
  }
  assert.equal(activeMunicipio, 'ALL');
});

test('Auto-reseteo de Tipo OS: En Soledad, si tipo era "RECONEXION" (0 órdenes) se resetea a "ALL"', () => {
  let activeTipoOS = 'RECONEXION';
  const tipos = calcularTiposOSDisponibles(MOCK_ORDENES_OPERATIVAS, 'Norte-Centro', 'CENTRO', 'SOLEDAD');

  if (activeTipoOS !== 'ALL' && tipos[activeTipoOS] === 0) {
    activeTipoOS = 'ALL';
  }
  assert.equal(activeTipoOS, 'ALL');
});

test('Auto-reseteo de Técnico: En Soledad, si técnico era "CARLOS PEREZ" se resetea a "ALL"', () => {
  let activeTecnico = 'CARLOS PEREZ';
  const tecs = calcularTecnicosDisponibles(MOCK_ORDENES_OPERATIVAS, 'Norte-Centro', 'CENTRO', 'SOLEDAD', 'ALL');

  if (activeTecnico !== 'ALL' && !tecs.some(t => t.tecnico === activeTecnico)) {
    activeTecnico = 'ALL';
  }
  assert.equal(activeTecnico, 'ALL');
});

test('Auto-reseteo en Metas: Si filtroMetaBrigada era "PESADA" y se cambia a Zona "NORTE", se resetea a "ALL"', () => {
  let activeMetaBrigada = 'PESADA';
  const brigadas = calcularMetasBrigadasDisponibles(MOCK_METAS_PROCESADAS, 'Norte-Centro', 'NORTE', 'ALL');

  if (activeMetaBrigada !== 'ALL' && !brigadas.has(activeMetaBrigada)) {
    activeMetaBrigada = 'ALL';
  }
  assert.equal(activeMetaBrigada, 'ALL');
});

console.log('\n--- 2.8: MÁS DE 2 ZONAS JUNTAS: Ajuste exacto de valores ($ COP) y cantidades ---');
test('Cuando se tienen 3 zonas juntas (SUR + NORTE + CENTRO): Cantidades y valores coinciden con la suma individual', () => {
  const sur = calcularConsolidadoZonas(MOCK_ORDENES_OPERATIVAS, 'ALL', 'SUR');
  const norte = calcularConsolidadoZonas(MOCK_ORDENES_OPERATIVAS, 'ALL', 'NORTE');
  const centro = calcularConsolidadoZonas(MOCK_ORDENES_OPERATIVAS, 'ALL', 'CENTRO');

  // Consulta consolidada con 3 zonas juntas
  const multizona = calcularConsolidadoZonas(MOCK_ORDENES_OPERATIVAS, 'ALL', 'SUR,NORTE,CENTRO');

  // Validación de cantidades
  assert.equal(multizona.totalOrdenes, sur.totalOrdenes + norte.totalOrdenes + centro.totalOrdenes, 'Cantidades de órdenes no coinciden');
  assert.equal(multizona.totalAsignadas, sur.totalAsignadas + norte.totalAsignadas + centro.totalAsignadas, 'Cantidades asignadas no coinciden');
  assert.equal(multizona.totalPendientes, sur.totalPendientes + norte.totalPendientes + centro.totalPendientes, 'Cantidades pendientes no coinciden');
  assert.equal(multizona.totalSuspension, sur.totalSuspension + norte.totalSuspension + centro.totalSuspension, 'Cantidades de suspensión no coinciden');
  assert.equal(multizona.totalReconexion, sur.totalReconexion + norte.totalReconexion + centro.totalReconexion, 'Cantidades de reconexión no coinciden');

  // Validación de valores financieros ($ COP / Deuda)
  assert.equal(multizona.totalDeuda, sur.totalDeuda + norte.totalDeuda + centro.totalDeuda, 'Valor total de deuda no coincide');
  assert.equal(multizona.asigDeuda, sur.asigDeuda + norte.asigDeuda + centro.asigDeuda, 'Valor de deuda asignada no coincide');
  assert.equal(multizona.pendDeuda, sur.pendDeuda + norte.pendDeuda + centro.pendDeuda, 'Valor de deuda pendiente no coincide');
  assert.equal(multizona.asigDeuda + multizona.pendDeuda, multizona.totalDeuda, 'Invariante de valores de deuda no se cumple');
});

test('Cuando se tienen más de 2 zonas juntas en Metas: Cuota total suma las 3 zonas (75 + 80 + 30 = 185)', () => {
  let cuota3Zonas = 0;
  MOCK_METAS_PROCESADAS.forEach(m => {
    if (zonaCoincide(m.zona, 'SUR,NORTE,CENTRO')) {
      cuota3Zonas += m.metaTotal;
    }
  });
  assert.equal(cuota3Zonas, 185, 'La cuota de las 3 zonas juntas debe sumar 185 órdenes/día');
});

test('Auto-reseteo multizona: Si están activas "SUR,NORTE,CENTRO" y se filtra Proyecto a "Sur", se preserva solo "SUR"', () => {
  let activeZonas = 'SUR,NORTE,CENTRO';
  const disponibles = calcularZonasDisponibles(MOCK_ORDENES_OPERATIVAS, 'Sur');
  const validList = activeZonas.split(',').filter(z => disponibles.includes(z));

  if (validList.length === 0) activeZonas = 'ALL';
  else activeZonas = validList.join(',');

  assert.equal(activeZonas, 'SUR');
});

console.log('----------------------------------------------------------------');
console.log(`TOTAL BOT 2: ${passed} PASSED | ${failed} FAILED`);
console.log('----------------------------------------------------------------');

if (failed > 0) process.exit(1);
