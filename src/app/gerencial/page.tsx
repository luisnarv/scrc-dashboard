'use client';

import { useMemo, useEffect, useRef } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { filtRaw, filtCos, finanzaPorZonaDisponible, ultimoMesContable } from '../components/utils/filters';
import { fmtCOP, fmtPct, fmtN, num as n, fmtRangoMeses } from '../components/utils/formatters';
import { otcAgg, unitEconomicsPorTipo } from '../components/utils/aggregators';
import ChartCard from '../components/ChartCard';
import KpiCard from '../components/KpiCard';
import { useTheme } from '../components/ThemeProvider';

const NO_DISPONIBLE = 'No disponible';

export default function GerencialPage() {
  const { raw, filters, setFilters, fechaList, mesList, loading, syncing, error } = useDashboard();
  const { colors } = useTheme();

  // Operación (por día) y finanzas (por mes) deben compararse sobre el mismo periodo: al entrar, el día queda en
  // "Todos" (el provider arranca en el último día cargado). Se hace una sola vez, apenas hay días disponibles.
  const diaInicial = useRef(false);
  useEffect(() => {
    if (!diaInicial.current && fechaList.length) {
      diaInicial.current = true;
      if (filters.fecha !== 'ALL') setFilters({ fecha: 'ALL' });
    }
  }, [fechaList, filters.fecha, setFilters]);
  const TEAL = colors.sip;
  const INDIGO = colors.otc;
  const INK = colors.ink;
  const MUT = colors.mut;
  const WARN = colors.warn;
  const OK = colors.ok;

  const d = useMemo(() => {
    if (!raw) return null;
    const F = filters;    
    // --- 1. OPERACIÓN (Teórico/Estimado) ---
    const rawF = filtRaw(raw.raw, F);
    const efect = rawF.reduce((s, r) => s + n(r.Efectivas), 0);
    const visitas = rawF.reduce((s, r) => s + n(r.Visitas), 0);
    const metaEfec = rawF.reduce((s, r) => s + n(r.Asignacion), 0);
    const prodValorizada = rawF.reduce((s, r) => s + n(r.Ingresos), 0);
    const totalTecnicos = new Set(rawF.map(r => r.Cedula)).size;

    const eficiencia = visitas ? efect / visitas : null;
    const cumplEfic = metaEfec ? efect / metaEfec : null;
    const prodXtecnico = totalTecnicos ? prodValorizada / totalTecnicos : 0;

    // Unit Economics (Estimados)
    const tipoRows = unitEconomicsPorTipo(rawF);

    // --- 2. FINANCIERO (Real OTC) ---
    // La contabilidad solo distingue Sur y Norte-Centro: con zona Norte o Centro no hay financiero que mostrar.
    const zonaFinOK = finanzaPorZonaDisponible(F);
    const cosF = zonaFinOK ? filtCos(raw.costos, F) : [];
    const pOTC = otcAgg(cosF);
    const ingresoReal = pOTC.ingresos || 0;
    const costoReal = pOTC.costos || 0;
    const margenReal = pOTC.utilidad || 0;
    const margenPct = pOTC.margen || 0;

    // Sin filas contables en el periodo (p. ej. mes aún no cargado): se avisa en vez de mostrar $0 y una brecha de -100%.
    const sinFinanzas = !zonaFinOK || cosF.length === 0;
    const avisoFinanzas = !zonaFinOK
      ? 'La contabilidad solo distingue Sur y Norte-Centro: con la zona Norte o Centro elegida no se muestra el resultado financiero.'
      : cosF.length === 0
        ? `Sin información contable para el periodo seleccionado${!syncing && ultimoMesContable(raw.costos) ? ` (último mes con contabilidad cargada: ${ultimoMesContable(raw.costos)})` : ''}.`
        : null;

    // --- 3. VARIACIONES ---
    const brechaAbsoluta = ingresoReal - prodValorizada;
    const brechaPct = prodValorizada ? brechaAbsoluta / prodValorizada : 0;

    const selWin = F.mes.length ? [...F.mes].sort() : [mesList[mesList.length - 1]].filter(Boolean);

    return {
      efect, metaEfec, eficiencia, cumplEfic,
      prodValorizada, prodXtecnico, totalTecnicos,
      ingresoReal, costoReal, margenReal, margenPct,
      brechaAbsoluta, brechaPct,
      sinFinanzas, avisoFinanzas,
      periodoLabel: fmtRangoMeses(selWin),
      tipoRows,
    };
  }, [raw, filters, mesList, syncing]);

  if (loading) return <div className="loading-wrap"><div className="spinner" /><span>Cargando…</span></div>;
  if (error) return <div className="status err">{error}</div>;
  if (!d) return null;

  // Configuración del gráfico de Drivers
  const tipoCfg = {
    type: 'bar' as const,
    data: {
      labels: d.tipoRows.map(r => r.tipo),
      datasets: [
        { label: 'Prod. Val. (Op.) / Brig', data: d.tipoRows.map(r => r.ingXbrig), backgroundColor: INDIGO + 'CC' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' as const } },
      scales: { y: { ticks: { callback: (v: unknown) => fmtCOP(Number(v)) } } }
    }
  };

  const tipoTableData = {
    columns: ['Tipo de brigada', '# Brigadas', 'Prod. Valorizada', 'Prod. Val. / Brig'],
    categoryIndex: 0,
    rows: d.tipoRows.map(r => [r.tipo, fmtN(r.brigadas), fmtCOP(r.ingreso), fmtCOP(r.ingXbrig)])
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

      <div className="section" style={{ marginTop: 24, paddingBottom: 24, borderBottom: '2px solid var(--border)' }}>
        <h2>🛠️ 1. Producción Operativa (Estimación)</h2>
        <div className="sec-sub">Basado en tarifarios y órdenes ejecutadas en campo</div>
        <div className="kpi-grid">
          <KpiCard cls="sip" lbl="Producción Valorizada (Operación)" val={fmtCOP(d.prodValorizada)} help="Valor monetario teórico del trabajo ejecutado." />
          <KpiCard cls="sip" lbl="Productividad (Cumplimiento)" val={d.cumplEfic !== null ? fmtPct(d.cumplEfic) : '—'} help="Efectivas / Asignacion." />
          <KpiCard cls="sip" lbl="Promedio Prod. por Técnico" val={fmtCOP(d.prodXtecnico)} help="Producción valorizada / Total de técnicos." />
          <KpiCard cls="sip" lbl="Total de Técnicos Activos" val={fmtN(d.totalTecnicos)} help="Cantidad de personas ejecutando trabajo." />
        </div>
      </div>

      <div className="section" style={{ marginTop: 24, paddingBottom: 24, borderBottom: '2px solid var(--border)' }}>
        <h2>💰 2. Resultado Financiero Real</h2>
        <div className="sec-sub">Información financiera extraída de la contabilidad</div>
        {d.avisoFinanzas && <div className="status err" style={{ marginBottom: 8 }}>⚠️ {d.avisoFinanzas}</div>}
        <div className="kpi-grid">
          <KpiCard cls="otc" lbl="Ingreso Real" val={d.sinFinanzas ? '—' : fmtCOP(d.ingresoReal)} help="Ingreso contable real facturado." />
          <KpiCard cls="otc" lbl="Costo Real" val={d.sinFinanzas ? '—' : fmtCOP(d.costoReal)} help="Costo contable real." />
          <KpiCard cls={d.sinFinanzas ? 'neu' : d.margenReal < 0 ? 'err' : 'ok'} lbl="Margen Real" val={d.sinFinanzas ? '—' : fmtCOP(d.margenReal)} help="Ingreso Real - Costo Real." />
          <KpiCard cls="neu" lbl="Descuentos Operativos" val={NO_DISPONIBLE} help="Aún no se cuenta con esta información." />
        </div>
      </div>

      <div className="section" style={{ marginTop: 24 }}>
        <h2>⚖️ 3. Variaciones (Real vs Estimado)</h2>
        <div className="sec-sub">Brecha entre la Producción Operativa y el Ingreso Contable</div>
        <div className="kpi-grid c2">
          <KpiCard cls="neu" lbl="Diferencia Absoluta (Brecha)" val={d.sinFinanzas ? '—' : fmtCOP(d.brechaAbsoluta)} help="Ingreso Real - Producción Valorizada Operativa." />
          <KpiCard cls="neu" lbl="Diferencia Porcentual" val={d.sinFinanzas ? '—' : fmtPct(d.brechaPct)} help="% de desviación sobre la Producción Valorizada." />
        </div>
      </div>

      <div className="section" style={{ marginTop: 24 }}>
        <h2>⚙️ Drivers Unitarios Estimados</h2>
        <div style={{ height: 400 }}>
          <ChartCard 
            id="r-tipos" 
            title="Producción Valorizada por Brigada y Tipo (Teórico)"
            subtitle="Basado en estimaciones operativas. El costo por brigada aún no está disponible"
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