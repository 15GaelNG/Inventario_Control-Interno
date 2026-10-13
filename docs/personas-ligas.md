# Personas: el ID PERSONA en cada hoja (Salud > Capital Humano)

Estado al 13-oct-2026. Ver también `docs/personas-unificar.md` (la lista de CH y su carga) y la memoria `sync-colaboradores-2`.

## Qué hace «Actualizar» en Salud > Capital Humano

Cada tarjeta de «Se arreglan con un botón» es una hoja. «Actualizar»:

1. Crea la columna de ID PERSONA al final de la hoja si no existe (en Inspección se llama `ID PERSONA CONDUCTOR`).
2. La llena con el ID de cada registro cuya persona se encontró en COLABORADORES ACTUALIZADO (por correo, luego por
   nombre; el número de empleado solo desempata homónimos).
3. Anota cada cambio en `LOG_RELACIONES` (quién, cuándo, renglón, ID).

No toca nombres, números ni ninguna otra columna. Lo que no se pudo ligar se queda vacío y sale en «Hay que
corregirlos a mano» (gente que no está en CH, nombres mal escritos, dos personas en la celda) o en «Todo bien» (BAJA
VEHICULAR, códigos: no son personas).

Ejemplo de «a mano»: el ticket de «Vera Lucia Netzáhualt Ríos»; en CH es VERA LUCIA NETZAHUATL RIOS (letras invertidas).
Se corrige el nombre en el ticket y el siguiente «Actualizar» le pone su ID.

En TICKETS el ID es del **SOLICITANTE**, no de quien registró el ticket.

## Caché vs. bitácora (13-oct, `bitacora: true` en `CapitalHumano.LIGAS`)

El ID PERSONA no copia datos que cambian (puesto, departamento): dice **quién** fue, y el ID de una persona nunca
cambia. Por eso va también en las bitácoras: no altera la historia, la liga.

| Hoja | Tipo | Columna de persona | Qué hace Salud |
|---|---|---|---|
| VEHICULOS | Caché | RESPONSABLE VEHICULO | Llena y **corrige** si cambió el responsable |
| CAJAS CHICAS | Caché | RESPONSABLE DE CAJA CHICA (+ correo) | Llena y corrige |
| ASIGNACIONES (Líneas) | Bitácora | RESPONSABLE (+ número, cuenta Google) | Solo llena vacíos |
| RESPONSIVA VEHICULAR | Bitácora | RESPONSABLE | Solo llena vacíos |
| ADHERENTE VEHICULAR | Bitácora | ADHERENTE | Solo llena vacíos |
| REASIGNACIONES_VEHICULOS | Bitácora | Responsable Entrante | Solo llena vacíos |
| INSPECCION VEHICULAR | Bitácora | CONDUCTOR → `ID PERSONA CONDUCTOR` | Solo llena vacíos |
| UBER | Bitácora | NOMBRE COMPLETO (+ correo) | Solo llena vacíos |
| ARQUEOS | Bitácora | RESPONSABLE | Solo llena vacíos |
| TICKETS | Bitácora | SOLICITANTE | Solo llena vacíos |

En una bitácora, un ID que ya está y no coincide con el que saldría hoy (un correo reutilizado, un homónimo) **no se
cambia**: sale en «Todo bien» como histórico (`DIFERENCIA_HISTORICA`). Al capturar desde la app no hay diferencia: todo
registro nuevo nace con su ID, y si se corrige el nombre en el formulario el ID se recalcula (`conPersona`).

Hoy (13-oct) las bitácoras no tienen la columna todavía: el primer «Actualizar» solo llena vacíos con cualquier versión.
La regla importa en las siguientes.

## Cómo estaba prod antes del primer «Actualizar» (13-oct)

| Hoja | Registros | Con ID PERSONA |
|---|---|---|
| VEHICULOS | 649 | 375 |
| CAJAS CHICAS | 285 | 283 |
| ASIGNACIONES | 1,822 | 737 |
| REASIGNACIONES_VEHICULOS | 364 | sin columna (233 ligables) |
| INSPECCION VEHICULAR | 308 | sin columna |
| UBER | 340 | sin columna |
| ARQUEOS | 145 | sin columna |
| TICKETS | 2,140 | sin columna |
| RESPONSIVA / ADHERENTE | 2 / 5 | sin columna |

## Pendiente: dos personas en una hoja (por decidir)

Hoy el código asume una persona por hoja (`ligaDe_`, `conPersona`, `columnaPara`). Propuesta: varias ligas por hoja,
cada una con su columna, solo cuando la segunda persona **participó en el evento**:

| Hoja | Segunda persona | Columna nueva | Tipo |
|---|---|---|---|
| REASIGNACIONES_VEHICULOS | Responsable Saliente (+ No Empleado Saliente) | `ID PERSONA SALIENTE` | Bitácora |
| INSPECCION VEHICULAR | RESPONSABLE del vehículo ese día | `ID PERSONA RESPONSABLE` | Bitácora |
| RESPONSIVA VEHICULAR | RESPONSABLE ANTERIOR (+ NO EMPLEADO ANTERIOR) | `ID PERSONA ANTERIOR` | Bitácora |
| CAJAS CHICAS | CAPTURISTA DE CAJA CHICA (+ correo) | `ID PERSONA CAPTURISTA` | Caché |

No llevan ID: QUIEN REGISTRO, REGISTRADO POR, NOMBRE CI, NOMBRE INSPECTOR (usuarios de Control Interno; se sabe quién
es por su sesión) ni NOMBRE JEFE / JEFE DIRECTO (sale de la lista de CH a partir de la persona).

Sugerencia: hacerlo antes de «Actualizar» Reasignaciones e Inspección (una sola pasada). Las demás tarjetas se pueden
actualizar ya.

## Otros cambios del 13-oct

- El número de empleado se compara sin ceros a la izquierda (CH mandó 09099 y la hoja tenía 9099: quedó repetido
  HECTOR DE JESUS ANGUIANO PEREZ, mismo ID). La siguiente carga del Excel deja un solo renglón.
- La carga del 13-oct en prod marcó 444 renglones como «se actualizan» (135 en el DEV con el mismo archivo): pendiente
  revisar qué diferencia de formato los cuenta como cambio.
