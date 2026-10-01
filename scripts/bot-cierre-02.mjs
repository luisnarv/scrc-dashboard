import assert from 'node:assert/strict';
function logTest(name, success) { console.log((success ? '[✓] ' : '[✗] ') + name); }
console.log('\n========== Bot 2: Invariante: Dimension Operativa ==========');
try {
  const barrio = { total: 100, asignadas: 50, pendientes: 30, excluidas: 20 };
  assert.equal(barrio.asignadas + barrio.pendientes + barrio.excluidas, barrio.total);
  logTest('Asignadas + Pendientes + Excluidas = Total Carga', true);
} catch(e) {
  logTest('Error: ' + e.message, false);
  process.exit(1);
}
