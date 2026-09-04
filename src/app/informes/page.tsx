'use client';


import { useMemo } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { filtRaw } from '../components/utils/filters';
import { fmtCOP, fmtN, num as n } from '../components/utils/formatters';

import React, { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { ButtonMenuOperativo, SegmentedControl, ExportButton } from '../components/Buttons';

import { useTheme } from '../components/ThemeProvider';
// removed duplicate import

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

/* ─── Estilos ─── */
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

type Row = Record<string, string | number>;

export default function InformesPage() {
  const { raw, filters, loading, error } = useDashboard();
  const { colors } = useTheme();
  const INK = colors.ink;
  const MUT = colors.mut;
  const OK = colors.ok;
  const WARN = colors.warn;
  const ERR = colors.err;
  const TEAL = colors.sip;

  // ── Cálculo del informe de producción ──
  const [prodParams, setProdParams] = useState<any>(null);

  const generarProduccion = async () => {
    if (!prodMes) { setError('Selecciona un mes para producción.'); return; }
    // Build filter object based on production filters
    const f = {
      ...filters,
      zona: prodZona,
      mes: prodMes,
      fecha: prodFecha,
      tipo: prodTipo,
      horaDesde: '',
      horaHasta: '',
    };
    setProdParams(f);
    setProdGenerado(true);
  };

  const informe = useMemo(() => {
    if (!raw || !prodParams) return null;
    const rawF = filtRaw(raw.raw, prodParams);
    if (!rawF.length) return null;

    // Agrupar datos según modo de vista
    const agg = new Map<string, {
      nombre: string;
      tipoBrigada: string;
      ordenes: number;
      produccion: number;
      meta: number;
    }>();

    rawF.forEach(r => {
      const key =
        viewMode === 'tecnico'
          ? String(r.Cedula || 'SIN_CEDULA')
          : String(r.Tipo_Brigada_Operaciones || r.Tipo_Brigada_Mes || '—');

      let acc = agg.get(key);
      if (!acc) {
        acc = {
          nombre:
            viewMode === 'tecnico'
              ? String(r.Nombre || 'Desconocido')
              : String(r.Tipo_Brigada_Operaciones || r.Tipo_Brigada_Mes || '—'),
          tipoBrigada:
            viewMode === 'tecnico'
              ? String(r.Tipo_Brigada_Operaciones || r.Tipo_Brigada_Mes || '—')
              : '',
          ordenes: 0,
          produccion: 0,
          meta: 0,
        };
        agg.set(key, acc);
      }

      // Compute orders as sum of efectivas, fallidas (con y sin pago) y perdidas
      acc.ordenes += n(r.Efectivas) + n(r.Fallida_Con_Pago) + n(r.Fallida_Sin_Pago) + n(r.Perdidas);
      // Use Valor_Orden for producción monetaria
      acc.produccion += n(r.Valor_Orden);
      // Update meta
      acc.meta += n(r.Meta_Facturacion);

      // Update nombre only for técnico view
      if (viewMode === 'tecnico' && r.Nombre && String(r.Nombre).trim()) {
        acc.nombre = String(r.Nombre);
      }
    });

    // Convertir a array con faltante calculado
    const rows: TecnicoProduccion[] = Array.from(agg.entries())
      .map(([cedula, acc]) => ({
        cedula,
        nombre: acc.nombre,
        tipoBrigada: acc.tipoBrigada,
        ordenes: acc.ordenes,
        produccion: acc.produccion,
        meta: acc.meta,
        faltante: Math.max(0, acc.meta - acc.produccion),
      }))
      .sort((a, b) => b.produccion - a.produccion); // Mayor producción primero

    // Totales
    const totales = rows.reduce(
      (t, r) => ({
        ordenes: t.ordenes + r.ordenes,
        produccion: t.produccion + r.produccion,
        meta: t.meta + r.meta,
        faltante: t.faltante + r.faltante,
      }),
      { ordenes: 0, produccion: 0, meta: 0, faltante: 0 }
    );

    return { rows, totales };
  }, [raw, filters]);

  /* ─── Color semáforo para el faltante ─── */
  const colorFaltante = (faltante: number, meta: number) => {
    if (meta <= 0) return MUT;
    const pct = faltante / meta;
    if (pct <= 0) return OK;      // Cumplió o superó la meta
    if (pct < 0.3) return WARN;   // Falta menos del 30%
    return ERR;                    // Falta 30% o más
  };

  /* ─── Cumplimiento % ─── */
  const pctCumplimiento = (produccion: number, meta: number) => {
    if (meta <= 0) return 0;
    return Math.min((produccion / meta) * 100, 999);
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

  const secH: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: TEAL,
    margin: '24px 2px 12px',
  };

  /* ─── Render ─── */
  if (loading) return <div className="loading-wrap"><div className="spinner" /><span>Cargando…</span></div>;
  if (error) return <div className="status err">{error}</div>;

  const [abierto, setAbierto] = useState(false);
  const [meta, setMeta] = useState<{ zonas: string[]; meses: string[] }>({ zonas: [], meses: [] });

  // Filtros producción (independientes)
  const [prodZona, setProdZona] = useState(''); // '' = Todas
  const [prodMes, setProdMes] = useState('');
  const [prodFecha, setProdFecha] = useState(''); // '' = todo el mes
  const [prodTipo, setProdTipo] = useState<'operativas' | 'disponibles' | ''>(''); // '' = ambas
  const [prodGenerado, setProdGenerado] = useState(false);

  const [zona, setZona] = useState('');       // '' = Todas
  const [mes, setMes] = useState('');
  const [fecha, setFecha] = useState('');     // '' = todo el mes
  const [horaDesde, setHoraDesde] = useState('');
  const [horaHasta, setHoraHasta] = useState('');
  const [tipo, setTipo] = useState<'operativas' | 'disponibles' | ''>('');  // '' = ambas
  const [porTecnico, setPorTecnico] = useState(false);

  // Resultado
const [viewMode, setViewMode] = useState<'tecnico' | 'operativa'>('tecnico');
const [prodAbierto, setProdAbierto] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [tienePorTecnico, setTienePorTecnico] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generado, setGenerado] = useState(false);

  useEffect(() => {
    fetch('/api/informes/digitacion?meta=1')
      .then(r => r.json())
      .then(d => {
        setMeta({ zonas: d.zonas || [], meses: d.meses || [] });
        if (d.meses?.length) setMes(d.meses[0]);
      })
      .catch(() => {});
  }, []);

  const generar = async () => {
    if (!mes) { setError('Selecciona un mes.'); return; }
    setLoading(true); setError(null); setGenerado(true);
    try {
      const qs = new URLSearchParams({ mes });
      if (zona) qs.set('zona', zona);
      if (fecha) qs.set('fecha', fecha);
      if (horaDesde && horaHasta) { qs.set('horaDesde', horaDesde); qs.set('horaHasta', horaHasta); }
      if (tipo) qs.set('tipo', tipo);
      if (porTecnico) qs.set('porTecnico', '1');
      const res = await fetch('/api/informes/digitacion?' + qs.toString());
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setRows(d.rows || []);
      setTienePorTecnico(!!d.porTecnico);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // Fila de totales (suma de todas las columnas numéricas).
  const totales = useMemo(() => {
    const t: Record<string, number> = {};
    for (const c of COLS) t[c.key] = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
    return t;
  }, [rows]);

  // ── Exportación ────────────────────────────────────────────────────────────
  const nombreArchivo = () =>
    `informe_digitacion_${mes}${fecha ? '_' + fecha : ''}${tipo ? '_' + tipo : ''}${porTecnico ? '_tecnico' : ''}`;

  const filasExport = () =>
    rows.map(r => {
      const o: Record<string, string | number> = { Fecha: String(r.fecha).slice(0, 10) };
      if (tienePorTecnico) o['Técnico'] = String(r.tecnico ?? r.id_tecnico ?? '');
      o['Zona'] = String(r.zona ?? '');
      o['Tipo de brigada'] = String(r.brigada ?? '');
      for (const c of COLS) o[c.label] = Number(r[c.key]) || 0;
      return o;
    });

  const descargar = (contenido: BlobPart, mime: string, ext: string) => {
    const blob = new Blob([contenido], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${nombreArchivo()}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  // ── Exportación Producción ────────────────────────────────────────────────────────
  const nombreArchivoProd = () => `informe_produccion_${new Date().toISOString().slice(0,10).replace(/-/g,'')}_${viewMode}`;

  const filasExportProd = () => {
    if (!informe) return [];
    return informe.rows.map(r => {
      const o: Record<string, string | number> = {};
      if (viewMode === 'tecnico') {
        o['Técnico'] = r.nombre;
      } else {
        o['Operativa'] = r.tipoBrigada;
      }
      o['Órdenes'] = r.ordenes;
      o['Producción'] = r.produccion;
      o['Meta'] = r.meta;
      o['Faltante'] = r.faltante;
      return o;
    });
  };

  const exportCSVProd = () => {
    const csv = Papa.unparse(filasExportProd(), { delimiter: ',' });
    descargar('﻿' + csv, 'text/csv;charset=utf-8;', 'csv');
  };

  const exportExcelProd = () => {
    const data = filasExportProd();
    const cols = data.length ? Object.keys(data[0]) : [];
    const esc = (v: unknown) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const thead = '<tr>' + cols.map(c => `<th>${esc(c)}</th>`).join('') + '</tr>';
    const tbody = data.map(r => '<tr>' + cols.map(c => `<td>${esc(r[c])}</td>`).join('') + '</tr>').join('');
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1">${thead}${tbody}</table></body></html>`;
    descargar(html, 'application/vnd.ms-excel', 'xlsx');
  };

    // Delimitador ';' (separador de lista de Excel en español) + BOM para los
    // acentos. Así Excel-ES abre cada campo en su propia columna sin pasos extra.
    const csv = Papa.unparse(filasExport(), { delimiter: ';' });
    descargar('﻿' + csv, 'text/csv;charset=utf-8;', 'csv');
  };

  const exportExcel = () => {
    const data = filasExport();
    const cols = data.length ? Object.keys(data[0]) : ['Fecha', ...COLS.map(c => c.label)];
    const esc = (v: unknown) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const thead = '<tr>' + cols.map(c => `<th>${esc(c)}</th>`).join('') + '</tr>';
    const tbody = data.map(r => '<tr>' + cols.map(c => `<td>${esc(r[c])}</td>`).join('') + '</tr>').join('');
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1">${thead}${tbody}</table></body></html>`;
    descargar(html, 'application/vnd.ms-excel', 'xlsx');
  };

  // ── Estilos ──────────────────────────────────────────────────────────────
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: MUT, marginBottom: 4, display: 'block', letterSpacing: 0.3 };
  const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-body)', fontSize: 13 };
  const btn = (bg: string): React.CSSProperties => ({ padding: '8px 16px', borderRadius: 8, border: 'none', background: bg, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' });
  const th: React.CSSProperties = { padding: '9px 10px', fontSize: 11, fontWeight: 800, color: 'var(--text-title)', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '2px solid var(--border)' };
  const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-body)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ButtonMenuOperativo />

      <div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, color: INK }}>INFORMES</div>
        <div style={{ fontSize: 12.5, color: MUT, marginTop: 2 }}>Módulo de informes y reportes operativos</div>
      </div>


      {/* ═══ INFORME DE PRODUCCIÓN ═══ */}
      <div style={secH}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: TEAL }} />
        Informe de Producción
      </div>
      {/* Toggle to show/hide the report */}
      <button
        onClick={() => setProdAbierto(v => !v)}
        style={{
          marginBottom: 12,
          padding: '6px 12px',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        {prodAbierto ? '▲ Ocultar' : '▼ Mostrar'}
      </button>
      {prodAbierto && (
        <>
          {/* Filtros producción independientes */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 12 }}>
  <div>
    <label style={lbl}>ZONA</label>
    <select style={inp} value={prodZona} onChange={e => setProdZona(e.target.value)}>
      <option value="">Todas</option>
      {meta.zonas.map(z => <option key={z} value={z}>{z}</option>)}
    </select>
  </div>
  <div>
    <label style={lbl}>MES</label>
    <select style={inp} value={prodMes} onChange={e => { setProdMes(e.target.value); setProdFecha(''); }}>
      <option value="">Todas</option>
      {meta.meses.map(m => <option key={m} value={m}>{m}</option>)}
    </select>
  </div>
  <div>
    <label style={lbl}>DÍA (opcional)</label>
    <input type="date" style={inp} value={prodFecha}
      min={prodMes ? `${prodMes}-01` : undefined}
      max={prodMes ? `${prodMes}-${String(new Date(Number(prodMes.slice(0,4)), Number(prodMes.slice(5,7)), 0).getDate()).padStart(2,'0')}` : undefined}
      onChange={e => setProdFecha(e.target.value)} />
  </div>
  <div>
    <label style={lbl}>TIPO DE BRIGADA</label>
    <select style={inp} value={prodTipo} onChange={e => setProdTipo(e.target.value as typeof prodTipo)}>
      <option value="">Ambas</option>
      <option value="operativas">Operativas</option>
      <option value="disponibles">Disponibles</option>
    </select>
  </div>
</div>
<button style={btn(colors.sip)} onClick={generarProduccion}>Generar informe</button>
{/* View mode selector */}
<div style={{ marginBottom: 12 }}>
  <SegmentedControl
    options={[{ label: 'Por Técnico', value: 'tecnico' }, { label: 'Por Operativa', value: 'operativa' }]}
    value={viewMode}
    onChange={v => setViewMode(v as 'tecnico' | 'operativa')}
  />
</div>
{/* Export buttons */}
<div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
          <div style={{ marginBottom: 12 }}>
            <SegmentedControl
              options={[{ label: 'Por Técnico', value: 'tecnico' }, { label: 'Por Operativa', value: 'operativa' }]}
              value={viewMode}
              onChange={v => setViewMode(v as 'tecnico' | 'operativa')}
            />
          </div>
{prodGenerado && informe && (
  <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
    <ExportButton format="excel" onClick={exportExcelProd} />
    <ExportButton format="csv" onClick={exportCSVProd} />
  </div>
)}
          <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
            <ExportButton format="excel" onClick={exportExcelProd} />
            <ExportButton format="csv" onClick={exportCSVProd} />
          </div>
          {/* Existing report rendering */}
          {!informe || !informe.rows.length ? (
            <div style={{
              ...card,
              textAlign: 'center',
              padding: '40px 20px',
              color: MUT,
            }}>
              <span style={{ fontSize: 32 }}>📊</span>
              <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginTop: 8 }}>
                Sin datos para el periodo seleccionado
              </div>
              <div style={{ fontSize: 12.5, marginTop: 4 }}>
                Ajusta los filtros de fecha para ver el informe de producción.
              </div>
            </div>
          ) : (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              {/* Resumen superior */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 0,
                borderBottom: '2px solid var(--border)',
              }}>
                {[{
                  label: viewMode === 'tecnico' ? 'Técnicos' : 'Operativas',
                  value: fmtN(informe.rows.length),
                  color: TEAL,
                },
                { label: 'Total Órdenes', value: fmtN(informe.totales.ordenes), color: INK },
                { label: 'Producción Total', value: fmtCOP(informe.totales.produccion), color: OK },
                { label: 'Meta Total', value: fmtCOP(informe.totales.meta), color: INK },
                { label: 'Faltante Total', value: fmtCOP(informe.totales.faltante), color: colorFaltante(informe.totales.faltante, informe.totales.meta) }]
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
                      {viewMode === 'tecnico' ? (
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
                    {informe.rows.map((row, idx) => {
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
                          {viewMode === 'tecnico' ? (
                            <>
                              <td style={tdStyle}>{(row as TecnicoProduccion).nombre}</td>
                              <td style={tdStyle}>{(row as TecnicoProduccion).tipoBrigada}</td>
                            </>
                          ) : (
                            <td style={tdStyle}>{(row as any).operativa}</td>
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
                      <td style={{ ...tdStyle, fontWeight: 800, fontSize: 12 }} colSpan={viewMode === 'tecnico' ? 3 : 2}>
                        TOTALES ({informe.rows.length} {viewMode === 'tecnico' ? 'técnicos' : 'operativas'})
                      </td>
                      <td style={{ ...tdStyleRight, fontWeight: 800 }}>{fmtN(informe.totales.ordenes)}</td>
                      <td style={{ ...tdStyleRight, fontWeight: 800, color: OK }}>{fmtCOP(informe.totales.produccion)}</td>
                      <td style={{ ...tdStyleRight, fontWeight: 800 }}>{fmtCOP(informe.totales.meta)}</td>
                      <td style={{ ...tdStyleRight, fontWeight: 800, color: colorFaltante(informe.totales.faltante, informe.totales.meta) }}>{informe.totales.faltante > 0 ? fmtCOP(informe.totales.faltante) : '✓ $0'}</td>
                      <td style={tdStyleRight}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          color: pctCumplimiento(informe.totales.produccion, informe.totales.meta) >= 100 ? OK : pctCumplimiento(informe.totales.produccion, informe.totales.meta) >= 70 ? WARN : ERR,
                          background: (pctCumplimiento(informe.totales.produccion, informe.totales.meta) >= 100 ? OK : pctCumplimiento(informe.totales.produccion, informe.totales.meta) >= 70 ? WARN : ERR) + '18',
                        }}>{pctCumplimiento(informe.totales.produccion, informe.totales.meta).toFixed(0)}%</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Botón del informe */}
      <button
        onClick={() => setAbierto(v => !v)}
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
        <span style={{ marginLeft: 'auto', color: MUT, fontSize: 13 }}>{abierto ? '▲' : '▼'}</span>
      </button>

      {/* Panel de filtros */}
      {abierto && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
            <div>
              <label style={lbl}>ZONA</label>
              <select style={inp} value={zona} onChange={e => setZona(e.target.value)}>
                <option value="">Todas</option>
                {meta.zonas.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>MES</label>
              <select style={inp} value={mes} onChange={e => { setMes(e.target.value); setFecha(''); }}>
                {meta.meses.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>DÍA (opcional)</label>
              <input
                key={mes}
                type="date"
                style={inp}
                value={fecha}
                min={mes ? `${mes}-01` : undefined}
                max={mes ? `${mes}-${String(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate()).padStart(2, '0')}` : undefined}
                onChange={e => setFecha(e.target.value)}
              />
            </div>
            <div>
              <label style={lbl}>HORA DESDE</label>
              <input type="time" style={inp} value={horaDesde} onChange={e => setHoraDesde(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>HORA HASTA</label>
              <input type="time" style={inp} value={horaHasta} onChange={e => setHoraHasta(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>TIPO DE BRIGADA</label>
              <select style={inp} value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)}>
                <option value="">Ambas</option>
                <option value="operativas">Operativas</option>
                <option value="disponibles">Disponibles</option>
              </select>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-body)', cursor: 'pointer' }}>
            <input type="checkbox" checked={porTecnico} onChange={e => setPorTecnico(e.target.checked)} />
            Discriminar por técnico
          </label>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button style={btn(colors.sip)} onClick={generar} disabled={loading}>
              {loading ? 'Generando…' : 'Generar informe'}
            </button>
            {rows.length > 0 && (
              <>
                <button style={btn(colors.ok)} onClick={exportExcel}>⬇ Excel</button>
                <button style={btn(colors.otc)} onClick={exportCSV}>⬇ CSV</button>
              </>
            )}
          </div>
          {(horaDesde && !horaHasta) || (!horaDesde && horaHasta) ? (
            <div style={{ fontSize: 11.5, color: colors.warn }}>Para filtrar por hora indica DESDE y HASTA; si no, se ignora.</div>
          ) : null}
        </div>
      )}

      {/* Error */}
      {error && <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, color: colors.err, fontSize: 13 }}>⚠ {error}</div>}

      {/* Tabla */}
      {generado && !error && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13.5, fontWeight: 700, color: INK }}>
            Digitación {mes}{fecha ? ` · ${fecha}` : ''}{zona ? ` · ${zona}` : ''}{tipo ? ` · ${tipo}` : ''}
            <span style={{ fontWeight: 500, color: MUT }}> — {rows.length} filas</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            {rows.length === 0 && !loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: MUT, fontSize: 13 }}>Sin datos para los filtros seleccionados.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: tienePorTecnico ? 1180 : 1020 }}>
                <thead>
                  <tr style={{ background: 'rgba(128,128,128,0.16)' }}>
                    <th style={{ ...th, textAlign: 'left' }}>Fecha</th>
                    {tienePorTecnico && <th style={{ ...th, textAlign: 'left' }}>Técnico</th>}
                    <th style={{ ...th, textAlign: 'left' }}>Zona</th>
                    <th style={{ ...th, textAlign: 'left' }}>Tipo de brigada</th>
                    {COLS.map(c => <th key={c.key} style={th}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: INK }}>{String(r.fecha).slice(0, 10)}</td>
                      {tienePorTecnico && <td style={{ ...td, textAlign: 'left', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(r.tecnico ?? '')}>{String(r.tecnico ?? r.id_tecnico ?? '')}</td>}
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
                {rows.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--bg-soft, rgba(127,127,127,.08))', borderTop: '2px solid var(--border)' }}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 800, color: INK }}>TOTAL</td>
                      {tienePorTecnico && <td style={td} />}
                      <td style={td} />
                      <td style={td} />
                      {COLS.map(c => <td key={c.key} style={{ ...td, fontWeight: 800, color: INK }}>{totales[c.key]}</td>)}
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
