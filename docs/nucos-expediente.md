# Expediente por NUCO (NUCOS VEHICULOS)

La carpeta de Drive **NUCOS VEHICULOS** (`1pgEmrDM58FuALsfzBzckC9ROz941HR9P`, dueño controlinterno@) tiene una
carpeta por NUCO. Cada una trae `1.-DOCUMENTACIÓN`, `2.- SERVICIOS`, `3.- VERIFICACIONES` y `4.- INSPECCIONES`.

El 8-oct-2026 se hizo esto:

- **Se ordenó `1.-DOCUMENTACIÓN`** de todos los NUCO a una sola estructura. Las otras tres carpetas no se tocaron.
- **Se juntaron ahí las dos fuentes de documentos:**
  - lo que el área subía a la carpeta de cada NUCO;
  - lo que AppSheet guardaba como adjunto de la hoja VEHICULOS (`VEHICULOS_Files_`), **incluidas las versiones
    anteriores** que la hoja ya no liga, y lo que registra la app nueva.
- Ahora son **648 NUCO**: los 637 que había más 11 que estaban en la hoja sin carpeta.

Es el mismo enfoque por NUCO que NUCOS TELEFÓNICOS, aunque por dentro varían.

## La estructura (junta del 8-oct-2026)

```
<NUCO>/1.-DOCUMENTACIÓN/
   1.-FACTURA                   la factura (el XML, si existe, es el original electrónico)
   2.-SEGURO                    la póliza vigente; si el seguro NO APLICA, la imagen de inexistente
      SEGUROS ANTERIORES/       pólizas viejas de AppSheet
   3.-ALTA DE PLACAS            el documento estatal: alta, baja, canje o sustitución
   4.-TARJETA DE CIRCULACIÓN
   5.-RESPONSIVA                la vigente directo ahí
      RESPONSIVAS ANTERIORES/   las demás (de la carpeta y de AppSheet)
      ADHERENTES/               corresponsabilidades (F-CI01-047), con sus variantes adentro
   6.-TENENCIA                  ya no se carga; sirve para mostrar que no debe tenencia
      TENENCIAS ANTERIORES/     tenencias viejas de AppSheet
   ANTERIORES/                  lo que no es ninguno de los 6 (Oxxo Gas, verificaciones, permisos…), con su ruta de antes
      REPETIDOS/                copias idénticas de algo que ya está en las 6
      ESTRUCTURA ANTERIOR/      las carpetas viejas que quedaron vacías o solo con el relleno
```

- **Nombre de los archivos:** `DOCUMENTO-NNNN.ext` (`FACTURA-0088.pdf`). Si hay varios en la misma carpeta, el más
  reciente se queda sin fecha y los demás llevan la fecha (`FACTURA-0088 2025-06-18.pdf`) o `(2)`, `(3)`. Los
  adherentes se llaman `ADHERENTE-NNNN`.
- **Las subcarpetas con significado se conservan:** `2.-SEGURO/SEGURO VENCIDO/`, `TENENCIA 2023/`… Lo que hay adentro
  no compite por ser el documento vigente.
- **Seguro NO APLICA:** si la hoja VEHICULOS dice `NO APLICA` y no hay póliza, se pone la misma imagen
  "CARPETA SIN INFORMACIÓN.jpg" de siempre, renombrada `SEGURO-NNNN NO APLICA.jpg`.

## De dónde sale cada documento

| Fuente | Qué es | Cómo llega al NUCO |
|---|---|---|
| **La carpeta del NUCO** | Lo que el área subía a NUCOS VEHICULOS, en cualquiera de las tres generaciones de carpetas | Se **mueve** dentro de su mismo NUCO: conserva ID, dueño e historial |
| **AppSheet, versión vigente** | El adjunto que la hoja VEHICULOS liga hoy (`POLIZA SEGURO`, `ARCHIVO TENENCIA`, `RESPONSIVA`, `DOCUMENTO BAJA`) | Se **copia**: la hoja lo sigue abriendo de `VEHICULOS_Files_` |
| **AppSheet, versiones anteriores** | Al subir un archivo nuevo, AppSheet dejaba el anterior en `VEHICULOS_Files_` | Se **copia** a las subcarpetas de anteriores |
| **La app nueva** | Lo que registran las hojas RESPONSIVA VEHICULAR y ADHERENTE VEHICULAR, y lo que sube Vehículos (`VEH-…_POLIZA_SEGURO_….pdf`) | Se **copia** |

Si un archivo de AppSheet es idéntico (mismo md5) a uno que ya está en el NUCO, no se copia.

Un archivo de AppSheet se asigna a su NUCO por **su nombre exacto** en las pestañas del libro, sobre todo en la
bitácora CAMBIOS VEHICULOS, que guardaba la ruta junto al folio. Si no aparece ahí, se usa **la clave con que empieza
el nombre** (`refwf240.RESPONSIVA…`, `AUT0643.POLIZA…`, `VEH-…_POLIZA…`), que es el ID, ID ANTERIOR o FOLIO del
vehículo. Así se asignaron 2,057 de 2,106.

**Lo que no entra:**
- Los PDF que la app generó y su hoja no registra (en `RESPONSIVAS_VEHICULARES` y `ADHERENTES VEHICULAR`): casi
  todos son pruebas del 5-oct.
- Los PDF de inspección, que van a `4.- INSPECCIONES` y no se tocaron.
- Los 49 archivos de AppSheet sin vehículo (ver Pendientes).

## Cómo estaba antes

Convivían tres generaciones de carpetas dentro de `1.-DOCUMENTACIÓN`:

| Generación | NUCO | Cómo era |
|---|---|---|
| La más vieja | 261 | Una subcarpeta `DOCUMENTOS` con 13 numeradas (contrato, carta factura, póliza, permiso provisional, Oxxo Gas, QR…) |
| Intermedia | 214 | 10–11 carpetas (Factura, Seguro, Permiso, Alta, Tarjeta, Oxxo Gas, Evidencia, Tenencia, Responsiva, Guía de servicio) |
| La de 6 | 112 | Ya con las 6, pero con nombres variados (`5.- CARTA RESPONSIVA`, `CIRCULACION` sin acento, espacios de más) |
| Sin DOCUMENTACIÓN / vacía | 50 | — |
| Sin carpeta en NUCOS | 11 | Estaban en la hoja (96, 99, 257, 269, 272, 273, 643–647) |

Había además 588 rellenos "CARPETA SIN INFORMACIÓN.jpg", que no son un documento. `VEHICULOS_Files_` tenía 2,106
archivos (1,144 responsivas, 411 pólizas, 420 tenencias, 24 bajas…), y la hoja solo ligaba la versión vigente de cada uno.

## Cómo se reconoce cada documento (`tools/nucos/reglas.py`)

El programa nunca abre los archivos. Decide en este orden:

1. **El nombre del archivo, si dice claramente qué es** (`348.- Factura.pdf`). Manda sobre la carpeta, así se acomoda
   lo mal archivado. No aplica bajo carpetas de servicio, verificación, Oxxo Gas, permiso, etc.: el
   `Factura_106.xml` de SERVICIO es la factura de un servicio, no la del vehículo.
2. **La carpeta más cercana que diga qué documento es**, en cualquiera de las tres generaciones. "CARTA FACTURA"
   cuenta como factura, porque en la generación vieja ahí guardaban las facturas.
3. **Tolerancia a errores de dedo** (Damerau-Levenshtein): `RESPONSVIA`, `TENECIA`, `FCATURA`, `CIRUCLACIÓN`,
   `ANTERIRES`… Las palabras cortas (ALTA, TC) se piden exactas; hasta 8 letras se aguanta 1 error y desde 9, 2.
   Excepciones que encontró la medición sobre todos los NUCO:
   - `SEGURO` se pide exacto, porque el apellido "SEGURA" se volvía póliza.
   - La tarjeta pide `TARJETA` y `CIRCULACIÓN` juntas, porque un "Permiso circulación" no es la tarjeta.
   - `INTERIOR` no cuenta como "ANTERIOR".

En los repetidos (mismo md5) gana el que ya está en la carpeta del NUCO, que se mueve y no hace falta copiar nada. Una
factura gana antes que una carta factura.

Se probó si el contenido ayudaba, con el OCR que Drive ya tiene para su buscador: Drive tiene texto del 92% de los
archivos sin nombre útil (casi todos los PDF; de las fotos de WhatsApp, la mitad). Sirve para **confirmar** que un
archivo es lo que dice su carpeta, pero no para **clasificar**: una responsiva menciona "póliza", "placas" y "tarjeta
de circulación" en sus cláusulas. Se dejó fuera.

## La herramienta (`tools/nucos/expediente.py`)

Usa el token de usuario de `tools/migracion` (`autorizar.py lab`, con Drive), con su propia cuota. El de clasp
comparte la cuota con todo el mundo y se agotó al leer.

| Paso | Qué hace |
|---|---|
| `leer` | Solo lectura: árbol de `1.-DOCUMENTACIÓN` de cada NUCO, la hoja VEHICULOS (sin responsable ni número de empleado), `VEHICULOS_Files_` y lo que registran las hojas de Responsiva y Adherente vehicular. Queda en `tools/nucos/.cache/` (fuera de git) |
| `leer-appsheet` | Solo lectura: cada archivo de `VEHICULOS_Files_`, también las versiones viejas, → su NUCO |
| `plan` | Qué archivo va a cuál carpeta de cada NUCO. No toca Drive |
| `excel [archivo]` | Un renglón por vehículo con sus 6 documentos y la liga a cada uno, el detalle archivo por archivo y un resumen |
| `aplicar <carpeta> [--muestra N]` | **Copia** a una carpeta de prueba. No puede escribir dentro de NUCOS ni en la raíz de la app |
| `respaldar <carpeta>` | Copia `1.-DOCUMENTACIÓN` de cada NUCO tal como está |
| `crear-nucos --nucos …` | **En la real**: la carpeta de un NUCO que está en la hoja y no en NUCOS VEHICULOS |
| `ordenar --nucos … \| --todos [--solo-copias]` | **En la real**: mueve dentro del mismo NUCO y copia ahí lo de AppSheet y la app. Con `--solo-copias` no revisa los movimientos |
| `deshacer <bitacora.jsonl>` | Regresa lo que hizo un `ordenar` o un `crear-nucos` |
| `verificar` | Solo lectura: que no falte nada de lo de antes ni de AppSheet en su NUCO |

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
- Si un nombre choca con otro archivo distinto, no se pisa: entra con `(2)`.
- `aplicar` y `respaldar` tienen una lista negra (`PROHIBIDOS`): NUCOS VEHICULOS y la raíz de la app.

## Bitácora y deshacer

Cada cambio se escribe en el momento en `tools/nucos/.cache/bitacoras/<fecha>.jsonl` y, al terminar, se sube a Drive:
Mi unidad > `PRUEBA DE NUCOS VEHICULARES/BITACORAS/`. `deshacer` la recorre al revés:

- lo movido regresa a su carpeta y nombre;
- lo copiado va a la papelera;
- las carpetas creadas van a la papelera si quedaron vacías.

Se probó en real dos veces: los NUCO del piloto regresaron idénticos, elemento por elemento.

Bitácoras vigentes del 8-oct-2026. Para deshacer todo, de la más nueva a la más vieja:

| Bitácora | Qué fue |
|---|---|
| `20261008-171920` | La `1.-DOCUMENTACIÓN` y los archivos de AppSheet de los 11 NUCO nuevos |
| `20261008-171840-crear` | Las 11 carpetas de NUCO que no existían |
| `20261008-165647` | Las 489 versiones anteriores de AppSheet (solo copias) |
| `20261008-161618` | Los 4 últimos (156, 159, 160, 235) |
| `20261008-160842` | Los 109 pendientes después del corte |
| `20261008-150505` | La corrida de todos, cortada en 537/637 porque se desconectó la unidad D: |
| `20261008-142832` | El piloto (88, 55, 100, 350, 24) con las reglas corregidas |
| `20261008-141843` | NUCO 88: el relleno dentro de 2.-SEGURO |
| `20261008-141458` | NUCO 88, primera vez |

(`140535` y `142107` se aplicaron y se deshicieron durante el piloto.) Entre todas suman 11,227 movimientos y
renombres (incluidas las carpetas viejas apartadas), 1,320 copias y 6,377 carpetas creadas.

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
7. **Revisión de estructura**, solo lectura: los 637 con una sola `1.-DOCUMENTACIÓN`, las 6 carpetas y nada más que
   ANTERIORES.
8. **Las versiones anteriores de AppSheet.** `leer-appsheet` asignó 2,057 de 2,106 archivos a su NUCO. Casi todos ya
   estaban idénticos en el NUCO (el área también los subía ahí). Se copiaron los 489 que faltaban (343 responsivas,
   73 tenencias, 72 pólizas) con `ordenar --todos --solo-copias`.
9. **Los 11 NUCO sin carpeta.** Se les creó con `crear-nucos` (con 2.-/3.-/4.-), y `ordenar` les armó las 6 y les
   copió sus archivos de AppSheet (15).
10. **Verificación de completitud** (`verificar`, contra la lectura de antes de empezar).

## Resultado

**Verificación de completitud:**

| Revisión | Resultado |
|---|---|
| Archivos que había en las `1.-DOCUMENTACIÓN` antes | 7,998 |
| De esos, cuántos faltan (borrados, en la papelera o fuera de DOCUMENTACIÓN) | **0** |
| De esos, cuántos quedaron en otro NUCO | **0** |
| Archivos de AppSheet asignados a un NUCO | 2,057 de 2,106 |
| De esos, cuántos no tienen su contenido (md5) en su NUCO | **0** |
| Documentos de la app nueva sin su contenido en su NUCO | **0** |
| Archivos en las `1.-DOCUMENTACIÓN` hoy | 9,318 |

**Cobertura de los 507 vehículos activos** (UTILITARIO y NO UTILITARIO):

| Documento | Con soporte |
|---|---|
| 1.-FACTURA | 461 (91%) |
| 2.-SEGURO | 316 con póliza + 191 NO APLICA con su imagen (99%)¹ |
| 3.-ALTA DE PLACAS | 353 (70%) |
| 4.-TARJETA DE CIRCULACIÓN | 326 (64%) |
| 5.-RESPONSIVA | 372 (73%) |
| 6.-TENENCIA | 357 (70%) |
| Los 5 obligatorios | 145 |

¹ En 24 de los 316, la única póliza es una versión anterior de AppSheet (en `SEGUROS ANTERIORES`): puede estar vencida.

"Con soporte" quiere decir que existe un archivo en su lugar. No se abrió ninguno para revisar su contenido.

## Pendientes

1. **Que la app guarde directo en el NUCO.** Responsiva y Adherente vehicular hoy guardan su PDF en
   `RESPONSIVAS_VEHICULARES` / `ADHERENTES VEHICULAR`, y los adjuntos de póliza y tenencia caen en `VEHICULOS_Files_`.
   La decisión es jubilar `RESPONSIVAS_VEHICULARES`. Mientras no se cambie, lo nuevo vuelve a caer fuera del NUCO.
2. **Los 49 archivos de AppSheet sin vehículo** (29 responsivas, 18 tenencias, 1 póliza y otro archivo, con 35 claves
   como `refwf07` o `5a1dbf78`). Sus claves ya no están en la hoja y algunas aparecen en la bitácora ligadas a dos
   vehículos. Que el área los asigne; la lista está en `.cache/verificacion.json`.
3. **El NUCO 647 tiene folio FOL0650**, que no coincide con el NUCO.
4. Revisar a mano la carpeta "350.-JOSUE DE JESUS BACELIS ROMERO" en `ANTERIORES` del NUCO 350: el programa no supo
   qué documento es. Hay una responsiva de la misma persona en el NUCO 269: puede ser de ese vehículo.
5. Avisar al área del nuevo orden: que no vuelvan a crear las carpetas viejas.
6. Volver a sacar el Excel leyendo la carpeta ya ordenada. Las ligas del primero siguen sirviendo, porque los archivos
   movidos conservan su ID.
7. El respaldo quedó parcial. Si se quiere completo, ahora saldría con la estructura nueva.
8. Conseguir lo que falta (sobre todo tarjetas de circulación y altas de placas): la pestaña Expediente del Excel dice
   qué le falta a cada unidad.
