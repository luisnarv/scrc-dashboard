#!/usr/bin/env node
/**
 * ==============================================================================
 * RUNNER: BATERÍA DE 3 BOTS PARA EL GRÁFICO "Causales de No Efectividad (Pérdidas)"
 * ==============================================================================
 *  - BOT 1: filtros (proyecto, zona, mes, fecha, proceso) y consistencia de lo graficado
 *  - BOT 2: datos reales vs PostgreSQL/API (requiere el servidor: npm run dev)
 *  - BOT 3: estructura de la tabla del modal y filtro por causal
 *
 * Uso:  npm run test:causales            (servidor en http://localhost:3000)
 *       BASE_URL=http://localhost:3100 npm run test:causales
 *       npm run test:causales -- --sin-servidor   (solo bots 1 y 3, sin red)
 * ==============================================================================
 */
import { spawnSync } from 'node:child_process';

const sinServidor = process.argv.includes('--sin-servidor');
const bots = [
  { name: 'BOT 1: Filtros y consistencia del gráfico', script: 'scripts/bot-causales-1-filtros.mjs', red: false },
  { name: 'BOT 2: Datos reales vs base de datos', script: 'scripts/bot-causales-2-datos-reales.mjs', red: true },
  { name: 'BOT 3: Estructura de la tabla del modal', script: 'scripts/bot-causales-3-tabla-modal.mjs', red: false },
];

const resultados = [];
for (const b of bots) {
  if (b.red && sinServidor) { resultados.push({ ...b, estado: 'OMITIDO' }); continue; }
  const t0 = Date.now();
  const p = spawnSync('node', [b.script], { stdio: 'inherit', cwd: process.cwd(), env: { ...process.env, NODE_NO_WARNINGS: '1' } });
  resultados.push({ ...b, estado: p.status === 0 ? 'OK' : 'FALLÓ', ms: Date.now() - t0 });
}

console.log('\n================================================================');
console.log('📊 RESUMEN: CAUSALES DE NO EFECTIVIDAD');
console.log('================================================================');
for (const r of resultados) {
  const icono = r.estado === 'OK' ? '✔' : r.estado === 'OMITIDO' ? '⚠' : '✖';
  console.log(`  ${icono} ${r.name.padEnd(48)} ${r.estado}${r.ms ? ` (${(r.ms / 1000).toFixed(1)} s)` : ''}`);
}
console.log('================================================================\n');
if (resultados.some(r => r.estado === 'FALLÓ')) process.exit(1);
