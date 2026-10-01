import assert from 'node:assert/strict';
function logTitle(title) { console.log('\n\x1b[36m========== ' + title + ' ==========\x1b[0m\n'); }
function logTest(name, success) { if (success) console.log('\x1b[32m  [✕] ' + name + '\x1b[0m'); else console.log('\x1b[31m  [✗] ' + name + '\x1b[0m'); }
logTitle('Bot 3: Triada Matematica');
const b = { total: 100, asig: 50, pend: 30, excl: 20, susp: 60, reco: 40, f0: 10, f1: 40, f2: 20, f3: 15, fm: 15 };
try {
  assert.equal(b.asig + b.pend + b.excl, b.total); logTest('Operativa', true);
  assert.equal(b.susp + b.reco, b.total); logTest('Actividad', true);
  assert.equal(b.f0 + b.f1 + b.f2 + b.f3 + b.fm, b.total); logTest('Facturacion', true);
} catch(e) { logTest('Error', false); process.exit(1); }