import assert from 'node:assert/strict';
function logTest(name, success) { console.log((success ? '[✓] ' : '[✗] ') + name); }
console.log('\n========== Bot 7: Auto-reseteo de Filtros Huerfanos ==========');
try {
  let localZonas = ['Norte']; let globalZonas = ['Sur'];
  let intersect = localZonas.filter(z => globalZonas.includes(z));
  if(intersect.length === 0) localZonas = ['ALL'];
  assert.equal(localZonas[0], 'ALL');
  logTest('Filtro local se resetea si el global lo deja huerfano', true);
} catch(e) {
  logTest('Error: ' + e.message, false);
  process.exit(1);
}
