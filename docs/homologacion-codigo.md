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
- [ ] **Escenas de Líneas en la vista previa** (hoy no hay ninguna): lista, ficha, captura, resguardos, en
      390/768/1024. Sin esto no hay forma de saber si la homologación rompió Líneas en celular.

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

- [ ] `componentes/ficha.html`: encabezado (ícono, título, migas, botones, menú "más"), resumen rápido, pestañas
      por sección (pide permiso con `puede('modulo.seccion')`), contador por pestaña.
- [ ] Una sola implementación de pestañas: `Tabs` con una sola clase de activa; `fichaEnPestanas` de `app.html` y
      la de `lineas.html` desaparecen.
- [ ] El CSS de ficha sale de `lineas-estilos.html` sin prefijo `ln-` (`ficha-card`, `ficha-encabezado`…).
- [ ] Migrar: Vehículos → Caja Chica → Líneas. El contrato `FICHAS` (deModulo) se queda y se amplía.

## Fase 5 — Líneas hacia lo común (de lo barato a lo caro)

Cada paso es independiente y se puede pasar a `master` solo.

| # | Qué | Por qué primero / cuidado |
|---|---|---|
| 5.1 | Permisos de Líneas en la sesión; quitar `apiLineasPermisos` | Una llamada menos al abrir. Los permisos especiales (secretos, aprobador) como secciones en `Modulos.gs` |
| 5.2 | `llamar()` + `memoria{}` → `callServerCacheado` / `callServerListaCacheada` / `escucharLista` | Que Líneas se actualice sola como lo demás; quitar la invalidación con regex |
| 5.3 | `lineas-estilos.html`: cortes a 640/1024, `matchMedia` → `Pantalla`; sacar `PENDIENTES` de Líneas | Necesita las escenas de la fase 0 |
| 5.4 | PDF: un solo motor (`Plantilla`) | `LineasPdf` entiende `RIGHT("000" & [NUCO], 4)` y `&`; `Plantilla` no y **truena** con lo que no entiende (bien). Primero agregarle eso con pruebas, luego correr cada plantilla de Líneas en los dos motores y comparar el texto antes de cambiar |
| 5.5 | Avisos: `LineasNotificaciones` como fuente de `NotificacionesService` | La campana ya junta; que sea un solo registro de tipos |
| 5.6 | Formularios: lo que `htmlFormularioAppSheet` hace que `Formulario`/`CamposHoja` no | Inventario primero (pasos, `mostrarSi`, subida de imagen, validaciones por tipo); lo que falte se agrega **una vez** al componente; después se migra captura por captura |
| 5.7 | Expediente: NUCOS TELEFÓNICOS con la misma pieza que `ExpedienteNuco` | Generalizar `ExpedienteNuco` (raíz y carpetas por tipo de activo), no copiarlo |
| 5.8 | Datos: `LineasRepo` encima de `HojaServicio` | El último. Para entonces `HojaServicio` ya tiene la escritura de `LineasDatos` (fase 1) y lo que falte (lectura de filas sueltas con batchGet, zona horaria). `LineasRepo` se queda como traductor del modelo equipo/línea/asignación |

## Fase 6 — Estructura

- [ ] Vehículos sale de `app.html` a `app-vehiculos.html` (como Arqueos y Caja Chica); Uber y Tickets también.
      `app.html` queda como la base: menú, sesión, inicio, ayudantes.
- [ ] `lineas.html` en archivos por pantalla (telefónicas, gestión de activos, resguardos, cambios) sobre un
      `lineas-base.html`.
- [ ] `ClientApi.gs`: una forma de nombrar (`api<Módulo><Qué>`). **Sin renombrar de golpe**: los nombres viejos
      quedan como alias hasta que nadie los llame; agrupar por módulo en el archivo.
- [ ] `Migracion*.gs`, `SetupInicial.gs` y semillas fuera de lo que se sube a prod (que `construir.js` los
      excluya en `prod`), o detrás de un candado de editor que ya existe.

## Fase 7 — Pruebas que no estorben

- [ ] Clasificar las 574 aserciones de `source-contracts`: **arquitectura** (se quedan: ids en el catálogo, nada
      de copias, orden de includes) contra **comportamiento escrito como texto** (p. ej. exigir literal
      `doc('file-plus', 'Generar PDF', …)`).
- [ ] Las de comportamiento pasan a pruebas que lo ejecutan (`apps-script-simulado.js`, jsdom) conforme cada
      fase toque esa parte. No antes: reescribir pruebas de algo que no se está moviendo no paga.

## Transversal — medir uso

Hoy no se sabe qué pantallas se usan ni cuánto (`verTiempos()` mide velocidad, no uso). Un contador ligero por
vista y por acción (navegarA + guardar), agregado por día en una hoja, ayudaría a decidir el orden de la fase 5
con datos y a saber qué pantalla nadie abre.

## Orden sugerido

`0 → 1 → 2 → 3 → 4 → 5.1 → 5.2 → 5.3 → 6 → 5.4 … 5.8`, con la 7 conforme se avanza. La 1 es la única con
riesgo de datos; la 2 y la 3 son mecánicas y desbloquean todo lo visual; la 4 es donde Líneas y Vehículos se
juntan por primera vez.

## Bitácora

| Fecha | Fase | Qué | Pasó a master |
|---|---|---|---|
| 15-oct | — | Rama `common` desde `master` (46b73b0) y este plan | — |
| 15-oct | 0 | DEV propio (`Inventario DEV - common`, copia del libro de prod, carpeta DEV COMMON); la Action sube `common` | — |
| 15-oct | 1 | `Candado` reentrante en todo el servidor; `SheetUtils.update`/`remove` bajo candado y escribiendo solo lo que cambia | pendiente: probar en DEV |
| 15-oct | 2 | `Formato` (componentes/formato.html): una sola copia de esc, fechas, moneda, miles y normal; contrato | pendiente: probar en DEV |
