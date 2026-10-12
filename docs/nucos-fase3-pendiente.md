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

## También en el radar (no se hacen sin preguntar)

- Verificaciones: 106 archivos que no son verificación; certificados rescatables (NUCO 196, 267, 252); probables
  (24, 113); 84 dudosos para el área (`radar-nucos-verificaciones`).
- Inspecciones: NUCO 42, 176 y 371 para el área; carpetas `_POR REVISAR`; vaciar `_PAPELERA` por sus dueños.
- Hologramas: fuera del plan, se trata aparte.
- Servicios: por ahora solo el índice (hoja INDICE SERVICIOS NUCO).
- Prod: `instalarAvisoDeCambios()` / `instalarCalentador()` sin correr.

Docs relacionados: `nucos-expediente.md`, `nucos-inspecciones.md`, `nucos-verificaciones.md`, `nucos-servicios.md`.
