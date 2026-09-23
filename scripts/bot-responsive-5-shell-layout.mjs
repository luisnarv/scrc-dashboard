#!/usr/bin/env node
/**
 * BOT RESPONSIVE 5 · Estructura general (header/nav, viewport, filtros, errores)
 *  - <meta viewport> correcto.
 *  - Header/nav dentro del ancho y sin ocupar demasiado alto fijo de la pantalla (también en
 *    móvil horizontal 844x390, donde un header alto deja sin espacio al contenido).
 *  - Filtros (select/input) dentro del viewport y con ancho usable.
 *  - Contenido no bloqueado (sin scroll vertical) y sin overlay de error de Next.
 *  - Excepciones JS no controladas (falla) y errores de consola (aviso).
 */
import { runStandalone, BASE_VIEWPORTS } from './responsive/lib.mjs';

export const bot = {
  id: 'BOT R5',
  name: 'Estructura general y layout',
  desc: 'Meta viewport, header/nav, filtros, scroll vertical, overlay de error y errores JS (incluye móvil horizontal)',
  viewports: [...BASE_VIEWPORTS, 'movil-horizontal'],
  check: () => {
    const meta = document.querySelector('meta[name=viewport]');

    // altura fija ocupada arriba (header/nav sticky o fixed pegados al borde superior)
    let fixedTop = 0;
    const fixedList = [];
    for (const el of document.querySelectorAll('body *')) {
      const pos = getComputedStyle(el).position;
      if (pos !== 'fixed' && pos !== 'sticky') continue;
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.top <= 1 && r.width >= vw * 0.5 && r.bottom > 0) {
        fixedTop = Math.max(fixedTop, r.bottom);
        fixedList.push(describe(el));
      }
    }

    const shell = [];
    for (const el of document.querySelectorAll('header, nav, [role=navigation]')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      shell.push({
        d: describe(el), right: Math.round(r.right), height: Math.round(r.height),
        spill: el.scrollWidth - el.clientWidth, scrolls: ['auto', 'scroll'].includes(getComputedStyle(el).overflowX),
      });
    }

    const controls = [];
    for (const el of document.querySelectorAll('select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      controls.push({ d: describe(el), width: Math.round(r.width), right: Math.round(r.right), left: Math.round(r.left) });
    }

    const heading = [...document.querySelectorAll('h1, h2')].find(visible);
    const bodyOverflowY = getComputedStyle(document.body).overflowY;
    const htmlOverflowY = getComputedStyle(document.documentElement).overflowY;
    const portal = document.querySelector('nextjs-portal');
    const errorOverlay = !!(portal && portal.shadowRoot && portal.shadowRoot.querySelector('[data-nextjs-dialog], [data-nextjs-dialog-overlay]'));

    return {
      viewportMeta: meta ? meta.getAttribute('content') : null,
      fixedTop: Math.round(fixedTop), fixedList: fixedList.slice(0, 3),
      shell, controls,
      headingTop: heading ? Math.round(heading.getBoundingClientRect().top) : null,
      blockedScroll: (bodyOverflowY === 'hidden' || htmlOverflowY === 'hidden') && document.documentElement.scrollHeight > vh + 4,
      contentHeight: document.documentElement.scrollHeight,
      errorOverlay,
    };
  },
  analyze: (res, { vp, state }) => {
    const fails = [];
    const warns = [];
    if (!res.viewportMeta || !/width\s*=\s*device-width/.test(res.viewportMeta)) fails.push(`falta <meta name="viewport" content="width=device-width…"> (actual: ${res.viewportMeta})`);

    const pct = res.fixedTop / vp.height;
    if (pct > 0.35) fails.push(`elementos fijos arriba ocupan ${res.fixedTop}px = ${Math.round(pct * 100)}% del alto (${vp.height}px): ${res.fixedList.join(' | ')}`);
    else if (pct > 0.25) warns.push(`elementos fijos arriba ocupan ${res.fixedTop}px = ${Math.round(pct * 100)}% del alto: ${res.fixedList.join(' | ')}`);

    for (const s of res.shell) {
      if (s.right > vp.width + 1) fails.push(`${s.d} se sale del viewport (borde derecho ${s.right}px)`);
      else if (s.spill > 2 && !s.scrolls) fails.push(`${s.d} tiene contenido que no cabe (${s.spill}px de más) y no hace scroll`);
    }
    for (const c of res.controls) {
      if (c.right > vp.width + 1 || c.left < -1) fails.push(`filtro fuera del viewport: ${c.d} (x ${c.left}→${c.right}px)`);
      else if (c.width < 48) warns.push(`filtro demasiado angosto (${c.width}px): ${c.d}`);
    }
    if (res.headingTop !== null && res.headingTop > vp.height * 1.5) warns.push(`el primer título está a ${res.headingTop}px (más de 1.5 pantallas de bajada)`);
    if (res.blockedScroll) fails.push(`el contenido (${res.contentHeight}px) no cabe y el body/html tiene overflow-y:hidden: no se puede hacer scroll`);
    if (res.errorOverlay) fails.push('hay un overlay de error de Next.js visible');
    state.exceptions.slice(0, 3).forEach((e) => fails.push(`excepción JS no controlada: ${String(e).split('\n')[0].slice(0, 160)}`));
    [...new Set(state.consoleErrors)].slice(0, 3).forEach((e) => warns.push(`error en consola: ${e}`));
    return { fails, warns };
  },
};

await runStandalone(bot, import.meta.url);
