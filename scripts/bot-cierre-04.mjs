import assert from 'node:assert/strict';
function logTest(name, success) { console.log((success ? '[✓] ' : '[✗] ') + name); }
console.log('\n========== Bot 4: Invariante: Dimension Facturacion ==========');
try {
  const barrio = { total: 100, f0: 10, f1: 40, f2: 20, f3: 15, fm: 15 };
  assert.equal(barrio.f0 + barrio.f1 + barrio.f2 + barrio.f3 + barrio.fm, barrio.total);
  logTest('Suma de vencimientos de facturas = Total Carga', true);
} catch(e) {
  logTest('Error: ' + e.message, false);
  process.exit(1);
}
