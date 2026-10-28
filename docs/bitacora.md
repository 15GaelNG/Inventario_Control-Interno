# Bitácora de ingresos y cambios

Pedida a Control Interno y autorizada para producción (28-oct-2026). Código: `src/services/Bitacora.gs`; prueba:
`tests/bitacora.test.js`.

## Cómo funciona
- **Nadie la escribe a mano.** Toda escritura de hojas pasa por `SheetUtils` y toda escritura en Drive por
  `DriveUtils` (dos contratos lo vigilan). Sus primitivas avisan a `Bitacora`, así que un módulo nuevo nace anotado.
- **Dónde:** carpeta `BITACORA` en la raíz del proyecto → libro `BITACORA <año>` (si se acerca al límite de celdas,
  `BITACORA <año> (2)`) → una pestaña por mes (`2026-10`). Solo la abre la cuenta que despliega (la dueña); no se
  comparte. En un DEV se crea sola; en producción, `instalarBitacora()` desde el editor, **antes de desplegar**
  (`revisarEntorno` marca error si falta la carpeta `BITACORA`).
- **Cuándo se escribe:** lo de una ejecución se junta y sale en una sola llamada (`Sheets…Values.append`, RAW) al
  soltar el candado (`Candado.con`). Si el libro falla, el guardado no truena: lo pendiente va a una cola
  (`BITACORA_COLA` en Script Properties) que la revisión diaria reintenta.

## Un renglón
`FECHA · QUIEN · ORIGEN · OPERACION · ACCION · LIBRO · HOJA · ID REGISTRO · FILA · CAMPO · ANTES · DESPUES · DETALLE · HUELLA`

| ACCION | Qué |
|---|---|
| `CAMBIAR` | un renglón por campo que de verdad cambió, con antes y después |
| `AGREGAR` / `BORRAR` | un renglón por registro, con el registro completo (después / antes) |
| `CARGA` | lo masivo en un solo renglón: reescribir una pestaña, una columna entera, más de 50 renglones |
| `ESTRUCTURA` | pestaña nueva, columnas nuevas o quitadas |
| `INGRESO` / `INGRESO FALLIDO` / `ACCESO` | de lo que anota `Accesos` (inicios de sesión, códigos), a nombre de quien intentó entrar |
| `DENEGADO` | `Permisos.exigir` negó algo (lo que se pide por si acaso va con `Permisos.sinAnotar` y no cuenta) |
| `SUBIR` `CARPETA` `MOVER` `RENOMBRAR` `COPIAR` `PAPELERA` `REEMPLAZAR` | Drive (HOJA = `DRIVE`, ID = el del archivo) |

- **ORIGEN:** `app` (con sesión: `Auth.validarSesion` → `Bitacora.sesion`), `a mano` (el activador de edición,
  `AvisoDeCambios`; de un pegado Google no da lo de antes), `sistema` (activadores, Calentador, editor).
- **OPERACION:** un ID por ejecución: lo de un mismo guardado sale junto.
- **Secretos:** contraseñas, huellas, PIN, códigos, tokens: nunca el valor (`(cambió)` / `(oculto)`).
- **HUELLA:** SHA-256 de la huella anterior de la pestaña + el renglón. `Bitacora.revisarCadena()` la recorre: si
  alguien edita o borra un renglón, se rompe desde ahí.

## Qué hojas
Por omisión **todas**. Las excepciones viven en `Bitacora.HOJAS`, cada una con su razón: copias derivadas y bitácoras
que ya existen (`no: 'razón'`), columnas secretas de más (`secretas`), y ACCESOS, que se vuelve un renglón de ingreso
(`renglon`). Una columna que es ruido se ignora en `IGNORAR` (LEIDA_POR de las notificaciones).

## Vigilancia
El Calentador, una vez al día (`Bitacora.revisarDiaria`): reintenta la cola, revisa la cadena del mes y, de martes a
viernes, que haya renglones en las últimas 24 h. Si algo anda mal, avisa por correo a la cuenta que despliega.

## Pendiente
- **Esperan a Jorge** (no escriben todavía por las primitivas): hojas de Help Desk, Inspecciones y Vehículos; Drive de
  Adherente, Arqueos y Responsiva; y el `sinAnotar` de Help Desk.
- Ancla externa diaria de la última huella (el repositorio de respaldos, o un correo), pantalla de consulta,
  exportaciones a Excel, versión de la app por renglón, retirar los historiales viejos (PERMISOS_HISTORIAL…).
