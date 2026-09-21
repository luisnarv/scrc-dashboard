#!/usr/bin/env node

/**
 * ==============================================================================
 * BOT 3: VALIDADOR DE CRUCE ENTRE FILTROS GLOBALES Y FILTROS LOCALES
 * ==============================================================================
 * Valida la interacción bidireccional entre la Capa Global y la Capa Local:
 *   1. Filtros Globales (proy, zona, mes, fecha, proceso) aplicados vía filtRaw.
 *   2. Eje Temporal Adaptable (porDia):
 *      - 1 mes seleccionado: porDia = true, bucketKey = YYYY-MM-DD,
 *        getEstadoTecnico evalúa actividad en el mes (>0 => ACTIVO, 0 => BAJA).
 *      - Varios meses o ninguno: porDia = false, bucketKey = YYYY-MM,
 *        getEstadoTecnico evalúa inactividad de 2+ meses seguidos.
 *   3. Filtro Proceso: ALL vs GESTOR (aislamiento de Multifamiliar).
 *   4. Filtro Fecha específica (fechaMatches con Set de días).
 *   5. Centinela __NINGUNO__: 0 registros sin errores de ejecución ni crash.
 * ==============================================================================
 */

const MES_NINGUNO = '__NINGUNO__';
const BRIG_GESTOR = 'Gestor Integral Multi';

const mesDe = (fecha) => String(fecha || '').slice(0, 7);
const mesOK = (m, F) => F.mes.length === 0 || F.mes.includes(m);
const procesoOK = (brig, F) => F.proceso !== 'GESTOR' || String(brig || '') === BRIG_GESTOR;

function fechaMatches(fOnly, fFilter, set) {
  if (set) {
    return set.has(fOnly) || set.has(fOnly.slice(8, 10));
  }
  if (fOnly === fFilter) return true;
  if (fFilter.length === 2 && fOnly.slice(8, 10) === fFilter) return true;
  return false;
}

function filtRaw(rows, F) {
  const fFilter = F.fecha;
  const isAllFecha = fFilter === 'ALL';
  const fSet = (!isAllFecha && fFilter && fFilter.includes(','))
    ? new Set(fFilter.split(',').filter(Boolean))
    : null;

  return rows.filter(r => {
    if (F.proy !== 'ALL' && r._Proyecto !== F.proy) return false;
    if (F.zona !== 'ALL' && r._Zona !== F.zona && r._ZonaDet !== F.zona) return false;
    if (!mesOK(mesDe(r.Fecha), F)) return false;
    if (!isAllFecha) {
      if (!fFilter) return false;
      const fOnly = String(r.Fecha || '').trim().slice(0, 10);
      if (!fechaMatches(fOnly, fFilter, fSet)) return false;
    }
    if (!procesoOK(r.Tipo_Brigada_Mes, F)) return false;
    return true;
  });
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

// Conjunto de datos Raw para pruebas
function createMockRawData() {
  return [
    // Tecnico 1: JUAN PEREZ (Sur, Pesada, Activo en 06, 07, 08, 09)
    { Cedula: '1001', Nombre: 'JUAN PEREZ', Fecha: '2026-06-15', _Proyecto: 'Sur', _Zona: 'Sur', Tipo_Brigada_Mes: 'SCR PESADA', Ingresos: 4000000 },
    { Cedula: '1001', Nombre: 'JUAN PEREZ', Fecha: '2026-07-15', _Proyecto: 'Sur', _Zona: 'Sur', Tipo_Brigada_Mes: 'SCR PESADA', Ingresos: 4200000 },
    { Cedula: '1001', Nombre: 'JUAN PEREZ', Fecha: '2026-08-10', _Proyecto: 'Sur', _Zona: 'Sur', Tipo_Brigada_Mes: 'SCR PESADA', Ingresos: 2000000 },
    { Cedula: '1001', Nombre: 'JUAN PEREZ', Fecha: '2026-08-20', _Proyecto: 'Sur', _Zona: 'Sur', Tipo_Brigada_Mes: 'SCR PESADA', Ingresos: 2500000 },
    { Cedula: '1001', Nombre: 'JUAN PEREZ', Fecha: '2026-09-05', _Proyecto: 'Sur', _Zona: 'Sur', Tipo_Brigada_Mes: 'SCR PESADA', Ingresos: 4500000 },

    // Tecnico 2: CARLOS GOMEZ (Norte-Centro, Liviana, Inactivo en 08 y 09 => BAJA en vista mensual)
    { Cedula: '1002', Nombre: 'CARLOS GOMEZ', Fecha: '2026-06-10', _Proyecto: 'Norte-Centro', _Zona: 'Norte', Tipo_Brigada_Mes: 'SCR LIVIANA', Ingresos: 3500000 },
    { Cedula: '1002', Nombre: 'CARLOS GOMEZ', Fecha: '2026-07-12', _Proyecto: 'Norte-Centro', _Zona: 'Norte', Tipo_Brigada_Mes: 'SCR LIVIANA', Ingresos: 3800000 },

    // Tecnico 3: LUIS DIAZ (Sur a Norte-Centro, Gestor Integral Multi)
    { Cedula: '1003', Nombre: 'LUIS DIAZ', Fecha: '2026-06-01', _Proyecto: 'Sur', _Zona: 'Sur', Tipo_Brigada_Mes: 'Gestor Integral Multi', Ingresos: 3000000 },
    { Cedula: '1003', Nombre: 'LUIS DIAZ', Fecha: '2026-07-01', _Proyecto: 'Norte-Centro', _Zona: 'Centro', Tipo_Brigada_Mes: 'Gestor Integral Multi', Ingresos: 3200000 },
    { Cedula: '1003', Nombre: 'LUIS DIAZ', Fecha: '2026-08-15', _Proyecto: 'Norte-Centro', _Zona: 'Centro', Tipo_Brigada_Mes: 'Gestor Integral Multi', Ingresos: 3400000 },
    { Cedula: '1003', Nombre: 'LUIS DIAZ', Fecha: '2026-09-02', _Proyecto: 'Norte-Centro', _Zona: 'Centro', Tipo_Brigada_Mes: 'Gestor Integral Multi', Ingresos: 3600000 },
  ];
}

async function runBot3() {
  console.log('\n================================================================');
  console.log('🤖 BOT 3: VALIDADOR DE CRUCE ENTRE FILTROS GLOBALES Y LOCALES');
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

  const rawRows = createMockRawData();

  // Test Suite 3.1: Filtro Global de Proyecto
  console.log('--- Test Suite 3.1: Filtro Global de Proyecto (filtRaw) ---');
  const fSur = { proy: 'Sur', zona: 'ALL', mes: [], fecha: 'ALL', proceso: 'ALL' };
  const rowsSur = filtRaw(rawRows, fSur);
  assert('Filtro Global proy = Sur incluye registros de Juan Perez y registro inicial de Luis Diaz', rowsSur.length === 6);
  assert('Registros de Norte-Centro son excluidos en proy = Sur', rowsSur.every(r => r._Proyecto === 'Sur'));

  const fNorte = { proy: 'Norte-Centro', zona: 'ALL', mes: [], fecha: 'ALL', proceso: 'ALL' };
  const rowsNorte = filtRaw(rawRows, fNorte);
  assert('Filtro Global proy = Norte-Centro incluye registros de Carlos Gomez y Luis Diaz', rowsNorte.length === 5);
  assert('Registros de Sur son excluidos en proy = Norte-Centro', rowsNorte.every(r => r._Proyecto === 'Norte-Centro'));

  // Test Suite 3.2: Filtro Global de Proceso (SCR vs GESTOR)
  console.log('\n--- Test Suite 3.2: Filtro Global de Proceso ---');
  const fGestor = { proy: 'ALL', zona: 'ALL', mes: [], fecha: 'ALL', proceso: 'GESTOR' };
  const rowsGestor = filtRaw(rawRows, fGestor);
  assert('Filtro proceso = GESTOR solo retorna registros de Gestor Integral Multi (Luis Diaz)', 
    rowsGestor.length === 4 && rowsGestor.every(r => r.Tipo_Brigada_Mes === 'Gestor Integral Multi')
  );

  // Test Suite 3.3: Eje Temporal Adaptable (porDia: true vs false)
  console.log('\n--- Test Suite 3.3: Eje Temporal Adaptable (porDia) ---');
  
  // Caso 1: Varios meses seleccionados -> porDia = false
  const fMultiMes = { proy: 'ALL', zona: 'ALL', mes: ['2026-06', '2026-07', '2026-08', '2026-09'], fecha: 'ALL', proceso: 'ALL' };
  const porDiaMulti = fMultiMes.mes.length === 1;
  assert('Con 4 meses seleccionados porDia es FALSE (agrupación mensual)', porDiaMulti === false);

  // En vista mensual Carlos Gomez tuvo 0 en 08 y 09 => BAJA
  const monthlyCarlos = [
    { monthLabel: '2026-06', val: 3500000 },
    { monthLabel: '2026-07', val: 3800000 },
    { monthLabel: '2026-08', val: 0 },
    { monthLabel: '2026-09', val: 0 }
  ];
  const estadoCarlosMensual = getEstadoTecnico(monthlyCarlos, porDiaMulti);
  assert('Carlos Gomez tiene estado BAJA en vista mensual por 2 meses inactivo', estadoCarlosMensual === 'BAJA');

  // Caso 2: Un solo mes seleccionado -> porDia = true
  const fSoloAgosto = { proy: 'ALL', zona: 'ALL', mes: ['2026-08'], fecha: 'ALL', proceso: 'ALL' };
  const porDiaAgosto = fSoloAgosto.mes.length === 1;
  assert('Con 1 solo mes seleccionado porDia es TRUE (agrupación diaria)', porDiaAgosto === true);

  // En agosto Juan Perez tuvo actividad => ACTIVO en vista diaria
  const dailyJuanAgosto = [
    { monthLabel: '2026-08-10', val: 2000000 },
    { monthLabel: '2026-08-20', val: 2500000 }
  ];
  const estadoJuanAgosto = getEstadoTecnico(dailyJuanAgosto, porDiaAgosto);
  assert('Juan Perez tiene estado ACTIVO en vista diaria de agosto (>0 en el mes)', estadoJuanAgosto === 'ACTIVO');

  // En agosto Carlos Gomez NO tuvo actividad => BAJA en vista diaria
  const dailyCarlosAgosto = [];
  const estadoCarlosAgosto = getEstadoTecnico(dailyCarlosAgosto, porDiaAgosto);
  assert('Carlos Gomez tiene estado BAJA en vista diaria de agosto (0 en el mes)', estadoCarlosAgosto === 'BAJA');

  // Caso 3: Validación de los 2 meses con ingresos $0 pero con órdenes asignadas (>0)
  const monthlyConOrdenesCeroIngresos = [
    { monthLabel: '2026-06', val: 3000000, orders: 120 },
    { monthLabel: '2026-07', val: 2500000, orders: 95 },
    { monthLabel: '2026-08', val: 0, orders: 80 },       // $0 ingresos pero 80 órdenes asignadas
    { monthLabel: '2026-09', val: 0, orders: 65 }        // $0 ingresos pero 65 órdenes asignadas
  ];
  const estadoTecCeroIngresos = getEstadoTecnico(monthlyConOrdenesCeroIngresos, porDiaMulti, false);
  assert('Técnico con $0 ingresos pero órdenes asignadas en los últimos 2 meses NO es BAJA (es ACTIVO)', estadoTecCeroIngresos === 'ACTIVO');

  // Caso 4: Registro oficial de RETIRO en tabla de novedades
  const dailyGregorioRetirado = [
    { monthLabel: '2026-09-05', val: 1500000, orders: 40 }
  ];
  const estadoGregorioRetiro = getEstadoTecnico(dailyGregorioRetirado, true, true);
  assert('Técnico con novedad formal de RETIRO se marca como BAJA aunque tenga órdenes en el mes', estadoGregorioRetiro === 'BAJA');

  // Test Suite 3.4: Filtro de Días Específicos
  console.log('\n--- Test Suite 3.4: Filtro de Días Específicos ---');
  const fDia15 = { proy: 'ALL', zona: 'ALL', mes: [], fecha: '15', proceso: 'ALL' };
  const rowsDia15 = filtRaw(rawRows, fDia15);
  assert('Filtro fecha = "15" solo retorna registros con día 15', 
    rowsDia15.length === 3 && rowsDia15.every(r => r.Fecha.endsWith('-15'))
  );

  const fDiasMulti = { proy: 'ALL', zona: 'ALL', mes: [], fecha: '10,20', proceso: 'ALL' };
  const rowsDiasMulti = filtRaw(rawRows, fDiasMulti);
  assert('Filtro fecha = "10,20" retorna registros de días 10 y 20',
    rowsDiasMulti.length === 3 && rowsDiasMulti.every(r => r.Fecha.endsWith('-10') || r.Fecha.endsWith('-20'))
  );

  // Test Suite 3.5: Centinela __NINGUNO__
  console.log('\n--- Test Suite 3.5: Centinela __NINGUNO__ ---');
  const fNinguno = { proy: 'ALL', zona: 'ALL', mes: [MES_NINGUNO], fecha: 'ALL', proceso: 'ALL' };
  const rowsNinguno = filtRaw(rawRows, fNinguno);
  assert('Filtro mes = [__NINGUNO__] retorna exactamente 0 registros de forma segura', rowsNinguno.length === 0);

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL BOT 3: ${passed} PASSED | ${failed} FAILED`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runBot3();
