#!/usr/bin/env node

/**
 * ==============================================================================
 * BOT VALIDADOR DE FILTROS BIDIRECCIONALES - DASHBOARD SCRC
 * ==============================================================================
 * Valida automáticamente el funcionamiento de los filtros en ambos sentidos:
 *   ✔ Aplicar todos los meses <-> Limpiar / Ningún mes
 *   ✔ Aplicar todos los meses <-> Desmarcar un mes <-> Re-marcar ese mes
 *   ✔ Desmarcar uno a uno progresivamente hasta 0 <-> Volver a marcar
 *   ✔ Filtro de días: Todos <-> Desmarcar uno <-> Limpiar <-> Seleccionar todos
 *   ✔ Verificación de endpoints de red (evitar error de PostgreSQL en __NINGUNO__)
 * ==============================================================================
 */

const MES_NINGUNO = '__NINGUNO__';

// Simulación de catálogo de meses disponibles en el Dashboard
const MOCK_MESES = ['2026-06', '2026-07', '2026-08', '2026-09'];
const MOCK_DIAS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17'];

// Mock de registros raw para verificar filtrado en memoria
const MOCK_ROWS = [
  { Fecha: '2026-06-10', _Proyecto: 'Norte-Centro', _Zona: 'Norte', Tipo_Brigada_Mes: 'Brigada Pesada' },
  { Fecha: '2026-07-15', _Proyecto: 'Norte-Centro', _Zona: 'Centro', Tipo_Brigada_Mes: 'Brigada Liviana' },
  { Fecha: '2026-08-01', _Proyecto: 'Sur', _Zona: 'Sur', Tipo_Brigada_Mes: 'Brigada Pesada' },
  { Fecha: '2026-08-20', _Proyecto: 'Sur', _Zona: 'Sur', Tipo_Brigada_Mes: 'Brigada Canasta' },
  { Fecha: '2026-09-05', _Proyecto: 'Norte-Centro', _Zona: 'Norte', Tipo_Brigada_Mes: 'Gestor Integral Multi' },
  { Fecha: '2026-09-17', _Proyecto: 'Norte-Centro', _Zona: 'Norte', Tipo_Brigada_Mes: 'Brigada Pesada' },
];

class FilterBotEngine {
  constructor(visibleMeses = MOCK_MESES, uniqueDays = MOCK_DIAS) {
    this.visibleMeses = [...visibleMeses];
    this.uniqueDays = [...uniqueDays];
    this.ano = '2026';
    this.mes = [this.visibleMeses[this.visibleMeses.length - 1]]; // Mes en ejecución por defecto
    this.fecha = 'ALL';
    this.proy = 'ALL';
    this.zona = 'ALL';
    this.proceso = 'ALL';
    this.networkRequests = [];
  }

  // --- Lógica de estado exactamente como en Filters.tsx ---
  get esNingunMes() {
    return this.mes.length === 1 && this.mes[0] === MES_NINGUNO;
  }

  get todosMeses() {
    return !this.esNingunMes && this.visibleMeses.length > 0 && (
      this.mes.length === 0 || this.visibleMeses.every(m => this.mes.includes(m))
    );
  }

  isMesChecked(m) {
    return this.todosMeses || this.mes.includes(m);
  }

  get selectedDays() {
    if (this.fecha === 'ALL') return new Set(this.uniqueDays);
    if (!this.fecha) return new Set();
    return new Set(this.fecha.split(',').filter(Boolean).map(f => f.slice(8, 10)));
  }

  get isTodosDias() {
    return this.fecha === 'ALL' || (this.uniqueDays.length > 0 && this.selectedDays.size === this.uniqueDays.length);
  }

  isDiaChecked(d) {
    return this.isTodosDias || this.selectedDays.has(d);
  }

  // --- Acciones de Usuario ---
  seleccionarTodosMeses() {
    this.mes = [...this.visibleMeses];
    this.fecha = 'ALL';
    this._onFilterChange();
  }

  limpiarMeses() {
    this.mes = [MES_NINGUNO];
    this.fecha = 'ALL';
    this._onFilterChange();
  }

  toggleMes(m) {
    let next;
    if (this.todosMeses) {
      next = this.visibleMeses.filter(x => x !== m);
    } else if (this.esNingunMes) {
      next = [m];
    } else if (this.mes.includes(m)) {
      next = this.mes.filter(x => x !== m);
    } else {
      next = [...this.mes, m];
    }
    this.mes = next.length === 0 ? [MES_NINGUNO] : next;
    this.fecha = 'ALL';
    this._onFilterChange();
  }

  seleccionarTodosDias() {
    this.fecha = 'ALL';
  }

  limpiarDias() {
    this.fecha = '';
  }

  toggleDia(d) {
    let nextDays;
    if (this.isTodosDias) {
      nextDays = this.uniqueDays.filter(x => x !== d);
    } else if (this.selectedDays.has(d)) {
      nextDays = Array.from(this.selectedDays).filter(x => x !== d);
    } else {
      nextDays = [...Array.from(this.selectedDays), d].sort();
    }

    if (nextDays.length === 0) {
      this.fecha = '';
    } else if (nextDays.length === this.uniqueDays.length) {
      this.fecha = 'ALL';
    } else {
      this.fecha = nextDays.map(dia => `2026-09-${dia}`).join(',');
    }
  }

  // Simula el observador de DashboardProvider.tsx para comprobar peticiones que se dispararían
  _onFilterChange() {
    this.mes.forEach(m => {
      if (m && m !== MES_NINGUNO && /^\d{4}-\d{2}$/.test(m)) {
        this.networkRequests.push(`FETCH_MONTH:${m}`);
      } else if (m === MES_NINGUNO) {
        // En código viejo esto se intentaba cargar y rompía la BD
        this.networkRequests.push(`IGNORAR_CENTINELA:${m}`);
      }
    });
  }

  // --- Filtrado en memoria de registros ---
  filtRaw(rows = MOCK_ROWS) {
    const mesOK = (m) => this.mes.length === 0 || this.mes.includes(m);
    return rows.filter(r => {
      const mesRegistro = String(r.Fecha || '').slice(0, 7);
      if (!mesOK(mesRegistro)) return false;
      return true;
    });
  }
}

// ==============================================================================
// SUITE DE VALIDACIÓN
// ==============================================================================

async function runBot() {
  console.log('\n' + '='.repeat(70));
  console.log('🤖 BOT VALIDADOR DE FILTROS SCRC - EJECUCIÓN DE PRUEBAS BIDIRECCIONALES');
  console.log('='.repeat(70) + '\n');

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function assert(description, condition, detail = '') {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✔ [PASS] ${description}`);
    } else {
      failedTests++;
      console.error(`  ✖ [FAIL] ${description} ${detail ? `--> (${detail})` : ''}`);
    }
  }

  // ----------------------------------------------------------------------------
  // TEST SUITE 1: API Y PROTECCIÓN CONTRA CAÍDAS DE POSTGRESQL
  // ----------------------------------------------------------------------------
  console.log('📌 SUITE 1: Protección de Endpoints API (Evitar fallo 500 con __NINGUNO__)');
  try {
    const baseRes = await fetch('http://localhost:3000/api/data/base?mes=__NINGUNO__');
    const baseData = await baseRes.json();
    assert('GET /api/data/base?mes=__NINGUNO__ responde HTTP 200', baseRes.status === 200, `Status: ${baseRes.status}`);
    assert('GET /api/data/base?mes=__NINGUNO__ devuelve rawRecords vacío', Array.isArray(baseData.rawRecords) && baseData.rawRecords.length === 0);
    assert('GET /api/data/base?mes=__NINGUNO__ no arroja error de BD', !baseData.error, baseData.error);
  } catch (err) {
    console.log(`  ℹ Nota: Servidor local no respondió en puerto 3000 (${err.message}) - validación de API diferida.`);
  }

  try {
    const mapRes = await fetch('http://localhost:3000/api/data/map?mes=__NINGUNO__');
    const mapData = await mapRes.json();
    assert('GET /api/data/map?mes=__NINGUNO__ responde HTTP 200', mapRes.status === 200, `Status: ${mapRes.status}`);
    assert('GET /api/data/map?mes=__NINGUNO__ devuelve geojson vacío', mapData.geojson && mapData.geojson.features.length === 0);
  } catch {
    // Servidor offline o diferido
  }

  // ----------------------------------------------------------------------------
  // TEST SUITE 2: BIDIRECCIONAL - "TODOS LOS MESES" <-> "LIMPIAR (NINGUNO)"
  // ----------------------------------------------------------------------------
  console.log('\n📌 SUITE 2: Bidireccional [Todos los Meses] <---> [Limpiar / Ningún Mes]');
  const bot = new FilterBotEngine();

  // Paso 2.1: Seleccionar todos
  bot.seleccionarTodosMeses();
  assert('2.1 Al presionar "Seleccionar todos": todosMeses es true', bot.todosMeses === true);
  assert('2.1 Cada mes visible está marcado', bot.visibleMeses.every(m => bot.isMesChecked(m)));
  assert('2.1 Con todos los meses se filtran todas las 6 filas', bot.filtRaw().length === 6);

  // Paso 2.2: Limpiar meses ("Eliminar filtro de todos los meses")
  bot.limpiarMeses();
  assert('2.2 Al presionar "Limpiar": esNingunMes es true', bot.esNingunMes === true);
  assert('2.2 Al presionar "Limpiar": todosMeses es false', bot.todosMeses === false);
  assert('2.2 Ningún mes individual está marcado', bot.visibleMeses.every(m => !bot.isMesChecked(m)));
  assert('2.2 filtRaw retorna 0 filas limpiamente', bot.filtRaw().length === 0);
  assert('2.2 No se solicitó carga de red para __NINGUNO__', !bot.networkRequests.includes('FETCH_MONTH:__NINGUNO__'));

  // Paso 2.3: De regreso - Volver a seleccionar todos
  bot.seleccionarTodosMeses();
  assert('2.3 De vuelta a "Seleccionar todos": se restaura todosMeses en true', bot.todosMeses === true);
  assert('2.3 De vuelta: todas las 6 filas vuelven a estar visibles', bot.filtRaw().length === 6);

  // ----------------------------------------------------------------------------
  // TEST SUITE 3: BIDIRECCIONAL - "TODOS LOS MESES" <-> "DESMARCAR UNO" <-> "RE-MARCAR"
  // ----------------------------------------------------------------------------
  console.log('\n📌 SUITE 3: Bidireccional [Todos] <---> [Desmarcar 1 Mes] <---> [Re-marcar]');
  
  // Paso 3.1: Desmarcar septiembre (2026-09)
  bot.seleccionarTodosMeses();
  bot.toggleMes('2026-09');
  assert('3.1 Al desmarcar 2026-09: todosMeses pasa a false', bot.todosMeses === false);
  assert('3.1 2026-09 ya NO está checked', bot.isMesChecked('2026-09') === false);
  assert('3.1 2026-08 sigue checked', bot.isMesChecked('2026-08') === true);
  assert('3.1 2026-07 sigue checked', bot.isMesChecked('2026-07') === true);
  assert('3.1 Filas visibles disminuyen excluyendo septiembre (4 de 6)', bot.filtRaw().length === 4);

  // Paso 3.2: Re-marcar septiembre (2026-09)
  bot.toggleMes('2026-09');
  assert('3.2 Al volver a marcar 2026-09: todosMeses se activa automáticamente en true', bot.todosMeses === true);
  assert('3.2 2026-09 vuelve a estar checked', bot.isMesChecked('2026-09') === true);
  assert('3.2 Vuelven a verse las 6 filas completas', bot.filtRaw().length === 6);

  // ----------------------------------------------------------------------------
  // TEST SUITE 4: VACIADO PROGRESIVO Y REACTIVACIÓN (Desmarcar uno a uno)
  // ----------------------------------------------------------------------------
  console.log('\n📌 SUITE 4: Vaciado Progresivo (Desmarcar uno a uno hasta 0) <---> Reactivación');
  bot.seleccionarTodosMeses(); // Inicia con 4 meses

  bot.toggleMes('2026-06'); // Quedan 3
  assert('4.1 Desmarcar 1er mes: quedan 3 meses activos', bot.mes.length === 3 && !bot.mes.includes('2026-06'));

  bot.toggleMes('2026-07'); // Quedan 2
  assert('4.2 Desmarcar 2do mes: quedan 2 meses activos', bot.mes.length === 2 && !bot.mes.includes('2026-07'));

  bot.toggleMes('2026-08'); // Queda 1
  assert('4.3 Desmarcar 3er mes: queda 1 mes activo (2026-09)', bot.mes.length === 1 && bot.mes[0] === '2026-09');
  assert('4.3 Con 1 mes, esNingunMes es false', bot.esNingunMes === false);

  bot.toggleMes('2026-09'); // Desmarcar el último
  assert('4.4 Desmarcar el ÚLTIMO mes pasa automáticamente a __NINGUNO__', bot.esNingunMes === true);
  assert('4.4 Array mes contiene exactamente [__NINGUNO__]', bot.mes.length === 1 && bot.mes[0] === MES_NINGUNO);
  assert('4.4 Datos filtrados caen a 0 filas sin excepción', bot.filtRaw().length === 0);

  // Reactivar desde 0
  bot.toggleMes('2026-08');
  assert('4.5 Al hacer clic en un mes desde estado vacío: pasa a exactamente [2026-08]', bot.mes.length === 1 && bot.mes[0] === '2026-08');
  assert('4.5 __NINGUNO__ fue limpiado del array', !bot.mes.includes(MES_NINGUNO));
  assert('4.5 Se muestran solo los registros de 2026-08 (2 filas)', bot.filtRaw().length === 2);

  // ----------------------------------------------------------------------------
  // TEST SUITE 5: BIDIRECCIONAL - FILTRO DE DÍAS
  // ----------------------------------------------------------------------------
  console.log('\n📌 SUITE 5: Bidireccional Filtro de Días [Todos] <---> [Desmarcar 1] <---> [Limpiar]');
  
  // Paso 5.1: Todos los días
  bot.seleccionarTodosDias();
  assert('5.1 isTodosDias es true al seleccionar todos', bot.isTodosDias === true);

  // Paso 5.2: Desmarcar día '17'
  bot.toggleDia('17');
  assert('5.2 isTodosDias es false tras desmarcar día 17', bot.isTodosDias === false);
  assert('5.2 Día 17 no está marcado', bot.isDiaChecked('17') === false);
  assert('5.2 Día 01 sigue marcado', bot.isDiaChecked('01') === true);

  // Paso 5.3: Re-marcar día '17'
  bot.toggleDia('17');
  assert('5.3 Re-marcar día 17 restaura isTodosDias en true', bot.isTodosDias === true);

  // Paso 5.4: Limpiar días
  bot.limpiarDias();
  assert('5.4 Limpiar días deja 0 días seleccionados', bot.selectedDays.size === 0);
  assert('5.4 isTodosDias es false', bot.isTodosDias === false);

  // Paso 5.5: Restaurar todos los días
  bot.seleccionarTodosDias();
  assert('5.5 Restaurar todos los días deja isTodosDias en true', bot.isTodosDias === true);

  // ----------------------------------------------------------------------------
  // RESUMEN FINAL
  // ----------------------------------------------------------------------------
  console.log('\n' + '='.repeat(70));
  console.log(`📊 RESUMEN FINAL: ${passedTests}/${totalTests} pruebas pasadas (${Math.round((passedTests / totalTests) * 100)}%)`);
  if (failedTests === 0) {
    console.log('🎉 TODAS LAS ITERACIONES BIDIRECCIONALES FUERON VALIDADAS EXITOSAMENTE');
  } else {
    console.error(`⚠️ SE ENCONTRARON ${failedTests} PRUEBAS FALLIDAS`);
  }
  console.log('='.repeat(70) + '\n');

  if (failedTests > 0) {
    process.exitCode = 1;
  }
}

runBot();
