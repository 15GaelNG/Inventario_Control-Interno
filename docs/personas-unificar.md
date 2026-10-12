# Personas: unificar PERSONAS y COLABORADORES ACTUALIZADO (pendiente, en el radar)

Estado: **en espera** (12-oct-2026). Se retoma después de la Fase 3 de "Vehículos: todo por NUCO".
Auditoría hecha el 12-oct-2026 sobre el libro productivo (`17YrtuMY…`), solo lectura.

## Cómo está hoy

Tres pestañas de personas en el mismo libro:

| Pestaña | Qué es | Quién la usa |
|---|---|---|
| **COLABORADORES ACTUALIZADO** | La lista de Capital Humano que Ayrton pega a mano. 15,254 renglones (3,233 ACTIVO, 12,021 BAJA); la columna de estatus es `STATUS` | Todos los autocompletados (directo, sin pasar por PERSONAS) y Líneas |
| **PERSONAS** | Un renglón por empleo con su `ID PERSONA` (PER-), armada por `CapitalHumano.identificar` | `CapitalHumano.idPara` → Vehículos, Caja Chica, Líneas (`conPersona_`, identificaciones, lectura de INE) |
| **COLABORADORES** (vieja) | Foto fija de 3,627 renglones, todos "ACTIVO" | **Nadie en producción** (ver abajo) |

Lo que debería ser: COLABORADORES ACTUALIZADO → PERSONAS → todo lo demás.

## Lo que está mal

1. **PERSONAS no se mantiene sola.** Se armó el 4-oct y solo se rehace corriendo `capitalHumano2Escribir` desde el editor.
   Al 12-oct le faltan 29 empleos de la lista de CH (28 activos, p. ej. ingresos del 28-sep). A uno de ellos se le asigna
   un vehículo o caja y queda sin `ID PERSONA`, sin aviso.
2. **Dos listas distintas para elegir a una persona.**
   - Líneas (`LineasRepo.indiceColaboradores`): solo ACTIVO.
   - Los demás (`CapitalHumano.listarColaboradores` → Vehículos, Uber, Responsiva, Adherente, Reasignaciones, Help Desk):
     **no filtra STATUS** — ofrece 10,985 nombres que solo existen de baja. (Revisado: a quien tiene un empleo activo no
     le autollena datos de uno de baja.)
3. **Líneas quedó desconectada de PERSONAS.** `CapitalHumano.LIGAS` y `LineasRepo.TAB.LINEAS` apuntan a
   `LINEAS TELEFONICAS`, que ya no existe en producción (Líneas pasó a LINEAS / EQUIPOS / ASIGNACIONES). Efectos: en
   Salud la revisión de Líneas truena, y al cambiar de persona una asignación nueva nace con `ID PERSONA` vacío
   (`LineasEscritura`, "no pasa a otra persona") y nada lo recalcula. ASIGNACIONES: 175 sin ID — 39 ligables ya,
   93 con dos personas en la celda ("A / B"), 26 que no están en CH, 17 que no son persona (CANCELACION).
4. **Solo Vehículos, Caja Chica y Líneas guardan `ID PERSONA`.** Los demás guardan el nombre como texto:

   | Hoja / columna | Activo en CH | Solo de baja | No está en CH |
   |---|---|---|---|
   | TICKETS / SOLICITANTE | 1,221 | 585 | 330 |
   | UBER / NOMBRE COMPLETO | 182 | 130 | 28 |
   | REASIGNACIONES_VEHICULOS / Responsable Entrante | 212 | 21 | 131 |
   | INSPECCION VEHICULAR / CONDUCTOR | 133 | 36 | 110 |
   | ARQUEOS / RESPONSABLE | 131 | 13 | 1 |
   | RESPONSIVA y ADHERENTE VEHICULAR | 7 | 0 | 0 |

   (Sensores, Hologramas e Inspección/RESPONSABLE copian el responsable del vehículo: su persona saldría del vehículo.)
5. **VEHICULOS: 273 sin `ID PERSONA`** — 145 están bien (BAJA VEHICULAR, códigos), 126 son nombres que no están en CH
   ("PAPA SRA. GINA", "ENTREGA A FABIAN PENDIENTE DE BAJA", externos), 2 con dos personas en la celda. Para el área.

## COLABORADORES (la vieja): ¿se usa?

En producción, no. Revisado en código (master, emmanuel, jorge, ayrton) y en el libro:

- Código: solo el respaldo de Líneas (`LineasRepo.colaboradoresActivos_`, entra únicamente si el libro no tiene
  COLABORADORES ACTUALIZADO — el productivo sí la tiene), la carga del libro de pruebas de Líneas
  (`LineasReestructura`, se niega a correr si existe la de CH), un diagnóstico manual (`LineasRevisionBD`), la lista de
  pestañas para copiar el libro de Líneas (`LineasAdmin`), `Entidades.gs` y herramientas de migración en `tools/`.
- Libro: ninguna fórmula, ninguna validación (lista desplegable) y ningún rango con nombre la usa.
- **No verificable desde el código:** otro archivo que la jale con IMPORTRANGE, el AppSheet de Líneas si alguien lo
  sigue abriendo, un tablero de Looker Studio.

Para retirarla: **ocultarla** unas dos semanas (no rompe nada, se revierte con un clic); si nadie la extraña, borrarla y
quitarla de `LineasAdmin` y `LineasRevisionBD` (de Emmanuel).

## La propuesta: un solo punto de acceso, `CapitalHumano.gs`

| Hoy | Después |
|---|---|
| `CapitalHumano.listarColaboradores` (CH directo, con bajas) | `CapitalHumano.activos()`: activos de CH, cada uno con su `ID PERSONA` |
| `LineasRepo.indiceColaboradores` (su propia lectura de CH) | la misma `CapitalHumano.activos()` |
| `LineasIneLectura` lee PERSONAS y CH por su cuenta | le pregunta a `CapitalHumano` |
| Respaldo a COLABORADORES (vieja) en Líneas | se quita |
| PERSONAS se rehace a mano | se rehace sola al cambiar la pestaña de CH (Calentador o al detectar el pegado). Seguro: solo agrega, los IDs nunca cambian |
| `ID PERSONA` solo en Vehículos, Caja Chica, Líneas (y Líneas apunta a una pestaña que no existe) | lo calcula todo el que captura una persona (`CapitalHumano.idPara`); Líneas sobre ASIGNACIONES vigentes |

Más un contrato en `tests/source-contracts.test.cjs`: ningún archivo fuera de `CapitalHumano.gs` lee COLABORADORES
ACTUALIZADO, PERSONAS ni COLABORADORES.

Orden sugerido (los dos primeros son seguros y no tocan Líneas):
1. PERSONAS se actualiza sola.
2. La lista de todos ofrece solo activos (sigue aceptando texto libre: editar un registro viejo no se rompe).
3. Reconectar Líneas (ASIGNACIONES) — con Emmanuel.
4. `ID PERSONA` en las capturas que importan (Responsiva, Adherente, Reasignaciones, Inspección/conductor); luego Uber,
   Arqueos, Tickets. Las de antes se llenan con una corrida con bitácora (como `columna_nucco.py`).
5. Retirar COLABORADORES (vieja).

## Decisiones abiertas (para el usuario)

1. **Líneas (código de Emmanuel, con cambios sin subir):** a) lo hago yo y él lo integra; b) yo lo mío y a él le dejo
   el cambio de Líneas con instrucciones; c) juntos.
2. **Qué módulos guardan `ID PERSONA`:** todos los de la tabla, o solo los de Vehículos por ahora (una columna nueva al
   final de cada hoja).
3. **Libros de prueba sin COLABORADORES ACTUALIZADO** (algunos DEV y el de Líneas): al quitar el respaldo necesitan una
   copia de CH sin columnas sensibles — ¿que la herramienta de copia se las ponga?

Ver también: memoria `sync-colaboradores-2` (reglas de identidad: mismo número+nombre, nombre+fecha de nacimiento,
N. EMPLEADO ANTERIOR) y `docs/relaciones.md`.
