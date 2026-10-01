# Guion del ensayo en LAB: qué función correr, en qué orden

Checklist corto para correr el ensayo completo en el laboratorio. El detalle de **qué debe
decir** cada salida está en [ensayo-final.md](ensayo-final.md) y
[ids-asignacion.md](ids-asignacion.md).

- **Dónde:** el editor de Apps Script del proyecto **LAB** (el que está ligado al libro
  «Inventario Reemplazable»). Se elige la función en el menú de arriba y se da **Ejecutar**.
  La salida sale en el **Registro de ejecución**.
- **Regla de oro:** siempre `…1Ensayo` primero (no escribe), lees la salida, y solo si está
  bien corres `…2Escribir`.
- Marca cada casilla al terminar.

## Si una función "se muere" por tiempo

Apps Script mata cualquier ejecución a los **6 minutos**. Ninguna función de este guion
llega ahí: todas se detienen solas a los **4.5 minutos** y lo dicen en el registro:

| Si ves… | Haz esto |
|---|---|
| `SE DETUVO por tiempo antes de "…"` | **Vuelve a correr la misma función.** Sigue donde se quedó; lo hecho no se repite. |
| `SE DETUVO en "…"` (sin "por tiempo") | **No** la vuelvas a correr a ciegas. Encontró un problema: lee ese paso en el registro y pégamelo. |
| `Exceeded maximum execution time` (error de Google) | No debería pasar. Vuelve a correr la misma función una vez; si se repite, avísame. |

Repetir una función que escribe es **seguro**: todos los pasos son idempotentes (no ponen un
segundo ID, no crean una segunda columna). El replanchado guarda su avance en
`REPLANCHE_HOJAS_LISTAS`.

---

## Fase A — Preparar el libro

- [ ] **A1. Quitar datos sensibles.** En el libro de LAB y en el del equipo, hoja
      `COLABORADORES ACTUALIZADO`: borrar las columnas `TELEFONO` y `NÚMERO DE CUENTA`.
      *(A mano, en la hoja.)*
- [ ] **A2. `replanche1Ensayo`** — solo lee. Debe salir **sin ningún `SE PIERDE`** y sin el
      bloque `OJO`. Si sale alguno, **detente** y pégamelo.
- [ ] **A3. `replanche2Escribir`** — borra LAB y lo copia fresco desde producción.
      Repetir hasta que diga **`LISTO. El destino quedó en estado PRE-migración.`**
      *(Para ver en qué va sin escribir: `replancheEstado`.)*
- [ ] **A4. `migracionEstadoSello`** — solo lee. Si dice `Sellado: SÍ`:
      **Configuración del proyecto → Propiedades de la secuencia de comandos** → borrar
      `MIGRACION_IDS_SELLADOS` (o, si tiene varios libros, quitar solo el de LAB `1-RA6lmh-…`).
      Vuelve a correr `migracionEstadoSello` y confirma `Sellado: no`.
- [ ] **A5. `pipelinesEstado`** — solo lee. Confirma que el libro apuntado es el de LAB
      (`1-RA6lmh-…`) y que aparecen los 5 pipelines.

## Fase B — La foto de antes *(me la pides a mí; es Python, solo lectura)*

- [ ] **B1.** Avísame "ya replanché" y saco `ensayo-antes.json` desde aquí.

## Fase C — Los 5 pipelines, en este orden

Cada uno: ensayo → me pegas el registro (o lo revisas tú) → escribir.

| # | Ensayo (no escribe) | De verdad (escribe) | Notas |
|---|---|---|---|
| 1 | [ ] `ids1Ensayo` | [ ] `ids2Escribir` | **Siempre primero.** Pone los IDs a las 24 hojas. |
| 2 | [ ] `vehiculos1Ensayo` | [ ] `vehiculos2Escribir` | Aquí LAB se **sella** solo (es normal). |
| 3 | [ ] `lineas1Ensayo` | [ ] `lineas2Escribir` | |
| 4 | [ ] `cajaChica1Ensayo` | [ ] `cajaChica2Escribir` | |
| 5 | [ ] `capitalHumano1Ensayo` | [ ] `capitalHumano2Escribir` | **Siempre al final.** En el ensayo, `ligar` sale como `NO SE PUDO ENSAYAR`: es normal, depende de lo que escribe `personas`. |

Lo que **no** es normal y te debe detener:

- `PROBLEMAS (…)` o `FALLAS (…)` en un `…2Escribir` → el pipeline se para solo; no corras el
  siguiente.
- Que el libro apuntado no sea el de LAB.

## Fase D — Verificar

- [ ] **D1.** Avísame y saco la foto de después y la comparo con la de antes (Python).
- [ ] **D2.** Abre la app apuntada a LAB y revisa Vehículos, Caja Chica, Líneas y
      **Administración → Salud / Datos conectados**.
- [ ] **D3.** Actualizamos [ensayo-final.md](ensayo-final.md) con los números de esta corrida.

---

## Funciones de rescate *(solo si algo sale mal)*

| Función | Qué hace |
|---|---|
| `replancheEstado` | Cuántas hojas lleva el replanchado. Solo lee. |
| `replancheReiniciarAvance` | Hace que el próximo `replanche2Escribir` empiece desde la primera hoja. |
| `pipelineEstado` | Estado de IDs hoja por hoja. Solo lee. |
| `migracionEstadoSello` | Si el libro está sellado. Solo lee. |

Si todo se enreda, la salida siempre es la misma: **volver a la Fase A** (el replanchado
deja LAB como producción).
