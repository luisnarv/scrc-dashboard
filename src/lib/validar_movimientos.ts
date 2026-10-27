/**
 * Motor de Validación de Movimientos y Cambios de Operativa de Técnicos
 * 
 * Reglas de negocio:
 * 1. Trazabilidad histórica completa: Ningún registro anterior se sobrescribe ni elimina.
 * 2. Un nuevo INGRESO no se bloquea si el técnico tuvo un INGRESO previo, siempre que
 *    dicha asignación anterior haya finalizado formalmente mediante un RETIRO.
 * 3. Permite la secuencia legítima de cambio de operativa:
 *    [INGRESO (Operativa A)] -> [RETIRO (Operativa A)] -> [INGRESO (Operativa B)]
 * 4. Regla de Vigencia de Fechas:
 *    Si el técnico laboró hasta el 10/10/2026 como Pesada (fecha de retiro: 10/10/2026),
 *    su nueva asignación en Disponible arranca a partir del 11/10/2026 (día siguiente),
 *    garantizando que el día 10 pertenezca a la operativa anterior y a partir del 11 a la nueva.
 * 5. Solo se considera DUPLICADO REAL si:
 *    - Se intenta registrar un INGRESO con la misma fecha y misma operativa ya registrada.
 *    - Se intenta registrar un nuevo INGRESO cuando el técnico ya tiene una asignación activa
 *      abierta (sin RETIRO previo que la cierre).
 */

export interface MovimientoTecnico {
  cedula: string;
  tecnico?: string;
  fecha: string; // Formato YYYY-MM-DD
  observacion: 'INGRESO' | 'RETIRO' | 'INGRESO/RETIRO';
  tipo_brigada: string;
  supervisor?: string;
  coordinador?: string;
  zona?: string;
}

export interface ResultadoValidacion {
  valido: boolean;
  esCambioOperativa: boolean;
  motivo?: string;
  fechaEfectivaInicio?: string;
  mensaje: string;
}

/**
 * Valida si un nuevo movimiento puede registrarse en el historial del técnico
 * sin generar errores de duplicidad indebidos y asegurando la coherencia de fechas.
 */
export function validarMovimientoTecnico(
  historial: MovimientoTecnico[],
  nuevo: MovimientoTecnico
): ResultadoValidacion {
  const ced = String(nuevo.cedula || '').replace(/\D/g, '');
  if (!ced) {
    return { valido: false, esCambioOperativa: false, mensaje: 'Cédula de técnico inválida o vacía.' };
  }

  // Filtrar historial del técnico y ordenar cronológicamente
  const histTec = historial
    .filter(m => String(m.cedula).replace(/\D/g, '') === ced)
    .sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
      // En la misma fecha, el RETIRO ocurre lógicamente antes que el nuevo INGRESO
      if (a.observacion === 'RETIRO' && b.observacion === 'INGRESO') return -1;
      if (a.observacion === 'INGRESO' && b.observacion === 'RETIRO') return 1;
      return 0;
    });

  // Si no tiene historial previo, el primer INGRESO es siempre válido
  if (histTec.length === 0) {
    if (nuevo.observacion === 'RETIRO') {
      return {
        valido: false,
        esCambioOperativa: false,
        motivo: 'RETIRO_SIN_INGRESO_PREVIO',
        mensaje: `No se puede registrar un RETIRO para el técnico ${ced} sin un registro previo de INGRESO.`
      };
    }
    return {
      valido: true,
      esCambioOperativa: false,
      fechaEfectivaInicio: nuevo.fecha,
      mensaje: 'Primer ingreso del técnico registrado exitosamente.'
    };
  }

  // Verificar duplicados exactos (misma fecha, misma operativa y misma observación)
  const duplicadoExacto = histTec.find(m => 
    m.fecha === nuevo.fecha && 
    m.observacion === nuevo.observacion && 
    m.tipo_brigada.trim().toUpperCase() === nuevo.tipo_brigada.trim().toUpperCase()
  );

  if (duplicadoExacto) {
    return {
      valido: false,
      esCambioOperativa: false,
      motivo: 'DUPLICADO_EXACTO',
      mensaje: `Registro duplicado: Ya existe un ${nuevo.observacion} para el técnico ${ced} en fecha ${nuevo.fecha} con la operativa '${nuevo.tipo_brigada}'.`
    };
  }

  const ultimoMov = histTec[histTec.length - 1];

  // Caso: Registrar un nuevo INGRESO
  if (nuevo.observacion === 'INGRESO') {
    // Si el último movimiento fue un RETIRO:
    if (ultimoMov.observacion === 'RETIRO') {
      const esCambio = ultimoMov.tipo_brigada.trim().toUpperCase() !== nuevo.tipo_brigada.trim().toUpperCase();

      if (nuevo.fecha < ultimoMov.fecha) {
        return {
          valido: false,
          esCambioOperativa: esCambio,
          motivo: 'FECHA_INGRESO_ANTERIOR_A_RETIRO',
          mensaje: `Inconsistencia de fechas: La fecha del nuevo INGRESO (${nuevo.fecha}) no puede ser anterior a la fecha de RETIRO de la asignación previa (${ultimoMov.fecha}).`
        };
      }

      // Regla de Vigencia: Si el técnico laboró hasta el retiro (ej. 10/10/2026),
      // su nueva operativa arranca formalmente a partir del día siguiente (11/10/2026).
      let fechaEfectiva = nuevo.fecha;
      let avisoVigencia = '';

      if (nuevo.fecha === ultimoMov.fecha && esCambio) {
        // Si se indicó la misma fecha del retiro, la vigencia efectiva arranca al día siguiente
        const dt = new Date(nuevo.fecha + 'T12:00:00Z');
        dt.setUTCDate(dt.getUTCDate() + 1);
        fechaEfectiva = dt.toISOString().slice(0, 10);
        avisoVigencia = ` Dado que el técnico laboró hasta el ${ultimoMov.fecha} en '${ultimoMov.tipo_brigada}', su nueva asignación en '${nuevo.tipo_brigada}' arranca a partir del ${fechaEfectiva}.`;
      } else {
        avisoVigencia = ` Vigencia en '${nuevo.tipo_brigada}' a partir del ${nuevo.fecha}.`;
      }

      return {
        valido: true,
        esCambioOperativa: esCambio,
        fechaEfectivaInicio: fechaEfectiva,
        mensaje: (esCambio
          ? `Cambio de operativa legítimo: El técnico cerró '${ultimoMov.tipo_brigada}' el ${ultimoMov.fecha} e ingresa a '${nuevo.tipo_brigada}'.`
          : `Reingreso legítimo a '${nuevo.tipo_brigada}'.`) + avisoVigencia
      };
    }

    // Si el último movimiento fue INGRESO sin un RETIRO intermedio:
    if (ultimoMov.observacion === 'INGRESO') {
      // Misma operativa activa -> Duplicidad de ingreso
      if (ultimoMov.tipo_brigada.trim().toUpperCase() === nuevo.tipo_brigada.trim().toUpperCase()) {
        return {
          valido: false,
          esCambioOperativa: false,
          motivo: 'INGRESO_ACTIVO_MISMA_OPERATIVA',
          mensaje: `Duplicidad: El técnico ya tiene un INGRESO activo en '${ultimoMov.tipo_brigada}' desde ${ultimoMov.fecha}. Para cambiar fecha o datos, registre el movimiento de RETIRO previo.`
        };
      }

      // Distinta operativa pero sin RETIRO -> Debe cerrarse la asignación previa
      return {
        valido: false,
        esCambioOperativa: true,
        motivo: 'REQUIERE_RETIRO_PREVIO',
        mensaje: `Para cambiar de '${ultimoMov.tipo_brigada}' a '${nuevo.tipo_brigada}', debe registrar primero el RETIRO de la asignación anterior (ej. retiro en ${nuevo.fecha} e inicio de nueva operativa al día siguiente).`
      };
    }
  }

  // Caso: Registrar un RETIRO
  if (nuevo.observacion === 'RETIRO') {
    if (ultimoMov.observacion === 'RETIRO') {
      return {
        valido: false,
        esCambioOperativa: false,
        motivo: 'RETIRO_DUPLICADO',
        mensaje: `El técnico ya se encuentra retirado de '${ultimoMov.tipo_brigada}' desde ${ultimoMov.fecha}.`
      };
    }

    return {
      valido: true,
      esCambioOperativa: false,
      mensaje: `Retiro de la operativa '${nuevo.tipo_brigada}' registrado correctamente para la fecha ${nuevo.fecha} (último día laborado en esta operativa).`
    };
  }

  return { valido: true, esCambioOperativa: false, mensaje: 'Movimiento validado correctamente.' };
}
