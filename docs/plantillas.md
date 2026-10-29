# Plantillas de los PDF: el formato nuevo (`{{ }}`)

Desde el 29-oct las plantillas de Google Docs se pueden escribir en un lenguaje propio, más corto y legible que el de
AppSheet (`<<IF([PIEZA] = "BUENO", "✓", "")>>`). Lo llena `src/services/MotorPlantillas.gs`. Las plantillas que siguen en
el formato de AppSheet las sigue llenando `Plantilla.gs`. Cada documento usa **una sola** de las dos formas; `PdfService`
detecta cuál trae.

## La idea: la plantilla muestra, el código calcula

El lenguaje es mínimo a propósito (principio de menor poder, como Mustache):
- **No hay fórmulas, comparaciones ni operaciones.** Si el documento necesita algo calculado (un rango, mayúsculas, un
  total), el módulo lo calcula en el código, con su prueba, y la plantilla solo lo muestra.
- Por eso un documento no puede esconder lógica, y cualquier error se detecta **antes** de generar un PDF.

## Las dos formas

### 1. `{{CAMPO}}`
El nombre de una columna de la hoja del módulo (el mismo nombre de siempre: `{{PLACAS}}`, `{{NO SERIE}}`,
`{{MODELO / AÑO}}`). Los acentos, las mayúsculas y los espacios de más no importan: `{{ Medallón }}` = `{{MEDALLON}}`.

Lo que hace depende del **tipo** del campo, que declara el módulo (su *contrato*):

| Tipo | Qué hace |
|---|---|
| texto, número, fecha | escribe el valor (las fechas como `31/10/2026`) |
| imagen (firmas, diagramas) | pone la imagen ahí, del tamaño de su celda |
| pieza del checklist | ver abajo |

El formato de la marca (negritas, color, tamaño) pasa a su valor: se da formato a `{{PLACAS}}` y así sale la placa.

### 2. `{{si CAMPO}} … {{fin}}`
El texto de en medio sale solo si el campo tiene valor (vacío o `FALSE` = no sale). El bloque abre y cierra en el
**mismo párrafo** y no se pone uno dentro de otro. Las llantas lo usan con un campo calculado por rango, cada bloque
con su color:

```
{{si LLANTA DD MALO}} {{LLANTA DD}} {{fin}}{{si LLANTA DD REGULAR}} {{LLANTA DD}} {{fin}}{{si LLANTA DD BUENO}} {{LLANTA DD}} {{fin}}
```

## El checklist (tablas)

Una sección es una tabla cuya **primera celda es el título con su peso**, y un renglón de encabezado con las opciones:

| Cristalería 10% | Bueno | Regular | Malo | N/A |
|---|---|---|---|---|
| Parabrisas `{{PARABRISAS}}` | | | | |
| Medallón `{{MEDALLON}}` | | | | |

- Cada pieza lleva **una** marca, junto a su nombre. Las celdas de opción van **vacías**.
- Al llenar, la marca se borra y la ✓ va en la columna cuyo encabezado es el valor (`BUENO` → «Bueno»).
- Las opciones de cada pieza son las del encabezado de su tabla, y el formulario de captura las toma de ahí. Para
  agregar «N/A» a una sección basta con agregar la columna.
- El encabezado de opciones puede ir a media tabla (Neumáticos: arriba las llantas en mm, abajo Rines, Tapones…).
- Las secciones se leen de las tablas, no del texto: el acomodo a dos columnas de la hoja ya no importa.
- Una tabla sin «N%» en su primera celda no es checklist: sus marcas son valores normales.

**Agregar una pieza:** un renglón nuevo en su sección con `Nombre {{COLUMNA}}`. La columna tiene que existir en la hoja
(si no, la revisión lo dice). La calificación la cuenta sola, con el peso de su sección.

## Los errores

`MotorPlantillas.revisar` encuentra **todos** los errores de una vez, cada uno con dónde está y, si se puede, qué se
quiso decir:

```
La plantilla del tipo "AUTOS" tiene errores:
  - sección «Cristalería», renglón 3: no existe el campo MEDALON. ¿Quisiste decir MEDALLON?
  - párrafo 4: no se entiende {{IF([X] = "B")}}: una marca es solo el nombre de una columna (…)
  - sección «Inventarios», renglón 2: la celda de «Bueno» trae texto («x»): van vacías
```

Una plantilla con errores **no genera ningún PDF**: un documento a medias es peor que ninguno. Dónde aparecen:
- al abrir la captura de ese tipo;
- en `revisarEntorno()`, que en producción no deja desplegar.

También es error mezclar `<<…>>` y `{{ }}`, una pieza repetida, una imagen como pieza, una marca o texto en una celda
de opción, `{{fin}}` sin `{{si}}` y un bloque sin cerrar.

## Inspecciones vehiculares

- Contrato (`InspeccionesService.contrato_`): las columnas de la hoja de inspecciones, los diagramas y firmas como
  imagen, y lo calculado por llanta (`presentar_`, con el mismo semáforo del puntaje):
  - `LLANTA DD MALO` / `REGULAR` / `BUENO`: «SI» o vacío, para los bloques de color;
  - `LLANTA DD ESTADO`: para poner la llanta en la columna de su rango, con sus mm en vez de la ✓.
- Las 18 plantillas se convierten en el DEV con `InspeccionesPlantillasDev.gs`, siempre sobre copias:
  1. `inspeccionesPlantillasACopias()`: el DEV deja de usar los documentos de producción.
  2. `inspeccionesConvertir1EnsayoAutos()`: convierte AUTOS en una copia temporal y lo compara todo.
  3. `inspeccionesConvertir2EscribirAutos()`: deja la convertida «(DEV NUEVO)» y el DEV la usa.
  4. `inspeccionesConvertir3EscribirTodas()`: las demás; si se acaba el tiempo, se corre otra vez.
  5. `inspeccionesPlantillasAAppSheet()`: regresa.
- El convertidor no deja nada si encuentra una marca o una condición que no sabe traducir, un error, o una diferencia
  en una de dos comparaciones:
  - **la estructura**: secciones, pesos, piezas y opciones contra `REAGRUPAR_SECCIONES` de hoy;
  - **el oráculo**: llena la vieja con `Plantilla.gs` y la nueva con el motor, con los mismos datos, y las compara celda
    por celda. Solo puede cambiar la columna N/A nueva.
- Una diferencia a propósito: las plantillas de AppSheet no imprimían una llanta entre 1.6 y 1.7 mm ni entre 4.0 y
  4.1 mm (sus rangos tenían huecos); las nuevas usan el semáforo del puntaje, sin huecos.
- `inspeccionesProbarMotor()` comprueba el motor en un Google Docs real y temporal (RE2 de `replaceText`, `$` y `\` en
  los valores, formato de las marcas).
- Producción sigue con las plantillas de AppSheet. Pasar a las convertidas es cambiar los 18 IDs de `PLANTILLA` en
  MODELOS INSPECCION, **con autorización**. Las originales no se tocan nunca, así que siempre se puede volver.

## Pendiente
- Líneas (`LineasPdf.gs` tiene su propio evaluador) y, al integrar la rama de Jorge, Responsiva, Adherente y Arqueos
  (este con su `reemplazarMarcador_`): todo al mismo motor.
- Quitar `REAGRUPAR_SECCIONES` cuando las 18 de producción estén en el formato nuevo, y `Plantilla.gs` cuando ya no
  quede un PDF viejo que regenerar con él.
