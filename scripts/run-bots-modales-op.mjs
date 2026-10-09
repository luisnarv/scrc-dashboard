#!/usr/bin/env node
/**
 * RUNNER: BATERÍA DE 5 BOTS PARA LOS MODALES DE /operativo ("Panel lateral")
 *  1. apertura   · aparece [role=dialog] con el título correcto; Esc y × lo cierran; sin errores de consola
 *  2. gráficos   · tipo de gráfico y series de cada modal (Chart.getChart)
 *  3. panel      · panel de 244px sin desborde, se pliega y se recuerda, filtros cambian los datos, exportar
 *  4. temas      · claro y oscuro: variables resueltas, contraste >= 4.5:1, colores del gráfico cambian con el tema
 *  5. móvil      · 390×844: hoja inferior, controles >= 44px, sin desborde, gráfico con alto útil
 *
 * Requiere el servidor (npm run dev). Otro puerto: BASE_URL=http://localhost:3100 npm run test:modales-op
 * Sale con código 1 si algún bot falla.
 */
import { spawnSync } from 'node:child_process';

const bots = [
  { id: 'apertura', name: 'BOT 1: Apertura y cierre', script: 'scripts/bot-modales-op-1-apertura.mjs' },
  { id: 'graficos', name: 'BOT 2: Tipo y series de los gráficos', script: 'scripts/bot-modales-op-2-graficos.mjs' },
  { id: 'panel', name: 'BOT 3: Panel lateral, filtros y exportación', script: 'scripts/bot-modales-op-3-panel.mjs' },
  { id: 'temas', name: 'BOT 4: Temas claro y oscuro', script: 'scripts/bot-modales-op-4-temas.mjs' },
  { id: 'movil', name: 'BOT 5: Móvil 390×844', script: 'scripts/bot-modales-op-5-movil.mjs' },
];

const solo = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const resultados = [];
for (const b of bots) {
  if (solo.length && !solo.includes(b.id)) continue;
  const t0 = Date.now();
  const p = spawnSync('node', [b.script], { stdio: 'inherit', cwd: process.cwd(), env: { ...process.env, NODE_NO_WARNINGS: '1' } });
  resultados.push({ ...b, estado: p.status === 0 ? 'OK' : p.status === 2 ? 'SIN SERVIDOR' : 'FALLÓ', ms: Date.now() - t0 });
}

console.log('\n' + '='.repeat(78));
console.log('📊 RESUMEN: MODALES DE /operativo');
console.log('='.repeat(78));
for (const r of resultados) {
  const icono = r.estado === 'OK' ? '✔' : '✖';
  console.log(`  ${icono} ${r.name.padEnd(50)} ${r.estado} (${(r.ms / 1000).toFixed(0)} s)`);
}
console.log('='.repeat(78) + '\n');
if (resultados.some((r) => r.estado !== 'OK')) process.exit(1);
