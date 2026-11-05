# Un solo motor de PDF: medición y avance

Plan aprobado el 5-nov-2026: los tres motores de PDF (`PdfService` + `Plantilla` para Vehículos, `LineasPdf` para
Líneas y el propio de Arqueos) pasan a uno solo, `PdfService`, con lo de cada documento como configuración por
plantilla. Se mide antes de cambiar nada, para optimizar con números. Reabre la fase 5.4 de
`docs/homologacion-codigo.md`.

| Fase | Qué | Estado |
|---|---|---|
| 0 | Medir cada paso de los tres motores (`Cronometro`) | hecha en código; falta la tabla base |
| 1 | Inventario de marcadores de cada plantilla + prueba diferencial | en código; falta correr el inventario |
| 2 | `Plantilla` entiende todo lo de Líneas (analizador) | pendiente |
| 3 | Motor de documento en `PdfService` + comparador en el DEV | pendiente |
| 4 | Líneas sobre `PdfService` (ID de plantilla por entorno) | pendiente |
| 5 | Arqueos sobre `PdfService` (avisar a Jorge antes) | pendiente |
| 6 | Optimizar con los números (plantilla preparada solo en DEV hasta autorizar prod) | pendiente |

Reglas acordadas: se queda la sintaxis `<< >>`; un marcador que el motor no entiende **queda visible en el PDF y
se avisa**; producción sigue con las plantillas de siempre hasta comprobar las nuevas.

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
