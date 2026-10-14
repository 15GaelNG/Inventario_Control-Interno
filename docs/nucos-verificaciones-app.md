# Verificaciones de la app → expediente del NUCO (corrida 2 y 2 bis, 13 y 14-oct-2026)

Los comprobantes de la hoja VERIFICACIONES (columna COMPROBANTE VERIFICACION) vivían en
`ControlVehicular/VERIFICACIONES_Images`. Hoy **esa carpeta está vacía**: todos están en
`NUCOS VEHICULOS/<NUCO>/3.-VERIFICACIONES`, y la hoja guarda la liga. Contexto: `nucos-verificaciones.md` (la carpeta del
área) y `nucos-fase3-pendiente.md` (el plan de la Fase 3).

## Reglas (decididas con el usuario)

- **El vehículo se sabe por el certificado o por una persona, nunca por el folio.** Los registros de AppSheet se ligaban
  por folio, y muchos quedaron en otro vehículo; el NUCO 2 tenía colgados certificados de 211, 197, 42, 308, 109…
- **Una fecha leída con OCR nunca corrige sola.** Se queda la capturada, salvo que la persona escriba FECHA CORRECTA.
- **Nada se queda donde estaba antes** (14-oct). Todo va a NUCOS VEHICULOS:
  - lo confirmado → `<año>/<1ER|2DO> SEMESTRE/VERIFICACION-NNNN aaaa-mm-dd[ DOBLE CERO][ RECHAZO].ext`, con `(2)` si el
    nombre ya existe;
  - **duplicado** (mismo md5, o mismo FOLIO de certificado que otro comprobante del NUCO ese día) → `DUPLICADOS` junto al
    bueno, y la celda apunta al bueno. El semestre queda limpio y no se pierde nada;
  - sin decidir → `3.-VERIFICACIONES/_POR REVISAR` de su NUCO, con su nombre original;
  - sin registro y sin vehículo legible → `NUCOS VEHICULOS/_POR REVISAR/VERIFICACIONES SIN NUCO`.
- Mover conserva el ID del archivo. Cada paso va con bitácora (en `.cache/bitacoras/` y respaldada en Drive,
  PRUEBA DE NUCOS VEHICULARES/BITACORAS) y tiene su deshacer. Siempre: ensayo → piloto de 5 → verificación → resto.

## Corrida 2 (13-oct): lo que el certificado confirmaba solo

`verificaciones_app.py`. Solo se movía si la serie (NIV) leída con OCR era la del vehículo del registro, y la fecha del
certificado era la capturada (o no se leía). Si el área ya tenía un comprobante de ese día, se comparaba el folio.
Resultado: **155 registros con liga** (100 movidos y 55 ligados al archivo del área). Bitácoras `20261013-173134`,
`173210` (piloto) y `20261013-173629-verif-app`. Quedaron 257 sin tocar: unos 126 sin serie legible, 84 con la serie de
otro vehículo y unos 40 con otra fecha.

## Revisión a mano (14-oct)

`.cache/verificaciones/20261013/verificaciones-completo.xlsx` (lo arma `armar_completo.py` en esa carpeta):

- Una fila por registro. **Azul:** el vehículo ligado hoy según el inventario. **Verde:** lo que trae el certificado
  (serie, placa, fecha, folio, motivo) y el vehículo del inventario que le corresponde. **Amarillo:** NUCO CORRECTO,
  FECHA CORRECTA y Comentario, para llenar.
- **Serie y placa tolerantes al OCR** (`verificaciones.series_aprox` / `placas_aprox`): letras que el OCR confunde (6/G,
  0/O, 5/S, 8/B…), una letra de más o de menos, o la serie partida en dos. Si dos vehículos quedan casi igual de cerca,
  no escoge (las series de una flota a veces difieren en un dígito). Prueba: con los 422 certificados de serie exacta,
  estropeada a propósito, **0 veces escogió otro vehículo** (383 bien y 39 sin decidir).
- **Confianza:** ALTA (serie exacta, serie con pocos errores, o serie y placa juntas; el NUCO venía ya escrito) 165,
  MEDIA (solo la placa, o una serie con más errores) 47, sin propuesta 44.
- **Lo que decidió el usuario:** dejó los ALTA como venían, llenó a mano 42 de los 44 sin propuesta, y pidió que los MEDIA
  tomen el NUCO sugerido (columna T) con la fecha capturada. Los otros 2 se quedaron como duda.

## Corrida 2 bis (14-oct)

| Paso | Herramienta | Resultado | Bitácora |
|---|---|---|---|
| 1. Re-ligar en la hoja | `religar_manual.py` | 148 registros: ID VEHICULO, FOLIO VEHICULO, PLACA y NUCCO del vehículo correcto (592 celdas) | `20261014-115626-religar-manual` |
| 2. Piloto: NUCO 180, 95, 2, 37 y 330 | `verificaciones_app.py plan … --decididos` | 13 archivos | `20261014-115727-verif-app` |
| 2. Resto (132 NUCO) | ídem | 297 archivos, 297 celdas, 316 carpetas, 0 saltados | `20261014-122128-verif-app` |
| 3. Sueltos (ningún registro los citaba) | `verif_sueltos.py` | 50 archivos, 1 celda | `20261014-125116-verif-sueltos` |

- `--decididos` recibe el plan de `religar_manual.py`. Para esos registros vale la decisión de la persona aunque la
  serie no se lea; si el OCR leyó otra fecha, solo se avisa.
- Los **55 originales** que la corrida 2 había dejado en la carpeta vieja (los que se ligaron a la copia del área) se
  fueron a `DUPLICADOS`.
- Los 50 sueltos: 43 a `<NUCO>/3.-VERIFICACIONES/_POR REVISAR/SIN REGISTRO` (la serie o la placa dicen el NUCO; no van a
  un semestre porque no hay una fecha confiable), 2 versiones anteriores de un comprobante reemplazado a `DUPLICADOS`
  (NUCO 63 y 255; su prefijo es el ID de AppSheet de su registro), los 2 archivos de la duda VER-000000365GE36X a
  `_POR REVISAR` del NUCO 98 (la celda abre el más reciente) y 3 ilegibles a `VERIFICACIONES SIN NUCO`.

**Revisión final, en vivo, de los 430 registros:** el NUCCO de cada uno es el de su ID VEHICULO; **411 abren un archivo
dentro de su propio NUCO** (407 en su año y semestre con nombre y fecha correctos, 2 dudas en `_POR REVISAR` y 2 que abren
un archivo del área con otra fecha en el nombre); 18 nunca tuvieron comprobante; 1 dice "Unable to load image data"
desde AppSheet. Los 144 duplicados están junto a su bueno, y algún registro abre ese bueno. `VERIFICACIONES_Images`: 0 archivos.

## Pendiente (para el usuario o el área; nada está roto)

- **Dudas:** VER-000000365GE36X (NUCO 98) y VER-0000003425V10P (NUCO 2), en `_POR REVISAR`.
- **Unos 23 registros son el mismo certificado capturado dos veces** en AppSheet (19 con el mismo folio impreso, 4 con
  folios que difieren en un dígito por el OCR). No se borró ninguno; mientras sigan, ese vehículo tiene dos
  verificaciones del mismo día. Ejemplos: VER-00000081DTWCJ9 / VER-00000090JR1N53 (NUCO 180), VER-0000008B2K1G8F /
  VER-000000973KAAYE (298).
- **46 archivos sin registro**, probablemente de registros borrados en AppSheet: si alguno vale, darle de alta su registro.
- **Fecha distinta en el nombre:** VER-0000001YAKRFXX (NUCO 79, el archivo del área no trae fecha) y VER-0000006TSR8PAR
  (NUCO 365: el archivo dice 2025-11-04 y se capturó el 21-nov).
- Lo que quedó de la homologación del área (12-oct): 106 archivos que no son verificación y los certificados
  rescatables de los NUCO 196, 267 y 252 (`nucos-verificaciones.md`).

## Deshacer

Del último paso al primero:
`verif_sueltos.py deshacer <bitácora>` → `verificaciones_app.py deshacer <bitácora>` (resto, luego piloto) →
`religar_manual.py deshacer <bitácora>`. Cada uno regresa solo las celdas que siguen con el valor que puso.
