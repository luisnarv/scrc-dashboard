'use client';

import { useMemo } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { filtRaw, filtCos, ventanaPrevia } from '../components/utils/filters';
import { otcAgg, otcAggMes, mesAnterior } from '../components/utils/aggregators';
import { fmtCOP, fmtPct, fmtN, deltaPct } from '../components/utils/formatters';
import { calcHealth } from '../components/utils/health';
import ChartCard from '../components/ChartCard';

const CFG = { ok: '#2E7D32', warn: '#F57C00', err: '#C62828', otc: '#3949AB', sip: '#00897B', neu: '#5d6785' };

const baseOpt = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { font: { size: 10 }, boxWidth: 10 } } },
};

export default function ResumenPage() {
  const { raw, filters, mesList, loading, error } = useDashboard();

  const data = useMemo(() => {
    if (!raw) return null;
    const F = filters;
    const num = (v: unknown) => Number(v) || 0;
    const rawF = filtRaw(raw.raw, F);
    const cosF = filtCos(raw.costos, F);
    const mActual = F.mes.length ? [...F.mes].sort().at(-1)! : mesList[mesList.length - 1];
    const mAnt = mesAnterior(mActual, mesList);

    const filtBase = (r: { _Proyecto?: string; _Zona?: string; _ZonaDet?: string }) =>
      (F.proy === 'ALL' || r._Proyecto === F.proy) &&
      (F.zona === 'ALL' || r._Zona === F.zona || r._ZonaDet === F.zona);

    // ---- OTC (para Health) ----
    const pOTC = otcAgg(cosF);
    const cosAnt = raw.costos.filter(r => r.Mes === mAnt && (F.proy === 'ALL' || r._Proyecto === F.proy) && (F.zona === 'ALL' || r._Zona === F.zona));
    const pOTCant = otcAgg(cosAnt);

    // ---- SIPREM periodo ----
    const pSIP = {
      prod: rawF.reduce((s, r) => s + num(r.Ingresos), 0),
      ordenes: rawF.reduce((s, r) => s + num(r.Visitas), 0),
      efectivas: rawF.reduce((s, r) => s + num(r.Efectivas), 0),
      tecnicos: new Set(rawF.map(r => r.Cedula)).size,
    };
    const rawAnt = raw.raw.filter(r => String(r.Fecha || '').startsWith(mAnt || '##') && filtBase(r));
    const pSIPant = { prod: rawAnt.reduce((s, r) => s + num(r.Ingresos), 0), ordenes: rawAnt.reduce((s, r) => s + num(r.Visitas), 0) };

    // Meta en pesos (= costo; sólo para no alterar el Health existente)
    const metaPesos = rawF.reduce((s, r) => s + num(r.Meta_Facturacion), 0);
    const cump = metaPesos ? pSIP.prod / metaPesos : null;

    // ---- Series 12m (Health) ----
    const meses12 = mesList.slice(-12);
    const seriesOTC = meses12.map(m => otcAggMes(raw.costos.filter(filtBase), m));
    const prodMes = meses12.map(m => {
      const rr = raw.raw.filter(x => String(x.Fecha || '').startsWith(m) && filtBase(x));
      const p = rr.reduce((s, x) => s + num(x.Ingresos), 0);
      const mt = rr.reduce((s, x) => s + num(x.Meta_Facturacion), 0);
      return { prod: p, cump: mt ? (p / mt) * 100 : 0 };
    });
    const provs: Record<string, number> = {};
    cosF.forEach(r => { const t = String(r.Tercero || r.Proveedor || ''); if (t && /^(PS|PB|PI|CN)\d/.test(t)) provs[t] = (provs[t] || 0) + num(r.Valor); });
    const totCos = pOTC.costos || 1;
    const topProvPct = Object.values(provs).length ? Math.max(...Object.values(provs)) / totCos : 0;

    let rojas = 0;
    if (pOTC.margen !== null && pOTC.margen < 0.15) rojas++;
    if (pOTC.utilidad < 0) rojas++;
    const dPr = deltaPct(pSIP.prod, pSIPant.prod);
    if (dPr !== null && dPr < -0.05) rojas++;

    const health = calcHealth(
      pOTC,
      { prod: pSIP.prod, ordenes: pSIP.ordenes, tecnicos: pSIP.tecnicos },
      cump, rojas, topProvPct,
      seriesOTC.map(s => s.utilidad), seriesOTC.map(s => s.margen ?? 0),
      prodMes.map(x => x.prod), prodMes.map(x => x.cump), pSIPant
    );

    // ===================== NUEVO =====================

    // Producción / eficiencia del periodo
    const metaEfec = rawF.reduce((s, r) => s + num(r.Asignacion), 0);
    const cumpProd = metaEfec ? pSIP.efectivas / metaEfec : null;
    const eficiencia = pSIP.ordenes ? pSIP.efectivas / pSIP.ordenes : null;
    const brigadas = pSIP.tecnicos;

    // NOTA: "ingreso real" es un cálculo que se ajustará en la base (ETL).
    // Punto único de definición para poder cambiarlo en un solo lugar:
    const ingresoReal = pSIP.prod; // TODO(base): reemplazar por el ingreso real recalculado
    const costoPeriodo = rawF.reduce((s, r) => s + num(r.Costo_Operativo), 0);
    const ingXbrig = brigadas ? ingresoReal / brigadas : 0;
    const costoXbrig = brigadas ? costoPeriodo / brigadas : 0;

    // Ing. Eléctrica (OTC): ingreso registrado. Contable N/D sin WIP.
    const ingElec = cosF
      .filter(r => String(r.Categoria || '').toUpperCase().includes('INGRESOS POR INGENIERIA ELECTRICA'))
      .reduce((s, r) => s + num(r.Valor), 0);

    // Evolutivos 12m
    const efMes = meses12.map(m => {
      const rr = raw.raw.filter(x => String(x.Fecha || '').startsWith(m) && filtBase(x));
      const ef = rr.reduce((s, x) => s + num(x.Efectivas), 0);
      const vi = rr.reduce((s, x) => s + num(x.Visitas), 0);
      const ing = rr.reduce((s, x) => s + num(x.Ingresos), 0);
      const co = rr.reduce((s, x) => s + num(x.Costo_Operativo), 0);
      const me = rr.reduce((s, x) => s + num(x.Asignacion), 0);
      const nb = new Set(rr.map(x => x.Cedula)).size;
      return { 
        mes: m, ef, vi, ing, co, me, brig: nb,
        efic: vi ? (ef / vi) * 100 : 0, 
        cumpProd: me ? (ef / me) * 100 : 0, 
        ingXbrig: nb ? ing / nb : 0, 
        costXbrig: nb ? co / nb : 0 
      };
    });

    const efMesPorTipo = meses12.flatMap(m => {
      const rr = raw.raw.filter(x => String(x.Fecha || '').startsWith(m) && filtBase(x));
      const tmap: Record<string, { ef: number; vi: number; ing: number; co: number; me: number; b: Set<unknown>; tecs: Record<string, { nombre: string; ef: number; vi: number; ing: number; co: number; me: number; }> }> = {};
      rr.forEach(r => {
        const t = String(r.Tipo_Cuadrilla || r.Tipo_Brigada_Operaciones || r['Tipo de cuadrilla '] || 'Sin tipo').trim();
        if (!tmap[t]) tmap[t] = { ef:0, vi:0, ing:0, co:0, me:0, b: new Set(), tecs: {} };
        const ced = String(r.Cedula || '');
        if (!tmap[t].tecs[ced]) tmap[t].tecs[ced] = { nombre: String(r.Nombre || r.Cedula || ''), ef:0, vi:0, ing:0, co:0, me:0 };
        
        const e = num(r.Efectivas), v = num(r.Visitas), i = num(r.Ingresos), c = num(r.Costo_Operativo), a = num(r.Asignacion);
        tmap[t].ef += e; tmap[t].vi += v; tmap[t].ing += i; tmap[t].co += c; tmap[t].me += a;
        tmap[t].b.add(ced);
        
        const tec = tmap[t].tecs[ced];
        tec.ef += e; tec.vi += v; tec.ing += i; tec.co += c; tec.me += a;
      });
      return Object.entries(tmap).map(([tipo, v]) => {
        const nb = v.b.size;
        return {
          mes: m, tipo,
          ef: v.ef, vi: v.vi, ing: v.ing, co: v.co, me: v.me, brig: nb,
          efic: v.vi ? (v.ef / v.vi) * 100 : 0,
          cumpProd: v.me ? (v.ef / v.me) * 100 : 0,
          ingXbrig: nb ? v.ing / nb : 0,
          costXbrig: nb ? v.co / nb : 0,
          tecnicos: Object.values(v.tecs).sort((a, b) => b.ing - a.ing)
        };
      }).sort((a, b) => b.ing - a.ing);
    });

    // Acumulado dinámico: ventana seleccionada vs previa equivalente
    const selWin = F.mes.length ? [...F.mes].sort() : [meses12[meses12.length - 1]].filter(Boolean) as string[];
    const prevWin = ventanaPrevia(selWin, mesList);
    const aggWin = (arr: string[]) => {
      const set = new Set(arr);
      const rr = raw.raw.filter(x => set.has(String(x.Fecha || '').slice(0, 7)) && filtBase(x));
      const ef = rr.reduce((s, x) => s + num(x.Efectivas), 0);
      const vi = rr.reduce((s, x) => s + num(x.Visitas), 0);
      const ing = rr.reduce((s, x) => s + num(x.Ingresos), 0);
      return { ing, ef, vi, efic: vi ? ef / vi : null, brig: new Set(rr.map(x => x.Cedula)).size };
    };
    const winA = aggWin(selWin);
    const winB = aggWin(prevWin);
    const winIncompleto = prevWin.length < selWin.length;

    // Productividad por tipo de brigada
    const tmap: Record<string, { b: Set<unknown>; ing: number; co: number; ef: number }> = {};
    rawF.forEach(r => {
      const t = String(r.Tipo_Brigada_Operaciones || 'Sin tipo');
      if (!tmap[t]) tmap[t] = { b: new Set(), ing: 0, co: 0, ef: 0 };
      tmap[t].b.add(r.Cedula);
      tmap[t].ing += num(r.Ingresos);
      tmap[t].co += num(r.Costo_Operativo);
      tmap[t].ef += num(r.Efectivas);
    });
    const tipoRows = Object.entries(tmap)
      .map(([tipo, v]) => { const nb = v.b.size; return { tipo, brigadas: nb, ingreso: v.ing, ingXbrig: nb ? v.ing / nb : 0, costXbrig: nb ? v.co / nb : 0 }; })
      .sort((a, b) => b.ingreso - a.ingreso);

    // Narrativa (ahora en términos de producción valorizada + cumplimiento de producción)
    const periodoLabel = F.mes.length ? F.mes.join(', ') : 'periodo seleccionado';
    const narrativa = `En ${periodoLabel}, el proyecto registra una producción valorizada de ${fmtCOP(ingresoReal)} con ${fmtN(brigadas)} brigadas activas y una eficiencia del ${eficiencia !== null ? fmtPct(eficiencia) : '-'}. El cumplimiento de producción (efectivas vs meta) es del ${cumpProd !== null ? fmtPct(cumpProd) : '-'}.`;

    return {
      health, narrativa,
      ingresoReal, eficiencia, brigadas, cumpProd, metaEfec, efectivas: pSIP.efectivas,
      ingXbrig, costoXbrig, ingElec,
      meses12, efMes, efMesPorTipo, selWin, prevWin, winA, winB, winIncompleto, tipoRows,
    };
  }, [raw, filters, mesList]);

  if (loading) return <div className="loading-wrap"><div className="spinner" /><span>Cargando datos…</span></div>;
  if (error) return <div className="status err">{error}</div>;
  if (!data) return null;

  const {
    health, narrativa, ingresoReal, eficiencia, brigadas, cumpProd, metaEfec, efectivas,
    ingElec, meses12, efMes, efMesPorTipo, selWin, prevWin, winA, winB, winIncompleto, tipoRows,
  } = data;

  // ---- Configs de gráficos (evolutivos) ----
  const line = (label: string, arr: number[], kind: 'pct' | 'cop') => ({
    type: 'line' as const,
    data: { labels: meses12, datasets: [{ label, data: arr, borderColor: kind === 'cop' ? CFG.otc : CFG.sip, backgroundColor: (kind === 'cop' ? CFG.otc : CFG.sip) + '22', fill: true, tension: 0.3 }] },
    options: { ...baseOpt, plugins: { ...baseOpt.plugins, legend: { display: false } }, scales: { y: { ticks: { callback: (v: unknown) => (kind === 'cop' ? fmtCOP(Number(v)) : Number(v).toFixed(1) + '%') } } } },
  });
  const eficCfg = line('Eficiencia %', efMes.map(x => x.efic), 'pct');
  const cumpProdCfg = line('Cumplimiento %', efMes.map(x => x.cumpProd), 'pct');
  const ingBrigCfg = line('Prod. Valorizada/brigada', efMes.map(x => x.ingXbrig), 'cop');
  const costBrigCfg = line('Costo/brigada', efMes.map(x => x.costXbrig), 'cop');
  const brigCfg = {
    type: 'bar' as const,
    data: { labels: meses12, datasets: [{ label: 'Brigadas', data: efMes.map(x => x.brig), backgroundColor: CFG.sip + 'AA' }] },
    options: { ...baseOpt, plugins: { ...baseOpt.plugins, legend: { display: false } } },
  };

  const buildModalConfig = (metric: 'efic' | 'cumpProd' | 'ingXbrig' | 'costXbrig', kind: 'pct' | 'cop') => {
    const tipos = Array.from(new Set(efMesPorTipo.map(x => x.tipo)));
    const colors = ['#3949AB', '#00796b', '#F57C00', '#C62828', '#8E24AA', '#039BE5', '#43A047', '#E53935'];
    const datasets = tipos.map((tipo, idx) => {
      const arr = meses12.map(m => {
        const v = efMesPorTipo.find(x => x.mes === m && x.tipo === tipo);
        return v ? Number(v[metric] || 0) : 0;
      });
      const c = colors[idx % colors.length];
      return {
        label: tipo,
        data: arr,
        borderColor: c,
        backgroundColor: c + '22',
        fill: false,
        tension: 0.3
      };
    });
    return {
      type: 'line' as const,
      data: { labels: meses12, datasets },
      options: { 
        ...baseOpt, 
        plugins: { ...baseOpt.plugins, legend: { display: true } }, 
        scales: { y: { ticks: { callback: (v: unknown) => (kind === 'cop' ? fmtCOP(Number(v)) : Number(v).toFixed(1) + '%') } } } 
      },
    };
  };

  const eficModalCfg = buildModalConfig('efic', 'pct');
  const cumpProdModalCfg = buildModalConfig('cumpProd', 'pct');
  const ingBrigModalCfg = buildModalConfig('ingXbrig', 'cop');
  const costBrigModalCfg = buildModalConfig('costXbrig', 'cop');

  const winLabel = (arr: string[]) => (arr.length ? (arr.length === 1 ? arr[0] : `${arr[0]} … ${arr[arr.length - 1]}`) : '—');

  const cmp: { lbl: string; a: number; b: number; fmt: (v: number) => string }[] = [
    { lbl: 'Producción Valorizada', a: winA.ing, b: winB.ing, fmt: fmtCOP },
    { lbl: 'Efectivas', a: winA.ef, b: winB.ef, fmt: fmtN },
    { lbl: 'Eficiencia', a: (winA.efic ?? 0) * 100, b: (winB.efic ?? 0) * 100, fmt: (v) => v.toFixed(1) + '%' },
    { lbl: 'Brigadas', a: winA.brig, b: winB.brig, fmt: fmtN },
  ];

  const eficTable = {
    columns: ['Mes', 'Tipo de Brigada / Técnico', 'Efectivas', 'Visitas', 'Eficiencia'],
    categoryIndex: 1,
    rows: [],
    hierarchicalRows: efMesPorTipo.map(x => ({
      row: [x.mes, x.tipo, fmtN(x.ef), fmtN(x.vi), x.efic.toFixed(1) + '%'],
      children: x.tecnicos.map(t => ({
        row: [x.mes, t.nombre, fmtN(t.ef), fmtN(t.vi), (t.vi ? (t.ef / t.vi) * 100 : 0).toFixed(1) + '%']
      }))
    }))
  };
  
  const cumpTable = {
    columns: ['Mes', 'Tipo de Brigada / Técnico', 'Efectivas', 'Meta (Asignación)', 'Cumplimiento'],
    categoryIndex: 1,
    rows: [],
    hierarchicalRows: efMesPorTipo.map(x => ({
      row: [x.mes, x.tipo, fmtN(x.ef), fmtN(x.me), x.cumpProd.toFixed(1) + '%'],
      children: x.tecnicos.map(t => ({
        row: [x.mes, t.nombre, fmtN(t.ef), fmtN(t.me), (t.me ? (t.ef / t.me) * 100 : 0).toFixed(1) + '%']
      }))
    }))
  };

  const ingBrigTable = {
    columns: ['Mes', 'Tipo de Brigada / Técnico', 'Prod. Valorizada', 'Brigadas (Días)', 'Prod. Val. Promedio'],
    categoryIndex: 1,
    rows: [],
    hierarchicalRows: efMesPorTipo.map(x => ({
      row: [x.mes, x.tipo, fmtCOP(x.ing), fmtN(x.brig), fmtCOP(x.ingXbrig)],
      children: x.tecnicos.map(t => ({
        row: [x.mes, t.nombre, fmtCOP(t.ing), 1, fmtCOP(t.ing)] // Para un técnico, el promedio es su ingreso
      }))
    }))
  };

  const costBrigTable = {
    columns: ['Mes', 'Tipo de Brigada / Técnico', 'Costo Operativo', 'Brigadas (Días)', 'Costo Promedio'],
    categoryIndex: 1,
    rows: [],
    hierarchicalRows: efMesPorTipo.map(x => ({
      row: [x.mes, x.tipo, fmtCOP(x.co), fmtN(x.brig), fmtCOP(x.costXbrig)],
      children: x.tecnicos.map(t => ({
        row: [x.mes, t.nombre, fmtCOP(t.co), 1, fmtCOP(t.co)]
      }))
    }))
  };

  return (
    <>
      <div className="section" style={{ marginBottom: 24 }}>
        <h2>📈 Estratégico · Evolutivos y Comparativos</h2>
        <div className="sec-sub">Tendencias de los últimos 12 meses y comparativos acumulados</div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* ---------- IZQUIERDA: Evolutivos ---------- */}
        <div>
          <div className="section">
            <h2>Evolutivos <span className="tag-sip">SIPREM / OTC</span></h2>
            <div style={{ display: 'grid', gap: 10 }}>
              <ChartCard id="r-efic" title="Evolutivo de Eficiencia %" config={eficCfg as never} modalConfig={eficModalCfg as never} height="short" hasDetail detailTableData={eficTable} />
              <ChartCard id="r-cumpprod" title="Evolutivo de Productividad (Cumplimiento %)" subtitle="Efectivas vs meta (Asignacion)" config={cumpProdCfg as never} modalConfig={cumpProdModalCfg as never} height="short" hasDetail detailTableData={cumpTable} />
              <ChartCard id="r-ingbrig" title="Prod. Valorizada promedio por brigada" config={ingBrigCfg as never} modalConfig={ingBrigModalCfg as never} height="short" hasDetail detailTableData={ingBrigTable} />
              <ChartCard id="r-costbrig" title="Costo por brigada" config={costBrigCfg as never} modalConfig={costBrigModalCfg as never} height="short" hasDetail detailTableData={costBrigTable} />
            </div>
          </div>
        </div>

        {/* ---------- DERECHA: Comparativos ---------- */}
        <div>
          <div className="section">
            <h2>⚖️ Comparativo Acumulado</h2>
            <div className="sec-sub">{winLabel(selWin)} vs {winLabel(prevWin)} (ventana previa equivalente)</div>
            {winIncompleto && (
              <div className="status err" style={{ marginBottom: 8 }}>
                ⚠️ La ventana previa tiene menos meses que la actual (falta historia). El comparativo puede estar incompleto.
              </div>
            )}
            <div className="kpi-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {cmp.map(c => {
                const d = deltaPct(c.a, c.b);
                const up = d !== null && d >= 0;
                return (
                  <div key={c.lbl} className="kpi sip">
                    <div className="lbl">{c.lbl}</div>
                    <div className="val">{c.fmt(c.a)}</div>
                    {d !== null
                      ? <div className={`delta ${Math.abs(d) < 0.001 ? 'neu' : up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {(d * 100).toFixed(1)}% vs ventana previa</div>
                      : <div className="delta neu">sin comparativo</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}