#!/usr/bin/env node

/**
 * ==============================================================================
 * RUNNER MAESTRO: ORQUESTADOR DE LOS 4 BOTS DE PRUEBA - /tecnico/productivo
 * ==============================================================================
 * Ejecuta en secuencia los 4 bots de prueba funcional especializados:
 *   🤖 BOT 1: bot-productivo-1-local-filters.mjs (Filtros Locales y Búsqueda)
 *   🤖 BOT 2: bot-productivo-2-cascade-filters.mjs (Cascada y Auto-Reseteo)
 *   🤖 BOT 3: bot-productivo-3-cross-filters.mjs (Cruce Global vs Local)
 *   🤖 BOT 4: bot-productivo-4-math-pagination.mjs (Cálculos y Paginación)
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
    name: 'Filtros Locales y Búsqueda',
    file: 'bot-productivo-1-local-filters.mjs',
    desc: 'Buscador q, Categoría, Estado, Movilidad, Tendencia, Orden y Reseteo a página 1'
  },
  {
    id: 'BOT 2',
    name: 'Cascada y Auto-Reseteo de Brigadas',
    file: 'bot-productivo-2-cascade-filters.mjs',
    desc: 'filteredAvailableBrigadas dinámico, auto-reseteo a ALL y aislamiento Sección 1 vs 2'
  },
  {
    id: 'BOT 3',
    name: 'Cruce Filtros Globales vs Locales',
    file: 'bot-productivo-3-cross-filters.mjs',
    desc: 'filtRaw (proy, zona, fecha), proceso (SCR vs GESTOR) y porDia (diario vs mensual)'
  },
  {
    id: 'BOT 4',
    name: 'Cálculos Matemáticos y Paginación',
    file: 'bot-productivo-4-math-pagination.mjs',
    desc: 'Regresión lineal calcSlope, trendPct, semáforos vs media y 24 tarjetas/página'
  }
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
        durationMs
      });
    });

    child.on('error', (err) => {
      const durationMs = Date.now() - startTime;
      console.error(`Error lanzando ${bot.file}:`, err);
      resolve({
        ...bot,
        success: false,
        code: 1,
        durationMs
      });
    });
  });
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║   SUITE DE PRUEBAS FUNCIONALES AUTOMATIZADAS - /tecnico/productivo     ║');
  console.log('║   Iniciando ejecución de los 4 Bots Especializados...                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');

  const globalStart = Date.now();
  const results = [];

  for (const bot of BOTS) {
    const res = await runSingleBot(bot);
    results.push(res);
  }

  const globalDuration = ((Date.now() - globalStart) / 1000).toFixed(2);
  const allPassed = results.every(r => r.success);

  console.log('\n========================================================================');
  console.log('📊 RESUMEN CONSOLIDADO DE LOS 4 BOTS DE /PRODUCTIVO');
  console.log('========================================================================');

  results.forEach(r => {
    const icon = r.success ? '✔ [EXITOSO]' : '✖ [FALLÓ]  ';
    console.log(` ${icon} ${r.id}: ${r.name.padEnd(38)} (${r.durationMs}ms)`);
    console.log(`             └─ ${r.desc}`);
  });

  console.log('========================================================================');
  console.log(`ESTADO GENERAL: ${allPassed ? '✅ TODOS LOS BOTS PASARON AL 100%' : '❌ HUBO ERRORES EN LA SUITE'}`);
  console.log(`TIEMPO TOTAL:   ${globalDuration}s`);
  console.log('========================================================================\n');

  process.exit(allPassed ? 0 : 1);
}

main();
