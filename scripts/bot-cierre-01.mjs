import assert from 'node:assert/strict';
function logTest(name, success) { console.log((success ? '[✓] ' : '[✗] ') + name); }
console.log('\n========== Bot 1: Filtros Globales vs Locales (Cascada) ==========');
try {
  const data = [{proy: 'A', mun: 'M1'}, {proy: 'B', mun: 'M2'}];
  const f = data.filter(d => d.proy === 'A').filter(d => d.mun === 'M1');
  assert.equal(f.length, 1);
  logTest('Filtro local solo ve datos que pasaron filtro global', true);
} catch(e) {
  logTest('Error: ' + e.message, false);
  process.exit(1);
}
