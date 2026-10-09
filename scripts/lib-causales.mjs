// Utilidades compartidas por los bots de "Causales de No Efectividad (Pérdidas)".
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ROOT = process.cwd();

// Los módulos puros del front son TypeScript sin dependencias de React: Node los importa directo
// (type stripping), así los bots prueban el código REAL de la página y no una copia.
export const cargarTs = (rel) => import(pathToFileURL(path.resolve(ROOT, rel)).href);
export const cargarFiltros = () => cargarTs('src/app/components/utils/filters.ts');
export const cargarCausales = () => cargarTs('src/app/components/utils/causales.ts');

export function leer(rel) { return fs.readFileSync(path.resolve(ROOT, rel), 'utf-8'); }

export function cargarEnv() {
  const envText = leer('.env');
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
    if (!m) continue;
    let v = (m[2] || '').trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

export function crearPool(Pool) {
  cargarEnv();
  let conn = process.env.POSTGRES_URL || '';
  if (conn.includes('1q?YLKduq3r5')) conn = conn.replace('1q?YLKduq3r5', '1q%3FYLKduq3r5');
  if (conn.endsWith('?')) conn = conn.slice(0, -1);
  return new Pool({ connectionString: conn, ssl: { rejectUnauthorized: false } });
}

export function crearRunner(titulo) {
  let passed = 0;
  let failed = 0;
  console.log('\n================================================================');
  console.log(titulo);
  console.log('================================================================');
  return {
    async test(desc, fn) {
      try {
        await fn();
        console.log(`  ✔ [PASS] ${desc}`);
        passed++;
      } catch (e) {
        console.error(`  ✖ [FAIL] ${desc}\n           ${String(e.message).split('\n').join('\n           ')}`);
        failed++;
      }
    },
    fin() {
      console.log('----------------------------------------------------------------');
      console.log(`  Resultado: ${passed} PASS · ${failed} FAIL`);
      console.log('================================================================\n');
      if (failed > 0) process.exit(1);
    },
  };
}

export const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

export async function getJson(pathname, ms = 180000) {
  const r = await fetch(BASE_URL + pathname, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) {
    throw new Error(`GET ${pathname} -> HTTP ${r.status}. ¿El servidor (npm run dev) está en ${BASE_URL}? Use BASE_URL=http://localhost:3100 para otro puerto.`);
  }
  return r.json();
}
