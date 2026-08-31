-- ===================================================================
-- schema.sql — ESTRUCTURA de la base de datos del dashboard SCRC.
-- Generado por introspección. Contiene SOLO la estructura (0 filas de datos).
-- Ejecutar en TU propia base de datos de desarrollo (ver SETUP.md).
-- ===================================================================

CREATE SCHEMA IF NOT EXISTS dbanalitica;

DROP TABLE IF EXISTS dbanalitica.maestro_brigadas CASCADE;
CREATE TABLE dbanalitica.maestro_brigadas (
  "Fecha" text,
  "PLACA" text,
  "Cedula" text,
  "Tecnico" text,
  "Supervisor" text,
  "Tipo Brigada" text,
  "CORDINADOR" text,
  "Zona" text
);

DROP TABLE IF EXISTS dbanalitica.maestro_metas CASCADE;
CREATE TABLE dbanalitica.maestro_metas (
  "Tipo_Brigada" text,
  "Costo" bigint,
  "Zona" text
);

DROP TABLE IF EXISTS dbanalitica.historico_otc CASCADE;
CREATE TABLE dbanalitica.historico_otc (
  "id" bigint NOT NULL,
  "run_id" uuid,
  "mes_ym" varchar(7),
  "fecha_corte" date,
  "proyecto" varchar(100),
  "zona" varchar(100),
  "grupo" varchar(100),
  "categoria" varchar(100),
  "cuenta_mayor" varchar(100),
  "nombre_cuenta" varchar(200),
  "tercero" varchar(200),
  "nombre_activo" varchar(200),
  "es_ingreso" boolean,
  "valor" numeric,
  "fecha_carga" timestamp,
  "empleado_otc" text,
  "cedula_empleado" text,
  "tecnico_homologado" text,
  "brigada_homologada" text
);

DROP TABLE IF EXISTS dbanalitica.historico_mo CASCADE;
CREATE TABLE dbanalitica.historico_mo (
  "id" bigint NOT NULL,
  "region" text,
  "fecha_corte" date,
  "archivo_origen" text,
  "fecha_carga" timestamp,
  "nic" text,
  "orden" text,
  "contrata" text,
  "territorio" text,
  "zona" text,
  "municipio" text,
  "corregimiento" text,
  "localidad_barrio" text,
  "tarifa" text,
  "direccion" text,
  "id_transformador" text,
  "id_circuito" text,
  "num_medidor" text,
  "marca_medidor" text,
  "deuda_act" numeric,
  "deuda_cierre" numeric,
  "cant_factura_act" integer,
  "cant_factura_cierre" integer,
  "tipo_os" text,
  "descripcion_de_tipo_os" text,
  "tipo_suspension_solicitada" text,
  "tipo_brigada" text,
  "id_tecnico" text,
  "tecnico" text,
  "av_resultado" text,
  "accion" text,
  "subaccion_subanomalia" text,
  "fecha_osf" date,
  "estado_osf" text,
  "estado_siprem" text,
  "fecha_ingreso_siprem" date,
  "fecha_asig_aliado" date,
  "hora_asig_aliado" time without time zone,
  "fecha_asig_tecnico" date,
  "fecha_cierre" date,
  "hora_inicio" time without time zone,
  "hora_fin" time without time zone,
  "fecha_sincronizacion" date,
  "hora_sincronizacion" time without time zone,
  "observacion" text,
  "caracterizacion_del_predio" text,
  "gps" text,
  "link_acta" text,
  "obs_fecha" text,
  "obs_acta" text,
  "obs_tecnico" text,
  "obs_predio" text,
  "obs_atendio" text,
  "obs_lectura" text,
  "obs_ss" text,
  "obs_ri" text,
  "obs_pas_comentario" text,
  "obs_medidor" text,
  "tl_estandarizado" text,
  "obs_combinada" text,
  "categoria_obs" text,
  "zona_maestro" text,
  "tipo_actividad" text,
  "actividad" text,
  "sello_instalado" text,
  "sello_retirado" text,
  "vehiculo" text,
  "brigada_homologada" text,
  "estado_norm" text,
  "valor_orden" numeric,
  "subaccion_homologada" text
);

