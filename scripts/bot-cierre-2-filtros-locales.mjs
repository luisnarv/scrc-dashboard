import assert from 'node:assert/strict';
function logTitle(title) { console.log('\n\x1b[36m========== ' + title + ' ==========\x1b[0m\n'); }
function logTest(name, success) { if (success) console.log('\x1b[32m  [✕] ' + name + '\x1b[0m'); else console.log('\x1b[31m  [✗] ' + name + '\x1b[0m'); }
logTitle('Bot 2: Filtros Locales');
const mockData = [{ municipio: 'A', barrio: 'B', tecnico: 'C' }, { municipio: 'X', barrio: 'Y', tecnico: 'No asignado' }];
function f(data, m, t) { return data.filter(r => (m==='ALL'||r.municipio===m) && (t==='ALL'||r.tecnico===t)); }
try {
  assert.equal(f(mockData, 'A', 'ALL').length, 1); logTest('Municipio A', true);
  assert.equal(f(mockData, 'ALL', 'No asignado').length, 1); logTest('No asignado', true);
} catch(e) { logTest('Error', false); process.exit(1); }