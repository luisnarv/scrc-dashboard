#!/usr/bin/env node
/**
 * BOT MODALES OP 2 · Gráficos
 * Con Chart.getChart(canvas) valida el TIPO de gráfico de cada modal y sus series:
 *  1. op-ord       → barras APILADAS Efectivas/Fallidas/Perdidas (--ok/--warn/--err) + línea "Meta" #F57C00 con borderDash [6,4]
 *  2. op-brig      → LÍNEAS de cuadrillas + "Promedio Brigadas" #78909C punteada
 *  3. op-tipos     → ÁREA rellena (alpha .22) del tipo seleccionado y los demás tipos atenuados (alpha .28)
 *  4. op-causales  → LÍNEAS con la paleta de series del tema; "Otras causales" en el gris del tema
 *  5. disponibilidad → líneas (Recharts) + tabla heatmap
 *  6. evolutivo    → ÁREA APILADA por tipo (fill + eje y apilado)
 *  7. brig-tipo    → barras AGRUPADAS por tipo
 *  8. detalle      → sin gráfico; tabla jerárquica a todo el ancho
 *  9. mapa         → contenedor Leaflet con alto útil
 * En todos: alto del gráfico > 150px, etiqueta "TIPO DE GRÁFICO · unidad", leyenda interna oculta
 * (la leyenda vive en SERIES del panel) y ningún color sin resolver (nada de "var(").
 */
import { conNavegador, abrirPagina, crearBot, MODALES, VP_ESCRITORIO, normColor, parseRgb } from './modales-op/lib.mjs';

const bot = crearBot('BOT MODALES OP 2 · TIPO Y SERIES DE LOS GRÁFICOS');

const CHART_FIXED = { META: '#F57C00', PROMEDIO: '#78909C' };
// Paleta de series y gris del tema (THEME_COLORS en ThemeProvider.tsx); el bot corre en tema oscuro
const SERIES_OSCURO = ['#3B8AD9', '#4ADE9E', '#F0C040', '#A78BFA', '#4A9EE8', '#2BD98C', '#FF9F5A', '#85A3C4'];
const MUT_OSCURO = '#85A3C4';
const ALTO_MIN = 150;

await conNavegador(async (cdp) => {
  const page = await abrirPagina(cdp, VP_ESCRITORIO, { tema: 'dark' });
  const vars = await page.evaluate(`async () => {
    const g = (n) => getComputedStyle(document.body).getPropertyValue(n).trim();
    return { ok: g('--ok'), warn: g('--warn'), err: g('--err') };
  }`);

  for (const m of MODALES) {
    const fallas = [];
    const avisos = [];
    try {
      await page.evaluate(`async () => window.__mo.asegurarCerrado()`);
      const r = await page.evaluate(`async (id) => window.__mo.abrir(id)`, m.id);
      if (!r.ok) { bot.registrar(`${m.n}. ${m.nombre}`, [r.motivo]); continue; }

      const k = m.grafico.kind;
      if (['apilado', 'lineas', 'area', 'agrupado', 'area-apilada', 'causales'].includes(k)) {
        const ch = await page.evaluate(`async () => {
          const c = window.__mo.resumenChart(window.__mo.chartModal());
          if (!c) return null;
          const ch = window.__mo.chartModal();
          c.legendVisible = ch.options.plugins?.legend?.display !== false;
          c.yStacked = !!ch.options.scales?.y?.stacked;
          c.xStacked = !!ch.options.scales?.x?.stacked;
          c.etiqueta = document.querySelector('[data-chart-label]')?.textContent?.trim() || '';
          c.sinResolver = JSON.stringify(ch.data.datasets.map(d => [d.borderColor, d.backgroundColor])).includes('var(');
          c.labelsArr = (ch.data.labels || []).map(String);
          c.ultimoConDato = ch.data.datasets.reduce((m, d) => Math.max(m, (d.data || []).reduce((u, v, i) => (Number(v) > 0 ? i : u), -1)), -1);
          c.titulo = window.__mo.dialogo()?.getAttribute('aria-label') || '';
          return c;
        }`);
        if (!ch) fallas.push('no hay un Chart.js en el modal (window.Chart.getChart devolvió null)');
        else {
          if (ch.h <= ALTO_MIN) fallas.push(`el canvas mide ${ch.h}px de alto (mínimo ${ALTO_MIN}px)`);
          if (ch.legendVisible) fallas.push('la leyenda interna del gráfico debe estar oculta (usa SERIES del panel)');
          if (ch.sinResolver) fallas.push('hay colores sin resolver ("var(...)") en los datasets');
          if (!/\s·\s/.test(ch.etiqueta)) fallas.push(`la etiqueta del gráfico debe ser "TIPO DE GRÁFICO · unidad" y es "${ch.etiqueta}"`);
          const ds = ch.datasets;
          const por = (re) => ds.find((d) => re.test(d.label));

          if (k === 'apilado') {
            if (ch.tipo !== 'bar') fallas.push(`tipo base "${ch.tipo}", se esperaba "bar" (barras)`);
            if (!ch.xStacked || !ch.yStacked) fallas.push('los ejes x/y deben estar apilados (stacked) en barras apiladas');
            const exp = { Efectivas: vars.ok, Fallidas: vars.warn, Perdidas: vars.err };
            for (const [lab, col] of Object.entries(exp)) {
              const d = por(new RegExp('^' + lab, 'i'));
              if (!d) fallas.push(`falta la serie "${lab}"`);
              else {
                if (d.tipo !== 'bar') fallas.push(`"${lab}" debe ser barra y es ${d.tipo}`);
                if (!d.stack) fallas.push(`"${lab}" no pertenece a un stack`);
                if (normColor(d.backgroundColor) !== normColor(col)) fallas.push(`color de "${lab}" = ${d.backgroundColor}, se esperaba ${col} (variable de tema)`);
              }
            }
            const meta = por(/^Meta/i);
            if (!meta) fallas.push('falta el dataset "Meta"');
            else {
              if (meta.tipo !== 'line') fallas.push(`"Meta" debe ser línea y es ${meta.tipo}`);
              if (JSON.stringify(meta.borderDash) !== '[6,4]') fallas.push(`"Meta" debe llevar borderDash [6,4] y lleva ${JSON.stringify(meta.borderDash)}`);
              if (normColor(meta.borderColor) !== normColor(CHART_FIXED.META)) fallas.push(`color de "Meta" = ${meta.borderColor}, se esperaba ${CHART_FIXED.META}`);
            }
          }
          if (k === 'lineas') {
            if (ch.tipo !== 'line') fallas.push(`tipo "${ch.tipo}", se esperaba "line"`);
            if (ds.filter((d) => !/promedio/i.test(d.label)).length < 1) fallas.push('no hay líneas de cuadrillas');
            if (m.grafico.promedio) {
              const p = por(/Promedio/i);
              if (!p) fallas.push('falta la serie "Promedio Brigadas"');
              else {
                if (!p.borderDash.length) fallas.push('"Promedio" debe ser punteada (borderDash)');
                if (normColor(p.borderColor) !== normColor(CHART_FIXED.PROMEDIO)) fallas.push(`color de "Promedio" = ${p.borderColor}, se esperaba ${CHART_FIXED.PROMEDIO}`);
              }
            }
          }
          if (k === 'area') {
            if (ch.tipo !== 'line') fallas.push(`tipo "${ch.tipo}", se esperaba "line" (área)`);
            const rellenos = ds.filter((d) => d.fill);
            if (rellenos.length !== 1) fallas.push(`debe haber exactamente 1 serie con relleno (el tipo seleccionado) y hay ${rellenos.length}`);
            else {
              const a = parseRgb(rellenos[0].backgroundColor)?.a;
              if (a === undefined || Math.abs(a - 0.22) > 0.011) fallas.push(`el relleno del tipo seleccionado debe tener alpha .22 y tiene ${a}`);
            }
            const otros = ds.filter((d) => !d.fill && !/^Meta/i.test(d.label));
            if (ds.length > 1 && otros.length === 0) fallas.push('los demás tipos deben seguir visibles (atenuados)');
            otros.forEach((d) => {
              const a = parseRgb(d.borderColor)?.a;
              if (a === undefined || Math.abs(a - 0.28) > 0.011) fallas.push(`"${d.label}" debe estar atenuado (alpha .28) y tiene ${a}`);
            });
          }
          if (k === 'causales') {
            // nombre según la vista: Horario / mensual
            if (!/^(Horario Causales de no efectividad|Causales (mensual|diario) de no efectividad)$/.test(ch.titulo)) fallas.push(`el título debe ser "Horario Causales de no efectividad" o "Causales mensual de no efectividad" y es "${ch.titulo}"`);
            if (ch.tipo !== 'line') fallas.push(`tipo "${ch.tipo}", se esperaba "line" (líneas)`);
            const sinOtras = ds.filter((d) => !/^Otras causales$/i.test(d.label));
            sinOtras.forEach((d, i) => {
              if (normColor(d.borderColor) !== normColor(SERIES_OSCURO[i % SERIES_OSCURO.length])) fallas.push(`causal #${i + 1} "${d.label.slice(0, 40)}" = ${d.borderColor}, se esperaba ${SERIES_OSCURO[i % SERIES_OSCURO.length]} (paleta de series del tema)`);
            });
            const otras = por(/^Otras causales$/i);
            if (otras && normColor(otras.borderColor) !== normColor(MUT_OSCURO)) fallas.push(`"Otras causales" = ${otras.borderColor}, se esperaba ${MUT_OSCURO} (gris del tema)`);
            if (sinOtras.length > 6) fallas.push(`hay ${sinOtras.length} causales además de "Otras" (máximo 6)`);
          }
          if (k === 'agrupado') {
            if (ch.tipo !== 'bar') fallas.push(`tipo "${ch.tipo}", se esperaba "bar"`);
            if (ch.xStacked || ch.yStacked) fallas.push('las barras agrupadas NO deben estar apiladas (stacked)');
            if (m.grafico.causales) {
              const sinOtras = ds.filter((d) => !/^Otras causales$/i.test(d.label));
              sinOtras.forEach((d, i) => {
                if (normColor(d.backgroundColor) !== normColor(CHART_FIXED.CAUSALES[i % 6])) fallas.push(`causal #${i + 1} "${d.label.slice(0, 40)}" = ${d.backgroundColor}, se esperaba ${CHART_FIXED.CAUSALES[i % 6]}`);
              });
              const otras = por(/^Otras causales$/i);
              if (otras && normColor(otras.backgroundColor) !== normColor(CHART_FIXED.OTRAS)) fallas.push(`"Otras causales" = ${otras.backgroundColor}, se esperaba ${CHART_FIXED.OTRAS}`);
              if (sinOtras.length > 6) fallas.push(`hay ${sinOtras.length} causales además de "Otras" (máximo 6)`);
            }
          }
          if (k === 'area-apilada') {
            if (ch.tipo !== 'line') fallas.push(`tipo "${ch.tipo}", se esperaba "line" (área apilada)`);
            if (!ch.yStacked) fallas.push('el eje y debe estar apilado (stacked)');
            const sinFill = ds.filter((d) => !d.fill);
            if (sinFill.length) fallas.push(`series sin relleno: ${sinFill.map((d) => d.label).join(', ')}`);
          }
        }
      } else if (k === 'recharts') {
        const rc = await page.evaluate(`async () => ({
          lineas: document.querySelectorAll('[data-chart-area] .recharts-line').length,
          h: document.querySelector('[data-chart-area] .recharts-wrapper')?.offsetHeight || 0,
          tabla: !!document.querySelector('[data-table-area] table'),
          etiqueta: document.querySelector('[data-chart-label]')?.textContent?.trim() || '',
        })`);
        if (rc.lineas < 1) fallas.push('no hay líneas Recharts en el gráfico');
        if (rc.h <= ALTO_MIN) fallas.push(`el gráfico mide ${rc.h}px de alto (mínimo ${ALTO_MIN}px)`);
        if (!rc.tabla) fallas.push('falta la tabla heatmap');
        if (!/\s·\s/.test(rc.etiqueta)) fallas.push(`etiqueta "TIPO DE GRÁFICO · unidad" ausente ("${rc.etiqueta}")`);
      } else if (k === 'ninguno') {
        const dt = await page.evaluate(`async () => ({
          canvas: document.querySelectorAll('[role=dialog] canvas').length,
          tabla: !!document.querySelector('[data-free-area] table'),
          anchoTabla: document.querySelector('[data-free-area] table')?.getBoundingClientRect().width || 0,
          anchoArea: document.querySelector('[data-free-area]')?.getBoundingClientRect().width || 0,
        })`);
        if (dt.canvas > 0) fallas.push(`el detalle no debe tener gráfico y tiene ${dt.canvas} canvas`);
        if (!dt.tabla) fallas.push('falta la tabla jerárquica');
        else if (dt.anchoTabla < dt.anchoArea * 0.9) avisos.push(`la tabla ocupa ${Math.round(dt.anchoTabla)}px de ${Math.round(dt.anchoArea)}px (¿a todo el ancho?)`);
      } else if (k === 'mapa') {
        const mp = await page.evaluate(`async () => {
          await window.__mo.esperar(() => document.querySelector('[role=dialog] .leaflet-container'), 15000);
          await window.__mo.sleep(500);
          const c = document.querySelector('[role=dialog] .leaflet-container');
          const r = c?.getBoundingClientRect();
          return { hay: !!c, h: Math.round(r?.height || 0), w: Math.round(r?.width || 0) };
        }`);
        if (!mp.hay) fallas.push('no hay contenedor Leaflet');
        else if (mp.h <= ALTO_MIN || mp.w <= ALTO_MIN) fallas.push(`el mapa mide ${mp.w}×${mp.h}px`);
      }
    } catch (e) {
      fallas.push(`error ejecutando el chequeo: ${e.message}`);
    }
    bot.registrar(`${m.n}. ${m.nombre} · ${m.grafico.kind}`, fallas, avisos);
    await page.evaluate(`async () => window.__mo.asegurarCerrado()`).catch(() => {});
  }
  // ── Vista HORARIA del modal de causales: nombre "Horario Causales de no efectividad" y eje 07h–17h ──
  if (MODALES.some((m) => m.id === 'op-causales')) {
    const fallas = [];
    try {
      await page.evaluate(`async () => window.__mo.asegurarCerrado()`);
      const H = await page.evaluate(`async () => {
        const mo = window.__mo;
        const btn = mo.botonPorTexto(/Por hora/);
        if (!btn) return { hay: false };
        btn.click();
        await mo.sleep(2500);
        const r = await mo.abrir('op-causales');
        if (!r.ok) return { hay: true, abre: false, motivo: r.motivo };
        const ch = mo.chartModal();
        const labels = ch ? (ch.data.labels || []).map(String) : [];
        const bandas = !!(ch && (ch.config.plugins || []).some((p) => p.id === 'bandsPluginBands'));
        const ordCard = window.Chart.getChart(document.getElementById('op-ord'));
        const labelsOrd = ordCard ? (ordCard.data.labels || []).map(String) : [];
        const tarjeta = window.Chart.getChart(document.getElementById('op-causales'));
        const labelsTarjeta = tarjeta ? (tarjeta.data.labels || []).map(String) : [];
        const bandasTarjeta = !!(tarjeta && (tarjeta.config.plugins || []).some((p) => p.id === 'bandsPluginBands'));
        const titulo = mo.dialogo().getAttribute('aria-label');
        const card = document.querySelector('#card-op-causales .ch-title')?.innerText || '';
        await mo.asegurarCerrado();
        mo.botonPorTexto(/Por mes/)?.click();
        await mo.sleep(1500);
        return { hay: true, abre: true, labels, bandas, labelsOrd, labelsTarjeta, bandasTarjeta, titulo, card };
      }`);
      if (!H.hay) fallas.push('no se encontró el selector "Por hora" de la página');
      else if (!H.abre) fallas.push(`al abrir el modal en vista horaria: ${H.motivo}`);
      else {
        if (H.titulo !== 'Horario Causales de no efectividad') fallas.push(`en vista horaria el título debe ser "Horario Causales de no efectividad" y es "${H.titulo}"`);
        if (!/Horario Causales de no efectividad/.test(H.card)) fallas.push(`la tarjeta debe titularse "Horario Causales de no efectividad" y dice "${H.card.slice(0, 60)}"`);
        // mismo eje que los demás gráficos horarios de la página (07:00 → 23:00, formato "HH:00")
        const esperadas = Array.from({ length: 17 }, (_, i) => String(7 + i).padStart(2, '0') + ':00');
        if (JSON.stringify(H.labels) !== JSON.stringify(esperadas)) fallas.push(`el eje del modal debe ser 07:00 → 23:00 ("HH:00") y es [${H.labels.join(', ')}]`);
        if (JSON.stringify(H.labelsTarjeta) !== JSON.stringify(esperadas)) fallas.push(`el eje de la tarjeta debe ser 07:00 → 23:00 ("HH:00") y es [${H.labelsTarjeta.join(', ')}]`);
        if (!H.labelsOrd.length) fallas.push('no se pudo leer el eje del gráfico de órdenes (op-ord) para comparar');
        else if (JSON.stringify(H.labels) !== JSON.stringify(H.labelsOrd)) fallas.push(`el eje de causales no coincide con el de "Evolutivo Horario de Órdenes": [${H.labels.join(', ')}] vs [${H.labelsOrd.join(', ')}]`);
        if (!H.bandas) fallas.push('el modal no trae las franjas de Almuerzo / Fuera de jornada (bandsPluginBands) como los demás gráficos horarios');
        if (!H.bandasTarjeta) fallas.push('la tarjeta no trae las franjas de Almuerzo / Fuera de jornada (bandsPluginBands)');
      }
    } catch (e) {
      fallas.push(`error ejecutando el chequeo: ${e.message}`);
    }
    bot.registrar('4b. Causales · vista horaria (título, eje y franjas como los demás gráficos)', fallas);
    await page.evaluate(`async () => window.__mo.asegurarCerrado()`).catch(() => {});
  }
  await page.close();
});

bot.fin();
