# Líneas — estado del módulo

Ramas `emmanuel` = `master` · Producción: versión 56 · Última actualización: 2026-10-06

Qué es hoy el módulo **Líneas** (equipos celulares y líneas telefónicas), dónde vive cada cosa y cómo se trabaja.
La bitácora anterior de este archivo (§0a…§0ae, hasta el 1-oct) sigue en el historial de git. El diseño de las hojas
está en el plan de la reestructura y los pendientes en la lista maestra, ambos en la carpeta del proyecto de Emmanuel
(`Líneas - Control Interno/migracion/`).

## 1. Qué hace

- **Líneas Telefónicas:** tabla de equipos y líneas (selección estilo Google Drive), ficha con General, Documentos e
  Historial; Editar en pestañas con Agregar equipo / Agregar línea; TIPO se calcula solo (EQUIPO, EQUIPO + SIM,
  EQUIPO + SIM BASICO, LINEA, LINEA BASICA, BANDA ANCHA, MODEM, CAMARA).
- **Acciones con nombre:** nueva inspección, nueva responsiva, Reasignar (responsiva y luego inspección, las dos
  obligatorias; el servidor exige la inspección del día; el equipo queda en USO), Mandar a resguardo (pide la
  inspección de lo que viene de una persona), Mandar a cancelación, Subir PDF firmado (del sistema, del AppSheet o de
  NUCOS: versión nueva del PDF de NUCOS o, si no tiene, PDF nuevo en la carpeta de NUCOS de la captura o del día),
  Regenerar PDF (responsivas del sistema: versión nueva del mismo archivo; pasadas 6 h pide solo las firmas). Cada
  acción deja un renglón en el historial con su comentario.
- **Secretos** (PIN, patrones, contraseñas, firmas): los ven ADMIN y el área `LINEAS` de USUARIOS
  (`TelefoniaService.puedeVerSecretos_`).
- **Patrón:** EQUIPOS.PATRON guarda los puntos trazados en el sistema («1-5-9») o la ruta de la imagen del AppSheet.
  General lo muestra solo si hay uno: los puntos dibujados o la imagen del AppSheet (`apiLineasPatronAppSheet`, solo
  con permiso de secretos); las capturas enseñan la imagen junto al lienzo. La inspección, la responsiva y Editar, al
  trazar uno nuevo, lo guardan en el equipo y la imagen deja de verse; al guardar una captura la ficha se pinta de nuevo.
  Con PIN EQUIPO = PATRON y patrón guardado, General muestra solo la fila «Patrón».
- **Resguardos y cancelaciones:** bandeja de Pau (recibir, entregar a Líneas, vendido, cancelación con carta).
- **Panorama:** líneas y equipos por estatus, renta por cuenta y adendums, al cierre del mes elegido.
- **Notificaciones:** campana con adendums por vencer y avisos de seguimiento.
- **Accesorios** de celular, **Gestión de Activos** (por persona) y **Correcciones de Líneas** (módulo temporal).

## 2. Datos (libro de producción `17YrtuMY…`)

| Hoja | Qué guarda |
|---|---|
| LINEAS, EQUIPOS | Una fila por línea y por equipo (IDs de `Entidades.gs`) |
| ASIGNACIONES | Quién tiene qué, con FECHA INICIO / FECHA FIN (persona o resguardo) |
| ADENDUMS, CUENTAS | Plan, costo y fin de plan por línea; cuentas padre y razón social |
| FACTURAS | Vacía: la llenará la carga mensual del proveedor |
| CATALOGOS, LISTAS TELEFONOS | Listas de opciones |
| INSPECCIONES LINEAS, RESPONSIVAS LINEAS | Los documentos capturados (PDF en NUCOS) |
| MOVIMIENTOS | Historial único: un renglón por acción (`LineasRepo.registrarMovimiento`) |
| APP_MOVIMIENTOS, CAMBIOS LINEAS TELEFONICAS | Historial de antes del 4-oct (APP_MOVIMIENTOS trae las pestañas retiradas con TIPO HISTORICO; CAMBIOS, la bitácora del AppSheet). La ficha los lee hasta que pasen a MOVIMIENTOS |
| APP_RESGUARDOS, APP_NOTIFICACIONES, APP_EVIDENCIAS, APP_CORRECCIONES | Bandeja de Pau, avisos, fotos y correcciones |
| ACCESORIOS CELULARES | Inventario de accesorios |
| COLABORADORES ACTUALIZADO | Capital Humano (la mantiene Ayrton; Líneas solo la lee) |

`LINEAS TELEFONICAS` (la hoja del AppSheet) se retiró y se borró el 4-oct; el sistema lee y escribe solo en las hojas
de arriba (`LINEAS_LECTURA = ESTRUCTURA`, `LINEAS_HOJA_VIEJA_RETIRADA`).

**Drive:** documentos y fotos en la carpeta de cada NUCO dentro de NUCOS (`LINEAS_DRIVE_NUCOS`); lo que no tiene NUCO, en
la carpeta de la app (`LINEAS_DRIVE_APPSHEET`). **PDF:** plantillas de Google Docs del AppSheet (`LineasPdf.PLANTILLAS`);
la responsiva conserva los márgenes de su plantilla y su interlineado se ajusta para salir igual que la impresión del
AppSheet (HTML con Chromium), en 2 hojas (`LineasPdf.COMO_APPSHEET`). El patrón se puede dibujar en el servidor
(`LineasPatronPng.gs`).

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
