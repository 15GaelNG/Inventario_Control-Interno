# Líneas — plan de mudanza del prototipo

Rama: `emmanuel` · Responsable: Emmanuel · Estado: **propuesta** (2026-09-15)

El módulo de Líneas ya existe como prototipo funcional en un proyecto aparte
("CI Control Activos"): lee y escribe la misma estructura de hojas del
AppSheet (opción C: misma hoja, mismas carpetas, capa de traducción) y ya
cubre inventario de equipos/líneas, detalle, historial, evidencias,
operaciones con bitácora, inspección y responsiva con PDF. Este documento
define cómo se muda a este repo **adaptándose a la arquitectura del equipo**,
no al revés.

## 1. Lo que ya define el repo (y el prototipo adopta)

| Tema | Repo del equipo | Prototipo hoy | Decisión |
|---|---|---|---|
| Sesión | `Auth` con token (correo+contraseña o Google), roles ADMIN / OPERADOR / LECTURA | `Session.getActiveUser()` + pestaña `APP_USUARIOS` | Usar `Auth`: toda API recibe `token`; se quita `APP_USUARIOS` |
| API cliente | `ClientApi.gs`: wrappers delgados hacia `services/` | funciones `api*` sueltas | Bloque `// --- Líneas ---` en `ClientApi.gs` |
| Código servidor | Namespaces `const X = (function(){…})()` | ~200 funciones globales con `_` | Todo dentro de namespaces `Lineas*` (en Apps Script todos los archivos comparten el scope global: evita choques con Jorge/Ayrton) |
| Configuración | `Config.SPREADSHEET_IDS.TELEFONIA()` (Script Property `SS_ID_TELEFONIA`) | `CONFIG` + `BD_SPREADSHEET_ID` | Usar `Config`; carpetas de Drive también por Script Properties |
| Vistas | `<template>` en `html/views/`, `init*()` en `app.html`, menú `NAV_GRUPOS` | SPA propia (`app.html`, `formularios.html`) | Plantillas y JS propios del módulo, con el sistema visual del equipo |
| Estilos | Poppins, azul marino/dorado, modo oscuro, `.card`, `.stat-tile`, tablas, modales | Estilos propios | Reusar tokens y componentes; solo clases extra con prefijo `.ln-` |
| Fechas al cliente | ISO (Date crudo rompe `google.script.run`) | Ya se serializa | Igual |

## 2. Mapeo del menú "Líneas"

| Menú (ya existe en `NAV_GRUPOS`) | Contenido | Origen |
|---|---|---|
| Líneas Telefónicas | Inventario equipos/líneas: indicadores, búsqueda, filtros, tabla, detalle (ficha, evidencias, historial) y acciones: asignar/retirar línea, cambio de equipo, reasignar, estatus, editar, alta, desechar, inspección, responsiva | Prototipo (se rediseña la UI) |
| Control de Reasignaciones - Líneas | Tabla de `HISTORIAL_REASIGNACIONES` con filtros y exportar CSV | Nuevo sobre la capa del prototipo |
| Control de Cambios - Líneas | Tabla de `CAMBIOS LINEAS TELEFONICAS` | Nuevo sobre la capa del prototipo |
| Bitácora de Desechos | Tabla de `BITACORA DE DESECHO` (folio DR) | Prototipo (desechar) + vista nueva |
| Reactivación de Líneas | Trámites `REACTIVACION DE LINEAS` (y solicitudes) | Pendiente en el prototipo |
| Líneas Post Venta | Por definir | Por definir |
| Inventario de Accesorios | Ya construido (`AccesoriosService`) | Por confirmar dueño |

Alertas de inspección: indicador dentro de "Líneas Telefónicas".

## 3. Estructura de archivos

Todo lo del módulo en archivos propios; en archivos compartidos solo
líneas puntuales para reducir conflictos al juntar en `master`.

```
src/services/lineas/
  LineasDatos.gs        acceso a Sheets con caché, TextFinder, escritura por lotes, zona horaria
  LineasRepo.gs         traducción hoja AppSheet ↔ objetos (equipos, líneas, bitácora, evidencias)
  LineasOperaciones.gs  operaciones con candado + bitácora igual que los bots del AppSheet
  LineasCaptura.gs      inspección y responsiva (fotos, firma)
  LineasPdf.gs          plantillas Google Docs con sintaxis <<…>> del AppSheet
  LineasAdmin.gs        tareas de mantenimiento (índices, sincronizar evidencias, reporte de calidad)
src/services/TelefoniaService.gs   fachada pública del módulo (reemplaza el stub)
src/html/views/lineas/*.html       una plantilla por vista del menú
src/html/js/lineas.html            init de cada vista + formularios
src/html/lineas-estilos.html       estilos .ln-* del módulo
```

Toques a archivos compartidos (avisar al equipo en el PR):

- `ClientApi.gs`: bloque `// --- Líneas ---`.
- `html/Index.html`: `include` de las vistas, JS y estilos del módulo.
- `html/js/app.html`: una línea por vista en `navegarA` (Jorge también modifica
  `navegarA` en su rama → conflicto esperado y sencillo de resolver).
- `SetupInicial.gs` → `configurarEntornoDev`: agregar `SS_ID_TELEFONIA` y carpetas de Líneas.
- `appsscript.json`: el prototipo usa `script.external_request` (API REST de
  Sheets para leer/escribir por lotes). Agregar un scope pide re-autorizar a
  todos → decidir con el equipo o reemplazar por `SpreadsheetApp`.
- Pestañas `APP_MOVIMIENTOS` y `APP_EVIDENCIAS` en la BD: se agregan a la hoja
  que use Líneas (no tocan las pestañas del AppSheet).

## 4. Fases

1. **Entorno DEV**: Script Properties de Líneas en el proyecto DEV, login funcionando en la URL `/dev`.
2. **Base + lectura**: capa de datos en namespaces con `Auth`; vistas Líneas Telefónicas (lista + detalle), Control de Cambios, Control de Reasignaciones, Bitácora de Desechos.
3. **Operaciones**: asignar/retirar, cambio de equipo, reasignar, estatus, editar, alta, desechar.
4. **Captura**: inspección y responsiva con fotos, firma y PDF en segundo plano.
5. **Pendientes del prototipo**: reactivación/solicitudes, post venta, accesorios de equipo, alertas.
6. **PR a `master`** por fase (ramas cortas, como pide el README).

## 5. Preguntas abiertas

- ¿La BD de pruebas del equipo (`1fC77…`) tiene todas las pestañas de telefonía y es una copia **no conectada** a un AppSheet en uso? El prototipo trabaja sobre su propia copia (`1_47fd5…`) con carpetas de evidencias de prueba.
- ¿Qué es "Líneas Post Venta" en el AppSheet?
- ¿"Inventario de Accesorios" queda con quien lo construyó o pasa a Líneas?
- ¿Se acepta el scope `script.external_request` en el manifiesto compartido?
