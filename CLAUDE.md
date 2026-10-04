# Control Interno — notas para trabajar en este repo

## ⚠️ Bug de Apps Script: nunca escribas `//` seguido de texto real en un archivo `.html`

Apps Script le borra a los archivos de tipo HTML (`.html`, incluidos los que
solo contienen `<script>` con JS puro, como `src/html/js/*.html`) todo lo que
encuentre después de `//`, pensando que es un comentario de JS — **incluso
si el `//` está dentro de un string**, no en un comentario real. No importa
el método usado para servir el archivo (`createHtmlOutputFromFile` o
`createTemplateFromFile().evaluate()` lo hacen igual). Nuestros propios
comentarios `// así` se vuelven líneas en blanco sin problema (inofensivo),
pero un `//` dentro de una URL en código real (`'https://...'`) corta la
línea a la mitad, dejando un string sin cerrar → toda la app carga en
blanco con "Uncaught SyntaxError: Invalid or unexpected token" (rompe TODA
la página, no solo esa función).

**Regla:** cualquier URL (`http://` o `https://`) dentro de código JS real
(no un comentario) en un archivo `.html` DEBE escribirse con la diagonal
escapada: `'https:\/\/dominio.com/...'` en vez de `'https://dominio.com/...'`
— en JS, `\/` dentro de un string es exactamente lo mismo que `/`, pero como
ya no hay un `//` literal en el código fuente, Apps Script no lo confunde
con un comentario. Ejemplos ya corregidos: los botones "Ver reporte"
(Vehículos) y "Calendario" (Arqueos) en `src/html/js/app.html` y
`app-arqueos.html`.

Esto NO aplica a URLs dentro de atributos HTML normales (`src="https://..."`,
`href="https://..."`) fuera de un `<script>` — esas están a salvo.

## Estructura de `src/html/js/`

`app.html` creció demasiado varias veces y hay que mantenerlo dividido en
varios `<script>` incluidos por separado (`app.html`, `app-arqueos.html`,
`app-cajachica.html`, ...) — todos comparten el mismo scope global del
navegador (funciones/variables de uno son visibles en los demás), así que
dividir es seguro mientras el orden de `<?!= include(...) ?>` en
`src/html/Index.html` mantenga los archivos "base" (api, app) antes de los
que dependen de sus helpers.

## Componentes (`src/html/js/componentes/`)

Lo que se repite entre módulos va en un componente, no en otra copia. Antes de
escribirlo a mano en un módulo, revisa si ya existe: `Formulario` (captura con
validación, pasos y panel), `DataTable`, `Combobox`, `Confirmar`, `Notificar`,
`Firma`, `Lienzo`, `ExportarExcel`, `CampoAuto`, `FolioNucco` y `CamposHoja`. Cada
uno documenta su uso al inicio del archivo y tiene su prueba en `tests/`.

- **Formularios declarados por columnas de una hoja → `CamposHoja`.** Vehículos
  (`CAMPOS_VEHICULO`), Caja Chica (`CAMPOS_CAJACHICA`), Arqueos (`CAMPOS_ARQUEO`),
  Uber, Tickets, Incidencias, Reasignaciones y Cambios de Monto son una lista de
  `{ grupo, clave, etiqueta, tipo, … }`, y `CamposHoja.html / recolectar / poblar /
  llenarOpciones` hace el resto. La vista solo deja el contenedor
  (`<div id="campos-form-…">`); no escribas los campos a mano en la vista. Un tipo de campo o una
  opción nueva (p. ej. `soloEdicion`, `mostrarSiCampo`) se agrega una vez en
  `componentes/campos-hoja.html` y sirve para todos. Lo propio de cada módulo
  (bloquear Capturista, formatear moneda) va en los ganchos `antes` / `despues` /
  `mostrar` de `poblar`, no en otra copia del motor.

- **Campos que llena el sistema → etiqueta "auto", siempre con `CampoAuto`.** Si
  el valor lo decide el sistema y no se edita, pon `data-auto` en el control (sirve
  en cualquier HTML, aunque se agregue después con innerHTML). Si se llena solo
  pero se puede corregir, usa `CampoAuto.llenar(el, valor)` (o
  `form.sugerir(id, valor)` en `Formulario`): la etiqueta se quita sola cuando la
  persona escribe otro valor. No escribas `<span class="auto-tag">` a mano, y no
  marques "auto" un campo que se bloquea por otra razón (permisos, lo que se
  eligió, guardando).
- **Elegir un vehículo por Folio o Nucco → `FolioNucco.ligar`.**
- `tests/source-contracts.test.cjs` falla si alguien vuelve a escribir la
  etiqueta "auto" a mano o hace otra copia del par Folio/Nucco.
- Un componente nuevo se incluye en `src/html/Index.html` antes de los módulos y
  componentes que lo usan (`campo-auto` va antes que `formulario`).

## Flujo de trabajo

- Rama de trabajo: `jorge`. Nunca hacer push a `master` sin que se pida
  explícitamente.
- Verificación estándar antes de dar por bueno un cambio: `npx clasp push`,
  luego jalar a un directorio temporal apuntando al mismo scriptId de DEV
  (`1qE6UYn-ay4jZYRxiBOnmDwiE_iKWVtBSuiPEaz_PjArz0lf0YcfojqC-`) para
  confirmar que se desplegó bien, y revisar sintaxis de cada `<script>` con
  `node -e "new Function(js)"` antes de commitear.
