#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
const bots = ['bot-cierre-6-horario-filtrado.mjs', 'bot-cierre-7-horario-hoy.mjs', 'bot-cierre-1-filtros-globales.mjs', 'bot-cierre-2-filtros-locales.mjs', 'bot-cierre-3-triada-matematica.mjs', 'bot-cierre-4-dia-historico.mjs', 'bot-cierre-5-sincronizacion-kpis.mjs'];
async function run() {
  console.log('\n\x1b[36m🚀 INICIANDO SUITE DE VALIDACION: CIERRE DIARIO (7 BOTS)\x1b[0m');
  let passed = 0;
  for (const bot of bots) {
    await new Promise(resolve => {
      const p = spawn('node', [path.join('scripts', bot)], { stdio: 'inherit' });
      p.on('close', code => { if (code === 0) passed++; resolve(); });
    });
  }
  console.log('\n\x1b[36m✨ EJECUCION FINALIZADA. BOTS EXITOSOS: ' + passed + '/' + bots.length + '\x1b[0m\n');
}
run();

