/**
 * Infraestructura compartida de los bots de validación responsive.
 * Sin dependencias externas: lanza Chrome/Edge headless y lo controla por el protocolo CDP
 * (WebSocket nativo de Node >= 22). Cada combinación vista x viewport se carga UNA sola vez y todos
 * los bots evalúan sus chequeos sobre la misma página ya renderizada.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

export const VIEWS = [
  { name: 'Inicio', path: '/' },
  { name: 'Estratégico', path: '/estrategico' },
  { name: 'Gerencial', path: '/gerencial' },
  { name: 'Informes', path: '/informes' },
  { name: 'Operativo', path: '/operativo' },
  { name: 'Técnico Productivo', path: '/tecnico/productivo' },
  { name: 'Técnicos', path: '/tecnicos' },
  { name: 'Cierre Diario', path: '/cierre_diario' },
];

export const VIEWPORTS = {
  'movil-320': { name: 'móvil 320', width: 320, height: 640 },
  'movil-390': { name: 'móvil 390', width: 390, height: 844 },
  'movil-horizontal': { name: 'móvil horizontal 844x390', width: 844, height: 390 },
  'tablet-768': { name: 'tablet 768', width: 768, height: 1024 },
  'laptop-1280': { name: 'laptop 1280', width: 1280, height: 800 },
  'desktop-1920': { name: 'desktop 1920', width: 1920, height: 1080 },
};
export const BASE_VIEWPORTS = ['movil-320', 'movil-390', 'tablet-768', 'laptop-1280', 'desktop-1920'];

const CONCURRENCY = Number(process.env.RESP_CONCURRENCY || 3);
const LOAD_TIMEOUT_MS = Number(process.env.RESP_TIMEOUT_MS || 120000);

// Utilidades que se inyectan en la página antes de cada chequeo (accesibles por closure).
const PAGE_HELPERS = `
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\\s+/).filter(Boolean).slice(0, 2);
    if (cls.length) s += '.' + cls.join('.');
    const t = ((el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '') + '').trim().replace(/\\s+/g, ' ').slice(0, 30);
    if (t) s += ' "' + t + '"';
    return s;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  };
  const hasFixedAncestor = (el) => {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      if (getComputedStyle(p).position === 'fixed') return true;
    }
    return false;
  };
  const scrollAncestor = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll') return p;
    }
    return null;
  };
  const clipAncestor = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return p;
    }
    return null;
  };
  const topMost = (items) => items.filter((it) => !items.some((o) => o !== it && o.el.contains(it.el)));
`;

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('No se encontró Chrome/Edge. Define CHROME_PATH.');
  return found;
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Set();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id) {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        if (m.error) p.reject(new Error(`${m.error.message}`));
        else p.resolve(m.result);
      } else {
        this.listeners.forEach((l) => l(m));
      }
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

async function launchBrowser() {
  const port = 9400 + Math.floor(Math.random() * 400);
  const userDir = mkdtempSync(join(tmpdir(), 'resp-bot-'));
  const child = spawn(findBrowser(), [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${userDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--force-device-scale-factor=1',
    'about:blank',
  ], { stdio: 'ignore' });

  let version;
  for (let i = 0; i < 60; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!version) throw new Error('Chrome no respondió en el puerto de depuración.');

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('Falló la conexión CDP')); });
  const cdp = new CDP(ws);

  const close = async () => {
    try { await cdp.send('Browser.close'); } catch { /* ya cerrado */ }
    try { ws.close(); } catch { /* noop */ }
    if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
    await new Promise((r) => setTimeout(r, 500));
    try { rmSync(userDir, { recursive: true, force: true }); } catch { /* noop */ }
  };
  return { cdp, close };
}

async function loadPage(cdp, url, vp) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (method, params) => cdp.send(method, params, sessionId);

  const state = { inflight: new Map(), last: Date.now(), loaded: false, consoleErrors: [], exceptions: [] };
  const off = cdp.on((m) => {
    if (m.sessionId !== sessionId) return;
    const p = m.params || {};
    switch (m.method) {
      case 'Page.loadEventFired': state.loaded = true; state.last = Date.now(); break;
      case 'Network.requestWillBeSent':
        if (p.type !== 'EventSource' && p.type !== 'WebSocket') { state.inflight.set(p.requestId, p.request?.url || "?"); state.last = Date.now(); }
        break;
      case 'Network.loadingFinished':
      case 'Network.loadingFailed':
        state.inflight.delete(p.requestId); state.last = Date.now(); break;
      case 'Runtime.exceptionThrown':
        state.exceptions.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'excepción'); break;
      case 'Runtime.consoleAPICalled':
        if (p.type === 'error') state.consoleErrors.push((p.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
        break;
      default:
    }
  });

  await s('Page.enable');
  await s('Network.enable');
  await s('Runtime.enable');
  await s('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.width < 768 });
  if (vp.width < 768) await s('Emulation.setTouchEmulationEnabled', { enabled: true });
  await s('Page.navigate', { url });

  const start = Date.now();
  let timedOut = false;
  while (true) {
    await new Promise((r) => setTimeout(r, 250));
    if (state.loaded && state.inflight.size === 0 && Date.now() - state.last > 1500) break;
    if (Date.now() - start > LOAD_TIMEOUT_MS) { timedOut = true; break; }
  }
  await new Promise((r) => setTimeout(r, 800));

  const evaluate = async (fnSource, arg) => {
    const call = arg === undefined ? '' : JSON.stringify(arg);
    const expression = `(() => { ${PAGE_HELPERS}\n return (${fnSource})(${call}); })()`;
    const r = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const close = async () => {
    off();
    try { await cdp.send('Target.closeTarget', { targetId }); } catch { /* noop */ }
  };
  return { evaluate, close, state, timedOut };
}

/**
 * bots: [{ id, name, desc, viewports?: string[], check: () => any, analyze: (res, ctx) => {fails, warns, info} }]
 * Devuelve { failed: boolean, results }.
 */
export async function runBots(bots) {
  const t0 = Date.now();
  const usedVp = [...new Set(bots.flatMap((b) => b.viewports || BASE_VIEWPORTS))];
  const onlyVp = process.env.RESP_VIEWPORTS ? process.env.RESP_VIEWPORTS.split(',') : null;
  const onlyViews = process.env.RESP_VIEWS ? process.env.RESP_VIEWS.split(',').map((v) => v.toLowerCase()) : null;
  const tasks = VIEWS.filter((v) => !onlyViews || onlyViews.some((o) => v.name.toLowerCase().includes(o)))
    .flatMap((view) => usedVp.filter((k) => !onlyVp || onlyVp.includes(k)).map((vpKey) => ({ view, vpKey, vp: VIEWPORTS[vpKey] })));

  console.log(`\nValidación responsive · ${bots.length} bot(s) · ${tasks.length} cargas (vista x viewport) (${BASE_URL})`);
  try {
    const ping = await fetch(BASE_URL, { signal: AbortSignal.timeout(20000) });
    if (!ping.ok && ping.status >= 500) throw new Error(`HTTP ${ping.status}`);
  } catch (e) {
    console.error(`✖ No se pudo llegar a ${BASE_URL} (${e.message}). Inicia el servidor con "npm run dev".`);
    process.exit(2);
  }

  const { cdp, close } = await launchBrowser();
  const results = []; // { bot, view, vp, fails, warns, info }
  let done = 0;
  try {
    let next = 0;
    const worker = async () => {
      while (next < tasks.length) {
        const task = tasks[next++];
        const label = `${task.view.name} @ ${task.vp.name}`;
        let page;
        try {
          page = await loadPage(cdp, BASE_URL + task.view.path, task.vp);
          for (const bot of bots) {
            if (!(bot.viewports || BASE_VIEWPORTS).includes(task.vpKey)) continue;
            const entry = { bot: bot.id, view: task.view.name, vp: task.vp.name, fails: [], warns: [], info: [] };
            try {
              const ctx = { view: task.view, vp: task.vp, state: page.state, timedOut: page.timedOut };
              const out = bot.run
                ? await bot.run(page, ctx)
                : bot.analyze(await page.evaluate(bot.check.toString()), ctx);
              entry.fails = out.fails || [];
              entry.warns = out.warns || [];
              entry.info = out.info || [];
            } catch (e) {
              entry.fails.push(`error ejecutando el chequeo: ${e.message}`);
            }
            if (page.timedOut) entry.warns.push(`la página no quedó en reposo de red en ${LOAD_TIMEOUT_MS / 1000}s (se evaluó igual). Pendientes: ${[...page.state.inflight.values()].slice(0, 3).map((u) => u.replace(BASE_URL, '')).join(', ')}`);
            results.push(entry);
          }
        } catch (e) {
          for (const bot of bots) {
            if ((bot.viewports || BASE_VIEWPORTS).includes(task.vpKey)) {
              results.push({ bot: bot.id, view: task.view.name, vp: task.vp.name, fails: [`no se pudo cargar la página: ${e.message}`], warns: [], info: [] });
            }
          }
        } finally {
          if (page) await page.close();
        }
        done++;
        process.stdout.write(`\r  progreso: ${done}/${tasks.length} (${label})`.padEnd(90));
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  } finally {
    await close();
  }
  process.stdout.write('\n');

  let failed = false;
  for (const bot of bots) {
    const rs = results.filter((r) => r.bot === bot.id);
    const nFail = rs.filter((r) => r.fails.length).length;
    const nWarn = rs.filter((r) => !r.fails.length && r.warns.length).length;
    const nOk = rs.length - nFail - nWarn;
    if (nFail) failed = true;
    console.log(`\n${'='.repeat(78)}\n${bot.id} · ${bot.name}\n${bot.desc}\n${'-'.repeat(78)}`);
    console.log(`Resultado: ${nOk} OK · ${nWarn} con avisos · ${nFail} con fallas (de ${rs.length} combinaciones)`);
    const order = (a, b) => VIEWS.findIndex((v) => v.name === a.view) - VIEWS.findIndex((v) => v.name === b.view) || a.vp.localeCompare(b.vp);
    for (const r of rs.sort(order)) {
      if (!r.fails.length && !r.warns.length) continue;
      console.log(`  ${r.fails.length ? '✖ FALLA' : '⚠ AVISO'} · ${r.view} @ ${r.vp}`);
      r.fails.slice(0, 6).forEach((m) => console.log(`      ✖ ${m}`));
      r.warns.slice(0, 4).forEach((m) => console.log(`      ⚠ ${m}`));
      const extra = r.fails.length + r.warns.length - Math.min(r.fails.length, 6) - Math.min(r.warns.length, 4);
      if (extra > 0) console.log(`      … y ${extra} más`);
    }
  }

  const reportPath = join(tmpdir(), 'responsive-report.json');
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  const totalFail = results.filter((r) => r.fails.length).length;
  console.log(`\n${'='.repeat(78)}\nTOTAL: ${results.length} evaluaciones · ${totalFail} con fallas · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(`Reporte completo (JSON): ${reportPath}`);
  return { failed, results };
}

export async function runStandalone(bot, metaUrl) {
  const { pathToFileURL } = await import('node:url');
  if (metaUrl === pathToFileURL(process.argv[1]).href) {
    const { failed } = await runBots([bot]);
    process.exit(failed ? 1 : 0);
  }
}
