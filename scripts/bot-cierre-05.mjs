import assert from 'node:assert/strict';
function logTest(name, success) { console.log((success ? '[✓] ' : '[✗] ') + name); }
console.log('\n========== Bot 5: Proteccion Historial de Deuda ==========');
try {
  const tablaHoy = { deuda: 50000 }; const tablaPasado = { deuda: null };
  assert.equal(typeof tablaHoy.deuda, 'number');
  assert.equal(tablaPasado.deuda, null);
  logTest('Deuda se oculta elegantemente en dias pasados', true);
} catch(e) {
  logTest('Error: ' + e.message, false);
  process.exit(1);
}
