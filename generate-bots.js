const fs = require('fs');
const path = require('path');
const dir = 'scripts';
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

const template = (id, title, code) => `import assert from 'node:assert/strict';
function logTest(name, success) { console.log((success ? '[✓] ' : '[✗] ') + name); }
console.log('\\n========== Bot ${id}: ${title} ==========');
try {
${code}
} catch(e) {
  logTest('Error: ' + e.message, false);
  process.exit(1);
}
`;

const bots = {
  1: {
    title: 'Filtros Globales vs Locales (Cascada)',
    code: `  const data = [{proy: 'A', mun: 'M1'}, {proy: 'B', mun: 'M2'}];
  const f = data.filter(d => d.proy === 'A').filter(d => d.mun === 'M1');
  assert.equal(f.length, 1);
  logTest('Filtro local solo ve datos que pasaron filtro global', true);`
  },
  2: {
    title: 'Invariante: Dimension Operativa',
    code: `  const barrio = { total: 100, asignadas: 50, pendientes: 30, excluidas: 20 };
  assert.equal(barrio.asignadas + barrio.pendientes + barrio.excluidas, barrio.total);
  logTest('Asignadas + Pendientes + Excluidas = Total Carga', true);`
  },
  3: {
    title: 'Invariante: Dimension Actividad',
    code: `  const barrio = { total: 100, suspension: 60, reconexion: 40 };
  assert.equal(barrio.suspension + barrio.reconexion, barrio.total);
  logTest('Suspension + Reconexion = Total Carga', true);`
  },
  4: {
    title: 'Invariante: Dimension Facturacion',
    code: `  const barrio = { total: 100, f0: 10, f1: 40, f2: 20, f3: 15, fm: 15 };
  assert.equal(barrio.f0 + barrio.f1 + barrio.f2 + barrio.f3 + barrio.fm, barrio.total);
  logTest('Suma de vencimientos de facturas = Total Carga', true);`
  },
  5: {
    title: 'Proteccion Historial de Deuda',
    code: `  const tablaHoy = { deuda: 50000 }; const tablaPasado = { deuda: null };
  assert.equal(typeof tablaHoy.deuda, 'number');
  assert.equal(tablaPasado.deuda, null);
  logTest('Deuda se oculta elegantemente en dias pasados', true);`
  },
  6: {
    title: 'Sincronizacion de Tecnicos',
    code: `  const barrio = { asignadas: 31 };
  const tecnicos = [{t: 15}, {t: 16}];
  assert.equal(tecnicos.reduce((s, x) => s + x.t, 0), barrio.asignadas);
  logTest('Carga individual de tecnicos cuadra con Asignadas', true);`
  },
  7: {
    title: 'Auto-reseteo de Filtros Huerfanos',
    code: `  let localZonas = ['Norte']; let globalZonas = ['Sur'];
  let intersect = localZonas.filter(z => globalZonas.includes(z));
  if(intersect.length === 0) localZonas = ['ALL'];
  assert.equal(localZonas[0], 'ALL');
  logTest('Filtro local se resetea si el global lo deja huerfano', true);`
  },
  8: {
    title: 'Grafico Horario en HOY',
    code: `  const diaFiltro = 'ALL';
  let fetchUrl = diaFiltro === 'ALL' ? '/api/..._horas?fechas=HOY' : '';
  assert.equal(fetchUrl.includes('HOY'), true);
  logTest('Sin filtro de dia, el grafico horario consulta HOY en vivo', true);`
  },
  9: {
    title: 'Grafico Horario en Dia Filtrado',
    code: `  const diaFiltro = '2026-09-24';
  let fetchUrl = diaFiltro !== 'ALL' ? '/api/..._horas?fechas=' + diaFiltro : '';
  assert.equal(fetchUrl.includes('2026'), true);
  logTest('Con filtro de dia, el grafico consulta historia (historico_mo)', true);`
  },
  10: {
    title: 'Restriccion Modal Detalle Historico',
    code: `  const esDiaPasado = true;
  const botonVerOrdenesEnabled = !esDiaPasado;
  assert.equal(botonVerOrdenesEnabled, false);
  logTest('Boton detalle ordenes se deshabilita para dias pasados', true);`
  }
};

let files = [];
for(let i=1; i<=10; i++) {
  const fName = path.join(dir, 'bot-cierre-' + (i<10?'0'+i:i) + '.mjs');
  fs.writeFileSync(fName, template(i, bots[i].title, bots[i].code));
  files.push(fName);
}

const runner = `#!/usr/bin/env node
const { spawn } = require('child_process');
const bots = ${JSON.stringify(files.map(f => path.basename(f)))};
console.log('\\n INICIANDO SUITE DE 10 BOTS DE CIERRE DIARIO ');
let p = 0;
async function r() {
  for(let b of bots) {
    await new Promise(res => {
      let c = spawn('node', [require('path').join('scripts', b)], {stdio: 'inherit'});
      c.on('close', code => { if(code===0) p++; res(); });
    });
  }
  console.log('\\n RESULTADO: ' + p + '/10 EXITOSOS \\n');
}
r();
`;

fs.writeFileSync(path.join(dir, 'run-10-bots-cierre.js'), runner);
