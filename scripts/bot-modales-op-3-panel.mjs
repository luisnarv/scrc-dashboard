#!/usr/bin/env node
/**
 * BOT MODALES OP 3 · Panel lateral
 *  A. El panel (aside[data-rail]) mide 244px, cabe sin desbordar (scrollWidth <= clientWidth) y trae
 *     las secciones esperadas (FILTROS / SERIES / RESUMEN / Exportar).
 *  B. Se pliega y despliega con el botón ‹, el área principal ocupa el espacio liberado (el mapa
 *     recalcula su tamaño) y el estado se recuerda en localStorage ('op-modal-rail') al reabrir.
 *  C. Cambiar un filtro del panel (o, si el modal no trae filtros, una serie) cambia los datos del
 *     gráfico y/o de la tabla.
 *  D. Causales: el filtro Todas/Fallidas/Pérdidas del panel cuadra con la tarjeta de origen
 *     ("N órdenes: A fallidas · B pérdidas") en gráfico, tabla y KPIs.
 *     Órdenes: el gráfico del modal suma lo mismo que la tarjeta de origen por serie.
 *  E. Exportar PNG y CSV genera un archivo (nombre y tamaño > 0).
 */
import { conNavegador, abrirPagina, crearBot, MODALES, VP_ESCRITORIO } from './modales-op/lib.mjs';

const bot = crearBot('BOT MODALES OP 3 · PANEL LATERAL, FILTROS Y EXPORTACIÓN');

// ── Funciones que corren dentro de la página ──
const SNAPSHOT = `() => {
  const d = window.__mo.dialogo();
  const ch = window.__mo.chartModal();
  const tabla = d.querySelector('[data-table-area] table, [data-free-area] table');
  const filas = tabla ? tabla.querySelectorAll('tbody tr').length : 0;
  const celdas = tabla ? [...tabla.querySelectorAll('tbody tr')].slice(0, 30).map(r => r.innerText.replace(/\\s+/g, ' ')).join('|') : '';
  return JSON.stringify({
    datasets: ch ? ch.data.datasets.map(x => [String(x.label), (x.data || []).reduce((s, v) => s + (Number(v) || 0), 0), (x.data || []).length]) : [],
    labels: ch ? ch.data.labels : [],
    filas, celdas,
    kpis: [...d.querySelectorAll('[data-kpi]')].map(k => k.innerText.replace(/\\s+/g, ' ')),
    series: [...d.querySelectorAll('[data-serie]')].map(s => s.getAttribute('data-serie') + ':' + (s.querySelector('input')?.checked ? 1 : 0)),
    leaflet: d.querySelector('.leaflet-container') ? 1 : 0,
    rec: d.querySelectorAll('.recharts-line').length,
  });
}`;

// Prueba los controles de FILTROS (y, si no cambian nada, las SERIES) hasta que cambien los datos.
const PROBAR_FILTROS = `async (snapSrc) => {
  const snap = eval('(' + snapSrc + ')');
  const mo = window.__mo;
  const d = mo.dialogo();
  const rail = d.querySelector('aside[data-rail]');
  const abierto = () => { const m = rail.querySelector('[data-more-filters]'); return m; };
  const mas = abierto();
  if (mas && mas.getAttribute('aria-expanded') === 'false') { mas.click(); await mo.sleep(300); }
  const sec = rail.querySelector('[data-rail-section=filtros]');
  const controles = [];
  if (sec) {
    sec.querySelectorAll('select').forEach((s) => controles.push({ tipo: 'select', el: s, txt: s.getAttribute('aria-label') || 'select' }));
    sec.querySelectorAll('button[aria-pressed]').forEach((b) => controles.push({ tipo: 'seg', el: b, txt: b.innerText.trim(), activo: b.getAttribute('aria-pressed') === 'true' }));
    sec.querySelectorAll('input[type=checkbox]').forEach((c) => controles.push({ tipo: 'check', el: c, txt: c.parentElement?.innerText?.trim() || 'check' }));
    sec.querySelectorAll('input[type=search], input[type=text]').forEach((c) => controles.push({ tipo: 'texto', el: c, txt: c.getAttribute('aria-label') || 'texto' }));
  }
  const res = { nFiltros: controles.length, probados: [], cambio: null, via: null };
  const poner = async (c) => {
    if (c.tipo === 'select') {
      const opts = [...c.el.options].map((o) => o.value);
      const i = opts.indexOf(c.el.value);
      const sig = opts[(i + 1) % opts.length];
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      set.call(c.el, sig); c.el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (c.tipo === 'seg') { if (!c.activo) c.el.click(); else return false; }
    else if (c.tipo === 'check') c.el.click();
    else if (c.tipo === 'texto') {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(c.el, 'zzzz_sin_resultados'); c.el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await mo.sleep(900);
    return true;
  };
  for (const c of controles) {
    const antes = snap();
    const hizo = await poner(c);
    if (!hizo) continue;
    const despues = snap();
    res.probados.push(c.txt);
    if (antes !== despues) { res.cambio = c.txt; res.via = 'filtro'; return res; }
    // revierte para no acumular efectos
    if (c.tipo === 'texto') { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(c.el, ''); c.el.dispatchEvent(new Event('input', { bubbles: true })); await mo.sleep(300); }
  }
  // sin filtros que cambien datos: prueba una SERIE (también vive en el panel)
  const series = [...rail.querySelectorAll('[data-serie] input')];
  if (series.length > 1) {
    const antes = snap();
    series[series.length > 2 ? 1 : 0].click();
    await mo.sleep(900);
    if (antes !== snap()) { res.cambio = 'serie'; res.via = 'serie'; return res; }
  }
  return res;
}`;

const nums = (t) => Number(String(t).replace(/[^\d]/g, '')) || 0;

await conNavegador(async (cdp) => {
  const page = await abrirPagina(cdp, VP_ESCRITORIO, { tema: 'dark' });
  await page.evaluate(`async () => { try { localStorage.removeItem('op-modal-rail'); } catch (e) {} return true; }`);

  for (const m of MODALES) {
    const fallas = [];
    const avisos = [];
    try {
      await page.evaluate(`async () => window.__mo.asegurarCerrado()`);
      await page.evaluate(`async () => { try { localStorage.setItem('op-modal-rail', '0'); } catch (e) {} return true; }`);
      const r = await page.evaluate(`async (id) => window.__mo.abrir(id)`, m.id);
      if (!r.ok) { bot.registrar(`${m.n}. ${m.nombre}`, [r.motivo]); continue; }

      // ── A. panel: medidas y secciones ──
      const A = await page.evaluate(`async () => {
        const d = window.__mo.dialogo();
        const rail = d.querySelector('aside[data-rail]');
        if (!rail) return { hay: false };
        const secs = [...rail.querySelectorAll('[data-rail-section]')].map(s => s.getAttribute('data-rail-section'));
        const kpis = rail.querySelectorAll('[data-kpi]').length;
        const exps = [...rail.querySelectorAll('[data-export]')].map(b => ({ t: b.getAttribute('data-export'), off: b.disabled }));
        const bg = getComputedStyle(rail).backgroundColor;
        const panel = getComputedStyle(document.body).getPropertyValue('--panel').trim();
        return { hay: true, w: Math.round(rail.getBoundingClientRect().width), sw: rail.scrollWidth, cw: rail.clientWidth, secs, kpis, exps, nSeries: rail.querySelectorAll('[data-serie]').length };
      }`);
      if (!A.hay) fallas.push('no existe el panel lateral (aside[data-rail])');
      else {
        if (Math.abs(A.w - 244) > 2) fallas.push(`el panel mide ${A.w}px de ancho (se esperaban 244px)`);
        if (A.sw > A.cw) fallas.push(`el panel desborda horizontalmente (scrollWidth ${A.sw} > clientWidth ${A.cw})`);
        if (!A.secs.includes('filtros') && m.grafico.kind !== 'recharts' && m.id !== 'op-ord') avisos.push('sin sección FILTROS');
        const conGrafico = !['ninguno', 'mapa'].includes(m.grafico.kind);
        if (conGrafico && A.nSeries < 1) fallas.push('falta la sección SERIES con la lista de series');
        if (!['mapa'].includes(m.grafico.kind) && A.kpis < 1) fallas.push('falta la sección RESUMEN (KPIs)');
        if (A.kpis > 4) fallas.push(`RESUMEN trae ${A.kpis} KPIs (máximo 4, rejilla 2×2)`);
        if (!A.exps.length && m.id !== 'mapa') fallas.push('falta la sección de exportación');
        if (A.exps.some((e) => e.off)) fallas.push('hay botones de exportación deshabilitados');
      }

      // ── B. plegar / desplegar y recordar ──
      const B = await page.evaluate(`async () => {
        const mo = window.__mo;
        const d = mo.dialogo();
        const rail = d.querySelector('aside[data-rail]');
        const tog = d.querySelector('[data-rail-toggle]');
        if (!rail || !tog) return { hay: false };
        const area = d.querySelector('.ms-main');
        const w0 = area.getBoundingClientRect().width;
        tog.click(); await mo.sleep(500);
        const plegado = getComputedStyle(rail).display === 'none' || rail.getBoundingClientRect().width === 0;
        const w1 = area.getBoundingClientRect().width;
        const ls1 = localStorage.getItem('op-modal-rail');
        const lf = d.querySelector('.leaflet-container');
        const lw = lf ? Math.round(lf.getBoundingClientRect().width) : null;
        const libre = d.querySelector('.ms-free')?.getBoundingClientRect().width;
        await mo.cerrarConBoton();
        return { hay: true, plegado, w0: Math.round(w0), w1: Math.round(w1), ls1, lw, libre: libre ? Math.round(libre) : null };
      }`);
      if (!B.hay) fallas.push('no hay botón ‹ ([data-rail-toggle])');
      else {
        if (!B.plegado) fallas.push('el panel no se pliega al pulsar ‹');
        if (B.w1 <= B.w0) fallas.push(`el área principal no crece al plegar (${B.w0}px → ${B.w1}px)`);
        if (B.ls1 !== '1') fallas.push(`localStorage['op-modal-rail'] debe ser "1" al plegar y es ${JSON.stringify(B.ls1)}`);
        if (B.lw !== null && B.libre !== null && Math.abs(B.lw - B.libre) > 3) fallas.push(`el mapa no se redimensionó al plegar el panel (mapa ${B.lw}px vs área ${B.libre}px)`);
        const r2 = await page.evaluate(`async (id) => window.__mo.abrir(id)`, m.id);
        if (!r2.ok) fallas.push(`al reabrir: ${r2.motivo}`);
        else {
          const rec = await page.evaluate(`async () => {
            const d = window.__mo.dialogo();
            const rail = d.querySelector('aside[data-rail]');
            const recordaPlegado = getComputedStyle(rail).display === 'none';
            d.querySelector('[data-rail-toggle]').click();
            await window.__mo.sleep(400);
            return { recordaPlegado, desplegado: getComputedStyle(rail).display !== 'none', ls: localStorage.getItem('op-modal-rail') };
          }`);
          if (!rec.recordaPlegado) fallas.push('al reabrir el modal el panel no recordó que estaba plegado');
          if (!rec.desplegado) fallas.push('el panel no se vuelve a desplegar con ‹');
          if (rec.ls !== '0') fallas.push(`localStorage['op-modal-rail'] debe ser "0" al desplegar y es ${JSON.stringify(rec.ls)}`);
        }
      }

      // ── C. un filtro del panel cambia los datos ──
      const C = await page.evaluate(`async (src) => (${PROBAR_FILTROS})(src)`, SNAPSHOT);
      if (!C.cambio) {
        fallas.push(`ningún control del panel cambió los datos (probados: ${C.probados.join(', ') || 'ninguno'}; filtros: ${C.nFiltros})`);
      }

      // ── D. comparación con la tarjeta de origen ──
      if (m.id === 'op-causales') {
        const D = await page.evaluate(`async (snapSrc) => {
          const mo = window.__mo;
          const seg0 = [...mo.dialogo().querySelectorAll('[data-rail-section=filtros] button[aria-pressed]')].find(b => b.innerText.trim() === 'Todas');
          seg0?.click();
          await mo.sleep(1200);
          const origen = document.querySelector('#card-op-causales .ch-sub')?.textContent || '';
          const mm = origen.match(/([\\d.]+)\\s+[óo]rdenes:\\s*([\\d.]+)\\s+fallidas\\s*·\\s*([\\d.]+)\\s+p[ée]rdidas/i);
          const num = (t) => Number(String(t).replace(/[^\\d]/g, '')) || 0;
          const out = { origen: mm ? { total: num(mm[1]), fallidas: num(mm[2]), perdidas: num(mm[3]) } : null, casos: {} };
          const d = mo.dialogo();
          const seg = (txt) => [...d.querySelectorAll('[data-rail-section=filtros] button[aria-pressed]')].find(b => b.innerText.trim() === txt);
          for (const [clave, txt] of [['Todas', 'Todas'], ['Fallidas', 'Fallidas'], ['Perdidas', 'Pérdidas']]) {
            seg(txt)?.click();
            await mo.sleep(1100);
            const dd = mo.dialogo();
            const ch = mo.chartModal();
            const sumaGraf = ch ? ch.data.datasets.reduce((s, x) => s + (x.data || []).reduce((a, v) => a + (Number(v) || 0), 0), 0) : -1;
            const filas = [...dd.querySelectorAll('[data-table-area] tbody tr')];
            // filas de primer nivel = las que tienen la flecha ▶ (las de brigada son hijas, solo si están abiertas)
            const principales = filas.filter(r => r.querySelector('td')?.innerText.includes('▶'));
            const colTotal = [...dd.querySelectorAll('[data-table-area] thead th')].findIndex(t => /^total$/i.test(t.innerText.trim()));
            const sumaTabla = principales.reduce((s, r) => s + num(r.querySelectorAll('td')[colTotal]?.innerText), 0);
            const kp = {};
            dd.querySelectorAll('[data-kpi]').forEach(k => { const [l, ...v] = k.innerText.split('\\n'); kp[l.trim().toLowerCase()] = v.join(' '); });
            out.casos[clave] = { sumaGraf, sumaTabla, nSeries: ch ? ch.data.datasets.length : 0, kpi: { total: num(kp['total']), fallidas: num(kp['fallidas']), perdidas: num(kp['pérdidas']) }, titulo: dd.getAttribute('aria-label') };
          }
          seg('Todas')?.click();
          await mo.sleep(500);
          return out;
        }`, SNAPSHOT);
        if (!D.origen) fallas.push('no se pudo leer "N órdenes: A fallidas · B pérdidas" de la tarjeta de origen');
        else {
          const esp = { Todas: D.origen.total, Fallidas: D.origen.fallidas, Perdidas: D.origen.perdidas };
          for (const [k, v] of Object.entries(esp)) {
            const c = D.casos[k];
            if (c.sumaGraf !== v) fallas.push(`${k}: el gráfico suma ${c.sumaGraf} y la tarjeta dice ${v}`);
            if (c.sumaTabla !== v) fallas.push(`${k}: la tabla suma ${c.sumaTabla} y la tarjeta dice ${v}`);
          }
          if (D.casos.Todas.kpi.total !== D.origen.total) fallas.push(`KPI Total=${D.casos.Todas.kpi.total} vs tarjeta ${D.origen.total}`);
          if (D.casos.Todas.kpi.fallidas !== D.origen.fallidas) fallas.push(`KPI Fallidas=${D.casos.Todas.kpi.fallidas} vs tarjeta ${D.origen.fallidas}`);
          if (D.casos.Todas.kpi.perdidas !== D.origen.perdidas) fallas.push(`KPI Pérdidas=${D.casos.Todas.kpi.perdidas} vs tarjeta ${D.origen.perdidas}`);
          if (D.origen.fallidas + D.origen.perdidas !== D.origen.total) fallas.push('en la tarjeta Fallidas + Pérdidas != Total');
        }
      }
      if (m.id === 'op-causales') {
        // Filtrar SOLO por "Otras causales": la tabla debe listar todas las causales que agrupa
        const O = await page.evaluate(`async () => {
          const mo = window.__mo;
          const d = mo.dialogo();
          d.querySelector('.ms-link')?.click();
          await mo.sleep(500);
          const inp = d.querySelector('[data-serie="Otras causales"] input');
          if (!inp) return { hay: false };
          inp.click();
          await mo.sleep(1000);
          const dd = mo.dialogo();
          const filas = [...dd.querySelectorAll('[data-table-area] tbody tr')].map(r => (r.querySelector('td')?.innerText || '').replace(/[▶└]/g, '').trim());
          const ch = mo.chartModal();
          const col = [...dd.querySelectorAll('[data-table-area] thead th')].findIndex(t => /^total$/i.test(t.innerText.trim()));
          const num = (t) => Number(String(t).replace(/[^\\d]/g, '')) || 0;
          const suma = [...dd.querySelectorAll('[data-table-area] tbody tr')].reduce((s, r) => s + num(r.querySelectorAll('td')[col]?.innerText), 0);
          const graf = ch ? ch.data.datasets.reduce((s, x) => s + (x.data || []).reduce((a, v) => a + (Number(v) || 0), 0), 0) : -1;
          dd.querySelector('.ms-link')?.click();
          await mo.sleep(500);
          return { hay: true, filas, suma, graf, nSeries: ch ? ch.data.datasets.length : 0 };
        }`);
        if (O.hay) {
          if (O.nSeries !== 1) fallas.push(`al filtrar solo "Otras causales" el gráfico debe tener 1 serie y tiene ${O.nSeries}`);
          if (O.filas.length < 2) fallas.push(`al filtrar solo "Otras causales" la tabla debe listar TODAS las causales que agrupa y lista ${O.filas.length}`);
          if (O.filas.includes('Otras causales')) fallas.push('la tabla sigue mostrando la fila resumen "Otras causales" en lugar de sus causales');
          if (O.suma !== O.graf) fallas.push(`las causales listadas suman ${O.suma} y la serie "Otras causales" ${O.graf}`);
        } else avisos.push('no hay serie "Otras causales" con los datos actuales');
      }
      if (m.id === 'op-ord') {
        // El gráfico del modal debe sumar lo mismo que la tarjeta de origen, serie por serie.
        const cmp = await page.evaluate(`async () => {
          const mo = window.__mo;
          const d = mo.dialogo();
          const ch = mo.chartModal();
          const card = window.Chart.getChart(document.getElementById('op-ord'));
          const suma = (c) => Object.fromEntries(c.data.datasets.map(x => [String(x.label).replace(/ esperada$/i, ''), (x.data || []).reduce((s, v) => s + (Number(v) || 0), 0)]));
          return { modal: ch ? suma(ch) : null, tarjeta: card ? suma(card) : null };
        }`);
        if (!cmp.modal || !cmp.tarjeta) fallas.push('no se pudo comparar el gráfico del modal con el de la tarjeta de origen');
        else {
          const filtro = C.via === 'serie' ? ' (tras ocultar una serie; comparación omitida)' : '';
          if (!filtro) for (const k of Object.keys(cmp.tarjeta)) {
            if (cmp.modal[k] !== cmp.tarjeta[k]) fallas.push(`serie "${k}": modal ${cmp.modal[k]} vs tarjeta ${cmp.tarjeta[k]}`);
          }
        }
      }

      // ── E. exportar PNG y CSV ──
      await page.evaluate(`async () => window.__mo.asegurarCerrado()`);
      await page.evaluate(`async () => { window.__descargas.length = 0; return true; }`);
      const r3 = await page.evaluate(`async (id) => window.__mo.abrir(id)`, m.id);
      if (r3.ok) {
        const E = await page.evaluate(`async () => {
          const mo = window.__mo;
          const d = mo.dialogo();
          const out = {};
          const botones = [...d.querySelectorAll('[data-export]')];
          for (const b of botones) {
            const etiqueta = b.getAttribute('data-export');
            const n0 = window.__descargas.length;
            b.click();
            for (let i = 0; i < 40 && window.__descargas.length === n0; i++) await mo.sleep(100);
            out[etiqueta] = window.__descargas.length > n0 ? window.__descargas[window.__descargas.length - 1] : null;
          }
          return out;
        }`);
        const etiquetas = Object.keys(E);
        if (!etiquetas.length && m.id !== 'mapa') fallas.push('sin botones de exportación');
        for (const [et, f] of Object.entries(E)) {
          if (!f) fallas.push(`"${et}" no generó ningún archivo`);
          else if (!f.nombre || f.size <= 0) fallas.push(`"${et}" generó un archivo vacío (${JSON.stringify(f)})`);
          else if (/csv/i.test(et) && !/\.csv$/i.test(f.nombre)) fallas.push(`"${et}" debe ser .csv y es ${f.nombre}`);
          else if (/png/i.test(et) && !(/\.png$/i.test(f.nombre) || /image\/png/.test(f.tipo))) fallas.push(`"${et}" debe ser PNG y es ${f.nombre} (${f.tipo})`);
        }
        if (etiquetas.length && !etiquetas.some((e) => /csv|xlsx|excel/i.test(e))) fallas.push('no hay botón de exportación CSV/XLSX');
      }
    } catch (e) {
      fallas.push(`error ejecutando el chequeo: ${e.message}`);
    }
    bot.registrar(`${m.n}. ${m.nombre}`, fallas, avisos);
    await page.evaluate(`async () => window.__mo.asegurarCerrado()`).catch(() => {});
  }
  await page.close();
});

bot.fin();
