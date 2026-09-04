import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Informe de Digitación diaria.
//
// Reglas de columnas (confirmadas con el negocio):
//   - Base: órdenes de historico_mo con id_tecnico e "VS:" en la observación.
//   - Clasificación de brigada (igual que el resto del dashboard, isDisponibleType):
//       DISPONIBLE si el nombre contiene canasta/mt-at/gestor/disponible/multi.
//   - Cada orden cae en UNA sola categoría, con prioridad:
//       1) PQR: subaccion_homologada contiene "PQR" (CUALQUIER estado_norm).
//       2) Fallidas: estado_norm 'Fallida' o 'Perdida'.
//       3) Efectivas: Reconexión (tipo_os='TO502') → Se mantiene → Suspensión
//          (disponible → bornera → tendido), todas por subaccion_homologada.
//   - Total = suma de las 7 columnas.
//   - Hora: una orden entra si su franja [hora_inicio, hora_fin] se cruza con el rango.
// ─────────────────────────────────────────────────────────────────────────────

const DISP_REGEX = 'canasta|mt-at|mt at|gestor|disponible|multi';

const CAT_SQL = `
  CASE
    WHEN sub ~ 'pqr' THEN 'pqr'                              -- PQR: subacción contiene "PQR", cualquier estado
    WHEN estado_norm IN ('Fallida','Perdida') THEN 'fallidas'
    WHEN estado_norm = 'Efectiva' THEN
      CASE
        WHEN tipo_os = 'TO502' THEN 'reconexion'             -- Reconexión: por tipo_os
        WHEN sub ~ 'mantiene' THEN 'mantiene'
        WHEN sub ~ 'suspensi' AND cat_brig = 'disponible' THEN 'susp_disponible'
        WHEN sub ~ 'suspensi' AND sub ~ 'bornera' THEN 'susp_bornera'
        WHEN sub ~ 'suspensi' AND (sub ~ 'tendido' OR sub ~ 'aerea') THEN 'susp_tendido'
        ELSE 'otro'
      END
    ELSE 'otro'
  END`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    // ── Metadatos para poblar los selectores ──────────────────────────────
    if (searchParams.get('meta')) {
      const [zonas, meses] = await Promise.all([
        query(`SELECT DISTINCT zona FROM dbanalitica.historico_mo
               WHERE zona IS NOT NULL ORDER BY 1`),
        query(`SELECT DISTINCT to_char(fecha_cierre,'YYYY-MM') AS mes
               FROM dbanalitica.historico_mo WHERE fecha_cierre IS NOT NULL ORDER BY 1 DESC`),
      ]);
      return NextResponse.json({
        zonas: zonas.rows.map((r: { zona: string }) => r.zona),
        meses: meses.rows.map((r: { mes: string }) => r.mes),
      });
    }

    const mes = searchParams.get('mes');
    if (!mes) return NextResponse.json({ error: 'Falta el parámetro "mes" (YYYY-MM).' }, { status: 400 });

    const zona = searchParams.get('zona');            // ATLANTICO CENTRO/NORTE/SUR | null=todas
    const fecha = searchParams.get('fecha');          // YYYY-MM-DD | null = todo el mes
    const horaDesde = searchParams.get('horaDesde');  // HH:MM | null
    const horaHasta = searchParams.get('horaHasta');  // HH:MM | null
    const tipo = searchParams.get('tipo');            // disponibles | operativas | null=ambas
    const porTecnico = searchParams.get('porTecnico') === '1';

    const where: string[] = [
      'id_tecnico IS NOT NULL',
      "observacion ~* 'v\\s*s\\s*:'",
      "to_char(fecha_cierre,'YYYY-MM') = $1",
    ];
    const params: unknown[] = [mes];

    if (zona) { params.push(zona); where.push(`UPPER(zona) = UPPER($${params.length})`); }
    if (fecha) { params.push(fecha); where.push(`fecha_cierre::date = $${params.length}::date`); }
    if (horaDesde && horaHasta) {
      params.push(horaDesde); const d = params.length;
      params.push(horaHasta); const h = params.length;
      where.push(`hora_inicio IS NOT NULL AND hora_fin IS NOT NULL AND hora_inicio <= $${h}::time AND hora_fin >= $${d}::time`);
    }
    if (tipo === 'disponibles') where.push(`lower(coalesce(brigada_homologada,'')) ~ '${DISP_REGEX}'`);
    else if (tipo === 'operativas') where.push(`lower(coalesce(brigada_homologada,'')) !~ '${DISP_REGEX}'`);

    const grupoSel = porTecnico ? 'fecha, id_tecnico, tecnico, zona, brigada' : 'fecha, zona, brigada';
    const grupoOut = porTecnico ? 'fecha, id_tecnico, tecnico, zona, brigada' : 'fecha, zona, brigada';

    const sql = `
      WITH base AS (
        SELECT
          to_char(fecha_cierre, 'YYYY-MM-DD') AS fecha,
          id_tecnico, tecnico,
          coalesce(zona, 'SIN ZONA') AS zona,
          coalesce(brigada_homologada, 'SIN CLASIFICAR') AS brigada,
          estado_norm, tipo_os,
          CASE WHEN lower(coalesce(brigada_homologada,'')) ~ '${DISP_REGEX}' THEN 'disponible' ELSE 'operativa' END AS cat_brig,
          lower(coalesce(subaccion_homologada,'')) AS sub
        FROM dbanalitica.historico_mo
        WHERE ${where.join(' AND ')}
      ),
      clasif AS (
        SELECT fecha, id_tecnico, tecnico, zona, brigada, ${CAT_SQL} AS categoria FROM base
      )
      SELECT ${grupoSel},
        COUNT(*) FILTER (WHERE categoria='susp_bornera')    ::int AS susp_bornera,
        COUNT(*) FILTER (WHERE categoria='susp_tendido')    ::int AS susp_tendido,
        COUNT(*) FILTER (WHERE categoria='susp_disponible') ::int AS susp_disponible,
        COUNT(*) FILTER (WHERE categoria='reconexion')      ::int AS reconexion,
        COUNT(*) FILTER (WHERE categoria='mantiene')        ::int AS mantiene,
        COUNT(*) FILTER (WHERE categoria='pqr')             ::int AS pqr,
        COUNT(*) FILTER (WHERE categoria='fallidas')        ::int AS fallidas,
        COUNT(*) FILTER (WHERE categoria IN
          ('susp_bornera','susp_tendido','susp_disponible','reconexion','mantiene','pqr','fallidas'))::int AS total
      FROM clasif
      GROUP BY ${grupoOut}
      HAVING COUNT(*) FILTER (WHERE categoria IN
        ('susp_bornera','susp_tendido','susp_disponible','reconexion','mantiene','pqr','fallidas')) > 0
      ORDER BY ${porTecnico ? 'fecha, tecnico, zona, brigada' : 'fecha, zona, brigada'}
    `;

    const res = await query(sql, params);
    return NextResponse.json({ rows: res.rows, porTecnico });
  } catch (error) {
    console.error('Informe digitación error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
