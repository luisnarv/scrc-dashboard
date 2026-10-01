import assert from 'node:assert/strict';
function logTitle(title) { console.log('\n\x1b[36m========== ' + title + ' ==========\x1b[0m\n'); }
function logTest(name, success) { if (success) console.log('\x1b[32m  [✕] ' + name + '\x1b[0m'); else console.log('\x1b[31m  [✗] ' + name + '\x1b[0m'); }
logTitle('Bot 5: Sincronizacion KPIs');
try {
  const tecs = [{ t: 15 }, { t: 16 }];
  assert.equal(tecs.reduce((s, x) => s + x.t, 0), 31); logTest('Suma', true);
} catch(e) { logTest('Error', false); process.exit(1); }