#!/usr/bin/env node
/**
 * BOT RESPONSIVE 2 · Contenido desbordado y solapamientos
 *  - Contenedores cuyo contenido se sale de su propia caja (overflow visible).
 *  - Controles interactivos (botones, enlaces, inputs, selects) que se superponen entre sí.
 *  - Elementos cortados por el borde izquierdo de la pantalla.
 */
import { runStandalone } from './responsive/lib.mjs';

export const bot = {
  id: 'BOT R2',
  name: 'Contenido desbordado y solapamientos',
  desc: 'Cajas con contenido que se derrama, controles superpuestos y elementos fuera del borde izquierdo',
  check: () => {
    // (a) contenedores con overflow visible cuyo contenido excede su caja
    const spill = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('svg, canvas, .leaflet-container, table') && el.tagName !== 'TABLE') continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'inline' || cs.overflowX !== 'visible' || cs.animationName !== 'none') continue;
      if (!visible(el)) continue;
      const diff = el.scrollWidth - el.clientWidth;
      if (diff > 2 && el.clientWidth > 0) spill.push({ el, diff });
    }
    const spillTop = topMost(spill).sort((a, b) => b.diff - a.diff).slice(0, 8)
      .map((s) => ({ d: describe(s.el), diff: s.diff }));

    // (b) controles interactivos superpuestos
    const ctrls = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]')]
      .filter(visible)
      .map((el) => ({ el, r: el.getBoundingClientRect() }));
    const overlaps = [];
    for (let i = 0; i < ctrls.length; i++) {
      for (let j = i + 1; j < ctrls.length; j++) {
        const a = ctrls[i], b = ctrls[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w <= 2 || h <= 2) continue;
        const ratio = (w * h) / Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
        if (ratio > 0.3) overlaps.push({ a: describe(a.el), b: describe(b.el), pct: Math.round(ratio * 100) });
      }
    }

    // (c) elementos cortados por el borde izquierdo
    const left = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.left >= -2 || r.width < 6) continue;
      if (hasFixedAncestor(el) || clipAncestor(el)) continue;
      left.push({ el, x: Math.round(r.left) });
    }
    const leftTop = topMost(left).slice(0, 5).map((l) => ({ d: describe(l.el), x: l.x }));

    return { spill: spillTop, overlaps: overlaps.slice(0, 6), overlapCount: overlaps.length, left: leftTop };
  },
  analyze: (res) => {
    const fails = [];
    const warns = [];
    res.spill.forEach((s) => (s.diff > 16 ? fails : warns).push(`contenido desbordado ${s.diff}px fuera de su contenedor: ${s.d}`));
    res.overlaps.forEach((o) => fails.push(`controles superpuestos (${o.pct}%): ${o.a}  <->  ${o.b}`));
    if (res.overlapCount > res.overlaps.length) fails.push(`… ${res.overlapCount - res.overlaps.length} pares de controles superpuestos más`);
    res.left.forEach((l) => fails.push(`cortado por el borde izquierdo (x=${l.x}px): ${l.d}`));
    return { fails, warns };
  },
};

await runStandalone(bot, import.meta.url);
