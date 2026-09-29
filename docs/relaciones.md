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

`VEHICULOS.DEPARTAMENTO` no siempre guarda un departamento. Medido en producción el
29/09/2026 (solo lectura), **164 de 648 filas (25%)** traen un valor que no está en el
catálogo `DEPARTAMENTOS`:

| Valor | Filas | Qué es |
|---|---|---|
| `BAJA VEHICULAR` | 123 | un **estatus**, no un área |
| `NUCO SIN INFORMACION` | 14 | relleno |
| `SIN ESPECIFICAR` | 2 | relleno |
| `OOAM TECNICO` | 18 | parece un área **real que falta en el catálogo** |
| `OOAM ADMINISTRATIVO` | 7 | igual |

Los tres primeros están en la constante `CENTINELAS` de `Relaciones.gs` y **nunca se
propagan ni se corrigen**: escribirlos no arregla nada, *pisa* el área buena que la copia
sí tiene. Con los números de ese día, una corrida de `revisar({corregir:true})` sin esta
guarda habría escrito `BAJA VEHICULAR` encima de **9 hologramas**, y de **4 inspecciones**
si `INSPECCION VEHICULAR` hubiera entrado como caché.

Los dos últimos **no** son centinelas: lo correcto ahí es darlos de alta en
`DEPARTAMENTOS`, no dejar de propagarlos. Un centinela se loguea como `OMITIDO_CENTINELA`
y se cuenta aparte, porque **lo que hay que arreglar es el catálogo, no la copia**.

> **Pendiente de negocio, no de código:** `VEHICULOS` ya tiene una columna `ESTATUS`. Que
> `DEPARTAMENTO` se use además para marcar la baja es lo que obliga a esta guarda. Sacar
> las 123 bajas a `ESTATUS` dejaría `DEPARTAMENTO` limpia y `CENTINELAS` casi vacía.

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

## Inventario de copias (mantener al día)

| Hoja que copia | Clave | Columnas copiadas | Desde | Cómo se copia hoy | Pendiente |
|---|---|---|---|---|---|
| `VERIFICACIONES` | `FOLIO VEHICULO` | `PLACA` | `VEHICULOS` | `VerificacionesService`: al registrar y al cambiar el folio (copia en 2 lugares) | Unificar en `datosDeVehiculo_` (regla 1) |
| `INCIDENCIAS` | `FOLIO` | `DEPARTAMENTO`, `MODELO` | `VEHICULOS` | **Los manda el formulario** (autocompletado en el navegador) y son editables. En el `MAPA` como **`bitacora`**: se reportan, no se corrigen | Copiarlos en el servidor; quitar edición (regla 2) |
| `INSPECCION VEHICULAR` | `FOLIO` | `DEPARTAMENTO`, `SEDE`, `OFICINA / DESARROLLO`, `RESPONSABLE` | `VEHICULOS` | En el `MAPA` como **`bitacora`**: se reportan, no se corrigen | Nada: congelada a propósito |
| `TICKETS` | — | (ninguna) | — | **No está en el `MAPA` y no debe estar.** Su `DEPARTAMENTO` es el de quien **levantó** el ticket (va pegado a `SOLICITANTE`), no el del vehículo: 320 de sus filas no coinciden con el catálogo, y eso es correcto | Nada |
| `INSTALACION DE SENSORES` | `FOLIO` | 13 columnas: `SERIE VEHICULO`, `PLACA`, `MARCA`, `CLASE`, `LINEA VEHICULO`, `MODELO`, `COLOR`, `CAPACIDAD DE COMBUSTIBLE`, `RAZON SOCIAL`, `DEPARTAMENTO`, `SEDE`, `OFICINA / DESARROLLO` (← `UBICACION`), `RESPONSABLE` (← `RESPONSABLE VEHICULO`) | `VEHICULOS` | `SensoresService.datosDeVehiculo_` (función temporal, regla 1); no son editables en el módulo | Reemplazar por `Relaciones.datosParaNuevo` |

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
