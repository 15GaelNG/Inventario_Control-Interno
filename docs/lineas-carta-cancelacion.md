# Carta de cancelación de Líneas: un solo camino, subir la carta

Pestaña **Cancelaciones** de *Resguardos y cancelaciones*. Antes la bandeja avanzaba POR FIRMAR → CARTA FIRMADA → CARTA
ENVIADA → CANCELADA a mano y sin evidencia, y nada avisaba si el proveedor seguía cobrando una línea dada de baja.

**Objetivo:** que la carta sea la prueba que mueve las líneas, que el sistema ayude a armarla y que la factura diga si
la baja ya pasó.

## El proceso (único): la guía de 4 pasos

Arriba de la tabla de Cancelaciones hay una franja con los 4 pasos, **solo cuando hay líneas que esperan su carta** (si no,
no aparece; usuario, 13-nov). Cada paso dice cuántas líneas esperan en él y trae su botón. El paso que toca va resaltado.

1. **Prepara la carta.** «Preparar carta» arma el **borrador** en PDF: una carta por proveedor + razón social, con la
   tabla llena. **No mueve ninguna fase.** Pide la fecha y quién firma (se recuerda en el navegador).
2. **Fírmala y mándala** desde tu correo al asesor. El sistema no manda correos. «Copiar para el correo» pone la tabla
   en el portapapeles, como la del Excel «Cancelaciones», lista para pegar en Gmail.
3. **Súbela.** «Subir carta» (uno o varios PDF): el sistema lee cada carta, liga la carta a sus líneas y las pasa a
   **CARTA ENVIADA**. La carta se guarda como `CARTA CANCELACION <PROVEEDOR> <RAZÓN SOCIAL> <aaaa-mm-dd>.pdf`. Es el
   **único** camino a CARTA ENVIADA: la acción de la tabla «Subir carta» abre lo mismo, con lo elegido ya marcado.
4. **Confirma con la factura.** La columna «Factura» dice, de lo enviado, si el proveedor la sigue cobrando, si ya no
   aparece (lista para confirmar) o si aún no llega la factura siguiente. «Ver listas» y «Ver cobradas» filtran la
   tabla; «Confirmar cancelada» la pasa a CANCELADA.

## Decisiones

- **10-nov-2026:**
  - Por fases. Nada a prod sin autorización.
  - La carta la manda la responsable **desde su correo**. El sistema no envía: un permiso de Gmail en `oauthScopes`
    tumbaría prod hasta autorizarlo.
  - El nombre de quien firma nunca va en el código (el repo es público).
  - La cuenta de SIM básicos va **junta** en la misma carta.
  - Las cartas reales no se suben al repo. Las pruebas usan textos inventados.
- **11-nov-2026:**
  - **Un solo camino:** toda línea llega a CARTA ENVIADA subiendo la carta.
  - «Preparar carta» solo genera el borrador.
  - **CARTA FIRMADA** queda como marca manual opcional.
- **13-nov-2026** (el usuario pidió terminarlo pulido y sencillo, solo en el DEV y sin commits):
  - La guía de 4 pasos sustituye a los botones sueltos de la barra.
  - Quien firma se escribe en «Preparar carta»; la propiedad `LINEAS_CARTA_FIRMANTE` solo lo propone.
  - «Confirmar cancelada» rechaza POR FIRMAR o CARTA FIRMADA sin carta. Lo que ya estaba CARTA ENVIADA sí pasa.
  - La campanita («se sigue cobrando») queda para después.

## Estado (17-nov): probado en el DEV por el usuario; PR a master

| Paso | Qué | Dónde |
|---|---|---|
| 1a | Subir carta: lectura, vista previa, aplicar | `LineasCarta.leer/aplicar`, `LineasResguardos.vistaCarta/cartaEnviada` |
| 1a+ | Nombre definitivo, varios PDF, lectura de la tabla en imagen | `LineasCarta.aplicar` (`nombreGuardada`), `textoDeLaPagina_`; pantalla `subirCartas` |
| 1b | La regla: solo «Subir carta» lleva a CARTA ENVIADA; sin carta no se confirma | `faseCancelacion`, `confirmarCancelacion` |
| 1-antes | Cargar las cartas de antes | `lineasCartasAntesRevisar()` / `lineasCartasAntesAplicar()` (editor) |
| 2 | Cruce con FACTURAS | `LineasFacturas.gs`; `TelefoniaService.conCobro_` |
| 3 | Borrador | `LineasCarta.preparar`, `src/html/pdf/carta-cancelacion.html` |
| UI | Guía de 4 pasos, columnas Carta y Factura, copiar para el correo | `src/html/js/lineas-resguardos.html`, `lineas-estilos.html` |

Rama `lineas-carta-subir` (worktree `..\Inventario-carta`), encima del master del 13-nov. El DEV se sube desde
`..\Inventario-dev-mezcla`, con el «Alta de usuarios» junto.

## Lectura de la carta

- El PDF se copia como Documento con OCR de Drive y se lee el texto.
- **La tabla pegada como imagen (13-nov):** en 25 de las 42 cartas de antes la tabla era una imagen dentro de un PDF con
  texto. Drive solo lee la capa de texto y no hace OCR a las imágenes. Si el texto no trae ningún número, se pide la
  imagen de la primera página (la miniatura de Drive a 2400 px) y se le hace OCR. Usa los permisos que ya tenía el
  proyecto (`drive`, `script.external_request`). Límite: solo la **primera página**; lo que falte se agrega a mano en la
  vista previa.
- Números: 10 dígitos o escritos como teléfono. Fecha en letra o dd/mm/aaaa. Proveedor: Radiomóvil Dipsa → TELCEL,
  AT&T Comercialización Móvil → AT&T.

## Las cartas de antes

Carpeta «Cartas de Cancelación de Líneas» de producción (`LINEAS_CARTAS_ANTES` en el bloque del DEV de Entornos.gs).
La función la **lee**: nunca mueve ni renombra los PDF. A cada renglón CARTA ENVIADA o CANCELADA sin carta le pone la
liga (`CARTA`, `CARTA_HUELLA`) y la suma al inventario. Nunca cambia una fase. Si un número está en dos cartas, se queda
con la más reciente. Reemplaza a `lineasCartaAplicar` y al libro `LINEAS_CARTA_LIBRO` (siguen ahí; se retiran después).

**Revisión hecha desde aquí el 13-nov** (mismo código de lectura, sin escribir nada):

- 44 PDF, 42 distintos por huella. Una no es de cancelación: es de «Cambio de ciclo de facturación» y sale sin números.
- Con la lectura de la imagen de la página, 41 cartas dan 292 números.
- **DEV** (copia del 30-oct): los **37** renglones enviados o cancelados quedan con su carta; ninguno queda sin carta.
- **Producción** (12-nov): se ligarían **44 de 56**. Los otros 12 están en CARTA ENVIADA: sus cartas no están en la
  carpeta (seguramente se mandaron después). Se pueden subir con «Subir carta» y se ligan sin cambiar su fase.
- Ninguna carta de antes trae líneas que sigan POR FIRMAR o CARTA FIRMADA.

## Producción: pasos, en orden (con autorización)

1. Commit y PR (17-nov, después de la prueba del usuario en el DEV).
2. ~~Crear `CARTAS DE CANCELACION` en la raíz~~. **17-nov (usuario):** prod guarda en la carpeta de siempre, «Cartas de
   Cancelación de Líneas»: `LINEAS_CARTAS_CARPETA` en el bloque de prod (un DEV no la tiene; revisarEntorno lo vigila).
   La cuenta que despliega tiene que ser **Editor** de esa carpeta (revisarEntorno lo revisa y, si no, no despliega).
3. Propiedad del proyecto `LINEAS_CARTA_FIRMANTE` (opcional: solo propone el nombre). Nunca en Entornos.gs.
4. Subir `logo-ciudad-maderas-carta.png` (472 × 88) a `RECURSOS PDF` de prod (en el DEV ya está).
5. ✔ `carta-cancelacion` encendido en prod (`PdfHtml.DOCUMENTOS`, 17-nov).
6. ✔ `LINEAS_CARTAS_ANTES` en el bloque de prod (la misma carpeta, 17-nov).
7. Desplegar.
8. En el editor de prod (`src/services/lineas/LineasCarta.gs`): `lineasCartasAntesRevisar()` y luego
   `lineasCartasAntesAplicar('SI, EN PROD')`. Si se acaba el tiempo, se corre otra vez y sigue.

La regla viaja en el mismo despliegue. No traba nada: lo que ya estaba CARTA ENVIADA se puede confirmar, y lo que está
POR FIRMAR hoy (2 líneas) necesita su carta, que es justo el proceso.

## Verificación

- `npm test`: solo las 3 fallas viejas de master. Pruebas nuevas o tocadas:
  - `lineas-carta.test.cjs`
  - `lineas-facturas-cobro.test.cjs`
  - `lineas-resguardo-cancelacion.test.cjs`
- Vista previa, en escritorio, celular, tableta y oscuro, sin nada que se salga de lo ancho:
  - `lineas-cancelaciones`
  - `lineas-preparar-carta`
  - `lineas-cartas-listas`
  - `lineas-subir-carta`
  - `lineas-cartas-factura`
- En el DEV, de punta a punta:
  1. Preparar la carta de unas líneas POR FIRMAR y guardar el PDF.
  2. Subir ese mismo PDF y revisar:
     - que lea todos los números;
     - que las líneas pasen a CARTA ENVIADA;
     - el nombre de la carta en Drive;
     - «Ver carta» y la liga en LINEAS.
  3. «Confirmar cancelada» en una POR FIRMAR sin carta: debe rechazarla.
  4. Correr `lineasCartasAntesRevisar()` y `lineasCartasAntesAplicar()`.
  5. Revisar la columna Factura contra el Panorama de Líneas.

## Para después

- Aviso en la campanita cuando una línea con carta enviada se sigue cobrando.
- Que el Panorama use `LineasFacturas` en lugar de su propia lectura de FACTURAS.
- Retirar `lineasCartaAplicar` y `LINEAS_CARTA_LIBRO` cuando las cartas de antes estén cargadas en prod.
