'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import Papa from 'papaparse';
import { useDashboard } from '../components/DashboardProvider';
import { fmtCOP, fmtN, num as n } from '../components/utils/formatters';
import { ButtonMenuOperativo } from '../components/Buttons';
import { useTheme } from '../components/ThemeProvider';

/* ─── Tipos auxiliares ─── */
interface ProduccionRow {
  cedula?: string;
  tecnico?: string;
  zona: string;
  brigada: string;
  ordenes: number;
  produccion: number;
  meta: number;
  faltante: number;
  cumplimiento: number;
}

type Row = Record<string, string | number>;

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

interface MultiDayDropdownProps {
  mes: string;
  fechas: string[];
  onChangeFechas: (fechas: string[]) => void;
  todosDias: boolean;
  onChangeTodosDias: (todos: boolean) => void;
  availableDays: string[];
  colors: { sip: string; ok: string; warn: string; err: string; ink: string; mut: string };
}

function MultiDayDropdown({
  mes,
  fechas,
  onChangeFechas,
  todosDias,
  onChangeTodosDias,
  availableDays,
  colors,
}: MultiDayDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const formatDia = (fechaStr: string) => {
    const partes = fechaStr.split('-');
    if (partes.length !== 3) return fechaStr;
    const y = parseInt(partes[0], 10);
    const m = parseInt(partes[1], 10);
    const d = parseInt(partes[2], 10);
    const dateObj = new Date(y, m - 1, d);
    const nomDia = diasSemana[dateObj.getDay()] || '';
    return `${partes[2]} - ${nomDia}`;
  };

  const toggleDia = (d: string) => {
    if (todosDias) {
      onChangeTodosDias(false);
      onChangeFechas(availableDays.filter(x => x !== d));
      return;
    }
    if (fechas.includes(d)) {
      const next = fechas.filter(x => x !== d);
      onChangeFechas(next);
    } else {
      const next = [...fechas, d].sort();
      if (next.length === availableDays.length && availableDays.length > 0) {
        onChangeTodosDias(true);
      }
      onChangeFechas(next);
    }
  };

  const seleccionarTodos = () => {
    onChangeTodosDias(true);
    onChangeFechas([...availableDays]);
  };

  const limpiar = () => {
    onChangeTodosDias(false);
    onChangeFechas([]);
  };

  let btnLabel = '';
  if (todosDias) {
    btnLabel = `Todos los días (${availableDays.length})`;
  } else if (fechas.length === 0) {
    btnLabel = 'Seleccionar días…';
  } else if (fechas.length === 1) {
    btnLabel = `1 día (${formatDia(fechas[0])})`;
  } else {
    btnLabel = `${fechas.length} días seleccionados`;
  }

  const isChecked = (d: string) => todosDias || fechas.includes(d);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          padding: '7px 10px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--card)',
          color: 'var(--text-body)',
          fontSize: 13,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          textAlign: 'left',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {btnLabel}
        </span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            width: '100%',
            minWidth: 230,
            background: 'var(--panel, var(--card, #fff))',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(20,30,60,.22)',
            zIndex: 1000,
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {/* Botones de acción rápida: Seleccionar todos / Limpiar */}
          <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
            <button
              type="button"
              onClick={seleccionarTodos}
              style={{
                flex: 1,
                padding: '5px 8px',
                borderRadius: 6,
                border: `1px solid ${todosDias ? colors.sip : 'var(--border)'}`,
                background: todosDias ? colors.sip + '18' : 'transparent',
                color: todosDias ? colors.sip : 'var(--text-body)',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ✓ Seleccionar todos
            </button>
            <button
              type="button"
              onClick={limpiar}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-muted, #888)',
                fontSize: 11.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Limpiar
            </button>
          </div>

          {/* Checkbox "Todos los días" */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 6px',
              fontSize: 12,
              borderRadius: 5,
              cursor: 'pointer',
              userSelect: 'none',
              fontWeight: todosDias ? 700 : 500,
              color: todosDias ? colors.sip : 'var(--text-body)',
              background: todosDias ? colors.sip + '12' : 'transparent',
            }}
          >
            <input
              type="checkbox"
              checked={todosDias}
              onChange={e => {
                if (e.target.checked) {
                  seleccionarTodos();
                } else {
                  onChangeTodosDias(false);
                }
              }}
            />
            Todos los días del mes ({availableDays.length})
          </label>

          <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />

          {/* Lista scrolleable de días individuales */}
          <div style={{ maxHeight: 210, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {availableDays.length === 0 ? (
              <div style={{ padding: '8px 6px', fontSize: 11.5, color: 'var(--text-muted, #888)' }}>
                No hay días registrados en {mes}
              </div>
            ) : (
              availableDays.map(d => {
                const checked = isChecked(d);
                return (
                  <label
                    key={d}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '4px 6px',
                      fontSize: 12,
                      borderRadius: 4,
                      cursor: 'pointer',
                      userSelect: 'none',
                      fontWeight: checked ? 600 : 400,
                      color: checked ? 'var(--text-title)' : 'var(--text-body)',
                      background: checked ? 'rgba(128,128,128,0.12)' : 'transparent',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDia(d)}
                      />
                      <span>{formatDia(d)}</span>
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted, #888)', fontFamily: 'monospace' }}>
                      {d}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const [meta, setMeta] = useState<{ zonas: string[]; meses: string[]; fechas: string[] }>({ zonas: [], meses: [], fechas: [] });

  // ══════════════════════════════════════════════════════════════════
  // INFORME DE PRODUCCIÓN (Estado independiente)
  // ══════════════════════════════════════════════════════════════════
  const [prodAbierto, setProdAbierto] = useState(false);
  const [prodZona, setProdZona] = useState('');
  const [prodMes, setProdMes] = useState('');
  const [prodFechas, setProdFechas] = useState<string[]>([]);
  const [prodTipo, setProdTipo] = useState<'operativas' | 'disponibles' | ''>('');
  const [prodTodosDias, setProdTodosDias] = useState(false);   // false = filtra al último día
  const [prodPorTecnico, setProdPorTecnico] = useState(true);  // marcado por defecto

  const [prodRows, setProdRows] = useState<ProduccionRow[]>([]);
  const [prodTienePorTecnico, setProdTienePorTecnico] = useState(false);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodError, setProdError] = useState<string | null>(null);
  const [prodGenerado, setProdGenerado] = useState(false);

  // ══════════════════════════════════════════════════════════════════
  // INFORME DE DIGITACIÓN (Estado independiente)
  // ══════════════════════════════════════════════════════════════════
  const [digAbierto, setDigAbierto] = useState(false);
  const [digZona, setDigZona] = useState('');
  const [digMes, setDigMes] = useState('');
  const [digFechas, setDigFechas] = useState<string[]>([]);
  const [digHoraDesde, setDigHoraDesde] = useState('');
  const [digHoraHasta, setDigHoraHasta] = useState('');
  const [digTipo, setDigTipo] = useState<'operativas' | 'disponibles' | ''>('');
  const [digTodosDias, setDigTodosDias] = useState(false);   // false = filtra al último día
  const [digPorTecnico, setDigPorTecnico] = useState(true);  // marcado por defecto

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
        const fechas = d.fechas || [];
        setMeta({ zonas, meses, fechas });
        if (meses.length) {
          setProdMes(prev => prev || meses[0]);
          setDigMes(prev => prev || meses[0]);
        }
      })
      .catch(() => {});
  }, []);

  // Meses y Zonas disponibles
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

  // Último día CON DATOS por mes (para el filtro "Día" por defecto).
  const ultimoDia = useMemo(() => {
    const map: Record<string, string> = {};
    if (raw?.raw) {
      for (const r of raw.raw) {
        const f = String(r.Fecha || '').slice(0, 10);
        if (f.length === 10) {
          const m = f.slice(0, 7);
          if (!map[m] || f > map[m]) map[m] = f;
        }
      }
    }
    if (meta.fechas) {
      for (const f of meta.fechas) {
        if (f.length === 10) {
          const m = f.slice(0, 7);
          if (!map[m] || f > map[m]) map[m] = f;
        }
      }
    }
    return (mesStr: string) => map[mesStr] || '';
  }, [raw, meta.fechas]);

  // Días disponibles con datos para un mes determinado
  const getDiasMes = useMemo(() => {
    return (mesStr: string) => {
      if (!mesStr) return [];
      const set = new Set<string>();
      if (raw?.raw) {
        for (const r of raw.raw) {
          const f = String(r.Fecha || '').slice(0, 10);
          if (f.startsWith(mesStr) && f.length === 10) set.add(f);
        }
      }
      if (meta.fechas) {
        for (const f of meta.fechas) {
          if (f.startsWith(mesStr) && f.length === 10) set.add(f);
        }
      }
      if (set.size === 0 && mesStr.length === 7) {
        const [yStr, mStr] = mesStr.split('-');
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10);
        if (!isNaN(y) && !isNaN(m)) {
          const totalDias = new Date(y, m, 0).getDate();
          for (let d = 1; d <= totalDias; d++) {
            set.add(`${mesStr}-${String(d).padStart(2, '0')}`);
          }
        }
      }
      return Array.from(set).sort();
    };
  }, [raw, meta.fechas]);

  const diasProd = useMemo(() => getDiasMes(prodMes), [getDiasMes, prodMes]);
  const diasDig = useMemo(() => getDiasMes(digMes), [getDiasMes, digMes]);

  // Sincronización de días seleccionados con el mes
  useEffect(() => {
    if (prodTodosDias) return;
    setProdFechas(prev => {
      const valid = prev.filter(f => f.startsWith(prodMes));
      if (valid.length > 0) return valid;
      const u = ultimoDia(prodMes);
      return u ? [u] : (diasProd.length ? [diasProd[diasProd.length - 1]] : []);
    });
  }, [ultimoDia, prodMes, prodTodosDias, diasProd]);

  useEffect(() => {
    if (digTodosDias) return;
    setDigFechas(prev => {
      const valid = prev.filter(f => f.startsWith(digMes));
      if (valid.length > 0) return valid;
      const u = ultimoDia(digMes);
      return u ? [u] : (diasDig.length ? [diasDig[diasDig.length - 1]] : []);
    });
  }, [ultimoDia, digMes, digTodosDias, diasDig]);

  // ── Lógica Informe de Producción ──────────────────────────────────
  const generarProd = () => {
    if (!prodMes) {
      setProdError('Selecciona un mes para el informe de producción.');
      return;
    }
    setProdLoading(true);
    setProdError(null);
    setProdGenerado(true);
    setProdTienePorTecnico(prodPorTecnico);

    // Diferir el cálculo (síncrono) para que la barra de carga alcance a pintarse.
    setTimeout(() => {
    try {
      if (!raw?.raw || !raw.raw.length) {
        setProdRows([]);
        return;
      }

      // Filtrar registros
      const filtered = raw.raw.filter(r => {
        const fStr = String(r.Fecha || '');
        // Filtro Mes
        if (prodMes && !fStr.startsWith(prodMes)) return false;
        // Filtro Día
        if (!prodTodosDias && prodFechas.length > 0 && !prodFechas.includes(fStr.slice(0, 10))) return false;
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

      // Agrupar datos según prodPorTecnico
      const agg = new Map<string, {
        cedula?: string;
        tecnico?: string;
        zona: string;
        brigada: string;
        ordenes: number;
        produccion: number;
        meta: number;
      }>();

      filtered.forEach(r => {
        const zonaVal = String(r._Zona || r.Zona || r.Zona_Detalle || 'SIN ZONA');
        const brigadaVal = String(r.Tipo_Brigada_Operaciones || r.Tipo_Brigada_Mes || r.Tipo_Cuadrilla || 'SIN CLASIFICAR');
        const cedulaVal = String(r.Cedula || '');
        const tecnicoVal = String(r.Nombre || r.tecnico || (cedulaVal ? `C.C. ${cedulaVal}` : 'Desconocido'));

        const key = prodPorTecnico
          ? `${cedulaVal || tecnicoVal}|${zonaVal}|${brigadaVal}`
          : `${zonaVal}|${brigadaVal}`;

        let acc = agg.get(key);
        if (!acc) {
          acc = {
            cedula: cedulaVal,
            tecnico: tecnicoVal,
            zona: zonaVal,
            brigada: brigadaVal,
            ordenes: 0,
            produccion: 0,
            meta: 0,
          };
          agg.set(key, acc);
        }

        // Sumar órdenes (efectivas + fallidas con pago + fallidas sin pago + perdidas)
        acc.ordenes += n(r.Efectivas) + n(r.Fallida_Con_Pago) + n(r.Fallida_Sin_Pago) + n(r.Perdidas);
        // Producción valorizada SIN el ajuste de incremento (×1.30045647872):
        // Pesada/Liviana = Σ(valor_orden efectivas); disponibles = meta×prorrateo.
        acc.produccion += n(r.Ingresos_Base);
        // Sumar meta
        acc.meta += n(r.Meta_Facturacion);

        if (prodPorTecnico && r.Nombre && String(r.Nombre).trim()) {
          acc.tecnico = String(r.Nombre);
        }
      });

      const rows: ProduccionRow[] = Array.from(agg.values())
        .map(acc => {
          const prodRound = Math.round(acc.produccion);
          const metaRound = Math.round(acc.meta);
          const faltRound = Math.max(0, metaRound - prodRound);
          const rawCumpl = metaRound > 0 ? (prodRound / metaRound) * 100 : 0;
          const isDisp = isDisponibleType(acc.brigada);
          const cumpl = isDisp && rawCumpl > 100 ? 100 : rawCumpl;
          return {
            cedula: acc.cedula,
            tecnico: acc.tecnico,
            zona: acc.zona,
            brigada: acc.brigada,
            ordenes: acc.ordenes,
            produccion: prodRound,
            meta: metaRound,
            faltante: faltRound,
            cumplimiento: cumpl,
          };
        })
        .sort((a, b) => b.produccion - a.produccion);

      setProdRows(rows);
    } catch (e) {
      setProdError(String(e instanceof Error ? e.message : e));
      setProdRows([]);
    } finally {
      setProdLoading(false);
    }
    }, 60);
  };

  // Totales de Producción
  const prodTotales = useMemo(() => {
    return prodRows.reduce(
      (t, r) => ({
        ordenes: t.ordenes + r.ordenes,
        produccion: t.produccion + r.produccion,
        meta: t.meta + r.meta,
        faltante: t.faltante + r.faltante,
      }),
      { ordenes: 0, produccion: 0, meta: 0, faltante: 0 }
    );
  }, [prodRows]);

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
      if (!digTodosDias && digFechas.length > 0) qs.set('fechas', digFechas.join(','));
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

  // Columnas de tipo de orden a MOSTRAR: se ocultan las que están TODAS en 0.
  // 'total' (Total general) siempre se muestra.
  const visibleColsDig = useMemo(
    () => COLS.filter(c => c.key === 'total' || (digTotales[c.key] || 0) > 0),
    [digTotales]
  );

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

  const descDiasProd = () => {
    if (prodTodosDias || prodFechas.length === 0) return 'todos los días';
    if (prodFechas.length === 1) return prodFechas[0];
    return `${prodFechas.length} días`;
  };

  // ── Exportación Producción ────────────────────────────────────────
  const nombreArchivoProd = () => {
    const dStr = prodTodosDias || prodFechas.length === 0 ? 'todos' : prodFechas.length === 1 ? prodFechas[0] : `${prodFechas.length}dias`;
    return `informe_produccion_${prodMes}_${dStr}${prodZona ? '_' + prodZona : ''}${prodTipo ? '_' + prodTipo : ''}${prodTienePorTecnico ? '_tecnico' : ''}`;
  };

  const filasExportProd = () => {
    const filas = prodRows.map(r => {
      const o: Record<string, string | number> = {};
      if (prodTienePorTecnico) {
        o['Técnico'] = r.tecnico || '';
        o['Cédula'] = r.cedula || '';
      }
      o['Zona'] = r.zona;
      o['Tipo de brigada'] = r.brigada;
      o['Total Órdenes'] = r.ordenes;
      o['Producción Valorizada ($)'] = Math.round(r.produccion);
      o['Meta del Día ($)'] = Math.round(r.meta);
      o['Faltante ($)'] = Math.round(r.faltante);
      o['% Cumplimiento'] = `${r.cumplimiento.toFixed(1)}%`;
      return o;
    });

    if (prodRows.length > 0) {
      const totalFila: Record<string, string | number> = {};
      if (prodTienePorTecnico) {
        totalFila['Técnico'] = `TOTAL (${prodRows.length} registros)`;
        totalFila['Cédula'] = '';
      }
      totalFila['Zona'] = 'TOTAL';
      totalFila['Tipo de brigada'] = '';
      totalFila['Total Órdenes'] = prodTotales.ordenes;
      totalFila['Producción Valorizada ($)'] = Math.round(prodTotales.produccion);
      totalFila['Meta del Día ($)'] = Math.round(prodTotales.meta);
      totalFila['Faltante ($)'] = Math.round(prodTotales.faltante);
      const totCumpl = prodTotales.meta > 0 ? (prodTotales.produccion / prodTotales.meta) * 100 : 0;
      totalFila['% Cumplimiento'] = `${totCumpl.toFixed(1)}%`;
      filas.push(totalFila);
    }
    return filas;
  };

  const exportCSVProd = () => {
    const csv = Papa.unparse(filasExportProd(), { delimiter: ';' });
    descargar('\uFEFF' + csv, 'text/csv;charset=utf-8;', 'csv', nombreArchivoProd());
  };

  const exportExcelProd = () => {
    const data = filasExportProd();
    const cols = data.length ? Object.keys(data[0]) : [];
    const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const thead = '<tr>' + cols.map(c => `<th style="background:#0284c7;color:#ffffff;font-weight:bold;padding:7px 10px;text-align:center;">${esc(c)}</th>`).join('') + '</tr>';
    const tbody = data.map((r, idx) => {
      const isLast = idx === data.length - 1;
      const rowStyle = isLast ? 'background:#e2e8f0;font-weight:bold;' : '';
      return `<tr style="${rowStyle}">` + cols.map(c => {
        const val = r[c];
        const isMoney = c.includes('($)');
        const isNum = typeof val === 'number';
        let msoFormat = '';
        let align = 'text-align:left;';

        if (isMoney) {
          msoFormat = 'mso-number-format:"\\$#,##0";';
          align = 'text-align:right;';
        } else if (isNum) {
          msoFormat = 'mso-number-format:"#,##0";';
          align = 'text-align:right;';
        } else if (c.includes('%')) {
          align = 'text-align:right;';
        } else {
          msoFormat = 'mso-number-format:"\\@";';
        }

        return `<td style="padding:6px 10px;${align}${msoFormat}">${esc(val)}</td>`;
      }).join('') + '</tr>';
    }).join('');

    // Formato HTML compatible con Microsoft Excel (.xls)
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Informe Producción</x:Name>
                <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
      </head>
      <body>
        <table border="1">${thead}${tbody}</table>
      </body>
    </html>`;

    descargar(html, 'application/vnd.ms-excel;charset=utf-8', 'xls', nombreArchivoProd());
  };

  const descDiasDig = () => {
    if (digTodosDias || digFechas.length === 0) return 'todos los días';
    if (digFechas.length === 1) return digFechas[0];
    return `${digFechas.length} días`;
  };

  // ── Exportación Digitación ────────────────────────────────────────
  const nombreArchivoDig = () => {
    const dStr = digTodosDias || digFechas.length === 0 ? 'todos' : digFechas.length === 1 ? digFechas[0] : `${digFechas.length}dias`;
    return `informe_digitacion_${digMes}_${dStr}${digZona ? '_' + digZona : ''}${digTipo ? '_' + digTipo : ''}${digTienePorTecnico ? '_tecnico' : ''}`;
  };

  const filasExportDig = () => {
    const filas = digRows.map(r => {
      const o: Record<string, string | number> = { Fecha: String(r.fecha).slice(0, 10) };
      if (digTienePorTecnico) o['Técnico'] = String(r.tecnico ?? r.id_tecnico ?? '');
      o['Zona'] = String(r.zona ?? '');
      o['Tipo de brigada'] = String(r.brigada ?? '');
      for (const c of visibleColsDig) o[c.label] = Number(r[c.key]) || 0;
      return o;
    });

    if (digRows.length > 0) {
      const totalFila: Record<string, string | number> = { Fecha: 'TOTAL' };
      if (digTienePorTecnico) totalFila['Técnico'] = '';
      totalFila['Zona'] = '';
      totalFila['Tipo de brigada'] = '';
      for (const c of visibleColsDig) totalFila[c.label] = digTotales[c.key];
      filas.push(totalFila);
    }
    return filas;
  };

  const exportCSVDig = () => {
    const csv = Papa.unparse(filasExportDig(), { delimiter: ';' });
    descargar('\uFEFF' + csv, 'text/csv;charset=utf-8;', 'csv', nombreArchivoDig());
  };

  const exportExcelDig = () => {
    const data = filasExportDig();
    const cols = data.length ? Object.keys(data[0]) : ['Fecha', ...visibleColsDig.map(c => c.label)];
    const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const thead = '<tr>' + cols.map(c => `<th style="background:#0284c7;color:#ffffff;font-weight:bold;padding:7px 10px;text-align:center;">${esc(c)}</th>`).join('') + '</tr>';
    const tbody = data.map((r, idx) => {
      const isLast = idx === data.length - 1;
      const rowStyle = isLast ? 'background:#e2e8f0;font-weight:bold;' : '';
      return `<tr style="${rowStyle}">` + cols.map(c => {
        const val = r[c];
        const isNum = typeof val === 'number';
        const align = isNum ? 'text-align:right;' : 'text-align:left;';
        return `<td style="padding:6px 10px;${align}">${esc(val)}</td>`;
      }).join('') + '</tr>';
    }).join('');

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Informe Digitación</x:Name>
                <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
      </head>
      <body>
        <table border="1">${thead}${tbody}</table>
      </body>
    </html>`;

    descargar(html, 'application/vnd.ms-excel;charset=utf-8', 'xls', nombreArchivoDig());
  };

  /* ─── Color semáforo para el faltante ─── */
  const colorFaltante = (faltante: number, metaVal: number) => {
    if (metaVal <= 0) return MUT;
    const pct = faltante / metaVal;
    if (pct <= 0) return OK;
    if (pct < 0.3) return WARN;
    return ERR;
  };

  /* ─── Estilos de controles y tablas ─── */
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

  const rawTotProdCumpl = prodTotales.meta > 0 ? (prodTotales.produccion / prodTotales.meta) * 100 : 0;
  const totProdCumpl = (prodTipo === 'disponibles' && rawTotProdCumpl > 100) ? 100 : rawTotProdCumpl;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ButtonMenuOperativo />

      <div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, color: INK }}>INFORMES</div>
        <div style={{ fontSize: 12.5, color: MUT, marginTop: 2 }}>Módulo de informes y reportes operativos</div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ═══ 1. INFORME DE PRODUCCIÓN ═══ */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <button
        onClick={() => setProdAbierto(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer',
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px',
        }}
      >
        <span style={{ fontSize: 26 }}>💰</span>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: INK }}>Informe de producción</span>
          <span style={{ fontSize: 12, color: MUT }}>Producción valorizada, meta del día y faltante por tipo de brigada o técnico</span>
        </span>
        <span style={{ marginLeft: 'auto', color: MUT, fontSize: 13 }}>▸ Abrir</span>
      </button>

      {/* Modal — Informe de Producción */}
      {prodAbierto && (
        <div className="modal-back open" style={{ zIndex: 9999 }} onClick={e => { if (e.target === e.currentTarget) setProdAbierto(false); }}>
          <div className="modal-box" style={{ width: '95vw', maxWidth: 1400, height: '90vh' }}>
            <div className="modal-head">
              <div>
                <h3>💰 Informe de producción</h3>
                <div className="sub">Producción valorizada, meta del día y faltante</div>
              </div>
              <button className="modal-close" onClick={() => setProdAbierto(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: 18, overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              <select style={inp} value={prodMes} onChange={e => { setProdMes(e.target.value); setProdFechas([]); }}>
                {availableMeses.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>DÍAS</label>
              <MultiDayDropdown
                mes={prodMes}
                fechas={prodFechas}
                onChangeFechas={setProdFechas}
                todosDias={prodTodosDias}
                onChangeTodosDias={setProdTodosDias}
                availableDays={diasProd}
                colors={colors}
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
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-body)', cursor: 'pointer' }}>
            <input type="checkbox" checked={prodPorTecnico} onChange={e => setProdPorTecnico(e.target.checked)} />
            Discriminar por técnico
          </label>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={btn(colors.sip)} onClick={generarProd} disabled={prodLoading}>
              {prodLoading ? 'Generando…' : 'Generar informe'}
            </button>
            {prodRows.length > 0 && (
              <>
                <button style={btn(colors.ok)} onClick={exportExcelProd}>⬇ Excel</button>
                <button style={btn(colors.otc)} onClick={exportCSVProd}>⬇ CSV</button>
              </>
            )}
          </div>
              </div>

              {/* Error de producción */}
              {prodError && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, color: colors.err, fontSize: 13 }}>
          ⚠ {prodError}
        </div>
      )}

              {/* Barra de carga de producción */}
              {prodLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
          <div className="spinner" style={{ width: 20, height: 20, borderWidth: 3 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>Buscando información…</span>
        </div>
      )}

              {/* Tabla y Resultados de Producción */}
              {prodGenerado && !prodError && !prodLoading && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13.5, fontWeight: 700, color: INK }}>
            Producción {prodMes} · {descDiasProd()}{prodZona ? ` · ${prodZona}` : ''}{prodTipo ? ` · ${prodTipo}` : ''}
            <span style={{ fontWeight: 500, color: MUT }}> — {prodRows.length} {prodTienePorTecnico ? 'técnicos' : 'operativas'}</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            {prodRows.length === 0 && !prodLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: MUT, fontSize: 13 }}>Sin datos para los filtros seleccionados.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: prodTienePorTecnico ? 1080 : 920 }}>
                <thead>
                  <tr style={{ background: 'rgba(128,128,128,0.16)' }}>
                    <th style={{ ...th, textAlign: 'left', width: 40 }}>#</th>
                    {prodTienePorTecnico && <th style={{ ...th, textAlign: 'left' }}>Técnico</th>}
                    <th style={{ ...th, textAlign: 'left' }}>Zona</th>
                    <th style={{ ...th, textAlign: 'left' }}>Tipo de brigada</th>
                    <th style={th}>Total Órdenes</th>
                    <th style={th}>Producción ($)</th>
                    <th style={th}>Meta del Día ($)</th>
                    <th style={th}>Faltante ($)</th>
                    <th style={{ ...th, width: 90 }}>Cumplimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {prodRows.map((r, i) => {
                    const fColor = colorFaltante(r.faltante, r.meta);
                    const cColor = r.cumplimiento >= 100 ? OK : r.cumplimiento >= 70 ? WARN : ERR;
                    return (
                      <tr
                        key={i}
                        style={{ transition: 'background .15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ ...td, textAlign: 'left', color: MUT, fontSize: 11, fontWeight: 600 }}>{i + 1}</td>
                        {prodTienePorTecnico && (
                          <td style={{ ...td, textAlign: 'left', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: INK }} title={r.tecnico}>
                            {r.tecnico}
                          </td>
                        )}
                        <td style={{ ...td, textAlign: 'left', color: 'var(--text-body)' }}>{r.zona}</td>
                        <td style={{ ...td, textAlign: 'left', color: 'var(--text-body)' }}>{r.brigada}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{fmtN(r.ordenes)}</td>
                        <td style={{ ...td, fontWeight: 700, color: OK }}>{fmtCOP(r.produccion)}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{fmtCOP(r.meta)}</td>
                        <td style={{ ...td, fontWeight: 700, color: fColor }}>
                          {r.faltante > 0 ? fmtCOP(r.faltante) : '✓ $0'}
                        </td>
                        <td style={td}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            color: cColor,
                            background: cColor + '18',
                          }}>
                            {r.cumplimiento.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {prodRows.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--bg-soft, rgba(127,127,127,.08))', borderTop: '2px solid var(--border)' }}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 800, color: INK }}>TOTAL</td>
                      {prodTienePorTecnico && <td style={td} />}
                      <td style={td} />
                      <td style={td} />
                      <td style={{ ...td, fontWeight: 800, color: INK }}>{fmtN(prodTotales.ordenes)}</td>
                      <td style={{ ...td, fontWeight: 800, color: OK }}>{fmtCOP(prodTotales.produccion)}</td>
                      <td style={{ ...td, fontWeight: 800, color: INK }}>{fmtCOP(prodTotales.meta)}</td>
                      <td style={{ ...td, fontWeight: 800, color: colorFaltante(prodTotales.faltante, prodTotales.meta) }}>
                        {prodTotales.faltante > 0 ? fmtCOP(prodTotales.faltante) : '✓ $0'}
                      </td>
                      <td style={td}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          color: totProdCumpl >= 100 ? OK : totProdCumpl >= 70 ? WARN : ERR,
                          background: (totProdCumpl >= 100 ? OK : totProdCumpl >= 70 ? WARN : ERR) + '18',
                        }}>
                          {totProdCumpl.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </div>
              )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ═══ 2. INFORME DE DIGITACIÓN ═══ */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <button
        onClick={() => setDigAbierto(true)}
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
        <span style={{ marginLeft: 'auto', color: MUT, fontSize: 13 }}>▸ Abrir</span>
      </button>

      {/* Modal — Informe de Digitación */}
      {digAbierto && (
        <div className="modal-back open" style={{ zIndex: 9999 }} onClick={e => { if (e.target === e.currentTarget) setDigAbierto(false); }}>
          <div className="modal-box" style={{ width: '95vw', maxWidth: 1400, height: '90vh' }}>
            <div className="modal-head">
              <div>
                <h3>📋 Informe digitación</h3>
                <div className="sub">Órdenes digitadas por día y tipo de orden</div>
              </div>
              <button className="modal-close" onClick={() => setDigAbierto(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: 18, overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              <select style={inp} value={digMes} onChange={e => { setDigMes(e.target.value); setDigFechas([]); }}>
                {meta.meses.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>DÍAS</label>
              <MultiDayDropdown
                mes={digMes}
                fechas={digFechas}
                onChangeFechas={setDigFechas}
                todosDias={digTodosDias}
                onChangeTodosDias={setDigTodosDias}
                availableDays={diasDig}
                colors={colors}
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

              {/* Error de digitación */}
              {digError && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, color: colors.err, fontSize: 13 }}>
          ⚠ {digError}
        </div>
      )}

              {/* Barra de carga de digitación */}
              {digLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
          <div className="spinner" style={{ width: 20, height: 20, borderWidth: 3 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>Buscando información…</span>
        </div>
      )}

              {/* Resultados de Digitación */}
              {digGenerado && !digError && !digLoading && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13.5, fontWeight: 700, color: INK }}>
            Digitación {digMes} · {descDiasDig()}{digZona ? ` · ${digZona}` : ''}{digTipo ? ` · ${digTipo}` : ''}
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
                    {visibleColsDig.map(c => <th key={c.key} style={th}>{c.label}</th>)}
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
                      {visibleColsDig.map(c => (
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
                      {visibleColsDig.map(c => <td key={c.key} style={{ ...td, fontWeight: 800, color: INK }}>{digTotales[c.key]}</td>)}
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </div>
              )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
