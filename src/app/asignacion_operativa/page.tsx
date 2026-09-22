'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useDashboard } from '../components/DashboardProvider';
import { useTheme } from '../components/ThemeProvider';
import { ButtonMenuOperativo } from '../components/Buttons';
import { fmtN } from '../components/utils/formatters';
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

export interface ProcessedMetaBrigada extends MetaBrigadaRow {
  metaUnit: number;
  metaTotal: number;
  pctAsignado: number;
  pctCumplidoVsAsignado: number;
  pctCumplidoVsMeta: number;
  brecha: number;
}

// Clasificación oficial de tipos de OS
export function clasificarTipoOS(tipo: string): 'Suspensión' | 'Reconexión' | 'Se mantiene suspendido' | 'Otro' {
  const t = (tipo || '').toUpperCase().trim();
  if (t === 'TO501' || t === 'TO504') return 'Suspensión';
  if (t === 'TO502') return 'Reconexión';
  if (t === 'TO503' || t === 'TO506') return 'Se mantiene suspendido';
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

// Función robusta para coincidencia de zona
export function zonaCoincide(rZona: string, filtro: string): boolean {
  if (!filtro || filtro === 'ALL') return true;
  return (rZona || '').toUpperCase().trim() === filtro.toUpperCase().trim();
}

// Horas de la jornada operativa hasta las 11:00 PM (23:00)
export const HORAS_JORNADA = [
  '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
  '19:00', '20:00', '21:00', '22:00', '23:00'
];

export default function AsignacionOperativaPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { filters, setFilters, proyList, zonaList } = useDashboard();

  // Estados de datos remotos
  const [dataBarrios, setDataBarrios] = useState<BarrioRow[]>([]);
  const [ordenesAgrupadas, setOrdenesAgrupadas] = useState<OrdenAgrupadaRow[]>([]);
  const [tecnicosLista, setTecnicosLista] = useState<TecnicoRow[]>([]);
  const [dataHoras, setDataHoras] = useState<BarrioHoraRow[]>([]);
  const [dataMetasBrigadas, setDataMetasBrigadas] = useState<MetaBrigadaRow[]>([]);
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

  // 2. Filtro de Tipo de OS / Orden: 'ALL', 'SUSPENSION', 'RECONEXION', 'SE_MANTIENE', o código puntual 'TO501', 'TO502', etc.
  const [filtroTipoOS, setFiltroTipoOS] = useState<string>('ALL');

  // 3. Filtro de Asignación: 'ALL', 'ASIGNADO' (con técnico), 'NO_ASIGNADO' (sin asignar)
  const [filtroAsignacion, setFiltroAsignacion] = useState<'ALL' | 'ASIGNADO' | 'NO_ASIGNADO'>('ALL');

  // 4. Filtro por Técnico específico: 'ALL' o nombre del técnico
  const [filtroTecnico, setFiltroTecnico] = useState<string>('ALL');

  // Filtros geográficos y de presentación
  const [municipioFiltro, setMunicipioFiltro] = useState<string>('ALL');
  const [topCantidad, setTopCantidad] = useState<number>(10);
  const [barriosSeleccionados, setBarriosSeleccionados] = useState<string[]>([]);
  const [busquedaBarrio, setBusquedaBarrio] = useState<string>('');
  const [criterioOrden, setCriterioOrden] = useState<'pendientes' | 'asignadas' | 'total' | 'suspension' | 'reconexion' | 'se_mantiene'>('pendientes');

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
  const [modalTecnicosBarrio, setModalTecnicosBarrio] = useState<{ barrio: string; tecnicos: { tecnico: string; total: number; suspension: number; reconexion: number; seMantiene: number }[] } | null>(null);

  // Canvas y Chart.js ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<any>(null);

  // Estilos del tema
  const bgCard = isDark ? '#1e293b' : '#ffffff';
  const borderCol = isDark ? '#334155' : '#e2e8f0';
  const textInk = isDark ? '#f8fafc' : '#0f172a';
  const textMut = isDark ? '#94a3b8' : '#64748b';
  const colorAsignadas = '#0284c7'; // Azul operativo
  const colorPendientes = '#f59e0b'; // Ámbar alerta
  const colorSuspension = '#ef4444'; // Rojo corte
  const colorReconexion = '#10b981'; // Verde reconexión
  const colorSeMantiene = '#8b5cf6'; // Púrpura se mantiene
  const primaryCol = '#0284c7';

  // Cargar datos de la API
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/data/asignacion_operativa');
      if (!res.ok) throw new Error(`HTTP ${res.status}: Error al obtener datos`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDataBarrios(json.barrios || []);
      setOrdenesAgrupadas(json.ordenesAgrupadas || []);
      setTecnicosLista(json.tecnicos || []);
      setDataHoras(json.barriosHoras || []);
      setDataMetasBrigadas(json.metasBrigadas || []);
    } catch (err: any) {
      console.error('Error cargando datos de asignación operativa:', err);
      setError(err.message || 'Error al conectar con la base de datos');
    } finally {
      setLoading(false);
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
        if (['SUSPENSION', 'RECONEXION', 'SE_MANTIENE'].includes(filtroTipoOS)) {
          params.set('categoria_os', filtroTipoOS === 'SUSPENSION' ? 'Suspensión' : filtroTipoOS === 'RECONEXION' ? 'Reconexión' : 'Se mantiene suspendido');
        } else {
          params.set('tipo_orden', filtroTipoOS);
        }
      }
      if (filtroAsignacion !== 'ALL') {
        params.set('tecnico', filtroAsignacion);
      } else if (filtroTecnico !== 'ALL') {
        params.set('tecnico', filtroTecnico);
      }

      const res = await fetch(`/api/data/asignacion_operativa?${params.toString()}`);
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

  // Municipios disponibles según filtros globales
  const municipiosDisponibles = useMemo(() => {
    const s = new Set<string>();
    ordenesAgrupadas.forEach(r => {
      if (!proyCoincide(r.proyecto, filters.proy)) return;
      if (!zonaCoincide(r.zona, filters.zona)) return;
      if (r.municipio) s.add(r.municipio);
    });
    return Array.from(s).sort();
  }, [ordenesAgrupadas, filters.proy, filters.zona]);

  // Técnicos disponibles según filtros aplicados
  const tecnicosDisponibles = useMemo(() => {
    return tecnicosLista.filter(t => {
      if (!proyCoincide(t.proyecto, filters.proy)) return false;
      if (!zonaCoincide(t.zona, filters.zona)) return false;
      return true;
    });
  }, [tecnicosLista, filters.proy, filters.zona]);

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
      // 5. Filtro de Tipo de OS
      if (filtroTipoOS !== 'ALL') {
        if (filtroTipoOS === 'SUSPENSION') {
          if (!['TO501', 'TO504'].includes(r.tipo_orden)) return false;
        } else if (filtroTipoOS === 'RECONEXION') {
          if (r.tipo_orden !== 'TO502') return false;
        } else if (filtroTipoOS === 'SE_MANTIENE') {
          if (!['TO503', 'TO506'].includes(r.tipo_orden)) return false;
        } else {
          // Código individual (TO501, TO502, etc.)
          if (r.tipo_orden !== filtroTipoOS) return false;
        }
      }
      // 6. Filtro de Asignación (Con técnico vs Sin Asignar)
      if (filtroAsignacion === 'ASIGNADO' && r.asignacion_status !== 'Asignado') return false;
      if (filtroAsignacion === 'NO_ASIGNADO' && r.asignacion_status !== 'No asignado') return false;

      // 7. Filtro por Técnico Específico
      if (filtroTecnico !== 'ALL') {
        if (r.tecnico !== filtroTecnico) return false;
      }

      return true;
    });
  }, [ordenesAgrupadas, filters.proy, filters.zona, municipioFiltro, busquedaBarrio, filtroTipoOS, filtroAsignacion, filtroTecnico]);

  // Consolidación de datos por Barrio para Ranking y Gráfico
  const rankingBarrios = useMemo(() => {
    const mapa = new Map<string, {
      barrio: string;
      municipio: string;
      zona: string;
      proyecto: string;
      total: number;
      asignadas: number;
      pendientes: number;
      suspension: number;
      reconexion: number;
      seMantiene: number;
      tecnicosMap: Map<string, { total: number; suspension: number; reconexion: number; seMantiene: number }>;
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
          suspension: 0,
          reconexion: 0,
          seMantiene: 0,
          tecnicosMap: new Map(),
        };
        mapa.set(key, item);
      }

      const cant = r.cantidad || 0;
      item.total += cant;

      // Asignadas vs Pendientes
      if (r.estado === 'ASIGNADA' || r.estado_legible === 'Asignada' || r.asignacion_status === 'Asignado') {
        item.asignadas += cant;
      }
      if (r.estado === 'DISPONIBLE' || r.estado_legible === 'Pendiente') {
        item.pendientes += cant;
      }

      // Tipos de OS
      if (['TO501', 'TO504'].includes(r.tipo_orden)) {
        item.suspension += cant;
      } else if (r.tipo_orden === 'TO502') {
        item.reconexion += cant;
      } else if (['TO503', 'TO506'].includes(r.tipo_orden)) {
        item.seMantiene += cant;
      }

      // Técnicos asignados en el barrio
      if (r.tecnico && r.tecnico !== 'No asignado') {
        let tEntry = item.tecnicosMap.get(r.tecnico);
        if (!tEntry) {
          tEntry = { total: 0, suspension: 0, reconexion: 0, seMantiene: 0 };
          item.tecnicosMap.set(r.tecnico, tEntry);
        }
        tEntry.total += cant;
        if (['TO501', 'TO504'].includes(r.tipo_orden)) tEntry.suspension += cant;
        else if (r.tipo_orden === 'TO502') tEntry.reconexion += cant;
        else if (['TO503', 'TO506'].includes(r.tipo_orden)) tEntry.seMantiene += cant;
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
      if (criterioOrden === 'se_mantiene') return b.seMantiene - a.seMantiene;
      return b.pendientes - a.pendientes; // Default: 'pendientes'
    });

    return lista;
  }, [filteredAgrupadas, criterioOrden]);

  // Selección de barrios para la gráfica (Top N o selección manual)
  const barriosParaGrafica = useMemo(() => {
    if (barriosSeleccionados.length > 0) {
      return rankingBarrios.filter(b => barriosSeleccionados.includes(b.barrio));
    }
    return rankingBarrios.slice(0, topCantidad);
  }, [rankingBarrios, barriosSeleccionados, topCantidad]);

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
        if (filtroTipoOS === 'SUSPENSION' && !['TO501', 'TO504'].includes(r.tipo_orden || '')) return false;
        if (filtroTipoOS === 'RECONEXION' && r.tipo_orden !== 'TO502') return false;
        if (filtroTipoOS === 'SE_MANTIENE' && !['TO503', 'TO506'].includes(r.tipo_orden || '')) return false;
      }
      return true;
    });
  }, [dataHoras, filters.proy, filters.zona, municipioFiltro, busquedaBarrio, filtroTipoOS]);

  // Métricas y KPIs Consolidados
  const kpis = useMemo(() => {
    const total = rankingBarrios.reduce((s, b) => s + b.total, 0);
    const totalAsignadas = rankingBarrios.reduce((s, b) => s + b.asignadas, 0);
    const totalPendientes = rankingBarrios.reduce((s, b) => s + b.pendientes, 0);
    const totalSuspension = rankingBarrios.reduce((s, b) => s + b.suspension, 0);
    const totalReconexion = rankingBarrios.reduce((s, b) => s + b.reconexion, 0);
    const totalSeMantiene = rankingBarrios.reduce((s, b) => s + b.seMantiene, 0);

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
      totalSeMantiene,
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

  // Filtrado y ordenamiento de metas
  const metasFiltradas = useMemo(() => {
    return metasProcesadas.filter(item => {
      // Filtros globales del Dashboard
      if (!proyCoincide(item.proyecto, filters.proy)) return false;
      if (!zonaCoincide(item.zona, filters.zona)) return false;

      // Filtros locales de la sección
      if (filtroMetaZona !== 'ALL' && item.zona.toUpperCase() !== filtroMetaZona.toUpperCase()) return false;
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

  // Renderizar Gráfico con Chart.js
  useEffect(() => {
    if (!canvasRef.current) return;
    let isCancelled = false;

    import('chart.js').then(({ Chart, registerables }) => {
      if (isCancelled || !canvasRef.current) return;
      Chart.register(...registerables);

      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }

      if (barriosParaGrafica.length === 0) return;

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

              ctx.save();
              ctx.font = 'bold 9.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
              ctx.fillStyle = dataset.borderColor || dataset.backgroundColor || textInk;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';

              // Halo para garantizar contraste
              ctx.strokeStyle = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
              ctx.lineWidth = 2.5;
              ctx.lineJoin = 'round';
              ctx.strokeText(String(val), element.x, element.y - 4);
              ctx.fillText(String(val), element.x, element.y - 4);
              ctx.restore();
            });
          });
        },
      };

      let config: any;

      if (modoVisualizacion === 'barras_agrupadas' || modoVisualizacion === 'barras_apiladas') {
        const labels = barriosParaGrafica.map(b => b.barrio);
        const isStacked = modoVisualizacion === 'barras_apiladas';
        const datasets: any[] = [];

        // Según el filtro de modo de gráfico configurado:
        if (filtroModoGrafico === 'asig_vs_pend') {
          // =========================================================================
          // MODO 1: ASIGNADAS VS PENDIENTES (COMPARATIVA DUAL)
          // =========================================================================
          const dataAsignadas = barriosParaGrafica.map(b => b.asignadas);
          const dataPendientes = barriosParaGrafica.map(b => b.pendientes);

          const avgAsig = Math.round((dataAsignadas.reduce((s, v) => s + v, 0) / (dataAsignadas.length || 1)) * 10) / 10;
          const avgPend = Math.round((dataPendientes.reduce((s, v) => s + v, 0) / (dataPendientes.length || 1)) * 10) / 10;

          if (mostrarLineasPromedio) {
            datasets.push({
              type: 'line',
              label: `⭐ Media Asignadas (${avgAsig})`,
              data: barriosParaGrafica.map(() => avgAsig),
              borderColor: colorAsignadas,
              borderWidth: 2,
              borderDash: [5, 4],
              pointRadius: 0,
              fill: false,
              isPromedio: true,
              order: 1,
            });
            datasets.push({
              type: 'line',
              label: `⭐ Media Pendientes (${avgPend})`,
              data: barriosParaGrafica.map(() => avgPend),
              borderColor: colorPendientes,
              borderWidth: 2,
              borderDash: [5, 4],
              pointRadius: 0,
              fill: false,
              isPromedio: true,
              order: 2,
            });
          }

          datasets.push({
            type: 'bar',
            label: '🔵 Órdenes Asignadas',
            data: dataAsignadas,
            backgroundColor: isDark ? '#0284c7' : '#0ea5e9',
            borderColor: '#0369a1',
            borderWidth: 1,
            borderRadius: isStacked ? 0 : 6,
            maxBarThickness: 38,
            stack: isStacked ? 'stack1' : undefined,
            order: 3,
          });

          datasets.push({
            type: 'bar',
            label: '🟡 Órdenes Pendientes',
            data: dataPendientes,
            backgroundColor: isDark ? '#f59e0b' : '#fbbf24',
            borderColor: '#d97706',
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 38,
            stack: isStacked ? 'stack1' : undefined,
            order: 4,
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
              label: `⭐ Media Total Cargadas (${avgTotal})`,
              data: barriosParaGrafica.map(() => avgTotal),
              borderColor: '#6366f1',
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
            label: '📦 Todas las Órdenes Cargadas',
            data: dataTotal,
            backgroundColor: isDark ? '#6366f1' : '#818cf8',
            borderColor: '#4f46e5',
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
              label: `⭐ Media Asignadas (${avgAsig})`,
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
            label: '🔵 Solo Órdenes Asignadas',
            data: dataAsignadas,
            backgroundColor: isDark ? '#0284c7' : '#0ea5e9',
            borderColor: '#0369a1',
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
              label: `⭐ Media Pendientes (${avgPend})`,
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
            label: '🟡 Solo Órdenes Pendientes',
            data: dataPendientes,
            backgroundColor: isDark ? '#f59e0b' : '#fbbf24',
            borderColor: '#d97706',
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 44,
            order: 2,
          });
        } else if (filtroModoGrafico === 'por_tipo_os') {
          // =========================================================================
          // MODO 5: POR TIPO DE OS (SUSPENSIÓN VS RECONEXIÓN VS SE MANTIENE)
          // =========================================================================
          const dataSuspension = barriosParaGrafica.map(b => b.suspension);
          const dataReconexion = barriosParaGrafica.map(b => b.reconexion);
          const dataSeMantiene = barriosParaGrafica.map(b => b.seMantiene);

          datasets.push({
            type: 'bar',
            label: '⚡ Suspensión (TO501 / TO504)',
            data: dataSuspension,
            backgroundColor: isDark ? '#ef4444' : '#f87171',
            borderColor: '#dc2626',
            borderWidth: 1,
            borderRadius: isStacked ? 0 : 5,
            maxBarThickness: 32,
            stack: isStacked ? 'stack1' : undefined,
          });

          datasets.push({
            type: 'bar',
            label: '🔄 Reconexión (TO502)',
            data: dataReconexion,
            backgroundColor: isDark ? '#10b981' : '#34d399',
            borderColor: '#059669',
            borderWidth: 1,
            borderRadius: isStacked ? 0 : 5,
            maxBarThickness: 32,
            stack: isStacked ? 'stack1' : undefined,
          });

          datasets.push({
            type: 'bar',
            label: '⏸️ Se Mantiene Suspendido (TO503 / TO506)',
            data: dataSeMantiene,
            backgroundColor: isDark ? '#8b5cf6' : '#a78bfa',
            borderColor: '#7c3aed',
            borderWidth: 1,
            borderRadius: 5,
            maxBarThickness: 32,
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
                backgroundColor: isDark ? '#0f172a' : '#ffffff',
                titleColor: textInk,
                bodyColor: textInk,
                borderColor: borderCol,
                borderWidth: 1,
                padding: 12,
                callbacks: {
                  title: (items: any[]) => `Barrio: ${items[0]?.label || ''}`,
                  label: (ctx: any) => {
                    const val = Number(ctx.raw) || 0;
                    return ` ${ctx.dataset.label}: ${fmtN(val)} órdenes`;
                  },
                  afterBody: (items: any[]) => {
                    const idx = items[0]?.dataIndex;
                    if (idx === undefined) return '';
                    const b = barriosParaGrafica[idx];
                    if (!b) return '';
                    return [
                      `\nTotal Órdenes: ${fmtN(b.total)}`,
                      `⚡ Suspensión: ${fmtN(b.suspension)} | 🔄 Reconexión: ${fmtN(b.reconexion)} | ⏸️ Se Mantiene: ${fmtN(b.seMantiene)}`,
                      `🔵 Asignadas: ${fmtN(b.asignadas)} | 🟡 Pendientes: ${fmtN(b.pendientes)}`,
                      b.tecnicos.length > 0 ? `👷 Técnicos Asignados (${b.tecnicos.length}): ${b.tecnicos.map(t => `${t.tecnico} (${t.total})`).slice(0, 3).join(', ')}${b.tecnicos.length > 3 ? '...' : ''}` : '👷 Sin técnicos asignados',
                    ].join('\n');
                  },
                },
              },
            },
            scales: {
              x: {
                stacked: isStacked,
                grid: { display: false },
                ticks: { color: textInk, font: { weight: 'bold', size: 10.5 }, maxRotation: 35 },
                title: { display: true, text: 'Barrios Ordenados por Criterio Seleccionado', color: textMut, font: { weight: 'bold' } },
              },
              y: {
                stacked: isStacked,
                beginAtZero: true,
                grid: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
                ticks: { color: textMut, precision: 0 },
                title: { display: true, text: 'Cantidad de Órdenes', color: textMut, font: { weight: 'bold' } },
              },
            },
          },
        };
      } else {
        // =========================================================================
        // MODO ALTERNATIVO: EVOLUTIVO HORARIO (07:00 - 23:00)
        // =========================================================================
        const labels = HORAS_JORNADA;
        const topBarrios = barriosParaGrafica.slice(0, 5);
        const coloresPaleta = [
          '#0284c7', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
          '#ec4899', '#06b6d4', '#14b8a6', '#f97316', '#6366f1'
        ];

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
            label: '⭐ Promedio Horario',
            data: promediosHorarios,
            borderColor: '#eab308',
            backgroundColor: '#eab308',
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
                backgroundColor: isDark ? '#0f172a' : '#ffffff',
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
    filteredHoras,
    modoVisualizacion,
    filtroModoGrafico,
    mostrarEtiquetas,
    mostrarLineasPromedio,
    isDark,
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
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0.5, color: textInk, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📊 Asignación Operativa: Órdenes por Barrio, Tipo de OS y Técnicos</span>
          </div>
          <div style={{ fontSize: 13, color: textMut, marginTop: 4 }}>
            Monitoreo en tiempo real de <strong>Órdenes Asignadas vs Pendientes</strong>, desglose de <strong>Suspensión, Reconexión y Se Mantiene</strong> y asignación a brigadas.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => fetchDetalle()}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: `1px solid ${borderCol}`,
              background: bgCard,
              color: textInk,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            📋 Ver Detalle de Órdenes (v_ordenes_dia)
          </button>
          <button
            onClick={fetchData}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: primaryCol,
              color: '#ffffff',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
            }}
          >
            🔄 Actualizar Datos
          </button>
        </div>
      </div>

      {/* PANEL 1: SELECTORES DE MODO DEL GRÁFICO (REQUERIMIENTO DEL USUARIO) */}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: textMut, textTransform: 'uppercase' }}>
              📊 Visualizar en Gráfico:
            </span>
            <div style={{ display: 'inline-flex', background: isDark ? '#0f172a' : '#f1f5f9', padding: 3, borderRadius: 8 }}>
              <button
                onClick={() => setFiltroModoGrafico('asig_vs_pend')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: filtroModoGrafico === 'asig_vs_pend' ? primaryCol : 'transparent',
                  color: filtroModoGrafico === 'asig_vs_pend' ? '#ffffff' : textMut,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                🔵🟡 Asignadas vs Pendientes
              </button>
              <button
                onClick={() => setFiltroModoGrafico('todas')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: filtroModoGrafico === 'todas' ? '#6366f1' : 'transparent',
                  color: filtroModoGrafico === 'todas' ? '#ffffff' : textMut,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                📦 Todas las Órdenes Cargadas
              </button>
              <button
                onClick={() => setFiltroModoGrafico('solo_asignadas')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: filtroModoGrafico === 'solo_asignadas' ? colorAsignadas : 'transparent',
                  color: filtroModoGrafico === 'solo_asignadas' ? '#ffffff' : textMut,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                🔵 Solo Asignadas
              </button>
              <button
                onClick={() => setFiltroModoGrafico('solo_pendientes')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: filtroModoGrafico === 'solo_pendientes' ? colorPendientes : 'transparent',
                  color: filtroModoGrafico === 'solo_pendientes' ? '#ffffff' : textMut,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                🟡 Solo Pendientes
              </button>
              <button
                onClick={() => setFiltroModoGrafico('por_tipo_os')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: filtroModoGrafico === 'por_tipo_os' ? '#8b5cf6' : 'transparent',
                  color: filtroModoGrafico === 'por_tipo_os' ? '#ffffff' : textMut,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                ⚡ Tipo OS (Suspensión / Reconexión / Se Mantiene)
              </button>
            </div>
          </div>

          {/* Opciones de presentación de barras */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'inline-flex', background: isDark ? '#0f172a' : '#f1f5f9', padding: 3, borderRadius: 8 }}>
              <button
                onClick={() => setModoVisualizacion('barras_agrupadas')}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: modoVisualizacion === 'barras_agrupadas' ? primaryCol : 'transparent',
                  color: modoVisualizacion === 'barras_agrupadas' ? '#ffffff' : textMut,
                  fontWeight: 700,
                  fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                📊 Agrupadas
              </button>
              <button
                onClick={() => setModoVisualizacion('barras_apiladas')}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: modoVisualizacion === 'barras_apiladas' ? primaryCol : 'transparent',
                  color: modoVisualizacion === 'barras_apiladas' ? '#ffffff' : textMut,
                  fontWeight: 700,
                  fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                🥞 Apiladas
              </button>
              <button
                onClick={() => setModoVisualizacion('horario')}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: modoVisualizacion === 'horario' ? primaryCol : 'transparent',
                  color: modoVisualizacion === 'horario' ? '#ffffff' : textMut,
                  fontWeight: 700,
                  fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                ⏰ Horario (23h)
              </button>
            </div>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: textInk, cursor: 'pointer', marginLeft: 8 }}>
              <input
                type="checkbox"
                checked={mostrarEtiquetas}
                onChange={e => setMostrarEtiquetas(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              🏷️ Etiquetas
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: textInk, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={mostrarLineasPromedio}
                onChange={e => setMostrarLineasPromedio(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              ⭐ Medias
            </label>
          </div>
        </div>

        <div style={{ height: 1, background: borderCol }} />

        {/* Fila 2: Filtros de Tipo de OS, Asignación y Técnico */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'center' }}>
          {/* Filtro Tipo de OS */}
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: textMut, marginBottom: 4 }}>
              🏷️ Tipo de OS / Orden:
            </div>
            <select
              value={filtroTipoOS}
              onChange={e => setFiltroTipoOS(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 8,
                border: `1px solid ${borderCol}`,
                background: isDark ? '#0f172a' : '#f8fafc',
                color: textInk,
                fontSize: 12.5,
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value="ALL">Todos los Tipos de OS</option>
              <option value="SUSPENSION">⚡ Suspensión (TO501 / TO504)</option>
              <option value="RECONEXION">🔄 Reconexión (TO502)</option>
              <option value="SE_MANTIENE">⏸️ Se Mantiene Suspendido (TO503 / TO506)</option>
              <option disabled>──────────────</option>
              <option value="TO501">TO501 - Suspensión Directa</option>
              <option value="TO502">TO502 - Reconexión</option>
              <option value="TO503">TO503 - Se Mantiene Suspendido</option>
              <option value="TO504">TO504 - Suspensión en Altura</option>
              <option value="TO506">TO506 - Verificación Suspensión</option>
            </select>
          </div>

          {/* Filtro Asignación / No Asignado */}
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: textMut, marginBottom: 4 }}>
              👤 Estado de Asignación:
            </div>
            <select
              value={filtroAsignacion}
              onChange={e => {
                setFiltroAsignacion(e.target.value as any);
                if (e.target.value === 'NO_ASIGNADO') setFiltroTecnico('ALL');
              }}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 8,
                border: `1px solid ${borderCol}`,
                background: isDark ? '#0f172a' : '#f8fafc',
                color: textInk,
                fontSize: 12.5,
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value="ALL">Todas las Órdenes (Asignadas y No Asignadas)</option>
              <option value="ASIGNADO">👤 Solo con Técnico Asignado</option>
              <option value="NO_ASIGNADO">⏳ Solo No Asignadas (Sin Técnico)</option>
            </select>
          </div>

          {/* Filtro por Técnico Específico */}
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: textMut, marginBottom: 4 }}>
              👷 Técnico Específico:
            </div>
            <select
              value={filtroTecnico}
              onChange={e => {
                setFiltroTecnico(e.target.value);
                if (e.target.value !== 'ALL') setFiltroAsignacion('ASIGNADO');
              }}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 8,
                border: `1px solid ${borderCol}`,
                background: isDark ? '#0f172a' : '#f8fafc',
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
            <div style={{ fontSize: 11.5, fontWeight: 700, color: textMut, marginBottom: 4 }}>
              📍 Municipio:
            </div>
            <select
              value={municipioFiltro}
              onChange={e => setMunicipioFiltro(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 8,
                border: `1px solid ${borderCol}`,
                background: isDark ? '#0f172a' : '#f8fafc',
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
            <span style={{ fontSize: 11.5, fontWeight: 700, color: textMut }}>PROYECTO:</span>
            <div style={{ display: 'inline-flex', background: isDark ? '#0f172a' : '#f1f5f9', padding: 2, borderRadius: 6 }}>
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

            <span style={{ fontSize: 11.5, fontWeight: 700, color: textMut, marginLeft: 8 }}>ZONA:</span>
            <div style={{ display: 'inline-flex', background: isDark ? '#0f172a' : '#f1f5f9', padding: 2, borderRadius: 6 }}>
              {['ALL', 'SUR', 'NORTE', 'CENTRO'].map(z => (
                <button
                  key={z}
                  onClick={() => setFilters({ zona: z })}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 5,
                    border: 'none',
                    background: (filters.zona || 'ALL') === z ? primaryCol : 'transparent',
                    color: (filters.zona || 'ALL') === z ? '#ffffff' : textMut,
                    fontWeight: 700,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {z === 'ALL' ? 'Todas' : z}
                </button>
              ))}
            </div>

            <span style={{ fontSize: 11.5, fontWeight: 700, color: textMut, marginLeft: 8 }}>MOSTRAR:</span>
            <div style={{ display: 'inline-flex', background: isDark ? '#0f172a' : '#f1f5f9', padding: 2, borderRadius: 6 }}>
              {[10, 15, 25, 50].map(n => (
                <button
                  key={n}
                  onClick={() => {
                    setTopCantidad(n);
                    setBarriosSeleccionados([]);
                  }}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 5,
                    border: 'none',
                    background: topCantidad === n && barriosSeleccionados.length === 0 ? primaryCol : 'transparent',
                    color: topCantidad === n && barriosSeleccionados.length === 0 ? '#ffffff' : textMut,
                    fontWeight: 700,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  Top {n}
                </button>
              ))}
            </div>
          </div>

          {/* Buscador de barrio */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="text"
              placeholder="🔍 Buscar barrio o municipio..."
              value={busquedaBarrio}
              onChange={e => setBusquedaBarrio(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${borderCol}`,
                background: isDark ? '#0f172a' : '#f8fafc',
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
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: `1px solid ${borderCol}`,
                  background: 'transparent',
                  color: '#ef4444',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                title="Limpiar filtros activos"
              >
                ✕ Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* TARJETAS KPI MULTIDIMENSIONALES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {/* Total Cargadas */}
        <div style={{ background: bgCard, borderRadius: 12, border: `1px solid ${borderCol}`, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 11.5, color: textMut, fontWeight: 700, textTransform: 'uppercase' }}>📦 Total Órdenes</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#6366f1', marginTop: 4 }}>
            {fmtN(kpis.total)}
          </div>
          <div style={{ fontSize: 11, color: textMut, marginTop: 4 }}>En {kpis.cantBarrios} barrios filtrados</div>
        </div>

        {/* Órdenes Asignadas */}
        <div style={{ background: bgCard, borderRadius: 12, border: `1px solid ${borderCol}`, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 11.5, color: textMut, fontWeight: 700, textTransform: 'uppercase' }}>🔵 Órdenes Asignadas</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: colorAsignadas, marginTop: 4 }}>
            {fmtN(kpis.totalAsignadas)}
          </div>
          <div style={{ fontSize: 11, color: textMut, marginTop: 4 }}>
            Tasa: <strong style={{ color: kpis.porcentajeAsignacion >= 50 ? '#16a34a' : '#d97706' }}>{kpis.porcentajeAsignacion}%</strong>
          </div>
        </div>

        {/* Órdenes Pendientes */}
        <div style={{ background: bgCard, borderRadius: 12, border: `1px solid ${borderCol}`, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 11.5, color: textMut, fontWeight: 700, textTransform: 'uppercase' }}>🟡 Órdenes Pendientes</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: colorPendientes, marginTop: 4 }}>
            {fmtN(kpis.totalPendientes)}
          </div>
          <div style={{ fontSize: 11, color: textMut, marginTop: 4 }}>Pendientes de asignación</div>
        </div>

        {/* Suspensión */}
        <div style={{ background: bgCard, borderRadius: 12, border: `1px solid ${borderCol}`, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 11.5, color: textMut, fontWeight: 700, textTransform: 'uppercase' }}>⚡ Suspensión</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: colorSuspension, marginTop: 4 }}>
            {fmtN(kpis.totalSuspension)}
          </div>
          <div style={{ fontSize: 11, color: textMut, marginTop: 4 }}>TO501 y TO504</div>
        </div>

        {/* Reconexión */}
        <div style={{ background: bgCard, borderRadius: 12, border: `1px solid ${borderCol}`, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 11.5, color: textMut, fontWeight: 700, textTransform: 'uppercase' }}>🔄 Reconexión</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: colorReconexion, marginTop: 4 }}>
            {fmtN(kpis.totalReconexion)}
          </div>
          <div style={{ fontSize: 11, color: textMut, marginTop: 4 }}>TO502</div>
        </div>

        {/* Se Mantiene Suspendido */}
        <div style={{ background: bgCard, borderRadius: 12, border: `1px solid ${borderCol}`, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 11.5, color: textMut, fontWeight: 700, textTransform: 'uppercase' }}>⏸️ Se Mantiene</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: colorSeMantiene, marginTop: 4 }}>
            {fmtN(kpis.totalSeMantiene)}
          </div>
          <div style={{ fontSize: 11, color: textMut, marginTop: 4 }}>TO503 y TO506</div>
        </div>

        {/* Técnicos con Asignación */}
        <div style={{ background: bgCard, borderRadius: 12, border: `1px solid ${borderCol}`, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 11.5, color: textMut, fontWeight: 700, textTransform: 'uppercase' }}>👷 Técnicos con Carga</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0ea5e9', marginTop: 4 }}>
            {kpis.totalTecnicosConCarga}
          </div>
          <div style={{ fontSize: 11, color: textMut, marginTop: 4 }}>Técnicos activos</div>
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
              {filtroModoGrafico === 'asig_vs_pend'
                ? '📊 Comparativa de Órdenes Asignadas vs Pendientes por Barrio'
                : filtroModoGrafico === 'todas'
                ? '📦 Volumen Total de Órdenes Cargadas por Barrio'
                : filtroModoGrafico === 'solo_asignadas'
                ? '🔵 Órdenes Asignadas a Brigadas por Barrio'
                : filtroModoGrafico === 'solo_pendientes'
                ? '🟡 Órdenes Pendientes de Despacho por Barrio'
                : '⚡ Desglose por Tipo de OS: Suspensión vs Reconexión vs Se Mantiene por Barrio'}
            </div>
            <div style={{ fontSize: 12.5, color: textMut, marginTop: 3 }}>
              {filtroTecnico !== 'ALL'
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
                background: isDark ? '#0f172a' : '#f8fafc',
                color: textInk,
                fontSize: 11.5,
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value="pendientes">Pendientes (Mayor a Menor)</option>
              <option value="asignadas">Asignadas (Mayor a Menor)</option>
              <option value="total">Total Órdenes</option>
              <option value="suspension">Suspensión (TO501/504)</option>
              <option value="reconexion">Reconexión (TO502)</option>
              <option value="se_mantiene">Se Mantiene (TO503/506)</option>
            </select>
          </div>
        </div>

        {/* Canvas del Gráfico */}
        <div style={{ height: 380, width: '100%', position: 'relative' }}>
          {loading ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: textMut }}>
              ⏳ Cargando datos operativos...
            </div>
          ) : barriosParaGrafica.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: textMut }}>
              <div style={{ fontSize: 32 }}>🔍</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: textInk }}>No se encontraron órdenes para los filtros seleccionados</div>
            </div>
          ) : (
            <canvas ref={canvasRef} id="canvas-asignacion-barrios" />
          )}
        </div>
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
              <span>🎯 Metas de Órdenes y Cumplimiento por Zona y Brigada</span>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 12 }}>
          {/* Meta Total Cuota */}
          <div style={{ background: isDark ? '#0f172a' : '#f8fafc', borderRadius: 10, padding: '12px 14px', border: `1px solid ${borderCol}` }}>
            <div style={{ fontSize: 11, color: textMut, fontWeight: 700, textTransform: 'uppercase' }}>🎯 Meta de Órdenes</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#6366f1', marginTop: 4 }}>
              {fmtN(totalesMetas.metaTotal)}
            </div>
            <div style={{ fontSize: 11, color: textMut, marginTop: 2 }}>{totalesMetas.brigadas} brigadas activas</div>
          </div>

          {/* Órdenes Asignadas y % Cobertura */}
          <div style={{ background: isDark ? '#0f172a' : '#f8fafc', borderRadius: 10, padding: '12px 14px', border: `1px solid ${borderCol}` }}>
            <div style={{ fontSize: 11, color: textMut, fontWeight: 700, textTransform: 'uppercase' }}>📋 Órdenes Asignadas</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: colorAsignadas, marginTop: 4 }}>
              {fmtN(totalesMetas.asignadas)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: isDark ? '#334155' : '#e2e8f0', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, totalesMetas.pctAsignado)}%`, height: '100%', background: totalesMetas.pctAsignado >= 90 ? '#10b981' : totalesMetas.pctAsignado >= 70 ? '#f59e0b' : '#ef4444' }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, color: totalesMetas.pctAsignado >= 90 ? '#10b981' : totalesMetas.pctAsignado >= 70 ? '#f59e0b' : '#ef4444' }}>
                {totalesMetas.pctAsignado}%
              </span>
            </div>
          </div>

          {/* Órdenes Cumplidas / Ejecutadas */}
          <div style={{ background: isDark ? '#0f172a' : '#f8fafc', borderRadius: 10, padding: '12px 14px', border: `1px solid ${borderCol}` }}>
            <div style={{ fontSize: 11, color: textMut, fontWeight: 700, textTransform: 'uppercase' }}>✅ Cumplidas (Ejecutadas)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981', marginTop: 4 }}>
              {fmtN(totalesMetas.ejecutadas)}
            </div>
            <div style={{ fontSize: 11, color: textMut, marginTop: 2 }}>
              vs Asignadas: <strong style={{ color: '#10b981' }}>{totalesMetas.pctCumplidoVsAsignado}%</strong>
            </div>
          </div>

          {/* Cumplimiento vs Meta Global */}
          <div style={{ background: isDark ? '#0f172a' : '#f8fafc', borderRadius: 10, padding: '12px 14px', border: `1px solid ${borderCol}` }}>
            <div style={{ fontSize: 11, color: textMut, fontWeight: 700, textTransform: 'uppercase' }}>📈 Cumplimiento vs Meta</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: totalesMetas.pctCumplidoVsMeta >= 80 ? '#10b981' : totalesMetas.pctCumplidoVsMeta >= 40 ? '#f59e0b' : '#ef4444', marginTop: 4 }}>
              {totalesMetas.pctCumplidoVsMeta}%
            </div>
            <div style={{ fontSize: 11, color: textMut, marginTop: 2 }}>Avance de la cuota global</div>
          </div>

          {/* Brecha / Faltante */}
          <div style={{ background: isDark ? '#0f172a' : '#f8fafc', borderRadius: 10, padding: '12px 14px', border: `1px solid ${borderCol}` }}>
            <div style={{ fontSize: 11, color: textMut, fontWeight: 700, textTransform: 'uppercase' }}>⚠️ Faltante para Meta</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: totalesMetas.brecha > 0 ? '#f59e0b' : '#10b981', marginTop: 4 }}>
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
          background: isDark ? '#0f172a' : '#f8fafc',
          padding: '10px 14px',
          borderRadius: 8,
          border: `1px solid ${borderCol}`,
        }}>
          {/* Filtro Zona */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: textMut }}>ZONA:</span>
            <div style={{ display: 'inline-flex', background: isDark ? '#1e293b' : '#ffffff', padding: 2, borderRadius: 6, border: `1px solid ${borderCol}` }}>
              {['ALL', 'Norte', 'Centro', 'Sur'].map(z => (
                <button
                  key={z}
                  onClick={() => setFiltroMetaZona(z)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: 'none',
                    background: filtroMetaZona === z ? primaryCol : 'transparent',
                    color: filtroMetaZona === z ? '#ffffff' : textMut,
                    fontWeight: 700,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {z === 'ALL' ? 'Todas' : z}
                </button>
              ))}
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
                background: isDark ? '#1e293b' : '#ffffff',
                color: textInk,
                fontSize: 11.5,
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value="ALL">Todas las Brigadas</option>
              <option value="PESADA">Pesadas (SCR / Tipo Pesada)</option>
              <option value="LIVIANA">Livianas</option>
              <option value="CANASTA">Canasta</option>
              <option value="MINICANASTA">Minicanasta</option>
              <option value="MT">Pesada MT / Medida Especial</option>
              <option value="DISP">Disponibilidad</option>
              <option value="GESTOR">Gestor Integral Multi</option>
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
                background: isDark ? '#1e293b' : '#ffffff',
                color: textInk,
                fontSize: 11.5,
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value="ALL">Todos los Niveles</option>
              <option value="ALTA">🟢 Alta (≥ 90%)</option>
              <option value="MEDIA">🟡 Media (70% - 89%)</option>
              <option value="BAJA">🔴 Baja (&lt; 70%)</option>
            </select>
          </div>

          {/* Ordenamiento */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: textMut }}>Ordenar por:</span>
            <select
              value={ordenMetas}
              onChange={e => setOrdenMetas(e.target.value as any)}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: `1px solid ${borderCol}`,
                background: isDark ? '#1e293b' : '#ffffff',
                color: textInk,
                fontSize: 11.5,
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value="asignadas">Órdenes Asignadas (Mayor a Menor)</option>
              <option value="meta">Meta Total Cuota (Mayor a Menor)</option>
              <option value="cumplimiento_asig">% Cumplido vs Asignado (Mayor a Menor)</option>
              <option value="cumplimiento_meta">% Cumplido vs Meta (Mayor a Menor)</option>
            </select>

            {(filtroMetaZona !== 'ALL' || filtroMetaBrigada !== 'ALL' || filtroMetaCumplimiento !== 'ALL') && (
              <button
                onClick={() => {
                  setFiltroMetaZona('ALL');
                  setFiltroMetaBrigada('ALL');
                  setFiltroMetaCumplimiento('ALL');
                }}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: `1px solid ${borderCol}`,
                  background: 'transparent',
                  color: '#ef4444',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✕ Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Tabla de Metas por Zona y Brigada */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${borderCol}`, textAlign: 'left', color: textMut, fontWeight: 700 }}>
                <th style={{ padding: '10px 8px' }}>#</th>
                <th style={{ padding: '10px 10px' }}>Zona</th>
                <th style={{ padding: '10px 12px' }}>Tipo de Brigada</th>
                <th style={{ padding: '10px 10px', textAlign: 'center' }}>👥 Brigadas</th>
                <th style={{ padding: '10px 10px', textAlign: 'right' }}>🎯 Meta Unit.</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: '#6366f1' }}>🎯 Meta Cuota</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: colorAsignadas }}>📋 Asignadas</th>
                <th style={{ padding: '10px 14px', width: 170 }}>📊 % Asignado vs Meta</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981' }}>✅ Cumplidas</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>🚀 % Cumplido/Asig</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>📈 % Cumplido/Meta</th>
                <th style={{ padding: '10px 10px', textAlign: 'right' }}>⚠️ Faltante</th>
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
                  const semaforoColor = m.pctAsignado >= 90 ? '#10b981' : m.pctAsignado >= 70 ? '#f59e0b' : '#ef4444';
                  const semaforoLabel = m.pctAsignado >= 90 ? '🟢 Óptimo' : m.pctAsignado >= 70 ? '🟡 Alerta' : '🔴 Crítico';

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
                          color: m.zona.toUpperCase().includes('SUR') ? '#ef4444' : primaryCol,
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
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#6366f1' }}>
                        {fmtN(m.metaTotal)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: colorAsignadas }}>
                        {fmtN(m.asignadas)}
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, height: 7, borderRadius: 3.5, background: isDark ? '#334155' : '#e2e8f0', overflow: 'hidden' }}>
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
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#10b981' }}>
                        {fmtN(m.ejecutadas)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: m.pctCumplidoVsAsignado >= 50 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                          color: m.pctCumplidoVsAsignado >= 50 ? '#10b981' : '#f59e0b',
                          fontSize: 11,
                          fontWeight: 800,
                        }}>
                          {m.pctCumplidoVsAsignado}%
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: textMut }}>
                        {m.pctCumplidoVsMeta}%
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: m.brecha > 0 ? '#f59e0b' : '#10b981' }}>
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
                <tr style={{ borderTop: `2px solid ${borderCol}`, background: isDark ? '#0f172a' : '#f8fafc', fontWeight: 800 }}>
                  <td colSpan={3} style={{ padding: '10px 12px', color: textInk }}>TOTAL CONSOLIDADO</td>
                  <td style={{ padding: '10px 10px', textAlign: 'center' }}>{totalesMetas.brigadas}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: textMut }}>—</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6366f1' }}>{fmtN(totalesMetas.metaTotal)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: colorAsignadas }}>{fmtN(totalesMetas.asignadas)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 7, borderRadius: 3.5, background: isDark ? '#334155' : '#e2e8f0', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.min(100, totalesMetas.pctAsignado)}%`,
                          height: '100%',
                          background: totalesMetas.pctAsignado >= 90 ? '#10b981' : totalesMetas.pctAsignado >= 70 ? '#f59e0b' : '#ef4444',
                          borderRadius: 3.5,
                        }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 800, color: totalesMetas.pctAsignado >= 90 ? '#10b981' : totalesMetas.pctAsignado >= 70 ? '#f59e0b' : '#ef4444', minWidth: 42, textAlign: 'right' }}>
                        {totalesMetas.pctAsignado}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981' }}>{fmtN(totalesMetas.ejecutadas)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: '#10b981' }}>{totalesMetas.pctCumplidoVsAsignado}%</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: textMut }}>{totalesMetas.pctCumplidoVsMeta}%</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: totalesMetas.brecha > 0 ? '#f59e0b' : '#10b981' }}>
                    {totalesMetas.brecha > 0 ? fmtN(totalesMetas.brecha) : '—'}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                    {totalesMetas.pctAsignado >= 90 ? '🟢 Óptimo' : totalesMetas.pctAsignado >= 70 ? '🟡 Alerta' : '🔴 Crítico'}
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
              📋 Ranking de Barrios: Suspensión, Reconexión, Se Mantiene y Técnicos Asignados
            </div>
            <div style={{ fontSize: 12.5, color: textMut, marginTop: 2 }}>
              Visualiza el desglose exacto de tipos de OS y haz clic en los técnicos para ver su asignación individual.
            </div>
          </div>

          <div style={{ fontSize: 12, color: textMut }}>
            Mostrando <strong>{rankingBarrios.length}</strong> barrios encontrados
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${borderCol}`, textAlign: 'left', color: textMut, fontWeight: 700 }}>
                <th style={{ padding: '10px 10px' }}>#</th>
                <th style={{ padding: '10px 12px' }}>Barrio</th>
                <th style={{ padding: '10px 10px' }}>Municipio</th>
                <th style={{ padding: '10px 8px' }}>Zona</th>
                <th style={{ padding: '10px 10px', textAlign: 'right', color: colorPendientes }}>🟡 Pendientes</th>
                <th style={{ padding: '10px 10px', textAlign: 'right', color: colorAsignadas }}>🔵 Asignadas</th>
                <th style={{ padding: '10px 10px', textAlign: 'right', color: colorSuspension }}>⚡ Suspensión</th>
                <th style={{ padding: '10px 10px', textAlign: 'right', color: colorReconexion }}>🔄 Reconexión</th>
                <th style={{ padding: '10px 10px', textAlign: 'right', color: colorSeMantiene }}>⏸️ Se Mantiene</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Total Carga</th>
                <th style={{ padding: '10px 12px' }}>👷 Técnicos Asignados</th>
                <th style={{ padding: '10px 10px', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rankingBarrios.slice(0, 40).map((b, idx) => {
                const esGraficado = barriosParaGrafica.some(bg => bg.barrio === b.barrio);
                return (
                  <tr
                    key={`${b.barrio}__${b.municipio}`}
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
                        }}>
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
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: colorSeMantiene, fontWeight: 600 }}>
                      {fmtN(b.seMantiene)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: textInk, fontSize: 13 }}>
                      {fmtN(b.total)}
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
                              background: isDark ? '#1e3a5f' : '#e0f2fe',
                              color: '#0284c7',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            title="Ver listado completo de técnicos asignados a este barrio"
                          >
                            <span>👷 {b.tecnicos.length} {b.tecnicos.length === 1 ? 'técnico' : 'técnicos'}</span>
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
                        🔍 Ver Órdenes
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
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
          padding: 20,
        }}>
          <div style={{
            background: bgCard,
            borderRadius: 14,
            border: `1px solid ${borderCol}`,
            width: '95%',
            maxWidth: 680,
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${borderCol}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: textInk }}>
                  👷 Técnicos Asignados en {modalTecnicosBarrio.barrio}
                </div>
                <div style={{ fontSize: 12, color: textMut, marginTop: 2 }}>
                  Desglose de órdenes asignadas por brigada/técnico en este barrio
                </div>
              </div>
              <button
                onClick={() => setModalTecnicosBarrio(null)}
                style={{ background: 'transparent', border: 'none', fontSize: 20, color: textMut, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${borderCol}`, textAlign: 'left', color: textMut }}>
                    <th style={{ padding: '8px 10px' }}>Técnico</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', color: colorSuspension }}>⚡ Suspensión</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', color: colorReconexion }}>🔄 Reconexión</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', color: colorSeMantiene }}>⏸️ Se Mantiene</th>
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
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: colorSeMantiene }}>{t.seMantiene}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: colorAsignadas }}>{t.total}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <button
                          onClick={() => {
                            setFiltroTecnico(t.tecnico);
                            setModalTecnicosBarrio(null);
                          }}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 4,
                            border: `1px solid ${borderCol}`,
                            background: 'transparent',
                            color: primaryCol,
                            fontSize: 11,
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

            <div style={{ padding: '12px 20px', borderTop: `1px solid ${borderCol}`, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setModalTecnicosBarrio(null)}
                style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${borderCol}`, background: 'transparent', color: textInk, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
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
          padding: 20,
        }}>
          <div style={{
            background: bgCard,
            borderRadius: 14,
            border: `1px solid ${borderCol}`,
            width: '95%',
            maxWidth: 1150,
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
          }}>
            <div style={{
              padding: '16px 22px',
              borderBottom: `1px solid ${borderCol}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: textInk }}>
                  📑 Detalle Individual de Órdenes (analitica.v_ordenes_dia)
                </div>
                <div style={{ fontSize: 12.5, color: textMut, marginTop: 2 }}>
                  {barrioModal ? `Filtrado por Barrio: ${barrioModal}` : 'Listado general de órdenes del día operativo'}
                  {filtroTipoOS !== 'ALL' && ` • Filtro OS: ${filtroTipoOS}`}
                  {filtroTecnico !== 'ALL' && ` • Técnico: ${filtroTecnico}`}
                </div>
              </div>
              <button
                onClick={() => setModalDetalleOpen(false)}
                style={{ background: 'transparent', border: 'none', fontSize: 22, color: textMut, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '18px 22px', overflowY: 'auto', flex: 1 }}>
              {loadingDetalle ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: textMut, fontSize: 14 }}>
                  ⏳ Cargando órdenes desde analitica.v_ordenes_dia...
                </div>
              ) : ordenesDetalle.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: textMut, fontSize: 14 }}>
                  No se encontraron órdenes para este filtro.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${borderCol}`, textAlign: 'left', color: textMut }}>
                        <th style={{ padding: '8px 10px' }}>Orden</th>
                        <th style={{ padding: '8px 10px' }}>NIC</th>
                        <th style={{ padding: '8px 10px' }}>Tipo OS</th>
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
                                background: cat === 'Suspensión' ? 'rgba(239, 68, 68, 0.15)' : cat === 'Reconexión' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(139, 92, 246, 0.15)',
                                color: cat === 'Suspensión' ? colorSuspension : cat === 'Reconexión' ? colorReconexion : colorSeMantiene,
                              }}>
                                {cat === 'Suspensión' ? '⚡ Suspensión' : cat === 'Reconexión' ? '🔄 Reconexión' : '⏸️ Se Mantiene'}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{
                                padding: '2px 7px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                background: ord.estado_legible === 'Asignada' ? '#0284c7'
                                  : ord.estado_legible === 'Pendiente' ? '#f59e0b'
                                  : ord.estado_legible === 'Ejecutada' ? '#16a34a'
                                  : '#64748b',
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
              padding: '12px 22px',
              borderTop: `1px solid ${borderCol}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 12, color: textMut }}>
                Mostrando hasta 600 registros ({ordenesDetalle.length} órdenes recuperadas)
              </span>
              <button
                onClick={() => setModalDetalleOpen(false)}
                style={{
                  padding: '6px 14px',
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
