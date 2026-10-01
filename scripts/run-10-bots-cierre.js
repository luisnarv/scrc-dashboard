#!/usr/bin/env node
const { spawn } = require('child_process');
const bots = ["bot-cierre-01.mjs","bot-cierre-02.mjs","bot-cierre-03.mjs","bot-cierre-04.mjs","bot-cierre-05.mjs","bot-cierre-06.mjs","bot-cierre-07.mjs","bot-cierre-08.mjs","bot-cierre-09.mjs","bot-cierre-10.mjs"];
console.log('\n INICIANDO SUITE DE 10 BOTS DE CIERRE DIARIO ');
let p = 0;
async function r() {
  for(let b of bots) {
    await new Promise(res => {
      let c = spawn('node', [require('path').join('scripts', b)], {stdio: 'inherit'});
      c.on('close', code => { if(code===0) p++; res(); });
    });
  }
  console.log('\n RESULTADO: ' + p + '/10 EXITOSOS \n');
}
r();
