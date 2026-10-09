#!/usr/bin/env node
/**
 * ==============================================================================
 * BOT CAUSALES 3: TABLA DEL MODAL "Evolutivo ... de Causales de No Efectividad"
 * ==============================================================================
 * Verifica que la tabla de respaldo del modal esté bien estructurada, para cada Estado
 * (Todas / Fallidas / Pérdidas):
 *   1. Textos sin caracteres perdidos ("Tcnico", "Accin"...) ni mojibake (U+FFFD, "Ã").
 *   2. Encabezados exactos y con tilde; nº de celdas por fila == nº de columnas;
 *      con "Todas" aparecen las columnas Fallidas y Pérdidas, con un estado solo la suya.
 *   3. La 1.ª columna (categoryIndex) usa EXACTAMENTE la etiqueta de las series del gráfico:
 *      así el filtro por causal del modal (checkbox/clic) deja filas y gráfico alineados.
 *   4. Los totales de la tabla cuadran con el gráfico (por causal, por periodo y en total);
 *      Fallidas + Pérdidas == Total; el detalle por brigada suma el total de su causal.
 *   5. Simulación del filtro del modal (misma lógica de AnalysisModal) para cada causal y
 *      cada par de causales: la tabla nunca queda vacía ni desalineada del gráfico.
 *   6. Al cambiar de Estado, las categorías seleccionadas que ya no existen se descartan
 *      (el modal no queda vacío).
 *   7. Con datos reales (si el servidor está arriba): mismas comprobaciones.
 * ==============================================================================
 */
import assert from 'node:assert/strict';
import { cargarFiltros, cargarCausales, crearRunner, leer, getJson } from './lib-causales.mjs';

const { filtPerdidas, enrichGeo } = await cargarFiltros();
const { buildCausales, COLUMNA_CAUSAL, OTRAS_CAUSALES, sumaCantidad, filtEstado } = await cargarCausales();
const R = crearRunner('🤖 BOT CAUSALES 3: ESTRUCTURA DE LA TABLA DEL MODAL DE CAUSALES');

const ALL = { proy: 'ALL', zona: 'ALL', ano: 'ALL', mes: [], fecha: 'ALL', proceso: 'ALL' };
const ESTADOS = ['TODAS', 'Fallida', 'Perdida'];
const PALABRAS_ROTAS = ['Tcnico', 'Accin', 'Subaccin', 'Observacin', 'grfico', 'Lneas', 'participacin'];
const MOJIBAKE = /[�]|Ã[¡©­³ºñ]|Â[°¿]/;

// ---------- dataset sintético con 8 causales (para tener "Otras causales") ----------
const CAUSAS = ['A1/S1', 'A1/S2', 'A2/S1', 'A3/S3', 'A4/S4', 'A5/S5', 'A6/S6', 'A7/S7'].map(c => c.split('/'));
let seed = 11;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const sintetico = Array.from({ length: 400 }, (_, i) => {
  const [a, s] = CAUSAS[Math.floor(Math.pow(rnd(), 1.8) * CAUSAS.length)];
  return enrichGeo({
    Fecha: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'][i % 4],
    Hora: String(7 + (i % 16)).padStart(2, '0') + ':00',
    Zona: ['ATLANTICO SUR', 'ATLANTICO CENTRO', 'ATLANTICO NORTE'][i % 3],
    Brigada: ['Brigada Pesada', 'Brigada Liviana', 'Gestor Integral Multi'][i % 3],
    Accion: a, Subaccion: s,
    Estado: rnd() < 0.55 ? 'Fallida' : 'Perdida',
    Cantidad: 1 + Math.floor(rnd() * 6),
  });
});

// Misma lógica que AnalysisModal.filteredTableData / filteredConfig (se verifica abajo que sigue en el fuente)
function aplicarFiltroModal(series, tabla, seleccion) {
  const s = seleccion.length ? series.filter(x => seleccion.includes(x.label)) : series;
  const detalle = tabla.categoryDetail || {};
  const filas = seleccion.length
    ? tabla.hierarchicalRows.flatMap(r => {
        const cat = String(r.row[tabla.categoryIndex]);
        if (!seleccion.includes(cat)) return [];
        return detalle[cat] ? detalle[cat] : [r];
      })
    : tabla.hierarchicalRows;
  return { series: s, filas };
}

function validarEstructura(res, estado, etiqueta) {
  const t = res.tableData;
  const c = t.col;
  const esperado = [COLUMNA_CAUSAL, 'Total'];
  if (estado !== 'Perdida') esperado.push('Fallidas');
  if (estado !== 'Fallida') esperado.push('Pérdidas');
  esperado.push('% Part.', '% s/ Visitas');
  assert.deepEqual(t.columns.slice(0, esperado.length), esperado, `${etiqueta}: encabezados`);
  assert.equal(t.columns.length, esperado.length + res.labels.length, 'una columna por periodo');
  assert.equal(c.primerPeriodo, esperado.length);
  assert.equal(t.categoryIndex, 0);
  assert.equal(c.fallidas !== null, estado !== 'Perdida');
  assert.equal(c.perdidas !== null, estado !== 'Fallida');
  t.columns.forEach(x => assert.ok(!MOJIBAKE.test(x) && !PALABRAS_ROTAS.includes(x), `encabezado dañado: ${x}`));
  const todas = [];
  t.hierarchicalRows.forEach(h => { todas.push(h.row); h.children.forEach(ch => todas.push(ch.row)); });
  todas.forEach(row => {
    assert.equal(row.length, t.columns.length, `fila "${row[0]}" tiene ${row.length} celdas y hay ${t.columns.length} columnas`);
    row.forEach(cell => {
      assert.ok(cell !== undefined && cell !== null && !/undefined|NaN|\[object/.test(String(cell)), `celda inválida en "${row[0]}": ${cell}`);
      assert.ok(!MOJIBAKE.test(String(cell)), `texto dañado: ${cell}`);
    });
    // Fallidas + Pérdidas == Total (solo las columnas visibles)
    const f = c.fallidas !== null ? row[c.fallidas] : 0;
    const p = c.perdidas !== null ? row[c.perdidas] : 0;
    assert.equal(f + p, row[c.total], `Fallidas+Pérdidas != Total en "${row[0]}"`);
    assert.equal(row.slice(c.primerPeriodo).reduce((a, b) => a + b, 0), row[c.total], `periodos != total en "${row[0]}"`);
  });
  // etiquetas de la tabla == etiquetas de las series
  assert.deepEqual(t.hierarchicalRows.map(h => h.row[0]).sort(), res.series.map(s => s.label).sort(), `${etiqueta}: tabla y gráfico deben usar las mismas causales`);
  // totales
  assert.equal(t.hierarchicalRows.reduce((s, h) => s + h.row[c.total], 0), res.total, 'Σ causales de la tabla == total');
  t.hierarchicalRows.forEach(h => {
    const serie = res.series.find(s => s.label === h.row[0]);
    assert.equal(h.row[c.total], serie.data.reduce((a, b) => a + b, 0), `total de "${h.row[0]}"`);
    res.labels.forEach((_, i) => assert.equal(h.row[c.primerPeriodo + i], serie.data[i], `"${h.row[0]}" periodo #${i}`));
    if (c.fallidas !== null) assert.equal(h.row[c.fallidas], serie.fallidas.reduce((a, b) => a + b, 0), `fallidas de "${h.row[0]}"`);
    if (c.perdidas !== null) assert.equal(h.row[c.perdidas], serie.perdidas.reduce((a, b) => a + b, 0), `pérdidas de "${h.row[0]}"`);
    assert.equal(h.children.reduce((s, ch) => s + ch.row[c.total], 0), h.row[c.total], `Σ brigadas == total de "${h.row[0]}"`);
  });
  // detalle de categoría ("Otras causales" -> una fila por cada causal que agrupa)
  Object.entries(t.categoryDetail).forEach(([cat, filas]) => {
    const serie = res.series.find(s => s.label === cat);
    assert.ok(serie, `categoryDetail["${cat}"] no corresponde a ninguna serie`);
    assert.equal(filas.reduce((s, f) => s + f.row[c.total], 0), serie.data.reduce((a, b) => a + b, 0), `Σ detalle de "${cat}" == total de la serie`);
    assert.equal(new Set(filas.map(f => f.row[0])).size, filas.length, `causales repetidas en el detalle de "${cat}"`);
    assert.ok(filas.every(f => f.row[0] !== cat), `el detalle de "${cat}" no debe contener la propia fila agrupada`);
    filas.forEach(f => {
      assert.equal(f.row.length, t.columns.length, `fila de detalle "${f.row[0]}": celdas != columnas`);
      const ff = c.fallidas !== null ? f.row[c.fallidas] : 0;
      const pp = c.perdidas !== null ? f.row[c.perdidas] : 0;
      assert.equal(ff + pp, f.row[c.total], `Fallidas+Pérdidas != Total en detalle "${f.row[0]}"`);
      assert.equal(f.children.reduce((s, ch) => s + ch.row[c.total], 0), f.row[c.total], `Σ brigadas == total del detalle "${f.row[0]}"`);
      assert.ok(!f.row.some(x => /undefined|NaN/.test(String(x))), `celda inválida en detalle "${f.row[0]}"`);
    });
  });
  const part = t.hierarchicalRows.reduce((s, h) => s + parseFloat(h.row[c.part]), 0);
  if (res.total > 0) assert.ok(Math.abs(part - 100) < 0.6, `Σ % participación = ${part}`);
  if (estado === 'Fallida') assert.equal(res.totalPerdidas, 0);
  if (estado === 'Perdida') assert.equal(res.totalFallidas, 0);
}

await R.test('Fuente: ningún texto de la página/tabla trae palabras con letras perdidas ni mojibake', () => {
  for (const f of ['src/app/operativo/page.tsx', 'src/app/components/utils/causales.ts', 'src/lib/queries_v2.ts']) {
    const src = leer(f);
    assert.ok(!src.includes('�'), `${f} contiene U+FFFD`);
    PALABRAS_ROTAS.forEach(p => assert.ok(!src.includes(p), `${f} contiene "${p}"`));
  }
  const pg = leer('src/app/operativo/page.tsx');
  assert.match(pg, /Horario Causales de no efectividad/);
  assert.match(pg, /Causales mensual de no efectividad/);
});

await R.test('AnalysisModal: filtra la tabla por la 1.ª columna, respeta firstColMinWidth y descarta categorías vencidas', () => {
  const m = leer('src/app/components/AnalysisModal.tsx');
  assert.ok(m.includes('tableData.hierarchicalRows.flatMap(r =>') && m.includes('selectedCategories.includes(cat)'), 'la lógica de filtro del modal cambió: actualice este bot');
  assert.ok((m.match(/firstColMinWidth/g) || []).length >= 6, 'firstColMinWidth debe aplicarse en encabezado y celdas');
  assert.ok(m.includes('prev.filter(c => allCategories.includes(c))'), 'el modal debe descartar categorías que ya no existen');
  assert.ok(m.includes('detalle[cat] ? detalle[cat] : [r]'), 'el modal debe sustituir "Otras causales" por su detalle (categoryDetail)');
  assert.ok(m.includes('{headerExtra}'), 'el modal debe mostrar el filtro de Estado (headerExtra)');
});

await R.test('Estructura de la tabla (sintético): vistas mes/día/hora × estados', () => {
  const horas = Array.from({ length: 17 }, (_, i) => String(7 + i).padStart(2, '0') + ':00');
  for (const vista of ['mes', 'dia', 'hora'])
    for (const estado of ESTADOS) {
      const res = buildCausales(sintetico, vista, vista === 'hora' ? horas : [], { '2026-10-01': 100 }, estado);
      assert.ok(res.series.some(s => s.label === OTRAS_CAUSALES), 'el dataset debe producir "Otras causales"');
      validarEstructura(res, estado, `${vista}/${estado}`);
    }
});

await R.test('Estructura con filtros aplicados (proyecto/zona/proceso × estado) incl. resultado vacío', () => {
  for (const proy of ['ALL', 'Sur', 'Norte-Centro'])
    for (const zona of ['ALL', 'Sur', 'Centro', 'Norte'])
      for (const proceso of ['ALL', 'GESTOR'])
        for (const estado of ESTADOS) {
          const f = filtPerdidas(sintetico, { ...ALL, proy, zona, proceso });
          const res = buildCausales(f, 'dia', [], {}, estado);
          validarEstructura(res, estado, `${proy}/${zona}/${proceso}/${estado}`);
          if (sumaCantidad(filtEstado(f, estado)) === 0) assert.equal(res.tableData.hierarchicalRows.length, 0);
        }
});

await R.test('Filtro del modal: cada causal y cada par dejan tabla y gráfico alineados y no vacíos (3 estados)', () => {
  for (const estado of ESTADOS) {
    const res = buildCausales(sintetico, 'dia', [], {}, estado);
    const labels = res.series.map(s => s.label);
    const selecciones = [[], ...labels.map(l => [l])];
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) selecciones.push([labels[i], labels[j]]);
    for (const sel of selecciones) {
      const { series, filas } = aplicarFiltroModal(res.series, res.tableData, sel);
      assert.ok(series.length > 0 && filas.length > 0, `${estado}: selección ${JSON.stringify(sel)} dejó vacío el gráfico o la tabla`);
      // con selección vacía la tabla muestra las filas resumen; con selección, "Otras causales" se expande
      const esperadas = sel.length
        ? series.map(s => s.label).flatMap(l => (res.tableData.categoryDetail[l] ? res.tableData.categoryDetail[l].map(f => f.row[0]) : [l]))
        : series.map(s => s.label);
      assert.deepEqual(filas.map(f => f.row[0]).sort(), esperadas.sort(), `desalineado con ${JSON.stringify(sel)}`);
      const sg = series.reduce((s, x) => s + x.data.reduce((a, b) => a + b, 0), 0);
      assert.equal(filas.reduce((s, f) => s + f.row[res.tableData.col.total], 0), sg, `totales distintos con ${JSON.stringify(sel)}`);
    }
  }
});

await R.test('Filtrar SOLO por "Otras causales": la tabla lista todas las causales que agrupa (no la fila resumen)', () => {
  for (const estado of ESTADOS) {
    const res = buildCausales(sintetico, 'dia', [], {}, estado);
    if (!res.series.some(s => s.label === OTRAS_CAUSALES)) continue;
    const top = new Set(res.topCausales);
    const agrupadas = [...new Set(filtEstado(sintetico, estado).map(p => p.Accion + ' / ' + p.Subaccion))].filter(k => !top.has(k));
    const { filas } = aplicarFiltroModal(res.series, res.tableData, [OTRAS_CAUSALES]);
    assert.ok(agrupadas.length >= 1);
    assert.deepEqual(filas.map(f => f.row[0]).sort(), agrupadas.sort(), `${estado}: deben verse todas las causales agrupadas`);
    assert.ok(!filas.some(f => f.row[0] === OTRAS_CAUSALES), 'no debe quedar la fila "Otras causales"');
    const otras = res.series.find(s => s.label === OTRAS_CAUSALES);
    assert.equal(filas.reduce((s, f) => s + f.row[res.tableData.col.total], 0), otras.data.reduce((a, b) => a + b, 0));
  }
});

await R.test('Cambiar de Estado con una causal seleccionada: la selección vencida se descarta (nunca queda vacío)', () => {
  // Simula el efecto de AnalysisModal: selectedCategories = prev ∩ categorías vigentes
  const todas = buildCausales(sintetico, 'dia', [], {}, 'TODAS');
  const soloF = buildCausales(sintetico, 'dia', [], {}, 'Fallida');
  const vigentes = soloF.series.map(s => s.label);
  const seleccion = todas.series.map(s => s.label).filter(l => !vigentes.includes(l)).slice(0, 1).concat(vigentes[0]);
  const depurada = seleccion.filter(c => vigentes.includes(c));
  assert.ok(depurada.length >= 1);
  const { series, filas } = aplicarFiltroModal(soloF.series, soloF.tableData, depurada);
  assert.ok(series.length > 0 && filas.length > 0);
});

await R.test('Primera columna con ancho mínimo para causales largas (sin partir palabra por línea)', () => {
  assert.ok(buildCausales(sintetico, 'dia', [], {}).tableData.firstColMinWidth >= 240);
});

// ---------- Datos reales (si el servidor está disponible) ----------
let real = null;
try {
  const m = await getJson('/api/data/months', 30000);
  const mes = (m.months || []).filter(x => x.count > 0).map(x => x.mes).sort().pop();
  const api = await getJson(`/api/data/base?mes=${mes}`);
  real = { mes, per: (api.perdidas || []).map(p => enrichGeo({ ...p })) };
} catch (e) {
  console.log(`  ⚠ [OMITIDO] datos reales: ${String(e.message).slice(0, 120)}`);
}
if (real) {
  await R.test(`[${real.mes}] datos reales: tabla y filtro del modal con ${sumaCantidad(real.per)} órdenes no efectivas`, () => {
    for (const proy of ['ALL', 'Sur', 'Norte-Centro'])
      for (const estado of ESTADOS) {
        const f = filtPerdidas(real.per, { ...ALL, proy, mes: [real.mes] });
        const res = buildCausales(f, 'dia', [], {}, estado);
        validarEstructura(res, estado, `${proy}/${estado}`);
        res.series.forEach(s => {
          const { filas, series } = aplicarFiltroModal(res.series, res.tableData, [s.label]);
          assert.equal(series.length, 1);
          if (s.label === OTRAS_CAUSALES) {
            assert.ok(filas.length >= 1 && filas.every(f => f.row[0] !== OTRAS_CAUSALES), '"Otras causales" debe mostrarse como sus causales');
            assert.equal(filas.reduce((a, f) => a + f.row[res.tableData.col.total], 0), s.data.reduce((a, b) => a + b, 0));
          } else {
            assert.equal(filas.length, 1);
            assert.equal(filas[0].row[res.tableData.col.total], s.data.reduce((a, b) => a + b, 0));
          }
        });
      }
  });
}

R.fin();
