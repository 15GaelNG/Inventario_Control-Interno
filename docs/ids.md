# Modelo de IDs (la llave que sincroniza todo)

> **Estado al 29/09/2026:**
> - **Generación: hecha.** Todo registro nuevo nace con el formato de aquí, en los dos
>   únicos lugares donde nace un ID. Ver [ids-asignacion.md](ids-asignacion.md), sección 8.
> - **Copia de pruebas: migrada.** Las 24 hojas del catálogo tienen su columna `ID` llena
>   al 100%, ~55,000 renglones.
> - **Producción: sin migrar**, a propósito. Se hace al apagar AppSheet; ver "Cuándo se hace".
> - **El paso 3 (reescribir referencias) no se ha corrido en ningún lado.** Medimos que el
>   `FOLIO` cambió 0 veces en 9,214 correcciones, así que el problema que venía a resolver
>   no se presenta hoy. La herramienta está lista y corregida para cuando haga falta.
>
> Lo medido viene del spreadsheet de producción `ControlVehicular`, solo lectura.
> La bitácora de lo que se ejecutó está en [limpieza-spreadsheet.md](limpieza-spreadsheet.md).
>
> Va de la mano con [relaciones.md](relaciones.md): ese documento explica *cómo* se
> copian los datos entre hojas; este define *con qué llave* se unen.

## La idea en una frase

**La única obligación de un ID es no cambiar nunca.** Todo lo demás sale de ahí.

## Por qué hace falta

Hoy cada hoja resolvió el ID a su manera. Son 23 hojas activas, con **cuatro formatos de
valor** y **siete formas de nombrar la columna**.

| Familia | Ejemplos reales | Dónde |
|---|---|---|
| Hexadecimal de AppSheet (`UNIQUEID()`) | `873bb085`, `e5818de5`, `4d1ce0aa` | Verificaciones, Cambios Vehículos, Reasignaciones, Movimientos, Responsivas… |
| Prefijo aleatorio + contador | `refwf1`, `jnjdc53`, `feced1`, `ncijdc1`, `dv1sd13` | Vehículos, Sensores, Hologramas, Uber, Tickets, Líneas |
| Entero secuencial | `1`, `2`, `3` | Cajas Chicas, y el `FOLIO` de Reactivación y Solicitud |
| Compuesto con significado | `2026_451_1`, `2026_225_001` | Inspección Vehicular, Arqueos |

Los nombres de columna: `ID_VEHICULO`, `ID INSPECCION ` (con espacio al final), `ID CCH`,
`ID Reasignacion Vehicular`, `ID_Movimiento`, `ID`, y en `CAMBIOS LINEAS TELEFONICAS`
**la columna del ID no tiene encabezado**: dice `' '`.

### Lo que ya se rompió

No es teórico. Medido en producción:

- **23 IDs se guardaron como número, no como texto.** Pasa cuando el hexadecimal sale con
  puros dígitos (`68708292`, `32668718`). Con 8 caracteres hex la probabilidad es ~2.3%,
  y con 13,179 registros ya tocó 23 veces.
- **Al menos uno perdió un dígito para siempre.** En `CAMBIOS VEHICULOS` hay un `1092110`
  de 7 cifras donde todos traen 8: era `01092110` y Sheets se comió el cero de la
  izquierda al interpretarlo como número.
- **35 referencias apuntan a esos IDs numéricos.** Funcionan solo mientras alguien se
  acuerde de convertir a texto antes de comparar: `'68708292' === 68708292` es `false`.
- **7 referencias huérfanas.** `eeba06a3` se borró de `LINEAS TELEFONICAS` y quedó citado
  3 veces en `INSPECCIONES LINEAS` y 4 en `RESPONSIVAS LINEAS`.
- **`LINEAS TELEFONICAS.ID` mezcla dos formatos** en la misma columna: `873bb085` junto a
  `DG001`, `DG002`.
- **`LINEAS TELEFONICAS` tiene una columna llamada `#REF!`** (la X): una referencia rota
  que quedó congelada como texto en el encabezado. Un solo dato en toda la hoja: `P-1591`.

## Las reglas

### 1. Separar identidad de descripción

Un renglón tiene dos cosas distintas: *cuál* registro es, y *qué dice*.

- **Llave técnica (PK).** Opaca, no significa nada, nunca cambia, nunca se reusa, no se le
  enseña al usuario. Es la única que une hojas.
- **Llave de negocio.** `FOLIO` (`AUT0024`), `NUCO` (`451`), `No EMPLEADO` (`CIB01608`),
  `SERIE VEHICULO`. Es lo que la gente lee, escribe y busca. **Puede cambiar**, y por eso
  **nunca se usa para unir hojas.**

Hoy se une por la llave de negocio en todos lados: Verificaciones por `FOLIO VEHICULO`,
Sensores por `FOLIO`, Hologramas por `SERIE VEHICULO`, Inspección por `FOLIO` + `NUCO`.
Por eso corregir un folio obliga a perseguir copias por cinco hojas.

### 2. La opacidad es la característica, no una carencia

Un ID que significa algo invita a leerlo, y quien lo lee tarde o temprano lo quiere
**corregir**. `2026_451_1` dice "año 2026, NUCO 451, primera inspección". El día que esa
unidad pase al NUCO 600, alguien va a querer actualizarlo, y ahí el histórico se parte en
dos numeraciones que ya nada relaciona. No hace falta que pase: basta con que sea
tentador. `INS-1M3K8QB07F4XC2` no le da a nadie una razón para tocarlo.

### 3. Codificar solo los hechos que no pueden cambiar

El prefijo rompe la opacidad a propósito, con una regla estrecha. A qué tabla pertenece un
registro **no puede cambiar**: una inspección nunca se vuelve una línea telefónica. El
año, el NUCO y la sede sí cambian, y por eso no van en el ID.

### 4. Hacer el error imposible, no improbable

Los 23 IDs numéricos no pasaron por descuido: el formato **permite** la mala
interpretación. `68708292` es un ID válido y también un número válido, y Sheets elige. Una
validación o la convención de "formatear como texto" dependen de que alguien se acuerde,
siempre. El prefijo elimina la posibilidad de raíz.

### 5. Un ID es un contrato entre sistemas que no se conocen

Ese valor pasa por Sheets, Apps Script, exportaciones a Excel, plantillas de PDF, y por
alguien pegándolo en una caja de filtro. Sale igual de todos o no sirve.

## El formato

```
INS-1M3K8QB07F4XC2
└┬┘ └──┬─┘└──┬─┘
 │      │       └── 6 al azar
 │      └────────── 8 de tiempo
 └───────────────── 3 de tabla
```

18 caracteres. Validación: `^[A-Z]{3}-[0-9A-HJKMNP-TV-Z]{14}$`

- **3 de tabla** — de qué hoja es. Garantiza que Sheets nunca lo lea como número y hace
  visible una referencia mal puesta.
- **8 de tiempo** — **milisegundos** desde 2020-01-01. Alcanza hasta 2054. Al pasar esa
  fecha los IDs siguen siendo únicos (por la parte al azar), solo dejan de ordenarse bien.
- **6 al azar** — mil millones de combinaciones dentro del mismo milisegundo.

> **Se evaluó usar segundos** y ahorrar 2 caracteres. Para el uso diario alcanzaba de
> sobra: son ~30 personas llenando formularios. Se quedaron los milisegundos por dos
> razones que aparecen fuera del uso diario:
>
> 1. **Las cargas masivas.** Una importación mete cientos de renglones casi al mismo
>    tiempo. Con milisegundos se reparten solos; con segundos se amontonan y todo el peso
>    cae en la parte al azar.
> 2. **El orden dentro del segundo.** Una sola operación puede escribir varios renglones
>    seguidos en una bitácora. Con segundos quedan empatados y sin orden definido entre
>    ellos; con milisegundos el orden es exacto.
>
> **La parte al azar no se encoge tampoco.** Con 6 caracteres, mil renglones en el mismo
> instante dan 0.047% de colisión; con 4, el mismo caso sube a ~50%.

**Alfabeto: base32 de Crockford**, `0123456789ABCDEFGHJKMNPQRSTVWXYZ`. No tiene `I`, `L`,
`O` ni `U`: las tres primeras porque se confunden con `1` y `0` al leer o teclear un ID;
la `U` porque sin ella el azar no puede formar una grosería en un ID que va impreso en un
PDF que ve el cliente.

### Por qué el tiempo adentro, y no puro azar

No es por ordenar bonito. **Cambia la matemática de las colisiones.**

Con un ID puramente aleatorio, dos registros chocan si coinciden entre *todos los que
existieron jamás* — el problema del cumpleaños. Con 8 hexadecimales:

| Registros en la tabla | Probabilidad de al menos una colisión |
|---|---|
| 2,062 (Tickets) | 0.05 % |
| 35,538 (Cambios Líneas, **hoy**) | **13.7 %** |
| 50,000 (esa misma, en unos años) | **25 %** |

`CAMBIOS LINEAS TELEFONICAS` ya trae 35,538 renglones y es una bitácora: crece un renglón
por cada campo que alguien modifica, sin techo.

Con el tiempo adentro, dos registros solo pueden chocar si se crearon **en el mismo
milisegundo** y además sacaron el mismo número al azar. El universo deja de ser "todos los
registros de la tabla" y pasa a ser "los de ese milisegundo", que con formularios llenados
por personas es uno. La probabilidad deja de crecer con el tamaño de la tabla.

De regalo: como el tiempo va al inicio y con ancho fijo, **ordenar alfabéticamente es
ordenar por fecha de creación**, sin depender de una columna de fecha. Útil justo en las
tablas que más crecen (`CAMBIOS VEHICULOS` 9,214, `CAMBIOS LINEAS` 35,538, Tickets 2,062).

### El ID se genera solo en el servidor

Con un componente de reloj, dejar que cada celular ponga su hora sería meter el desorden de
46 relojes. Apps Script tiene uno solo. **Nunca generar un ID en el navegador.**

### Nombres de columna

- La llave propia de la hoja se llama **`ID`**, exactamente, siempre.
- Una referencia a otra hoja se llama **`ID <ENTIDAD>`**: `ID VEHICULO`, `ID LINEA`,
  `ID CCH`, `ID ARQUEO`.

Así, en cualquier hoja, `ID` es "el mío" y `ID algo` es "el de alguien más". Sin guiones
bajos, sin minúsculas, sin espacios de sobra, sin acentos.

### Un solo generador

Hoy hay seis servicios haciendo `Utilities.getUuid().slice(0, 8)` cada quien por su lado,
más dos contadores propios. Nadie fue flojo: no había dónde ponerlo. Todo pasa a
`src/utils/Ids.gs`:

```js
Ids.nuevo('VEH')        // → 'VEH-1M3K8QB07F4XC2'
Ids.es('VEH', valor)    // valida prefijo y forma
Ids.prefijo(valor)      // → 'VEH'
Ids.fecha(valor)        // → Date de creación, leída del propio ID
```

Un invariante que no se aplica en un solo lugar no es un invariante, es una costumbre.

### No se borra, se da de baja

Las 7 referencias huérfanas existen porque se borró el renglón padre. Con `ACTIVO = FALSE`
en vez de borrar, una referencia vieja siempre encuentra a quién apuntar.

## Prefijos por hoja

Una hoja de registros = un prefijo. Las vistas no llevan prefijo propio: "Detalles de
Líneas Telefónicas" es la vista de tarjetas de `LINEAS TELEFONICAS`, y "Gestión de
Activos" es la vista por colaborador.

| Módulo | Hoja | Prefijo | ID de hoy | Llave de negocio |
|---|---|---|---|---|
| Vehículos | `VEHICULOS` | `VEH` | `ID_VEHICULO` (`refwf1`) | `FOLIO`, `SERIE VEHICULO` |
| Cambios Vehículos | `CAMBIOS VEHICULOS` | `CVE` | `ID_CAMBIO` (hex) | — |
| Reasignaciones Vehiculares | `REASIGNACIONES_VEHICULOS` | `RVE` | `ID Reasignacion Vehicular` | — |
| Verificaciones | `VERIFICACIONES` | `VER` | `ID_VERIFICACION` (hex) | — |
| Inspección Vehicular | `INSPECCION VEHICULAR` | `INS` | `ID INSPECCION ` (`2026_451_1`) | `FOLIO INSPECCION` |
| Instalación de Sensores | `INSTALACION DE SENSORES` | `SEN` | `ID_SENSOR` (`jnjdc53`) | `SERIE SENSOR` |
| Hologramas | `HOLOGRAMAS` | `HOL` | `ID_HOLOGRAMA` (`feced1`) | `NO ECONOMICO` |
| Incidencias | `INCIDENCIAS` | `INC` | `ID_INCIDENCIA` (hex) | — |
| Líneas Telefónicas | `LINEAS TELEFONICAS` | `LIN` | `ID` (mezclado) | `FOLIO`, `NUCO` |
| Inspecciones de Líneas | `INSPECCIONES LINEAS` | `ILI` | `ID` (hex) | — |
| Control de Reasignaciones - Líneas | `RESPONSIVAS LINEAS` | `RLI` | `ID` (hex) | — |
| Reactivación de Líneas | `REACTIVACION DE LINEAS` | `REA` | `ID` (`cfqerf1`) | `FOLIO` |
| Solicitud de Líneas | `SOLICITUD DE LINEAS` | `SOL` | `ID` (`nmmtu1`) | `FOLIO` |
| Control de Cambios - Líneas | `CAMBIOS LINEAS TELEFONICAS` | `CLI` | **columna sin encabezado** | — |
| Bitácora de Desechos | `BITACORA DE DESECHO` | `DES` | `ID_DESECHO` | `FOLIO DESECHO` |
| Inventario de Accesorios | `ACCESORIOS CELULARES` | `ACC` | `ID_Accesorio` (hex) | — |
| " (movimientos) | `MOVIMIENTOS_ACCESORIOS` | `MAC` | `ID_Movimiento` (hex) | — |
| Arqueos | `ARQUEOS` | `ARQ` | `ID ARQUEO` (`2026_225_001`) | `FOLIO ARQUEO` |
| Caja Chica | `CAJAS CHICAS` | `CCH` | `ID CCH` (`1`, `2`, `3`) | `ID CCH` actual |
| Cambio de Monto | `INCREMENTOS` | `MON` | `ID` (hex) | — |
| Uber | `UBER` | `UBE` | `ID` (`ncijdc1`) | — |
| Tickets | `TICKETS` | `TCK` | `ID` (`ncjn1`) | — |
| Colaboradores | `COLABORADORES` | `COL` | `No EMPLEADO` | `No EMPLEADO` |

> `ILI` y `RLI` los asigné por inferencia del catálogo de módulos. **Que los confirme
> Emmanuel** antes de escribir nada.

## Reglas de negocio confirmadas

Salieron de medir las hojas y preguntarle a Ayrton (29/09/2026). Están aquí para no
volver a abrir la discusión.

- **`NUCO` / `NUCCO` es la parte numérica del `FOLIO`.** Es un dato **derivado**, no una
  llave. Medido: Inspección 298/298, Vehículos 645/652, Líneas 1504/1615 — o sea que
  **~118 registros ya se desincronizaron** de su propio folio. En Líneas hay además otra
  regla (`EQS1001` → NUCO `11001`). Consecuencia para el modelo: **nada se une por NUCO**,
  y a futuro convendría dejar de guardarlo y calcularlo.
- **Un vehículo y una línea con el mismo NUCO no son la misma cosa.** Coinciden 76.5% por
  pura casualidad: los dos son enteros chicos. Es el mejor ejemplo de por qué el prefijo
  hace falta.
- **`ARQUEOS.ID CCH` apunta a `CAJAS CHICAS`**, no a `VEHICULOS.NUCCO`. Comprobado por el
  negocio: de 112 arqueos, el `RESPONSABLE` coincide con el de la caja chica en 112 de 112,
  y con el del vehículo con ese NUCCO en 0 de 112. Por valor los dos empataban al 100%.
- **`SERIE SENSOR` se captura a mano**, viene impresa en el sensor. No hay ningún bot de
  AppSheet que la escriba (ver [relaciones.md](relaciones.md)).
- **Una instalación de sensor por vehículo, y se sobrescribe.** Al cambiar de sensor se
  reescribe la misma fila, así que no hay histórico de reemplazos.
- **`COLABORADORES` no está actualizado y se trata como tal.** 50 empleados de Vehículos y
  120 de Responsivas no existen ahí. `No EMPLEADO` **no** puede ser llave foránea con
  integridad: es una llave de negocio que admite referencias sueltas.
- **Los hologramas pueden ser de unidades que no están en `VEHICULOS`** (particulares):
  111 de 255. Su referencia al vehículo es **opcional a propósito**.
- **`IDENTIFICACION` no es un ID.** En `INSPECCIONES LINEAS` es un ítem del checklist
  (`SI`/`NO`/`N/A`, junto a `CUBO` y `CABLE`); en `RESPONSIVAS LINEAS` es el tipo de
  identificación con que se firmó (`INE`, `LICENCIA DE CONDUCIR`). No entra al modelo.

### Pendiente de Emmanuel

- **`REACTIVACION DE LINEAS.IMEI` no trae IMEIs.** De 321 valores, solo 28 son IMEIs de
  15 dígitos; **290 son hex de 8**, o sea IDs de línea, y 293 existen en
  `LINEAS TELEFONICAS.ID`. La columna se llama una cosa y guarda otra.

### Pendiente de Jorge

- **`CAMBIOS VEHICULOS` cita 228 folios que no existen** en `VEHICULOS`: mezcla `AUT0001`,
  números sueltos como `314`, y cosas como `15616FDC15`. Define si esa bitácora se migra
  o se archiva.

## Qué pasa con `2026_451_1` y `2026_225_001`

No se tiran: **se quedan como llave de negocio**, renombradas a `FOLIO INSPECCION` y
`FOLIO ARQUEO`. Junto a ellas entra una `ID` de verdad.

No sirven como PK porque codifican el año y el NUCO, y el contador **reinicia**. Pero la
gente los reconoce y salen impresos en los PDFs, así que se conservan.

## Los registros que ya existen

> El detalle completo —el algoritmo, hoja por hoja y paso por paso— está en
> [ids-asignacion.md](ids-asignacion.md). Aquí va la decisión y su porqué.

**El tiempo del ID viejo sale del orden de los renglones, no de ninguna columna de fecha.**

Se evaluó derivar el tiempo de la fecha de cada hoja, y se descartó con esta evidencia: la
medición de `fechas-de-alta.xlsx` incluye una columna **"EN ORDEN %"**, que es exactamente
*si la fecha coincide con el orden de los renglones*. En **12 de 20 hojas da 100%** —
fecha y orden dicen lo mismo, así que usar el orden no pierde nada. En las otras 8 no
coinciden, y ahí la sospechosa es la **fecha**, no el orden: son fechas recapturadas
después. Ejemplos: `LINEAS TELEFONICAS.FECHA REGISTRO` al 51%, `INSTALACION DE SENSORES`
al 66%, `UBER.FECHA DE ALTA` llena solo en **9%** de las filas en producción.

O sea que el orden de renglones es al menos igual de bueno en todas y mejor en las sucias.
Y además resuelve las tres hojas que no tienen fecha usable: `RESPONSIVAS LINEAS` (su
`FECHA RESPONSIVA` está vacía, 0 de 899 en producción), `ACCESORIOS CELULARES` y
`COLABORADORES`.

**No se pierde nada:** las columnas de fecha se quedan en la hoja tal como están. Solo
dejan de usarse para construir el ID.

### El bloque reservado

Los registros viejos **no reciben una fecha que parezca real**. Si a uno se le pusiera
marzo de 2024, `Ids.fecha()` devolvería esa fecha con total confianza y estaría mintiendo.

En vez de eso van a un bloque al inicio de la época: **1 milisegundo por renglón desde
2020-01-01**. La hoja más grande son 35,538 renglones, o sea 36 segundos. Ordenan entre
ellos en el orden de la hoja, ordenan antes que todos los nuevos, y un timestamp de 2020 es
obviamente no real. `Ids.fecha()` devuelve `null` para ellos: es la diferencia entre "no sé
cuándo se creó" y una mentira con cara de dato.

Esto además neutraliza el único riesgo del método. Si alguien alguna vez ordenó una hoja
por folio, el orden de renglones ya no es el de captura — pero como no estamos afirmando
"esta es la fecha de creación" sino "este es el orden de la hoja", que es cierto por
construcción, deja de importar.

Durante la transición se guarda el valor viejo en una columna **`ID APPSHEET`**, para que
cualquier PDF o reporte impreso que lo cite se siga pudiendo encontrar. Se borra cuando ya
nadie lo busque.

## Cuándo se hace: ensayo en dev, cutover al apagar AppSheet

Agregar una columna a una hoja **rompe la app de AppSheet** hasta que alguien entre al
editor y regenere la estructura. La documentación oficial es explícita: *"or AppSheet won't
know how to locate the columns to read and write data and your app will stop functioning"*.
Y le pega a los usuarios en campo, no solo al editor. Con 46 personas capturando desde el
celular, eso es una ventana en la que nadie trabaja.

Pero como esta web app va a **reemplazar** AppSheet, el día del apagado no hay esquema que
regenerar. El costo desaparece si se hace en el momento correcto:

1. **Ahora: todo en dev.** Escribir `Ids.gs` y el script, correrlo contra la copia de
   pruebas, verificar las 23 hojas, adaptar los joins, probar. Producción intacta.
   La copia de dev sirve: **22 de 23 hojas tienen estructura idéntica** a producción
   (la única distinta es `LINEAS TELEFONICAS`, por la columna `#REF!` de arriba).
2. **Mientras tanto:** la web app sigue uniendo por `FOLIO`, con `Relaciones.gs`. Nada
   cambia para los usuarios.
3. **Al apagar AppSheet:** se corre en producción el mismo script ya ensayado, sin nadie
   adentro y sin regenerar nada.

### Orden dentro de la migración

Dentro de cada ambiente, estos cuatro pasos **en este orden**:

1. **Limpiar lo roto.** Los dos encabezados sin nombre de `CAMBIOS LINEAS TELEFONICAS`, el
   espacio final de `ID INSPECCION `, la columna `#REF!`, y decidir qué hacer con las 7
   referencias huérfanas de `eeba06a3`.
2. **Llenar la columna `ID`** en cada hoja. Solo escribir; todavía nadie la lee.
3. **Reescribir las columnas de referencia** al ID nuevo, con el mapa del paso 2.
4. **Hasta entonces**, cambiar el código para unir por `ID` en vez de por `FOLIO`.

El 4 antes del 2 deja el sistema sin llaves. El 3 antes del 2, con referencias a IDs que
no existen.

## Qué resuelve

`Relaciones.gs` existe para perseguir copias de `FOLIO` por cinco hojas cada vez que
alguien lo corrige. Con las hojas unidas por una llave que no cambia, esa persecución deja
de hacer falta: el folio se corrige en `VEHICULOS` y ya. Lo que sigue siendo útil de
`Relaciones` es `revisar()`, para las columnas que se copian por comodidad de lectura.

## Lo que NO hacer

- **IDs con significado** (año, NUCO, sede, consecutivo). Ya tenemos dos y los dos
  reinician el contador. Un dato que cambia no puede ser una llave que no cambia.
- **Enteros secuenciales** (`1`, `2`, `3`). Sheets los guarda como número, se duplican al
  insertar en paralelo y no dicen de qué hoja son.
- **Generar el ID en el navegador.** El reloj tiene que ser uno solo.
- **Reusar el ID de un renglón borrado.**
- **Dejar que cada servicio invente su formato.** Es cómo llegamos aquí.
