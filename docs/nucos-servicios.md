# Expediente por NUCO: `2.- SERVICIOS`

**Estado al 11-oct-2026: medición hecha (solo lectura), nada aplicado.** Datos en `tools/nucos/.cache/servicios/`
(`foto.json`, `xml.json` con las 1,920 facturas CFDI leídas, `medicion.json`).

> Python: en esta máquina Windows (Control de aplicaciones) bloquea la 3.14 de uv; usar `uv run --python 3.12 …`.

## Lo que hay

14,007 archivos en 10,177 carpetas, 554 NUCO. La unidad es el **evento de servicio** (`12. SERVICIO 303,000 KMS`,
`CAMBIO DE 2 LLANTAS`) con `FACTURA` / `COTIZACION` / `AUTORIZACION` / `GALERIA` / `ENCUESTA`. Se encontraron 1,908
eventos. La fecha exacta sale del XML de la factura (CFDI: fecha, emisor, total, UUID); 1,919 de 1,920 la traen.

## Medición: qué se puede acomodar con certeza y qué flota

| Archivos | Qué es | Fecha |
|---:|---|---|
| 10,908 | Eventos con factura XML | exacta (factura) |
| 275 | Eventos en `2025/<mes>/` sin factura | año y mes de la carpeta (2025 coincide con la factura en 99%) |
| 646 | Sueltos en `2025/<mes>/` (637 `IMAGEN DE WHATSAPP…`, 68 NUCO) | año y mes de la carpeta; falta que el área diga qué son |
| 244 | `BITACORA INGRESO A TALLER.xlsx` | no aplica (uno por NUCO) |
| 4 | Marcaje de llantas | no aplica |
| **949** | **Eventos con solo año** (casi todos en `2024/SERVICIOS/`) | dudosa: ver abajo |
| **941** | **Eventos sin año ni mes** | ninguna |
| **37** | Sueltos fuera de un evento (14 son facturas con su XML: se pueden fechar) | — |
| **7** | No son de servicios (tenencia, verificación…) | — |

**Flotan ~1,930 archivos (14%).** De esos, ~1,130 son de eventos cuyas fotos traen la fecha en el nombre
(`WhatsApp Image 2022-06-30…`): fecha probable, para confirmar, no para decidir sola.

## Hallazgos

- **La carpeta `2024` no dice el año del servicio.** De los eventos con factura dentro de `2024/`, 221 de 425 (52%) son
  de 2022–2023: el área juntó ahí lo viejo. Por eso "solo año 2024" no basta para fechar.
- **`2025/<mes>` sí es confiable** (344 de 346 coinciden con el año de la factura), pero en 72 de 352 el mes de la carpeta
  no es el de la factura: la factura suele salir semanas después del servicio. Falta decidir qué fecha manda.
- 41 eventos tienen facturas de meses distintos (servicio y refacciones facturados aparte).

## Decisiones pendientes

1. ¿El mes lo pone la carpeta del área (fecha del servicio) o la factura (fecha de facturación)?
2. Lo que no tenga fecha confiable: `SIN FECHA/` con su nombre de evento intacto (propuesta), no adivinar.
3. ¿Qué son las 637 imágenes sueltas por mes de 2025 (¿foto de kilometraje mensual?)?
