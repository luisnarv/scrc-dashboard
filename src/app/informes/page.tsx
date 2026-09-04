'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { useDashboard } from '../components/DashboardProvider';
import { useTheme } from '../components/ThemeProvider';
import { ButtonMenuOperativo, SegmentedControl, ExportButton } from '../components/Buttons';
import { filtRaw } from '../components/utils/filters';
import { fmtCOP, fmtN, num as n } from '../components/utils/formatters';

/* ─── Tipos auxiliares ─── */
interface TecnicoProduccion {
  clave: string;
  nombre: string;      // Técnico (o nombre de la operativa)
  tipoBrigada: string; // Solo en vista por técnico
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

  /* ─── Estado: informe de producción ─── */
  const [prodAbierto, setProdAbierto] = useState(false);
  const [viewMode, setViewMode] = useState<'tecnico' | 'operativa'>('tecnico');

  /* ─── Estado: informe de digitación ─── */
  const [abierto, setAbierto] = useState(false);
  const [meta, setMeta] = useState<{ zonas: string[]; meses: string[] }>({ zonas: [], meses: [] });
  const [zona, setZona] = useState('');       // '' = Todas
  const [mes, setMes] = useState('');
  const [fecha, setFecha] = useState('');     // '' = todo el mes
  const [horaDesde, setHoraDesde] = useState('');
  const [horaHasta, setHoraHasta] = useState('');
  const [tipo, setTipo] = useState<'operativas' | 'disponibles' | ''>('');  // '' = ambas
  const [porTecnico, setPorTecnico] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [tienePorTecnico, setTienePorTecnico] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [generado, setGenerado] = useState(false);

  // Opciones (zonas/meses) para los selectores del informe de digitación.
  useEffect(() => {
    fetch('/api/informes/digitacion?meta=1')
      .then(r => r.json())
      .then(d => {
        setMeta({ zonas: d.zonas || [], meses: d.meses || [] });
        if (d.meses?.length) setMes(d.meses[0]);
      })
      .catch(() => {});
  }, []);

  /* ─── Cálculo del informe de producción (datos globales) ─── */
  const informe = useMemo(() => {
    if (!raw) return null;
    const rawF = filtRaw(raw.raw, filters);
    if (!rawF.length) return null;

    const esTec = viewMode === 'tecnico';
    const agg = new Map<string, { nombre: string; tipoBrigada: string; ordenes: number; produccion: number; meta: number }>();

    rawF.forEach(r => {
      const brig = String(r.Tipo_Brigada_Operaciones || r.Tipo_Brigada_Mes || '—');
      const clave = esTec ? String(r.Cedula || 'SIN_CEDULA') : brig;
      let acc = agg.get(clave);
      if (!acc) {
        acc = {
          nombre: esTec ? String(r.Nombre || 'Desconocido') : brig,
          tipoBrigada: esTec ? brig : '',
          ordenes: 0,
          produccion: 0,
          meta: 0,
        };
        agg.set(clave, acc);
      }
      acc.ordenes += n(r.Efectivas) + n(r.Fallida_Con_Pago) + n(r.Fallida_Sin_Pago) + n(r.Perdidas);
      acc.produccion += n(r.Ingresos);
      acc.meta += n(r.Meta_Facturacion);
      if (esTec && r.Nombre && String(r.Nombre).trim()) acc.nombre = String(r.Nombre);
    });

    const filas: TecnicoProduccion[] = Array.from(agg.entries())
      .map(([clave, acc]) => ({
        clave,
        nombre: acc.nombre,
        tipoBrigada: acc.tipoBrigada,
        ordenes: acc.ordenes,
        produccion: acc.produccion,
        meta: acc.meta,
        faltante: Math.max(0, acc.meta - acc.produccion),
      }))
      .sort((a, b) => b.produccion - a.produccion);

    const totales = filas.reduce(
      (t, r) => ({
        ordenes: t.ordenes + r.ordenes,
        produccion: t.produccion + r.produccion,
        meta: t.meta + r.meta,
        faltante: t.faltante + r.faltante,
      }),
      { ordenes: 0, produccion: 0, meta: 0, faltante: 0 }
    );

    return { rows: filas, totales };
  }, [raw, filters, viewMode]);

  // Fila de totales del informe de digitación.
  const totalesDig = useMemo(() => {
    const t: Record<string, number> = {};
    for (const c of COLS) t[c.key] = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
    return t;
  }, [rows]);

  /* ─── Generar informe de digitación ─── */
  const generar = async () => {
    if (!mes) { setGenError('Selecciona un mes.'); return; }
    setGenLoading(true); setGenError(null); setGenerado(true);
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
      setGenError(String(e instanceof Error ? e.message : e));
      setRows([]);
    } finally {
      setGenLoading(false);
    }
  };

  /* ─── Descarga genérica ─── */
  const descargar = (nombre: string, contenido: BlobPart, mime: string, ext: string) => {
    const blob = new Blob([contenido], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${nombre}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const aExcel = (data: Record<string, string | number>[], fallbackCols: string[]) => {
    const cols = data.length ? Object.keys(data[0]) : fallbackCols;
    const esc = (v: unknown) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const thead = '<tr>' + cols.map(c => `<th>${esc(c)}</th>`).join('') + '</tr>';
    const tbody = data.map(r => '<tr>' + cols.map(c => `<td>${esc(r[c])}</td>`).join('') + '</tr>').join('');
    return `<html><head><meta charset="utf-8"></head><body><table border="1">${thead}${tbody}</table></body></html>`;
  };

  /* ─── Exportación: digitación ─── */
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

  const exportCSV = () => {
    // Delimitador ';' (separador de lista de Excel en español) + BOM para acentos.
    const csv = Papa.unparse(filasExport(), { delimiter: ';' });
    descargar(nombreArchivo(), '﻿' + csv, 'text/csv;charset=utf-8;', 'csv');
  };

  const exportExcel = () =>
    descargar(nombreArchivo(), aExcel(filasExport(), ['Fecha', ...COLS.map(c => c.label)]), 'application/vnd.ms-excel', 'xls');

  /* ─── Exportación: producción ─── */
  const nombreArchivoProd = () =>
    `informe_produccion_${new Date().toISOString().slice(0, 10)}_${viewMode}`;

  const filasExportProd = () => {
    if (!informe) return [];
    return informe.rows.map(r => {
      const o: Record<string, string | number> = {};
      if (viewMode === 'tecnico') { o['Técnico'] = r.nombre; o['Tipo Operativa'] = r.tipoBrigada; }
      else { o['Operativa'] = r.nombre; }
      o['Órdenes'] = r.ordenes;
      o['Producción'] = r.produccion;
      o['Meta'] = r.meta;
      o['Faltante'] = r.faltante;
      return o;
    });
  };

  const exportCSVProd = () => {
    const csv = Papa.unparse(filasExportProd(), { delimiter: ';' });
    descargar(nombreArchivoProd(), '﻿' + csv, 'text/csv;charset=utf-8;', 'csv');
  };

  const exportExcelProd = () =>
    descargar(nombreArchivoProd(), aExcel(filasExportProd(), []), 'application/vnd.ms-excel', 'xls');

  /* ─── Semáforo del faltante / cumplimiento ─── */
  const colorFaltante = (faltante: number, metaV: number) => {
    if (metaV <= 0) return MUT;
    const pct = faltante / metaV;
    if (pct <= 0) return OK;
    if (pct < 0.3) return WARN;
    return ERR;
  };
  const pctCumplimiento = (produccion: number, metaV: number) => {
    if (metaV <= 0) return 0;
    return Math.min((produccion / metaV) * 100, 999);
  };

  /* ─── Estilos de tabla (producción) ─── */
  const thStyle: React.CSSProperties = {
    padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
    textTransform: 'uppercase', color: MUT, borderBottom: '2px solid var(--border)',
    position: 'sticky', top: 0, background: 'var(--panel)', zIndex: 1,
  };
  const thStyleRight: React.CSSProperties = { ...thStyle, textAlign: 'right' };
  const tdStyle: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: INK, borderBottom: '1px solid var(--border)' };
  const tdStyleRight: React.CSSProperties = { ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
  const secH: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700,
    letterSpacing: 1.4, textTransform: 'uppercase', color: TEAL, margin: '4px 2px 0',
  };

  /* ─── Estilos del informe de digitación ─── */
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: MUT, marginBottom: 4, display: 'block', letterSpacing: 0.3 };
  const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-body)', fontSize: 13 };
  const btn = (bg: string): React.CSSProperties => ({ padding: '8px 16px', borderRadius: 8, border: 'none', background: bg, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' });
  const th: React.CSSProperties = { padding: '9px 10px', fontSize: 11, fontWeight: 800, color: 'var(--text-title)', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '2px solid var(--border)' };
  const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-body)' };

  const esTec = viewMode === 'tecnico';

  /* ─── Render ─── */
  if (loading) return <div className="loading-wrap"><div className="spinner" /><span>Cargando…</span></div>;
  if (error) return <div className="status err">{error}</div>;

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

      <button
        onClick={() => setProdAbierto(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}
      >
        <span style={{ fontSize: 26 }}>📊</span>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: INK }}>Informe de producción</span>
          <span style={{ fontSize: 12, color: MUT }}>Producción vs. meta por técnico u operativa (según filtros globales)</span>
        </span>
        <span style={{ marginLeft: 'auto', color: MUT, fontSize: 13 }}>{prodAbierto ? '▲' : '▼'}</span>
      </button>

      {prodAbierto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <SegmentedControl
              options={[{ label: 'Por Técnico', value: 'tecnico' }, { label: 'Por Operativa', value: 'operativa' }]}
              value={viewMode}
              onChange={v => setViewMode(v as 'tecnico' | 'operativa')}
            />
            {informe && informe.rows.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <ExportButton format="excel" onClick={exportExcelProd} />
                <ExportButton format="csv" onClick={exportCSVProd} />
              </div>
            )}
          </div>

          {!informe || !informe.rows.length ? (
            <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: MUT }}>
              <span style={{ fontSize: 32 }}>📊</span>
              <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginTop: 8 }}>Sin datos para el periodo seleccionado</div>
              <div style={{ fontSize: 12.5, marginTop: 4 }}>Ajusta los filtros de fecha para ver el informe de producción.</div>
            </div>
          ) : (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              {/* Resumen superior */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 0, borderBottom: '2px solid var(--border)' }}>
                {[
                  { label: esTec ? 'Técnicos' : 'Operativas', value: fmtN(informe.rows.length), color: TEAL },
                  { label: 'Total Órdenes', value: fmtN(informe.totales.ordenes), color: INK },
                  { label: 'Producción Total', value: fmtCOP(informe.totales.produccion), color: OK },
                  { label: 'Meta Total', value: fmtCOP(informe.totales.meta), color: INK },
                  { label: 'Faltante Total', value: fmtCOP(informe.totales.faltante), color: colorFaltante(informe.totales.faltante, informe.totales.meta) },
                ].map((item, i) => (
                  <div key={i} style={{ padding: '16px 20px', borderRight: i < 4 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.7, textTransform: 'uppercase', color: MUT }}>{item.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: item.color, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Tabla de producción */}
              <div style={{ maxHeight: 520, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, width: 40 }}>#</th>
                      <th style={thStyle}>{esTec ? 'Técnico' : 'Operativa'}</th>
                      {esTec && <th style={thStyle}>Tipo Operativa</th>}
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
                          key={row.clave}
                          style={{ transition: 'background .15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ ...tdStyle, color: MUT, fontSize: 11, fontWeight: 600 }}>{idx + 1}</td>
                          <td style={tdStyle}><span style={{ fontWeight: 600 }}>{row.nombre}</span></td>
                          {esTec && <td style={{ ...tdStyle, color: MUT, fontSize: 11.5 }}>{row.tipoBrigada}</td>}
                          <td style={tdStyleRight}><span style={{ fontWeight: 600 }}>{fmtN(row.ordenes)}</span></td>
                          <td style={{ ...tdStyleRight, fontWeight: 700, color: OK }}>{fmtCOP(row.produccion)}</td>
                          <td style={{ ...tdStyleRight, fontWeight: 600 }}>{fmtCOP(row.meta)}</td>
                          <td style={{ ...tdStyleRight, fontWeight: 700, color: fColor }}>{row.faltante > 0 ? fmtCOP(row.faltante) : '✓ $0'}</td>
                          <td style={tdStyleRight}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, color: cumplColor, background: cumplColor + '18' }}>
                              {cumpl.toFixed(0)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--hover-bg)' }}>
                      <td style={{ ...tdStyle, fontWeight: 800, fontSize: 12 }} colSpan={esTec ? 3 : 2}>
                        TOTALES ({informe.rows.length} {esTec ? 'técnicos' : 'operativas'})
                      </td>
                      <td style={{ ...tdStyleRight, fontWeight: 800 }}>{fmtN(informe.totales.ordenes)}</td>
                      <td style={{ ...tdStyleRight, fontWeight: 800, color: OK }}>{fmtCOP(informe.totales.produccion)}</td>
                      <td style={{ ...tdStyleRight, fontWeight: 800 }}>{fmtCOP(informe.totales.meta)}</td>
                      <td style={{ ...tdStyleRight, fontWeight: 800, color: colorFaltante(informe.totales.faltante, informe.totales.meta) }}>
                        {informe.totales.faltante > 0 ? fmtCOP(informe.totales.faltante) : '✓ $0'}
                      </td>
                      <td style={tdStyleRight}>
                        {(() => {
                          const p = pctCumplimiento(informe.totales.produccion, informe.totales.meta);
                          const c = p >= 100 ? OK : p >= 70 ? WARN : ERR;
                          return (
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, color: c, background: c + '18' }}>
                              {p.toFixed(0)}%
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ INFORME DIGITACIÓN ═══ */}
      <div style={secH}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: TEAL }} />
        Informe digitación
      </div>

      <button
        onClick={() => setAbierto(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}
      >
        <span style={{ fontSize: 26 }}>📋</span>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: INK }}>Informe digitación</span>
          <span style={{ fontSize: 12, color: MUT }}>Órdenes digitadas por día y tipo de orden</span>
        </span>
        <span style={{ marginLeft: 'auto', color: MUT, fontSize: 13 }}>{abierto ? '▲' : '▼'}</span>
      </button>

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
            <button style={btn(colors.sip)} onClick={generar} disabled={genLoading}>
              {genLoading ? 'Generando…' : 'Generar informe'}
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

      {genError && <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, color: colors.err, fontSize: 13 }}>⚠ {genError}</div>}

      {generado && !genError && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13.5, fontWeight: 700, color: INK }}>
            Digitación {mes}{fecha ? ` · ${fecha}` : ''}{zona ? ` · ${zona}` : ''}{tipo ? ` · ${tipo}` : ''}
            <span style={{ fontWeight: 500, color: MUT }}> — {rows.length} filas</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            {rows.length === 0 && !genLoading ? (
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
                      {COLS.map(c => <td key={c.key} style={{ ...td, fontWeight: 800, color: INK }}>{totalesDig[c.key]}</td>)}
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
