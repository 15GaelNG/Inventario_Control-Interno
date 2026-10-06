/**
 * Vista previa local de la app, sin Apps Script: arma Index.html resolviendo los
 * include() igual que el servidor, le pone un servidor falso con datos de ejemplo y
 * abre una "escena" (módulo, pestaña y pasos) para poder mirarla o tomarle captura.
 *
 *   node tools/vista-previa/construir.js                 → escribe tools/vista-previa/salida/index.html
 *   node tools/vista-previa/capturar.js inspecciones-firmas   → PNG con Chrome sin ventana
 *
 * Sirve para revisar diseño (que los módulos se vean parejos, cómo queda un cambio en
 * pantalla chica o en tema oscuro) sin publicar ni pedirle a nadie que tome capturas.
 * NO prueba el servidor: todo lo que "responde" sale de datos-falsos.js.
 */
const fs = require('fs');
const path = require('path');

// VISTA_PREVIA_SRC=.construido/revisar revisa la versión comprimida que se sube (tools/subir/construir.js)
const RAIZ = path.resolve(process.env.VISTA_PREVIA_SRC || path.join(__dirname, '..', '..', 'src'));
const SALIDA = path.join(__dirname, 'salida');

/** include('html/styles') → contenido de src/html/styles.html (con sus propios include) */
function resolver(archivo) {
  const html = fs.readFileSync(path.join(RAIZ, archivo + '.html'), 'utf8');
  return html
    .replace(/<\?!=\s*include\('([^']+)'\);?\s*\?>/g, (_, nombre) => resolver(nombre))
    .replace(/<\?[\s\S]*?\?>/g, '');   // cualquier otro scriptlet de Apps Script
}

/**
 * La etiqueta viewport no está en Index.html: la agrega el servidor (Router.gs, addMetaTag).
 * Sin ella el celular simulado dibuja la página a 980px y la achica, y la vista previa no
 * muestra cómo se ve de verdad. Se toma de Router.gs para que nunca se desfasen.
 */
function viewportDelServidor() {
  const router = fs.readFileSync(path.join(RAIZ, 'Router.gs'), 'utf8');
  const m = /addMetaTag\('viewport',\s*'([^']+)'\)/.exec(router);
  if (!m) throw new Error('No encontré addMetaTag(\'viewport\', …) en Router.gs');
  return m[1];
}

function construir() {
  let pagina = resolver('html/Index');
  const falsos = fs.readFileSync(path.join(__dirname, 'datos-falsos.js'), 'utf8');
  // El servidor falso va ANTES que todo: api.html usa google.script.run al cargar
  pagina = pagina.replace(/<head>/i, '<head>\n<meta name="viewport" content="' + viewportDelServidor() + '">' +
    '\n<script>\n' + falsos + '\n</script>');
  fs.mkdirSync(SALIDA, { recursive: true });
  fs.writeFileSync(path.join(SALIDA, 'index.html'), pagina);
  return path.join(SALIDA, 'index.html');
}

if (require.main === module) console.log(construir());
module.exports = { construir };
