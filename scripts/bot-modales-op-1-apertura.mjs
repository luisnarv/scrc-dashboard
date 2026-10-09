#!/usr/bin/env node
/**
 * BOT MODALES OP 1 · Apertura y cierre
 * Abre cada uno de los 9 modales de /operativo desde su botón real y valida:
 *  - aparece [role=dialog] (aria-modal="true") con aria-label igual al título visible y que coincide con el esperado;
 *  - el título y el subtítulo van en la MISMA línea del encabezado (una sola fila);
 *  - Esc lo cierra; al reabrirlo, el botón × (aria-label="Cerrar") también;
 *  - el modal desaparece del DOM y no quedan restos (overlay) tras cerrarlo;
 *  - no se generan errores de consola ni excepciones durante todo el ciclo.
 */
import { conNavegador, abrirPagina, crearBot, erroresDesde, MODALES, VP_ESCRITORIO } from './modales-op/lib.mjs';

const bot = crearBot('BOT MODALES OP 1 · APERTURA Y CIERRE DE LOS 9 MODALES');

await conNavegador(async (cdp) => {
  const page = await abrirPagina(cdp, VP_ESCRITORIO);
  for (const m of MODALES) {
    const fallas = [];
    const avisos = [];
    const c0 = page.state.consoleErrors.length;
    const e0 = page.state.exceptions.length;
    try {
      await page.evaluate(`async () => window.__mo.asegurarCerrado()`);
      const r = await page.evaluate(`async (id) => window.__mo.abrir(id)`, m.id);
      if (!r.ok) {
        fallas.push(r.motivo);
      } else {
        const info = await page.evaluate(`async () => {
          const d = window.__mo.dialogo();
          const t = d.querySelector('.ms-title');
          const s = d.querySelector('.ms-sub');
          const rt = t?.getBoundingClientRect();
          const rs = s?.getBoundingClientRect();
          return {
            aria: d.getAttribute('aria-label'),
            modal: d.getAttribute('aria-modal'),
            titulo: t?.textContent?.trim() || '',
            mismaLinea: !s || (rt && rs && Math.abs((rt.top + rt.height / 2) - (rs.top + rs.height / 2)) < 12),
            cerrar: !!d.querySelector('button[aria-label="Cerrar"]'),
          };
        }`);
        if (info.modal !== 'true') fallas.push(`aria-modal debe ser "true" y es "${info.modal}"`);
        if (!info.aria) fallas.push('el diálogo no tiene aria-label');
        if (info.aria !== info.titulo) fallas.push(`aria-label ("${info.aria}") no coincide con el título visible ("${info.titulo}")`);
        if (!m.titulo.test(info.titulo)) fallas.push(`el título "${info.titulo}" no coincide con lo esperado ${m.titulo}`);
        if (!info.mismaLinea) avisos.push('el subtítulo no queda en la misma línea que el título');
        if (!info.cerrar) fallas.push('no hay botón × con aria-label="Cerrar"');

        // Esc cierra
        const esc = await page.evaluate(`async () => window.__mo.cerrarConEsc()`);
        if (!esc) fallas.push('Esc no cierra el modal');

        // × cierra
        const r2 = await page.evaluate(`async (id) => window.__mo.abrir(id)`, m.id);
        if (!r2.ok) fallas.push(`al reabrir: ${r2.motivo}`);
        else {
          const x = await page.evaluate(`async () => window.__mo.cerrarConBoton()`);
          if (!x) fallas.push('el botón × no cierra el modal');
        }
        const resto = await page.evaluate(`async () => { await window.__mo.sleep(300); return document.querySelectorAll('[role=dialog][data-modal-shell]').length + document.querySelectorAll('.modal-back.open').length; }`);
        if (resto > 0) fallas.push(`quedan ${resto} nodos de modal/overlay en el DOM tras cerrar`);
      }
    } catch (e) {
      fallas.push(`error ejecutando el chequeo: ${e.message}`);
    }
    fallas.push(...erroresDesde(page, c0, e0));
    bot.registrar(`${m.n}. ${m.nombre}`, fallas, avisos);
  }
  await page.close();
});

bot.fin();
