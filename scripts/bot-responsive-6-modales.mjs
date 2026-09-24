#!/usr/bin/env node
/**
 * BOT RESPONSIVE 6 · Ventanas modales
 * En cada vista y viewport descubre los botones que abren ventanas (Expandir, Detalle, Ver Evolución,
 * Ver en Mapa, Análisis…), las abre una por una, las inspecciona y las cierra. Valida:
 *  - La ventana cabe en el viewport (sin quedar cortada a la derecha/abajo).
 *  - Hay un botón de cerrar visible, dentro de pantalla, sin tapar y con tamaño táctil.
 *  - El contenido interno no se sale horizontalmente ni queda cortado abajo sin scroll.
 *  - Gráficos/mapas con altura útil y tablas anchas dentro de un contenedor con scroll.
 *  - Textos < 10px y controles < 24px (móvil); Esc cierra la ventana y la ventana realmente se cierra.
 * Debe ir al final de la lista de bots porque interactúa con la página (clics).
 */
import { runStandalone, BASE_VIEWPORTS } from './responsive/lib.mjs';

const MAX_TRIGGERS = Number(process.env.RESP_MAX_MODALS || 12);

const HELPERS = `
  const txtOf = (el) => ((el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '') + '').trim().replace(/\\s+/g, ' ');
  const TRIG_RE = /expandir|detalle|evoluci|mapa|an[aá]lisis|desglose|ver m[aá]s|abrir|⤢|comparar|ranking|informe|[oó]rdenes|t[eé]cnicos? asignados?/i;
  const BAD_RE = /actualizar|descargar|exportar|excel|csv|pdf|imprimir|limpiar|cerrar|cancelar|recargar|sincron|guardar|eliminar|borrar/i;
  const area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height; };
  const isBigFixed = (el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' || cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width >= vw * 0.3 && r.height >= vh * 0.3;
  };
  const findTriggers = () => {
    const seen = {};
    const out = [];
    for (const el of document.querySelectorAll('button, [role=button]')) {
      if (!visible(el) || el.disabled) continue;
      if (el.closest('.dash-nav, nav, header, .modal-back, [role=dialog]')) continue;
      const t = txtOf(el);
      const isExpand = (el.id || '').startsWith('btn-expand-');
      if (!isExpand && (!t || t.length > 200 || !TRIG_RE.test(t) || BAD_RE.test(t))) continue;
      const base = isExpand ? el.id : t;
      seen[base] = (seen[base] || 0) + 1;
      if (seen[base] > 2) continue;
      out.push({ label: base + '#' + seen[base], text: t || base, el });
    }
    return out;
  };
  const closeButtonOf = (overlay) => [...overlay.querySelectorAll('button, [role=button]')].filter(visible).find((b) => {
    const t = txtOf(b);
    return b.classList.contains('modal-close') || /^(✕|×|x|✖)$/i.test(t) || /cerrar|close/i.test(t + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.title || ''));
  });
`;

const LIST_SRC = `async () => { ${HELPERS} return findTriggers().slice(0, ${MAX_TRIGGERS}).map((t) => ({ label: t.label, text: t.text })); }`;

const OPEN_SRC = `async (label) => {
  ${HELPERS}
  const before = new Set([...document.querySelectorAll('body *')].filter(isBigFixed));
  const trig = findTriggers().find((x) => x.label === label);
  if (!trig) return { found: false, reason: 'botón no encontrado' };
  trig.el.scrollIntoView({ block: 'center' });
  trig.el.click();
  await new Promise((r) => setTimeout(r, 1600));
  const cands = [...document.querySelectorAll('body *')].filter((el) => isBigFixed(el) && !before.has(el));
  const outer = cands.filter((el) => !cands.some((o) => o !== el && o.contains(el)));
  if (!outer.length) return { found: false, reason: 'no apareció ninguna ventana' };
  const overlay = outer.sort((a, b) => area(b) - area(a))[0];
  window.__respOverlay = overlay;
  let panel = overlay.matches('[role=dialog], .modal-box') ? overlay : overlay.querySelector('[role=dialog], .modal-box');
  if (!panel) panel = [...overlay.children].filter(visible).sort((a, b) => area(b) - area(a))[0] || overlay;

  const pr = panel.getBoundingClientRect();
  const rect = { left: Math.round(pr.left), top: Math.round(pr.top), right: Math.round(pr.right), bottom: Math.round(pr.bottom), width: Math.round(pr.width), height: Math.round(pr.height) };

  const cb = closeButtonOf(overlay);
  let close = null;
  if (cb) {
    const r = cb.getBoundingClientRect();
    const inView = r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1;
    let covered = false;
    if (inView) {
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      covered = !(hit && (hit === cb || cb.contains(hit)));
    }
    close = { d: describe(cb), inView, covered, w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), top: Math.round(r.top) };
  }

  const stopClip = (el, stop, axis) => {
    for (let p = el.parentElement; p && p !== stop; p = p.parentElement) {
      const o = axis === 'x' ? getComputedStyle(p).overflowX : getComputedStyle(p).overflowY;
      if (o === 'auto' || o === 'scroll' || (axis === 'x' && (o === 'hidden' || o === 'clip'))) return true;
    }
    return false;
  };
  const scrollsY = (el) => {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if (o === 'auto' || o === 'scroll') return true;
    }
    return false;
  };
  const inner = [...panel.querySelectorAll('*')].filter(visible);
  const hOver = [];
  const vCut = [];
  for (const el of inner) {
    const pos = getComputedStyle(el).position;
    if (pos === 'absolute' || pos === 'fixed') continue;
    const r = el.getBoundingClientRect();
    if ((r.right > pr.right + 1 || r.left < pr.left - 1) && !stopClip(el, panel, 'x')) hOver.push({ el, right: Math.round(r.right), left: Math.round(r.left) });
    if (r.bottom > pr.bottom + 2 && !scrollsY(el)) vCut.push({ el, bottom: Math.round(r.bottom) });
  }
  const top = (arr) => arr.filter((it) => !arr.some((o) => o !== it && o.el.contains(it.el))).slice(0, 4);

  const targets = [];
  for (const el of panel.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]')) {
    if (!visible(el)) continue;
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue;
    const r = el.getBoundingClientRect();
    targets.push({ d: describe(el), w: Math.round(r.width), h: Math.round(r.height), min: Math.round(Math.min(r.width, r.height)) });
  }
  targets.sort((a, b) => a.min - b.min);

  const fonts = new Map();
  const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const el = n.parentElement;
    if (n.nodeValue.trim().length < 3 || !el || !visible(el) || el.closest('script, style, canvas, svg')) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size >= 10) continue;
    const key = size.toFixed(1);
    const cur = fonts.get(key) || { count: 0, sample: describe(el) };
    cur.count++;
    fonts.set(key, cur);
  }

  const charts = [...panel.querySelectorAll('canvas, svg.recharts-surface, .leaflet-container')].filter(visible)
    .map((c) => { const r = c.getBoundingClientRect(); return { d: describe(c), w: Math.round(r.width), h: Math.round(r.height) }; });
  const tables = [...panel.querySelectorAll('table')].filter(visible).map((t) => {
    const r = t.getBoundingClientRect();
    let sa = null;
    for (let p = t.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll') { sa = p; break; }
    }
    return { d: describe(t), w: Math.round(r.width), hasScroll: !!sa };
  });

  return {
    found: true, title: describe(panel), vw, vh, rect, close,
    hOver: top(hOver).map((o) => ({ d: describe(o.el), right: o.right, left: o.left })),
    vCut: top(vCut).map((o) => ({ d: describe(o.el), bottom: o.bottom })),
    small24: targets.filter((t) => t.min < 24).length, small32: targets.filter((t) => t.min < 32).length, targetsTotal: targets.length,
    smallest: targets.slice(0, 3),
    fonts: [...fonts.entries()].map(([size, v]) => ({ size: Number(size), ...v })),
    charts, tables,
  };
}`;

const CLOSE_SRC = `async () => {
  ${HELPERS}
  const ov = window.__respOverlay;
  const isOpen = () => !!ov && document.body.contains(ov) && visible(ov) && getComputedStyle(ov).display !== 'none';
  if (!isOpen()) return { closed: true, escape: true, via: 'ya cerrada' };
  const fire = (type) => {
    for (const t of [document.activeElement, ov, document, window]) {
      if (t) t.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
    }
  };
  fire('keydown'); fire('keyup');
  await new Promise((r) => setTimeout(r, 700));
  if (!isOpen()) return { closed: true, escape: true, via: 'Esc' };
  const cb = closeButtonOf(ov);
  if (cb) { cb.click(); await new Promise((r) => setTimeout(r, 700)); if (!isOpen()) return { closed: true, escape: false, via: 'botón cerrar' }; }
  ov.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 700));
  return { closed: !isOpen(), escape: false, via: 'clic en el fondo' };
}`;

function analyzeModal(res, vp, label) {
  const fails = [];
  const warns = [];
  const tag = `[${label}]`;
  const movil = vp.width < 768;
  const r = res.rect;
  if (r.left < -1 || r.right > res.vw + 1 || r.top < -1 || r.bottom > res.vh + 1) {
    fails.push(`${tag} la ventana no cabe en pantalla: ocupa x ${r.left}→${r.right}, y ${r.top}→${r.bottom} en un viewport de ${res.vw}x${res.vh}`);
  }
  if (!res.close) fails.push(`${tag} no tiene botón de cerrar visible`);
  else {
    const c = res.close;
    if (!c.inView) fails.push(`${tag} el botón de cerrar queda fuera de pantalla (${c.d}, borde derecho ${c.right}px, arriba ${c.top}px)`);
    else if (c.covered) fails.push(`${tag} el botón de cerrar está tapado por otro elemento (${c.d})`);
    const min = Math.min(c.w, c.h);
    if (movil && min < 24) fails.push(`${tag} el botón de cerrar mide ${c.w}x${c.h}px (< 24px táctil)`);
    else if (movil && min < 32) warns.push(`${tag} el botón de cerrar mide ${c.w}x${c.h}px (recomendado ≥ 32px)`);
  }
  res.hOver.forEach((o) => fails.push(`${tag} contenido que se sale de la ventana horizontalmente (x ${o.left}→${o.right}): ${o.d}`));
  res.vCut.forEach((o) => fails.push(`${tag} contenido cortado abajo sin scroll (borde inferior ${o.bottom}px): ${o.d}`));
  if (movil && res.small24 > 0) fails.push(`${tag} ${res.small24} de ${res.targetsTotal} controles < 24px: ${res.smallest.filter((t) => t.min < 24).map((t) => `${t.d} [${t.w}x${t.h}]`).join(' | ')}`);
  else if (movil && res.small32 - res.small24 > 0) warns.push(`${tag} ${res.small32 - res.small24} controles entre 24 y 32px`);
  res.fonts.forEach((f) => fails.push(`${tag} ${f.count} textos con fuente ${f.size}px (< 10px). Ej: ${f.sample}`));
  res.charts.forEach((c) => { if (c.h < 100) fails.push(`${tag} gráfico/mapa colapsado (${c.w}x${c.h}px): ${c.d}`); });
  res.tables.forEach((t) => { if (t.w > res.vw + 1 && !t.hasScroll) fails.push(`${tag} tabla de ${t.w}px sin contenedor con scroll horizontal: ${t.d}`); });
  return { fails, warns };
}

export const bot = {
  id: 'BOT R6',
  name: 'Ventanas modales',
  desc: 'Abre cada modal de cada vista: cabe en pantalla, botón cerrar accesible, sin desbordes, Esc cierra',
  viewports: [...BASE_VIEWPORTS, 'movil-horizontal'],
  run: async (page, { vp }) => {
    const fails = [];
    const warns = [];
    const info = [];
    const triggers = await page.evaluate(LIST_SRC);
    let opened = 0;
    for (const t of triggers) {
      let res;
      try {
        res = await page.evaluate(OPEN_SRC, t.label);
      } catch (e) {
        warns.push(`[${t.text}] error al abrir: ${e.message.split('\n')[0]}`);
        continue;
      }
      if (!res.found) { info.push(`[${t.text}] ${res.reason}`); continue; }
      opened++;
      const out = analyzeModal(res, vp, t.text.slice(0, 40));
      fails.push(...out.fails);
      warns.push(...out.warns);
      const cl = await page.evaluate(CLOSE_SRC);
      if (!cl.closed) {
        fails.push(`[${t.text.slice(0, 40)}] no se pudo cerrar la ventana (ni Esc, ni botón, ni clic en el fondo); se detienen las pruebas de modales de esta vista`);
        break;
      }
      if (!cl.escape) warns.push(`[${t.text.slice(0, 40)}] la tecla Esc no cierra la ventana (cerró con: ${cl.via})`);
    }
    info.unshift(`${opened} modal(es) abierto(s) de ${triggers.length} botón(es) candidatos`);
    return { fails, warns, info };
  },
};

await runStandalone(bot, import.meta.url);
