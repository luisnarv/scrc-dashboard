#!/usr/bin/env node
/**
 * BOT E2E 2 · Botones y controles de TODAS las vistas
 * En cada vista descubre los controles reales de <main> (botones, selects, búsquedas, casillas, paginación,
 * botones "Expandir", desplegables ▼…) y los opera uno por uno, con los filtros globales combinados activos
 * (Norte-Centro + Multifamiliar → vuelve a "Todos" → Sur), validando:
 *  - ningún control lanza excepciones ni errores de consola;
 *  - "Expandir"/"Ver…"/"Abrir" abren una ventana que se cierra con Esc (y con ×) y deja la vista intacta;
 *  - selects: cada opción se aplica sin romper la vista y al menos una cambia lo que se ve;
 *  - búsquedas: filtran (o dejan "sin resultados") y al borrar vuelven a mostrar lo mismo;
 *  - casillas: marcar/desmarcar restituye la vista; paginación: Siguiente cambia y Anterior vuelve;
 *  - botones de estado (aria-pressed / segmentados): el estado cambia al pulsarlos;
 *  - cabecera: alternar tema claro/oscuro 2 veces y cada enlace del menú carga su vista.
 */
import { conNavegador, abrirVista, crearBot, erroresDesde, VISTAS_ACTIVAS, VP } from './e2e/lib.mjs';

const bot = crearBot('BOT E2E 2 · BOTONES Y CONTROLES DE TODAS LAS VISTAS');

// ── Código que corre dentro de la página ──
const LISTAR = `() => {
  const NL = String.fromCharCode(10);
  const limpio = (t) => String(t || '').split(NL).join(' ').trim();
  const els = [...document.querySelectorAll('main button, main select, main input, main [role=button]')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.disabled && e.getAttribute('type') !== 'hidden'; });
  const vistos = {};
  return els.map((e) => {
    const tipo = e.tagName === 'SELECT' ? 'select' : (e.tagName === 'INPUT' ? (e.type === 'checkbox' ? 'check' : e.type === 'radio' ? 'radio' : 'texto') : 'boton');
    const base = tipo + '#' + (e.id || '') + '|' + limpio(e.innerText || e.getAttribute('aria-label') || e.title || e.placeholder || '').slice(0, 40);
    vistos[base] = (vistos[base] || 0) + 1;
    return { key: base + '|' + vistos[base], tipo };
  });
}`;

const PROBAR = `async (key) => {
  const e = window.__e2e;
  const NL = String.fromCharCode(10);
  const limpio = (t) => String(t || '').split(NL).join(' ').trim();
  const lista = () => {
    const els = [...document.querySelectorAll('main button, main select, main input, main [role=button]')]
      .filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !x.disabled && x.getAttribute('type') !== 'hidden'; });
    const vistos = {};
    return els.map((x) => {
      const tipo = x.tagName === 'SELECT' ? 'select' : (x.tagName === 'INPUT' ? (x.type === 'checkbox' ? 'check' : x.type === 'radio' ? 'radio' : 'texto') : 'boton');
      const base = tipo + '#' + (x.id || '') + '|' + limpio(x.innerText || x.getAttribute('aria-label') || x.title || x.placeholder || '').slice(0, 40);
      vistos[base] = (vistos[base] || 0) + 1;
      return { key: base + '|' + vistos[base], tipo, el: x };
    });
  };
  const buscar = () => lista().find((x) => x.key === key);
  const it = buscar();
  if (!it) return { ok: true, desaparecio: true, tipo: '?', avisos: ['el control ya no existe (la vista se reorganizó al operar otro)'] };
  const res = { tipo: it.tipo, ok: true, notas: [], avisos: [] };
  const hayModal = () => !!document.querySelector('[role=dialog], .modal-back.open, [data-modal-shell]');
  const cerrarModal = async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await e.sleep(500);
    if (hayModal()) {
      const x = [...document.querySelectorAll('[role=dialog] button, .modal-back.open button')].find((b) => b.getAttribute('aria-label') === 'Cerrar' || ['✕', '×', 'x'].includes((b.innerText || '').trim()) || (b.className || '').includes('modal-close'));
      if (x) { x.click(); await e.sleep(500); }
    }
    return !hayModal();
  };
  const f0 = e.firma();

  if (it.tipo === 'select') {
    const sel = it.el;
    const original = sel.value;
    const opts = [...sel.options].map((o) => o.value);
    res.nOpciones = opts.length;
    let cambios = 0;
    for (const v of opts.slice(0, 8)) {
      if (v === original) continue;
      await e.setSelect(sel, v);
      await e.sleep(500);
      if (!document.querySelector('main') || (document.querySelector('main').innerText || '').trim().length < 30) { res.ok = false; res.notas.push('la vista quedó en blanco con la opción "' + v + '"'); }
      if (e.firma() !== f0) cambios++;
    }
    await e.setSelect(buscar()?.el || sel, original);
    await e.sleep(600);
    res.cambios = cambios;
    if (opts.length > 1 && cambios === 0) res.avisos.push('ninguna opción cambió lo que se ve');
    if (e.firma() !== f0) res.avisos.push('al restaurar la opción original la vista no volvió a lo mismo');
  } else if (it.tipo === 'texto') {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(it.el, 'zzzz_sin_coincidencias_9'); it.el.dispatchEvent(new Event('input', { bubbles: true }));
    await e.sleep(800);
    const f1 = e.firma();
    res.cambios = f1 !== f0 ? 1 : 0;
    const el2 = buscar()?.el || it.el;
    set.call(el2, ''); el2.dispatchEvent(new Event('input', { bubbles: true }));
    await e.sleep(800);
    if (f1 === f0) res.avisos.push('escribir un texto sin coincidencias no cambió la vista');
    if (e.firma() !== f0) res.avisos.push('al borrar la búsqueda la vista no volvió a lo mismo');
  } else if (it.tipo === 'check' || it.tipo === 'radio') {
    it.el.click(); await e.sleep(600);
    const f1 = e.firma();
    res.cambios = f1 !== f0 ? 1 : 0;
    const el2 = buscar()?.el || it.el;
    if (it.tipo === 'check') { el2.click(); await e.sleep(600); }
    if (it.tipo === 'check' && e.firma() !== f0) res.avisos.push('al volver a marcar/desmarcar la vista no volvió a lo mismo');
  } else {
    const el = it.el;
    const pressed0 = el.getAttribute('aria-pressed');
    const clase0 = el.className;
    const txt0 = limpio(el.innerText);
    const y0 = window.scrollY;
    el.click();
    await e.sleep(900);
    if (hayModal()) {
      res.abrioModal = true;
      res.titulo = (document.querySelector('[role=dialog]')?.getAttribute('aria-label')) || limpio(document.querySelector('.modal-back.open h3, .modal-back.open h2')?.innerText || '');
      res.cerroEsc = await cerrarModal();
      if (!res.cerroEsc) { res.ok = false; res.notas.push('la ventana no se cierra con Esc ni con ×'); }
    } else {
      const el2 = buscar()?.el || el;
      const pressed1 = el2.getAttribute('aria-pressed');
      res.cambios = (e.firma() !== f0 || pressed1 !== pressed0 || el2.className !== clase0 || limpio(el2.innerText) !== txt0) ? 1 : 0;
      if (pressed0 !== null && pressed0 === 'false' && pressed1 !== 'true') res.avisos.push('el botón segmentado no quedó seleccionado al pulsarlo');
      if (!res.cambios) res.avisos.push('el botón no produjo ningún cambio visible');
      // segundo clic: deshace el estado (desplegables, toggles)
      const el3 = buscar()?.el;
      if (el3 && res.cambios && (txt0.includes('▼') || txt0.includes('▾') || pressed0 !== null)) { el3.click(); await e.sleep(700); }
    }
  }
  const vivo = (document.querySelector('main')?.innerText || '').trim().length > 30 && !/No se pudo cargar/.test(document.body.innerText);
  if (!vivo) { res.ok = false; res.notas.push('la vista quedó vacía o con error tras operar el control'); }
  return res;
}`;

const filtrosPorEtapa = [
  { nombre: 'Norte-Centro + Multifamiliar', c: { proy: 'Norte-Centro', proceso: 'GESTOR' } },
  { nombre: 'Sur (SCR)', c: { proy: 'Sur', proceso: 'ALL' } },
];

const resumen = [];

await conNavegador(async (cdp) => {
  for (const v of VISTAS_ACTIVAS) {
    const page = await abrirVista(cdp, v);
    const c0 = page.state.consoleErrors.length;
    const e0 = page.state.exceptions.length;
    await page.evaluate(`async () => window.__e2e.fijarBase()`);
    const lista = await page.evaluate(LISTAR);
    const fallas = [];
    const avisos = [];
    let modales = 0;
    let cambios = 0;
    let probados = 0;
    const porTipo = {};

    if (!lista.length) {
      fallas.push('la vista no tiene ningún control operable en <main>');
    }

    // Etapa 1: con filtros combinados activos se opera cada control; etapa 2: otra combinación
    for (const [idxEtapa, etapa] of filtrosPorEtapa.entries()) {
      await page.evaluate(`async (c) => { await window.__e2e.fijarBase(); await window.__e2e.aplicar(c); }`, etapa.c);
      const keys = await page.evaluate(LISTAR);
      // la 2.ª etapa prueba solo una muestra (modales y selects) para no multiplicar el tiempo
      const aProbar = idxEtapa === 0 ? keys : keys.filter((k) => k.tipo === 'boton' && k.key.includes('btn-expand')).concat(keys.filter((k) => k.tipo === 'select').slice(0, 2));
      for (const k of aProbar) {
        if (/Actualizar Datos/.test(k.key) && idxEtapa > 0) continue;
        const ce = page.state.consoleErrors.length;
        const ee = page.state.exceptions.length;
        let r;
        try {
          r = await page.evaluate(PROBAR, k.key);
        } catch (e) {
          fallas.push(`[${etapa.nombre}] ${k.key}: error ejecutando el control: ${e.message}`);
          continue;
        }
        probados++;
        porTipo[k.tipo] = (porTipo[k.tipo] || 0) + 1;
        if (r.abrioModal) modales++;
        if (r.cambios) cambios++;
        if (!r.ok) fallas.push(`[${etapa.nombre}] ${k.key}: ${(r.notas || [r.nota]).join('; ')}`);
        if (/btn-expand/.test(k.key) && !r.abrioModal) fallas.push(`[${etapa.nombre}] ${k.key}: el botón "Expandir" no abrió ninguna ventana`);
        const nuevos = erroresDesde(page, ce, ee);
        if (nuevos.length) fallas.push(`[${etapa.nombre}] ${k.key}: ${nuevos[0]}`);
        if (idxEtapa === 0 && r.avisos?.length) avisos.push(`${k.key.split('|').slice(0, 2).join('|')}: ${r.avisos[0]}`);
      }
    }
    await page.evaluate(`async () => window.__e2e.fijarBase()`);
    resumen.push({ vista: v.nombre, probados, modales, cambios, porTipo });
    bot.registrar(`[${v.nombre}] ${probados} controles operados (${Object.entries(porTipo).map(([t, n]) => n + ' ' + t).join(', ') || 'ninguno'}) · ${modales} ventanas abiertas y cerradas · ${cambios} con efecto visible`, fallas, avisos);
    bot.registrar(`[${v.nombre}] sin errores de consola al operar los controles`, erroresDesde(page, c0, e0));
    await page.close();
  }

  // ── Cabecera: tema y menú ──
  {
    const fallas = [];
    const page = await abrirVista(cdp, VISTAS_ACTIVAS.find((v) => v.id === 'operativo') || VISTAS_ACTIVAS[0]);
    const c0 = page.state.consoleErrors.length;
    const e0 = page.state.exceptions.length;
    const T = await page.evaluate(`async () => {
      const e = window.__e2e;
      const tema = () => document.body.classList.contains('theme-dark') ? 'dark' : 'light';
      const t0 = tema();
      document.getElementById('btn-toggle-theme').click(); await e.sleep(700);
      const t1 = tema();
      document.getElementById('btn-toggle-theme').click(); await e.sleep(700);
      const t2 = tema();
      const links = [...document.querySelectorAll('#main-dash-nav a')].map((a) => a.getAttribute('href'));
      const cargas = [];
      for (const h of links) {
        const a = [...document.querySelectorAll('#main-dash-nav a')].find((x) => x.getAttribute('href') === h);
        a.click();
        await e.esperar(() => location.pathname === h, 6000);
        await e.esperar(() => !document.body.innerText.includes('Cargando información') && (document.querySelector('main')?.innerText || '').trim().length > 40, 90000);
        await e.sleep(800);
        cargas.push({ h, ok: location.pathname === h, chars: (document.querySelector('main')?.innerText || '').trim().length, activo: !!document.querySelector('#main-dash-nav a.active') && document.querySelector('#main-dash-nav a.active').getAttribute('href') === h });
      }
      return { t0, t1, t2, cargas };
    }`);
    if (T.t1 === T.t0) fallas.push('el botón de tema no alterna claro/oscuro');
    if (T.t2 !== T.t0) fallas.push('al pulsar el tema dos veces no vuelve al original');
    if (T.cargas.length < 4) fallas.push(`el menú debería tener al menos 4 enlaces y tiene ${T.cargas.length}`);
    T.cargas.forEach((c) => {
      if (!c.ok) fallas.push(`el enlace ${c.h} no navegó`);
      else if (c.chars < 40) fallas.push(`${c.h}: la vista quedó vacía`);
      if (c.ok && !c.activo) fallas.push(`${c.h}: el enlace no queda marcado como activo`);
    });
    fallas.push(...erroresDesde(page, c0, e0));
    bot.registrar(`Cabecera · tema claro/oscuro y ${T.cargas.length} enlaces del menú`, fallas);
    await page.close();
  }
});

console.log('\n  Controles operados por vista:');
resumen.forEach((r) => console.log(`    ${r.vista.padEnd(22)} ${String(r.probados).padStart(3)} controles · ${r.modales} ventanas · ${r.cambios} con efecto`));

bot.fin();
