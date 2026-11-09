# Canceladas: por qué el panel de Cancelaciones y el Panorama no daban lo mismo (9-nov-2026)

> Sin números de teléfono completos ni datos de personas: el repo es público. Las líneas van por su ID.

## Qué lee cada uno

- **Panorama de Líneas:** solo el **inventario** (hoja LINEAS) y cuenta las que tienen `ESTATUS LINEA = CANCELADA`.
- **Panel de Resguardos → Cancelaciones:** dos hojas.
  - **`APP_RESGUARDOS`, el trámite de Pau** (POR FIRMAR → CARTA FIRMADA → CARTA ENVIADA → CANCELADA). Si una línea tiene
    trámite, el panel muestra **el paso del trámite**.
  - **El inventario** (la misma hoja que el Panorama): desde la rama `lineas-canceladas-anteriores` (en el DEV, 9-nov),
    las CANCELADAS **sin trámite** (de antes del sistema, o canceladas directo) también salen ahí, marcadas ORIGEN = ANTERIOR
    AL SISTEMA, solo para verlas (no se escriben en `APP_RESGUARDOS`, no tienen botones).

Si las dos hojas dicen lo mismo, los números cuadran. El descuadre son líneas donde se contradicen.

## Los números (DEV, copia de prod del 30-oct)

| | Cuántas |
|---|---|
| CANCELADAS en el inventario (Panorama) | **433** |
| Mosaico «Canceladas» del panel: 4 confirmadas en el panel + 427 anteriores al sistema | **431** |
| En trámite en el panel: 33 CARTA ENVIADA + 5 POR FIRMAR | 38 |
| Mosaico «Líneas a cancelar» (todo lo de la pestaña: 431 + 38) | **469** |

- **469 no son canceladas:** es el primer mosaico, que cuenta toda la pestaña, en trámite incluido. Pendiente: renombrarlo
  «Total en Cancelaciones».
- **433 − 431 = 2 líneas** CANCELADAS en el inventario cuyo trámite en el panel seguía en CARTA ENVIADA.

En prod (9-nov): 446 CANCELADAS en el inventario; 18 confirmadas en el panel + 427 sin trámite = 445; falta **1**.

## Qué pasó con las 2 líneas

| Línea | Termina en | DEV (30-oct) | Prod (9-nov) |
|---|---|---|---|
| `LIN-66NT0DYP64APZG` | 8021 | descuadrada | **descuadrada** |
| `LIN-66NT0E1J0R0VM9` | 9369 | descuadrada | ya cuadra |

1. **13-oct:** Líneas las mandó a resguardo con la línea a cancelación; el panel les abrió su trámite (CARTA ENVIADA el 14-oct).
2. **29-oct, 17:06:** el **cuadre con el REPORTE LÍNEAS** (corrección autorizada ese día, ver la memoria del cuadre) pasó
   su `ESTATUS LINEA` de EN PROCESO DE CANCELACION a **CANCELADA** en el inventario, porque el proveedor ya las daba de
   baja. **No cerró su trámite en el panel**, que se quedó en CARTA ENVIADA. Se escribió por fuera de la app: no está en
   LOGS 2026, pero sí en el historial de cada línea (`MOVIMIENTOS`, «CUADRE CON REPORTE LÍNEAS · autorizado por …»).
3. **9-nov, 09:08:** Pau confirmó en el panel la que termina en 9369 (CARTA ENVIADA → CANCELADA; está en LOGS 2026,
   pestaña 2026-11). Por eso en prod solo queda una.

**En corto:** la línea ya está cancelada en el inventario; lo atrasado es su trámite en el panel.

## Pendiente

1. **Pau:** en Cancelaciones, seleccionar la que termina en **8021** (`LIN-66NT0DYP64APZG`) y darle **«Cancelada»**. Con
   eso prod cuadra (Panorama = panel). No hace falta código.
2. **Renombrar** el mosaico «Líneas a cancelar» → «Total en Cancelaciones» (rama `lineas-canceladas-anteriores`).
3. **Para la próxima corrección masiva** (como el cuadre con el reporte): si una línea con trámite abierto pasa a
   CANCELADA, cerrar también su renglón de `APP_RESGUARDOS`, o el panel se queda atrás.
4. La rama `lineas-canceladas-anteriores` sigue en revisión en el DEV (sin commit); a prod solo con autorización.
