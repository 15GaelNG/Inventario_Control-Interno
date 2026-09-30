# El guion de la corrida: ensayo en el laboratorio, y el viernes en el libro bueno

> Este documento se usa **dos veces**: primero como ensayo sobre el laboratorio, y el
> viernes tal cual sobre el libro nuevo. Los pasos son los mismos; lo único que cambia es a
> qué libro apunta el proyecto.

Se lee junto con [ids-asignacion.md](ids-asignacion.md) (los cuatro pipelines) y
[limpiezas-planeadas.xlsx](../limpiezas-planeadas.xlsx) (lo que NO hace el pipeline).

## Antes de empezar: qué NO hace esto

El pipeline pone IDs y cablea referencias. **No limpia datos.** Las 16 limpiezas medidas
—los centinelas de `VEHICULOS`, las columnas vacías de Líneas, las dos cajas chicas de gente
dada de baja— van aparte y están en el Excel. No las esperes en la salida.

Y un módulo va a tronar a propósito: **Accesorios**. Su `ID_Accesorio` es llave propia en una
hoja y foránea en otra, así que su cambio depende del pipeline 3, que está en pausa. No es
una falla de la corrida.

---

## Paso 0 — La foto de antes  *(2 min, solo lectura)*

Sin esto no hay con qué comparar después. Es la red **externa**: el pipeline se audita a sí
mismo por dentro, y esto lo audita por fuera, leyendo el spreadsheet por API.

```
uv run --no-project --with google-api-python-client --with google-auth \
  python tools/verificar-migracion/verificar.py foto ensayo-antes.json
```

Para el libro bueno: agrega `--libro=<id del libro nuevo>`.

**Lo que debe decir:** 24 hojas, y la columna `ID ANT` vacía en todas. Si alguna ya trae
`ID ANTERIOR`, ese libro ya se migró: **detente** y averigua por qué.

La del laboratorio el 30/09/2026: **60,179 filas**, 8 hojas con `ID` (valores viejos, 0 con
la forma nueva), ninguna con `ID ANTERIOR`.

---

## Paso 1 — El ensayo del pipeline 1  *(1 min, no escribe)*

En el editor de Apps Script del proyecto que apunta al libro: **`ids1Ensayo`**.

**Lo que debe decir:**

Esta es la salida real del laboratorio el 30/09/2026, ya con los encabezados deducidos:

| Paso | Qué esperar |
|---|---|
| 1 `revisar` | **`Sin problemas.`** Las dos columnas sin encabezado de `CAMBIOS LINEAS TELEFONICAS` aparecen como detalle informativo, diciendo qué nombre les va a poner el paso 2 |
| 2 `renombrar` | **`1 encabezado(s) por poner deducidos del contenido`** y **`20 columnas por renombrar, 4 respetadas por ser dato de negocio`**, con `CAMBIOS LINEAS TELEFONICAS` col. 1 resuelta *por POSICIÓN* y col. 3 *deducida del contenido* |
| 3 `ids` | `24 hojas procesadas, 0 ya migradas, 60114 renglones` |
| 4 `mover` | `0 hojas por mover` — normal: el paso 3 no escribió, así que casi todas dicen "todavía no tiene columna ID" |
| 5 `respaldo` | `0 hojas con respaldo de más` |
| 6 `auditar` | **`FALLAS (16): no tiene columna ID`** más las 8 de Líneas como **`SIN MIGRAR`**. 16 + 8 = 24: es la foto correcta de un libro sin migrar |

**La cuenta que de verdad hay que hacer**, porque es la única que no se puede leer a ojo:

```
60,179  filas del paso 0 (la foto externa)
   -65  filas con la llave vieja en blanco, que el paso 3 se salta a propósito
        (INSPECCION VEHICULAR 4 · HOLOGRAMAS 1 · INSPECCIONES LINEAS 5 ·
         RESPONSIVAS LINEAS 48 · REACTIVACION DE LINEAS 3 ·
         ACCESORIOS CELULARES 3 · MOVIMIENTOS_ACCESORIOS 1)
━━━━━━
60,114  renglones que reporta el paso 3   ✓ cuadra exacto
```

Si esa resta no da exacto, algo se está saltando filas sin decirlo: **detente**.

**Cuándo NO seguir:**

- Si el paso 1 dice `PROBLEMAS` de cualquier cosa. Ya no hay ninguno tolerado.
- Si el paso 2 no dice exactamente `20 ... 4 respetadas`.
- Si el paso 3 dice "ya migradas" con un número distinto de 0.
- Si la resta de arriba no cuadra.

**Y dos cosas que parecen raras y no lo son.** El paso 3 dice de varias hojas *"el viejo se
queda en `ID_VEHICULO`"* en vez de *"se respalda en `ID ANTERIOR`"*: es porque en el ensayo
el paso 2 no escribió, así que el 3 ve los nombres de antes. En la corrida de verdad las 20
van a decir `ID ANTERIOR`. Y el paso 4 nombra `APP_EVIDENCIAS` y `APP_MOVIMIENTOS`, que no
son de las 24 — son hojas de la app y ya traían su `ID` al inicio.

---

## Paso 2 — El pipeline 1, de verdad  *(escribe)*

**`ids2Escribir`**

Es la primera vez que algo se escribe. Toca las 24 hojas: renombra 20 columnas, crea la
columna `ID` y la llena con ~60,000 identificadores.

**Si se corta por tiempo** ("SE DETUVO POR TIEMPO"): vuelve a correr lo mismo. Los pasos ya
hechos se saltan solos, no guarda avance porque no le hace falta.

**Lo que debe decir al final:** `LISTO: corrieron los 6 pasos`, y la auditoría del paso 6
**sin FALLAS**.

---

## Paso 3 — La verificación externa  *(2 min, solo lectura)*

Aquí es donde se sabe de verdad.

```
uv run --no-project --with google-api-python-client --with google-auth \
  python tools/verificar-migracion/verificar.py foto ensayo-despues.json

uv run --no-project --with google-api-python-client --with google-auth \
  python tools/verificar-migracion/verificar.py comparar ensayo-antes.json ensayo-despues.json
```

Comprueba siete cosas, y **ninguna depende de que el pipeline diga la verdad**:

1. No se perdió ni se inventó un renglón en ninguna hoja.
2. Las 24 tienen columna `ID`.
3. Está en la columna 1.
4. Todos los ids tienen la forma nueva **y el prefijo de su hoja**.
5. No hay ids repetidos.
6. Las 20 tienen `ID ANTERIOR`, y las **4 de negocio NO la tienen** y conservan su columna.
7. No desapareció ninguna otra columna.

**Lo que debe decir:** `SIN PROBLEMAS: las 24 hojas cuadran.`

Si dice algo más, **no sigas** — y el checkpoint para volver es replanchar el laboratorio
desde producción (`replanche1Ensayo` / `replanche2Escribir`).

---

## Paso 4 — Homologar Vehículos  *(escribe)*

**`vehiculos1Ensayo`** y, si cuadra, **`vehiculos2Escribir`**.

El paso `referencias` **nunca ha corrido**: en el ensayo del pipeline 1 ni se pudo intentar,
porque lee la columna `ID` que el paso 3 escribe. Esta es su primera ejecución real. Escribe
la columna `ID VEHICULO` en 7 hojas.

**Tasas esperadas** (medidas el 30/09/2026):

```
VERIFICACIONES             426/426  100%
REASIGNACIONES_VEHICULOS   361/361  100%
INSPECCION VEHICULAR       298/302   99%
INCIDENCIAS                  1/1    100%
INSTALACION DE SENSORES    207/208   99%
CAMBIOS VEHICULOS         7309/9213  79%   <- esperado: log de unidades ya borradas
HOLOGRAMAS                 144/255   56%   <- esperado: 91 personales + 13 con "_" + 7 basura
```

Esos dos últimos números **no son fallas**. Están explicados en
[relaciones.md](relaciones.md) y en el Excel, hoja *Lo que NO se toca*.

De las 111 huérfanas de Hologramas, **13 son recuperables**: su serie trae un `_` de más al
inicio y sin él sí existe en `VEHICULOS`. Eso es limpieza de datos, no del pipeline, y por eso
la corrida las dejó intactas en vez de inventarles un padre — que es justo lo que debe hacer.
Están en el Excel de limpiezas.

Y la única huérfana de `INSTALACION DE SENSORES` es literalmente **`SIN FOLIO`**: un
centinela. Que aparezca ahí es el diseño funcionando, no una falla.

### Aquí el libro queda SELLADO

Este paso es el punto sin retorno, y el código ahora lo sabe. Mientras los IDs solo vivían
en su columna, regenerarlos era inofensivo. En cuanto esta corrida escribe `ID VEHICULO` en
las 7 hojas hijas, esos IDs dejan de ser un dato y se vuelven la llave de la que cuelga
todo: regenerarlos ya no los "actualiza", **deja huérfana cada referencia**, en silencio y
sin forma de reconstruirla, porque el vínculo viejo ya se sobrescribió.

Así que al terminar, el paso avisa que el libro quedó sellado, y desde ese momento **se
niegan a correr** las dos funciones que lo romperían:

| Función | Por qué se niega |
|---|---|
| `asignarIds({rehacer: true})` | pisa IDs que ya existen |
| `pipelineRevertirEscribir` / `migracionRevertir({escribir:true})` | restaura los viejos, y los nuevos ya están cableados |

Lo que **sí** sigue corriendo con el sello puesto: los ensayos de las dos (no escriben), y
`asignarIds` sin `rehacer` — ese solo llena huecos, y es justo el que hay que volver a
correr si la corrida se corta por tiempo.

Para ver el estado: **`migracionEstadoSello`** (solo lee). El sello se guarda por id de
libro, así que sellar el laboratorio no sella producción. Quitarlo obliga a borrar a mano la
Script Property `MIGRACION_IDS_SELLADOS`, y después hay que volver a correr
`reescribirReferencias`; es incómodo a propósito.

---

## Paso 5 — Usar la app  *(lo que ninguna prueba puede hacer)*

El paso que más importa y el único que no se puede automatizar.

Se le cambió la identidad de renglón a **7 servicios** y la huella a **8 pestañas**. Las
pruebas leen el *código fuente*: verifican que ningún servicio use el nombre viejo, **no que
la app funcione**. Eso se comprueba usándola.

Abre la app sobre el libro y en cada módulo: **listar, abrir un registro, editar un campo,
guardar, y volver a listar** para ver que el cambio quedó.

| Módulo | Qué se le cambió |
|---|---|
| Vehículos | llave de renglón y la generación de ids nuevos |
| Hologramas | huella de pestaña, 4 búsquedas, el alta |
| Sensores | huella, 3 búsquedas, el alta |
| Verificaciones | huella, 2 búsquedas, el alta |
| Inspecciones | huella (su folio `ID INSPECCION` **no** cambió) |
| Incidencias | 2 búsquedas y el alta |
| Reasignaciones | llave de renglón |
| **Accesorios** | **nada — va a tronar, es esperado** |

Y da de alta **un registro nuevo** en Hologramas o Verificaciones: eso comprueba que el id
nazca con `Ids.nuevo` y no con el generador viejo.

---

## Paso 6 — Los otros dos pipelines

**`cajaChica1Ensayo`** / **`cajaChica2Escribir`** — 2 referencias, las dos al 100%. Es la
familia más sana; no debería haber sorpresas.

**Líneas queda para después.** Hubo junta del área y se esperan cambios; además el módulo de
Accesorios depende de esa corrida. Ver [lineas-homologacion.md](lineas-homologacion.md).

---

## Para el viernes, lo que cambia

1. **La copia se hace con Archivo → Hacer una copia**, no con el replanchado. El replanchado
   copia solo valores: perdería validaciones, formato condicional y notas. Google clona todo.
2. **`SS_ID_VEHICULOS`** del proyecto apunta al libro nuevo.
3. El paso 0 lleva `--libro=<id nuevo>`.
4. Y una decisión pendiente: **el libro nuevo entra sin las guardas de producción.** Las
   tres llaves del pipeline (autorizar producción, declarar AppSheet apagado, exigir
   respaldo) solo se disparan contra el ID de producción, que está fijo en el código. El
   libro nuevo tendrá otro ID, así que no pedirá respaldo ni confirmación. Si se quiere, se
   le pone la misma exigencia; son diez minutos.

   Lo que **sí** ya protege al libro nuevo es el sello del paso 4, que no depende del ID:
   funciona en cualquier libro donde se escriban referencias. Era la guarda que faltaba, y
   la única cuyo daño no se podía deshacer ni con el respaldo, porque nadie se habría dado
   cuenta hasta mucho después.

5. **Después de la corrida, y solo después**, Emmanuel borra las 4 pestañas de Líneas que
   quedaron de más. Si las borra antes, el paso 1 se detiene con `FALTA la hoja` cuatro
   veces. Y al borrarlas hay que quitarlas de `Entidades` y sus 3 entradas de
   `MIGRACION_REFERENCIAS`, o el bloqueo solo se mueve a la corrida siguiente. Ver el aviso
   en [lineas-homologacion.md](lineas-homologacion.md).
