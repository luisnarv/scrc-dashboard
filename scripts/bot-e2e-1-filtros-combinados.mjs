#!/usr/bin/env node
/**
 * BOT E2E 1 · Filtros globales combinados en TODAS las vistas
 * Opera los controles reales de la barra global (Proceso, Proyecto, Zona, Año, Mes, Día) y valida, en cada
 * una de las 8 vistas:
 *  A. Integridad de controles: opciones esperadas y listas coherentes.
 *  B. Cascada Proyecto → Zona: al cambiar el proyecto la zona vuelve a "Todas", las zonas de Sur y de
 *     Norte-Centro son disjuntas y su unión es la lista de "Todos".
 *  C. Año → Mes → Día: etiquetas coherentes (Todos los meses (N), 1 día (…), resumen "Filtros globales"),
 *     al cambiar el año solo hay meses de ese año y se reinician mes y día.
 *  D. Aplicación de cada filtro y de las combinaciones (proceso, proyecto, zona, mes, día y mezclas): la
 *     vista cambia de contenido y NO se rompe (sin excepciones, sin pantalla vacía).
 *  E. Idempotencia: volver al estado base restituye EXACTAMENTE lo que mostraba la vista (sin estado viejo).
 *  F. Persistencia entre vistas al navegar por el menú: proyecto/zona/proceso se conservan y se aplican.
 */
import { conNavegador, abrirVista, crearBot, erroresDesde, VISTAS_ACTIVAS, VISTAS, VP } from './e2e/lib.mjs';

const bot = crearBot('BOT E2E 1 · FILTROS GLOBALES COMBINADOS EN TODAS LAS VISTAS');

const COMBOS = [
  { id: 'proceso=Multifamiliar', c: { proceso: 'GESTOR' }, filtros: ['proceso'] },
  { id: 'proyecto=Sur', c: { proy: 'Sur' }, filtros: ['proy'] },
  { id: 'proyecto=Norte-Centro', c: { proy: 'Norte-Centro' }, filtros: ['proy'] },
  { id: 'Norte-Centro + zona=Centro', c: { proy: 'Norte-Centro', zona: 'Centro' }, filtros: ['proy', 'zona'] },
  { id: 'Norte-Centro + zona=Norte', c: { proy: 'Norte-Centro', zona: 'Norte' }, filtros: ['proy', 'zona'] },
  { id: 'Multifamiliar + Norte-Centro', c: { proceso: 'GESTOR', proy: 'Norte-Centro' }, filtros: ['proceso', 'proy'] },
  { id: 'Sur + primer día', c: { proy: 'Sur', diaIdx: 0 }, filtros: ['proy', 'dia'] },
  { id: 'Norte-Centro + Centro + Multifamiliar + último día', c: { proceso: 'GESTOR', proy: 'Norte-Centro', zona: 'Centro', diaIdx: -1 }, filtros: ['proceso', 'proy', 'zona', 'dia'] },
  { id: 'primer mes + Sur', c: { mesIdx: 0, proy: 'Sur' }, filtros: ['mes', 'proy'] },
];

const reaccionPorVista = {};
// Vistas que por diseño NO dependen de los filtros globales (se parametrizan en su propio formulario). Se reporta como
// aviso y se informa al final: el bot no las da por fallidas, pero deja constancia.
// Vistas con datos EN VIVO (asignaciones del día): entre dos lecturas las cifras pueden moverse; ahí la idempotencia se
// valida sobre la estructura (texto sin cifras) y no sobre los números.
const EN_VIVO = { cierre: true };
const PROPIOS = { informes: 'los informes se generan con su propio formulario (periodo/tipo dentro de cada informe)' };

await conNavegador(async (cdp) => {
  for (const v of VISTAS_ACTIVAS) {
    const page = await abrirVista(cdp, v);
    const c0 = page.state.consoleErrors.length;
    const e0 = page.state.exceptions.length;
    const ev = (src, arg) => page.evaluate(src, arg);

    // ── Estado base canónico ──
    await ev(`async () => window.__e2e.fijarBase()`);
    const base = await ev(`async () => ({ f: window.__e2e.estadoFiltros(), firma: window.__e2e.firma(), r: window.__e2e.resumenVista() })`);

    // ── A. Integridad de controles ──
    {
      const fallas = [];
      const f = base.f;
      if (!['ALL', 'Norte-Centro', 'Sur'].every((p) => f.proys.includes(p))) fallas.push(`Proyecto debe ofrecer Todos/Norte-Centro/Sur y ofrece [${f.proys.join(', ')}]`);
      if (!f.anos.includes('ALL') || f.anos.length < 2) fallas.push(`Año debe ofrecer Todos y al menos un año: [${f.anos.join(', ')}]`);
      if (f.proceso !== 'ALL' || f.proy !== 'ALL' || f.zona !== 'ALL') fallas.push(`el estado base no quedó en Todos: ${JSON.stringify({ proceso: f.proceso, proy: f.proy, zona: f.zona })}`);
      const o = await ev(`async () => [...window.__e2e.ctl().proceso.options].map(o => o.value + ':' + o.text)`);
      if (JSON.stringify(o) !== JSON.stringify(['ALL:SCR', 'GESTOR:Multifamiliar'])) fallas.push(`Proceso debe ofrecer SCR y Multifamiliar y ofrece ${JSON.stringify(o)}`);
      if (base.r.pantallaVacia) fallas.push('la vista muestra "Sin datos" en el estado base');
      bot.registrar(`[${v.nombre}] A · controles e integridad del estado base`, fallas);
    }

    // ── B. Cascada Proyecto → Zona ──
    {
      const fallas = [];
      const zonasPor = {};
      for (const p of ['Sur', 'Norte-Centro', 'ALL']) {
        const r = await ev(`async (p) => { const s = await window.__e2e.aplicar({ proy: p }); return s; }`, p);
        zonasPor[p] = r.zonas.filter((z) => z !== 'ALL');
        if (r.zona !== 'ALL') fallas.push(`al cambiar el proyecto a "${p}" la zona debe volver a "Todas" y es "${r.zona}"`);
        if (!r.zonas.includes('ALL')) fallas.push(`la lista de zonas de "${p}" debe incluir "Todas"`);
      }
      const inter = zonasPor['Sur'].filter((z) => zonasPor['Norte-Centro'].includes(z));
      if (inter.length) fallas.push(`las zonas de Sur y Norte-Centro deben ser disjuntas y comparten [${inter.join(', ')}]`);
      const union = [...new Set([...zonasPor['Sur'], ...zonasPor['Norte-Centro']])].sort();
      if (JSON.stringify(union) !== JSON.stringify([...zonasPor['ALL']].sort())) fallas.push(`la unión de zonas (${union.join(', ')}) debe ser la lista de "Todos" (${zonasPor['ALL'].join(', ')})`);
      if (!zonasPor['Sur'].length || !zonasPor['Norte-Centro'].length) fallas.push('cada proyecto debe tener al menos una zona');
      await ev(`async () => window.__e2e.fijarBase()`);
      bot.registrar(`[${v.nombre}] B · cascada Proyecto → Zona`, fallas);
    }

    // ── C. Año → Mes → Día (etiquetas) ──
    {
      const fallas = [];
      const avisos = [];
      const D = await ev(`async () => {
        const e = window.__e2e;
        const out = {};
        out.mesBase = await e.leerDropdown('mes');
        out.diasBase = await e.leerDropdown('dia');
        out.estBase = e.estadoFiltros();
        // elige un año concreto: mes y día se reinician a "todos"
        const anos = e.estadoFiltros().anos.filter(a => a !== 'ALL');
        out.anos = anos;
        await e.setSelect(e.ctl().ano, anos[0]);
        await e.sleep(1200);
        out.estAno = e.estadoFiltros();
        out.mesAno = await e.leerDropdown('mes');
        out.diasAno = await e.leerDropdown('dia');
        await e.setSelect(e.ctl().ano, 'ALL');
        await e.sleep(1200);
        await e.fijarBase();
        return out;
      }`);
      const checkedBase = D.mesBase.opciones.filter((o) => o.checked);
      if (checkedBase.length !== 1) fallas.push(`en el estado base debe haber exactamente 1 mes marcado y hay ${checkedBase.length}`);
      if (D.mesBase.todos) fallas.push('"Todos los meses" no debe estar marcado cuando hay un solo mes');
      if (!D.diasBase.todos) fallas.push('en el estado base "Todos los días" debe estar marcado');
      if (!/^Todos los días \(\d+\)$/.test(D.diasBase.textoTodos)) fallas.push(`el texto de "Todos los días" es "${D.diasBase.textoTodos}"`);
      if (!/^Todos los días \(\d+\)/.test(D.estBase.diaLabel.replace(' ▾', ''))) fallas.push(`la etiqueta del botón Día debe empezar por "Todos los días (N)" y es "${D.estBase.diaLabel}"`);
      const nDiasBase = D.diasBase.opciones.length;
      if (nDiasBase < 1) fallas.push('el desplegable de días no tiene opciones');
      if (D.estBase.diaLabel.includes('(') && Number((D.estBase.diaLabel.match(/\((\d+)\)/) || [])[1]) !== nDiasBase) fallas.push(`la etiqueta de días (${D.estBase.diaLabel}) no coincide con las opciones (${nDiasBase})`);
      // año concreto
      if (D.anos.length) {
        const anoSel = D.estAno.ano;
        if (anoSel !== D.anos[0]) fallas.push(`el año no quedó en ${D.anos[0]} (es ${anoSel})`);
        if (!D.mesAno.todos) fallas.push(`al elegir un año deben marcarse todos sus meses y "Todos los meses" no está marcado (${D.estAno.mesLabel})`);
        if (!/^Todos los meses \(\d+\)/.test(D.estAno.mesLabel.replace(' ▾', ''))) fallas.push(`etiqueta de Mes con año elegido: "${D.estAno.mesLabel}"`);
        const nMesesAno = D.mesAno.opciones.length;
        const nLab = Number((D.estAno.mesLabel.match(/\((\d+)\)/) || [])[1]);
        if (nLab !== nMesesAno) fallas.push(`la etiqueta dice ${nLab} meses y el desplegable ofrece ${nMesesAno}`);
        if (nMesesAno > 12) fallas.push(`un año no puede tener ${nMesesAno} meses`);
        const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        if (!D.mesAno.opciones.every((o) => nombres.includes(o.label))) fallas.push(`con año elegido los meses deben ir abreviados (${D.mesAno.opciones.map((o) => o.label).join(', ')})`);
        if (D.mesAno.opciones.length > 1 && !D.diasAno.todos) fallas.push('al cambiar el año los días deben reiniciarse a "Todos"');
        if (/Filtros globales/.test(D.estAno.resumen) === false) avisos.push('no se encontró el resumen "Filtros globales"');
      }
      bot.registrar(`[${v.nombre}] C · Año → Mes → Día (etiquetas y reinicio)`, fallas, avisos);
    }

    // ── D/E. Aplicación de filtros y combinaciones + idempotencia ──
    {
      const fallas = [];
      const avisos = [];
      const reacciona = { proceso: false, proy: false, zona: false, mes: false, dia: false };
      const firmas = {};
      for (const cb of COMBOS) {
        const r = await ev(`async (cb) => {
          const e = window.__e2e;
          await e.fijarBase();
          const antes = e.firma();
          const estado = await e.aplicar(cb);
          await e.sleep(900);
          return { estado, firma: e.firma(), resumen: e.resumenVista(), base: antes };
        }`, cb.c);
        firmas[cb.id] = r.firma;
        if (r.resumen.pantallaVacia) fallas.push(`[${cb.id}] la vista muestra "Sin datos"/error`);
        if (r.resumen.chars < 40) fallas.push(`[${cb.id}] la vista quedó en blanco (${r.resumen.chars} caracteres)`);
        if (cb.c.proy && r.estado.proy !== cb.c.proy) fallas.push(`[${cb.id}] el proyecto no quedó en ${cb.c.proy} (es ${r.estado.proy})`);
        if (cb.c.zona && r.estado.zona !== cb.c.zona) fallas.push(`[${cb.id}] la zona no quedó en ${cb.c.zona} (es ${r.estado.zona})`);
        if (cb.c.proceso && r.estado.proceso !== cb.c.proceso) fallas.push(`[${cb.id}] el proceso no quedó en ${cb.c.proceso} (es ${r.estado.proceso})`);
        if (cb.c.diaIdx !== undefined && !/^(1 día|Día \d+)/.test(r.estado.diaLabel)) fallas.push(`[${cb.id}] la etiqueta de Día no refleja 1 día: "${r.estado.diaLabel}"`);
      }
      // Reacción de la vista a cada filtro (cada uno comparado con su referencia más cercana)
      reacciona.proceso = firmas['proceso=Multifamiliar'] !== base.firma;
      reacciona.proy = firmas['proyecto=Sur'] !== base.firma || firmas['proyecto=Norte-Centro'] !== base.firma;
      reacciona.zona = firmas['Norte-Centro + zona=Centro'] !== firmas['proyecto=Norte-Centro'];
      reacciona.dia = firmas['Sur + primer día'] !== firmas['proyecto=Sur'];
      reacciona.mes = firmas['primer mes + Sur'] !== firmas['proyecto=Sur'];
      reaccionPorVista[v.id] = reacciona;
      const nombres = { proceso: 'Proceso', proy: 'Proyecto', zona: 'Zona', mes: 'Mes', dia: 'Día' };
      const noReaccionan = Object.entries(reacciona).filter(([, ok]) => !ok).map(([k]) => nombres[k]);
      if (noReaccionan.length === 5 && PROPIOS[v.id]) avisos.push(`la vista NO reacciona a ningún filtro global: ${PROPIOS[v.id]}`);
      else if (noReaccionan.length === 5) fallas.push('la vista NO reacciona a ningún filtro global (Proceso, Proyecto, Zona, Mes, Día)');
      else if (noReaccionan.length) avisos.push(`la vista no cambia al usar: ${noReaccionan.join(', ')} (puede ser intencional si la vista no depende de ese filtro)`);
      // combinaciones distintas → vistas distintas (Centro vs Norte)
      if (firmas['Norte-Centro + zona=Centro'] === firmas['Norte-Centro + zona=Norte'] && reacciona.zona) avisos.push('las zonas Centro y Norte muestran lo mismo');
      // E. idempotencia
      const vuelta = await ev(`async () => { await window.__e2e.fijarBase(); await window.__e2e.sleep(800); return { firma: window.__e2e.firma(), r: window.__e2e.resumenVista() }; }`);
      // Vista en vivo: entre dos lecturas llegan órdenes nuevas (cambian cifras y hasta opciones de los selectores), así que se
      // valida la estructura: mismos gráficos y tablas, mismos filtros aplicados y un texto de tamaño equivalente (±5 %).
      const largo = (f) => JSON.parse(f).t.length;
      const igualEnVivo = vuelta.r.canvases === base.r.canvases && vuelta.r.tablas === base.r.tablas
        && Math.abs(largo(vuelta.firma) - largo(base.firma)) / largo(base.firma) < 0.05;
      const igual = EN_VIVO[v.id] ? igualEnVivo : vuelta.firma === base.firma;
      if (EN_VIVO[v.id] && vuelta.firma !== base.firma && igual) avisos.push('vista con datos en vivo: las cifras se movieron entre lecturas, la estructura es equivalente');
      if (!igual) {
        const a = JSON.parse(base.firma).t; const b = JSON.parse(vuelta.firma).t;
        let i = 0; while (i < a.length && a[i] === b[i]) i++;
        fallas.push(`al volver al estado base la vista no recupera lo que mostraba (primera diferencia: «…${a.slice(Math.max(0, i - 25), i + 40)}» vs «…${b.slice(Math.max(0, i - 25), i + 40)}»)`);
      }
      bot.registrar(`[${v.nombre}] D/E · ${COMBOS.length} combinaciones aplican, no rompen la vista y se revierten`, fallas, avisos);
    }

    bot.registrar(`[${v.nombre}] sin errores de consola durante los filtros`, erroresDesde(page, c0, e0));
    await page.close();
  }

  // ── F. Persistencia entre vistas (navegación por el menú, sin recargar) ──
  if (VISTAS_ACTIVAS.length === VISTAS.length || VISTAS_ACTIVAS.some((v) => v.id === 'operativo')) {
    const fallas = [];
    const avisos = [];
    const page = await abrirVista(cdp, VISTAS.find((v) => v.id === 'operativo'));
    const c0 = page.state.consoleErrors.length;
    const e0 = page.state.exceptions.length;
    await page.evaluate(`async () => window.__e2e.fijarBase()`);
    const menu = await page.evaluate(`async () => [...document.querySelectorAll('#main-dash-nav a')].map(a => ({ href: a.getAttribute('href'), t: a.innerText.trim() }))`);
    if (menu.length < 4) fallas.push(`el menú debería tener al menos 4 vistas y tiene ${menu.length}`);
    // 1.ª pasada: firma base de cada vista, 2.ª: con Sur + Multifamiliar
    const irA = (href) => page.evaluate(`async (href) => {
      const e = window.__e2e;
      const a = [...document.querySelectorAll('#main-dash-nav a')].find(x => x.getAttribute('href') === href);
      if (!a) return { ok: false };
      a.click();
      await e.esperar(() => location.pathname === href, 6000);
      await e.esperar(() => !document.body.innerText.includes('Cargando información') && document.querySelector('#filters-container') && (document.querySelector('main')?.innerText || '').trim().length > 40, 90000);
      await e.sleep(1500);
      return { ok: true, f: e.estadoFiltros(), firma: e.firma() };
    }`, href);
    const firmasBase = {};
    for (const m of menu) {
      const r = await irA(m.href);
      if (!r.ok) { fallas.push(`el enlace ${m.href} no navegó`); continue; }
      firmasBase[m.href] = { firma: r.firma, f: r.f };
    }
    await page.evaluate(`async () => window.__e2e.aplicar({ proy: 'Norte-Centro', zona: 'Centro', proceso: 'GESTOR' })`);
    for (const m of menu) {
      const r = await irA(m.href);
      if (!r.ok) continue;
      if (r.f.proy !== 'Norte-Centro') fallas.push(`${m.t}: al navegar por el menú el proyecto no se conservó (es "${r.f.proy}")`);
      if (r.f.proceso !== 'GESTOR') fallas.push(`${m.t}: al navegar por el menú el proceso no se conservó (es "${r.f.proceso}")`);
      if (r.f.zona !== 'Centro') fallas.push(`${m.t}: al navegar por el menú la zona no se conservó (es "${r.f.zona}")`);
      if (r.firma === firmasBase[m.href]?.firma) avisos.push(`${m.t}: con proyecto/zona/proceso aplicados la vista muestra lo mismo que sin filtros`);
    }
    fallas.push(...erroresDesde(page, c0, e0));
    bot.registrar('F · los filtros se conservan y se aplican al navegar entre vistas por el menú', fallas, avisos);
    await page.close();
  }
});

// ── Resumen de reacción de cada vista ──
console.log('\n  Reacción de cada vista a los filtros globales (✔ cambia · ✖ no cambia):');
for (const v of VISTAS_ACTIVAS) {
  const r = reaccionPorVista[v.id];
  if (!r) continue;
  console.log(`    ${v.nombre.padEnd(22)} Proceso ${r.proceso ? '✔' : '✖'}  Proyecto ${r.proy ? '✔' : '✖'}  Zona ${r.zona ? '✔' : '✖'}  Mes ${r.mes ? '✔' : '✖'}  Día ${r.dia ? '✔' : '✖'}`);
}

bot.fin();
