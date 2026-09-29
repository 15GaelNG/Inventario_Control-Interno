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

- La hoja más grande son 20,000 renglones = **20 segundos** de ventana. Cabe de sobra.
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

### 2.4 El valor viejo se conserva

El ID que tenía cada renglón se copia a una columna nueva **`ID APPSHEET`**, para que
cualquier PDF o reporte impreso que lo cite se siga pudiendo encontrar. Se borra cuando ya
nadie lo busque.

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
| `CAMBIOS LINEAS TELEFONICAS` | `CLI` | **columna A, sin encabezado** | 19,999 |
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

### 4.1 Cómo se reescriben

Por cada hoja hija y cada columna de referencia:

1. Se arma el mapa `viejo → nuevo` del padre, leído de su columna `ID APPSHEET` y su
   columna `ID`.
2. Se recorre la columna del hijo y se sustituye cada valor por el ID nuevo del padre.
3. Un valor que **no esté en el mapa** no se toca y se reporta como huérfano. Nunca se
   inventa un padre ni se borra el renglón.

### 4.2 Comparación normalizada

Un valor del hijo puede venir como número donde el padre lo tiene como texto (ya pasó: 23
IDs se guardaron como número y uno perdió un cero a la izquierda). Antes de comparar:

```
normalizar(v) = String(v).trim().toUpperCase()
```

Y si no hay coincidencia directa, se reintenta rellenando con ceros a la izquierda hasta 8,
que es lo que recupera el `01092110` que Sheets convirtió en `1092110`.

### 4.3 Lo que NO se une por ID

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
4. Por cada renglón `i`: `ID = prefijo + '-' + base32(i, 8) + base32(azar, 6)`
5. Se copia el valor viejo a `ID APPSHEET`.
6. Se escribe todo con **una sola** llamada por columna (`setValues` sobre el rango
   completo), no renglón por renglón.
7. Se verifica que no haya repetidos antes de escribir. Si hay, **aborta** sin escribir.

Todavía nadie lee la columna `ID`: este paso es seguro y repetible.

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
