/**
 * construir.js — arma la versión comprimida de src/ que se sube a Apps Script.
 *
 * src/ se queda como está (legible, con comentarios: es lo que se edita y se revisa en git).
 * Aquí se copia a una carpeta aparte con el JS de cada <script> y el CSS de cada <style>
 * comprimidos: la página pesa ~40 % menos en lo que viaja y ~45 % menos en lo que el
 * navegador tiene que leer. Los .gs se copian tal cual (los errores del servidor siguen
 * diciendo archivo y renglón reales).
 *
 * El cuidado de siempre (CLAUDE.md): Apps Script corta lo que sigue a un "//" en un .html,
 * aunque esté dentro de un string. El compresor convierte 'https:\/\/…' de vuelta en
 * 'https://…', así que después de comprimir se vuelven a escapar las "/" de cada string y
 * template. Si aun así queda un "//" (p. ej. dentro de una expresión regular), ese bloque se
 * deja SIN comprimir: nunca se sube algo que Apps Script pueda cortar.
 *
 *   node tools/subir/construir.js [destino]     (por omisión .construido/revisar)
 *
 * Exporta construir(origen, destino) para las pruebas y para subir.js.
 */
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const csso = require('csso');
const acorn = require('acorn');

const RAIZ = path.resolve(__dirname, '..', '..');

/** Las "/" de un string o template, escapadas ("\/" es la misma "/" para JS) */
function escaparDiagonales_(crudo) {
  let salida = '';
  for (let i = 0; i < crudo.length; i++) {
    const c = crudo[i];
    if (c === '\\') { salida += c + (crudo[i + 1] || ''); i++; continue; }
    salida += c === '/' ? '\\/' : c;
  }
  return salida;
}

/** Vuelve a escapar las "/" de los strings y templates del código ya comprimido */
function sinDobleDiagonal_(codigo) {
  if (!codigo.includes('//')) return codigo;
  const cambios = [];
  for (const t of acorn.tokenizer(codigo, { ecmaVersion: 'latest', sourceType: 'script' })) {
    const tipo = t.type.label;
    if ((tipo === 'string' || tipo === 'template') && codigo.slice(t.start, t.end).includes('/')) {
      cambios.push([t.start, t.end, escaparDiagonales_(codigo.slice(t.start, t.end))]);
    }
  }
  let salida = codigo;
  for (let i = cambios.length - 1; i >= 0; i--) {
    const [ini, fin, texto] = cambios[i];
    salida = salida.slice(0, ini) + texto + salida.slice(fin);
  }
  return salida;
}

async function comprimirJs_(codigo) {
  const r = await minify(codigo, {
    compress: true,
    // Solo nombres locales: las funciones de nivel superior las llaman otros archivos (mismo
    // scope global del navegador) y los onclick del HTML
    mangle: { toplevel: false },
    keep_fnames: true,
    format: { comments: false },
  });
  return sinDobleDiagonal_(r.code);
}

/**
 * Un .html con su JS y CSS comprimidos. Regresa { texto, sinComprimir: [motivos] }.
 * Un <script> que trae scriptlets de Apps Script (<? ?>) o atributos (src=…) no se toca.
 */
async function comprimirHtml(texto) {
  const sinComprimir = [];
  const bloques = [...texto.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  let salida = '';
  let desde = 0;
  for (const m of bloques) {
    salida += texto.slice(desde, m.index);
    desde = m.index + m[0].length;
    const js = m[1];
    if (js.includes('<?')) { salida += m[0]; continue; }
    let comprimido = null;
    try {
      comprimido = await comprimirJs_(js);
    } catch (e) {
      sinComprimir.push('no se pudo comprimir (' + e.message + ')');
    }
    if (comprimido !== null && comprimido.includes('//')) {
      sinComprimir.push('quedaba un "//" (una expresión regular, quizá)');
      comprimido = null;
    }
    salida += comprimido === null ? m[0] : '<script>' + comprimido + '</script>';
  }
  salida += texto.slice(desde);
  salida = salida.replace(/<style>([\s\S]*?)<\/style>/g, (bloque, css) => {
    if (css.includes('<?')) return bloque;
    const corto = csso.minify(css, { restructure: false }).css;
    // Igual que el JS: un "//" que no estaba en el original no se sube
    return corto.includes('//') && !css.includes('//') ? bloque : '<style>' + corto + '</style>';
  });
  return { texto: salida, sinComprimir: sinComprimir };
}

function archivos_(dir) {
  const todos = [];
  (function recorrer(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const ruta = path.join(d, e.name);
      if (e.isDirectory()) recorrer(ruta); else todos.push(ruta);
    });
  })(dir);
  return todos;
}

/** Copia origen → destino comprimiendo los .html (menos Index.html, que lleva scriptlets) */
async function construir(origen, destino) {
  fs.rmSync(destino, { recursive: true, force: true });
  const reporte = { antes: 0, despues: 0, sinComprimir: [] };
  for (const archivo of archivos_(origen)) {
    const relativo = path.relative(origen, archivo);
    const final = path.join(destino, relativo);
    fs.mkdirSync(path.dirname(final), { recursive: true });
    if (!archivo.endsWith('.html') || path.basename(archivo) === 'Index.html') {
      fs.copyFileSync(archivo, final);
      continue;
    }
    const texto = fs.readFileSync(archivo, 'utf8');
    const r = await comprimirHtml(texto);
    r.sinComprimir.forEach((m) => reporte.sinComprimir.push(relativo + ': ' + m));
    reporte.antes += Buffer.byteLength(texto);
    reporte.despues += Buffer.byteLength(r.texto);
    fs.writeFileSync(final, r.texto);
  }
  return reporte;
}

module.exports = { construir, comprimirHtml, sinDobleDiagonal_ };

if (require.main === module) {
  const destino = path.resolve(process.argv[2] || path.join(RAIZ, '.construido', 'revisar'));
  construir(path.join(RAIZ, 'src'), destino).then((r) => {
    console.log('HTML: ' + Math.round(r.antes / 1024) + ' KB → ' + Math.round(r.despues / 1024) + ' KB en ' + path.relative(RAIZ, destino));
    r.sinComprimir.forEach((m) => console.log('  sin comprimir: ' + m));
  }).catch((e) => { console.error(e); process.exit(1); });
}
