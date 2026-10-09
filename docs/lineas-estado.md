# Líneas — estado del módulo

Rama `master` = producción (la versión vigente está en el INDICE; lo último de Líneas ahí es la parte 6 con COMENTARIO,
plantillas «(SISTEMA)», página de la responsiva, patrón con 9 puntos en el PDF, Reasignar corregido, responsables
adicionales, sin «quien lo usa», firma guardada, PDF ligado fuera de su carpeta, PIN en minúsculas y Drive sin
`UrlFetchApp`). Rama `emmanuel`: además, el PIN del equipo solo con números, sin la compatibilidad con OBSERVACIONES y
la identificación de cada responsable en la responsiva.
Lo de adendums y facturas (Exportar a Excel con la hoja armada y la pantalla Proveedor) salió de `emmanuel` el 8-oct y
queda para después (`_archivo/emmanuel_respaldo_8oct.zip` de la carpeta del proyecto) · Última actualización: 2026-10-09

Qué es hoy el módulo **Líneas** (equipos celulares y líneas telefónicas), dónde vive cada cosa y cómo se trabaja.
La bitácora anterior de este archivo (§0a…§0ae, hasta el 1-oct) sigue en el historial de git. El diseño de las hojas
está en el plan de la reestructura y los pendientes en la lista maestra, ambos en la carpeta del proyecto de Emmanuel
(`Líneas - Control Interno/migracion/`).

## 1. Qué hace

- **Líneas Telefónicas:** tabla de equipos y líneas (selección estilo Google Drive), ficha con General, Documentos e
  Historial; Editar en pestañas con Agregar equipo / Agregar línea; TIPO se calcula solo (EQUIPO, EQUIPO + SIM,
  EQUIPO + SIM BASICO, LINEA, LINEA BASICA, BANDA ANCHA, MODEM, CAMARA).
- **Agregar línea** (8-oct): «¿Se vincula a un equipo?». Sí → se elige un NUCO en USO o RESGUARDO sin línea (lista con
  modelo y responsable) y la línea queda con el equipo, en su asignación: el responsable es el del equipo y el estatus
  lo sigue (USO si está en uso, DISPONIBLE si está guardado). No → responsable a mano y opcional; USO con responsable,
  DISPONIBLE sin él. La cancelación no se elige al agregar. Con SIM BASICO no se pide ni se guarda adendum
  (`LineasRegistros.crearLineaEnEquipo_`, `estatusAltaLinea_`).
- **Estatus en Editar información** (8-oct): directo. RESGUARDO, PARA VENTA y PARA DESECHO del equipo, y EN PROCESO DE
  CANCELACION y CANCELADA de la línea, con un aviso «no se agregará en el panel de Resguardos y cancelaciones, pero se
  quedará en el historial» (Confirmar o Cancelar; el servidor los acepta solo con `datos.sinPanel`). El equipo que pasa
  a uno de esos estatus deja DISPONIBLE su línea en uso (el aviso lo dice). Al panel de Pau se llega con «Mandar a
  resguardo» y «Mandar a cancelación».
- **PIN de WhatsApp** (8-oct): en la ficha va en la información del equipo (General → Equipo, y Equipo en la ficha de
  la línea), no en la línea; sin línea no se muestra. La línea sola ya no lo muestra ni lo pide (pendiente 2.25).
- **Editar línea y Editar información** (8-oct): la línea se edita aparte (⋮ de la línea, ⋮ del equipo con línea y la
  tabla de líneas; `apiLineasFormularioRegistro(id, 'LINEA')`, `LineasRegistros.contextoEdicion_`). Una línea de un NUCO
  trae Línea y Adendum, su responsable (el del equipo) solo para ver y, como estatus, el suyo, EN PROCESO DE CANCELACION
  o CANCELADA. Editar información de un equipo con línea ya no trae la línea ni el adendum. La línea sola con
  responsable tiene «Quitar responsable» (queda DISPONIBLE); con un responsable nuevo pasa a USO y en USO lo exige.
  Un SIM BASICO sin datos de adendum no enseña el adendum (ni al agregar ni al editar).
- **Vincular, cambiar y desvincular** (8-oct; ⋮ de la ficha y clic derecho de la lista; `LineasAcciones.vincular`, `apiLineasVincular`): en el
  equipo, Vincular línea (sin línea) o Cambiar línea y Desvincular línea; en la línea, Vincular a equipo (suelta y
  DISPONIBLE) o Cambiar de equipo y Desvincular del equipo. Solo líneas sueltas DISPONIBLE y equipos en USO o RESGUARDO
  sin línea. La línea sigue al equipo (USO o DISPONIBLE); la que deja el equipo queda DISPONIBLE o va a la bandeja de
  cancelaciones («Mandar a cancelación»). Con el equipo en USO y otra línea, responsiva obligatoria con la línea nueva
  fija (ref.lineaNueva) y su comentario; si no, el comentario va en otra ventana. Movimientos ASIGNAR_LINEA («Vincular
  línea»), CAMBIO_LINEA, CAMBIO_EQUIPO y RETIRAR_LINEA («Desvincular línea»). La línea se separa con
  `LineasEscritura.separarLinea` (también con el equipo guardado, donde cambiar el estatus no los separaba).
- **Vínculos** (8-oct; `lineas-vinculos.html`): **una idea del usuario que se queda así**, apagada en producción como Help
  Desk (`vinculos-lineas` en `MODULOS_APAGADOS` del bloque de producción de `Entornos.gs`: sin botón ni espacio); en
  los DEV se ve. No tiene llamadas propias al servidor, solo abre las ventanas de siempre. Es el tercer modo de Líneas Telefónicas junto a
  Tabla y Tarjetas, con el cajón a la izquierda y dos vistas. **Grafo**: todo lo que cabe en la pantalla flotando como
  red (personas con sus equipos y líneas como íconos y sus vínculos; se prenden Personas y Sueltos), búsqueda (persona, NUCO, número también anterior, IMEI o estatus; varias con
  coma; con búsqueda salen las bajas), departamento y compañía; la rueda acerca, el fondo se arrastra y se aleja solo
  para que quepa. Lo que interesa se mete al cajón: clic en la relación y «Al cajón», arrastrarla al cajón o «Todo al
  cajón» (hasta 60). **Lienzo**: en blanco; se saca del cajón arrastrando la ficha, cada nodo se queda donde se suelta y
  se regresa al cajón arrastrándolo ahí. **Módulos** (en las dos vistas): Resguardo, Venta y desecho y Cancelación son
  cajas que se ponen a un lado de la red, se mueven del encabezado, se estiran de la esquina (caben más) y se quitan, con
  lo de su estatus flotando adentro, su buscador y su cuenta («12 de 300»); en el lienzo también vive en su caja lo
  suelto con ese estatus, y lo que se saca de un módulo se queda en el lienzo. Soltar abre la
  acción de siempre con lo soltado ya elegido (`LineasVinculos.alSoltar`): línea sobre un equipo → Vincular o Cambiar
  línea o Cambiar de equipo; tijeras del vínculo → Desvincular; línea a Cancelación → Mandar a cancelación; equipo a
  Resguardo o a Venta y desecho → Mandar a resguardo (con PARA VENTA); equipo sobre una persona (también uno sacado del
  módulo de Resguardo) → Reasignar. El cajón, el lienzo y los módulos se guardan en el navegador (`localStorage` `lineas.vinculos.v1`: claves y posiciones). Sin permiso de operar
  solo se ve y se arma. Clic = vista rápida (en el grafo, elige la relación); doble clic = ficha.
- **Cambio de número** (8-oct): al cambiar el número en Editar línea se elige el motivo, CAMBIO DE NUMERO (la línea
  ahora tiene otro: movimiento `CAMBIO_NUMERO`, «Cambio de número» en el historial) o CORRECCION DE CAPTURA (Edición).
  La ficha de la línea tiene «Números de esta línea» (el actual y los anteriores con fecha y comentario,
  `LineasRepo.numerosDeLinea`) y la tabla de líneas enseña «antes …» junto al número: la búsqueda la encuentra por uno
  anterior (índice `numerosAnteriores`, caché `indice_telefonia_v6`). Lo de antes del 8-oct sigue solo en la bitácora
  del AppSheet («Números que ha tenido» del equipo; pendiente 4.1).
- **Acciones con nombre:** nueva inspección, nueva responsiva, Reasignar (responsiva y luego inspección, las dos
  obligatorias; el servidor exige la inspección del día; el equipo queda en USO; el director sale de la responsiva y
  el jefe directo de la inspección o, si no, de Capital Humano; la inspección llega llenada con la responsiva, se
  puede cambiar y solo pasa al inventario los accesos: la persona la pone la reasignación), Mandar a resguardo (pide la
  inspección de lo que viene de una persona), Mandar a cancelación, Subir PDF firmado (del sistema, del AppSheet o de
  NUCOS: versión nueva del PDF de NUCOS o, si no tiene, PDF nuevo en la carpeta de NUCOS de la captura o del día),
  Regenerar PDF (responsivas del sistema: versión nueva del mismo archivo; pasadas 6 h pide solo las firmas). Cada
  acción deja un renglón en el historial con su comentario: de más de 3 caracteres («N/A» no), revisado en la pantalla
  al escribirlo (Mandar a resguardo, antes de pedir las inspecciones; inspección y responsiva) y en el servidor.
- **Páginas de la inspección y de la responsiva** (Documentos, doble clic o Historial): lo que dice el documento de ese
  día; a la vista Ver PDF y Subir PDF firmado, y en ⋮ Ver equipo, Ver carpeta en Drive y Generar o Regenerar PDF
  (`botonesDocumento` en lineas.html; `apiLineasInspeccion` / `apiLineasResponsiva`).
- **Inspección y responsiva:** un solo «Comentario» (columna COMENTARIO, antes OBSERVACIONES). La inspección lleva al
  jefe directo y la responsiva al director, los dos de Capital Humano como en el AppSheet.
- **Identificación en la responsiva** (9-oct, opcional): por cada responsable (el principal, cuyo tipo es
  IDENTIFICACION, y del segundo al quinto, con su propio tipo) se eligen fotos (hasta 4: una, o frente y vuelta) o un
  PDF, que se ven antes de guardar (clic en la foto = en grande). Las fotos se juntan en el navegador en un PDF carta,
  dos por hoja, JPEG calidad .92 y hasta 2400 px por lado (`pdfDeFotos` en lineas.html); el servidor solo recibe PDF de
  hasta 15 MB (`datos.identificaciones`). Se guarda antes que la responsiva, en una carpeta nueva de la responsiva en
  NUCOS (`RESP DD MM`, donde después va su PDF), como «INE - NOMBRE - ID PERSONA.pdf» (`CapitalHumano.idPara`; sin
  ID PERSONA, solo el nombre), y un renglón por archivo en APP_IDENTIFICACIONES; si la responsiva no se guarda, la
  carpeta va a la papelera (`LineasIdentificaciones.gs`). Sin NUCO va a la carpeta de la app (`Files`). La página de la
  responsiva ofrece «Ver INE» (o «Ver …» con el nombre, si son varias).
- **Responsables adicionales:** en Editar, la responsiva y la inspección, hasta cuatro más (segundo a quinto: número de
  empleado y nombre de Capital Humano), cada uno en su bloque con «Quitar» y «Agregar responsable» debajo
  (`LineasRegistros.camposAdicionales`, condición `{ cuantos }`). Columnas `NO EMPLEADO / NOMBRE SEGUNDO… QUINTO
  RESPONSABLE` al final de ASIGNACIONES, RESPONSIVAS LINEAS e INSPECCIONES LINEAS. La inspección los pasa al inventario.
  El PDF los muestra como el AppSheet (nombres con « / »); en el sistema solo firma el principal, y con adicionales su
  firma va más chica para que los demás firmen el impreso.
  «¿El responsable usa el equipo?» y «Quien lo usa» se quitaron por completo (sus columnas de ASIGNACIONES se
  borraron: DEV 6-oct, producción 7-oct). En el PDF de la responsiva, con patrón solo sale su imagen.
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
- **Tipo de bloqueo del equipo** (PIN, PATRÓN, CONTRASEÑA o SIN BLOQUEO): una lista en Editar, la inspección y la
  responsiva (`conSelectorBloqueo` / `activarBloqueo`, lineas.html) que no se guarda: PIN y contraseña van en PIN
  EQUIPO; patrón, «PATRON»; sin bloqueo, «N/A». Con «PIN» solo números (no deja escribir letras); la contraseña acepta
  todo. La lista viaja como `datos.bloqueo` y el servidor lo revisa (`LineasUtil.exigirPinEquipo`). En Editar, PIN
  EQUIPO sigue con 6 caracteres como máximo (regla del AppSheet).
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
| INSPECCIONES LINEAS, RESPONSIVAS LINEAS | Los documentos capturados (PDF en NUCOS). El comentario va en COMENTARIO (antes OBSERVACIONES; renombrada en el DEV el 6-oct y en producción el 7-oct) |
| MOVIMIENTOS | Historial único: un renglón por acción (`LineasRepo.registrarMovimiento`) |
| APP_MOVIMIENTOS, CAMBIOS LINEAS TELEFONICAS | Historial de antes del 4-oct (APP_MOVIMIENTOS trae las pestañas retiradas con TIPO HISTORICO; CAMBIOS, la bitácora del AppSheet). La ficha los lee hasta que pasen a MOVIMIENTOS |
| APP_RESGUARDOS, APP_NOTIFICACIONES, APP_EVIDENCIAS, APP_CORRECCIONES | Bandeja de Pau, avisos, fotos y correcciones |
| APP_IDENTIFICACIONES | Identificación de cada responsable subida con la responsiva: ID PERSONA, número de empleado, nombre, tipo, archivo, NUCO, ID RESPONSIVA, ID LINEA, origen, fecha y quién. Se crea sola con la primera (no se pide antes de desplegar: `noSePide_`) |
| ACCESORIOS CELULARES | Inventario de accesorios |
| COLABORADORES ACTUALIZADO | Capital Humano (la mantiene Ayrton; Líneas solo la lee) |

`LINEAS TELEFONICAS` (la hoja del AppSheet) se retiró y se borró el 4-oct; el sistema lee y escribe solo en las hojas
de arriba (`LINEAS_LECTURA = ESTRUCTURA`, `LINEAS_HOJA_VIEJA_RETIRADA`).

**Drive:** documentos y fotos en la carpeta de cada NUCO dentro de NUCOS (`LINEAS_DRIVE_NUCOS`); lo que no tiene NUCO, en
la carpeta de la app (`LINEAS_DRIVE_APPSHEET`). **PDF:** copias «(SISTEMA)» de las plantillas de Google Docs del
AppSheet, en sus mismas carpetas (FORMATOS y RESPONSIVAS_LINEAS), con «Comentario» (`LineasPdf.PLANTILLAS`; las
originales, que no se tocan, en `PLANTILLAS_APPSHEET`; las copias se hicieron una vez, el 6-oct);
la responsiva conserva los márgenes de su plantilla y su interlineado se ajusta para salir igual que la impresión del
AppSheet (HTML con Chromium), en 2 hojas (`LineasPdf.COMO_APPSHEET`). El patrón se puede dibujar en el servidor
(`LineasPatronPng.gs`). Si el PDF ligado a una captura del sistema ya no está en su carpeta de NUCOS (alguien lo quitó
a mano en Drive), se usa el PDF que sí está en esa carpeta (el del mismo nombre o el más reciente «INSP…» / «RESP…») y
se vuelve a ligar en APP_EVIDENCIAS y en la columna del PDF (`LineasRepo.revisarPdfsLigados` con
`LineasArchivos.pdfsFueraDeCarpeta`; al ver Documentos, la página del documento o el Historial y antes de Regenerar o
Subir PDF firmado; se pregunta a Drive cada vez).

**Permisos de Google:** la app corre con la cuenta que mueve los despliegues (`executeAs: USER_DEPLOYING`); desde el
8-oct es siempre la de la GitHub Action (`cuentaProd` de `tools/subir/destinos.json`). Desde la v66, Líneas
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
| `lineas/LineasIdentificaciones.gs` | Identificación de cada responsable en la responsiva (Drive y APP_IDENTIFICACIONES) |
| `lineas/LineasAcciones.gs`, `LineasResguardos.gs` | Reasignar, Mandar a resguardo y bandeja de Pau |
| `lineas/LineasPanorama.gs`, `LineasNotificaciones.gs`, `LineasExportar.gs` | Panorama, avisos y Exportar a Excel |
| `lineas/LineasAccesorios.gs`, `LineasCorrecciones.gs` (+ `LineasCorreccionesSemilla.gs`, fuera de git) | Accesorios y Correcciones |
| `lineas/LineasEstructura.gs`, `LineasRetiro.gs`, `LineasReestructura.gs`, `LineasRevisionBD.gs` | Herramientas de la reestructura (ya corridas; no se vuelven a usar) |
| `lineas/LineasAdmin.gs` | Utilidades que se corren desde el editor |
| `html/js/lineas.html`, `lineas-vinculos.html`, `lineas-correcciones.html`, `html/lineas-estilos.html`, `html/views/lineas/*` | Pantallas (`lineas-vinculos.html`: la vista Vínculos) |
| `tests/lineas-*.test.cjs`, `pdf-render.test.cjs` | Pruebas (`npm test`) |

## 4. Cómo se trabaja

1. Cambiar en `emmanuel`, `npm test`, commit.
2. Probar en el DEV de Emmanuel: `npm run push` (sube comprimido al proyecto de `.clasp.json`, el DEV, con copia de la
   base de producción).
3. Unir con `master` (`git fetch`, merge de `origin/master`) y subir a `master`.
4. Publicar: desde el 8-oct solo con la GitHub Action, botón «Run workflow» sobre `master` (`docs/subir-automatico.md`):
   sube, revisa el entorno y mueve **las dos** `/exec` a la misma versión.
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
