#!/usr/bin/env node
/**
 * BOT MODALES OP 5 · Móvil (390×844)
 * En cada uno de los 9 modales valida:
 *  - el modal ocupa la pantalla sin desbordar horizontalmente (documento, modal y área principal);
 *  - el encabezado conserva título y botón cerrar de 36px, y aparece el botón "Filtros";
 *  - el panel es una HOJA INFERIOR (position fixed, pegada abajo, alto <= 82% del viewport) cerrada al
 *    abrir el modal, que se abre con "Filtros" y se cierra con "Aplicar";
 *  - todos los controles del panel (selects, búsquedas, botones, series, exportar, Aplicar) miden >= 44px;
 *  - el gráfico (o el mapa) tiene alto útil (>= 150px) y las tablas anchas hacen scroll dentro de su contenedor.
 */
import { conNavegador, abrirPagina, crearBot, MODALES, VP_MOVIL, erroresDesde } from './modales-op/lib.mjs';

const bot = crearBot('BOT MODALES OP 5 · MÓVIL 390×844 (HOJA INFERIOR)');

await conNavegador(async (cdp) => {
  const page = await abrirPagina(cdp, VP_MOVIL, { tema: 'dark' });
  const c0 = page.state.consoleErrors.length;
  const e0 = page.state.exceptions.length;

  for (const m of MODALES) {
    const fallas = [];
    const avisos = [];
    try {
      await page.evaluate(`async () => window.__mo.asegurarCerrado()`);
      const r = await page.evaluate(`async (id) => window.__mo.abrir(id)`, m.id);
      if (!r.ok) { bot.registrar(`${m.n}. ${m.nombre}`, [r.motivo]); continue; }

      const M = await page.evaluate(`async () => {
        const mo = window.__mo;
        const d = mo.dialogo();
        const vw = innerWidth, vh = innerHeight;
        const rect = (e) => { const r = e.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
        const rail = d.querySelector('aside[data-rail]');
        const fbtn = d.querySelector('[data-filters-btn]');
        const cerrar = d.querySelector('button[aria-label="Cerrar"]');
        const main = d.querySelector('.ms-main');
        const out = {
          vw, vh,
          docScroll: document.documentElement.scrollWidth,
          dialog: rect(d), dialogScroll: d.scrollWidth, dialogClient: d.clientWidth,
          mainScroll: main?.scrollWidth, mainClient: main?.clientWidth,
          titulo: !!d.querySelector('.ms-title')?.textContent?.trim(),
          cerrar: cerrar ? rect(cerrar) : null,
          filtrosBtn: fbtn ? { ...rect(fbtn), visible: getComputedStyle(fbtn).display !== 'none' } : null,
          railCerrado: null, railAbierto: null, controles: [], aplicar: null, tablaWraps: [],
        };
        if (rail) {
          const cs = getComputedStyle(rail);
          out.railCerrado = { pos: cs.position, visible: cs.visibility !== 'hidden', t: rect(rail).t, vis: rail.getAttribute('data-open') };
        }
        const canvas = d.querySelector('canvas[data-modal-chart]');
        out.canvasH = canvas ? canvas.offsetHeight : null;
        if (d.querySelector('[data-free-area]') && !d.querySelector('table')) await mo.esperar(() => d.querySelector('.leaflet-container'), 15000);
        const leaf = d.querySelector('.leaflet-container');
        out.mapaH = leaf ? Math.round(leaf.getBoundingClientRect().height) : null;
        const rc = d.querySelector('.recharts-wrapper');
        out.rechartsH = rc ? rc.offsetHeight : null;
        // tablas: el contenedor debe hacer scroll si la tabla es más ancha
        d.querySelectorAll('table').forEach((t) => {
          const wrap = t.closest('.ms-tablewrap, .ms-free, .table-responsive-container') || t.parentElement;
          const ox = getComputedStyle(wrap).overflowX;
          out.tablaWraps.push({ ancha: t.scrollWidth > wrap.clientWidth + 1, scroll: ox === 'auto' || ox === 'scroll', w: t.scrollWidth, cw: wrap.clientWidth });
        });

        // abre la hoja
        if (fbtn && getComputedStyle(fbtn).display !== 'none') {
          fbtn.click();
          await mo.esperar(() => Math.abs(rail.getBoundingClientRect().bottom - vh) < 3, 4000);
          await mo.sleep(300);
          const cs2 = getComputedStyle(rail);
          out.railAbierto = { ...rect(rail), pos: cs2.position, visible: cs2.visibility !== 'hidden', data: rail.getAttribute('data-open'), altoMax: vh * 0.82 };
          const vis = (e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none'; };
          const sel = ['select', 'input:not([type=checkbox]):not([type=radio])', 'button', 'label.ms-serie', 'label.ms-check'];
          sel.forEach((s) => rail.querySelectorAll(s).forEach((e) => {
            if (!vis(e)) return;
            if (e.hasAttribute('data-apply')) return;
            const h = Math.round(e.getBoundingClientRect().height);
            out.controles.push({ tag: s, txt: ((e.innerText || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '') + '').trim().slice(0, 24), h });
          }));
          const ap = rail.querySelector('[data-apply]');
          if (ap) {
            const hApl = Math.round(ap.getBoundingClientRect().height);
            ap.scrollIntoView({ block: 'nearest' });
            ap.click();
            await mo.sleep(500);
            out.aplicar = { h: hApl, cerro: rail.getAttribute('data-open') === 'false' || getComputedStyle(rail).visibility === 'hidden' };
          }
        }
        return out;
      }`);

      // ── desbordes ──
      if (M.docScroll > M.vw + 1) fallas.push(`el documento desborda horizontalmente (scrollWidth ${M.docScroll} > ${M.vw})`);
      if (M.dialog.l < -1 || M.dialog.r > M.vw + 1) fallas.push(`el modal se sale de la pantalla (${M.dialog.l}…${M.dialog.r} de ${M.vw})`);
      if (M.dialogScroll > M.dialogClient + 1) fallas.push(`el modal desborda (scrollWidth ${M.dialogScroll} > ${M.dialogClient})`);
      if (M.mainScroll > M.mainClient + 1) fallas.push(`el área principal desborda (scrollWidth ${M.mainScroll} > ${M.mainClient})`);
      M.tablaWraps.forEach((t, i) => { if (t.ancha && !t.scroll) fallas.push(`la tabla #${i + 1} (${t.w}px) es más ancha que su contenedor (${t.cw}px) y no hace scroll`); });

      // ── encabezado ──
      if (!M.titulo) fallas.push('el encabezado no conserva el título');
      if (!M.cerrar) fallas.push('no hay botón cerrar');
      else {
        if (Math.abs(M.cerrar.w - 36) > 1 || Math.abs(M.cerrar.h - 36) > 1) fallas.push(`el botón cerrar mide ${M.cerrar.w}×${M.cerrar.h} (se esperaban 36×36)`);
        if (M.cerrar.r > M.vw + 1 || M.cerrar.l < 0) fallas.push('el botón cerrar queda fuera de la pantalla');
      }

      // ── hoja inferior ──
      if (!M.filtrosBtn || !M.filtrosBtn.visible) fallas.push('falta el botón "Filtros" que abre la hoja inferior');
      else if (M.filtrosBtn.h < 36) avisos.push(`el botón Filtros mide ${M.filtrosBtn.h}px`);
      if (M.railCerrado && M.railCerrado.visible && M.railCerrado.t < M.vh) fallas.push('la hoja inferior debe estar cerrada al abrir el modal');
      if (!M.railAbierto) fallas.push('no se pudo abrir la hoja inferior con "Filtros"');
      else {
        const a = M.railAbierto;
        if (a.pos !== 'fixed') fallas.push(`el panel debe ser una hoja inferior (position fixed) y es ${a.pos}`);
        if (Math.abs(a.b - M.vh) > 3) fallas.push(`la hoja no queda pegada abajo (bottom ${a.b} vs ${M.vh})`);
        if (a.h > a.altoMax + 2) fallas.push(`la hoja mide ${a.h}px (máximo 82% = ${Math.round(a.altoMax)}px)`);
        if (a.w < M.vw - 2) fallas.push(`la hoja no ocupa todo el ancho (${a.w}px de ${M.vw}px)`);
        if (a.data !== 'true') fallas.push('data-open debe ser "true" al abrir la hoja');
        const chicos = M.controles.filter((c) => c.h < 44);
        chicos.slice(0, 6).forEach((c) => fallas.push(`control de ${c.h}px (<44px): ${c.tag} "${c.txt}"`));
        if (chicos.length > 6) fallas.push(`… y ${chicos.length - 6} controles más de menos de 44px`);
        if (!M.aplicar) fallas.push('falta el botón "Aplicar"');
        else {
          if (M.aplicar.h < 44) fallas.push(`el botón Aplicar mide ${M.aplicar.h}px (<44px)`);
          if (!M.aplicar.cerro) fallas.push('"Aplicar" no cierra la hoja');
        }
      }

      // ── alto útil del gráfico / mapa ──
      const alto = M.canvasH ?? M.mapaH ?? M.rechartsH;
      if (m.grafico.kind !== 'ninguno') {
        if (alto === null || alto === undefined) fallas.push('no se encontró el gráfico/mapa');
        else if (alto < 150) fallas.push(`el gráfico/mapa mide ${alto}px de alto (mínimo 150px)`);
      }
    } catch (e) {
      fallas.push(`error ejecutando el chequeo: ${e.message}`);
    }
    bot.registrar(`${m.n}. ${m.nombre}`, fallas, avisos);
    await page.evaluate(`async () => window.__mo.asegurarCerrado()`).catch(() => {});
  }
  bot.registrar('sin errores de consola durante el recorrido móvil', erroresDesde(page, c0, e0));
  await page.close();
});

bot.fin();
