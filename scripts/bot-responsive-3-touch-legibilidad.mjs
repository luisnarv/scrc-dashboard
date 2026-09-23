#!/usr/bin/env node
/**
 * BOT RESPONSIVE 3 · Áreas táctiles y legibilidad
 *  - Móvil (<768px): controles interactivos con lado < 24px fallan (WCAG 2.5.8), < 32px avisan.
 *  - Tablet (768px): controles < 24px avisan.
 *  - Todos los viewports: texto visible < 10px falla, < 11px avisa (agregado por tamaño).
 */
import { runStandalone } from './responsive/lib.mjs';

export const bot = {
  id: 'BOT R3',
  name: 'Áreas táctiles y legibilidad',
  desc: 'Tamaño mínimo de botones/inputs en móvil-tablet y tamaño mínimo de fuente en todos los viewports',
  check: () => {
    const targets = [];
    for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]')) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      if (el.tagName === 'A' && cs.display === 'inline') continue; // enlaces dentro de texto están exentos
      const r = el.getBoundingClientRect();
      targets.push({ d: describe(el), w: Math.round(r.width), h: Math.round(r.height), min: Math.round(Math.min(r.width, r.height)) });
    }
    targets.sort((a, b) => a.min - b.min);

    const fonts = new Map(); // tamaño -> {count, sample}
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const txt = n.nodeValue.trim();
      const el = n.parentElement;
      if (txt.length < 3 || !el || !visible(el) || el.closest('script, style, canvas, svg')) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size >= 11) continue;
      const key = size.toFixed(1);
      const cur = fonts.get(key) || { count: 0, sample: describe(el) };
      cur.count++;
      fonts.set(key, cur);
    }
    return {
      total: targets.length,
      small24: targets.filter((t) => t.min < 24).length,
      small32: targets.filter((t) => t.min < 32).length,
      smallest: targets.slice(0, 5),
      fonts: [...fonts.entries()].map(([size, v]) => ({ size: Number(size), ...v })).sort((a, b) => a.size - b.size),
    };
  },
  analyze: (res, { vp }) => {
    const fails = [];
    const warns = [];
    const movil = vp.width < 768;
    const tablet = vp.width >= 768 && vp.width < 1024;
    if (movil && res.small24 > 0) {
      fails.push(`${res.small24} de ${res.total} controles miden < 24px (mínimo táctil). Más pequeños: ${res.smallest.filter((t) => t.min < 24).map((t) => `${t.d} [${t.w}x${t.h}]`).join(' | ')}`);
    }
    if (movil && res.small32 - res.small24 > 0) warns.push(`${res.small32 - res.small24} controles entre 24 y 32px (recomendado ≥ 32px en móvil)`);
    if (tablet && res.small24 > 0) warns.push(`${res.small24} controles < 24px en tablet: ${res.smallest.filter((t) => t.min < 24).map((t) => `${t.d} [${t.w}x${t.h}]`).slice(0, 3).join(' | ')}`);
    for (const f of res.fonts) {
      if (f.size < 10) fails.push(`${f.count} textos con fuente ${f.size}px (< 10px ilegible). Ej: ${f.sample}`);
      else warns.push(`${f.count} textos con fuente ${f.size}px (< 11px). Ej: ${f.sample}`);
    }
    return { fails, warns };
  },
};

await runStandalone(bot, import.meta.url);
