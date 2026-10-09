/**
 * Infraestructura de los bots E2E de filtros combinados, botones y datos (todas las vistas).
 * Reutiliza el lanzador de Chrome headless por CDP de scripts/responsive/lib.mjs. Cada bot abre las vistas
 * una por una, opera los controles REALES de la página (filtros globales, botones, selects) y evalúa
 * lo que se ve en pantalla (texto, tablas, gráficos Chart.js).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, loadPage, BASE_URL } from '../responsive/lib.mjs';

export { BASE_URL };
export const VP = { name: 'escritorio 1440x900', width: 1440, height: 900 };

export const VISTAS = [
  { id: 'inicio', nombre: 'Inicio', path: '/' },
  { id: 'estrategico', nombre: 'Estratégico', path: '/estrategico' },
  { id: 'gerencial', nombre: 'Gerencial', path: '/gerencial' },
  { id: 'informes', nombre: 'Informes', path: '/informes' },
  { id: 'operativo', nombre: 'Operativo', path: '/operativo' },
  { id: 'productivo', nombre: 'Producción Técnico', path: '/tecnico/productivo' },
  { id: 'tecnicos', nombre: 'Cantidades Técnicos', path: '/tecnicos' },
  { id: 'cierre', nombre: 'Cierre Diario', path: '/cierre_diario' },
];

/** Depuración: VISTAS=operativo,tecnicos limita los bots a esas vistas. */
export const VISTAS_ACTIVAS = process.env.VISTAS
  ? VISTAS.filter((v) => process.env.VISTAS.split(',').includes(v.id))
  : VISTAS;

export const leerFuente = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf-8');

/** Helpers que viven en la página (window.__e2e). Función autocontenida: se serializa con toString(). */
function instalarHelpers() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esperar = async (cond, ms = 8000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const v = cond();
      if (v) return v;
      await sleep(100);
    }
    return null;
  };
  const txt = (el) => ((el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '') + '').trim().replace(/\s+/g, ' ');
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  };
  const setSelect = async (sel, valor) => {
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    set.call(sel, valor);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(700);
  };
  const num = (t) => Number(String(t).replace(/[^\d,-]/g, '').replace(',', '.')) || 0;

  const api = {
    sleep, esperar, txt, visible, setSelect, num,

    async esperarPagina() {
      await esperar(() => !document.body.innerText.includes('Cargando información') && document.querySelector('#filters-container') && (document.querySelector('main')?.innerText || '').trim().length > 40, 120000);
      await sleep(1200);
    },

    // ── filtros globales ──
    ctl: () => ({
      proceso: document.getElementById('select-proceso'), proy: document.getElementById('select-proy'),
      zona: document.getElementById('select-zona'), ano: document.getElementById('select-ano'),
      mes: document.getElementById('btn-mes'), dia: document.getElementById('btn-fecha'),
    }),
    opciones: (sel) => [...sel.options].map((o) => o.value),
    estadoFiltros() {
      const c = api.ctl();
      return {
        proceso: c.proceso?.value, proy: c.proy?.value, zona: c.zona?.value, ano: c.ano?.value,
        mesLabel: txt(c.mes), diaLabel: txt(c.dia),
        zonas: c.zona ? api.opciones(c.zona) : [], proys: c.proy ? api.opciones(c.proy) : [], anos: c.ano ? api.opciones(c.ano) : [],
        resumen: txt(document.querySelector('#filters-container > span:last-child') || document.body).slice(0, 120),
      };
    },
    async cerrarDropdowns() {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await sleep(200);
    },
    async abrirMes() {
      await api.cerrarDropdowns();
      if (!document.getElementById('mes-dropdown')) { api.ctl().mes.click(); await esperar(() => document.getElementById('mes-dropdown'), 3000); }
      return document.getElementById('mes-dropdown');
    },
    async abrirDia() {
      await api.cerrarDropdowns();
      if (!document.getElementById('dia-dropdown')) { api.ctl().dia.click(); await esperar(() => document.getElementById('dia-dropdown'), 3000); }
      return document.getElementById('dia-dropdown');
    },
    /** Selecciona UN solo mes (índice en la lista visible) desmarcando los demás. */
    async soloMes(idx) {
      const dd = await api.abrirMes();
      const checks = [...dd.querySelectorAll('input[id^="chk-mes-"]:not(#chk-mes-todos)')];
      if (!checks.length) return false;
      // limpiar y marcar uno
      [...dd.querySelectorAll('button')].find((b) => /Limpiar/.test(b.innerText))?.click();
      await sleep(500);
      const dd2 = document.getElementById('mes-dropdown');
      const c2 = [...dd2.querySelectorAll('input[id^="chk-mes-"]:not(#chk-mes-todos)')];
      const i = idx < 0 ? c2.length + idx : idx;
      c2[i]?.click();
      await sleep(900);
      await api.cerrarDropdowns();
      return true;
    },
    async todosMeses() {
      const dd = await api.abrirMes();
      [...dd.querySelectorAll('button')].find((b) => /Seleccionar todos/.test(b.innerText))?.click();
      await sleep(900);
      await api.cerrarDropdowns();
    },
    async soloDia(idx) {
      const dd = await api.abrirDia();
      [...dd.querySelectorAll('button')].find((b) => /Limpiar/.test(b.innerText))?.click();
      await sleep(500);
      const dd2 = document.getElementById('dia-dropdown');
      const c2 = [...dd2.querySelectorAll('input[id^="chk-dia-"]:not(#chk-dia-todos)')];
      const i = idx < 0 ? c2.length + idx : idx;
      c2[i]?.click();
      await sleep(900);
      await api.cerrarDropdowns();
      return c2.length;
    },
    async todosDias() {
      const dd = await api.abrirDia();
      [...dd.querySelectorAll('button')].find((b) => /Seleccionar todos/.test(b.innerText))?.click();
      await sleep(900);
      await api.cerrarDropdowns();
    },
    async resetFiltros() {
      const c = api.ctl();
      await setSelect(c.proceso, 'ALL');
      await setSelect(c.proy, 'ALL');
      await setSelect(c.zona, 'ALL');
      await setSelect(c.ano, 'ALL'); // también deja mes=[] y fecha=ALL
      await sleep(900);
    },

    /** Estado base canónico de los bots: sin proceso/proyecto/zona, ÚLTIMO mes y todos sus días. */
    async fijarBase() {
      const c = api.ctl();
      await setSelect(c.proceso, 'ALL');
      await setSelect(c.proy, 'ALL');
      await setSelect(c.zona, 'ALL');
      if (c.ano.value !== 'ALL') await setSelect(c.ano, 'ALL');
      await api.soloMes(-1);
      await api.todosDias();
      await sleep(1000);
    },
    /** Opciones del desplegable de meses o días: [{ label, checked }] (lo abre y lo cierra). */
    async leerDropdown(tipo) {
      const dd = tipo === 'mes' ? await api.abrirMes() : await api.abrirDia();
      const prefijo = tipo === 'mes' ? 'chk-mes-' : 'chk-dia-';
      const out = [...dd.querySelectorAll('input[id^="' + prefijo + '"]')]
        .filter((i) => i.id !== prefijo + 'todos')
        .map((i) => ({ label: txt(i.parentElement), checked: i.checked }));
      const todos = dd.querySelector('#' + prefijo + 'todos');
      const res = { opciones: out, todos: !!todos?.checked, textoTodos: todos ? txt(todos.parentElement) : '' };
      await api.cerrarDropdowns();
      return res;
    },
    /** Aplica una combinación de filtros desde el estado base. Devuelve el estado resultante. */
    async aplicar(combo) {
      const c = api.ctl();
      if (combo.proceso !== undefined) await setSelect(c.proceso, combo.proceso);
      if (combo.proy !== undefined) await setSelect(c.proy, combo.proy);
      if (combo.zona !== undefined) await setSelect(c.zona, combo.zona);
      if (combo.mesIdx !== undefined) await api.soloMes(combo.mesIdx);
      if (combo.diaIdx !== undefined) await api.soloDia(combo.diaIdx);
      await sleep(1200);
      return api.estadoFiltros();
    },

    // ── lo que se ve ──
    /** Firma de la vista: texto de <main> (solo cifras y etiquetas) + sumas de todos los gráficos Chart.js. */
    firma() {
      const main = document.querySelector('main');
      const t = (main?.innerText || '').replace(/\s+/g, ' ');
      const charts = window.Chart ? [...document.querySelectorAll('main canvas')].map((c) => window.Chart.getChart(c)).filter(Boolean) : [];
      const sumas = charts.map((ch) => ch.data.datasets.map((d) => (d.data || []).reduce((s, v) => s + (Number(v) || 0), 0)).join(','));
      const filas = [...document.querySelectorAll('main table')].map((tb) => tb.querySelectorAll('tbody tr').length);
      return JSON.stringify({ t, sumas, filas });
    },
    resumenVista() {
      const main = document.querySelector('main');
      const t = (main?.innerText || '').trim();
      return {
        chars: t.length,
        canvases: document.querySelectorAll('main canvas').length,
        tablas: document.querySelectorAll('main table').length,
        filas: [...document.querySelectorAll('main table')].reduce((s, tb) => s + tb.querySelectorAll('tbody tr').length, 0),
        botones: document.querySelectorAll('main button').length,
        pantallaVacia: /Sin datos para mostrar|No se pudo cargar/.test(document.body.innerText),
      };
    },

    /** Captura de descargas (blobs / data:) */
    instalarCapturaDescargas() {
      if (window.__descargas) return;
      window.__descargas = [];
      const crear = URL.createObjectURL.bind(URL);
      const blobs = new Map();
      URL.createObjectURL = (b) => { const u = crear(b); blobs.set(u, b); return u; };
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) {
          const b = blobs.get(this.href);
          window.__descargas.push({ nombre: this.download, size: b ? b.size : (this.href.startsWith('data:') ? this.href.length : -1) });
          return;
        }
        return click.call(this);
      };
    },
  };
  window.confirm = () => true;
  window.alert = () => {};
  window.prompt = () => '';
  window.open = () => null;
  window.__e2e = api;
  return true;
}

export async function abrirVista(cdp, vista, vp = VP) {
  const page = await loadPage(cdp, BASE_URL + vista.path, vp);
  await page.evaluate(`async () => { (${instalarHelpers.toString()})(); await window.__e2e.esperarPagina(); window.__e2e.instalarCapturaDescargas(); return true; }`);
  return page;
}

export async function conNavegador(fn) {
  try {
    const ping = await fetch(BASE_URL, { signal: AbortSignal.timeout(20000) });
    if (!ping.ok && ping.status >= 500) throw new Error(`HTTP ${ping.status}`);
  } catch (e) {
    console.error(`✖ No se pudo llegar a ${BASE_URL} (${e.message}). Inicia el servidor con "npm run dev".`);
    process.exit(2);
  }
  const { cdp, close } = await launchBrowser();
  try {
    return await fn(cdp);
  } finally {
    await close();
  }
}

export function crearBot(titulo) {
  const resultados = [];
  console.log('\n' + '='.repeat(78));
  console.log(titulo);
  console.log('='.repeat(78));
  return {
    registrar(nombre, fallas, avisos = []) {
      const ok = fallas.length === 0;
      resultados.push({ nombre, ok });
      console.log(`  ${ok ? '✔ PASS' : '✖ FAIL'} ${nombre}`);
      fallas.slice(0, 10).forEach((f) => console.log(`        ✖ ${f}`));
      if (fallas.length > 10) console.log(`        … y ${fallas.length - 10} más`);
      avisos.slice(0, 5).forEach((a) => console.log(`        ⚠ ${a}`));
      if (avisos.length > 5) console.log(`        … y ${avisos.length - 5} avisos más`);
    },
    fin() {
      const nFail = resultados.filter((r) => !r.ok).length;
      console.log('-'.repeat(78));
      console.log(`  Resultado: ${resultados.length - nFail} PASS · ${nFail} FAIL`);
      console.log('='.repeat(78) + '\n');
      process.exit(nFail ? 1 : 0);
    },
  };
}

const RUIDO = /favicon|DevTools|Download the React|\[HMR\]|\[Fast Refresh\]|ResizeObserver loop|Failed to load resource|net::ERR|tile\.openstreetmap|basemaps|cartocdn/i;
export function erroresDesde(page, desdeConsola = 0, desdeExc = 0) {
  const consola = page.state.consoleErrors.slice(desdeConsola).filter((m) => !RUIDO.test(m));
  const exc = page.state.exceptions.slice(desdeExc).filter((m) => !RUIDO.test(m));
  return [...consola.map((m) => `consola: ${m}`), ...exc.map((m) => `excepción: ${m}`)];
}
