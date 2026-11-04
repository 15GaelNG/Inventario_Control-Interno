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

/**
 * La marca que pone Router.gs en el body (Marcas.gs, 4-nov): la de VISTA_MARCA (CI, FT, CM o AMBAS; sin nada, AMBAS,
 * como quien abre sin cuenta detectada), con las marcas y el mapa de módulos reales (sin la pestaña MODULOS: por omisión)
 */
function marcaDelServidor() {
  const ctx = {
    Config: { SPREADSHEET_IDS: { USUARIOS: () => 'LIBRO' } },
    CacheHojas: { recordar: (clave, deps, armar) => armar() },
    SheetUtils: { getSheet: () => { throw new Error('No existe la hoja'); } },
  };
  require('vm').runInNewContext(fs.readFileSync(path.join(RAIZ, 'config', 'Modulos.gs'), 'utf8') + '\n' +
    fs.readFileSync(path.join(RAIZ, 'services', 'Marcas.gs'), 'utf8') + '\n;this.M = Marcas;', ctx);
  const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const marca = process.env.VISTA_MARCA || ctx.M.AMBAS;
  return {
    marca: attr(marca),
    marcas: attr(JSON.stringify(ctx.M.LISTA)),
    marcasModulos: attr(JSON.stringify(ctx.M.mapa())),
    marcaIcono: attr((ctx.M.LISTA[marca] && ctx.M.LISTA[marca].logo) || ctx.M.LISTA.CI.logo),
  };
}
let marca_ = null;

/** include('html/styles') → contenido de src/html/styles.html (con sus propios include) */
function resolver(archivo) {
  const html = fs.readFileSync(path.join(RAIZ, archivo + '.html'), 'utf8');
  marca_ = marca_ || marcaDelServidor();
  return html
    .replace(/<\?!=\s*include\('([^']+)'\);?\s*\?>/g, (_, nombre) => resolver(nombre))
    .replace(/<\?=\s*(marca|marcas|marcasModulos|marcaIcono)\s*\?>/g, (_, k) => marca_[k])
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

/** Los grupos de módulos de src/config/Modulos.gs (los reales, con referencia / editaEn): así la
 *  vista previa no tiene su propia copia que se desfase */
function catalogoReal() {
  const ctx = {};
  require('vm').runInNewContext(fs.readFileSync(path.join(RAIZ, 'config', 'Modulos.gs'), 'utf8') + '\n;this.M = Modulos;', ctx);
  return ctx.M;
}
const gruposReales = () => catalogoReal().GRUPOS;
/** Todos los nodos del catálogo (módulos y secciones, con su padre): para los permisos falsos */
const nodosReales = () => catalogoReal().nodos();

function construir() {
  let pagina = resolver('html/Index');
  const falsos = 'window.__GRUPOS = ' + JSON.stringify(gruposReales()) + ';\n' +
    'window.__NODOS = ' + JSON.stringify(nodosReales()) + ';\n' + fs.readFileSync(path.join(__dirname, 'datos-falsos.js'), 'utf8');
  // El servidor falso va ANTES que todo: api.html usa google.script.run al cargar
  pagina = pagina.replace(/<head>/i, '<head>\n<meta name="viewport" content="' + viewportDelServidor() + '">' +
    '\n<script>\n' + falsos + '\n</script>');
  // VISTA_ASSETS_LOCAL=1: las imágenes de assets/ de esta carpeta, no las de master en GitHub (una nueva, antes de subirla)
  if (process.env.VISTA_ASSETS_LOCAL) {
    const local = 'file:///' + path.resolve(__dirname, '..', '..', 'assets').replace(/\\/g, '/') + '/';
    pagina = pagina.split('raw.githubusercontent.com/15GaelNG/Inventario_Control-Interno/master/assets/')
      .join('\u0000').replace(/https:(\\\/\\\/|\/\/)\u0000/g, local).split('\u0000').join(local);
  }
  fs.mkdirSync(SALIDA, { recursive: true });
  fs.writeFileSync(path.join(SALIDA, 'index.html'), pagina);
  return path.join(SALIDA, 'index.html');
}

if (require.main === module) console.log(construir());
module.exports = { construir };
