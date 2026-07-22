export interface RawRecord {
  Fecha?: string;
  Zona?: string;
  Zona_Detalle?: string;
  Cedula?: string;
  Nombre?: string;
  Tipo_Cuadrilla?: string;
  Visitas?: number | string;
  Efectivas?: number | string;
  Fallidas?: number | string;
  Perdidas?: number | string;
  Ingresos?: number | string;
  Meta_Facturacion?: number | string;
  Municipio?: string;
  Supervisor?: string;
  Fallida_Con_Pago?: number | string;
  Fallida_Sin_Pago?: number | string;
  Suspensiones?: number | string;
  Se_Mantiene?: number | string;
  ORD_SUSPENSION?: number | string;
  ORD_REVISION_SUSP?: number | string;
  ORD_RECONEXION?: number | string;
  Tipo_Brigada_Mes?: string;
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
  _Proyecto?: string;
  _Zona?: string;
  _ZonaDet?: string;
  [key: string]: unknown;
}

export interface EmpleadoRecord {
  Empleado?: string;
  Proyecto?: string;
  Zona?: string;
  EnBrigadas?: string;
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

export interface MesRecord {
  Mes_YM?: string;
  Cedula?: string;
  Tecnico?: string;
  Tipo_Brigada_Mes?: string;
  Ordenes?: number | string;
  Efectivas?: number | string;
  Fallidas?: number | string;
  Perdidas?: number | string;
  Visitas?: number | string;
  Ingresos_COP?: number | string;
  Cantidad_NIC?: number | string;
  Total_Suspension?: number | string;
  Total_Mantiene_Susp?: number | string;
  Total_Reconexion?: number | string;
  Total_Pagos?: number | string;
  Total_Imposibilidades?: number | string;
  Total_Resistencia?: number | string;
  Total_PQR?: number | string;
  Dias_Laborados?: number | string;
  Eficacia?: number | string;
  [key: string]: unknown;
}

export interface DispDiariaRecord {
  Fecha?: string;
  Tipo_Brigada?: string;
  Zona?: string;
  BrigadasActivas?: number | string;
  _Proyecto?: string;
  _Zona?: string;
  _ZonaDet?: string;
  [key: string]: unknown;
}

export interface EvolutivoRecord {
  Mes: string;
  TipoBrigada: string;
  Cantidad_NIC: number;
  Total_Ordenes: number;
  Total_Suspension: number;
  Total_Mantiene_Susp: number;
  Total_Reconexion: number;
  Total_Pagos: number;
  Total_Imposibilidades: number;
  Total_Resistencia: number;
  Total_PQR: number;
  Eficacia: number;
  [key: string]: unknown;
}

export interface RawData {
  raw: RawRecord[];
  costos: CostoRecord[];
  emps: EmpleadoRecord[];
  det: OrdenDetalle[];
  mes: MesRecord[];
  disp: DispDiariaRecord[];
  evolutivo: EvolutivoRecord[];
}

export interface Filters {
  proy: string;
  zona: string;
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