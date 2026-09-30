# Asignación de IDs — la lógica, al detalle

> **Estado:** especificación de lo que hacen `src/utils/Ids.gs` y `src/MigracionIds.gs`.
> El **modelo** y el *por qué* están en [ids.md](ids.md); aquí está el *cómo*, paso por
> paso, para poder auditar el resultado y repetirlo en producción.
>
> Medido contra PRODUCCIÓN y PRUEBAS el 29/09/2026 (solo lectura).

---

## 1. El ID que se genera de aquí en adelante

```
INS-1M3K8QB07F4XC2
└┬┘ └───┬────┘└─┬─┘
 │      │       └── 6 al azar
 │      └────────── 8 de tiempo
 └───────────────── 3 de tabla
```

### 1.1 Alfabeto

Base32 de Crockford, **32 símbolos**:

```
0 1 2 3 4 5 6 7 8 9 A B C D E F G H J K M N P Q R S T V W X Y Z
```

No están `I`, `L`, `O` ni `U`. Las tres primeras se confunden con `1` y `0` al leer un ID
en voz alta o teclearlo; la `U` se excluye para que el azar no pueda formar una grosería en
un ID que va impreso en un PDF que ve el cliente.

Cada símbolo vale 5 bits. Se escribe en MAYÚSCULAS y se compara ignorando mayúsculas.

### 1.2 La parte de tiempo (8 símbolos = 40 bits)

```
t = Date.now() - EPOCA          // EPOCA = 2020-01-01T00:00:00Z = 1577836800000
tiempo = base32(t, 8)           // rellenado con ceros a la izquierda a 8 símbolos
```

- 40 bits alcanzan 2⁴⁰ = 1,099,511,627,776 ms ≈ **34.8 años**, o sea hasta **2054**.
- Pasado 2054 los IDs **siguen siendo únicos** (por la parte al azar); lo único que se
  pierde es que ordenen. Un símbolo más lo llevaría a miles de años, si algún día importa.
- Se rellena con ceros a la izquierda **siempre**, porque el ancho fijo es lo que hace que
  ordenar alfabéticamente sea ordenar por fecha.

### 1.3 La parte al azar (6 símbolos = 30 bits)

```
azar = base32(aleatorio de 30 bits, 6)
```

1,073,741,824 combinaciones **dentro del mismo milisegundo**. No se encoge a 4 símbolos
porque una carga masiva mete cientos de renglones casi al mismo tiempo: con 6, mil
renglones en un instante dan 0.047% de colisión; con 4, ~50%.

### 1.4 Validación

```
/^[A-Z]{3}-[0-9A-HJKMNP-TV-Z]{14}$/
```

### 1.5 Dónde se genera

**Solo en el servidor.** Nunca en el navegador: con un componente de reloj, dejar que cada
celular ponga su hora sería meter el desorden de 46 relojes distintos. Apps Script tiene
uno solo.

---

## El ensayo sobre datos reales: replanchar desde produccion

`src/MigracionReplanche.gs`, funciones `replanche1Ensayo` y `replanche2Escribir`.

Ensayar la migracion sobre un libro que **ya esta migrado** prueba la idempotencia, no la
primera corrida, que es lo que de verdad va a pasar en produccion. Para que el ensayo valga,
el libro de pruebas tiene que empezar como empieza produccion: sin columna `ID`, sin
respaldo, con los ids viejos de AppSheet en su lugar.

Eso hace el replanchado: copia las 24 hojas migrables de produccion (**solo lectura**)
encima del libro de experimentos **"Inventario Reemplazable"**
(`1-RA6lmh-rZ-OKfsZSLl2Qd9lLyuDZ3dx3fP0M7qL-5o`), que es un clon de la base de pruebas hecho
aparte para no estorbarle a nadie.

### Es el unico archivo que escribe en un libro ajeno, y por eso lleva tres guardas

| Guarda | Que impide |
|---|---|
| El destino esta **fijo** en `REPL_DESTINO` | que apuntar el proyecto a otro libro arrastre el replanchado |
| Lista negra `REPL_PROHIBIDOS` | escribir en **produccion** o en el **libro de pruebas compartido del equipo**, aunque alguien edite la constante |
| Comprobacion del **nombre** del libro, no solo del id | escribir en un libro desconocido si ese id cambiara de dueno |

No pide respaldo del destino, al contrario que el resto del pipeline: ese libro es
desechable a proposito y el original de todo lo que se copia sigue en produccion. Si deja
constancia en `LOG_MIGRACION`, del lado del destino.

### Lo que se pierde, y la diferencia que importa

Replanchar borra las columnas que el destino tiene y produccion no. Se separan en dos:

- **Artefactos de la migracion** (`ID`, `ID ANTERIOR`, `ID APPSHEET`): perderlos **es el
  objetivo**. Se van sin preguntar.
- **Cualquier otra** — por ejemplo `COLOR` y `NOMBRE RESPONSABLES 2` en
  `LINEAS TELEFONICAS`, que alguien capturo a mano: el ensayo las **nombra una por una**, y
  escribir se **niega** hasta que se ponga la Script Property
  `REPLANCHE_ACEPTO_PERDER_COLUMNAS` con el id del destino.

### Se corta por tiempo y continua

Son ~861,000 celdas, y `CAMBIOS LINEAS TELEFONICAS` sola son 355,430. Se copia por bloques
de 4,000 filas, se anota en `REPLANCHE_HOJAS_LISTAS` que hoja ya quedo, y se auto-detiene a
los 4.5 minutos. Volver a correr `replanche2Escribir` continua donde se quedo; al terminar
borra el avance. `replancheEstado` dice en que va y `replancheReiniciarAvance` lo olvida.

### El laboratorio tiene su propio proyecto de Apps Script

| | |
|---|---|
| Libro | **Inventario Reemplazable** — `1-RA6lmh-rZ-OKfsZSLl2Qd9lLyuDZ3dx3fP0M7qL-5o` |
| Proyecto | **Inventario LAB - Ayrton** — `1ie0-yjGLvSLwv3oHgwg_GSrsGgcJjj2mumjfM_sjcbNmP3_-JlqgrFWv`, anclado a ese libro |
| Config local | `.clasp.lab.json` (como todo `.clasp.*.json`, **no se commitea**: ver `.gitignore`) |
| Para subir | `npm run push:lab` |

Existe por una razon concreta. El proyecto de pruebas de Ayrton esta anclado al libro
**compartido** del equipo, asi que cambiarle `SS_ID_VEHICULOS` para apuntarlo al laboratorio
se lo cambiaria tambien a Jorge y a Emmanuel mientras estuviera cambiado. Con un proyecto
aparte, el laboratorio queda aislado de verdad.

El `.clasp.json` de la raiz sigue apuntando al proyecto de dev y no se toca. Son dos
configuraciones que conviven: `npm run push` va a dev, `npm run push:lab` al laboratorio.
Si alguien clona el repo y quiere su propio laboratorio, copia
`.clasp.lab.json.example` y le pega el id de su proyecto.

### El orden del ensayo completo

1. En el proyecto del laboratorio, Script Property `SS_ID_VEHICULOS` =
   `1-RA6lmh-rZ-OKfsZSLl2Qd9lLyuDZ3dx3fP0M7qL-5o`. Es la unica que pide el pipeline: las
   carpetas de Drive solo las necesitan los modulos de la app, y `Config.required` es
   perezoso, asi que no las va a pedir.
2. `replanche1Ensayo` — leer el reporte, sobre todo las columnas que se perderian.
3. `replanche2Escribir` — las veces que haga falta hasta que diga LISTO.
4. Correr el pipeline completo desde `migracion1Revisar`, como si fuera produccion.

### Que el laboratorio se separe de produccion es normal

Verificado el 30/09/2026 despues del primer replanchado: **24 de 24 hojas con las mismas
columnas que produccion**, incluida `CAMBIOS LINEAS TELEFONICAS` con sus 35,543 filas. Las
unicas dos diferencias fueron `INSPECCIONES LINEAS` y `RESPONSIVAS LINEAS`, una fila abajo
cada una — y son registros que produccion recibio **despues** de la copia: el de
Inspecciones Lineas trae fecha 30/09/2026 09:46, posterior a la corrida.

Con 46 personas trabajando eso pasa siempre: el laboratorio es una **foto**, no un espejo.
Si la foto se queda vieja, se vuelve a replanchar. Y conviene tenerlo presente al comparar
conteos: una diferencia de una o dos filas en las hojas de Lineas no es un error de copia.


## 2. El ID de los registros que ya existen

### 2.1 La decisión: se usa el orden de los renglones, no las columnas de fecha

Se evaluó derivar el tiempo de la columna de fecha de cada hoja. **Se descartó**, y esta es
la evidencia:

La medición de `fechas-de-alta.xlsx` incluye una columna **"EN ORDEN %"**, que es
exactamente *qué tan seguido el renglón siguiente trae una fecha igual o mayor* — o sea,
**si la fecha coincide con el orden de los renglones**. Resultado:

| Caso | Hojas | Qué significa |
|---|---|---|
| 100% en orden | 12 de 20 | Fecha y orden de renglones dan lo **mismo**: usar el orden no pierde nada |
| 51% – 91% | 8 de 20 | Fecha y orden **no** coinciden. La sospechosa es la fecha, que se recapturó después |
| Sin fecha usable | 3 | `RESPONSIVAS LINEAS` (0 de 899), `ACCESORIOS CELULARES`, `COLABORADORES` |

Ejemplos del segundo grupo: `LINEAS TELEFONICAS.FECHA REGISTRO` al 51%,
`INSTALACION DE SENSORES.FECHA INSTALACION` al 66%, `UBER.FECHA DE ALTA` llena solo en
**9%** de las filas en producción y con 27 valores capturados como texto.

Conclusión: el orden de los renglones es al menos igual de bueno en todas las hojas, y
mejor en las sucias. Además **elimina 8 decisiones pendientes** que dependían de elegir
columna hoja por hoja.

**No se pierde información:** las columnas de fecha se quedan en la hoja tal como están.
Solo dejan de usarse para construir el ID.

### 2.2 El bloque reservado (y por qué no se inventan fechas)

Si a un registro viejo se le pone un timestamp de, digamos, marzo de 2024, entonces
`Ids.fecha()` va a devolver esa fecha **con total confianza y va a estar mintiendo**.

Por eso los registros viejos van a un **bloque reservado al inicio de la época**:

```
tiempo del renglón i  =  i           // i = 0, 1, 2, … en el orden de la hoja
                                     // o sea 1 milisegundo por renglón desde 2020-01-01
```

- La hoja más grande son 35,538 renglones = **36 segundos** de ventana. Cabe de sobra.
- Ordenan correctamente entre ellos, en el orden de la hoja.
- Ordenan **antes** que todos los nuevos, que arrancan en la fecha real de la migración.
- Un timestamp de **2020-01-01** es obviamente no real, así que nadie se confunde.

**El límite del bloque** es `LEGADO_LIMITE_MS = 86_400_000` (un día). Cualquier ID cuyo
tiempo caiga por debajo es un ID de legado:

```js
Ids.esLegado(id)   // → true si el tiempo del ID cae dentro del primer día de la época
Ids.fecha(id)      // → null para los de legado; Date real para los nuevos
```

`Ids.fecha()` devolviendo `null` es la parte importante: es la diferencia entre "no sé
cuándo se creó" y una mentira con cara de dato.

### 2.3 Qué pasa si alguien ordenó una hoja

Si en algún momento alguien ordenó una hoja por folio, el orden de renglones ya **no** es
el de captura. `LINEAS TELEFONICAS` (51% de acuerdo con su fecha) es la sospechosa.

Esto **no invalida el método**, porque con el bloque reservado no estamos afirmando "esta
es la fecha de creación" sino "este es el orden de la hoja", que es cierto por
construcción. El riesgo desaparece al dejar de prometer algo que no sabemos.

### 2.4 El valor viejo se conserva, pero solo donde haría falta

El ID viejo nunca se pierde, para que cualquier PDF o reporte impreso que lo cite se siga
pudiendo encontrar. Pero **no siempre hay que copiarlo a ningún lado**:

- **8 hojas** tienen su columna original llamada literalmente `ID`: `LINEAS TELEFONICAS`,
  `INSPECCIONES LINEAS`, `RESPONSIVAS LINEAS`, `REACTIVACION DE LINEAS`,
  `SOLICITUD DE LINEAS`, `INCREMENTOS`, `UBER` y `TICKETS`. Ahí el ID nuevo **pisa** la
  columna, así que el valor viejo se respalda antes en **`ID APPSHEET`**.
- **Las otras 15** tienen la suya con otro nombre (`ID_VEHICULO`, `ID_SENSOR`, `ID CCH`,
  `No EMPLEADO`…). Esa columna **no se toca**: el `ID` nuevo se crea aparte, al final. Ahí
  un `ID APPSHEET` guardaría dos veces lo mismo, así que no se crea.

> Una versión anterior lo creaba en las 23 hojas. Si ya corriste esa, `limpiarRespaldoRedundante()`
> quita las que sobran — y solo borra la columna después de comprobar renglón por renglón
> que el valor sigue existiendo igualito en su columna original.

---

## 3. Prefijo por hoja

Una hoja de registros = un prefijo. Las vistas no llevan prefijo propio.

| Hoja | Prefijo | Columna de ID de hoy | Filas (prod) |
|---|---|---|---|
| `VEHICULOS` | `VEH` | `ID_VEHICULO` | 648 |
| `CAMBIOS VEHICULOS` | `CVE` | `ID_CAMBIO` | 9,214 |
| `REASIGNACIONES_VEHICULOS` | `RVE` | `ID Reasignacion Vehicular` | 361 |
| `VERIFICACIONES` | `VER` | `ID_VERIFICACION` | 426 |
| `INSPECCION VEHICULAR` | `INS` | `ID INSPECCION ` *(con espacio final)* | 295 |
| `INSTALACION DE SENSORES` | `SEN` | `ID_SENSOR` | 208 |
| `HOLOGRAMAS` | `HOL` | `ID_HOLOGRAMA` | 256 |
| `INCIDENCIAS` | `INC` | `ID_INCIDENCIA` | 1 |
| `LINEAS TELEFONICAS` | `LIN` | `ID` | 1,615 |
| `INSPECCIONES LINEAS` | `ILI` | `ID` | 1,594 |
| `RESPONSIVAS LINEAS` | `RLI` | `ID` | 899 |
| `REACTIVACION DE LINEAS` | `REA` | `ID` | 359 |
| `SOLICITUD DE LINEAS` | `SOL` | `ID` | 229 |
| `CAMBIOS LINEAS TELEFONICAS` | `CLI` | **columna A, sin encabezado** | 35,538 |
| `BITACORA DE DESECHO` | `DES` | `ID_DESECHO` | 234 |
| `ACCESORIOS CELULARES` | `ACC` | `ID_Accesorio` | 65 |
| `MOVIMIENTOS_ACCESORIOS` | `MAC` | `ID_Movimiento` | 269 |
| `ARQUEOS` | `ARQ` | `ID ARQUEO` | 145 |
| `CAJAS CHICAS` | `CCH` | `ID CCH` | 285 |
| `INCREMENTOS` | `MON` | `ID` | 9 |
| `UBER` | `UBE` | `ID` | 339 |
| `TICKETS` | `TCK` | `ID` | 2,060 |
| `COLABORADORES` | `COL` | `No EMPLEADO` | 3,627 |

> `ILI` y `RLI` están **pendientes de confirmar con Emmanuel**.

---

## 4. Las referencias entre hojas

Medidas contra los datos, no supuestas. El porcentaje es cuántos valores del hijo existen
en el padre.

| Hoja hija | Columna | Apunta a | Coincidencia |
|---|---|---|---|
| `VERIFICACIONES` | `FOLIO VEHICULO` | `VEHICULOS.FOLIO` | 100% |
| `REASIGNACIONES_VEHICULOS` | `Folio Vehiculo` | `VEHICULOS.FOLIO` | 100% |
| `INSTALACION DE SENSORES` | `FOLIO` | `VEHICULOS.FOLIO` | 99% |
| `INSPECCION VEHICULAR` | `FOLIO` | `VEHICULOS.FOLIO` | 99.6% |
| `HOLOGRAMAS` | `SERIE VEHICULO` | `VEHICULOS.SERIE VEHICULO` | opcional (111/255 sin vehículo) |
| `CAMBIOS VEHICULOS` | `FOLIO` | `VEHICULOS.FOLIO` | **73%** — 228 folios fantasma |
| `INSPECCIONES LINEAS` | `ID LINEA` | `LINEAS TELEFONICAS.ID` | 99.9% |
| `RESPONSIVAS LINEAS` | `ID LINEA` | `LINEAS TELEFONICAS.ID` | 99.8% |
| `BITACORA DE DESECHO` | `ID_EQUIPO` | `LINEAS TELEFONICAS.ID` | 100% |
| `CAMBIOS LINEAS TELEFONICAS` | `ID_LINEA` | `LINEAS TELEFONICAS.ID` | 98.1% |
| `REACTIVACION DE LINEAS` | `IMEI` *(mal nombrada)* | `LINEAS TELEFONICAS.ID` | 89% |
| `MOVIMIENTOS_ACCESORIOS` | `ID_Accesorio` | `ACCESORIOS CELULARES.ID_Accesorio` | 95% |
| `ARQUEOS` | `ID CCH` | `CAJAS CHICAS.ID CCH` | 100% |
| `INCREMENTOS` | `ID CCH` | `CAJAS CHICAS.ID CCH` | 100% |

### 4.1 Dónde se escribe el ID nuevo, y por qué NO es uniforme

Depende de qué guarda la columna del hijo, y equivocarse aquí destruye datos:

**Caso (a) — el hijo guarda una LLAVE DE NEGOCIO del padre** (`FOLIO`, `SERIE VEHICULO`,
`ID CCH`, `ID_Accesorio`). Esa columna **no se toca**: es lo que la gente lee en la tabla y
lo que AppSheet usa, y sigue siendo válida porque la llave de negocio del padre nunca
cambió. El ID nuevo va en una **columna nueva**:

| Hoja | Columna que se respeta | Columna nueva |
|---|---|---|
| `VERIFICACIONES` | `FOLIO VEHICULO` | `ID VEHICULO` |
| `REASIGNACIONES_VEHICULOS` | `Folio Vehiculo` | `ID VEHICULO` |
| `INSTALACION DE SENSORES` | `FOLIO` | `ID VEHICULO` |
| `INSPECCION VEHICULAR` | `FOLIO` | `ID VEHICULO` |
| `HOLOGRAMAS` | `SERIE VEHICULO` | `ID VEHICULO` |
| `CAMBIOS VEHICULOS` | `FOLIO` | `ID VEHICULO` |
| `MOVIMIENTOS_ACCESORIOS` | `ID_Accesorio` | `ID ACCESORIO` |
| `ARQUEOS` | `ID CCH` | `ID CAJA CHICA` |
| `INCREMENTOS` | `ID CCH` | `ID CAJA CHICA` |

> Los dos últimos no pueden llamar a su columna nueva `ID CCH`: ya existe con otro
> contenido. De ahí `ID CAJA CHICA`.

**Caso (b) — el hijo guarda el ID VIEJO del padre** (`ID LINEA`, `ID_EQUIPO`, `ID_LINEA`,
`ID Linea`, `IMEI` de Reactivación) **y ese padre es de los 8 cuya columna se llamaba
`ID`**, así que la migración se la pisó. Entonces la columna del hijo ya no apunta a nada y
hay que **reescribirla en su lugar**. Son 7 columnas, todas hijas de `LINEAS TELEFONICAS`.

Cuál de los dos casos aplica **se deduce del catálogo** (`pisaLlaveAnterior` del padre), no
se escribe a mano en cada entrada.

> **Un error que estuvo a punto de correrse.** La primera versión pisaba la columna en los
> dos casos. Habría convertido los folios `CTA0100` en `VEH-…`, tirando la llave de negocio
> que la gente lee y rompiendo AppSheet, que une por ahí. Se detectó antes de ejecutar el
> paso 3; los folios de la copia de pruebas están intactos.

### 4.2 Cómo se reescriben

Por cada hoja hija y cada columna de referencia:

1. Se arma el mapa `viejo → nuevo` del padre, leído de su columna `ID APPSHEET` y su
   columna `ID`.
2. Se recorre la columna del hijo y se sustituye cada valor por el ID nuevo del padre.
3. Un valor que **no esté en el mapa** no se toca y se reporta como huérfano. Nunca se
   inventa un padre ni se borra el renglón.

### 4.3 Comparación normalizada

Un valor del hijo puede venir como número donde el padre lo tiene como texto (ya pasó: 23
IDs se guardaron como número y uno perdió un cero a la izquierda). Antes de comparar:

```
normalizar(v) = String(v).trim().toUpperCase()
```

Y si no hay coincidencia directa, se reintenta rellenando con ceros a la izquierda hasta 8,
que es lo que recupera el `01092110` que Sheets convirtió en `1092110`.

### 4.4 Punteros vivos contra fotos del pasado

El módulo de Líneas guarda dos pestañas propias, `APP_EVIDENCIAS` y `APP_MOVIMIENTOS`, que
**no vienen de AppSheet**: las crea el sistema nuevo. Solo existen en la copia de pruebas;
en producción no hay ninguna `APP_*`.

Traen IDs en columnas de dos naturalezas distintas, y **se tratan al revés una de otra**:

| Columna | Hoja | Qué es | Se migra |
|---|---|---|---|
| `ID_REGISTRO` | `APP_EVIDENCIAS` | Puntero a la inspección o responsiva. Se busca con `buscarFilas` en 4 lugares | **Sí** |
| `ID_LINEA` | `APP_EVIDENCIAS` | Puntero a la línea. Se busca con `buscarFilas` | **Sí** |
| `REFS` | `APP_MOVIMIENTOS` | Lista de IDs entre comas (`,id1,id2,`). Se busca por subcadena `,id,` | **Sí**, partiendo por comas |
| `ANTES_JSON` | `APP_MOVIMIENTOS` | Foto de cómo estaba el registro | **No** |
| `DESPUES_JSON` | `APP_MOVIMIENTOS` | Foto de cómo quedó | **No** |
| `DETALLE_JSON` | `APP_MOVIMIENTOS` | Qué cambió (`idsCambios`, `responsivaId`) | **No** |

**Por qué los JSON no se tocan.** Son un snapshot: registran cómo se veía la información en
un momento. Un JSON que dice `"id":"5c7e9e2a"` está afirmando algo que **era cierto
entonces**. Cambiarle el ID haría que el historial afirmara algo que nunca pasó, y el
usuario vería un identificador que no existía en esa fecha. Además no se usan para buscar:
se leen en un solo lugar (`LineasRepo`, al armar el historial) y solo para mostrarlos.

Para saltar del historial al registro de hoy está la columna `ID_ANTERIOR` que ya existe en
`APP_EVIDENCIAS`. Ese es el puente, no falsificar la foto.

### 4.5 IDs que no viven en ninguna hoja

`LineasRepo` fabrica identificadores `drive_<carpetaId>` para las inspecciones que solo
existen en la carpeta de Drive de NUCOS, sin renglón en ninguna hoja. **Nunca pasan por
`Ids`**: ni el generador, ni el activador, ni la validación de forma. El código ya los
distingue con `/^drive_/`.

### 4.6 Lo que NO se une por ID

- **`NUCO` / `NUCCO`** es la parte numérica del `FOLIO`: un dato derivado, no una llave.
  Nada se une por ahí. (Medido: Inspección 298/298, Vehículos 645/652, Líneas 1504/1615 —
  ~118 registros ya se desincronizaron de su propio folio.)
- **`No EMPLEADO`** sigue siendo llave de negocio y admite referencias sueltas: el catálogo
  `COLABORADORES` no está actualizado (50 empleados de Vehículos y 120 de Responsivas no
  existen ahí). No se convierte en llave foránea con integridad.

---

## 5. Orden de ejecución

Los cuatro pasos, **en este orden**. Cada uno es una función aparte y se puede correr solo.

### Paso 1 — Limpiar lo roto (`limpiarAntesDeMigrar`)

| Qué | Dónde |
|---|---|
| Quitar el espacio final de `ID INSPECCION ` | `INSPECCION VEHICULAR` |
| Ponerle nombre a las columnas A y C | `CAMBIOS LINEAS TELEFONICAS` |
| Decidir qué hacer con la columna `#REF!` | `LINEAS TELEFONICAS` (solo producción) |
| Reportar las 7 referencias huérfanas de `eeba06a3` | `INSPECCIONES LINEAS`, `RESPONSIVAS LINEAS` |

### Paso 2 — Llenar la columna `ID` (`asignarIds`)

Por cada hoja, en el orden de la tabla de la sección 3:

1. Si no existe la columna `ID`, se agrega **al final**.
2. Si no existe `ID APPSHEET`, se agrega al final.
3. Se lee la columna de ID de hoy (sección 3) completa, **en el orden de la hoja**.
4. Se detectan los **renglones en blanco** (ver abajo) y se saltan.
5. Por cada renglón `i` con datos: `ID = prefijo + '-' + base32(i, 8) + base32(azar, 6)`
6. Se copia el valor viejo a `ID APPSHEET`.
7. Se escribe todo con **una sola** llamada por columna (`setValues` sobre el rango
   completo), no renglón por renglón.
8. Se verifica que no haya repetidos antes de escribir. Si hay, **aborta** sin escribir.

Todavía nadie lee la columna `ID`: este paso es seguro y repetible.

#### Se puede volver a correr sin miedo

Apps Script corta la ejecución a los minutos, y con 23 hojas (una de 35,538 renglones) es
probable que se interrumpa a la mitad. Por eso:

- **Una hoja ya migrada se salta.** Se considera migrada si todos sus renglones con datos
  traen un ID con la forma correcta y el prefijo de esa hoja. La segunda corrida sigue
  donde se quedó.
- **`ID APPSHEET` nunca se pisa si ya trae datos.** Es el único valor irrecuperable. Y hay
  una trampa concreta: en las hojas cuya columna original se llama `ID` (Líneas, Uber,
  Tickets, Reactivación, Solicitud, Incrementos), la primera corrida la sobrescribe con el
  ID nuevo. Si la segunda volviera a leer de ahí, copiaría los IDs **nuevos** encima de
  `ID APPSHEET` y borraría los originales para siempre. Por eso, cuando `ID APPSHEET` ya
  tiene datos, **esa** es la fuente de la verdad, no la columna original.
- **Se escribe en orden y con `flush()`**: primero `ID APPSHEET`, se fuerza el guardado, y
  hasta entonces se pisa la columna original.
- **Se detiene sola a los 4.5 minutos** y dice en qué hoja se quedó y cuáles faltan.

Con `{ rehacer: true }` vuelve a generar el ID aunque la hoja ya esté migrada; el valor
viejo se sigue respetando porque se lee de `ID APPSHEET`.

El paso 3 tiene la misma protección: una referencia que ya trae un ID con la forma nueva se
deja como está y no cuenta como huérfana.

#### Los renglones en blanco NO reciben ID

`getLastRow()` cuenta renglones vacíos que quedaron dentro del rango usado de la hoja. En
la copia de pruebas son **147**, y no están al final sino repartidos:

| Hoja | En blanco | De un total de |
|---|---|---|
| `LINEAS TELEFONICAS` | 101 | 1,716 |
| `RESPONSIVAS LINEAS` | 29 | 771 |
| `INSPECCIONES LINEAS` | 5 | 1,436 |
| `INSPECCION VEHICULAR` | 4 | 302 |
| `REACTIVACION DE LINEAS` | 3 | 324 |
| `ACCESORIOS CELULARES` | 3 | 65 |
| `HOLOGRAMAS` | 1 | 256 |
| `MOVIMIENTOS_ACCESORIOS` | 1 | 228 |

Ponerles ID los convertiría en **147 registros fantasma con llave propia** — 101 líneas
telefónicas que de pronto parecen reales. Se detectan leyendo la hoja completa una vez y
comprobando que **todas** sus celdas estén vacías, y se dejan intactos.

Un renglón **con datos pero sin ID** es distinto: ese sí es un problema y
`revisarAntesDeMigrar()` lo reporta como tal. En la copia de pruebas no hay ninguno.

### Paso 3 — Reescribir las referencias (`reescribirReferencias`)

Con el mapa del paso 2, según la tabla de la sección 4. Las huérfanas se reportan y se
dejan intactas.

### Paso 4 — Cambiar el código

Hasta aquí, cambiar los servicios para unir por `ID` en vez de por `FOLIO`.

> El paso 4 antes del 2 deja el sistema sin llaves. El 3 antes del 2, con referencias a IDs
> que no existen. **El orden no es negociable.**

---

## 6. Dónde se corre

**Primero en la copia de PRUEBAS, completo.** Producción no se toca hasta el apagado de
AppSheet, porque agregar una columna rompe la app de AppSheet hasta que alguien regenere el
esquema, y eso le pega a los usuarios en campo (ver [ids.md](ids.md)).

La copia de pruebas sirve como ensayo: **22 de 23 hojas tienen estructura idéntica** a
producción. La única distinta es `LINEAS TELEFONICAS`, por la columna `#REF!` que solo
existe en producción.

Al apagar AppSheet se corre el mismo script, ya probado, contra producción.

---

## 7. Cómo auditar el resultado

Después del paso 2, en cada hoja:

- `ID` llena en el 100% de los renglones.
- `ID` sin repetidos.
- Todos los `ID` pasan la validación de la sección 1.4.
- Todos los `ID` empiezan con el prefijo de esa hoja.
- `ID APPSHEET` tiene exactamente los mismos valores que tenía la columna vieja.
- El orden de `ID` coincide con el orden de los renglones.

Después del paso 3, en cada referencia:

- Cada valor no huérfano existe en la columna `ID` del padre.
- El número de huérfanos coincide con lo reportado (7 conocidas hoy, más las 228 de
  `CAMBIOS VEHICULOS` si se decide migrar esa bitácora).

---

## 8. De dónde nacen los IDs de aquí en adelante

La migración le pone ID a lo que ya existe. Esta sección es lo otro: cómo lo recibe cada
registro nuevo, desde el día uno.

### 8.1 Por dónde entra un renglón a una hoja

| Camino | Quién lo hace | Cómo recibe su ID |
|---|---|---|
| La web app | `SheetUtils.insert` (15 servicios) y `LineasDatos.agregarFilas` (Líneas) | Al escribir, con `Ids.nuevo()` |
| AppSheet, mientras viva | Escribe directo en la hoja | Llega **sin** ID → lo pone el activador |
| Alguien editando el Sheet a mano | — | Llega **sin** ID → lo pone el activador |

Los dos primeros caminos son los únicos que escriben desde nuestro código: **solo hay dos
funciones que agregan renglones**. Los demás servicios les pasan el objeto y ya. Por eso la
generación se arregla en dos lugares y no en los diecisiete que la calculan hoy por su
cuenta.

### 8.2 La regla de `SheetUtils.insert`

```
si el objeto ya trae ID            → se respeta
si la hoja no tiene columna ID     → no se hace nada (p. ej. USUARIOS)
si la hoja tiene columna ID:
    está en Entidades              → ID = Ids.nuevo(prefijo)
    no está en Entidades           → TRUENA
```

Las dos primeras condiciones importan:

- **"Si ya trae ID, se respeta"** no es una cortesía: hay casos donde el ID hace falta
  *antes* de escribir. `InspeccionesService` lo necesita para nombrar las imágenes con la
  convención de AppSheet (`INSPECCION VEHICULAR_Images/<id>.<COLUMNA>.<hora>.png`), y
  `LineasCaptura` arma el formulario alrededor de un `idPropuesto`. Esos llaman
  `Ids.nuevo()` ellos mismos y lo pasan.
- **"Si no tiene columna ID, no se hace nada"** evita romper `USUARIOS`, que se da de alta
  con `SheetUtils.insert` y no está en el catálogo porque no guarda registros con ID. Si la
  regla fuera "hoja desconocida truena" a secas, dar de alta un usuario dejaría de
  funcionar.

### 8.3 El activador

Por tiempo, no `onEdit`: **`onEdit` no se dispara ni con las escrituras de AppSheet ni con
las de Apps Script**, así que se perderían renglones sin avisar (la misma razón por la que
se descartó en [relaciones.md](relaciones.md)).

Recorre las hojas de `Entidades`, busca renglones con datos y sin `ID`, y se los pone con
`Ids.nuevo()` — con la hora real del momento en que los encuentra, no la del bloque de
legado. El margen de unos minutos es honesto; decir "no sé" cuando sí sabemos
aproximadamente sería peor.

Sigue haciendo falta después de apagar AppSheet, porque la gente edita las hojas a mano.

### 8.4 La columna vieja durante la transición

En las 15 hojas donde el ID nuevo no pisa nada, después de migrar conviven las dos
columnas: la de siempre (`ID_VEHICULO`, `ID_SENSOR`…) y la nueva `ID`.

**Mientras AppSheet viva hay que llenar las dos.** La vieja es su llave: si le llega vacía,
no puede trabajar ese renglón. Al apagarlo, esa columna se puede tirar.

### 8.5 Lo que esto arregla de paso

`CajasChicasService.generarIdCch_` hace "el máximo que exista, más uno". Dos altas
simultáneas leen el mismo máximo y producen el mismo número. Es una carrera real, hoy sin
consecuencias solo porque casi nadie da de alta cajas chicas al mismo tiempo. Con
`Ids.nuevo()` esa clase de error desaparece sin necesidad de candados.

### 8.6 Los tres IDs compuestos no se van

`InspeccionesService.nuevoId_` (`2026_451_1`), `ArqueosService.generarIdArqueo_`
(`2026_225_001`) y `generarIdCch_` (1, 2, 3) siguen generando, pero llenando la **llave de
negocio** — `FOLIO INSPECCION`, `FOLIO ARQUEO`, `ID CCH` — no la columna `ID`.

---

## 9. El pipeline: respaldo, bitácora, estado y reversa

`src/MigracionIds.gs` tiene los **pasos**; `src/MigracionPipeline.gs` tiene el **orden y la
seguridad**. No duplica lógica: llama a las funciones de allá.

Los pasos funcionaron en la copia de pruebas, pero tenían tres huecos que en producción no
se pueden dejar: no había respaldo, no había reversa, y no quedaba registro de qué se
corrió.

### 9.1 Antes de cualquier cosa: `pipeline0Respaldar`

Copia fechada del spreadsheet completo. Es la **red externa**: la reversa deshace paso por
paso, pero si la reversa misma falla, esto es lo único que queda. Guarda el id en la Script
Property `MIGRACION_RESPALDO_ID`.

Y sirve doble: esa copia es una réplica exacta de producción, así que **el pipeline completo
se ensaya ahí** pasando `{ spreadsheetId: <id de la copia> }`, sin tocar el original.

### 9.2 Tres llaves para escribir en producción

No una, tres, y separadas a propósito para que ninguna se dé por hecha:

| Script Property | Qué declara |
|---|---|
| `MIGRACION_IDS_AUTORIZAR_PRODUCCION` | "sé que es producción" |
| `MIGRACION_APPSHEET_APAGADO` | "AppSheet ya no está escribiendo" |
| `MIGRACION_RESPALDO_ID` | la escribe el paso 0; sin ella no se escribe |

Las tres tienen que **ser iguales al id del spreadsheet**, no solo estar puestas.

### 9.3 `pipelineEstado` — "¿dónde estoy?"

Solo lee. Dice si hay respaldo, qué pasos están hechos y cuál sigue con su nombre de
función. Lo mide **en los datos**, no en una bandera de progreso: una bandera puede quedar
mal si algo se interrumpe, la hoja no.

### 9.4 El candado

`MigracionIds` no tomaba ninguno, mientras los servicios en vivo (`SheetUtils.removeMany`,
`VehiculosService`, `Relaciones.propagar`) todos usan `LockService.getScriptLock()`. El
pipeline lo toma por paso, con `tryLock` y no `waitLock`: si alguien más está escribiendo,
falla rápido en vez de esperar minutos.

### 9.5 La reversa — `pipelineRevertirEnsayo` / `pipelineRevertirEscribir`

El orden es el inverso del avance, y **no es negociable**:

1. **Las referencias que se pisaron** (hijas de `LINEAS TELEFONICAS`). Su valor viejo no se
   respaldó, pero se **reconstruye**: valor nuevo → fila del padre por su `ID` → su
   `ID APPSHEET`. Tiene que ir **antes** de borrar el respaldo del padre.
2. **Las 8 hojas cuya columna `ID` se pisó**: `ID` ← `ID APPSHEET`, y luego se borra el
   respaldo.
3. **Borrar lo que agregamos**: `ID` en las 16 que no se pisaron, y `ID VEHICULO` /
   `ID ACCESORIO` / `ID CAJA CHICA`.

Las columnas movidas no requieren nada: al borrar `ID`, el acomodo desaparece solo.

**Dos cosas que la reversa NO hace, a propósito:**

- **No borra el `ID APPSHEET` de `CAMBIOS LINEAS TELEFONICAS`.** Esa columna es la
  original —la que no tenía encabezado y se nombró a mano—, no algo que creamos. El
  catálogo lo distingue con `pisaLlaveAnterior`, y hay una prueba dedicada a que siga así.
- **No inventa valores viejos para filas nacidas después de migrar.** Su `ID APPSHEET`
  está vacío y su `ID` queda vacío. Es lo correcto —nunca tuvieron id viejo— pero significa
  que **la reversa no es una máquina del tiempo**. Para eso está la copia del paso 0.

### 9.6 Formato de texto en la columna `ID`

`migColumnaOCrear_` le pone `setNumberFormat('@')` a cada columna que crea. El prefijo ya
hace imposible que Sheets lea un ID como número; el formato lo hace imposible **también si
alguien pega valores a mano**. Es la misma precaución que toma
`LineasDatos.asegurarPestana`, y cierra por completo el agujero que costó 23 IDs
convertidos en número y un cero a la izquierda perdido.

### 9.7 Cómo se ensaya el ciclo completo

Sobre la copia del paso 0, no sobre producción:

```
pipeline0Respaldar                  → da el id de la copia
pipelineEstado                      → "sin migrar, sigue el paso 1"
migracion1Revisar
migracion2AsignarEscribir
migracion4Auditar                   → tiene que decir "todo cuadra"
migracion3ReferenciasEscribir
migracionLimpiarRespaldoEscribir
migracionMoverIdsAlInicioEscribir
pipelineRevertirEscribir
pipelineEstado                      → tiene que volver a decir "sin migrar"
```

Si el estado final vuelve al inicial y la auditoría cuadra en medio, el pipeline sirve.
