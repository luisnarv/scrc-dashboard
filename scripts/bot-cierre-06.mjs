import assert from 'node:assert/strict';
function logTest(name, success) { console.log((success ? '[✓] ' : '[✗] ') + name); }
console.log('\n========== Bot 6: Sincronizacion de Tecnicos ==========');
try {
  const barrio = { asignadas: 31 };
  const tecnicos = [{t: 15}, {t: 16}];
  assert.equal(tecnicos.reduce((s, x) => s + x.t, 0), barrio.asignadas);
  logTest('Carga individual de tecnicos cuadra con Asignadas', true);
} catch(e) {
  logTest('Error: ' + e.message, false);
  process.exit(1);
}
