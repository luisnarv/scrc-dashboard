#!/usr/bin/env node

/**
 * ==============================================================================
 * RUNNER MAESTRO: ORQUESTADOR DE LOS 3 BOTS DE VALIDACIÓN DE FILTROS
 * ==============================================================================
 * Ejecuta en secuencia los 3 bots de prueba de filtros:
 *   - BOT 1: bot-filtros-1-funcionalidad-cascada.mjs
 *   - BOT 2: bot-filtros-2-solo-datos-existentes.mjs (Validador exclusivo de datos reales)
 *   - BOT 3: bot-filtros-3-combinaciones-consistencia.mjs
 *
 * Imprime resumen ejecutivo consolidado con tiempos de ejecución y estado.
 * ==============================================================================
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BOTS = [
  {
    id: 'BOT 1',
    name: 'Funcionalidad General y Cascada',
    file: 'bot-filtros-1-funcionalidad-cascada.mjs',
    desc: 'Filtro por Proyecto, Zona, Municipio, Tipo OS, Asignación, Técnico y Reseteo global',
  },
  {
    id: 'BOT 2',
    name: 'Filtros Basados Exclusivamente en Datos Reales',
    file: 'bot-filtros-2-solo-datos-existentes.mjs',
    desc: 'Cero opciones huérfanas/vacías en toda la página y auto-reseteo reactivo ante cambios',
  },
  {
    id: 'BOT 3',
    name: 'Combinaciones Cruzadas y Consistencia Matemática',
    file: 'bot-filtros-3-combinaciones-consistencia.mjs',
    desc: 'Invariante Asignadas + Pendientes == Total, consistencia de cards y rangos porcentuales',
  },
];

function runSingleBot(bot) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const scriptPath = join(__dirname, bot.file);
    const child = spawn(process.execPath, [scriptPath], { stdio: 'inherit' });

    child.on('close', (code) => {
      const durationMs = Date.now() - startTime;
      resolve({
        ...bot,
        success: code === 0,
        code,
        durationMs,
      });
    });

    child.on('error', (err) => {
      const durationMs = Date.now() - startTime;
      console.error(`Error ejecutando ${bot.file}:`, err);
      resolve({
        ...bot,
        success: false,
        code: 1,
        durationMs,
      });
    });
  });
}

async function runAll() {
  console.log('================================================================================');
  console.log('SUITE DE VALIDACIÓN: 3 BOTS DE FILTROS - ASIGNACIÓN OPERATIVA Y METAS');
  console.log('================================================================================');
  console.log(`Fecha y Hora: ${new Date().toISOString()}`);
  console.log(`Bots a ejecutar: ${BOTS.length}\n`);

  const results = [];
  const globalStart = Date.now();

  for (const bot of BOTS) {
    const res = await runSingleBot(bot);
    results.push(res);
    console.log('');
  }

  const globalDurationSec = ((Date.now() - globalStart) / 1000).toFixed(2);
  const totalPassed = results.filter(r => r.success).length;
  const totalFailed = results.filter(r => !r.success).length;

  console.log('================================================================================');
  console.log('RESUMEN EJECUTIVO CONSOLIDADO - 3 BOTS DE FILTROS');
  console.log('================================================================================');
  results.forEach(r => {
    const tag = r.success ? '[PASS]' : '[FAIL]';
    const time = `${(r.durationMs / 1000).toFixed(2)}s`;
    console.log(`  ${tag} ${r.id}: ${r.name.padEnd(48)} (${time})`);
  });
  console.log('--------------------------------------------------------------------------------');
  console.log(`ESTADO GLOBAL: ${totalPassed}/${BOTS.length} Bots aprobados en ${globalDurationSec}s`);

  if (totalFailed > 0) {
    console.log(`RESULTADO: FALLÓ (${totalFailed} bot(s) fallaron)`);
    console.log('================================================================================\n');
    process.exit(1);
  } else {
    console.log('RESULTADO: APROBADO AL 100%');
    console.log('================================================================================\n');
    process.exit(0);
  }
}

runAll();
