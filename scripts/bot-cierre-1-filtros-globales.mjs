import assert from 'node:assert/strict';
function logTitle(title) { console.log('\n\x1b[36m========== ' + title + ' ==========\x1b[0m\n'); }
function logTest(name, success) { if (success) console.log('\x1b[32m  [✕] ' + name + '\x1b[0m'); else console.log('\x1b[31m  [✗] ' + name + '\x1b[0m'); }
logTitle('Bot 1: Filtros Globales');
const mockData = [{ proyecto: 'Sur', zona: 'Sur', fecha: '2026-09-24' }, { proyecto: 'Norte', zona: 'Norte', fecha: '2026-09-24' }];
function f(data, p, z) { return data.filter(r => (p==='ALL'||r.proyecto===p) && (z==='ALL'||r.zona===z)); }
try {
  assert.equal(f(mockData, 'ALL', 'ALL').length, 2*N���\�
	�����N�B�\��\��\]X[
�[���]K	��\��	�S	�K�[��JN���\�
	��\��N�B�H�]�
JH�B��ۜ��K�\��܊JN�B����\�˙^]
JN�B�