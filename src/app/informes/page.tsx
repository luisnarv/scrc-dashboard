'use client';

import { useMemo } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { filtRaw } from '../components/utils/filters';
import { fmtCOP, fmtN, num as n } from '../components/utils/formatters';
import { useTheme } from '../components/ThemeProvider';
import { ButtonMenuOperativo } from '../components/Buttons';

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

export default function InformesPage() {
  const { raw, filters, loading, error } = useDashboard();
  const { colors } = useTheme();
  const INK = colors.ink;
  const MUT = colors.mut;
  const OK = colors.ok;
  const WARN = colors.warn;
  const ERR = colors.err;
  const TEAL = colors.sip;

  /* ─── Cálculo del informe de producción ─── */
  const informe = useMemo(() => {
    if (!raw) return null;

    const rawF = filtRaw(raw.raw, filters);
    if (!rawF.length) return null;

    // Agrupar por Cedula (técnico)
    const agg = new Map<string, {
      nombre: string;
      tipoBrigada: string;
      ordenes: number;
      produccion: number;
      meta: number;
    }>();

    rawF.forEach(r => {
      const cedula = String(r.Cedula || 'SIN_CEDULA');
      let acc = agg.get(cedula);
      if (!acc) {
        acc = {
          nombre: String(r.Nombre || 'Desconocido'),
          tipoBrigada: String(r.Tipo_Brigada_Operaciones || r.Tipo_Brigada_Mes || '—'),
          ordenes: 0,
          produccion: 0,
          meta: 0,
        };
        agg.set(cedula, acc);
      }
      // Compute orders as sum of efectivas, fallidas (con y sin pago) y perdidas
      acc.ordenes += n(r.Efectivas) + n(r.Fallida_Con_Pago) + n(r.Fallida_Sin_Pago) + n(r.Perdidas);
      // Use Valor_Orden for producción monetaria
      acc.produccion += n(r.Valor_Orden);
      acc.meta += n(r.Meta_Facturacion);
      // Mantener el nombre más reciente (no vacío)
      if (r.Nombre && String(r.Nombre).trim()) {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Menú de Navegación del Ecosistema Operativo */}
      <ButtonMenuOperativo />

      {/* Encabezado */}
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, color: INK }}>
          INFORMES
        </div>
        <div style={{ fontSize: 12.5, color: MUT, marginTop: 2 }}>
          Módulo de informes y reportes operativos
        </div>
      </div>

      {/* ═══ INFORME DE PRODUCCIÓN ═══ */}
      <div style={secH}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: TEAL }} />
        Informe de Producción
      </div>

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
            {[
              { label: 'Técnicos', value: fmtN(informe.rows.length), color: TEAL },
              { label: 'Total Órdenes', value: fmtN(informe.totales.ordenes), color: INK },
              { label: 'Producción Total', value: fmtCOP(informe.totales.produccion), color: OK },
              { label: 'Meta Total', value: fmtCOP(informe.totales.meta), color: INK },
              { label: 'Faltante Total', value: fmtCOP(informe.totales.faltante), color: colorFaltante(informe.totales.faltante, informe.totales.meta) },
            ].map((item, i) => (
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
                  <th style={thStyle}>Técnico</th>
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
                      key={row.cedula}
                      style={{
                        transition: 'background .15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ ...tdStyle, color: MUT, fontSize: 11, fontWeight: 600 }}>
                        {idx + 1}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{row.nombre}</div>
                        <div style={{ fontSize: 10.5, color: MUT, marginTop: 1 }}>{row.tipoBrigada}</div>
                      </td>
                      <td style={tdStyleRight}>
                        <span style={{ fontWeight: 600 }}>{fmtN(row.ordenes)}</span>
                      </td>
                      <td style={{ ...tdStyleRight, fontWeight: 700, color: OK }}>
                        {fmtCOP(row.produccion)}
                      </td>
                      <td style={{ ...tdStyleRight, fontWeight: 600 }}>
                        {fmtCOP(row.meta)}
                      </td>
                      <td style={{ ...tdStyleRight, fontWeight: 700, color: fColor }}>
                        {row.faltante > 0 ? fmtCOP(row.faltante) : '✓ $0'}
                      </td>
                      <td style={{ ...tdStyleRight }}>
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
              {/* Fila de Totales */}
              <tfoot>
                <tr style={{ background: 'var(--hover-bg)' }}>
                  <td style={{ ...tdStyle, fontWeight: 800, fontSize: 12 }} colSpan={2}>
                    TOTALES ({informe.rows.length} técnicos)
                  </td>
                  <td style={{ ...tdStyleRight, fontWeight: 800 }}>
                    {fmtN(informe.totales.ordenes)}
                  </td>
                  <td style={{ ...tdStyleRight, fontWeight: 800, color: OK }}>
                    {fmtCOP(informe.totales.produccion)}
                  </td>
                  <td style={{ ...tdStyleRight, fontWeight: 800 }}>
                    {fmtCOP(informe.totales.meta)}
                  </td>
                  <td style={{ ...tdStyleRight, fontWeight: 800, color: colorFaltante(informe.totales.faltante, informe.totales.meta) }}>
                    {informe.totales.faltante > 0 ? fmtCOP(informe.totales.faltante) : '✓ $0'}
                  </td>
                  <td style={{ ...tdStyleRight }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      color: pctCumplimiento(informe.totales.produccion, informe.totales.meta) >= 100 ? OK : pctCumplimiento(informe.totales.produccion, informe.totales.meta) >= 70 ? WARN : ERR,
                      background: (pctCumplimiento(informe.totales.produccion, informe.totales.meta) >= 100 ? OK : pctCumplimiento(informe.totales.produccion, informe.totales.meta) >= 70 ? WARN : ERR) + '18',
                    }}>
                      {pctCumplimiento(informe.totales.produccion, informe.totales.meta).toFixed(0)}%
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
