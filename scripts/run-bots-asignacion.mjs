#!/usr/bin/env node

/**
 * ==============================================================================
 * RUNNER MAESTRO: ORQUESTADOR DE LOS 4 BOTS DE ASIGNACIÓN OPERATIVA
 * ==============================================================================
 * Ejecuta en secuencia los 4 bots de prueba funcional especializados:
 *   🤖 BOT 1: bot-asignacion-1-filtros.mjs (Filtros y Mapeo Multidimensional)
 *   🤖 BOT 2: bot-asignacion-2-evolutivo-chart.mjs (Evolutivo, Días del Mes y Etiquetas)
 *   🤖 BOT 3: bot-asignacion-3-metricas-kpis.mjs (Cálculos, Promedios y Líder)
 *   🤖 BOT 4: bot-asignacion-4-api-db.mjs (Integración v_ordenes_dia_barrio y v_ordenes_dia)
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
    name: 'Filtros y Mapeo Multidimensional',
    file: 'bot-asignacion-1-filtros.mjs',
    desc: 'proyCoincide (Sur, Norte-Centro), zonaCoincide, municipios, búsqueda y Top N',
  },
  {
    id: 'BOT 2',
    name: 'Gráfico Evolutivo y Eje Temporal',
    file: 'bot-asignacion-2-evolutivo-chart.mjs',
    desc: 'Días del mes en Eje X, Datasets por barrio, Línea de Promedio y Etiquetas (Data Labels)',
  },
  {
    id: 'BOT 3',
    name: 'Cálculos y Métricas KPI',
    file: 'bot-asignacion-3-metricas-kpis.mjs',
    desc: 'Sumatorias de órdenes, promedio por barrio, detección de barrio líder y deduplicación',
  },
  {
    id: 'BOT 4',
    name: 'Integración Base de Datos y API',
    file: 'bot-asignacion-4-api-db.mjs',
    desc: 'analitica.v_ordenes_dia_barrio, analitica.v_ordenes_dia y endpoint /api/data/asignacion_operativa',
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
        exitCode: code,
        durationMs,
      });
    });

    child.on('error', (err) => {
      const durationMs = Date.now() - startTime;
      resolve({
        ...bot,
        success: false,
        exitCode: 1,
        error: err.message,
        durationMs,
      });
    });
  });
}

async function runAll() {
  const globalStart = Date.now();

  console.log('\n========================================================================');
  console.log('🚀 INICIANDO BATERÍA DE 4 BOTS: ASIGNACIÓN OPERATIVA & GRÁFICO EVOLUTIVO');
  console.log('========================================================================\n');

  const results = [];
  for (const bot of BOTS) {
    const res = await runSingleBot(bot);
    results.push(res);
  }

  const globalDuration = ((Date.now() - globalStart) / 1000).toFixed(2);
  const allPassed = results.every(r => r.success);

  console.log('\n========================================================================');
  console.log('📊 RESUMEN CONSOLIDADO DE LOS 4 BOTS DE ASIGNACIÓN OPERATIVA');
  console.log('========================================================================');

  results.forEach(r => {
    const statusIcon = r.success ? '✔ [EXITOSO]' : '✖ [FALLÓ]  ';
    const timeStr = `${r.durationMs}ms`.padStart(7);
    console.log(` ${statusIcon} ${r.id}: ${r.name.padEnd(35)} (${timeStr})`);
    console.log(`             └─ ${r.desc}`);
  });

  console.log('========================================================================');
  if (allPassed) {
    console.log(`ESTADO GENERAL: ✅ TODOS LOS 4 BOTS PASARON AL 100%`);
  } else {
    console.log(`ESTADO GENERAL: ❌ SE DETECTARON FALLOS EN LA EJECUCIÓN`);
  }
  console.log(`TIEMPO TOTAL:   ${globalDuration}s`);
  console.log('========================================================================\n');

  process.exit(allPassed ? 0 : 1);
}

runAll();
