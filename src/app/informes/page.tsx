'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { useDashboard } from '../components/DashboardProvider';
import { fmtCOP, fmtN, num as n } from '../components/utils/formatters';
import { ButtonMenuOperativo, ExportButton } from '../components/Buttons';
import { useTheme } from '../components/ThemeProvider';

/* ─── Tipos auxiliares ─── */
interface TecnicoProduccion {
  cedula: string;
  nombre: string;
  tipoBrigada: string;
  ordenes: number;
  produccion: number;
  meta: number;
  faltante: number;
}

type Row = Record<string, string | number>;

/* ─── Estilos base ─── */
const card: React.CSSProperties = {
  background: 'var(--panel)',
  borderRadius: 14,
  padding: '18px 20px',
  boxShadow: '0 1px 3px rgba(20,30,60,.05)',
};

// Columnas del informe de digitación (orden y etiqueta visible).
const COLS: { key: string; label: string }[] = [
  { key: 'susp_bornera', label: 'Suspensión bornera' },
  { key: 'susp_tendido', label: 'Suspensión en tendido' },
  { key: 'susp_disponible', label: 'Suspensión disponible' },
  { key: 'reconexion', label: 'Reconexión' },
  { key: 'mantiene', label: 'Se mantiene suspendido' },
  { key: 'pqr', label: 'Normalización PQR' },
  { key: 'fallidas', label: 'Fallidas' },
  { key: 'total', label: 'Total general' },
];

const isDisponibleType = (tLabel: string) => {
  const s = String(tLabel || '').toLowerCase().trim();
  return (
    s.includes('canasta') ||
    s.includes('minicanasta') ||
    s.includes('mini canasta') ||
    s.includes('mt-at') ||
    s.includes('mt at') ||
    s.includes('gestor') ||
    s.includes('disponible') ||
    s.includes('disponibilidad') ||
    s.includes('multi')
  );
};

export default function InformesPage() {
  const { raw, loading: dashLoading, error: dashError } = useDashboard();
  const { colors } = useTheme();
  const INK = colors.ink;
  const MUT = colors.mut;
  const OK = colors.ok;
  const WARN = colors.warn;
  const ERR = colors.err;
  const TEAL = colors.sip;

  // Metadatos globales para selectores
  const [meta, setMeta] = useState<{ zonas: string[]; meses: string[] }>({ zonas: [], meses: [] });

  // ══════════════════════════════════════════════════════════════════
  // INFORME DE PRODUCCIÓN (Estado independiente)
  // ══════════════════════════════════════════════════════════════════
  const [prodAbierto, setProdAbierto] = useState(false);
  const [prodZona, setProdZona] = useState('');
  const [prodMes, setProdMes] = useState('');
  const [prodFecha, setProdFecha] = useState('');
  const [prodTipo, setProdTipo] = useState<'operativas' | 'disponibles' | ''>('');
  const [prodViewMode, setProdViewMode] = useState<'tecnico' | 'operativa'>('tecnico');
  const [prodGenerado, setProdGenerado] = useState(false);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodError, setProdError] = useState<string | null>(null);
  const [prodData, setProdData] = useState<{
    rows: TecnicoProduccion[];
    totales: { ordenes: number; produccion: number; meta: number; faltante: number };
    filtrosAplicados: {
      zona: string;
      mes: string;
      fecha: string;
      tipo: string;
      viewMode: 'tecnico' | 'operativa';
    };
  } | null>(null);

  // ══════════════════════════════════════════════════════════════════
  // INFORME DE DIGITACIÓN (Estado independiente)
  // ══════════════════════════════════════════════════════════════════
  const [digAbierto, setDigAbierto] = useState(false);
  const [digZona, setDigZona] = useState('');
  const [digMes, setDigMes] = useState('');
  const [digFecha, setDigFecha] = useState('');
  const [digHoraDesde, setDigHoraDesde] = useState('');
  const [digHoraHasta, setDigHoraHasta] = useState('');
  const [digTipo, setDigTipo] = useState<'operativas' | 'disponibles' | ''>('');
  const [digPorTecnico, setDigPorTecnico] = useState(false);
  const [digRows, setDigRows] = useState<Row[]>([]);
  const [digTienePorTecnico, setDigTienePorTecnico] = useState(false);
  const [digLoading, setDigLoading] = useState(false);
  const [digError, setDigError] = useState<string | null>(null);
  const [digGenerado, setDigGenerado] = useState(false);

  // Carga de metadatos iniciales
  useEffect(() => {
    fetch('/api/informes/digitacion?meta=1')
      .then(r => r.json())
      .then(d => {
        const zonas = d.zonas || [];
        const meses = d.meses || [];
        setMeta({ zonas, meses });
        if (meses.length) {
          setProdMes(prev => prev || meses[0]);
          setDigMes(prev => prev || meses[0]);
        }
      })
      .catch(() => {});
  }, []);

  // Meses y Zonas disponibles (usando meta o extrayendo de raw)
  const availableMeses = useMemo(() => {
    if (meta.meses.length) return meta.meses;
    if (!raw?.raw) return [];
    const set = new Set<string>();
    raw.raw.forEach(r => {
      if (r.Fecha) set.add(String(r.Fecha).slice(0, 7));
    });
    return Array.from(set).sort().reverse();
  }, [meta.meses, raw]);

  const availableZonas = useMemo(() => {
    if (meta.zonas.length) return meta.zonas;
    if (!raw?.raw) return [];
    const set = new Set<string>();
    raw.raw.forEach(r => {
      const z = r.Zona || r._Zona || r.Zona_Detalle;
      if (z) set.add(String(z));
    });
    return Array.from(set).sort();
  }, [meta.zonas, raw]);

  // ── Lógica Informe de Producción ──────────────────────────────────
  const generarProd = () => {
    if (!prodMes) {
      setProdError('Selecciona un mes para el informe de producción.');
      return;
    }
    setProdLoading(true);
    setProdError(null);
    setProdGenerado(true);

    try {
      if (!raw?.raw || !raw.raw.length) {
        setProdData({
          rows: [],
          totales: { ordenes: 0, produccion: 0, meta: 0, faltante: 0 },
          filtrosAplicados: {
            zona: prodZona,
            mes: prodMes,
            fecha: prodFecha,
            tipo: prodTipo,
            viewMode: prodViewMode,
          },
        });
        return;
      }

      // Filtrar registros
      const filtered = raw.raw.filter(r => {
        const fStr = String(r.Fecha || '');
        // Filtro Mes
        if (prodMes && !fStr.startsWith(prodMes)) return false;
        // Filtro Día
        if (prodFecha && fStr.slice(0, 10) !== prodFecha) return false;
        // Filtro Zona
        if (prodZona) {
          const zMatch =
            String(r.Zona || '').toLowerCase() === prodZona.toLowerCase() ||
            String(r._Zona || '').toLowerCase() === prodZona.toLowerCase() ||
            String(r._ZonaDet || '').toLowerCase() === prodZona.toLowerCase() ||
            String(r.Zona_Detalle || '').toLowerCase() === prodZona.toLowerCase();
          if (!zMatch) return false;
        }
        // Filtro Tipo de brigada
        if (prodTipo) {
          const brigLabel = String(r.Tipo_Brigada_Operaciones || r.Tipo_Brigada_Mes || r.Tipo_Cuadrilla || '');
          const isDisp = isDisponibleType(brigLabel);
          if (prodTipo === 'disponibles' && !isDisp) return false;
          if (prodTipo === 'operativas' && isDisp) return false;
        }
        return true;
      });

      // Agrupar datos según prodViewMode
      const agg = new Map<string, {
        nombre: string;
        tipoBrigada: string;
        ordenes: number;
        produccion: number;
        meta: number;
      }>();

      filtered.forEach(r => {
        const key =
          prodViewMode === 'tecnico'
            ? String(r.Cedula || r.Nombre || 'SIN_CEDULA')
            : String(r.Tipo_Brigada_Operaciones || r.Tipo_Brigada_Mes || r.Tipo_Cuadrilla || 'SIN CLASIFICAR');

        let acc = agg.get(key);
        if (!acc) {
          acc = {
            nombre:
              prodViewMode === 'tecnico'
                ? String(r.Nombre || r.tecnico || 'Desconocido')
                : key,
            tipoBrigada:
              prodViewMode === 'tecnico'
                ? String(r.Tipo_Brigada_Operaciones || r.Tipo_Brigada_Mes || r.Tipo_Cuadrilla || '—')
                : key,
            ordenes: 0,
            produccion: 0,
            meta: 0,
          };
          agg.set(key, acc);
        }

        // Sumar órdenes (efectivas + fallidas con pago + fallidas sin pago + perdidas)
        acc.ordenes += n(r.Efectivas) + n(r.Fallida_Con_Pago) + n(r.Fallida_Sin_Pago) + n(r.Perdidas);
        // Sumar producción valorizada
        acc.produccion += n(r.Valor_Orden);
        // Sumar meta
        acc.meta += n(r.Meta_Facturacion);

        if (prodViewMode === 'tecnico' && r.Nombre && String(r.Nombre).trim()) {
          acc.nombre = String(r.Nombre);
        }
      });

      const rows: TecnicoProduccion[] = Array.from(agg.entries())
        .map(([key, acc]) => ({
          cedula: prodViewMode === 'tecnico' ? key : '',
          nombre: acc.nombre,
          tipoBrigada: acc.tipoBrigada,
          ordenes: acc.ordenes,
          produccion: acc.produccion,
          meta: acc.meta,
          faltante: Math.max(0, acc.meta - acc.produccion),
        }))
        .sort((a, b) => b.produccion - a.produccion);

      const totales = rows.reduce(
        (t, r) => ({
          ordenes: t.ordenes + r.ordenes,
          produccion: t.produccion + r.produccion,
          meta: t.meta + r.meta,
          faltante: t.faltante + r.faltante,
        }),
        { ordenes: 0, produccion: 0, meta: 0, faltante: 0 }
      );

      setProdData({
        rows,
        totales,
        filtrosAplicados: {
          zona: prodZona,
          mes: prodMes,
          fecha: prodFecha,
          tipo: prodTipo,
          viewMode: prodViewMode,
        },
      });
    } catch (e) {
      setProdError(String(e instanceof Error ? e.message : e));
    } finally {
      setProdLoading(false);
    }
  };

  // ── Lógica Informe de Digitación ──────────────────────────────────
  const generarDig = async () => {
    if (!digMes) {
      setDigError('Selecciona un mes para el informe de digitación.');
      return;
    }
    setDigLoading(true);
    setDigError(null);
    setDigGenerado(true);
    try {
      const qs = new URLSearchParams({ mes: digMes });
      if (digZona) qs.set('zona', digZona);
      if (digFecha) qs.set('fecha', digFecha);
      if (digHoraDesde && digHoraHasta) {
        qs.set('horaDesde', digHoraDesde);
        qs.set('horaHasta', digHoraHasta);
      }
      if (digTipo) qs.set('tipo', digTipo);
      if (digPorTecnico) qs.set('porTecnico', '1');

      const res = await fetch('/api/informes/digitacion?' + qs.toString());
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setDigRows(d.rows || []);
      setDigTienePorTecnico(!!d.porTecnico);
    } catch (e) {
      setDigError(String(e instanceof Error ? e.message : e));
      setDigRows([]);
    } finally {
      setDigLoading(false);
    }
  };

  // Totales de Digitación
  const digTotales = useMemo(() => {
    const t: Record<string, number> = {};
    for (const c of COLS) {
      t[c.key] = digRows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
    }
    return t;
  }, [digRows]);

  // ── Helper de Descarga ────────────────────────────────────────────
  const descargar = (contenido: BlobPart, mime: string, ext: string, nombre: string) => {
    const blob = new Blob([contenido], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nombre}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ── Exportación Producción ────────────────────────────────────────
  const nombreArchivoProd = () => {
    const f = prodData?.filtrosAplicados;
    const mesStr = f?.mes || prodMes;
    const fechaStr = f?.fecha ? `_${f.fecha}` : '';
    const zonaStr = f?.zona ? `_${f.zona}` : '';
    const modeStr = f?.viewMode || prodViewMode;
    return `informe_produccion_${mesStr}${fechaStr}${zonaStr}_${modeStr}`;
  };

  const filasExportProd = () => {
    if (!prodData?.rows?.length) return [];
    const isTecnico = (prodData.filtrosAplicados?.viewMode || prodViewMode) === 'tecnico';
    const dataFilas = prodData.rows.map(r => {
      const o: Record<string, string | number> = {};
      if (isTecnico) {
        o['Cédula'] = r.cedula;
        o['Técnico'] = r.nombre;
        o['Tipo Operativa'] = r.tipoBrigada;
      } else {
        o['Operativa'] = r.tipoBrigada;
      }
      o['Órdenes'] = r.ordenes;
      o['Producción ($)'] = r.produccion;
      o['Meta del Día ($)'] = r.meta;
      o['Faltante ($)'] = r.faltante;
      const pct = r.meta > 0 ? ((r.produccion / r.meta) * 100).toFixed(1) + '%' : '0%';
      o['Cumplimiento'] = pct;
      return o;
    });

    // Fila de totales incluida en la exportación
    const filaTotales: Record<string, string | number> = {};
    if (isTecnico) {
      filaTotales['Cédula'] = 'TOTAL';
      filaTotales['Técnico'] = `TOTAL (${prodData.rows.length} técnicos)`;
      filaTotales['Tipo Operativa'] = '';
    } else {
      filaTotales['Operativa'] = `TOTAL (${prodData.rows.length} operativas)`;
    }
    filaTotales['Órdenes'] = prodData.totales.ordenes;
    filaTotales['Producción ($)'] = prodData.totales.produccion;
    filaTotales['Meta del Día ($)'] = prodData.totales.meta;
    filaTotales['Faltante ($)'] = prodData.totales.faltante;
    const totPct = prodData.totales.meta > 0 ? ((prodData.totales.produccion / prodData.totales.meta) * 100).toFixed(1) + '%' : '0%';
    filaTotales['Cumplimiento'] = totPct;

    dataFilas.push(filaTotales);
    return dataFilas;
  };

  const exportCSVProd = () => {
    const csv = Papa.unparse(filasExportProd(), { delimiter: ',' });
    descargar('﻿' + csv, 'text/csv;charset=utf-8;', 'csv', nombreArchivoProd());
  };

  const exportExcelProd = () => {
    const data = filasExportProd();
    const cols = data.length ? Object.keys(data[0]) : [];
    const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const thead = '<tr>' + cols.map(c => `<th style="background:#0284c7;color:#fff;font-weight:bold;padding:6px 10px;">${esc(c)}</th>`).join('') + '</tr>';
    const tbody = data.map((r, idx) => {
      const isLast = idx === data.length - 1;
      const bg = isLast ? 'background:#e2e8f0;font-weight:bold;' : '';
      return `<tr style="${bg}">` + cols.map(c => `<td style="padding:5px 8px;">${esc(r[c])}</td>`).join('') + '</tr>';
    }).join('');
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1">${thead}${tbody}</table></body></html>`;
    descargar(html, 'application/vnd.ms-excel', 'xlsx', nombreArchivoProd());
  };

  // ── Exportación Digitación ────────────────────────────────────────
  const nombreArchivoDig = () =>
    `informe_digitacion_${digMes}${digFecha ? '_' + digFecha : ''}${digTipo ? '_' + digTipo : ''}${digPorTecnico ? '_tecnico' : ''}`;

  const filasExportDig = () =>
    digRows.map(r => {
      const o: Record<string, string | number> = { Fecha: String(r.fecha).slice(0, 10) };
      if (digTienePorTecnico) o['Técnico'] = String(r.tecnico ?? r.id_tecnico ?? '');
      o['Zona'] = String(r.zona ?? '');
      o['Tipo de brigada'] = String(r.brigada ?? '');
      for (const c of COLS) o[c.label] = Number(r[c.key]) || 0;
      return o;
    });

  const exportCSVDig = () => {
    const csv = Papa.unparse(filasExportDig(), { delimiter: ';' });
    descargar('﻿' + csv, 'text/csv;charset=utf-8;', 'csv', nombreArchivoDig());
  };

  const exportExcelDig = () => {
    const data = filasExportDig();
    const cols = data.length ? Object.keys(data[0]) : ['Fecha', ...COLS.map(c => c.label)];
    const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const thead = '<tr>' + cols.map(c => `<th style="background:#0284c7;color:#fff;font-weight:bold;padding:6px 10px;">${esc(c)}</th>`).join('') + '</tr>';
    const tbody = data.map(r => '<tr>' + cols.map(c => `<td>${esc(r[c])}</td>`).join('') + '</tr>').join('');
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1">${thead}${tbody}</table></body></html>`;
    descargar(html, 'application/vnd.ms-excel', 'xlsx', nombreArchivoDig());
  };

  /* ─── Color semáforo para el faltante ─── */
  const colorFaltante = (faltante: number, metaVal: number) => {
    if (metaVal <= 0) return MUT;
    const pct = faltante / metaVal;
    if (pct <= 0) return OK;      // Cumplió o superó la meta
    if (pct < 0.3) return WARN;   // Falta menos del 30%
    return ERR;                    // Falta 30% o más
  };

  /* ─── Cumplimiento % ─── */
  const pctCumplimiento = (produccion: number, metaVal: number) => {
    if (metaVal <= 0) return 0;
    return Math.min((produccion / metaVal) * 100, 999);
  };

  /* ─── Estilos de tabla ─── */
  const thStyle: React.CSSProperties = {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: MUT,
    borderBottom: '2px solid var(--border)',
    position: 'sticky',
    top: 0,
    background: 'var(--panel)',
    zIndex: 1,
  };

  const thStyleRight: React.CSSProperties = { ...thStyle, textAlign: 'right' };

  const tdStyle: React.CSSProperties = {
    padding: '10px 14px',
    fontSize: 13,
    color: INK,
    borderBottom: '1px solid var(--border)',
  };

  const tdStyleRight: React.CSSProperties = {
    ...tdStyle,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  };

  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: MUT, marginBottom: 4, display: 'block', letterSpacing: 0.3 };
  const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-body)', fontSize: 13 };
  const btn = (bg: string): React.CSSProperties => ({ padding: '8px 16px', borderRadius: 8, border: 'none', background: bg, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' });
  const th: React.CSSProperties = { padding: '9px 10px', fontSize: 11, fontWeight: 800, color: 'var(--text-title)', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '2px solid var(--border)' };
  const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-body)' };

  if (dashLoading) {
    return <div className="loading-wrap"><div className="spinner" /><span>Cargando datos…</span></div>;
  }
  if (dashError) {
    return <div className="status err">{dashError}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ButtonMenuOperativo />

      <div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, color: INK }}>INFORMES</div>
        <div style={{ fontSize: 12.5, color: MUT, marginTop: 2 }}>Módulo de informes y reportes operativos</div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ═══ INFORME DE PRODUCCIÓN ═══ */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <button
        onClick={() => setProdAbierto(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer',
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px',
        }}
      >
        <span style={{ fontSize: 26 }}>💰</span>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: INK }}>Informe de producción</span>
          <span style={{ fontSize: 12, color: MUT }}>Producción valorizada, meta del día y faltante por técnico u operativa</span>
        </span>
        <span style={{ marginLeft: 'auto', color: MUT, fontSize: 13 }}>{prodAbierto ? '▲' : '▼'}</span>
      </button>

      {/* Panel de filtros de Producción */}
      {prodAbierto && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
            <div>
              <label style={lbl}>ZONA</label>
              <select style={inp} value={prodZona} onChange={e => setProdZona(e.target.value)}>
                <option value="">Todas</option>
                {availableZonas.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>MES</label>
              <select style={inp} value={prodMes} onChange={e => { setProdMes(e.target.value); setProdFecha(''); }}>
                {availableMeses.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>DÍA (opcional)</label>
              <input
                key={prodMes}
                type="date"
                style={inp}
                value={prodFecha}
                min={prodMes ? `${prodMes}-01` : undefined}
                max={prodMes ? `${prodMes}-${String(new Date(Number(prodMes.slice(0, 4)), Number(prodMes.slice(5, 7)), 0).getDate()).padStart(2, '0')}` : undefined}
                onChange={e => setProdFecha(e.target.value)}
              />
            </div>
            <div>
              <label style={lbl}>TIPO DE BRIGADA</label>
              <select style={inp} value={prodTipo} onChange={e => setProdTipo(e.target.value as typeof prodTipo)}>
                <option value="">Ambas</option>
                <option value="operativas">Operativas</option>
                <option value="disponibles">Disponibles</option>
              </select>
            </div>
            <div>
              <label style={lbl}>AGRUPACIÓN</label>
              <select style={inp} value={prodViewMode} onChange={e => setProdViewMode(e.target.value as 'tecnico' | 'operativa')}>
                <option value="tecnico">Por Técnico</option>
                <option value="operativa">Por Tipo de Operativa</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={btn(colors.sip)} onClick={generarProd} disabled={prodLoading}>
              {prodLoading ? 'Generando…' : 'Generar informe'}
            </button>
            {prodData && prodData.rows.length > 0 && (
              <>
                <button style={btn(colors.ok)} onClick={exportExcelProd}>⬇ Excel</button>
                <button style={btn(colors.otc)} onClick={exportCSVProd}>⬇ CSV</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Error de producción */}
      {prodAbierto && prodError && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, color: colors.err, fontSize: 13 }}>
          ⚠ {prodError}
        </div>
      )}

      {/* Resultados del Informe de Producción */}
      {prodAbierto && prodGenerado && !prodError && (
        <>
          {!prodData || prodData.rows.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: MUT }}>
              <span style={{ fontSize: 32 }}>📊</span>
              <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginTop: 8 }}>
                Sin datos para los filtros seleccionados
              </div>
              <div style={{ fontSize: 12.5, marginTop: 4 }}>
                Ajusta los filtros para ver el informe de producción.
              </div>
            </div>
          ) : (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              {/* Encabezado / Resumen superior */}
              <div style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--border)',
                fontSize: 13.5,
                fontWeight: 700,
                color: INK,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10,
              }}>
                <div>
                  Producción {prodData.filtrosAplicados.mes}
                  {prodData.filtrosAplicados.fecha ? ` · ${prodData.filtrosAplicados.fecha}` : ''}
                  {prodData.filtrosAplicados.zona ? ` · ${prodData.filtrosAplicados.zona}` : ''}
                  {prodData.filtrosAplicados.tipo ? ` · ${prodData.filtrosAplicados.tipo}` : ''}
                  <span style={{ fontWeight: 500, color: MUT }}>
                    {' — '}{prodData.rows.length} {prodData.filtrosAplicados.viewMode === 'tecnico' ? 'técnicos' : 'operativas'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <ExportButton format="excel" onClick={exportExcelProd} />
                  <ExportButton format="csv" onClick={exportCSVProd} />
                </div>
              </div>

              {/* Resumen KPIs superior */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 0,
                borderBottom: '2px solid var(--border)',
              }}>
                {[{
                  label: prodData.filtrosAplicados.viewMode === 'tecnico' ? 'Técnicos' : 'Operativas',
                  value: fmtN(prodData.rows.length),
                  color: TEAL,
                },
                { label: 'Total Órdenes', value: fmtN(prodData.totales.ordenes), color: INK },
                { label: 'Producción Total', value: fmtCOP(prodData.totales.produccion), color: OK },
                { label: 'Meta Total', value: fmtCOP(prodData.totales.meta), color: INK },
                { label: 'Faltante Total', value: fmtCOP(prodData.totales.faltante), color: colorFaltante(prodData.totales.faltante, prodData.totales.meta) }]
                  .map((item, i) => (
                    <div key={i} style={{
                      padding: '16px 20px',
                      borderRight: i < 4 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.7, textTransform: 'uppercase', color: MUT }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: item.color, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                        {item.value}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Tabla */}
              <div style={{ maxHeight: 520, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, width: 40 }}>#</th>
                      {prodData.filtrosAplicados.viewMode === 'tecnico' ? (
                        <>
                          <th style={thStyle}>Técnico</th>
                          <th style={thStyle}>Tipo Operativa</th>
                        </>
                      ) : (
                        <th style={thStyle}>Operativa</th>
                      )}
                      <th style={thStyleRight}># Órdenes</th>
                      <th style={thStyleRight}>Producción ($)</th>
                      <th style={thStyleRight}>Meta del Día</th>
                      <th style={thStyleRight}>Faltante</th>
                      <th style={{ ...thStyleRight, width: 80 }}>Cumpl.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prodData.rows.map((row, idx) => {
                      const cumpl = pctCumplimiento(row.produccion, row.meta);
                      const fColor = colorFaltante(row.faltante, row.meta);
                      const cumplColor = cumpl >= 100 ? OK : cumpl >= 70 ? WARN : ERR;
                      return (
                        <tr
                          key={idx}
                          style={{ transition: 'background .15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ ...tdStyle, color: MUT, fontSize: 11, fontWeight: 600 }}>{idx + 1}</td>
                          {prodData.filtrosAplicados.viewMode === 'tecnico' ? (
                            <>
                              <td style={tdStyle}>{row.nombre}</td>
                              <td style={tdStyle}>{row.tipoBrigada}</td>
                            </>
                          ) : (
                            <td style={tdStyle}>{row.tipoBrigada}</td>
                          )}
                          <td style={tdStyleRight}><span style={{ fontWeight: 600 }}>{fmtN(row.ordenes)}</span></td>
                          <td style={{ ...tdStyleRight, fontWeight: 700, color: OK }}>{fmtCOP(row.produccion)}</td>
                          <td style={{ ...tdStyleRight, fontWeight: 600 }}>{fmtCOP(row.meta)}</td>
                          <td style={{ ...tdStyleRight, fontWeight: 700, color: fColor }}>{row.faltante > 0 ? fmtCOP(row.faltante) : '✓ $0'}</td>
                          <td style={tdStyleRight}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              color: cumplColor,
                              background: cumplColor + '18',
                            }}>
                              {cumpl.toFixed(0)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Totales */}
                  <tfoot>
                    <tr style={{ background: 'var(--hover-bg)' }}>
                      <td style={{ ...tdStyle, fontWeight: 800, fontSize: 12 }} colSpan={prodData.filtrosAplicados.viewMode === 'tecnico' ? 3 : 2}>
                        TOTALES ({prodData.rows.length} {prodData.filtrosAplicados.viewMode === 'tecnico' ? 'técnicos' : 'operativas'})
                      </td>
                      <td style={{ ...tdStyleRight, fontWeight: 800 }}>{fmtN(prodData.totales.ordenes)}</td>
                      <td style={{ ...tdStyleRight, fontWeight: 800, color: OK }}>{fmtCOP(prodData.totales.produccion)}</td>
                      <td style={{ ...tdStyleRight, fontWeight: 800 }}>{fmtCOP(prodData.totales.meta)}</td>
                      <td style={{ ...tdStyleRight, fontWeight: 800, color: colorFaltante(prodData.totales.faltante, prodData.totales.meta) }}>
                        {prodData.totales.faltante > 0 ? fmtCOP(prodData.totales.faltante) : '✓ $0'}
                      </td>
                      <td style={tdStyleRight}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          color: pctCumplimiento(prodData.totales.produccion, prodData.totales.meta) >= 100 ? OK : pctCumplimiento(prodData.totales.produccion, prodData.totales.meta) >= 70 ? WARN : ERR,
                          background: (pctCumplimiento(prodData.totales.produccion, prodData.totales.meta) >= 100 ? OK : pctCumplimiento(prodData.totales.produccion, prodData.totales.meta) >= 70 ? WARN : ERR) + '18',
                        }}>
                          {pctCumplimiento(prodData.totales.produccion, prodData.totales.meta).toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ═══ INFORME DE DIGITACIÓN ═══ */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <button
        onClick={() => setDigAbierto(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer',
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px',
        }}
      >
        <span style={{ fontSize: 26 }}>📋</span>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: INK }}>Informe digitación</span>
          <span style={{ fontSize: 12, color: MUT }}>Órdenes digitadas por día y tipo de orden</span>
        </span>
        <span style={{ marginLeft: 'auto', color: MUT, fontSize: 13 }}>{digAbierto ? '▲' : '▼'}</span>
      </button>

      {/* Panel de filtros de Digitación */}
      {digAbierto && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
            <div>
              <label style={lbl}>ZONA</label>
              <select style={inp} value={digZona} onChange={e => setDigZona(e.target.value)}>
                <option value="">Todas</option>
                {meta.zonas.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>MES</label>
              <select style={inp} value={digMes} onChange={e => { setDigMes(e.target.value); setDigFecha(''); }}>
                {meta.meses.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>DÍA (opcional)</label>
              <input
                key={digMes}
                type="date"
                style={inp}
                value={digFecha}
                min={digMes ? `${digMes}-01` : undefined}
                max={digMes ? `${digMes}-${String(new Date(Number(digMes.slice(0, 4)), Number(digMes.slice(5, 7)), 0).getDate()).padStart(2, '0')}` : undefined}
                onChange={e => setDigFecha(e.target.value)}
              />
            </div>
            <div>
              <label style={lbl}>HORA DESDE</label>
              <input type="time" style={inp} value={digHoraDesde} onChange={e => setDigHoraDesde(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>HORA HASTA</label>
              <input type="time" style={inp} value={digHoraHasta} onChange={e => setDigHoraHasta(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>TIPO DE BRIGADA</label>
              <select style={inp} value={digTipo} onChange={e => setDigTipo(e.target.value as typeof digTipo)}>
                <option value="">Ambas</option>
                <option value="operativas">Operativas</option>
                <option value="disponibles">Disponibles</option>
              </select>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-body)', cursor: 'pointer' }}>
            <input type="checkbox" checked={digPorTecnico} onChange={e => setDigPorTecnico(e.target.checked)} />
            Discriminar por técnico
          </label>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button style={btn(colors.sip)} onClick={generarDig} disabled={digLoading}>
              {digLoading ? 'Generando…' : 'Generar informe'}
            </button>
            {digRows.length > 0 && (
              <>
                <button style={btn(colors.ok)} onClick={exportExcelDig}>⬇ Excel</button>
                <button style={btn(colors.otc)} onClick={exportCSVDig}>⬇ CSV</button>
              </>
            )}
          </div>
          {(digHoraDesde && !digHoraHasta) || (!digHoraDesde && digHoraHasta) ? (
            <div style={{ fontSize: 11.5, color: colors.warn }}>Para filtrar por hora indica DESDE y HASTA; si no, se ignora.</div>
          ) : null}
        </div>
      )}

      {/* Error de digitación */}
      {digAbierto && digError && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, color: colors.err, fontSize: 13 }}>
          ⚠ {digError}
        </div>
      )}

      {/* Resultados de Digitación */}
      {digAbierto && digGenerado && !digError && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13.5, fontWeight: 700, color: INK }}>
            Digitación {digMes}{digFecha ? ` · ${digFecha}` : ''}{digZona ? ` · ${digZona}` : ''}{digTipo ? ` · ${digTipo}` : ''}
            <span style={{ fontWeight: 500, color: MUT }}> — {digRows.length} filas</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            {digRows.length === 0 && !digLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: MUT, fontSize: 13 }}>Sin datos para los filtros seleccionados.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: digTienePorTecnico ? 1180 : 1020 }}>
                <thead>
                  <tr style={{ background: 'rgba(128,128,128,0.16)' }}>
                    <th style={{ ...th, textAlign: 'left' }}>Fecha</th>
                    {digTienePorTecnico && <th style={{ ...th, textAlign: 'left' }}>Técnico</th>}
                    <th style={{ ...th, textAlign: 'left' }}>Zona</th>
                    <th style={{ ...th, textAlign: 'left' }}>Tipo de brigada</th>
                    {COLS.map(c => <th key={c.key} style={th}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {digRows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: INK }}>{String(r.fecha).slice(0, 10)}</td>
                      {digTienePorTecnico && (
                        <td style={{ ...td, textAlign: 'left', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(r.tecnico ?? '')}>
                          {String(r.tecnico ?? r.id_tecnico ?? '')}
                        </td>
                      )}
                      <td style={{ ...td, textAlign: 'left', color: 'var(--text-body)' }}>{String(r.zona ?? '')}</td>
                      <td style={{ ...td, textAlign: 'left', color: 'var(--text-body)' }}>{String(r.brigada ?? '')}</td>
                      {COLS.map(c => (
                        <td key={c.key} style={{ ...td, fontWeight: c.key === 'total' ? 800 : 400, color: c.key === 'total' ? INK : (c.key === 'fallidas' ? colors.err : 'var(--text-body)') }}>
                          {Number(r[c.key]) || 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {digRows.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--bg-soft, rgba(127,127,127,.08))', borderTop: '2px solid var(--border)' }}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 800, color: INK }}>TOTAL</td>
                      {digTienePorTecnico && <td style={td} />}
                      <td style={td} />
                      <td style={td} />
                      {COLS.map(c => <td key={c.key} style={{ ...td, fontWeight: 800, color: INK }}>{digTotales[c.key]}</td>)}
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
