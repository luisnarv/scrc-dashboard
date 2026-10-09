#!/usr/bin/env node
/**
 * RUNNER: BATERÍA DE 3 BOTS E2E (filtros combinados · botones · datos) SOBRE TODAS LAS VISTAS
 *  1. filtros   · filtros globales combinados: controles, cascada, año→mes→día, aplicación, idempotencia, navegación
 *  2. botones   · opera cada control real de cada vista (Expandir, selects, búsquedas, paginación, ▼…)
 *  3. datos     · los números en pantalla == valores esperados (API + funciones reales del front) con 11 combinaciones
 *
 * Requiere el servidor (npm run dev). Otro puerto: BASE_URL=http://localhost:3100 npm run test:e2e
 * Limitar vistas (depuración): VISTAS=operativo,tecnicos npm run test:e2e
 * Paralelo (por defecto los 3 a la vez): npm run test:e2e -- --secuencial
 * Sale con código 1 si algún bot falla.
 */
import { spawn } from 'node:child_process';

const bots = [
  { id: 'filtros', name: 'BOT 1: Filtros globales combinados', script: 'scripts/bot-e2e-1-filtros-combinados.mjs' },
  { id: 'botones', name: 'BOT 2: Botones y controles', script: 'scripts/bot-e2e-2-botones.mjs' },
  { id: 'datos', name: 'BOT 3: Datos con filtros combinados', script: 'scripts/bot-e2e-3-datos-combinados.mjs' },
];
const secuencial = process.argv.includes('--secuencial');
const solo = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const elegidos = bots.filter((b) => !solo.length || solo.includes(b.id));

const correr = (b) => new Promise((resolve) => {
  const t0 = Date.now();
  const salida = [];
  const p = spawn('node', [b.script], { cwd: process.cwd(), env: { ...process.env, NODE_NO_WARNINGS: '1' } });
  p.stdout.on('data', (d) => salida.push(d));
  p.stderr.on('data', (d) => salida.push(d));
  p.on('close', (code) => resolve({ ...b, code, ms: Date.now() - t0, salida: Buffer.concat(salida).toString('utf-8') }));
});

console.log(`\nLanzando ${elegidos.length} bots E2E ${secuencial ? 'en secuencia' : 'en paralelo'}…\n`);
let resultados = [];
if (secuencial) {
  for (const b of elegidos) {
    const r = await correr(b);
    process.stdout.write(r.salida);
    resultados.push(r);
  }
} else {
  resultados = await Promise.all(elegidos.map(correr));
  resultados.forEach((r) => process.stdout.write(r.salida));
}

console.log('\n' + '='.repeat(78));
console.log('📊 RESUMEN: E2E · FILTROS COMBINADOS, BOTONES Y DATOS (todas las vistas)');
console.log('='.repeat(78));
for (const r of resultados) {
  const estado = r.code === 0 ? 'OK' : r.code === 2 ? 'SIN SERVIDOR' : 'FALLÓ';
  console.log(`  ${r.code === 0 ? '✔' : '✖'} ${r.name.padEnd(46)} ${estado} (${Math.round(r.ms / 1000)} s)`);
}
console.log('='.repeat(78) + '\n');
if (resultados.some((r) => r.code !== 0)) process.exit(1);
