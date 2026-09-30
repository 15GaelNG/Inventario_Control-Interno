# Documentación del Control Interno

Por dónde entrar según lo que traigas.

## Si vas a tocar los IDs o las llaves

| Documento | Para qué |
|---|---|
| [ids.md](ids.md) | **El modelo.** Qué formato tiene un ID, por qué ese y no otro, los prefijos por hoja, y las reglas de negocio ya confirmadas. Empieza aquí. |
| [ids-asignacion.md](ids-asignacion.md) | **El procedimiento.** Cómo se le pone ID a lo que ya existe, dónde va cada referencia, el pipeline con su respaldo y su reversa, y de dónde nacen los IDs nuevos. |
| [limpieza-spreadsheet.md](limpieza-spreadsheet.md) | **La bitácora.** Lo que de verdad se ejecutó el 29/09/2026, con los números, dónde quedaron los respaldos y qué quedó pendiente. |

## Si vas a tocar datos que se copian entre hojas

| Documento | Para qué |
|---|---|
| [relaciones.md](relaciones.md) | Por qué varias hojas guardan copias de columnas que pertenecen a otra, y cómo se mantienen iguales. Se lee junto con `ids.md`. |

## Si vas a construir un módulo

| Documento | Para qué |
|---|---|
| [mapeo-modulos.md](mapeo-modulos.md) | Qué módulo de AppSheet corresponde a qué hoja, y en qué estado está cada uno. |
| [lineas-plan.md](lineas-plan.md) | El plan del módulo de Líneas Telefónicas. |
| [lineas-estado.md](lineas-estado.md) | El estado detallado de Líneas: hojas, carpetas de Drive, NUCOS. |

## Lo que hay que saber antes de tocar producción

Cinco cosas que no están en el código y que muerden:

1. **Agregar, mover o quitar una COLUMNA rompe la app de AppSheet** hasta que alguien
   regenere el esquema en su editor, y les pega a los usuarios en campo. Quitar *filas* no.
   Detalle en [ids.md](ids.md).
2. **`getSheetByColumns` elige la hoja por sus columnas, no por su nombre**, y desempata por
   más filas. Una copia con la misma forma compite. Detalle en
   [limpieza-spreadsheet.md](limpieza-spreadsheet.md).
3. **Producción no tiene la hoja `PERFILES`**, y por eso los permisos usan el ROL viejo y
   todos entran. Correr `configurarPermisos()` allá dejaría a 40 personas sin módulos hasta
   que alguien les asigne perfil. Detalle en
   [limpieza-spreadsheet.md](limpieza-spreadsheet.md).
4. **`VEHICULOS` guarda estatus dentro de sus columnas de datos**: `BAJA VEHICULAR`,
   `FUERA DE SERVICIO`, `NUCO SIN INFORMACION` y `SIN ESPECIFICAR` ocupan **1,124 celdas
   fuera de lugar en 13 columnas** — `SEDE` y `UBICACION` 309 cada una, `DEPARTAMENTO` 139,
   `RESPONSABLE VEHICULO` 125, `PLACA` 84. La mitad de la flota (323 de 648) tiene al menos
   una. Sincronizar sin filtrarlas *borra* el dato bueno de los otros módulos. Y ojo con la
   otra mitad del problema: `INSPECCION VEHICULAR` e `INCIDENCIAS` son **bitácoras
   fechadas**, no cachés — su departamento es el del día del evento y corregirlo reescribe
   el pasado. Detalle en [relaciones.md](relaciones.md), inventario celda por celda en
   `inconsistencias-vehiculos.xlsx`.
5. **El catálogo `DEPARTAMENTOS` está desactualizado** y no sirve para validar: le faltan
   `OOAM TECNICO` y `OOAM ADMINISTRATIVO`, que son áreas reales de 25 vehículos activos.
   Validar contra él rechaza datos buenos.

## Los Excel de apoyo, en la raíz del repo

| Archivo | Qué trae |
|---|---|
| `prefijos-ids.xlsx` | Prefijos por módulo, el formato del ID, reglas confirmadas y pendientes por persona |
| `auditoria-ids.xlsx` | Una fila por hoja: columna vieja, columna nueva y un ejemplo de cada lado para cotejar |
| `pestanas-sin-uso.xlsx` | Las pestañas que el código no nombra, con su riesgo |
| `fechas-de-alta.xlsx` | Qué columna de fecha representa el alta de cada hoja |
| `inconsistencias-vehiculos.xlsx` | `VEHICULOS` contra las 5 hojas que copian sus datos, y el relleno dentro de `VEHICULOS` mismo |
