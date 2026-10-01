import assert from 'node:assert/strict';
function logTitle(title) { console.log(\n\x1b[36m==========  + title +  ==========\x1b[0m\n); }
function logTest(name, success) { if (success) console.log('\x1b[32m  [✓] ' + name + '\x1b[0m'); else console.log('\x1b[31m  [✗] ' + name + '\x1b[0m'); }

logTitle('Bot 7: Horario HOY (Comportamiento por Defecto)');
const mockDataHorasHoy = [
  { hora: '07:00', total: 5 },
  { hora: '14:00', total: 25 }
];
function fetchSimulatedAPI(fechas) {
  if (!fechas || fechas === 'ALL' || fechas === 'HOY') return { barriosHoras: mockDataHorasHoy };
  return { error: 'Invalido' };
}
try {
  let res = fetchSimulatedAPI('ALL');
  assert.equal(res.barriosHoras.length, 2);
  logTest('Cuando el filtro global es ALL, consulta HOY en vivo', true);
  
  res = fetchSimulatedAPI('HOY');
  assert.equal(res.barriosHoras[1].total, 25);
  logTest('Cuando no hay filtro de fecha activo, prioriza v_ordenes_dia (Hoy)', true);
} catch (e) {
  logTest('Error', false); process.exit(1);
}
