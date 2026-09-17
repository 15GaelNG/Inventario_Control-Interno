# Líneas — estado del módulo

Rama `emmanuel` · Última actualización: 2026-09-17

Documento de continuidad del módulo **Líneas** (equipos y líneas telefónicas).
El plan de la mudanza está en [lineas-plan.md](lineas-plan.md); aquí se registra
qué está hecho, cómo probarlo y qué sigue.

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
Con eso las lecturas y escrituras por lotes van por la API (más rápido). Si un
proyecto no la tiene habilitada, `LineasDatos` lo detecta (error 403 con
`SERVICE_DISABLED`), lo recuerda 1 hora en caché y usa `SpreadsheetApp`: mismo
resultado, más lento con muchas filas. Es decir, la app funciona con o sin API.

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
src/services/TelefoniaService.gs   fachada: valida sesión y rol, arma lo que consume la interfaz
src/html/views/lineas/             plantillas: lineas-telefonicas, lineas-bitacora
src/html/js/lineas.html            namespace `Lineas` (carga lucide@1.46.0 + helper icono())
src/html/lineas-estilos.html       estilos .ln-*
```

Enganches en archivos compartidos (mínimos, para reducir conflictos al unir):

- `ClientApi.gs`: bloque `// --- Líneas ---` con las funciones `apiLineas*`.
- `html/Index.html`: `include` de estilos, plantillas y JS del módulo.
- `html/js/app.html`: 4 líneas en `navegarA` (Jorge también edita esa función → conflicto esperado).
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

## 5. Qué está hecho (probado en `/dev` el 2026-09-15)

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

## 6. Pendientes

**Fase 3 — operaciones (lo siguiente)**
Asignar y retirar línea, cambio de equipo, reasignar responsable, cambiar estatus,
editar datos, alta y desecho. Todas con motivo y ticket, bajo candado, con la misma
bitácora que dejaban los bots del AppSheet (`CAMBIOS LINEAS TELEFONICAS`,
`HISTORIAL_REASIGNACIONES`, `BITACORA DE DESECHO`) más el movimiento en `APP_MOVIMIENTOS`.
El código del prototipo ya existe (`Operaciones.js`) y falta portarlo a `LineasRepo` / `TelefoniaService`.

**Fase 4 — captura**
Inspección y responsiva: fotos y firma desde el celular, carpetas en NUCOS y PDF con las
plantillas del AppSheet (`PlantillasDoc.js` del prototipo), generado en segundo plano.

**Fase 5 — lo que falta del prototipo**
Trámites (Reactivación / Solicitudes), Líneas Post Venta (falta definir qué es),
accesorios del equipo, evidencia y autorización del desecho, usuarios adicionales.

**Mejoras técnicas**
- Usar el servicio avanzado `Sheets` en vez de llamar a la API por URL (ya está declarado).
- Revisar si conviene compartir la capa de datos con el resto del equipo (hoy `SheetUtils`
  lee la pestaña completa en cada llamada).

**Para el PR a `master`**
- Avisar del scope `script.external_request` y del servicio Sheets v4: cada quien tendrá
  que autorizar de nuevo su DEV.
- Conflicto esperado en `navegarA` con la rama de Jorge.
- Las pestañas `APP_MOVIMIENTOS` y `APP_EVIDENCIAS` se crean solas en la hoja que use Líneas.
