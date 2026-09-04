'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { ButtonMenuOperativo } from '../components/Buttons';
import { useTheme } from '../components/ThemeProvider';

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
  const { colors } = useTheme();
  const INK = colors.ink;
  const MUT = colors.mut;

  const [abierto, setAbierto] = useState(false);
  const [meta, setMeta] = useState<{ zonas: string[]; meses: string[] }>({ zonas: [], meses: [] });

  // Filtros
  const [zona, setZona] = useState('');       // '' = Todas
  const [mes, setMes] = useState('');
  const [fecha, setFecha] = useState('');     // '' = todo el mes
  const [horaDesde, setHoraDesde] = useState('');
  const [horaHasta, setHoraHasta] = useState('');
  const [tipo, setTipo] = useState<'operativas' | 'disponibles' | ''>('');  // '' = ambas
  const [porTecnico, setPorTecnico] = useState(false);

  // Resultado
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

  const exportCSV = () => {
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
