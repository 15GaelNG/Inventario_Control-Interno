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

## Flujo de trabajo

- Rama de trabajo: `jorge`. Nunca hacer push a `master` sin que se pida
  explícitamente.
- Verificación estándar antes de dar por bueno un cambio: `npx clasp push`,
  luego jalar a un directorio temporal apuntando al mismo scriptId de DEV
  (`1qE6UYn-ay4jZYRxiBOnmDwiE_iKWVtBSuiPEaz_PjArz0lf0YcfojqC-`) para
  confirmar que se desplegó bien, y revisar sintaxis de cada `<script>` con
  `node -e "new Function(js)"` antes de commitear.
