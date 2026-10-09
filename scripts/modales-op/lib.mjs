/**
 * Infraestructura compartida de los bots de los modales de /operativo ("Panel lateral").
 * Reutiliza el lanzador de Chrome headless por CDP de scripts/responsive/lib.mjs: cada bot abre UNA
 * página por (viewport, tema) y recorre los 9 modales desde sus botones reales.
 *
 * Contrato DOM que se valida (lo define src/app/components/ModalShell.tsx):
 *   [role=dialog][data-modal-shell] · [data-rail] · [data-rail-toggle] · [data-filters-btn] · [data-apply]
 *   [data-rail-section=filtros|series|resumen|extra|export] · [data-serie] · [data-kpi] · [data-export]
 *   [data-chart-area] [data-chart-label] [data-table-area] · canvas[data-modal-chart]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, loadPage, BASE_URL } from '../responsive/lib.mjs';

export { BASE_URL };

export const VP_ESCRITORIO = { name: 'escritorio 1440x900', width: 1440, height: 900 };
export const VP_MOVIL = { name: 'móvil 390x844', width: 390, height: 844 };

/**
 * Los 9 modales. `grafico` describe lo que debe dibujarse (lo usa el bot 2):
 *  - kind: 'apilado' | 'agrupado' | 'lineas' | 'area' | 'area-apilada' | 'recharts' | 'mapa' | 'ninguno'
 */
const TODOS_LOS_MODALES = [
  { id: 'op-ord', n: 1, nombre: 'Órdenes (op-ord)', titulo: /Evolutivo (Mensual|Diario|Horario) de [ÓO]rdenes/i, grafico: { kind: 'apilado' } },
  { id: 'op-brig', n: 2, nombre: 'Digitación por cuadrilla (op-brig)', titulo: /Evolutivo (Mensual|Diario|Horario) de Digitaci[óo]n/i, grafico: { kind: 'lineas', promedio: true } },
  { id: 'op-tipos', n: 3, nombre: 'Efectividad por tipo (op-tipos)', titulo: /Efectividad por Tipo/i, grafico: { kind: 'area' } },
  { id: 'op-causales', n: 4, nombre: 'Causales de no efectividad (op-causales)', titulo: /Causales (mensual |diario )?de no efectividad/i, grafico: { kind: 'causales' } },
  { id: 'disponibilidad', n: 5, nombre: 'Disponibilidad de brigadas', titulo: /Disponibilidad de Brigadas/i, grafico: { kind: 'recharts' } },
  { id: 'evolutivo', n: 6, nombre: 'Órdenes por tipo de brigada (op-evolutivo)', titulo: /[ÓO]rdenes (Mensuales|Horarias|Diarias) por Tipo de Brigada/i, grafico: { kind: 'area-apilada' } },
  { id: 'brig-tipo', n: 7, nombre: 'Digitación por tipo (op-brig · Por Tipo)', titulo: /Evolutivo (Mensual|Diario|Horario) de Digitaci[óo]n/i, grafico: { kind: 'agrupado' } },
  { id: 'detalle', n: 8, nombre: 'Detalle de brigadas', titulo: /DETALLE OPERATIVO POR BRIGADAS/i, grafico: { kind: 'ninguno' } },
  { id: 'mapa', n: 9, nombre: 'Mapa', titulo: /Mapa/i, grafico: { kind: 'mapa' } },
];

/** Depuración: MODALES=op-ord,op-causales limita los bots a esos modales. */
export const MODALES = process.env.MODALES
  ? TODOS_LOS_MODALES.filter((m) => process.env.MODALES.split(',').includes(m.id))
  : TODOS_LOS_MODALES;

/** Helpers que viven en la página (window.__mo). Función autocontenida: se serializa con toString(). */
function instalarHelpers() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const txt = (el) => ((el.innerText || el.getAttribute('aria-label') || '') + '').trim().replace(/\s+/g, ' ');
  const botonPorTexto = (re, raiz = document) =>
    [...raiz.querySelectorAll('button, [role=button]')].find((b) => re.test(txt(b)) && b.offsetParent !== null);
  const dialogo = () => document.querySelector('[role=dialog][data-modal-shell]');
  const esperar = async (cond, ms = 8000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const v = cond();
      if (v) return v;
      await sleep(100);
    }
    return null;
  };

  window.__mo = {
    sleep, txt, dialogo, esperar, botonPorTexto,

    async esperarPagina() {
      // la página muestra "Cargando información…" hasta tener datos
      await esperar(() => !document.body.innerText.includes('Cargando información') && document.getElementById('btn-expand-op-ord'), 90000);
      await sleep(800);
    },

    /** Abre el modal `id` desde su botón real. Devuelve { ok, motivo?, aria } */
    async abrir(id) {
      if (dialogo()) return { ok: false, motivo: 'ya hay un modal abierto' };
      let btn = null;
      if (id === 'op-ord' || id === 'op-tipos' || id === 'op-causales') btn = document.getElementById('btn-expand-' + id);
      else if (id === 'op-brig' || id === 'brig-tipo') {
        const sub = botonPorTexto(id === 'op-brig' ? /Cuadrilla/ : /Por Tipo/);
        if (sub) { sub.click(); await sleep(500); }
        btn = document.getElementById('btn-expand-op-brig');
      } else if (id === 'disponibilidad') btn = botonPorTexto(/Ver Evoluci[óo]n/);
      else if (id === 'evolutivo') btn = botonPorTexto(/Expandir/, document.getElementById('card-op-evolutivo') || document);
      else if (id === 'detalle') btn = botonPorTexto(/Detalle de Brigadas/);
      else if (id === 'mapa') btn = botonPorTexto(/Ver en Mapa/);
      if (!btn) return { ok: false, motivo: 'no se encontró el botón que abre el modal' };
      btn.scrollIntoView({ block: 'center' });
      btn.click();
      const d = await esperar(dialogo, 8000);
      if (!d) return { ok: false, motivo: 'el modal no apareció ([role=dialog][data-modal-shell])' };
      await sleep(1200); // deja dibujar gráfico/mapa
      return { ok: true, aria: d.getAttribute('aria-label') };
    },

    async cerrarConBoton() {
      const d = dialogo();
      if (!d) return true;
      const b = d.querySelector('button[aria-label="Cerrar"]');
      if (!b) return false;
      b.click();
      return !!(await esperar(() => !dialogo(), 4000)) || !dialogo();
    },

    async cerrarConEsc() {
      if (!dialogo()) return true;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return !!(await esperar(() => !dialogo(), 4000)) || !dialogo();
    },

    async asegurarCerrado() {
      for (let i = 0; i < 3 && dialogo(); i++) await this.cerrarConBoton();
      await sleep(250);
      return !dialogo();
    },

    tema() { return document.body.classList.contains('theme-dark') ? 'dark' : 'light'; },
    async ponerTema(t) {
      if (this.tema() !== t) {
        document.getElementById('btn-toggle-theme')?.click();
        await esperar(() => this.tema() === t, 4000);
        await sleep(500);
      }
      return this.tema();
    },

    /** Gráfico Chart.js del canvas dado (window.Chart lo expone ModalChart). */
    chartDe(canvas) { return canvas && window.Chart ? window.Chart.getChart(canvas) : null; },
    chartModal() { return this.chartDe(dialogo()?.querySelector('canvas[data-modal-chart]')); },

    /** Resumen serializable de un Chart.js. */
    resumenChart(ch) {
      if (!ch) return null;
      const tipos = ch.data.datasets.map((d) => d.type || ch.config.type);
      return {
        tipo: ch.config.type,
        tipos,
        apilado: !!(ch.options.scales?.x?.stacked && ch.options.scales?.y?.stacked),
        h: ch.canvas.offsetHeight,
        w: ch.canvas.offsetWidth,
        labels: ch.data.labels?.length || 0,
        datasets: ch.data.datasets.map((d) => ({
          label: String(d.label),
          tipo: d.type || ch.config.type,
          borderColor: Array.isArray(d.borderColor) ? d.borderColor[0] : d.borderColor,
          backgroundColor: Array.isArray(d.backgroundColor) ? d.backgroundColor[0] : d.backgroundColor,
          borderDash: d.borderDash || [],
          fill: d.fill,
          borderWidth: d.borderWidth,
          suma: (d.data || []).reduce((s, v) => s + (Number(v) || 0), 0),
          n: (d.data || []).length,
          stack: d.stack,
        })),
      };
    },

    /** Captura de descargas: registra cada Blob descargado por <a download>. */
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
          const dataUrl = this.href.startsWith('data:');
          window.__descargas.push({
            nombre: this.download,
            size: b ? b.size : (dataUrl ? this.href.length : -1),
            tipo: b ? b.type : (dataUrl ? this.href.slice(5, this.href.indexOf(';')) : ''),
          });
          return; // no se descarga de verdad en la prueba
        }
        return click.call(this);
      };
    },
  };
  return true;
}

/** Carga /operativo en un viewport y deja instalados los helpers. */
export async function abrirPagina(cdp, vp, { tema } = {}) {
  const page = await loadPage(cdp, BASE_URL + '/operativo', vp);
  await page.evaluate(`async () => { (${instalarHelpers.toString()})(); await window.__mo.esperarPagina(); window.__mo.instalarCapturaDescargas(); return true; }`);
  if (tema) await page.evaluate(`async (t) => window.__mo.ponerTema(t)`, tema);
  // En la 1.ª carga la página trae el tema guardado; los bots fijan el suyo explícitamente
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

/** Pequeño ejecutor de pruebas con resumen y exit code. */
export function crearBot(titulo) {
  const resultados = [];
  console.log('\n' + '='.repeat(78));
  console.log(titulo);
  console.log('='.repeat(78));
  return {
    registrar(nombre, fallas, avisos = []) {
      const ok = fallas.length === 0;
      resultados.push({ nombre, ok, avisos });
      console.log(`  ${ok ? '✔ PASS' : '✖ FAIL'} ${nombre}`);
      fallas.slice(0, 8).forEach((f) => console.log(`        ✖ ${f}`));
      if (fallas.length > 8) console.log(`        … y ${fallas.length - 8} más`);
      avisos.slice(0, 4).forEach((a) => console.log(`        ⚠ ${a}`));
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

/** Errores de consola/excepciones nuevos desde el índice dado (ignora ruido conocido). */
const RUIDO = /favicon|DevTools|Download the React|\[HMR\]|\[Fast Refresh\]|ResizeObserver loop|Failed to load resource|net::ERR|tile\.openstreetmap|basemaps|cartocdn/i;
export function erroresDesde(page, desdeConsola = 0, desdeExc = 0) {
  const consola = page.state.consoleErrors.slice(desdeConsola).filter((m) => !RUIDO.test(m));
  const exc = page.state.exceptions.slice(desdeExc).filter((m) => !RUIDO.test(m));
  return [...consola.map((m) => `consola: ${m}`), ...exc.map((m) => `excepción: ${m}`)];
}

/** Luminancia / contraste WCAG para colores 'rgb(...)' / 'rgba(...)'. */
export function parseRgb(c) {
  const m = String(c).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/i);
  return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
}
export function lum({ r, g, b }) {
  const f = (x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contraste(fg, bg) {
  const a = parseRgb(fg); const b = parseRgb(bg);
  if (!a || !b) return null;
  // mezcla el fondo semitransparente sobre blanco/negro no es necesario aquí: se pasan fondos opacos
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
export function hexARgb(h) {
  const m = String(h).trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
/** Normaliza '#F57C00' / 'rgb(...)' / 'rgba(...)' a 'rgb(r, g, b)' para comparar. */
export function normColor(c) {
  if (!c) return '';
  const hx = hexARgb(c);
  if (hx) return hx;
  const p = parseRgb(c);
  return p ? `rgb(${p.r}, ${p.g}, ${p.b})` : String(c);
}

/** Lee un archivo del proyecto (ruta relativa a la raíz; los bots se ejecutan desde la raíz). */
export const leerFuente = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf-8');
