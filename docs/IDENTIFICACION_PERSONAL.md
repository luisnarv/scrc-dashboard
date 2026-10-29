# Cómo identificar al personal de SCR y al de Cobros

Los dos tableros (SCRC y Cobros) leen la **misma base** (`dbanalitica`). Para que cada uno cuente solo a su gente,
cada proyecto lee **únicamente sus propias tablas** y se identifica a la persona por la **cédula**, nunca por el nombre.
Este documento es idéntico en los dos proyectos.

## Regla de oro

| | SCR (este tablero) | Cobros |
|---|---|---|
| Tabla de la operación | `dbanalitica.historico_mo` | `dbanalitica.historico_aire_cobros` |
| Quién es la persona | `historico_mo.id_tecnico` (cédula del técnico) | `historico_aire_cobros.usuario_gestion` (cédula del gestor) |
| Nombre | `historico_mo.tecnico` / `maestro_brigadas.tecnico` | `historico_aire_cobros.gestor` con formato `NOMBRE - CÉDULA` |
| Lista oficial de personal | `maestro_brigadas` (`cedula`, `rol` = TECNICO o AUXILIAR, `tipo_brigada`, `zona`, por mes) | no hay maestro: la lista sale de los gestores con gestiones en el mes |
| Qué es un "tipo" | `brigada_homologada` (Pesada, Liviana, Gestor Integral Multi, …) | `plan` (Cobro Persuasivo, Visita Personalizada, Multifamiliar) |
| Zona | `zona` (ATLANTICO NORTE / CENTRO / SUR) | `territorio` (ATLANTICO NORTE / CENTRO / SUR) |

**Cédula = solo dígitos.** Antes de comparar o cruzar se normaliza:
`REGEXP_REPLACE(REGEXP_REPLACE(TRIM(valor), '\.0+$', ''), '\D', '', 'g')`.

## Qué NO usar

- `historico_aire_cobros.cedula` es la cédula del **cliente**, no la del gestor. Para el gestor se usa `usuario_gestion`.
- El **nombre** no sirve para cruzar: en cobros viene `JOSE CAMILO GOMEZ JIMENEZ - 1043021186` (a veces con palabras pegadas,
  como `JUAN CARLOSALFARO DIAZ`) y en SCR cambia el orden (`ALFARO DIAZ JUAN CARLOS`). Cruzando por nombre no coincide ninguno.
- En `historico_otc` (contabilidad) **no hay personal de SCR**: las filas de `SCR Sur` y `SCR Norte - Centro` casi no traen
  `cedula_empleado` ni `brigada_homologada`. El financiero se filtra por proyecto, no por persona.

## SCR: cómo se filtra

**Operación** (`historico_mo`), condiciones que usa el tablero:

```sql
mo.id_tecnico IS NOT NULL
AND mo.tiene_vs
AND UPPER(COALESCE(mo.tecnico, '')) NOT LIKE '%PRUEBA%'
```

Quién es técnico y qué tipo de brigada tiene en el mes lo manda `maestro_brigadas`, unida por cédula limpia y mes
(`left(fecha, 7)`), con una sola fila por cédula y mes (gana TECNICO, luego la que trae RETIRO, luego la más reciente).

**Financiero** (`historico_otc`): la información sale de la columna **`proyecto`** y solo se toman estos dos valores:

- `SCR Norte - Centro`
- `SCR Sur`

Hoy el código lo hace con `zona IS NOT NULL`, que es equivalente (verificado: las 40.940 filas con zona son exactamente las
de esos dos proyectos y ninguna otra). Es más claro filtrar explícitamente por
`proyecto IN ('SCR Norte - Centro', 'SCR Sur')`.

## Cobros: cómo se filtra

- Gestor = `usuario_gestion` (cédula). Los planes son `Cobro Persuasivo`, `Visita Personalizada` y `Multifamiliar`.
- Nunca se lee `historico_mo` ni `historico_otc` para contar gestores.

## Ejemplo verificado

`GOMEZ JIMENEZ, JOSE CAMILO`, cédula **1043021186**:

- Cobros: gestor `JOSE CAMILO GOMEZ JIMENEZ - 1043021186`, Atlántico Sur, planes Cobro Persuasivo y Visita Personalizada,
  con gestiones todos los meses de 2025-04 a 2026-10.
- SCR: **no existe** ni en `historico_mo` ni en `maestro_brigadas`. Es personal de cobros.

## Personas que aparecen en las dos fuentes

Hay cédulas que pasaron de un proceso a otro. Por eso cada tablero lee solo su tabla y no se suman entre sí.
Verificadas (cruce por cédula, no por nombre), a octubre de 2026:

| Cédula | Persona | Cobros | SCR |
|---|---|---|---|
| 1143231666 | Yurenis Barcasnegra de la Rosa | Multifamiliar, 2026-02 a 2026-08 | Gestor Integral Multi, desde 2026-08 |
| 72244115 | Jorge Luis Zambrano Mercado | Multifamiliar, 2025-11 a 2026-02 | Gestor Integral Multi, 2026-02 a 2026-09 |
| 72224450 | Juan Carlos Alfaro Díaz | Persuasivo y Personalizada, 2025-12 a 2026-10 | Liviana / Gestor Integral Multi, solo 2025-10 |

Regla para estos casos: **la persona cuenta en el tablero cuyo registro estás leyendo**. En SCR cuentan sus órdenes de
`historico_mo`; en Cobros cuentan sus gestiones de `historico_aire_cobros`. Ninguna orden ni gestión se cuenta dos veces,
porque son tablas distintas. Si se necesita saber en qué proceso está hoy, se mira su último mes en cada tabla.

## Cómo validar que alguien es de SCR o de Cobros

```sql
-- ¿Es de cobros?
SELECT gestor, plan, territorio, periodo_mes, COUNT(*)
FROM dbanalitica.historico_aire_cobros
WHERE regexp_replace(usuario_gestion, '\D', '', 'g') = '<cedula>'
GROUP BY 1, 2, 3, 4 ORDER BY 4;

-- ¿Es de SCR?
SELECT tecnico, brigada_homologada, zona, to_char(fecha_cierre, 'YYYY-MM') AS mes, COUNT(*)
FROM dbanalitica.historico_mo
WHERE regexp_replace(regexp_replace(trim(id_tecnico), '\.0+$', ''), '\D', '', 'g') = '<cedula>'
GROUP BY 1, 2, 3, 4 ORDER BY 4;
SELECT * FROM dbanalitica.maestro_brigadas
WHERE regexp_replace(regexp_replace(trim(cedula), '\.0+$', ''), '\D', '', 'g') = '<cedula>';
```

Si aparece en una sola de las dos, es de ese proceso. Si aparece en las dos, ver la tabla de arriba.
