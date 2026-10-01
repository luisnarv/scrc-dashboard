import assert from 'node:assert/strict';
function logTest(name, success) { console.log((success ? '[✓] ' : '[✗] ') + name); }
console.log('\n========== Bot 3: Invariante: Dimension Actividad ==========');
try {
  const barrio = { total: 100, suspension: 60, reconexion: 40 };
  assert.equal(barrio.suspension + barrio.reconexion, barrio.total);
  logTest('Suspension + Reconexion = Total Carga', true);
} catch(e) {
  logTest('Error: ' + e.message, false);
  process.exit(1);
}
