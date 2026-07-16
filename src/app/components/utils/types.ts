export interface RawRecord {
  Fecha?: string;
  Zona?: string;
  Zona_Detalle?: string;
  Cedula?: string;
  Nombre?: string;
  Tipo_Cuadrilla?: string;
  Tipo_Brigada_Operaciones?: string;
  Visitas?: number | string;
  Efectivas?: number | string;
  Fallidas?: number | string;
  Perdidas?: number | string;
  Ingresos?: number | string;
  Valor_Real?: number | string;
  Ingresos_Gerencia?: number | string;
  Ingresos_Productividad?: number | string;
  Ingresos_Disponibilidad?: number | string;
  Meta_Facturacion?: number | string;
  Costo_Operativo?: number | string;
  Municipio?: string;
  Supervisor?: string;
  Contratista?: string;
  // normalized
  _Proyecto?: string;
  _Zona?: string;
  _ZonaDet?: string;
  [key: string]: unknown;
}

export interface CostoRecord {
  Mes?: string;
  Proyecto?: string;
  Zona?: string;
  Categoria?: string;
  CuentaMayor?: string;
  NombreCuenta?: string;
  Grupo?: string;
  Valor?: number | string;
  Tercero?: string;
  Proveedor?: string;
  NombreActivo?: string;
  Descripcion?: string;
  EsIngreso?: boolean | string;
  _Proyecto?: string;
  _Zona?: string;
  _ZonaDet?: string;
  [key: string]: unknown;
}

export interface EmpleadoRecord {
  Empleado?: string;
  Proyecto?: string;
  Zona?: string;
  Mes?: string;
  EnBrigadas?: string;
  CedulaBrigada?: string;
  Valor_Total?: number | string;
  [key: string]: unknown;
}

export interface OrdenDetalle {
  Orden?: string;
  Fecha?: string;
  Nombre?: string;
  Zona?: string;
  Municipio?: string;
  Accion?: string;
  Subaccion?: string;
  Estado?: string;
  Valor?: number | string;
  Motivo_No_Reconocimiento?: string;
  Cubierta_Fact?: string;
  Tipo_Cuadrilla?: string;
  _Proyecto?: string;
  _Zona?: string;
  _ZonaDet?: string;
  [key: string]: unknown;
}

export interface RawData {
  raw: RawRecord[];
  costos: CostoRecord[];
  emps: EmpleadoRecord[];
  det: OrdenDetalle[];
}

export interface Filters {
  proy: string;
  zona: string;
  /** Meses seleccionados (multi-selección). Array vacío = todos los meses. */
  mes: string[];
  fecha: string;
}

export interface OtcAgg {
  ingresos: number;
  costos: number;
  utilidad: number;
  margen: number | null;
}

export interface SipAgg {
  prod: number;
  ordenes: number;
  tecnicos: number;
}