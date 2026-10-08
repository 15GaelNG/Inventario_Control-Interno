# Expediente por NUCO (NUCOS VEHICULOS)

La carpeta de Drive **NUCOS VEHICULOS** (`1pgEmrDM58FuALsfzBzckC9ROz941HR9P`, dueño controlinterno@) tiene una
carpeta por NUCO. Cada una trae `1.-DOCUMENTACIÓN`, `2.- SERVICIOS`, `3.- VERIFICACIONES` y `4.- INSPECCIONES`.
El 8-oct-2026 se ordenó `1.-DOCUMENTACIÓN` de los 637 NUCO a una sola estructura. Las otras tres no se tocaron.
Es el mismo enfoque por NUCO que NUCOS TELEFÓNICOS, aunque por dentro varían.

## La estructura (junta del 8-oct-2026)

```
<NUCO>/1.-DOCUMENTACIÓN/
   1.-FACTURA                   la factura (el XML, si existe, es el original electrónico)
   2.-SEGURO                    la póliza; si el seguro NO APLICA, la imagen de inexistente
   3.-ALTA DE PLACAS            el documento estatal: alta, baja, canje o sustitución
   4.-TARJETA DE CIRCULACIÓN
   5.-RESPONSIVA                la vigente directo ahí
      RESPONSIVAS ANTERIORES/   las demás
      ADHERENTES/               corresponsabilidades (F-CI01-047), con sus variantes adentro
   6.-TENENCIA                  ya no se carga; sirve para mostrar que no debe tenencia
   ANTERIORES/                  lo que no es ninguno de los 6 (Oxxo Gas, verificaciones, permisos…), con su ruta de antes
      REPETIDOS/                copias idénticas de algo que ya está en las 6
      ESTRUCTURA ANTERIOR/      las carpetas viejas que quedaron vacías o solo con el relleno
```

- **Nombre de los archivos:** `DOCUMENTO-NNNN.ext` (`FACTURA-0088.pdf`). Si hay varios en la misma carpeta, el más
  reciente se queda sin fecha y los demás llevan la fecha (`FACTURA-0088 2025-06-18.pdf`) o `(2)`, `(3)`. Los
  adherentes se llaman `ADHERENTE-NNNN`.
- **Subcarpetas con significado se conservan:** `2.-SEGURO/SEGURO VENCIDO/`, `TENENCIA 2023/`… Lo que hay adentro no
  compite por ser el documento vigente.
- **Seguro NO APLICA:** si la hoja VEHICULOS dice `NO APLICA` y no hay póliza, se pone la misma imagen
  "CARPETA SIN INFORMACIÓN.jpg" de siempre, renombrada `SEGURO-NNNN NO APLICA.jpg`.

## Cómo estaba antes

Convivían tres generaciones de carpetas dentro de `1.-DOCUMENTACIÓN`:

| Generación | NUCO | Cómo era |
|---|---|---|
| La más vieja | 261 | Una subcarpeta `DOCUMENTOS` con 13 numeradas (contrato, carta factura, póliza, permiso provisional, Oxxo Gas, QR…) |
| Intermedia | 214 | 10–11 carpetas (Factura, Seguro, Permiso, Alta, Tarjeta, Oxxo Gas, Evidencia, Tenencia, Responsiva, Guía de servicio) |
| La de 6 | 112 | Ya con las 6, pero con nombres variados (`5.- CARTA RESPONSIVA`, `CIRCULACION` sin acento, espacios de más) |
| Sin DOCUMENTACIÓN / vacía | 50 | — |

Había además 588 rellenos "CARPETA SIN INFORMACIÓN.jpg", que no son un documento. Muchos documentos vivían solo como
adjuntos de AppSheet (`VEHICULOS_Files_`, ligados desde la hoja VEHICULOS), sobre todo pólizas y tenencias.

## Cómo se reconoce cada documento (`tools/nucos/reglas.py`)

El programa nunca abre los archivos. Decide en este orden:

1. **El nombre del archivo, si dice claramente qué es** (`348.- Factura.pdf`). Manda sobre la carpeta, así se acomoda
   lo mal archivado. No aplica bajo carpetas de servicio, verificación, Oxxo Gas, permiso, etc.: el
   `Factura_106.xml` de SERVICIO es la factura de un servicio, no la del vehículo.
2. **La carpeta más cercana que diga qué documento es**, en cualquiera de las tres generaciones. "CARTA FACTURA"
   cuenta como factura, porque en la generación vieja ahí guardaban las facturas.
3. **Tolerancia a errores de dedo** (Damerau-Levenshtein): `RESPONSVIA`, `TENECIA`, `FCATURA`, `CIRUCLACIÓN`,
   `ANTERIRES`… Las palabras cortas (ALTA, TC) se piden exactas, hasta 8 letras se aguanta 1 error y desde 9, 2.
   Excepciones que encontró la medición:
   - `SEGURO` se pide exacto, porque el apellido "SEGURA" se volvía póliza.
   - La tarjeta pide `TARJETA` y `CIRCULACIÓN` juntas, porque un "Permiso circulación" no es la tarjeta.
   - `INTERIOR` no cuenta como "ANTERIOR".

Repetidos (mismo contenido, mismo md5): gana el que ya está en la carpeta del NUCO, que se mueve y no hace falta copiar
nada. Una factura antes que una carta factura.

Se probó si el contenido ayudaba, con el OCR que Drive ya tiene para su buscador: Drive tiene texto del 92% de los
archivos sin nombre útil (PDF casi todos; fotos de WhatsApp, la mitad). Sirve para **confirmar** que un archivo es lo
que dice su carpeta, pero no para **clasificar**: una responsiva menciona "póliza", "placas" y "tarjeta de circulación"
en sus cláusulas. Se dejó fuera.

## La herramienta (`tools/nucos/expediente.py`)

Usa el token de usuario de `tools/migracion` (`autorizar.py lab`, con Drive), con su propia cuota. El de clasp
comparte la cuota con todo el mundo y se agotó al leer.

| Paso | Qué hace |
|---|---|
| `leer-appsheet` | Solo lectura: cada archivo de `VEHICULOS_Files_`, también las versiones viejas, → su NUCO |
| `leer` | Solo lectura: árbol de `1.-DOCUMENTACIÓN` de cada NUCO, la hoja VEHICULOS (sin responsable ni número de empleado), `VEHICULOS_Files_` y lo que registran las hojas de Responsiva y Adherente vehicular. Queda en `tools/nucos/.cache/` (fuera de git) |
| `plan` | Qué archivo va a cuál carpeta de cada NUCO. No toca Drive |
| `excel [archivo]` | Un renglón por vehículo con sus 6 documentos y la liga a cada uno, el detalle archivo por archivo y un resumen |
| `aplicar <carpeta> [--muestra N]` | **Copia** a una carpeta de prueba. No puede escribir dentro de NUCOS ni en la raíz de la app |
| `respaldar <carpeta>` | Copia `1.-DOCUMENTACIÓN` de cada NUCO tal como está |
| `ordenar --nucos … \| --todos` | **En la real**: mueve dentro del mismo NUCO y copia ahí lo de AppSheet y la app |
| `deshacer <bitacora.jsonl>` | Regresa lo que hizo un `ordenar` |
| `verificar` | Solo lectura: que no falte nada de lo de antes ni de AppSheet en su NUCO |
| `crear-nucos --nucos …` | **En la real**: la carpeta de un NUCO que está en la hoja y no en NUCOS VEHICULOS |

Pruebas: `npm run test:nucos-py` (18). Incluyen un Drive simulado que comprueba que `deshacer` deja todo idéntico.

### Por qué mover y no copiar

Mover conserva el **ID** (las ligas siguen abriendo), el **dueño** original, el **historial** de versiones, los
comentarios y con quién está compartido. Copiar crearía archivos nuevos de la cuenta que corre el programa y dejaría
duplicados. Lo de AppSheet y la app sí se **copia**, porque la hoja y la app lo siguen abriendo de su lugar.

Los archivos y carpetas viejas son de otras cuentas (especialista.ci@ y otras): la cuenta que ordena puede moverlos
pero **no borrarlos**. Por eso las carpetas viejas se apartan a `ESTRUCTURA ANTERIOR` en vez de ir a la papelera.

### Candados

- `ordenar` revisa que cada NUCO esté directo en NUCOS VEHICULOS y que cada archivo que mueve esté dentro de ese NUCO.
- Nada sale de su NUCO ni se escribe fuera de NUCOS VEHICULOS. Nada se borra.
- Una carpeta vieja que todavía tenga algo real no se aparta: se queda a la vista.
- `aplicar` y `respaldar` tienen una lista negra (`PROHIBIDOS`): NUCOS VEHICULOS y la raíz de la app.

## Bitácora y deshacer

Cada cambio de `ordenar` se escribe en el momento en `tools/nucos/.cache/bitacoras/<fecha>.jsonl` y, al terminar,
se sube a Drive: Mi unidad > `PRUEBA DE NUCOS VEHICULARES/BITACORAS/`. `deshacer` la recorre al revés:

- lo movido regresa a su carpeta y nombre;
- lo copiado va a la papelera;
- las carpetas creadas van a la papelera si quedaron vacías.

Se probó en real dos veces: los NUCO del piloto regresaron idénticos, elemento por elemento.

Bitácoras del 8-oct-2026. Para deshacer todo, de la más nueva a la más vieja:

| Bitácora | Qué fue |
|---|---|
| `20261008-171920` | Las 6 carpetas y los archivos de AppSheet de los 11 NUCO nuevos |
| `20261008-171840-crear` | Las 11 carpetas de NUCO que no existían |
| `20261008-165647` | Las 489 versiones anteriores de AppSheet (solo copias) |
| `20261008-161618` | Los 4 últimos (156, 159, 160, 235) |
| `20261008-160842` | Los 109 pendientes después del corte |
| `20261008-150505` | La corrida de todos, cortada en 537/637 porque se desconectó la unidad D: |
| `20261008-142832` | El piloto (88, 55, 100, 350, 24) con las reglas corregidas |
| `20261008-141843` | NUCO 88: el relleno dentro de 2.-SEGURO |
| `20261008-141458` | NUCO 88, primera vez |

(`140535` y `142107` se aplicaron y se deshicieron durante el piloto.)

## Cómo se hizo

1. **Inspección y cruce**, solo lectura, contra la hoja VEHICULOS y sus adjuntos.
2. **Copia de prueba** de 30 NUCO en Mi unidad > `PRUEBA DE NUCOS VEHICULARES`.
3. **Excel** con cada NUCO y la liga a cada documento.
4. **Piloto en la real** con 5 NUCO, uno de cada generación y con o sin adherentes. Se deshizo, se corrigieron las
   reglas y se repitió. Lo que encontró el piloto:
   - un repetido que se copiaba de AppSheet en vez de moverse el del NUCO;
   - repetidos que se quedaban en carpetas viejas;
   - una carpeta con espacio de más;
   - la responsiva con error de dedo;
   - la póliza vencida que perdía su subcarpeta.
5. **Respaldo** de `1.-DOCUMENTACIÓN`: quedó **parcial** (~350 NUCO, en `RESPALDO NUCOS VEHICULOS 2026-10-08`).
   Se detuvo para aprovechar la hora de comida.
6. **Los 637.** A los 537 se desconectó la unidad D:, donde vivía el repo. La bitácora quedó completa, se respaldó y
   una segunda corrida terminó los pendientes. Repetir `ordenar` no duplica nada.
7. **Revisión final**, solo lectura: los 637 con una sola `1.-DOCUMENTACIÓN`, las 6 carpetas y nada más que ANTERIORES.
8. **Las versiones anteriores de AppSheet.** La hoja VEHICULOS solo liga la versión vigente de cada responsiva, póliza
   y tenencia, pero AppSheet dejaba las anteriores en `VEHICULOS_Files_` (1,144 responsivas, 411 pólizas, 420
   tenencias). `leer-appsheet` asignó 2,057 de 2,106 a su NUCO, por su nombre exacto en la bitácora CAMBIOS VEHICULOS
   o por la clave con que empieza (ID, ID ANTERIOR, FOLIO). Casi todas ya estaban idénticas en el NUCO; se copiaron
   las 489 que faltaban a `RESPONSIVAS ANTERIORES`, `SEGUROS ANTERIORES` y `TENENCIAS ANTERIORES`
   (`ordenar --todos --solo-copias`, bitácora `20261008-165647`).
9. **Verificación de completitud** (`verificar`, contra la lectura de antes):
   - de los 7,998 archivos que había en las DOCUMENTACIÓN, **0 faltan** y **0 quedaron en otro NUCO**;
   - de los 2,057 de AppSheet asignados, **0 sin su contenido** en su NUCO; igual con lo de la app nueva.
   - Hay 9,303 archivos hoy.
   - Sin lugar: 49 archivos con claves de AppSheet que ya no están en la hoja (algunas, ligadas a dos vehículos en
     la bitácora). Están en `.cache/verificacion.json` para que el área los asigne a mano.
10. **Los 11 NUCO sin carpeta** (96, 99, 257, 269, 272, 273, 643–647), que están en la hoja pero no tenían carpeta en
    NUCOS VEHICULOS. Se les creó con `crear-nucos` (con 2.-/3.-/4.-) y `ordenar` les armó las 6 y les copió sus
    archivos de AppSheet. Ojo: el 647 tiene folio FOL0650.

## Resultado

- Unos 10,400 movimientos (casi 4,000 de ellos, carpetas viejas apartadas en bloque) y más de 800 copias. Ningún
  archivo borrado y ninguno fuera de su NUCO.
- De los 502 vehículos activos con carpeta, después de homologar:

| Documento | Con soporte |
|---|---|
| 1.-FACTURA | 461 (92%) |
| 2.-SEGURO | 296 con póliza + 193 NO APLICA con su imagen (97%) |
| 3.-ALTA DE PLACAS | 353 (70%) |
| 4.-TARJETA DE CIRCULACIÓN | 326 (65%) |
| 5.-RESPONSIVA | 368 (73%) |
| 6.-TENENCIA | 348 (69%) |
| Los 5 obligatorios | 144 |

"Con soporte" quiere decir que existe un archivo en su lugar. No se abrió ninguno para revisar su contenido.

## Pendientes

1. **Que la app guarde directo en el NUCO.** Responsiva y Adherente vehicular hoy guardan su PDF en
   `RESPONSIVAS_VEHICULARES` / `ADHERENTES VEHICULAR`, y los adjuntos de póliza y tenencia caen en `VEHICULOS_Files_`.
   La decisión es jubilar `RESPONSIVAS_VEHICULARES`. Mientras no se cambie, lo nuevo vuelve a caer fuera.
2. Avisar al área del nuevo orden: que no vuelvan a crear las carpetas viejas.
3. Revisar a mano una carpeta con nombre de persona que quedó en `ANTERIORES` del NUCO 350: el programa no supo qué
   documento es.
4. Volver a sacar el Excel leyendo la carpeta ya ordenada. Las ligas del primero siguen sirviendo, porque los archivos
   conservan su ID.
5. El respaldo quedó parcial. Si se quiere completo, ahora saldría con la estructura nueva.
6. Conseguir lo que falta (sobre todo tarjetas de circulación y altas de placas): la pestaña Expediente del Excel dice
   qué le falta a cada unidad.
