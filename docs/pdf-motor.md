# Un solo motor de PDF: medición y avance

Plan aprobado el 5-nov-2026: los tres motores de PDF (`PdfService` + `Plantilla` para Vehículos, `LineasPdf` para
Líneas y el propio de Arqueos) pasan a uno solo, `PdfService`, con lo de cada documento como configuración por
plantilla. Se mide antes de cambiar nada, para optimizar con números. Reabre la fase 5.4 de
`docs/homologacion-codigo.md`.

| Fase | Qué | Estado |
|---|---|---|
| 0 | Medir cada paso de los tres motores (`Cronometro`) | hecha en código; falta la tabla base |
| 1 | Inventario de marcadores de cada plantilla + prueba diferencial | pendiente |
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

Para verlas: editor de Apps Script del DEV → **Ejecuciones** → la ejecución de la llamada (p. ej.
`apiLineasGenerarPdf`) → registros → la línea `[tiempo]`.

## Tabla base (llenar con 3 PDF de cada tipo en el DEV)

| Documento | Total (ms) | Pasos más pesados |
|---|---|---|
| Responsiva de celular | | |
| Inspección de celular | | |
| Inspección vehicular | | |
| Responsiva vehicular | | |
| Adherente vehicular | | |
| Arqueo | | |
