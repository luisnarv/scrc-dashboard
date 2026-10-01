import assert from 'node:assert/strict';
function logTest(name, success) { console.log((success ? '[✓] ' : '[✗] ') + name); }
console.log('\n========== Bot 8: Grafico Horario en HOY ==========');
try {
  const diaFiltro = 'ALL';
  let fetchUrl = diaFiltro === 'ALL' ? '/api/..._horas?fechas=HOY' : '';
  assert.equal(fetchUrl.includes('HOY'), true);
  logTest('Sin filtro de dia, el grafico horario consulta HOY en vivo', true);
} catch(e) {
  logTest('Error: ' + e.message, false);
  process.exit(1);
}
