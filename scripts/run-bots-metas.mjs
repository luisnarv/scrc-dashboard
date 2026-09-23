#!/usr/bin/env node

/**
 * ==============================================================================
 * 🚀 RUNNER MAESTRO: BATERÍA DE 4 BOTS PARA METAS DE ÓRDENES POR ZONA Y BRIGADA
 * ==============================================================================
 * Ejecuta en secuencia:
 *  - 🤖 BOT 1: Reglas Oficiales de Metas (L-V, Sáb, Dom, Norte-Centro y Sur)
 *  - 🤖 BOT 2: Cálculos Matemáticos, Porcentajes y Cumplimiento vs Asignado
 *  - 🤖 BOT 3: Filtros Cruzados, Combinaciones y Ordenamiento Multidimensional
 *  - 🤖 BOT 4: Integración en Vivo con PostgreSQL y API
 * ==============================================================================
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const bots = [
  {
    name: 'BOT 1: Reglas Oficiales de Metas por Zona y Brigada',
    script: 'scripts/bot-metas-1-reglas-oficiales.mjs',
    desc: 'L-V, Sábados (75%), Domingos, Norte-Centro (20, 25, 15, 11, 18) y Sur (23, 20, 15, 8, 11)',
  },
  {
    name: 'BOT 2: Cálculos, Porcentajes y Cumplimiento vs Asignado',
    script: 'scripts/bot-metas-2-calculos-porcentajes.mjs',
    desc: 'Meta Total, % Asignado vs Meta, % Cumplido vs Asignado, Brechas y Semáforos de Color',
  },
  {
    name: 'BOT 3: Filtros Cruzados, Combinaciones y Ordenamiento',
    script: 'scripts/bot-metas-3-filtros-combinaciones.mjs',
    desc: 'Proyecto, Zona, Tipo de Brigada, Cobertura, Ordenamientos y Totales Dinámicos',
  },
  {
    name: 'BOT 4: Integración en Vivo de Base de Datos y API',
    script: 'scripts/bot-metas-4-integracion-api-db.mjs',
    desc: 'dbanalitica.maestro_brigadas, analitica.v_ordenes_dia y endpoint /api/data/cierre_diario',
  },
];

console.log('\n========================================================================');
console.log('🚀 INICIANDO BATERÍA DE 4 BOTS: METAS DE ÓRDENES, ASIGNACIÓN Y CUMPLIMIENTO');
console.log('========================================================================\n');

let allPassed = true;
const results = [];
const startTotal = Date.now();

for (const b of bots) {
  const t0 = Date.now();
  const proc = spawnSync('node', [b.script], {
    stdio: 'inherit',
    encoding: 'utf-8',
    cwd: process.cwd(),
  });

  const duration = Date.now() - t0;
  const isOk = proc.status === 0;
  if (!isOk) allPassed = false;

  results.push({
    name: b.name,
    desc: b.desc,
    ok: isOk,
    time: duration,
  });
}

console.log('\n========================================================================');
console.log('📊 RESUMEN CONSOLIDADO DE LOS 4 BOTS DE METAS DE ÓRDENES');
console.log('========================================================================');

for (const r of results) {
  const icon = r.ok ? '✔ [EXITOSO]' : '✖ [FALLÓ]  ';
  console.log(` ${icon} ${r.name.padEnd(52)} (${String(r.time).padStart(5)}ms)`);
  console.log(`             └─ ${r.desc}`);
}

const totalTime = ((Date.now() - startTotal) / 1000).toFixed(2);
console.log('========================================================================');
console.log(`ESTADO GENERAL: ${allPassed ? '✅ TODOS LOS 4 BOTS PASARON AL 100%' : '❌ AL MENOS UN BOT REPORTÓ ERROR'}`);
console.log(`TIEMPO TOTAL:   ${totalTime}s`);
console.log('========================================================================\n');

if (!allPassed) process.exit(1);
