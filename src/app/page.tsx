'use client';

import { useMemo } from 'react';
import { useDashboard } from './components/DashboardProvider';
import { filtRaw, filtCos, ventanaPrevia } from './components/utils/filters';
import { otcAgg, otcAggMes, mesAnterior } from './components/utils/aggregators';
import { fmtCOP, fmtPct, fmtN, deltaPct } from './components/utils/formatters';
import { calcHealth } from './components/utils/health';
import KpiCard from './components/KpiCard';
import HealthScore from './components/HealthScore';

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
    const efect = rawF.reduce((s, r) => s + num(r.Efectivas), 0);
    const fallidas = rawF.reduce((s, r) => s + num(r.Fallidas), 0);
    const perdidas = rawF.reduce((s, r) => s + num(r.Perdidas), 0);
    const cumpProd = metaEfec ? pSIP.efectivas / metaEfec : null;
    const eficiencia = pSIP.ordenes ? pSIP.efectivas / pSIP.ordenes : null;
    const brigadas = pSIP.tecnicos;

    // Alertas Operativas (traídas de la vista operativa)
    const dayCed: Record<string, Set<unknown>> = {};
    rawF.forEach(r => { const f = String(r.Fecha || ''); (dayCed[f] ??= new Set()).add(r.Cedula); });
    const dias = Object.keys(dayCed);
    const brigadasOper = dias.length ? Math.round(dias.reduce((s, f) => s + dayCed[f].size, 0) / dias.length) : 0;
    
    const disponibilidad = brigadas ? brigadasOper / brigadas : 0;
    const totOrd = efect + fallidas + perdidas || 1;
    const perdRate = perdidas / totOrd;

    const alertas: string[] = [];
    if (disponibilidad < 0.85) alertas.push(`Disponibilidad de brigadas en ${fmtPct(disponibilidad)}`);
    if (eficiencia !== null && eficiencia < 0.65) alertas.push(`Efectividad en ${fmtPct(eficiencia)}`);
    if (perdRate > 0.08) alertas.push(`Órdenes perdidas en ${fmtPct(perdRate)} del total`);
    const critico = disponibilidad < 0.75 || (eficiencia !== null && eficiencia < 0.55) || perdRate > 0.15;
    const nivelAlerta: 'ok' | 'amber' | 'red' = alertas.length === 0 ? 'ok' : critico ? 'red' : 'amber';

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
      return { efic: vi ? (ef / vi) * 100 : 0, cumpProd: me ? (ef / me) * 100 : 0, ingXbrig: nb ? ing / nb : 0, costXbrig: nb ? co / nb : 0, brig: nb };
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

    // Narrativa (ahora en términos de ingreso real + cumplimiento de producción)
    const periodoLabel = F.mes.length ? F.mes.join(', ') : 'periodo seleccionado';
    const narrativa = `En ${periodoLabel}, el proyecto registra un ingreso real de ${fmtCOP(ingresoReal)} con ${fmtN(brigadas)} brigadas activas y una eficiencia del ${eficiencia !== null ? fmtPct(eficiencia) : '—'}. El cumplimiento de producción (efectivas vs meta) es del ${cumpProd !== null ? fmtPct(cumpProd) : '—'}.`;

    return {
      health, narrativa,
      ingresoReal, eficiencia, brigadas, cumpProd, metaEfec, efectivas: pSIP.efectivas,
      ingXbrig, costoXbrig, ingElec,
      meses12, efMes, selWin, prevWin, winA, winB, winIncompleto, tipoRows,
      alertas, nivelAlerta
    };
  }, [raw, filters, mesList]);

  if (loading) return <div className="loading-wrap"><div className="spinner" /><span>Cargando datos…</span></div>;
  if (error) return <div className="status err">{error}</div>;
  if (!data) return null;

  const {
    health, narrativa, ingresoReal, eficiencia, brigadas, cumpProd, metaEfec, efectivas,
    ingElec, meses12, efMes, selWin, prevWin, winA, winB, winIncompleto, tipoRows,
    alertas, nivelAlerta
  } = data;

  // ---- Configs de gráficos (evolutivos) ----
  const line = (label: string, arr: number[], kind: 'pct' | 'cop') => ({
    type: 'line' as const,
    data: { labels: meses12, datasets: [{ label, data: arr, borderColor: kind === 'cop' ? CFG.otc : CFG.sip, backgroundColor: (kind === 'cop' ? CFG.otc : CFG.sip) + '22', fill: true, tension: 0.3 }] },
    options: { ...baseOpt, plugins: { ...baseOpt.plugins, legend: { display: false } }, scales: { y: { ticks: { callback: (v: unknown) => (kind === 'cop' ? fmtCOP(Number(v)) : Number(v).toFixed(1) + '%') } } } },
  });
  const eficCfg = line('Eficiencia %', efMes.map(x => x.efic), 'pct');
  const cumpProdCfg = line('Cumplimiento %', efMes.map(x => x.cumpProd), 'pct');
  const ingBrigCfg = line('Ingreso/brigada', efMes.map(x => x.ingXbrig), 'cop');
  const costBrigCfg = line('Costo/brigada', efMes.map(x => x.costXbrig), 'cop');
  const brigCfg = {
    type: 'bar' as const,
    data: { labels: meses12, datasets: [{ label: 'Brigadas', data: efMes.map(x => x.brig), backgroundColor: CFG.sip + 'AA' }] },
    options: { ...baseOpt, plugins: { ...baseOpt.plugins, legend: { display: false } } },
  };

  const winLabel = (arr: string[]) => (arr.length ? (arr.length === 1 ? arr[0] : `${arr[0]} … ${arr[arr.length - 1]}`) : '—');

  const cmp: { lbl: string; a: number; b: number; fmt: (v: number) => string }[] = [
    { lbl: 'Ingreso real', a: winA.ing, b: winB.ing, fmt: fmtCOP },
    { lbl: 'Efectivas', a: winA.ef, b: winB.ef, fmt: fmtN },
    { lbl: 'Eficiencia', a: (winA.efic ?? 0) * 100, b: (winB.efic ?? 0) * 100, fmt: (v) => v.toFixed(1) + '%' },
    { lbl: 'Brigadas', a: winA.brig, b: winB.brig, fmt: fmtN },
  ];

  return (
    <>
      {/* Health Score (se conserva) */}
      <HealthScore h={health} />

      {/* Narrativa (se conserva) */}
      <div className="section">
        <h2>📅 Resumen Ejecutivo</h2>
        <div className="sec-sub">Narrativa automática · se recalcula con los filtros</div>
        <div className="narrativa">
          <div className="titulo">Análisis del Periodo</div>
          <div className="cuerpo">{narrativa}</div>
        </div>
      </div>

      {/* Alertas Operativas consolidadas */}
      {alertas.length > 0 && (
        <div className="section" style={{ marginTop: 24 }}>
          <h2>⚠️ Alertas Operativas</h2>
          <div className="sec-sub">Focos de atención prioritaria detectados en la operación de hoy</div>
          <div style={{ background: nivelAlerta === 'red' ? '#ffebee' : '#fff3e0', borderLeft: `4px solid ${nivelAlerta === 'red' ? '#C62828' : '#F57C00'}`, padding: '16px 20px', borderRadius: '0 8px 8px 0', marginTop: 12 }}>
            <ul style={{ margin: 0, paddingLeft: 20, color: nivelAlerta === 'red' ? '#b71c1c' : '#e65100', fontWeight: 600 }}>
              {alertas.map((a, i) => <li key={i} style={{ marginBottom: 4 }}>{a}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* ===== KPIS MACRO ===== */}
      <div className="grid-2" style={{ alignItems: 'start', marginTop: 24 }}>
        
        <div>
          {/* KPIs del periodo */}
          <div className="section">
            <h2>🎯 Indicadores Clave del Periodo</h2>
            <div className="sec-sub">Ventana seleccionada: {winLabel(selWin)}</div>
            <div className="kpi-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <KpiCard cls="sip" lbl="Ingreso Real" val={fmtCOP(ingresoReal)} help="Ingreso real SIPREM. Pendiente de recálculo en la base." />
              <KpiCard cls="sip" lbl="Eficiencia" val={eficiencia !== null ? fmtPct(eficiencia) : '—'} help="Efectivas / Visitas." />
              <KpiCard cls="sip" lbl="Brigadas Activas" val={fmtN(brigadas)} help="Cédulas únicas con actividad en el periodo." />
              <KpiCard cls="sip" lbl="Cumplimiento Producción" val={cumpProd !== null ? fmtPct(cumpProd) : '—'} help="Efectivas / Meta (Asignacion)." />
            </div>
          </div>

          {/* Ingresos */}
          <div className="section">
            <h2>💵 Ingresos</h2>
            <div className="sec-sub">Sólo ingreso real (se eliminó el ingreso contable general)</div>
            <div className="kpi-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <KpiCard cls="sip" lbl="Ingreso Real" val={fmtCOP(ingresoReal)} help="Ingreso real SIPREM del periodo." />
              <KpiCard cls="otc" lbl="Ing. Eléctrica (real)" val={fmtCOP(ingElec)} help="Ingreso real de Ingeniería Eléctrica." />
            </div>
          </div>
        </div>

        <div>
          {/* Metas */}
          <div className="section">
            <h2>🎯 Metas de Producción</h2>
            <div className="sec-sub">Meta de efectivas (Asignacion) vs ejecución real</div>
            <div className="kpi-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <KpiCard cls="sip" lbl="Meta (efectivas)" val={fmtN(metaEfec)} help="Suma de Asignacion (meta de efectivas del periodo)." />
              <KpiCard cls="sip" lbl="Real (efectivas)" val={fmtN(efectivas)} help="Efectivas ejecutadas." />
              <KpiCard cls="sip" lbl="% Cumplimiento" val={cumpProd !== null ? fmtPct(cumpProd) : '—'} help="Real / Meta." />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}