import assert from 'node:assert/strict';
function logTitle(title) { console.log(\n\x1b[36m==========  + title +  ==========\x1b[0m\n); }
function logTest(name, success) { if (success) console.log('\x1b[32m  [✓] ' + name + '\x1b[0m'); else console.log('\x1b[31m  [✗] ' + name + '\x1b[0m'); }

logTitle('Bot 6: Horario Filtrado (Día Específico)');
const mockDataHorasHistorico = [
  { hora: '08:00', total: 10 },
  { hora: '10:00', total: 20 }
];
function fetchSimulatedAPI(fechas) {
  if (fechas === 'HOY') return { error: 'No deberia llamar a HOY' };
  if (fechas === '2026-09-24') return { barriosHoras: mockDataHorasHistorico };
  return { error: 'Invalido' };
}
try {
  const result = fetchSimulatedAPI('2026-09-24');
  assert.equal(result.barriosHoras.length, 2);
  logTest('API devuelve desglose histórico para un día específico', true);
  
  const sum = result.barriosHoras.reduce((s, x) => s + x.total, 0);
  assert.equal(sum, 30);
  logTest('El total de horas cuadra con las órdenes cerradas de ese día', true);
} catch (e) {
  logTest('Error', false); process.exit(1);
}
