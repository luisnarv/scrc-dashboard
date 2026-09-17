import { query } from '../app/lib/db';


// Formas de fila que devuelve `pg` en cada consulta. Los agregados (COUNT/SUM)
// llegan como string, por eso el mapeo los envuelve en Number().
interface RawRowV2 {
  Fecha: string | null;
  cedula: string | null;
  Nombre: string | null;
  Tipo_Brigada_Operaciones: string | null;
  Tipo_Brigada_Mes: string | null;
  zona: string | null;
  Visitas: string;
  Efectivas: string;
  Fallidas: string;
  Perdidas: string;
  Fallida_Con_Pago: string;
  Fallida_Sin_Pago: string;
  Ingresos: string;
  Ingresos_Base: string;
  Meta_Facturacion: string;
  Perdidas_COP: string;
  Costo_Operativo: string;
  Asignacion: string;
  valor_fact_base: string;
}

interface CostoRowV2 {
  Mes: string | null;
  Zona: string | null;
  Proyecto: string | null;
  Brigada: string | null;
  Categoria: string | null;
  es_ingreso: boolean | null;
  Valor: string;
}

interface EmpRowV2 {
  Empleado: string | null;
  Valor_Total: string;
  EnBrigadas: boolean | null;
}

// Homologación de tipo de brigada — réplica EXACTA de homologar_brigada_dinamica
// La homologación de brigada (Prueba_etl_validation.py §3.A) ahora vive en la
// columna precalculada historico_mo.brigada_homologada (se computa en la ingesta,
// ver prototipo_etl/ingesta_bd.py::recomputar_columnas). El dashboard solo la LEE.

// ═══════════════════════════════════════════════════════════════════════════
// META DIARIA — FUENTE ÚNICA DE VERDAD (leer esto primero)
// ═══════════════════════════════════════════════════════════════════════════
// La "meta del día" de cada orden se calcula EXCLUSIVAMENTE con META_DIARIA_SQL.
// Todo el dashboard (Operativo, Gerencial, Estratégico, Informes, home) consume
// el campo Meta_Facturacion que sale de aquí — NO se recalcula en ningún otro lado.
//
//   • ZONA SUR (acordado) → meta FIJA para Pesada y Liviana:
//       Pesada  : Lun-Vie $650.000 · Sábado $425.000
//       Liviana : Lun-Vie $380.000 · Sábado $310.000   (domingo = valor Lun-Vie)
//   • NORTE/CENTRO:
//       - Costos mensuales actualizados a partir de Junio 2026 (Liviana $6.683.910, Pesada $16.267.057, etc.)
//       - Antes de Septiembre 2026: jornada 46h (8h L-V, 6h Sáb, divisor 184h)
//       - Desde Septiembre 2026: jornada 44h (8h L-J, 7h Vie, 5h Sáb, divisor 176h)
//   • Disponibles (MT-AT/Minicanasta/Canasta/Gestor/Pesada Disponible) → Costo/24
const META_SUR = {
  pesada:  { semana: 650_000, sabado: 425_000 },
  liviana: { semana: 380_000, sabado: 310_000 },
} as const;

const COSTO_MENSUAL_NC_SQL = `(CASE 
  WHEN mo.fecha_cierre >= '2026-06-01' AND UPPER(COALESCE(mo.zona,'')) NOT LIKE '%SUR%' THEN
    CASE mo.brigada_homologada
      WHEN 'Brigada Liviana'         THEN 6183910.20
      WHEN 'Gestor Integral Multi'   THEN 8576399.37
      WHEN 'Brigada Minicanasta'     THEN 56697622.89
      WHEN 'Brigada Pesada'          THEN 15267057.00
      WHEN '(D) Brigada Pesada'      THEN 15267057.00
      WHEN 'Brigada Pesada MT-AT'    THEN 24673468.63
      WHEN 'Pesada Disponible'       THEN 24673468.63
      WHEN 'Brigada Canasta'         THEN 72631786.33
      ELSE COALESCE(mm.costo, 0)
    END
  ELSE COALESCE(mm.costo, 0)
END)`;

const META_DIARIA_SQL = `MAX(CASE
          -- ZONA SUR (Valores fijos Pesada y Liviana)
          WHEN UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%' AND mo.brigada_homologada = 'Brigada Pesada'
            THEN (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN ${META_SUR.pesada.sabado} ELSE ${META_SUR.pesada.semana} END)
          WHEN UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%' AND mo.brigada_homologada = 'Brigada Liviana'
            THEN (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN ${META_SUR.liviana.sabado} ELSE ${META_SUR.liviana.semana} END)

          -- ZONA NORTE Y CENTRO: DESDE SEPTIEMBRE 2026 (Valores exactos con nueva jornada 44h)
          WHEN mo.fecha_cierre >= '2026-09-01' AND UPPER(COALESCE(mo.zona,'')) NOT LIKE '%SUR%' THEN
            CASE mo.brigada_homologada
              WHEN 'Brigada Liviana' THEN
                (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 175679.27
                      WHEN EXTRACT(DOW FROM mo.fecha_cierre)=5 THEN 245950.97
                      ELSE 281086.83 END)
              WHEN 'Brigada Pesada' THEN
                (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 433723.21
                      WHEN EXTRACT(DOW FROM mo.fecha_cierre)=5 THEN 607212.49
                      ELSE 693957.14 END)
              WHEN '(D) Brigada Pesada' THEN
                (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 433723.21
                      WHEN EXTRACT(DOW FROM mo.fecha_cierre)=5 THEN 607212.49
                      ELSE 693957.14 END)
              WHEN 'Gestor Integral Multi' THEN 357349.97
              WHEN 'Brigada Minicanasta' THEN 2362400.95
              WHEN 'Brigada Pesada MT-AT' THEN 1028061.19
              WHEN 'Pesada Disponible' THEN
                (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=0 THEN 1387882.61 ELSE 1028061.19 END)
              WHEN 'Brigada Canasta' THEN 3026324.43
              ELSE ${COSTO_MENSUAL_NC_SQL} / 24.0
            END

          -- ZONA NORTE Y CENTRO: ANTES DE SEPTIEMBRE 2026
          WHEN mo.brigada_homologada IN ('Brigada Pesada','(D) Brigada Pesada','Brigada Liviana')
            THEN (${COSTO_MENSUAL_NC_SQL} / 184.0) * (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 6 ELSE 8 END)
          ELSE ${COSTO_MENSUAL_NC_SQL} / 24.0
        END)`;

// Limpieza y normalización de cédula/id_tecnico: quita decimales (.0), puntos de miles y cualquier carácter no numérico
const SQL_CLEAN_MO_ID = "REGEXP_REPLACE(REGEXP_REPLACE(TRIM(mo.id_tecnico), '\\.0+$', ''), '\\D', '', 'g')";
const SQL_CLEAN_MB_CED = "REGEXP_REPLACE(REGEXP_REPLACE(TRIM(mb.\"Cedula\"), '\\.0+$', ''), '\\D', '', 'g')";

export async function getDashboardDataV2(mes?: string) {
  const params: unknown[] = [];
  const activo = !!(mes && mes !== 'ALL');
  if (activo) params.push(mes);

  // Excluye técnicos "de prueba" del OSF/SIPREM (p.ej. 'TECNICO PRUEBA ATL NORTE',
  // cédula 2837855461): son órdenes dummy de conectividad, no brigadas reales, y
  // se cuelan de vez en cuando en el export inflando la producción del mes.
  // tiene_vs se precalcula en el ETL (recomputar_columnas) a partir del mismo regex
  // 'v\s*s\s*:' -- evita evaluar el regex por fila en cada consulta del dashboard.
  const baseMoCond = "mo.id_tecnico IS NOT NULL AND mo.tiene_vs AND UPPER(COALESCE(mo.tecnico,'')) NOT LIKE '%PRUEBA%'";
  // Rango sargable sobre fecha_cierre (en vez de to_char(fecha_cierre,'YYYY-MM') = $1):
  // envolver la columna en una función impide que Postgres use idx_mo_fecha_cierre y
  // fuerza un sequential scan completo. Con el rango, el índice sí se puede usar.
  const fechaCond = activo
    ? `WHERE mo.fecha_cierre >= ($1 || '-01')::date AND mo.fecha_cierre < ($1 || '-01')::date + interval '1 month' AND ${baseMoCond}`
    : `WHERE ${baseMoCond}`;
  const mesymCond = activo ? 'WHERE mes_ym = $1' : '';
  // OTC del dashboard = SOLO proyectos SCR ('SCR Sur' / 'SCR Norte - Centro'), que son
  // exactamente las filas con zona derivada (zona IS NOT NULL). Los demás proyectos del
  // OTC (ELECTROHUILA, AIRE, AFINIA, AGUA…) NO pertenecen a este dashboard y se excluyen.
  const otcWhere = activo
    ? "WHERE mes_ym = $1 AND zona IS NOT NULL"
    : "WHERE zona IS NOT NULL";

  try {
    const rawRes = await query(`
      SELECT 
        mo.fecha_cierre::text as "Fecha", 
        ${SQL_CLEAN_MO_ID} as cedula, 
        MAX(mo.tecnico) as "Nombre", 
        MAX(mo.brigada_homologada) as "Tipo_Brigada_Operaciones",
        MAX(mo.brigada_homologada) as "Tipo_Brigada_Mes",
        MAX(to_char(mo.fecha_cierre, 'YYYY-MM')) as "mes_ym",
        MAX(mo.zona) as "zona",
        MAX(mb."Supervisor") as "supervisor",
        SUM(CASE WHEN mo.estado_norm = 'Efectiva' THEN 1 ELSE 0 END) as "Efectivas",
        SUM(CASE WHEN mo.estado_norm = 'Fallida' THEN 1 ELSE 0 END) as "Fallidas",
        SUM(CASE WHEN mo.estado_norm = 'Perdida' THEN 1 ELSE 0 END) as "Perdidas",
        SUM(CASE WHEN mo.estado_norm = 'Fallida' AND COALESCE(mo.valor_orden,0) > 0 THEN 1 ELSE 0 END) as "Fallida_Con_Pago",
        SUM(CASE WHEN mo.estado_norm = 'Fallida' AND COALESCE(mo.valor_orden,0) = 0 THEN 1 ELSE 0 END) as "Fallida_Sin_Pago",
        COUNT(*) as "Visitas",

        -- Producción valorizada HÍBRIDA con PRORRATEO (réplica del "valor fact" del manual):
        --  · Resto (Pesada, Liviana, (D) Pesada) -> suma real de Efectivas + Fallidas con pago
        --    (valor_orden x 1.1300192, incremento del Excel de productividad)
        --  · Pesada Disponible -> meta fija (sin prorrateo)
        --  · MT-AT / Minicanasta / Canasta -> meta x min(1, Total_Visita / (11 día | 8 sábado))
        --  · Gestor -> meta x min(1, (Efectivas + Fallida_con_pago) / (18 día | 13 sábado))
        (CASE
          WHEN MAX(mo.brigada_homologada) = 'Pesada Disponible'
            THEN MAX(COALESCE(mm.costo,0)/24.0) * 1.1300192
          WHEN MAX(mo.brigada_homologada) IN ('Brigada Pesada MT-AT','Brigada Minicanasta','Brigada Canasta')
            THEN MAX(COALESCE(mm.costo,0)/24.0) * LEAST(1.0, SUM(CASE WHEN COALESCE(mo.accion,'') <> 'SIN GESTION' THEN 1 ELSE 0 END)::numeric / (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 8 ELSE 11 END)) * 1.1300192
          WHEN MAX(mo.brigada_homologada) = 'Gestor Integral Multi'
            THEN MAX(COALESCE(mm.costo,0)/24.0) * LEAST(1.0, (
              SUM(CASE WHEN mo.estado_norm='Efectiva' THEN 1 ELSE 0 END) 
              + SUM(CASE WHEN UPPER(mo.subaccion_homologada) LIKE '%CLIENTE HA CANCELADO%' THEN 1 ELSE 0 END)
            )::numeric / (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 13 ELSE 18 END)) * 1.1300192
          ELSE SUM(
            CASE 
              -- Penalización por mano de obra errada (subacciones no permitidas en Pesadas - Matriz UTIL / Descuento NC):
              WHEN mo.brigada_homologada IN ('Brigada Pesada', '(D) Brigada Pesada') AND (
                UPPER(COALESCE(mo.subaccion_subanomalia,'')) LIKE '%CANASTA%' 
                OR UPPER(COALESCE(mo.subaccion_subanomalia,'')) LIKE '%OTRAS TECNOLOG%'
                OR UPPER(COALESCE(mo.subaccion_subanomalia,'')) LIKE '%MEDIA TENSI%'
              ) THEN 0
              -- Zona SUR: maestro_tarifas ya guarda el valor FINAL (sin capa
              -- base×incremento como Norte-Centro) -- no se multiplica otra vez.
              WHEN (mo.estado_norm = 'Efectiva' OR (mo.estado_norm = 'Fallida' AND COALESCE(mo.valor_orden,0) > 0))
                AND UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%'
                THEN COALESCE(mo.valor_orden,0)
              WHEN mo.estado_norm = 'Efectiva' OR (mo.estado_norm = 'Fallida' AND COALESCE(mo.valor_orden,0) > 0)
                THEN COALESCE(mo.valor_orden,0) * 1.1300192
              ELSE 0
            END
          )
        END) as "Ingresos",

        -- Igual a "Ingresos" pero SIN el ajuste de incremento (×1.1300192) en
        -- Pesada/Liviana/(D)Pesada. Las disponibles (meta×prorrateo) no llevan incremento.
        (CASE
          WHEN MAX(mo.brigada_homologada) = 'Pesada Disponible'
            THEN MAX(COALESCE(mm.costo,0)/24.0)
          WHEN MAX(mo.brigada_homologada) IN ('Brigada Pesada MT-AT','Brigada Minicanasta','Brigada Canasta')
            THEN MAX(COALESCE(mm.costo,0)/24.0) * LEAST(1.0, SUM(CASE WHEN COALESCE(mo.accion,'') <> 'SIN GESTION' THEN 1 ELSE 0 END)::numeric / (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 8 ELSE 11 END))
          WHEN MAX(mo.brigada_homologada) = 'Gestor Integral Multi'
            THEN MAX(COALESCE(mm.costo,0)/24.0) * LEAST(1.0, (
              SUM(CASE WHEN mo.estado_norm='Efectiva' THEN 1 ELSE 0 END) 
              + SUM(CASE WHEN UPPER(mo.subaccion_homologada) LIKE '%CLIENTE HA CANCELADO%' THEN 1 ELSE 0 END)
            )::numeric / (CASE WHEN EXTRACT(DOW FROM mo.fecha_cierre)=6 THEN 13 ELSE 18 END))
          ELSE SUM(
            CASE 
              -- Penalización por mano de obra errada (subacciones no permitidas en Pesadas - Matriz UTIL / Descuento NC):
              WHEN mo.brigada_homologada IN ('Brigada Pesada', '(D) Brigada Pesada') AND (
                UPPER(COALESCE(mo.subaccion_subanomalia,'')) LIKE '%CANASTA%' 
                OR UPPER(COALESCE(mo.subaccion_subanomalia,'')) LIKE '%OTRAS TECNOLOG%'
                OR UPPER(COALESCE(mo.subaccion_subanomalia,'')) LIKE '%MEDIA TENSI%'
              ) THEN 0
              WHEN mo.estado_norm = 'Efectiva' OR (mo.estado_norm = 'Fallida' AND COALESCE(mo.valor_orden,0) > 0) 
                THEN COALESCE(mo.valor_orden,0) 
              ELSE 0 
            END
          )
        END) as "Ingresos_Base",

        -- Meta de facturación diaria. Definición ÚNICA en META_DIARIA_SQL (ver arriba):
        -- Sur = meta fija Pesada/Liviana; resto = Costo/184; disponibles = Costo/24.
        ${META_DIARIA_SQL} as "Meta_Facturacion",
        SUM(COALESCE(mo.valor_orden,0)) as "valor_fact_base",
        0 as "valor_produccion",
        0 as "margen_neto",
        -- "Total asignado" = efectivas + fallidas + perdidas (trabajo real recibido)
        (SUM(CASE WHEN mo.estado_norm = 'Efectiva' THEN 1 ELSE 0 END)
         + SUM(CASE WHEN mo.estado_norm = 'Fallida' THEN 1 ELSE 0 END)
         + SUM(CASE WHEN mo.estado_norm = 'Perdida' THEN 1 ELSE 0 END)) as "Asignacion",
        SUM(CASE WHEN mo.estado_norm = 'Perdida' THEN COALESCE(mo.valor_orden,0) ELSE 0 END) as "Perdidas_COP",
        0 as "Costo_Operativo"
      FROM dbanalitica.historico_mo mo
      LEFT JOIN dbanalitica.maestro_brigadas mb
        ON ${SQL_CLEAN_MO_ID} = ${SQL_CLEAN_MB_CED}
        AND (
          mb."Fecha" IS NULL
          OR to_char(mo.fecha_cierre, 'YYYY-MM') = left(mb."Fecha"::text, 7)
        )
      -- Costo mensual por brigada (maestro_metas), mapeando el nombre del maestro
      -- (seguimiento) al nombre homologado de historico_mo. Costo igual en ambas zonas.
      LEFT JOIN (
        SELECT (CASE "Tipo_Brigada"
                  WHEN 'Brigada Tipo Pesada'      THEN 'Brigada Pesada'
                  WHEN '(D) Brigada Tipo Pesada'  THEN '(D) Brigada Pesada'
                  WHEN 'Brigada Tipo Liviana'     THEN 'Brigada Liviana'
                  WHEN 'Brigada Pesada/ MT AT'    THEN 'Brigada Pesada MT-AT'
                  WHEN 'Brigada Tipo Minicanasta' THEN 'Brigada Minicanasta'
                  WHEN 'Brigada Tipo Canasta'     THEN 'Brigada Canasta'
                  ELSE "Tipo_Brigada" END) AS brig,
               MAX("Costo"::numeric) AS costo
        FROM dbanalitica.maestro_metas
        GROUP BY 1
      ) mm ON mm.brig = mo.brigada_homologada
      ${fechaCond}
      -- Se agrupa TAMBIÉN por brigada_homologada: si un técnico tuvo órdenes de
      -- brigadas distintas el mismo día, cada brigada queda con SUS órdenes (el
      -- conteo "por día y tipo de brigada" cuadra). Los totales y el conteo de
      -- técnicos distintos (Set de Cédula en el front) no cambian.
      GROUP BY mo.fecha_cierre, ${SQL_CLEAN_MO_ID}, mo.brigada_homologada
    `, params);

    const cosRes = await query(`
      SELECT
        mes_ym as "Mes",
        zona as "Zona",
        proyecto as "Proyecto",
        -- Brigada del empleado (homologada). NULL en ingresos y costos no-personales.
        -- Permite que el filtro Proceso (Multifamiliar) restrinja el financiero.
        brigada_homologada as "Brigada",
        nombre_cuenta as "Categoria",
        es_ingreso,
        -- Los ingresos (cuentas clase 4, naturaleza CRÉDITO en el PUC) llegan en
        -- negativo desde contabilidad; se voltean a POSITIVO para el dashboard.
        -- Los costos (débito) se dejan tal cual.
        SUM(COALESCE(valor, 0) * (CASE WHEN es_ingreso THEN -1 ELSE 1 END)) as "Valor"
      FROM dbanalitica.historico_otc
      ${otcWhere}
      GROUP BY mes_ym, zona, proyecto, brigada_homologada, nombre_cuenta, es_ingreso
    `, params);

    const rawRecords = rawRes.rows.map((r: RawRowV2) => ({
      Fecha: r.Fecha,
      Cedula: r.cedula,
      Nombre: r.Nombre,
      Tipo_Brigada_Operaciones: r.Tipo_Brigada_Operaciones,
      Tipo_Brigada_Mes: r.Tipo_Brigada_Mes,
      Zona: r.zona,
      Visitas: Number(r.Visitas),
      Efectivas: Number(r.Efectivas),
      Fallidas: Number(r.Fallidas),
      Perdidas: Number(r.Perdidas),
      Fallida_Con_Pago: Number(r.Fallida_Con_Pago),
      Fallida_Sin_Pago: Number(r.Fallida_Sin_Pago),
      Ingresos: Number(r.Ingresos),
      Ingresos_Base: Number(r.Ingresos_Base),
      Valor_Orden: Number(r.valor_fact_base),
      Meta_Facturacion: Number(r.Meta_Facturacion),
      Perdidas_COP: Number(r.Perdidas_COP),
      Costo_Operativo: Number(r.Costo_Operativo) || 0,
      Asignacion: Number(r.Asignacion) || 0
    }));

    const costosFinal = cosRes.rows.map((r: CostoRowV2) => ({
      Mes: r.Mes,
      Zona: r.Zona,
      Proyecto: r.Proyecto || '',   // 'SCR Sur' / 'SCR Norte - Centro'
      Brigada: r.Brigada || undefined,   // brigada del empleado (NULL en ingresos/costos no-personales)
      Categoria: r.Categoria,   // nombre_cuenta real (p.ej. 'INGRESOS POR INGENIERIA ELECTRICA')
      es_ingreso: r.es_ingreso ?? undefined,
      Valor: Number(r.Valor),
      Tercero: ''
    }));

    // Replicando las otras consultas requeridas para la compatibilidad (emps, mesRes, dispRes)
    // Asumiendo que tecnico_mes, costos_empleado y la disponibilidad se mantienen o se derivan igual.
    // costos_empleado es OPCIONAL: si la tabla no existe (hoy no está creada), emps
    // queda vacío en vez de tumbar toda la consulta. Los costos operativos van en 0.
    const _ceExiste = await query(`SELECT to_regclass('dbanalitica.costos_empleado') as t`);
    const empRows: EmpRowV2[] = _ceExiste.rows[0]?.t
      ? (await query(`
          SELECT mes_ym, empleado as "Empleado", valor_total as "Valor_Total", en_brigadas as "EnBrigadas", cedula_brigada as "Cedula"
          FROM dbanalitica.costos_empleado
          ${mesymCond}
        `, params)).rows
      : [];

    const emps = empRows.map((r: EmpRowV2) => ({
      Empleado: r.Empleado,
      Valor_Total: Number(r.Valor_Total),
      EnBrigadas: r.EnBrigadas ? 'SI' : 'NO'
    }));

      const mesRes = await query(`
        SELECT to_char(mo.fecha_cierre, 'YYYY-MM') as "Mes_YM", ${SQL_CLEAN_MO_ID} as "Cedula", MAX(mo.tecnico) as "Tecnico", MAX(mb."Supervisor") as "Supervisor",
               MAX(mo.contrata) as "Contratista", MAX(mo.vehiculo) as "Vehiculo",
               mo.brigada_homologada as "Tipo_Brigada_Mes", COUNT(*) as "Ordenes",
               SUM(CASE WHEN mo.estado_norm = 'Efectiva' THEN 1 ELSE 0 END) as "Efectivas", 
               SUM(CASE WHEN mo.estado_norm = 'Fallida' THEN 1 ELSE 0 END) as "Fallidas", 
               SUM(CASE WHEN mo.estado_norm = 'Perdida' THEN 1 ELSE 0 END) as "Perdidas", 
               COUNT(*) as "Visitas",
               SUM(
                 CASE 
                   WHEN mo.brigada_homologada IN ('Brigada Pesada', '(D) Brigada Pesada') AND (
                     UPPER(COALESCE(mo.subaccion_subanomalia,'')) LIKE '%CANASTA%' 
                     OR UPPER(COALESCE(mo.subaccion_subanomalia,'')) LIKE '%OTRAS TECNOLOG%'
                     OR UPPER(COALESCE(mo.subaccion_subanomalia,'')) LIKE '%MEDIA TENSI%'
                   ) THEN 0
                   WHEN (mo.estado_norm = 'Efectiva' OR (mo.estado_norm = 'Fallida' AND COALESCE(mo.valor_orden,0) > 0))
                     AND UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%'
                     THEN COALESCE(mo.valor_orden,0)
                   WHEN mo.estado_norm = 'Efectiva' OR (mo.estado_norm = 'Fallida' AND COALESCE(mo.valor_orden,0) > 0)
                     THEN COALESCE(mo.valor_orden,0) * 1.1300192
                   ELSE 0
                 END
               ) as "Ingresos_COP",
               COUNT(DISTINCT mo.nic) as "Cantidad_NIC", 
               -- Conteos por tipo de gestión (réplica de las banderas _EV_* del ETL):
               -- suspensión/mantiene/reconexión/pqr = sobre Efectivas; imposibilidad = Fallida; resistencia = Perdida.
               SUM(CASE WHEN UPPER(mo.subaccion_homologada) LIKE '%SUSPENSI%' AND mo.estado_norm = 'Efectiva' THEN 1 ELSE 0 END) as "Total_Suspension",
               SUM(CASE WHEN UPPER(mo.accion) LIKE '%MANTIENE%' AND mo.estado_norm = 'Efectiva' THEN 1 ELSE 0 END) as "Total_Mantiene_Susp",
               SUM(CASE WHEN mo.tipo_os = 'TO502' AND mo.estado_norm = 'Efectiva' THEN 1 ELSE 0 END) as "Total_Reconexion",
               SUM(CASE WHEN UPPER(mo.subaccion_homologada) LIKE '%CLIENTE HA CANCELADO%' THEN 1 ELSE 0 END) as "Total_Pagos",
               SUM(CASE WHEN UPPER(mo.accion) LIKE '%IMPOSIBILIDAD TECNICA%' AND mo.estado_norm = 'Fallida' THEN 1 ELSE 0 END) as "Total_Imposibilidades",
               SUM(CASE WHEN UPPER(mo.accion) LIKE '%RESISTENCIA DEL CLIENTE%' AND mo.estado_norm = 'Perdida' THEN 1 ELSE 0 END) as "Total_Resistencia",
               SUM(CASE WHEN UPPER(mo.accion) LIKE '%NORMALIZACION PQR%' AND mo.estado_norm = 'Efectiva' THEN 1 ELSE 0 END) as "Total_PQR",
               COUNT(DISTINCT mo.fecha_cierre) as "Dias_Laborados", 
               (SUM(CASE WHEN mo.estado_norm = 'Efectiva' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0)) * 100 as "Eficacia"
        FROM dbanalitica.historico_mo mo
        LEFT JOIN dbanalitica.maestro_brigadas mb ON ${SQL_CLEAN_MO_ID} = ${SQL_CLEAN_MB_CED} AND (mb."Fecha" IS NULL OR to_char(mo.fecha_cierre, 'YYYY-MM') = left(mb."Fecha"::text, 7))
          ${fechaCond}
        -- Agrupa TAMBIÉN por brigada_homologada: un técnico con 2 brigadas en el mes
        -- aparece en cada una con SUS órdenes (antes MAX escondía la brigada real).
        GROUP BY to_char(mo.fecha_cierre, 'YYYY-MM'), ${SQL_CLEAN_MO_ID}, mo.brigada_homologada
      `, params);

    const dispRes = await query(`
        SELECT mo.fecha_cierre::text as "Fecha",
               mo.brigada_homologada as "Tipo_Brigada",
               mo.zona as "Zona",
               COUNT(DISTINCT ${SQL_CLEAN_MO_ID}) as "BrigadasActivas"
        FROM dbanalitica.historico_mo mo
        ${fechaCond}
        GROUP BY mo.fecha_cierre, mo.brigada_homologada, mo.zona
        ORDER BY mo.fecha_cierre, mo.brigada_homologada
      `, params);

    // Evolutivo horario de digitación: cuenta cantidad de brigadas distintas que ejecutaron órdenes en cada hora
    const horarioRes = await query(`
        SELECT mo.fecha_cierre::text as "Fecha",
               h.hora as "Hora",
               mo.brigada_homologada as "Tipo_Brigada",
               mo.zona as "Zona",
               COUNT(DISTINCT ${SQL_CLEAN_MO_ID}) as "BrigadasActivas",
               SUM(CASE WHEN mo.estado_norm = 'Efectiva' THEN 1 ELSE 0 END) as "Efectivas",
               SUM(CASE WHEN mo.estado_norm = 'Fallida' THEN 1 ELSE 0 END) as "Fallidas",
               SUM(CASE WHEN mo.estado_norm = 'Perdida' THEN 1 ELSE 0 END) as "Perdidas",
               COUNT(*) as "Ordenes"
        FROM dbanalitica.historico_mo mo
        CROSS JOIN (
          SELECT unnest(ARRAY['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00']) as hora
        ) h
        ${fechaCond}
          AND mo.hora_inicio IS NOT NULL AND mo.hora_fin IS NOT NULL
          AND LEAST(mo.hora_inicio, mo.hora_fin) <= (left(h.hora, 2) || ':59:59')::time
          AND GREATEST(mo.hora_inicio, mo.hora_fin) >= (h.hora || ':00')::time
        GROUP BY mo.fecha_cierre, h.hora, mo.brigada_homologada, mo.zona
        ORDER BY mo.fecha_cierre, h.hora, mo.brigada_homologada
      `, params);

    return {
      mes: mes || 'ALL',
      rawRecords,
      costos: costosFinal,
      emps,
      mesRecords: mesRes.rows,
      dispDiaria: dispRes.rows,
      horario: horarioRes.rows,
    };
  } catch (error) {
    console.error('DB Error en V2:', error);
    throw error;
  }
}

export async function getMapDataV2(mes?: string, zona?: string, proy?: string, proceso?: string) {
  const values: unknown[] = [];
  const filterClauses: string[] = ["mo.id_tecnico IS NOT NULL", "mo.tiene_vs"];
  // Proceso: 'GESTOR' restringe a la brigada 'Gestor Integral Multi'. 'ALL'/SCR = todo.
  if (proceso === 'GESTOR') {
    filterClauses.push("mo.brigada_homologada = 'Gestor Integral Multi'");
  }
  if (mes && mes !== 'ALL') {
    const meses = mes.split(',');
    const monthClauses = meses.map(m => {
      values.push(`${m}-01`);
      const i1 = values.length;
      values.push(`${m}-01`);
      const i2 = values.length;
      return `(mo.fecha_cierre >= $${i1}::date AND mo.fecha_cierre < $${i2}::date + interval '1 month')`;
    });
    filterClauses.push(`(${monthClauses.join(' OR ')})`);
  }
  if (zona && zona !== 'ALL') {
    values.push(`%${zona}%`);
    filterClauses.push(`zona ILIKE $${values.length}`);
  }

  const andFilters = filterClauses.length ? 'AND ' + filterClauses.join(' AND ') : '';
  const whereFilters = filterClauses.length ? 'WHERE ' + filterClauses.join(' AND ') : '';

  try {
    const statsQuery = `
      SELECT
        municipio,
        split_part(localidad_barrio, '/', 2) as barrio,
        COUNT(*) as total,
        SUM(CASE WHEN mo.estado_norm = 'Efectiva' THEN 1 ELSE 0 END) as efectivas,
        SUM(CASE WHEN mo.estado_norm = 'Fallida' THEN 1 ELSE 0 END) as fallidas,
        SUM(CASE WHEN mo.estado_norm = 'Perdida' THEN 1 ELSE 0 END) as perdidas
      FROM dbanalitica.historico_mo mo
      WHERE mo.localidad_barrio IS NOT NULL ${andFilters}
      GROUP BY municipio, split_part(localidad_barrio, '/', 2)
    `;
    const statsRes = await query(statsQuery, values);

    const ptsQuery = `
      SELECT
        nic,
        TRIM(split_part(gps, ',', 1)) as la,
        TRIM(split_part(gps, ',', 2)) as lo,
        accion as ac,
        subaccion_homologada as su,
        tecnico as te,
        municipio as mu,
        split_part(localidad_barrio, '/', 2) as ba,
        zona as zo,
        mo.estado_norm as es,
        tipo_os as "to",
        fecha_cierre::text as fe
      FROM dbanalitica.historico_mo mo
      ${whereFilters}
      ORDER BY fecha_cierre DESC NULLS LAST
      LIMIT 25000
    `;
    const ptsRes = await query(ptsQuery, values);

    const listsQuery = `
      SELECT
        array_agg(DISTINCT mo.tecnico) FILTER (WHERE mo.tecnico IS NOT NULL) as tecnicos,
        array_agg(DISTINCT mo.accion) FILTER (WHERE mo.accion IS NOT NULL) as acciones,
        array_agg(DISTINCT mo.subaccion_homologada) FILTER (WHERE mo.subaccion_homologada IS NOT NULL) as subacciones,
        array_agg(DISTINCT mo.estado_osf) FILTER (WHERE mo.estado_osf IS NOT NULL) as estados,
        array_agg(DISTINCT mo.municipio) FILTER (WHERE mo.municipio IS NOT NULL) as municipios,
        array_agg(DISTINCT split_part(mo.localidad_barrio, '/', 2)) FILTER (WHERE mo.localidad_barrio IS NOT NULL) as barrios,
        array_agg(DISTINCT mo.zona) FILTER (WHERE mo.zona IS NOT NULL) as zonas
      FROM dbanalitica.historico_mo mo
      ${whereFilters}
    `;
    const listsRes = await query(listsQuery, values);

    return {
      pts: ptsRes.rows,
      stats_barrios: statsRes.rows,
      filtros: listsRes.rows[0]
    };
  } catch (err) {
    console.error('Error fetching map data V2:', err);
    throw err;
  }
}

export async function getMonthsDataV2() {
  try {
    const monthsRes = await query(`
      SELECT to_char(fecha_cierre, 'YYYY-MM') as "mes",
             COUNT(*)::int as "count",
             MAX(fecha_carga)::text as "version"
      FROM dbanalitica.historico_mo
      WHERE fecha_cierre IS NOT NULL AND id_tecnico IS NOT NULL AND tiene_vs
      GROUP BY to_char(fecha_cierre, 'YYYY-MM')
      ORDER BY 1
    `);

    const evolutivoRes = await query(`
      SELECT 
        to_char(fecha_cierre, 'YYYY-MM') as "Mes",
        mo.brigada_homologada as "TipoBrigada",
        COUNT(DISTINCT nic) as "Cantidad_NIC",
        COUNT(*) as "Total_Ordenes", 
        SUM(CASE WHEN UPPER(mo.subaccion_homologada) LIKE '%SUSPENSI%' AND mo.estado_norm = 'Efectiva' THEN 1 ELSE 0 END) as "Total_Suspension",
        SUM(CASE WHEN UPPER(mo.accion) LIKE '%MANTIENE%' AND mo.estado_norm = 'Efectiva' THEN 1 ELSE 0 END) as "Total_Mantiene_Susp",
        SUM(CASE WHEN mo.tipo_os = 'TO502' AND mo.estado_norm = 'Efectiva' THEN 1 ELSE 0 END) as "Total_Reconexion",
        SUM(CASE WHEN UPPER(mo.subaccion_homologada) LIKE '%CLIENTE HA CANCELADO%' THEN 1 ELSE 0 END) as "Total_Pagos",
        SUM(CASE WHEN UPPER(mo.accion) LIKE '%IMPOSIBILIDAD TECNICA%' AND mo.estado_norm = 'Fallida' THEN 1 ELSE 0 END) as "Total_Imposibilidades",
        SUM(CASE WHEN UPPER(mo.accion) LIKE '%RESISTENCIA DEL CLIENTE%' AND mo.estado_norm = 'Perdida' THEN 1 ELSE 0 END) as "Total_Resistencia",
        SUM(CASE WHEN UPPER(mo.accion) LIKE '%NORMALIZACION PQR%' AND mo.estado_norm = 'Efectiva' THEN 1 ELSE 0 END) as "Total_PQR",
        (SUM(CASE WHEN mo.estado_norm = 'Efectiva' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0)) * 100 as "Eficacia"
      FROM dbanalitica.historico_mo mo
      WHERE mo.id_tecnico IS NOT NULL AND mo.tiene_vs AND UPPER(COALESCE(mo.tecnico,'')) NOT LIKE '%PRUEBA%'
      GROUP BY to_char(mo.fecha_cierre, 'YYYY-MM'), mo.brigada_homologada
    `);

    return {
      months: monthsRes.rows,
      evolutivo: evolutivoRes.rows,
    };
  } catch (err) {
    console.error('Error fetching months data V2:', err);
    throw err;
  }
}

// Órdenes COMPLETAS de un barrio (o de los barrios homologados) dentro de la
// ventana mes/zona. V2: lee historico_mo, parte gps -> la/lo y localidad_barrio
// -> barrio, y cruza con maestro_estados para el estado OFICIAL (por subacción).
//   getBarrioDataV2('2026-07', 'ALL', 'SANTA HELENA||EL RECREO')
export async function getBarrioDataV2(mes?: string, zona?: string, barriosParam?: string): Promise<{ rows: unknown[] }> {
  const lista = (barriosParam || '').split('||').map(s => s.trim()).filter(Boolean);
  if (!lista.length) return { rows: [] };

  const where: string[] = ["h.id_tecnico IS NOT NULL", "h.tiene_vs"];
  const values: unknown[] = [];

  if (mes && mes !== 'ALL') {
    const monthClauses = mes.split(',').map(m => {
      values.push(`${m}-01`); const i1 = values.length;
      values.push(`${m}-01`); const i2 = values.length;
      return `(h.fecha_cierre >= $${i1}::date AND h.fecha_cierre < $${i2}::date + interval '1 month')`;
    });
    where.push(`(${monthClauses.join(' OR ')})`);
  }
  if (zona && zona !== 'ALL') {
    values.push(`%${zona}%`);
    where.push(`h.zona ILIKE $${values.length}`);
  }
  values.push(lista);
  where.push(`split_part(h.localidad_barrio, '/', 2) = ANY($${values.length}::text[])`);
  const res = await query(`
    SELECT
      h.nic                                    as "nic",
      TRIM(split_part(h.gps, ',', 1))          as "la",
      TRIM(split_part(h.gps, ',', 2))          as "lo",
      h.accion                                 as "ac",
      h.subaccion_homologada                  as "su",
      h.tecnico                                as "te",
      h.municipio                              as "mu",
      split_part(h.localidad_barrio, '/', 2)   as "ba",
      h.zona                                   as "zo",
      h.estado_norm                            as "es",
      h.tipo_os                                as "to",
      h.fecha_cierre::text                     as "fe"
    FROM dbanalitica.historico_mo h
    WHERE ${where.join(' AND ')}
    ORDER BY h.fecha_cierre DESC NULLS LAST
    LIMIT 20000
  `, values);
  return { rows: res.rows };
}

// Observaciones BAJO DEMANDA (popup de NIC o de barrio). V2: igual que arriba pero
// solo filas con observación, priorizando las 'Fallida'. LIMIT 40.
//   getObsDataV2('2026-07', '123456')            -> por NIC
//   getObsDataV2('2026-07', undefined, 'A||B')   -> por barrios
export async function getObsDataV2(mes?: string, nic?: string, barriosParam?: string): Promise<{ rows: unknown[] }> {
  const where: string[] = ["h.observacion IS NOT NULL", "h.observacion <> ''", "h.id_tecnico IS NOT NULL", "h.tiene_vs"];
  const values: unknown[] = [];

  if (mes && mes !== 'ALL') {
    const monthClauses = mes.split(',').map(m => {
      values.push(`${m}-01`); const i1 = values.length;
      values.push(`${m}-01`); const i2 = values.length;
      return `(h.fecha_cierre >= $${i1}::date AND h.fecha_cierre < $${i2}::date + interval '1 month')`;
    });
    where.push(`(${monthClauses.join(' OR ')})`);
  }

  if (nic) {
    values.push(nic);
    where.push(`h.nic = $${values.length}`);
  } else {
    const lista = (barriosParam || '').split('||').map(s => s.trim()).filter(Boolean);
    if (!lista.length) return { rows: [] };
    values.push(lista);
    where.push(`split_part(h.localidad_barrio, '/', 2) = ANY($${values.length}::text[])`);
  }

  const res = await query(`
    SELECT
      h.fecha_cierre::text                as "fe",
      h.nic                               as "nic",
      h.estado_norm                       as "es",
      h.subaccion_homologada             as "su",
      h.observacion                       as "ob"
    FROM dbanalitica.historico_mo h
    WHERE ${where.join(' AND ')}
    ORDER BY (h.estado_norm = 'Fallida') DESC, h.fecha_cierre DESC
    LIMIT 40
  `, values);
  return { rows: res.rows };
}


