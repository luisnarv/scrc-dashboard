'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { filtRaw, filtCos } from '../components/utils/filters';
import { otcAgg, otcAggMes, mesAnterior } from '../components/utils/aggregators';
import { fmtCOP, fmtPct, fmtN, deltaPct } from '../components/utils/formatters';
import { calcHealth } from '../components/utils/health';
import KpiCard from '../components/KpiCard';
import ChartCard from '../components/ChartCard';
import HealthScore from '../components/HealthScore';
import Alerta from '../components/Alerta';

const CFG = { ok: '#2E7D32', warn: '#F57C00', err: '#C62828', otc: '#3949AB', sip: '#00897B', neu: '#5d6785' };

const baseOpt = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { font: { size: 10 }, boxWidth: 10 } } },
};

export default function ResumenPage() {
  const { raw, filters, mesList, loading, error } = useDashboard();
  const [_tab] = useState('resumen');

  const data = useMemo(() => {
    if (!raw) return null;
    const rawF = filtRaw(raw.raw, filters);
    const cosF = filtCos(raw.costos, filters);
    const mActual = filters.mes.length ? [...filters.mes].sort().at(-1)! : mesList[mesList.length - 1];
    const mAnt = mesAnterior(mActual, mesList);

    const pOTC = otcAgg(cosF);
    const cosAnt = raw.costos.filter(r =>
      r.Mes === mAnt &&
      (filters.proy === 'ALL' || r._Proyecto === filters.proy) &&
      (filters.zona === 'ALL' || r._Zona === filters.zona)
    );
    const pOTCant = otcAgg(cosAnt);

    const pSIP = {
      prod: rawF.reduce((s, r) => s + (Number(r.Ingresos) || 0), 0),
      ordenes: rawF.reduce((s, r) => s + (Number(r.Visitas) || 0), 0),
      efectivas: rawF.reduce((s, r) => s + (Number(r.Efectivas) || 0), 0),
      tecnicos: new Set(rawF.map(r => r.Cedula)).size,
    };
    const rawAnt = raw.raw.filter(r =>
      String(r.Fecha || '').startsWith(mAnt || '##') &&
      (filters.proy === 'ALL' || r._Proyecto === filters.proy) &&
      (filters.zona === 'ALL' || r._Zona === filters.zona)
    );
    const pSIPant = {
      prod: rawAnt.reduce((s, r) => s + (Number(r.Ingresos) || 0), 0),
      ordenes: rawAnt.reduce((s, r) => s + (Number(r.Visitas) || 0), 0),
    };
    const meta = rawF.reduce((s, r) => s + (Number(r.Meta_Facturacion) || 0), 0);
    const cump = meta ? pSIP.prod / meta : null;

    // 12 month series
    const meses12 = mesList.slice(-12);
    const filtBase = (r: { _Proyecto?: string; _Zona?: string; _ZonaDet?: string }) =>
      (filters.proy === 'ALL' || r._Proyecto === filters.proy) &&
      (filters.zona === 'ALL' || r._Zona === filters.zona || r._ZonaDet === filters.zona);
    const seriesOTC = meses12.map(m => otcAggMes(raw.costos.filter(filtBase), m));
    const prodMes = meses12.map(m => {
      const rr = raw.raw.filter(x => String(x.Fecha || '').startsWith(m) && filtBase(x));
      const p = rr.reduce((s, x) => s + (Number(x.Ingresos) || 0), 0);
      const mt = rr.reduce((s, x) => s + (Number(x.Meta_Facturacion) || 0), 0);
      return { prod: p, cump: mt ? p / mt * 100 : 0 };
    });
    const ordMes = meses12.map(m => {
      const rr = raw.raw.filter(x => String(x.Fecha || '').startsWith(m) && filtBase(x));
      return {
        ef: rr.reduce((s, x) => s + (Number(x.Efectivas) || 0), 0),
        fa: rr.reduce((s, x) => s + (Number(x.Fallidas) || 0), 0),
        pe: rr.reduce((s, x) => s + (Number(x.Perdidas) || 0), 0),
      };
    });

    // Zonas
    const zonas = [...new Set(cosF.map(r => r.Zona))].filter((z): z is string => !!z);
    const zData = zonas.map(z => otcAgg(cosF.filter(r => r.Zona === z)));

    // Health
    const meses12Util = seriesOTC.map(s => s.utilidad);
    const meses12Marg = seriesOTC.map(s => s.margen ?? 0);
    const meses12Prod = prodMes.map(x => x.prod);
    const meses12Cump = prodMes.map(x => x.cump);
    const provs: Record<string, number> = {};
    cosF.forEach(r => {
      const t = String(r.Tercero || r.Proveedor || '');
      if (t && /^(PS|PB|PI|CN)\d/.test(t)) provs[t] = (provs[t] || 0) + (Number(r.Valor) || 0);
    });
    const totCos = pOTC.costos || 1;
    const topProvPct = Object.values(provs).length ? Math.max(...Object.values(provs)) / totCos : 0;

    // Alertas
    const alertas: { c: 'rojo' | 'amarillo' | 'verde'; i: string; t: string }[] = [];
    if (pOTC.margen !== null && pOTC.margen < 0.15) alertas.push({ c: 'rojo', i: '🔴', t: `Margen ${fmtPct(pOTC.margen)} por debajo del objetivo (15%)` });
    if (pOTC.utilidad < 0) alertas.push({ c: 'rojo', i: '🔴', t: 'Utilidad negativa en el periodo' });
    const dPr = deltaPct(pSIP.prod, pSIPant.prod);
    if (dPr !== null && dPr < -0.05) alertas.push({ c: 'rojo', i: '🔴', t: `Producción cae ${(Math.abs(dPr) * 100).toFixed(1)}% vs mes anterior` });
    if (pOTC.costos > pOTC.ingresos * 0.85) alertas.push({ c: 'amarillo', i: '🟡', t: 'Costos superan el 85% de los ingresos' });
    const dCos = deltaPct(pOTC.costos, pOTCant.costos);
    if (dCos !== null && dCos > 0.1) alertas.push({ c: 'amarillo', i: '🟡', t: `Costos crecen ${(dCos * 100).toFixed(1)}% vs mes anterior` });
    if (cump !== null && cump < 0.85) alertas.push({ c: 'amarillo', i: '🟡', t: `Cumplimiento SIPREM: ${fmtPct(cump)}` });
    if (!alertas.length) alertas.push({ c: 'verde', i: '✅', t: 'Sin alertas críticas en el periodo' });

    const health = calcHealth(
      pOTC,
      { prod: pSIP.prod, ordenes: pSIP.ordenes, tecnicos: pSIP.tecnicos },
      cump,
      alertas.filter(a => a.c === 'rojo').length,
      topProvPct,
      meses12Util,
      meses12Marg,
      meses12Prod,
      meses12Cump,
      pSIPant
    );

    // Narrativa
    const periodoLabel = filters.mes.length ? filters.mes.join(', ') : 'periodo seleccionado';
    const narrativa = `En ${periodoLabel}, el proyecto registra ingresos de ${fmtCOP(pOTC.ingresos)}, costos de ${fmtCOP(pOTC.costos)} y utilidad de ${fmtCOP(pOTC.utilidad)} (margen ${fmtPct(pOTC.margen)}). La producción valorizada SIPREM alcanzó ${fmtCOP(pSIP.prod)}${cump !== null ? ` con un cumplimiento del ${fmtPct(cump)}` : ''} y ${fmtN(pSIP.tecnicos)} técnicos activos.`;

    // Drivers
    const drivers: { tipo: 'pos' | 'neg' | 'info'; label: string; text: string; indent?: boolean }[] = [];
    const dUt = deltaPct(pOTC.utilidad, pOTCant.utilidad);
    if (dUt !== null && Math.abs(dUt) >= 0.05) {
      const signo = dUt >= 0 ? 'aumentó' : 'disminuyó';
      drivers.push({ tipo: dUt >= 0 ? 'pos' : 'neg', label: 'Utilidad', text: `La utilidad ${signo} ${(Math.abs(dUt) * 100).toFixed(1)}% vs ${mAnt}.` });
    } else if (dUt !== null) {
      drivers.push({ tipo: 'info', label: 'Estable', text: `La utilidad se mantiene estable vs mes anterior (Δ ${(dUt * 100).toFixed(1)}%).` });
    }
    if (dPr !== null && Math.abs(dPr) >= 0.05) {
      drivers.push({ tipo: dPr >= 0 ? 'pos' : 'neg', label: 'SIPREM', text: `Producción Valorizada ${dPr >= 0 ? 'creció' : 'cayó'} ${(Math.abs(dPr) * 100).toFixed(1)}% vs ${mAnt}.` });
    }
    const totalUt = zData.reduce((s, x) => s + x.utilidad, 0);
    if (totalUt > 0) {
      const top = zData.map((x, i) => ({ z: zonas[i], u: x.utilidad })).sort((a, b) => b.u - a.u)[0];
      if (top && top.u > 0) drivers.push({ tipo: 'info', label: 'Concentración', text: `El proyecto ${top.z} concentra el ${(top.u / totalUt * 100).toFixed(0)}% de la utilidad.` });
    }

    return { pOTC, pOTCant, pSIP, pSIPant, meta, cump, meses12, seriesOTC, prodMes, ordMes, zonas, zData, alertas, health, narrativa, drivers, dPr, mAnt };
  }, [raw, filters, mesList]);

  if (loading) return <div className="loading-wrap"><div className="spinner" /><span>Cargando datos…</span></div>;
  if (error) return <div className="status err">{error}</div>;
  if (!data || !raw) return null;

  const { pOTC, pOTCant, pSIP, pSIPant, meta, cump, meses12, seriesOTC, prodMes, ordMes, zonas, zData, alertas, health, narrativa, drivers } = data;

  // Chart configs
  const ingCosUtiCfg = {
    type: 'bar' as const,
    data: {
      labels: meses12,
      datasets: [
        { type: 'line' as const, label: 'Ingresos', data: seriesOTC.map(s => s.ingresos), borderColor: CFG.otc, backgroundColor: CFG.otc, tension: 0.3, yAxisID: 'y' },
        { type: 'bar' as const, label: 'Costos', data: seriesOTC.map(s => s.costos), backgroundColor: CFG.err + '99' },
        { type: 'line' as const, label: 'Utilidad', data: seriesOTC.map(s => s.utilidad), borderColor: CFG.ok, backgroundColor: CFG.ok, tension: 0.3 },
      ],
    },
    options: { ...baseOpt, scales: { y: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } } } },
  };

  const margenCfg = {
    type: 'line' as const,
    data: {
      labels: meses12,
      datasets: [{ label: 'Margen %', data: seriesOTC.map(s => s.margen ? s.margen * 100 : 0), borderColor: CFG.otc, backgroundColor: CFG.otc + '22', fill: true, tension: 0.3 }],
    },
    options: { ...baseOpt, scales: { y: { ticks: { callback: (v: unknown) => Number(v).toFixed(1) + '%' } } } },
  };

  const prodCumpCfg = {
    type: 'bar' as const,
    data: {
      labels: meses12,
      datasets: [
        { type: 'bar' as const, label: 'Producción Valorizada', data: prodMes.map(x => x.prod), backgroundColor: CFG.sip + 'AA', yAxisID: 'y' },
        { type: 'line' as const, label: 'Cumplimiento %', data: prodMes.map(x => x.cump), borderColor: CFG.warn, tension: 0.3, yAxisID: 'y1' },
      ],
    },
    options: { ...baseOpt, scales: { y: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } }, y1: { position: 'right' as const, ticks: { callback: (v: unknown) => Number(v).toFixed(0) + '%' }, grid: { display: false } } } },
  };

  const ordCfg = {
    type: 'bar' as const,
    data: {
      labels: meses12,
      datasets: [
        { label: 'Efectivas', data: ordMes.map(x => x.ef), backgroundColor: CFG.ok + 'CC' },
        { label: 'Fallidas', data: ordMes.map(x => x.fa), backgroundColor: CFG.warn + 'CC' },
        { label: 'Perdidas', data: ordMes.map(x => x.pe), backgroundColor: CFG.err + 'CC' },
      ],
    },
    options: { ...baseOpt, scales: { x: { stacked: true }, y: { stacked: true } } },
  };

  const zonaUtlCfg = {
    type: 'bar' as const,
    data: {
      labels: zonas,
      datasets: [
        { label: 'Utilidad', data: zData.map(x => x.utilidad), backgroundColor: CFG.otc + 'CC', yAxisID: 'y' },
        { type: 'line' as const, label: 'Margen %', data: zData.map(x => x.margen ? x.margen * 100 : 0), borderColor: CFG.warn, backgroundColor: CFG.warn, yAxisID: 'y1', tension: 0.3 },
      ],
    },
    options: { ...baseOpt, scales: { y: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } }, y1: { position: 'right' as const, ticks: { callback: (v: unknown) => Number(v).toFixed(0) + '%' }, grid: { display: false } } } },
  };

  const realMetaCfg = {
    type: 'bar' as const,
    data: {
      labels: ['Ingresos', 'Costos', 'Utilidad', 'Producción SIP'],
      datasets: [
        { label: 'Real', data: [pOTC.ingresos, pOTC.costos, pOTC.utilidad, pSIP.prod], backgroundColor: CFG.otc + 'CC' },
        { label: 'Meta', data: [pOTC.ingresos * 1.1, pOTC.costos * 0.95, pOTC.ingresos * 0.15, meta], backgroundColor: CFG.neu + '66' },
      ],
    },
    options: { ...baseOpt, indexAxis: 'y' as const, scales: { x: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } } } },
  };

  return (
    <>
      {/* Health Score */}
      <HealthScore h={health} />

      {/* Narrativa */}
      <div className="section">
        <h2>📅 Resumen Ejecutivo</h2>
        <div className="sec-sub">Narrativa automática · se recalcula con los filtros</div>
        <div className="narrativa">
          <div className="titulo">Análisis del Periodo</div>
          <div className="cuerpo">{narrativa}</div>
        </div>
      </div>

      {/* KPIs */}
      <div className="section">
        <h2>🎯 Indicadores Clave <span className="tag-sip">SIPREM</span> <span className="tag-otc">OTC</span></h2>
        <div className="sec-sub">Estado del proyecto en 8 métricas · Δ vs mes anterior</div>
        <div className="kpi-grid">
          <KpiCard cls="otc" lbl="Ingresos Reales" val={fmtCOP(pOTC.ingresos)} delta={deltaPct(pOTC.ingresos, pOTCant.ingresos)} help="Ingresos contables OTC del periodo." />
          <KpiCard cls="otc" lbl="Costos Reales" val={fmtCOP(pOTC.costos)} delta={deltaPct(pOTC.costos, pOTCant.costos)} help="Σ Costos Directos + Otros Costos (OTC)." />
          <KpiCard cls="otc" lbl="Utilidad" val={fmtCOP(pOTC.utilidad)} delta={deltaPct(pOTC.utilidad, pOTCant.utilidad)} help="Ingresos − Costos." />
          <KpiCard cls="otc" lbl="Margen %" val={fmtPct(pOTC.margen)} delta={deltaPct(pOTC.margen ?? 0, pOTCant.margen ?? 0)} help="Utilidad / Ingresos. Meta típica: >15%." />
          <KpiCard cls="otc" lbl="Facturación Real" val={fmtCOP(pOTC.ingresos)} help="Devengado facturado del periodo (fuente OTC)." />
          <KpiCard cls="sip" lbl="Producción Valorizada" val={fmtCOP(pSIP.prod)} delta={deltaPct(pSIP.prod, pSIPant.prod)} help="Fact_Ajustada SIPREM. NO es ingreso contable." />
          <KpiCard cls="sip" lbl="Cumplimiento" val={fmtPct(cump)} help="Producción / META. Meta: ≥90%." />
          <KpiCard cls="sip" lbl="Brigadas Activas" val={fmtN(pSIP.tecnicos)} help="Técnicos únicos con al menos 1 orden en el periodo." />
        </div>
      </div>

      {/* Evolutivos */}
      <div className="section">
        <h2>📈 Evolutivos (12 meses)</h2>
        <div className="grid-2">
          <ChartCard id="v1-ing-cos-uti" title={<>Ingresos · Costos · Utilidad <span className="tag-otc">OTC</span></>} config={ingCosUtiCfg as never} />
          <ChartCard id="v1-margen" title={<>Margen % <span className="tag-otc">OTC</span></>} config={margenCfg as never} />
          <ChartCard id="v1-prod-cump" title={<>Producción Valorizada & Cumplimiento <span className="tag-sip">SIPREM</span></>} config={prodCumpCfg as never} />
          <ChartCard id="v1-ordenes" title={<>Órdenes por estado <span className="tag-sip">SIPREM</span></>} config={ordCfg as never} />
        </div>
      </div>

      {/* Comparativos */}
      <div className="section">
        <h2>⚖️ Comparativos</h2>
        <div className="grid-2">
          <ChartCard id="v1-zona-utl" title={<>Utilidad y Margen por Zona <span className="tag-otc">OTC</span></>} config={zonaUtlCfg as never} />
          <ChartCard id="v1-real-meta" title={<>Real vs Meta (KPIs) <span className="tag-otc">OTC</span></>} config={realMetaCfg as never} />
        </div>
      </div>

      {/* Drivers */}
      <div className="section">
        <h2>🔎 Drivers del Negocio</h2>
        <div className="sec-sub">¿Por qué cambió la utilidad? Top-3 impulsores detectados automáticamente</div>
        {drivers.length ? drivers.map((d, i) => (
          <div key={i} className="driver">
            <span className={`tipo ${d.tipo}`}>{d.label}</span>
            {d.text}
          </div>
        )) : <div className="driver">Sin variaciones relevantes en el periodo.</div>}
      </div>

      {/* Alertas */}
      <div className="section">
        <h2>🚨 Alertas Gerenciales</h2>
        <div className="sec-sub">Reglas de negocio · haga clic para ir al detalle</div>
        <div className="alertas">
          {alertas.map((a, i) => <Alerta key={i} color={a.c} icono={a.i} texto={a.t} />)}
        </div>
      </div>
    </>
  );
}