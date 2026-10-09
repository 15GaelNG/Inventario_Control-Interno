# Expediente por NUCO: homologar `4.- INSPECCIONES`

Segunda parte de [nucos-expediente.md](nucos-expediente.md), que dejó `1.-DOCUMENTACIÓN` homologada el 8-oct-2026.
Aquí se documenta lo de `4.- INSPECCIONES` del 9-oct-2026: el inventario, las reglas, la herramienta, el piloto de 6
NUCO y lo que falta para los demás.

> **Estado al 9-oct-2026:** piloto aplicado y verificado en 6 NUCO (113, 267, 482, 111, 260, 140). Faltan los ~570
> restantes (ver [Pendientes](#pendientes)).

## Lo que había

Inventario en solo lectura de la carpeta real (`NUCOS VEHICULOS`, `1pgEmrDM58FuALsfzBzckC9ROz941HR9P`):

| | |
|---|---|
| NUCO con carpeta de inspecciones | 575 de 648 (73 sin ella) |
| Carpetas / archivos | 18,646 / 157,380 (148 mil fotos, 5 mil videos, 3,669 PDF) |
| Nombre de la raíz | `4.- INSPECCIONES` 499, `4.-INSPECCIONES` 69, `4. INSPECCIONES` 4, `4.INSPECCIONES` 3 |
| Años | 2014–2026; casi todo 2024–2026 |

Es el **archivo fotográfico de cada revisión**, no solo los PDF. La forma más común:

```
<NUCO>/4.- INSPECCIONES/<año>/<periodo>/
    CRISTALERIA/ DOCUMENTACION/ INTERIORES/ LATONERIA Y PINTURA/ NEUMATICOS/
    OTROS ELEMENTOS/ SISTEMA ELECTRICO/ SISTEMA MECANICO/        ← las fotos, por sección
    11072025-U46BLX.PDF                                          ← el formato (ddmmaaaa-VEHÍCULO PLACA)
```

Lo que estaba revuelto:

- **Periodos.** 2025 y antes por bimestre (`1ER`–`6TO BIMESTRE`); 2026 por trimestre, pero con `3ER BIMESTRE` en julio y
  variantes (`2DO TRMESTRE`, `1ER TRIMIESTRE`, `5TO BIMESTR`). Antes de 2024: `MAYO-JUNIO`, `SEPTIEMBRE-OCTUBRE`,
  `PRIMER INSPECCION`, `INSPECCION VEHICULAR 2022`…
- **Inspecciones extra por motivo**, al lado de los periodos: `INSPECCIÓN POR BAJA`, `POR CAMBIO DE DEPTO`,
  `INSPECCION POR RENUNCIA LUIS …`, `REASIGNACION`… Son inspecciones completas (8 secciones + PDF), no periodos.
- **Niveles de más.** `2026/INSPECCIONES/INSPECCIÓN POR SOLICITUD/`, `2022/INSPECCION VEHICULAR 2022/Folio 82 Nuco 140/`,
  `2023/INSPECCION/DICIEMBRE/SU2959D/`, carpetas de inspecciones dentro de otra.
- **Cosas que no son inspecciones** (~1,200 archivos): tenencias, altas de placas, tarjetas de circulación, responsivas,
  pólizas y refrendos de 2014–2023; carpetas de servicios (`SERVICIOS/…/FACTURA`, `COTIZACION`, `GALERIA`);
  verificaciones.
- **Relleno**: la imagen `CARPETA SIN INFORMACIÓN.jpg.pdf` en secciones vacías.

## La estructura homologada

```
<NUCO>/4.- INSPECCIONES/
├── <año>/
│   ├── <N> BIMESTRE/                  hasta 2025 (1ER … 6TO); manda el nombre de la carpeta
│   ├── <N> TRIMESTRE/                 2026 en adelante (1ER … 4TO); manda la fecha del PDF de dentro
│   ├── POR <MOTIVO> <aaaa-mm-dd>/     inspección extra; la fecha es la del PDF de dentro
│   └── SIN PERIODO - <nombre original>/   inspección vieja sin periodo ni PDF con fecha
│       ├── CRISTALERIA/ … SISTEMA MECANICO/   (las 8 secciones)
│       └── INSPECCION-0267 2025-12-22.pdf
└── _POR REVISAR/                      plano: lo que no se pudo clasificar
```

**Máximo 3 niveles** bajo `4.- INSPECCIONES` (año / inspección / sección). Se decidió así después de revisar la práctica
de gestión documental (ISO 15489, guías de archivos públicos): las carpetas son solo la clasificación, con nombres de
un vocabulario fijo y pocos niveles. Las excepciones no se esconden en ramas nuevas dentro de cada expediente: van a una
**cuarentena plana** y a una **bitácora**, y la procedencia se guarda como dato, no recreando carpetas viejas.

## Reglas

| Caso | Qué se hace |
|---|---|
| Raíz con otro nombre | Se renombra a `4.- INSPECCIONES` |
| Periodo hasta 2025 | `<N> BIMESTRE` por el nombre de la carpeta. Meses → su bimestre (`SEPTIEMBRE-OCTUBRE` → `5TO`, `DICIEMBRE` → `6TO`) |
| Periodo 2026 | `<N> TRIMESTRE` por la fecha del PDF (`3ER BIMESTRE` con PDF de julio → `3ER TRIMESTRE`); sin PDF, por el nombre |
| Errores de dedo | Damerau-Levenshtein ≤ 2 (`reglas.distancia`): `TRMESTRE`, `TRIMIESTRE`, `BMESTRE`, `DIMESTRE`. TRIMESTRE debe empezar con TR (BIMESTRE también queda a 2 letras) |
| Motivo | Nombre fijo + fecha: `POR BAJA`, `POR RENUNCIA`, `POR CAMBIO DE RESPONSABLE`, `POR CAMBIO DE DEPTO`, `POR CAMBIO` (cuando no dice de qué), `POR ASIGNACION`, `POR REASIGNACION`, `POR SOLICITUD`, `POR SINIESTRO`, `POR ACCIDENTE`, `POR INCIDENTE`, `POR ENTREGA`. Sin PDF con fecha, sin fecha. Va a nivel del año aunque estuviera dentro de un periodo |
| Fechas | Solo la del PDF de la inspección (`ddmmaaaa` al inicio del nombre). **Nunca** la de cuándo se subieron las fotos (se suben semanas después o se copian) |
| Sección | Las 8 con nombre fijo (sin acentos, mayúsculas). `DOCUMENTOS` dentro de una inspección es `DOCUMENTACION`; `OTROS` es `OTROS ELEMENTOS`. Una sección dentro de otra (`NEUMATICOS/NEUMATICOS`) va a su sección |
| Nivel de unidad | `Folio 01 Nuco 62/`, `SV5384C/`, `NUCO 110 OROCH/`, `0111/`, `KWID/` dentro de una inspección (las de 2022–2023, antes de las secciones): se quita ese nivel |
| Envoltorio | `INSPECCIONES/`, `INSPECCION VEHICULAR 2022/` que solo traen periodos o motivos: se quita ese nivel |
| PDF de la inspección | Directo en el periodo o motivo y con fecha → `INSPECCION-<NUCO> <aaaa-mm-dd>.pdf` |
| Documento del vehículo | Directo a su carpeta de `1.-DOCUMENTACIÓN` con las reglas de documentación (`reglas.concepto_archivo`): alta y tarjeta junto a las demás; tenencia, póliza y responsiva a `… ANTERIORES`, siempre con el año (`TENENCIA-0113 2020.pdf`) |
| Factura de un trámite | `FACTURA PAGO TENENCIA` → tenencia; `FACTURA CAMBIO DE PLACAS` → alta de placas; de verificación → `_POR REVISAR`. La carta factura sí es la del vehículo |
| De un servicio | Lo que venga de `SERVICIO`, `COTIZACION`, `AUTORIZACION`, `GALERIA`, `ENCUESTA`, `TALLER` nunca va a documentación: `_POR REVISAR` (le toca a `2.- SERVICIOS`) |
| Ya está en documentación | Mismo md5 que algo de `1.-DOCUMENTACIÓN` del NUCO → papelera |
| Sin clasificar | `_POR REVISAR/`, plano, con su carpeta de origen al frente: `FOTOS DE RECUPERACION - IMG_001.jpg` |
| Evidencia con nombre propio dentro de una inspección | Se queda dentro (`REMOLQUE/`, `EVIDENCIAS DE CAMINO/`) |
| Idénticos que llegan al mismo lugar | Uno se queda, el otro a la papelera. Mismo nombre y otro contenido → ` (2)` |
| Relleno | Papelera |
| Carpetas viejas | Las que quedan vacías, a la papelera |

**Papelera.** En Mi unidad solo el dueño puede tirar un archivo. Lo que la cuenta no puede tirar se **mueve** a
`NUCOS VEHICULOS/_PAPELERA` (`1Xt81VTo_w5UF7R21zfbs4G49a7GfP_ke`), plano y con el NUCO al inicio del nombre
(`113 - CARPETA SIN INFORMACIÓN.jpg.pdf`). `deshacer` lo regresa igual que cualquier otro movimiento.

## Dry run (todo el expediente)

| | Archivos |
|---|---|
| Se quedan igual | 117,966 |
| Se mueven o renombran | 39,252 |
| Papelera (130 relleno, 21 ya en documentación, 11 idénticos) | 162 |
| PDF de inspección renombrados | 1,617 |
| Documentos a `1.-DOCUMENTACIÓN` | 711 |
| A `_POR REVISAR` | 514 |
| En `SIN PERIODO - …` | 5,126 (674 inspecciones viejas) |
| Raíces renombradas | 76 |

Revisiones automáticas del plan: cada archivo tiene un solo destino, ninguno cambia de NUCO, dos nunca terminan en la
misma ruta, nada va a la papelera sin motivo, ninguna carpeta pasa de 3 niveles.

**Lo que el dry run encontró antes de tocar nada** (y se corrigió):

- `BIMESTRE` se aceptaba como `TRIMESTRE` (23 PDF iban a carpetas de bimestre).
- La sección `DOCUMENTOS` se iba a "ajeno" (~250 carpetas de fotos).
- Dos inspecciones sin periodo del mismo año se revolvían en una carpeta (99 casos).
- Se adivinaba el periodo con la fecha de subida de las fotos.
- Facturas de servicios del taller y de pago de tenencia iban a `1.-FACTURA`.
- Variantes `2DO BMESTRE`, `NEUMATICOS (1)`, `OTROS`; secciones dentro de secciones; inspecciones dentro de
  `EXPEDIENTE UNIDAD 2023`; documentos sueltos con error de dedo (`RESONSIVA`).

Excel del dry run: `tools/nucos/.cache/dry-run-homologar-inspecciones.xlsx` (Resumen, Carpetas, PDF renombrados,
A documentación, Por revisar, Papelera, Choques de nombre) y los árboles antes/después en
`dry-run-homologar-inspecciones-arboles.txt`.

## Herramienta (`tools/nucos/`)

| Archivo | Qué hace |
|---|---|
| `foto.py <salida.json> [CLAVE]` | Solo lectura: el árbol completo (carpetas con ID, archivos con md5) de la carpeta de cada NUCO cuyo nombre contenga `CLAVE` (`INSPECC`, `SERVIC`, `DOCUMENTAC`) |
| `homologar_insp.py <foto.json> <salida>` | Dry run: el plan archivo por archivo (`salida.json`). Lee también `foto-doc.json` (la foto de `1.-DOCUMENTACIÓN`) junto a `foto.json` |
| `reporte_insp.py <foto.json> <plan.json> <salida> <NUCO,…>` | El Excel y los árboles antes/después de esos NUCO |
| `inspecciones.py aplicar <plan.json> <foto.json> <foto-doc.json> (--nucos … \| --todos) [--hilos N] [--continuar <bitácora>]` | **En la real.** Revisa que cada NUCO siga como en la foto (si no, no lo toca), crea carpetas, mueve y renombra, papelera, carpetas vacías; bitácora, respaldo en Drive y hoja |
| `verificar_inspecciones.py <plan.json> <foto.json> --nucos … [--arbol]` | Solo lectura: cada archivo está donde el plan dice, carpetas vacías, profundidad, nombres de nivel 2 |
| `expediente.py deshacer <bitácora.jsonl> [--nucos 482,…]` | Regresa todo (o solo esos NUCO), de la última línea a la primera. Anota en `<bitácora>.deshechos` lo deshecho para no repetirlo |
| `verificar_inspecciones.py x x --contra-foto <foto.json> --nucos …` | Después de deshacer: ¿quedó idéntico a la foto? |

Cada archivo movido lleva en `appProperties` de dónde venía (`origen_padre`, `origen_nombre`): viaja con él aunque
alguien lo mueva después. Mover conserva el ID, así que las ligas siguen sirviendo.

Los datos de la corrida (foto, plan) están en `tools/nucos/.cache/inspecciones/` (fuera de git).

### Bitácora y rollback

Cada paso se anota en `tools/nucos/.cache/bitacoras/<fecha>-inspecciones.jsonl` en el momento: `mover` (padre y
nombre de antes y después), `crear_carpeta`, `renombrar_carpeta`, `papelera`, `papelera_carpeta`. Al terminar:

- se respalda en `PRUEBA DE NUCOS VEHICULARES/BITACORAS/`;
- sus renglones se agregan a la hoja **BITACORA EXPEDIENTES NUCO** (en `PRUEBA DE NUCOS VEHICULARES`): cuándo, NUCO,
  acción, nombre antes/después, liga, ruta antes/después, motivo. Es el manifiesto que el área consulta.

`deshacer` regresa cada archivo a su carpeta y nombre (y le quita las `appProperties`), saca de la papelera, regresa
lo de `_PAPELERA`, devuelve el nombre de la raíz y manda a la papelera las carpetas creadas si quedaron vacías. Si entre
la corrida y el deshacer alguien sube algo a una carpeta nueva, esa carpeta no se borra. La foto (`foto.json`) guarda el
ID y la ruta de los 157 mil archivos de antes.

## Piloto (9-oct-2026)

| NUCO | Movidos | A `_PAPELERA` | Carpetas vacías | Verificación en vivo |
|---|---|---|---|---|
| 113 | 266 | 1 | 23 | 895 en su lugar, 0 vacías, 3 niveles |
| 267 | 355 | 1 | 30 | 649 en su lugar |
| 482 | 126 | 0 | 18 | 323 en su lugar |
| 111 | 51 | 0 | 5 | 804 en su lugar |
| 260 | 165 | 6 | 48 | 566 en su lugar |
| 140 | 179 | 0 | 33 | 503 en su lugar |

Bitácoras: `20261009-115102-inspecciones.jsonl` (113) y `20261009-115806-inspecciones.jsonl` (los otros 5), con 1,415
renglones en la hoja.

**Lo que salió en el piloto:** el primer intento de papelera falló con 403 (`insufficientFilePermissions`): las carpetas
y archivos son de `especialista.ci`, `especialistainspecciones.ci` y `ecajachica.ci`, y solo el dueño puede tirarlos. De
ahí `_PAPELERA` y el modo `--continuar` (terminar un NUCO que se cortó sin repetir lo movido).

**Velocidad:** ~1 movimiento por segundo con un hilo. Los ~38 mil restantes: ~11 h así; con `--hilos 6`, 2–3 h.

### Qué hay en `_PAPELERA`

165 cosas del piloto: 157 carpetas vacías (nombres viejos de inspecciones, envoltorios, secciones con acentos, carpetas
de documentos y servicios que se vaciaron) y 8 archivos (4 relleno, 4 fotos idénticas del 260). Las de
`especialista.ci` (100) y `especialistainspecciones.ci` (63) solo las puede tirar su dueño. Se deja así hasta terminar
la corrida grande (por si hay que deshacer) y luego el dueño la vacía.

## Pendientes

1. ~~Probar `deshacer` de verdad~~ **Hecho (9-oct):** el 482 se deshizo (`deshacer … --nucos 482`), quedó idéntico a
   la foto (361 de 361 elementos en su carpeta y con su nombre, nada de más, 0 con `appProperties`, sus 18 carpetas de
   vuelta de `_PAPELERA`) y se volvió a aplicar con la bitácora `20261009-123421-inspecciones.jsonl`.
2. **Foto nueva y dry run** justo antes de la corrida grande (la actual es de la mañana del 9-oct): `foto.py` con
   `INSPECC` y `DOCUMENTAC`, `homologar_insp.py`, revisar el resumen.
3. **Corrida grande**: `inspecciones.py aplicar … --todos --hilos 6`, en un horario sin movimiento (avisar al área que no
   suba a inspecciones mientras corre). Los NUCO del piloto se saltan solos.
4. **Verificar** los 575 con `verificar_inspecciones.py`.
5. **Inspecciones de la app** (304 de 2026): 202 ya copiadas por el área al NUCO (solo cambiar la liga de la hoja a esa
   copia) y 102 solo en `REPORTES` (moverlas al trimestre y guardar la liga). Plan aparte (`dry-run-inspecciones.xlsx`);
   la app tiene que generar el PDF en `<NUCO>/4.- INSPECCIONES/<año>/<N> TRIMESTRE/` y "Ver PDF" aceptar ligas.
6. **`_POR REVISAR`** (514 archivos): que el área diga qué es; lo de servicios irá a `2.- SERVICIOS`.
7. **Vaciar `_PAPELERA`** con las cuentas dueñas, al final.
8. **`2.- SERVICIOS`** y **`3.- VERIFICACIONES`**: inventario hecho para servicios (554 NUCO, 14 mil archivos; el
   evento de servicio con `FACTURA`/`COTIZACION`/`AUTORIZACION`/`GALERIA` es parejo, lo que cambia es dónde vive);
   propuesta `1.- LIBRETA DE SERVICIOS/<año>/<mes>/<evento>/`, sin aplicar.
9. **Aplanar lo de documentación** con el mismo criterio (`ANTERIORES/ESTRUCTURA ANTERIOR`, `ANTERIORES/REPETIDOS`, las
   subcarpetas con nombre de persona en `5.-RESPONSIVA`).
