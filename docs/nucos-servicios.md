# Expediente por NUCO: `2.- SERVICIOS`

**Estado al 15-oct-2026: dry run hecho (solo lectura), nada aplicado.** Medición del 11-oct: Datos en `tools/nucos/.cache/servicios/`
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

## Decisiones (15-oct-2026, con el usuario)

1. **Manda la factura** (la fecha del CFDI que timbró el SAT). Solo la de **Ingreso**: un complemento de pago trae la
   fecha del pago. Si el evento solo trae complementos, se busca la factura que pagan (por su folio fiscal) y, si no
   aparece, la fecha del pago. Sin XML, el año y mes de la carpeta del área.
2. Lo que no tiene fecha confiable va a `SIN FECHA/` con el nombre del evento intacto; no se adivina.
3. Las "imágenes sueltas" eran **658 copias del relleno "¡CARPETA SIN INFORMACIÓN!"** (un solo md5) que el área dejó en
   cada mes sin servicio. No son documentos: a `_PAPELERA`, y el mes sin servicio simplemente no existe.
4. Estructura: la que el área ya usa en 453 NUCO, con los nombres parejos (abajo).

## Dry run (15-oct-2026, foto nueva: sin cambios desde el 12-oct)

Herramienta: `tools/nucos/servicios.py` (`xml` y `dry-run`; la cabecera tiene las reglas). Salida en
`tools/nucos/.cache/servicios/20261015/` (`plan.json`, `dry-run.xlsx`). Se aplicaría con el ejecutor de inspecciones:
`inspecciones.py aplicar … --raiz 2.-SERVICIOS`.

```
2.-SERVICIOS/
   1.-LIBRETA DE SERVICIOS/<año>/<MM>.-<MES>/<evento>/1.-COTIZACIÓN 2.-AUTORIZACIÓN 3.-FACTURA 4.-GALERÍA 5.-ENCUESTA DE SATISFACCIÓN
   1.-LIBRETA DE SERVICIOS/SIN FECHA/<evento>/…
   2.-MARCAJE DE LLANTAS/[<año>/<MM>.-<MES>/]
   BITACORA INGRESO A TALLER….xlsx
   _POR REVISAR/
```

| Archivos | Destino |
|---:|---|
| 11,058 | Su evento, con fecha (año/mes) |
| 1,903 | `SIN FECHA` (383 eventos; 180 con fecha sugerida por las fotos, en el Excel) |
| 251 | Bitácoras de ingreso a taller, en la raíz |
| 101 | Marcaje de llantas |
| 27 | `_POR REVISAR` (sueltos que no son de un evento y 4 carpetas de verificación) |
| 667 + 9 | `_PAPELERA`: el relleno y copias idénticas que llegan al mismo lugar |

Fecha de los 1,914 eventos: factura de ingreso 1,327 · factura que paga el complemento 3 · fecha del pago 16 · carpeta
año/mes del área 185 · sin fecha 383. Los eventos que solo traen complemento de pago son 19, no 391: la medición del
11-oct separaba la subcarpeta del pago de su factura. Una carpeta con años o meses adentro es un contenedor (copias de
otras carpetas pegadas en el NUCO: `CI/Gerente Esteban Ruiz/2024/…`), nunca un evento.
