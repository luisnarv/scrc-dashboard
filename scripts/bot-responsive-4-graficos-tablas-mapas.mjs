#!/usr/bin/env node
/**
 * BOT RESPONSIVE 4 · Gráficos, tablas y mapas
 *  - Canvas (Chart.js), SVG (Recharts) y mapas Leaflet: dentro del ancho visible y con altura útil.
 *  - Tablas más anchas que el viewport: deben vivir dentro de un contenedor con scroll horizontal.
 *  - Canvas completamente vacíos (aviso: puede ser simplemente "sin datos").
 */
import { runStandalone } from './responsive/lib.mjs';

export const bot = {
  id: 'BOT R4',
  name: 'Gráficos, tablas y mapas',
  desc: 'Adaptación de canvas/SVG/Leaflet y tablas anchas (scroll horizontal contenido) en todos los viewports',
  check: () => {
    const out = { charts: [], tables: [], counts: { canvas: 0, svg: 0, maps: 0, tables: 0 } };

    const inspect = (el, kind) => {
      if (!visible(el)) return;
      const r = el.getBoundingClientRect();
      const sa = scrollAncestor(el);
      out.charts.push({
        kind, d: describe(el), width: Math.round(r.width), height: Math.round(r.height),
        right: Math.round(r.right), contained: !!sa && sa.getBoundingClientRect().right <= vw + 1,
        parentW: el.parentElement ? Math.round(el.parentElement.clientWidth) : 0,
      });
    };
    document.querySelectorAll('canvas').forEach((c) => { out.counts.canvas++; inspect(c, 'canvas'); });
    document.querySelectorAll('svg.recharts-surface').forEach((c) => { out.counts.svg++; inspect(c, 'grafico svg'); });
    document.querySelectorAll('.leaflet-container').forEach((c) => { out.counts.maps++; inspect(c, 'mapa'); });

    // canvas vacíos
    out.blank = [];
    document.querySelectorAll('canvas').forEach((c) => {
      if (!visible(c) || c.width === 0 || c.height === 0) return;
      try {
        const empty = document.createElement('canvas');
        empty.width = c.width; empty.height = c.height;
        if (c.toDataURL() === empty.toDataURL()) out.blank.push(describe(c));
      } catch { /* canvas tainted */ }
    });

    document.querySelectorAll('table').forEach((t) => {
      if (!visible(t)) return;
      out.counts.tables++;
      const r = t.getBoundingClientRect();
      const sa = scrollAncestor(t);
      const boxRight = sa ? sa.getBoundingClientRect().right : r.right;
      out.tables.push({
        d: describe(t), width: Math.round(r.width), right: Math.round(r.right),
        hasScroll: !!sa, scrollBoxRight: Math.round(boxRight), scrollW: sa ? sa.scrollWidth : 0, boxW: sa ? sa.clientWidth : 0,
      });
    });
    return out;
  },
  analyze: (res, { vp }) => {
    const fails = [];
    const warns = [];
    const info = [`${res.counts.canvas} canvas · ${res.counts.svg} svg · ${res.counts.maps} mapas · ${res.counts.tables} tablas`];
    for (const c of res.charts) {
      const minH = c.kind === 'mapa' ? 150 : 100;
      if (c.height < minH) fails.push(`${c.kind} colapsado (${c.width}x${c.height}px): ${c.d}`);
      if (c.right > vp.width + 1 && !c.contained) fails.push(`${c.kind} se sale del viewport (borde derecho ${c.right}px > ${vp.width}px): ${c.d}`);
      else if (c.parentW && c.width > c.parentW + 2 && !c.contained) warns.push(`${c.kind} más ancho que su contenedor (${c.width}px > ${c.parentW}px): ${c.d}`);
      if (vp.width < 768 && c.kind !== 'mapa' && c.width < 240 && c.width > 0) warns.push(`${c.kind} muy angosto en móvil (${c.width}px): ${c.d}`);
    }
    res.blank.forEach((d) => warns.push(`canvas sin dibujar (¿sin datos o no redimensionó?): ${d}`));
    for (const t of res.tables) {
      if (t.width > vp.width + 1 && !t.hasScroll) fails.push(`tabla de ${t.width}px sin contenedor con scroll horizontal: ${t.d}`);
      else if (t.hasScroll && t.scrollBoxRight > vp.width + 1) fails.push(`el contenedor con scroll de la tabla se sale del viewport (${t.scrollBoxRight}px): ${t.d}`);
      else if (vp.width < 768 && t.hasScroll && t.scrollW > t.boxW * 2.5) warns.push(`tabla muy ancha en móvil (${t.scrollW}px de contenido en ${t.boxW}px visibles): ${t.d}`);
    }
    return { fails, warns, info };
  },
};

await runStandalone(bot, import.meta.url);
