# Líneas — estado del módulo

Rama `master` = producción (la versión vigente está en el INDICE; lo último de Líneas ahí es la parte 6 con COMENTARIO,
plantillas «(SISTEMA)», página de la responsiva, patrón con 9 puntos en el PDF, Reasignar corregido, responsables
adicionales, sin «quien lo usa», firma guardada, PDF ligado fuera de su carpeta, PIN en minúsculas y Drive sin
`UrlFetchApp`), el PIN del equipo solo con números, sin la compatibilidad con OBSERVACIONES, Exportar a Excel del
inventario como lo muestra el panel, la identificación de cada responsable en la responsiva y reutilizarla con «¿Es
correcta?» (9-oct). Lo de adendums y facturas (la pantalla Proveedor) salió de `emmanuel` el 8-oct y se rehace; la primera versión volvió al código el 14-oct con una unión de `master`
y se quitó otra vez el mismo día; el código sin ella está publicado en la v120 (15-oct) (§1, Menú de Líneas; antecedente en el historial de git y en `_archivo/emmanuel_respaldo_8oct.zip` de la carpeta del proyecto) · Última actualización: 2026-10-15

Qué es hoy el módulo **Líneas** (equipos celulares y líneas telefónicas), dónde vive cada cosa y cómo se trabaja.
La bitácora anterior de este archivo (§0a…§0ae, hasta el 1-oct) sigue en el historial de git. El diseño de las hojas
está en el plan de la reestructura y los pendientes en la lista maestra, ambos en la carpeta del proyecto de Emmanuel
(`Líneas - Control Interno/migracion/`).

## 1. Qué hace

- **Líneas telefónicas:** tabla de equipos y líneas (selección estilo Google Drive), ficha con General, Documentos e
  Historial; Editar en pestañas con Agregar equipo / Agregar línea; TIPO se calcula solo (EQUIPO, EQUIPO + SIM,
  EQUIPO + SIM BASICO, LINEA, SIM BASICO, BANDA ANCHA, MODEM, CAMARA). La línea sola básica se llamaba LINEA BASICA
  hasta el 12-oct (`e26b863`, `d59d7d1`): el TIPO no se guarda en el libro, se calcula (`tipoViejo_`),
  así que solo cambió el código; `tipoBase` (`LineasChecklist.gs`, `lineas.html`) trata SIM BASICO y LINEA BASICA como
  LINEA y `resolver_` convierte LINEA BASICA en SIM BASICO (pestañas guardadas de antes). Los scripts del reporte
  (`conciliacion.py`, `conversion_estatus.py`) aceptan los dos nombres.
- **Opciones de cada pantalla** (12-oct, `516a07c`; se separan con rayas las que van juntas). Clic derecho
  del equipo: Detalles | Reasignar, Mandar a resguardo | Nueva inspección, Nueva responsiva | Editar equipo |
  Vincular, Cambiar o Desvincular línea | Ir a la línea, Historial («Editar equipo» se llamaba «Editar información»
  y traía «Editar línea» al lado hasta el 13-oct; la línea sigue con «Editar línea», `aff5615`). Clic derecho de la línea: Detalles | Mandar a
  cancelación | Editar línea | Vincular a equipo, Cambiar de equipo o Desvincular del equipo | Ir al equipo, Historial. ⋮ de
  la ficha del equipo: Reasignar, Mandar a resguardo | Documentos (Ver última inspección, Ver última responsiva) | Ver
  carpeta en Drive | Editar equipo | Vincular… | Historial. ⋮ de la ficha de la línea: Mandar a cancelación | Ver
  carpeta en Drive (solo la línea sin equipo que ya tiene carpeta en LINEAS, con la sección `lineas-telefonicas.carpetas`; `a5d2b85`, 15-oct) | Editar
  línea | Vincular… | Historial (el botón «Ver equipo» de la cabecera sigue). En Documentos la barra al seleccionar trae
  Ver inspección o Ver responsiva, Ver PDF, Generar PDF y Subir PDF firmado; Regenerar PDF y Ver carpeta en Drive solo
  en el ⋮ y el clic derecho (son `accionesSeleccion` de la tabla, no `accionesFila`).
- **Sin textos de ayuda** (12-oct, `4d07afa`): ni el párrafo de Documentos, ni el de Reasignar varios, ni
  las notas de Agregar fotos, ni la opción `ayuda` (botón «Ayuda») de las tablas de Líneas (inventario, Documentos,
  Historial, Asignaciones, Accesorios, Resguardos, Bitácora, Correcciones); queda la nota del patrón.
- **Recargar datos** (botón solo para administrador, junto a Agregar equipo y Agregar línea; `TelefoniaService.recargarDatos`): vacía las cachés de `LineasRepo` y, desde `4013989` (14-oct; publicado en la v120, 15-oct),
  también las hojas LINEAS, EQUIPOS, ASIGNACIONES y ADENDUMS que `LineasLectura` guarda 30 min (`LineasDatos.tocar`). Lo escrito en el libro por fuera de la app, como la carga del proveedor, no las renueva solo:
  después de escribir basta «Recargar datos»; sin él se ve a más tardar 30 min después.
- **Agregar línea** (8-oct): «¿Se vincula a un equipo?». Sí → se elige un NUCO en USO o RESGUARDO sin línea (lista con
  modelo y responsable) y la línea queda con el equipo, en su asignación: el responsable es el del equipo y el estatus
  lo sigue (USO si está en uso, DISPONIBLE si está guardado). No → responsable a mano y opcional; USO con responsable,
  DISPONIBLE sin él. La cancelación no se elige al agregar. Con SIM BASICO no se pide ni se guarda adendum
  (`LineasRegistros.crearLineaEnEquipo_`, `estatusAltaLinea_`).
- **Agregar equipo con una línea que ya existe** (13-oct): la sección LÍNEA empieza con «¿Se vincula una línea?» (empieza en
  No). Sí → «Línea», lista solo con las líneas sueltas DISPONIBLES (sin equipo, con número; con compañía y tipo;
  `lineasSueltas_`), y se esconden Número, SIM, Tipo de línea, Compañía, Razón social, Estatus de la línea y el ADENDUM, que
  trae la línea. No → como siempre (número nuevo opcional). El PIN de WhatsApp aparece con un número escrito o con la línea
  vinculada. Al guardar, antes de escribir se revisa que la línea siga suelta y DISPONIBLE y que el equipo quede en USO o
  RESGUARDO (si no, error sin escribir nada); el equipo se da de alta sin línea y, en el mismo candado, se vincula con la
  escritura y el movimiento de «Vincular línea» (`LineasAcciones.aplicarVinculo`, ASIGNAR_LINEA), con el comentario del alta.
  La línea sigue al equipo (USO si está en uso, DISPONIBLE si está guardado). En el historial quedan «Alta de registro» y
  «Vincular línea»; no genera responsiva.
- **Estatus en Editar equipo** (8-oct; «Editar información» hasta el 13-oct): directo. RESGUARDO, PARA VENTA, PARA VENTA
  CON DETALLE (estatus nuevo del 13-oct, 9 en total en `LineasRepo.CATALOGO.estatusEquipo`) y PARA DESECHO del equipo, y EN PROCESO DE
  CANCELACION y CANCELADA de la línea, con un aviso «no se agregará en el panel de Resguardos y cancelaciones, pero se
  quedará en el historial» (Confirmar o Cancelar; el servidor los acepta solo con `datos.sinPanel`). El equipo que pasa
  a uno de esos estatus deja DISPONIBLE su línea en uso (el aviso lo dice). Al revés (13-oct, `aff5615`): el equipo que
  pasa a USO con su línea DISPONIBLE (o RESGUARDO, el valor viejo) en el mismo registro la lleva a USO; antes la línea se
  quedaba en la asignación de resguardo y se separaba del equipo (`LineasRegistros.editar`; `LineasEscritura.guardar`
  hace lo que dicen los estatus). Al panel de Pau se llega con «Mandar a resguardo» y «Mandar a cancelación».
- **PIN de WhatsApp** (8-oct; columna de EQUIPOS desde el 14-oct, `4e00ac9`): en la ficha va en la información del equipo
  (General → Equipo, y Equipo en la ficha de la línea), no en la línea; sin línea no se muestra. La línea sola ya no lo muestra ni
  lo pide. Se guarda en la columna PIN WHATSAPP de EQUIPOS (`asegurarColumnas` la crea al escribir) y se borra cuando la línea
  deja al equipo (`sinPinWhatsapp_` en `guardar` y `separarLinea` de `LineasEscritura`, con su renglón en el historial). Se lee
  del equipo y, si el equipo no tiene, del que traiga LINEAS (`LineasLectura`). En producción y en el DEV el PIN ya está en EQUIPOS (14-oct); las líneas sin equipo no tienen PIN.
- **Pestaña General** (14-oct, `4e00ac9`, `a91decd`; usuario, 13-oct; las reglas de nombres, en plan §4.9). **Línea:** tarjetas
  Línea (tipo, compañía, SIM, estatus), Cuenta (razón social, cuenta padre, cuenta y «Día N de cada mes», de CUENTAS por
  `LineasRepo.diaDeCorte`), Plan (plan, renta, inicio y fin de plan y una barra con la vida del plazo: verde vigente, ámbar a 3
  meses o menos, rojo vencido, con «Faltan N meses» o «Vencido hace N meses» y «X de Y meses»; abajo, de dónde salió el plan en
  palabras: ORIGEN PLAN, que es el ARCHIVO del adendum; un SIM básico no tiene adendum: dice «Renta $29.00 al mes» y «Plazo: Sin plazo forzoso», con el
  pie de la factura de donde salió; la renta es lo cobrado en su último mes completo facturado (`rentaSimBasico` en `lineas.html`: el primer cobro mayor a 0 sin
  «Cargo del … al …», que `facturasDeLinea` marca como `parcial`), y sin una factura así dice «SIM básico: sin contrato ni plazo»; `ad20d6e`, 14-oct), Facturación (título con el mes
  del corte; Cobrado (con la parcialidad del equipo dentro; un importe negativo se escribe «-$7.74», no «$-7.74»: `dinero` de `lineas.html`, `1b4943c`, 14-oct; publicado en la v120), Habitual (el cobro habitual de la línea) y Diferencia (cobrado menos habitual: «Igual», «$200.00 de más» o «de menos»; menos de $0.05 cuenta como igual, el centavo de redondeo de Telcel; `fd25efd`, 14-oct, publicado en la v120 (15-oct): ya no es contra la renta del adendum, que en AT&T es el precio de lista y no lo que se paga con el descuento corporativo; la renta sigue en la tarjeta Plan), Uso (un SIM básico también tiene Habitual y Diferencia; lleva su renta en la tarjeta Plan),
  Equipo (solo si la línea paga un equipo a plazos: «Parcialidad 10 de 24 · MOTOROLA 4G XT2521-2 G15 256GB GRIS · $52.08»; `3cce1da`, 14-oct), «Cobrado como» solo si el número facturado es otro; «Últimos N meses» (con una sola factura,
  «Último mes»), que se
  despliega al pasar el cursor o al tocarlo, y el origen de la factura; sin facturas dice «Sin facturas cargadas»), Equipo (con PIN
  WhatsApp) y Responsable. Salen de ADENDUMS (por `LineasLectura`: CUENTA PADRE, CUENTA, PLAN, FUENTE PLAN y ORIGEN PLAN; caché
  `estructura_virtual_v4`) y de FACTURAS (`LineasRepo.facturasDeLinea`, los últimos 3 por línea, pero leyendo toda su historia para calcular el habitual de cada mes: `LineasRepo.cobroHabitual` toma lo que más veces cobraron los 3 meses anteriores completos —sin meses parciales ni notas de crédito—, y si ninguno se repite, el del mes anterior; un mes sin meses anteriores no muestra Habitual ni Diferencia, y con pocos meses de historia un mes raro se puede marcar también en el siguiente; la columna MINUTOS son las llamadas hechas (no las recibidas ni las especiales): en AT&T salen del «DETALLE DE LLAMADAS» de la factura y no del
  «Consumido» del resumen; la de los SIM básicos está en producción desde el 14-oct y, con la actualización del mismo día, solo con llamadas hechas (pendiente 1.15);
  `TelefoniaService.linea` y `equipo` regresan `corte` y `facturas`. **Equipo:** Equipo (con PIN WhatsApp), Línea (el número es el
  enlace a la línea), Plan de la línea, Facturación de la línea (sin habitual, uso ni meses) y Responsable a todo el ancho. Cada
  tarjeta lleva su título en una franja (`lineas-estilos.html`, solo en `[data-ficha-panel="general"]`).
- **Editar línea y Editar equipo** (8-oct; «Editar información» hasta el 13-oct): la línea se edita aparte (⋮ de la línea
  y la tabla de líneas; el equipo no la trae desde el 12-oct; `apiLineasFormularioRegistro(id, 'LINEA')`,
  `LineasRegistros.contextoEdicion_`). Una línea de un NUCO
  trae Línea y Adendum, su responsable (el del equipo) solo para ver y, como estatus, el suyo, EN PROCESO DE CANCELACION
  o CANCELADA. Editar equipo, con línea, ya no trae la línea ni el adendum. La línea sola con
  responsable tiene «Quitar responsable» (queda DISPONIBLE); con un responsable nuevo pasa a USO y en USO lo exige.
  Un SIM BASICO no enseña el adendum al agregar. Al editar, cambiar el Tipo de línea a SIM BASICO esconde el adendum y
  al guardar lo borra (costo, inicio y fin; MOVIMIENTOS guarda los de antes en `antes`; 12-oct, `a23f9ec`,
  `soloPlan` en `LineasRegistros.gs`). Un SIM BASICO que ya traía datos de adendum los sigue enseñando y no se borran
  al editar otra cosa.
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
  los DEV se ve. No tiene llamadas propias al servidor, solo abre las ventanas de siempre. Es el tercer modo de Líneas telefónicas junto a
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
  Los números anteriores (con fecha y comentario, `LineasRepo.numerosDeLinea`) van en la ficha de la línea, abajo del número y
  arriba de los chips; «Números de esta línea», la tarjeta que los listaba, se quitó el 14-oct
  («Antes 9990000001», gris y chico; el número anterior que no es un teléfono, como el «D-004» de las líneas de DG, conserva su texto, `indice_telefonia_v8`; parámetro `subtitulo` de `encabezado`, 12-oct, `4d07afa`); la columna Número de
  la tabla ya no los enseña, pero la búsqueda sigue encontrando la línea por uno anterior (índice `numerosAnteriores`,
  caché `indice_telefonia_v8`). Lo de antes del 8-oct sigue solo en la bitácora
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
  (`botonesDocumento` en lineas.html; `apiLineasInspeccion` / `apiLineasResponsiva`). Se ve al instante con lo que ya
  trajo Documentos (fecha, responsable, inspector, calificación, Ver PDF) y se completa al llegar lo demás; al
  seleccionar su fila se pide antes (`precargarDocumento`). Lo que pide la ficha queda 2 min en la página: «Volver» no
  lo pide otra vez; cualquier otra llamada al servidor (guardar, PDF, formularios) lo borra (`llamar`, 9-oct).
- **Inspección y responsiva:** un solo «Comentario» (columna COMENTARIO, antes OBSERVACIONES). La inspección lleva al
  jefe directo y la responsiva al director, los dos de Capital Humano como en el AppSheet.
- **La línea sin equipo solo tiene responsiva** (15-oct, `ec5bcd6`, `a5d2b85`; pendiente 2.45; en `emmanuel` y el DEV, sin publicar). Sin inspección: la ficha de la
  línea no trae el botón y el servidor la rechaza (`exigirEquipoParaInspeccion_` en `LineasCaptura.contextoInspeccion` y `guardarInspeccion`, y en
  `TelefoniaService.prepararEvidencia`). Sin número no abre ni guarda la responsiva («La línea no tiene número: captúralo con Editar línea.»,
  `numeroParaResponsiva_`). El formulario (`formularioResponsiva_(…, sinEquipo)`) trae solo LÍNEA (ID, ID LINEA, número, SIM, compañía, razón social, fijos),
  el responsable y las firmas, en 2 pasos (`PASOS_FORMULARIO.RESPONSIVA_LINEA`), sin EQUIPO ni ACCESORIOS Y ACCESOS. Al guardar (`SIN_EQUIPO`): NUCO vacío; MODELO,
  IMEI, COLOR, ACCESORIOS, PIN WHATSAPP y PIN EQUIPO = «NO APLICA»; CONTRASEÑA vacía; no copia nada al inventario; APP_EVIDENCIAS, APP_IDENTIFICACIONES y
  MOVIMIENTOS quedan sin NUCO. El PDF usa la misma plantilla (su texto fijo sigue diciendo «el equipo celular»): `registroPlantilla_` fija `NUCO: 'NO APLICA'` y
  `LineasPdf.reemplazarEtiquetas_` lo imprime aunque la etiqueta sea la fórmula `RIGHT("000" & [NUCO], 4)`. Ya no se usa el NUCO ANTERIOR para guardar. Lo ya guardado en NUCOS o en `Files`
  no se movió. **Drive:** ver §2.
- **Documentos de la línea** (15-oct, `42d5fe4`, `1aa5c6e`; pendiente 2.45; en `emmanuel` y el DEV, sin publicar): toda ficha de línea tiene la pestaña Documentos (antes solo la línea sin equipo).
  `apiLineasEvidencias(token, id, vista)` con vista `'linea'` (`TelefoniaService.evidencias`) trae las de la línea (`r.linea.idLinea`: las de cuando estuvo suelta) más
  `LineasRepo.responsivasEntregadas`, las responsivas de otro registro (su equipo) que tienen el ID de la línea en la columna **ID LINEA ENTREGADA** de RESPONSIVAS LINEAS, marcadas
  `enEquipo` y con la columna «Equipo» (NUCO) en la tabla; no trae las inspecciones ni los documentos del equipo ni su carpeta de NUCOS. ID LINEA sigue siendo el registro (el equipo o la línea sin equipo);
  `guardarResponsivaEnCandado_` escribe ID LINEA ENTREGADA (`obj.linea.idLinea`) en toda responsiva, también en Reasignar, Vincular y Cambiar línea, y la columna se crea con la primera. Los encabezados
  de cada hoja están en caché 1 h: si no encuentra la columna, `responsivasEntregadas` los relee una vez. Subir PDF firmado desde la ficha de la línea usa el registro del equipo
  (o, con `vista`, el de la línea; `apiLineasSubirPdfFirmado` la recibe). Las responsivas de equipo anteriores al 15-oct solo tienen la columna si se pudo probar su línea (la asignación del
  equipo en esa fecha y el número impreso dicen lo mismo, o sin asignación de esa fecha, el número, la SIM y que sea la única línea del equipo): 688 en producción y 655 en el DEV, con `reporte_lineas/actualizacion_base/ligar_responsivas.js`; la v120 no la llena en las nuevas.
- **Qué pasa la responsiva al inventario** (13-oct): solo el color, el bloqueo del equipo (PIN EQUIPO y PATRON) y, si el
  registro tiene línea (la que ya tenía o la que pone Vincular o Cambiar línea), el PIN de WhatsApp (`guardarResponsivaEnCandado_`, pasa por
  `guardarCambiosRegistro`, que solo anota lo que cambió). Antes el PIN de WhatsApp se quedaba en la responsiva y su PDF y la
  línea conservaba el de antes (NUCO 1712, 12-oct). A quien no ve los secretos se le conserva el valor oculto. El resto de lo
  corregido en la responsiva queda en la responsiva y su PDF.
- **Error del pie de las capturas** (13-oct): el mensaje (`#cap-error`, `.ln-error-fijo` en `lineas-estilos.html`) va en su
  lugar, arriba de los botones, y no flota; cada campo con error se sigue marcando. Aplica a las capturas que lo usan:
  inspección, responsiva, Editar, Mandar a resguardo y otras.
- **Identificación en la responsiva** (9-oct, opcional): por cada responsable (el principal, cuyo tipo es
  IDENTIFICACION, y del segundo al quinto, con su propio tipo) se eligen fotos (hasta 4: una, o frente y vuelta) o un
  PDF, que se ven antes de guardar (clic en la foto = en grande; el PDF se ve con su carátula, ver «Arrastrar y soltar archivos y
  carátula de los PDF»). Las fotos se juntan en el navegador en un PDF carta,
  dos por hoja, JPEG calidad .92 y hasta 2400 px por lado (`pdfDeFotos` en lineas.html); el servidor solo recibe PDF de
  hasta 15 MB (`datos.identificaciones`). Se guarda antes que la responsiva, en una carpeta nueva de la responsiva en
  NUCOS (`RESP DD MM`, donde después va su PDF), como «INE - NOMBRE - ID PERSONA.pdf» (`CapitalHumano.idPara`; sin
  ID PERSONA, solo el nombre), y un renglón por archivo en APP_IDENTIFICACIONES; si la responsiva no se guarda, la
  carpeta va a la papelera (`LineasIdentificaciones.gs`). Sin NUCO va a la carpeta de la app (`Files`). La página de la
  responsiva ofrece «Ver INE» (o «Ver …» con el nombre, si son varias).
  **Reutilizarla** (9-oct, en producción desde la v88): al llenar o cambiar el nombre o el número de un responsable, la
  pantalla busca su identificación más reciente en APP_IDENTIFICACIONES por su nombre (sin acentos; si el nombre es de
  dos personas, con su número; `apiLineasIdentificacionesRegistradas`, permiso de operar Líneas; la de un archivo en la
  papelera no cuenta) y, si tiene, muestra «INE registrada · NUCO ·
  fecha · Ver · ¿Es correcta? Sí / No». Sí: no se sube nada; al guardar se copia a la carpeta de la responsiva nueva con
  su nombre de siempre y queda un renglón con ORIGEN REUTILIZADA (el servidor revisa que el registro sea de esa misma
  persona: el mismo ID PERSONA, que se busca por nombre y número sin el CORREO de la responsiva, porque es la cuenta Google
  del equipo y puede ser de otra persona; si falta el ID PERSONA de un lado, el mismo nombre y, si los dos lo tienen, el
  mismo número; `esDeLaPersona_`, desde `29ba60e`). No: se suben fotos o PDF como siempre. Sin contestar, Guardar no deja pasar y lleva a la pregunta. Sirve en la
  responsiva sola, Reasignar y Vincular.
- **Fotos de la inspección** (9-oct): se ven en miniatura desde que se eligen, con la espera encima mientras suben;
  clic = en grande (`verFotoEnGrande`, que desde el 13-oct usa el visor de abajo), X = quitar (`subirImagenCaptura`, lineas.html). El campo oculto de archivos va
  dentro de su botón (`.ln-upload` con `position: relative`): fuera de él, al regresar de elegir, la ventana de captura
  se recorría y dejaba un cuadro blanco.
- **Arrastrar y soltar archivos y carátula de los PDF** (13-oct, `5595604` y `3da7620`; bloque del mismo nombre
  en `lineas.html`, `tests/lineas-soltar-pdf.test.cjs`):
  - **Soltar** archivos sobre un botón de subir (`.ln-upload`: fotos de la inspección, «Agregar fotos» de una inspección
    guardada, identificación de la responsiva) o un campo de archivo (`.ln-af-archivo`, Editar) es como elegirlos: van al
    input de esa zona (no al de la cámara, `[capture]`), filtrados por su `accept` (`aceptaArchivo`), uno solo si el input no
    es múltiple, y se dispara `change`, así cada pantalla los maneja como siempre. Un tipo que el input no acepta da el
    aviso «Ese tipo de archivo no se puede subir aquí.». Dentro de Líneas (`.ln-modulo`), soltar un archivo fuera de esos
    lugares no lo abre encima de la app.
  - **«Suelta aquí»** (`3da7620`, usuario, 13-oct): mientras se arrastran archivos sobre Líneas, cada lugar donde se pueden
    soltar se marca con borde y «Suelta aquí» (clase `ln-arrastrando` en `<html>`; se quita sola 250 ms después del último
    `dragover`); el que está bajo el cursor se agranda un poco, dice «Suelta aquí» completo y lleva la clase `ln-soltar`.
  - **Carátula del PDF:** `caratulaPdf(archivo)` dibuja la primera hoja con pdf.js 3.11.174 de cdnjs (`cargarPdfJs`: se
    carga la primera vez que hace falta, con su worker) y `htmlMiniaturaPdf` la muestra como las fotos,
    con la etiqueta «PDF»; clic = el PDF en otra pestaña. Aplica a la identificación de la responsiva (antes salía un renglón
    con el nombre del PDF) y a los campos de archivo de Editar, que ahora también muestran en miniatura lo elegido (foto o
    carátula) con X para quitarlo (`.ln-af-vista`). Si pdf.js no carga, sale el ícono de documento.
- **Visor de fotos y «Quitar foto»** (13-oct, `5b2299f`, `566709c`, `c8b3973`, `6eec499`, `841f37b`, `7de277f`, `ec1e813`, `5595604`, `3da7620`):
  - **Visor** (`verFotos(fotos, inicio, opciones)` en `lineas.html`, clase `.ln-visor` en `lineas-estilos.html`; reemplaza
    a `.ln-ine-visor`): pantalla completa oscura con el nombre, «N de M», «Abrir en Drive», «Quitar foto» (solo si la
    llamada pasa `alQuitar`) y X; flechas a los lados y teclas ← → (dan la vuelta), Escape cierra; un clic en la foto la
    acerca 2.5 veces siguiendo el cursor y otro la aleja; un clic fuera de la foto, en lo oscuro alrededor, cierra el visor
    (`3da7620`, usuario, 13-oct; `sobreFoto` calcula el rectángulo visible de la foto con `object-fit: contain`), y acercada,
    cualquier clic aleja. El cursor es lupa sobre la foto y normal fuera. Pinta primero la miniatura y luego la grande de Drive
    (`miniaturaDe(url, 2400)`). Lo usan la página de la inspección y las miniaturas de la captura (inspección e
    identificación, por `verFotoEnGrande`).
  - **Foto a tamaño completo y pedida antes** (`7de277f`, `ec1e813`): la foto del visor llena el espacio desde que abre
    (`.ln-visor-escena img` con `width` y `height` al 100 % y `object-fit: contain`); antes se veía chica y luego se
    agrandaba (usuario, 13-oct). La grande de Drive se pide antes (`pedirFotoGrande`, `fotoGrande`, `fotosPedidas`): al pasar
    el cursor sobre una foto de la galería y, al mostrar una, la anterior y la siguiente; si ya llegó, el visor abre
    directo con ella, nítida.
  - **Clic derecho** (`7de277f`, usuario, 13-oct; ajustado en `5595604`): solo en la galería de la inspección: en una foto,
    menú en el cursor con Ampliar, Abrir en Drive y, separado y con permiso de operar, Quitar foto. El visor ya no tiene clic
    derecho propio (el menú se quedaba encima de la foto al abrirla): al abrirse cierra el menú de la galería
    (`cerrarMenusFlotantes`; `menuFlotante` guarda `menu._cerrar` para quitar también sus escuchas) y, con un menú de clic
    derecho abierto, cualquier clic fuera de él lo cierra, también sobre la foto que lo abrió. `menuFlotante(ancla, items,
    punto)` acepta un punto y entonces va donde está el cursor, con z-index 900. Escape cierra primero el menú y luego el visor.
  - **En la página de la inspección** (`pintarInspeccion`) cada foto se ve sola, sin el nombre (13-oct, usuario: el nombre sale al pasar el cursor y en el visor) y abre el visor con todas las fotos
    del documento; un video o una foto sin vista previa dice «Abrir en Drive» y se abre allá (Ctrl o clic medio también).
    `pedirDatos` acepta `opciones.encima` (z-index 800, por arriba del visor, que es 700).
  - **Quitar foto:** solo con el permiso de operar Líneas (EDICION de lineas-telefonicas). Ventana «¿Quitar foto?» con
    Cancelar y «Quitar foto» (botón de peligro) y la espera «Quitando la foto»; sin comentario (usuario, 13-oct). La espera
    de las ventanas chicas de `pedirDatos` (también las de la bandeja de Pau) tiene un alto mínimo de 280 px para no
    salir aplastada (`6eec499`) y es opaca (`.modal-card:not(.ln-captura-modal) > .ln-espera`, `841f37b`): con la
    transparencia se leían detrás el título y los botones. Las ventanas grandes (captura) siguen con la espera al 94 %.
    `TelefoniaService.quitarFotoInspeccion(token, id, archivoId, comentario)` (`apiLineasQuitarFotoInspeccion`): lee la
    inspección (o la de NUCOS `drive_…`, con la carpeta de NUCOS del mismo día), acepta solo una foto de las carpetas de
    esa inspección (`carpetasFotos_`: la de fotos, la de la inspección y la extra de APP_EVIDENCIAS) que sea foto
    (`esFotoDeInspeccion_`: imagen o video, no FIRMA ni PATRON) y la manda a la papelera de Drive (`setTrashed`); si la
    cuenta de la app no puede (archivo de otra cuenta), la mueve a una carpeta «FOTOS QUITADAS» junto a la suya. Recuenta
    FOTOS de APP_EVIDENCIAS (`LineasCaptura.fotosInspeccion(…, 'actualizar', …)`) y anota en MOVIMIENTOS la acción
    `FOTO_QUITADA` («Foto quitada» en el historial) con DOCUMENTO = la inspección y el cambio FOTO: nombre → vacío.
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
  Con PIN EQUIPO = PATRON y patrón guardado, General muestra solo la fila «Patrón». Un solo bloqueo (usuario, 9-oct):
  el patrón vale si PIN EQUIPO dice PATRON o está vacío (`LineasUtil.patronVigente`); con un PIN o una contraseña,
  General y el PDF no lo enseñan, y guardar con «PIN», «CONTRASEÑA» o «SIN BLOQUEO» lo borra (Editar, inspección y
  responsiva, que también deja su PIN en el equipo; `LineasUtil.bloqueoSinPatron`). El PDF lo dibuja igual que la
  pantalla: los 9 puntos, los usados con su número y flechas (`activarPatron` y `LineasPatronPng`, iguales).
- **Tipo de bloqueo del equipo** (PIN, PATRÓN, CONTRASEÑA o SIN BLOQUEO): una lista en Editar, la inspección y la
  responsiva (`conSelectorBloqueo` / `activarBloqueo`, lineas.html) que no se guarda: PIN y contraseña van en PIN
  EQUIPO; patrón, «PATRON»; sin bloqueo, «N/A». Con «PIN» solo números (no deja escribir letras); la contraseña acepta
  todo. Es obligatoria siempre que se ve (usuario, 9-oct: ya trae SIN BLOQUEO). La lista viaja como `datos.bloqueo`
  (null si el formulario no la tiene o no se ve) y el servidor la revisa: vacía no pasa (`LineasUtil.exigirPinEquipo`). En Editar, PIN
  EQUIPO sigue con 6 caracteres como máximo (regla del AppSheet).
- **Resguardos y cancelaciones:** bandeja de Pau (recibir, entregar a Líneas, vendido, cancelación con carta). Los pasos
  de la bandeja y sus notificaciones (campana) los hace quien tiene EDICION en `resguardos-lineas`
  (`usuario.puedeAprobar`, calculado con `Permisos.deCorreo` en `TelefoniaService.usuarioResguardo_`); ADMIN y SUPER también,
  porque editan todo. Con solo LECTURA se ve y no se modifica («Solo puedes consultar Resguardos y cancelaciones, no
  modificarlo.»). «Mandar a resguardo», su formulario y «Mandar a cancelación» piden EDICION de `lineas-telefonicas`, así
  que el área de Líneas sigue mandando. En producción manda la hoja PERMISOS: el área LINEAS está en LECTURA en
  `resguardos-lineas` (cambio del 12-oct) y no existe una regla personal de Pau; los pasos de la bandeja los hace quien tiene
  EDICION ahí, que hoy son solo los usuarios con rol ADMIN o SUPER (Pau es SUPER). Es decisión del usuario (12-oct): no hay
  permisos individuales. La semilla (`PermisosSemilla.gs`, solo si no existe la hoja PERMISOS) sí trae LECTURA para el área
  LINEAS y EDICION para `paulina.bustamante@ciudadmaderas.com`.
  Ya no existe la lista `LINEAS_APROBADORES_RESGUARDO` (12-oct, `585d1c6`).
- **Mandar a resguardo y Mandar a cancelación** (13-oct, `aff5615`; `LineasResguardos.gs`, `abrirResguardo` y
  `abrirCancelacion` en `lineas.html`):
  - **Ubicación:** el formulario llena solo, aunque se puede cambiar, DISPONIBLE · QUERETARO · JARDINES DE LA HACIENDA
    (`UBICACION_RESGUARDO`, valor de `camposUbicacion_`), sin importar la sede ni la oficina que traiga el equipo.
  - **Estatus:** `ESTATUS_EQUIPO_RESGUARDO` = RESGUARDO, PARA VENTA, PARA VENTA CON DETALLE (estatus nuevo; ámbar, «Tiene
    un detalle; se ofrece en venta», `GRUPO_EQUIPO` del Panorama y `VENTA` de Vínculos) y PARA DESECHO.
  - **Equipo que ya tiene su renglón abierto en la bandeja** (PENDIENTE DE RECEPCION o EN RESGUARDO): el formulario no
    ofrece su estatus actual (`formulario` regresa por equipo `enBandeja` y `opcionesEstatus`), y `mandar` rechaza el
    mismo estatus («NUCO X: ya está en Resguardos y cancelaciones como RESGUARDO; elige otro estatus.»). Con otro
    estatus se actualiza su renglón; no se pide otra recepción.
  - **Equipo sin renglón abierto** (viene de una persona, viene guardado del AppSheet o Pau ya lo entregó a Líneas): crea un
    renglón PENDIENTE DE RECEPCION, que Pau recibe; las respuestas traen `porRecibir` (antes `yaGuardado`: uno ya guardado no
    entraba a la bandeja o entraba como EN RESGUARDO con «Ya estaba en resguardo»). Líneas decide cuáles de los equipos
    RESGUARDO del AppSheet manda al panel de Pau.
  - **Motivo de la cancelación:** Mandar a cancelación pide «Motivo» con la lista `MOTIVOS_CANCELACION` (LINEA VENCIDA o
    CANCELACION ANTICIPADA), obligatorio y sin nada elegido (`pedirDatos`, opción `elegir`: «Selecciona…»), además del
    comentario obligatorio y el ticket opcional; el servidor exige `datos.motivoCancelacion`. Se guarda en la columna
    MOTIVO_CANCELACION de APP_RESGUARDOS (`asegurarBandeja_` la agrega a la hoja que ya existe), se ve en la columna
    «Motivo» de la pestaña Cancelaciones y queda en el historial como cambio «MOTIVO DE CANCELACION». Donde no se elige
    (Mandar a resguardo de un equipo con línea que va a cancelación; Desvincular o Cambiar línea con «MANDAR A
    CANCELACIÓN», `LineasAcciones.vincular` con `{ motivoDelAdendum: true }`) sale del adendum
    (`motivoCancelacionDe_`): vencido → LINEA VENCIDA; vigente → CANCELACION ANTICIPADA; sin fecha o SIM BASICO, en blanco.
    Así se queda, sin lista en esas dos (usuario, 13-oct).
  - **Cómo corre Mandar a resguardo con inspección** (13-oct, `4e8ccd6`; `abrirResguardo` en `lineas.html`, igual desde el
    clic derecho que desde el ⋮ de la ficha): la ventana sigue con la pantalla de espera («Mandando N a resguardo»)
    después de «Guardar inspección y terminar», hasta que el servidor contesta; si falla, dice «No se mandó a
    resguardo» y que las inspecciones quedaron guardadas. La última inspección viaja con el resguardo en **una sola
    llamada** (`inspeccionesEnFlujo(equipos, para, ultima)`; `TelefoniaService.mandarResguardo` con `datos.inspeccion`
    llama a `LineasCaptura.guardarInspeccion(…, { sinIndice: true })` y luego a `LineasResguardos.mandar`; regresa la
    inspección con `resguardo` o, si el resguardo falló, con `error`). El PDF de la inspección se pide después, sin
    estorbarle. Para que sea rápido: una asignación sin persona deja el ID PERSONA en blanco sin consultar Capital Humano
    (`LineasEscritura.conPersona_`), el resguardo reutiliza las 4 hojas que leyó la inspección en la misma ejecución, y
    `LineasNotificaciones.crear` y `LineasResguardos.asegurarBandeja_` revisan sus columnas una vez cada 6 h (cachés
    `ln_notif_esquema_v1` y `ln_resguardos_esquema_v2`). Tiempos, en `migracion/TIEMPOS_LINEAS.md` (cambio 4).
- **La bandeja de Pau: espera en cada paso, espejo del inventario y accesorios** (13-oct, `93e77a8`; `LineasResguardos.gs` y
  `initResguardos` en `lineas.html`):
  - **Espera:** Recibir, Entregar a Líneas, Vendido, Carta firmada, Carta enviada y Confirmar cancelada pasan todas por
    `pedirDatos` con `{ detalle, peligro, espera, alConfirmar }`: la ventana lista lo que se toca (`detalle`, clase
    `confirmar-detalle`), y al aceptar se queda con la pantalla de espera («Recibiendo N equipo(s)», «Entregando…»,
    «Marcando… como vendidos», «Guardando N carta(s)…», «Cancelando N línea(s)») hasta que contesta el servidor; un error se
    ve en la misma ventana con «Volver». Recibir sigue pidiendo confirmación (pendiente 3.1). La pantalla de espera
    (`.ln-espera`) y el estado de las miniaturas (`.ln-miniatura-estado`) toman las esquinas de su ventana
    (`border-radius: inherit`, `7a66cc6`): antes salían cuadradas encima de las ventanas redondeadas.
  - **Espejo del inventario** (usuario, 13-oct; `bandeja` con `espejo_` y `abierto_`): un renglón abierto (PENDIENTE DE
    RECEPCION, EN RESGUARDO o con su cancelación en curso) muestra al leer lo de hoy del registro: NUCO, TIPO, MODELO, IMEI y
    ACCESORIOS y, si el renglón no va a cancelación o el registro sigue con el mismo número, NUMERO (solo sin cancelación),
    COMPANIA, RAZON_SOCIAL y FIN_PLAN. Una cancelación es de su número: si el equipo ya tiene otra línea, el renglón conserva
    lo de la línea que se cancela. La hoja sigue guardando lo de cuando se mandó. No siguen al inventario los datos que se
    llenan al mandar: estatus del equipo y de la línea, departamento, sede, oficina y comentario (mandar otra vez un equipo
    abierto con otro estatus sí actualiza estatus, departamento, sede y oficina; el comentario no se actualiza, usuario,
    13-oct). Lo cerrado (entregado, vendido, cancelado) se queda como quedó.
  - **Accesorios:** columna ACCESORIOS al final de APP_RESGUARDOS (`asegurarBandeja_` la agrega a la hoja que ya existe;
    caché `ln_resguardos_esquema_v2`), que se guarda al mandar a resguardo (renglón nuevo y al actualizar el abierto) y al
    mandar a cancelación; la pestaña Resguardos tiene la columna «Accesorios» después de IMEI.
- **Sede, área y oficina en la lista de personas** (13-oct, `4e8ccd6`): `LineasRepo.indiceColaboradores` las muestra como el
  sistema (`LineasUtil.mostrarCH`: QUERETARO, no QRO) aunque la lista salga de `CapitalHumano.activos()`; al guardar se
  escribe como en Capital Humano (`guardarCH`: QUERETARO → QRO). Cachés `indice_colaboradores_v6` y `catalogos_telefonia_v8`.
- **Panorama:** líneas y equipos por estatus, renta por cuenta y adendums, al cierre del mes elegido.
- **Notificaciones:** campana con adendums por vencer y avisos de seguimiento.
- **Accesorios** de celular, **Gestión de activos** (por persona) y **Correcciones de líneas** (módulo temporal).
- **Menú de Líneas** (12-oct, `585d1c6`): Panorama, Líneas telefónicas, Resguardos y cancelaciones e Inventario de
  accesorios. Correcciones de líneas (`correcciones-lineas`) y Sistemas (`sistemas-lineas`) están apagados con
  `MODULOS_APAGADOS` en producción y en el DEV de Emmanuel (Help Desk y Vínculos están apagados solo en producción).
  **Sin «Proveedor» en el menú** (14-oct, `a6243a2`; usuario, opción B): la primera versión del 7-oct (`proveedor-lineas`) volvió al código con la unión de Ayrton `ac4a560` (v116) y se apagó en producción
  con la v117; después se quitó (entrada del menú, módulo de `Modulos.gs`, `include`, pruebas y `MODULOS_APAGADOS`). Sus tres archivos quedan vacíos (`35d0fb2`, ver la tabla de archivos). Publicado en la
  v120 (15-oct). Se rehace (pendiente 1.10). El menú lateral
  sale recogido (92 px) y se abre a 308 px al pasar el cursor (12-oct, `590fedc`: con 280 se cortaban «Resguardos y cancelaciones» y
  «Reasignaciones vehiculares»), encima del contenido, sin botón de colapsar (en celular y tableta, hasta 1024 px, sigue
  el cajón de `shell-movil.html`, también de 308 px); las etiquetas llevan solo la primera mayúscula.
- **Sin asistente flotante** (12-oct, `7163c54`): el botón del asistente de la esquina inferior derecha se esconde en
  las pantallas de Líneas, Gestión de activos y Control de cambios, que no tienen ayuda ni recorrido
  (propiedad `sinAsistente` de `NAV_GRUPOS` y `VISTAS_FUERA_DEL_MENU` en `app.html`; `navegarA` le pone `hidden` a
  `#asistente-flotante`). En los demás módulos sigue igual.
- **Panel de tipos** (a la izquierda de la tabla de Líneas telefónicas, pestañas Equipos y Líneas; 12-oct, `7163c54`
  y `97073c0`): cada opción muestra el valor de la columna Tipo tal cual (`EQUIPO`, `EQUIPO + SIM`, …), más `TODOS` y
  `SIN TIPO`; el panel abierto mide 248 px, solo en Líneas.

## 2. Datos (libro de producción `17YrtuMY…`)

| Hoja | Qué guarda |
|---|---|
| LINEAS, EQUIPOS | Una fila por línea y por equipo (IDs de `Entidades.gs`). EQUIPOS lleva PIN WHATSAPP desde el 14-oct |
| ASIGNACIONES | Quién tiene qué, con FECHA INICIO / FECHA FIN (persona o resguardo), jefe directo y responsables adicionales |
| ADENDUMS, CUENTAS | Plan, costo y fin de plan por línea; cuentas padre y razón social |
| FACTURAS | Un renglón por línea y periodo con lo que dice el proveedor (plan §4.9); alimenta la tarjeta de Facturación de General. Trae junio a septiembre 2026 en el DEV y en producción (14-oct, pendiente 1.15; `COMO SE HACE ESTE REPORTE.md` §11.8); desde el 14-oct lleva EQUIPO FACTURADO, PARCIALIDAD y CARGO EQUIPO (la parcialidad del equipo ya está dentro de TOTAL CON IVA, `COMO SE HACE ESTE REPORTE.md` §11.6) y MINUTOS son solo llamadas hechas; las columnas nuevas y las correcciones están en el DEV y en producción (14-oct); 182 renglones de junio a agosto no tienen ID LINEA (el número no es de ninguna línea del sistema ni hay prueba del proveedor para ligarlo; pendiente 1.19) y no salen en ninguna ficha; después la llenará la carga mensual del proveedor (1.10) |
| CATALOGOS, LISTAS TELEFONOS | Listas de opciones |
| INSPECCIONES LINEAS, RESPONSIVAS LINEAS | Los documentos capturados (PDF en NUCOS; la responsiva de una línea sin equipo, en LINEAS). El comentario va en COMENTARIO (antes OBSERVACIONES; renombrada en el DEV el 6-oct y en producción el 7-oct). RESPONSIVAS LINEAS lleva ID LINEA (el registro: el equipo o la línea sin equipo) e **ID LINEA ENTREGADA** (la línea de ese día; columna AR en producción, creada el 15-oct) |
| MOVIMIENTOS | Historial único: un renglón por acción (`LineasRepo.registrarMovimiento`) |
| APP_MOVIMIENTOS, CAMBIOS LINEAS TELEFONICAS | Historial de antes del 4-oct (APP_MOVIMIENTOS trae las pestañas retiradas con TIPO HISTORICO; CAMBIOS, la bitácora del AppSheet). La ficha los lee hasta que pasen a MOVIMIENTOS |
| APP_RESGUARDOS, APP_NOTIFICACIONES, APP_EVIDENCIAS, APP_CORRECCIONES | Bandeja de Pau (con MOTIVO_CANCELACION de las cancelaciones y ACCESORIOS, desde el 13-oct; lo abierto se muestra con lo de hoy del inventario), avisos, fotos y correcciones |
| APP_IDENTIFICACIONES | Identificación de cada responsable subida con la responsiva: ID PERSONA, número de empleado, nombre, tipo, archivo, NUCO, ID RESPONSIVA, ID LINEA, origen (RESPONSIVA, REUTILIZADA: la registrada copiada a otra responsiva; NUCOS: las que ya estaban, 610 el 9-oct), fecha y quién. Se crea sola con la primera (no se pide antes de desplegar: `noSePide_`) |
| ACCESORIOS CELULARES | Inventario de accesorios |
| COLABORADORES ACTUALIZADO | Capital Humano (la mantiene Ayrton; Líneas solo la lee) |

`LINEAS TELEFONICAS` (la hoja del AppSheet) se retiró y se borró el 4-oct; el sistema lee y escribe solo en las hojas
de arriba (`LINEAS_LECTURA = ESTRUCTURA`, `LINEAS_HOJA_VIEJA_RETIRADA`).

**Drive:** documentos y fotos en la carpeta de cada NUCO dentro de NUCOS (`LINEAS_DRIVE_NUCOS`); lo que no tiene NUCO, en
la carpeta de la app (`LINEAS_DRIVE_APPSHEET`), salvo la responsiva de una línea sin equipo (15-oct, pendiente 2.45), que va a la raíz
**LINEAS** (`LINEAS_DRIVE_LINEAS` en `Entornos.gs`; junto a NUCOS): `LINEAS/<número>/CARTA RESPONSIVA/<año>/RESP DD MM/` con «RESP <número> DD MM.pdf» y las INE
(`LineasArchivos.carpetaEvidenciaLinea`, `LineasIdentificaciones.escribir(…, destino)`). La carpeta de la línea se crea con su primera responsiva y se
reconoce por la propiedad de Drive `idLinea`, no por el nombre (caché `carpetas_lineas_v1`, 6 h): un número reciclado da «<número> (2)» y, si el número cambió, se renombra al usarla.
`descartarCarpeta` manda a la papelera la carpeta de la responsiva y, si quedó vacía, la de la línea (nunca LINEAS); `destinoPdf_` manda el PDF a la carpeta LINEAS ligada en
APP_EVIDENCIAS; un documento se queda donde se firmó (vincular, cambiar o desvincular no mueve nada). Sin la clave, en producción la responsiva de una línea sin equipo
no se guarda («Falta la carpeta LINEAS en Drive…»); en un DEV sin ella es «LINEAS» dentro de la carpeta de pruebas. `TelefoniaService.linea` manda `carpetaDriveId` de la línea sin equipo y
`Diagnostico.gs` revisa `LINEAS_DRIVE_LINEAS` si está. **PDF:** copias «(SISTEMA)» de las plantillas de Google Docs del
AppSheet, en sus mismas carpetas (FORMATOS y RESPONSIVAS_LINEAS), con «Comentario» (`LineasPdf.PLANTILLAS`; las
originales, que no se tocan, en `PLANTILLAS_APPSHEET`; las copias se hicieron una vez, el 6-oct);
la responsiva conserva los márgenes de su plantilla y su interlineado se ajusta para salir igual que la impresión del
AppSheet (HTML con Chromium), en 2 hojas (`LineasPdf.COMO_APPSHEET`): la hoja 2 empieza en «SANCIONES POR MAL MANEJO»
con un salto de página cuyo párrafo mide 1 pt; con varios responsables (« / » en RESPONSABLE) el nombre bajo la firma va en
8 pt (`NOMBRES_BAJO_FIRMA`), y si el PDF sale con más de 2 hojas se quita el salto y se exporta de nuevo. El patrón se puede dibujar en el servidor
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
| `lineas/LineasIneNucos.gs` | INE que ya estaban en NUCOS (9-oct): inventario de solo lectura de NUCOS de producción en la pestaña «INE NUCOS» del libro del DEV (`lineasIneNucos_inventario`, desde el editor de un DEV) |
| `lineas/LineasAcciones.gs`, `LineasResguardos.gs` | Reasignar, Mandar a resguardo y bandeja de Pau |
| `lineas/LineasPanorama.gs`, `LineasNotificaciones.gs`, `LineasExportar.gs` | Panorama, avisos y Exportar a Excel (el inventario: una hoja LINEAS TELEFONICAS como el panel, con ID del AppSheet y las columnas de la vista del AppSheet, `LineasRepo.vistaCompleta`; Cambios y Accesorios, sus pestañas tal cual) |
| `lineas/LineasAccesorios.gs`, `LineasCorrecciones.gs` (+ `LineasCorreccionesSemilla.gs`, fuera de git) | Accesorios y Correcciones |
| `lineas/LineasEstructura.gs`, `LineasRetiro.gs`, `LineasReestructura.gs`, `LineasRevisionBD.gs` | Herramientas de la reestructura (ya corridas; no se vuelven a usar) |
| `lineas/LineasAdmin.gs` | Utilidades que se corren desde el editor |
| `lineas/LineasProveedor.gs`, `html/js/lineas-proveedor.html`, `html/views/lineas/lineas-proveedor.html` | **Vacíos** (`35d0fb2`, 14-oct): `subir.js` conserva en Apps Script los archivos que ya no están en git y estos sobrescriben a los de la primera versión del Proveedor (7-oct); se borran cuando el módulo nuevo (pendiente 1.10) los reemplace o `subir.js` sepa retirar archivos |
| `html/js/lineas.html`, `lineas-vinculos.html`, `lineas-correcciones.html`, `html/lineas-estilos.html`, `html/views/lineas/*` | Pantallas (`lineas-vinculos.html`: la vista Vínculos) |
| `html/js/lineas-medidor.html` + `apiLineasMediciones`, `apiLineasMedirServidor` | Medidor de tiempos (9-oct): apagado salvo con `?medir=1` en la dirección; escribe en la hoja MEDICIONES LINEAS solo en un DEV (en producción lo rechaza). Desde el 13-oct, en un DEV, guardar una inspección, generar un PDF, Mandar a resguardo y Mandar a cancelación anotan sus pasos dentro del servidor (`TelefoniaService.conPasosEnDev_`, con `LineasDatos.tiempo` «@a los ms») y el medidor los pide con `apiLineasPasosServidor` y los escribe como «SERVIDOR …»; en producción no hacen nada. Cómo se usa: `migracion/TIEMPOS_LINEAS.md` |
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
- **Rol CLIENT** (POST VENTA, `45b97ba`, de Ayrton, 14-oct; `Permisos.alcanceDe`): solo ve los equipos y líneas de sus departamentos. La ficha se le muestra como está hoy: sin las
  pestañas Documentos e Historial ni «Ver última inspección/responsiva» (`apiLineasPermisos` trae `conAlcance` y `lineas.html` lo usa en `sinPasado`), porque eso puede ser de cuando
  el equipo era de otro departamento. El servidor se lo niega con `sinAlcance_` en `TelefoniaService.gs` (historial, asignaciones, evidencias, documentos, última inspección o responsiva
  y el directorio de colaboradores de Capital Humano, que tampoco se pide en la precarga).
