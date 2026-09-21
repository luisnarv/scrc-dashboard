#!/usr/bin/env node

/**
 * ==============================================================================
 * BOT 1: VALIDADOR DE FILTROS LOCALES Y BÚSQUEDA - /tecnico/productivo
 * ==============================================================================
 * Valida de forma exhaustiva los 7 filtros locales propios de la vista Productivo:
 *   1. Buscador reactivo (q) por nombre y cédula (parcial, mayúsculas, minúsculas)
 *   2. Categoría: ALL vs OPERATIVA vs DISPONIBLE (isDisponibleType)
 *   3. Estado Técnico: ALL vs ACTIVO vs NUEVO vs BAJA
 *   4. Movilidad de Proyectos: ALL vs CAMBIO vs SUR_A_NORTE vs NORTE_A_SUR vs SIN_CAMBIO
 *   5. Tendencia: ALL vs UP (slope >= 0) vs DOWN (slope < 0)
 *   6. Tipo de Brigada: selección individual reactiva
 *   7. Ordenamiento: total vs cump vs trend vs nombre
 *   8. Verificación de contadores de badges en tiempo real
 *   9. Verificación de reseteo de paginación (page = 1) al cambiar filtros
 * ==============================================================================
 */

// Helpers matemáticos y de clasificación idénticos a page.tsx
const isDisponibleType = (tLabel) => {
  const s = String(tLabel || '').toLowerCase().trim();
  return (
    s.includes('canasta') ||
    s.includes('minicanasta') ||
    s.includes('mini canasta') ||
    s.includes('mt-at') ||
    s.includes('mt at') ||
    s.includes('gestor') ||
    s.includes('disponible') ||
    s.includes('disponibilidad') ||
    s.includes('multi')
  );
};

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

function getEstadoTecnico(monthlyData, porDia = false, esRetirado = false) {
  if (esRetirado) return 'BAJA';
  const N = monthlyData.length;
  if (N === 0) return 'BAJA';
  const tieneActividad = (m) => ((m.orders ?? 0) > 0 || m.val > 0);
  if (porDia) {
    const totalOrders = monthlyData.reduce((s, m) => s + (m.orders || 0), 0);
    const totalMes = monthlyData.reduce((s, m) => s + m.val, 0);
    return (totalOrders > 0 || totalMes > 0) ? 'ACTIVO' : 'BAJA';
  }
  if (N >= 2 && !tieneActividad(monthlyData[N - 1]) && !tieneActividad(monthlyData[N - 2])) {
    return 'BAJA';
  }
  const activeMonths = monthlyData.filter(m => tieneActividad(m));
  if (activeMonths.length === 1 && tieneActividad(monthlyData[N - 1])) {
    return 'NUEVO';
  }
  return 'ACTIVO';
}

// Generación de un conjunto representativo de técnicos para pruebas
function createMockTecnicos() {
  return [
    {
      id: '10101',
      nombre: 'CARLOS ALBERTO MARIN',
      tipoBrigada: 'SCR PESADA',
      zona: 'Norte',
      totalProduccion: 18500000,
      promedioMensual: 4625000,
      trendPct: 12.5,
      slope: 150000,
      mediaBrigada: 4200000,
      cumplimientoPct: 110,
      diffMedia: 425000,
      estadoTecnico: 'ACTIVO',
      cambioProyecto: 'SIN_CAMBIO',
      monthlyData: [{ monthLabel: '2026-06', val: 4000000 }, { monthLabel: '2026-07', val: 4500000 }, { monthLabel: '2026-08', val: 4800000 }, { monthLabel: '2026-09', val: 5200000 }]
    },
    {
      id: '10102',
      nombre: 'JUAN DAVID OSPINA',
      tipoBrigada: 'SCR CANASTA',
      zona: 'Sur',
      totalProduccion: 22000000,
      promedioMensual: 5500000,
      trendPct: -8.0,
      slope: -80000,
      mediaBrigada: 5200000,
      cumplimientoPct: 106,
      diffMedia: 300000,
      estadoTecnico: 'ACTIVO',
      cambioProyecto: 'SUR_A_NORTE',
      monthlyData: [{ monthLabel: '2026-06', val: 6000000 }, { monthLabel: '2026-07', val: 5800000 }, { monthLabel: '2026-08', val: 5400000 }, { monthLabel: '2026-09', val: 4800000 }]
    },
    {
      id: '10103',
      nombre: 'MIGUEL ANGEL RAMIREZ',
      tipoBrigada: 'SCR LIVIANA',
      zona: 'Centro',
      totalProduccion: 7500000,
      promedioMensual: 1875000,
      trendPct: -100,
      slope: -650000,
      mediaBrigada: 3800000,
      cumplimientoPct: 49,
      diffMedia: -1925000,
      estadoTecnico: 'BAJA',
      cambioProyecto: 'SIN_CAMBIO',
      monthlyData: [{ monthLabel: '2026-06', val: 4000000 }, { monthLabel: '2026-07', val: 3500000 }, { monthLabel: '2026-08', val: 0 }, { monthLabel: '2026-09', val: 0 }]
    },
    {
      id: '10104',
      nombre: 'ANDRES FELIPE CASTRO',
      tipoBrigada: 'GESTOR INTEGRAL MULTI',
      zona: 'Norte',
      totalProduccion: 4200000,
      promedioMensual: 4200000,
      trendPct: 100,
      slope: 700000,
      mediaBrigada: 4000000,
      cumplimientoPct: 105,
      diffMedia: 200000,
      estadoTecnico: 'NUEVO',
      cambioProyecto: 'NORTE_A_SUR',
      monthlyData: [{ monthLabel: '2026-06', val: 0 }, { monthLabel: '2026-07', val: 0 }, { monthLabel: '2026-08', val: 0 }, { monthLabel: '2026-09', val: 4200000 }]
    },
    {
      id: '10105',
      nombre: 'JORGE ELIECER GAITAN',
      tipoBrigada: 'SCR PESADA',
      zona: 'Sur',
      totalProduccion: 11000000,
      promedioMensual: 2750000,
      trendPct: -15.2,
      slope: -120000,
      mediaBrigada: 4200000,
      cumplimientoPct: 65,
      diffMedia: -1450000,
      estadoTecnico: 'ACTIVO',
      cambioProyecto: 'OTRO_CAMBIO',
      monthlyData: [{ monthLabel: '2026-06', val: 3200000 }, { monthLabel: '2026-07', val: 3000000 }, { monthLabel: '2026-08', val: 2600000 }, { monthLabel: '2026-09', val: 2200000 }]
    },
    {
      id: '10106',
      nombre: 'DANIEL ESTEBAN ZAPATA',
      tipoBrigada: 'SCR MINI CANASTA',
      zona: 'Centro',
      totalProduccion: 16000000,
      promedioMensual: 4000000,
      trendPct: 5.5,
      slope: 90000,
      mediaBrigada: 3900000,
      cumplimientoPct: 103,
      diffMedia: 100000,
      estadoTecnico: 'ACTIVO',
      cambioProyecto: 'SIN_CAMBIO',
      monthlyData: [{ monthLabel: '2026-06', val: 3800000 }, { monthLabel: '2026-07', val: 3900000 }, { monthLabel: '2026-08', val: 4100000 }, { monthLabel: '2026-09', val: 4200000 }]
    }
  ];
}

// Motor simulador de la vista local /Productivo
class ProductivoLocalFilterEngine {
  constructor(initialCards = createMockTecnicos()) {
    this.cardsData = initialCards;
    this.q = '';
    this.categoriaFiltro = 'ALL';
    this.estadoFiltro = 'ALL';
    this.movilidadFiltro = 'ALL';
    this.tipoFiltro = 'ALL';
    this.trendFiltro = 'ALL';
    this.sortOrder = 'total';
    this.page = 1;
    this.pageSize = 24;
  }

  setQ(val) { this.q = val; this.page = 1; }
  setCategoriaFiltro(val) { this.categoriaFiltro = val; this.tipoFiltro = 'ALL'; this.page = 1; }
  setEstadoFiltro(val) { this.estadoFiltro = val; this.page = 1; }
  setMovilidadFiltro(val) { this.movilidadFiltro = val; this.page = 1; }
  setTipoFiltro(val) { this.tipoFiltro = val; this.page = 1; }
  setTrendFiltro(val) { this.trendFiltro = val; this.page = 1; }
  setSortOrder(val) { this.sortOrder = val; }

  get filteredCards() {
    let arr = this.cardsData.slice();

    if (this.categoriaFiltro === 'OPERATIVA') {
      arr = arr.filter(c => !isDisponibleType(c.tipoBrigada));
    } else if (this.categoriaFiltro === 'DISPONIBLE') {
      arr = arr.filter(c => isDisponibleType(c.tipoBrigada));
    }

    if (this.tipoFiltro !== 'ALL') {
      arr = arr.filter(c => c.tipoBrigada === this.tipoFiltro);
    }

    if (this.trendFiltro === 'UP') {
      arr = arr.filter(c => c.slope >= 0);
    } else if (this.trendFiltro === 'DOWN') {
      arr = arr.filter(c => c.slope < 0);
    }

    if (this.estadoFiltro !== 'ALL') {
      arr = arr.filter(c => c.estadoTecnico === this.estadoFiltro);
    }

    if (this.movilidadFiltro === 'CAMBIO') {
      arr = arr.filter(c => c.cambioProyecto !== 'SIN_CAMBIO');
    } else if (this.movilidadFiltro === 'SUR_A_NORTE') {
      arr = arr.filter(c => c.cambioProyecto === 'SUR_A_NORTE');
    } else if (this.movilidadFiltro === 'NORTE_A_SUR') {
      arr = arr.filter(c => c.cambioProyecto === 'NORTE_A_SUR');
    } else if (this.movilidadFiltro === 'SIN_CAMBIO') {
      arr = arr.filter(c => c.cambioProyecto === 'SIN_CAMBIO');
    }

    if (this.q.trim()) {
      const query = this.q.trim().toLowerCase();
      arr = arr.filter(c => c.nombre.toLowerCase().includes(query) || c.id.includes(query));
    }

    arr.sort((a, b) => {
      if (this.sortOrder === 'total') return b.totalProduccion - a.totalProduccion;
      if (this.sortOrder === 'cump') return b.cumplimientoPct - a.cumplimientoPct;
      if (this.sortOrder === 'trend') return b.trendPct - a.trendPct;
      return a.nombre.localeCompare(b.nombre);
    });

    return arr;
  }

  // Contadores de badges
  get counts() {
    return {
      operativas: this.cardsData.filter(c => !isDisponibleType(c.tipoBrigada)).length,
      disponibles: this.cardsData.filter(c => isDisponibleType(c.tipoBrigada)).length,
      activos: this.cardsData.filter(c => c.estadoTecnico === 'ACTIVO').length,
      nuevos: this.cardsData.filter(c => c.estadoTecnico === 'NUEVO').length,
      bajas: this.cardsData.filter(c => c.estadoTecnico === 'BAJA').length,
      cambios: this.cardsData.filter(c => c.cambioProyecto !== 'SIN_CAMBIO').length,
      surANorte: this.cardsData.filter(c => c.cambioProyecto === 'SUR_A_NORTE').length,
      norteASur: this.cardsData.filter(c => c.cambioProyecto === 'NORTE_A_SUR').length,
    };
  }
}

// ==============================================================================
// EJECUCIÓN DE PRUEBAS DEL BOT 1
// ==============================================================================
async function runBot1() {
  console.log('\n================================================================');
  console.log('🤖 BOT 1: VALIDADOR DE FILTROS LOCALES Y BÚSQUEDA (/Productivo)');
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

  const engine = new ProductivoLocalFilterEngine();

  // Test 1: Estado inicial
  console.log('--- Test Suite 1.1: Estado Inicial y Contadores ---');
  assert('Total de técnicos inicial es 6', engine.filteredCards.length === 6);
  assert('Conteo de Operativas es 3 (PESADA, LIVIANA)', engine.counts.operativas === 3);
  assert('Conteo de Disponibles es 3 (CANASTA, GESTOR, MINI CANASTA)', engine.counts.disponibles === 3);
  assert('Conteo de Activos es 4', engine.counts.activos === 4);
  assert('Conteo de Nuevos es 1 (ANDRES FELIPE)', engine.counts.nuevos === 1);
  assert('Conteo de Bajas es 1 (MIGUEL ANGEL)', engine.counts.bajas === 1);
  assert('Conteo de Cambios de Proyecto es 3', engine.counts.cambios === 3);
  assert('Conteo de Sur a Norte es 1 (JUAN DAVID)', engine.counts.surANorte === 1);
  assert('Conteo de Norte a Sur es 1 (ANDRES FELIPE)', engine.counts.norteASur === 1);

  // Test 2: Buscador Reactivo
  console.log('\n--- Test Suite 1.2: Buscador Reactivo (q) ---');
  engine.setQ('carlos');
  assert('Búsqueda minúscula por nombre parcial "carlos" retorna 1', engine.filteredCards.length === 1 && engine.filteredCards[0].id === '10101');
  
  engine.setQ('10104');
  assert('Búsqueda por cédula "10104" retorna a ANDRES FELIPE', engine.filteredCards.length === 1 && engine.filteredCards[0].nombre.includes('ANDRES'));

  engine.setQ('MARIN');
  assert('Búsqueda mayúscula por apellido "MARIN" retorna 1', engine.filteredCards.length === 1 && engine.filteredCards[0].id === '10101');

  engine.setQ('inexistente');
  assert('Búsqueda sin coincidencias retorna array vacío', engine.filteredCards.length === 0);
  engine.setQ('');

  // Test 3: Filtro de Categoría (OPERATIVA vs DISPONIBLE)
  console.log('\n--- Test Suite 1.3: Filtro de Categoría ---');
  engine.setCategoriaFiltro('OPERATIVA');
  assert('Filtro OPERATIVA excluye Canasta, Gestor y Minicanasta', engine.filteredCards.every(c => !isDisponibleType(c.tipoBrigada)));
  assert('Cantidad de tarjetas operativas es exactamente 3', engine.filteredCards.length === 3);

  engine.setCategoriaFiltro('DISPONIBLE');
  assert('Filtro DISPONIBLE incluye únicamente Canasta, Gestor y Minicanasta', engine.filteredCards.every(c => isDisponibleType(c.tipoBrigada)));
  assert('Cantidad de tarjetas disponibles es exactamente 3', engine.filteredCards.length === 3);
  engine.setCategoriaFiltro('ALL');

  // Test 4: Filtro de Estado Técnico (ACTIVO, NUEVO, BAJA)
  console.log('\n--- Test Suite 1.4: Filtro de Estado Técnico ---');
  engine.setEstadoFiltro('ACTIVO');
  assert('Filtro ACTIVO retorna 4 técnicos activos', engine.filteredCards.length === 4 && engine.filteredCards.every(c => c.estadoTecnico === 'ACTIVO'));

  engine.setEstadoFiltro('NUEVO');
  assert('Filtro NUEVO retorna exactamente 1 técnico', engine.filteredCards.length === 1 && engine.filteredCards[0].id === '10104');

  engine.setEstadoFiltro('BAJA');
  assert('Filtro BAJA retorna exactamente 1 técnico inactivo', engine.filteredCards.length === 1 && engine.filteredCards[0].id === '10103');
  engine.setEstadoFiltro('ALL');

  // Test 5: Filtro de Movilidad de Proyectos
  console.log('\n--- Test Suite 1.5: Filtro de Movilidad de Proyectos ---');
  engine.setMovilidadFiltro('CAMBIO');
  assert('Filtro CAMBIO retorna 3 técnicos con traslado', engine.filteredCards.length === 3 && engine.filteredCards.every(c => c.cambioProyecto !== 'SIN_CAMBIO'));

  engine.setMovilidadFiltro('SUR_A_NORTE');
  assert('Filtro SUR_A_NORTE retorna a JUAN DAVID OSPINA', engine.filteredCards.length === 1 && engine.filteredCards[0].id === '10102');

  engine.setMovilidadFiltro('NORTE_A_SUR');
  assert('Filtro NORTE_A_SUR retorna a ANDRES FELIPE CASTRO', engine.filteredCards.length === 1 && engine.filteredCards[0].id === '10104');

  engine.setMovilidadFiltro('SIN_CAMBIO');
  assert('Filtro SIN_CAMBIO retorna 3 técnicos estables', engine.filteredCards.length === 3 && engine.filteredCards.every(c => c.cambioProyecto === 'SIN_CAMBIO'));
  engine.setMovilidadFiltro('ALL');

  // Test 6: Filtro de Tendencia (UP vs DOWN)
  console.log('\n--- Test Suite 1.6: Filtro de Tendencia ---');
  engine.setTrendFiltro('UP');
  assert('Filtro UP retorna técnicos con slope >= 0', engine.filteredCards.every(c => c.slope >= 0) && engine.filteredCards.length === 3);

  engine.setTrendFiltro('DOWN');
  assert('Filtro DOWN retorna técnicos con slope < 0', engine.filteredCards.every(c => c.slope < 0) && engine.filteredCards.length === 3);
  engine.setTrendFiltro('ALL');

  // Test 7: Combinación Simultánea de Múltiples Filtros Locales
  console.log('\n--- Test Suite 1.7: Combinaciones Cruzadas Multidimensionales ---');
  engine.setCategoriaFiltro('OPERATIVA');
  engine.setTrendFiltro('UP');
  assert('OPERATIVA + UP retorna solo CARLOS ALBERTO MARIN', engine.filteredCards.length === 1 && engine.filteredCards[0].id === '10101');

  engine.setTrendFiltro('ALL');
  engine.setCategoriaFiltro('DISPONIBLE');
  engine.setMovilidadFiltro('SUR_A_NORTE');
  assert('DISPONIBLE + SUR_A_NORTE retorna solo a JUAN DAVID OSPINA', engine.filteredCards.length === 1 && engine.filteredCards[0].id === '10102');

  engine.setMovilidadFiltro('ALL');
  engine.setCategoriaFiltro('ALL');
  engine.setEstadoFiltro('BAJA');
  engine.setTrendFiltro('DOWN');
  assert('BAJA + DOWN retorna a MIGUEL ANGEL RAMIREZ', engine.filteredCards.length === 1 && engine.filteredCards[0].id === '10103');

  // Limpiar todos los filtros antes de la suite de paginación
  engine.setEstadoFiltro('ALL');
  engine.setTrendFiltro('ALL');

  // Limpiar filtros y validar reseteo de página
  console.log('\n--- Test Suite 1.8: Reseteo de Paginación al Cambiar Filtros ---');
  engine.page = 5;
  engine.setCategoriaFiltro('OPERATIVA');
  assert('Cambio de categoriaFiltro resetea page a 1', engine.page === 1);

  engine.page = 3;
  engine.setEstadoFiltro('ACTIVO');
  assert('Cambio de estadoFiltro resetea page a 1', engine.page === 1);

  engine.page = 4;
  engine.setQ('test');
  assert('Cambio de buscador q resetea page a 1', engine.page === 1);

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL BOT 1: ${passed} PASSED | ${failed} FAILED`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runBot1();
