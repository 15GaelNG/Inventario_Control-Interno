# Control Interno — notas para trabajar en este repo

## ⚠️ Bug de Apps Script: nunca escribas `//` seguido de texto real en un archivo `.html`

Apps Script le borra a los archivos de tipo HTML (`.html`, incluidos los que
solo contienen `<script>` con JS puro, como `src/html/js/*.html`) todo lo que
encuentre después de `//`, pensando que es un comentario de JS — **incluso
si el `//` está dentro de un string**, no en un comentario real. No importa
el método usado para servir el archivo (`createHtmlOutputFromFile` o
`createTemplateFromFile().evaluate()` lo hacen igual). Nuestros propios
comentarios `// así` se vuelven líneas en blanco sin problema (inofensivo),
pero un `//` dentro de una URL en código real (`'https://...'`) corta la
línea a la mitad, dejando un string sin cerrar → toda la app carga en
blanco con "Uncaught SyntaxError: Invalid or unexpected token" (rompe TODA
la página, no solo esa función).

**Regla:** cualquier URL (`http://` o `https://`) dentro de código JS real
(no un comentario) en un archivo `.html` DEBE escribirse con la diagonal
escapada: `'https:\/\/dominio.com/...'` en vez de `'https://dominio.com/...'`
— en JS, `\/` dentro de un string es exactamente lo mismo que `/`, pero como
ya no hay un `//` literal en el código fuente, Apps Script no lo confunde
con un comentario. Ejemplos ya corregidos: los botones "Ver reporte"
(Vehículos) y "Calendario" (Arqueos) en `src/html/js/app.html` y
`app-arqueos.html`.

## ⚠️ Bug relacionado: nunca escribas `<?` ni `?>` sueltos en un `.html` que se sirve con `createTemplateFromFile().evaluate()`

Si el archivo se evalúa como template (hoy: `Index.html` y `FirmaExterna.html`, vía
`createTemplateFromFile(...).evaluate()` en `Router.gs`/`Code.gs`), Apps Script busca
scriptlets `<? ... ?>` en **todo el texto del archivo tal cual está escrito**, incluso
dentro de un comentario HTML (`<!-- ... -->`) que solo estaba explicando el tema en
prosa. Un comentario como `<!-- ... entre <? y ?> ... -->` crea un scriptlet de verdad
(`<? y ?>`) que Apps Script intenta correr como código del servidor: si `y` no existe,
truena con una página en blanco y `ReferenceError: y is not defined (línea N)` — el
error no viene del navegador, es la propia página de error de Apps Script (8-oct,
`FirmaExterna.html`). **Para hablar de scriptlets en un comentario, nunca escribas los
símbolos literales** `<?`/`?>`: descríbelos en palabras (como en este párrafo) o, si hace
falta mostrarlos, parte la secuencia para que nunca quede un `<?` ni un `?>` juntos.

Esto NO aplica a URLs dentro de atributos HTML normales (`src="https://..."`,
`href="https://..."`) fuera de un `<script>` — esas están a salvo.

**Lo mismo con `/*`:** Apps Script también BORRA lo que hay entre `/*` y el siguiente `*/`,
aunque esté en un string (p. ej. `accept="image/*"`). En el código legible casi nunca se nota,
pero en una sola línea se comió el resto del archivo y el principio del siguiente (página en
blanco, 6-oct, con la versión comprimida). El compresor ya escapa `/` y `*` en los strings, y
`npm run push` baja la página como la entrega Apps Script y revisa cada `<script>`
(tools/subir/pagina-servida.js): **la vista previa local no ve este problema, eso sí.**

## Estructura de `src/html/js/`

`app.html` creció demasiado varias veces y hay que mantenerlo dividido en
varios `<script>` incluidos por separado (`app.html`, `app-arqueos.html`,
`app-cajachica.html`, ...) — todos comparten el mismo scope global del
navegador (funciones/variables de uno son visibles en los demás), así que
dividir es seguro mientras el orden de `<?!= include(...) ?>` en
`src/html/Index.html` mantenga los archivos "base" (api, app) antes de los
que dependen de sus helpers.

Desde el 19-oct (fase 6.1, `tools/app/partir.js`) `app.html` es solo la base (shell, login, inicio, `NAV_GRUPOS`,
ayudantes, tabla interactiva, ficha genérica); Vehículos, Incidencias, Uber y Tickets viven en `app-vehiculos.html`,
`app-incidencias.html`, `app-uber.html` y `app-tickets.html`, incluidos justo después de `app` (otros archivos usan
`CAMPOS_VEHICULO` y `CAMPOS_TICKET` al cargar). Lo que usan varios módulos se queda en la base. **Contrato del orden de
carga** (`tests/orden-de-carga.js`): nada que corre al cargar (fuera de funciones, o en una IIFE) usa algo declarado en
un archivo que carga después; si falla, se mueve la declaración a un archivo anterior o se usa dentro de una función.

**Líneas es distinto** (19-oct, fase 6.2): todo vive dentro de `const Lineas = (function () { … })()`, así que sus
partes no comparten el espacio global. `lineas.html` es la base (utilidades, formularios, estado) y cada pantalla
(`lineas-telefonicas.html`, `-panorama`, `-activos`, `-accesorios`, `-resguardos`, `-bitacora`) es su propia
función: toma lo que usa con `const { … } = Lineas.comun;` y se publica con `Object.assign(Lineas, { init… })`.
Algo nuevo de la base que use una pantalla va en `Lineas.comun`. Un `let` de la base nunca se toma así (se
copiaría su valor al cargar): se lee con una función (`panelActual()`) o va dentro de un objeto (`montaje.n`).
Las pruebas leen todo Líneas con `tests/lineas-fuente.js`; un contrato revisa la forma y el orden en `Index.html`.

**Líneas Telefónicas, por partes** (19-oct, fase 6.2b): `initTelefonicas` (en `lineas-telefonicas.html`) es el
arranque y la lista; la ficha, documentos, acciones, captura, historial y páginas viven en
`lineas-telefonicas-<parte>.html`, cada una `Lineas.telefonicas.registrar('parte', (T) => { …; return { … } })`, y
`initTelefonicas` las monta con `T.montar(…)` antes de cablear los eventos. Lo del arranque (`raiz`, `pila`, `vigente`…)
sale de `T`; lo de otra parte se pide arriba como un import, `const { abrirResguardo } = T.de('acciones');` (se busca al
llamar, así no importa el orden); un `let` que usan varias partes vive en su dueña, que lo publica con get/set en `T`, y
las demás lo leen como `T.captura`. Una función nueva que otra parte necesite va en el `return` de su parte.

**Vehículos, por partes** (22-oct, fase 6.1b): igual que Telefónicas. `initVehiculos` (en `app-vehiculos.html`) es el
arranque y la lista; la ficha, las acciones sobre sus registros, las capturas desde la ficha y la responsiva/adherente
viven en `app-vehiculos-ficha|registros|capturas|documentos.html`, cada una `Vehiculos.registrar('parte', (T) => {…})`.
El mecanismo (`registrar`, `T.de`, `T.montar` y el aviso "la parte X no publica Y") es **un solo componente,
`componentes/partes.html`** (`Partes.crear('Vehículos')`), que también usa Telefónicas. Para abrir otra pantalla grande:
una config como `tools/app/partir-vehiculos.js` sobre el motor `tools/partir/en-partes.js` (corta por nombres, así que
cada rama lo corre sobre su archivo y lo suyo viaja con su región).

**Cuándo partir** (22-oct, fase 6.1c): Partes es para una **función de arranque grande**, no para todo módulo; uno
chico se queda como su `initX` (su cierre ya encapsula su estado). Ninguna función de primer nivel de `src/html/js/`
(fuera de `componentes/`) pasa de **700 líneas**: si crece, se abre en partes (contrato en `source-contracts`, con su
lista de pendientes: hoy `prepararCaptura` de Inspecciones y, después, Caja Chica, esperando la rama de Jorge). Ya
en partes: Vehículos, Líneas Telefónicas, Usuarios y permisos (`app-permisos-ficha|ventana|matriz`; las reglas se
quedan en `app-permisos.html` porque `permisos-pantalla.test.cjs` las lee de ahí) y Help Desk
(`app-helpdesk-ticket|registro`). El contrato de cada una es `pantallaEnPartes(…)` en `source-contracts`. Si el
motor dice "decidir a mano", se mueve la declaración (un `let`, un `const` de la pantalla) junto a quien más la usa
antes de partir, sin cambiar código. Las bibliotecas compartidas (`Lineas`, `LineasVinculos`) son espacios de
nombres y no se parten así.

**Una vista nueva** es una entrada en `NAV_GRUPOS` de `app.html` (o en `VISTAS_FUERA_DEL_MENU`
si no va en el menú), con `plantilla`, `init` y `requiere`. Además lleva su módulo en
`config/Modulos.gs` y sus `include` en `Index.html`. `navegarA`, el permiso y los íconos salen
de esa entrada: no se agrega otro `if (vista === …)`. `source-contracts` revisa que la
plantilla, la función y el módulo existan. **Cada entrada del menú pide su propio módulo** (14-oct: los
panoramas, Sistemas y Encuestas dejaron de colgar de otro permiso o de no pedir ninguno); dos entradas no
comparten `requiere` y `libre` solo queda en Help Desk (contrato). Si su pantalla lee la lista de otro
módulo, esa definición lo declara en `leenTambien` (HojaServicio); un módulo de solo enlaces lleva
`soloEnlaces: true` en `Modulos.gs` (no cuenta como familia).

**Una llamada nueva del servidor** (`api…`, lo que la pantalla pide con `google.script.run`) va en
`src/api/<Módulo>.gs`, el del módulo dueño (el servicio al que llama / el permiso que pide), como wrapper delgado
hacia su Service, y se llama `api<Módulo><Qué>`. Módulo nuevo = archivo nuevo. `src/ClientApi.gs` es solo la base (lo
de todos: medir, listas con huella, Inicio, sesión, campanita, qué impide borrar, fichas en una llamada). Desde la fase
6.3 (22-oct, `tools/api/partir.js`); `source-contracts` lo revisa y las pruebas leen todo con `tests/api-fuente.js`.

## Componentes (`src/html/js/componentes/`)

Lo que se repite entre módulos va en un componente, no en otra copia. Antes de
escribirlo a mano en un módulo, revisa si ya existe: `Formulario` (captura con
validación, pasos y panel), `DataTable`, `Combobox`, `Confirmar`, `Notificar`,
`Firma`, `Lienzo`, `ExportarExcel`, `CampoAuto`, `FolioNucco`, `CamposHoja`, `Avatar`, `Apariencia`, `CampoCodigo`
(un código de verificación en recuadros: pegarlo como venga lo reparte) y `MedidorContrasena` (la barra y la lista de
requisitos de una contraseña nueva, los mismos que `Credenciales.TIPOS`). Cada
uno documenta su uso al inicio del archivo y tiene su prueba en `tests/`.

De la homologación (rama `common`, docs/homologacion-codigo.md), también: `Formato` (esc, fechas, moneda, miles: nunca
otra copia de `escaparHtml`/`formatearFecha`), `Tabs` (`data-tabs` + `.tab-btn[data-tab]`), `Ficha` (migas y
encabezado de una ficha), `FiltroTipo` (el filtro rápido por tipo/estatus) y `Pasos` (la navegación de un formulario
por pasos: `Pasos.htmlChips` + `Pasos.navegar`; `libre`, `guardarAlFinal`). El error de un campo, fuera de un
`Formulario`: `Formulario.marcarError(caja, mensaje)`. Cada uno tiene su contrato: una copia nueva hace fallar las pruebas.

También `Partes` (una pantalla grande abierta en archivos, 6.1b) e `Imagen` (22-oct): **reducir una foto antes de
subirla** es `Imagen.reducir(archivo, { lado | ancho, calidad })`, nunca otra copia con `new Image()` + lienzo — la abre
con poca memoria y de una en una (en el celular, abrir fotos de cámara completas dejaba la pantalla en blanco).

- **Una persona (foto o iniciales) → `Avatar.html(correo, nombre, { tam })`.** La foto es la de
  su perfil de Google, del directorio del dominio (`FotosDirectorio.gs`, People API, guardada en
  caché y rehecha por el Calentador). No pintes iniciales a mano.

- **Formularios declarados por columnas de una hoja → `CamposHoja`.** Vehículos
  (`CAMPOS_VEHICULO`), Caja Chica (`CAMPOS_CAJACHICA`), Arqueos (`CAMPOS_ARQUEO`),
  Uber, Tickets, Incidencias, Reasignaciones y Cambios de Monto son una lista de
  `{ grupo, clave, etiqueta, tipo, … }`, y `CamposHoja.html / recolectar / poblar /
  llenarOpciones` hace el resto. La vista solo deja el contenedor
  (`<div id="campos-form-…">`); no escribas los campos a mano en la vista. Un tipo de campo o una
  opción nueva (p. ej. `soloEdicion`, `mostrarSiCampo`) se agrega una vez en
  `componentes/campos-hoja.html` y sirve para todos. Lo propio de cada módulo
  (bloquear Capturista, formatear moneda) va en los ganchos `antes` / `despues` /
  `mostrar` de `poblar`, no en otra copia del motor.

- **Campos que llena el sistema → etiqueta "auto", siempre con `CampoAuto`.** Si
  el valor lo decide el sistema y no se edita, pon `data-auto` en el control (sirve
  en cualquier HTML, aunque se agregue después con innerHTML). Si se llena solo
  pero se puede corregir, usa `CampoAuto.llenar(el, valor)` (o
  `form.sugerir(id, valor)` en `Formulario`): la etiqueta se quita sola cuando la
  persona escribe otro valor. No escribas `<span class="auto-tag">` a mano, y no
  marques "auto" un campo que se bloquea por otra razón (permisos, lo que se
  eligió, guardando).
- **Elegir un vehículo por Folio o Nucco → `FolioNucco.ligar`.**
- **Cómo se ve el sistema (modo claro/oscuro/auto, color, ancho, letra) → `Apariencia`**, el engrane de la
  barra (`componentes/apariencia.html`). Una opción de la temporada u otra preferencia de la persona va como
  sección de ese panel (como `Temporada.opciones(cont)`), no como otro botón en la barra.
- `tests/source-contracts.test.cjs` falla si alguien vuelve a escribir la
  etiqueta "auto" a mano o hace otra copia del par Folio/Nucco.
- Un componente nuevo se incluye en `src/html/Index.html` antes de los módulos y
  componentes que lo usan (`campo-auto` va antes que `formulario`).

## Servidor: un módulo de una hoja → `HojaServicio`

`src/utils/HojaServicio.gs` hace lo que repetían todos los servicios: listar con caché,
`listarPor` (la ficha de un vehículo, de una caja), `completo`, `buscarPorId`, `crear`,
`actualizar` y `eliminar`, con el permiso del módulo revisado siempre. Un servicio nuevo
declara su hoja en un objeto (`modulo`, `libro`, `hoja`, `columnas`, `fila`, `orden`, `fechas`,
`obligatorios`, `noEditables`, `archivos`…) y lo propio va en sus ganchos (`alCrear`,
`alActualizar`, `despues`, `despuesDeEliminar`). Ejemplo corto: `TicketsService.gs`; con
ganchos: `ArqueosService.gs` y `VehiculosService.gs`. La guía completa está al inicio del archivo.

- **Nada corre al cargar.** Apps Script no garantiza el orden de los archivos: la definición es
  datos (el orden es `{ campo: 'FECHA', desc: true }`, no una llamada) y los métodos públicos
  son `(token) => HojaServicio.listar(DEF, token)`. `tests/hoja-servicio.test.js` carga cada
  servicio solo y falla si algo corre.
- **Fechas:** lo que manda un `<input type="date">` se guarda con `fechas: [...]` o
  `HojaServicio.fechaDeEntrada` (medianoche local); `new Date('yyyy-MM-dd')` cae el día anterior.
- Escrito a mano solo lo que no es de una hoja: transacciones entre dos hojas bajo un mismo
  candado (Cambios de Monto, Reasignaciones) o capturas con archivo y reverso (Verificaciones).
- `source-contracts` falla si un servicio vuelve a escribir su `fechaISO_`, su renombrar archivo,
  su subida a Drive, su `CacheHojas.recordar` o su `SheetUtils.remove`.
- Para probar un servicio con hojas en memoria: `tests/apps-script-simulado.js`.
- **Carpetas de Drive: por nombre, nunca con un ID fijo.** `DriveUtils.carpetaEnRaiz('ARQUEOS_Images')`
  la busca en la raíz de ESE proyecto (en un DEV la crea; en prod truena si falta). Un ID fijo hacía
  que los DEV escribieran en producción. Una carpeta nueva va también en `REVISION_EN_RAIZ`
  (Diagnostico.gs); un contrato revisa las dos cosas. Las plantillas sí pueden ir fijas: solo se copian.
- Cada `createFile` va dentro de `DriveUtils.marcarAutor(…)` (quién lo subió; contrato).
- **Una subcarpeta (o crearla) → `DriveUtils.subcarpeta(padre, nombre)`**: la reconoce aunque el nombre traiga espacios o
  acentos de más ("2.- SERVICIOS"), así nunca se crea otra al lado. Nadie escribe su propio `getFoldersByName … createFolder`
  (contrato).
- **NUCOS de Líneas**: solo producción tiene `LINEAS_DRIVE_NUCOS` (Entornos.gs). Un DEV sin la clave usa una "NUCOS
  TELEFONICOS" de pruebas en su raíz; `revisarEntorno` marca error si un DEV apunta a una carpeta de producción. Nunca le
  pongas a un DEV el ID de NUCOS de producción: ahí se escriben los PDF y las fotos de inspecciones y responsivas.
- **Toda función de nivel superior** (sin `_` al final, que no sea `api…`) empieza con `soloEditor_()`: cualquiera la puede
  llamar desde la consola del navegador. `tests/candado-editor.test.js` revisa todo `src/`. Un activador de edición no
  puede llevarlo (ahí el usuario activo es quien editó): lleva su guarda, como `alEditarLibro`.
  **Un activador de tiempo recibe su evento y se lo pasa:** `function calentarCaches(e) { soloEditor_(e); … }`. Desde el
  23-oct la web app está abierta a cualquier cuenta de Google (`"access": "ANYONE"`, para POST VENTA de gph) y alguien de
  fuera del dominio llega SIN correo, igual que un activador: sin correo, el candado solo deja pasar un `triggerUid` que
  sea de un activador del proyecto. Lo que esa ejecución llame después ya pasa. Lo que no pide token (el login, la firma
  a distancia) se cuida aparte: el login limita los intentos por correo (`Auth.login`, 5 fallos → 15 min).
- **Un documento de un vehículo va a su expediente: `ExpedienteNuco`** (`src/utils/ExpedienteNuco.gs`). La carpeta
  NUCOS VEHICULOS tiene una carpeta por NUCO con `1.-DOCUMENTACIÓN/1.-FACTURA … 6.-TENENCIA, 7.-HOLOGRAMAS` (docs/nucos-expediente.md).
  `ExpedienteNuco.archivar(archivo, nucco, 'SEGURO')` lo mueve ahí, le pone su nombre (`SEGURO-0088.pdf`) y pasa el
  vigente a `SEGUROS ANTERIORES`; `ExpedienteNuco.carpeta(nucco, 'RESPONSIVA')` para generar un PDF directo ahí. Ya lo
  usan Vehículos (al guardar la ficha), Responsiva, Adherente y Hologramas (la solicitud, a 7.-HOLOGRAMAS; 15-oct). Lo que llega de los módulos (12-oct) va con
  `ExpedienteNuco.guardar(blob, carpeta, PREFIJO, nucco, fecha)` y la hoja guarda la **liga**: inspección →
  `carpetaInspeccion` (4.-INSPECCIONES/<año>/<N> TRIMESTRE, firmas y diagramas en `FIRMAS Y DIAGRAMAS`), verificación →
  `carpetaVerificacion` (<año>/<N> SEMESTRE), responsiva del sensor → `5.-RESPONSIVA/SENSORES`, respaldo de firmas →
  `5.-RESPONSIVA/FIRMAS`. Sin NUCCO, la carpeta de antes. Los lectores de `DriveUtils` abren liga o ruta vieja. Producción apunta a la real con
  `DRIVE_FOLDER_ID_NUCOS_VEHICULOS` (Entornos.gs); un DEV sin esa clave usa una "NUCOS VEHICULOS" de pruebas en su raíz.
  No guardes un documento del vehículo en una carpeta suelta de la raíz (contrato).

- **Copiar un dato de una hoja a otra (y mantenerlo al día) → Datos conectados**, no código a mano en el servicio: el
  `MAPA` de `Relaciones.gs` o, desde la pantalla, `DatosConectados.gs` (docs/relaciones.md, "Conectar datos desde la
  pantalla"). `HojaServicio.actualizar` ya propaga (`Relaciones.alGuardar`) y el activador de `AvisoDeCambios.gs` copia lo
  editado a mano. Solo lo que va AL REVÉS (un registro nuevo que actualiza a su dueño) se escribe en el servicio, y se
  anota en `DatosConectados.AL_REVES` para que la pantalla lo muestre.

## Acceso: contraseñas, código por correo y bitácora (23-oct, rama `seguridad`)

La web app está abierta a cualquier cuenta de Google (`"access": "ANYONE"`, por POST VENTA de gph): lo que protege es
el login de la app, en capas. El orden de un inicio de sesión (`Auth.continuar_`): credenciales → código por correo si
hace falta → contraseña nueva si es temporal → sesión. Cada paso que falta regresa `{ pendiente, reto }` (un UUID de 10
min, de un solo correo y paso) y la pantalla lo pinta en `#login-paso` (`Seguridad.entrar`, `js/app-seguridad.html`).

- **Contraseñas → `Credenciales.gs`.** Solo la huella en `PASSWORD_HASH`: `v2$<iteraciones>$<sal>$<hash>` (PBKDF2-HMAC-
  SHA256). La de texto plano (`CONTRASEÑA`, de AppSheet) y el v1 se aceptan y al entrar pasan a v2 y la celda se borra.
  Nadie escribe contraseñas en la hoja: "Restablecer contraseña" (Usuarios y permisos) da una temporal que se ve una vez
  y obliga a cambiarla; "Contraseña y seguridad" (Mi perfil) cambia la propia. Reglas de una nueva en
  `Credenciales.revisarNueva`. USUARIOS no tiene ID: se escribe por CORREO (`Credenciales.escribirPorCorreo_`).
  Desde el editor: `contrasenasAHashRevisar()`, `contrasenasAHash()`, `medirHashContrasena()` (subir `ITERACIONES`
  no rompe las que ya están: se rehacen al entrar). **Temporales para todos** (lo pidió el área, 23-oct):
  `contrasenasTemporalesRevisar()` cuenta y `contrasenasTemporalesParaTodos()` le pone una de 10 a cada usuario activo
  (debe cambiarla al entrar; sesiones y dispositivos cerrados) y deja la lista en una hoja nueva y privada en el Drive de
  quien la corre, para repartirla en persona y borrarla. En PROD no corre sin `contrasenasTemporalesParaTodos('SI, EN PROD')`.
  **Pedir cambio a todos, sin lista** (26-oct, la otra opción): `contrasenasPedirCambioRevisar()` cuenta y
  `contrasenasPedirCambioATodos('SI, EN PROD')` solo pone `DEBE CAMBIAR CONTRASEÑA = 'VIEJA'` a los activos (no toca la
  contraseña, no cierra sesiones, no pisa una temporal). Cada quien entra con la de siempre, **confirma con el código por
  correo aunque la verificación esté apagada** (esa contraseña pudo verse en la hoja de AppSheet; `Verificacion.decidir(…,
  { confirmar })`, y apagada no recuerda el dispositivo) y elige la nueva. Con Google, cualquier marca (`TRUE` o `VIEJA`)
  pide elegir la nueva sin código. Quien no recibe correo en su CORREO: "Restablecer contraseña" (temporal, sin código).
- **El código por correo → `Verificacion.gs`.** Solo si el dispositivo es nuevo o algo se ve raro: la señal es una llave
  aleatoria que guarda el navegador (`localStorage`, `Seguridad.dispositivo`) y de la que el servidor guarda solo su huella
  en la hoja DISPOSITIVOS. Se vuelve a pedir a los 60 días, si cambia el navegador o el sistema, con 3+ contraseñas malas
  recientes o en alerta. La IP NO sirve (Apps Script no la da y la del navegador se inventa). Sin cuota de correo, no se
  entra. Se apaga por proyecto con `VERIFICACION_DOS_PASOS: 'APAGADA'` (Entornos.gs; en prod hasta avisar al equipo).
- **Bitácora → `Accesos.gs`** (hoja ACCESOS): cada intento con su resultado, nunca contraseñas ni códigos, y nunca
  impide entrar. 15 correos distintos fallando en 10 min = alerta: aviso a los ADMIN y 1 h de código para todos.
- Lo que no pide token (login, `apiSeguridadCambiarInicial/VerificarCodigo/ReenviarCodigo`, la firma a distancia) se
  cuida con su reto o su token propio y sus límites; todo lo demás pide sesión. Ninguna respuesta al cliente lleva
  `CONTRASEÑA`, `SALT`, `PASSWORD_HASH`, el código ni la huella de una llave. **Las `api…` sin token son una lista
  cerrada** (`source-contracts`: "ninguna api… nueva corre sin sesión"): agregar una exige anotar qué la protege.
- **Regla de una contraseña nueva** (lo pidió el área): 8+ caracteres con mayúscula, minúscula, número y símbolo, como
  `Mar1posa!`; sin el correo ni el nombre, distinta de la actual y fuera de la lista de comunes (`Credenciales.TIPOS` y
  `COMUNES`; la pantalla repite la lista para palomearla). La regla es para ELEGIRLA: guardarla con huella no cambia nada
  para la persona y no se quita.
- **La sesión** (`Auth.gs`): vence a los 60 min sin uso (`Config.SESION_INACTIVIDAD_MIN`; cada llamada la renueva, a lo
  más cada 5 min) y nunca pasa de 8 h. **Una `api…` que llama un temporizador de la pantalla empieza con
  `Auth.automatica()`** (el vigía, la campanita, sensores en vivo): valida sin renovar, o la pestaña abierta nunca
  cerraría. La pantalla avisa a los 59 min ("¿Sigues ahí?") y, con actividad sin llamadas (un formulario largo), avisa al
  servidor cada 10 min (`apiSeguridadSigo`). Cada persona tiene una versión de sesión (ScriptProperties):
  `Auth.cerrarSesiones(correo, { conservar: token })` saca a todas sus sesiones abiertas (cambiar o restablecer la
  contraseña, quitar dispositivos, el admin) y a quien lo hizo le regresa un token nuevo (`{ sesion }`, la pantalla lo
  guarda con `guardarSesion`). Prueba: `sesion.test.cjs`.
- **"¿Olvidaste tu contraseña?" → `Recuperacion.gs`** (guía de OWASP): la respuesta es la misma exista o no el correo;
  el enlace es la app de siempre con `?recuperar=<64 hex>` (`Config.urlApp`: `URL_APP` de Entornos.gs, en prod el link
  del equipo en su forma general `/macros/s/…`, que no pide cuenta del dominio; la app ya está abierta, no hace falta
  otro despliegue como el de la firma). Del enlace se guarda solo su huella en CacheService: 30 min, un uso, pedir otro
  anula el anterior, 3 por correo por hora. Al cambiarla se cierran sus sesiones, se avisa y se vuelve al login (no
  entra solo). La pantalla lee el parámetro con `google.script.url.getLocation` (`Seguridad.conectarLogin`). El
  "Restablecer contraseña" del admin sigue para quien no puede entrar a su correo.
- **Bloqueo por seguridad** (columna `BLOQUEO SEGURIDAD` de USUARIOS: `fecha | quién | motivo`, vacía = sin bloqueo): se
  pone con la casilla "Sospecho que tomaron su correo…" del Restablecer del admin. Mientras dure, nada pasa por ese
  correo: la recuperación responde igual pero no manda enlace y alerta a los admins (`Accesos.alertarAdmins`), Google
  no entra (`identidadGoogle`/`loginConGoogle`) y no salen avisos informativos (`Credenciales.avisar_`,
  `Verificacion`); el código del login sí se manda (sin la contraseña no sirve). Se entra solo con la temporal que el
  admin da por teléfono. "Quitar bloqueo" (aviso en la ficha de la persona, `Seguridad.avisoBloqueo`) la limpia y ahí sí
  avisa. Pregunta siempre con `Credenciales.bloqueado(fila)` / `bloqueadoCorreo(correo)`; un aviso nuevo a la persona
  también lo respeta.
- **Pendiente:** sacar las huellas, DISPOSITIVOS y ACCESOS del libro compartido de USUARIOS a uno restringido (decidido
  para después, 23-oct).
- Pruebas: `credenciales.test.cjs`, `verificacion.test.cjs`, `accesos.test.cjs`, `login-intentos.test.cjs`; vista previa:
  `login-codigo`, `login-contrasena-nueva`, `perfil-seguridad`.
- **Todo correo que mande el sistema → `Correos.mensaje(para, asunto, { etiqueta, titulo, parrafos, codigo, detalle,
  boton, aviso })`** (`src/utils/Correos.gs`): la misma cara que la app (barra marino con el logo, tarjeta, dorado),
  tablas con estilos en línea para Gmail y Outlook, modo oscuro y su versión en texto. No se arma otro HTML de correo a
  mano. Los `parrafos` y el `aviso` son HTML: lo que venga de una persona va con `Correos.esc`. Vista previa:
  `node tools/correos/vista.js` (capturas en escritorio, celular y oscuro).

## Permisos entre módulos (lo de un módulo dentro de otro)

El modelo, en capas (como Salesforce u Odoo: objeto → campo → registro):

1. **Sesión** (`Auth.validarSesion`): sin ella, nada.
2. **Módulo y sección** (`Permisos.puedeLeer` / `puedeEditar`, LECTURA / EDICION por área o correo): decide
   si se ve la pantalla, sus pestañas y si se lee la lista del módulo. Todo se revisa **en el servidor**; lo
   que esconde la pantalla es solo comodidad (igual que el Editable_If de AppSheet no protegía nada).
   **El catálogo es un árbol** (`config/Modulos.gs`, 14-oct): módulo → sección (`modulo.seccion`: las
   pestañas de su ficha y `exportar`). Una sección **hereda** el nivel de su módulo salvo regla propia
   (un "Sin acceso" de área en una sección corta la herencia) y nunca pasa de él; `hereda: false` la hace
   darse aparte. El servidor resuelve el árbol (`Permisos.resolver_`) y la pantalla recibe el mapa ya
   resuelto: se pregunta con `puede('vehiculos.documentos')` / `puedeEditarModulo('…')`, nunca se calcula
   herencia en la pantalla (salvo `app-permisos.html`, que la repite para pintar al instante:
   `tests/permisos-pantalla.test.cjs` exige que dé lo mismo que el servidor).
   - **Una pestaña nueva de una ficha** es una sección en `Modulos.gs` (`secciones: [{ id, etiqueta }]`); la
     pantalla la pinta con `puede('modulo.seccion') && {…}` y el servidor la pide con
     `Permisos.puedeLeer(token, 'modulo.seccion')` o `parte('modulo.seccion', …)`. Como hereda, nadie pierde
     nada al crearla. Una pestaña con datos de OTRO módulo no es sección: pide ese módulo (el dato manda).
   - **Exportar**: cada módulo con lista tiene su `exportar` (se agrega solo). `DataTable` lo pregunta solo
     (`puedeExportarAqui`, por el módulo de la vista abierta). Lo que se ve se puede copiar: es control de
     pantalla y de los servicios que exportan (Líneas), no una frontera de seguridad.
   - **Un id viejo** sigue sirviendo como alias (`antes:` en la sección: `responsiva-vehicular` →
     `vehiculos.responsiva`); `permisosMigrarCatalogo()` (editor) reescribe PERMISOS con los ids del catálogo.
   - `source-contracts` falla si se pide un permiso (`permisoDe`, `puede`, `deModulo`, `parte`,
     `Permisos.puedeLeer`…) con un id que no está en el catálogo. Detalle: `docs/permisos-arbol.md`.
3. **Referencia por familia** (`Permisos.puedeLeerFamilia`, `referencia: true` en `HojaServicio`):
   los catálogos que una familia necesita para trabajar los lee cualquiera de sus módulos. La
   familia es el grupo del menú (`Modulos.familia`). Hoy: el básico de vehículos y la búsqueda por
   folio (Sensores, Hologramas, Verificaciones… eligen la unidad) y la lista de cajas (Arqueos).
4. **Campo** (`editaModulo` / `deOtroModulo`, abajo) y los campos secretos de Líneas (PIN,
   contraseñas: solo ADMIN y el área de Líneas, se ocultan en el servidor).
   - **Perfiles** (fase 2): un paquete de reglas con nombre que se asigna a áreas, en la misma hoja PERMISOS
     (`QUIEN = perfil:Nombre` = sus reglas; `AREA` + `MODULO = perfil:Nombre` + `ASIGNADO` = asignación). Por nodo:
     correo > área > el más alto de los perfiles del área (cada uno con su herencia) > herencia. Pestaña Perfiles
     y matriz "Por perfil" en Usuarios y permisos. `permisosCrearPerfiles()` pasa las reglas de cada área a su perfil.
5. **Registro** (qué renglones ve cada quien): queda **limitado** a lo de su área quien tiene un perfil con
   alcance (`perfil:Nombre` + `@alcance` + `AREA`; basta con uno) y el **rol CLIENT** (que además solo consulta,
   como VIEWER). Ve los renglones de `DPTOS PERMITIDOS` (separado por comas) o, si está vacía, su `AREA`
   (`Permisos.alcanceDe`, que llega como `sesion.alcance`; null = sin límite). Quien está limitado solo puede
   tener los nodos que **respetan el alcance** (`alcance: true` en `Modulos.gs`, o de solo enlaces): los demás
   se le resuelven Sin acceso, así un módulo nuevo nace cerrado para él. Hoy lo respetan Vehículos (su lista,
   Documentos, Exportar) y Líneas Telefónicas (lista, Detalles, Facturación, Exportar). Lo que es operación interna o
   reporte NO lo lleva aunque filtre (14-oct): Carpetas en Drive (`vehiculos.carpetas`, `lineas-telefonicas.carpetas`),
   "Ver reporte" (`vehiculos.reporte`) y los panoramas. Se
   filtra en el servidor **lo que se regresa, nunca la caché** (que es de todos): en `HojaServicio` con
   `alcance: 'COLUMNA'` en la definición (Vehículos: `DEPARTAMENTO`), y en Líneas con los ayudantes de
   `TelefoniaService` (`filtrarIndice_`, `exigirAlcance_` para la ficha, `sinAlcance_` para lo que mezcla
   departamentos o es el pasado del registro: historial, documentos). `tests/alcance-cliente.test.cjs` falla si una lectura nueva de Líneas no pasa por
   ellos. Para que un módulo lo puedan usar los limitados: su servidor filtra por departamento y entonces se
   marca `alcance: true` en el catálogo (nunca antes). Hoy: POST VENTA (CLIENT; su perfil con alcance tras
   `permisosAlcanceDesdeClientes()`), con Ver en `vehiculos` y `lineas-telefonicas`.

Cuando una pantalla muestra o edita algo de **otro** módulo (la ficha de Vehículos trae
Sensores, Verificaciones, Cambios…):

- **Una pestaña o sección de otro módulo** se pide con `deModulo('modulo', () => callServer(…), vacío)`
  (definido junto a `permisoDe` en `app.html`; lo usan `abrirFichaVehiculo` y
  `abrirFichaCajaChica`). Sin permiso no se pide y no aparece: ni truena la ficha ni sale vacía
  como si no hubiera datos. `source-contracts` revisa que cada ficha lo use (lista `FICHAS`: una
  ficha nueva se agrega ahí).
- **Un catálogo que otro módulo de la familia necesita** (para elegir algo en su formulario) se
  marca `referencia: true` en su definición, no se le da a la gente el permiso del módulo entero.
- **Lo que implica cada permiso se declara en `Modulos.gs`**: `referencia` (qué consulta su familia)
  y `editaEn` (qué parte de otro módulo se edita con este). La pantalla de Usuarios y permisos lo
  explica sola ("Podrá consultar…", "En Vehículos no podrá editar…"), sin frases por módulo.
  `source-contracts` falla si `Modulos.gs` y el servidor (`referencia: true` / `puedeLeerFamilia`,
  `deOtroModulo`) no dicen lo mismo: un caso nuevo se agrega en los dos.
- **La ventana "Editar permisos" y la "Matriz por área"** (botones por nivel, "Todo el grupo", ↺; celdas que
  se cambian con clic): las dos mandan los mismos cambios a `apiPermisosGuardar`. Después de tocarlas,
  `node tools/vista-previa/probar-permisos.js` las prueba con clics de verdad (necesita Chrome).
- **Historial:** `Permisos.guardar` anota cada cambio real en la hoja `PERMISOS_HISTORIAL` (la crea sola):
  fecha, quién, a quién, módulo, antes y después ('' = sin regla). Un cambio de permisos que no pase por
  `guardar` (editar la hoja PERMISOS a mano) no queda en el historial.
- **Un campo que le pertenece a otro módulo** solo lo edita quien tiene EDICIÓN en ese módulo.
  Se declara **en los dos lados**:
  - en la pantalla, `editaModulo` en el campo de `CamposHoja` (sale bloqueado y no se manda);
  - en el servidor, `deOtroModulo: { modulo: ['COLUMNA', …] }` en la definición de `HojaServicio`
    (se ignora al crear y al actualizar, por si llega desde la consola).
  Ejemplo: la sección "Accesorios y sensor" de Vehículos es de `instalacion-sensores`
  (`DE_SENSORES` en `CAMPOS_VEHICULO` y `deOtroModulo` en `VehiculosService.gs`).
- **Pendiente, al agregar el segundo caso:** hoy la lista de campos vive en esos dos lugares y
  el contrato que revisa que coincidan (`source-contracts`: "la sección de sensor de Vehículos")
  es solo para ese caso. Con otro caso, generalizar ese contrato a todos los `editaModulo` /
  `deOtroModulo`, o que la lista salga de un solo lugar; si no, un lado se puede quedar atrás
  sin que nada falle.

## Responsivo (celular y tableta)

- **Dos cortes, nada más:** celular `@media (max-width: 640px)` y tableta
  `@media (max-width: 1024px)`; "con el dedo" es `(pointer: coarse)`. En JS se pregunta con
  `Pantalla.esCelular() / esAngosta() / esTactil() / alCambiar(fn)`
  (`componentes/pantalla.html`), nunca con `matchMedia` directo. `source-contracts` falla con
  otro ancho o con `matchMedia` fuera de Pantalla (Líneas todavía está en su lista de pendientes).
- **Lo responsivo vive en el componente**, no en el módulo: una ventana chica (`.modal-card`)
  sube como hoja en celular y una ancha (`.modal-card-wide`) ocupa la pantalla; los KPIs
  (`.stat-row`, `.kpi-chips`) se deslizan; Formulario pega sus botones abajo; DataTable trae
  Tabla / Tarjetas (título = `etiquetaFila`; `cfg.tarjeta` para cambiarlo). Un módulo nuevo que
  use estas piezas ya es responsivo sin CSS propio.
- **Rejilla de campos:** `class="form-rejilla" data-columnas="3"` (3 en escritorio, 2 en
  tableta, 1 en celular). Nunca `grid-template-columns` en línea en una vista.
- **Deslizar de lado** solo lo que está hecho para eso (tabla, KPIs, pestañas); una caja nueva
  que deba hacerlo lleva `data-scroll-x`.
- **Revisar:** `node tools/vista-previa/capturar.js todas --matriz --revisar` toma cada escena
  en 390 / 768 / 1024 táctiles y falla si algo se sale de lo ancho. Las capturas quedan en
  `tools/vista-previa/salida/`.

## Producción: dos links, los dos van a la versión actual

Producción (`.clasp.prod.json`) sirve versiones fijas: un `npx clasp push -P .clasp.prod.json`
no llega a nadie hasta redesplegar. Hay **dos** despliegues y **los dos** se mueven a la misma
versión en cada subida a prod:

1. `npx clasp -P .clasp.prod.json update-deployment AKfycbymScqpx_d9yLaYhpqTcFxuo9HfSK8Zb1qcBgzzkTKU5wCS5RRXBN0iClZeA3Fp5_I3 -d "…"`
   (crea la versión nueva N).
2. `npx clasp -P .clasp.prod.json update-deployment AKfycbx_53Gz2VfBXhFvLmjnoM2qVzJYmk9kuQD74mUCpOQzeYPaQ1COR8LB_l69sSQb5RJB -V N -d "…"`
   — es el link que usa el equipo:
   `https://script.google.com/a/macros/ciudadmaderas.com/s/AKfycbx_53Gz2VfBXhFvLmjnoM2qVzJYmk9kuQD74mUCpOQzeYPaQ1COR8LB_l69sSQb5RJB/exec`

Revisa con `npx clasp -P .clasp.prod.json list-deployments` que ambos digan `@N`.

**Un permiso nuevo en `oauthScopes` (appsscript.json) tumba la app hasta que se autorice.** La app
corre como quien la desplegó: si el manifiesto pide un permiso que esa cuenta no ha aceptado, NADIE
puede entrar. Antes de mover los despliegues, quien desplegó corre en el editor de ESE proyecto una
función que lo use y acepta (para `directory.readonly`, de las fotos: `revisarFotosDirectorio()`).

`node tools/subir/subir.js prod --desplegar "…"` hace todo eso solo: comprime, sube, verifica y
mueve los dos despliegues. **Solo corre en la GitHub Action** (botón "Run workflow" sobre `master`,
docs/subir-automatico.md): la app corre con la cuenta de quien movió los despliegues
(`executeAs: USER_DEPLOYING`), y desde la Action es siempre la del secreto `CLASPRC_JSON`. Desde una
máquina truena salvo con `--desde-aqui` (8-oct: Emmanuel desplegó la v66 desde la suya y las
inspecciones dejaron de generar PDF). No le pongas `--desde-aqui` sin que la persona lo pida.

**Antes de desplegar se revisan los IDs** (`revisionEntorno_` en `Diagnostico.gs`): que cada libro y
carpeta de Entornos.gs abra, se llame como dicen las rutas que se guardan, la raíz la alcance, nada de prod
esté en una carpeta de pruebas y existan las hojas del catálogo. También que **la cuenta que despliega pueda
escribir**: editora de cada libro y carpeta (salvo `soloLee`) y que pueda copiar cada plantilla de PDF
(`revisionPlantillas_`; una plantilla nueva va ahí, un contrato lo revisa). `subir.js` la pide en /dev y en prod no
despliega con errores. A mano: `revisarEntorno()` en el editor de cualquier proyecto, o
`node tools/subir/revisar-entorno.js prod`. Una carpeta nueva en `Config.gs` va también en
`REVISION_CARPETAS` (un contrato lo revisa).

**"Authorization needed" al subir:** esa revisión abre el link `/dev`, que corre con la cuenta de
quien sube (la de `clasp login`), no con la del dueño. Si esa cuenta nunca aceptó los permisos de
ESE proyecto (o el manifiesto pidió uno nuevo), Google contesta esa página, `subir.js` no mueve los
despliegues y por script no se puede aceptar: esa persona corre una vez `revisarEntorno()` en el
editor de ese proyecto, acepta todo y repite el comando. Cada quien que suba a prod lo hace una vez.

**Un módulo que todavía no sale a producción** se apaga ahí con `MODULOS_APAGADOS` en el bloque de
prod de `Entornos.gs` (hoy: `'helpdesk'`): el menú no lo pinta, el servidor rechaza sus llamadas
(`Config.exigirEncendido` en cada `api…` del módulo) y `revisarEntorno` no pide sus hojas
(`modulo:` en `Entidades.gs`). En los DEV sigue encendido. Encenderlo es quitarlo de esa línea.

## Se sube comprimido: `npm run push`, no `clasp push`

`npm run push` (y `push:lab`, `push:prod`) comprime el JS y el CSS de los `.html` antes de
subir (tools/subir/construir.js), conserva lo que solo existe en Apps Script y verifica que
quedó igual. `src/` sigue legible. Un `//` que no se pueda escapar deja ese bloque sin
comprimir; `tests/construir.test.js` falla si eso pasa. Para revisar lo comprimido en la vista
previa: `npm run construir` y luego `VISTA_PREVIA_SRC=.construido/revisar node tools/vista-previa/capturar.js …`.

## Rapidez: cada llamada al servidor cuesta ~1–2.5 s aunque no haga nada

Es el piso de Apps Script (`await medirPiso()` en la consola lo mide; `verTiempos()` resume
cada llamada). Por eso:
- **Lo que sale de varias listas** (el Inicio, la campanita) se guarda ya calculado con
  `CacheHojas.calculo`, por firma de permisos (`Permisos.firmaDeLectura`).
- **Lo que una pantalla va a necesitar de seguro** se pide antes con `adelantar` (api.html).
- **Las pantallas se actualizan solas.** Las listas de `callServerListaCacheada` llegan por `apiListaConHuella`
  con su huella (las versiones de hoja que leyó, `CacheHojas.conHuella`). Cada 60 s, con la pestaña a la vista, el
  vigía de `api.html` pregunta `apiHuellasVigentes` (solo CacheService) por las listas que una pantalla escucha
  (`escucharLista`); si cambió una, la pide y `lista-actualizada` la vuelve a pintar. Una lista nueva solo necesita
  `callServerListaCacheada` + `escucharLista`. Lo editado a mano en la hoja llega con el activador
  `instalarAvisoDeCambios()` (AvisoDeCambios.gs), una vez por proyecto; `revisarEntorno` avisa si falta.
- **Una lista nueva** de `HojaServicio` exporta `calentar` y va en `pasosCalentador_()` de
  `Calentador.gs`. Es un activador que la rehace cada 10 min: se instala una vez por proyecto
  con `instalarCalentador()` desde el editor. Un contrato revisa que cada paso exista.

## Flujo de trabajo

- Rama de trabajo: `jorge`. Nunca hacer push a `master` sin que se pida
  explícitamente.
- Verificación estándar antes de dar por bueno un cambio: `npm run push` (no
  `clasp push` a mano — ver "Se sube comprimido" arriba; usa el scriptId de DEV
  de `.clasp.json`, `1qE6UYn-ay4jZYRxiBOnmDwiE_iKWVtBSuiPEaz_PjArz0lf0YcfojqC-`,
  y ya baja y compara lo que quedó allá), y revisar sintaxis de cada `<script>`
  con `node -e "new Function(js)"` antes de commitear.
