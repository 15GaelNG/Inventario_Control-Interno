# Relaciones entre hojas (datos copiados)

> **Estado:** diseño aprobado, **pendiente de implementar**. Se construirá al final,
> cuando los módulos principales ya existan. Mientras tanto, sigue las
> [reglas para desarrollar mientras tanto](#reglas-para-desarrollar-mientras-tanto).

## El problema

Varias hojas guardan una **copia** de datos que pertenecen a otra hoja. Ejemplo:
`PLACA` vive en `VEHICULOS`, pero también está escrita en `INSTALACION DE SENSORES`
y en `VERIFICACIONES`. Si alguien cambia la placa en Vehículos, las copias se
quedan con la placa vieja.

En una base de datos se resolvería guardando solo el `FOLIO` y consultando la placa
cuando se necesite. Aquí **no se puede todavía**: AppSheet sigue leyendo esas hojas y
espera ver los datos escritos en cada una. Por eso la solución es mantener las copias,
pero **controladas desde un solo lugar**.

## La solución: `src/services/Relaciones.gs`

Un archivo que sabe qué hojas copian datos de cuáles y mantiene esas copias iguales al
original. Los módulos no copian datos por su cuenta: le piden a `Relaciones`.

### Principio: un solo dueño por dato

- `VEHICULOS` es dueña de PLACA, SERIE, MARCA, LÍNEA, etc.
- En cualquier otra hoja esas columnas son **copias**: en la app **no se editan**
  (se muestran como solo lectura).

### Pieza 1 — El mapa (lo único que se edita a mano)

```js
const MAPA = {
  VEHICULOS: {                                   // hoja dueña del dato
    spreadsheet: () => Config.SPREADSHEET_IDS.VEHICULOS(),
    clave: 'FOLIO',                              // columna que une las hojas
    copias: [
      {
        hoja: 'INSTALACION DE SENSORES',
        spreadsheet: () => Config.SPREADSHEET_IDS.VEHICULOS(),
        clave: 'FOLIO',                          // cómo se llama el folio en ESTA hoja
        columnas: {                              // columna en VEHICULOS → columna en esta hoja
          'PLACA': 'PLACA',
          'LINEA VEHICULO': 'LINEA',             // pueden llamarse distinto
        },
      },
      {
        hoja: 'VERIFICACIONES',
        spreadsheet: () => Config.SPREADSHEET_IDS.VEHICULOS(),
        clave: 'FOLIO VEHICULO',
        columnas: { 'PLACA': 'PLACA' },
      },
    ],
  },
};
```

Un módulo nuevo que copia datos = agregar su entrada aquí. Nada más.

### Pieza 2 — `Relaciones.propagar(origen, clave, cambios)`

Se llama después de editar el registro dueño:

```js
// VehiculosService.actualizar
const vehiculo = SheetUtils.update(ssId(), SHEET_VEHICULOS, id, cambios, ID_COLUMN);
const resumen = Relaciones.propagar('VEHICULOS', vehiculo.FOLIO, cambios);
// resumen → { 'INSTALACION DE SENSORES': 1, 'VERIFICACIONES': 3 }
// la app muestra: "Placa actualizada · también en 1 instalación y 3 verificaciones"
```

Qué hace:

1. De los `cambios`, se queda solo con las columnas que alguien copia. Si ninguna, termina (costo cero).
2. Bloquea el script (`LockService`) para que dos propagaciones no choquen.
3. Por cada hoja con copias:
   - lee **solo la columna de la clave** (no toda la hoja),
   - encuentra las filas con ese folio,
   - escribe el valor nuevo en esas celdas con **una sola llamada**
     (`sheet.getRangeList(['C14', 'C87']).setValue(nuevo)`).
     Así **no pisa otras filas** que alguien esté editando en AppSheet al mismo tiempo.
4. Regresa cuántas filas actualizó por hoja.

### Pieza 3 — `Relaciones.datosParaNuevo(hojaCopia, clave)`

Se llama al **crear** un registro que copia datos:

```js
// VerificacionesService.registrar
const copia = Relaciones.datosParaNuevo('VERIFICACIONES', datos.folio);
// → { 'FOLIO VEHICULO': 'AUT0100', 'PLACA': 'XYZ-987' }
// o error claro: "El folio AUT0100 no existe en VEHICULOS"
SheetUtils.insert(ssId, 'VERIFICACIONES', Object.assign(copia, { /* lo que sí se captura */ }));
```

Busca en el mapa qué columnas copia esa hoja, las trae del registro dueño y valida que exista.

### Pieza 4 — `Relaciones.revisar({ corregir })` (tarea nocturna)

Red de seguridad para los cambios que `propagar` nunca ve (edición directa en el Excel,
cambios hechos desde AppSheet). Corre con un activador de tiempo (p. ej. 2 a. m.):

1. Lee la hoja dueña **una vez** → índice `{ folio: datos }`.
2. Por cada hoja de copias compara fila por fila las columnas copiadas.
3. Si difieren y `corregir` es `true`, corrige en bloque.
4. Escribe cada diferencia en la hoja `LOG_RELACIONES`:

   | fecha | hoja | folio | columna | tenía | quedó |
   |---|---|---|---|---|---|

- **La primera vez se corre con `corregir: false`** (solo reporta), para medir cuántas
  diferencias hay antes de tocar datos.
- **Folios huérfanos** (la copia apunta a un folio que ya no existe): se reportan, no se borran.
- **Folio duplicado en la hoja dueña**: se reporta y ese folio no se corrige (no se sabe cuál es el bueno).

### Pieza 5 — `Relaciones.cambiarClave(origen, claveVieja, claveNueva)`

Cambiar el **FOLIO** mismo afecta a todas las hojas relacionadas. Por eso va aparte:

- Solo ADMIN.
- Primero cuenta y muestra el impacto ("se actualizarán 1 instalación y 3 verificaciones").
- Pide confirmación y cambia la clave en la hoja dueña y en todas las copias.

> `VEHICULOS` tiene `ID_VEHICULO` (nunca cambia), pero las demás hojas no lo guardan;
> por eso la unión es por `FOLIO`. Tratar el folio como **casi inmutable**.

### Casos especiales

| Situación | Comportamiento |
|---|---|
| Falla a medias (se guardó el original, falló una copia) | Aviso: "se guardó, pero no se actualizó X; se corregirá esta noche". `revisar` lo arregla. |
| Una columna del mapa no existe (la renombraron) | Error claro con hoja y columna. Nunca escribe en otra columna. |
| Folios con espacios / minúsculas | Se comparan normalizados (sin espacios, en mayúsculas). |

### Lo que NO usar

- **Fórmulas en la hoja** (`BUSCARV`, `ARRAYFORMULA`): AppSheet y el código escriben en
  esas celdas y borrarían la fórmula.
- **Activador `onEdit`**: no se dispara con cambios de AppSheet ni de código; se perderían
  cambios sin avisar.

### Rendimiento

Con cientos o pocos miles de filas: propagar tarda 1–2 s; `revisar` todo, menos de un minuto.

---

## Reglas para desarrollar mientras tanto

Para que conectar `Relaciones` al final sea cambiar unas pocas líneas y no una búsqueda
por todo el código:

1. **Copiar datos de otra hoja en UNA sola función por servicio**, con nombre claro:
   ```js
   /** TEMPORAL: se reemplaza por Relaciones.datosParaNuevo (ver docs/relaciones.md) */
   function datosDeVehiculo_(folio) { … }
   ```
   Nunca repartir `findById(… 'VEHICULOS' …)` + copia de columnas por varias funciones.
2. **Las columnas copiadas no se editan en el módulo que las copia.** En la tabla:
   sin `editable`; si cambia el folio, se vuelven a copiar desde el dueño.
3. **Cada vez que un módulo copie columnas de otra hoja, anotarlo** en el inventario de abajo.

---

## Inventario de copias (mantener al día)

| Hoja que copia | Clave | Columnas copiadas | Desde | Cómo se copia hoy | Pendiente |
|---|---|---|---|---|---|
| `VERIFICACIONES` | `FOLIO VEHICULO` | `PLACA` | `VEHICULOS` | `VerificacionesService`: al registrar y al cambiar el folio (copia en 2 lugares) | Unificar en `datosDeVehiculo_` (regla 1) |
| `INCIDENCIAS` | `FOLIO` | `DEPARTAMENTO`, `MODELO` | `VEHICULOS` | **Los manda el formulario** (autocompletado en el navegador) y son editables | Copiarlos en el servidor; quitar edición (regla 2) |
| `INSTALACION DE SENSORES` | `FOLIO` | Serie, placa, marca, clase, línea, modelo, razón social, departamento, sede, responsable (coinciden con `VEHICULOS`) | `VEHICULOS` | Módulo aún no construido en Apps Script | Confirmar nombres exactos de columnas y cuáles se capturan ahí (tipo de combustible, color, rendimiento, consumo en ralentí) |

**Problema conocido mientras no exista `Relaciones`:** editar PLACA (u otra columna copiada)
desde Vehículos **no** actualiza las copias. Afecta solo a la base de pruebas mientras se
desarrolla; `revisar({ corregir: false })` medirá las diferencias cuando se implemente.

## Orden de implementación (cuando toque)

1. `Relaciones.gs` con el mapa, `propagar` y `datosParaNuevo`, con pruebas.
2. Conectar a `VehiculosService.actualizar`.
3. Reemplazar las funciones temporales `datosDeVehiculo_` de cada módulo.
4. `revisar` en modo solo reporte → revisar el log → activar corrección y el activador nocturno.
5. `cambiarClave` para ADMIN.
