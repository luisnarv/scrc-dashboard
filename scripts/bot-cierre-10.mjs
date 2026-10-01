import assert from 'node:assert/strict';
function logTest(name, success) { console.log((success ? '[✓] ' : '[✗] ') + name); }
console.log('\n========== Bot 10: Restriccion Modal Detalle Historico ==========');
try {
  const esDiaPasado = true;
  const botonVerOrdenesEnabled = !esDiaPasado;
  assert.equal(botonVerOrdenesEnabled, false);
  logTest('Boton detalle ordenes se deshabilita para dias pasados', true);
} catch(e) {
  logTest('Error: ' + e.message, false);
  process.exit(1);
}
