# Relaciones entre hojas (datos copiados)

> **Estado (29/09/2026): construido y conectado, con una red de seguridad apagada.**
>
> | Pieza | Estado |
> |---|---|
> | `MAPA`, `propagar`, `datosParaNuevo`, `revisar`, `cambiarClave` | hechas, en `src/services/Relaciones.gs` |
> | `propagar` conectado a editar un vehículo | sí, `src/services/VehiculosService.gs:313` |
> | Columnas copiadas no editables en los módulos que copian | sí (ver [reglas](#reglas-para-desarrollar-mientras-tanto)) |
> | `datosDeVehiculo_` temporales reemplazadas por `datosParaNuevo` | **no**, siguen las de cada Service |
> | `revisar({corregir:true})` corrido alguna vez | **no** |
> | Activador nocturno que lo corra solo | **no existe** — hay que crearlo a mano en el editor |
>
> **Que funciona no es teoría.** Medido en producción el 29/09/2026, solo lectura:
> `INSTALACION DE SENSORES` —el módulo que sí pasa por `propagar`— tiene **0 desacuerdos
> de `DEPARTAMENTO` en 208 filas** contra el catálogo.
>
> **Léase junto con [ids.md](ids.md).** Casi todo lo de aquí existe porque las hojas se
> unen por `FOLIO`, que es un dato que cambia. Con el modelo de IDs puesto, propagar deja
> de hacer falta para las llaves; lo que sigue sirviendo es `revisar()`, para las columnas
> que se copian por comodidad de lectura.

## El problema

Varias hojas guardan una **copia** de datos que pertenecen a otra hoja. Ejemplo:
`PLACA` vive en `VEHICULOS`, pero también está escrita en `INSTALACION DE SENSORES`
y en `VERIFICACIONES`. Si alguien cambia la placa en Vehículos, las copias se
quedan con la placa vieja.

En una base de datos se resolvería guardando solo el `FOLIO` y consultando la placa
cuando se necesite. Aquí **no se puede todavía**: AppSheet sigue leyendo esas hojas y
espera ver los datos escritos en cada una. Por eso la solución es mantener las copias,
pero **controladas desde un solo lugar**.

## La solución: `src/services/Relaciones.gs`

Un archivo que sabe qué hojas copian datos de cuáles y mantiene esas copias iguales al
original. Los módulos no copian datos por su cuenta: le piden a `Relaciones`.

### Principio: un solo dueño por dato

- `VEHICULOS` es dueña de PLACA, SERIE, MARCA, LÍNEA, etc.
- En cualquier otra hoja esas columnas son **copias**: en la app **no se editan**
  (se muestran como solo lectura).

### Principio: la llave es la SERIE (el VIN), no el folio

El folio es un número interno que se puede reasignar. La serie es la identidad física de la
unidad: no cambia mientras el vehículo exista. Por eso el `MAPA` empareja por
`SERIE VEHICULO` en las tres hojas que tienen la columna.

| Hoja copia | Se empareja por | Columna en la copia |
|---|---|---|
| `INSTALACION DE SENSORES` | `SERIE VEHICULO` | `SERIE VEHICULO` |
| `HOLOGRAMAS` | `SERIE VEHICULO` | `SERIE VEHICULO` |
| `INSPECCION VEHICULAR` | `SERIE VEHICULO` | `NO SERIE` |
| `VERIFICACIONES` | `FOLIO` | `FOLIO VEHICULO` |
| `INCIDENCIAS` | `FOLIO` | `FOLIO` |

**El cambio no movió ni una fila.** Medido en producción el 30/09/2026 antes de hacerlo:
las dos llaves dan el **mismo** vehículo en las 207 filas de Sensores y las 298 de
Inspección que emparejan. **0 filas cambiarían de vehículo.** Sin esa comprobación el
cambio habría sido a ciegas: una llave nueva que apunte a otro renglón propaga datos
ajenos.

#### La placa NO se usa de llave

Parece la llave natural y es la peor de las tres:

| Llave | Con dato real | Únicas | Relleno | Choques sin filtrar |
|---|---|---|---|---|
| `FOLIO` | 648 | 648 | 0 | 0 |
| `SERIE VEHICULO` | 637 | 637 | 11 | 10 |
| `PLACA` | **421** | 421 | **227** | **224** |

De las 648 celdas de `PLACA`, **227 no son una placa sino texto**: `SIN PLACA` ×101,
`BAJA VEHICULAR` ×84, `BAJA DE PLACA` ×42 (y ni una celda vacía — el relleno ocupa el lugar
del hueco). Tomada tal cual, 224 filas caerían sobre la llave de otra: 101 vehículos
distintos se fundirían en uno solo. `SIN PLACA` y `BAJA DE PLACA` están en `CENTINELAS`
bajo la llave `'PLACA'` para que tampoco se propaguen.

#### Las dos que se quedan con el folio, y por qué

- **`VERIFICACIONES` no tiene columna de serie.** Emparejar por placa acertaría 333 de sus
  426 filas (78%) contra 426 (100%) por folio. Moverla requiere **agregarle la columna**, y
  agregar columnas rompe AppSheet hasta que alguien regenere el esquema (ver
  [ids.md](ids.md)).
- **`INCIDENCIAS` no tiene ni serie ni placa.** El folio es su única llave posible.

#### Lo que el cambio de llave arrastró

`FOLIO` dejó de ser llave en Sensores, así que pasó a ser **un atributo copiado más** —
está en `columnas` y la corrida nocturna lo mantiene al día. Y `cambiarClave()` tuvo que
aprender a propagarlo: antes solo reescribía la llave en las copias que emparejan por ella,
así que cambiar un folio habría dejado esa columna con el valor viejo hasta la noche.

`datosParaNuevo()` **cambió de contrato**: ahora recibe la serie, no el folio, para las tres
hojas que emparejan por serie. Hoy nadie la llama en producción (`SensoresService` y
`HologramasService` siguen con sus funciones temporales), así que no rompe nada — pero hay
que tenerlo presente al reemplazarlas.

> **A dónde va esto:** la llave definitiva es `ID_VEHICULO` (ver [ids.md](ids.md)). La serie
> es el paso intermedio correcto mientras las copias no tengan la columna del ID nuevo.

### Principio: una copia es un caché o es una bitácora, y se tratan al revés

Esto es lo que más fácil se hace mal, y hacerlo mal **borra datos buenos**. Cada entrada
del `MAPA` declara su `tipo`:

| `tipo` | Qué guarda la copia | Si el dueño cambia | Ejemplos |
|---|---|---|---|
| `cache` | el estado de **HOY** | la copia está vieja → **se pisa** | `INSTALACION DE SENSORES`, `HOLOGRAMAS`, `VERIFICACIONES` |
| `bitacora` | el estado del **día de un evento fechado** | la copia está **correcta** → solo se reporta | `INSPECCION VEHICULAR`, `INCIDENCIAS` |

Una instalación de sensor describe al vehículo tal como es ahora: si el vehículo pasa de
CONSTRUCCIÓN a POST VENTA, la instalación quedó vieja y hay que corregirla. Una inspección
del año pasado dice *a qué área se le revisó ese carro ese día*: si el vehículo cambió de
área después, la inspección **no** quedó vieja — y sobrescribirla borraría la evidencia de
a quién se le había entregado la unidad. Es la misma columna, `DEPARTAMENTO`, y la regla
es opuesta.

`propagar()` salta las bitácoras. `revisar()` las lee y reporta la diferencia con el tipo
`DIFERENCIA_HISTORICA` en `LOG_RELACIONES`, pero **nunca la corrige, ni con
`corregir:true`**. Están en el `MAPA` a propósito: para que quede escrito que se decidió
congelarlas, y no parezca que se olvidaron.

Dos consecuencias que parecen contradicciones y no lo son:

- **`datosParaNuevo()` sí copia a una bitácora.** Al dar de alta la inspección, el valor de
  hoy *es* el del día del evento. Congelarlo es justo lo que se quiere.
- **`cambiarClave()` sí toca a una bitácora.** Lo que cambia ahí es la **clave**, no un
  atributo: si el `FOLIO` de una inspección vieja no sigue al vehículo, la inspección se
  vuelve huérfana y se pierde de qué unidad era. La bitácora congela el atributo, no el
  vínculo.

### Principio: un centinela no se propaga

Cuando se da de baja una unidad, alguien escribe la palabra **dentro de las columnas de
datos**, no solo en `ESTATUS`. Esos cuatro valores son estatus o relleno, y viven en la
constante `CENTINELAS` de `Relaciones.gs`:

`BAJA VEHICULAR` · `FUERA DE SERVICIO` · `NUCO SIN INFORMACION` · `SIN ESPECIFICAR`

y dos que solo aplican a `PLACA`, porque `SIN PLACA` en un campo de comentarios sí sería un
dato legítimo: `SIN PLACA` · `BAJA DE PLACA`

**Aplican a cualquier columna, no solo a `DEPARTAMENTO`**, y eso no es precaución teórica.
Medido en producción el 30/09/2026 (solo lectura): **1,265 celdas en 14 columnas**, de las
cuales **1,267 están fuera de lugar** — las otras 141 son la columna `ESTATUS`, donde sí
pertenecen. **La mitad de la flota tiene al menos una.**

| Columna | Celdas | Qué trae |
|---|---|---|
| `SEDE` | 309 | `SIN ESPECIFICAR` 173, `BAJA VEHICULAR` 120, `NUCO SIN INFORMACION` 16 |
| `UBICACION` | 309 | igual que `SEDE` |
| `DEPARTAMENTO` | 139 | `BAJA VEHICULAR` 123, `NUCO SIN INFORMACION` 14, `SIN ESPECIFICAR` 2 |
| `RESPONSABLE VEHICULO` | 125 | `BAJA VEHICULAR` 106, `NUCO SIN INFORMACION` 14, `FUERA DE SERVICIO` 5 |
| `PLACA` | 227 | `SIN PLACA` 101, `BAJA VEHICULAR` 84, `BAJA DE PLACA` 42 |
| `COLOR` | 69 | `SIN ESPECIFICAR` 56, `NUCO SIN INFORMACION` 13 |
| `RAZON SOCIAL`, `MARCA`, `MODELO`, `TIPO DE COMBUSTIBLE`, `CLASE`, `LINEA VEHICULO`, `SERIE VEHICULO` | 11–15 cada una | casi todo `NUCO SIN INFORMACION` |
| *(`ESTATUS`)* | *141* | *ahí sí pertenecen* |

Un centinela **nunca se propaga ni se corrige**: escribirlo no arregla nada, *pisa* el dato
bueno que la copia sí tiene. Se registra como `OMITIDO_CENTINELA` y se cuenta aparte,
porque **lo que hay que arreglar es `VEHICULOS`, no la copia**.

> **Una versión anterior de `CENTINELAS` solo cubría `DEPARTAMENTO`**, y con eso una corrida
> de `revisar({corregir:true})` habría escrito `BAJA VEHICULAR` encima de **8 placas y 12
> responsables de verdad** en `HOLOGRAMAS`, además de los 9 departamentos. El bug salió al
> armar `inconsistencias-vehiculos.xlsx`, no al leer el código: la lista se había escrito
> mirando una sola columna.

> **El catálogo `DEPARTAMENTOS` no se usa para decidir esto, y no debe usarse.** Está
> desactualizado: no tiene `OOAM TECNICO` (18 filas) ni `OOAM ADMINISTRATIVO` (7), que son
> áreas **reales** (confirmado con Ayrton el 30/09/2026). Validar contra él rechazaría datos
> buenos. Por eso `CENTINELAS` es una lista fija y corta.

#### Pendiente: limpiar el `DEPARTAMENTO` de los vehículos de baja

Los centinelas son una curita. La causa está en `VEHICULOS`, y se puede arreglar — medido
en producción, solo lectura:

- **Las 123 filas con `DEPARTAMENTO = 'BAJA VEHICULAR'` tienen las 123 también
  `ESTATUS = 'BAJA VEHICULAR'`.** Cero excepciones. La baja **no** depende de
  `DEPARTAMENTO`: consta en `ESTATUS`, que es la columna que el código lee
  (`VehiculosService.gs:72`). Limpiar `DEPARTAMENTO` no pierde la baja.
- Y ya hay **6 vehículos de baja que conservan su área** en `DEPARTAMENTO`: el patrón
  correcto existe en los datos.
- De las 123, **8 tienen su área recuperable** desde las copias (`HOLOGRAMAS`,
  `INSPECCION VEHICULAR`), y las fuentes coinciden en las 8 — sin un solo conflicto. A las
  otras **115 les toca quedar vacías**: vacío dice la verdad, que no consta el área.
  (Un primer cálculo dio 7 y 116 porque validaba las áreas contra el catálogo
  `DEPARTAMENTOS`; al dejar de hacerlo, `CTA0034` se recupera con `OOAM TECNICO`.)
- `NUCO SIN INFORMACION` (14 filas) y `SIN ESPECIFICAR` (2) son también valores del
  desplegable de `ESTATUS` (`app.html:1392`) y pintan igual, pero **eso no se ha cruzado
  contra `ESTATUS` todavía**: hay que medirlo antes de tocarlas.

**La app nueva no puede volver a contaminar esa columna:** `DEPARTAMENTO` es un desplegable
del catálogo (`app.html:1399`, `tipo: 'select', catalogo: true`). La contaminación entró por
AppSheet o editando el Excel a mano. O sea que `CENTINELAS` sirve de red mientras AppSheet
viva, y cuando se apague se puede borrar.

**Orden obligatorio:** primero la regla del vacío
([arriba](#principio-el-barrido-nocturno-no-vacía-lo-que-sí-tiene-dato)) —ya está—, y
**después** la limpieza. Al revés, la siguiente corrida nocturna propagaría los 115 vacíos y
borraría el área de las copias.

**Y `DEPARTAMENTO` es solo la punta:** son 1,124 celdas fuera de lugar en 13 columnas. El
inventario completo, celda por celda, está en `inconsistencias-vehiculos.xlsx`, hojas
*Relleno en VEHICULOS* y *Relleno detalle*.

**Lo que no se puede verificar desde aquí:** si AppSheet tiene esa columna como obligatoria,
o alguna vista que agrupe por ella. Con 115 celdas vacías nuevas eso se notaría allá. Se
revisa en su editor antes de escribir.

### Pieza 1b — Cómo se ve cada caso en `LOG_RELACIONES`

Cinco tipos, y solo uno se corrige:

| `TIPO` | Qué pasó | ¿Se corrige? |
|---|---|---|
| `DIFERENCIA` | la copia quedó vieja | **sí** |
| `DIFERENCIA_HISTORICA` | bitácora fechada: el valor del día del evento | no, a propósito |
| `OMITIDO_CENTINELA` | `VEHICULOS` traía un estatus en vez de un dato | no: arregla `VEHICULOS` |
| `OMITIDO_VACIO` | `VEHICULOS` no tiene el dato y la copia sí | no: arregla `VEHICULOS` |
| `HUERFANO` | la copia apunta a un folio/serie que ya no existe | no: no hay con qué |
| `CLAVE_DUPLICADA_EN_ORIGEN` | dos filas del dueño con la misma clave | no: no se sabe cuál manda |

### Principio: el barrido nocturno no vacía lo que sí tiene dato

`propagar()` y `revisar()` tratan distinto un valor vacío en el dueño, y la diferencia
es quién lo pidió:

| | Dueño vacío, copia con dato | Por qué |
|---|---|---|
| `propagar()` | **vacía la copia** | el usuario acaba de borrar el campo a propósito |
| `revisar()` | **no la toca**, loguea `OMITIDO_VACIO` | nadie pidió nada: es un barrido a ciegas |

En un barrido, un dueño vacío casi siempre es un dato que falta en `VEHICULOS`, no la
instrucción de borrarlo en tres módulos. Y la asimetría del error importa: borrar a ciegas
es silencioso y no hay de dónde recuperarlo; dejar el valor viejo se reporta cada noche
hasta que alguien lo vea.

Esto no es hipotético. Ver [limpieza pendiente del catálogo](#pendiente-limpiar-el-departamento-de-los-vehículos-de-baja):
a 115 vehículos de baja les toca quedar con `DEPARTAMENTO` vacío, y sin esta regla la
primera corrida nocturna después de esa limpieza vaciaría también el área que `HOLOGRAMAS`
e `INSTALACION DE SENSORES` sí conservan.

### Pieza 1 — El mapa (lo único que se edita a mano)

```js
const MAPA = {
  VEHICULOS: {                                   // hoja dueña del dato
    spreadsheet: () => Config.SPREADSHEET_IDS.VEHICULOS(),
    clave: 'FOLIO',                              // columna que une las hojas
    copias: [
      {
        hoja: 'INSTALACION DE SENSORES',
        spreadsheet: () => Config.SPREADSHEET_IDS.VEHICULOS(),
        clave: 'FOLIO',                          // cómo se llama el folio en ESTA hoja
        columnas: {                              // columna en VEHICULOS → columna en esta hoja
          'PLACA': 'PLACA',
          'LINEA VEHICULO': 'LINEA',             // pueden llamarse distinto
        },
      },
      {
        hoja: 'VERIFICACIONES',
        spreadsheet: () => Config.SPREADSHEET_IDS.VEHICULOS(),
        clave: 'FOLIO VEHICULO',
        columnas: { 'PLACA': 'PLACA' },
      },
    ],
  },
};
```

Un módulo nuevo que copia datos = agregar su entrada aquí. Nada más.

### Pieza 2 — `Relaciones.propagar(origen, clave, cambios)`

Se llama después de editar el registro dueño:

```js
// VehiculosService.actualizar
const vehiculo = SheetUtils.update(ssId(), SHEET_VEHICULOS, id, cambios, ID_COLUMN);
const resumen = Relaciones.propagar('VEHICULOS', vehiculo.FOLIO, cambios);
// resumen → { 'INSTALACION DE SENSORES': 1, 'VERIFICACIONES': 3 }
// la app muestra: "Placa actualizada · también en 1 instalación y 3 verificaciones"
```

Qué hace:

1. De los `cambios`, se queda solo con las columnas que alguien copia. Si ninguna, termina (costo cero).
2. Bloquea el script (`LockService`) para que dos propagaciones no choquen.
3. Por cada hoja con copias:
   - lee **solo la columna de la clave** (no toda la hoja),
   - encuentra las filas con ese folio,
   - escribe el valor nuevo en esas celdas con **una sola llamada**
     (`sheet.getRangeList(['C14', 'C87']).setValue(nuevo)`).
     Así **no pisa otras filas** que alguien esté editando en AppSheet al mismo tiempo.
4. Regresa cuántas filas actualizó por hoja.

### Pieza 3 — `Relaciones.datosParaNuevo(hojaCopia, clave)`

Se llama al **crear** un registro que copia datos:

```js
// VerificacionesService.registrar
const copia = Relaciones.datosParaNuevo('VERIFICACIONES', datos.folio);
// → { 'FOLIO VEHICULO': 'AUT0100', 'PLACA': 'XYZ-987' }
// o error claro: "El folio AUT0100 no existe en VEHICULOS"
SheetUtils.insert(ssId, 'VERIFICACIONES', Object.assign(copia, { /* lo que sí se captura */ }));
```

Busca en el mapa qué columnas copia esa hoja, las trae del registro dueño y valida que exista.

### Pieza 4 — `Relaciones.revisar({ corregir })` (tarea nocturna)

Red de seguridad para los cambios que `propagar` nunca ve (edición directa en el Excel,
cambios hechos desde AppSheet). Corre con un activador de tiempo (p. ej. 2 a. m.):

1. Lee la hoja dueña **una vez** → índice `{ folio: datos }`.
2. Por cada hoja de copias compara fila por fila las columnas copiadas.
3. Si difieren y `corregir` es `true`, corrige en bloque.
4. Escribe cada diferencia en la hoja `LOG_RELACIONES`:

   | fecha | hoja | folio | columna | tenía | quedó |
   |---|---|---|---|---|---|

- **La primera vez se corre con `corregir: false`** (solo reporta), para medir cuántas
  diferencias hay antes de tocar datos.
- **Folios huérfanos** (la copia apunta a un folio que ya no existe): se reportan, no se borran.
- **Folio duplicado en la hoja dueña**: se reporta y ese folio no se corrige (no se sabe cuál es el bueno).

### Pieza 5 — `Relaciones.cambiarClave(origen, claveVieja, claveNueva)`

Cambiar el **FOLIO** mismo afecta a todas las hojas relacionadas. Por eso va aparte:

- Solo ADMIN.
- Primero cuenta y muestra el impacto ("se actualizarán 1 instalación y 3 verificaciones").
- Pide confirmación y cambia la clave en la hoja dueña y en todas las copias.

> `VEHICULOS` tiene `ID_VEHICULO` (nunca cambia), pero las demás hojas no lo guardan;
> por eso la unión es por `FOLIO`. Tratar el folio como **casi inmutable**.

### Casos especiales

| Situación | Comportamiento |
|---|---|
| Falla a medias (se guardó el original, falló una copia) | Aviso: "se guardó, pero no se actualizó X; se corregirá esta noche". `revisar` lo arregla. |
| Una columna del mapa no existe (la renombraron) | Error claro con hoja y columna. Nunca escribe en otra columna. |
| Folios con espacios / minúsculas | Se comparan normalizados (sin espacios, en mayúsculas). |

### Lo que NO usar

- **Fórmulas en la hoja** (`BUSCARV`, `ARRAYFORMULA`): AppSheet y el código escriben en
  esas celdas y borrarían la fórmula.
- **Activador `onEdit`**: no se dispara con cambios de AppSheet ni de código; se perderían
  cambios sin avisar.

### Rendimiento

Con cientos o pocos miles de filas: propagar tarda 1–2 s; `revisar` todo, menos de un minuto.

---

## Reglas para desarrollar mientras tanto

Para que conectar `Relaciones` al final sea cambiar unas pocas líneas y no una búsqueda
por todo el código:

1. **Copiar datos de otra hoja en UNA sola función por servicio**, con nombre claro:
   ```js
   /** TEMPORAL: se reemplaza por Relaciones.datosParaNuevo (ver docs/relaciones.md) */
   function datosDeVehiculo_(folio) { … }
   ```
   Nunca repartir `findById(… 'VEHICULOS' …)` + copia de columnas por varias funciones.
2. **Las columnas copiadas no se editan en el módulo que las copia.** En la tabla:
   sin `editable`; si cambia el folio, se vuelven a copiar desde el dueño.
3. **Cada vez que un módulo copie columnas de otra hoja, anotarlo** en el inventario de abajo.

---

## El reporte de inconsistencias

`inconsistencias-vehiculos.xlsx`, en la raíz del repo. Es una **foto** de producción
(30/09/2026), no un tablero: para actualizarlo hay que volver a correr el reporte.

| Hoja | Qué trae |
|---|---|
| *Resumen* | una fila por hoja copia, con el conteo de cada tipo |
| *Detalle* | una fila por inconsistencia: hoja, fila, clave, columna, lo que dice cada lado y el tipo |
| *Leyenda* | qué significa cada tipo y qué haría la corrida nocturna con él |
| *Relleno en VEHICULOS* | las 14 columnas del catálogo que guardan estatus en vez de datos |
| *Relleno detalle* | esas 1,408 celdas una por una, con su referencia |
| *Calidad de las llaves* | por qué la llave es la serie y no el folio ni la placa, con los números |

Los mapeos de columnas salen del código (`Relaciones.MAPA` y
`InspeccionesService.DEL_VEHICULO`), no de la intuición. Lo que midió el 30/09/2026:

| Hoja | Se une por | Filas | Iguales | `DIFERENCIA` | `VEH_RELLENO` | `COPIA_VACIA` | `HUERFANO` |
|---|---|---|---|---|---|---|---|
| `INSTALACION DE SENSORES` | `SERIE VEHICULO` | 208 | 2,473 | 18 | 0 | 200 | 1 |
| `HOLOGRAMAS` | `SERIE VEHICULO` | 256 | 833 | 142 | 33 | 0 | 111 |
| `VERIFICACIONES` | `FOLIO VEHICULO` | 426 | 409 | 7 | 5 | 5 | 0 |
| `INSPECCION VEHICULAR` | `NO SERIE` | 302 | 2,749 | 184 | 18 | 29 | 0 |
| `INCIDENCIAS` | `FOLIO` | 1 | 2 | 0 | 0 | 0 | 0 |
| **Total** | | | **6,466** | **351** | **56** | **234** | **112** |

Tres cosas que salieron de ahí y valen más que los totales:

1. **Las 200 `COPIA_VACIA` de Sensores son casi todas una sola columna**:
   `CAPACIDAD DE COMBUSTIBLE` (157) y `COLOR` (43). No es deriva, es que nunca se llenaron.
2. **Los 111 huérfanos de Hologramas ya se conocían**: son vehículos personales que no están
   en el catálogo, y por diseño ahí los datos se capturan a mano.
3. **`INSPECCION VEHICULAR` acumula 184 `DIFERENCIA`**, sobre todo `RESPONSABLE` (85) y
   `OFICINA / DESARROLLO` (69). Es una bitácora, y Ayrton lo confirmó el 30/09/2026: *"el
   responsable que se captura ahí es el del momento en el que se realizó la inspección"*.
   **Eso no se corrige**, y ese número es justamente la medida de cuánto se habría
   reescrito si se tratara como caché.
4. **Los dos centinelas de `PLACA` movieron 11 casos** de `DIFERENCIA` a
   `VEHICULOS_RELLENO`: son 11 placas buenas en las copias que la corrida nocturna habría
   pisado con `SIN PLACA` o `BAJA DE PLACA`. Salieron de medir si la placa servía de llave,
   no de revisar el código.

## Inventario de copias (mantener al día)

| Hoja que copia | Clave | Columnas copiadas | Desde | Cómo se copia hoy | Pendiente |
|---|---|---|---|---|---|
| `VERIFICACIONES` | `FOLIO VEHICULO` | `PLACA` | `VEHICULOS` | `VerificacionesService`: al registrar y al cambiar el folio (copia en 2 lugares) | Unificar en `datosDeVehiculo_` (regla 1) |
| `INCIDENCIAS` | `FOLIO` | `DEPARTAMENTO`, `MODELO` | `VEHICULOS` | **Los manda el formulario** (autocompletado en el navegador) y son editables. En el `MAPA` como **`bitacora`**: se reportan, no se corrigen | Copiarlos en el servidor; quitar edición (regla 2) |
| `INSPECCION VEHICULAR` | `NO SERIE` | `FOLIO`, `DEPARTAMENTO`, `SEDE`, `OFICINA / DESARROLLO`, `RESPONSABLE` | `VEHICULOS` | En el `MAPA` como **`bitacora`**: se reportan, no se corrigen | Nada: congelada a propósito |
| `TICKETS` | — | (ninguna) | — | **No está en el `MAPA` y no debe estar.** Su `DEPARTAMENTO` es el de quien **levantó** el ticket (va pegado a `SOLICITANTE`), no el del vehículo: 320 de sus filas no coinciden con `VEHICULOS`, y eso es correcto | Nada |
| `INSTALACION DE SENSORES` | `SERIE VEHICULO` | 13 columnas (incluido `FOLIO`, que dejó de ser llave): `SERIE VEHICULO`, `PLACA`, `MARCA`, `CLASE`, `LINEA VEHICULO`, `MODELO`, `COLOR`, `CAPACIDAD DE COMBUSTIBLE`, `RAZON SOCIAL`, `DEPARTAMENTO`, `SEDE`, `OFICINA / DESARROLLO` (← `UBICACION`), `RESPONSABLE` (← `RESPONSABLE VEHICULO`) | `VEHICULOS` | `SensoresService.datosDeVehiculo_` (función temporal, regla 1); no son editables en el módulo | Reemplazar por `Relaciones.datosParaNuevo` |

> **`INSTALACION DE SENSORES` — lo que NO es copia:** `TIPO DE COMBUSTIBLE` es propio
> (en `VEHICULOS` es el tipo: GASOLINA/DIESEL; aquí el producto: MAGNA/PREMIUM/DIESEL —
> verificado contra producción, sin una sola contradicción). `SERIE SENSOR`, `FECHA INSTALACION`,
> `ESTATUS SENSOR`, `RESPONSIVA SENSOR`, `RENDIMIENTO (KM/L)`, `CONSUMO RALENTI (L/HR)` y
> `COMENTARIOS` se capturan (los dos numéricos también se pueden calcular con Geotab).
>
> **`SERIE SENSOR` se captura a mano, no la pone ningún bot.** Viene impresa en el sensor
> y alguien la teclea. (Una versión anterior de esta nota decía que un bot de AppSheet la
> escribía; es falso, confirmado con Ayrton el 29/09/2026.) Eso simplifica el asunto: al
> apagar AppSheet no hay bot que reemplazar.
>
> **Lo que sí queda pendiente:** la serie vive en dos hojas — `VEHICULOS` (212 de 652) y
> `INSTALACION DE SENSORES` (209 de 209) — y coinciden en 97.6%: hay 5 series en
> `VEHICULOS` que no están en la hoja de instalaciones. Hay que decidir **quién manda**.
> Como la instalación es el hecho que genera el dato, lo natural es que mande
> `INSTALACION DE SENSORES` y que en `VEHICULOS` sea copia, mantenida por `Relaciones`.
>
> **Ojo con el renglón que se sobrescribe:** una instalación por vehículo, y al cambiar de
> sensor se sobrescribe la misma fila (209 folios únicos en 209 filas). Así que no hay
> histórico de reemplazos de sensor: la serie anterior se pierde. Si algún día se quiere
> ese histórico, hay que dejar de sobrescribir y agregar renglón.

| `HOLOGRAMAS` | `SERIE VEHICULO` | `PLACA`, `MARCA`, `LINEA VEHICULO`, `MODELO`, `RESPONSABLE` (← `RESPONSABLE VEHICULO`), `DEPARTAMENTO`, `CAPACIDAD DEL TANQUE` (← `CAPACIDAD COMBUSTIBLE (LTS)`) | `VEHICULOS` | `HologramasService`: se leen del catálogo al listar (el catálogo manda) y `sincronizar()` los escribe en la hoja | Reemplazar por `Relaciones.propagar` + `revisar` |

> **`HOLOGRAMAS` es el caso que más se parece a lo que hará `Relaciones.revisar`:** al listar se
> compara contra `VEHICULOS`, se muestran los datos del catálogo y se marca la fila como
> "Desactualizado"; el usuario corrige con un botón y eso escribe la hoja (para que AppSheet
> también lo vea). Dos particularidades: **111 de 255 hologramas no tienen vehículo en el
> catálogo** (son vehículos personales) y ahí los datos sí se capturan en la hoja; y
> `TIPO COMBUSTIBLE` (producto de la tarjeta) y `RAZON SOCIAL` (empresa del contrato) **no son
> copias** aunque se llamen igual que columnas de `VEHICULOS`.

**Problema conocido mientras no exista `Relaciones`:** editar PLACA (u otra columna copiada)
desde Vehículos **no** actualiza las copias. Afecta solo a la base de pruebas mientras se
desarrolla; `revisar({ corregir: false })` medirá las diferencias cuando se implemente.

## Orden de implementación

1. ~~`Relaciones.gs` con el mapa, `propagar` y `datosParaNuevo`, con pruebas.~~ **Hecho**
   (pruebas en `tests/relaciones.test.js`).
2. ~~Conectar a `VehiculosService.actualizar`.~~ **Hecho**, `VehiculosService.gs:313`.
3. Reemplazar las funciones temporales `datosDeVehiculo_` de cada módulo. **Pendiente** —
   `SensoresService` y `HologramasService` siguen con las suyas. Son correctas, solo
   duplican la lógica del `MAPA`.
4. `revisar` en modo solo reporte → revisar el log → activar corrección y el activador
   nocturno. **Pendiente, y es el paso que falta para cerrar el tema.** En orden:
   1. `revisarRelacionesSoloReporte()` en el libro de **pruebas**, y leer `LOG_RELACIONES`:
      los `DIFERENCIA` son los que se van a corregir; los `DIFERENCIA_HISTORICA` y
      `OMITIDO_CENTINELA` no se tocan, y sirven para revisar que la clasificación del
      `MAPA` quedó bien.
   2. `revisarRelacionesYCorregir()` en pruebas, y verificar que las bitácoras siguen
      intactas.
   3. Lo mismo en producción.
   4. Crear el activador a mano: **Activadores > Agregar activador**, función
      `revisarRelacionesYCorregir`, por tiempo, diario, ~2 a.m. No se crea por código a
      propósito: `src/appsscript.json` no pide el permiso `script.scriptapp`, y pedirlo
      obliga a todos los usuarios a volver a autorizar la app.
5. `cambiarClave` para ADMIN. **Pendiente** (no tiene botón; se usa desde el editor).

> **Por qué el activador nocturno no es opcional.** Mientras AppSheet siga vivo, escribe en
> las mismas hojas y **ningún Apps Script puede verlo**: `onEdit` no se dispara para
> escrituras hechas por la API ni por otro script. Lo mismo para quien edite el spreadsheet
> a mano. `propagar()` solo cubre lo que pasa por la app nueva; para todo lo demás, la
> corrida nocturna de `revisar()` es la única red que hay.
