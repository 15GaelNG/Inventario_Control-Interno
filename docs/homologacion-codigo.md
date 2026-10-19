# Homologar el código: el plan

> Rama `common` (15-oct-2026). Aquí vive el esfuerzo de homologación para no mover el día a día de `ayrton`,
> `jorge` ni `emmanuel`. El antecedente del **modelo de datos** de Líneas (llaves, NUCO, hojas) es
> [lineas-homologacion.md](lineas-homologacion.md); esto es del **código**: capas, componentes, diseño y pruebas.

## Por qué

Lo esencial ya es común (`Formulario`, `DataTable`, `CamposHoja`, `HojaServicio`…), pero desde el último punto
en común Líneas y el resto crecieron cada uno con su propia versión de casi todo. El diagnóstico (medido el
15-oct sobre `master`):

| Capa | Lo común | Lo de Líneas |
|---|---|---|
| Datos | `HojaServicio` / `SheetUtils` | `LineasDatos` + `LineasRepo` (0 usos de `HojaServicio` en 29 archivos) |
| Formularios | `Formulario` + `CamposHoja` | `htmlFormularioAppSheet` con pasos, validación y subida propios (0 usos) |
| PDF | `Plantilla` / `PdfService` | `LineasPdf`: **la misma sintaxis `<<…>>`**, otro motor |
| Avisos | `NotificacionesService` | `LineasNotificaciones` |
| Expediente | `ExpedienteNuco` | lo suyo en NUCOS TELEFÓNICOS |
| Llamadas y caché | `callServerCacheado`, `adelantar`, `escucharLista` | `llamar()` + `memoria{}` con vigencias propias |
| Permisos en pantalla | el mapa de la sesión (`puede()`) | `apiLineasPermisos`: una llamada más (~1–2.5 s) |
| Estilos | `styles.html` | `lineas-estilos.html` (1,269 líneas, 17 cortes fuera de regla, 2 `matchMedia`) |

Y al revés: la ficha de Vehículos y Caja Chica usa a mano el CSS de Líneas (`ln-card`, `ln-ficha-tabs`,
`ln-detalle-header`…). Hay **tres** pestañas distintas (`Tabs` con `.activa`, `fichaEnPestanas` de `app.html`
con `.active`, y otra `fichaEnPestanas` con el mismo nombre en `lineas.html`).

Lo demás: ~20 copias de escapar HTML, ≥8 de formato de fecha, 8 de quitar acentos, 6 de íconos; 24 tamaños de
letra y 19 radios distintos; `app.html` (5,225) con Vehículos completo adentro; `lineas.html` (7,236) en un solo
IIFE; ~4,400 líneas de migración que se suben a prod; y 574 aserciones con regex sobre el texto del código en
`source-contracts` que van a frenar cualquier movimiento.

**Lo más grave no es de Líneas** (fase 1): `SheetUtils.update`/`remove` no usan candado y `update` reescribe el
renglón completo. Líneas, en cambio, lo hace bien. La homologación va en los dos sentidos: se toma lo mejor de
cada lado.

## Reglas de la rama

1. **`common` no es un tercer sistema.** Cada fase que termina se pasa a `master` por su lado (PR chico) y se
   vuelve a traer `master` a `common`. Una rama de refactor que vive meses sin regresar es exactamente el
   problema que estamos arreglando.
2. **Se trae `master` a `common` al empezar cada fase** (y cuando alguien suba algo grande a Líneas o
   Vehículos). Mientras más chico el salto, menos conflictos.
3. **Ningún cambio de comportamiento escondido en un refactor.** Si mover algo a un componente cambia lo que
   ve la gente, va en su propio commit y se dice.
4. **Cada pieza común nueva lleva su prueba y su contrato** (como `CampoAuto`): el contrato es lo que impide que
   aparezca la copia número 21.
5. **Las excepciones de los contratos solo se achican** (`PENDIENTES`, "Líneas queda fuera"): cada fase baja
   su número.
6. Lo de siempre de CLAUDE.md aplica igual: `//` y `/*` escapados en los `.html`, `npm run push`, sintaxis de
   cada `<script>`.

## Fase 0 — Preparar

- [ ] **Dónde se prueba.** `common` no tiene DEV propio y `npm run push` desde aquí pisaría el DEV de quien suba.
      Opción recomendada: un proyecto DEV para `common` (`setup-dev.ps1`) y anotarlo en `ramas` de
      `tools/subir/destinos.json` y en el `on.push.branches` de la Action.
- [ ] **Línea base.** `npm test` verde, capturas de `capturar.js todas --matriz` guardadas como "antes".
- [~] **Escenas de Líneas en la vista previa**: hechas (15-oct) `lineas` (la lista), `lineas-agregar` (captura por pasos con
      errores) y `lineas-agregar-paso2` (avanza con el paso completo), en 390/768/1024 sin desbordes. Faltan la ficha
      (`apiLineasEquipo` y sus pestañas) y Resguardos.

## Fase 1 — Escritura segura en el núcleo (riesgo real de datos)

**Qué está mal.** `SheetUtils.update` busca el número de renglón, lee la fila, mezcla y escribe **la fila
completa**, sin candado; `remove` borra sin candado (solo `removeMany` lo usa). `HojaServicio.actualizar` hereda
las dos cosas y además, con ganchos, lee la hoja completa dos veces.

- Un borrado entre la búsqueda y la escritura recorre los renglones: **la escritura cae en otro registro**, sin
  error.
- Lo que alguien cambió en otra columna (o a mano en la hoja) entre la lectura y la escritura se pierde.

**Cómo.** Tomar la forma de `LineasDatos` (candado siempre, una escritura por renglón):

- [x] **Primero un candado común y reentrante: `src/utils/Candado.gs`** (no estaba en el plan). `waitLock()` no es
      reentrante, y varios servicios toman el candado y desde ahí llaman a `update` (Cambios de Monto → Cajas;
      Reasignaciones → Vehículos → Relaciones; `Relaciones.cambiarClave`). Ponerle candado a `update` sin esto los
      colgaba. Los 29 `getScriptLock` sueltos (servicios, `LineasDatos.conCandado`, migraciones) pasaron a
      `Candado.con`; los de `tryLock` conservan su salida con `siOcupado`.
- [x] `update`: candado → buscar el renglón **dentro** del candado → escribir **solo las columnas que cambian**
      (tramos contiguos, nada en los huecos) → soltar. Sigue regresando el registro completo mezclado.
- [x] `remove`: candado (igual que `removeMany`).
- [x] Buscar el ID leyendo **solo la columna del ID** (no `TextFinder`: es igual de barato aquí, no se equivoca con
      números o formatos, y se puede probar en el simulador).
- [x] `HojaServicio.actualizar`: leer el de antes, los ganchos y escribir bajo un mismo candado; `crear` con
      `candadoAlCrear` también por `Candado`.
- [x] Pruebas: `tests/candado.test.js` (reentrante, errores, ocupado) y la sección 9 de `tests/sheetutils.test.js`
      (fórmula intacta, solo las celdas que cambian, no pisa otra columna, bajo candado, anidado sin colgarse).
- [x] Contrato: ningún `LockService.get*Lock` fuera de `Candado.gs`; `update` y `remove` usan `Candado.con` y
      `update` no arma el renglón completo.
- [ ] Probado en el DEV de common: editar un vehículo, un cambio de monto (el caso anidado), una reasignación y
      borrar un registro; ver que no tarde más que antes.
- [x] Limpieza: fuera los atajos que ya no hacían falta (`propagarSinCandado` exportado, `revisarSinCandado_`,
      `identificarSinCandado_`, la opción `candadoTomado` en Vehículos, Reasignaciones, Responsiva y Relaciones) y
      solo dos esperas en `Candado` (30 s normal; 5 s con `siOcupado`), sin opción de espera suelta.
- [ ] Después: `migrarOtrasFirmasTempSiHaceFalta_` (Adherente/Responsiva) cuando ya no queden firmas viejas.

**Hecho cuando** las pruebas de arriba pasan y se midió en DEV que una edición no tarda más que antes.

## Fase 2 — Formato y utilidades de pantalla

- [x] `componentes/formato.html` → `Formato.esc`, `fecha` (05/10/2026), `fechaHora`, `fechaHoraSiTiene`, `fechaTexto`
      (05 oct 2026, con `{ hora: true }`), `dia` (yyyy-MM-dd local), `hora`, `moneda` (`centavos: true/false`, por
      omisión solo si los tiene; el signo antes del $), `miles`, `porcentaje`, `aNumero`, `normal`, `normalAlineado`.
      Todo regresa '' si el dato viene vacío; el '—' lo pone quien llama. Un yyyy-MM-dd se lee en hora local.
- [x] Íconos: no hizo falta otro; ya existía `Iconos.svg` y el `icono` de Líneas ahora es un alias suyo (con `ln-icon`).
- [x] Copias sustituidas en 27 archivos (10 `esc`, 7 normalizar, fechas, moneda y miles a mano). Los nombres globales
      de siempre (`escaparHtml`, `formatearFecha`, `formatearMoneda`, `hoyLocal`, `fechaParaInput`) quedan como envoltura
      de una línea: tienen 275 llamadas en archivos que tocan los demás y renombrarlas solo daría conflictos.
- [x] `tests/formato.test.js` y contrato en `source-contracts`: fuera de `formato.html` ningún `'&amp;'`,
      `.normalize('NFD')`, `.toLocale…String(` ni `padStart(2, '0')` dentro de un `<script>`.
- [x] Va en `Index.html` antes que todo (contrato). Las pruebas que cargan un archivo suelto usan `tests/formato-fuente.js`.
- Cambios que se notan: fechas con cero (05/10/2026 en vez de 5/10/2026); Líneas y notificaciones dicen "05 oct 2026,
  14:30"; un yyyy-MM-dd ya no cae al día anterior (`fechaTabla` de Líneas, `fechaParaInput`). Se corrigió de paso la
  fecha de los campos de Help Desk (`/^d{4}…/` sin `\`: nunca se formateaba).

## Fase 3 — Escala de diseño

- [x] Variables en `styles.html`: `--texto-2xs … --texto-3xl` (10, 11.5, 12.5, 14, 16, 20, 24, 32) y `--radio-xs … --radio-2xl`
      (4, 6, 8, 10, 12, 16); `--radius` desapareció (era `--radio-xl`). `--espacio-*` no se hizo: nadie lo iba a usar
      todavía y una variable sin uso es ruido; entra cuando la fase 4 arme `Ficha`.
- [x] 27 tamaños → 8 y 19 radios → 6 en 34 archivos (script, no a mano). Capturas antes/después de las 94 escenas: se
      mueve medio pixel donde había 12/13px; nada se rompe.
- [x] Colores de estado → `--tono-*` (18, cada uno con su versión de modo oscuro): las reglas del AppSheet de Líneas, la
      clase de vehículo, el estatus de Caja Chica, Sensores y Reasignaciones (40 colores). Se quedan fijos, a propósito,
      lo que pinta un lienzo o un PDF, las gráficas (Chart.js no lee variables), la tinta de firma y daños, y la
      temporada (dibujos).
- [x] Contrato: `font-size` en px solo de 36px para arriba (números de portada), `border-radius` en px solo ≤2px o
      999px/50%, y ningún color escrito en el JS de la pantalla salvo la lista corta de color fijo. `FirmaExterna.html`
      queda fuera: es página aparte y no incluye `styles.html`.
- Visto de paso para la fase 4: el panel de filtro por tipo/estado (`const fila = (valor, icono, color, nombre, n)`)
  está copiado 4 veces (Vehículos ×2, Uber, Caja Chica).
- [ ] (Opcional) Apariencia: tamaño de letra, ahora que todo cuelga de variables.

## Fase 4 — Componente `Ficha` (el primer punto de unión real)

- [x] **4a** Una sola implementación de pestañas (`componentes/tabs.html`): grupo `data-tabs`, `.tabs-lista`,
      `.tab-btn[data-tab]` con `.activa`, paneles `[data-tab-panel]`; un solo listener; `Tabs.html` para una ficha,
      `Tabs.mostrar/actual/contar` y el evento `tabs-cambio`. Fuera `wireTabsSimple` y los dos `fichaEnPestanas`.
- [x] **4b** `componentes/ficha.html`: `Ficha.migas` y `Ficha.encabezado` (ícono o foto, título, chips, botones,
      resumen rápido). Las pestañas por sección siguen siendo `Tabs.html` con `puede('modulo.seccion') && {…}`. El CSS
      salió de `lineas-estilos.html` sin `ln-` (`ficha-migas`, `ficha-encabezado`, `ficha-resumen`…), con el corte 640.
      7 encabezados migrados: Vehículos (y su página de fotos), Caja Chica, Líneas y Usuarios (persona, área, perfil).
      El menú «más» se queda en Líneas (`ln-btn-mas`): es el único que lo tiene; entra a Ficha con el segundo.
- [x] **4c** `componentes/filtro-tipo.html` (`FiltroTipo.crear`): el filtro rápido por tipo/clase/estatus estaba
      copiado 5 veces (Incidencias, Vehículos, Uber, Caja Chica, Líneas); su CSS salió de `styles.html`.
- Contratos: marcado viejo de pestañas, encabezados a mano (`ln-detalle-header`, `ln-migas`…) y copias del filtro.
  El contrato `FICHAS` (deModulo) sigue igual.

## Fase 5 — Líneas hacia lo común (de lo barato a lo caro)

Cada paso es independiente y se puede pasar a `master` solo.

| # | Qué | Por qué primero / cuidado |
|---|---|---|
| 5.1 ✅ | Permisos de Líneas en la sesión; quitar `apiLineasPermisos` (hecho: `puedeOperar` = `puedeEditarModulo`, ADMIN de `state.sesion.rol`; secretos y aprobador no los usaba la pantalla, se quedan en el servidor) | Una llamada menos al abrir. Los permisos especiales (secretos, aprobador) como secciones en `Modulos.gs` |
| 5.2 ✅ | `llamar()` + `memoria{}` → `callServerCacheado` / `callServerListaCacheada` / `escucharLista` (hecho: catálogos, CH y accesorios con `callServerCacheado`; el índice con `callServerListaCacheada`, huella `huellaIndice_` y copia sin PIN con `guardarListaLimpia`. **Las fichas NO**: traen PIN, patrones y contraseñas a quien los puede ver y la caché común las dejaría en el navegador; se quedan con su memoria de 2 min) | Que Líneas se actualice sola como lo demás; quitar la invalidación con regex |
| 5.3 ✅ | `lineas-estilos.html`: cortes a 640/1024, `matchMedia` → `Pantalla`; sacar `PENDIENTES` de Líneas (hecho: ≤ 760 → 640, 900 → 1024, así el iPad vertical queda igual; dos bloques repetidos o vacíos fuera) | Líneas no tiene escenas en la vista previa: se revisa en el DEV |
| 5.4 ❌ | PDF: un solo motor (`Plantilla`). **Fuera de la homologación (usuario, 15-oct): las plantillas y la generación de PDF de Líneas se quedan como están** | `LineasPdf` entiende `RIGHT("000" & [NUCO], 4)` y `&`; `Plantilla` no y **truena** con lo que no entiende (bien). Primero agregarle eso con pruebas, luego correr cada plantilla de Líneas en los dos motores y comparar el texto antes de cambiar |
| 5.5 ✅ | Avisos: `LineasNotificaciones` como fuente de `NotificacionesService` (hecho: `NotificacionesService.campana` con `FUENTES_` por módulo y la misma forma de aviso; una llamada, `apiNotificaciones`, en vez de dos; los avisos de Líneas ahora dan huella. La "leída" de Vehículos sigue en el navegador) | La campana ya junta; que sea un solo registro de tipos |
| 5.6 ✅ (chica) | Formularios: lo que `htmlFormularioAppSheet` hace que `Formulario`/`CamposHoja` no. **Hecho (versión chica, usuario 15-oct):** la navegación por pasos es un componente, `Pasos` (`componentes/pasos.html`), que usan `Formulario` y las capturas de Líneas (`activarPasos`); los errores de campo, `Formulario.marcarError` en los dos. Después, las 4 de navegación libre también (Vehículo, Responsiva y Adherente vehicular, Arqueos; `guardarAlFinal`). Queda solo Inspecciones (contrato con lista que solo se achica): su Siguiente es asíncrono, sus pasos cambian al elegir la unidad y "completo" sale de las respuestas. **La migración completa de las capturas de Líneas se retoma al final, aislada** (ver "Pendiente al final") | Inventario primero (pasos, `mostrarSi`, subida de imagen, validaciones por tipo); lo que falte se agrega **una vez** al componente; después se migra captura por captura |
| 5.7 ✅ | Expediente: NUCOS TELEFÓNICOS con la misma pieza que `ExpedienteNuco`. **Hecho:** la raíz con la misma regla (sin `LINEAS_DRIVE_NUCOS`, una "NUCOS TELEFONICOS" de pruebas en la raíz del proyecto; antes caía al ID de producción y `configurarLineasDev` se lo ponía a cada DEV, que desde el 2-oct escribía ahí sus PDF y fotos); `revisarEntorno` marca error si un DEV apunta a una carpeta de producción; `DriveUtils.subcarpeta` (reconoce espacios y acentos) reemplaza 6 copias (ExpedienteNuco, Líneas, PdfService, INE, Solicitud de compra). **No se hizo:** juntar las dos estructuras de carpetas (vehículos por documento y trimestre; líneas por cuatrimestre/mes, "INSP DD MM"): la de Líneas la llena el área a mano y cambiarla es decisión suya | Generalizar `ExpedienteNuco` (raíz y carpetas por tipo de activo), no copiarlo |
| 5.8 ⏸ | Datos: `LineasRepo` encima de `HojaServicio`. **Inventariado, no movido (15-oct)**: ver "5.8: por qué espera" abajo | El último. Para entonces `HojaServicio` ya tiene la escritura de `LineasDatos` (fase 1) y lo que falte (lectura de filas sueltas con batchGet, zona horaria). `LineasRepo` se queda como traductor del modelo equipo/línea/asignación |

### 5.8: por qué espera (inventario del 15-oct)

Lo común ya está debajo de Líneas: `LineasDatos.conCandado` es `Candado.con` (fase 1), `recordar` y la caché son
`CacheHojas`, y sus listas dan huella (5.2b, 5.5). Lo que `LineasDatos` hace y `HojaServicio`/`SheetUtils` no:

- búsquedas por columna con TextFinder (35 mil filas de bitácora) y filas sueltas en una llamada (`batchGetByDataFilter`);
- escrituras de una fila en una llamada a la API de Sheets y, dentro del candado, en lote (`vaciarLote_`);
- caché comprimida en trozos, encabezados en blanco que el AppSheet conoce, columnas de IDs anteriores
  (`ID ANTERIOR`, `ID APPSHEET`), corrección de la zona horaria de la hoja, candado contra el libro de producción;
- **tablas virtuales de la reestructura** (`LineasLectura`: LINEAS TELEFONICAS armada con LINEAS / EQUIPOS /
  ASIGNACIONES / ADENDUMS).

Por qué no ahora: Líneas está a mitad de su reestructura (etapas 2–3). Montar `LineasRepo` sobre `HojaServicio` hoy
sería hacerlo dos veces: primero sobre la hoja vieja virtual y luego sobre las nuevas. Orden cuando termine la
reestructura (las hojas nuevas son hojas normales): (1) llevar a `SheetUtils` lo que sirva a todos (lectura de filas
sueltas, escritura por la API en lote) con sus pruebas; (2) declarar LINEAS, EQUIPOS, ASIGNACIONES y ADENDUMS como
definiciones de `HojaServicio` (con `alcance`, `campos`, `fechas`); (3) `LineasRepo` queda como traductor del modelo
equipo/línea/asignación encima de esas definiciones.

### Pendiente al final: las capturas de Líneas sobre `Formulario` (aislado)

Decisión del usuario (15-oct): vale la pena, pero es de alto riesgo; se hace **al final**, en su propio paso, y que toque
**solo ese componente**. Por qué no se hizo en 5.6: los formularios de Líneas los define el servidor (`LineasCaptura.gs`,
`LineasRegistros.gs`, `LineasChecklist.gs`) con condiciones como datos que el servidor vuelve a validar; `Formulario` se
declara en la pantalla con funciones. Lo que le faltaría a `Formulario` (inventario del 15-oct):

- condiciones como datos (`'NO_LINEA'`, `{campo, igual}`, `{cambio}`, `{cuantos}`…) para mostrar, **exigir** y **dejar editar**;
- pasos que empiezan en un título, contenido extra en un paso (fotos), modo libre al editar (`Pasos` ya lo trae);
- controles: escala (checklist), multi, referencia (etiqueta → ID), lista abierta con "Agregar 'x'" y autollenar de Capital
  Humano, patrón, identificación (INE), firma guardada, responsables adicionales, calculados en vivo;
- validaciones por código iguales a las del servidor (`MAYUS`, `NUCO`, `PIN_EQ`…), selector de bloqueo, acomodo de la
  inspección y un bloque por equipo (Mandar a resguardo).

Son 8 pantallas (inspección, responsiva, editar/agregar equipo y línea, solicitud, resguardo, cancelación, vincular, masivas).
Orden sugerido cuando se retome: agregar a `Formulario` las condiciones como datos (con su prueba) → migrar primero la
captura más simple (cancelación o vincular) → una por una, probando cada una en el DEV.

## Fase 6 — Estructura

**Los tres movimientos de archivos (6.1–6.3) se hacen justo antes de pasar a `master`, coordinados con el equipo**
(15-oct): mover miles de líneas de `app.html`, `lineas.html` y `ClientApi.gs` en `common` choca con todo lo que
Jorge, Emmanuel y Ayrton cambien en esos archivos mientras tanto (un conflicto por cada cambio suyo). Se hacen en un día
acordado, con los archivos "congelados" unas horas, en un PR que solo mueve (sin cambiar código) para que se revise fácil.

- [ ] 6.1 Vehículos sale de `app.html` a `app-vehiculos.html` (como Arqueos y Caja Chica); Uber y Tickets también.
      `app.html` queda como la base: menú, sesión, inicio, ayudantes. **Pendiente (usuario, 19-oct)**: después de
      Líneas, y cuando Jorge suba lo suyo (213 líneas de `app.html` sin subir). Es más fácil que 6.2: `app.html` no
      está encerrado en una función, sus partes ya comparten el espacio global como `app-arqueos.html`.
- [x] 6.2 `lineas.html` por pantallas (19-oct), con `tools/lineas/partir.js`: el archivo era **una sola función**
      (`const Lineas = (function () { … })()`), así que no bastaba con mover. Queda la base (`lineas.html`, 2,394
      líneas: utilidades, formularios, estado) y una pantalla por archivo (`lineas-telefonicas`, `-panorama`,
      `-activos`, `-accesorios`, `-resguardos`, `-bitacora`). Cada pantalla toma lo que usa de `Lineas.comun` y se
      publica con `Object.assign(Lineas, …)`. Cambios de código, los mínimos: `montaje` pasa a `{ n }` (lo reasignan
      todas), las pantallas leen `panelAbierto` con `panelActual()` (una copia se quedaría vieja), `dinero` y
      `pedirDatos` suben a la base. El script revisa que cada sentencia quede una vez y que deshaciendo esos cambios
      salga el original; las pruebas leen todo con `tests/lineas-fuente.js`. Vista previa: las 8 escenas de Líneas
      (5 nuevas, una por pantalla) idénticas antes y después, sin errores.
- [x] 6.2b `initTelefonicas` (3,161 líneas, 177 declaraciones) en partes (19-oct), con
      `tools/lineas/partir-telefonicas.js` y `eslint-scope` (dependencia de desarrollo: los ámbitos de verdad, sin
      confundir una variable local que se llama igual). Queda el arranque + la lista (`lineas-telefonicas.html`, 814
      líneas) y seis partes: `-ficha`, `-documentos`, `-acciones`, `-captura`, `-historial`, `-paginas` (188 a 808).
      El cuerpo de las funciones no cambia: lo de otra parte se pide arriba con `T.de('parte')` (como un import, 185
      llamadas), lo del arranque sale de `T`, y de los 12 `let` 8 pasan enteros a su parte; los 4 que se comparten
      (`captura` y las tres tablas de la ficha) los publica su dueña con get/set y las demás dicen `T.captura` (las
      únicas 32 reescrituras). Cuatro literales que compartían ficha y documentos suben al arranque. El script revisa
      que cada sentencia quede una vez y que los archivos nuevos no dejen ningún nombre sin resolver que el original
      resolvía (así se cacharon dos olvidos antes de escribir). Vista previa: 10 escenas de Líneas (2 nuevas: la ficha
      y el clic derecho) sin errores y como antes.
- [ ] 6.3 `ClientApi.gs`: una forma de nombrar (`api<Módulo><Qué>`). **Sin renombrar de golpe**: los nombres viejos
      quedan como alias hasta que nadie los llame; agrupar por módulo en el archivo.
- [x] 6.4 Lo del editor, detrás del candado (15-oct): `candado-editor.test.js` ya no revisa una lista fija de 11
      archivos sino **todo `src/`** (130 funciones). Faltaban 9: `_continuar` / `_estado` / `_detener` de los procesos
      largos (índice de Adquisición, lectura e inventario de INE), que cualquiera podía arrancar o detener desde la
      consola del navegador; el activador de tiempo pasa el candado (no hay usuario activo). `alEditarLibro` (activador
      de edición: ahí el usuario activo es quien editó) lleva su guarda: llamado desde el navegador no hace nada.
      No se sacaron `Migracion*` del build de prod: con el candado no hacen falta fuera, y quitarlos rompería
      `revisarEntorno` y lo que los llama.

## Fase 7 — Pruebas que no estorben

- [x] Clasificar las aserciones de `source-contracts` (15-oct, `node tools/pruebas/clasificar-contratos.js
      tests/source-contracts.test.cjs`, por patrones: aproximado). 975 aserciones en 107 pruebas: **127** vigilan copias
      (`doesNotMatch`, listas que solo se achican), **52** catálogo / includes / permisos, **443** están en pruebas que ya
      ejecutan el código (`new Function`, vm, `crearEntorno`) y **353** son comportamiento escrito como texto. Las de
      texto se juntan en las pantallas de Líneas (selección estilo Drive 29, inspección y responsiva 15, navegación de la
      ficha 14, tablas 14…): les toca cuando se retome la migración de las capturas de Líneas ("Pendiente al final").
      Ejemplo de por qué importan: la del "Drive" de Líneas exigía como texto que un DEV sin configuración usara **NUCOS de
      producción** (el error del 5.7 estaba escrito como regla).
- [ ] Las de comportamiento pasan a pruebas que lo ejecutan (`apps-script-simulado.js`, jsdom) conforme cada
      fase toque esa parte. No antes: reescribir pruebas de algo que no se está moviendo no paga. Hechas en esta rama:
      `tests/pasos.test.js` (los pasos de Líneas ya no se exigen como marcado), la campana en `inicio-cache.test.js`,
      `DriveUtils.subcarpeta` en `driveutils.test.js` (y `tests/drive-utils-real.js` para que las pruebas con Drive
      simulado usen la regla real, no una copia), "guardar limpio" del índice en `listas-cliente.test.js`.

## Transversal — medir uso

Hoy no se sabe qué pantallas se usan ni cuánto (`verTiempos()` mide velocidad, no uso). Un contador ligero por
vista y por acción (navegarA + guardar), agregado por día en una hoja, ayudaría a decidir el orden de la fase 5
con datos y a saber qué pantalla nadie abre.

## Orden sugerido

`0 → 1 → 2 → 3 → 4 → 5.1 → 5.2 → 5.3 → 6 → 5.5 … 5.8` (5.4 fuera), con la 7 conforme se avanza. La 1 es la única con
riesgo de datos; la 2 y la 3 son mecánicas y desbloquean todo lo visual; la 4 es donde Líneas y Vehículos se
juntan por primera vez.

## Bitácora

| Fecha | Fase | Qué | Pasó a master |
|---|---|---|---|
| 19-oct | 6.2b | `initTelefonicas` en el arranque + 6 partes (`T`, `T.de`), con `tools/lineas/partir-telefonicas.js` y `eslint-scope`; contrato y 2 escenas | pendiente |
| 19-oct | 6.2 | `lineas.html` (7,132 líneas) en la base + 6 pantallas sobre `Lineas.comun`, con `tools/lineas/partir.js`; `tests/lineas-fuente.js`, contrato y 5 escenas | pendiente |
| 15-oct | — | Rama `common` desde `master` (46b73b0) y este plan | — |
| 15-oct | 0 | DEV propio (`Inventario DEV - common`, copia del libro de prod, carpeta DEV COMMON); la Action sube `common` | — |
| 15-oct | 1 | `Candado` reentrante en todo el servidor; `SheetUtils.update`/`remove` bajo candado y escribiendo solo lo que cambia | pendiente: probar en DEV |
| 15-oct | 2 | `Formato` (componentes/formato.html): una sola copia de esc, fechas, moneda, miles y normal; contrato | pendiente: probar en DEV |
| 15-oct | 3 | Escala `--texto-*` (27→8), `--radio-*` (19→6) y `--tono-*` con modo oscuro; contrato | pendiente: probar en DEV |
| 15-oct | 4 | 4a `Tabs` (3 implementaciones → 1), 4b `Ficha` (7 encabezados), 4c `FiltroTipo` (5 copias); contratos | pendiente: probar en DEV |
| 15-oct | 5.8, 6, 7 | 5.8 inventariado (espera a la reestructura de Líneas); 6.4 candado en todo `src/`; 6.1–6.3 se hacen antes de pasar a master, coordinados; 7 clasificada; escenas de Líneas; `Pasos` en Vehículo, Responsiva, Adherente y Arqueos | pendiente: probar en DEV |
| 15-oct | 5.7 | NUCOS de Líneas: sin respaldo a producción en un DEV (y `revisarEntorno` lo vigila); `DriveUtils.subcarpeta` en lugar de 6 copias | pendiente: probar en DEV; **revisar en el DEV de Jorge** si tenía `LINEAS_DRIVE_NUCOS` = producción |
| 15-oct | 5.6 | `Pasos` (navegación por pasos) en Formulario y Líneas, `Formulario.marcarError`; la migración completa de las capturas de Líneas queda al final | pendiente: probar en DEV |
| 15-oct | 5.5 | La campana en una llamada (`apiNotificaciones`): Líneas y Vehículos como fuentes de `NotificacionesService`; huella de `APP_NOTIFICACIONES`; escenas `campana` y `notificaciones` en la vista previa | pendiente: probar en DEV |
| 15-oct | 5.1–5.3 | Líneas: permisos de la sesión (sin `apiLineasPermisos`), catálogos e índice por la caché común con huella (el índice nunca se guardaba: faltaba `MAX_GUARDAR`), cortes 640/1024 y `Pantalla` | pendiente: probar en DEV |
