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
| 5 | Arqueos sobre `PdfService` (avisar a Jorge antes) | pendiente |
| 6 | Optimizar con los números (plantilla preparada solo en DEV hasta autorizar prod) | pendiente |

Reglas acordadas: se queda la sintaxis `<< >>`; un marcador que el motor no entiende **queda visible en el PDF y
se avisa**; producción sigue con las plantillas de siempre hasta comprobar las nuevas.

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
