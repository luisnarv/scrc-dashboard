#!/usr/bin/env node
/**
 * BOT RESPONSIVE 1 · Desborde horizontal de página
 * La página no debe tener scroll horizontal en ningún viewport. Si lo tiene, lista los elementos
 * más externos que se salen del ancho visible (ignorando los contenidos dentro de contenedores con
 * scroll/recorte propio y los elementos fixed fuera de pantalla).
 */
import { runStandalone } from './responsive/lib.mjs';

export const bot = {
  id: 'BOT R1',
  name: 'Desborde horizontal de página',
  desc: 'Sin scroll horizontal del documento en 320/390/768/1280/1920 px, en las 8 vistas',
  check: () => {
    const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const overflow = sw - vw;
    const offenders = [];
    if (overflow > 1) {
      for (const el of document.querySelectorAll('body *')) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.right <= vw + 1) continue;
        if (hasFixedAncestor(el) || clipAncestor(el)) continue;
        offenders.push({ el, right: Math.round(r.right), width: Math.round(r.width) });
      }
    }
    const top = topMost(offenders).sort((a, b) => b.right - a.right).slice(0, 6);
    return { vw, sw, overflow, offenders: top.map((o) => ({ d: describe(o.el), right: o.right, width: o.width })) };
  },
  analyze: (res) => {
    const fails = [];
    if (res.overflow > 1) {
      fails.push(`scroll horizontal: el documento mide ${res.sw}px y el viewport ${res.vw}px (sobran ${res.overflow}px)`);
      res.offenders.forEach((o) => fails.push(`se sale del viewport: ${o.d} (borde derecho ${o.right}px, ancho ${o.width}px)`));
    }
    return { fails, warns: [] };
  },
};

await runStandalone(bot, import.meta.url);
