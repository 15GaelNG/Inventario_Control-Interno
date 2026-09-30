# Líneas — estado del módulo

Rama `emmanuel` · Última actualización: 2026-09-30

Documento de continuidad del módulo **Líneas** (equipos y líneas telefónicas).
El plan de la mudanza está en [lineas-plan.md](lineas-plan.md); aquí se registra
qué está hecho, cómo probarlo y qué sigue.

**Dónde quedamos (cierre del 30-sep, noche):**

- **Rama `emmanuel`:** en GitHub hasta `10dc7eb` (29-sep). En local hay 17 commits más (`644ba14` … `d8a80a1`).
  Se suben a GitHub **al terminar la ronda**, como pidió el usuario. DEV está al día con `emmanuel`.
- **Pruebas:** `npm test` da 57 aprobadas y 0 fallidas. Las de Ayrton se corren aparte (`node tests/ids.test.js` y
  `node tests/entidades.test.js`) y dan TODO OK.
- **Reunión con Líneas (30-sep): ya ocurrió.** Lo hecho después:
  - §0u: estatus nuevos, DISPONIBLE y menú;
  - §0v: pestañas de módulos retirados, migradas y borradas;
  - §0w: "Mandar a resguardo" por NUCO y bandeja "Resguardos y cancelaciones", probada de punta a punta con los
    NUCO 0101 y 0556.
  - §0x: PARA VENTA y PARA DESECHO con la misma lógica que Mandar a resguardo (en DEV, sin commit; probado en /dev con el
    NUCO 0002).
  - §0y: selección como en Google Drive (barra, ⋮, clic derecho, Detalles que sigue a la selección) y "Mandar a
    cancelación" de líneas sin resguardo (en DEV, probado en /dev).
- **Lo que sigue, en orden:** pendiente 0 de `migracion/ESTADO_TELEFONIA.md`, en la carpeta de documentación.
  1. Conversión de estatus viejos: ya no hay confirmaciones del usuario; lo que requiere decisión va al módulo de
     correcciones de Líneas (el usuario solo migra).
  2. Dudas abiertas de la reunión.
  3. Responsiva que actualiza la línea: la jefatura dijo que sí; falta confirmarlo e implementarlo.
  4. Pedidos nuevos: comentarios con contexto, accesorios por NUCO, patrón con flecha, firmas, PDF firmado, QR,
     historial número ↔ SIM, adendums y facturas, y resumen para Marisela.
  5. Pendientes de la bandeja: histórico de la hoja de Bren, ENTREGADO al reasignar y probar "Vendido".
  6. **Roles y correos al final** (correo de Pau en `LINEAS_APROBADORES_RESGUARDO`).
- **Por probar a mano** (el navegador integrado no puede): subir fotos a una inspección de NUCOS, el gesto de dos
  dedos, Atrás entre módulos y la velocidad real de "Última responsiva / inspección".
- **Avisar a Jorge y Ayrton al unir con master** los cambios en archivos compartidos:
  - DataTable: opciones `minimo` y `modoSeleccion`, y el `className` en `render`;
  - `app.html`: `HistorialApp.alNavegar` en `navegarA` y `marcarTemaActual`;
  - `Index.html`: `notificaciones`, `lineas-panorama` y `historial-navegador`;
  - `Modulos.gs`: `panorama-lineas`.
  - `Entidades.gs` (de Ayrton): se agregó `APP_NOTIFICACIONES` con prefijo `NTF`, y su prueba cuenta 27 hojas.
  - DataTable: cuadro de selección con el mouse, Shift+clic, Ctrl/Cmd+A y Esc (§0t), todo dentro de `modoSeleccion`.
  - Pestañas retiradas de la BD de pruebas (§0v): su copia de Líneas las lee; `Entidades.gs` las sigue listando;
    `Modulos.gs` ya no tiene los 4 módulos.
  - `Entidades.gs`: `APP_RESGUARDOS` (prefijo RSG); su prueba cuenta 28 hojas y 4 APP_. `Modulos.gs`: `resguardos-lineas`.
  - APP_NOTIFICACIONES: columna nueva `PARA`.
  - DataTable (§0y): opción nueva `seleccionDrive` (con `modoSeleccion`), columna ⋮ `dt-col-mas`, barra `.dt-barra-sel`
    encima de la barra de herramientas, `alAbrirFila`, `alTocarFila`, `alCambiarSeleccion`, acciones con
    `enBarra/maximo/grupo/visible/activo`, "Exportar selección a Excel" y la API `clicSeleccion`, `asegurarSeleccionada`,
    `abrirMenu` y `refrescarSeleccion`. Sin `seleccionDrive` la tabla se comporta igual que antes.


## 0y. Selección como en Google Drive y "Mandar a cancelación" (2026-09-30)

Pedido del usuario: tres lugares para las opciones (una fila, varias filas y la ficha) con la lógica de Google Drive.

- **Tabla** (todas las de Líneas, vía `tablaLineas` → `seleccionDrive: true`):
  - pasar el mouse ilumina la fila y muestra su ⋮; **un clic la selecciona** y encima de la barra de herramientas
    aparece la barra azul "N seleccionados" con las acciones `enBarra` y ⋮ con las demás; ✕ o Esc quitan la selección;
  - la barra se pone ENCIMA (posición absoluta): la tabla no se mueve, así el segundo clic de un doble clic cae en
    la misma fila (primero empujaba la tabla y el doble clic podía abrir otra fila);
  - **doble clic** abre la ficha; **clic derecho** y el ⋮ de la fila abren el menú con todas las acciones;
  - Ctrl/Cmd+clic agrega o quita; Shift+clic rango; Ctrl+A todas; el **cuadro** solo empieza fuera de las filas
    (la tabla deja 56 px vacíos abajo para eso); un clic en el vacío quita la selección;
  - con el dedo: tocar abre la vista rápida; mantener presionado entra al modo selección (con casillas);
  - el botón "Seleccionar" ya no existe.
- **Detalles** = la vista rápida como "Ver detalles" de Drive: panel sin fondo (`abrirPanelLateral(..., { noModal })`)
  que se reutiliza y **sigue a la fila seleccionada**; el botón queda marcado mientras está abierto.
- **Tarjetas:** el clic con el mouse selecciona (misma selección que la tabla), doble clic abre, clic derecho = menú,
  Esc quita. Con el dedo o Enter se abre la ficha. (El cuadro de arrastre en tarjetas no se hizo.)
- **Reparto acordado:** equipo → a la vista Detalles, Cambiar estatus, Mandar a resguardo, Reasignar; en ⋮ abrir
  ficha, editar, inspección y responsiva (nueva y última), mandar la línea a cancelación, historial, copiar, exportar.
  Línea → Detalles, Cambiar estatus, Mandar a cancelación, Ir al equipo; en ⋮ abrir ficha, editar, historial.
  Varios equipos → Mandar a resguardo, Reasignar, Mandar líneas a cancelación. Varias líneas → Mandar a cancelación.
  Ficha → Cambiar estatus, Editar, Nueva inspección, Nueva responsiva y ⋮ (`abrirMenuFicha`).
- **Reasignar** ya funciona con un solo equipo (`MASIVA_MINIMO = 1`).
- **Mandar a cancelación** (`LineasResguardos.mandarCancelacion`, `apiLineasMandarCancelacion`): la línea queda EN
  PROCESO DE CANCELACION y entra a la pestaña Cancelaciones (POR FIRMAR, con asesor) **sin mandar el equipo a
  resguardo**; su renglón lleva ESTADO vacío y no sale en la pestaña Resguardos. No duplica una cancelación en curso
  (tampoco "Mandar a resguardo"). Al confirmarla, una línea suelta (TIPO LINEA) conserva su número y solo queda
  CANCELADA. En "Cambiar estatus", elegir EN PROCESO DE CANCELACION abre este mismo diálogo.
- **Probado en /dev (30-sep):** clic, Ctrl+clic, clic derecho, Detalles siguiendo la selección, Esc, doble clic a la
  ficha, ⋮ de la ficha e Historial, cuadro desde el vacío (y que desde una fila no marca), clic en el vacío, tarjetas y
  la bandeja. Mandar a cancelación con la línea **4421090805 (NUCO 0012)** de la BD de pruebas: quedó EN PROCESO DE
  CANCELACION y POR FIRMAR en Cancelaciones (dato de prueba).
- **Sin probar en vivo:** gestos con el dedo (el navegador integrado manda clics de mouse) y "Última responsiva /
  inspección" desde el menú (abre otra pestaña).
- **Ajustes pedidos por el usuario (30-sep, noche), probados en /dev:**
  - la barra dice solo "1 seleccionado" (sin el NUCO) y no tiene barra de desplazamiento visible;
  - un clic fuera de la tabla quita la selección (no en menús, diálogos, paneles, avisos, tarjetas ni la captura:
    `conservarSeleccion`);
  - sin "Copiar", "Exportar selección a Excel" ni "Abrir ficha" en los menús (`accionesDeTabla: false`; el doble clic
    abre y Ctrl+C sigue copiando);
  - documentos del menú separados con título: INSPECCIÓN (Nueva / Ver última) y RESPONSIVA (Nueva / Ver última);
    en el ⋮ de la ficha, "Documentos" con Ver última inspección / responsiva;
  - Documentos, Historial, Asignaciones, Accesorios y la bandeja: **sin columna de Acciones**; sus botones (Ver
    detalle, Ver inspección, Ver PDF, Abrir carpeta, Ir al NUCO, Registrar entrada/salida, Ver equipo) salen en la
    barra y el clic derecho con una fila seleccionada (DataTable los convierte con `maximo: 1`);
  - Documentos e Historial: **una fila a la vez** (`seleccionUnica: true`: Ctrl/Shift se portan como clic normal, sin
    cuadro ni Ctrl+A), porque no tienen acciones masivas.

## 0x. PARA VENTA y PARA DESECHO como Mandar a resguardo (2026-09-30)

Pedido del usuario: "que tenga la misma lógica que mandar a resguardar, que ponga los campos en N/A y permita
seleccionar lo demás". Aplica a los cuatro estatus de `LineasResguardos.ESTATUS_EQUIPO_RESGUARDO`: RESGUARDO, PARA
VENTA, POSIBLE VENTA-DAÑO y PARA DESECHO.

- **Cambiar estatus** (ficha): si se elige uno de esos estatus para el equipo, se abre el formulario de resguardo con
  ese estatus ya elegido (título "Pasar a PARA VENTA"). Ahí los datos de la persona pasan a N/A, el patrón se borra
  y se eligen departamento, sede, oficina, estatus de la línea y comentario.
- **Servidor:** `cambiarEstatus` y `editar` ya no aceptan esos estatus directo (`exigirFormularioResguardo_`); el
  mensaje dice que se use Cambiar estatus o Mandar a resguardo. El alta (`crear`) no cambia.
- **Equipo que ya estaba guardado** (p. ej. RESGUARDO → PARA VENTA): no se le pide a Pau otra recepción. Se actualiza
  su renglón abierto de APP_RESGUARDOS; si no tiene y la línea va a cancelación, se crea ya EN RESGUARDO (RECIBIO =
  "Ya estaba en resguardo"). El movimiento dice "Cambio a PARA VENTA: …".
- **Probado en /dev (30-sep), BD de pruebas, NUCO 0002 ("PRUEBA MODELO"):**
  1. USO → Cambiar estatus → PARA VENTA: abrió "Pasar a PARA VENTA" con el estatus elegido, DISPONIBLE, sede y
     oficina. Al guardar: responsable en N/A, departamento DISPONIBLE y 1 renglón PENDIENTE DE RECEPCION en la bandeja.
  2. PARA VENTA → PARA DESECHO: "Ya estaban en resguardo: no se pide otra recepción"; la bandeja sigue con 1 solo
     renglón de 0002, ahora con estatus PARA DESECHO.
  3. Editar información → PARA VENTA: no guardó y mostró el mensaje de usar Cambiar estatus.
  - Sin probar en vivo: equipo ya guardado **sin** renglón abierto cuya línea va a cancelación (se crea EN RESGUARDO).
  - El NUCO 0002 quedó en PARA DESECHO con su renglón en APP_RESGUARDOS (datos de prueba).

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
- **Detalles.** La ficha de equipo y de línea muestra el texto de la columna virtual
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

Segunda ronda (commit `0932115`):

- **Listas desplegables** en todo campo que en AppSheet era texto libre y tiene valores conocidos
  (`listaAbierta` con el Combobox: se elige o se escribe uno nuevo). Propiedades nuevas de los elementos:
  `sugerencias` (`PERSONAS`, `NO_EMPLEADO`, `PUESTOS`, `DEPARTAMENTOS` salen de COLABORADORES y `NUMEROS`,
  `IMEIS`, `SIMS` del índice; las completa `opcionesSugeridas` en el navegador para no inflar cada formulario) y
  `autollenar` (`{ COLUMNA: 'noEmpleado' | 'nombre' | 'puesto' | 'departamento' }`: al elegir una persona se
  copian sus datos a campos editables del mismo formulario). Los demás valores salen de `LineasRepo.catalogos()`
  (`catalogos_telefonia_v3`: colores, puestos, jefes, directores, otras apps, identificaciones y motivos de desecho,
  además de los catálogos del AppSheet). TIPO de la inspección y DIA/MES/AÑO de la responsiva son listas cerradas.
  Accesorios: Nombre y Marca con lista; no se permite un artículo repetido (cliente y servidor).
- **Formato del AppSheet completo** (`REGLAS_FORMATO`): se agregaron las flechas de Control de Reasignaciones
  (Responsable Entrante verde con `chevrons-up`, Saliente rojo con `chevrons-down`) y de Control de Cambios (ANTES
  `circle-chevron-down`, DESPUES `circle-chevron-up`); estilos corregidos (RETRO DE SOLICITUD y SOLICITUD en
  cursiva, TIPO en negrita y cursiva, categorías de accesorios en negrita y cursiva). `fondo: true` = la regla trae
  Highlight color. ESTATUS TEMPORAL (USO TEMPORAL ≥ 13 días) sale como aviso rojo en la ficha. Íconos del menú
  iguales a los del AppSheet y acción "Ver línea"/"Ver activo" (View Ref) con `circle-chevron-right`.
- **KPIs en todos los módulos** con línea de color a la izquierda (`.ln-modulo .stat-tile::before`): Gestión de
  Activos (colaboradores, con/sin activos, asignados), Accesorios (+ sin stock), Control de Cambios (+ estatus y
  responsable), Reasignaciones (+ activos y responsables distintos), Desechos (+ año en curso y lugar más frecuente).
- La tarjeta de la ficha se llama **Detalles** y ya no lleva texto de ayuda.

## 0d. Experiencia de uso y diseño (2026-09-24, commit `44a8949`)

El sistema se usará en tabletas y teléfonos; lo principal es revisar rápido un equipo o línea, hacer un ajuste
y capturar responsivas e inspecciones.

- **Menú en celular y tableta vertical** (`html/shell-movil.html`, incluido con una línea al final de
  `Index.html` para no tocar el shell de la rama jorge): por debajo de 900px el menú lateral es un panel que se
  abre con el botón de menú de la barra superior y se cierra al elegir un módulo. La barra superior se compacta
  (sin fecha; sin nombre de usuario en teléfono). **Al unir con master** conviene llevar esto al shell común.
- **Ficha** (`encabezado`, `fichaEnPestanas`): el encabezado trae un *resumen rápido* (responsable, modelo, IMEI,
  línea, departamento; en líneas: compañía, SIM, fin de plan, equipo) y las acciones. Debajo, pestañas
  `tabs-simple` (las mismas del listado): General · Detalles · Documentos · Historial, con conteos. Inspecciones y
  responsivas son una lista (`.ln-docs`) en vez de tablas anchas. "Registro en la hoja" solo en pantallas
  grandes (`.ln-solo-escritorio`).
- **Formularios por pasos** (`PASOS_FORMULARIO`, `htmlPasosAppSheet`, `activarPasos`, `marcarErroresEn`): mismo
  marcado y comportamiento que el componente `Formulario` (`.form-pasos`, `.form-paso-chip`, "Paso x de y",
  Atrás / Siguiente). Los pasos se definen por la columna o el título del AppSheet con que empiezan, así que el
  orden del AppSheet y sus condiciones no cambian. Inspección: Datos · Accesorios y sistema · Estado físico ·
  Accesos y apps · Fotos · Firmas. Responsiva: Responsable · Equipo · Firmas. LINEAS: Identificación ·
  Responsable · Equipo y ubicación · Accesos y plan · Estatus · Sistema nuevo (en edición se salta a cualquier
  paso y se guarda desde cualquiera). Solicitud: Solicitud · Solicitante · Asignación · Línea y equipo. Se valida
  el paso antes de avanzar; los errores se marcan en el campo; al guardar se va al paso del primer error. Los
  pasos que no aplican al TIPO se omiten. Los datos de solo lectura se ven como dato y los ID internos se ocultan.
- **Celular** (≤ 700px): modales a pantalla completa con el formulario desplazable y el pie fijo; KPIs en una
  franja deslizable; inventario en tarjetas por defecto (si no hay preferencia guardada) y más compactas;
  botones de la ficha en rejilla de 2; opciones del checklist más grandes para el dedo.

## 0m. Fechas del adendum bloqueadas y notificaciones (2026-09-29)

Pedido del área: la fecha de fin de adendum solo se captura al registrar la línea, y una semana antes de que venza
el sistema avisa (más adelante también por correo).

- **Bloqueo.** INICIO PLAN y FIN PLAN solo se capturan en el alta. En el AppSheet ya solo se mostraban en el alta,
  pero el servidor aceptaba un valor en la edición. Ahora también llevan `editable: { nuevo: true }` y el servidor
  ignora lo que llegue al editar. El bot de la inspección no las toca.
- **Renovación: pendiente.** Hay que confirmar con el área si al vencer el adendum se renueva y si se conserva el
  número. Todo indica que sí: en la conciliación 19 de 302 líneas de GPH cambiaron su fin de plazo de julio a agosto
  con el mismo número; el inventario del 29-sep tiene 282 líneas activas con el adendum vencido; y el catálogo de
  ESTATUS LINEA trae RENOVADA. Si se confirma, la opción "Renovar adendum" será el único camino para cambiar las
  fechas (con bitácora CAMBIOS y motivo).
- **Notificaciones** (`services/lineas/LineasNotificaciones.gs`, pestaña `APP_NOTIFICACIONES`):
  - Regla. Se avisa de una línea cuando le faltan 7 días o menos para el FIN PLAN. Se omiten:
    - las de ESTATUS LINEA CANCELADA, SIN LINEA o EN PROCESO DE CANCELACION;
    - los TIPO sin adendum: EQUIPO, EQUIPO + SIM BASICO y LINEA BASICA (los SIM básicos no tienen fin de plazo
      aunque la fila guarde el del plan anterior);
    - las filas sin número de 10 dígitos;
    - las fechas que no son fecha, como "00/01/1900" o "N/A".
  - Una notificación por línea y fecha (`CLAVE` = `ADENDUM|<ID>|<yyyy-MM-dd>`). Si el adendum cambia, sale otra.
  - Las que ya estaban vencidas al activar los avisos no se notifican: Script Property `LINEAS_NOTIF_ADENDUM_DESDE`
    (la fecha del primer uso). El área pedirá un histórico de líneas para decidir si se agrega una pestaña de vencidas.
  - Sin disparador: se revisa al consultar la campana, como mucho cada 30 min (`revisar`). Un alta borra esa marca
    (`revisarPronto`). Para el correo: un disparador diario que llame a `LineasNotificaciones.revisar(true)` y mande las
    que no tengan `CORREO_ENVIADO_EN`.
  - Leídas por persona (`LEIDA_POR` = `,correo,`). La ve cualquier sesión (`TelefoniaService.notificaciones`,
    `marcarNotificaciones`; `apiLineasNotificaciones(token, limite)`, `apiLineasMarcarNotificaciones(token, ids)`).
- **Campana y vista** (`html/notificaciones.html`, una línea en `Index.html` y una en `navegarA`):
  - La campana se inserta sola al inicio de `.topbar-right`, con un contador de no leídas. Muestra las 8 más
    recientes, "Marcar todas como leídas" y "Ver todas".
  - Se revisa al entrar, cada 10 min y al volver a la pestaña.
  - Clic en un aviso: lo marca como leído y abre la ficha (`Lineas.irARegistro`).
  - La vista `notificaciones` tiene KPIs (sin leer, vencen esta semana, ya vencieron, total), pestañas No leídas /
    Todas, y "Ver línea" / "Marcar como leída" en cada aviso.
  - **Al unir con master**: la campana es del shell común; los avisos de otros módulos pueden usar la misma pestaña
    y la misma vista.
- Pruebas: `INICIO / FIN PLAN solo se capturan en el alta…` y `Notificaciones: adendum por vencer…` en
  `tests/source-contracts.test.cjs` (45/45). Falta la prueba en /dev.

## 0w. Mandar a resguardo y bandeja de Pau: "Resguardos y cancelaciones" (2026-09-30)

Lo acordado con Líneas el 30-sep. La hoja física de Bren (`INVENTARIO EQUIPOS FISICOS.xlsx`) es el modelo de la
bandeja.

- **Mandar a resguardo** (`LineasResguardos.formulario` / `mandar`; `apiLineasFormularioResguardo` /
  `apiLineasMandarResguardo`):
  - desde **1** equipo seleccionado (DataTable `minimo: 1`);
  - cada NUCO con su sección: DEPARTAMENTO (DISPONIBLE por omisión), SEDE y OFICINA / DESARROLLO (obligatorios;
    mismas listas que "Editar información"), ESTATUS EQUIPO (RESGUARDO, PARA VENTA, POSIBLE VENTA-DAÑO o PARA DESECHO),
    ESTATUS LINEA si tiene línea (DISPONIBLE o EN PROCESO DE CANCELACION) y un comentario;
  - un bloque opcional "Mismos datos para todos" con "Copiar a los N equipos";
  - el motivo es obligatorio.
- **La línea se propone con FIN PLAN:** vencido → EN PROCESO DE CANCELACION; vigente, sin fecha o SIM básico →
  DISPONIBLE. El encabezado de cada NUCO muestra el número, la compañía y la vigencia del adendum.
- **En el servidor:**
  - RESPONSABLE, PUESTO, JEFE DIRECTO y DIRECTOR pasan a N/A;
  - PIN WHATSAPP, PIN EQUIPO y CUENTA GOOGLE pasan a N/A solo si tenían algo (se respeta NO APLICA);
  - "quien usa" pasa a N/A si era el responsable;
  - PATRON se borra;
  - el comentario va a COMENTARIOS;
  - bitácora CAMBIOS y movimiento `RESGUARDO` en APP_MOVIMIENTOS.
- **El estatus cambia al mandar** (como lo describió Gio) y se crea el renglón de la bandeja en **APP_RESGUARDOS**
  (prefijo `RSG` en `Entidades.gs`).
  - Recepción: PENDIENTE DE RECEPCION → EN RESGUARDO → ENTREGADO A LINEAS o VENDIDO.
  - Cancelación (si la línea va a cancelación): POR FIRMAR → CARTA FIRMADA → CARTA ENVIADA → CANCELADA.
  - El asesor se propone por compañía y razón social: AT&T → KARLA, Telcel FRO → WILBERTO, Telcel GPH → ALFREDO.
- **Vista "Resguardos y cancelaciones"** (`resguardos-lineas`, en el menú después de Líneas Telefónicas;
  `initResguardos`, `tpl-lineas-resguardos`):
  - pestañas Resguardos y Cancelaciones, KPIs que filtran, DataTable exportable y "Ver equipo";
  - acciones con selección, solo para quien aprueba: Recibir, Entregar a Líneas (quién recibe y asunto), Vendido
    (también cambia ESTATUS EQUIPO a VENDIDO), Carta firmada (asesor), Carta enviada (asunto) y Confirmar cancelada;
  - **Confirmar cancelada**: ESTATUS LINEA = CANCELADA, TIPO sin línea (EQUIPO + SIM → EQUIPO) y se limpian los datos
    de línea (`VALORES_SIN_LINEA`; el número queda en la bitácora). Solo si el registro todavía tiene ese número.
  - Los demás ven el avance, en solo lectura.
- **Quién aprueba:** ADMIN o los correos de la Script Property `LINEAS_APROBADORES_RESGUARDO`, separados por coma
  (Pau y su suplente). **Falta el correo de Pau.** `apiLineasPermisos` trae `puedeAprobarResguardos`.
- **Aviso:** APP_NOTIFICACIONES tiene una columna nueva `PARA`. Vacía = todos; `APROBADORES_RESGUARDO` = solo quien
  aprueba (`LineasNotificaciones.crear`). Al mandar a resguardo le llega "Equipos por recibir · N".
- Ya no hay "Mandar a resguardo" en `LineasRegistros.MASIVAS`; ahí solo queda Reasignar.
- **Probado en /dev (30-sep, sin guardar):**
  - el botón aparece con 1 seleccionado;
  - el formulario precarga sede y oficina y propone la línea;
  - el NUCO 0101, con el adendum vencido el 08/04/2026, sale con EN PROCESO DE CANCELACION;
  - con 2 equipos aparece "Mismos datos para todos";
  - la bandeja carga vacía con sus pestañas y KPIs.
  - No se mandó nada a resguardo, porque la BD de pruebas la está limpiando el equipo.
- Prueba: `Mandar a resguardo (30-sep): …` en `tests/source-contracts.test.cjs` (54/54). Ayrton: sus pruebas de
  Entidades cuentan ahora 28 hojas y 4 APP_.

## 0v. Pestañas de los módulos retirados: migradas y borradas de la BD de pruebas (2026-09-30)

Pedido del usuario: borrar de la BD de pruebas (`1fC77Uu1…`) las pestañas de los módulos que ya no existen, para que
el equipo no las limpie en balde. Lo que el sistema usa se migró antes.

- **Migrado a APP_MOVIMIENTOS:**
  - HISTORIAL_REASIGNACIONES (1,167), BITACORA DE DESECHO (234) y REACTIVACION DE LINEAS (321);
  - un movimiento `TIPO = HISTORICO` por renglón, con el renglón original completo en
    `DETALLE_JSON = { hojaAnterior, fila }`;
  - `REFS` lleva la referencia al registro (ID Linea, ID_EQUIPO o IMEI) y `FECHA` la del evento.
- **Cómo se lee:** `LineasRepo.separarMigrados_` los regresa como si vinieran de su pestaña (las fechas vuelven a ser
  Date), así que el Historial y "Números que ha tenido" los muestran igual que antes.
  - Si la pestaña todavía existe (por ejemplo, en producción o en la versión de consulta), también se lee, sin repetir
    los renglones ya migrados (misma ID).
- **Borradas:** esas tres y SOLICITUD DE LINEAS (229, no la usaba nada). **CAMBIOS LINEAS TELEFONICAS no se toca.**
- **Respaldo** antes de borrar, en el Drive de auxiliar7datos:
  - libro "RESPALDO Líneas · pestañas retiradas · 2026-09-30 13:13" (`1aS-9Bo6qOL8G53eBl1QdfeV2ETK2YKObjfpSsIGq0YU`);
  - su .xlsx (`1YnlMUmO0qE2aCihm6ULKc9_fYaHn4OGT`);
  - Script Property `LINEAS_RESPALDO_HOJAS_RETIRADAS`.
- **Funciones** (`LineasAdmin.gs`, desde el editor): `retirarHojasLineas_revisar` (no escribe),
  `retirarHojasLineas_migrar` (respaldo más migración, sin repetir) y `retirarHojasLineas_borrar`.
  - Borrar exige respaldo y migración completa, y solo corre en la BD de pruebas.
  - También limpia la caché de encabezados `enc_<pestaña>`: sin eso, `existeTabla` seguía viendo la pestaña.
- **Código retirado:**
  - Reactivación, Solicitud, Reasignaciones y Bitácora de Desechos: rutas, módulos (`Modulos.gs`), vistas y
    `abrirAltaAppSheet`;
  - `LineasOperativas.gs`, `lineas-operativa.html`, las API `*Operativa`, sus configuraciones de
    bitácora y exportación;
  - `HISTORIAL_REASIGNACIONES` ya no se escribe al reasignar.
  - Control de Cambios queda fuera del menú, pero su vista sigue.
- **Probado en /dev** (NUCO 0234) antes y después de borrar: el Historial queda igual (133 movimientos, 13
  reasignaciones, 1 reactivación) y "Números que ha tenido" trae 9 periodos. Las dos reasignaciones del 17/06/2026 son
  reales (ida y vuelta el mismo día).
- **Avisar al unir:**
  - la copia de Líneas en master y en las ramas de Jorge y Ayrton todavía lee esas pestañas, y su Historial falla en la
    BD de pruebas hasta unir;
  - `Entidades.gs` y `MigracionIds.gs` (Ayrton) todavía las listan: siguen existiendo en producción;
  - si PERFILES tiene renglones de `reactivacion-lineas`, `reasignaciones-lineas`, `solicitud-lineas` o
    `bitacora-desechos`, `revisarCatalogo` los marcará como desconocidos.

## 0u. Estatus nuevos, departamento DISPONIBLE y menú (2026-09-30, reunión con Líneas)

Primer paso de lo acordado con Líneas el 30-sep. Detalle de la reunión en la carpeta de documentación:
`migracion/RESULTADOS_REUNION_LINEAS_30SEP.md`; conversión de datos en `migracion/CONVERSION_ESTATUS_LINEAS.md`.

- **Listas** (`LineasRepo.CATALOGO`), sin acentos como pide el AppSheet:
  - **Equipo:** USO, RESGUARDO, DONADO, PARA VENTA, VENDIDO, POSIBLE VENTA-DAÑO, EXTRAVIO-ROBO, PARA DESECHO y
    DESECHADO.
  - **Línea:** USO, DISPONIBLE, EN PROCESO DE CANCELACION y CANCELADA.
  - Los equipos ya no se cancelan: solo las líneas.
- **Sin línea = ESTATUS LINEA en blanco.**
  - `VALORES_SIN_LINEA` escribe `''` (antes "SIN LINEA").
  - En el formulario, "SIN LINEA" y el "N/A" del equipo se muestran en blanco (`ESTATUS_EN_BLANCO`); al guardar queda
    en blanco.
- **Valores viejos** (FUERA DE INVENTARIO, VENTA, CANCELADO…):
  - se ven con su chip y en el formulario "(no está en la lista)";
  - para guardar hay que elegir uno nuevo;
  - el servidor solo revisa la lista si el valor cambió (`validaSiCambia`), así un valor viejo sin tocar no bloquea las
    acciones masivas.
  - Los corrige Líneas; no se convierten solos todavía.
- **Departamento DISPONIBLE:** se agrega a la lista de departamentos (`DEPARTAMENTO_DISPONIBLE`); CONTROL INTERNO se
  queda. Caché de catálogos `catalogos_telefonia_v4`.
- **Acciones masivas:** se quitó "Cancelar equipos". Quedan "Mandar a resguardo" y "Reasignar", que se rehacen en el
  siguiente paso (N/A automáticos, captura por NUCO, bandeja de Pau).
- **Menú:** fuera Control de Reasignaciones, Solicitud, Control de Cambios y Bitácora de Desechos, además de
  Reactivación. Sus líneas en `NAV_GRUPOS` están comentadas y sus vistas siguen en `navegarA`. **La bitácora CAMBIOS no
  se toca:** alimenta el Historial, "Números que ha tenido" y el Panorama. Se quitó la tarjeta de Control de Cambios del
  Inicio.
- Colores nuevos en `COLOR_ESTATUS`: DISPONIBLE azul; PARA VENTA, POSIBLE VENTA-DAÑO y PARA DESECHO ámbar;
  EXTRAVIO-ROBO rojo.
- **Probado en /dev** (30-sep, sin guardar):
  - el menú tiene 3 módulos;
  - el NUCO 0003 (FUERA DE INVENTARIO) muestra la lista nueva con el valor viejo marcado y ESTATUS LINEA en blanco;
  - DISPONIBLE está en DEPARTAMENTO.
- Prueba nueva: `Estatus del 30-sep: …` en `tests/source-contracts.test.cjs` (54/54).

## 0t. Selección como en los equipos Apple (2026-09-30)

Referencia: el Finder y Mail en Mac (cuadro de selección, Cmd+clic, Shift+clic) y las listas de iPhone y iPad (botón
"Seleccionar", arrastrar para marcar varias). Todo vive en la opción `modoSeleccion` del DataTable, así que las tablas
de los compañeros no cambian.

| Cómo | Qué hace |
|---|---|
| Arrastrar con el mouse sobre la tabla | Dibuja un cuadro y marca las filas que toca; entra al modo selección |
| Arrastrar con Ctrl/Cmd | Alterna las filas que toca, sin perder las demás |
| Arrastrar con Shift | Agrega las filas que toca |
| Ctrl/Cmd+clic | Marca o desmarca una fila |
| Shift+clic | Rango desde la última fila tocada, aunque ese clic haya abierto la vista rápida |
| Ctrl/Cmd+A | Todas las filas que pasan los filtros |
| Esc | Quita la selección y sale del modo, en un solo paso |
| Botón "Seleccionar" / "Listo" | Igual que en iPhone; con el dedo se arrastra sobre las casillas |

- Un clic suelto sigue abriendo la vista rápida: el cuadro empieza después de mover 6 px.
- El clic que llega al soltar el cuadro no llega al módulo (no abre la vista rápida).
- Cerca del borde de arriba o de abajo, la tabla se desplaza sola.
- Al marcar la primera fila aparecen las casillas y la barra de seleccionados. La página se desplaza lo mismo para
  que la tabla no brinque bajo el cursor; antes, el cuadro perdía filas.
- Probado en /dev: cuadro de 4 filas, clic = vista rápida, Shift+clic, Esc y Ctrl+A (1,584).

## 0s. IDs estandarizados de Ayrton (2026-09-30)

El 29-sep Ayrton migró la hoja de pruebas al modelo de IDs (`docs/ids.md`, `docs/ids-asignacion.md`):
- cada pestaña tiene `ID` en la columna A con prefijo (`LIN-`, `ILI-`, `RLI-`, `CLI-`, `HIS-`, `DES-`…);
- en las 8 pestañas cuya columna ya se llamaba `ID`, el valor anterior quedó en `ID APPSHEET`.

El paso 3 (reescribir las referencias) **no se ha corrido** en la hoja de pruebas: las pestañas que citan a una línea
siguen con el ID del AppSheet (`ID LINEA`, `ID_LINEA`, `ID Linea`, `ID_EQUIPO`, `IMEI` de Reactivación,
`APP_EVIDENCIAS.ID_REGISTRO`, `REFS`). Por eso la ficha salía sin historial ni documentos.

Qué se hizo, para que funcione antes y después del paso 3:
- **Búsquedas con los dos IDs.** `LineasRepo.idsDeRegistro(id)` da `[ID, ID APPSHEET]` (mapa en caché 6 h);
  `idActual(id)` convierte el del AppSheet al vigente. Historial, documentos, asignaciones, inspecciones, PDF y
  Reactivación buscan con los dos. `LineasDatos.buscarFilasPorId` cae a `ID APPSHEET` si no encuentra el ID.
- **Lo que el sistema nuevo registró antes de migrar** (APP_MOVIMIENTOS con `idsCambios` viejos) sigue ocultando
  sus filas de la bitácora: se compara contra `ID`, `ID_CAMBIO` e `ID APPSHEET`.
- **CAMBIOS LINEAS TELEFONICAS:** sus encabezados en blanco se ubican por la columna vecina de `ID_LINEA` y no por
  posición (la columna `ID` nueva recorrió todo). La bitácora nueva escribe el mismo valor en `ID` y en `ID_CAMBIO`.
- **PERSONAL DG:** la fórmula lo reconoce por el ID del AppSheet (`DG001`), también en el formulario.
- **IDs nuevos:** `src/utils/Ids.gs` y `src/config/Entidades.gs` vienen de la rama `ayrton` sin cambios, más
  `APP_NOTIFICACIONES` (`NTF`). `LineasDatos.agregarFilas` pone el ID con el prefijo de la pestaña si no viene (la
  misma regla que `SheetUtils.insert`). Las llaves que el AppSheet sigue usando se llenan igual: `ID_DESECHO`,
  `ID Historial`, `ID_Accesorio`, `ID_Movimiento`.
- **No se tocó la hoja** ni `SheetUtils.insert` (los módulos de los compañeros lo reciben al unir con master).
- **Probado en /dev:** el NUCO 0234 pasó de 0 a 129 movimientos y 9 documentos. Su inspección abre con la foto.

## 0r. Modo selección, Atrás/Adelante, vista rápida conectada y "Última …" más rápida (2026-09-30)

- **Modo selección** (opción `modoSeleccion` del DataTable, compartido; avisar al unir):
  - Las casillas quedan ocultas hasta tocar "Seleccionar", como en iOS.
  - En el modo, el clic en cualquier parte de la fila la marca, arrastrar marca o desmarca varias y Shift+clic marca
    un rango.
  - Ctrl/Cmd+clic entra al modo desde una fila.
  - "Listo" o Esc sale y quita la selección.
  - Con el dedo se arrastra desde la columna de casillas (el resto de la fila desplaza la tabla).
  - Las tablas que no piden la opción no cambian. Líneas la activa en todas sus tablas (`tablaLineas`).
  - Corrección incluida: `render()` reescribe `className` de la tabla; ahora conserva las clases del modo.
- **Sin columna de Acciones** en Líneas Telefónicas: se quitaron el ojo y el botón de ampliar. Un clic en la fila abre
  la vista rápida (que trae "Abrir ficha completa", así también funciona en celular) y el doble clic la ficha. En
  modo selección, o con Ctrl/Cmd/Shift, el clic marca filas y no abre nada.
- **Atrás / Adelante del navegador** (`html/historial-navegador.html`, `HistorialApp`):
  - Usa `google.script.history`. Lo disparan el gesto de dos dedos del touchpad en Chrome, los botones del mouse y
    Alt+←/→.
  - Cada cambio de módulo es un paso (una línea en `navegarA` de `app.html`, compartido).
  - En Líneas Telefónicas cada ficha que se abre es otro paso (`pasoHistorial`, `restaurarPaso`). La pestaña solo
    actualiza el paso actual.
  - Al restaurar no se guardan pasos nuevos (`abrir(…, sinHistorial)`, `cerrarDetalle(true)`).
  - Probado en /dev: Atrás desde la ficha regresa a la lista y Adelante la reabre. Atrás entre módulos no se pudo
    probar con el navegador integrado (no manda Alt+← al navegador).
- **Vista rápida conectada:** en la de un equipo, el número de su línea es un botón que cambia a la vista rápida de
  la línea; en la de la línea, "NUCO …" regresa al equipo. Probado con NUCO 0012 ↔ Línea 4421090805.
- **"Última responsiva / inspección" más rápida:**
  - Servidor: `archivosNuco(nuco, soloTipo)` recorre solo INSPECCIONES o CARTA RESPONSIVA, no todo el NUCO. Caché
    aparte de 10 min; si el NUCO completo ya estaba en caché, se usa ese.
  - Cliente: la respuesta se pide antes del clic y se guarda 9 min (`ultimoNucos`, `precargarUltimosNucos`). Se pide
    al abrir la vista rápida o la ficha y al dejar el mouse 150 ms sobre el botón.
  - La pestaña nueva dice "Buscando el documento…" en vez de quedarse en blanco.

## 0q. Navegación de la ficha, fotos en NUCOS y tema (2026-09-30)

- **Clic y doble clic** en la tabla de Líneas Telefónicas: un clic en la fila abre la vista rápida y el doble clic la
  ficha completa. El clic espera 260 ms: si llega el segundo, es doble clic y la vista rápida no se abre. El ojo y el
  botón de ampliar siguen en Acciones.
- **Auditoría de las migas** (`migas`, `etiquetaMiga`). Cada nivel se nombra por lo que es: el equipo por su NUCO, la
  línea por su número y la inspección por su fecha. Se corrigió:
  - la línea decía "NUCO …" cuando estaba en un equipo;
  - la inspección decía solo "Inspección";
  - el nivel anterior (NUCO) se veía más resaltado que la página actual. Ahora la actual va en negritas y los
    anteriores son enlaces discretos;
  - "Volver" dice a dónde regresa ("Volver a NUCO 0008" / "Volver a Líneas Telefónicas");
  - en celular solo se ven Volver y la página actual.
- **Pestaña recordada:** cada nivel de la pila guarda su pestaña (`pila[...].pestana`, lo guarda
  `mostrarPestanaFicha`). Al volver de una inspección abierta desde Documentos, la ficha regresa a Documentos, no a
  General.
- **Fotos en inspecciones de NUCOS:**
  - "Agregar fotos" había desaparecido porque se ocultaba en las inspecciones de la carpeta NUCOS, que desde §0k son
    la mayoría. NUCOS es de producción y solo se lee, así que las fotos nuevas van a una carpeta de la app.
  - Se ligan en APP_EVIDENCIAS con ORIGEN `NUCOS_FOTOS` e ID_REGISTRO `drive_<carpeta>`. No es ORIGEN DRIVE, para no
    duplicar la inspección en Documentos.
  - La vista de la inspección las junta con las de NUCOS (`carpetaFotosExtra_`).
  - Se quitó la nota "Esta inspección está en la carpeta NUCOS…".
- **Tema claro/oscuro:** el botón del modo actual solo se marcaba al mostrar el login; entrando con la sesión guardada
  ninguno aparecía activo. `marcarTemaActual()` en `app.html` (compartido: avisar al unir) lo marca al cargar y en
  cada render.
- Pregunta nueva para el área: CO3, qué debe traer la vista rápida.
- Probado en /dev (30-sep):
  - clic abre la vista rápida y doble clic la ficha;
  - migas NUCO 0008 › Línea 4421155221 › Inspección 18 ago 2026;
  - "Agregar fotos" visible en una inspección de NUCOS (no se subió ninguna: el navegador integrado no elige archivos);
  - Volver regresa a Documentos;
  - tema marcado al recargar;
  - migas en celular.

## 0p. Vista rápida, responsiva editable y calificación en vivo (2026-09-29)

- **Vista rápida** en Líneas Telefónicas (`vistaRapida`, panel lateral `abrirPanelLateral` con el aspecto del detalle
  de DataTable):
  - El ojo de cada fila abre un panel a la derecha. El botón de ampliar (o doble clic en la fila) abre la ficha
    completa, como antes.
  - Lo fundamental: estatus del equipo y de la línea, TIPO, responsable (No. empleado, puesto, departamento, área,
    sede, oficina, jefe), equipo (NUCO, modelo, IMEI, accesorios, última inspección), línea (número, SIM, compañía,
    razón social, costo) y fin del adendum con chip "Vencido hace N días / Vence en N días / Vigente". También lleva
    los comentarios y los botones "Abrir ficha completa", "Última responsiva" y "Última inspección".
  - Sale del índice y la vista del AppSheet que ya están en memoria, así que abre al instante.
- **Responsiva editable** (`formularioResponsiva_`):
  - Los datos del responsable y del equipo se precargan y ahora se pueden corregir, como en la inspección:
    - listas abiertas y autollenado del colaborador (No. empleado, puesto, departamento);
    - RESPONSABLE es obligatorio;
    - ACCESORIOS con pastillas (la lista del AppSheet más lo que ya traiga la línea).
  - Siguen fijos: ID, ID LINEA, NUCO, FECHA RESPONSIVA y NOMBRE CI.
  - Lo corregido va a RESPONSIVAS LINEAS y a su PDF. **LINEAS TELEFONICAS no cambia**: la responsiva no tiene el bot
    de la inspección. Pendiente preguntar al usuario si debe copiarse a la línea.
  - Son listas abiertas (no cerradas como en la inspección) para que un valor viejo fuera del catálogo no impida
    firmar.
- **Calificación en vivo** en la inspección (`pintarCalificacionVivo`, `#ln-calif-vivo` en el encabezado de la
  captura, que no se desplaza):
  - Porcentaje con la misma fórmula del AppSheet, más una barra y "N de M puntos calificados". Solo cuentan los
    puntos que califican y se ven para el TIPO.
  - Sin colores de "buena/mala": el AppSheet no define umbrales.
  - En celular va debajo del título.
- Probado en /dev (29-sep, sin guardar): vista rápida del NUCO 0008, calificación 66.67% con 3 de 18 puntos, y la
  responsiva con sus campos editables.
- Prueba: `Vista rápida en Líneas Telefónicas, responsiva editable y calificación en vivo…`.

## 0o. Panorama de Líneas y Reactivación oculta (2026-09-29)

- **Reactivación de Líneas** sale del menú: su línea en `NAV_GRUPOS` está comentada. La vista, la ruta en `navegarA`,
  el módulo en `Modulos.gs` y el código se conservan por si la vuelven a pedir; para regresarla basta con quitar el
  comentario.
- **Panorama** (`panorama-lineas`) es el primer elemento del grupo Líneas y tiene tarjeta en Inicio. Pedido del área:
  ver de un vistazo cuántos equipos y líneas hay por estatus, hoy y mes a mes.
  - Servidor: `LineasPanorama.panorama(forzar)` (`apiLineasPanorama`, caché 30 min, "Actualizar" la rehace).
    - Hoy: el estatus de cada equipo y de cada línea, igual que en el índice de Líneas Telefónicas.
    - Mes a mes: se reconstruye hacia atrás desde hoy con los cambios de ESTATUS EQUIPO / ESTATUS LINEA de CAMBIOS
      LINEAS TELEFONICAS (el ANTES de cada cambio posterior al cierre del mes). En producción la bitácora empieza el
      22-abr-2025 (unos 4,800 cambios de estatus). Antes de eso, cada registro conserva el estatus que tenía antes
      de su primer cambio. Un registro cuenta desde su FECHA REGISTRO; las fechas antes del 2000 o en el futuro (hay
      1969 y 2027) se ignoran. Máximo 36 meses. El último punto es hoy y coincide con los indicadores.
    - La bitácora se busca por ID y por ID APPSHEET (migración de IDs de la BD de pruebas).
  - Cliente (`initPanorama`, `views/lineas/lineas-panorama.html`, estilos `.lnp-*`):
    - Indicadores: equipos, en uso, en resguardo, líneas y líneas en uso.
    - "Hoy": barras por estatus de equipos y de líneas, en un solo color porque se compara cantidad. Clic en una
      barra o en un indicador abre Líneas Telefónicas con ese estatus filtrado (`irConEstatus`,
      `memoria.filtrarAlEntrar`).
    - "Mes a mes": Equipos | Líneas, 6 meses | 12 meses | Todo, y Gráfica | Tabla.
      - La gráfica es de líneas: 2 px, punto final con aro y etiqueta al final (las que chocan se omiten). La cruz
        sigue al puntero y el tooltip muestra todas las series; también funciona con las flechas del teclado.
      - Los estatus se eligen con pastillas, 4 por omisión. Los 7 con más registros hoy tienen color fijo; el resto
        va en OTROS.
      - La tabla tiene un renglón por mes y todos los estatus, y se exporta a Excel.
    - Colores validados con el validador de la guía de visualización contra las superficies del sistema (claro
      `#ffffff`, oscuro `#142732`): pasan en los dos modos. En claro, tres colores tienen poco contraste, así que
      llevan etiquetas visibles y la tabla.
- Probado en /dev (29-sep):
  - datos: 1,584 equipos (886 en uso) y 1,012 líneas; "Hoy" coincide con los indicadores;
  - funcionan el tooltip, la tabla, el modo oscuro y el clic de RESGUARDO (abre Líneas con 77 de 1,012).
- Prueba: `Panorama: estatus al cierre de cada mes…` en `tests/source-contracts.test.cjs`.

## 0n. Acciones masivas de equipos (2026-09-29)

Pedido del área: al seleccionar dos o más equipos en Líneas Telefónicas, mandar a resguardo, reasignar o cancelar.

- **Dónde.** Pestaña Equipos de la tabla. Los botones aparecen en la barra de la DataTable desde 2 seleccionados.
  Para eso se agregó `minimo` a `accionesSeleccion`: es opcional y compatible, pero es del componente compartido,
  así que hay que avisar a Ayrton y Jorge al unir. Solo los ve quien puede operar (ADMIN u OPERADOR); el servidor
  lo vuelve a revisar.
- **Qué hace cada una** (`LineasRegistros.formularioMasivo` / `accionMasiva`, `apiLineasFormularioMasivo` /
  `apiLineasAccionMasiva`):
  - *Mandar a resguardo*: ESTATUS EQUIPO = RESGUARDO. El responsable no cambia.
  - *Reasignar*: RESPONSABLE (obligatorio), No. EMPLEADO, PUESTO y DEPARTAMENTO, con las mismas listas y el
    autollenado del colaborador que "Editar información". ESTATUS EQUIPO queda siempre en RESGUARDO y no se elige
    (pedido del usuario, 29-sep). Lo que se deja vacío queda como estaba en cada equipo. Si en la fila el responsable es quien usa el equipo, NOMBRE/PUESTO QUIEN USA siguen al
    nuevo responsable (Reset_If del AppSheet).
  - *Reasignar* tiene dos formas, con un selector arriba:
    - **Mismo responsable para todos** (la de arriba).
    - **Uno por uno**: una sección por equipo con No. EMPLEADO, RESPONSABLE, PUESTO y DEPARTAMENTO precargados con
      los actuales, para editarlos rápido. Solo se validan y se envían los campos que cambiaron
      (`datos.modo = 'INDIVIDUAL'`, `datos.porEquipo = { id: {...} }`, `reasignacionIndividual_`). Un equipo sin
      cambios no se toca. Las columnas de cada equipo llevan el prefijo `FILA|<id>|`. Las listas de colaboradores
      de cada sección se activan al entrar a ella, para no crear cientos de listas de golpe.
  - *Cancelar equipos*: ESTATUS EQUIPO = CANCELADO. El botón es rojo y desde 10 equipos pide escribir CANCELAR.
- **Siempre.** El motivo es obligatorio. Antes de aplicar se pide confirmar con la lista de equipos. Cada equipo deja
  su bitácora CAMBIOS (y HISTORIAL_REASIGNACIONES al reasignar) y su movimiento `EDICION` con el motivo
  "Acción masiva · …", así su historial muestra solo sus cambios. Se omiten sin error los que ya no existen, los que
  no son equipo y los que ya tenían esos datos; se avisan al terminar. Máximo 150 por operación (límite de 6 min de
  Apps Script). Al final se rehace el índice una sola vez.
- **La línea no se toca** (número ni ESTATUS LINEA). El área va a confirmar qué le pasa a la línea cuando su equipo
  se manda a resguardo, se cancela o se reasigna, y qué acciones masivas habrá para líneas.
- **Pendiente de la reunión con Líneas (30-sep).** Las preguntas están en la carpeta de documentación,
  `migracion/PREGUNTAS_REUNION_LINEAS.md`:
  - quién queda como responsable al mandar a resguardo;
  - si al cancelar se quita el responsable;
  - qué otros campos cambian en cada acción;
  - qué le pasa a la línea.
  Hoy las tres acciones solo cambian lo descrito arriba.
- Probado en /dev (29-sep):
  - con 1 seleccionado solo aparece Copiar; con 2 aparecen las tres acciones;
  - el formulario de Reasignar valida los obligatorios y autollena No. empleado y puesto;
  - no se aplicó ninguna acción a la BD compartida.
- Prueba: `Acciones masivas de equipos…` en `tests/source-contracts.test.cjs`.

## 0l. Historial de asignaciones número ↔ NUCO (2026-09-29)

Pedido del área: saber qué números tuvo un NUCO (y en qué NUCOs estuvo un número), con fechas y motivo.

- En el filtro **Movimiento** del Historial de la ficha: "Números que ha tenido" (ficha de equipo) o "Equipos en
  los que ha estado" (ficha de línea). Al elegirlo, la tabla cambia a `lineas-asignaciones-v1`: Número / NUCO,
  Desde, Hasta ("Actual"), Motivo, Usuario y Origen, exportable a Excel, con "Ir al número" / "Ir al NUCO".
  Casilla "Ocultar «Sin línea»" / "Ocultar «Sin equipo»" junto al filtro (`ocultarSinAsignar`, `periodosVisibles`):
  esos periodos suelen ser transiciones; se ocultan de la tabla, no se quitan de los datos. Sin nota de ayuda arriba.
- Probado en /dev (29-sep) con el NUCO 0234: 9 periodos (5 con número y 4 "Sin línea"); la casilla deja 5.
- Filtro Movimiento agrupado (`GRUPOS_MOVIMIENTO`, `opcionesMovimiento`), en orden fijo y solo con lo que hay:
  Historial de asignaciones · Responsable y ubicación · Equipo y línea · Documentos · Alta, reactivación y
  desecho · Otros.
- Controles del historial en su propia barra (`.ln-historial-filtros`, debajo del título y encima de la búsqueda de
  la tabla): "Movimiento" con ícono y, al lado, la casilla "Ocultar «Sin línea»" como pastilla (resaltada al
  marcarla, solo en asignaciones). En escritorio van en una fila; en pantallas angostas se acomodan en dos.
- Correcciones (29-sep): "Editar información" fallaba ("Cannot set properties of null") porque el campo de motivo
  usaba la clase de los campos del AppSheet (`ln-af-campo`); ahora es `ln-af-seccion ln-af-extra` + `field`.
  `LineasDatos.leerFilas` ya no abre pestañas de las que no se pide ninguna fila (una hoja sin `APP_MOVIMIENTOS`
  hacía fallar "Números que ha tenido").
- Botón para ir (29-sep): en asignaciones, el número o NUCO de cada periodo es una pastilla (`botonIr`, `.ln-ir-chip`)
  que abre su ficha; en el historial normal, Antes/Después de NUMERO TELEFONO, NUCO e IMEI abren la ficha de quien lo
  tiene hoy (`destinosInventario`, con el índice del inventario). Si ya no está en el inventario, queda como texto.
  Probado en DEV con el NUCO 0234 (abre la línea 4423382586, hoy en el NUCO 0274).
- Sin pestaña nueva: `LineasRepo.asignacionesDeRegistro(id, vista)` (→ `TelefoniaService.asignaciones` →
  `apiLineasAsignaciones`, pedido en paralelo al historial) reconstruye cada fila de LINEAS TELEFONICAS donde
  aparece el NUCO o el número, desde su estado actual hacia atrás con los cambios de NUMERO TELEFONO y NUCO de
  CAMBIOS LINEAS TELEFONICAS (la columna NUCO del bot es el NUCO de la fila después del cambio). Cambios a menos
  de 2 min son la misma edición; tramos seguidos iguales se unen. El primer tramo empieza en FECHA REGISTRO (NOW()
  al dar de alta) o se muestra "Antes del …".
- Motivo: APP_MOVIMIENTOS (por `idsCambios`) o REACTIVACION DE LINEAS (mismo registro y NUEVO NUMERO); el
  AppSheet no pedía motivo, así que lo anterior sale "Sin motivo registrado".
- "Editar información" pide el motivo cuando cambia el número o el NUCO (no si solo se homologa "5" → "0005");
  se guarda en APP_MOVIMIENTOS.MOTIVO. Tope: 25 registros relacionados por consulta (`incompleto`).
- Prueba: `Historial: números que ha tenido un NUCO…` en `tests/source-contracts.test.cjs` (43/43).

## 0k. Tabla como antes y documentos desde NUCOS (2026-09-28, segundo ajuste)

- NUCO a 4 dígitos al mostrar: `LineasUtil.nucoVisible` (vista, `legado`, Detalles, bitácoras, historial, Excel).
  Índice en caché `indice_telefonia_v4`.
- Tabla: `TABLAS_INVENTARIO` vuelve a las columnas del índice; `columnasVistaLineas(sinEstas)` agrega las de la vista
  del AppSheet que faltan, ocultas. RESPONSIVA / FORMATO INSPECCION = `botonUltimoNucos` ("Última responsiva" /
  "Última inspección") → `apiLineasUltimoDocumentoNuco` → `TelefoniaService.ultimoDocumentoNuco` (carpeta más
  reciente del tipo en NUCOS y su PDF RESP/INSP; sin PDF, la carpeta). Vista guardada `lineas-<modulo>-v4`.
- Ficha: sin `pdfRuta` (PDF de la carpeta de la app) ni `DETALLE_RESPONSIVA` / `apiLineasResponsiva`.
- Segundo ajuste: botón "Ver"; General como antes (sin total de rotaciones); Documentos como antes, con las de NUCOS
  en la misma lista: `TelefoniaService.evidencias` agrega `evidenciasNucos_` (una por carpeta INSP/RESP DD MM) y
  `inspeccion('drive_<carpeta>')` usa `inspeccionNucos_` si no hay APP_EVIDENCIAS. Sin `apiLineasDocumentosNuco`.
- Tercer ajuste: Documentos = `pintarDocumentos` (KPIs con `tilesKpi` + DataTable `lineas-documentos-v1`, liberada con
  `soltarDocumentos`; `exportar: false`; doble clic abre la inspección o el PDF de la responsiva);
  `generarPdfPendiente` reemplaza el botón `data-ln-pdf`. Detalle de inspección con `encabezado`
  y `tarjeta` (sin checklist, firmas ni `DETALLE_INSPECCION`); sin Patrón en General.
- Después de la auditoría: sin `tarjetaRegistro` (Tipo con `tipoRegistro` en Equipo / Línea); formulario de LINEAS
  sin campos de archivo (`subirArchivos_` se quitó); NUCO homologado al guardar (`homologarNuco_`, y en
  `guardarCambiosRegistro` "5" → "0005" se escribe sin entrar a la bitácora).
- Prueba real en DEV (28-sep): alta y edición correctas; NUCO "2" se guardó "0002" (texto) y la bitácora dejó
  9999 → 0002. Inspección, responsiva y fotos quedan para prueba manual (el navegador integrado no firma ni elige
  archivos).

## 0j. Vista del AppSheet, NUCOS y una sola carpeta de Drive (2026-09-28; tabla y documentos ajustados en §0k)

- Tabla: `COLS_VISTA_LINEAS` (servidor) y `COLUMNAS_VISTA_LINEAS` (cliente) = ColumnOrder de la vista LINEAS
  TELEFONICAS; el índice trae el bloque `vista` (una fila por registro) y el cliente lo une a cada fila.
- Drive (`LineasArchivos`): `LINEAS_DRIVE_APPSHEET` (app AppSheet de pruebas, se lee y escribe con rutas del
  AppSheet: `guardarComoAppSheet`, PDF en `INSPECCIONES_Files_` y `Files`) y `LINEAS_DRIVE_NUCOS` (producción, solo
  lectura: `archivosNuco` para Documentos). Ya no existe `LINEAS_DRIVE_CARPETA_RAIZ`.
- Detalles: `DETALLE_INSPECCION` / `DETALLE_RESPONSIVA` (TelefoniaService) con el orden y DisplayName del AppSheet.
- Edición de operativas: `LineasOperativas.formularioEdicion` / `editar` y `abrirAltaAppSheet(…, edicion)`.

## 0i. Archivos del AppSheet y carpetas de Drive (2026-09-25; carpetas reemplazadas por §0j)

`LineasArchivos.gs` abre los archivos que el AppSheet guarda como ruta relativa (desde la carpeta raíz del AppSheet,
`LINEAS_DRIVE_APPSHEET`) y lee las carpetas de NUCO de `LINEAS_DRIVE_NUCOS`; ambas son de producción y solo se leen.
Lo nuevo se guarda en `LINEAS_DRIVE_CARPETA_RAIZ` (pruebas en DEV) y escribir en producción desde DEV se bloquea.
En el cliente, `botonArchivo(ruta, texto)` pinta el ícono y `apiLineasArchivo` resuelve la ruta al hacer clic.

## 0h. Panel lateral en Gestión de Activos (2026-09-25)

El colaborador se abre en `abrirPanelLateral` (mismas clases `.dt-panel` del detalle de DataTable), no al final de
la página. El ayudante sirve para cualquier otro detalle de Líneas que no venga de una DataTable.

## 0g. Hoja de Líneas en DEV (2026-09-25; `usarCopiaAppSheetLineas` y la copia `1_47fd…` se retiraron el 28-sep)

Líneas pasa a la BD de pruebas del equipo (`1fC77…`), la misma de Usuarios, Vehículos y Accesorios.
`configurarLineasDev()` revisa pestañas y columnas contra la copia del AppSheet (`1_47fd…`) antes de cambiar
`SS_ID_TELEFONIA`; `usarCopiaAppSheetLineas()` regresa a la copia.

## 0f. Exportar a Excel = base completa del módulo (2026-09-25, commit `cf63f59`)

Antes el botón descargaba lo que se veía (columnas visibles, filtros, búsqueda) y en las bitácoras solo las 5000
filas más recientes que carga la tabla. Ahora "Exportar a Excel" descarga **todas las filas y todas las columnas**
de la pestaña del módulo, sin importar filtros:

| Módulo | Pestaña(s) |
|---|---|
| Líneas telefónicas (Equipos y Líneas) | LINEAS TELEFONICAS |
| Inventario de accesorios | ACCESORIOS CELULARES + MOVIMIENTOS_ACCESORIOS (dos hojas en el archivo) |
| Reactivación / Solicitud | REACTIVACION DE LINEAS / SOLICITUD DE LINEAS |
| Control de Cambios / Reasignaciones / Desechos | CAMBIOS LINEAS TELEFONICAS / HISTORIAL_REASIGNACIONES / BITACORA DE DESECHO |

- Servidor: `LineasExportar.baseCompleta(modulo)` (`apiLineasExportarBase`). Fechas como fecha de Excel (con hora
  cuando la tienen), cantidades como número e identificadores (IMEI, SIM, número, folio, NUCO…) como texto para
  no perder dígitos. PIN, patrones y contraseñas (y su antes/después en CAMBIOS) salen como `••••` si el usuario no
  es ADMIN. Viaja comprimida (gzip) y el navegador la descomprime.
- Cliente: `exportarBase(modulo, nombreArchivo)` en `lineas.html`. El **historial de la ficha** sigue exportando lo
  filtrado (ya es completo por registro y el filtro por movimiento sirve para auditar).
- Componentes compartidos (avisar a Jorge al unir): `ExportarExcel.descargarLibro` (varias hojas) y el tipo
  `fechaHora`; `DataTable` acepta `exportar.descargar` y `exportar.titulo`. Sin cambios para quien no los usa.

## 0e. Captura más clara y velocidad (2026-09-24, commit `218573d`)

- **Detalles** con el diseño de General (`campos()`); los tres datos a escribir son entradas dentro de la lista y
  al copiar sale el mismo texto del AppSheet (`textoDetalles`).
- **Bloqueo del equipo** en inspección y responsiva: lista virtual `_BLOQUEO` (PIN · PATRÓN · CONTRASEÑA · SIN
  BLOQUEO; `conSelectorBloqueo`, `aplicarBloqueo`) que muestra el PIN, la contraseña o el patrón. Se guarda igual
  que en AppSheet: PIN EQUIPO lleva el PIN, la contraseña, "PATRON" o "N/A"; la lista no se envía (`data-virtual`).
- **Firmas** con el componente `Firma` del sistema (`crearFirma`): trazo suavizado, nombre de quien firma bajo la
  línea (`NOMBRE_DE_FIRMA`), opción "Usar foto", marco dorado para el responsable y azul para Control Interno,
  240 px de alto. Se exportan recortadas al trazo sobre el color de la celda del PDF; `LineasPdf` las acomoda en
  160 × 70. Corrige que en un paso oculto el lienzo midiera 0 px (se ajusta al mostrarse el paso).
- **Acomodo** (`htmlFormularioAppSheet(…, { acomodar: true })`): por sección, primero lo que ya se sabe (datos),
  luego lo que se captura, los campos anchos (observaciones, patrón) y las firmas lado a lado.
- **Fotos** opcionales con "Tomar foto" (solo en pantallas táctiles) o "Elegir fotos". La carpeta de Drive se crea
  al subir la primera foto o al guardar (`asegurarCarpeta`), no al abrir. En el detalle de una inspección ya
  guardada se pueden agregar fotos (`apiLineasFotosInspeccion` 'preparar' / 'actualizar'); si la inspección no
  tenía carpeta (p. ej. del AppSheet) se crea con la misma estructura y se registra en APP_EVIDENCIAS.
  La sección de fotos lleva `.ln-af-extra` para que la regla que oculta secciones sin campos visibles no la oculte.
- **Cambiar estatus** desde la ficha (`apiLineasCambiarEstatus` → `LineasRegistros.cambiarEstatus`): listas del
  AppSheet, bitácora CAMBIOS, ESTATUS GENERAL recalculado y el motivo en APP_MOVIMIENTOS (sale en el historial).
- **Velocidad**: `transicionVista` monta la vista a los 180 ms (antes esperaba 2.5 s fijos) y la animación del login
  dura 1.1 s y precarga Líneas; catálogos y colaboradores quedan en memoria; bitácoras y trámites se pintan al
  instante con la última copia (`memoria.tablas`) y se actualizan en segundo plano. **Al unir con master**: los
  tiempos de `app.html` son del shell común.

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
| Hoja de Líneas (DEV) | `1fC77Uu1ePVUySNvhgWXMHqWpLhGhBMTZZMEblU2nUhI` — "VEHICULOS", BD de pruebas del equipo y hoja de la app AppSheet de pruebas (desde el 25-sep) |
| Hoja de producción (bloqueada) | `1h5ibDsmVtrG27rwMaOvj-lm08QZUHzDv3woPmkfRQrk` |
| Carpeta de la app AppSheet de pruebas | `1FsC5mloJNhi_TR7pBX1KMEjUZfN_M9OM` — "PruebasCONTROLVEHICYTELEF-172665033": se lee y se escribe con las rutas del AppSheet |
| NUCOS de producción | `12SRBi1nZlIzfNx0d2y1fAtzOydA2QrT-` — solo lectura (Documentos de la ficha) |
| Proyecto DEV de Apps Script | `1rpvvay1hBTFfm5paVyvy6-Thmx-CQ6uUWVef20Jr8VmHQxkCWZ7UmeOa` |
| URL de pruebas | `https://script.google.com/a/macros/ciudadmaderas.com/s/AKfycbwNWp2uwP_jqCayH6hJhCJh2TiudyC8heqOhZ8NuU90/dev` |

Script Properties que usa Líneas (las deja `configurarLineasDev()`):

- `SS_ID_TELEFONIA` → hoja de Líneas.
- `LINEAS_DRIVE_APPSHEET` → carpeta de la app AppSheet (archivos, PDF y fotos).
- `LINEAS_DRIVE_NUCOS` → NUCOS de producción (solo lectura).

`LINEAS_DRIVE_CARPETA_RAIZ` (carpeta personal de pruebas) ya no se usa; `configurarLineasDev()` la borra.

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
