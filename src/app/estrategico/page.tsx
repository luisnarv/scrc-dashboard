'use client';

import { useMemo, useEffect, useRef } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { filtRaw, filtCos, ventanaPrevia, matchProyZona } from '../components/utils/filters';
import { otcAgg, otcAggMes, mesAnterior, ingresoElectrica, aggVentana } from '../components/utils/aggregators';
import { fmtCOP, fmtPct, fmtN, deltaPct, num, fmtRangoMeses } from '../components/utils/formatters';
import { calcHealth } from '../components/utils/health';
import ChartCard from '../components/ChartCard';
import { useTheme } from '../components/ThemeProvider';

const baseOpt = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 0 },   // sin animación de entrada: el reveal es instantáneo (sin saltos)
  plugins: { legend: { labels: { font: { size: 10 }, boxWidth: 10 } } },
};

export default function ResumenPage() {
  const { raw, filters, setFilters, mesList, loading, error } = useDashboard();
  const { colors } = useTheme();

  // Vista estratégica = lectura ACUMULADA: al entrar, fija el filtro de meses en
  // "Todos" (mes=[]) una sola vez, apenas la lista de meses esté disponible (esto
  // sobrescribe el default global del provider, que arranca en el mes actual).
  const initMes = useRef(false);
  useEffect(() => {
    if (!initMes.current && mesList.length) {
      initMes.current = true;
      setFilters({ mes: [], fecha: 'ALL' });
    }
  }, [mesList, setFilters]);

  const CFG = { ok: colors.ok, warn: colors.warn, err: colors.err, otc: colors.otc, sip: colors.sip, neu: colors.mut };

  const data = useMemo<any>(() => {
    if (!raw) return null;
    const F = filters;    const rawF = filtRaw(raw.raw, F);
    const cosF = filtCos(raw.costos, F);
    const mActual = F.mes.length ? [...F.mes].sort().at(-1)! : mesList[mesList.length - 1];
    const mAnt = mesAnterior(mActual, mesList);

    const filtBase = matchProyZona(F);

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

    // ---- Series del año (2026 / año seleccionado, respetando filtro de mes si hay selección) ----
    const mesesAno = mesList.filter(m => (F.ano !== 'ALL' ? m.startsWith(F.ano) : m.startsWith('2026')));
    const meses12 = F.mes.length ? mesesAno.filter(m => F.mes.includes(m)) : mesesAno;
    const seriesOTC = meses12.map(m => otcAggMes(raw.costos.filter(filtBase), m));
    const prodMes = meses12.map(m => {
      const rr = rawF.filter(x => String(x.Fecha || '').startsWith(m));
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
    const ingElec = ingresoElectrica(cosF);

    const rawBase = raw.raw.filter(filtBase);
    const cosBase = raw.costos.filter(filtBase);

    // Evolutivos 12m
    const efMes = meses12.map(m => {
      const rr = rawBase.filter(x => String(x.Fecha || '').startsWith(m));
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
    }).map((item, idx, arr) => {
      const prev = idx > 0 ? arr[idx - 1] : null;
      const dEficPp = prev ? item.efic - prev.efic : null;
      const dCumpPp = prev ? item.cumpProd - prev.cumpProd : null;
      const dIngBrigPct = prev && prev.ingXbrig > 0 ? ((item.ingXbrig - prev.ingXbrig) / prev.ingXbrig) * 100 : null;
      return {
        ...item,
        dEficPp,
        dCumpPp,
        dIngBrigPct,
      };
    });

    const efMesPorTipo = meses12.flatMap(m => {
      const rr = rawBase.filter(x => String(x.Fecha || '').startsWith(m));
      const tmap: Record<string, { ef: number; vi: number; ing: number; co: number; me: number; b: Set<unknown>; tecs: Record<string, { nombre: string; ef: number; vi: number; ing: number; co: number; me: number; }> }> = {};
      rr.forEach(r => {
        const t = String(r.Tipo_Cuadrilla || r.Tipo_Brigada_Operaciones || r['Tipo de cuadrilla '] || 'Sin tipo').trim();
        if (!tmap[t]) tmap[t] = { ef:0, vi:0, ing:0, co:0, me:0, b: new Set(), tecs: {} };
        const rawCed = String(r.Cedula || '').trim();
        const ced = rawCed ? rawCed.replace(/\.0+$/, '').replace(/\D/g, '') : '';
        if (!tmap[t].tecs[ced]) tmap[t].tecs[ced] = { nombre: String(r.Nombre || ced || ''), ef:0, vi:0, ing:0, co:0, me:0 };
        
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
    // "Todos" (mes=[]) => la ventana acumulada abarca el año seleccionado (2026);
    // con meses seleccionados, esos meses.
    const selWin = F.mes.length ? [...F.mes].sort() : [...meses12];
    const prevWin = ventanaPrevia(selWin, mesList);
    const winA = aggVentana(raw.raw, selWin, filtBase);
    const winB = aggVentana(raw.raw, prevWin, filtBase);
    const winIncompleto = prevWin.length < selWin.length;

    // Series Financieras Reales (OTC)
    const evolutivoOTC = meses12.map(m => {
      const cosM = cosBase.filter(c => c.Mes === m);
      const agg = otcAgg(cosM);
      const ing = agg.ingresos || 0;
      const cost = agg.costos || 0;
      const utilidad = ing - cost;
      const margenPct = ing > 0 ? ((ing - cost) / ing) * 100 : 0;
      const costoPct = ing > 0 ? (cost / ing) * 100 : 0;
      // Identifica si el mes tiene facturación definitiva o es provisional (devengo)
      const ingRows = cosM.filter(r => r.es_ingreso || String(r.Categoria || '').toUpperCase().includes('INGRES') || String(r.Categoria || '').toUpperCase().includes('DEVENGADO'));
      const hasReal = ingRows.some(r => {
        const c = String(r.Categoria || '').toUpperCase();
        return (c.includes('INGENIERIA') || c.includes('CLIENTES NACIONALES')) && !c.includes('PROVISION') && !c.includes('NO FACTURADO') && !c.includes('DEVENGADO') && Number(r.Valor) > 0;
      });
      const isProvisional = ing > 0 && !hasReal;

      return {
        mes: m,
        ing,
        cost,
        margen: utilidad,
        margenPct,
        costoPct,
        isProvisional,
      };
    }).map((item, idx, arr) => {
      const prev = idx > 0 ? arr[idx - 1] : null;
      const dIngPct = prev && prev.ing > 0 ? ((item.ing - prev.ing) / prev.ing) * 100 : null;
      const dCostPct = prev && prev.cost > 0 ? ((item.cost - prev.cost) / prev.cost) * 100 : null;
      const dMargenPp = prev ? item.margenPct - prev.margenPct : null;
      const dCostPp = prev ? item.costoPct - prev.costoPct : null;
      return {
        ...item,
        dIngPct,
        dCostPct,
        dMargenPp,
        dCostPp,
      };
    });

    // Series de Combustible 12m (Gasto Total OTC, Brigadas SIPREM, Ratio por Brigada)
    // Se toma la sumatoria neta contable de la OTC (igual que la tabla dinámica de Excel),
    // cancelando automáticamente facturas y sus reversiones de provisión.
    const isCombustible = (cat: unknown, cuenta?: unknown) => {
      const s = (String(cat || '') + ' ' + String(cuenta || '')).toUpperCase();
      return s.includes('COMBUSTIB') || s.includes('GASOLINA') || s.includes('LUBRICANTE');
    };

    const evolutivoCombustible = meses12.map(m => {
      const cosM = cosBase.filter(c => c.Mes === m && isCombustible(c.Categoria, c.NombreCuenta));
      const gastoTotal = cosM.reduce((s, c) => s + num(c.Valor), 0);
      const cosTotalMes = cosBase.filter(c => c.Mes === m && !c.es_ingreso).reduce((s, c) => s + num(c.Valor), 0);

      const rr = rawBase.filter(x => String(x.Fecha || '').startsWith(m));
      const brigadas = new Set(rr.map(x => x.Cedula)).size;
      const ratio = brigadas > 0 ? gastoTotal / brigadas : 0;
      const pctSobreCosto = cosTotalMes > 0 ? (gastoTotal / cosTotalMes) * 100 : 0;

      return {
        mes: m,
        gastoTotal,
        brigadas,
        ratio,
        pctSobreCosto,
        numRegistros: cosM.length,
      };
    }).map((item, idx, arr) => {
      const prev = idx > 0 ? arr[idx - 1] : null;
      const dGastoPct = prev && prev.gastoTotal > 0 ? ((item.gastoTotal - prev.gastoTotal) / prev.gastoTotal) * 100 : null;
      const dRatioPct = prev && prev.ratio > 0 ? ((item.ratio - prev.ratio) / prev.ratio) * 100 : null;
      return {
        ...item,
        dGastoPct,
        dRatioPct,
      };
    });

    return {
      meses12, efMes, efMesPorTipo, evolutivoOTC, evolutivoCombustible,
      winA, winB, winIncompleto, selLbl: fmtRangoMeses(selWin), prevLbl: fmtRangoMeses(prevWin)
    };
  }, [raw, filters, mesList]);

  if (loading) return <div className="loading-wrap"><div className="spinner" /><span>Cargando datos…</span></div>;
  if (error) return <div className="status err">{error}</div>;
  if (!data) return null;

  const {
    meses12, efMes, efMesPorTipo, evolutivoOTC, evolutivoCombustible,
    winA, winB, winIncompleto, selLbl, prevLbl
  } = data;

  // ---- Configs de gráficos (evolutivos) ----
  const line = (label: string, arr: number[], kind: 'pct' | 'cop', color?: string) => ({
    type: 'line' as const,
    data: {
      labels: meses12,
      datasets: [
        {
          label,
          data: arr,
          borderColor: color || (kind === 'cop' ? CFG.otc : CFG.sip),
          backgroundColor: (color || (kind === 'cop' ? CFG.otc : CFG.sip)) + '33',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      ...baseOpt,
      plugins: {
        ...baseOpt.plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => `${ctx.dataset.label}: ${kind === 'cop' ? fmtCOP(Number(ctx.raw)) : Number(ctx.raw).toFixed(1) + '%'}`,
          },
        },
      },
      scales: {
        y: {
          ticks: {
            callback: (v: unknown) => (kind === 'cop' ? fmtCOP(Number(v)) : Number(v).toFixed(1) + '%'),
          },
        },
      },
    },
  });

  // Operativos
  const eficCfg = {
    type: 'line' as const,
    data: {
      labels: meses12,
      datasets: [
        {
          label: 'Eficiencia %',
          data: efMes.map((x: any) => x.efic),
          borderColor: CFG.sip,
          backgroundColor: CFG.sip + '33',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      ...baseOpt,
      plugins: {
        ...baseOpt.plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              const idx = ctx.dataIndex;
              const item = efMes[idx];
              const pct = Number(ctx.raw).toFixed(1) + '%';
              const varStr = item?.dEficPp !== null && item?.dEficPp !== undefined
                ? ` · Var: ${item.dEficPp >= 0 ? '+' : ''}${item.dEficPp.toFixed(1)} pp vs mes ant.`
                : '';
              const detalle = item ? ` (${fmtN(item.ef)} efectivas / ${fmtN(item.vi)} visitas)` : '';
              return `Eficiencia: ${pct}${detalle}${varStr}`;
            },
          },
        },
      },
      scales: {
        y: {
          min: 0,
          beginAtZero: true,
          suggestedMax: Math.max(...efMes.map((x: any) => Number(x.efic) || 0), 0) > 0 
            ? Math.ceil(Math.max(...efMes.map((x: any) => Number(x.efic) || 0), 0) / 5) * 5 
            : 100,
          ticks: {
            callback: (v: unknown) => Number(v).toFixed(1) + '%',
          },
        },
      },
    },
  };

  const cumpProdCfg = {
    type: 'line' as const,
    data: {
      labels: meses12,
      datasets: [
        {
          label: 'Cumplimiento %',
          data: efMes.map((x: any) => x.cumpProd),
          borderColor: CFG.sip,
          backgroundColor: CFG.sip + '33',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      ...baseOpt,
      plugins: {
        ...baseOpt.plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              const idx = ctx.dataIndex;
              const item = efMes[idx];
              const pct = Number(ctx.raw).toFixed(1) + '%';
              const varStr = item?.dCumpPp !== null && item?.dCumpPp !== undefined
                ? ` · Var: ${item.dCumpPp >= 0 ? '+' : ''}${item.dCumpPp.toFixed(1)} pp vs mes ant.`
                : '';
              const detalle = item ? ` (${fmtN(item.ef)} efectivas / ${fmtN(item.me)} asignadas)` : '';
              return `Cumplimiento: ${pct}${detalle}${varStr}`;
            },
          },
        },
      },
      scales: {
        y: {
          min: 0,
          beginAtZero: true,
          suggestedMax: Math.max(...efMes.map((x: any) => Number(x.cumpProd) || 0), 0) > 0 
            ? Math.ceil(Math.max(...efMes.map((x: any) => Number(x.cumpProd) || 0), 0) / 5) * 5 
            : 100,
          ticks: {
            callback: (v: unknown) => Number(v).toFixed(1) + '%',
          },
        },
      },
    },
  };

  const ingBrigCfg = {
    type: 'line' as const,
    data: {
      labels: meses12,
      datasets: [
        {
          label: 'Prod. Valorizada / brigada',
          data: efMes.map((x: any) => x.ingXbrig),
          borderColor: CFG.sip,
          backgroundColor: CFG.sip + '33',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      ...baseOpt,
      plugins: {
        ...baseOpt.plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              const idx = ctx.dataIndex;
              const item = efMes[idx];
              const cop = fmtCOP(Number(ctx.raw));
              const varStr = item?.dIngBrigPct !== null && item?.dIngBrigPct !== undefined
                ? ` · Var: ${item.dIngBrigPct >= 0 ? '+' : ''}${item.dIngBrigPct.toFixed(1)}% vs mes ant.`
                : '';
              return `Prod. / brigada: ${cop}${varStr}`;
            },
          },
        },
      },
      scales: {
        y: {
          ticks: {
            callback: (v: unknown) => fmtCOP(Number(v)),
          },
        },
      },
    },
  };
  
  // Financieros OTC
  const otcIngCfg = {
    type: 'line' as const,
    data: {
      labels: meses12,
      datasets: [
        {
          label: 'Ingreso Real (OTC)',
          data: evolutivoOTC.map((x: any) => x.ing),
          borderColor: CFG.otc,
          backgroundColor: CFG.otc + '33',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      ...baseOpt,
      plugins: {
        ...baseOpt.plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items: any[]) => {
              if (!items.length) return '';
              const idx = items[0].dataIndex;
              const item = evolutivoOTC[idx];
              const etiqueta = item?.isProvisional ? '(Facturación provisional)' : '(Facturación)';
              return `${items[0].label} ${etiqueta}`;
            },
            label: (ctx: any) => {
              const idx = ctx.dataIndex;
              const item = evolutivoOTC[idx];
              const cop = fmtCOP(Number(ctx.raw));
              const varStr = item?.dIngPct !== null && item?.dIngPct !== undefined
                ? ` · Var: ${item.dIngPct >= 0 ? '+' : ''}${item.dIngPct.toFixed(1)}% vs mes ant.`
                : '';
              const etiqueta = item?.isProvisional ? '(Facturación provisional)' : '(Facturación)';
              return `Ingreso Real ${etiqueta}: ${cop}${varStr}`;
            },
          },
        },
      },
      scales: {
        y: {
          ticks: {
            callback: (v: unknown) => fmtCOP(Number(v)),
          },
        },
      },
    },
  };

  const otcCostCfg = {
    type: 'line' as const,
    data: {
      labels: meses12,
      datasets: [
        {
          label: 'Costo Real (%)',
          data: evolutivoOTC.map((x: any) => x.costoPct),
          borderColor: CFG.err,
          backgroundColor: CFG.err + '33',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      ...baseOpt,
      plugins: {
        ...baseOpt.plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              const idx = ctx.dataIndex;
              const item = evolutivoOTC[idx];
              const pct = Number(ctx.raw).toFixed(1) + '%';
              const cop = item ? fmtCOP(item.cost) : '';
              const varStr = item?.dCostPct !== null && item?.dCostPct !== undefined
                ? ` · Var: ${item.dCostPct >= 0 ? '+' : ''}${item.dCostPct.toFixed(1)}% vs mes ant.`
                : '';
              return `Costo Real: ${pct} (${cop})${varStr}`;
            },
          },
        },
      },
      scales: {
        y: {
          ticks: {
            callback: (v: unknown) => Number(v).toFixed(1) + '%',
          },
        },
      },
    },
  };

  const otcMargenCfg = {
    type: 'line' as const,
    data: {
      labels: meses12,
      datasets: [
        {
          label: 'Margen Real (%)',
          data: evolutivoOTC.map((x: any) => x.margenPct),
          borderColor: CFG.ok,
          backgroundColor: CFG.ok + '33',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      ...baseOpt,
      plugins: {
        ...baseOpt.plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              const idx = ctx.dataIndex;
              const item = evolutivoOTC[idx];
              const pct = Number(ctx.raw).toFixed(1) + '%';
              const cop = item ? fmtCOP(item.margen) : '';
              const varStr = item?.dMargenPp !== null && item?.dMargenPp !== undefined
                ? ` · Var: ${item.dMargenPp >= 0 ? '+' : ''}${item.dMargenPp.toFixed(1)} pp vs mes ant.`
                : '';
              return `Margen Real: ${pct} (${cop})${varStr}`;
            },
          },
        },
      },
      scales: {
        y: {
          ticks: {
            callback: (v: unknown) => Number(v).toFixed(1) + '%',
          },
        },
      },
    },
  };

  // Combustible (Barras Brigadas + Línea Ratio + Línea Gasto Total)
  const combustibleCfg = {
    type: 'bar' as const,
    data: {
      labels: meses12,
      datasets: [
        {
          type: 'bar' as const,
          label: 'Cantidad de brigadas',
          data: evolutivoCombustible.map((x: any) => x.brigadas),
          backgroundColor: 'rgba(57, 73, 171, 0.25)',
          borderColor: 'rgba(57, 73, 171, 0.7)',
          borderWidth: 1.5,
          borderRadius: 4,
          maxBarThickness: 28,
          yAxisID: 'yBrigadas',
          order: 2,
        },
        {
          type: 'line' as const,
          label: 'Gasto Total Combustible (OTC)',
          data: evolutivoCombustible.map((x: any) => x.gastoTotal),
          borderColor: '#C62828',
          backgroundColor: 'rgba(198, 40, 40, 0.08)',
          borderWidth: 3.2,
          pointRadius: 4.5,
          pointHoverRadius: 7,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#C62828',
          pointBorderWidth: 2,
          yAxisID: 'yTotal',
          tension: 0.3,
          fill: false,
          order: 0,
        },
        {
          type: 'line' as const,
          label: 'Ratio Combustible / Brigada',
          data: evolutivoCombustible.map((x: any) => x.ratio),
          borderColor: '#F57C00',
          backgroundColor: '#F57C00',
          borderWidth: 2.5,
          borderDash: [5, 4],
          pointStyle: 'rectRot',
          pointRadius: 4.5,
          pointHoverRadius: 7,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#F57C00',
          pointBorderWidth: 2,
          yAxisID: 'yRatio',
          tension: 0.3,
          fill: false,
          order: 1,
        },
      ],
    },
    options: {
      ...baseOpt,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'bottom' as const,
          labels: { boxWidth: 12, font: { size: 10.5, weight: 600 } },
        },
        tooltip: {
          mode: 'index' as const,
          intersect: false,
          callbacks: {
            label: (ctx: any) => {
              const val = Number(ctx.raw) || 0;
              const item = evolutivoCombustible[ctx.dataIndex];
              if (ctx.dataset.label?.includes('brigadas')) {
                return `Brigadas activas: ${fmtN(val)} brigadas`;
              }
              if (ctx.dataset.label?.includes('Ratio')) {
                const varStr = item?.dRatioPct !== null && item?.dRatioPct !== undefined
                  ? ` (${item.dRatioPct >= 0 ? '+' : ''}${item.dRatioPct.toFixed(1)}% vs mes ant.)`
                  : '';
                return `Ratio por brigada: ${fmtCOP(val)}${varStr}`;
              }
              const varStr = item?.dGastoPct !== null && item?.dGastoPct !== undefined
                ? ` (${item.pctSobreCosto.toFixed(1)}% del costo total · ${item.dGastoPct >= 0 ? '+' : ''}${item.dGastoPct.toFixed(1)}% vs mes ant.)`
                : ` (${item?.pctSobreCosto?.toFixed(1) || 0}% del costo total)`;
              return `Gasto Total: ${fmtCOP(val)}${varStr}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        yTotal: {
          type: 'linear' as const,
          position: 'left' as const,
          beginAtZero: true,
          ticks: { callback: (v: unknown) => fmtCOP(Number(v)) },
          title: { display: true, text: 'Gasto Total COP', font: { size: 10.5, weight: 600 }, color: '#C62828' },
        },
        yRatio: {
          type: 'linear' as const,
          position: 'right' as const,
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: { callback: (v: unknown) => fmtCOP(Number(v)) },
          title: { display: true, text: 'Ratio / Brigada', font: { size: 10.5, weight: 600 }, color: '#F57C00' },
        },
        yBrigadas: {
          type: 'linear' as const,
          position: 'right' as const,
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: { precision: 0, callback: (v: unknown) => `${Number(v)} brig.` },
          title: { display: false },
        },
      },
    },
  };

  const combustibleTable = {
    columns: [
      'Mes',
      'Gasto Neto Combustible (OTC)',
      'Registros Contables',
      'Brigadas Activas (SIPREM)',
      'Ratio Promedio / Brigada',
      'Var % Gasto vs Mes Ant.',
      'Var % Ratio vs Mes Ant.',
    ],
    rows: evolutivoCombustible.map((x: any, idx: number) => {
      const prev = idx > 0 ? evolutivoCombustible[idx - 1] : null;
      const dGasto = prev && prev.gastoTotal > 0 ? (x.gastoTotal - prev.gastoTotal) / prev.gastoTotal : null;
      const dRatio = prev && prev.ratio > 0 ? (x.ratio - prev.ratio) / prev.ratio : null;

      const fmtVar = (v: number | null) => {
        if (v === null || isNaN(v)) return '—';
        const pct = (v * 100).toFixed(1) + '%';
        return v > 0 ? `+${pct}` : pct;
      };

      return [
        x.mes,
        fmtCOP(x.gastoTotal),
        `${x.numRegistros} registros`,
        fmtN(x.brigadas),
        fmtCOP(x.ratio),
        fmtVar(dGasto),
        fmtVar(dRatio),
      ];
    }),
  };

  const buildModalConfig = (metric: 'efic' | 'cumpProd' | 'ingXbrig' | 'costXbrig', kind: 'pct' | 'cop') => {
    const tipos = Array.from(new Set(efMesPorTipo.map((x: any) => x.tipo)));
    const chartColors = colors.series;
    const datasets = tipos.map((tipo, idx) => {
      const arr = meses12.map((m: any) => {
        const v = efMesPorTipo.find((x: any) => x.mes === m && x.tipo === tipo);
        return v ? Number(v[metric] || 0) : 0;
      });
      const c = chartColors[idx % chartColors.length];
      return { label: tipo, data: arr, borderColor: c, backgroundColor: c + '33', fill: false, tension: 0.3 };
    });
    return {
      type: 'line' as const,
      data: { labels: meses12, datasets },
      options: { 
        ...baseOpt, 
        plugins: { ...baseOpt.plugins, legend: { display: true } }, 
        scales: { 
          y: { 
            ...(metric === 'cumpProd' || metric === 'efic' ? { min: 0, beginAtZero: true } : {}),
            ticks: { callback: (v: unknown) => (kind === 'cop' ? fmtCOP(Number(v)) : Number(v).toFixed(1) + '%') } 
          } 
        } 
      },
    };
  };

  const buildTableData = (metric: 'efic' | 'cumpProd' | 'ingXbrig' | 'costXbrig', kind: 'pct' | 'cop') => {
    const tipos = Array.from(new Set(efMesPorTipo.map((x: any) => String(x.tipo)))) as string[];
    const columns: string[] = ['Mes', ...tipos];
    const rows = meses12.map((m: any) => {
      const row: (string | number)[] = [String(m)];
      tipos.forEach(tipo => {
        const v = efMesPorTipo.find((x: any) => x.mes === m && x.tipo === tipo);
        const val = v ? Number(v[metric] || 0) : 0;
        row.push(kind === 'cop' ? fmtCOP(val) : val.toFixed(1) + '%');
      });
      return row;
    });
    return { columns, rows };
  };

  const eficModalCfg = buildModalConfig('efic', 'pct');
  const cumpProdModalCfg = buildModalConfig('cumpProd', 'pct');
  const ingBrigModalCfg = buildModalConfig('ingXbrig', 'cop');
  const costBrigModalCfg = buildModalConfig('costXbrig', 'cop');

  const eficTable = buildTableData('efic', 'pct');
  const cumpProdTable = buildTableData('cumpProd', 'pct');
  const ingBrigTable = buildTableData('ingXbrig', 'cop');
  const costBrigTable = buildTableData('costXbrig', 'cop');

  const cmp: { lbl: string; a: number; b: number; fmt: (v: number) => string }[] = [
    { lbl: 'Producción Valorizada', a: winA.ing, b: winB.ing, fmt: fmtCOP },
    { lbl: 'Efectivas', a: winA.ef, b: winB.ef, fmt: fmtN },
    { lbl: 'Eficiencia', a: (winA.efic ?? 0) * 100, b: (winB.efic ?? 0) * 100, fmt: (v) => v.toFixed(1) + '%' },
    { lbl: 'Brigadas', a: winA.brig, b: winB.brig, fmt: fmtN },
  ];

  return (
    <>
      <div className="section" style={{ marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid var(--border)' }}>
        <h2>📈 Estratégico · Evolutivos</h2>
        <div className="sec-sub">Análisis histórico segmentado por Operación y Resultados Financieros</div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start', gap: 24 }}>
        
        {/* ---------- IZQUIERDA: OPERACIÓN ---------- */}
        <div>
          <div className="section" style={{ borderTop: `4px solid ${CFG.sip}`, padding: '20px 24px', background: 'var(--card)', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h2 style={{ color: CFG.sip, marginBottom: 16 }}>🛠️ OPERACIÓN</h2>
            <div className="sec-sub" style={{ marginBottom: 16 }}>Estimaciones basadas en tarifarios y reportes de terreno</div>
            <div style={{ display: 'grid', gap: 16 }}>
              <ChartCard id="r-efic" title="Evolutivo de Eficiencia %" config={eficCfg as never} modalConfig={eficModalCfg as never} detailTableData={eficTable} height="short" hasDetail />
              <ChartCard id="r-cumpprod" title="Evolutivo de Productividad (Cumplimiento %)" subtitle="Efectivas vs Asignación" config={cumpProdCfg as never} modalConfig={cumpProdModalCfg as never} detailTableData={cumpProdTable} height="short" hasDetail />
              <ChartCard id="r-ingbrig" title="Producción Valorizada (Estimada)" subtitle="Ingreso teórico promedio por brigada y variación % mensual" config={ingBrigCfg as never} modalConfig={ingBrigModalCfg as never} detailTableData={ingBrigTable} height="short" hasDetail />
            </div>
          </div>
        </div>

        {/* ---------- DERECHA: FINANCIERO ---------- */}
        <div>
          <div className="section" style={{ borderTop: `4px solid ${CFG.otc}`, padding: '20px 24px', background: 'var(--card)', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h2 style={{ color: CFG.otc, marginBottom: 16 }}>💰 FINANCIERO</h2>
            <div className="sec-sub" style={{ marginBottom: 16 }}>Datos reales extraídos de la contabilidad (Fuente: OTC)</div>
            <div style={{ display: 'grid', gap: 16 }}>
              <ChartCard id="r-otc-ing" title="Ingreso Real (OTC)" subtitle="Facturación contable consolidada: Ene-May (Facturación) · Jun-Jul (Facturación provisional)" config={otcIngCfg as never} height="short" />
              <ChartCard id="r-otc-cost" title="Costo Real (%) (OTC)" subtitle="Ratio de costo sobre ingresos: Costos / Ingresos" config={otcCostCfg as never} height="short" />
              <ChartCard id="r-otc-mar" title="Margen Real (%)" subtitle="Rentabilidad financiera neta: (Ingresos - Costos) / Ingresos" config={otcMargenCfg as never} height="short" />
              <ChartCard
                id="r-otc-combustible"
                title="Evolutivo de Combustible y Brigadas"
                subtitle="Gasto total (OTC), brigadas activas (SIPREM) y ratio de combustible por brigada"
                config={combustibleCfg as never}
                height="normal"
                hasDetail
                detailTableData={combustibleTable}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Comparativo acumulado a lo ANCHO (alineado a la izquierda), fuera del grid de 2 columnas */}
      <div className="section" style={{ marginTop: 24 }}>
        <h2>⚖️ Comparativo Operativo Acumulado</h2>
        <div className="sec-sub">{selLbl} vs {prevLbl} (ventana previa equivalente)</div>
        {winIncompleto && (
          <div className="status err" style={{ marginBottom: 8 }}>
            ⚠️ La ventana previa tiene menos meses que la actual. Comparativo incompleto.
          </div>
        )}
        <div className="kpi-grid">
          {cmp.map(c => {
            const d = deltaPct(c.a, c.b);
            const up = d !== null && d >= 0;
            return (
              <div key={c.lbl} className="kpi sip">
                <div className="lbl">{c.lbl}</div>
                <div className="val">{c.fmt(c.a)}</div>
                {d !== null
                  ? <div className={`delta ${Math.abs(d) < 0.001 ? 'neu' : up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {(d * 100).toFixed(1)}% vs previa</div>
                  : <div className="delta neu">sin comparativo</div>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}