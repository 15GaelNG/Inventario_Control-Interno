# Líneas — estado del módulo

Rama `emmanuel` = `master` (con la parte 6: COMENTARIO, plantillas «(SISTEMA)», página de la responsiva, patrón con 9
puntos en el PDF, Reasignar corregido, responsables adicionales, sin «quien lo usa», firma guardada, PDF ligado fuera de su carpeta y PIN en minúsculas) · Producción: versión 62 · Última actualización: 2026-10-06

Qué es hoy el módulo **Líneas** (equipos celulares y líneas telefónicas), dónde vive cada cosa y cómo se trabaja.
La bitácora anterior de este archivo (§0a…§0ae, hasta el 1-oct) sigue en el historial de git. El diseño de las hojas
está en el plan de la reestructura y los pendientes en la lista maestra, ambos en la carpeta del proyecto de Emmanuel
(`Líneas - Control Interno/migracion/`).

## 1. Qué hace

- **Líneas Telefónicas:** tabla de equipos y líneas (selección estilo Google Drive), ficha con General, Documentos e
  Historial; Editar en pestañas con Agregar equipo / Agregar línea; TIPO se calcula solo (EQUIPO, EQUIPO + SIM,
  EQUIPO + SIM BASICO, LINEA, LINEA BASICA, BANDA ANCHA, MODEM, CAMARA).
- **Acciones con nombre:** nueva inspección, nueva responsiva, Reasignar (responsiva y luego inspección, las dos
  obligatorias; el servidor exige la inspección del día; el equipo queda en USO; el director sale de la responsiva y
  el jefe directo de la inspección o, si no, de Capital Humano; la inspección llega llenada con la responsiva, se
  puede cambiar y solo pasa al inventario los accesos: la persona la pone la reasignación), Mandar a resguardo (pide la
  inspección de lo que viene de una persona), Mandar a cancelación, Subir PDF firmado (del sistema, del AppSheet o de
  NUCOS: versión nueva del PDF de NUCOS o, si no tiene, PDF nuevo en la carpeta de NUCOS de la captura o del día),
  Regenerar PDF (responsivas del sistema: versión nueva del mismo archivo; pasadas 6 h pide solo las firmas). Cada
  acción deja un renglón en el historial con su comentario.
- **Páginas de la inspección y de la responsiva** (Documentos, doble clic o Historial): lo que dice el documento de ese
  día; a la vista Ver PDF y Subir PDF firmado, y en ⋮ Ver equipo, Ver carpeta en Drive y Generar o Regenerar PDF
  (`botonesDocumento` en lineas.html; `apiLineasInspeccion` / `apiLineasResponsiva`).
- **Inspección y responsiva:** un solo «Comentario» (columna COMENTARIO, antes OBSERVACIONES). La inspección lleva al
  jefe directo y la responsiva al director, los dos de Capital Humano como en el AppSheet.
- **Responsables adicionales:** en Editar, la responsiva y la inspección, hasta cuatro más (segundo a quinto: número de
  empleado y nombre de Capital Humano), cada uno en su bloque con «Quitar» y «Agregar responsable» debajo
  (`LineasRegistros.camposAdicionales`, condición `{ cuantos }`). Columnas `NO EMPLEADO / NOMBRE SEGUNDO… QUINTO
  RESPONSABLE` al final de ASIGNACIONES, RESPONSIVAS LINEAS e INSPECCIONES LINEAS. La inspección los pasa al inventario.
  El PDF los muestra como el AppSheet (nombres con « / »); en el sistema solo firma el principal, y con adicionales su
  firma va más chica para que los demás firmen el impreso.
  «¿El responsable usa el equipo?» y «Quien lo usa» se quitaron por completo (sus columnas, con `lineasQuitarQuienUsa`,
  LineasAdmin). En el PDF de la responsiva, con patrón solo sale su imagen.
- **Secretos** (PIN, patrones, contraseñas, firmas): los ven ADMIN y el área `LINEAS` de USUARIOS
  (`TelefoniaService.puedeVerSecretos_`).
- **Firma guardada** (`LineasFirmas.gs`): la de quien captura en Líneas va sola en FIRMA INSPECTOR o FIRMA CI («Se usa tu
  firma guardada», con «Firmar a mano»). Va cifrada en las propiedades del proyecto (clave `LINEAS_FIRMAS_CLAVE`,
  creada ahí); la imagen no llega a la pantalla y solo se usa la del correo de la sesión. Se carga con
  `lineasFirmasGuardadas_revisar` / `_cargar` (LineasAdmin) desde la carpeta privada «FIRMAS LINEAS (CARGAR)».
- **Reasignar** termina con «Ver PDF de la responsiva» y «Ver PDF de la inspección».
- **Patrón:** EQUIPOS.PATRON guarda los puntos trazados en el sistema («1-5-9») o la ruta de la imagen del AppSheet.
  General lo muestra solo si hay uno: los puntos dibujados o la imagen del AppSheet (`apiLineasPatronAppSheet`, solo
  con permiso de secretos); las capturas enseñan la imagen junto al lienzo. La inspección, la responsiva y Editar, al
  trazar uno nuevo, lo guardan en el equipo y la imagen deja de verse; al guardar una captura la ficha se pinta de nuevo.
  Con PIN EQUIPO = PATRON y patrón guardado, General muestra solo la fila «Patrón». El PDF lo dibuja igual que la
  pantalla: los 9 puntos, los usados con su número y flechas (`activarPatron` y `LineasPatronPng`, iguales).
- **Resguardos y cancelaciones:** bandeja de Pau (recibir, entregar a Líneas, vendido, cancelación con carta).
- **Panorama:** líneas y equipos por estatus, renta por cuenta y adendums, al cierre del mes elegido.
- **Notificaciones:** campana con adendums por vencer y avisos de seguimiento.
- **Accesorios** de celular, **Gestión de Activos** (por persona) y **Correcciones de Líneas** (módulo temporal).

## 2. Datos (libro de producción `17YrtuMY…`)

| Hoja | Qué guarda |
|---|---|
| LINEAS, EQUIPOS | Una fila por línea y por equipo (IDs de `Entidades.gs`) |
| ASIGNACIONES | Quién tiene qué, con FECHA INICIO / FECHA FIN (persona o resguardo), jefe directo y responsables adicionales |
| ADENDUMS, CUENTAS | Plan, costo y fin de plan por línea; cuentas padre y razón social |
| FACTURAS | Vacía: la llenará la carga mensual del proveedor |
| CATALOGOS, LISTAS TELEFONOS | Listas de opciones |
| INSPECCIONES LINEAS, RESPONSIVAS LINEAS | Los documentos capturados (PDF en NUCOS). El comentario va en COMENTARIO; mientras la hoja diga OBSERVACIONES, el sistema la toma como COMENTARIO (`LineasDatos.COLUMNAS_RENOMBRADAS`) hasta correr `lineasRenombrarColumnasDocumentos` (`LineasAdmin.gs`) |
| MOVIMIENTOS | Historial único: un renglón por acción (`LineasRepo.registrarMovimiento`) |
| APP_MOVIMIENTOS, CAMBIOS LINEAS TELEFONICAS | Historial de antes del 4-oct (APP_MOVIMIENTOS trae las pestañas retiradas con TIPO HISTORICO; CAMBIOS, la bitácora del AppSheet). La ficha los lee hasta que pasen a MOVIMIENTOS |
| APP_RESGUARDOS, APP_NOTIFICACIONES, APP_EVIDENCIAS, APP_CORRECCIONES | Bandeja de Pau, avisos, fotos y correcciones |
| ACCESORIOS CELULARES | Inventario de accesorios |
| COLABORADORES ACTUALIZADO | Capital Humano (la mantiene Ayrton; Líneas solo la lee) |

`LINEAS TELEFONICAS` (la hoja del AppSheet) se retiró y se borró el 4-oct; el sistema lee y escribe solo en las hojas
de arriba (`LINEAS_LECTURA = ESTRUCTURA`, `LINEAS_HOJA_VIEJA_RETIRADA`).

**Drive:** documentos y fotos en la carpeta de cada NUCO dentro de NUCOS (`LINEAS_DRIVE_NUCOS`); lo que no tiene NUCO, en
la carpeta de la app (`LINEAS_DRIVE_APPSHEET`). **PDF:** copias «(SISTEMA)» de las plantillas de Google Docs del
AppSheet, en sus mismas carpetas (FORMATOS y RESPONSIVAS_LINEAS), con «Comentario» (`LineasPdf.PLANTILLAS`; las
originales, que no se tocan, en `PLANTILLAS_APPSHEET`; las copias las hace `lineasPlantillasComentario_copiar`);
la responsiva conserva los márgenes de su plantilla y su interlineado se ajusta para salir igual que la impresión del
AppSheet (HTML con Chromium), en 2 hojas (`LineasPdf.COMO_APPSHEET`). El patrón se puede dibujar en el servidor
(`LineasPatronPng.gs`). Si el PDF ligado a una captura del sistema ya no está en su carpeta de NUCOS (alguien lo quitó
a mano en Drive), se usa el PDF que sí está en esa carpeta (el del mismo nombre o el más reciente «INSP…» / «RESP…») y
se vuelve a ligar en APP_EVIDENCIAS y en la columna del PDF (`LineasRepo.revisarPdfsLigados` con
`LineasArchivos.pdfsFueraDeCarpeta`; al ver Documentos, la página del documento o el Historial y antes de Regenerar o
Subir PDF firmado; se pregunta a Drive cada vez).

**Permisos de Google:** la app corre con la cuenta de quien publica (`executeAs: USER_DEPLOYING`). Desde la v66, Líneas
usa Drive con `DriveApp` y con el servicio avanzado Drive v3 (`LineasArchivos.listarDrive`, `appsscript.json`), no con
`UrlFetchApp`: así solo depende de los permisos de Drive y de Sheets, que toda la app necesita, y no del de servicios
externos (`script.external_request`), que no tenía la cuenta que había publicado la v65. `UrlFetchApp` queda solo en el
respaldo de pestañas retiradas de `LineasAdmin.gs` (ADMIN, una vez).

**Configuración:** bloque por scriptId en `src/config/Entornos.gs` (producción `1NbOczw…`, DEV de Emmanuel `1rpvvay…`).
Los archivos del AppSheet (rutas `TABLA_Images/…`) se buscan en la carpeta de la app y, si no están en la ruta, por
su nombre dentro de ella (`LineasArchivos.resolver`); el DEV además los lee de la carpeta de producción
(`LINEAS_DRIVE_APPSHEET_LECTURA`, solo lectura).

## 3. Archivos

| Archivo | Qué hace |
|---|---|
| `src/services/TelefoniaService.gs` + `apiLineas*` en `ClientApi.gs` | Entrada del cliente |
| `lineas/LineasLectura.gs`, `LineasEscritura.gs` | Leen y escriben las hojas nuevas |
| `lineas/LineasRepo.gs`, `LineasDatos.gs`, `LineasUtil.gs` | Acceso a datos, IDs, normalización (NUCO a 4 dígitos) |
| `lineas/LineasRegistros.gs` | Formulario de alta y edición (reglas del AppSheet) |
| `lineas/LineasCaptura.gs`, `LineasChecklist.gs`, `LineasPdf.gs`, `LineasPatronPng.gs`, `LineasEvidencias.gs`, `LineasArchivos.gs` | Inspección y responsiva: checklist, firmas, fotos, PDF (y la imagen del patrón) y Drive |
| `lineas/LineasAcciones.gs`, `LineasResguardos.gs` | Reasignar, Mandar a resguardo y bandeja de Pau |
| `lineas/LineasPanorama.gs`, `LineasNotificaciones.gs`, `LineasExportar.gs` | Panorama, avisos y Exportar a Excel |
| `lineas/LineasAccesorios.gs`, `LineasCorrecciones.gs` (+ `LineasCorreccionesSemilla.gs`, fuera de git) | Accesorios y Correcciones |
| `lineas/LineasEstructura.gs`, `LineasRetiro.gs`, `LineasReestructura.gs`, `LineasRevisionBD.gs` | Herramientas de la reestructura (ya corridas; no se vuelven a usar) |
| `lineas/LineasAdmin.gs` | Utilidades que se corren desde el editor |
| `html/js/lineas.html`, `lineas-correcciones.html`, `html/lineas-estilos.html`, `html/views/lineas/*` | Pantallas |
| `tests/lineas-*.test.cjs`, `pdf-render.test.cjs` | Pruebas (`npm test`) |

## 4. Cómo se trabaja

1. Cambiar en `emmanuel`, `npm test`, commit.
2. Probar en el DEV de Emmanuel: `npx clasp push --force` (su `.clasp.json` apunta al DEV, con copia de la base de producción).
3. Unir con `master` antes de publicar (`git fetch`, merge de `origin/master`).
4. Publicar: `clasp push` a producción, `clasp version` y `clasp redeploy` de **las dos** `/exec` a la misma versión.
5. Nunca editar en el editor web de Apps Script: una pestaña vieja al guardar regresa todo el proyecto (pasó con la v47).

## 5. Reglas del módulo

- Igual al AppSheet salvo lo que el área pidió cambiar; la referencia exacta del AppSheet (v1.001924) está en la carpeta
  `logica/` del proyecto de Emmanuel.
- Solo Líneas: no se tocan módulos ni hojas de los compañeros (Capital Humano se lee, no se escribe).
- Íconos de Lucide, textos cortos y técnicos, espera visible desde el clic, sin confirmaciones de más.
- En archivos `.html`, nunca `//` dentro de un string de JS (ver `CLAUDE.md`).
- Todo se escribe en mayúsculas (regla de `app.html`) salvo los campos con `data-respetar-texto`: PIN de WhatsApp,
  PIN o contraseña del equipo, contraseña del módem y correo (`literal` o `secreto` en el formulario). La excepción vive
  en `app.html`: al unir `master`, conservarla (`tests/lineas-pin-minusculas.test.cjs` falla si se pierde).
