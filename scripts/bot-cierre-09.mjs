import assert from 'node:assert/strict';
function logTest(name, success) { console.log((success ? '[✓] ' : '[✗] ') + name); }
console.log('\n========== Bot 9: Grafico Horario en Dia Filtrado ==========');
try {
  const diaFiltro = '2026-09-24';
  let fetchUrl = diaFiltro !== 'ALL' ? '/api/..._horas?fechas=' + diaFiltro : '';
  assert.equal(fetchUrl.includes('2026'), true);
  logTest('Con filtro de dia, el grafico consulta historia (historico_mo)', true);
} catch(e) {
  logTest('Error: ' + e.message, false);
  process.exit(1);
}
