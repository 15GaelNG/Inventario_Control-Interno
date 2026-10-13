# Vehículos por NUCO — Fase 3 (lo existente): pendiente, en el radar

Estado: **en espera** (12-oct-2026). Plan completo: "Vehículos: todo por NUCO" (Fases 0–3).

| Fase | Qué | Estado |
|---|---|---|
| 0 — Preparar datos | 68 verificaciones re-ligadas por la serie del certificado (`religar_verif.py`); columna NUCCO llenada por ID VEHICULO en VERIFICACIONES, INSTALACION DE SENSORES, INCIDENCIAS y CAMBIOS VEHICULOS (8,017 celdas, `columna_nucco.py`) | Hecha y verificada, con bitácoras |
| 1 — Registros por vehículo | La ficha y las altas ligan por ID del vehículo, nunca por folio (`listarPorVehiculo`, `VehiculosService.buscar`, `Formulario.buscar.llave`, NUCCO al nacer) | En master (`fc44844`) |
| 2 — Lo nuevo al NUCO | Inspección (PDF + FIRMAS Y DIAGRAMAS), verificación, responsiva del sensor y respaldo de firmas se guardan en el expediente del NUCO; la hoja guarda la liga; los lectores abren liga o ruta vieja | En master (`fa275ce`); probado en DEV con una inspección |
| **3 — Lo existente** | Mover lo de antes al NUCO y que la hoja guarde la liga | **Pendiente** |

## Antes de arrancar

1. Desplegar master a producción (botón "Run workflow") y confirmar con una inspección o verificación real que cae en
   su carpeta del NUCO. **Las corridas de datos van solo con el código ya en producción**: la app tiene que entender
   ligas antes de que la hoja cambie.
2. Que no haya otra corrida de NUCOS en curso.

## Las corridas (cada una: foto → plan → Excel de ensayo → piloto 3–5 NUCO → verificación en vivo → rollback probado en uno → resto → verificación total)

Patrón ya probado en `tools/nucos/`: bitácora JSONL en `.cache/bitacoras/` + respaldo en Drive (PRUEBA DE NUCOS
VEHICULARES/BITACORAS) + hoja "BITACORA EXPEDIENTES NUCO"; deshacer con `expediente.py deshacer` (archivos) y el
`deshacer` de cada herramienta (celdas, como `ligas_doc.py` / `columna_nucco.py`). Mover conserva el ID del archivo.

1. **Inspecciones de la app (305 PDFs, hoja INSPECCION VEHICULAR, columna FORMATO INSPECCION VEHICULAR).**
   Dry run existente: `inspecciones_app.py`.
   - 202 ya los copió el área al NUCO (mismo md5) → solo se cambia la celda a la liga de la copia.
   - 103 solo están en REPORTES → se mueven a `4.-INSPECCIONES/<año>/<N> TRIMESTRE/INSPECCION-<NUCO> <fecha>.pdf` y la
     celda guarda su liga.
   - Sus firmas y diagramas marcados (`INSPECCION VEHICULAR_Images/…`) → `FIRMAS Y DIAGRAMAS` de su inspección; celdas a
     liga. El diagrama en blanco (`MODELOS INSPECCION/…`) **no** se toca: es plantilla.
   - Adaptar `inspecciones_app.py` para escribir (hoy solo es ensayo) y para años antes de 2026 (bimestre).
2. **Comprobantes de verificación (~411, hoja VERIFICACIONES, COMPROBANTE VERIFICACION).** Después del re-ligado de la
   Fase 0. Destino `3.-VERIFICACIONES/<año>/<N> SEMESTRE/VERIFICACION-<NUCO> <fecha>.ext`; dedupe por md5 contra lo ya
   homologado (196 certificados ya están en su semestre). **Los 84 dudosos no se tocan** (siguen marcados para el área).
3. **Responsivas de sensores (INSTALACION DE SENSORES, ~207)** → `1.-DOCUMENTACIÓN/5.-RESPONSIVA/SENSORES/`.
4. **Respaldos de firmas de Responsiva y Adherente** (`RESPONSIVAS VEHICULARES_Images/`, no ligados en la hoja) →
   `5.-RESPONSIVA/FIRMAS/`. Las firmas TEMP de la firma a distancia se quedan (se borran solas al generar el PDF).

## Avance del 13-oct-2026 (corrida 1: inspecciones de la app)

- Fase 2 confirmada en prod: la inspección del 12-oct del NUCO 649 cayó en `649/4.-INSPECCIONES/2026/4TO TRIMESTRE`.
- `inspecciones_app.py` (plan / aplicar / verificar / deshacer): mismas reglas que la app (periodo por fecha,
  `INSPECCION-0088 aaaa-mm-dd.pdf`, firmas y diagramas en `FIRMAS Y DIAGRAMAS` junto a su PDF, `(2)` si el nombre existe).
  Cada celda se busca por ID INSPECCION y debe seguir igual que en el plan; lo que cambió se salta. Nunca adivina: si la
  copia del área dice otra fecha u otro periodo, va a Revisar.
- Piloto aplicado y verificado en 10 NUCO: 22, 25, 60, 205, 258 (bitácora `20261013-141816` y, el 258,
  `20261013-142100` tras probar el deshacer) y 72, 111, 201, 232, 339 (`20261013-142706`).
- **Fechas de la homologación del 11-oct.** Tomó la fecha del nombre que el área le puso al PDF y a veces estaba mal.
  `fechas_insp.py` leyó la fecha impresa de los 1,794 PDF (texto o OCR de Google): 934 coinciden, 27 en mes, 747 sin
  fecha legible (casi todo escaneos con la fecha a mano), 86 distintas. Corregidas con `corregir_fecha_insp.py` (solo
  renombra; la carpeta entera si es POR <MOTIVO> <fecha> o el periodo de una sola inspección): 5 confirmadas por la app
  (217, 462, 301, 196, 320; bitácora `20261013-143529-fecha-insp`) y 21 "seguras" leídas del texto del PDF, 1 a 3 días,
  mismo periodo (`20261013-145504-fecha-insp`).
- **Decisión del usuario (13-oct):** las 60 restantes (OCR o una fecha dudosa) se quedan con el nombre del archivo: en
  15 revisadas a mano, el nombre siempre era el bueno. Regla: **una fecha leída con OCR o de un campo dudoso nunca
  corrige al nombre del archivo**.
- **Corrida 1 completa (13-oct, 16:24–16:56):** foto `20261013b`, plan `20261013b/plan-app.json`, bitácora
  `20261013-162447-insp-app.jsonl` (respaldada en Drive). 239 NUCO: 1,056 archivos movidos (98 PDF de REPORTES y 958
  firmas y diagramas), 1,250 celdas con su liga, 289 carpetas creadas, 0 saltados. Verificación: todo en su lugar.
  En la hoja quedan 307 de 309 PDF con liga (2 inspecciones sin PDF) y solo 4 celdas con ruta vieja, a propósito: 3
  imágenes del NUCO 231 que no existen en Drive y la firma `data:,` del 471. Los originales de REPORTES de las
  inspecciones que el área ya había copiado se quedaron donde estaban.
- **Corrida 2, verificaciones (13-oct):** `verificaciones_app.py` (plan propio; aplicar/verificar/deshacer de
  `inspecciones_app.py`). Solo se lleva al NUCO lo que el CERTIFICADO confirma: la serie (NIV) leída con OCR es la del
  vehículo de ese NUCO, y la fecha del certificado es la capturada (o no se lee). Si el área ya tiene un comprobante de
  ese día, se compara el FOLIO del certificado: mismo folio → la celda apunta al del área (sin duplicar); otro folio →
  quedan los dos; sin folio legible → Revisar. Piloto 27, 48, 53, 79, 282 (`20261013-173134`, el 27 deshecho y vuelto a
  aplicar en `20261013-173210`); resto `20261013-173629-verif-app.jsonl`: 98 movidos, 150 celdas, 154 carpetas, 0
  pendientes. En total 155 registros quedaron con liga (100 movidos, 55 al archivo del área). **257 no se tocaron**
  (pestaña Revisar de `.cache/verificaciones/20261013/plan-app.xlsx`): ~126 sin serie legible, ~84 cuya serie es de OTRO
  vehículo (los mal ligados desde AppSheet), ~40 con otra fecha en el certificado, 5 sin folio para comparar y casos
  sueltos. Para el área.
- Siguen: corrida 3 (responsivas de sensores) y 4 (firmas de Responsiva y Adherente).

## También en el radar (no se hacen sin preguntar)

- Verificaciones: 106 archivos que no son verificación; certificados rescatables (NUCO 196, 267, 252); probables
  (24, 113); 84 dudosos para el área (`radar-nucos-verificaciones`).
- Inspecciones: NUCO 42, 176 y 371 para el área; carpetas `_POR REVISAR`; vaciar `_PAPELERA` por sus dueños.
- Hologramas: fuera del plan, se trata aparte.
- Servicios: por ahora solo el índice (hoja INDICE SERVICIOS NUCO).
- Prod: `instalarAvisoDeCambios()` / `instalarCalentador()` sin correr.

Docs relacionados: `nucos-expediente.md`, `nucos-inspecciones.md`, `nucos-verificaciones.md`, `nucos-servicios.md`.
