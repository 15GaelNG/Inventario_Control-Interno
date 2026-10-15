# Expediente por NUCO: `3.- VERIFICACIONES`

Tercera parte del expediente por NUCO (después de [documentación](nucos-expediente.md) e
[inspecciones](nucos-inspecciones.md)). **Estado al 12-oct-2026: carpetas homologadas** (ver abajo, "Corrida del 12-oct"); la hoja de la app sin corregir todavía. Todo lo de aquí se
sacó en solo lectura; el OCR usa copias temporales en una carpeta propia, fuera de NUCOS, que se borran al terminar.

Herramienta: `tools/nucos/verificaciones.py` (`ocr`, `dry-run`). Datos en `tools/nucos/.cache/verificaciones/`
(fuera de git): `foto.json`, `ocr.json`, `app.json`, `ocr-app.json`, `religar.json`, `cobertura.json`.

## Corrida del 12-oct-2026

Solo se acomodaron los **certificados con fecha leída** (OCR, nombre o carpeta del área): **196 archivos en 114 NUCO** a
`3.-VERIFICACIONES/<año>/<1ER|2DO> SEMESTRE/VERIFICACION-<NUCO> <fecha>[ DOBLE CERO][ RECHAZO].ext`. Lo demás (112:
sin fecha, tenencias/responsiva, el expediente viejo del 118 y los siniestros del 294) **se quedó donde estaba**; la app
lo muestra como otros archivos y lo resuelve la pasada de `_POR REVISAR` con el área. Nada salió de la carpeta.

- Mismo ejecutor que inspecciones: `inspecciones.py aplicar .cache/verificaciones/plan.json .cache/verificaciones/foto.json
  .cache/ligas/foto-doc.json (--nucos … | --todos) --raiz 3.-VERIFICACIONES`. 150 carpetas viejas que quedaron vacías
  (`PROGRAMA 2025/…`) a `_PAPELERA`.
- Piloto 28, 109, 113, 95 (bitácora `20261012-114141-inspecciones.jsonl`); **rollback probado en el 109** (archivos y
  carpetas de vuelta, nada de más) y vuelto a aplicar en la corrida grande (`20261012-114302-inspecciones.jsonl`, 658
  renglones en la hoja BITACORA EXPEDIENTES NUCO).
- Verificación en vivo: **308 de 308** archivos donde dice el plan (196 movidos + 112 que se quedan).
- Deshacer: `expediente.py deshacer .cache/bitacoras/<bitácora> [--nucos N]`, la más nueva primero.

## Hay dos lugares que no se hablan

| | Carpetas de los NUCO (`3.- VERIFICACIONES`) | La app (hoja `VERIFICACIONES` + `VERIFICACIONES_Images`) |
|---|---|---|
| Qué hay | 308 archivos en 119 NUCO (fotos y PDF del certificado) | 430 registros de 163 vehículos; 460 archivos |
| Quién lo sube | el área, a mano | quien captura en la app (antes AppSheet) |
| Vehículo correcto | **211 de 211** certificados con serie legible están en su NUCO | **152 de 284** registros con serie legible están ligados a OTRO vehículo |

Solo 2 archivos son el mismo (md5). Por fecha (mismo NUCO, ±7 días): 99 registros de la app tienen su certificado
también en la carpeta; 331 solo están en la app y 94 certificados solo en la carpeta.

## El certificado se lee solo (OCR)

Son certificados del Programa Estatal de Verificación de **Querétaro**. Traen fecha de expedición, semestre, motivo
(`Normal`, `Rechazo`, `Sanción`), placa, **número de serie (NIV)**, folio (empieza con el año: `2620138468` → 2026) y
vigencia. 301 de 302 se leyeron; 19 PDF son escaneos con una capa de texto en blanco y se leen por su imagen.

## Lo que se encontró en la app

1. **152 registros ligados al vehículo equivocado**: el número de serie (NIV) del certificado es de otro NUCO que el
   que dice la hoja (`ID VEHICULO` → NUCO; tolera una letra mal leída). 49 están en el NUCO 2 (una moto dada de baja:
   76 registros, casi todos de otros vehículos) y 14 en el 116. **La clave del vehículo es la serie o el NUCO, nunca
   el folio:** la hoja solo trae `FOLIO VEHICULO` (de ahí salió `ID VEHICULO` en la migración) y es justo lo que falla. Todos se capturaron en AppSheet (2024–2026; la mayoría el 23-ene-2025, la carga
   inicial). **El error ya estaba en AppSheet**: en su libro original (`1h5ibDsm…`) los 152 dicen el mismo folio. La
   migración lo copió fiel. La `PLACA` de la hoja es la del vehículo ligado (se copia sola), no la del certificado.
   La lista (NUCO e ID del vehículo de hoy y el correcto, con su serie) está en `religar.json`.
2. 127 registros sin serie legible: no se puede confirmar a qué vehículo son.
3. 15 certificados de **Rechazo** capturados como verificación hecha.
4. 66 registros cuya fecha capturada difiere más de 7 días de la del certificado (10 traen el comprobante de otro
   registro del mismo vehículo).
5. 24 registros duplicados (mismo vehículo y fecha); 18 sin comprobante; 1 cuyo comprobante no existe; 48 archivos en
   `VERIFICACIONES_Images` que ningún registro usa.

## Cobertura (lo registrado, no necesariamente lo hecho)

525 vehículos no dados de baja. Uniendo app y carpetas (sin rechazos), vehículos con al menos una verificación:

| Semestre | Vehículos | De Querétaro (146 activos) |
|---|---|---|
| 2025-1 | 92 | 43 |
| 2025-2 | 81 | 43 |
| 2026-1 | 130 | 90 |
| 2026-2 (en curso) | 39 | 27 |

368 activos nunca tienen una verificación registrada (166 con sede `SIN ESPECIFICAR`, 45 de Querétaro, 45 Mérida,
39 Cancún…). Falta saber qué vehículos están obligados (estado de las placas, tipo): la sede no basta.

## Verificaciones guardadas en otras carpetas

136 archivos en 81 NUCO: 94 en `1.-DOCUMENTACIÓN/ANTERIORES` (de la homologación de documentación) y 38 en
`4.- INSPECCIONES/_POR REVISAR` (de la de inspecciones), más 4 dentro de inspecciones. Van en la pasada de
`_POR REVISAR` con el área, no en la homologación de esta carpeta.

## Dentro de la carpeta (dry run del 9-oct)

`verificaciones.py dry-run`: 197 a `<año>/<1ER|2DO> SEMESTRE/VERIFICACION-<NUCO> <fecha>[ DOBLE CERO][ RECHAZO].ext`
(periodo por el OCR, la fecha del nombre, la carpeta del área o el único registro de la app; nunca la fecha de subida),
~100 a `_POR REVISAR` (casi todo el expediente viejo del NUCO 118 y los siniestros del 294), 72 raíces a renombrar,
146 NUCO sin la carpeta. Los "BIMESTRE" del área son semestres (lo dicen los certificados).

**Acordado (11-oct):** la corrida solo mueve dentro de `3.- VERIFICACIONES`. Lo que no es verificación se aparta como
carpeta completa a `_POR REVISAR` (2 movimientos, no 100); nada cruza a `1.-DOCUMENTACIÓN` en esta corrida.
Falta ajustar el dry run a eso y rehacerlo con la foto nueva (308 archivos).

## Orden propuesto

1. **Homologar la carpeta** (solo dentro de ella): foto, dry run, piloto de 3–4 NUCO, verificación, el resto.
2. **Corregir la hoja de la app** antes de mover sus comprobantes: re-ligar los 152 al NUCO que dice la serie del
   certificado (`ID VEHICULO` y lo que se copia de él), con bitácora del valor anterior, y que el área decida rechazos, duplicados y fechas.
   Si se movieran antes, 152 comprobantes caerían en el NUCO equivocado.
3. **Llevar los comprobantes de la app al NUCO** — hecho el 13 y 14-oct: `nucos-verificaciones-app.md`.
4. **La app guarda en el NUCO** (`ExpedienteNuco`) y lee el certificado al subirlo: fecha, semestre, motivo y serie;
   avisa si la serie no es la del vehículo elegido. Eso evita que se repita lo de los 152.
5. **La pasada de `_POR REVISAR`** con el área (incluye las 136 verificaciones de otras carpetas).
