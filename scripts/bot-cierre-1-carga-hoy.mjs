import assert from 'node:assert/strict';

async function runTest() {
  console.log('\n\x1b[36m========== Bot 1: Carga de Datos (HOY) ==========\x1b[0m\n');
  try {
    const res = await fetch('http://localhost:3000/api/data/cierre_diario');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    assert.ok(data.ordenesAgrupadas, 'Falta ordenesAgrupadas');
    assert.ok(data.barriosHoras, 'Falta barriosHoras');
    assert.ok(data.tecnicos, 'Falta tecnicos');
    
    console.log('\x1b[32m  [OK] \x1b[0m Endpoint de Cierre Diario responde correctamente para HOY');
    console.log('\x1b[32m  [OK] \x1b[0m Se encontraron', data.ordenesAgrupadas.length, 'grupos de órdenes');
    console.log('\x1b[32m  [OK] \x1b[0m Se encontraron', data.barriosHoras.length, 'registros de horas');
  } catch (err) {
    console.log('\x1b[31m  [FAIL] \x1b[0m', err.message);
  }
}
runTest();
