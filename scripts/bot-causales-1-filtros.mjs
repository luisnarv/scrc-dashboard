#!/usr/bin/env node
/**
 * ==============================================================================
 * BOT CAUSALES 1: FILTROS DEL GRÁFICO "Evolutivo de Causales de No Efectividad (Pérdidas)"
 * ==============================================================================
 * Prueba el código REAL (src/app/components/utils/filters.ts y causales.ts) con un dataset
 * sintético que cubre todas las dimensiones del filtro global:
 *   Proyecto · Zona · Mes · Fecha (día exacto / lista / solo día) · Proceso (Gestor)
 * y verifica:
 *   1. enrichGeo asigna _Proyecto/_Zona/_ZonaDet (sin esto, cualquier filtro vaciaba el gráfico).
 *   2. filtPerdidas == oráculo independiente para TODAS las combinaciones.
 *   3. Particiones: Σ zonas = Σ proyecto = total; Σ meses = total.
 *   4. Paridad con filtRaw: mismo registro, mismas dimensiones -> mismo veredicto.
 *   5. Lo que se grafica (buildCausales) suma exactamente lo filtrado, por periodo y en total,
 *      para cada Estado (Todas / Fallidas / Pérdidas); Fallidas + Pérdidas == Todas.
 *   6. El filtro se aplica en el DashboardProvider (normalizeMonth) y la página usa filtPerdidas.
 * ==============================================================================
 */
import assert from 'node:assert/strict';
import { cargarFiltros, cargarCausales, crearRunner, leer } from './lib-causales.mjs';

const { filtPerdidas, filtRaw, enrichGeo } = await cargarFiltros();
const { buildCausales, OTRAS_CAUSALES, filtEstado, sumaCantidad } = await cargarCausales();
const ESTADOS = ['TODAS', 'Fallida', 'Perdida'];
const R = crearRunner('🤖 BOT CAUSALES 1: FILTROS Y CONSISTENCIA DEL GRÁFICO DE CAUSALES');

// ---------- Dataset sintético determinista ----------
const ZONAS = ['ATLANTICO SUR', 'ATLANTICO CENTRO', 'ATLANTICO NORTE'];
const BRIGADAS = ['Brigada Pesada', 'Brigada Liviana', 'Gestor Integral Multi', 'Brigada Minicanasta'];
const CAUSAS = [
  ['RESISTENCIA DEL CLIENTE', 'USUARIO AGRESIVO'], ['ACCESO IMPEDIDO', 'MULTIFAMILIAR/MULTICOMERCIAL'],
  ['RESISTENCIA DEL CLIENTE', 'FACTURA 1'], ['SUMINISTRO NO ENCONTRADO', 'MEDIDOR NO ENCONTRADO'],
  ['DIFICIL ACCESO', 'SECTOR PELIGROSO'], ['RESISTENCIA DEL CLIENTE', 'EXCESO DE CONSUMO'],
  ['CLIENTE AUSENTE', 'NO HAY NADIE'], ['OTRA', 'SIN DETALLE'],
];
const FECHAS = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05'];
const perdidas = [];
const raws = [];
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let i = 0; i < 600; i++) {
  const z = ZONAS[Math.floor(rnd() * ZONAS.length)];
  const f = FECHAS[Math.floor(rnd() * FECHAS.length)];
  const b = BRIGADAS[Math.floor(rnd() * BRIGADAS.length)];
  const [a, s] = CAUSAS[Math.floor(Math.pow(rnd(), 2) * CAUSAS.length)];
  const h = String(7 + Math.floor(rnd() * 16)).padStart(2, '0') + ':00';
  const estado = rnd() < 0.6 ? 'Fallida' : 'Perdida';
  const cantidad = 1 + Math.floor(rnd() * 5);
  perdidas.push({ Fecha: f, Hora: h, Zona: z, Brigada: b, Accion: a, Subaccion: s, Estado: estado, Cantidad: cantidad });
  raws.push({ Fecha: f, Zona: z, Tipo_Brigada_Mes: b });
}
perdidas.forEach(enrichGeo);
raws.forEach(enrichGeo);

const ALL = { proy: 'ALL', zona: 'ALL', ano: 'ALL', mes: [], fecha: 'ALL', proceso: 'ALL' };
const F = (o) => ({ ...ALL, ...o });

// Oráculo independiente (no reutiliza el código bajo prueba)
const proyDe = (z) => (/SUR/.test(z) ? 'Sur' : 'Norte-Centro');
const zonaDe = (z) => (/SUR/.test(z) ? 'Sur' : /CENTRO/.test(z) ? 'Centro' : 'Norte');
function oraculo(p, f, estado = 'TODAS') {
  if (estado !== 'TODAS' && p.Estado !== estado) return false;
  if (f.proy !== 'ALL' && proyDe(p.Zona) !== f.proy) return false;
  if (f.zona !== 'ALL' && zonaDe(p.Zona) !== f.zona) return false;
  if (f.mes.length && !f.mes.includes(p.Fecha.slice(0, 7))) return false;
  if (f.fecha !== 'ALL') {
    const lista = f.fecha.split(',');
    if (!lista.includes(p.Fecha) && !lista.includes(p.Fecha.slice(8, 10))) return false;
  }
  if (f.proceso === 'GESTOR' && p.Brigada !== 'Gestor Integral Multi') return false;
  return true;
}

await R.test('enrichGeo: Sur / Centro / Norte se normalizan a proyecto y zona', () => {
  const sur = enrichGeo({ Zona: 'ATLANTICO SUR' });
  const cen = enrichGeo({ Zona: 'ATLANTICO CENTRO' });
  const nor = enrichGeo({ Zona: 'ATLANTICO NORTE' });
  assert.deepEqual([sur._Proyecto, sur._Zona, sur._ZonaDet], ['Sur', 'Sur', 'Sur']);
  assert.deepEqual([cen._Proyecto, cen._Zona], ['Norte-Centro', 'Centro']);
  assert.deepEqual([nor._Proyecto, nor._Zona], ['Norte-Centro', 'Norte']);
});

await R.test('Regresión: sin enrichGeo el filtro de proyecto vaciaba el gráfico; con enrichGeo no', () => {
  const crudo = perdidas.map(p => ({ Fecha: p.Fecha, Zona: p.Zona, Brigada: p.Brigada }));
  assert.equal(filtPerdidas(crudo, F({ proy: 'Sur' })).length, 0, 'el caso sin normalizar debe ser el que falla');
  assert.ok(filtPerdidas(perdidas, F({ proy: 'Sur' })).length > 0);
});

await R.test('Sin filtros devuelve todas las pérdidas', () => {
  assert.equal(filtPerdidas(perdidas, ALL).length, perdidas.length);
});

await R.test('Cada dimensión por separado coincide con el oráculo', () => {
  const casos = [
    F({ proy: 'Sur' }), F({ proy: 'Norte-Centro' }), F({ zona: 'Sur' }), F({ zona: 'Centro' }), F({ zona: 'Norte' }),
    F({ mes: ['2026-09'] }), F({ mes: ['2026-10'] }), F({ mes: ['2026-09', '2026-10'] }),
    F({ fecha: '2026-10-01' }), F({ fecha: '2026-09-30,2026-10-02' }), F({ fecha: '05' }), F({ fecha: '01,02' }),
    F({ proceso: 'GESTOR' }), F({ fecha: '2099-01-01' }),
  ];
  for (const f of casos) {
    const esperado = perdidas.filter(p => oraculo(p, f)).length;
    assert.equal(filtPerdidas(perdidas, f).length, esperado, `filtro ${JSON.stringify(f)}`);
  }
});

await R.test('Todas las combinaciones proyecto×zona×mes×fecha×proceso coinciden con el oráculo', () => {
  let n = 0;
  for (const proy of ['ALL', 'Sur', 'Norte-Centro'])
    for (const zona of ['ALL', 'Sur', 'Centro', 'Norte'])
      for (const mes of [[], ['2026-09'], ['2026-10'], ['2026-09', '2026-10']])
        for (const fecha of ['ALL', '2026-09-30', '2026-10-02', '01,05'])
          for (const proceso of ['ALL', 'GESTOR']) {
            const f = F({ proy, zona, mes, fecha, proceso });
            const got = filtPerdidas(perdidas, f);
            const exp = perdidas.filter(p => oraculo(p, f));
            assert.equal(got.length, exp.length, `combo ${JSON.stringify(f)}`);
            assert.ok(got.every((p, i) => p === exp[i]), `registros distintos en ${JSON.stringify(f)}`);
            n++;
          }
  assert.equal(n, 3 * 4 * 4 * 4 * 2);
});

await R.test('Particiones: Σ zonas = Σ proyectos = total y Σ meses = total', () => {
  const tot = filtPerdidas(perdidas, ALL).length;
  const porZona = ['Sur', 'Centro', 'Norte'].reduce((s, z) => s + filtPerdidas(perdidas, F({ zona: z })).length, 0);
  const porProy = ['Sur', 'Norte-Centro'].reduce((s, p) => s + filtPerdidas(perdidas, F({ proy: p })).length, 0);
  const porMes = ['2026-09', '2026-10'].reduce((s, m) => s + filtPerdidas(perdidas, F({ mes: [m] })).length, 0);
  assert.equal(porZona, tot);
  assert.equal(porProy, tot);
  assert.equal(porMes, tot);
});

await R.test('Un filtro más restrictivo nunca devuelve más que uno menos restrictivo', () => {
  const base = filtPerdidas(perdidas, F({ proy: 'Norte-Centro' })).length;
  assert.ok(filtPerdidas(perdidas, F({ proy: 'Norte-Centro', zona: 'Centro' })).length <= base);
  assert.ok(
    filtPerdidas(perdidas, F({ proy: 'Norte-Centro', zona: 'Centro', proceso: 'GESTOR' })).length <=
    filtPerdidas(perdidas, F({ proy: 'Norte-Centro', zona: 'Centro' })).length,
  );
  assert.equal(filtPerdidas(perdidas, F({ proy: 'Sur', zona: 'Norte' })).length, 0, 'zona Norte no existe dentro de Sur');
});

await R.test('Paridad con filtRaw: el gráfico filtra igual que el resto de la página', () => {
  for (const proy of ['ALL', 'Sur', 'Norte-Centro'])
    for (const zona of ['ALL', 'Sur', 'Centro', 'Norte'])
      for (const mes of [[], ['2026-09'], ['2026-10']])
        for (const fecha of ['ALL', '2026-10-01', '30,01'])
          for (const proceso of ['ALL', 'GESTOR']) {
            const f = F({ proy, zona, mes, fecha, proceso });
            const a = filtPerdidas(perdidas, f).length;
            const b = filtRaw(raws, f).length;
            assert.equal(a, b, `filtPerdidas=${a} vs filtRaw=${b} con ${JSON.stringify(f)}`);
          }
});

await R.test('Filtro Estado: Fallidas + Pérdidas == Todas y cada uno coincide con el oráculo (con Cantidad)', () => {
  for (const proy of ['ALL', 'Sur', 'Norte-Centro'])
    for (const zona of ['ALL', 'Sur', 'Centro'])
      for (const proceso of ['ALL', 'GESTOR']) {
        const f = F({ proy, zona, proceso });
        const base = filtPerdidas(perdidas, f);
        const w = (estado) => perdidas.filter(p => oraculo(p, f, estado)).reduce((s, p) => s + p.Cantidad, 0);
        assert.equal(sumaCantidad(filtEstado(base, 'TODAS')), w('TODAS'));
        assert.equal(sumaCantidad(filtEstado(base, 'Fallida')), w('Fallida'), `Fallida ${proy}/${zona}/${proceso}`);
        assert.equal(sumaCantidad(filtEstado(base, 'Perdida')), w('Perdida'), `Perdida ${proy}/${zona}/${proceso}`);
        assert.equal(w('Fallida') + w('Perdida'), w('TODAS'));
      }
});

await R.test('buildCausales: lo graficado suma exactamente lo filtrado (mes, día, hora × estado) en todas las combinaciones', () => {
  const horas = Array.from({ length: 17 }, (_, i) => String(7 + i).padStart(2, '0') + ':00');
  for (const proy of ['ALL', 'Sur', 'Norte-Centro'])
    for (const zona of ['ALL', 'Sur', 'Centro'])
      for (const proceso of ['ALL', 'GESTOR'])
        for (const vista of ['mes', 'dia', 'hora'])
          for (const estado of ESTADOS) {
            const f = F({ proy, zona, proceso });
            const filtradas = filtPerdidas(perdidas, f);
            const esperado = perdidas.filter(p => oraculo(p, f, estado)).reduce((s, p) => s + p.Cantidad, 0);
            const r = buildCausales(filtradas, vista, vista === 'hora' ? horas : [], {}, estado);
            const etiqueta = `${vista} ${estado} ${proy}/${zona}/${proceso}`;
            const suma = r.series.reduce((s, x) => s + x.data.reduce((a, b) => a + b, 0), 0);
            assert.equal(suma, esperado, etiqueta);
            assert.equal(r.total, esperado, etiqueta);
            assert.equal(r.totalFallidas + r.totalPerdidas, r.total, etiqueta);
            if (estado === 'Fallida') assert.equal(r.totalPerdidas, 0, etiqueta);
            if (estado === 'Perdida') assert.equal(r.totalFallidas, 0, etiqueta);
            // desglose por punto: fallidas + pérdidas == data
            r.series.forEach(s => s.data.forEach((v, i) => assert.equal(s.fallidas[i] + s.perdidas[i], v, `desglose ${etiqueta}`)));
            r.labels.forEach((per, i) => {
              const col = r.series.reduce((s, x) => s + x.data[i], 0);
              assert.equal(col, r.perdidasPorPeriodo[per] || 0, `periodo ${per} ${etiqueta}`);
            });
            assert.ok(r.topCausales.length <= 6);
            const hayOtras = r.series.some(s => s.label === OTRAS_CAUSALES);
            const distintas = new Set(filtEstado(filtradas, estado).map(p => p.Accion + ' / ' + p.Subaccion)).size;
            assert.equal(hayOtras, distintas > 6, `Otras causales solo con más de 6 causales distintas (${etiqueta})`);
          }
});

await R.test('Evolutivo horario ACUMULADO: crece, termina en el total y conserva el desglose (todas las combinaciones × estado)', () => {
  const horas = Array.from({ length: 17 }, (_, i) => String(7 + i).padStart(2, '0') + ':00');
  for (const proy of ['ALL', 'Sur', 'Norte-Centro'])
    for (const zona of ['ALL', 'Sur', 'Centro'])
      for (const proceso of ['ALL', 'GESTOR'])
        for (const estado of ESTADOS) {
          const f = F({ proy, zona, proceso });
          const filtradas = filtPerdidas(perdidas, f);
          const esperado = perdidas.filter(p => oraculo(p, f, estado)).reduce((s, p) => s + p.Cantidad, 0);
          const ac = buildCausales(filtradas, 'hora', horas, {}, estado, 6, true);
          const sn = buildCausales(filtradas, 'hora', horas, {}, estado, 6, false);
          const et = `acumulado ${estado} ${proy}/${zona}/${proceso}`;
          assert.equal(ac.acumulado, true, et);
          assert.deepEqual(ac.labels, sn.labels, `${et}: mismo eje que sin acumular`);
          ac.series.forEach((s, k) => {
            // monótono no decreciente y termina en el total de la serie (sin acumular)
            s.data.forEach((v, i) => { if (i > 0) assert.ok(v >= s.data[i - 1], `${et}: "${s.label}" decrece en ${ac.labels[i]}`); });
            const totalSerie = sn.series[k].data.reduce((a, b) => a + b, 0);
            assert.equal(s.data[s.data.length - 1], totalSerie, `${et}: "${s.label}" no termina en su total`);
            // los incrementos reconstruyen el gráfico y el desglose suma el acumulado
            assert.deepEqual(s.periodo, sn.series[k].data, `${et}: incrementos de "${s.label}"`);
            s.data.forEach((v, i) => assert.equal(s.fallidas[i] + s.perdidas[i], v, `${et}: desglose de "${s.label}" en ${ac.labels[i]}`));
          });
          const sumaFinal = ac.series.reduce((s, x) => s + x.data[x.data.length - 1], 0);
          assert.equal(sumaFinal, esperado, et);
          assert.equal(ac.total, esperado, et);
          // total acumulado por periodo = Σ series en ese punto, creciente y terminando en el total
          ac.labels.forEach((l, i) => assert.equal(ac.perdidasPorPeriodo[l], ac.series.reduce((s, x) => s + x.data[i], 0), `${et}: total acumulado en ${l}`));
          assert.equal(ac.perdidasPorPeriodo[ac.labels[ac.labels.length - 1]], esperado, et);
        }
});

await R.test('El top de causales depende del estado elegido (no se mezcla Fallida con Pérdida)', () => {
  const t = (e) => buildCausales(filtPerdidas(perdidas, ALL), 'dia', [], {}, e);
  const fall = t('Fallida'); const perd = t('Perdida');
  assert.ok(fall.total > 0 && perd.total > 0);
  const nFall = sumaCantidad(perdidas.filter(p => p.Estado === 'Fallida'));
  assert.equal(fall.total, nFall);
  assert.equal(perd.total, sumaCantidad(perdidas) - nFall);
});

await R.test('buildCausales: pérdidas en periodos fuera del eje base no se pierden', () => {
  const r = buildCausales(perdidas, 'dia', ['2026-09-30'], {});
  assert.equal(r.series.reduce((s, x) => s + x.data.reduce((a, b) => a + b, 0), 0), sumaCantidad(perdidas));
  assert.ok(r.labels.includes('2026-10-05'));
});

await R.test('DashboardProvider normaliza perdidas con enrichGeo y la página usa filtPerdidas', () => {
  const prov = leer('src/app/components/DashboardProvider.tsx');
  assert.match(prov, /perdidas\s*=\s*\(p\.perdidas \|\| \[\]\)\.map\(enrichGeo\)/, 'normalizeMonth debe enriquecer perdidas');
  const page = leer('src/app/operativo/page.tsx');
  assert.match(page, /filtPerdidas\(raw\.perdidas \|\| \[\], F\)/);
  assert.match(page, /buildCausales\(/);
  assert.match(page, /useState<EstadoCausal>\('TODAS'\)/, 'la página debe tener el filtro de Estado');
  assert.match(page, /modalHeaderExtra=\{\s*<RailSegmented/, 'el filtro también debe estar dentro del modal');
});

R.fin();
