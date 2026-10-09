#!/usr/bin/env node
/**
 * BOT MODALES OP 4 · Temas claro y oscuro
 * Recorre los 9 modales primero en modo CLARO y luego en OSCURO y valida:
 *  - ninguna variable CSS sin resolver (var(--x) indefinida en estilos en línea ni en colores de gráfico);
 *  - contraste WCAG >= 4.5:1 del texto del encabezado (título y subtítulo), de los KPIs (etiqueta y valor),
 *    de las etiquetas del panel y de los botones primarios (texto sobre --brand-primary);
 *  - los colores del gráfico cambian al cambiar de tema, sin quedarse con los del tema anterior
 *    (incluido cambiar el tema CON el modal abierto: el gráfico se recrea);
 *  - estático: sin hex fijos en los estilos de layout de los modales (solo las excepciones permitidas).
 */
import { conNavegador, abrirPagina, crearBot, MODALES, VP_ESCRITORIO, normColor, parseRgb, contraste, erroresDesde, leerFuente } from './modales-op/lib.mjs';

const bot = crearBot('BOT MODALES OP 4 · TEMAS CLARO Y OSCURO');
const MIN_CONTRASTE = 4.5;

// ── Estático: hex fijos en los modales ──
const ARCHIVOS = [
  'src/app/components/ModalShell.tsx', 'src/app/components/AnalysisModal.tsx', 'src/app/components/ModalChart.tsx',
  'src/app/operativo/DisponibilidadAnalysisModal.tsx', 'src/app/operativo/BrigadaEvolutivoModal.tsx',
  'src/app/operativo/BrigadaTiposModal.tsx', 'src/app/operativo/BrigadasDetalleModal.tsx', 'src/app/components/MapModal.tsx',
];
// excepciones permitidas: texto blanco sobre fondos intensos, leyenda del mapa y constantes compartidas de series
const PERMITIDO = /CHART_FIXED|#fff\b|#ffffff\b|#F2F7FF|rgba\(11,\s*15,\s*22|getTextColor|^\s*(\/\/|\*|\/\*)/i;
{
  const fallas = [];
  const avisos = [];
  for (const f of ARCHIVOS) {
    let src = '';
    try { src = leerFuente(f); } catch { fallas.push(`no existe ${f}`); continue; }
    const lineas = src.split('\n');
    lineas.forEach((l, i) => {
      const hx = l.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g);
      if (!hx || PERMITIDO.test(l)) return;
      // los hex dentro de comentarios al final de línea no cuentan
      const sinComentario = l.replace(/\/\/.*$/, '');
      if (!/#[0-9a-fA-F]{3,6}\b/.test(sinComentario)) return;
      (/ModalShell|AnalysisModal|ModalChart/.test(f) ? fallas : avisos).push(`${f}:${i + 1} hex fijo → ${l.trim().slice(0, 90)}`);
    });
  }
  bot.registrar('estático · sin hex fijos en ModalShell/AnalysisModal/ModalChart (resto: aviso)', fallas, avisos);
}

const medidasPorTema = {};

await conNavegador(async (cdp) => {
  for (const tema of ['light', 'dark']) {
    const page = await abrirPagina(cdp, VP_ESCRITORIO, { tema });
    const c0 = page.state.consoleErrors.length;
    const e0 = page.state.exceptions.length;
    const vars = await page.evaluate(`async () => {
      const g = (n) => getComputedStyle(document.body).getPropertyValue(n).trim();
      return { tema: window.__mo.tema(), ok: g('--ok'), warn: g('--warn'), err: g('--err'), mutedAa: g('--text-muted-aa'), brand: g('--brand-primary') };
    }`);
    medidasPorTema[tema] = { vars, charts: {} };

    for (const m of MODALES) {
      const fallas = [];
      const avisos = [];
      try {
        await page.evaluate(`async () => window.__mo.asegurarCerrado()`);
        const r = await page.evaluate(`async (id) => window.__mo.abrir(id)`, m.id);
        if (!r.ok) { bot.registrar(`[${tema}] ${m.n}. ${m.nombre}`, [r.motivo]); continue; }

        const T = await page.evaluate(`async () => {
          const mo = window.__mo;
          const d = mo.dialogo();
          const out = { tema: mo.tema(), sinResolver: [], contrastes: [], chart: null };

          // fondo efectivo: primer ancestro opaco (los semitransparentes se mezclan con el de abajo)
          const parse = (c) => { const m = String(c).match(/rgba?\\(\\s*(\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)(?:[,\\s/]+([\\d.]+))?/); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : [0, 0, 0, 0]; };
          const fondo = (el) => {
            const capas = [];
            for (let p = el; p; p = p.parentElement) {
              const c = parse(getComputedStyle(p).backgroundColor);
              if (c[3] > 0) { capas.push(c); if (c[3] >= 1) break; }
            }
            let base = [255, 255, 255];
            for (let i = capas.length - 1; i >= 0; i--) { const [r, g, b, a] = capas[i]; base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)]; }
            return 'rgb(' + base.map(Math.round).join(', ') + ')';
          };
          const quitar = (c) => { const p = parse(c); return 'rgb(' + p[0] + ', ' + p[1] + ', ' + p[2] + ')'; };
          const medir = (sel, nombre) => {
            [...d.querySelectorAll(sel)].filter(e => e.offsetParent !== null && (e.innerText || '').trim()).slice(0, 12).forEach((e, i) => {
              const cs = getComputedStyle(e);
              out.contrastes.push({ nombre: nombre + (i ? ' #' + (i + 1) : ''), fg: quitar(cs.color), bg: fondo(e), txt: (e.innerText || '').trim().slice(0, 28), px: cs.fontSize });
            });
          };
          medir('.ms-title', 'título');
          medir('.ms-sub', 'subtítulo');
          medir('.ms-label', 'etiqueta del panel');
          medir('.ms-kpi-l', 'KPI etiqueta');
          medir('.ms-kpi-v', 'KPI valor');
          medir('.ms-serie-l', 'serie');
          medir('.ms-field-l', 'etiqueta de filtro');
          // botones primarios: texto sobre --brand-primary
          [...d.querySelectorAll('button')].filter(b => b.offsetParent !== null).forEach((b) => {
            const cs = getComputedStyle(b);
            const bg = parse(cs.backgroundColor);
            const brand = getComputedStyle(document.body).getPropertyValue('--brand-primary').trim();
            if (bg[3] === 1 && (b.getAttribute('data-export') || '') && /CSV|XLSX|Excel/i.test(b.innerText) || b.hasAttribute('data-apply')) {
              out.contrastes.push({ nombre: 'botón primario "' + b.innerText.trim() + '"', fg: quitar(cs.color), bg: quitar(cs.backgroundColor), txt: b.innerText.trim().slice(0, 20), px: cs.fontSize });
            }
          });
          const badge = d.querySelector('.ms-badge');
          if (badge) { const cs = getComputedStyle(badge); out.contrastes.push({ nombre: 'badge', fg: quitar(cs.color), bg: quitar(cs.backgroundColor), txt: badge.innerText, px: cs.fontSize }); }

          // variables indefinidas en estilos en línea
          const g = (n) => getComputedStyle(d).getPropertyValue(n).trim();
          const vistas = new Set();
          d.querySelectorAll('[style]').forEach((e) => {
            const st = e.getAttribute('style') || '';
            for (const mm of st.matchAll(/var\\((--[\\w-]+)(\\s*,[^)]*)?\\)/g)) {
              if (vistas.has(mm[1])) continue;
              vistas.add(mm[1]);
              if (!g(mm[1]) && !mm[2]) out.sinResolver.push(mm[1]);
            }
          });

          // gráfico
          const ch = mo.chartModal();
          if (ch) {
            const res = mo.resumenChart(ch);
            out.chart = {
              themeKey: d.querySelector('canvas[data-modal-chart]')?.getAttribute('data-theme-key'),
              colores: Object.fromEntries(res.datasets.map(x => [x.label, [x.borderColor, x.backgroundColor]])),
              sinResolver: JSON.stringify(res.datasets.map(x => [x.borderColor, x.backgroundColor])).includes('var('),
              tick: window.Chart.defaults.color,
            };
          }
          return out;
        }`);

        if (T.tema !== tema) fallas.push(`el tema activo es ${T.tema} y se esperaba ${tema}`);
        if (T.sinResolver.length) fallas.push(`variables CSS indefinidas en estilos en línea: ${T.sinResolver.join(', ')}`);
        const bajos = T.contrastes.filter((c) => {
          const cr = contraste(c.fg, c.bg);
          c.cr = cr;
          return cr !== null && cr < MIN_CONTRASTE;
        });
        bajos.forEach((c) => fallas.push(`contraste ${c.cr.toFixed(2)}:1 < ${MIN_CONTRASTE}:1 en ${c.nombre} ("${c.txt}", ${c.px}) fg=${c.fg} sobre ${c.bg}`));
        if (!T.contrastes.length) fallas.push('no se pudo medir ningún texto del modal');
        if (T.chart) {
          if (T.chart.sinResolver) fallas.push('hay colores sin resolver ("var(...)") en el gráfico');
          if (T.chart.themeKey !== tema) fallas.push(`el canvas dice data-theme-key="${T.chart.themeKey}" y el tema es ${tema}`);
          medidasPorTema[tema].charts[m.id] = T.chart;
          if (normColor(T.chart.tick) !== normColor(vars.mutedAa)) fallas.push(`el color de ticks (${T.chart.tick}) no es el del tema actual (${vars.mutedAa})`);
        }
        if (tema === 'dark' && T.chart && medidasPorTema.light.charts[m.id]) {
          // series que dependen del tema (var(--ok) etc.) deben haber cambiado; las fijas deben seguir iguales
          const claro = medidasPorTema.light.charts[m.id].colores;
          const oscuro = T.chart.colores;
          if (m.id === 'op-ord') {
            for (const lab of ['Efectivas', 'Fallidas', 'Perdidas']) {
              const a = normColor(claro[lab]?.[1]); const b = normColor(oscuro[lab]?.[1]);
              if (!a || !b) fallas.push(`falta la serie ${lab}`);
              else if (a === b) fallas.push(`"${lab}" conserva el color del tema claro en el oscuro (${a})`);
            }
          }
        }

        // cambiar el tema CON el modal abierto: el gráfico se recrea con los colores nuevos
        if (m.id === 'op-ord' || m.id === 'op-causales') {
          const otro = tema === 'light' ? 'dark' : 'light';
          const L = await page.evaluate(`async (otro) => {
            const mo = window.__mo;
            const antes = mo.resumenChart(mo.chartModal());
            document.getElementById('btn-toggle-theme').click();
            await mo.esperar(() => mo.tema() === otro, 4000);
            await mo.sleep(1500);
            const d = mo.dialogo();
            const despues = mo.resumenChart(mo.chartModal());
            const g = (n) => getComputedStyle(document.body).getPropertyValue(n).trim();
            const res = {
              abierto: !!d, tema: mo.tema(), themeKey: d?.querySelector('canvas[data-modal-chart]')?.getAttribute('data-theme-key'),
              tick: window.Chart.defaults.color, mutedAa: g('--text-muted-aa'), ok: g('--ok'),
              efAntes: antes?.datasets.find(x => /^Efectivas/.test(x.label))?.backgroundColor,
              efDespues: despues?.datasets.find(x => /^Efectivas/.test(x.label))?.backgroundColor,
            };
            // vuelve al tema original
            document.getElementById('btn-toggle-theme').click();
            await mo.esperar(() => mo.tema() !== otro, 4000);
            await mo.sleep(1200);
            return res;
          }`, otro);
          if (!L.abierto) fallas.push('el modal se cerró al cambiar de tema');
          if (L.themeKey !== otro) fallas.push(`tras cambiar a ${otro} el canvas sigue con data-theme-key="${L.themeKey}" (no se recreó)`);
          if (normColor(L.tick) !== normColor(L.mutedAa)) fallas.push(`tras el cambio de tema los ticks quedaron en ${L.tick} y debían ser ${L.mutedAa}`);
          if (m.id === 'op-ord') {
            if (normColor(L.efAntes) === normColor(L.efDespues)) fallas.push(`"Efectivas" no cambió de color al cambiar de tema (${L.efAntes})`);
            if (normColor(L.efDespues) !== normColor(L.ok)) fallas.push(`"Efectivas" = ${L.efDespues} tras el cambio y --ok del tema nuevo es ${L.ok}`);
          }
        }
      } catch (e) {
        fallas.push(`error ejecutando el chequeo: ${e.message}`);
      }
      bot.registrar(`[${tema === 'light' ? 'claro' : 'oscuro'}] ${m.n}. ${m.nombre}`, fallas, avisos);
      await page.evaluate(`async () => window.__mo.asegurarCerrado()`).catch(() => {});
    }
    const errs = erroresDesde(page, c0, e0);
    bot.registrar(`[${tema === 'light' ? 'claro' : 'oscuro'}] sin errores de consola durante el recorrido`, errs);
    await page.close();
  }
});

bot.fin();
