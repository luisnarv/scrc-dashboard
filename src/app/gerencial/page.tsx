'use client';

import { useMemo } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { filtRaw, filtCos, ventanaPrevia } from '../components/utils/filters';
import { fmtCOP, fmtPct, fmtN, deltaPct } from '../components/utils/formatters';
import { otcAgg } from '../components/utils/aggregators';
import ChartCard from '../components/ChartCard';
import KpiCard from '../components/KpiCard';

const TEAL = '#00897B';
const INDIGO = '#3949AB';
const INK = '#141b2d';
const MUT = '#8a93a6';

export default function GerencialPage() {
  const { raw, filters, mesList, loading, error } = useDashboard();

  const d = useMemo(() => {
    if (!raw) return null;
    const F = filters;
    const n = (v: unknown) => Number(v) || 0;
    
    // --- 1. OPERACIÓN (Teórico/Estimado) ---
    const rawF = filtRaw(raw.raw, F);
    const efect = rawF.reduce((s, r) => s + n(r.Efectivas), 0);
    const visitas = rawF.reduce((s, r) => s + n(r.Visitas), 0);
    const metaEfec = rawF.reduce((s, r) => s + n(r.Asignacion), 0);
    const prodValorizada = rawF.reduce((s, r) => s + n(r.Ingresos), 0);
    const perdidasOperativas = rawF.reduce((s, r) => s + n(r.Perdidas_COP), 0);
    const totalTecnicos = new Set(rawF.map(r => r.Cedula)).size;

    const eficiencia = visitas ? efect / visitas : null;
    const cumplEfic = metaEfec ? efect / metaEfec : null;
    const prodXtecnico = totalTecnicos ? prodValorizada / totalTecnicos : 0;

    // Unit Economics (Estimados)
    const tmap: Record<string, { b: Set<unknown>; ing: number; co: number; ef: number }> = {};
    rawF.forEach(r => {
      const t = String(r.Tipo_Brigada_Operaciones || 'Sin tipo');
      if (!tmap[t]) tmap[t] = { b: new Set(), ing: 0, co: 0, ef: 0 };
      tmap[t].b.add(r.Cedula);
      tmap[t].ing += n(r.Ingresos);
      tmap[t].co += n(r.Costo_Operativo);
      tmap[t].ef += n(r.Efectivas);
    });
    const tipoRows = Object.entries(tmap)
      .map(([tipo, v]) => { const nb = v.b.size; return { tipo, brigadas: nb, ingreso: v.ing, ingXbrig: nb ? v.ing / nb : 0, costXbrig: nb ? v.co / nb : 0 }; })
      .sort((a, b) => b.ingreso - a.ingreso);

    // --- 2. FINANCIERO (Real OTC) ---
    const cosF = filtCos(raw.costos, F);
    const pOTC = otcAgg(cosF);
    const ingresoReal = pOTC.ingresos || 0;
    const costoReal = pOTC.costos || 0;
    const margenReal = pOTC.utilidad || 0;
    const margenPct = pOTC.margen || 0;
    
    // --- 3. VARIACIONES ---
    const brechaAbsoluta = ingresoReal - prodValorizada;
    const brechaPct = prodValorizada ? brechaAbsoluta / prodValorizada : 0;

    const winLbl = (arr: string[]) => (arr.length ? (arr.length === 1 ? arr[0] : `${arr[0]} … ${arr[arr.length - 1]}`) : '—');
    const selWin = F.mes.length ? [...F.mes].sort() : [mesList[mesList.length - 1]].filter(Boolean);

    return {
      efect, metaEfec, eficiencia, cumplEfic,
      prodValorizada, perdidasOperativas, prodXtecnico, totalTecnicos,
      ingresoReal, costoReal, margenReal, margenPct,
      brechaAbsoluta, brechaPct,
      periodoLabel: winLbl(selWin),
      tipoRows,
    };
  }, [raw, filters, mesList]);

  if (loading) return <div className="loading-wrap"><div className="spinner" /><span>Cargando…</span></div>;
  if (error) return <div className="status err">{error}</div>;
  if (!d) return null;

  // Configuración del gráfico de Drivers
  const tipoCfg = {
    type: 'bar' as const,
    data: {
      labels: d.tipoRows.map(r => r.tipo),
      datasets: [
        { label: 'Prod. Val. (Op.) / Brig', data: d.tipoRows.map(r => r.ingXbrig), backgroundColor: INDIGO + 'CC' },
        { label: 'Costo Promedio (Op.) / Brig', data: d.tipoRows.map(r => r.costXbrig), backgroundColor: '#C62828CC' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' as const } },
      scales: { y: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } } }
    }
  };

  const tipoTableData = {
    columns: ['Tipo de brigada', '# Brigadas', 'Prod. Valorizada', 'Prod. Val. / Brig', 'Costo Op. / Brig'],
    categoryIndex: 0,
    rows: d.tipoRows.map(r => [r.tipo, fmtN(r.brigadas), fmtCOP(r.ingreso), fmtCOP(r.ingXbrig), fmtCOP(r.costXbrig)])
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '4px 2px 18px' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, color: INK }}>GERENCIAL</div>
          <div style={{ fontSize: 12.5, color: MUT, marginTop: 2 }}>Análisis financiero real vs estimación operativa</div>
        </div>
        <div style={{ fontSize: 12, color: MUT }}>Periodo · <b style={{ color: INK, fontWeight: 600 }}>{d.periodoLabel}</b></div>
      </div>

      <div className="section" style={{ marginTop: 24, paddingBottom: 24, borderBottom: '2px solid #eef0f5' }}>
        <h2>🛠️ 1. Producción Operativa (Estimación)</h2>
        <div className="sec-sub">Basado en tarifarios y órdenes ejecutadas en campo</div>
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <KpiCard cls="sip" lbl="Producción Valorizada (Operación)" val={fmtCOP(d.prodValorizada)} help="Valor monetario teórico del trabajo ejecutado." />
          <KpiCard cls="sip" lbl="Productividad (Cumplimiento)" val={d.cumplEfic !== null ? fmtPct(d.cumplEfic) : '—'} help="Efectivas / Asignacion." />
          <KpiCard cls="sip" lbl="Promedio Prod. por Técnico" val={fmtCOP(d.prodXtecnico)} help="Producción valorizada / Total de técnicos." />
          <KpiCard cls="sip" lbl="Total de Técnicos Activos" val={fmtN(d.totalTecnicos)} help="Cantidad de personas ejecutando trabajo." />
        </div>
      </div>

      <div className="section" style={{ marginTop: 24, paddingBottom: 24, borderBottom: '2px solid #eef0f5' }}>
        <h2>💰 2. Resultado Financiero (Real OTC)</h2>
        <div className="sec-sub">Información financiera extraída de la contabilidad</div>
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <KpiCard cls="otc" lbl="Ingreso Real (OTC)" val={fmtCOP(d.ingresoReal)} help="Ingreso contable real facturado." />
          <KpiCard cls="otc" lbl="Costo Real (OTC)" val={fmtCOP(d.costoReal)} help="Costo contable real." />
          <KpiCard cls={d.margenReal < 0 ? 'err' : 'ok'} lbl="Margen Real (OTC)" val={fmtCOP(d.margenReal)} help="Ingreso Real - Costo Real." />
          <KpiCard cls="err" lbl="Descuentos Operativos" val={fmtCOP(d.perdidasOperativas)} help="Valor de las órdenes perdidas en operación (Impacto potencial)." />
        </div>
      </div>

      <div className="section" style={{ marginTop: 24 }}>
        <h2>⚖️ 3. Variaciones (Real vs Estimado)</h2>
        <div className="sec-sub">Brecha entre la Producción Operativa y el Ingreso Contable</div>
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <KpiCard cls="neu" lbl="Diferencia Absoluta (Brecha)" val={fmtCOP(d.brechaAbsoluta)} help="Ingreso Real OTC - Producción Valorizada Operativa." />
          <KpiCard cls="neu" lbl="Diferencia Porcentual" val={fmtPct(d.brechaPct)} help="% de desviación sobre la Producción Valorizada." />
        </div>
      </div>

      <div className="section" style={{ marginTop: 24 }}>
        <h2>⚙️ Drivers Unitarios Estimados</h2>
        <div style={{ height: 400 }}>
          <ChartCard 
            id="r-tipos" 
            title="Producción vs Costo Promedio por Tipo de Brigada (Teórico)" 
            subtitle="Basado en estimaciones operativas y costos fijos configurados en ETL"
            config={tipoCfg as never} 
            height="tall" 
            hasDetail 
            detailTableData={tipoTableData} 
          />
        </div>
      </div>
    </>
  );
}