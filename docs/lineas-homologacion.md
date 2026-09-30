# Homologar Líneas: el diagnóstico

> ## ⚠️ OJO — el módulo se reestructuró el 30/09/2026, DESPUÉS de este análisis
>
> Hubo junta del área y Emmanuel aplicó los cambios en el libro compartido del equipo
> (`1fC77Uu1ePVUySNvhgWXMHqWpLhGhBMTZZMEblU2nUhI`). **Producción todavía no los tiene**, así
> que este documento sigue describiendo producción — pero hacia dónde va el módulo es otra
> cosa. Lo medido en el libro compartido ese mismo día:
>
> **Se eliminaron 4 pestañas** (el libro pasó de 39 a 35):
> `HISTORIAL_REASIGNACIONES` · `REACTIVACION DE LINEAS` · `SOLICITUD DE LINEAS` ·
> `BITACORA DE DESECHO`
>
> **Se repararon dos columnas de `LINEAS TELEFONICAS`**: la del encabezado `#REF!` ahora se
> llama `NOMBRE RESPONSABLES 2`, y se agregó `COLOR`. De 56 a 58 columnas.
>
> **Se recortaron filas en las hijas**, con datos al día en los dos libros (o sea: no es que
> el compartido esté viejo, se quitaron filas):
> `CAMBIOS LINEAS TELEFONICAS` −1,961 · `INSPECCIONES LINEAS` −170 ·
> `RESPONSIVAS LINEAS` −133.
>
> ### Qué de este documento YA NO APLICA
>
> | Sección | Por qué |
> |---|---|
> | La tabla de "dónde ya existe el vínculo y dónde no" | 3 de sus 6 hojas fueron eliminadas |
> | **Todo el relleno de `ID LINEA` por cascada IMEI → SIM → número** (83%–100%) | describe exactamente esas 3 hojas eliminadas. **No lo implementes.** |
> | La limpieza del encabezado `#REF!` | ya está hecha |
> | Las 15 columnas vacías | el juego de columnas cambió: hay que volver a medirlo |
> | Los conteos de filas y el huérfano `EEBA06A3` | los totales de las hijas cambiaron |
>
> ### Qué SÍ sigue en pie, y se verificó después de la reestructuración
>
> - **`NUCO` sigue siendo llave única**: 1,615 de 1,615, cero repetidas, igual que en
>   producción. Todo el diagnóstico se apoyaba en eso.
> - **El grano de la tabla** (97% son `EQUIPO*`, 39% sin línea) y que `IMEI` nunca cambia.
> - **La clasificación caché/bitácora** de las hojas que quedan.
> - **El análisis contra `COLABORADORES`** y los centinelas.
>
> ### Y lo que hay que arreglar en el código cuando esto llegue a producción
>
> `MIGRACION_REFERENCIAS` tiene **3 entradas apuntando a hojas eliminadas**
> (`HISTORIAL_REASIGNACIONES.ID Linea`, `REACTIVACION DE LINEAS.IMEI`,
> `BITACORA DE DESECHO.ID_EQUIPO`) y `Entidades` tiene **las 4 como migrables**. Hoy eso no
> estorba: el laboratorio y producción conservan las 4 pestañas. Pero el día que se apliquen
> allá, el paso 1 del pipeline va a reportar `FALTA la hoja` cuatro veces y **detenerse** —
> que es lo correcto. **A propósito no se tocó el catálogo todavía**: cambiarlo ahora lo
> dejaría describiendo un libro que no es ni el laboratorio ni producción.

> **Todo lo demás de aquí está medido contra producción el 30/09/2026, en solo lectura.** Se
> lee junto con [ids.md](ids.md) y [relaciones.md](relaciones.md).

## El resumen, por si no lees lo demás

La intuición era que Líneas es el módulo más revoltoso y que ponerle un `ID LINEA` a las
otras hojas no iba a alcanzar. **La segunda parte es correcta; la primera, no.**

| Lo que se temía | Lo que dicen los datos |
|---|---|
| La FK está rota y hay que reconstruirla | **Ya funciona al 99.7%.** `ID LINEA` empareja 1,596/1,599 en Inspecciones, 850/854 en Responsivas y 35,428/35,542 en Cambios |
| No hay identidad estable | **`NUCO` es una llave natural perfecta:** 1,615 valores, 1,615 únicos, 0 vacíos, y **3 cambios en toda la historia** |
| El equipo aparece duplicado | **Cero.** 1,563 IMEIs válidos distintos, ni uno repetido, y **`IMEI` nunca ha cambiado** (0 de 35,542 cambios) |
| Los FOLIO repetidos rompen los joins | 47 FOLIO repetidos en la madre, pero **0 filas** de Reactivación o Solicitud apuntan a alguno |

**Líneas no es el problema difícil de la migración. Es el problema difícil del producto.** Y
eso es una buena noticia, porque significa que se pueden separar: el viernes se migra como
todo lo demás, y el rediseño se hace después, sin prisa.

## Lo que sí está mal: el grano y la historia

### 1. La tabla no es de líneas, es de equipos

`TIPO` ya discrimina, y la distribución lo dice todo:

| `TIPO` | Filas | Con número |
|---|---|---|
| `EQUIPO + SIM` | 860 | 860 |
| `EQUIPO` | **638** | **0** |
| `EQUIPO + SIM BASICO` | 71 | 71 |
| `LINEA` | 31 | 30 |
| `BANDA ANCHA` | 8 | 7 |
| `MODEM` | 6 | 6 |
| `LINEA BASICA` | 1 | 1 |

**1,569 de 1,615 filas (97%) son `EQUIPO*`.** El grano real de la tabla es el **equipo**, y
la línea es un accesorio opcional que se le cuelga: 638 equipos (39%) no tienen ninguna.

Por eso una columna `ID LINEA` no alcanza para ordenar esto — no porque falte la llave, sino
porque **la entidad de la que hablan esas filas no es una línea.**

### 2. Todo lo que define la asignación cambia, y no queda historia

Del log de 35,542 cambios, contando cuántas **líneas distintas** tocó cada campo:

| Campo | Cambios | Líneas afectadas | |
|---|---|---|---|
| `RESPONSABLE` | 3,758 | **1,147 de 1,615 (71%)** | el 71% de las líneas cambió de dueño |
| `ESTATUS EQUIPO` | 2,477 | 1,069 | |
| `ESTATUS LINEA` | 2,562 | 1,048 | |
| `NUMERO SIM` | 1,678 | 955 | |
| `DEPARTAMENTO` | 1,597 | 950 | |
| `NUMERO TELEFONO` | 1,329 | **850 (53%)** | el 53% cambió de número |
| `EQUIPO` | 299 | 232 | |
| **`IMEI`** | **0** | **0** | nunca |
| **`NO EMPLEADO`** | **0** | **0** | nunca |
| **`NUCO`** | **3** | 3 | casi nunca |

Ese contraste es el hallazgo central. **Lo que identifica es estable; lo que describe es
volátil.** Y lo volátil solo existe como un log genérico de `TABLA / CAMPO / ANTES /
DESPUES`, sin la noción de "desde cuándo hasta cuándo".

Dato de apoyo: `RESPONSIVA` tiene **exactamente** los mismos 3,758 cambios que
`RESPONSABLE`. Cada cambio de dueño regenera la responsiva. Es un campo derivado, no un dato.

Y los números cambian de verdad: **279 de 361 reactivaciones (77%) asignan un `NUEVO
NUMERO`**, y 114 solicitudes tienen `NUMERO ANTERIOR ≠ NUMERO ACTUAL`. De 278 números
nuevos, 204 ya están en la hoja madre, así que el flujo sí actualiza al padre — pero deja la
pregunta "¿qué número tenía esta persona en marzo?" sin respuesta salvo reconstruyéndola del
log.

### 3. Las tres entidades que están aplastadas en una fila

| Entidad | Identidad estable que YA existe | Qué se le cuelga |
|---|---|---|
| **EQUIPO** | `IMEI` (0 cambios) y `NUCO` (3) | marca, modelo, color, PIN, patrón, cuenta Google, estatus del equipo |
| **LINEA** | ninguna propia: el número cambia en el 53% | número, SIM, compañía, plan, costo, inicio/fin, estatus de línea |
| **ASIGNACIÓN** | ninguna: solo vive en el log | responsable, no. empleado, puesto, sede, departamento, área, jefe, responsiva |

La **LINEA** es la única que necesita un ID nuevo de verdad, porque su llave natural (el
número) es volátil y 638 equipos no tienen ninguna.

## Lo que se puede limpiar ya, el viernes, sin rediseñar nada

Todo esto es basura medible, no decisiones de modelado:

1. **15 columnas completamente vacías.** `SEGUNDO`, `TERCER`, `CUARTO` y `QUINTO
   RESPONSABLE`, cada uno con su `NOMBRE` y `PUESTO`: **0 filas con dato, las 15.** Es un
   grupo repetido que nunca se usó. Solo se usan `RESPONSABLE` (100%) y `NOMBRE QUIEN USA`
   (178 filas, 11%).
2. **Una columna cuyo encabezado es `#REF!`**, entre `PUESTO QUINTO RESPONSABLE` y
   `PUESTO RESPONSABLES 2`. En el libro de pruebas alguien ya la reparó como
   `NOMBRE RESPONSABLES 2`; en producción sigue rota.
3. **Centinelas, el mismo patrón que en `VEHICULOS`** (ver [relaciones.md](relaciones.md)):
   - `NUMERO TELEFONO = 'NO APLICA'` en **638 filas** — significa "este equipo no tiene línea"
   - `IMEI` con `N/A` ×25, `TELCEL` ×10, `0` ×6, `SOLO LINEA` ×3, `NA` ×2 — 46 celdas
   
   Si Líneas algún día tiene columnas copiadas, estos valores tienen que entrar a
   `CENTINELAS` en `Relaciones.gs`, o propagarlos pisaría datos buenos.
4. **Un padre borrado con 25 hijos huérfanos.** `EEBA06A3` no existe en la hoja madre y le
   apuntan 3 inspecciones, 4 responsivas y 18 cambios.
5. **48 filas de `RESPONSIVAS LINEAS` sin `ID LINEA`** (de 902). No son huérfanas: están
   vacías.
6. **Tres vocabularios en la columna `ID` de la hoja madre**: 826 con formato de AppSheet
   (8 hex), **778 con formato `DV1SD###`** y 11 con otra cosa (`DG001`). La migración les va
   a poner un `LIN-…` uniforme, pero conviene saber que el "id de AppSheet" de esta hoja no
   siempre lo generó AppSheet.

## Lo básico SÍ se puede hacer ya: el ID y la sincronización

Esta es la parte que no necesita esperar al rediseño.

### Dónde ya existe el vínculo, y dónde no

| Hoja | Vínculo hoy | Estado |
|---|---|---|
| `INSPECCIONES LINEAS` | `ID LINEA` | **listo**, 1,596/1,599 emparejan |
| `RESPONSIVAS LINEAS` | `ID LINEA` | **listo**, 850/854 (48 filas lo traen vacío) |
| `CAMBIOS LINEAS TELEFONICAS` | `ID_LINEA` | **listo**, 35,428/35,542 |
| `REACTIVACION DE LINEAS` | **ninguno** | su `FOLIO` es `1, 2, 3, 4…`: un contador, no una referencia |
| `SOLICITUD DE LINEAS` | **ninguno** | igual |
| `BITACORA DE DESECHO` | **ninguno** | su `ID_EQUIPO` y `FOLIO EQUIPO` no emparejan con nada de la madre (0%) |

> **Corrección a una lectura anterior de este análisis:** se dijo que "0 filas de
> Reactivación o Solicitud apuntan a un FOLIO ambiguo". Es cierto, pero engañoso: **no
> apuntan a ninguno**. El `FOLIO` de la hoja madre es `EQP0179`, `EQS1001`…, y el de esas dos
> hojas es un consecutivo propio. Son vocabularios distintos.

### El vínculo se puede rellenar, por cascada IMEI → SIM → número

Medido contra la hoja madre:

| Hoja | por `IMEI` | por `SIM` | por número | **cualquiera** |
|---|---|---|---|---|
| `BITACORA DE DESECHO` | **228/228 (100%)** | — | — | **100%** |
| `SOLICITUD DE LINEAS` | 199/205 (97%) | 154/207 (74%) | 127/204 (62%) | **206/229 (90%)** |
| `REACTIVACION DE LINEAS` | 28/358 (8%) | 250/353 (71%) | 204/278 (73%) | **301/361 (83%)** |

El orden de la cascada no es arbitrario: **`IMEI` nunca cambia y no tiene duplicados**, así
que es el vínculo más confiable; el `SIM` y el número cambian, así que van después. Lo que no
empareje se deja **vacío y reportado**, nunca adivinado.

`REACTIVACION` sale baja por IMEI porque casi no lo captura (28 de 358), no porque el dato
esté mal.

### Y la sincronización: resulta que casi no hay nada que sincronizar

Las hijas copian **mucho** de la madre — `INSPECCIONES LINEAS` y `RESPONSIVAS LINEAS` traen
unas 16 columnas cada una (NUCO, RESPONSABLE, DEPARTAMENTO, AREA, SEDE, PUESTO, No TELEFONO,
IMEI, SIM, MODELO, COMPAÑIA, RAZON SOCIAL…). Pero **todas las hijas de `LINEAS TELEFONICAS`
son bitácoras**, no cachés:

| Hoja | Por qué es bitácora |
|---|---|
| `INSPECCIONES LINEAS` | inspección fechada, con firmas y PDF |
| `RESPONSIVAS LINEAS` | documento **firmado**: dice quién recibió qué ese día |
| `REACTIVACION DE LINEAS` | evento con `FECHA DE SUSPENSION` y `FECHA DE REACTIVACION` |
| `SOLICITUD DE LINEAS` | evento con `FECHA DE SOLICITUD` y `FECHA DE ENTREGA` |
| `CAMBIOS LINEAS TELEFONICAS` | el log mismo |
| `BITACORA DE DESECHO` | lo dice su nombre |

Así que la regla de [relaciones.md](relaciones.md) aplica entera: **se reportan, no se
corrigen.** Es lo contrario de Vehículos, donde 3 de 5 hijas sí eran cachés. En Líneas, el
trabajo es **poner el vínculo**, no propagar datos.

Sincronizar una responsiva firmada sería, literalmente, alterar un documento firmado.

### La única sincronización real de Líneas apunta hacia otro lado

No es madre → hijas. Es **`COLABORADORES` → `LINEAS TELEFONICAS`**: los datos de la persona
que trae la línea (departamento, puesto, área, sede) pertenecen al catálogo de personas.

Medido, y aquí hay que frenar antes de sincronizar nada:

- **Solo 709 de 1,615 líneas (44%)** tienen un `NO EMPLEADO` que exista en `COLABORADORES`.
  Las otras 906 apuntan a alguien que no está en el catálogo — probablemente ex-empleados, o
  líneas asignadas a algo que no es una persona (una oficina, un módem, un vehículo).
- Y donde sí emparejan, el desacuerdo es grande:

| Columna | Iguales | Distintos |
|---|---|---|
| `SEDE` | 177 | **532** |
| `AREA` | 489 | 220 |
| `PUESTO` | 599 | 110 |
| `DEPARTAMENTO` | 661 | 48 |

**El 75% de las sedes no coincide.** Eso es demasiado para ser deriva, y probablemente
significa que las dos columnas miden cosas distintas: la sede del **equipo** contra la sede
donde **trabaja** la persona. Antes de sincronizar esa columna hay que preguntarlo — si
resulta que sí es deriva, `COLABORADORES` manda; si son cosas distintas, la columna de
`LINEAS` no es una copia y hay que renombrarla.

`RESPONSABLE`, `JEFE DIRECTO`, `DIRECTOR` y `RAZON SOCIAL` **no existen en `COLABORADORES`**
(que solo tiene `NOMBRE COMPLETO`), así que esas no son copias de nadie.

### Probado contra `COLABORADORES ACTUALIZADO`: no mejora, y eso es la respuesta

En el laboratorio hay un catálogo nuevo, `COLABORADORES ACTUALIZADO`: **15,229 filas y 26
columnas** contra las 3,627 y 8 del viejo, e incluye justo las que faltaban (`DIRECTOR`,
`JEFE DIRECTO`, `RAZON SOCIAL`, `TELEFONO`, `STATUS`, `FECHA DE BAJA`,
`N. EMPLEADO ANTERIOR`). Parecía la solución al 44%. **No lo es:**

| | Emparejan | |
|---|---|---|
| `COLABORADORES` (viejo) | 709 | 44% |
| `COLABORADORES ACTUALIZADO` | 729 | 45% |
| + rescate por `N. EMPLEADO ANTERIOR` | **732** | **45%** |

**+23 líneas.** Y no es porque al catálogo le falte gente: tiene **14,236 números de empleado
únicos**, casi cuatro veces el viejo. El problema es la columna `NO EMPLEADO` de
`LINEAS TELEFONICAS`.

De las 886 líneas que no emparejan:

| Qué dice la celda | Filas | |
|---|---|---|
| `NO SE ENCUENTRA EN CH` | **596** | alguien escribió "no está en Capital Humano" **dentro** del campo |
| `N/A` | 168 | |
| `-` | 11 | |
| **Subtotal: texto, no un número** | **775** | **87% de las fallas** |
| `AC01553 / AC01935`, `AC02531 / AC02919 / AC00707 / IPQ01103`… | ~111 | **varias personas en una celda**, separadas por " / " |

Ningún catálogo puede arreglar eso. Las 775 son captura, y las ~111 multivaluadas son el
modelo: una línea compartida entre varias personas necesita **un renglón por asignación**, no
una celda con diagonales. Es el mismo problema que el grupo repetido de `SEGUNDO
RESPONSABLE`, resuelto a mano y peor.

El rescate por nombre tampoco sirve: de las 886, solo **8 (1%)** tienen su `RESPONSABLE` en
el catálogo. Y se entiende viendo qué traen esas filas en esa columna: `DS0054`,
`PV-1007 (08/04/2026)` — códigos y fechas donde debería ir un nombre.

### Qué columnas SÍ se pueden sincronizar desde el catálogo

Donde el vínculo existe, es correcto: `RESPONSABLE` contra `NOMBRE COMPLETO` coincide en
**98%**. La persona está bien identificada. Pero no todas las columnas se comportan igual:

| Columna de `LINEAS` | De acuerdo (catálogo nuevo) | Veredicto |
|---|---|---|
| `RESPONSABLE` ← `NOMBRE COMPLETO` | **98%** | sincronizable |
| `DEPARTAMENTO` | **93%** | sincronizable |
| `PUESTO` | 83% | probablemente |
| `AREA` | 68% | revisar antes |
| `OFICINA / DESARROLLO` | 61% | revisar antes |
| `DIRECTOR` | 45% | no |
| `JEFE DIRECTO` | 39% | no |
| **`SEDE`** | **25%** | **no: significan cosas distintas** |
| **`RAZON SOCIAL`** | **8%** | **no: significan cosas distintas** |

**`SEDE` siguió en 25% con el catálogo nuevo**, igual que con el viejo. Eso descarta que sea
un catálogo viejo: es una diferencia de significado. Lo mismo `RAZON SOCIAL` con 8% — casi
seguro la empresa del **contrato de la línea** contra la empresa que **nomina** a la persona,
el mismo patrón que ya se documentó en `HOLOGRAMAS`.

> **Al indexar el catálogo nuevo hay que elegir renglón:** tiene **993 números de empleado
> repetidos** y **11,941 filas en `STATUS = BAJA`** contra 3,288 activas. La medición de
> arriba prefiere la fila `ACTIVO` cuando hay varias. Sin esa regla, una línea puede acabar
> copiando el puesto que la persona tenía en un empleo anterior.

## La recomendación

**Para el viernes: tratar Líneas como todo lo demás.** Asignarle `LIN-…` con `NUCO` como
llave natural para emparejar —es perfecta— y hacer las 6 limpiezas de arriba. No tocar el
modelo.

Se puede hacer con confianza justamente por lo que midió este análisis: la FK está sana y la
identidad ya existe. No hay nada que reconstruir a las prisas.

**Después, como proyecto aparte:** partir la hoja en `EQUIPOS`, `LINEAS` y
`ASIGNACIONES_LINEAS`, y decidir qué hacer con los 35,542 cambios. Ahí hay una decisión de
negocio que no se contesta con datos: **¿hace falta poder responder "quién tenía esta línea
en marzo"?**

- Si **sí**, el log se puede reproducir para construir el histórico de asignaciones. Es
  factible —trae `ANTES`, `DESPUES` y fecha— pero es un proyecto en sí.
- Si **no**, basta con dejar de aplastar las tres entidades de hoy en adelante, y el log se
  archiva tal como está.

## Lo que no medí

- **La distribución de los cambios en el tiempo.** El formato de `FECHA ACTUALIZACION` rompió
  mi parseo y preferí no reportar números inventados. Serviría para saber si la volatilidad
  es de siempre o de una temporada.
- **Si `NUCO` es el mismo universo que el `NUCCO` de `VEHICULOS`.** Se llaman casi igual y
  las dos son únicas; si comparten numeración, hay un inventario global que ninguna de las
  dos hojas declara.
- **Qué hay en las dos columnas sin encabezado de `CAMBIOS LINEAS TELEFONICAS`** (la A trae
  el id del renglón; la C trae números como `0` y `935`, y no sé qué son).
