#!/usr/bin/env node
/**
 * ==============================================================================
 * BOT CAUSALES 2: DATOS REALES (PostgreSQL + API) DEL GRÁFICO DE CAUSALES
 * ==============================================================================
 * Compara lo que entrega /api/data/base (perdidas = Fallidas + Pérdidas agregadas con Cantidad)
 * con la verdad en dbanalitica.historico_mo y aplica los filtros REALES de la página
 * (filtPerdidas / filtRaw / filtEstado / buildCausales):
 *   1. Total del mes por Estado: API == BD (Fallida y Perdida, misma regla de la página).
 *   2. Mismas cantidades por zona, brigada, día y estado.
 *   3. Cuadre con los KPIs: Σ rawRecords.Fallidas == Fallidas del gráfico y
 *      Σ rawRecords.Perdidas == Pérdidas del gráfico, en todas las combinaciones de
 *      Proyecto × Zona × Proceso × Día.
 *   4. Cada combinación × Estado (Todas/Fallidas/Pérdidas) == conteo SQL independiente.
 *   5. Top de causales del gráfico == top de causales en SQL, por Estado.
 *   6. Calidad: Estado válido, causal informada, hora HH:00 entre 07 y 22, fecha dentro del mes.
 *
 * Requiere el servidor corriendo (npm run dev). Puerto distinto: BASE_URL=http://localhost:3100
 * ==============================================================================
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { cargarFiltros, cargarCausales, crearPool, crearRunner, getJson, BASE_URL } from './lib-causales.mjs';

const { filtPerdidas, filtRaw, enrichGeo } = await cargarFiltros();
const { buildCausales, filtEstado, sumaCantidad } = await cargarCausales();
const R = crearRunner(`🤖 BOT CAUSALES 2: DATOS REALES vs BASE DE DATOS (${BASE_URL})`);
const pool = crearPool(pg.Pool);

const ALL = { proy: 'ALL', zona: 'ALL', ano: 'ALL', mes: [], fecha: 'ALL', proceso: 'ALL' };
const BASE_COND = "mo.id_tecnico IS NOT NULL AND mo.tiene_vs AND UPPER(COALESCE(mo.tecnico,'')) NOT LIKE '%PRUEBA%'";
const ESTADOS = ['TODAS', 'Fallida', 'Perdida'];
const proyDe = (z) => (/SUR/i.test(z || '') ? 'Sur' : 'Norte-Centro');
const zonaDe = (z) => (/SUR/i.test(z || '') ? 'Sur' : /CENTRO/i.test(z || '') ? 'Centro' : 'Norte');
const wSql = { TODAS: "mo.estado_norm IN ('Fallida','Perdida')", Fallida: "mo.estado_norm = 'Fallida'", Perdida: "mo.estado_norm = 'Perdida'" };

let meses;
try {
  const m = await getJson('/api/data/months');
  meses = (m.months || []).filter(x => x.count > 0).map(x => x.mes).sort().slice(-2);
} catch (e) {
  console.error('  ✖ [FAIL] No se pudo leer /api/data/months:', e.message);
  process.exit(1);
}
console.log(`  Meses bajo prueba: ${meses.join(', ')}\n`);

for (const mes of meses) {
  const api = await getJson(`/api/data/base?mes=${mes}`);
  const per = (api.perdidas || []).map(p => ({ ...p }));
  per.forEach(enrichGeo);
  const raws = (api.rawRecords || []).map(r => ({ ...r }));
  raws.forEach(r => { enrichGeo(r); r._ZonaDet = r._ZonaDet || r._Zona; });
  const { rows: bd } = await pool.query(
    `SELECT mo.fecha_cierre::text AS fecha, mo.zona, mo.brigada_homologada AS brigada, mo.estado_norm AS estado, COUNT(*)::int AS n
       FROM dbanalitica.historico_mo mo
      WHERE mo.fecha_cierre >= $1::date AND mo.fecha_cierre < ($1::date + interval '1 month')
        AND ${BASE_COND} AND ${wSql.TODAS}
      GROUP BY 1,2,3,4`, [mes + '-01']);
  const bdEstado = (e) => bd.filter(r => e === 'TODAS' || r.estado === e);
  const sumBd = (rows) => rows.reduce((s, r) => s + r.n, 0);

  await R.test(`[${mes}] totales por estado: API == BD (Fallidas ${sumBd(bdEstado('Fallida'))}, Pérdidas ${sumBd(bdEstado('Perdida'))})`, () => {
    for (const e of ESTADOS) assert.equal(sumaCantidad(filtEstado(per, e)), sumBd(bdEstado(e)), `estado ${e}`);
    assert.ok(sumBd(bdEstado('Fallida')) > 0 && sumBd(bdEstado('Perdida')) > 0, 'el mes de prueba debe tener ambos estados');
  });

  await R.test(`[${mes}] cantidades por zona, brigada, día y estado coinciden con la BD`, () => {
    for (const [campo, key] of [['Zona', 'zona'], ['Brigada', 'brigada'], ['Fecha', 'fecha'], ['Estado', 'estado']]) {
      const a = {}; const b = {};
      per.forEach(p => { const k = p[campo] ?? 'NULL'; a[k] = (a[k] || 0) + Number(p.Cantidad); });
      bd.forEach(r => { const k = r[key] ?? 'NULL'; b[k] = (b[k] || 0) + r.n; });
      assert.deepEqual(a, b, `diferencias por ${campo}`);
    }
  });

  await R.test(`[${mes}] el payload es agregado (no una fila por orden): ${per.length} registros para ${sumaCantidad(per)} órdenes`, () => {
    assert.ok(per.every(p => Number(p.Cantidad) >= 1), 'todo registro debe traer Cantidad >= 1');
    assert.ok(per.length < sumaCantidad(per), 'la agregación debe reducir filas');
  });

  await R.test(`[${mes}] cuadre con KPIs: Σ rawRecords.Fallidas/Perdidas == lo del gráfico`, () => {
    const kF = raws.reduce((s, r) => s + (Number(r.Fallidas) || 0), 0);
    const kP = raws.reduce((s, r) => s + (Number(r.Perdidas) || 0), 0);
    assert.equal(sumaCantidad(filtEstado(per, 'Fallida')), kF, 'Fallidas: gráfico vs KPI');
    assert.equal(sumaCantidad(filtEstado(per, 'Perdida')), kP, 'Pérdidas: gráfico vs KPI');
  });

  await R.test(`[${mes}] todas las combinaciones Proyecto×Zona×Proceso×Día×Estado == SQL independiente y == KPIs`, () => {
    const dias = [...new Set(per.map(p => p.Fecha))].sort();
    const diasProbar = ['ALL', dias[0], dias[dias.length - 1], dias[Math.floor(dias.length / 2)].slice(8, 10), `${dias[0]},${dias[1] ?? dias[0]}`];
    let combos = 0;
    for (const proy of ['ALL', 'Sur', 'Norte-Centro'])
      for (const zona of ['ALL', 'Sur', 'Centro', 'Norte'])
        for (const proceso of ['ALL', 'GESTOR'])
          for (const fecha of diasProbar) {
            const F = { ...ALL, proy, zona, proceso, fecha, mes: [mes] };
            const lista = fecha === 'ALL' ? null : fecha.split(',');
            const filtradas = filtPerdidas(per, F);
            const rawF = filtRaw(raws, F);
            for (const estado of ESTADOS) {
              const esperado = sumBd(bdEstado(estado).filter(r =>
                (proy === 'ALL' || proyDe(r.zona) === proy) &&
                (zona === 'ALL' || zonaDe(r.zona) === zona) &&
                (proceso === 'ALL' || r.brigada === 'Gestor Integral Multi') &&
                (!lista || lista.includes(r.fecha) || lista.includes(r.fecha.slice(8, 10)))));
              const graf = sumaCantidad(filtEstado(filtradas, estado));
              const kpi = rawF.reduce((s, r) => s + (estado === 'TODAS' ? (Number(r.Fallidas) || 0) + (Number(r.Perdidas) || 0)
                : estado === 'Fallida' ? (Number(r.Fallidas) || 0) : (Number(r.Perdidas) || 0)), 0);
              const ctx = JSON.stringify({ proy, zona, proceso, fecha, estado });
              assert.equal(graf, esperado, `gráfico=${graf} SQL=${esperado} ${ctx}`);
              assert.equal(graf, kpi, `gráfico=${graf} KPI=${kpi} ${ctx}`);
              combos++;
            }
          }
    assert.equal(combos, 3 * 4 * 2 * 5 * 3);
  });

  await R.test(`[${mes}] top de causales del gráfico == top en SQL (por Estado × Todas/Sur/Norte-Centro/Gestor)`, async () => {
    const casos = [
      { F: { ...ALL, mes: [mes] }, where: '' },
      { F: { ...ALL, mes: [mes], proy: 'Sur' }, where: "AND UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%'" },
      { F: { ...ALL, mes: [mes], proy: 'Norte-Centro' }, where: "AND UPPER(COALESCE(mo.zona,'')) NOT LIKE '%SUR%'" },
      { F: { ...ALL, mes: [mes], proceso: 'GESTOR' }, where: "AND mo.brigada_homologada = 'Gestor Integral Multi'" },
    ];
    for (const estado of ESTADOS)
      for (const { F, where } of casos) {
        const filtradas = filtPerdidas(per, F);
        const g = buildCausales(filtradas, 'dia', [], {}, estado);
        const { rows } = await pool.query(
          `SELECT TRIM(regexp_replace(COALESCE(NULLIF(TRIM(mo.accion),''),'SIN ACCION'), '\\s+', ' ', 'g')) || ' / ' ||
                  TRIM(regexp_replace(COALESCE(NULLIF(TRIM(mo.subaccion_homologada),''),'SIN SUBACCION'), '\\s+', ' ', 'g')) AS k, COUNT(*)::int AS n
             FROM dbanalitica.historico_mo mo
            WHERE mo.fecha_cierre >= $1::date AND mo.fecha_cierre < ($1::date + interval '1 month')
              AND ${BASE_COND} AND ${wSql[estado]} ${where}
            GROUP BY 1 ORDER BY n DESC, k ASC LIMIT 6`, [mes + '-01']);
        assert.deepEqual(g.topCausales, rows.map(r => r.k), `top distinto: ${estado} ${JSON.stringify(F)}`);
        g.topCausales.forEach((k, i) => {
          const serie = g.series.find(s => s.label === k);
          assert.equal(serie.data.reduce((a, b) => a + b, 0), rows[i].n, `conteo de "${k}" (${estado})`);
        });
      }
  });

  await R.test(`[${mes}] los datos graficados suman lo filtrado en las 3 vistas × 3 estados`, () => {
    const horas = Array.from({ length: 17 }, (_, i) => String(7 + i).padStart(2, '0') + ':00');
    for (const proy of ['ALL', 'Sur', 'Norte-Centro']) {
      const filtradas = filtPerdidas(per, { ...ALL, proy, mes: [mes] });
      for (const vista of ['mes', 'dia', 'hora'])
        for (const estado of ESTADOS) {
          const g = buildCausales(filtradas, vista, vista === 'hora' ? horas : [], {}, estado);
          assert.equal(g.series.reduce((s, x) => s + x.data.reduce((a, b) => a + b, 0), 0), sumaCantidad(filtEstado(filtradas, estado)), `${vista}/${proy}/${estado}`);
        }
    }
  });

  await R.test(`[${mes}] calidad: Estado válido, causal informada, hora HH:00 entre 07 y 22, fecha dentro del mes`, () => {
    const malEstado = per.filter(p => !['Fallida', 'Perdida'].includes(p.Estado));
    assert.equal(malEstado.length, 0, `${malEstado.length} registros con Estado inválido`);
    const sinCausa = per.filter(p => !String(p.Accion || '').trim() || !String(p.Subaccion || '').trim());
    assert.equal(sinCausa.length, 0, `${sinCausa.length} registros sin acción/subacción (${sumaCantidad(sinCausa)} órdenes)`);
    const malHora = per.filter(p => !/^(0[7-9]|1\d|2[0-2]):00$/.test(String(p.Hora)));
    assert.equal(malHora.length, 0, `${malHora.length} horas fuera de 07:00-22:00 (ej. ${malHora[0]?.Hora})`);
    const fueraMes = per.filter(p => String(p.Fecha).slice(0, 7) !== mes);
    assert.equal(fueraMes.length, 0, `${fueraMes.length} fechas fuera de ${mes}`);
  });
}

await pool.end();
R.fin();
