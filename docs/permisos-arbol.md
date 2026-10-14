# Permisos granulares: catálogo en árbol, fichas homologadas y perfiles

Bitácora de la migración de permisos empezada el 14-oct-2026 (rama `ayrton`). Plan completo en tres fases;
este documento lleva lo hecho, lo que se simuló contra producción y lo que falta para llevarlo a producción.

## Por qué

Los permisos crecieron por partes y cada pantalla los resolvía distinto:

- Pestañas con "módulo propio" sin pantalla (Responsiva y Adherente en la ficha de Vehículos, con `enFicha`),
  otras que eran parte de su módulo (Documentos e Historial de Líneas) y otras que colgaban del permiso de otro
  (Cambios de monto de `caja-chica`, Registrados del Help Desk de `tickets`, la pestaña Adquisición de
  `vehiculos`).
- Seis formas distintas de esconder algo en la pantalla (`requiere`, `puedeEditarModulo`, `deModulo`/`permisoDe`,
  el `null` por pestaña de `partesDeFicha_`, las banderas propias de Líneas y "solo el servidor").
- Exportar no pedía permiso en ningún lado.
- En el servidor, **cualquiera de 7 módulos de Líneas abría todo Líneas** (Panorama, bitácora, exportar,
  documentos e historial de la ficha).
- Botones que la pantalla enseñaba y el servidor negaba al hacer clic (Agregar equipo, Generar PDF, Solicitud de
  compra, Cargar de Proveedor, subir Capital humano, Baja de Adherente).

Decisiones del usuario (14-oct): Exportar como permiso aparte; todas las pestañas como **secciones** de su
pantalla; los secretos de Líneas (PIN, patrón, contraseñas) se quedan en el código (ADMIN o área LINEAS);
perfiles como última fase.

## Fase 1 — Catálogo en árbol con herencia (hecha, en `ayrton`)

### El modelo

`config/Modulos.gs` es un árbol: **grupo del menú → módulo (una pantalla) → sección (`modulo.seccion`)**.

| Módulo | Secciones |
|---|---|
| `vehiculos` | `documentos`, `responsiva` (antes `responsiva-vehicular`), `adherente` (antes `adherente-vehicular`), `exportar` |
| `lineas-telefonicas` | `detalles`, `documentos`, `historial`, `facturacion`, `exportar` |
| `caja-chica` | `detalles`, `cambios-monto`, `exportar` |
| `tickets` | `helpdesk` (Registrados del Help Desk), `exportar` |
| los demás con lista | `exportar` (se agrega solo; los de `soloEnlaces` no) |

Reglas (`Permisos.resolver_`, y la misma cuenta en `app-permisos.html`):

1. La regla del propio nodo: la del correo y, si no hay, la del área.
2. Sin regla, una sección **hereda** el nivel de su módulo (`hereda: false` = nace sin acceso).
3. Una sección **nunca pasa** del nivel de su módulo.
4. ADMIN: todo. SUPER: todo menos Usuarios y permisos. VIEWER y CLIENT: como mucho Ver.
5. "Sin acceso" de un **área** en un módulo es lo mismo que no tener regla; en una **sección** se guarda y corta
   la herencia.

Una pestaña con datos de **otro** módulo (Verificaciones, Sensor, Incidencias… en la ficha de Vehículos; Arqueos
en la de Caja chica; la pestaña Adquisición) no es sección: pide el permiso de ese módulo.

### Lo que cambió

- **Servidor**: el mapa de permisos (`deCorreo`, `mios`) llega ya resuelto con cada nodo; la pantalla solo
  pregunta. Cada `api…` pide el nodo que le toca: Documentos e Historial de Líneas su sección; Facturación del
  proveedor en la ficha, `lineas-telefonicas.facturacion`; Panorama de Líneas y Control de cambios su módulo;
  exportar cada base, su `exportar`; Cambios de monto y Registrados, su sección. `apiListaConHuella` ya no
  despacha cualquier `api…` (lista blanca de listas). La reasignación de vehículo revisa que se pueda editar
  Vehículos **antes** de escribir.
- **Pantalla**: `puede(nodo, nivel)` en `app.html`; cada pestaña de ficha con su sección (Vehículos, Líneas,
  Caja chica); el menú de Cambios de monto y Registrados con su sección; Exportar en `DataTable` por la sección
  `exportar` del módulo de la vista (`puedeExportarAqui`); se esconden los botones que solo negaba el servidor;
  las capturas desde una lista ("Nueva verificación" desde Vehículos, "Nuevo arqueo" desde Caja chica) piden el
  módulo de lo que capturan. La copia de permisos del navegador cambió de llave (`permisos_v2_`).
- **Usuarios y permisos**: las fichas listan debajo de cada módulo solo las secciones que se apartan de él; la
  ventana Editar trae las secciones de cada módulo (hoy como chips, ver "Rediseño de la ventana"); la matriz enseña las
  secciones con alguna regla (con "Ver todas las secciones") y su celda pasa por Hereda.
- **Rol CLIENT**: además del alcance por departamento, no lee el expediente de inspecciones ni sus fotos de un
  vehículo ajeno, ni el inventario de accesorios.
- **Pruebas**: herencia, alias y migración (`permisos.test.js`); paridad servidor = pantalla con 60 casos al azar
  (`permisos-pantalla.test.cjs`); contrato de que todo permiso que se pide existe en el catálogo, Exportar,
  `apiListaConHuella` (`source-contracts.test.cjs`); clics de verdad con secciones en `probar-permisos.js`.

### Simulación contra producción (14-oct, solo lectura)

Con PERMISOS y USUARIOS de producción (148 reglas, 51 personas; ya se había corrido `permisosSepararModulos`):

- `permisosMigrarCatalogo()` **no agrega reglas** y **renombra 4** (`responsiva-vehicular` y
  `adherente-vehicular` a su sección).
- Persona por persona, **ningún módulo cambia de nivel**.
- 3 personas con solo Gestión de activos (2 de CI, 1 de Control vehicular) ya no podrían pedir Documentos e
  Historial de la ficha de Líneas por la API; desde su pantalla nunca los abrían (Gestión de activos no los
  pide y la ficha de Líneas pide Líneas Telefónicas), así que no pierden nada que vieran.

### Para llevarlo a producción (pendiente; el usuario decide cuándo)

1. Juntar `ayrton` en master (sin las fotos del directorio: ver `rol-client-post-venta` en la memoria) y desplegar
   con la GitHub Action.
2. Justo después, en el editor de producción: `permisosMigrarCatalogo()` (reescribe los ids viejos; se puede
   repetir).
3. Revisar con alguien de cada área que su menú y sus fichas sigan igual.

## Fase 2 — Perfiles (hecha, en `ayrton`)

Un **perfil** es un paquete de reglas con nombre ("Flotilla - consulta") que se asigna a una o varias áreas, para que
la matriz del día a día sea área × perfil y no área × cada sección.

### Dónde viven

En la **misma hoja PERMISOS** (una sola caché, un solo guardar, un solo historial; no hay hojas nuevas):

| QUIEN | MODULO | PERMISO | Qué es |
|---|---|---|---|
| `perfil:Flotilla` | un nodo (`vehiculos`, `vehiculos.exportar`, …) | Sin acceso / Ver / Editar | una regla del perfil |
| un AREA (`CI`) | `perfil:Flotilla` | `ASIGNADO` | el área tiene ese perfil |

Una versión de antes los ignora sin tronar (`perfil:…` no es un área real; `ASIGNADO` no es un nivel).

### Cómo se resuelve (`Permisos.resolver_` y la misma cuenta en la pantalla)

Por nodo: **regla del correo > regla del área > lo de los perfiles del área > herencia**.

- Varios perfiles: cada uno se resuelve solo, con su propia herencia, y por nodo **gana el más alto** (un perfil
  nunca le quita a otro). Ej.: A da Vehículos con Editar y le corta Exportar; B da Vehículos con Ver → la persona
  edita Vehículos y exporta (por B).
- Lo propio del área manda sobre sus perfiles: un "Sin acceso" del área en un módulo **se guarda solo si el área
  tiene perfiles** (les quita lo que dan); sin perfiles es lo mismo que no tener regla, como antes.
- Lo propio de la persona (excepción por correo) manda sobre todo, como siempre.

### Pantalla

- Pestaña **Perfiles** (lista con reglas, áreas y personas) y **ficha del perfil** (Permisos, Áreas, Historial;
  Editar permisos, cambiar sus áreas, eliminar). "Nuevo perfil" abre la ventana Editar con el nombre arriba; cambiarle
  el nombre mueve sus reglas y sus asignaciones.
- **Ficha de área**: tarjeta de sus perfiles con "Asignar perfiles"; cada permiso dice si viene "Por su perfil X" o es
  "Regla del área". **Ficha de persona**: "Por su perfil X".
- **Matriz**: "Por área" y "Por perfil". En un área con perfiles la celda de un módulo también pasa por Hereda (lo de sus
  perfiles). Los cambios pendientes de un modo no se pierden al cambiar al otro.
- Pruebas: precedencia y combinación de perfiles, "Sin acceso" de un área con perfiles (`permisos.test.js`); la
  paridad servidor = pantalla ahora también con perfiles al azar (`permisos-pantalla.test.cjs`); clics en la matriz
  con un área con perfil y el modo Por perfil (`probar-permisos.js`).

### Migración: `permisosCrearPerfiles()` (editor)

Pasa las reglas de cada área a un perfil con su mismo nombre, asignado a ella (las excepciones por correo se quedan).
Se puede repetir (un área que ya tiene su perfil se salta). **Solo después de desplegar la fase 2**: la versión de
antes no lee perfiles y esas áreas se quedarían sin nada.

**Simulación contra producción (14-oct, solo lectura):** después de `permisosMigrarCatalogo()`, crearía **8 perfiles**
(ANALISIS DE DATOS, SERVICIOS VEHICULARES, CI, CONTROL VEHICULAR, AUDITORIAS, LINEAS, POST VENTA, PROCESOS), la hoja
pasaría de 148 a 156 renglones y **ninguna persona activa cambia**. Después se consolidan a mano en la pantalla (p. ej.
un "Flotilla - consulta" común a varias áreas).

### Para llevarlo a producción (pendiente; el usuario decide cuándo)

1. Desplegar (con la fase 1).
2. `permisosMigrarCatalogo()` y luego `permisosCrearPerfiles()` en el editor de producción.
3. Revisar con alguien de cada área que su menú y sus fichas sigan igual.

## Fase 3 — Alcance como atributo del perfil (hecha, en `ayrton`)

"Solo lo de su área" deja de ser exclusivo del rol CLIENT: es un atributo del perfil.

Decisiones del usuario (14-oct): limita a **cualquiera** que tenga ese perfil (USER o CLIENT; el rol CLIENT queda
como "solo consulta"), y si un área tiene varios perfiles **basta con que uno limite**. Además, para no abrir nada
mientras no se corra la migración, **un CLIENT sigue limitado siempre**.

### Cómo se guarda

En PERMISOS: `QUIEN = perfil:Nombre` | `MODULO = @alcance` | `PERMISO = AREA`. Sin ese renglón, el perfil no limita.
Una versión de antes lo ignora (`@alcance` no es un módulo; `AREA` no es un nivel).

### Qué hace (`Permisos.alcance_` y `resolver_`)

- Quien queda limitado ve los renglones de `DPTOS PERMITIDOS` o, si está vacío, de su `AREA` (igual que el CLIENT de
  antes). ADMIN y SUPER nunca quedan limitados.
- **Solo puede tener los nodos que respetan el alcance** (`alcance: true` en `Modulos.gs`, o los de solo enlaces); los
  demás se le resuelven Sin acceso. Se eligió marcar lo que **sí** respeta el alcance (y no lo que "mezcla
  departamentos") para que un módulo nuevo nazca **cerrado** para quien está limitado. Hoy lo respetan: `vehiculos`,
  `vehiculos.documentos`, `vehiculos.exportar`, `panorama-vehiculos`, `lineas-telefonicas` y sus `detalles`,
  `facturacion` y `exportar`. Documentos e Historial de Líneas no (el pasado del registro).
- Como el mapa de permisos ya llega cerrado, la pantalla esconde sola lo que no va (menú, pestañas); las negaciones
  del servidor (`sinAlcance_`, el filtro de `HojaServicio` y de `TelefoniaService`) se quedan como segunda defensa.
- Pantalla: en la ventana del perfil, el interruptor "Solo lo de su área"; la ficha del perfil y la tabla de perfiles
  dicen su alcance; la ficha de una persona limitada por perfil lo avisa. La paridad servidor = pantalla incluye
  perfiles que limitan al azar.

### Migración: `permisosAlcanceDesdeClientes()` (editor, después de `permisosCrearPerfiles()`)

Marca "solo lo de su área" los perfiles de las áreas cuya gente activa es toda CLIENT. Se puede repetir.

**Simulación contra producción (14-oct, solo lectura):** el único perfil que queda con alcance es **POST VENTA** y
**nadie cambia** respecto a la fase 2. POST VENTA ve: Vehículos (con Documentos y Exportar) y Líneas Telefónicas (con
Detalles, Facturación y Exportar); respecto a hoy en producción no pierde nada (no tenía Responsiva ni Adherente).

## Rediseño de la ventana "Editar permisos" (14-oct)

Se veía funcional pero recargada (puntos, cuatro opciones por sección, secciones plegadas). Ahora:

- **Ventana ancha a dos columnas** (hasta 1040 px): a la izquierda los grupos del menú, con cuántos módulos tienen
  acceso ("2/12") y un punto si algo cambió; a la derecha solo los módulos del grupo elegido, con "Todo el grupo"
  arriba. En celular los grupos se deslizan de lado y todo va en una columna.
- **Cada módulo es una tarjeta** con su ícono, los tres niveles (Sin acceso en rojo, Ver azul, Editar verde) y de
  dónde le viene en texto, en vez del punto: "Su área: Ver", "Excepción · su área: Sin acceso", "Por su perfil X",
  "Regla del área · sus perfiles: Ver". ↺ quita la regla propia.
- **Las pestañas van en árbol** debajo de su módulo (solo si tiene acceso): una fila chiquita como la del módulo,
  con sus tres niveles; los que pasarían del módulo salen apagados. Dice "Igual que Vehículos" o, con regla propia,
  "Excepción · sin ella: Editar" y ↺ la quita. (Se probaron como chips y el usuario prefirió el árbol.)
- **Exportar a Excel es un ícono** a la izquierda de "Sin acceso" del módulo: verde si puede, rojo si se le quitó
  (clic alterna); gris sin acceso al módulo.
- Por dentro es lo mismo: los mismos valores en `edicion.valores` y los mismos cambios a `apiPermisosGuardar`.
  `tools/vista-previa/probar-permisos.js` prueba la columna de grupos, las pestañas y Exportar con clics.

## Para llevar las tres fases a producción (pendiente; el usuario decide cuándo)

1. Juntar `ayrton` en master (sin las fotos del directorio) y desplegar con la GitHub Action.
2. En el editor de producción, en este orden (cada una se puede repetir):
   1. `permisosMigrarCatalogo()` — ids viejos a su id del catálogo (0 reglas nuevas, 4 renombradas).
   2. `permisosCrearPerfiles()` — un perfil por área con sus mismas reglas (8 perfiles, nadie cambia).
   3. `permisosAlcanceDesdeClientes()` — el perfil de POST VENTA queda "solo lo de su área" (nadie cambia).
3. Revisar con alguien de cada área que su menú y sus fichas sigan igual, y luego consolidar perfiles comunes en la
   pestaña Perfiles.
