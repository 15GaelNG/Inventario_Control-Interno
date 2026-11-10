# Un solo motor de PDF: medición y avance

Plan aprobado el 5-nov-2026: los tres motores de PDF (`PdfService` + `Plantilla` para Vehículos, `LineasPdf` para
Líneas y el propio de Arqueos) pasan a uno solo, `PdfService`, con lo de cada documento como configuración por
plantilla. Se mide antes de cambiar nada, para optimizar con números. Reabre la fase 5.4 de
`docs/homologacion-codigo.md`.

| Fase | Qué | Estado |
|---|---|---|
| 0 | Medir cada paso de los tres motores (`Cronometro`) | hecha en código; falta la tabla base |
| 1 | Inventario de marcadores de cada plantilla + prueba diferencial | hecha (9-nov): ver «Resultado de la fase 1» |
| 2 | `Plantilla` entiende todo lo de Líneas (analizador) | hecha (9-nov): ver «Resultado de la fase 2» |
| 3 | Motor de documento en `PdfService` + comparador en el DEV | pendiente |
| 4 | Líneas sobre `PdfService` (ID de plantilla por entorno) | pendiente |
| 5 | Arqueos sobre `PdfService` (avisar a Jorge antes) | en HTML (10-nov, encendido en DEV): ya no copia la plantilla |
| 6 | Optimizar con los números (plantilla preparada solo en DEV hasta autorizar prod) | pendiente |

Reglas acordadas: se queda la sintaxis `<< >>`; un marcador que el motor no entiende **queda visible en el PDF y
se avisa**; producción sigue con las plantillas de siempre hasta comprobar las nuevas.

## El giro: los documentos en HTML, sin Google Docs (10-nov)

El usuario decidió dejar los Docs (los formatos solo los cambiamos nosotros). Cada documento pasa a ser un HTML con
medidas en puntos (`src/html/pdf/<documento>.html`), lo llena `PdfHtml.llenar` (`src/utils/PdfHtml.gs`) y lo convierte
Apps Script (`Utilities.newBlob(html, 'text/html').getAs('application/pdf')`): sin copiar ninguna plantilla. Entra por
el mismo `PdfService.generar` / `generarVistaPrevia` con `p.html = '<documento>'`, así los servicios no cambian de
forma. Las fases 3 a 6 de arriba (motor sobre el Doc) se reemplazan por esto; `Plantilla` sigue para lo que aún sale
del Doc.

**Responsiva vehicular** (la primera): contra 10 responsivas reales de producción, **mismos cortes de renglón** en
todas y desfase de 0.5 pt o menos; **1.1–1.7 s por PDF** (contra 10–30 s del Doc).

Lo que exige el convertidor (medido; vale para todos los documentos):

| Hallazgo | Qué se hace |
|---|---|
| No tiene tipografías instaladas ni carga URLs (`@font-face` con `https:` no carga) | se **incrustan** (data URI; ttf, woff y woff2 sirven) |
| El compresor de `npm run push` tira un marcador dentro del CSS | `llenar()` pone las `@font-face` en su propio `<style>` |
| Sin más, redondea el ancho de cada letra a pixeles: el texto sale 2–5 % más angosto y los renglones cortan distinto | `text-rendering: geometricPrecision` (con eso, 0.05 % de error); `zoom` o `transform` no sirven |
| Redondea posiciones a 0.75 pt (pixeles de 96 dpi) | el límite de precisión es ±0.4 pt |
| `@page { size: 612pt 792pt; margin: 0 }` sí lo respeta | cada hoja es un `div` de 612 × 792 pt con posiciones absolutas |
| Tiene MS PGothic (la de las ✓ de Docs) | las casillas usan esa |
| El justificado de Docs es irregular (estira unos espacios sí y otros no) y su regla de corte es fina | no se imita el justificado; el **ancho** de cada párrafo se calibra con los PDF reales hasta que corte igual (`comparar.py --anchos`) |

Las tipografías (comerciales) y los logos **no van en el repo**: viven en `RECURSOS PDF` de la raíz de cada proyecto
(`<Familia>-<regular|bold|italic|boldItalic>.ttf`, `logo-<nombre>.png`), recortadas al español y sin kerning
(`tools/pdf/html/recursos.py`), y se guardan en la caché por trozos. Se instalan con `pdfRecursosInstalar(<carpeta>)`
(editor, `utils/PdfHtml.gs`) o, en un DEV, `node tools/pdf/html/pedir.js instalar`.

**Encendido por documento:** `PdfHtml.DOCUMENTOS` (`{ dev, prod }`). En un DEV en cuanto pasa su comparación; en
producción solo con autorización (un contrato cuenta los encendidos en prod). Apagado, sale del Doc como siempre.

### Replicar un documento (el proceso)

1. `uv run … python tools/pdf/html/bajar.py <documento> 10`: los 10 más recientes de producción (solo lectura) con su
   PDF, la plantilla (.docx: medidas, tipografía, logo) y sus firmas, en `tools/pdf/.cache/<documento>/` (fuera de git);
   sube `casos.json` a «PRUEBA PDF HTML/<documento>». El documento se declara en `tools/pdf/html/comun.py`.
2. Con la geometría del PDF real (posición, letra y color de cada texto y rectángulo) se escribe
   `src/html/pdf/<documento>.html`; lo que hacían las fórmulas `<<IF(…)>>` va en el servicio (datos ya listos).
3. `npm run push`, `node tools/pdf/html/pedir.js <documento>` (arma los PDF en el DEV por el camino real) y
   `uv run … python tools/pdf/html/comparar.py <documento> --imagenes`.
4. Criterio de «igual»: **0 renglones distintos** en los 10 casos, **0.5 pt** o menos de desfase y las imágenes lado a
   lado revisadas por el usuario. Entonces se enciende en el DEV y se prueba desde la app. **Regla del usuario
   (10-nov):** basta con que quede ~95 % igual y se genere bien en Apps Script; una diferencia menor (un renglón que
   parte una palabra antes) no se persigue, y un error obvio del original se corrige.

**Desde la exportación HTML de Docs** (el arqueo, que AppSheet imprimía con Chromium desde esa exportación):
`tools/pdf/html/desde-docs.py <documento>` la baja y la convierte en la plantilla (marcadores `<<…>>` → `{{…}}`, logo,
saltos de hoja). Lo que hace falta para que el convertidor la pinte como AppSheet:
- el convertidor ignora el `line-height: 1.0` sin unidad: el renglón va en pt, medido sobre la letra del texto (un
  interlineado mayor, 1.15 o 1.5, sobre los 11 pt del párrafo, como lo medía AppSheet);
- la tabla que envuelve todo y las que no caben se encogen al área (498 pt) contando el relleno de cada celda; las que
  caben se quedan de su tamaño;
- los párrafos vacíos antes de un salto de hoja se quitan (empujaban una hoja en blanco);
- a 8 pt el Chromium de AppSheet daba cada letra 0.11 pt más ancha: `letter-spacing` a esa letra.

| Documento | Estado |
|---|---|
| Responsiva vehicular | igual en 10 de 10; encendida en DEV |
| Adherente vehicular | igual en 10 de 10 (también con 5 renglones de introducción); encendida en DEV. Corregido del Doc: el nombre del jefe salía 9 pt fuera de centro (compartía párrafo con un correo en blanco) |
| Responsiva de celular | pendiente |
| Inspección de celular (2 variantes) | pendiente |
| Inspección vehicular (una plantilla para los 18 tipos) | pendiente |
| Arqueo | ~95 % en 12 casos (A4, como AppSheet); encendido en DEV. Quedan unos renglones de las observaciones o de un nombre que parten una palabra antes o después (el redondeo por letra de AppSheet). Corregido del original: el título del desglose se quedaba solo al pie de la hoja 2; subtotales siempre con centavos ($80.00, no $80); el total de piezas sale aunque el renglón de AppSheet no lo trajera; la calificación de AppSheet (fracción, 0.985) sale como «98.5 %» |

## Resultado de la fase 1 (9-nov)

`node tools/pdf/inventario.js` (DEV) bajó las 24 plantillas en uso: 21 de Vehículos (Responsiva, Adherente y las 19
de MODELOS INSPECCION), 3 de Líneas y la de Arqueo, a `tests/fixtures/plantillas-marcadores.json` (solo marcadores: sin
ID ni título del documento). Ninguna tiene un `<<If:>>` que cruce párrafos. `tests/pdf-expresiones-diferencial.test.cjs`
llena cada marcador real con 7 juegos de datos:

- **Vehículos:** las 21 dan lo mismo que hoy con `Plantilla.gs`.
- **Líneas, `LineasPdf` contra `Plantilla`:** los dos leen la misma notación de AppSheet y coinciden en casi todo. Lo
  que cambia, y hay que decidir en la fase 2:

| Qué | `LineasPdf` (Líneas) | `Plantilla` (Vehículos) | Dónde aparece |
|---|---|---|---|
| `RIGHT(…)` | lo entiende | no lo entiende (queda visible) | `<<RIGHT("000" & [NUCO], 4)>>` de la responsiva de celular |
| Espacios alrededor del valor al comparar (`" bueno "` = `"BUENO"`) | no los quita: no coincide | los quita: coincide | todos los `IF([X] = "…")` (mayúsculas: los dos las ignoran) |
| Una fecha con hora en una columna sola | solo el día (`05/11/2026`) | día y hora (`05/11/2026 09:30:00`) | `<<FECHA DE REGISTRO>>` (Líneas), `<<[FECHA ULTIMO SERVICIO]>>` (Vehículos) |
| Un número vacío comparado (`<<If:([LLANTA DD] <= 1.6)>>`) | vacío = 0: el bloque sale | vacío no cumple: no sale | las llantas de las 19 inspecciones vehiculares |

Fuera de esta prueba (son del documento, no de un marcador; fase 3): de `LineasPdf`, la letra chica bajo la firma, el
interlineado como AppSheet y el formato de cada etiqueta; de `PdfService`, Arial en todo el texto.

## Resultado de la fase 2 (9-nov)

`Plantilla.gs` dejó de ser una lista de formas reconocidas con expresiones regulares: ahora es **un analizador** (piezas +
precedencia, como el de `LineasPdf`) con las reglas de Vehículos. Entiende comparaciones, `&`, `+ - * /`, paréntesis y
16 funciones (`IF AND OR NOT UPPER LOWER RIGHT LEFT LEN CONCATENATE ISBLANK ISNOTBLANK ROUND TEXT TODAY NOW`). Lo que no
entiende sigue lanzando error. Su API no cambió (`resolver`, `evaluarCondicion`, `evaluarExpresion`…); `seccionesDe` y
`camposDe` no se tocaron.

Reglas decididas por el usuario: al comparar se ignoran los espacios de más; la fecha la formatea cada módulo (Líneas:
solo el día; Vehículos: `PdfService.textoDeFecha_`), no el motor.

Con las 24 plantillas reales (`tests/pdf-expresiones-diferencial.test.cjs`): **las 21 de Vehículos dan exactamente lo
mismo que antes** y **las 3 de Líneas dan lo mismo que `LineasPdf`**, `RIGHT` incluido; la única diferencia es la
decidida (espacios de más). `LineasPdf` todavía no usa este analizador: eso es la fase 4.

## Cómo se mide (fase 0)

`src/utils/Cronometro.gs`: cada paso mide desde el anterior. Cada PDF deja **una línea** en el registro de
ejecuciones de Apps Script:

```
[tiempo] pdf RESPONSIVA RESP-123 · total 14210 ms · leer fila y evidencia 820 · firmas de la caché 95 · patrón 4 · …
```

- **Vehículos** (Inspección, Responsiva, Adherente y su vista previa): `PdfService.generar` / `generarVistaPrevia`.
  También regresa `tiempos: [{ paso, ms }]`.
- **Líneas** (Responsiva e Inspección de celular): `LineasCaptura.generarPdf` + `LineasPdf.generarPdfDesdePlantilla`,
  en una sola línea. En el DEV con `?medir=1` los pasos también llegan a la hoja MEDICIONES LINEAS
  («SERVIDOR apiLineasGenerarPdf»).
- **Arqueos**: `ArqueosService.generarPdfArqueo_`.

Para verlas todas juntas: en el editor de Apps Script del DEV, archivo `utils/Cronometro.gs`, correr
**`cronometroResumen()`**: deja en el registro una línea por PDF de las últimas 6 h (las últimas 60) y el promedio de
cada paso por tipo de documento (`pdf celular-RESPONSIVA`, `pdf vehicular-INSPECCION`, `pdf ARQUEO`…), listo para
copiar. Una por una: **Ejecuciones** → la ejecución (p. ej. `apiLineasGenerarPdf`) → la línea `[tiempo]`.

## Tabla base (llenar con 3 PDF de cada tipo en el DEV)

| Documento | Total (ms) | Pasos más pesados |
|---|---|---|
| Responsiva de celular | | |
| Inspección de celular | | |
| Inspección vehicular | | |
| Responsiva vehicular | | |
| Adherente vehicular | | |
| Arqueo | | |

## Fase 1: inventario y prueba diferencial

- `node tools/pdf/inventario.js` (dev | lab | prod) le pide a la app en `/dev?revisar=plantillas`
  (`src/PdfHerramientas.gs`, solo para quien desplegó, solo lee) los marcadores de cada plantilla en uso y los guarda en
  `tests/fixtures/plantillas-marcadores.json`: cuántas veces aparece cada uno, los `If` que cruzan párrafos, párrafos y
  tablas. Solo nombres de columnas y fórmulas.
- `tests/referencia/`: copias congeladas de cómo resuelven hoy los marcadores `Plantilla.gs` (Vehículos) y el
  evaluador de `LineasPdf.gs`. No se editan; se borran al terminar las fases 4 y 5.
- `tests/pdf-expresiones-diferencial.test.cjs`: cada marcador real × 7 juegos de datos (vacío, valores comparados,
  minúsculas y espacios, números, fechas). Vehículos debe dar lo mismo siempre; Líneas es la meta de la fase 2 (todo).
  Arqueo se compara en la fase 5. Una diferencia aceptada va en `ACEPTADAS` con su razón.

**Regla del usuario (10-nov):** basta con que el formato sea igual a la vista (~95 %), no idéntico al punto: los errores
obvios de las plantillas viejas (un texto descentrado, un encabezado que desplaza todo, un correo en blanco escondido)
se corrigen en vez de copiarse, y se anotan en la tabla.

**La introducción fluye como en el Doc:** en la responsiva y el adherente vive en una fila de 83.25 pt de alto mínimo,
centrada; con un nombre o puesto largo crece y empuja todo lo de abajo (pie incluido). La plantilla HTML hace lo mismo
(`.intro` + `.debajo`): lo de abajo se posiciona contra el final de esa fila, no contra la hoja.
