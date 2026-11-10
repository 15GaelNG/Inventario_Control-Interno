# Responsiva vehicular: 59 s al crearla (pendiente, 10-nov-2026)

## Qué pasó

En el DEV del equipo (`.clasp.json`, `/dev` `AKfycbzEe27…`), una responsiva vehicular presencial tardó **59 s**
(`apiCrearResponsivaVehicular`, 10-nov 11:54:54, NUCO 0001, AARON MORENO CORTEZ). Ya salía en HTML (el PDF dice
`Chromium`; los del Doc dicen `Google Docs Renderer`).

El PDF **no** es lo lento. Su línea en Ejecuciones:

```
[tiempo] pdf vehicular-RESPONSIVA … · total 3954 ms · carpeta 169 · nombre único 159 · convertir 842 · crear archivo 1982 · compartir 801
```

La llamada empezó 11:54:54 y el PDF terminó 11:55:46: unos **48 s antes del PDF** y unos 7 s después (archivarlo).
El aviso «No se pudo compartir explícitamente el PDF» es normal en un DEV (política de Drive de la cuenta).

## Qué hace `crear` antes y después del PDF

`ResponsivaVehicularService.crear` → `generarPdfYGuardar_`:

1. `Candado.con` (espera el candado del proyecto; otro proceso, como el Calentador, lo puede tener).
2. `VehiculosService.buscar`, `CapitalHumano.conPersona`, `SheetUtils.insert`.
3. Si cambió el responsable: `VehiculosService.actualizar` (con sus datos conectados).
4. Respaldar cada firma (hasta 3) en `5.-RESPONSIVA/FIRMAS` del expediente del NUCO: buscar la carpeta, crear el
   archivo y compartirlo, una por una.
5. `ExpedienteNuco.carpeta(…, 'RESPONSIVA')` para el PDF.
6. El PDF (`PdfService.generar`, ~4 s).
7. `ExpedienteNuco.archivar`: renombrar a `RESPONSIVA-0001.pdf` y pasar la vigente a `RESPONSIVAS ANTERIORES`.
8. `SheetUtils.update` con la liga y borrar las firmas temporales.

**Sospecha:** el expediente en Drive (pasos 4, 5 y 7). La memoria de carpetas de `Expediente` está **apagada** desde el
9-nov (llenó el tope de CacheService), así que cada búsqueda baja por Drive desde NUCOS VEHICULOS. Sin confirmar.

## Cómo se mide

Desde el commit `ef51355f` (rama `pdf-html-responsiva`), `crear` lleva cronómetro en cada paso. Al crear una responsiva,
en Ejecuciones sale:

```
[tiempo] responsiva crear <folio> · total … · candado … · buscar vehículo … · persona … · guardar renglón … ·
  reasignar vehículo … · respaldar firma responsable … · respaldar firma jefe … · respaldar firma ci … ·
  carpeta del expediente … · pdf … · archivar en el expediente … · ligar y limpiar …
```

(Una firma a distancia, al completarse, sale como `[tiempo] responsiva <ID>` con los pasos desde «respaldar».)

## Siguiente paso

1. Hacer otra responsiva en el DEV y leer esa línea.
2. Atacar el paso que pese. Ideas, según lo que salga:
   - firmas: respaldarlas en un solo viaje (una carpeta buscada una vez para las 3), o después de responder;
   - expediente: encender una memoria acotada solo para el camino del NUCO (no la general que llenó la caché);
   - candado: no meter Drive dentro del candado (solo el renglón), si es lo que espera.
