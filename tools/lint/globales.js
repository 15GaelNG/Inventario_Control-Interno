/**
 * globales.js — los nombres de primer nivel que el proyecto comparte entre archivos, para ESLint (eslint.config.cjs).
 *
 * En Apps Script todo lo de primer nivel es global: una función de VehiculosService.gs se llama desde cualquier .gs,
 * y en la pantalla todos los <script> incluidos en Index.html comparten el mismo espacio. ESLint revisa archivo por
 * archivo, así que sin esta lista marcaría como "no definido" todo lo que viene de otro archivo. Se arma al correr,
 * con acorn: no hay lista a mano que se quede vieja.
 *
 *   const { pantalla, servidor } = require('./tools/lint/globales');
 *   pantalla()  → { nombre: 'readonly' } de los <script> de src/html
 *   servidor()  → { nombre: 'readonly' } de los .gs de src
 *   declarados('pantalla' | 'servidor') → [{ nombre, archivo, linea, tipo }] (para globales-sin-uso.js)
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const RAIZ = path.resolve(__dirname, '..', '..');
const SRC = path.join(RAIZ, 'src');

function archivos(dir, ext) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? archivos(p, ext) : p.endsWith(ext) ? [p] : [];
  });
}

/** Los <script> de un .html; los scriptlets de Apps Script (de Index y FirmaExterna) se cambian por espacios */
function scripts(texto) {
  return [...texto.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => ({
    js: m[1].replace(/<\?[\s\S]*?\?>/g, (s) => s.replace(/[^\n]/g, ' ')),
    linea: texto.slice(0, m.index).split('\n').length,
  }));
}

function delPrimerNivel(js, archivo, lineaBase) {
  let ast;
  try { ast = acorn.parse(js, { ecmaVersion: 2022, locations: true, allowHashBang: true }); } catch (e) { return []; }
  return ast.body.flatMap((n) => {
    const linea = lineaBase + n.loc.start.line - 1;
    if (n.type === 'FunctionDeclaration') return [{ nombre: n.id.name, archivo, linea, tipo: 'function' }];
    if (n.type === 'ClassDeclaration') return [{ nombre: n.id.name, archivo, linea, tipo: 'class' }];
    if (n.type === 'VariableDeclaration') {
      return n.declarations.filter((d) => d.id.type === 'Identifier').map((d) => ({ nombre: d.id.name, archivo, linea, tipo: n.kind }));
    }
    return [];
  });
}

function declarados(lado) {
  const rel = (p) => path.relative(RAIZ, p).replace(/\\/g, '/');
  if (lado === 'servidor') {
    return archivos(SRC, '.gs').flatMap((f) => delPrimerNivel(fs.readFileSync(f, 'utf8'), rel(f), 1));
  }
  return archivos(path.join(SRC, 'html'), '.html').flatMap((f) =>
    scripts(fs.readFileSync(f, 'utf8')).flatMap((s) => delPrimerNivel(s.js, rel(f), s.linea)));
}

// Un let / var de otro archivo se puede reasignar; una función o un const, no
const comoGlobales = (lista) => Object.fromEntries(lista.map((d) => [d.nombre, d.tipo === 'let' || d.tipo === 'var' ? 'writable' : 'readonly']));

module.exports = {
  pantalla: () => comoGlobales(declarados('pantalla')),
  servidor: () => comoGlobales(declarados('servidor')),
  declarados,
  archivos,
  scripts,
  RAIZ,
  SRC,
};
