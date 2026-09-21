#!/usr/bin/env node

/**
 * ==============================================================================
 * BOT 2: VALIDADOR DE CASCADA Y AUTO-RESETEO DE BRIGADAS - /tecnico/productivo
 * ==============================================================================
 * Valida la reactividad y aislamiento entre secciones de filtros:
 *   1. Cascada de `filteredAvailableBrigadas`: solo muestra brigadas que tengan
 *      técnicos coincidentes con la categoría, estado, movilidad o búsqueda activa.
 *   2. Auto-reseteo de `tipoFiltro`: si el usuario seleccionó una brigada
 *      específica y un filtro posterior la deja sin técnicos, `tipoFiltro`
 *      debe auto-resetearse a 'ALL' de forma automática y transparente.
 *   3. Aislamiento de Sección 1 (Brigadas) vs Sección 2 (Técnicos):
 *      - filteredBrigadaCards responde a: categoriaFiltro, tipoFiltro, trendFiltro.
 *      - filteredBrigadaCards ignora: estadoFiltro, movilidadFiltro, buscador q.
 * ==============================================================================
 */

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

// Generador de datos simulados para técnicos y brigadas
function createMockEnvironment() {
  const brigadasCardsData = [
    { tipoCuadrilla: 'SCR PESADA', totalProduccion: 50000000, slope: 250000, trendPct: 15.0 },
    { tipoCuadrilla: 'SCR LIVIANA', totalProduccion: 30000000, slope: -150000, trendPct: -5.0 },
    { tipoCuadrilla: 'CANASTA', totalProduccion: 40000000, slope: 300000, trendPct: 8.0 },
    { tipoCuadrilla: 'SCR MINI CANASTA', totalProduccion: 20000000, slope: -50000, trendPct: -2.0 },
    { tipoCuadrilla: 'GESTOR INTEGRAL MULTI', totalProduccion: 15000000, slope: 100000, trendPct: 4.5 }
  ];

  const cardsData = [
    { id: '1', nombre: 'JUAN PESADA SUR', tipoBrigada: 'SCR PESADA', zona: 'Sur', estadoTecnico: 'ACTIVO', cambioProyecto: 'SUR_A_NORTE', slope: 100 },
    { id: '2', nombre: 'PEDRO PESADA NORTE', tipoBrigada: 'SCR PESADA', zona: 'Norte', estadoTecnico: 'BAJA', cambioProyecto: 'SIN_CAMBIO', slope: -50 },
    { id: '3', nombre: 'LUIS LIVIANA SUR', tipoBrigada: 'SCR LIVIANA', zona: 'Sur', estadoTecnico: 'ACTIVO', cambioProyecto: 'SIN_CAMBIO', slope: -80 },
    { id: '4', nombre: 'ANA CANASTA SUR', tipoBrigada: 'CANASTA', zona: 'Sur', estadoTecnico: 'NUEVO', cambioProyecto: 'NORTE_A_SUR', slope: 200 },
    { id: '5', nombre: 'ROSA MINI CANASTA', tipoBrigada: 'SCR MINI CANASTA', zona: 'Centro', estadoTecnico: 'BAJA', cambioProyecto: 'SIN_CAMBIO', slope: -20 },
    { id: '6', nombre: 'MARIO GESTOR MULTI', tipoBrigada: 'GESTOR INTEGRAL MULTI', zona: 'Norte', estadoTecnico: 'ACTIVO', cambioProyecto: 'SIN_CAMBIO', slope: 150 }
  ];

  return { brigadasCardsData, cardsData };
}

class CascadeEngine {
  constructor() {
    const { brigadasCardsData, cardsData } = createMockEnvironment();
    this.brigadasCardsData = brigadasCardsData;
    this.cardsData = cardsData;

    this.q = '';
    this.categoriaFiltro = 'ALL';
    this.estadoFiltro = 'ALL';
    this.movilidadFiltro = 'ALL';
    this.tipoFiltro = 'ALL';
    this.trendFiltro = 'ALL';
  }

  // Lógica exacta de cascada para opciones de brigada disponibles en el dropdown
  get filteredAvailableBrigadas() {
    let pool = this.cardsData;
    if (this.categoriaFiltro === 'OPERATIVA') {
      pool = pool.filter(c => !isDisponibleType(c.tipoBrigada));
    } else if (this.categoriaFiltro === 'DISPONIBLE') {
      pool = pool.filter(c => isDisponibleType(c.tipoBrigada));
    }
    if (this.trendFiltro === 'UP') {
      pool = pool.filter(c => c.slope >= 0);
    } else if (this.trendFiltro === 'DOWN') {
      pool = pool.filter(c => c.slope < 0);
    }
    if (this.estadoFiltro !== 'ALL') {
      pool = pool.filter(c => c.estadoTecnico === this.estadoFiltro);
    }
    if (this.movilidadFiltro === 'CAMBIO') {
      pool = pool.filter(c => c.cambioProyecto !== 'SIN_CAMBIO');
    } else if (this.movilidadFiltro === 'SUR_A_NORTE') {
      pool = pool.filter(c => c.cambioProyecto === 'SUR_A_NORTE');
    } else if (this.movilidadFiltro === 'NORTE_A_SUR') {
      pool = pool.filter(c => c.cambioProyecto === 'NORTE_A_SUR');
    } else if (this.movilidadFiltro === 'SIN_CAMBIO') {
      pool = pool.filter(c => c.cambioProyecto === 'SIN_CAMBIO');
    }
    if (this.q.trim()) {
      const query = this.q.trim().toLowerCase();
      pool = pool.filter(c => c.nombre.toLowerCase().includes(query) || c.id.includes(query));
    }
    const set = new Set();
    pool.forEach(c => {
      if (c.tipoBrigada && c.tipoBrigada !== 'Sin Tipo') set.add(c.tipoBrigada);
    });
    return Array.from(set).sort();
  }

  // Verificación de reseteo automático de tipoFiltro
  checkAutoResetTipoFiltro() {
    if (this.tipoFiltro !== 'ALL' && !this.filteredAvailableBrigadas.includes(this.tipoFiltro)) {
      this.tipoFiltro = 'ALL';
      return true;
    }
    return false;
  }

  // Sección 1: Tarjetas de Producción por Brigada
  get filteredBrigadaCards() {
    let arr = this.brigadasCardsData.slice();
    if (this.categoriaFiltro === 'OPERATIVA') {
      arr = arr.filter(b => !isDisponibleType(b.tipoCuadrilla));
    } else if (this.categoriaFiltro === 'DISPONIBLE') {
      arr = arr.filter(b => isDisponibleType(b.tipoCuadrilla));
    }
    if (this.tipoFiltro !== 'ALL') {
      arr = arr.filter(b => b.tipoCuadrilla === this.tipoFiltro);
    }
    if (this.trendFiltro === 'UP') {
      arr = arr.filter(b => b.slope >= 0);
    } else if (this.trendFiltro === 'DOWN') {
      arr = arr.filter(b => b.slope < 0);
    }
    return arr;
  }

  // Sección 2: Tarjetas de Técnicos
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
    return arr;
  }
}

async function runBot2() {
  console.log('\n================================================================');
  console.log('🤖 BOT 2: VALIDADOR DE CASCADA Y AUTO-RESETEO DE BRIGADAS');
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

  const engine = new CascadeEngine();

  // Test Suite 2.1: Cascada de opciones de brigadas
  console.log('--- Test Suite 2.1: Cascada de filteredAvailableBrigadas ---');
  assert('Inicialmente todas las 5 brigadas están disponibles en el menú', engine.filteredAvailableBrigadas.length === 5);

  engine.categoriaFiltro = 'OPERATIVA';
  assert('Con categoria OPERATIVA solo quedan 2 brigadas (PESADA, LIVIANA)', 
    engine.filteredAvailableBrigadas.length === 2 && 
    engine.filteredAvailableBrigadas.includes('SCR PESADA') && 
    engine.filteredAvailableBrigadas.includes('SCR LIVIANA')
  );

  engine.categoriaFiltro = 'DISPONIBLE';
  assert('Con categoria DISPONIBLE solo quedan 3 brigadas (CANASTA, MINI CANASTA, GESTOR)', 
    engine.filteredAvailableBrigadas.length === 3 && 
    engine.filteredAvailableBrigadas.includes('CANASTA') && 
    engine.filteredAvailableBrigadas.includes('SCR MINI CANASTA') && 
    engine.filteredAvailableBrigadas.includes('GESTOR INTEGRAL MULTI')
  );

  engine.categoriaFiltro = 'ALL';
  engine.estadoFiltro = 'NUEVO';
  assert('Con estado NUEVO solo CANASTA aparece disponible (ANA CANASTA)', 
    engine.filteredAvailableBrigadas.length === 1 && engine.filteredAvailableBrigadas[0] === 'CANASTA'
  );
  engine.estadoFiltro = 'ALL';

  // Test Suite 2.2: Auto-Reseteo de tipoFiltro
  console.log('\n--- Test Suite 2.2: Auto-Reseteo de tipoFiltro ---');
  engine.tipoFiltro = 'CANASTA';
  assert('Usuario seleccionó tipoFiltro = CANASTA', engine.tipoFiltro === 'CANASTA');

  // Ahora el usuario cambia categoría a OPERATIVA donde CANASTA no existe
  engine.categoriaFiltro = 'OPERATIVA';
  const wasReset = engine.checkAutoResetTipoFiltro();
  assert('tipoFiltro detecta que CANASTA ya no está en el pool disponible y se auto-resetea a ALL', wasReset && engine.tipoFiltro === 'ALL');

  // Otro caso: usuario selecciona SCR LIVIANA y luego filtra por estado NUEVO (donde LIVIANA no tiene nuevos)
  engine.categoriaFiltro = 'ALL';
  engine.tipoFiltro = 'SCR LIVIANA';
  engine.estadoFiltro = 'NUEVO';
  const wasReset2 = engine.checkAutoResetTipoFiltro();
  assert('tipoFiltro SCR LIVIANA se auto-resetea a ALL al filtrar por estado NUEVO', wasReset2 && engine.tipoFiltro === 'ALL');
  engine.estadoFiltro = 'ALL';

  // Test Suite 2.3: Aislamiento de Sección 1 (Brigadas) vs Sección 2 (Técnicos)
  console.log('\n--- Test Suite 2.3: Aislamiento Sección 1 vs Sección 2 ---');
  engine.estadoFiltro = 'BAJA';
  assert('Sección 1 (Brigadas) NO es afectada por estadoFiltro = BAJA (sigue mostrando 5 brigadas)', engine.filteredBrigadaCards.length === 5);
  assert('Sección 2 (Técnicos) SÍ es afectada por estadoFiltro = BAJA (muestra solo 2 técnicos)', engine.filteredCards.length === 2);

  engine.estadoFiltro = 'ALL';
  engine.movilidadFiltro = 'SUR_A_NORTE';
  assert('Sección 1 (Brigadas) NO es afectada por movilidadFiltro (sigue mostrando 5 brigadas)', engine.filteredBrigadaCards.length === 5);
  assert('Sección 2 (Técnicos) SÍ es afectada por movilidadFiltro (muestra solo 1 técnico)', engine.filteredCards.length === 1 && engine.filteredCards[0].id === '1');

  engine.movilidadFiltro = 'ALL';
  engine.q = 'PEDRO';
  assert('Sección 1 (Brigadas) NO es afectada por el buscador textual q', engine.filteredBrigadaCards.length === 5);
  assert('Sección 2 (Técnicos) SÍ es filtrada por el buscador q (retorna solo a PEDRO)', engine.filteredCards.length === 1 && engine.filteredCards[0].id === '2');
  engine.q = '';

  // Filtros que SÍ deben afectar a Sección 1:
  engine.categoriaFiltro = 'OPERATIVA';
  assert('Sección 1 (Brigadas) SÍ es filtrada por categoriaFiltro = OPERATIVA (muestra 2 brigadas)', engine.filteredBrigadaCards.length === 2);

  engine.tipoFiltro = 'SCR PESADA';
  assert('Sección 1 (Brigadas) SÍ es filtrada por tipoFiltro = SCR PESADA (muestra solo 1 brigada)', engine.filteredBrigadaCards.length === 1 && engine.filteredBrigadaCards[0].tipoCuadrilla === 'SCR PESADA');

  engine.categoriaFiltro = 'ALL';
  engine.tipoFiltro = 'ALL';
  engine.trendFiltro = 'DOWN';
  assert('Sección 1 (Brigadas) con trendFiltro = DOWN muestra 2 brigadas decrecientes', engine.filteredBrigadaCards.length === 2 && engine.filteredBrigadaCards.every(b => b.slope < 0));

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL BOT 2: ${passed} PASSED | ${failed} FAILED`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runBot2();
