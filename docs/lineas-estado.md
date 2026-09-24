# Líneas — estado del módulo

Rama `emmanuel` · Última actualización: 2026-09-24

Documento de continuidad del módulo **Líneas** (equipos y líneas telefónicas).
El plan de la mudanza está en [lineas-plan.md](lineas-plan.md); aquí se registra
qué está hecho, cómo probarlo y qué sigue.

## 0. Diseño de la rama `jorge` (2026-09-24, commit `d2b316c`)

La estructura del sistema se **copió** de `origin/jorge` (sin merge, para que al
unir no se borre nada de nadie) y **sin sus módulos**:

- Copiado tal cual: `styles.html`, `api.html`, `html/js/componentes/*` (DataTable,
  Notificar, Confirmar, Tabs, Combobox, Formulario, Firma, Lienzo, ExportarExcel,
  Iconos), `views/login|loading`, `Code.gs`, `Router.gs`, `config/Config.gs`,
  `config/Modulos.gs`, `PermisosService.gs`, `UsuariosService.gs`,
  `utils/SheetUtils.gs`, `assets/`, `CLAUDE.md`.
- Adaptado: `app.html` (sin `initIncidencias/Vehiculos/Uber/Tickets/Accesorios` ni
  campos de vehículos; `NAV_GRUPOS` y `navegarA` solo con Líneas), `Index.html`
  (solo vistas de Líneas; `lineas.html` se carga después de la librería de
  componentes), `dashboard.html` (tarjetas de Líneas), `Modulos.gs` (grupo Líneas
  con los 10 ids reales), `Auth.gs` (el de jorge + la verificación con hash que ya
  tenía esta rama). Lucide queda en 0.513.0 porque Líneas usa `card-sim`.
- Los archivos viejos de los compañeros que ya existían en esta rama
  (`AccesoriosService`, `IncidenciasService`, `VehiculosService`, vistas
  `accesorios`/`incidencias`) no se tocaron ni se incluyen en `Index.html`.
- `app.html` de jorge pone mayúsculas automáticas en todos los campos de texto;
  los campos que se guardan tal cual llevan `data-respetar-texto` (línea mínima
  agregada en `app.html`).
- **Regla de Apps Script** (ver `CLAUDE.md`): los `.html` se sirven con
  `createHtmlOutputFromFile` y todo lo que va después de `//` se corta, aunque esté
  en un string. Las URL dentro de JS van como `'https:\/\/…'`. Hay una prueba que
  lo revisa.

Líneas con el lenguaje visual de jorge: `page-header` + `stat-tile` clicables
(filtran la tabla, otro clic quita el filtro) + `DataTable` en Líneas Telefónicas
(pestañas Equipos/Líneas; ojo o doble clic abre la ficha), Inventario de
Accesorios (panel con movimientos; flechas para entrada/salida), Reactivación,
Solicitud (panel con todos los campos) y las tres bitácoras. Las
tablas llegan completas como texto JSON (`apiLineasBitacoraTabla`,
`apiLineasVistaOperativaTabla`, hasta 5000 filas); Control de Cambios carga los
5000 más recientes y ofrece “Buscar en todo el historial”. Gestión de Activos
conserva sus tarjetas tipo AppSheet (Detalles pasó a ser la vista de tarjetas, ver 0c). Los avisos usan `Notificar`.
Helpers en `lineas.html`: `tablaLineas`, `columnasDeHoja`, `tilesKpi`.

De paso se corrigieron encabezados que no coincidían con la hoja (se perdían en
consulta y en altas): `LINIEA SUSPENDIDA` (así se llama en la hoja) y
`NO EMPLEADO / NOMBRE / PUESTO / DEPARTAMENTO SOLICITANTE`.

Al unir con master: tomar el `app.html`/`Index.html`/`Modulos.gs` de master y
volver a aplicar los bloques marcados “Líneas (rama emmanuel)”.

## 0b. Lógica igual al AppSheet (2026-09-24, commits `421f98d` → `94f5e93`)

Telefonía replica la definición del AppSheet v1.001924 (auditoría completa en la carpeta de documentación:
`migracion/AUDITORIA_APPSHEET_TELEFONIA.md`): orden de formularios, display names, listas y su orden,
Show_If / Required_If / Editable_If / Reset_If / Valid_If con sus mensajes, valores iniciales, folios y bots
(ACTUALIZAR DESDE INSPECCION, CAMBIOS TELEFONIA de 23 campos, MAYUSCULAS, FOLIO DESECHO), reglas de formato y
columnas/orden de las vistas de tabla.

**Cómo están hechos los formularios.** El servidor arma cada formulario como una lista de elementos en el orden
del AppSheet (`LineasCaptura` para inspección/responsiva, `LineasRegistros` para LINEAS TELEFONICAS,
`LineasOperativas` para Reactivación/Solicitud/Desecho). Cada campo trae `control`, `opciones`, `valor` inicial y
condiciones (`'SIEMPRE'`, códigos sobre TIPO o `{ tipoEn }`, `{ campo, igual }`, `{ nuevo }`, `{ y: [...] }`).
`lineas.html` los dibuja (`htmlFormularioAppSheet`), aplica las reglas en vivo y valida; el servidor vuelve a
aplicar Editable/Reset/Valid_If al guardar. Para portar otra tabla del AppSheet basta con escribir su lista.

Mejoras sobre AppSheet ya decididas: CONTRASEÑA MODEM se precarga en la inspección; se conservan fotos, patrón
de 9 puntos, COLOR persistente y la carpeta NUCOS para PDFs.

## 0c. Cambios pedidos por el área (2026-09-24, después de la réplica)

Primeras mejoras que AppSheet no permitía:

- **Menú.** Se retiró *Líneas Post Venta* (el módulo deja de existir). *Gestión de Activos* sale del grupo
  Líneas y queda como acceso propio debajo del desplegable (en `NAV_GRUPOS`, una entrada con `vista` y sin
  `items` es un acceso suelto; en `Modulos.gs` es su propio grupo). *Detalles Líneas Telefónicas* dejó de ser
  módulo: era la misma tabla con otra vista.
- **Tabla / Tarjetas.** Líneas Telefónicas tiene un selector *Tabla | Tarjetas* (se recuerda en el navegador).
  Las tarjetas muestran exactamente lo que filtra la tabla (búsqueda, filtros de columna, orden y KPIs): se
  agregó `getFiltradas()` al DataTable (solo lectura) y un `MutationObserver` repinta las tarjetas cuando la
  tabla se repinta.
- **Detalles para copiar.** La ficha de equipo y de línea muestra el texto de la columna virtual
  `DETALLES LINEAS TELEFONICAS` del AppSheet, en su orden (NUCO, Motivo de resguardo, Ticket / Asunto, Código de
  resguardo = RESPONSABLE, IMEI, SIM, Número, Modelo, Compañía, Razón Social, Estatus de adendum = FIN PLAN,
  Estatus actual de la línea), con botón *Copiar detalles*. Motivo, ticket y estatus actual (que AppSheet dejaba
  en blanco) se escriben ahí antes de copiar y no se guardan; el estatus actual se propone con ESTATUS LINEA.
  Los valores salen crudos de la fila (`convertirRegistro` → `detalles`), igual que la fórmula.
- **Historial filtrable y exportable.** `LineasRepo.historialDeRegistro` regresa una lista plana
  (`{ eventos }`, una fila por evento o por campo cambiado) que junta CAMBIOS, HISTORIAL_REASIGNACIONES,
  BITACORA DE DESECHO, REACTIVACION DE LINEAS, inspecciones y responsivas (AppSheet, Drive y sistema nuevo) y
  APP_MOVIMIENTOS. Cada fila tiene un *Movimiento* (`movimientoDeCampo`: Reasignación, Cambio de estatus, de
  línea, de plan, de equipo, de área o ubicación, de accesos, Otros cambios; más Alta, Inspección, Responsiva,
  Reactivación y Desecho). En la ficha es un DataTable con un selector *Movimiento* (solo los tipos que existen,
  con su conteo), filtros por columna y *Exportar a Excel*. Un cambio de RESPONSABLE de la bitácora no se repite
  si ese día ya hay reasignación con el mismo responsable entrante. De paso: la edición ahora marca su
  reasignación (`idsReasignacion`) para no duplicarla.
- **Excel y botones.** Ya no hay descargas CSV: todo se exporta con *Exportar a Excel* del DataTable. Nombres
  únicos: *Registrar …* para altas (NUCO, artículo, reactivación, solicitud, desecho), *Guardar cambios* al
  editar, *Ver PDF*, *Ver carpeta en Drive*, *Limpiar firma*. Medidas únicas (las de la barra del DataTable) y
  colores del sistema: acciones en azul de marca, `.secondary` para cancelar/volver, `a.externo` para Drive/PDF,
  verde para Excel (sección "Botones" de `lineas-estilos.html`).

## 1. Contexto

El módulo viene de un prototipo propio ("CI Control Activos") que ya funcionaba
sobre la **misma hoja del AppSheet** (opción C: misma estructura, mismas carpetas
de Drive, capa de traducción). Se está mudando a este repo adaptándose a la
arquitectura del equipo: `Auth` con token, `ClientApi`, services en namespaces,
vistas `<template>` + `init*`, y el sistema visual del equipo.

Reglas vigentes:

- **Solo se toca lo de Líneas.** Los módulos de los compañeros se adaptan al unir en `master`.
- **El AppSheet de producción no se toca** (solo lectura). Todo el trabajo va sobre la copia de pruebas.
- **Íconos de [lucide.dev](https://lucide.dev/icons)**, no emojis (el diseño se irá ajustando).

## 2. Infraestructura

| Qué | Dónde |
|---|---|
| Hoja de Líneas (DEV) | `1_47fd5nCcg4M6Qnsxmk14r9aTJG2bCPSW86ig_r2478` — copia del AppSheet con datos de prueba y pestañas `APP_` |
| Hoja de producción (bloqueada) | `1h5ibDsmVtrG27rwMaOvj-lm08QZUHzDv3woPmkfRQrk` |
| Carpeta de pruebas en Drive | `1ZNI2tVANe3qBglcQ5sisCctGBe4Qetmk` (inventarios de NUCOS y evidencias) |
| Proyecto DEV de Apps Script | `1rpvvay1hBTFfm5paVyvy6-Thmx-CQ6uUWVef20Jr8VmHQxkCWZ7UmeOa` |
| URL de pruebas | `https://script.google.com/a/macros/ciudadmaderas.com/s/AKfycbwNWp2uwP_jqCayH6hJhCJh2TiudyC8heqOhZ8NuU90/dev` |

Script Properties que usa Líneas (las deja `configurarLineasDev()`):

- `SS_ID_TELEFONIA` → hoja de Líneas.
- `LINEAS_DRIVE_CARPETA_RAIZ` → carpeta de pruebas (para las carpetas de evidencia por NUCO).

**API de Sheets:** el proyecto DEV ya tiene agregado el servicio avanzado
**Google Sheets API v4** (Editor → Servicios → +), declarado en `src/appsscript.json`.
Desde el 2026-09-17 `LineasDatos.sheetsApi()` llama directo al servicio avanzado
(`Sheets.Spreadsheets.Values.batchGetByDataFilter/batchUpdate`) en vez de
`UrlFetchApp` + `ScriptApp.getOAuthToken()`; la respuesta tiene la misma forma
que la API REST, así que el resto del archivo no cambió. Si un proyecto no
tiene el servicio habilitado, `LineasDatos` lo detecta igual que antes (el
mensaje de error contiene "has not been used"/"disabled"), lo recuerda 1 hora
en caché y usa `SpreadsheetApp`: mismo resultado, más lento con muchas filas.
Es decir, la app funciona con o sin el servicio avanzado.

**Rol ADMIN (para ver PIN/patrón/contraseñas):** el rol se lee de la columna
`ROL` en la hoja `USUARIOS` (BD de pruebas del equipo, Script Property
`SS_ID_USUARIOS`; ver `Auth.mapearRol_` en `src/Auth.gs` — no es un archivo de
Líneas, no se toca). Para ver los campos secretos en tu ficha de equipo: en esa
hoja, en tu fila, pon `ADMIN` en `ROL`, guarda y vuelve a iniciar sesión en `/dev`
(el rol queda fijo en el token de sesión 8 h). Ojo: capturar una inspección o
responsiva **no** requiere ser ADMIN — el rol OPERADOR ya puede operar
(`rolesOperan_`); ADMIN solo cambia qué se **muestra** en la ficha, porque el
PDF de la inspección/responsiva sí lleva el PIN/patrón sin importar el rol
(igual que en el AppSheet: es el documento físico que se firma).

**⚠️ Pendiente de corregir a mano (2026-09-17):** al intentar cambiar el ROL
por automatización de navegador, un clic falló y escribió "G57" en la celda
A18 (columna CORREO) de la pestaña `USUARIOS` de la BD de pruebas del equipo
(`1fC77Uu1ePVUySNvhgWXMHqWpLhGhBMTZZMEblU2nUhI`) — debería decir
`especialista.ci@ciudadmaderas.com` (fila de GIOVANNI JAVIER ORDUÑA DE LA
PEÑA). Hay que corregirlo a mano en la hoja. El ROL de la fila 57
(`auxiliar7datos.ci@ciudadmaderas.com`, el usuario) sí se cambió a `ADMIN`
antes de ese error — conviene confirmarlo al abrir la hoja.

## 3. Archivos del módulo

```
src/services/lineas/
  LineasDatos.gs      hoja: caché de encabezados (1 h), TextFinder, lectura/escritura por lotes,
                      zona horaria, candado, pestañas APP_, respaldo sin API de Sheets
  LineasUtil.gs       normalización del AppSheet (N/A, NUCO a 4 dígitos, fechas) y carpetas de NUCOS
  LineasChecklist.gs  checklist de inspección de equipo, calificación y alertas
  LineasRepo.gs       traducción fila ↔ equipo/línea/responsable, bitácora igual que los bots del
                      AppSheet, evidencias, historial, bitácoras, catálogos, alertas, colaboradores
  LineasAdmin.gs      configurarLineasDev() y recargarDatosLineas() (se corren desde el editor)
  LineasEvidencias.gs carpetas de evidencia en Drive (misma estructura NUCOS), subir archivo,
                      validar que un archivo pertenezca a la carpeta de la evidencia
  LineasPdf.gs        motor de plantillas Google Docs del AppSheet (<<COLUMNA>>, <<If:>>…<<EndIf>>,
                      IDs de las plantillas INSPECCION_CELULAR / RESPONSIVA_CELULAR)
  LineasCaptura.gs    contexto + guardar inspección/responsiva nueva (checklist, snapshot, alertas,
                      bitácora, APP_EVIDENCIAS) y generar el PDF después de guardar
  LineasAccesorios.gs inventario de accesorios de celular (ACCESORIOS CELULARES /
                      MOVIMIENTOS_ACCESORIOS de la misma copia de pruebas): stock calculado,
                      alerta de reabasto, alta de artículo, entrada/salida bajo candado.
                      Módulo aparte de AccesoriosService.gs (el del equipo, conectado a producción).
src/services/TelefoniaService.gs   fachada: valida sesión y rol, arma lo que consume la interfaz
src/html/views/lineas/             plantillas: lineas-telefonicas, lineas-bitacora, lineas-detalles
                                    (buscador rápido), lineas-gestion-activos (busca colaborador →
                                    sus líneas/equipos), lineas-accesorios
src/html/js/lineas.html            namespace `Lineas` (carga lucide@1.46.0 + helper icono())
src/html/lineas-estilos.html       estilos .ln-*
```

Menú (`NAV_GRUPOS` en `html/js/app.html`) reordenado 2026-09-17: Líneas Telefónicas,
Gestión de Activos, Detalles Líneas Telefónicas, Inventario de Accesorios (el del equipo),
Reactivación, Reasignaciones, Solicitud, **Líneas Post Venta**, Cambios, Bitácora de
Desechos, y al final "Inventario de Accesorios (Líneas)" (temporal, ver arriba). El
usuario dijo que reacomoda el resto de las posiciones él mismo.

Enganches en archivos compartidos (mínimos, para reducir conflictos al unir):

- `ClientApi.gs`: bloque `// --- Líneas ---` con las funciones `apiLineas*`.
- `html/Index.html`: `include` de estilos, plantillas y JS del módulo.
- `html/js/app.html`: `NAV_GRUPOS` (grupo "Líneas") y líneas en `navegarA` (Jorge también
  edita esa función → conflicto esperado).
- `appsscript.json`: scope `script.external_request` + servicio avanzado Sheets v4.

## 4. Cómo trabajar

```
git checkout emmanuel && git pull
git merge origin/master          # traer lo que ya se juntó
npm run push                     # sube a TU proyecto DEV
```

- **Después de cada `clasp push`, recarga el editor de Apps Script antes de ejecutar
  cualquier función.** Si el editor quedó abierto desde antes, al pulsar Ejecutar guarda
  su copia vieja y pisa lo que acabas de subir (ya pasó una vez).
- Revisar sintaxis antes de subir: `node --check` sobre los `.gs` y sobre el contenido
  del `<script>` de los `.html` (también todo junto, para detectar nombres repetidos).
- Probar en la URL `/dev` (siempre corre el último código subido). En el navegador
  integrado los clics solo llegan si el panel está visible y la pestaña de la app al frente.
- `configurarLineasDev()` se corre una vez por proyecto DEV; `recargarDatosLineas()`
  vacía las cachés si editas la hoja a mano.

## 5. Captura de inspección y responsiva (nuevo, 2026-09-17 — sin probar en `/dev` todavía)

Botones **Nueva inspección** / **Nueva responsiva** en la ficha del equipo (o de
una línea suelta), visibles solo si `puedeOperar` (ADMIN u OPERADOR):

1. Al abrir el modal se piden en paralelo el contexto (equipo/línea, responsable,
   checklist aplicable según el tipo, resultado de la inspección anterior) y se
   crea ya la carpeta de evidencia en Drive (misma estructura que producción:
   `<NUCO>/INSPECCIONES/<AÑO>/<CUATRIMESTRE>/<MES>/INSP DD MM/FOTOS` o
   `<NUCO>/CARTA RESPONSIVA/<AÑO>/RESP DD MM`).
2. Checklist por secciones con pastillas (SI/NO/N-A, BUENO/REGULAR/MALO,
   INSTALADA/NO INSTALADA), precargado con el valor de la inspección anterior si
   existe. Fotos con `<input type=file capture>` (se redimensionan a 1600 px /
   JPEG .82 en el navegador antes de subirse). Firma en un `<canvas>` (sin
   librería, con Pointer Events).
3. Al guardar: sube las firmas, llama `apiLineasGuardarInspeccion` /
   `apiLineasGuardarResponsiva` (fila nueva + bitácora + `APP_EVIDENCIAS`, bajo
   candado, igual que el prototipo) y **después** pide `apiLineasGenerarPdf` en
   segundo plano (para no bloquear ~30-40 s por el PDF) con las plantillas del
   AppSheet (Google Docs, IDs en `LineasPdf.PLANTILLAS`; la plantilla original
   nunca se toca, se copia y se manda a la papelera la copia temporal).

**Pendiente de probar en el navegador de verdad** (el integrado no maneja bien
`<input type=file>`/cámara ni canvases con Pointer Events): abrir un equipo sin
línea o con línea, capturar una inspección completa y una responsiva, confirmar
que el PDF se genera y que el enlace aparece en la tarjeta de evidencias.

## 6. Qué está hecho (probado en `/dev` el 2026-09-15)

**Líneas Telefónicas**

- Indicadores que filtran al hacer clic: 1,583 equipos, 847 en uso, 637 sin línea,
  978 líneas, 32 sueltas, 54 alertas de inspección.
- Pestañas Equipos / Líneas con búsqueda, filtros, paginación de 50 y exportar CSV.
- Ficha de equipo y de línea: datos, línea asignada, responsable (con usuarios
  adicionales), registro en la hoja, inspecciones, responsivas e historial.
- Detalle de inspección: checklist por secciones, alertas contra la anterior,
  fotos y firmas de Drive, enlaces a los PDF.
- Ventana de alertas de inspección (solo la más reciente por equipo o todas).
- PIN, patrones, contraseñas y firmas: solo rol ADMIN.

**Bitácoras** (Control de Cambios 35,016 filas · Reasignaciones 1,401 · Desechos 234)

- Se leen de la más reciente a la más antigua, por páginas.
- Búsqueda en cualquier columna, resuelta en la hoja (~3 s en la de cambios).
- Botón **Ver** que abre ese equipo o línea en Líneas Telefónicas.
- Exportar la página a CSV.

**Rendimiento y datos**

- Índice de listados en caché 30 min; encabezados 1 h; catálogos 6 h; alertas 30 min.
- La ficha se muestra primero y las evidencias y el historial se piden en paralelo.
- Fechas en hora de México aunque la hoja esté en otra zona horaria.
- SIM, IMEI y teléfonos se conservan como texto (no se convierten en número).

## 7. Pendientes

**Fase 3 — operaciones (lo siguiente)**
Asignar y retirar línea, cambio de equipo, reasignar responsable, cambiar estatus,
editar datos, alta y desecho. Todas con motivo y ticket, bajo candado, con la misma
bitácora que dejaban los bots del AppSheet (`CAMBIOS LINEAS TELEFONICAS`,
`HISTORIAL_REASIGNACIONES`, `BITACORA DE DESECHO`) más el movimiento en `APP_MOVIMIENTOS`.
El código del prototipo ya existe (`Operaciones.js`) y falta portarlo a `LineasRepo` / `TelefoniaService`.

**Fase 4 — captura**
Backend y formulario ya están (ver sección 5); falta probarlo en un navegador de
verdad (fotos/cámara y firma) y, si algo no coincide con las plantillas reales
del AppSheet, ajustar `LineasPdf`/`LineasCaptura`.

**Fase 5 — lo que falta del prototipo**
Trámites (Reactivación / Solicitudes), Líneas Post Venta (falta definir qué es),
accesorios del equipo, evidencia y autorización del desecho, usuarios adicionales.

**Mejoras técnicas**
- Revisar si conviene compartir la capa de datos con el resto del equipo (hoy `SheetUtils`
  lee la pestaña completa en cada llamada).

**Para el PR a `master`**
- Avisar del scope `script.external_request` y del servicio Sheets v4: cada quien tendrá
  que autorizar de nuevo su DEV.
- Conflicto esperado en `navegarA` con la rama de Jorge.
- Las pestañas `APP_MOVIMIENTOS` y `APP_EVIDENCIAS` se crean solas en la hoja que use Líneas.


## Revisión de experiencia de uso · 2026-09-18

- Inspección: se retiró el campo «Otra aplicación» de la captura; el backend conserva compatibilidad con los registros históricos.
- Observaciones de inspección, responsiva y formularios de seguimiento: ancho completo, alto mínimo de 160 px, tipografía y foco consistentes. Comentarios de movimientos de accesorios ahora admiten varias líneas.
- Consulta de inspección: mismas cuatro secciones que la captura, accesos directos por sección, observaciones independientes, fotografías más grandes con nombre, acceso a Drive y estado alternativo si no carga la miniatura.
- Inventario y evidencias: botones explícitos para abrir fichas/inspecciones; limpiar filtros; pestaña activa identificada para lectores de pantalla. La navegación evita repetir el mismo equipo/inspección en la ruta.
- Reactivación, Solicitudes y Post Venta: tabla de resumen y ficha modal con todos los campos disponibles. Exportación mantiene todas las columnas.
- Reasignaciones, Cambios y Desechos: ficha de consulta completa, además del acceso al activo cuando existe.
- Accesorios: acceso visible a movimientos, guardado con estado ocupado, protección contra doble clic y validación de cantidades enteras positivas.
- Solicitudes y Reactivación: campos etiquetados, formulario más amplio, estado de guardado y confirmación visible. Búsquedas y navegación descartan respuestas antiguas; exportación deshabilitada mientras se carga.
- Roles y módulos de otros equipos permanecen fuera del alcance de esta revisión.

Validación: ejecutar npm test; recorrer los diez módulos en /dev; abrir una ficha operativa y una de bitácora; consultar una inspección histórica con fotos y otra del sistema; revisar observaciones sin guardar documentos de prueba. No se generan firmas ni movimientos ficticios para estas comprobaciones.
