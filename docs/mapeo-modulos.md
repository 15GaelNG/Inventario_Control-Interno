# Mapeo de módulos — AppSheet actual → nuevo sistema

Referencia de qué tablas del ambiente de pruebas de AppSheet corresponden a
cada módulo del nuevo sistema. Solo se documentan nombres de columnas
(estructura), nunca datos reales de filas.

> No se modifica ni se conecta nada al spreadsheet/app de AppSheet de pruebas.
> Esto es solo una referencia para diseñar el esquema nuevo.

## Estado de definición por módulo

| Módulo | Tablas originales relacionadas | Esquema nuevo |
|---|---|---|
| Usuarios | Tabla de login (CORREO, ROL, ACTIVO, DPTOS PERMITIDOS...) | ✅ Definido en `UsuariosService.gs` / `Auth.gs` |
| Accesorios | Catálogo de accesorios + movimientos entrada/salida | ✅ Definido en `AccesoriosService.gs` (referencia de patrón) |
| Vehículos | Alta de vehículo, reasignaciones, verificaciones, sensores GPS, hologramas EOX | ⏳ Pendiente — service creado como stub |
| ~~Servicios~~ (mantenimiento) | Hoja `SERVICIOS` del AppSheet | ❌ Descartado (2026-09-17): no se va a migrar |
| Inspección vehicular | Checklist ~150 campos por pieza + diagrama frontal/trasera/izq/der + firma | ⏳ Pendiente — usa `PdfService.generarReporteDanios('VEHICULO', ...)` |
| Telefonía | Líneas + equipos, reasignaciones, suspensiones, portabilidad, bajas | ⏳ Pendiente — service creado como stub |
| Inspección de equipo telefónico | Checklist de daños del celular + firma | ⏳ Pendiente — usa `PdfService.generarReporteDanios('CELULAR', ...)` |
| Caja chica | Cuentas por responsable, arqueos, auditoría | ⏳ Pendiente — service creado como stub |
| Bajas / desecho | Baja de equipo con evidencia y autorización | ⏳ Pendiente — sin service aún |
| Incidencias | Reporte por folio/departamento | ⏳ Pendiente — sin service aún |

## Decisiones de diseño vs. el sistema actual

- **Nombres de columna**: se normalizan a `MAYUSCULAS_CON_GUION_BAJO`, sin
  espacios ni acentos, para evitar bugs por columnas casi-duplicadas (el
  sistema actual tiene varias tablas con headers ligeramente distintos para
  el mismo concepto, ej. "No EMPLEADO" vs "NO EMPLEADO").
- **Contraseñas**: hash + salt por usuario (`Auth.gs`), nunca texto plano.
- **Checklists de inspección** (vehículo/celular): en vez de ~150 columnas
  sueltas, se guarda un JSON con el detalle por pieza en una sola columna
  `DETALLE_JSON`, más columnas planas para lo que se necesita filtrar/reportar
  (folio, responsable, fecha, puntuación final). Reduce el ancho de la hoja
  y facilita agregar/quitar piezas del checklist sin tocar el esquema.
- **1 spreadsheet por módulo**, no todo en un solo archivo gigante (ver
  `Config.gs`).

## Siguiente paso

Definir esquema completo de: Vehículos, Inspecciones (ambas), Telefonía,
Caja Chica, Bajas, Incidencias — columna por columna, antes de implementar
sus Services a detalle.
