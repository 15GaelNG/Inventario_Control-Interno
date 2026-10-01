# Limpieza del spreadsheet ControlVehicular — bitácora de lo que se hizo

> **Qué es esto:** el registro de lo que de verdad se ejecutó el 29/09/2026, con los
> números medidos y dónde quedaron los respaldos. No es un diseño ni un plan: es lo que
> pasó, para que dentro de seis meses alguien pueda reconstruirlo sin adivinar.
>
> El modelo de IDs está en [ids.md](ids.md); el procedimiento, en
> [ids-asignacion.md](ids-asignacion.md). Aquí va la limpieza de pestañas y de filas.

## Por qué se hizo

El spreadsheet de producción tenía **50 pestañas y 5,834,611 celdas: el 58.3% del límite de
10 millones** que permite Google Sheets. La pregunta original era cuáles pestañas no se
usaban, para evaluar borrarlas.

Al medir aparecieron dos cosas que cambiaron la prioridad:

1. **Borrar pestañas no era donde estaba el espacio.** `VEHICULOS` tenía un grid de 50,497
   filas × 43 columnas para **648 filas con datos**: 2.1 millones de celdas en vacío, el
   37% del archivo. Recortar filas vacías libera 6.6 veces más que borrar las 19 pestañas,
   y no borra un solo dato.
2. **Una pestaña de respaldo no era inerte: competía.** Ver la sección de la mina.

## La mina que encontramos: `getSheetByColumns`

`SheetUtils.getSheetByColumns` (`src/utils/SheetUtils.gs`) **no busca la hoja por su
nombre: la busca por qué columnas tiene.** Y cuando varias coinciden, desempata quedándose
con **la que tenga más filas**.

Así eligen su hoja cuatro servicios —Verificaciones, Sensores, Hologramas, Inspecciones— y
también `PermisosService`, que es la autenticación.

Consecuencia: una copia con la misma forma de columnas **compite** por la hoja. Medido en
producción el 29/09/2026:

| Servicio | La que usaba | La que competía | Ventaja |
|---|---|---|---|
| Sensores | `INSTALACION DE SENSORES` (208) | `Copia de INSTALACION DE SENSORES` (207) | **1 fila** |
| Hologramas | `HOLOGRAMAS` (255) | `HOLOGRAMAS (24/04/25)` (151) | 104 filas |

Con dos filas más en la copia, Sensores se cambiaba de hoja **sin avisar** y empezaba a
leer y escribir en el respaldo.

No era una mecha encendida: las fórmulas de la copia son `XLOOKUP` de rango fijo, no se
expanden, y la hoja viva crece con cada instalación, así que la ventaja aumentaba con el
uso. Era una mina: alguien tenía que pisarla (borrar filas de la viva, o arrastrar las
fórmulas de la copia).

**Se cerró en producción** al mudar esa copia. **En la copia de pruebas sigue abierta**: ahí
`INSTALACION DE SENSORES` tiene 210 y la copia 208.

Para revisarlo cuando sea: `pipelineRevisarFirmas` avisa cuando el margen baje de 50 filas.

## Lo que se hizo en PRODUCCIÓN

Con el visto bueno del superior de Ayrton, las **19 pestañas** que el barrido de `src/` no
encontró nombradas en ningún archivo se respaldaron y se quitaron.

### Cómo se decidió

Cinco señales, todas medidas y ninguna supuesta:

| Señal | Resultado |
|---|---|
| ¿La nombra el código? | barrido de todo `src/`, incluyendo nombres dinámicos, mapas, `getSheets()` y el front end |
| ¿La cita una fórmula? | solo 2 referencias cruzadas, ambas entre copias |
| ¿Está oculta? | 12 de las 19 lo estaban |
| Filas con datos / celdas | medido por pestaña |
| **¿La usa AppSheet?** | **nunca se consiguió.** Es la mitad que faltó |

> **La advertencia que quedó sin resolver:** no se obtuvo la lista de tablas de AppSheet
> (su editor → Data → Tables). Una pestaña que el código no nombra puede ser una tabla viva
> suya. Se procedió con el respaldo completo como única red. Si AppSheet se queja de una
> tabla faltante, la lista de las 19 está en `pestanas-sin-uso.xlsx`.

### Las 19, y por dónde salieron

**7 se quitaron a mano** (no pasaron por la función, así que **no están en el libro
histórico**, solo en el respaldo completo):

`Copia de INSTALACION DE SENSORES` · `Copia de LINEAS TELEFONICAS 1` · `Hoja 55` ·
`Copia de LINEAS TELEFONICAS` · `SERVICIOS` · `COLABORADORES 2` · `Hoja 53`

> `Hoja 53` traía **207 filas con datos** pese a su nombre de descarte. Si alguien la
> busca, está en el respaldo completo.

**12 se mudaron con `pipelinePRODMudarHistoricasEscribir`**, que copia, comprueba la
integridad y solo entonces borra. La bitácora `LOG_MIGRACION` las registra con resultado OK
y ninguna fallida:

`HOLOGRAMAS (24/04/25)` · `LINEAS 05/12/2025` · `LINEAS 15/10/25` ·
`LINEAS TELEFONICAS (08/07/2025)` · `LINEAS TELEFONICAS 05/06/25` ·
`LINEAS TELEFONICAS 21/04/25` · `RESPALDO 2 LINEAS TELEFONICAS` ·
`Respaldo de LINEAS TELEFONICAS` · `Copia de HOLOGRAMAS` · `Cambios Imei` ·
`DASHBOARDS` · `CONFIGURACIONES`

### Dónde quedaron los respaldos

| Qué | Id |
|---|---|
| **Respaldo completo** del ControlVehicular, antes de todo | `1Pvr_8wnBlgxKL85a77ieTmkCvC64PZFP5rLbg4WcNM4` |
| **Libro histórico** con las 12 mudadas | `1KIuE_P1aG6jbWMZ6zM6DOfq_wJf6K7x07ewmGedjs90` |

Las pestañas que estaban ocultas **siguen ocultas en el libro histórico**: están, pero no se
ven en la barra hasta que se muestren.

### Resultado

| | Antes | Después |
|---|---|---|
| Pestañas | 50 | **30** |
| Celdas | 5,834,611 (58.3%) | **4,911,485 (49.1%)** |

## Lo que sigue pendiente: recortar filas vacías

Construido y ensayado en la copia de pruebas, **no aplicado todavía**.

`limpiarFilasVacias()` borra las filas del grid **por debajo del último dato**, dejando 200
de colchón para que AppSheet siga insertando. **No borra ningún dato.**

Medido en la copia de pruebas: **32 pestañas, 3,021,489 celdas**, que la llevarían del 50.1%
al **19.9%** del límite.

**Se puede correr con AppSheet vivo.** La regeneración de esquema que AppSheet exige está
amarrada a las *columnas* (*"add, reorder, or delete columns"*); las filas no aparecen en
ninguna de esas listas. Y según su propio documento de rendimiento, *"if you double the
number of rows in the worksheet, the Calc Chain length can double"*: el grid vacío lo hace
recalcular de más, así que el recorte debería **acelerar la app**.

*La evidencia tiene un límite:* la documentación nunca dice "borrar filas es seguro", solo
nunca las menciona. Es inferencia por ausencia. Por eso el ensayo va primero y se mira
AppSheet antes de tocar producción.

## Un hallazgo de paso que vale revisar

`LOG_RELACIONES` en la copia de pruebas tiene **1,036 renglones**: alguien corrió
`Relaciones.revisar()` el 24/09/2026 y encontró **812 diferencias y 224 huérfanos**.

| Hoja | Diferencias |
|---|---|
| `HOLOGRAMAS` | 564 |
| `INSTALACION DE SENSORES` | 438 |
| `VERIFICACIONES` | 34 |

Las columnas que más difieren: `CAPACIDAD DE COMBUSTIBLE` (338), `SERIE VEHICULO` (222),
`CAPACIDAD DEL TANQUE` (122), `RESPONSABLE` (122), `COLOR` (98), `PLACA` (60).

**Por qué importa, y qué corrige de lo que dijimos antes.** Al medir que el `FOLIO` cambió
**0 veces en 9,214** correcciones, concluimos que el problema de "las copias se
desincronizan" no se daba en la práctica. Eso era cierto **de las llaves**, pero se extendió
de más: **los atributos copiados sí están desincronizados, y bastante.**

No cambia la decisión sobre los IDs —unir por `ID` en vez de por `FOLIO` no resuelve esto,
porque el problema no es la llave sino las copias de atributos— pero confirma que
`Relaciones.propagar` de jorge está atacando un dolor real. Y aparece `SERIE VEHICULO` con
222 diferencias, que es justo la llave con la que `HOLOGRAMAS` se une a `VEHICULOS`.

## Estado de los IDs (verificado el 29/09/2026)

En la copia de pruebas, **las 24 hojas del catálogo tienen su columna `ID` en la posición 1,
llena al 100% y con el formato correcto**, sin una sola excepción entre ~55,000 renglones.

Las que no la necesitan no la tienen: `USUARIOS`, `MODULOS`, `PERFILES`,
`MODELOS INSPECCION`, `LISTAS VEHICULOS`, `LISTAS TELEFONOS`, `DEPARTAMENTOS` y las dos
bitácoras.

Dos excepciones a propósito: `APP_MOVIMIENTOS` (4 filas) y `APP_EVIDENCIAS` (2) siguen con
formato viejo porque están marcadas `delSistemaNuevo` — no vienen de AppSheet y no hay nada
que convertir. Sus altas nuevas sí nacen con `MOV-` y `EVI-`.

## Diferencias entre ambientes, para no confundirse

| | Producción | Copia de pruebas |
|---|---|---|
| Pestañas | 30 | 38 |
| Columna `ID` | **no migrada** | migrada, 24 hojas |
| Hoja `PERFILES` | no existe → permisos usan el ROL viejo | existe, y solo 2 de 58 usuarios tienen perfil |
| `Copia de INSTALACION DE SENSORES` | quitada | **sigue ahí, compitiendo** |
| `UBER JUANITO`, `TICKETS 24/04/25` | siguen (el código las menciona en comentarios) | siguen |

> **La mina de los permisos.** Producción funciona hoy porque **no** tiene la hoja
> `PERFILES`: sin ella el sistema usa el ROL viejo y los 40 usuarios no-admin entran normal.
> El día que alguien corra `configurarPermisos()` en producción, **esos 40 se quedan sin un
> solo módulo**, que es exactamente lo que ya pasó en la copia de pruebas. El arreglo es
> que la red de seguridad sea por persona y no por hoja, en `PermisosService.resolver_`.
> Sigue pendiente.

## Las funciones, y cuál apunta a dónde

Todas se corren a mano desde el editor de Apps Script, seleccionándolas en el desplegable.

**Las que llevan `PROD` en el nombre van al ControlVehicular real**, sin depender de cómo
esté configurado el proyecto desde donde se corren. Las demás usan lo que digan las Script
Properties, que en un proyecto DEV apuntan a la copia de pruebas. Todas imprimen el id del
spreadsheet en su primera línea, así que siempre se puede verificar contra cuál se corrió.

| Función | Escribe | Dónde |
|---|---|---|
| `pipelinePRODRespaldar` | crea copia | producción |
| `pipelinePRODMudarHistoricasEnsayo` | no | producción |
| `pipelinePRODMudarHistoricasEscribir` | **sí, borra pestañas** | producción |
| `pipelineRevisarFirmas` | no | según propiedades |
| `pipelineLimpiarFilasVaciasEnsayo` | no | según propiedades |
| `pipelineLimpiarFilasVaciasEscribir` | **sí, borra filas de grid** | según propiedades |
| `pipelineEstado` | no | según propiedades |

Escribir en producción pide tres Script Properties, separadas a propósito para que ninguna
se dé por hecha: `MIGRACION_IDS_AUTORIZAR_PRODUCCION`, `MIGRACION_APPSHEET_APAGADO` (que
las operaciones que no cambian el esquema pueden saltarse) y `MIGRACION_RESPALDO_ID`, que
escribe el paso 0.

## Detalles de implementación que costaron trabajo descubrir

- **`DriveApp` no tiene permiso en este proyecto** (`Access denied: DriveApp`), aunque el
  scope esté declarado en `src/appsscript.json`. El respaldo se hace con
  `Spreadsheet.copy()`, que solo necesita el permiso de hojas de cálculo. Ninguna función
  del pipeline usa `DriveApp`.
- **La lista de pestañas a mudar está escrita a mano y cerrada** (`PIPE_HISTORICAS`). La
  función se niega a tocar cualquier cosa que no esté ahí, y también se niega si el nombre
  aparece en el catálogo de `Entidades`. Así un typo no se lleva una hoja viva.
- **`Hoja 55` y `Copia de LINEAS TELEFONICAS 1` van juntas o ninguna**: 64 fórmulas de la
  segunda citan a la primera. La función lo verifica y truena si solo una está presente.
- **El servicio avanzado de Sheets ya está activado** en `src/appsscript.json`, por si
  alguna vez hace falta `batchUpdate`.
- **No existe ningún activador** en el proyecto, y el manifiesto **no declara el scope
  `script.scriptapp`**, así que crear uno por código hoy fallaría. La convención del repo es
  crearlos a mano en el editor.

## Archivos de apoyo, en la raíz del repo

| Archivo | Qué trae |
|---|---|
| `pestanas-sin-uso.xlsx` | Las 19, con su grupo, riesgo, y la columna de AppSheet para llenar |
| `auditoria-ids.xlsx` | Una fila por hoja: columna vieja, columna nueva, ejemplo de cada lado |
| `prefijos-ids.xlsx` | Los prefijos por módulo, el formato del ID y las reglas confirmadas |
| `fechas-de-alta.xlsx` | Qué columna de fecha representa el alta, en producción y pruebas |
