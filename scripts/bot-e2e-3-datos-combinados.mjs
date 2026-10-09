#!/usr/bin/env node
/**
 * BOT E2E 3 · Los NÚMEROS de cada vista son correctos con filtros combinados
 * Aplica 11 combinaciones de filtros globales (Proceso, Proyecto, Zona, Mes, Día) sobre las vistas Inicio,
 * Gerencial, Operativo, Cantidades Técnicos y Producción Técnico, y compara lo que se ve en pantalla con
 * el valor esperado calculado de forma independiente: payload real de /api/data/base + las funciones reales
 * de filtros (filtRaw/filtPerdidas) y de formato (fmtCOP/fmtN/fmtPct) del front.
 *   Inicio     · "N brigadas activas", eficiencia y cumplimiento de la narrativa
 *   Gerencial  · Producción valorizada, Productividad (cumplimiento) y Total de técnicos activos
 *   Operativo  · Efectivas/Fallidas/Perdidas del gráfico de órdenes y "N órdenes: A fallidas · B pérdidas"
 *   Técnicos / Producción · aritmética del selector (Todas = Productivas + Disponibles; Todos = Activos + Nuevos + Bajas)
 *                           y total de técnicos contra el esperado
 * Además valida la consistencia ENTRE vistas: con el mismo filtro, Inicio y Gerencial muestran los mismos técnicos.
 */
import { conNavegador, abrirVista, crearBot, erroresDesde, VISTAS } from './e2e/lib.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const cargar = (rel) => import(pathToFileURL(path.resolve(process.cwd(), rel)).href);
const { filtRaw, filtPerdidas, enrichGeo, normProy, normZonaDet } = await cargar('src/app/components/utils/filters.ts');
const { fmtCOP, fmtN, fmtPct } = await cargar('src/app/components/utils/formatters.ts');
const { sumaCantidad, esFallida } = await cargar('src/app/components/utils/causales.ts');
const num = (v) => Number(v) || 0;

const bot = crearBot('BOT E2E 3 · DATOS CORRECTOS CON FILTROS COMBINADOS (vs API + funciones reales del front)');

// ── Datos de referencia: últimos 2 meses desde la API (igual que los carga el front) ──
const getJson = async (p) => {
  const r = await fetch(BASE + p, { signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw new Error(`GET ${p} → HTTP ${r.status}`);
  return r.json();
};
const meses = (await getJson('/api/data/months')).months.filter((m) => m.count > 0).map((m) => m.mes).sort();
const M = [meses[meses.length - 2], meses[meses.length - 1]]; // idx -2, -1
const raws = [];
const pers = [];
for (const m of M) {
  const p = await getJson(`/api/data/base?mes=${m}`);
  // misma normalización que DashboardProvider.normalizeMonth
  for (const rec of p.rawRecords) {
    const proj = normProy(rec.Zona);
    const z = normZonaDet(rec.Zona);
    if (proj) rec._Proyecto = proj;
    rec._Zona = z || proj || undefined;
    const dz = normZonaDet(rec.Zona_Detalle || rec.Zona);
    rec._ZonaDet = dz || rec._Zona;
    raws.push(rec);
  }
  (p.perdidas || []).forEach((r) => { enrichGeo(r); pers.push(r); });
}
console.log(`  Referencia: meses ${M.join(', ')} · ${raws.length} registros · ${pers.length} agrupaciones de no efectivas\n`);

const diasDe = (mes) => [...new Set(raws.filter((r) => String(r.Fecha).slice(0, 7) === mes).map((r) => r.Fecha))].sort();

const COMBOS = [
  { id: 'base (último mes, todos los días)', c: {} },
  { id: 'Sur', c: { proy: 'Sur' } },
  { id: 'Norte-Centro', c: { proy: 'Norte-Centro' } },
  { id: 'Norte-Centro + Centro', c: { proy: 'Norte-Centro', zona: 'Centro' } },
  { id: 'Norte-Centro + Norte', c: { proy: 'Norte-Centro', zona: 'Norte' } },
  { id: 'Multifamiliar', c: { proceso: 'GESTOR' } },
  { id: 'Multifamiliar + Norte-Centro', c: { proceso: 'GESTOR', proy: 'Norte-Centro' } },
  { id: 'Sur + primer día', c: { proy: 'Sur', diaIdx: 0 } },
  { id: 'Multifamiliar + Norte-Centro + Centro + último día', c: { proceso: 'GESTOR', proy: 'Norte-Centro', zona: 'Centro', diaIdx: -1 } },
  { id: 'mes anterior + Sur', c: { mesIdx: -2, proy: 'Sur' } },
  { id: 'mes anterior + Norte-Centro + primer día', c: { mesIdx: -2, proy: 'Norte-Centro', diaIdx: 0 } },
];

/** Filtro global equivalente (Filters del front) para una combinación de la UI. */
function filtroDe(c) {
  const mes = c.mesIdx === -2 ? M[0] : M[1];
  let fecha = 'ALL';
  if (c.diaIdx !== undefined) {
    const d = diasDe(mes);
    fecha = d[c.diaIdx < 0 ? d.length + c.diaIdx : c.diaIdx];
  }
  return { proy: c.proy || 'ALL', zona: c.zona || 'ALL', ano: 'ALL', mes: [mes], fecha, proceso: c.proceso || 'ALL' };
}

function esperado(F) {
  const rawF = filtRaw(raws, F);
  const efect = rawF.reduce((s, r) => s + num(r.Efectivas), 0);
  const visitas = rawF.reduce((s, r) => s + num(r.Visitas), 0);
  const meta = rawF.reduce((s, r) => s + num(r.Asignacion), 0);
  const ing = rawF.reduce((s, r) => s + num(r.Ingresos), 0);
  const per = filtPerdidas(pers, F);
  return {
    registros: rawF.length,
    tecnicos: new Set(rawF.map((r) => r.Cedula)).size,
    efect, visitas, meta, ing,
    fall: rawF.reduce((s, r) => s + num(r.Fallida_Con_Pago), 0),
    perd: rawF.reduce((s, r) => s + num(r.Fallida_Sin_Pago) + num(r.Perdidas), 0),
    eficiencia: visitas ? efect / visitas : null,
    cumpl: meta ? efect / meta : null,
    noEfFallidas: sumaCantidad(per.filter(esFallida)),
    noEfPerdidas: sumaCantidad(per.filter((r) => !esFallida(r))),
  };
}

const digitos = (t) => Number(String(t).replace(/[^\d]/g, '')) || 0;
const first = (re, t) => { const m = t.match(re); return m ? m : null; };

const leerMain = (page) => page.evaluate(`async () => (document.querySelector('main')?.innerText || '')`);
const aplicarCombo = (page, c) => page.evaluate(`async (c) => { await window.__e2e.fijarBase(); await window.__e2e.aplicar(c); await window.__e2e.sleep(1500); return window.__e2e.estadoFiltros(); }`, c);

const tecnicosGer = {}; // técnicos mostrados por Gerencial y por Inicio, por combinación

await conNavegador(async (cdp) => {
  // ───────── GERENCIAL ─────────
  {
    const page = await abrirVista(cdp, VISTAS.find((v) => v.id === 'gerencial'));
    const c0 = page.state.consoleErrors.length; const e0 = page.state.exceptions.length;
    for (const cb of COMBOS) {
      const fallas = [];
      const F = filtroDe(cb.c);
      const ex = esperado(F);
      await aplicarCombo(page, cb.c);
      const t = await leerMain(page);
      const prod = first(/PRODUCCIÓN VALORIZADA \(OPERACIÓN\)\s*Ⓘ\s*(\S+)/, t);
      const prodv = first(/PRODUCTIVIDAD \(CUMPLIMIENTO\)\s*Ⓘ\s*(\S+)/, t);
      const tec = first(/TOTAL DE TÉCNICOS ACTIVOS\s*Ⓘ\s*(\S+)/, t);
      if (!prod || !prodv || !tec) fallas.push('no se pudieron leer los KPIs de la vista');
      else {
        if (prod[1] !== fmtCOP(ex.ing)) fallas.push(`Producción valorizada: pantalla ${prod[1]} vs esperado ${fmtCOP(ex.ing)}`);
        if (prodv[1] !== fmtPct(ex.cumpl)) fallas.push(`Productividad (cumplimiento): pantalla ${prodv[1]} vs esperado ${fmtPct(ex.cumpl)}`);
        if (tec[1] !== fmtN(ex.tecnicos)) fallas.push(`Técnicos activos: pantalla ${tec[1]} vs esperado ${fmtN(ex.tecnicos)}`);
        (tecnicosGer[cb.id] ??= {}).gerencial = digitos(tec[1]);
      }
      bot.registrar(`[Gerencial] ${cb.id}`, fallas);
    }
    bot.registrar('[Gerencial] sin errores de consola', erroresDesde(page, c0, e0));
    await page.close();
  }

  // ───────── INICIO ─────────
  {
    const page = await abrirVista(cdp, VISTAS.find((v) => v.id === 'inicio'));
    const c0 = page.state.consoleErrors.length; const e0 = page.state.exceptions.length;
    for (const cb of COMBOS) {
      const fallas = [];
      const F = filtroDe(cb.c);
      const ex = esperado(F);
      await aplicarCombo(page, cb.c);
      const t = await leerMain(page);
      const m = first(/con (\S+) brigadas activas y una eficiencia del ([\d.]+%|—)\. El cumplimiento de producción \(efectivas vs meta\) es del ([\d.]+%|—)\./, t);
      if (!m) fallas.push('no se pudo leer la narrativa del periodo');
      else {
        if (m[1] !== fmtN(ex.tecnicos)) fallas.push(`brigadas activas: pantalla ${m[1]} vs esperado ${fmtN(ex.tecnicos)}`);
        if (m[2] !== fmtPct(ex.eficiencia)) fallas.push(`eficiencia: pantalla ${m[2]} vs esperado ${fmtPct(ex.eficiencia)}`);
        if (m[3] !== fmtPct(ex.cumpl)) fallas.push(`cumplimiento de producción: pantalla ${m[3]} vs esperado ${fmtPct(ex.cumpl)}`);
        (tecnicosGer[cb.id] ??= {}).inicio = digitos(m[1]);
      }
      bot.registrar(`[Inicio] ${cb.id}`, fallas);
    }
    bot.registrar('[Inicio] sin errores de consola', erroresDesde(page, c0, e0));
    await page.close();
  }

  // ───────── OPERATIVO ─────────
  {
    const page = await abrirVista(cdp, VISTAS.find((v) => v.id === 'operativo'));
    const c0 = page.state.consoleErrors.length; const e0 = page.state.exceptions.length;
    for (const cb of COMBOS) {
      const fallas = [];
      const avisos = [];
      const F = filtroDe(cb.c);
      const ex = esperado(F);
      await aplicarCombo(page, cb.c);
      // gráfico de órdenes (vista mensual por defecto) y subtítulo de causales
      const D = await page.evaluate(`async () => {
        const g = (id) => { const ch = window.Chart && window.Chart.getChart(document.getElementById(id)); return ch; };
        const ch = g('op-ord');
        const suma = (ch, re) => { const d = ch ? ch.data.datasets.find((x) => re.test(String(x.label))) : null; return d ? (d.data || []).reduce((s, v) => s + (Number(v) || 0), 0) : null; };
        return {
          efect: suma(ch, /^Efectivas/), fall: suma(ch, /^Fallidas/), perd: suma(ch, /^Perdidas/),
          causales: document.querySelector('#card-op-causales .ch-sub')?.textContent || '',
          titulo: document.querySelector('#card-op-ord .ch-title')?.innerText || '',
        };
      }`);
      const sumable = /Mensual|Diario/.test(D.titulo); // la vista horaria es acumulada: no suma igual
      if (!sumable) avisos.push(`con un solo día la página cambia sola a la vista "${D.titulo.split('\n')[0]}" (acumulada por hora): no se compara con la suma del periodo`);
      else {
        if (D.efect !== ex.efect) fallas.push(`Efectivas del gráfico: ${D.efect} vs esperado ${ex.efect}`);
        if (D.fall !== ex.fall) fallas.push(`Fallidas del gráfico: ${D.fall} vs esperado ${ex.fall}`);
        if (D.perd !== ex.perd) fallas.push(`Perdidas del gráfico: ${D.perd} vs esperado ${ex.perd}`);
      }
      const mc = first(/(\d[\d.]*)\s+órdenes:\s*(\d[\d.]*)\s+fallidas\s*·\s*(\d[\d.]*)\s+pérdidas/, D.causales);
      if (!mc) fallas.push(`no se pudo leer el subtítulo de causales ("${D.causales.slice(0, 80)}")`);
      else {
        const total = ex.noEfFallidas + ex.noEfPerdidas;
        if (digitos(mc[2]) !== ex.noEfFallidas) fallas.push(`Causales · fallidas: ${digitos(mc[2])} vs esperado ${ex.noEfFallidas}`);
        if (digitos(mc[3]) !== ex.noEfPerdidas) fallas.push(`Causales · pérdidas: ${digitos(mc[3])} vs esperado ${ex.noEfPerdidas}`);
        if (digitos(mc[1]) !== total) fallas.push(`Causales · total: ${digitos(mc[1])} vs esperado ${total}`);
      }
      bot.registrar(`[Operativo] ${cb.id}`, fallas, avisos);
    }
    bot.registrar('[Operativo] sin errores de consola', erroresDesde(page, c0, e0));
    await page.close();
  }

  // ───────── TÉCNICOS y PRODUCCIÓN ─────────
  for (const vid of ['tecnicos', 'productivo']) {
    const vista = VISTAS.find((v) => v.id === vid);
    const page = await abrirVista(cdp, vista);
    const c0 = page.state.consoleErrors.length; const e0 = page.state.exceptions.length;
    for (const cb of COMBOS) {
      const fallas = [];
      const avisos = [];
      const F = filtroDe(cb.c);
      const ex = esperado(F);
      await aplicarCombo(page, cb.c);
      const opciones = await page.evaluate(`async () => [...document.querySelectorAll('main select')].map((s) => [...s.options].map((o) => o.text))`);
      const textos = opciones.flat();
      const cat = textos.find((t) => /^Categoría: Todas \(\d+\)/.test(t));
      const catN = cat ? digitos(cat.match(/\((\d+)\)/)[1]) : null;
      const prod = textos.find((t) => /Productivas \/ Operativas \((\d+)\)/.test(t));
      const disp = textos.find((t) => /Disponibles \((\d+)\)/.test(t));
      const est = textos.find((t) => /^Estado Técnico: Todos \(\d+\)/.test(t));
      const act = textos.find((t) => /Activos \((\d+)\)/.test(t));
      const nue = textos.find((t) => /Nuevos .*\((\d+)\)/.test(t));
      const baj = textos.find((t) => /Bajas .*\((\d+)\)/.test(t));
      const g = (s) => (s ? Number(s.match(/\((\d+)\)/g).pop().match(/\d+/)[0]) : null);
      if (catN === null || !est) fallas.push('no se encontraron los selectores de Categoría/Estado con sus conteos');
      else {
        if (g(prod) + g(disp) !== catN) fallas.push(`Categoría: Productivas (${g(prod)}) + Disponibles (${g(disp)}) ≠ Todas (${catN})`);
        const estN = g(est);
        if (g(act) + g(nue) + g(baj) !== estN) fallas.push(`Estado: Activos (${g(act)}) + Nuevos (${g(nue)}) + Bajas (${g(baj)}) ≠ Todos (${estN})`);
        if (estN !== catN) fallas.push(`Estado Todos (${estN}) ≠ Categoría Todas (${catN})`);
        if (catN > ex.tecnicos + 0 && ex.tecnicos > 0 && catN > ex.tecnicos * 2) fallas.push(`el total de técnicos (${catN}) es desproporcionado frente a los ${ex.tecnicos} con registros`);
        if (catN !== ex.tecnicos) avisos.push(`total de técnicos de la vista ${catN} vs ${ex.tecnicos} con registros en los datos filtrados`);
        (tecnicosGer[cb.id] ??= {})[vid] = catN;
      }
      bot.registrar(`[${vista.nombre}] ${cb.id}`, fallas, avisos);
    }
    bot.registrar(`[${vista.nombre}] sin errores de consola`, erroresDesde(page, c0, e0));
    await page.close();
  }
});

// ── Consistencia entre vistas: mismo filtro → mismos técnicos en Inicio y Gerencial ──
{
  const fallas = [];
  const avisos = [];
  for (const [id, v] of Object.entries(tecnicosGer)) {
    if (v.gerencial !== undefined && v.inicio !== undefined && v.gerencial !== v.inicio) fallas.push(`[${id}] Gerencial muestra ${v.gerencial} técnicos activos e Inicio ${v.inicio}`);
    for (const vid of ['tecnicos', 'productivo']) {
      if (v[vid] !== undefined && v.gerencial !== undefined && v[vid] !== v.gerencial) avisos.push(`[${id}] ${vid} lista ${v[vid]} técnicos y Gerencial ${v.gerencial}`);
    }
    if (v.tecnicos !== undefined && v.productivo !== undefined && v.tecnicos !== v.productivo) fallas.push(`[${id}] Cantidades Técnicos lista ${v.tecnicos} y Producción Técnico ${v.productivo}`);
  }
  bot.registrar('Consistencia entre vistas · mismos técnicos con el mismo filtro (Inicio = Gerencial; Técnicos = Producción)', fallas, avisos);
}

bot.fin();
