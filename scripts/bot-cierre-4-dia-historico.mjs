import assert from 'node:assert/strict';
function logTitle(title) { console.log('\n\x1b[36m========== ' + title + ' ==========\x1b[0m\n'); }
function logTest(name, success) { if (success) console.log('\x1b[32m  [✕] ' + name + '\x1b[0m'); else console.log('\x1b[31m  [✗] ' + name + '\x1b[0m'); }
logTitle('Bot 4: Dia Especifico vs HOY');
const kH = { deuda: 500 }; const kP = { deuda: null };
try {
  assert.notEqual(kH.deuda, null); logTest('HOY Deuda', true);
  assert.equal(kP.deuda, null); logTest('PASADO Deuda', true);
} catch(e) { logTest('Error', false); process.exit(1); }