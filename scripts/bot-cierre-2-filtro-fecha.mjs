import assert from 'node:assert/strict';

async function runTest() {
  console.log('\n\x1b[36m========== Bot 2: Filtro de Fecha Histórica ==========\x1b[0m\n');
  try {
    const targetDate = '2026-09-24';
    const res = await fetch(`http://localhost:3000/api/data/cierre_diario?fechas=${targetDate}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    assert.ok(data.ordenesAgrupadas, 'Falta ordenesAgrupadas');
    
    const hasPendientes = data.ordenesAgrupadas.some(o => o.estado === 'ASIGNADA' || o.estado === 'Pendiente');
    
    console.log('\x1b[32m  [OK] \x1b[0m Endpoint responde correctamente para fecha', targetDate);
    console.log('\x1b[32m  [OK] \x1b[0m Se encontraron', data.ordenesAgrupadas.length, 'grupos de órdenes en el historial');
    if (!hasPendientes) {
      console.log('\x1b[32m  [OK] \x1b[0m El historial solo muestra estados cerrados (Ejecutada/Baja) como se espera');
    } else {
      console.log('\x1b[31m  [FAIL] \x1b[0m Se encontraron órdenes pendientes en el historial');
    }
  } catch (err) {
    console.log('\x1b[31m  [FAIL] \x1b[0m', err.message);
  }
}
runTest();
