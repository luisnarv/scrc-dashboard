'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { useTheme } from '../components/ThemeProvider';
import { ButtonMenuOperativo } from '../components/Buttons';
import { fmtN, fmtCOP } from '../components/utils/formatters';
import { getMetaDiariaEfectivas } from '../components/utils/metasBrigadas';

// Estructura de fila de analitica.v_ordenes_dia_barrio
export interface BarrioRow {
  dia_operativo: string;
  proyecto_id: number;
  proyecto: string;
  zona: string;
  actividad: string;
  municipio: string;
  barrio: string;
  pendientes: number;
  asignadas: number;
  bajas_webservice: number;
  ejecutadas: number;
  ejecutadas_exitosas: number;
  ejecutadas_fallidas: number;
  excluidas: number;
  sin_ubicar: number;
  sin_estado: number;
  total: number;
  deuda_total: number;
}

// Estructura multidimensional de analitica.v_ordenes_dia
export interface OrdenAgrupadaRow {
  proyecto: string;
  zona: string;
  municipio: string;
  barrio: string;
  tipo_orden: string;
  categoria_os: 'Suspensión' | 'Se mantiene suspendido' | 'Reconexión' | 'Otro';
  estado: string | null;
  estado_legible: string;
  asignacion_status: 'Asignado' | 'No asignado';
  tecnico: string;
  cantidad: number;
  deuda_total: number | string | null;
  fac_venc_1?: number;
  fac_venc_2?: number;
  fac_venc_3?: number;
  fac_venc_mas_3?: number;
}

// "Asignadas" combinado: (Asignada HOY en el sistema) UNIÓN (mano de obra del MES completo).
// Una orden cuenta una sola vez aunque esté en ambos conjuntos (ver DISTINCT ON en el backend).
export interface AsignadaTotalRow {
  proyecto: string;
  zona: string;
  municipio: string;
  barrio: string;
  tipo_orden: string;
  categoria_os: 'Suspensión' | 'Reconexión' | 'Otro';
  tecnico: string;
  cantidad: number;
  deuda_total: number | string | null;
}

// Cierres de mano de obra del mes agrupados por día -- alimenta el gráfico "Comparativa..."
// cuando está activo "Ver Todo el Mes" (eje X = día en vez de barrio).
export interface MoPorDiaRow {
  fecha: string;
  proyecto: string;
  zona: string;
  municipio: string;
  barrio: string;
  categoria_os: 'Suspensión' | 'Reconexión' | 'Otro';
  tecnico: string;
  resultado: 'Ejecutada' | 'Cancelada';
  estado_norm: 'Efectiva' | 'Fallida' | 'Perdida' | 'Sin Clasificar';
  cantidad: number;
}

// Pendientes REALES por día (no un estimado): analitica.v_ordenes_mes es un snapshot diario del
// universo completo de órdenes -- para cada día, órdenes que el sistema origen marcaba
// 'DISPONIBLE' ese día y que mano de obra todavía no había cerrado (fecha_cierre <= ese día).
export interface MesPendientesRow {
  fecha: string;
  proyecto: string;
  zona: string;
  municipio: string;
  barrio: string;
  categoria_os: 'Suspensión' | 'Reconexión' | 'Otro';
  pendientes: number;
  asignadas: number;
}

// Estructura de técnico activo
export interface TecnicoRow {
  tecnico: string;
  proyecto: string;
  zona: string;
  total: number;
  asignadas: number;
  suspension: number;
  reconexion: number;
  se_mantiene: number;
  barrios_count: number;
}

// Estructura de distribución horaria de analitica.v_ordenes_dia
export interface BarrioHoraRow {
  hora: string;
  proyecto: string;
  zona: string;
  municipio: string;
  barrio: string;
  tipo_orden?: string;
  total: number;
  asignadas: number;
  pendientes: number;
  ejecutadas: number;
}

// Estructura de detalle de analitica.v_ordenes_dia
export interface OrdenDetalleRow {
  dia_operativo: string;
  proyecto_id: number;
  proyecto: string;
  zona: string;
  actividad: string;
  orden: string;
  nic: string;
  estado: string | null;
  estado_legible: string;
  exclusiones: string | null;
  resultado: string | null;
  tipo_orden: string;
  sector: string;
  prioridad: string;
  municipio: string;
  barrio: string;
  deuda: string | number;
  tecnico: string;
  lat: number | null;
  lng: number | null;
  actualizado_en: string;
}

// Estructura de metas por zona y tipo de brigada
export interface MetaBrigadaRow {
  dia_operativo: string;
  proyecto: string;
  zona: string;
  tipo_brigada: string;
  brigadas_activas: number;
  total_ordenes: number;
  asignadas: number;
  ejecutadas: number;
  pendientes: number;
}

// Cierres del mes completo por barrio (mano de obra / SIPREM) -- alimenta el gráfico cuando
// el usuario activa "Ver todo el mes". "asignadas" aquí es el acumulado mensual de mano de obra,
// no un estado del día.
export interface BarrioMesRow {
  proyecto: string;
  zona: string;
  municipio: string;
  barrio: string;
  asignadas: number;
  suspension: number;
  reconexion: number;
  deuda: number | string | null;
}

export interface ProcessedMetaBrigada extends MetaBrigadaRow {
  metaUnit: number;
  metaTotal: number;
  pctAsignado: number;
  pctCumplidoVsAsignado: number;
  pctCumplidoVsMeta: number;
  brecha: number;
}

// Clasificación oficial de tipos de OS (Para Asignación Operativa: TO503 y TO506 se consolidan con Suspensión)
export function clasificarTipoOS(tipo: string): 'Suspensión' | 'Reconexión' | 'Otro' {
  const t = (tipo || '').toUpperCase().trim();
  if (['TO501', 'TO504', 'TO503', 'TO506'].includes(t)) return 'Suspensión';
  if (t === 'TO502') return 'Reconexión';
  return 'Otro';
}

// Función robusta para coincidencia de proyecto
export function proyCoincide(rProy: string, filtro: string): boolean {
  if (!filtro || filtro === 'ALL') return true;
  const p = (rProy || '').toUpperCase();
  if (filtro === 'Sur') return p.includes('SUR');
  if (filtro === 'Norte-Centro') return p.includes('NORTE') || p.includes('CENTRO');
  return p.includes(filtro.toUpperCase());
}

// Función robusta para coincidencia de zona (admite individual, múltiple por comas y ALL)
export function zonaCoincide(rZona: string, filtro: string): boolean {
  if (!filtro || filtro === 'ALL') return true;
  const r = (rZona || '').toUpperCase().trim();
  if (filtro.includes(',')) {
    const list = filtro.split(',').map(s => s.toUpperCase().trim()).filter(Boolean);
    return list.includes(r);
  }
  return r === filtro.toUpperCase().trim();
}

// Horas de la jornada operativa hasta las 11:00 PM (23:00)
export const HORAS_JORNADA = [
  '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
  '19:00', '20:00', '21:00', '22:00', '23:00'
];

export default function AsignacionOperativaPage() {
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';
  const { filters, setFilters, proyList, zonaList } = useDashboard();

  // Estados de datos remotos
  const [dataBarrios, setDataBarrios] = useState<BarrioRow[]>([]);
  const [ordenesAgrupadas, setOrdenesAgrupadas] = useState<OrdenAgrupadaRow[]>([]);
  const [tecnicosLista, setTecnicosLista] = useState<TecnicoRow[]>([]);
  const [dataHoras, setDataHoras] = useState<BarrioHoraRow[]>([]);
  const [dataMetasBrigadas, setDataMetasBrigadas] = useState<MetaBrigadaRow[]>([]);
  const [dataMesBarrios, setDataMesBarrios] = useState<BarrioMesRow[]>([]);
  const [dataAsignadasTotal, setDataAsignadasTotal] = useState<AsignadaTotalRow[]>([]);
  const [dataMesPorDia, setDataMesPorDia] = useState<MoPorDiaRow[]>([]);
  const [dataMesPendientesPorDia, setDataMesPendientesPorDia] = useState<MesPendientesRow[]>([]);
  const [verGraficoMes, setVerGraficoMes] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados y Filtros para Metas de Órdenes por Zona y Brigada
  const [filtroMetaZona, setFiltroMetaZona] = useState<string>('ALL');
  const [filtroMetaBrigada, setFiltroMetaBrigada] = useState<string>('ALL');
  const [filtroMetaCumplimiento, setFiltroMetaCumplimiento] = useState<'ALL' | 'ALTA' | 'MEDIA' | 'BAJA'>('ALL');
  const [ordenMetas, setOrdenMetas] = useState<'asignadas' | 'meta' | 'cumplimiento_asig' | 'cumplimiento_meta'>('asignadas');

  // Filtros principales solicitados por el usuario
  // 1. Filtro de visualización en el gráfico (Métrica o Estado)
  // 'asig_vs_pend' (comparativa), 'todas' (total cargadas), 'solo_asignadas', 'solo_pendientes', 'por_tipo_os'
  const [filtroModoGrafico, setFiltroModoGrafico] = useState<'asig_vs_pend' | 'todas' | 'solo_asignadas' | 'solo_pendientes' | 'por_tipo_os'>('asig_vs_pend');

  // 2. Filtro de Tipo de OS / Orden: 'ALL', 'SUSPENSION', 'RECONEXION', o código puntual 'TO501', 'TO502', etc.
  const [filtroTipoOS, setFiltroTipoOS] = useState<string>('ALL');

  // 3. Filtro de Asignación: 'ALL', 'ASIGNADO' (con técnico), 'NO_ASIGNADO' (sin asignar)
  const [filtroAsignacion, setFiltroAsignacion] = useState<'ALL' | 'ASIGNADO' | 'NO_ASIGNADO' | 'EJECUTADA' | 'CANCELADA' | 'EXCLUIDA'>('ALL');

  // 4. Filtro por Técnico específico: 'ALL' o nombre del técnico
  const [filtroTecnico, setFiltroTecnico] = useState<string>('ALL');

  // Filtros geográficos y de presentación
  const [municipioFiltro, setMunicipioFiltro] = useState<string>('ALL');
  const TOP_CANTIDAD_GRAFICA = 15;
  const [barriosSeleccionados, setBarriosSeleccionados] = useState<string[]>([]);
  const [busquedaBarrio, setBusquedaBarrio] = useState<string>('');
  const [criterioOrden, setCriterioOrden] = useState<'pendientes' | 'asignadas' | 'total' | 'suspension' | 'reconexion'>('pendientes');

  // Opciones de configuración de gráfico
  const [modoVisualizacion, setModoVisualizacion] = useState<'barras_agrupadas' | 'barras_apiladas' | 'horario'>('barras_agrupadas');
  const [mostrarEtiquetas, setMostrarEtiquetas] = useState<boolean>(true);
  const [mostrarLineasPromedio, setMostrarLineasPromedio] = useState<boolean>(true);

  // Modal para detalle de órdenes individuales de analitica.v_ordenes_dia
  const [modalDetalleOpen, setModalDetalleOpen] = useState(false);
  const [barrioModal, setBarrioModal] = useState<string | null>(null);
  const [ordenesDetalle, setOrdenesDetalle] = useState<OrdenDetalleRow[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  // Modal para ver los técnicos asignados a un barrio
  const [modalTecnicosBarrio, setModalTecnicosBarrio] = useState<{ barrio: string; tecnicos: { tecnico: string; total: number; suspension: number; reconexion: number }[] } | null>(null);

  // Canvas y Chart.js ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<any>(null);

  // Estilos del tema — alineados al sistema de colores compartido (globals.css / ThemeProvider).
  // textInk/textMut/colorX/primaryCol se usan también dentro del canvas de Chart.js (más abajo),
  // donde `var(--token)` no resuelve (Canvas 2D no interpreta custom properties), así que se
  // toman los valores hex ya resueltos por tema desde `colors` (ThemeProvider), que espejan
  // exactamente los tokens de globals.css. bgCard sí es solo JSX y puede usar var() directamente.
  // borderCol también se usa en el canvas (tooltip borderColor), por lo que se fija al valor
  // real de --border en vez de un string var().
  const bgCard = 'var(--card)';
  const borderCol = isDark ? '#1E3A5F' : '#E0E0E0'; // = --border
  const textInk = colors.ink; // = --text-title
  const textMut = colors.mut; // = --text-muted
  const colorAsignadas = colors.sip; // Azul/verde operativo (--sip)
  const colorPendientes = colors.warn; // Ámbar alerta (--warn)
  const colorSuspension = colors.err; // Rojo corte (--err)
  const colorReconexion = colors.ok; // Verde reconexión (--ok)
  const colorSeMantiene = colors.otc; // Acento "se mantiene" (--otc)
  const primaryCol = colors.sip;

  // Cargar datos de la API
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/data/cierre_diario');
      if (!res.ok) throw new Error(`HTTP ${res.status}: Error al obtener datos`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDataBarrios(json.barrios || []);
      setOrdenesAgrupadas(json.ordenesAgrupadas || []);
      setTecnicosLista(json.tecnicos || []);
      setDataHoras(json.barriosHoras || []);
      setDataMetasBrigadas(json.metasBrigadas || []);
      setDataMesBarrios(json.barriosMes || []);
      setDataAsignadasTotal(json.asignadasTotal || []);
      setDataMesPorDia(json.mesPorDia || []);
    } catch (err: any) {
      console.error('Error cargando datos de cierre diario:', err);
      setError(err.message || 'Error al conectar con la base de datos');
    } finally {
      setLoading(false);
    }

    // Pendientes por día: consulta pesada (v_ordenes_mes), va aparte y sin bloquear la pantalla --
    // las barras de barrios pendientes del gráfico aparecen cuando llega.
    try {
      const resPend = await fetch('/api/data/cierre_diario_pendientes');
      if (resPend.ok) {
        const jsonPend = await resPend.json();
        setDataMesPendientesPorDia(jsonPend.mesPendientesPorDia || []);
      }
    } catch (err) {
      console.error('Error cargando pendientes por día:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Cargar detalle de órdenes individuales de v_ordenes_dia
  const fetchDetalle = async (barrioNombre?: string) => {
    setLoadingDetalle(true);
    setBarrioModal(barrioNombre || null);
    setModalDetalleOpen(true);
    try {
      const params = new URLSearchParams({ detalle: 'true' });
      if (barrioNombre) params.set('barrio', barrioNombre);
      if (filters.proy !== 'ALL') params.set('proy', filters.proy);
      if (filters.zona !== 'ALL') params.set('zona', filters.zona);
      if (municipioFiltro !== 'ALL') params.set('municipio', municipioFiltro);
      if (filtroTipoOS !== 'ALL') {
        if (filtroTipoOS === 'SUSPENSION') {
          params.set('categoria_os', 'Suspensión');
        } else if (filtroTipoOS === 'RECONEXION') {
          params.set('categoria_os', 'Reconexión');
        } else {
          params.set('tipo_orden', filtroTipoOS);
        }
      }
      // Estado de la orden -> filtro real por estado_legible en el backend (antes
      // reusaba el valor como si fuera un nombre de técnico, que solo tenía sentido
      // para Asignado/No asignado; con Ejecutada/Cancelada/Excluida ya no aplica).
      if (filtroAsignacion !== 'ALL') {
        const estadoLegibleMap: Record<string, string> = {
          ASIGNADO: 'Asignada',
          NO_ASIGNADO: 'Pendiente',
          EJECUTADA: 'Ejecutada',
          CANCELADA: 'Baja por WebService',
          EXCLUIDA: 'Excluida',
        };
        params.set('estado', estadoLegibleMap[filtroAsignacion] || filtroAsignacion);
      }
      if (filtroTecnico !== 'ALL') {
        params.set('tecnico', filtroTecnico);
      }

      const res = await fetch(`/api/data/cierre_diario?${params.toString()}`);
      if (!res.ok) throw new Error('Error al consultar detalle');
      const json = await res.json();
      setOrdenesDetalle(json.ordenes || []);
    } catch (err: any) {
      console.error('Error cargando v_ordenes_dia:', err);
      setOrdenesDetalle([]);
    } finally {
      setLoadingDetalle(false);
    }
  };

  // Zonas disponibles con datos reales según proyecto activo
  const zonasDisponibles = useMemo(() => {
    const s = new Set<string>();
    ordenesAgrupadas.forEach(r => {
      if (!proyCoincide(r.proyecto, filters.proy)) return;
      if (r.zona && (r.cantidad || 0) > 0) s.add(r.zona.toUpperCase().trim());
    });
    return Array.from(s).sort();
  }, [ordenesAgrupadas, filters.proy]);

  // Municipios disponibles con datos reales según proyecto y zona activos
  const municipiosDisponibles = useMemo(() => {
    const s = new Set<string>();
    ordenesAgrupadas.forEach(r => {
      if (!proyCoincide(r.proyecto, filters.proy)) return;
      if (!zonaCoincide(r.zona, filters.zona)) return;
      if (r.municipio && (r.cantidad || 0) > 0) s.add(r.municipio.trim());
    });
    return Array.from(s).sort();
  }, [ordenesAgrupadas, filters.proy, filters.zona]);

  // Tipos de OS disponibles con datos reales (> 0 órdenes)
  const tiposOSDisponibles = useMemo(() => {
    const counts = {
      SUSPENSION: 0,
      RECONEXION: 0,
      TO501: 0,
      TO504: 0,
      TO503: 0,
      TO506: 0,
      TO502: 0,
    };
    ordenesAgrupadas.forEach(r => {
      if (!proyCoincide(r.proyecto, filters.proy)) return;
      if (!zonaCoincide(r.zona, filters.zona)) return;
      if (municipioFiltro !== 'ALL' && (r.municipio || '').toUpperCase() !== municipioFiltro.toUpperCase()) return;
      const t = (r.tipo_orden || '').toUpperCase().trim();
      const c = r.cantidad || 0;
      if (['TO501', 'TO504', 'TO503', 'TO506'].includes(t)) {
        counts.SUSPENSION += c;
        if (t in counts) counts[t as keyof typeof counts] += c;
      } else if (t === 'TO502') {
        counts.RECONEXION += c;
        counts.TO502 += c;
      }
    });
    return counts;
  }, [ordenesAgrupadas, filters.proy, filters.zona, municipioFiltro]);

  // Estados de Asignación disponibles con datos reales
  const estadosAsignacionDisponibles = useMemo(() => {
    let asignadas = 0;
    let noAsignadas = 0;
    let ejecutadas = 0;
    let canceladas = 0;
    let excluidas = 0;
    let total = 0;
    ordenesAgrupadas.forEach(r => {
      if (!proyCoincide(r.proyecto, filters.proy)) return;
      if (!zonaCoincide(r.zona, filters.zona)) return;
      if (municipioFiltro !== 'ALL' && (r.municipio || '').toUpperCase() !== municipioFiltro.toUpperCase()) return;
      if (filtroTipoOS !== 'ALL') {
        if (filtroTipoOS === 'SUSPENSION' && !['TO501', 'TO504', 'TO503', 'TO506'].includes(r.tipo_orden)) return;
        if (filtroTipoOS === 'RECONEXION' && r.tipo_orden !== 'TO502') return;
        if (!['SUSPENSION', 'RECONEXION'].includes(filtroTipoOS) && r.tipo_orden !== filtroTipoOS) return;
      }
      const c = r.cantidad || 0;
      total += c;
      // Estado oficial de la orden (estado_legible), no si el campo técnico tiene nombre:
      // Asignada = ya tiene técnico; Pendiente = disponible sin ejecutar; Ejecutada = ya
      // cerrada; Baja por WebService = cancelada por pago; Excluida/Sin ubicar = fuera de
      // operación.
      if (r.estado_legible === 'Asignada') asignadas += c;
      else if (r.estado_legible === 'Pendiente') noAsignadas += c;
      else if (r.estado_legible === 'Ejecutada') ejecutadas += c;
      else if (r.estado_legible === 'Baja por WebService') canceladas += c;
      else if (r.estado_legible === 'Excluida' || r.estado_legible === 'Sin ubicar') excluidas += c;
    });
    return { asignadas, noAsignadas, ejecutadas, canceladas, excluidas, total };
  }, [ordenesAgrupadas, filters.proy, filters.zona, municipioFiltro, filtroTipoOS]);

  // Técnicos disponibles con datos reales (órdenes asignadas > 0 en el contexto filtrado)
  const tecnicosDisponibles = useMemo(() => {
    const map = new Map<string, { total: number; suspension: number; reconexion: number; barrios: Set<string> }>();
    ordenesAgrupadas.forEach(r => {
      if (!proyCoincide(r.proyecto, filters.proy)) return;
      if (!zonaCoincide(r.zona, filters.zona)) return;
      if (municipioFiltro !== 'ALL' && (r.municipio || '').toUpperCase() !== municipioFiltro.toUpperCase()) return;
      if (filtroTipoOS !== 'ALL') {
        if (filtroTipoOS === 'SUSPENSION' && !['TO501', 'TO504', 'TO503', 'TO506'].includes(r.tipo_orden)) return;
        if (filtroTipoOS === 'RECONEXION' && r.tipo_orden !== 'TO502') return;
        if (!['SUSPENSION', 'RECONEXION'].includes(filtroTipoOS) && r.tipo_orden !== filtroTipoOS) return;
      }
      if (r.asignacion_status === 'Asignado' && r.tecnico && r.tecnico !== 'No asignado' && r.tecnico.trim() !== '') {
        const nom = r.tecnico.trim();
        let entry = map.get(nom);
        if (!entry) {
          entry = { total: 0, suspension: 0, reconexion: 0, barrios: new Set() };
          map.set(nom, entry);
        }
        const c = r.cantidad || 0;
        entry.total += c;
        if (['TO501', 'TO504', 'TO503', 'TO506'].includes(r.tipo_orden)) entry.suspension += c;
        if (r.tipo_orden === 'TO502') entry.reconexion += c;
        if (r.barrio) entry.barrios.add(r.barrio);
      }
    });
    return Array.from(map.entries())
      .filter(([_, d]) => d.total > 0)
      .map(([tecnico, d]) => ({
        tecnico,
        total: d.total,
        suspension: d.suspension,
        reconexion: d.reconexion,
        barrios_count: d.barrios.size,
      }))
      .sort((a, b) => b.total - a.total);
  }, [ordenesAgrupadas, filters.proy, filters.zona, municipioFiltro, filtroTipoOS]);

  // Auto-reseteo de filtros huérfanos cuando cambian dimensiones superiores
  useEffect(() => {
    if (filters.zona !== 'ALL' && zonasDisponibles.length > 0) {
      const activeList = filters.zona.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      const validList = activeList.filter(z => zonasDisponibles.some(zd => zd.toUpperCase() === z));
      if (validList.length === 0) {
        setFilters({ zona: 'ALL' });
      } else if (validList.length !== activeList.length) {
        setFilters({ zona: validList.join(',') });
      }
    }
  }, [zonasDisponibles, filters.zona, setFilters]);

  useEffect(() => {
    if (municipioFiltro !== 'ALL' && !municipiosDisponibles.includes(municipioFiltro)) {
      setMunicipioFiltro('ALL');
    }
  }, [municipiosDisponibles, municipioFiltro]);

  useEffect(() => {
    if (filtroTipoOS !== 'ALL') {
      const cnt = (tiposOSDisponibles as Record<string, number>)[filtroTipoOS] || 0;
      if (cnt === 0) setFiltroTipoOS('ALL');
    }
  }, [tiposOSDisponibles, filtroTipoOS]);

  useEffect(() => {
    if (filtroAsignacion === 'ASIGNADO' && estadosAsignacionDisponibles.asignadas === 0 && estadosAsignacionDisponibles.noAsignadas > 0) {
      setFiltroAsignacion('ALL');
    } else if (filtroAsignacion === 'NO_ASIGNADO' && estadosAsignacionDisponibles.noAsignadas === 0 && estadosAsignacionDisponibles.asignadas > 0) {
      setFiltroAsignacion('ALL');
    }
  }, [estadosAsignacionDisponibles, filtroAsignacion]);

  useEffect(() => {
    if (filtroTecnico !== 'ALL' && !tecnicosDisponibles.some(t => t.tecnico === filtroTecnico)) {
      setFiltroTecnico('ALL');
    }
  }, [tecnicosDisponibles, filtroTecnico]);

  // Filtrado de las órdenes agrupadas según TODOS los criterios
  const filteredAgrupadas = useMemo(() => {
    return ordenesAgrupadas.filter(r => {
      // 1. Proyecto
      if (!proyCoincide(r.proyecto, filters.proy)) return false;
      // 2. Zona
      if (!zonaCoincide(r.zona, filters.zona)) return false;
      // 3. Municipio
      if (municipioFiltro !== 'ALL' && (r.municipio || '').toUpperCase() !== municipioFiltro.toUpperCase()) return false;
      // 4. Búsqueda de barrio o municipio
      if (busquedaBarrio.trim()) {
        const q = busquedaBarrio.toLowerCase().trim();
        const b = (r.barrio || '').toLowerCase();
        const m = (r.municipio || '').toLowerCase();
        if (!b.includes(q) && !m.includes(q)) return false;
      }
      // 5. Filtro de Tipo de OS (TO503 y TO506 consolidadas con Suspensión)
      if (filtroTipoOS !== 'ALL') {
        if (filtroTipoOS === 'SUSPENSION') {
          if (!['TO501', 'TO504', 'TO503', 'TO506'].includes(r.tipo_orden)) return false;
        } else if (filtroTipoOS === 'RECONEXION') {
          if (r.tipo_orden !== 'TO502') return false;
        } else {
          // Código individual (TO501, TO502, TO503, TO504, TO506)
          if (r.tipo_orden !== filtroTipoOS) return false;
        }
      }
      // 6. Filtro de Estado de la Orden: usa el estado OFICIAL (estado_legible), no si el
      // campo técnico tiene nombre -- una orden puede tener técnico y seguir en estado
      // "Pendiente" (aún no ejecutada) o ya "Ejecutada"/"Baja por WebService" (cancelada por
      // pago), que no son ni Asignada ni Pendiente.
      if (filtroAsignacion === 'ASIGNADO' && r.estado_legible !== 'Asignada') return false;
      if (filtroAsignacion === 'NO_ASIGNADO' && r.estado_legible !== 'Pendiente') return false;
      if (filtroAsignacion === 'EJECUTADA' && r.estado_legible !== 'Ejecutada') return false;
      if (filtroAsignacion === 'CANCELADA' && r.estado_legible !== 'Baja por WebService') return false;
      if (filtroAsignacion === 'EXCLUIDA' && r.estado_legible !== 'Excluida' && r.estado_legible !== 'Sin ubicar') return false;

      // 7. Filtro por Técnico Específico
      if (filtroTecnico !== 'ALL') {
        if (r.tecnico !== filtroTecnico) return false;
      }

      return true;
    });
  }, [ordenesAgrupadas, filters.proy, filters.zona, municipioFiltro, busquedaBarrio, filtroTipoOS, filtroAsignacion, filtroTecnico]);

  // Consolidación de datos por Barrio para Ranking y Gráfico (TO503 y TO506 consolidadas con Suspensión)
  const rankingBarrios = useMemo(() => {
    const mapa = new Map<string, {
      barrio: string;
      municipio: string;
      zona: string;
      proyecto: string;
      total: number;
      asignadas: number;
      pendientes: number;
      ejecutadas: number;
      canceladas: number;
      excluidas: number;
      suspension: number;
      reconexion: number;
      deuda: number;
      fac_venc_1: number;
      fac_venc_2: number;
      fac_venc_3: number;
      fac_venc_mas_3: number;
      tecnicosMap: Map<string, { total: number; suspension: number; reconexion: number }>;
    }>();

    filteredAgrupadas.forEach(r => {
      const key = `${r.barrio}__${r.municipio}`;
      let item = mapa.get(key);
      if (!item) {
        item = {
          barrio: r.barrio,
          municipio: r.municipio,
          zona: r.zona,
          proyecto: r.proyecto,
          total: 0,
          asignadas: 0,
          pendientes: 0,
          ejecutadas: 0,
          canceladas: 0,
          excluidas: 0,
          suspension: 0,
          reconexion: 0,
          deuda: 0,
          fac_venc_1: 0,
          fac_venc_2: 0,
          fac_venc_3: 0,
          fac_venc_mas_3: 0,
          tecnicosMap: new Map(),
        };
        mapa.set(key, item);
      }

      const cant = r.cantidad || 0;
      item.total += cant;
      item.deuda += Number(r.deuda_total) || 0;
      item.fac_venc_1 += Number(r.fac_venc_1) || 0;
      item.fac_venc_2 += Number(r.fac_venc_2) || 0;
      item.fac_venc_3 += Number(r.fac_venc_3) || 0;
      item.fac_venc_mas_3 += Number(r.fac_venc_mas_3) || 0;

      // Estado oficial de la orden (estado_legible) -- fuente única de verdad, ya no si el
      // campo técnico tiene nombre (eso inflaba "asignadas" con órdenes Ejecutadas/Baja por
      // WebService, que también suelen tener técnico, y las contaba doble).
      if (r.estado_legible === 'Asignada') {
        item.asignadas += cant;
      } else if (r.estado_legible === 'Pendiente') {
        item.pendientes += cant;
      } else if (r.estado_legible === 'Ejecutada') {
        item.ejecutadas += cant;
      } else if (r.estado_legible === 'Baja por WebService') {
        item.canceladas += cant;
      } else if (r.estado_legible === 'Excluida' || r.estado_legible === 'Sin ubicar') {
        item.excluidas += cant;
      }

      // Tipos de OS (Consolidación: TO501, TO504, TO503, TO506 en Suspensión)
      if (['TO501', 'TO504', 'TO503', 'TO506'].includes(r.tipo_orden)) {
        item.suspension += cant;
      } else if (r.tipo_orden === 'TO502') {
        item.reconexion += cant;
      }

      // Técnicos asignados en el barrio
      if (r.tecnico && r.tecnico !== 'No asignado') {
        let tEntry = item.tecnicosMap.get(r.tecnico);
        if (!tEntry) {
          tEntry = { total: 0, suspension: 0, reconexion: 0 };
          item.tecnicosMap.set(r.tecnico, tEntry);
        }
        tEntry.total += cant;
        if (['TO501', 'TO504', 'TO503', 'TO506'].includes(r.tipo_orden)) tEntry.suspension += cant;
        else if (r.tipo_orden === 'TO502') tEntry.reconexion += cant;
      }
    });

    const lista = Array.from(mapa.values()).map(b => ({
      ...b,
      tecnicos: Array.from(b.tecnicosMap.entries()).map(([tecnico, datos]) => ({
        tecnico,
        ...datos,
      })).sort((a, b) => b.total - a.total),
    }));

    // Ordenamiento dinámico según criterio del usuario
    lista.sort((a, b) => {
      if (criterioOrden === 'asignadas') return b.asignadas - a.asignadas;
      if (criterioOrden === 'total') return b.total - a.total;
      if (criterioOrden === 'suspension') return b.suspension - a.suspension;
      if (criterioOrden === 'reconexion') return b.reconexion - a.reconexion;
      return b.pendientes - a.pendientes; // Default: 'pendientes'
    });

    return lista;
  }, [filteredAgrupadas, criterioOrden]);

  // Versión mensual del ranking, solo para el gráfico ("Ver todo el mes"): Asignadas/Suspensión/
  // Reconexión/Deuda vienen del acumulado del mes en mano de obra (dataMesBarrios); Pendientes
  // se mantiene de HOY (filteredAgrupadas), porque "pendiente" es del momento, no se acumula.
  const rankingBarriosMes = useMemo(() => {
    const mapa = new Map<string, {
      barrio: string; municipio: string; zona: string; proyecto: string;
      total: number; asignadas: number; pendientes: number; ejecutadas: number;
      canceladas: number; excluidas: number; suspension: number; reconexion: number; deuda: number;
      tecnicos: { tecnico: string; total: number; suspension: number; reconexion: number }[];
    }>();

    const ensure = (barrio: string, municipio: string, zona: string, proyecto: string) => {
      const key = `${barrio}__${municipio}`;
      let item = mapa.get(key);
      if (!item) {
        item = { barrio, municipio, zona, proyecto, total: 0, asignadas: 0, pendientes: 0, ejecutadas: 0, canceladas: 0, excluidas: 0, suspension: 0, reconexion: 0, deuda: 0, tecnicos: [] };
        mapa.set(key, item);
      }
      return item;
    };

    dataMesBarrios.forEach(r => {
      if (!proyCoincide(r.proyecto, filters.proy)) return;
      if (!zonaCoincide(r.zona, filters.zona)) return;
      if (municipioFiltro !== 'ALL' && (r.municipio || '').toUpperCase() !== municipioFiltro.toUpperCase()) return;
      if (busquedaBarrio.trim()) {
        const q = busquedaBarrio.toLowerCase().trim();
        if (!(r.barrio || '').toLowerCase().includes(q) && !(r.municipio || '').toLowerCase().includes(q)) return;
      }
      const item = ensure(r.barrio, r.municipio, r.zona, r.proyecto);
      item.asignadas += r.asignadas || 0;
      item.suspension += r.suspension || 0;
      item.reconexion += r.reconexion || 0;
      item.deuda += Number(r.deuda) || 0;
    });

    // Pendientes de HOY, por barrio (mismo criterio que rankingBarrios diario)
    filteredAgrupadas.forEach(r => {
      if (r.estado_legible !== 'Pendiente') return;
      const item = ensure(r.barrio, r.municipio, r.zona, r.proyecto);
      item.pendientes += r.cantidad || 0;
    });

    const lista = Array.from(mapa.values()).map(item => ({ ...item, total: item.asignadas + item.pendientes }));

    lista.sort((a, b) => {
      if (criterioOrden === 'asignadas') return b.asignadas - a.asignadas;
      if (criterioOrden === 'total') return b.total - a.total;
      if (criterioOrden === 'suspension') return b.suspension - a.suspension;
      if (criterioOrden === 'reconexion') return b.reconexion - a.reconexion;
      return b.pendientes - a.pendientes;
    });

    return lista;
  }, [dataMesBarrios, filteredAgrupadas, filters.proy, filters.zona, municipioFiltro, busquedaBarrio, criterioOrden]);

  // Mano de obra del mes agrupada por DÍA -- eje X del gráfico "Comparativa..." cuando está
  // activo "Ver Todo el Mes". Cada punto es un día real del mes (no un barrio).
  const porDiaMes = useMemo(() => {
    const mapa = new Map<string, {
      fecha: string; asignadas: number; ejecutadas: number; canceladas: number;
      efectivas: number; fallidas: number; perdidas: number; sinClasificar: number;
      suspension: number; reconexion: number; tecnicos: Set<string>;
      barriosPorTecnico: Map<string, Set<string>>;
      // Barrio identificado como `barrio__municipio` -- un mismo nombre de barrio en dos
      // municipios distintos son entidades distintas y deben contarse por separado.
      barriosAsignados: Set<string>; barriosExcluidosRaw: Set<string>;
    }>();
    dataMesPorDia.forEach(r => {
      if (!proyCoincide(r.proyecto, filters.proy)) return;
      if (!zonaCoincide(r.zona, filters.zona)) return;
      if (municipioFiltro !== 'ALL' && r.municipio !== municipioFiltro) return;
      if (filtroTecnico !== 'ALL' && r.tecnico !== filtroTecnico) return;
      if (filtroTipoOS === 'SUSPENSION' && r.categoria_os !== 'Suspensión') return;
      if (filtroTipoOS === 'RECONEXION' && r.categoria_os !== 'Reconexión') return;

      let item = mapa.get(r.fecha);
      if (!item) {
        item = { fecha: r.fecha, asignadas: 0, ejecutadas: 0, canceladas: 0, efectivas: 0, fallidas: 0, perdidas: 0, sinClasificar: 0, suspension: 0, reconexion: 0, tecnicos: new Set(), barriosPorTecnico: new Map(), barriosAsignados: new Set(), barriosExcluidosRaw: new Set() };
        mapa.set(r.fecha, item);
      }
      const cant = r.cantidad || 0;
      const barrioKey = r.barrio ? `${r.barrio}__${r.municipio}` : null;
      // "Sin Clasificar" (cierres antes de la asignación formal) no cuenta como asignada/ejecutada/
      // cancelada en las métricas ya validadas -- solo se usa aparte para "excluidos".
      if (r.estado_norm === 'Sin Clasificar') {
        item.sinClasificar += cant;
        if (barrioKey) item.barriosExcluidosRaw.add(barrioKey);
      } else {
        item.asignadas += cant;
        if (r.resultado === 'Ejecutada') item.ejecutadas += cant;
        else item.canceladas += cant;
        if (r.estado_norm === 'Efectiva') item.efectivas += cant;
        else if (r.estado_norm === 'Fallida') item.fallidas += cant;
        else if (r.estado_norm === 'Perdida') item.perdidas += cant;
        if (barrioKey) {
          if (r.estado_norm === 'Perdida') item.barriosExcluidosRaw.add(barrioKey);
          else item.barriosAsignados.add(barrioKey);
        }
      }
      if (r.categoria_os === 'Suspensión') item.suspension += cant;
      else if (r.categoria_os === 'Reconexión') item.reconexion += cant;
      if (r.tecnico && r.tecnico !== 'No asignado') {
        item.tecnicos.add(r.tecnico);
        if (r.barrio) {
          if (!item.barriosPorTecnico.has(r.tecnico)) item.barriosPorTecnico.set(r.tecnico, new Set());
          item.barriosPorTecnico.get(r.tecnico)!.add(r.barrio);
        }
      }
    });

    return Array.from(mapa.values())
      .map(item => {
        const conteosBarriosPorTecnico = Array.from(item.barriosPorTecnico.values()).map(s => s.size);
        const avgBarriosPorTecnico = conteosBarriosPorTecnico.length > 0
          ? Math.round((conteosBarriosPorTecnico.reduce((s, n) => s + n, 0) / conteosBarriosPorTecnico.length) * 10) / 10
          : 0;
        return {
          fecha: item.fecha,
          // Etiqueta corta "DD/MM" para el eje X
          label: (() => { const d = new Date(item.fecha + 'T00:00:00'); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; })(),
          asignadas: item.asignadas,
          ejecutadas: item.ejecutadas,
          canceladas: item.canceladas,
          efectivas: item.efectivas,
          fallidas: item.fallidas,
          perdidas: item.perdidas,
          sinClasificar: item.sinClasificar,
          // "Excluidos" del universo de pendientes = cierres que salieron de la cola sin trabajo
          // productivo (Perdida) + cierres previos a la asignación formal (Sin Clasificar).
          excluidosDia: item.perdidas + item.sinClasificar,
          pctEjecutado: item.asignadas > 0 ? Math.round((item.ejecutadas / item.asignadas) * 1000) / 10 : 0,
          pctCancelado: item.asignadas > 0 ? Math.round((item.canceladas / item.asignadas) * 1000) / 10 : 0,
          pctEfectivas: item.asignadas > 0 ? Math.round((item.efectivas / item.asignadas) * 1000) / 10 : 0,
          pctPerdidas: item.asignadas > 0 ? Math.round((item.perdidas / item.asignadas) * 1000) / 10 : 0,
          suspension: item.suspension,
          reconexion: item.reconexion,
          // Barrios con cierres en mano de obra ese día; la clasificación final (asignado /
          // excluido / pendiente) se resuelve en porDiaMesBarrios.
          barriosAsignadosMoSet: item.barriosAsignados,
          barriosExcluidosRawSet: item.barriosExcluidosRaw,
          tecnicosCount: item.tecnicos.size,
          avgBarriosPorTecnico,
        };
      })
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [dataMesPorDia, filters.proy, filters.zona, municipioFiltro, filtroTecnico, filtroTipoOS]);

  // Pendientes (DISPONIBLE) y Asignadas (ASIGNADA) REALES por día: analitica.v_ordenes_mes es un
  // snapshot diario de TODO el universo de órdenes, así que sí existe el histórico. Las órdenes
  // pendientes por definición no tienen técnico, así que si hay un filtro de técnico activo esta
  // serie no aplica (queda vacía) y los asignados se toman de mano de obra, que sí trae técnico.
  const porDiaMesPendientes = useMemo(() => {
    type Dia = { ordenes: number; barrios: Set<string>; barriosAsignados: Set<string> };
    if (filtroTecnico !== 'ALL') return new Map<string, Dia>();
    const mapa = new Map<string, Dia>();
    dataMesPendientesPorDia.forEach(r => {
      if (!proyCoincide(r.proyecto, filters.proy)) return;
      if (!zonaCoincide(r.zona, filters.zona)) return;
      if (municipioFiltro !== 'ALL' && r.municipio !== municipioFiltro) return;
      if (filtroTipoOS === 'SUSPENSION' && r.categoria_os !== 'Suspensión') return;
      if (filtroTipoOS === 'RECONEXION' && r.categoria_os !== 'Reconexión') return;

      let item = mapa.get(r.fecha);
      if (!item) {
        item = { ordenes: 0, barrios: new Set(), barriosAsignados: new Set() };
        mapa.set(r.fecha, item);
      }
      item.ordenes += r.pendientes || 0;
      // Clave compuesta `barrio__municipio` -- mismo criterio que porDiaMes, para no fusionar
      // barrios homónimos de municipios distintos.
      if (r.barrio && (r.pendientes || 0) > 0) item.barrios.add(`${r.barrio}__${r.municipio}`);
      if (r.barrio && (r.asignadas || 0) > 0) item.barriosAsignados.add(`${r.barrio}__${r.municipio}`);
    });
    return mapa;
  }, [dataMesPendientesPorDia, filters.proy, filters.zona, municipioFiltro, filtroTecnico, filtroTipoOS]);

  // Clasificación final de barrios por día para el gráfico apilado: cada barrio (barrio__municipio)
  // se cuenta en UNA sola categoría por día, con prioridad Asignado > Excluido > Pendiente -- así
  // un barrio con órdenes en más de un estado ese día no se duplica entre las 3 barras.
  const porDiaMesBarrios = useMemo(() => {
    const mapa = new Map<string, { asignados: number; excluidos: number; pendientes: number; pendientesOrdenes: number }>();
    porDiaMes.forEach(d => {
      const pend = porDiaMesPendientes.get(d.fecha);
      // Asignados: estado ASIGNADA de v_ordenes_mes (ejecutadas o no). Con filtro de técnico se
      // usa mano de obra, que es la única fuente que trae técnico.
      const asignados = filtroTecnico === 'ALL' && pend ? pend.barriosAsignados : d.barriosAsignadosMoSet;
      let excluidos = 0;
      d.barriosExcluidosRawSet.forEach(key => { if (!asignados.has(key)) excluidos++; });
      let pendientes = 0;
      pend?.barrios.forEach(key => {
        if (!asignados.has(key) && !d.barriosExcluidosRawSet.has(key)) pendientes++;
      });
      mapa.set(d.fecha, {
        asignados: asignados.size,
        excluidos,
        pendientes,
        pendientesOrdenes: pend?.ordenes ?? 0,
      });
    });
    return mapa;
  }, [porDiaMes, porDiaMesPendientes, filtroTecnico]);

  // Desglose real de Pendientes por barrio, pero SOLO para hoy: es el único día del que existe
  // este dato (analitica.v_ordenes_dia es un snapshot del momento actual, no guarda historial),
  // así que no se puede reconstruir para los demás días del mes -- ver "Disponibles" en el
  // gráfico, que sí es un estimado reconstruido, pero sin desglose por barrio posible.
  const topBarriosPendientesHoy = useMemo(() => {
    return rankingBarrios
      .filter(b => b.pendientes > 0)
      .sort((a, b) => b.pendientes - a.pendientes)
      .slice(0, 12);
  }, [rankingBarrios]);

  // Selección de barrios para la gráfica (Top N o selección manual) -- toma la fuente diaria o
  // mensual según el toggle "Ver todo el mes".
  const barriosParaGrafica = useMemo(() => {
    const fuente = verGraficoMes ? rankingBarriosMes : rankingBarrios;
    if (barriosSeleccionados.length > 0) {
      return fuente.filter(b => barriosSeleccionados.includes(b.barrio));
    }
    return fuente.slice(0, TOP_CANTIDAD_GRAFICA);
  }, [rankingBarrios, rankingBarriosMes, verGraficoMes, barriosSeleccionados]);

  // Filtrado de horas para el modo horario
  const filteredHoras = useMemo(() => {
    return dataHoras.filter(r => {
      if (!proyCoincide(r.proyecto, filters.proy)) return false;
      if (!zonaCoincide(r.zona, filters.zona)) return false;
      if (municipioFiltro !== 'ALL' && (r.municipio || '').toUpperCase() !== municipioFiltro.toUpperCase()) return false;
      if (busquedaBarrio.trim()) {
        const q = busquedaBarrio.toLowerCase().trim();
        const b = (r.barrio || '').toLowerCase();
        const m = (r.municipio || '').toLowerCase();
        if (!b.includes(q) && !m.includes(q)) return false;
      }
      if (filtroTipoOS !== 'ALL') {
        if (filtroTipoOS === 'SUSPENSION' && !['TO501', 'TO504', 'TO503', 'TO506'].includes(r.tipo_orden || '')) return false;
        if (filtroTipoOS === 'RECONEXION' && r.tipo_orden !== 'TO502') return false;
        if (!['SUSPENSION', 'RECONEXION'].includes(filtroTipoOS) && r.tipo_orden !== filtroTipoOS) return false;
      }
      return true;
    });
  }, [dataHoras, filters.proy, filters.zona, municipioFiltro, busquedaBarrio, filtroTipoOS]);

  // Barrios que se están visualizando REALMENTE en el gráfico en tiempo real
  const barriosVisiblesEnGrafica = useMemo(() => {
    if (loading || rankingBarrios.length === 0) return new Set<string>();

    // 1. En modo evolutivo horario, solo se proyectan los primeros 5 barrios
    const listaGraficada = modoVisualizacion === 'horario'
      ? barriosParaGrafica.slice(0, 5)
      : barriosParaGrafica;

    const setVisibles = new Set<string>();

    listaGraficada.forEach(b => {
      let tieneDatoVisible = false;

      if (modoVisualizacion === 'horario') {
        // En modo horario, debe tener al menos una orden registrada en las horas mostradas
        const tieneHoras = filteredHoras.some(r =>
          r.barrio === b.barrio &&
          (filtroModoGrafico === 'solo_asignadas' ? (r.asignadas || 0) > 0
            : filtroModoGrafico === 'solo_pendientes' ? (r.pendientes || 0) > 0
            : (r.total || 0) > 0)
        );
        tieneDatoVisible = tieneHoras;
      } else {
        // En barras, debe tener valor > 0 según la métrica activa en el gráfico
        if (filtroModoGrafico === 'asig_vs_pend') {
          tieneDatoVisible = (b.asignadas || 0) > 0 || (b.pendientes || 0) > 0;
        } else if (filtroModoGrafico === 'solo_asignadas') {
          tieneDatoVisible = (b.asignadas || 0) > 0;
        } else if (filtroModoGrafico === 'solo_pendientes') {
          tieneDatoVisible = (b.pendientes || 0) > 0;
        } else if (filtroModoGrafico === 'por_tipo_os') {
          tieneDatoVisible = (b.suspension || 0) > 0 || (b.reconexion || 0) > 0;
        } else if (filtroModoGrafico === 'todas') {
          tieneDatoVisible = (b.total || 0) > 0;
        }
      }

      if (tieneDatoVisible) {
        setVisibles.add(`${b.barrio}__${b.municipio}`);
      }
    });

    return setVisibles;
  }, [loading, rankingBarrios, modoVisualizacion, barriosParaGrafica, filteredHoras, filtroModoGrafico]);

  // Métricas y KPIs Consolidados
  const kpis = useMemo(() => {
    const total = rankingBarrios.reduce((s, b) => s + b.total, 0);
    const totalAsignadas = rankingBarrios.reduce((s, b) => s + b.asignadas, 0);
    const totalPendientes = rankingBarrios.reduce((s, b) => s + b.pendientes, 0);
    const totalSuspension = rankingBarrios.reduce((s, b) => s + b.suspension, 0);
    const totalReconexion = rankingBarrios.reduce((s, b) => s + b.reconexion, 0);
    const totalDeuda = rankingBarrios.reduce((s, b) => s + b.deuda, 0);
    const totalFacVenc1 = rankingBarrios.reduce((s, b) => s + b.fac_venc_1, 0);
    const totalFacVenc2 = rankingBarrios.reduce((s, b) => s + b.fac_venc_2, 0);
    const totalFacVenc3 = rankingBarrios.reduce((s, b) => s + b.fac_venc_3, 0);
    const totalFacVencMas3 = rankingBarrios.reduce((s, b) => s + b.fac_venc_mas_3, 0);

    const totalGestion = totalAsignadas + totalPendientes;
    const porcentajeAsignacion = totalGestion > 0 ? (totalAsignadas / totalGestion) * 100 : 0;
    const cantBarrios = rankingBarrios.length;

    const promedioAsignadas = cantBarrios > 0 ? totalAsignadas / cantBarrios : 0;
    const promedioPendientes = cantBarrios > 0 ? totalPendientes / cantBarrios : 0;

    const barrioMasPendientes = [...rankingBarrios].sort((a, b) => b.pendientes - a.pendientes)[0];
    const barrioMasAsignadas = [...rankingBarrios].sort((a, b) => b.asignadas - a.asignadas)[0];

    // Conteo de técnicos únicos con órdenes en el universo filtrado
    const setTecs = new Set<string>();
    rankingBarrios.forEach(b => {
      b.tecnicos.forEach(t => setTecs.add(t.tecnico));
    });

    return {
      total,
      totalAsignadas,
      totalPendientes,
      totalSuspension,
      totalReconexion,
      totalDeuda,
      totalFacVenc1,
      totalFacVenc2,
      totalFacVenc3,
      totalFacVencMas3,
      totalGestion,
      porcentajeAsignacion: Math.round(porcentajeAsignacion * 10) / 10,
      cantBarrios,
      promedioAsignadas: Math.round(promedioAsignadas * 10) / 10,
      promedioPendientes: Math.round(promedioPendientes * 10) / 10,
      barrioMasPendientes: barrioMasPendientes ? `${barrioMasPendientes.barrio} (${fmtN(barrioMasPendientes.pendientes)})` : '—',
      barrioMasAsignadas: barrioMasAsignadas ? `${barrioMasAsignadas.barrio} (${fmtN(barrioMasAsignadas.asignadas)})` : '—',
      totalTecnicosConCarga: setTecs.size,
    };
  }, [rankingBarrios]);

  // =========================================================================
  // METAS DE ÓRDENES Y CUMPLIMIENTO POR ZONA Y TIPO DE BRIGADA
  // =========================================================================
  const metasProcesadas: ProcessedMetaBrigada[] = useMemo(() => {
    return dataMetasBrigadas.map(row => {
      const diaStr = row.dia_operativo || new Date().toISOString().slice(0, 10);
      const metaUnit = getMetaDiariaEfectivas(row.tipo_brigada, diaStr, row.zona || row.proyecto);
      const metaTotal = (row.brigadas_activas || 0) * metaUnit;
      const pctAsignado = metaTotal > 0 ? Math.round(((row.asignadas || 0) / metaTotal) * 1000) / 10 : (row.asignadas > 0 ? 100 : 0);
      const pctCumplidoVsAsignado = (row.asignadas || 0) > 0 ? Math.round(((row.ejecutadas || 0) / row.asignadas) * 1000) / 10 : 0;
      const pctCumplidoVsMeta = metaTotal > 0 ? Math.round(((row.ejecutadas || 0) / metaTotal) * 1000) / 10 : 0;
      const brecha = Math.max(0, metaTotal - (row.asignadas || 0));

      return {
        ...row,
        metaUnit,
        metaTotal,
        pctAsignado,
        pctCumplidoVsAsignado,
        pctCumplidoVsMeta,
        brecha,
      };
    });
  }, [dataMetasBrigadas]);

  // Zonas disponibles en Metas con datos reales
  const metasZonasDisponibles = useMemo(() => {
    const s = new Set<string>();
    metasProcesadas.forEach(m => {
      if (!proyCoincide(m.proyecto, filters.proy)) return;
      if (!zonaCoincide(m.zona, filters.zona)) return;
      if (m.zona) s.add(m.zona.trim());
    });
    return Array.from(s).sort();
  }, [metasProcesadas, filters.proy, filters.zona]);

  // Tipos de Brigada disponibles en Metas con datos reales
  const metasBrigadasDisponibles = useMemo(() => {
    const s = new Set<string>();
    metasProcesadas.forEach(m => {
      if (!proyCoincide(m.proyecto, filters.proy)) return;
      if (!zonaCoincide(m.zona, filters.zona)) return;
      if (!zonaCoincide(m.zona, filtroMetaZona)) return;
      const tb = (m.tipo_brigada || '').toUpperCase();
      if (tb.includes('PESADA')) s.add('PESADA');
      if (tb.includes('LIVIANA')) s.add('LIVIANA');
      if (tb.includes('CANASTA') && !tb.includes('MINI')) s.add('CANASTA');
      if (tb.includes('MINI')) s.add('MINICANASTA');
      if (tb.includes('MT') || tb.includes('MEDIDA')) s.add('MT');
      if (tb.includes('DISP') || tb.includes('(D)')) s.add('DISP');
      if (tb.includes('GESTOR') || tb.includes('MULTI')) s.add('GESTOR');
    });
    return s;
  }, [metasProcesadas, filters.proy, filters.zona, filtroMetaZona]);

  // Niveles de Cobertura disponibles en Metas con datos reales
  const metasCoberturasDisponibles = useMemo(() => {
    const s = new Set<string>();
    metasProcesadas.forEach(m => {
      if (!proyCoincide(m.proyecto, filters.proy)) return;
      if (!zonaCoincide(m.zona, filters.zona)) return;
      if (!zonaCoincide(m.zona, filtroMetaZona)) return;
      if (m.pctAsignado >= 90) s.add('ALTA');
      else if (m.pctAsignado >= 70) s.add('MEDIA');
      else s.add('BAJA');
    });
    return s;
  }, [metasProcesadas, filters.proy, filters.zona, filtroMetaZona]);

  // Filtrado y ordenamiento de metas
  const metasFiltradas = useMemo(() => {
    return metasProcesadas.filter(item => {
      // Filtros globales del Dashboard
      if (!proyCoincide(item.proyecto, filters.proy)) return false;
      if (!zonaCoincide(item.zona, filters.zona)) return false;

      // Filtros locales de la sección
      if (!zonaCoincide(item.zona, filtroMetaZona)) return false;
      if (filtroMetaBrigada !== 'ALL') {
        const tb = (item.tipo_brigada || '').toUpperCase();
        if (filtroMetaBrigada === 'PESADA' && !tb.includes('PESADA')) return false;
        if (filtroMetaBrigada === 'LIVIANA' && !tb.includes('LIVIANA')) return false;
        if (filtroMetaBrigada === 'CANASTA' && (!tb.includes('CANASTA') || tb.includes('MINI'))) return false;
        if (filtroMetaBrigada === 'MINICANASTA' && !tb.includes('MINI')) return false;
        if (filtroMetaBrigada === 'MT' && !tb.includes('MT') && !tb.includes('MEDIDA')) return false;
        if (filtroMetaBrigada === 'DISP' && !tb.includes('DISP') && !tb.includes('(D)')) return false;
        if (filtroMetaBrigada === 'GESTOR' && !tb.includes('GESTOR') && !tb.includes('MULTI')) return false;
      }
      if (filtroMetaCumplimiento !== 'ALL') {
        if (filtroMetaCumplimiento === 'ALTA' && item.pctAsignado < 90) return false;
        if (filtroMetaCumplimiento === 'MEDIA' && (item.pctAsignado < 70 || item.pctAsignado >= 90)) return false;
        if (filtroMetaCumplimiento === 'BAJA' && item.pctAsignado >= 70) return false;
      }

      return true;
    }).sort((a, b) => {
      if (ordenMetas === 'meta') return b.metaTotal - a.metaTotal;
      if (ordenMetas === 'asignadas') return b.asignadas - a.asignadas;
      if (ordenMetas === 'cumplimiento_asig') return b.pctCumplidoVsAsignado - a.pctCumplidoVsAsignado;
      if (ordenMetas === 'cumplimiento_meta') return b.pctCumplidoVsMeta - a.pctCumplidoVsMeta;
      return 0;
    });
  }, [metasProcesadas, filters.proy, filters.zona, filtroMetaZona, filtroMetaBrigada, filtroMetaCumplimiento, ordenMetas]);

  // Totales y KPIs consolidados de metas
  const totalesMetas = useMemo(() => {
    let brigadas = 0;
    let metaTotal = 0;
    let asignadas = 0;
    let ejecutadas = 0;
    let pendientes = 0;

    metasFiltradas.forEach(m => {
      brigadas += m.brigadas_activas || 0;
      metaTotal += m.metaTotal || 0;
      asignadas += m.asignadas || 0;
      ejecutadas += m.ejecutadas || 0;
      pendientes += m.pendientes || 0;
    });

    const pctAsignado = metaTotal > 0 ? Math.round((asignadas / metaTotal) * 1000) / 10 : (asignadas > 0 ? 100 : 0);
    const pctCumplidoVsAsignado = asignadas > 0 ? Math.round((ejecutadas / asignadas) * 1000) / 10 : 0;
    const pctCumplidoVsMeta = metaTotal > 0 ? Math.round((ejecutadas / metaTotal) * 1000) / 10 : 0;
    const brecha = Math.max(0, metaTotal - asignadas);

    return {
      brigadas,
      metaTotal,
      asignadas,
      ejecutadas,
      pendientes,
      pctAsignado,
      pctCumplidoVsAsignado,
      pctCumplidoVsMeta,
      brecha,
    };
  }, [metasFiltradas]);

  // Auto-reset de filtros huérfanos en sección de Metas
  useEffect(() => {
    if (filtroMetaZona !== 'ALL' && metasZonasDisponibles.length > 0) {
      const activeList = filtroMetaZona.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      const validList = activeList.filter(z => metasZonasDisponibles.some(zd => zd.toUpperCase() === z));
      if (validList.length === 0) {
        setFiltroMetaZona('ALL');
      } else if (validList.length !== activeList.length) {
        setFiltroMetaZona(validList.join(','));
      }
    }
  }, [metasZonasDisponibles, filtroMetaZona]);

  useEffect(() => {
    if (filtroMetaBrigada !== 'ALL' && metasBrigadasDisponibles.size > 0 && !metasBrigadasDisponibles.has(filtroMetaBrigada)) {
      setFiltroMetaBrigada('ALL');
    }
  }, [metasBrigadasDisponibles, filtroMetaBrigada]);

  useEffect(() => {
    if (filtroMetaCumplimiento !== 'ALL' && metasCoberturasDisponibles.size > 0 && !metasCoberturasDisponibles.has(filtroMetaCumplimiento)) {
      setFiltroMetaCumplimiento('ALL');
    }
  }, [metasCoberturasDisponibles, filtroMetaCumplimiento]);

  // "Asignadas" combinado: (Asignada HOY) UNIÓN (mano de obra del MES completo) -- a pedido
  // explícito, para que Asignadas sea siempre >= Ejecutadas (antes, al comparar solo contra el
  // día, podía verse menos asignadas que ejecutadas porque Ejecutada venía de mano de obra del
  // día y Asignada del sistema del día, dos fuentes con cobertura distinta).
  const asignadasCombinado = useMemo(() => {
    let total = 0, suspension = 0, reconexion = 0, deuda = 0;
    const tecs = new Set<string>();
    dataAsignadasTotal.forEach(r => {
      if (!proyCoincide(r.proyecto, filters.proy)) return;
      if (!zonaCoincide(r.zona, filters.zona)) return;
      if (municipioFiltro !== 'ALL' && r.municipio !== municipioFiltro) return;
      if (filtroTecnico !== 'ALL' && r.tecnico !== filtroTecnico) return;
      if (filtroTipoOS !== 'ALL') {
        if (filtroTipoOS === 'SUSPENSION' && r.categoria_os !== 'Suspensión') return;
        if (filtroTipoOS === 'RECONEXION' && r.categoria_os !== 'Reconexión') return;
      }
      const cant = r.cantidad || 0;
      total += cant;
      deuda += Number(r.deuda_total) || 0;
      if (r.categoria_os === 'Suspensión') suspension += cant;
      else if (r.categoria_os === 'Reconexión') reconexion += cant;
      if (r.tecnico && r.tecnico !== 'No asignado') tecs.add(r.tecnico);
    });
    return { total, suspension, reconexion, deuda, tecnicos: tecs.size };
  }, [dataAsignadasTotal, filters.proy, filters.zona, municipioFiltro, filtroTecnico, filtroTipoOS]);

  // =========================================================================
  // MÉTRICAS PARA LAS 2 CARDS PRINCIPALES: ASIGNADAS Y PENDIENTES CON % Y VALORES
  // =========================================================================
  const cardsKpis = useMemo(() => {
    let asigTotal = 0;
    let asigSusp = 0;
    let asigRec = 0;
    let asigDeuda = 0;
    const asigTecs = new Set<string>();

    let pendTotal = 0;
    let pendSusp = 0;
    let pendRec = 0;
    let pendDeuda = 0;
    const pendBarrios = new Set<string>();

    let ejecTotal = 0;
    let ejecDeuda = 0;
    let cancTotal = 0;
    let cancDeuda = 0;
    let excTotal = 0;
    let excDeuda = 0;

    // granTotal: TODAS las órdenes del universo filtrado, sin importar su estado --
    // denominador real de "% del total" (antes solo sumaba Asignada+Pendiente).
    let granTotal = 0;

    filteredAgrupadas.forEach(r => {
      const cant = r.cantidad || 0;
      const deuda = Number(r.deuda_total) || 0;
      granTotal += cant;

      // Estado oficial de la orden (estado_legible) -- mutuamente excluyente, para que las 5
      // categorías (Asignada/Pendiente/Ejecutada/Cancelada/Excluida) sumen el 100% del total.
      const isAsignada = r.estado_legible === 'Asignada';
      const isPendiente = r.estado_legible === 'Pendiente';
      const isEjecutada = r.estado_legible === 'Ejecutada';
      const isCancelada = r.estado_legible === 'Baja por WebService';
      const isExcluida = r.estado_legible === 'Excluida' || r.estado_legible === 'Sin ubicar';

      const isSusp = ['TO501', 'TO504', 'TO503', 'TO506'].includes(r.tipo_orden);
      const isRec = r.tipo_orden === 'TO502';

      // Conteo de técnicos asignados con órdenes en el universo filtrado
      if (r.tecnico && r.tecnico !== 'No asignado' && r.tecnico.trim() !== '') {
        asigTecs.add(r.tecnico.trim());
      }

      if (isAsignada) {
        asigTotal += cant;
        asigDeuda += deuda;
        if (isSusp) asigSusp += cant;
        else if (isRec) asigRec += cant;
      } else if (isPendiente) {
        pendTotal += cant;
        pendDeuda += deuda;
        if (isSusp) pendSusp += cant;
        else if (isRec) pendRec += cant;

        if (r.barrio) pendBarrios.add(r.barrio);
      } else if (isEjecutada) {
        ejecTotal += cant;
        ejecDeuda += deuda;
      } else if (isCancelada) {
        cancTotal += cant;
        cancDeuda += deuda;
      } else if (isExcluida) {
        excTotal += cant;
        excDeuda += deuda;
      }
    });

    // "Asignadas" ya no es el conteo del día (asigTotal, que se sigue usando abajo solo para
    // la Meta Cuota Diaria) -- pasa a ser el combinado (hoy en el sistema) UNIÓN (mano de obra
    // del mes), calculado en asignadasCombinado. Así Asignadas siempre es >= Ejecutadas, porque
    // toda orden Ejecutada hoy (viene de mano de obra) también cae dentro de ese combinado.
    const asigTotalCombinado = asignadasCombinado.total;

    const totalGestion = asigTotalCombinado + pendTotal;
    const totalDeudaGestion = asignadasCombinado.deuda + pendDeuda;
    // % del total: sobre TODAS las órdenes del universo filtrado (granTotal), no solo
    // Asignada+Pendiente -- así Pendiente+Ejecutada+Cancelada+Excluida suman 100% entre sí.
    // Asignadas queda FUERA de esa suma (es un combinado de otro alcance: hoy + todo el mes en
    // mano de obra), por eso su % se calcula distinto (ver pctEjecutadoDeAsignado abajo).
    const pctPendientes = granTotal > 0 ? (pendTotal / granTotal) * 100 : 0;
    const pctEjecutadas = granTotal > 0 ? (ejecTotal / granTotal) * 100 : 0;
    const pctCanceladas = granTotal > 0 ? (cancTotal / granTotal) * 100 : 0;
    const pctExcluidas = granTotal > 0 ? (excTotal / granTotal) * 100 : 0;
    // % de lo Asignado (combinado) que ya se Ejecutó hoy -- reemplaza el viejo "% del total",
    // que no tenía sentido comparando un total de otro alcance contra el universo de hoy.
    const pctEjecutadoDeAsignado = asigTotalCombinado > 0 ? (ejecTotal / asigTotalCombinado) * 100 : 0;

    // Meta cuota diaria consolidada de brigadas para las zonas activas (ajustada para más de 2 zonas juntas)
    let metaTotalCuota = 0;
    metasProcesadas.forEach(m => {
      if (!proyCoincide(m.proyecto, filters.proy)) return;
      if (!zonaCoincide(m.zona, filters.zona)) return;
      metaTotalCuota += m.metaTotal || 0;
    });
    // Cobertura de meta sigue usando SOLO lo asignado hoy en el sistema (asigTotal, alcance
    // diario), no el combinado -- comparar el combinado (mensual) contra una meta diaria no
    // tendría sentido.
    const pctCoberturaMeta = metaTotalCuota > 0 ? (asigTotal / metaTotalCuota) * 100 : 0;

    return {
      asignadas: {
        total: asigTotalCombinado,
        deuda: asignadasCombinado.deuda,
        pctSobreTotal: Math.round(pctEjecutadoDeAsignado * 10) / 10,
        suspension: asignadasCombinado.suspension,
        pctSuspension: asigTotalCombinado > 0 ? Math.round((asignadasCombinado.suspension / asigTotalCombinado) * 1000) / 10 : 0,
        reconexion: asignadasCombinado.reconexion,
        pctReconexion: asigTotalCombinado > 0 ? Math.round((asignadasCombinado.reconexion / asigTotalCombinado) * 1000) / 10 : 0,
        tecnicosAsignados: asignadasCombinado.tecnicos,
        metaTotal: metaTotalCuota,
        pctCoberturaMeta: Math.round(pctCoberturaMeta * 10) / 10,
      },
      pendientes: {
        total: pendTotal,
        deuda: pendDeuda,
        pctSobreTotal: Math.round(pctPendientes * 10) / 10,
        suspension: pendSusp,
        pctSuspension: pendTotal > 0 ? Math.round((pendSusp / pendTotal) * 1000) / 10 : 0,
        reconexion: pendRec,
        pctReconexion: pendTotal > 0 ? Math.round((pendRec / pendTotal) * 1000) / 10 : 0,
        barriosCount: pendBarrios.size,
      },
      ejecutadas: {
        total: ejecTotal,
        deuda: ejecDeuda,
        pctSobreTotal: Math.round(pctEjecutadas * 10) / 10,
      },
      canceladas: {
        total: cancTotal,
        deuda: cancDeuda,
        pctSobreTotal: Math.round(pctCanceladas * 10) / 10,
      },
      excluidas: {
        total: excTotal,
        deuda: excDeuda,
        pctSobreTotal: Math.round(pctExcluidas * 10) / 10,
      },
      totalGestion,
      totalDeudaGestion,
      granTotal,
    };
  }, [filteredAgrupadas, metasProcesadas, filters.proy, filters.zona, asignadasCombinado]);



  // Renderizar Gráfico con Chart.js
  useEffect(() => {
    if (!canvasRef.current) return;
    let isCancelled = false;

    import('chart.js').then(({ Chart, registerables }) => {
      if (isCancelled || !canvasRef.current) return;
      Chart.register(...registerables);

      // El canvas de Chart.js no resuelve custom properties de CSS: los tokens que no están
      // ya disponibles como hex en `colors` (ThemeProvider) se leen aquí vía getComputedStyle,
      // igual que en BrigadaEvolutivoModal.tsx / BrigadaTiposModal.tsx.
      const cardBg = getComputedStyle(document.body).getPropertyValue('--card').trim();

      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }

      const esModoDiaGuard = filtroModoGrafico === 'asig_vs_pend';
      const esModoDiaVacio = esModoDiaGuard && porDiaMes.length === 0;
      // El modo por día no depende de barriosParaGrafica (usa porDiaMes) -- solo los demás modos
      // (por barrio) necesitan que haya barrios para dibujar.
      if ((!esModoDiaGuard && barriosParaGrafica.length === 0) || esModoDiaVacio) return;

      // Plugin para pintar etiquetas de valor en cada barra o punto
      const dataLabelsPlugin = {
        id: 'barrioDataLabels',
        afterDatasetsDraw(chart: any) {
          if (!mostrarEtiquetas) return;
          const { ctx } = chart;
          chart.data.datasets.forEach((dataset: any, datasetIdx: number) => {
            if (dataset.isPromedio) return; // Las líneas de promedio no llevan etiqueta flotante
            const meta = chart.getDatasetMeta(datasetIdx);
            if (meta.hidden) return;

            meta.data.forEach((element: any, dataIdx: number) => {
              const val = dataset.data[dataIdx];
              if (val === null || val === undefined || isNaN(val) || val === 0) return;

              // La cantidad de barrios ahora es su propia serie (con eje propio) en vez de un
              // texto superpuesto sobre la barra de Asignados -- usa la etiqueta genérica.
              let texto = fmtN(val);
              if (filtroModoGrafico === 'asig_vs_pend' && dataset.yAxisID === 'y1') {
                texto = `${texto} barrios`;
              }

              ctx.save();
              ctx.font = 'bold 9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
              ctx.fillStyle = dataset.borderColor || dataset.backgroundColor || textInk;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';

              // Halo para garantizar contraste
              ctx.strokeStyle = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
              ctx.lineWidth = 2.5;
              ctx.lineJoin = 'round';
              ctx.strokeText(texto, element.x, element.y - 4);
              ctx.fillText(texto, element.x, element.y - 4);
              ctx.restore();
            });
          });
        },
      };

      let config: any;

      // El modo "Asignadas vs. Pendientes" siempre se muestra por día del mes -- nunca por
      // barrio (a pedido explícito: "no quiero ver los barrios, debe tener los días").
      const esModoDia = filtroModoGrafico === 'asig_vs_pend';

      if (modoVisualizacion === 'barras_agrupadas' || modoVisualizacion === 'barras_apiladas') {
        let labels = esModoDia ? porDiaMes.map(d => d.label) : barriosParaGrafica.map(b => b.barrio);
        const isStacked = modoVisualizacion === 'barras_apiladas';
        const datasets: any[] = [];

        // Según el filtro de modo de gráfico configurado:
        if (esModoDia) {
          // =========================================================================
          // MODO 1B: ÓRDENES POR DÍA (barras agrupadas: Excluidos, Asignados y Barrios con
          // Asignación, cada una por separado -- solo datos reales de mano de obra, sin
          // estimaciones reconstruidas)
          // =========================================================================
          const dataExcluidos = porDiaMes.map(d => d.excluidosDia);
          const dataAsignados = porDiaMes.map(d => d.ejecutadas);
          const avgAsignados = Math.round((dataAsignados.reduce((s, v) => s + v, 0) / (dataAsignados.length || 1)) * 10) / 10;

          if (mostrarLineasPromedio) {
            datasets.push({
              type: 'line',
              label: `Media Asignados/Día (${avgAsignados})`,
              data: porDiaMes.map(() => avgAsignados),
              borderColor: colorAsignadas,
              borderWidth: 2,
              borderDash: [5, 4],
              pointRadius: 0,
              fill: false,
              isPromedio: true,
              order: 1,
            });
          }

          // Dos columnas apiladas por día, una al lado de la otra: "ordenes" (Excluidos +
          // Asignados) y "barrios" (Pendientes + Asignados + Excluidos), cada una en su propio
          // stack de Chart.js para que se apilen entre sí sin mezclarse con la otra columna.
          datasets.push({
            type: 'bar',
            label: 'Excluidos ese día (Perdida / Sin Clasificar)',
            data: dataExcluidos,
            backgroundColor: colors.err,
            borderColor: colors.err,
            borderWidth: 1,
            borderRadius: 4,
            maxBarThickness: 40,
            order: 3,
            stack: 'ordenes',
          });

          datasets.push({
            type: 'bar',
            label: 'Asignados ese día (Ejecutados)',
            data: dataAsignados,
            backgroundColor: colors.sip,
            borderColor: colors.sip,
            borderWidth: 1,
            borderRadius: 4,
            maxBarThickness: 40,
            order: 3,
            stack: 'ordenes',
          });

          // Barrios pendientes por asignar: dato REAL por día (v_ordenes_mes DISPONIBLE cruzado
          // con MO), excluyendo los barrios que ese mismo día ya cuentan como Asignado o Excluido
          // (prioridad Asignado > Excluido > Pendiente, ver porDiaMesBarrios).
          datasets.push({
            type: 'bar',
            label: 'Barrios Pendientes por Asignar',
            data: porDiaMes.map(d => porDiaMesBarrios.get(d.fecha)?.pendientes ?? 0),
            backgroundColor: colorPendientes,
            borderColor: colorPendientes,
            borderWidth: 1,
            borderRadius: 4,
            maxBarThickness: 40,
            order: 4,
            yAxisID: 'y1',
            stack: 'barrios',
          });

          // Barrios asignados: tuvieron al menos una orden Efectiva/Fallida ese día.
          datasets.push({
            type: 'bar',
            label: 'Barrios Asignados',
            data: porDiaMes.map(d => porDiaMesBarrios.get(d.fecha)?.asignados ?? 0),
            backgroundColor: colorAsignadas,
            borderColor: colorAsignadas,
            borderWidth: 1,
            borderRadius: 4,
            maxBarThickness: 40,
            order: 4,
            yAxisID: 'y1',
            stack: 'barrios',
          });

          // Barrios excluidos: ninguna de sus órdenes se asignó ese día (todos sus cierres fueron
          // Perdida / Sin Clasificar).
          datasets.push({
            type: 'bar',
            label: 'Barrios Excluidos',
            data: porDiaMes.map(d => porDiaMesBarrios.get(d.fecha)?.excluidos ?? 0),
            backgroundColor: colors.err,
            borderColor: colors.err,
            borderWidth: 1,
            borderRadius: 4,
            maxBarThickness: 40,
            order: 4,
            yAxisID: 'y1',
            stack: 'barrios',
          });
        } else if (filtroModoGrafico === 'todas') {
          // =========================================================================
          // MODO 2: TODAS LAS ÓRDENES CARGADAS
          // =========================================================================
          const dataTotal = barriosParaGrafica.map(b => b.total);
          const avgTotal = Math.round((dataTotal.reduce((s, v) => s + v, 0) / (dataTotal.length || 1)) * 10) / 10;

          if (mostrarLineasPromedio) {
            datasets.push({
              type: 'line',
              label: `Media Total Cargadas (${avgTotal})`,
              data: barriosParaGrafica.map(() => avgTotal),
              borderColor: colors.sip,
              borderWidth: 2,
              borderDash: [5, 4],
              pointRadius: 0,
              fill: false,
              isPromedio: true,
              order: 1,
            });
          }

          datasets.push({
            type: 'bar',
            label: 'Todas las Órdenes Cargadas',
            data: dataTotal,
            backgroundColor: colors.sip,
            borderColor: colors.sip,
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 44,
            order: 2,
          });
        } else if (filtroModoGrafico === 'solo_asignadas') {
          // =========================================================================
          // MODO 3: SOLO ASIGNADAS
          // =========================================================================
          const dataAsignadas = barriosParaGrafica.map(b => b.asignadas);
          const avgAsig = Math.round((dataAsignadas.reduce((s, v) => s + v, 0) / (dataAsignadas.length || 1)) * 10) / 10;

          if (mostrarLineasPromedio) {
            datasets.push({
              type: 'line',
              label: `Media Asignadas (${avgAsig})`,
              data: barriosParaGrafica.map(() => avgAsig),
              borderColor: colorAsignadas,
              borderWidth: 2,
              borderDash: [5, 4],
              pointRadius: 0,
              fill: false,
              isPromedio: true,
              order: 1,
            });
          }

          datasets.push({
            type: 'bar',
            label: 'Solo Órdenes Asignadas',
            data: dataAsignadas,
            backgroundColor: colors.sip,
            borderColor: colors.sip,
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 44,
            order: 2,
          });
        } else if (filtroModoGrafico === 'solo_pendientes') {
          // =========================================================================
          // MODO 4: SOLO PENDIENTES
          // =========================================================================
          const dataPendientes = barriosParaGrafica.map(b => b.pendientes);
          const avgPend = Math.round((dataPendientes.reduce((s, v) => s + v, 0) / (dataPendientes.length || 1)) * 10) / 10;

          if (mostrarLineasPromedio) {
            datasets.push({
              type: 'line',
              label: `Media Pendientes (${avgPend})`,
              data: barriosParaGrafica.map(() => avgPend),
              borderColor: colorPendientes,
              borderWidth: 2,
              borderDash: [5, 4],
              pointRadius: 0,
              fill: false,
              isPromedio: true,
              order: 1,
            });
          }

          datasets.push({
            type: 'bar',
            label: 'Solo Órdenes Pendientes',
            data: dataPendientes,
            backgroundColor: colors.warn,
            borderColor: colors.warn,
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 44,
            order: 2,
          });
        } else if (filtroModoGrafico === 'por_tipo_os') {
          // =========================================================================
          // MODO 5: POR TIPO DE OS (SUSPENSIÓN VS RECONEXIÓN)
          // =========================================================================
          const dataSuspension = barriosParaGrafica.map(b => b.suspension);
          const dataReconexion = barriosParaGrafica.map(b => b.reconexion);

          datasets.push({
            type: 'bar',
            label: 'Suspensión (TO501 / TO504 / TO503 / TO506)',
            data: dataSuspension,
            backgroundColor: colors.err,
            borderColor: colors.err,
            borderWidth: 1,
            borderRadius: isStacked ? 0 : 5,
            maxBarThickness: 36,
            stack: isStacked ? 'stack1' : undefined,
          });

          datasets.push({
            type: 'bar',
            label: 'Reconexión (TO502)',
            data: dataReconexion,
            backgroundColor: colors.ok,
            borderColor: colors.ok,
            borderWidth: 1,
            borderRadius: 5,
            maxBarThickness: 36,
            stack: isStacked ? 'stack1' : undefined,
          });
        }

        config = {
          data: { labels, datasets },
          plugins: [dataLabelsPlugin],
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: 'top',
                labels: { boxWidth: 14, padding: 14, color: textInk, font: { weight: 'bold', size: 11.5 } },
              },
              tooltip: {
                backgroundColor: cardBg,
                titleColor: textInk,
                bodyColor: textInk,
                borderColor: borderCol,
                borderWidth: 1,
                padding: 12,
                callbacks: {
                  title: (items: any[]) => {
                    const idx = items[0]?.dataIndex;
                    if (esModoDia) {
                      const d = idx !== undefined ? porDiaMes[idx] : null;
                      return d ? `Día ${d.fecha}` : (items[0]?.label || '');
                    }
                    const b = idx !== undefined ? barriosParaGrafica[idx] : null;
                    return b ? `${b.barrio} — ${b.municipio} (${b.zona})` : (items[0]?.label || '');
                  },
                  label: (ctx: any) => {
                    const val = Number(ctx.raw) || 0;
                    if (ctx.dataset.isPromedio) {
                      return ` ${ctx.dataset.label}`;
                    }
                    const unidad = ctx.dataset.yAxisID === 'y1' ? 'barrios' : 'órdenes';
                    return ` ${ctx.dataset.label}: ${fmtN(val)} ${unidad}`;
                  },
                  afterBody: (items: any[]) => {
                    const idx = items[0]?.dataIndex;
                    if (idx === undefined) return '';

                    if (esModoDia) {
                      const d = porDiaMes[idx];
                      if (!d) return '';
                      return [
                        `\nResultado de ese día (mano de obra):`,
                        `  • Excluidos: ${fmtN(d.excluidosDia)} (Perdida: ${fmtN(d.perdidas)} | Sin Clasificar: ${fmtN(d.sinClasificar)})`,
                        `  • Asignados (ejecutados): ${fmtN(d.ejecutadas)}`,
                        `    ↳ Efectivas: ${fmtN(d.efectivas)} (${d.pctEfectivas}%) | Fallidas: ${fmtN(d.fallidas)}`,
                        `Suspensión: ${fmtN(d.suspension)} | Reconexión: ${fmtN(d.reconexion)}`,
                        `\nBarrios ese día (cada barrio cuenta en una sola categoría; prioridad Asignado > Excluido > Pendiente):`,
                        `  • Asignados: ${fmtN(porDiaMesBarrios.get(d.fecha)?.asignados ?? 0)}`,
                        `  • Excluidos: ${fmtN(porDiaMesBarrios.get(d.fecha)?.excluidos ?? 0)}`,
                        `  • Pendientes por asignar: ${fmtN(porDiaMesBarrios.get(d.fecha)?.pendientes ?? 0)} (${fmtN(porDiaMesBarrios.get(d.fecha)?.pendientesOrdenes ?? 0)} órdenes)`,
                        `Técnicos/brigadas activas ese día: ${fmtN(d.tecnicosCount)}`,
                        `Promedio de barrios por técnico ese día: ${d.avgBarriosPorTecnico}`,
                      ].join('\n');
                    }

                    const b = barriosParaGrafica[idx];
                    if (!b) return '';
                    const totalGestion = (b.asignadas || 0) + (b.pendientes || 0);
                    const pctAsig = totalGestion > 0 ? Math.round((b.asignadas / totalGestion) * 1000) / 10 : 0;
                    const pctPend = totalGestion > 0 ? Math.round((b.pendientes / totalGestion) * 1000) / 10 : 0;
                    // % de canceladas sobre el TOTAL del barrio (todas las categorías), no solo
                    // Asignadas+Pendientes -- Canceladas es una categoría aparte (valor_orden=0).
                    const pctCancel = (b.total || 0) > 0 ? Math.round(((b.canceladas || 0) / b.total) * 1000) / 10 : 0;

                    return [
                      `\nDistribución de carga del barrio:`,
                      `  • Asignadas: ${fmtN(b.asignadas)} (${pctAsig}%)`,
                      `  • Pendientes: ${fmtN(b.pendientes)} (${pctPend}%)`,
                      `  • Canceladas: ${fmtN(b.canceladas || 0)} (${pctCancel}% del barrio)`,
                      `  • Total barrio: ${fmtN(b.total)} órdenes`,
                      `Suspensión: ${fmtN(b.suspension)} | Reconexión: ${fmtN(b.reconexion)}`,
                      `Deuda del barrio: ${fmtCOP(b.deuda)}`,
                      b.tecnicos.length > 0
                        ? `Técnicos asignados (${b.tecnicos.length} en barrio / ${kpis.totalTecnicosConCarga} totales): ${b.tecnicos.map(t => `${t.tecnico} (${t.total})`).join(', ')}`
                        : `Sin técnicos asignados (${kpis.totalTecnicosConCarga} totales en el sistema)`,
                    ].join('\n');
                  },
                },
              },
            },
            scales: {
              x: {
                // En modo día, cada día muestra 2 columnas apiladas lado a lado (stack "ordenes"
                // y stack "barrios"), sin importar el toggle Agrupadas/Apiladas del resto de modos.
                stacked: esModoDia ? true : isStacked,
                grid: { display: false },
                ticks: { color: textInk, font: { weight: 'bold', size: 10.5 }, maxRotation: 35 },
                title: { display: true, text: esModoDia ? 'Día del Mes' : 'Barrios Ordenados por Criterio Seleccionado', color: textMut, font: { weight: 'bold' } },
              },
              y: {
                stacked: esModoDia ? true : isStacked,
                beginAtZero: true,
                grid: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
                ticks: { color: textMut, precision: 0 },
                title: { display: true, text: 'Cantidad de Órdenes', color: textMut, font: { weight: 'bold' } },
              },
              // Eje propio para la columna de barrios: su escala (decenas) es mucho más chica que
              // las órdenes (miles), así que comparte el mismo gráfico pero con su propio eje a la
              // derecha para que se vea grande y no quede aplastada en 0. Apilado (stack "barrios").
              ...(esModoDia ? {
                y1: {
                  stacked: true,
                  position: 'right' as const,
                  beginAtZero: true,
                  grid: { display: false },
                  ticks: { color: colors.otc, precision: 0 },
                  title: { display: true, text: 'Cantidad de Barrios', color: colors.otc, font: { weight: 'bold' } },
                },
              } : {}),
            },
          },
        };
      } else {
        // =========================================================================
        // MODO ALTERNATIVO: EVOLUTIVO HORARIO (07:00 - 23:00)
        // =========================================================================
        const labels = HORAS_JORNADA;
        const topBarrios = barriosParaGrafica.slice(0, 5);
        // Paleta de series de ThemeProvider (8 colores, ya resuelta por tema) en vez de una
        // paleta propia de 10 hex fijos; alcanza de sobra para los 5 barrios de topBarrios.
        const coloresPaleta = colors.series;

        const datasets = topBarrios.map((b, idx) => {
          const col = coloresPaleta[idx % coloresPaleta.length];
          const dataPorHora = labels.map(h => {
            const row = filteredHoras.find(r => r.hora === h && r.barrio === b.barrio);
            if (!row) return null;
            if (filtroModoGrafico === 'solo_asignadas') return row.asignadas;
            if (filtroModoGrafico === 'solo_pendientes') return row.pendientes;
            return row.total;
          });

          return {
            type: 'line',
            label: `${b.barrio} (${b.municipio})`,
            data: dataPorHora,
            borderColor: col,
            backgroundColor: col,
            borderWidth: 2.5,
            pointRadius: 3.5,
            pointHoverRadius: 6,
            tension: 0.3,
            fill: false,
            spanGaps: true,
          };
        });

        // Línea de promedio horario
        const promediosHorarios = labels.map(h => {
          const rowsHora = filteredHoras.filter(r => r.hora === h && topBarrios.some(tb => tb.barrio === r.barrio));
          if (rowsHora.length === 0) return null;
          const sum = rowsHora.reduce((s, r) => s + (filtroModoGrafico === 'solo_asignadas' ? r.asignadas : filtroModoGrafico === 'solo_pendientes' ? r.pendientes : r.total), 0);
          return Math.round((sum / (topBarrios.length || 1)) * 10) / 10;
        });

        if (mostrarLineasPromedio) {
          datasets.push({
            type: 'line',
            label: 'Promedio Horario',
            data: promediosHorarios,
            borderColor: colors.warn,
            backgroundColor: colors.warn,
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            tension: 0.2,
            fill: false,
            isPromedio: true,
          } as any);
        }

        config = {
          data: { labels, datasets },
          plugins: [dataLabelsPlugin],
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: 'top',
                labels: { boxWidth: 14, padding: 12, color: textInk, font: { weight: 'bold', size: 11 } },
              },
              tooltip: {
                backgroundColor: cardBg,
                titleColor: textInk,
                bodyColor: textInk,
                borderColor: borderCol,
                borderWidth: 1,
                callbacks: {
                  title: (items: any[]) => `Franja Horaria: ${items[0]?.label || ''}`,
                  label: (ctx: any) => ` ${ctx.dataset.label}: ${fmtN(Number(ctx.raw) || 0)} órdenes`,
                },
              },
            },
            scales: {
              x: {
                grid: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' },
                ticks: { color: textInk, font: { weight: 'bold', size: 11 } },
                title: { display: true, text: 'Franja Horaria del Día (07:00 a 23:00)', color: textMut, font: { weight: 'bold' } },
              },
              y: {
                beginAtZero: true,
                grid: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
                ticks: { color: textMut, precision: 0 },
                title: { display: true, text: 'Órdenes en la Franja', color: textMut, font: { weight: 'bold' } },
              },
            },
          },
        };
      }

      chartInstanceRef.current = new Chart(canvasRef.current, config);
    });

    return () => {
      isCancelled = true;
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [
    barriosParaGrafica,
    porDiaMes,
    porDiaMesBarrios,
    cardsKpis.pendientes.total,
    verGraficoMes,
    filteredHoras,
    modoVisualizacion,
    filtroModoGrafico,
    mostrarEtiquetas,
    mostrarLineasPromedio,
    isDark,
    colors,
    textInk,
    textMut,
    borderCol,
    colorAsignadas,
    colorPendientes,
    colorSuspension,
    colorReconexion,
    colorSeMantiene,
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 50 }}>
      {/* Menú de Navegación Operativa */}
      <ButtonMenuOperativo />

      {/* Encabezado Principal */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0.2, color: textInk, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Cierre Diario</span>
          </div>
          <div style={{ fontSize: 13, color: textMut, marginTop: 4 }}>
            Monitoreo en tiempo real de <strong>Cierres de Mano de Obra</strong>, órdenes asignadas, ejecutadas, canceladas y ranking de barrios.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={fetchData}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: primaryCol,
              color: '#ffffff',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
            }}
          >
            Actualizar Datos
          </button>
        </div>
      </div>

      {/* PANEL 1: SELECTORES DE MODO Y FILTROS MINIMALISTAS */}
      <div style={{
        background: bgCard,
        borderRadius: 12,
        border: `1px solid ${borderCol}`,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        {/* Fila 1: Filtro de Métrica / Estado para el Gráfico */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: textMut, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Visualizar en Gráfico:
            </span>
            <div style={{ display: 'inline-flex', flexWrap: 'wrap', maxWidth: '100%', background: 'var(--panel)', padding: 3, borderRadius: 8 }}>
              <button
                onClick={() => {
                  setFiltroModoGrafico('asig_vs_pend');
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: filtroModoGrafico === 'asig_vs_pend' ? primaryCol : 'transparent',
                  color: filtroModoGrafico === 'asig_vs_pend' ? '#ffffff' : textMut,
                  fontWeight: filtroModoGrafico === 'asig_vs_pend' ? 700 : 600,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Asig. vs. Pend.
              </button>
              <button
                onClick={() => {
                  setFiltroModoGrafico('todas');
                  setCriterioOrden('total');
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: filtroModoGrafico === 'todas' ? 'var(--sip)' : 'transparent',
                  color: filtroModoGrafico === 'todas' ? '#ffffff' : textMut,
                  fontWeight: filtroModoGrafico === 'todas' ? 700 : 600,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Todas
              </button>
              <button
                onClick={() => {
                  setFiltroModoGrafico('solo_asignadas');
                  setCriterioOrden('asignadas');
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: filtroModoGrafico === 'solo_asignadas' ? colorAsignadas : 'transparent',
                  color: filtroModoGrafico === 'solo_asignadas' ? '#ffffff' : textMut,
                  fontWeight: filtroModoGrafico === 'solo_asignadas' ? 700 : 600,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Asignadas
              </button>
              <button
                onClick={() => {
                  setFiltroModoGrafico('solo_pendientes');
                  setCriterioOrden('pendientes');
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: filtroModoGrafico === 'solo_pendientes' ? colorPendientes : 'transparent',
                  color: filtroModoGrafico === 'solo_pendientes' ? '#ffffff' : textMut,
                  fontWeight: filtroModoGrafico === 'solo_pendientes' ? 700 : 600,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Pendientes
              </button>
              <button
                onClick={() => {
                  setFiltroModoGrafico('por_tipo_os');
                  setCriterioOrden('suspension');
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: filtroModoGrafico === 'por_tipo_os' ? 'var(--otc)' : 'transparent',
                  color: filtroModoGrafico === 'por_tipo_os' ? '#ffffff' : textMut,
                  fontWeight: filtroModoGrafico === 'por_tipo_os' ? 700 : 600,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Tipo de Orden
              </button>
            </div>
          </div>

          {/* Opciones de presentación de barras */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', flexWrap: 'wrap', maxWidth: '100%', background: 'var(--panel)', padding: 3, borderRadius: 8 }}>
              <button
                onClick={() => setModoVisualizacion('barras_agrupadas')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: modoVisualizacion === 'barras_agrupadas' ? primaryCol : 'transparent',
                  color: modoVisualizacion === 'barras_agrupadas' ? '#ffffff' : textMut,
                  fontWeight: 700,
                  fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                Agrupadas
              </button>
              <button
                onClick={() => setModoVisualizacion('barras_apiladas')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: modoVisualizacion === 'barras_apiladas' ? primaryCol : 'transparent',
                  color: modoVisualizacion === 'barras_apiladas' ? '#ffffff' : textMut,
                  fontWeight: 700,
                  fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                Apiladas
              </button>
              <button
                onClick={() => setModoVisualizacion('horario')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: modoVisualizacion === 'horario' ? primaryCol : 'transparent',
                  color: modoVisualizacion === 'horario' ? '#ffffff' : textMut,
                  fontWeight: 700,
                  fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                Horario (23h)
              </button>
            </div>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: textMut, cursor: 'pointer', marginLeft: 6 }}>
              <input
                type="checkbox"
                checked={mostrarEtiquetas}
                onChange={e => setMostrarEtiquetas(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: primaryCol }}
              />
              Etiquetas
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: textMut, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={mostrarLineasPromedio}
                onChange={e => setMostrarLineasPromedio(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: primaryCol }}
              />
              Promedios
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: verGraficoMes ? primaryCol : textMut, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={verGraficoMes}
                onChange={e => setVerGraficoMes(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: primaryCol }}
              />
              Ver Todo el Mes
            </label>
          </div>
        </div>

        <div style={{ height: 1, background: borderCol }} />

        {/* Fila 2: Filtros Minimalistas de Tipo de OS, Asignación, Técnico y Municipio */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12, alignItems: 'center' }}>
          {/* Filtro Tipo de OS */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: textMut, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
              Tipo de Orden:
            </div>
            <select
              value={filtroTipoOS}
              onChange={e => setFiltroTipoOS(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 11px',
                borderRadius: 8,
                border: `1px solid ${borderCol}`,
                background: 'var(--panel)',
                color: textInk,
                fontSize: 12.5,
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value="ALL">Todos los Tipos ({tiposOSDisponibles.SUSPENSION + tiposOSDisponibles.RECONEXION})</option>
              {tiposOSDisponibles.SUSPENSION > 0 && (
                <option value="SUSPENSION">Suspensión ({tiposOSDisponibles.SUSPENSION})</option>
              )}
              {tiposOSDisponibles.RECONEXION > 0 && (
                <option value="RECONEXION">Reconexión ({tiposOSDisponibles.RECONEXION})</option>
              )}
            </select>
          </div>

          {/* Filtro por Estado de la Orden (estado_legible: Asignada/Pendiente/Ejecutada/Baja por WebService/Excluida) */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: textMut, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
              Estado de la Orden:
            </div>
            <select
              value={filtroAsignacion}
              onChange={e => {
                setFiltroAsignacion(e.target.value as any);
                if (e.target.value === 'NO_ASIGNADO') setFiltroTecnico('ALL');
              }}
              style={{
                width: '100%',
                padding: '7px 11px',
                borderRadius: 8,
                border: `1px solid ${borderCol}`,
                background: 'var(--panel)',
                color: textInk,
                fontSize: 12.5,
                fontWeight: 600,
                outline: 'none',
              }}
            >
              {(() => {
                const e = estadosAsignacionDisponibles;
                const pct = (n: number) => e.total > 0 ? ` · ${Math.round((n / e.total) * 1000) / 10}%` : '';
                return (
                  <>
                    <option value="ALL">Todas ({e.total})</option>
                    {e.asignadas > 0 && <option value="ASIGNADO">Asignada ({e.asignadas}{pct(e.asignadas)})</option>}
                    {e.noAsignadas > 0 && <option value="NO_ASIGNADO">Pendiente ({e.noAsignadas}{pct(e.noAsignadas)})</option>}
                    {e.ejecutadas > 0 && <option value="EJECUTADA">Ejecutada ({e.ejecutadas}{pct(e.ejecutadas)})</option>}
                    {e.canceladas > 0 && <option value="CANCELADA">Cancelada / Baja por Pago ({e.canceladas}{pct(e.canceladas)})</option>}
                    {e.excluidas > 0 && <option value="EXCLUIDA">Excluida / Sin Ubicar ({e.excluidas}{pct(e.excluidas)})</option>}
                  </>
                );
              })()}
            </select>
          </div>

          {/* Filtro por Técnico Específico */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: textMut, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
              Técnico Asignado:
            </div>
            <select
              value={filtroTecnico}
              onChange={e => {
                setFiltroTecnico(e.target.value);
                if (e.target.value !== 'ALL') setFiltroAsignacion('ASIGNADO');
              }}
              style={{
                width: '100%',
                padding: '7px 11px',
                borderRadius: 8,
                border: `1px solid ${borderCol}`,
                background: 'var(--panel)',
                color: textInk,
                fontSize: 12.5,
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value="ALL">Todos los Técnicos ({tecnicosDisponibles.length})</option>
              {tecnicosDisponibles.map(t => (
                <option key={t.tecnico} value={t.tecnico}>
                  {t.tecnico} ({t.total} órdenes | {t.barrios_count} barrios)
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Geográfico Municipio */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: textMut, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
              Municipio:
            </div>
            <select
              value={municipioFiltro}
              onChange={e => setMunicipioFiltro(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 11px',
                borderRadius: 8,
                border: `1px solid ${borderCol}`,
                background: 'var(--panel)',
                color: textInk,
                fontSize: 12.5,
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value="ALL">Todos los Municipios ({municipiosDisponibles.length})</option>
              {municipiosDisponibles.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Fila 3: Filtro Global de Proyecto, Zona, Búsqueda y Ordenamiento */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: textMut, textTransform: 'uppercase', letterSpacing: 0.4 }}>PROYECTO:</span>
            <div style={{ display: 'inline-flex', flexWrap: 'wrap', maxWidth: '100%', background: 'var(--panel)', padding: 2, borderRadius: 6 }}>
              {['ALL', 'Sur', 'Norte-Centro'].map(p => (
                <button
                  key={p}
                  onClick={() => setFilters({ proy: p })}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 5,
                    border: 'none',
                    background: (filters.proy || 'ALL') === p ? primaryCol : 'transparent',
                    color: (filters.proy || 'ALL') === p ? '#ffffff' : textMut,
                    fontWeight: 700,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {p === 'ALL' ? 'Todos' : p}
                </button>
              ))}
            </div>

            <span style={{ fontSize: 11, fontWeight: 700, color: textMut, textTransform: 'uppercase', letterSpacing: 0.4, marginLeft: 8 }}>ZONA:</span>
            <div style={{ display: 'inline-flex', flexWrap: 'wrap', maxWidth: '100%', background: 'var(--panel)', padding: 2, borderRadius: 6 }}>
              {['ALL', ...zonasDisponibles].map(z => {
                const currentZonas = (filters.zona && filters.zona !== 'ALL')
                  ? filters.zona.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
                  : [];
                const isAll = !filters.zona || filters.zona === 'ALL';
                const isActive = z === 'ALL'
                  ? isAll
                  : currentZonas.includes(z.toUpperCase());

                const handleZonaClick = (e: React.MouseEvent) => {
                  if (z === 'ALL') {
                    setFilters({ zona: 'ALL' });
                    return;
                  }
                  // Si presiona Ctrl/Cmd/Shift, permite multiselección combinada
                  if (e.ctrlKey || e.metaKey || e.shiftKey) {
                    if (currentZonas.includes(z.toUpperCase())) {
                      const next = currentZonas.filter(item => item !== z.toUpperCase());
                      setFilters({ zona: next.length === 0 ? 'ALL' : next.join(',') });
                    } else {
                      const next = [...currentZonas, z.toUpperCase()];
                      setFilters({ zona: next.join(',') });
                    }
                    return;
                  }

                  // Clic estándar: cambia de inmediato y directamente a la zona seleccionada
                  setFilters({ zona: z });
                };

                return (
                  <button
                    key={z}
                    onClick={handleZonaClick}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 5,
                      border: 'none',
                      background: isActive ? primaryCol : 'transparent',
                      color: isActive ? '#ffffff' : textMut,
                      fontWeight: 700,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                    title={z === 'ALL' ? 'Ver todas las zonas' : `Filtrar por ${z} (Ctrl+Clic para combinar)`}
                  >
                    {z === 'ALL' ? 'Todas' : z}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Buscador de barrio */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="text"
              placeholder="Buscar barrio o municipio..."
              value={busquedaBarrio}
              onChange={e => setBusquedaBarrio(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${borderCol}`,
                background: 'var(--panel)',
                color: textInk,
                fontSize: 12,
                outline: 'none',
                width: 220,
              }}
            />
            {(filtroTipoOS !== 'ALL' || filtroAsignacion !== 'ALL' || filtroTecnico !== 'ALL' || busquedaBarrio || municipioFiltro !== 'ALL') && (
              <button
                onClick={() => {
                  setFiltroTipoOS('ALL');
                  setFiltroAsignacion('ALL');
                  setFiltroTecnico('ALL');
                  setMunicipioFiltro('ALL');
                  setBusquedaBarrio('');
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: `1px solid rgba(239, 68, 68, 0.3)`,
                  background: isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                  color: 'var(--err)',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                title="Limpiar filtros activos"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2 CARDS PRINCIPALES: ÓRDENES ASIGNADAS Y ÓRDENES PENDIENTES CON PORCENTAJES */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))',
        gap: 16,
      }}>
        {/* ============================================================== */}
        {/* CARD 1: ÓRDENES ASIGNADAS */}
        {/* ============================================================== */}
        <div style={{
          background: bgCard,
          borderRadius: 14,
          border: `1.5px solid ${isDark ? 'rgba(2, 132, 199, 0.4)' : 'rgba(2, 132, 199, 0.3)'}`,
          padding: '20px 22px',
          boxShadow: isDark ? '0 4px 20px rgba(0, 0, 0, 0.25)' : '0 4px 16px rgba(2, 132, 199, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Barra superior de acento */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, var(--sip), var(--sip))' }} />

          {/* Encabezado Card 1 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: colorAsignadas, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Órdenes Asignadas
              </div>
              <div style={{ fontSize: 12, color: textMut, marginTop: 2 }}>
                Asignadas hoy + cierres de mano de obra del mes (una orden cuenta una sola vez)
              </div>
            </div>
            <div style={{
              background: isDark ? 'rgba(2, 132, 199, 0.2)' : 'rgba(2, 132, 199, 0.12)',
              color: colorAsignadas,
              fontWeight: 800,
              fontSize: 13.5,
              padding: '4px 12px',
              borderRadius: 20,
              border: `1px solid ${isDark ? 'rgba(2, 132, 199, 0.4)' : 'rgba(2, 132, 199, 0.25)'}`,
            }}>
              {cardsKpis.asignadas.pctSobreTotal}% ejecutado
            </div>
          </div>

          {/* Valor Principal & Barra */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: colorAsignadas, lineHeight: 1 }}>
                {fmtN(cardsKpis.asignadas.total)}
              </div>
              <div style={{ fontSize: 13, color: textMut, fontWeight: 600 }}>
                de las cuales {fmtN(cardsKpis.ejecutadas.total)} ya se ejecutaron hoy ({cardsKpis.asignadas.pctSobreTotal}%)
                {cardsKpis.asignadas.deuda > 0 && (
                  <span style={{ marginLeft: 8, color: textInk, fontWeight: 700 }}>
                    · Valor: {fmtCOP(cardsKpis.asignadas.deuda)}
                  </span>
                )}
              </div>
            </div>
            {/* Barra de progreso */}
            <div style={{ height: 8, borderRadius: 10, background: 'var(--border)', marginTop: 10, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, cardsKpis.asignadas.pctSobreTotal)}%`,
                background: 'linear-gradient(90deg, var(--sip), var(--sip))',
                borderRadius: 10,
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>

          {/* Desglose de Tipos de OS con Porcentajes */}
          <div style={{
            background: isDark ? 'rgba(15, 23, 42, 0.6)' : 'var(--panel)',
            borderRadius: 10,
            padding: '12px 14px',
            border: `1px solid ${borderCol}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: textMut, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Desglose por Tipo de Orden (Asignadas):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              {/* Suspensión (Consolidada) */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 11.5, color: textMut }}>
                  Suspensión
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: colorSuspension, marginTop: 2 }}>
                  {fmtN(cardsKpis.asignadas.suspension)}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: textMut }}>
                  {cardsKpis.asignadas.pctSuspension}% de asignadas
                </div>
              </div>

              {/* Reconexión */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 11.5, color: textMut }}>
                  Reconexión
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: colorReconexion, marginTop: 2 }}>
                  {fmtN(cardsKpis.asignadas.reconexion)}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: textMut }}>
                  {cardsKpis.asignadas.pctReconexion}% de asignadas
                </div>
              </div>
            </div>
          </div>

          {/* Sección Exclusiva de Asignados: Técnicos Asignados y Meta */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 10,
            paddingTop: 4,
          }}>
            {/* Técnicos Asignados */}
            <div style={{
              background: isDark ? 'rgba(2, 132, 199, 0.08)' : 'rgba(2, 132, 199, 0.05)',
              borderRadius: 10,
              padding: '10px 12px',
              border: `1px solid ${isDark ? 'rgba(2, 132, 199, 0.25)' : 'rgba(2, 132, 199, 0.15)'}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: textMut }}>
                Técnicos Asignados
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: colorAsignadas, marginTop: 2 }}>
                {cardsKpis.asignadas.tecnicosAsignados}
              </div>
              <div style={{ fontSize: 10.5, color: textMut }}>
                Técnicos con carga activa
              </div>
            </div>

            {/* Meta de Asignación */}
            <div style={{
              background: isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.05)',
              borderRadius: 10,
              padding: '10px 12px',
              border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.15)'}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: textMut }}>
                Meta Cuota Diaria
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--ok)', marginTop: 2 }}>
                {cardsKpis.asignadas.metaTotal > 0 ? fmtN(cardsKpis.asignadas.metaTotal) : '—'}
              </div>
              <div style={{ fontSize: 10.5, color: textMut }}>
                {cardsKpis.asignadas.metaTotal > 0
                  ? `Cobertura: ${cardsKpis.asignadas.pctCoberturaMeta}%`
                  : 'Sin meta configurada'}
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* CARD 2: ÓRDENES PENDIENTES */}
        {/* ============================================================== */}
        <div style={{
          background: bgCard,
          borderRadius: 14,
          border: `1.5px solid ${isDark ? 'rgba(245, 158, 11, 0.4)' : 'rgba(245, 158, 11, 0.3)'}`,
          padding: '20px 22px',
          boxShadow: isDark ? '0 4px 20px rgba(0, 0, 0, 0.25)' : '0 4px 16px rgba(245, 158, 11, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Barra superior de acento */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, var(--warn), var(--warn))' }} />

          {/* Encabezado Card 2 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: colorPendientes, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Órdenes Pendientes
              </div>
              <div style={{ fontSize: 12, color: textMut, marginTop: 2 }}>
                Carga disponible en cola por asignar a brigadas
              </div>
            </div>
            <div style={{
              background: isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.12)',
              color: colorPendientes,
              fontWeight: 800,
              fontSize: 13.5,
              padding: '4px 12px',
              borderRadius: 20,
              border: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.4)' : 'rgba(245, 158, 11, 0.25)'}`,
            }}>
              {cardsKpis.pendientes.pctSobreTotal}% del total
            </div>
          </div>

          {/* Valor Principal & Barra */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: colorPendientes, lineHeight: 1 }}>
                {fmtN(cardsKpis.pendientes.total)}
              </div>
              <div style={{ fontSize: 13, color: textMut, fontWeight: 600 }}>
                de {fmtN(cardsKpis.granTotal)} órdenes ({cardsKpis.pendientes.pctSobreTotal}%)
                {cardsKpis.pendientes.deuda > 0 && (
                  <span style={{ marginLeft: 8, color: textInk, fontWeight: 700 }}>
                    · Valor: {fmtCOP(cardsKpis.pendientes.deuda)}
                  </span>
                )}
              </div>
            </div>
            {/* Barra de progreso */}
            <div style={{ height: 8, borderRadius: 10, background: 'var(--border)', marginTop: 10, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, cardsKpis.pendientes.pctSobreTotal)}%`,
                background: 'linear-gradient(90deg, var(--warn), var(--warn))',
                borderRadius: 10,
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>

          {/* Desglose de Tipos de OS con Porcentajes */}
          <div style={{
            background: isDark ? 'rgba(15, 23, 42, 0.6)' : 'var(--panel)',
            borderRadius: 10,
            padding: '12px 14px',
            border: `1px solid ${borderCol}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: textMut, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Desglose por Tipo de Orden (Pendientes):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              {/* Suspensión (Consolidada) */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 11.5, color: textMut }}>
                  Suspensión
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: colorSuspension, marginTop: 2 }}>
                  {fmtN(cardsKpis.pendientes.suspension)}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: textMut }}>
                  {cardsKpis.pendientes.pctSuspension}% de pendientes
                </div>
              </div>

              {/* Reconexión */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 11.5, color: textMut }}>
                  Reconexión
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: colorReconexion, marginTop: 2 }}>
                  {fmtN(cardsKpis.pendientes.reconexion)}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: textMut }}>
                  {cardsKpis.pendientes.pctReconexion}% de pendientes
                </div>
              </div>
            </div>
          </div>

          {/* Sección Inferior de Pendientes: Cobertura Territorial */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 10,
            paddingTop: 4,
          }}>
            <div style={{
              background: isDark ? 'rgba(245, 158, 11, 0.08)' : 'rgba(245, 158, 11, 0.05)',
              borderRadius: 10,
              padding: '10px 12px',
              border: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.15)'}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: textMut }}>
                Barrios con Pendientes
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: colorPendientes, marginTop: 2 }}>
                {cardsKpis.pendientes.barriosCount}
              </div>
              <div style={{ fontSize: 10.5, color: textMut }}>
                Barrios con órdenes en cola
              </div>
            </div>

            <div style={{
              background: isDark ? 'rgba(100, 116, 139, 0.08)' : 'rgba(100, 116, 139, 0.05)',
              borderRadius: 10,
              padding: '10px 12px',
              border: `1px solid ${isDark ? 'rgba(100, 116, 139, 0.25)' : 'rgba(100, 116, 139, 0.15)'}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: textMut }}>
                Estado Operativo
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: textInk, marginTop: 5 }}>
                En Espera
              </div>
              <div style={{ fontSize: 10.5, color: textMut }}>
                Por asignar a brigadas
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* OTROS ESTADOS: EJECUTADAS, CANCELADAS Y EXCLUIDAS, CON % SOBRE EL TOTAL */}
      <div style={{
        background: bgCard,
        borderRadius: 12,
        border: `1px solid ${borderCol}`,
        padding: '16px 20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))',
        gap: 12,
      }}>
        <div style={{
          background: 'var(--ok-bg)',
          borderRadius: 10,
          padding: '10px 14px',
          border: `1px solid var(--ok-border)`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: textMut }}>
            Órdenes Ejecutadas
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--ok)' }}>
              {fmtN(cardsKpis.ejecutadas.total)}
            </div>
            <div style={{ fontSize: 12, color: textMut, fontWeight: 600 }}>
              {cardsKpis.ejecutadas.pctSobreTotal}% del total
            </div>
          </div>
          {cardsKpis.ejecutadas.deuda > 0 && (
            <div style={{ fontSize: 10.5, color: textMut, marginTop: 2 }}>
              Valor: {fmtCOP(cardsKpis.ejecutadas.deuda)}
            </div>
          )}
        </div>

        <div style={{
          background: 'var(--err-bg)',
          borderRadius: 10,
          padding: '10px 14px',
          border: `1px solid var(--err-border)`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: textMut }}>
            Canceladas / Baja por Pago
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--err)' }}>
              {fmtN(cardsKpis.canceladas.total)}
            </div>
            <div style={{ fontSize: 12, color: textMut, fontWeight: 600 }}>
              {cardsKpis.canceladas.pctSobreTotal}% del total
            </div>
          </div>
          {cardsKpis.canceladas.deuda > 0 && (
            <div style={{ fontSize: 10.5, color: textMut, marginTop: 2 }}>
              Valor: {fmtCOP(cardsKpis.canceladas.deuda)}
            </div>
          )}
        </div>

        <div style={{
          background: isDark ? 'rgba(100, 116, 139, 0.08)' : 'rgba(100, 116, 139, 0.05)',
          borderRadius: 10,
          padding: '10px 14px',
          border: `1px solid ${isDark ? 'rgba(100, 116, 139, 0.25)' : 'rgba(100, 116, 139, 0.15)'}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: textMut }}>
            Excluidas / Sin Ubicar
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: textInk }}>
              {fmtN(cardsKpis.excluidas.total)}
            </div>
            <div style={{ fontSize: 12, color: textMut, fontWeight: 600 }}>
              {cardsKpis.excluidas.pctSobreTotal}% del total
            </div>
          </div>
          {cardsKpis.excluidas.deuda > 0 && (
            <div style={{ fontSize: 10.5, color: textMut, marginTop: 2 }}>
              Valor: {fmtCOP(cardsKpis.excluidas.deuda)}
            </div>
          )}
        </div>
      </div>

      {/* CONTENEDOR DEL GRÁFICO PRINCIPAL */}
      <div style={{
        background: bgCard,
        borderRadius: 12,
        border: `1px solid ${borderCol}`,
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: textInk }}>
              {(filtroModoGrafico === 'asig_vs_pend'
                ? 'Órdenes Asignadas y Excluidas'
                : filtroModoGrafico === 'todas'
                ? 'Volumen Total de Órdenes Cargadas por Barrio'
                : filtroModoGrafico === 'solo_asignadas'
                ? 'Órdenes Asignadas a Brigadas por Barrio'
                : filtroModoGrafico === 'solo_pendientes'
                ? 'Órdenes Pendientes de Despacho por Barrio'
                : 'Desglose por Tipo de Orden: Suspensión vs. Reconexión por Barrio')
                + (filtroModoGrafico !== 'asig_vs_pend' && verGraficoMes ? ' (Mes Completo)' : '')}
            </div>
            <div style={{ fontSize: 12.5, color: textMut, marginTop: 3 }}>
              {filtroModoGrafico === 'asig_vs_pend'
                ? 'Datos reales por día, en 2 columnas apiladas: Órdenes (Excluidas + Asignadas) y Barrios (Pendientes + Asignados + Excluidos). Cada barrio cuenta una sola vez por día, priorizando Asignado > Excluido > Pendiente.'
                : verGraficoMes
                ? 'Asignadas = cierres acumulados del mes en mano de obra (SIPREM). Pendientes = carga actual de hoy.'
                : filtroTecnico !== 'ALL'
                ? `Mostrando únicamente órdenes asignadas al técnico: ${filtroTecnico}`
                : filtroTipoOS !== 'ALL'
                ? `Filtrado por tipo de orden: ${filtroTipoOS}`
                : 'Monitoreo de órdenes consolidadas desde la base de datos operativa en tiempo real.'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: textMut }}>Ordenar Ranking por:</span>
            <select
              value={criterioOrden}
              onChange={e => setCriterioOrden(e.target.value as any)}
              style={{
                padding: '5px 8px',
                borderRadius: 6,
                border: `1px solid ${borderCol}`,
                background: 'var(--panel)',
                color: textInk,
                fontSize: 11.5,
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value="pendientes">Pendientes (Mayor a Menor)</option>
              <option value="asignadas">Asignadas (Mayor a Menor)</option>
              <option value="total">Total Órdenes</option>
              <option value="suspension">Suspensión (TO501/504/503/506)</option>
              <option value="reconexion">Reconexión (TO502)</option>
            </select>
          </div>
        </div>

        {/* Canvas del Gráfico */}
        <div style={{ height: 380, width: '100%', position: 'relative' }}>
          {loading ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: textMut }}>
              Cargando datos operativos...
            </div>
          ) : (filtroModoGrafico === 'asig_vs_pend' ? porDiaMes.length === 0 : barriosParaGrafica.length === 0) ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: textMut }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: textInk }}>No se encontraron órdenes para los filtros seleccionados</div>
            </div>
          ) : (
            <canvas ref={canvasRef} id="canvas-asignacion-barrios" />
          )}
        </div>

        {/* Desglose real de Pendientes por barrio -- solo existe para HOY (analitica.v_ordenes_dia
            es un snapshot del momento actual, no guarda historial por día). Los demás días del
            gráfico no tienen este desglose porque el dato nunca se guardó. */}
        {filtroModoGrafico === 'asig_vs_pend' && topBarriosPendientesHoy.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${borderCol}` }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: textInk, marginBottom: 2 }}>
              Pendientes por Barrio — Solo Hoy
            </div>
            <div style={{ fontSize: 11.5, color: textMut, marginBottom: 10 }}>
              Dato real de hoy ({new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })}). Los demás días del gráfico no tienen desglose por barrio porque no existe un histórico diario guardado -- solo el total reconstruido.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {topBarriosPendientesHoy.map(b => (
                <span key={`${b.barrio}__${b.municipio}`} style={{
                  padding: '4px 10px', borderRadius: 6,
                  background: isDark ? 'rgba(181, 189, 0, 0.15)' : 'rgba(181, 189, 0, 0.1)',
                  color: colorPendientes, fontWeight: 700, fontSize: 11.5,
                  border: `1px solid ${isDark ? 'rgba(181, 189, 0, 0.3)' : 'rgba(181, 189, 0, 0.2)'}`,
                }}
                title={`${b.municipio} (${b.zona})`}
                >
                  {b.barrio}: {fmtN(b.pendientes)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECCIÓN: METAS DE ÓRDENES Y CUMPLIMIENTO POR ZONA Y TIPO DE BRIGADA      */}
      {/* ========================================================================= */}
      <div style={{
        background: bgCard,
        borderRadius: 12,
        border: `1px solid ${borderCol}`,
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Encabezado de la Sección de Metas */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: textInk, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Metas de Órdenes y Cumplimiento por Zona y Brigada</span>
              <span style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 6,
                background: 'rgba(2, 132, 199, 0.1)',
                color: primaryCol,
                fontWeight: 700,
              }}>
                Reglas Oficiales L-V / Sáb / Dom
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: textMut, marginTop: 4 }}>
              Metas operativas: <strong>Norte-Centro</strong> (Pesada 20/15, Liviana 25/18.75, MT 15/11, Canasta 11/8, Gestor 18/13) · <strong>Sur</strong> (Liviana 23, Pesada 20, Disp 15, Minicanasta 11, Canasta 8).
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: textMut }}>
              Grupos evaluados: <strong style={{ color: textInk }}>{metasFiltradas.length}</strong>
            </span>
          </div>
        </div>

        {/* Tarjetas KPI de Metas y Porcentajes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(165px, 100%), 1fr))', gap: 12 }}>
          {/* Meta Total Cuota */}
          <div style={{ background: 'var(--panel)', borderRadius: 10, padding: '12px 14px', border: `1px solid ${borderCol}` }}>
            <div style={{ fontSize: 11, color: textMut, fontWeight: 700, textTransform: 'uppercase' }}>Meta de Órdenes</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--sip)', marginTop: 4 }}>
              {fmtN(totalesMetas.metaTotal)}
            </div>
            <div style={{ fontSize: 11, color: textMut, marginTop: 2 }}>{totalesMetas.brigadas} brigadas activas</div>
          </div>

          {/* Órdenes Asignadas y % Cobertura */}
          <div style={{ background: 'var(--panel)', borderRadius: 10, padding: '12px 14px', border: `1px solid ${borderCol}` }}>
            <div style={{ fontSize: 11, color: textMut, fontWeight: 700, textTransform: 'uppercase' }}>Órdenes Asignadas</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: colorAsignadas, marginTop: 4 }}>
              {fmtN(totalesMetas.asignadas)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, totalesMetas.pctAsignado)}%`, height: '100%', background: totalesMetas.pctAsignado >= 90 ? 'var(--ok)' : totalesMetas.pctAsignado >= 70 ? 'var(--warn)' : 'var(--err)' }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, color: totalesMetas.pctAsignado >= 90 ? 'var(--ok)' : totalesMetas.pctAsignado >= 70 ? 'var(--warn)' : 'var(--err)' }}>
                {totalesMetas.pctAsignado}%
              </span>
            </div>
          </div>

          {/* Órdenes Cumplidas / Ejecutadas */}
          <div style={{ background: 'var(--panel)', borderRadius: 10, padding: '12px 14px', border: `1px solid ${borderCol}` }}>
            <div style={{ fontSize: 11, color: textMut, fontWeight: 700, textTransform: 'uppercase' }}>Cumplidas (Ejecutadas)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ok)', marginTop: 4 }}>
              {fmtN(totalesMetas.ejecutadas)}
            </div>
            <div style={{ fontSize: 11, color: textMut, marginTop: 2 }}>
              vs. Asignadas: <strong style={{ color: 'var(--ok)' }}>{totalesMetas.pctCumplidoVsAsignado}%</strong>
            </div>
          </div>

          {/* Cumplimiento vs Meta Global */}
          <div style={{ background: 'var(--panel)', borderRadius: 10, padding: '12px 14px', border: `1px solid ${borderCol}` }}>
            <div style={{ fontSize: 11, color: textMut, fontWeight: 700, textTransform: 'uppercase' }}>Cumplimiento vs. Meta</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: totalesMetas.pctCumplidoVsMeta >= 80 ? 'var(--ok)' : totalesMetas.pctCumplidoVsMeta >= 40 ? 'var(--warn)' : 'var(--err)', marginTop: 4 }}>
              {totalesMetas.pctCumplidoVsMeta}%
            </div>
            <div style={{ fontSize: 11, color: textMut, marginTop: 2 }}>Avance de la cuota global</div>
          </div>

          {/* Brecha / Faltante */}
          <div style={{ background: 'var(--panel)', borderRadius: 10, padding: '12px 14px', border: `1px solid ${borderCol}` }}>
            <div style={{ fontSize: 11, color: textMut, fontWeight: 700, textTransform: 'uppercase' }}>Faltante para Meta</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: totalesMetas.brecha > 0 ? 'var(--warn)' : 'var(--ok)', marginTop: 4 }}>
              {fmtN(totalesMetas.brecha)}
            </div>
            <div style={{ fontSize: 11, color: textMut, marginTop: 2 }}>{totalesMetas.brecha > 0 ? 'Órdenes por asignar' : 'Meta 100% cubierta'}</div>
          </div>
        </div>

        {/* Toolbar de Filtros Locales de Metas */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          background: 'var(--panel)',
          padding: '10px 14px',
          borderRadius: 8,
          border: `1px solid ${borderCol}`,
        }}>
          {/* Filtro Zona */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: textMut }}>ZONA:</span>
            <div style={{ display: 'inline-flex', flexWrap: 'wrap', maxWidth: '100%', background: 'var(--card)', padding: 2, borderRadius: 6, border: `1px solid ${borderCol}` }}>
              {['ALL', ...metasZonasDisponibles].map(z => {
                const currentZonas = (filtroMetaZona && filtroMetaZona !== 'ALL')
                  ? filtroMetaZona.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
                  : [];
                const isAll = !filtroMetaZona || filtroMetaZona === 'ALL';
                const isActive = z === 'ALL'
                  ? isAll
                  : currentZonas.includes(z.toUpperCase());

                const handleToggle = (e: React.MouseEvent) => {
                  if (z === 'ALL') {
                    setFiltroMetaZona('ALL');
                    return;
                  }
                  if (e.ctrlKey || e.metaKey || e.shiftKey) {
                    if (currentZonas.includes(z.toUpperCase())) {
                      const next = currentZonas.filter(item => item !== z.toUpperCase());
                      setFiltroMetaZona(next.length === 0 ? 'ALL' : next.join(','));
                    } else {
                      const next = [...currentZonas, z.toUpperCase()];
                      setFiltroMetaZona(next.join(','));
                    }
                    return;
                  }

                  // Clic estándar: selección directa e inmediata
                  setFiltroMetaZona(z);
                };

                return (
                  <button
                    key={z}
                    onClick={handleToggle}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      border: 'none',
                      background: isActive ? primaryCol : 'transparent',
                      color: isActive ? '#ffffff' : textMut,
                      fontWeight: 700,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                    title={z === 'ALL' ? 'Ver todas las zonas de metas' : `Filtrar metas por ${z} (Ctrl+Clic para combinar)`}
                  >
                    {z === 'ALL' ? 'Todas' : z}
                  </button>
                );
              })}
            </div>

            {/* Filtro Tipo de Brigada */}
            <span style={{ fontSize: 11.5, fontWeight: 700, color: textMut, marginLeft: 6 }}>BRIGADA:</span>
            <select
              value={filtroMetaBrigada}
              onChange={e => setFiltroMetaBrigada(e.target.value)}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: `1px solid ${borderCol}`,
                background: 'var(--card)',
                color: textInk,
                fontSize: 11.5,
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value="ALL">Todas las Brigadas</option>
              {metasBrigadasDisponibles.has('PESADA') && <option value="PESADA">Pesadas (SCR / Tipo Pesada)</option>}
              {metasBrigadasDisponibles.has('LIVIANA') && <option value="LIVIANA">Livianas</option>}
              {metasBrigadasDisponibles.has('CANASTA') && <option value="CANASTA">Canasta</option>}
              {metasBrigadasDisponibles.has('MINICANASTA') && <option value="MINICANASTA">Minicanasta</option>}
              {metasBrigadasDisponibles.has('MT') && <option value="MT">Pesada MT / Medida Especial</option>}
              {metasBrigadasDisponibles.has('DISP') && <option value="DISP">Disponibilidad</option>}
              {metasBrigadasDisponibles.has('GESTOR') && <option value="GESTOR">Gestor Integral Multi</option>}
            </select>

            {/* Filtro de Cobertura */}
            <span style={{ fontSize: 11.5, fontWeight: 700, color: textMut, marginLeft: 6 }}>COBERTURA:</span>
            <select
              value={filtroMetaCumplimiento}
              onChange={e => setFiltroMetaCumplimiento(e.target.value as any)}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: `1px solid ${borderCol}`,
                background: 'var(--card)',
                color: textInk,
                fontSize: 11.5,
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value="ALL">Todos los Niveles</option>
              {metasCoberturasDisponibles.has('ALTA') && <option value="ALTA">Alta (≥ 90%)</option>}
              {metasCoberturasDisponibles.has('MEDIA') && <option value="MEDIA">Media (70% - 89%)</option>}
              {metasCoberturasDisponibles.has('BAJA') && <option value="BAJA">Baja (&lt; 70%)</option>}
            </select>
          </div>

          {/* Ordenamiento */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', maxWidth: '100%' }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: textMut }}>Ordenar por:</span>
            <select
              value={ordenMetas}
              onChange={e => setOrdenMetas(e.target.value as any)}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: `1px solid ${borderCol}`,
                background: 'var(--card)',
                color: textInk,
                fontSize: 11.5,
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value="asignadas">Órdenes Asignadas (Mayor a Menor)</option>
              <option value="meta">Meta Total Cuota (Mayor a Menor)</option>
              <option value="cumplimiento_asig">% Cumplido vs. Asignado (Mayor a Menor)</option>
              <option value="cumplimiento_meta">% Cumplido vs. Meta (Mayor a Menor)</option>
            </select>

            {(filtroMetaZona !== 'ALL' || filtroMetaBrigada !== 'ALL' || filtroMetaCumplimiento !== 'ALL') && (
              <button
                onClick={() => {
                  setFiltroMetaZona('ALL');
                  setFiltroMetaBrigada('ALL');
                  setFiltroMetaCumplimiento('ALL');
                }}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: `1px solid rgba(239, 68, 68, 0.3)`,
                  background: isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                  color: 'var(--err)',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Tabla de Metas por Zona y Brigada */}
        <div className="mobile-scroll-tip">Desliza horizontalmente para ver todas las métricas &rarr;</div>
        <div className="table-responsive-container" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${borderCol}`, textAlign: 'left', color: textMut, fontWeight: 700 }}>
                <th style={{ padding: '10px 8px' }}>#</th>
                <th style={{ padding: '10px 10px' }}>Zona</th>
                <th style={{ padding: '10px 12px' }}>Tipo de Brigada</th>
                <th style={{ padding: '10px 10px', textAlign: 'center' }}>Brigadas</th>
                <th style={{ padding: '10px 10px', textAlign: 'right' }}>Meta Unit.</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--sip)' }}>Meta Cuota</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: colorAsignadas }}>Asignadas</th>
                <th style={{ padding: '10px 14px', width: 170 }}>% Asignado vs. Meta</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--ok)' }}>Cumplidas</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>% Cumplido/Asig.</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>% Cumplido/Meta</th>
                <th style={{ padding: '10px 10px', textAlign: 'right' }}>Faltante</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {metasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={13} style={{ padding: 24, textAlign: 'center', color: textMut }}>
                    No se encontraron registros de metas para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                metasFiltradas.map((m, idx) => {
                  const semaforoColor = m.pctAsignado >= 90 ? 'var(--ok)' : m.pctAsignado >= 70 ? 'var(--warn)' : 'var(--err)';
                  const semaforoLabel = m.pctAsignado >= 90 ? 'Óptimo' : m.pctAsignado >= 70 ? 'Alerta' : 'Crítico';

                  return (
                    <tr
                      key={`${m.proyecto}__${m.zona}__${m.tipo_brigada}__${idx}`}
                      style={{ borderBottom: `1px solid ${borderCol}` }}
                    >
                      <td style={{ padding: '8px 8px', color: textMut, fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: textInk }}>
                        <span style={{
                          padding: '2px 7px',
                          borderRadius: 4,
                          background: m.zona.toUpperCase().includes('SUR') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(2, 132, 199, 0.1)',
                          color: m.zona.toUpperCase().includes('SUR') ? 'var(--err)' : primaryCol,
                          fontSize: 11,
                          fontWeight: 800,
                        }}>
                          {m.zona}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: textInk }}>
                        {m.tipo_brigada}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>
                        {m.brigadas_activas}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: textMut, fontWeight: 600 }}>
                        {m.metaUnit} órd/d
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--sip)' }}>
                        {fmtN(m.metaTotal)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: colorAsignadas }}>
                        {fmtN(m.asignadas)}
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, height: 7, borderRadius: 3.5, background: 'var(--border)', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(100, m.pctAsignado)}%`,
                              height: '100%',
                              background: semaforoColor,
                              borderRadius: 3.5,
                            }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 800, color: semaforoColor, minWidth: 42, textAlign: 'right' }}>
                            {m.pctAsignado}%
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--ok)' }}>
                        {fmtN(m.ejecutadas)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: m.pctCumplidoVsAsignado >= 50 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                          color: m.pctCumplidoVsAsignado >= 50 ? 'var(--ok)' : 'var(--warn)',
                          fontSize: 11,
                          fontWeight: 800,
                        }}>
                          {m.pctCumplidoVsAsignado}%
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: textMut }}>
                        {m.pctCumplidoVsMeta}%
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: m.brecha > 0 ? 'var(--warn)' : 'var(--ok)' }}>
                        {m.brecha > 0 ? fmtN(m.brecha) : '—'}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'center', fontSize: 11.5, fontWeight: 700 }}>
                        {semaforoLabel}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {metasFiltradas.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: `2px solid ${borderCol}`, background: 'var(--panel)', fontWeight: 800 }}>
                  <td colSpan={3} style={{ padding: '10px 12px', color: textInk }}>TOTAL CONSOLIDADO</td>
                  <td style={{ padding: '10px 10px', textAlign: 'center' }}>{totalesMetas.brigadas}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: textMut }}>—</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--sip)' }}>{fmtN(totalesMetas.metaTotal)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: colorAsignadas }}>{fmtN(totalesMetas.asignadas)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 7, borderRadius: 3.5, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.min(100, totalesMetas.pctAsignado)}%`,
                          height: '100%',
                          background: totalesMetas.pctAsignado >= 90 ? 'var(--ok)' : totalesMetas.pctAsignado >= 70 ? 'var(--warn)' : 'var(--err)',
                          borderRadius: 3.5,
                        }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 800, color: totalesMetas.pctAsignado >= 90 ? 'var(--ok)' : totalesMetas.pctAsignado >= 70 ? 'var(--warn)' : 'var(--err)', minWidth: 42, textAlign: 'right' }}>
                        {totalesMetas.pctAsignado}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--ok)' }}>{fmtN(totalesMetas.ejecutadas)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--ok)' }}>{totalesMetas.pctCumplidoVsAsignado}%</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: textMut }}>{totalesMetas.pctCumplidoVsMeta}%</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: totalesMetas.brecha > 0 ? 'var(--warn)' : 'var(--ok)' }}>
                    {totalesMetas.brecha > 0 ? fmtN(totalesMetas.brecha) : '—'}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                    {totalesMetas.pctAsignado >= 90 ? 'Óptimo' : totalesMetas.pctAsignado >= 70 ? 'Alerta' : 'Crítico'}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* TABLA DE RANKING OPERATIVO CON DESGLOSE POR TIPO DE OS Y TÉCNICOS */}
      <div style={{
        background: bgCard,
        borderRadius: 12,
        border: `1px solid ${borderCol}`,
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: textInk }}>
              Ranking de Barrios: Suspensión, Reconexión y Técnicos Asignados
            </div>
            <div style={{ fontSize: 12.5, color: textMut, marginTop: 2 }}>
              Visualiza el desglose consolidado de Suspensión y Reconexión y haz clic en los técnicos para ver su asignación individual.
            </div>
          </div>

          <div style={{ fontSize: 12, color: textMut }}>
            Mostrando <strong>{rankingBarrios.length}</strong> barrios encontrados
          </div>
        </div>

        <div className="mobile-scroll-tip">Desliza horizontalmente para ver todas las columnas y métricas &rarr;</div>
        <div className="table-responsive-container" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 1220, borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${borderCol}`, textAlign: 'left', color: textMut, fontWeight: 700 }}>
                <th style={{ padding: '10px 10px' }}>#</th>
                <th style={{ padding: '10px 12px' }}>Barrio</th>
                <th style={{ padding: '10px 10px' }}>Municipio</th>
                <th style={{ padding: '10px 8px' }}>Zona</th>
                <th style={{ padding: '10px 10px', textAlign: 'right', color: colorPendientes }}>Pendientes</th>
                <th style={{ padding: '10px 10px', textAlign: 'right', color: colorAsignadas }}>Asignadas</th>
                <th style={{ padding: '10px 10px', textAlign: 'right', color: colorSuspension }}>Suspensión</th>
                <th style={{ padding: '10px 10px', textAlign: 'right', color: colorReconexion }}>Reconexión</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Total Carga</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Deuda Total</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', color: isDark ? '#cbd5e1' : '#475569' }} title="Órdenes con 1 factura vencida">1 Fac.</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', color: isDark ? '#fbbf24' : '#b45309' }} title="Órdenes con 2 facturas vencidas">2 Fac.</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', color: isDark ? '#fb923c' : '#c2410c' }} title="Órdenes con 3 facturas vencidas">3 Fac.</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', color: isDark ? '#f87171' : '#dc2626' }} title="Órdenes con más de 3 facturas vencidas">&gt;3 Fac.</th>
                <th style={{ padding: '10px 12px' }}>Técnicos Asignados</th>
                <th style={{ padding: '10px 10px', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rankingBarrios.length === 0 ? (
                <tr>
                  <td colSpan={16} style={{ padding: 24, textAlign: 'center', color: textMut }}>
                    No se encontraron barrios para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                rankingBarrios.slice(0, 40).map((b, idx) => {
                  const key = `${b.barrio}__${b.municipio}`;
                  const esGraficado = barriosVisiblesEnGrafica.has(key);
                  return (
                    <tr
                      key={key}
                      style={{
                        borderBottom: `1px solid ${borderCol}`,
                        background: esGraficado ? (isDark ? 'rgba(37, 99, 235, 0.08)' : 'rgba(37, 99, 235, 0.04)') : 'transparent',
                      }}
                    >
                      <td style={{ padding: '8px 10px', color: textMut, fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: textInk }}>
                        {b.barrio}
                        {esGraficado && (
                          <span style={{
                            marginLeft: 6,
                            fontSize: 10,
                            padding: '1px 5px',
                            borderRadius: 4,
                            background: primaryCol,
                            color: '#ffffff',
                            fontWeight: 700,
                          }}
                          title="Este barrio se está visualizando activamente en el gráfico superior"
                          >
                            EN GRÁFICA
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', color: textInk }}>{b.municipio}</td>
                      <td style={{ padding: '8px 8px', color: textMut }}>{b.zona}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: colorPendientes, fontWeight: 700 }}>
                        {fmtN(b.pendientes)}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: colorAsignadas, fontWeight: 700 }}>
                        {fmtN(b.asignadas)}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: colorSuspension, fontWeight: 600 }}>
                        {fmtN(b.suspension)}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: colorReconexion, fontWeight: 600 }}>
                        {fmtN(b.reconexion)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: textInk, fontSize: 13 }}>
                        {fmtN(b.total)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: textMut, fontWeight: 600 }}>
                        {fmtCOP(b.deuda)}
                      </td>
                      {/* Columnas separadas de Facturas Vencidas: 1, 2, 3 y >3 */}
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: b.fac_venc_1 > 0 ? (isDark ? '#cbd5e1' : '#475569') : textMut, fontWeight: b.fac_venc_1 > 0 ? 700 : 400 }}>
                        {b.fac_venc_1 > 0 ? fmtN(b.fac_venc_1) : '—'}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: b.fac_venc_2 > 0 ? (isDark ? '#fbbf24' : '#b45309') : textMut, fontWeight: b.fac_venc_2 > 0 ? 700 : 400 }}>
                        {b.fac_venc_2 > 0 ? fmtN(b.fac_venc_2) : '—'}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: b.fac_venc_3 > 0 ? (isDark ? '#fb923c' : '#c2410c') : textMut, fontWeight: b.fac_venc_3 > 0 ? 700 : 400 }}>
                        {b.fac_venc_3 > 0 ? fmtN(b.fac_venc_3) : '—'}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: b.fac_venc_mas_3 > 0 ? (isDark ? '#f87171' : '#dc2626') : textMut, fontWeight: b.fac_venc_mas_3 > 0 ? 700 : 400 }}>
                        {b.fac_venc_mas_3 > 0 ? fmtN(b.fac_venc_mas_3) : '—'}
                      </td>
                      {/* Columna de Técnicos Asignados con desglose interactivo */}
                      <td style={{ padding: '8px 12px' }}>
                        {b.tecnicos.length === 0 ? (
                          <span style={{ fontSize: 11, color: textMut, fontStyle: 'italic' }}>Sin técnico asignado</span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              onClick={() => setModalTecnicosBarrio({ barrio: b.barrio, tecnicos: b.tecnicos })}
                              style={{
                                padding: '2px 8px',
                                borderRadius: 12,
                                border: `1px solid ${borderCol}`,
                                background: 'var(--sip-bg)',
                                color: 'var(--sip)',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                              title="Ver listado completo de técnicos asignados a este barrio"
                            >
                              <span>{b.tecnicos.length} {b.tecnicos.length === 1 ? 'técnico' : 'técnicos'}</span>
                              <span style={{ fontSize: 10 }}>▼</span>
                            </button>
                            <span style={{ fontSize: 11, color: textMut }}>
                              ({b.tecnicos[0].tecnico.split(' ')[0]}: {b.tecnicos[0].total})
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <button
                          onClick={() => fetchDetalle(b.barrio)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: `1px solid ${borderCol}`,
                            background: 'transparent',
                            color: primaryCol,
                            fontSize: 11.5,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Ver Órdenes
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {rankingBarrios.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: `2px solid ${borderCol}`, background: 'var(--panel)', fontWeight: 800 }}>
                  <td colSpan={4} style={{ padding: '10px 12px', color: textInk }}>TOTAL CONSOLIDADO</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: colorPendientes }}>{fmtN(kpis.totalPendientes)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: colorAsignadas }}>{fmtN(kpis.totalAsignadas)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: colorSuspension }}>{fmtN(kpis.totalSuspension)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: colorReconexion }}>{fmtN(kpis.totalReconexion)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: textInk }}>{fmtN(kpis.total)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: textMut }}>{fmtCOP(kpis.totalDeuda)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: isDark ? '#cbd5e1' : '#475569' }}>{fmtN(kpis.totalFacVenc1)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: isDark ? '#fbbf24' : '#b45309' }}>{fmtN(kpis.totalFacVenc2)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: isDark ? '#fb923c' : '#c2410c' }}>{fmtN(kpis.totalFacVenc3)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: isDark ? '#f87171' : '#dc2626' }}>{fmtN(kpis.totalFacVencMas3)}</td>
                  <td style={{ padding: '10px 12px', color: textMut, fontSize: 11 }}>{kpis.totalTecnicosConCarga} técnicos activos</td>
                  <td style={{ padding: '10px 10px', textAlign: 'center' }}>—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* MODAL 1: TÉCNICOS ASIGNADOS A UN BARRIO */}
      {modalTecnicosBarrio && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 'clamp(6px, 2vw, 16px)',
        }}>
          <div style={{
            background: bgCard,
            borderRadius: 14,
            border: `1px solid ${borderCol}`,
            width: 'min(100%, 680px)',
            maxHeight: '94dvh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
          }}>
            <div style={{
              padding: '14px 18px',
              borderBottom: `1px solid ${borderCol}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: textInk, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Técnicos Asignados en {modalTecnicosBarrio.barrio}
                </div>
                <div style={{ fontSize: 12, color: textMut, marginTop: 2 }}>
                  Desglose de órdenes asignadas por brigada/técnico en este barrio
                </div>
              </div>
              <button
                onClick={() => setModalTecnicosBarrio(null)}
                aria-label="Cerrar modal"
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 18,
                  fontWeight: 700,
                  color: textMut,
                  cursor: 'pointer',
                  minWidth: 36,
                  minHeight: 36,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>

            <div className="table-responsive-container" style={{ padding: '14px 18px', overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch', flex: 1 }}>
              <div className="mobile-scroll-tip">Desliza horizontalmente &rarr;</div>
              <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${borderCol}`, textAlign: 'left', color: textMut }}>
                    <th style={{ padding: '8px 10px' }}>Técnico</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', color: colorSuspension }}>Suspensión</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', color: colorReconexion }}>Reconexión</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800 }}>Total Asignado</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {modalTecnicosBarrio.tecnicos.map(t => (
                    <tr key={t.tecnico} style={{ borderBottom: `1px solid ${borderCol}` }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: textInk }}>{t.tecnico}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: colorSuspension }}>{t.suspension}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: colorReconexion }}>{t.reconexion}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: colorAsignadas }}>{t.total}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <button
                          onClick={() => {
                            setFiltroTecnico(t.tecnico);
                            setModalTecnicosBarrio(null);
                          }}
                          style={{
                            padding: '6px 10px',
                            minHeight: 32,
                            borderRadius: 6,
                            border: `1px solid ${borderCol}`,
                            background: 'transparent',
                            color: primaryCol,
                            fontSize: 11.5,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Filtrar por Técnico
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '12px 18px', borderTop: `1px solid ${borderCol}`, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setModalTecnicosBarrio(null)}
                style={{ padding: '8px 16px', minHeight: 34, borderRadius: 6, border: `1px solid ${borderCol}`, background: 'transparent', color: textInk, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: DETALLE INDIVIDUAL DE ÓRDENES (v_ordenes_dia) */}
      {modalDetalleOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 'clamp(6px, 2vw, 16px)',
        }}>
          <div style={{
            background: bgCard,
            borderRadius: 14,
            border: `1px solid ${borderCol}`,
            width: 'min(100%, 1150px)',
            maxHeight: '94dvh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
          }}>
            <div style={{
              padding: '14px 18px',
              borderBottom: `1px solid ${borderCol}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 16.5, fontWeight: 800, color: textInk }}>
                  Detalle Individual de Órdenes (analitica.v_ordenes_dia)
                </div>
                <div style={{ fontSize: 12, color: textMut, marginTop: 2 }}>
                  {barrioModal ? `Filtrado por Barrio: ${barrioModal}` : 'Listado general de órdenes del día operativo'}
                  {filtroTipoOS !== 'ALL' && ` • Filtro OS: ${filtroTipoOS}`}
                  {filtroTecnico !== 'ALL' && ` • Técnico: ${filtroTecnico}`}
                </div>
              </div>
              <button
                onClick={() => setModalDetalleOpen(false)}
                aria-label="Cerrar modal"
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 18,
                  fontWeight: 700,
                  color: textMut,
                  cursor: 'pointer',
                  flexShrink: 0,
                  minWidth: 36,
                  minHeight: 36,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '14px 18px', overflowY: 'auto', flex: 1 }}>
              {loadingDetalle ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: textMut, fontSize: 14 }}>
                  Cargando órdenes desde analitica.v_ordenes_dia...
                </div>
              ) : ordenesDetalle.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: textMut, fontSize: 14 }}>
                  No se encontraron órdenes para este filtro.
                </div>
              ) : (
                <div className="table-responsive-container" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <div className="mobile-scroll-tip">Desliza horizontalmente para ver todos los campos &rarr;</div>
                  <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${borderCol}`, textAlign: 'left', color: textMut }}>
                        <th style={{ padding: '8px 10px' }}>Orden</th>
                        <th style={{ padding: '8px 10px' }}>NIC</th>
                        <th style={{ padding: '8px 10px' }}>Tipo de Orden</th>
                        <th style={{ padding: '8px 10px' }}>Categoría</th>
                        <th style={{ padding: '8px 10px' }}>Estado</th>
                        <th style={{ padding: '8px 10px' }}>Barrio</th>
                        <th style={{ padding: '8px 10px' }}>Municipio</th>
                        <th style={{ padding: '8px 10px' }}>Técnico Asignado</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Deuda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordenesDetalle.map(ord => {
                        const cat = clasificarTipoOS(ord.tipo_orden);
                        return (
                          <tr key={ord.orden} style={{ borderBottom: `1px solid ${borderCol}` }}>
                            <td style={{ padding: '8px 10px', fontWeight: 700, color: textInk }}>{ord.orden}</td>
                            <td style={{ padding: '8px 10px', color: textInk }}>{ord.nic}</td>
                            <td style={{ padding: '8px 10px', fontWeight: 700, color: textInk }}>{ord.tipo_orden}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{
                                padding: '2px 7px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                background: cat === 'Suspensión' ? 'rgba(239, 68, 68, 0.15)' : cat === 'Reconexión' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                                color: cat === 'Suspensión' ? colorSuspension : cat === 'Reconexión' ? colorReconexion : textMut,
                              }}>
                                {cat === 'Suspensión' ? 'Suspensión' : cat === 'Reconexión' ? 'Reconexión' : 'Otro'}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{
                                padding: '2px 7px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                background: ord.estado_legible === 'Asignada' ? 'var(--sip)'
                                  : ord.estado_legible === 'Pendiente' ? 'var(--warn)'
                                  : ord.estado_legible === 'Ejecutada' ? 'var(--ok)'
                                  : 'var(--text-muted)',
                                color: '#ffffff',
                              }}>
                                {ord.estado_legible}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', color: textInk }}>{ord.barrio}</td>
                            <td style={{ padding: '8px 10px', color: textMut }}>{ord.municipio}</td>
                            <td style={{ padding: '8px 10px', fontWeight: ord.tecnico && ord.tecnico !== 'No asignado' ? 700 : 400, color: ord.tecnico && ord.tecnico !== 'No asignado' ? colorAsignadas : textMut }}>
                              {ord.tecnico || 'No asignado'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: textInk }}>
                              {ord.deuda ? `$${fmtN(ord.deuda)}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{
              padding: '12px 18px',
              borderTop: `1px solid ${borderCol}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
            }}>
              <span style={{ fontSize: 11.5, color: textMut }}>
                Mostrando hasta 600 registros ({ordenesDetalle.length} órdenes recuperadas)
              </span>
              <button
                onClick={() => setModalDetalleOpen(false)}
                style={{
                  padding: '8px 16px',
                  minHeight: 34,
                  borderRadius: 6,
                  border: `1px solid ${borderCol}`,
                  background: 'transparent',
                  color: textInk,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
