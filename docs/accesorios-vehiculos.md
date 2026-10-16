# Accesorios de cada unidad

> 16-oct-2026. Servicio: `src/services/AccesoriosVehiculoService.gs`. Pestaña Accesorios de la ficha del vehículo
> (sección `vehiculos.accesorios`). Carga inicial: `tools/accesorios/carga_inicial.py`.

## La regla de negocio

Lo que tiene una unidad es lo que dice su **última responsiva**. No siempre es la foto real: cuando a una unidad se le da
un accesorio nuevo no se le pide firmar otra responsiva. Aun así, es la verdad acordada. Por eso:

1. La **carga inicial** es la última responsiva de cada unidad de antes del sistema (el Excel de Jorge,
   `data/Responsivas - serie y entrega.xlsx`).
2. Cada **responsiva que se firma en el sistema** vuelve a mandar: anota solo las piezas que cambian. Un préstamo no
   cuenta, porque no es la responsiva del dueño.
3. Entre una responsiva y otra, las **altas y bajas** se registran desde la ficha.

## Las hojas (libro de Vehículos)

| Hoja | Qué es | Quién escribe |
|---|---|---|
| `CATALOGO ACCESORIOS VEHICULOS` (CAV) | Las 13 piezas de «El vehículo se entrega con». `CLAVE` = la columna en RESPONSIVA VEHICULAR | A mano (pocas veces) |
| `MOVIMIENTOS ACCESORIOS VEHICULOS` (MAV) | La historia y **la verdad**. Cada movimiento es `CARGA INICIAL`, `RESPONSIVA`, `ALTA` o `BAJA`, con su `TIENE` SI/NO. Un renglón nunca se edita ni se borra | El servicio y la carga inicial |
| `ESTADO ACCESORIOS VEHICULOS` | Lo que tiene **hoy** cada unidad: un renglón por `ID VEHICULO`, una columna por pieza (SI / NO / vacío = sin dato), más el último movimiento. Es una **copia** legible de los movimientos, para la gente y Looker | Solo el servicio, bajo el mismo candado que el movimiento |

- El estado de una pieza es el `TIENE` de su último movimiento: por `FECHA` y, si caen el mismo día, por `ID`.
- Una pieza sin movimientos es «sin dato», no «no tiene».
- La hoja de estado se crea sola, y una pieza nueva del catálogo agrega su columna sola.
- Si alguien la toca a mano, `revisarEstadoAccesorios()` lo encuentra y `rehacerEstadoAccesorios()` (las dos se corren en
  el editor) la rehace igual desde los movimientos.

## Carga inicial

```
cd tools/accesorios
uv run --no-project --python 3.12 --with google-api-python-client --with google-auth-oauthlib --with openpyxl \
    python carga_inicial.py plan prod          # SOLO LECTURA → .cache/<fecha>/plan.json y revisar.xlsx
    python carga_inicial.py aplicar <plan> dev # escribe los movimientos CARGA INICIAL (bitácora con los IDs)
    python carga_inicial.py verificar <plan> dev
    python carga_inicial.py deshacer <bitácora> dev
```

Después de `aplicar`, se corre `rehacerEstadoAccesorios()` en el editor de ese proyecto.

**Producción está en la lista negra del script** (`PROHIBIDOS`). Ese candado se quita a propósito, en su propio commit, el
día que se pida.

Reglas del plan:
- La unidad sale del **NUCO** de la carpeta. La serie del papel solo confirma; si es distinta, no se carga.
- `SI` y `NO` son dato. `(vacío)` y `N/A` no se cargan.
- **No se carga:**
  - lo que no tiene casillas;
  - las notas de Jorge sobre las marcas;
  - una responsiva que ya no es la vigente;
  - una unidad que ya tiene movimientos (así el plan se puede repetir).
- **FECHA:** se toma la primera de estas que exista:
  1. la del texto del PDF;
  2. cuándo se subió a Drive (`createdTime`), solo si es de antes de la homologación de NUCOS del 8-oct-2026, porque
     `modifiedTime` cambió al renombrar;
  3. si no hay ninguna, la de la carga, marcada en el plan.

**Dry run del 16-oct-2026, contra prod (solo lectura):**
- **Se cargarían 287 unidades:** 2,829 movimientos (901 SI, 1,928 NO).
  - Fechas: 19 del texto del PDF, 255 de Drive y 13 sin fecha.
- **No se cargarían 92:**

  | Unidades | Motivo |
  |---:|---|
  | 33 | Ninguna casilla marcada |
  | 29 | Duda en las marcas |
  | 22 | Formato sin casillas |
  | 7 | Serie distinta |
  | 1 | Ya no es la vigente |

## Pendiente
- Evidencia de alta o baja en `1.-DOCUMENTACIÓN/8.-ACCESORIOS` del NUCO.
- Columna `ANULA` para corregir un movimiento.
- Qué hacer con «Otros».
- Proteger las hojas en prod.
- Retirar el texto `VEHICULOS.ACCESORIOS`.
- **Prod:**
  - crear `ESTADO ACCESORIOS VEHICULOS` (se crea sola con el primer movimiento);
  - agregar `RESPONSIVA` a la validación de la columna `MOVIMIENTO`.
