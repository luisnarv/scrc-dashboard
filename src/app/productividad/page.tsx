'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { filtRaw, filtDet } from '../components/utils/filters';
import { fmtCOP, fmtPct, fmtN, deltaPct } from '../components/utils/formatters';
import { mesAnterior } from '../components/utils/aggregators';
import KpiCard from '../components/KpiCard';
import ChartCard from '../components/ChartCard';
import RankList from '../components/RankList';
import SortableTable from '../components/SortableTable';
import ModalAcciones from '../components/ModalAcciones';

const CFG = { ok: '#2E7D32', warn: '#F57C00', err: '#C62828', otc: '#3949AB', sip: '#00897B', neu: '#5d6785' };

const baseOpt = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { font: { size: 10 }, boxWidth: 10 } } },
};

const MIX_COLS = ['#00897B', '#3949AB', '#F57C00', '#7B1FA2', '#00838F', '#5D4037', '#546E7A', '#C0392B'];

export default function ProductividadPage() {
  const { raw, filters, mesList, loading, error } = useDashboard();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAccion, setModalAccion] = useState<string | undefined>();

  const data = useMemo(() => {
    if (!raw) return null;
    const rawF = filtRaw(raw.raw, filters);
    const det = filtDet(raw.det, filters);
    const mActual = filters.mes.length ? [...filters.mes].sort().at(-1)! : mesList[mesList.length - 1];
    const mAnt = mesAnterior(mActual, mesList);

    const filtBase = (r: { _Proyecto?: string; _Zona?: string; _ZonaDet?: string }) =>
      (filters.proy === 'ALL' || r._Proyecto === filters.proy) &&
      (filters.zona === 'ALL' || r._Zona === filters.zona || r._ZonaDet === filters.zona);

    // KPIs
    const prod = rawF.reduce((s, r) => s + (Number(r.Ingresos) || 0), 0);
    const ordenes = rawF.reduce((s, r) => s + (Number(r.Visitas) || 0), 0);
    const efectivas = rawF.reduce((s, r) => s + (Number(r.Efectivas) || 0), 0);
    const perdidas = rawF.reduce((s, r) => s + (Number(r.Perdidas) || 0), 0);
    const tecnicos = new Set(rawF.map(r => r.Cedula)).size;
    const meta = rawF.reduce((s, r) => s + (Number(r.Meta_Facturacion) || 0), 0);
    const cump = meta ? prod / meta : null;
    const efect = ordenes ? efectivas / ordenes : null;

    const rawAnt = raw.raw.filter(r => String(r.Fecha || '').startsWith(mAnt || '##') && filtBase(r));
    const prodAnt = rawAnt.reduce((s, r) => s + (Number(r.Ingresos) || 0), 0);
    const ordAnt = rawAnt.reduce((s, r) => s + (Number(r.Visitas) || 0), 0);

    // KPI2 - Brigadas
    const tipoMap: Record<string, { p: number; o: number; e: number; c: number }> = {};
    rawF.forEach(r => {
      const t = String(r.Tipo_Cuadrilla || 'Sin tipo');
      if (!tipoMap[t]) tipoMap[t] = { p: 0, o: 0, e: 0, c: 0 };
      tipoMap[t].p += Number(r.Ingresos) || 0;
      tipoMap[t].o += Number(r.Visitas) || 0;
      tipoMap[t].e += Number(r.Efectivas) || 0;
      const m = Number(r.Meta_Facturacion) || 0;
      tipoMap[t].c += m;
    });
    const tipoArr = Object.entries(tipoMap).map(([t, v]) => ({
      t, p: v.p, o: v.o, ef: v.o ? v.e / v.o * 100 : 0, c: v.c ? v.p / v.c * 100 : 0,
    })).sort((a, b) => b.p - a.p);

    // Daily series
    const meses12 = mesList.slice(-12);
    const fechas = [...new Set(rawF.map(r => r.Fecha).filter((f): f is string => !!f))].sort().slice(-30);

    const ordDia = fechas.map(f => {
      const rr = rawF.filter(r => r.Fecha === f);
      return {
        f, ef: rr.reduce((s, r) => s + (Number(r.Efectivas) || 0), 0),
        fa: rr.reduce((s, r) => s + (Number(r.Fallidas) || 0), 0),
        pe: rr.reduce((s, r) => s + (Number(r.Perdidas) || 0), 0),
      };
    });

    const prodDia = fechas.map(f => ({
      f, v: rawF.filter(r => r.Fecha === f).reduce((s, r) => s + (Number(r.Ingresos) || 0), 0),
    }));

    const cumpDia = fechas.map(f => {
      const rr = rawF.filter(r => r.Fecha === f);
      const p = rr.reduce((s, r) => s + (Number(r.Ingresos) || 0), 0);
      const m = rr.reduce((s, r) => s + (Number(r.Meta_Facturacion) || 0), 0);
      return { f, v: m ? p / m * 100 : 0 };
    });

    const efDia = fechas.map(f => {
      const rr = rawF.filter(r => r.Fecha === f);
      const o = rr.reduce((s, r) => s + (Number(r.Visitas) || 0), 0);
      const e = rr.reduce((s, r) => s + (Number(r.Efectivas) || 0), 0);
      return { f, v: o ? e / o * 100 : 0 };
    });

    // Pareto acciones
    const subs: Record<string, { v: number; n: number }> = {};
    det.forEach(o => {
      const s = o.Accion || '—';
      if (!subs[s]) subs[s] = { v: 0, n: 0 };
      subs[s].v += Number(o.Valor) || 0;
      subs[s].n += 1;
    });
    const subArr = Object.entries(subs).map(([s, v]) => ({ s, v: v.v, n: v.n })).sort((a, b) => b.n - a.n).slice(0, 15);
    const totSub = subArr.reduce((s, x) => s + x.n, 0);
    let acum = 0;
    const acumSub = subArr.map(x => { acum += x.n; return totSub ? acum / totSub * 100 : 0; });

    // Rankings
    const tecs: Record<string, { n: string; b: string; o: number; e: number; p: number }> = {};
    rawF.forEach(r => {
      const k = String(r.Cedula || '?');
      if (!tecs[k]) tecs[k] = { n: String(r.Nombre || ''), b: String(r.Tipo_Cuadrilla || ''), o: 0, e: 0, p: 0 };
      tecs[k].o += Number(r.Visitas) || 0;
      tecs[k].e += Number(r.Efectivas) || 0;
      tecs[k].p += Number(r.Ingresos) || 0;
    });
    const tecArr = Object.entries(tecs).map(([c, v]) => ({ c, ...v, ef: v.o ? v.e / v.o : 0 })).sort((a, b) => b.p - a.p);

    const sups: Record<string, number> = {};
    rawF.forEach(r => { const s = String(r.Supervisor || '—'); sups[s] = (sups[s] || 0) + (Number(r.Ingresos) || 0); });
    const supArr = Object.entries(sups).map(([l, value]) => ({ label: l, value })).sort((a, b) => b.value - a.value);

    const muns: Record<string, number> = {};
    rawF.forEach(r => { const m = String(r.Municipio || '—'); muns[m] = (muns[m] || 0) + (Number(r.Visitas) || 0); });
    const munArr = Object.entries(muns).map(([l, value]) => ({ label: l, value })).sort((a, b) => b.value - a.value);

    // Drivers
    const drivers: { tipo: 'pos' | 'neg' | 'info'; label: string; text: string }[] = [];
    if (tipoArr.length) {
      const top = tipoArr[0];
      drivers.push({ tipo: 'pos', label: '🏆 Líder', text: `Brigadas ${top.t} alcanzan cumplimiento del ${top.c.toFixed(0)}%.` });
    }
    const munF: Record<string, { p: number; t: number }> = {};
    rawF.forEach(r => { const m = String(r.Municipio || '—'); if (!munF[m]) munF[m] = { p: 0, t: 0 }; munF[m].p += Number(r.Perdidas) || 0; munF[m].t += Number(r.Visitas) || 0; });
    const munWorst = Object.entries(munF).filter(x => x[1].t >= 10).map(([m, v]) => ({ m, pct: v.p / v.t })).sort((a, b) => b.pct - a.pct)[0];
    if (munWorst && munWorst.pct > 0.2) drivers.push({ tipo: 'neg', label: '⚠️ Alerta', text: `Municipio ${munWorst.m} con ${(munWorst.pct * 100).toFixed(0)}% de órdenes perdidas.` });
    if (subArr.length) { const t = subArr.slice(0, 3).reduce((s, x) => s + x.n, 0); drivers.push({ tipo: 'info', label: '📊 Concentración', text: `Las 3 principales acciones concentran el ${totSub ? (t / totSub * 100).toFixed(0) : 0}% de las órdenes.` }); }

    // Oportunidades
    const oport: string[] = [];
    if (tipoArr.some(x => x.c < 80)) oport.push('Cumplimiento: Tipos de brigada por debajo del 80% requieren refuerzo operativo o revisión de meta.');
    if (munWorst && munWorst.pct > 0.2) oport.push(`Redistribución: Reasignar brigadas hacia municipios con menor tasa de pérdidas; ${munWorst.m} muestra alta tasa de órdenes sin pago.`);

    // Fuentes chart (productividad vs disponibilidad)
    const fuenteKeys = ['Productividad', 'Disponibilidad'];
    const fuenteData = fuenteKeys.map(k => rawF.filter(r => String(r.Tipo_Cuadrilla || '').toLowerCase().includes(k.toLowerCase())).reduce((s, r) => s + (Number(r.Ingresos) || 0), 0));

    const tableData = tecArr.map(t => ({
      n: t.n, c: t.c, b: t.b,
      o: t.o, e: t.e,
      ef: Number((t.ef * 100).toFixed(1)),
      p: t.p,
    }));

    return {
      prod, ordenes, efectivas, perdidas, tecnicos, meta, cump, efect,
      prodAnt, ordAnt, tipoArr, ordDia, prodDia, cumpDia, efDia,
      subArr, acumSub, totSub, fuenteData, tecArr, supArr, munArr,
      drivers, oport, det, tableData, meses12, filtBase,
    };
  }, [raw, filters, mesList]);

  if (loading) return <div className="loading-wrap"><div className="spinner" /><span>Cargando datos…</span></div>;
  if (error) return <div className="status err">{error}</div>;
  if (!data || !raw) return null;

  const { prod, ordenes, efectivas, cump, efect, prodAnt, ordAnt, tipoArr, ordDia, prodDia, cumpDia, efDia, subArr, acumSub, totSub, fuenteData, tecArr, supArr, munArr, drivers, oport, det, tableData } = data;

  const fuentesCfg = {
    type: 'bar' as const,
    data: { labels: ['Productividad', 'Disponibilidad'], datasets: [{ label: 'Producción', data: fuenteData, backgroundColor: [CFG.sip + 'CC', CFG.otc + 'CC'] }] },
    options: { ...baseOpt, plugins: { ...baseOpt.plugins, legend: { display: false } }, scales: { y: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } } } },
  };

  const cumpTipoCfg = {
    type: 'bar' as const,
    data: { labels: tipoArr.map(x => x.t.slice(0, 20)), datasets: [{ label: 'Cumplimiento %', data: tipoArr.map(x => x.c), backgroundColor: tipoArr.map(x => x.c >= 90 ? CFG.ok + 'CC' : x.c >= 75 ? CFG.warn + 'CC' : CFG.err + 'CC') }] },
    options: { ...baseOpt, indexAxis: 'y' as const, plugins: { ...baseOpt.plugins, legend: { display: false } }, scales: { x: { max: 120, ticks: { callback: (v: unknown) => Number(v).toFixed(0) + '%' } } } },
  };

  const ordDiaCfg = {
    type: 'bar' as const,
    data: {
      labels: ordDia.map(x => x.f),
      datasets: [
        { label: 'Efectivas', data: ordDia.map(x => x.ef), backgroundColor: CFG.ok + 'CC' },
        { label: 'Fallidas', data: ordDia.map(x => x.fa), backgroundColor: CFG.warn + 'CC' },
        { label: 'Perdidas', data: ordDia.map(x => x.pe), backgroundColor: CFG.err + 'CC' },
      ],
    },
    options: { ...baseOpt, scales: { x: { stacked: true }, y: { stacked: true } } },
  };

  const prodDiaCfg = {
    type: 'bar' as const,
    data: { labels: prodDia.map(x => x.f), datasets: [{ label: 'Producción', data: prodDia.map(x => x.v), backgroundColor: CFG.sip + 'BB' }] },
    options: { ...baseOpt, scales: { y: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } } } },
  };

  const cumpDiaCfg = {
    type: 'line' as const,
    data: { labels: cumpDia.map(x => x.f), datasets: [{ label: 'Cumplimiento %', data: cumpDia.map(x => x.v), borderColor: CFG.warn, backgroundColor: CFG.warn + '22', fill: true, tension: 0.3 }] },
    options: { ...baseOpt, scales: { y: { ticks: { callback: (v: unknown) => Number(v).toFixed(0) + '%' } } } },
  };

  const efDiaCfg = {
    type: 'line' as const,
    data: { labels: efDia.map(x => x.f), datasets: [{ label: 'Efectividad %', data: efDia.map(x => x.v), borderColor: CFG.ok, backgroundColor: CFG.ok + '22', fill: true, tension: 0.3 }] },
    options: { ...baseOpt, scales: { y: { ticks: { callback: (v: unknown) => Number(v).toFixed(0) + '%' } } } },
  };

  const paretoCfg = {
    type: 'bar' as const,
    data: {
      labels: subArr.map(x => x.s.length > 32 ? x.s.slice(0, 30) + '…' : x.s),
      datasets: [
        { type: 'bar' as const, label: 'Órdenes', data: subArr.map(x => x.n), backgroundColor: CFG.sip + 'CC', xAxisID: 'x' },
        { type: 'line' as const, label: '% Acumulado', data: acumSub, borderColor: CFG.warn, tension: 0.2, xAxisID: 'x1' },
      ],
    },
    options: {
      ...baseOpt,
      indexAxis: 'y' as const,
      scales: {
        x: { ticks: { callback: (v: unknown) => fmtN(Number(v)) }, title: { display: true, text: 'Órdenes' } },
        x1: { position: 'top' as const, max: 100, ticks: { callback: (v: unknown) => Number(v).toFixed(0) + '%' }, grid: { display: false } },
      },
    },
  };

  const mixCfg = {
    type: 'doughnut' as const,
    data: { labels: tipoArr.map(x => x.t), datasets: [{ data: tipoArr.map(x => x.p), backgroundColor: MIX_COLS }] },
    options: { ...baseOpt, plugins: { ...baseOpt.plugins, tooltip: { callbacks: { label: (c: { label: string; parsed: number }) => c.label + ': ' + fmtCOP(c.parsed) } } } },
  };

  const prodTipoCfg = {
    type: 'bar' as const,
    data: { labels: tipoArr.map(x => x.t.slice(0, 20)), datasets: [{ label: 'Producción', data: tipoArr.map(x => x.p), backgroundColor: MIX_COLS }] },
    options: { ...baseOpt, indexAxis: 'y' as const, plugins: { ...baseOpt.plugins, legend: { display: false } }, scales: { x: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } } } },
  };

  return (
    <>
      <div className="section">
        <h2>⚙️ Productividad <span className="tag-sip">SIPREM</span></h2>
        <div className="sec-sub">Toda cifra económica se denomina <b>Producción Valorizada / Facturación Estimada</b> · no confundir con ingresos contables</div>
      </div>

      <div className="section">
        <h2>Indicadores Nivel 1</h2>
        <div className="kpi-grid">
          <KpiCard cls="sip" lbl="Producción Valorizada" val={fmtCOP(prod)} delta={deltaPct(prod, prodAnt)} help="Fact_Ajustada SIPREM." />
          <KpiCard cls="sip" lbl="Órdenes Totales" val={fmtN(ordenes)} delta={deltaPct(ordenes, ordAnt)} help="Total de visitas/órdenes en el periodo." />
          <KpiCard cls="sip" lbl="Efectividad %" val={fmtPct(efect)} help="Efectivas / Totales." />
          <KpiCard cls="sip" lbl="Cumplimiento %" val={fmtPct(cump)} help="Producción / Meta. Meta ≥90%." />
        </div>
      </div>

      <div className="section">
        <h2>Indicadores Nivel 2 — Composición y Cumplimiento</h2>
        <div className="grid-2">
          <ChartCard id="v2-fuentes" title="Producción por fuente" subtitle="Productividad vs Disponibilidad" config={fuentesCfg as never} height="short" />
          <ChartCard id="v2-cump-tipo" title="Cumplimiento por Tipo de Brigada" config={cumpTipoCfg as never} height="short" />
        </div>
      </div>

      <div className="section">
        <h2>📈 Evolutivos</h2>
        <div className="grid-2">
          <ChartCard id="v2-ord-dia" title="Órdenes diarias por estado" config={ordDiaCfg as never} />
          <ChartCard id="v2-prod-dia" title="Producción Valorizada diaria" config={prodDiaCfg as never} />
          <ChartCard id="v2-cump-dia" title="Cumplimiento diario (%)" config={cumpDiaCfg as never} />
          <ChartCard id="v2-efect-dia" title="Efectividad %" config={efDiaCfg as never} />
        </div>
      </div>

      <div className="section">
        <h2>🏆 Comparativos — Rankings</h2>
        <div className="grid-2">
          <div className="card"><div className="ch-title">Top 10 Técnicos (Producción)</div><RankList items={tecArr.slice(0, 10).map(t => ({ label: t.n || t.c, value: t.p, sub: t.b }))} /></div>
          <div className="card"><div className="ch-title">Top 10 Supervisores</div><RankList items={supArr.slice(0, 10)} /></div>
          <div className="card"><div className="ch-title">Top 10 Municipios (Órdenes)</div><RankList items={munArr.slice(0, 10)} format="n" /></div>
          <ChartCard id="v2-prod-tipo" title="Producción por Tipo de Brigada" config={prodTipoCfg as never} height="short" />
        </div>
      </div>

      <div className="section">
        <h2>📊 Distribuciones</h2>
        <div className="grid-2">
          <ChartCard
            id="v2-pareto"
            title="Pareto de Acciones"
            subtitle="80/20 de las órdenes"
            config={paretoCfg as never}
            height="tall"
            headerExtra={<button className="btn-detalle" onClick={() => { setModalAccion(undefined); setModalOpen(true); }}>Ver detalle</button>}
          />
          <ChartCard id="v2-mix" title="Mix de Brigadas" subtitle="Participación en la producción" config={mixCfg as never} height="tall" />
        </div>
      </div>

      <div className="section">
        <h2>🔎 Drivers de Productividad</h2>
        {drivers.length ? drivers.map((d, i) => (
          <div key={i} className="driver">
            <span className={`tipo ${d.tipo}`}>{d.label}</span>
            {d.text}
          </div>
        )) : <div className="driver">Sin drivers destacados.</div>}
      </div>

      <div className="section">
        <h2>💡 Oportunidades de Mejora</h2>
        {oport.length ? oport.map((o, i) => <div key={i} className="oport">{o}</div>) : <div className="oport">Operación dentro de parámetros esperados.</div>}
      </div>

      <div className="section">
        <h2>📋 Detalle por Técnico</h2>
        <SortableTable
          id="tabla-tec"
          columns={[
            { key: 'n', label: 'Técnico' },
            { key: 'c', label: 'Cédula' },
            { key: 'b', label: 'Brigada' },
            { key: 'o', label: 'Órdenes', type: 'num', render: v => fmtN(Number(v)) },
            { key: 'e', label: 'Efectivas', type: 'num', render: v => fmtN(Number(v)) },
            { key: 'ef', label: 'Efectividad %', type: 'num', render: v => Number(v).toFixed(1) + '%' },
            { key: 'p', label: 'Producción', type: 'num', render: v => fmtCOP(Number(v)) },
          ]}
          data={tableData as never}
          defaultSort="p"
          searchPlaceholder="Buscar técnico, cédula o brigada…"
          searchKeys={['n', 'c', 'b']}
        />
      </div>

      <ModalAcciones
        open={modalOpen}
        data={det}
        titulo={modalAccion ? `Detalle: ${modalAccion}` : 'Detalle de Órdenes'}
        preselectedAccion={modalAccion}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
