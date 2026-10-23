/**
 * Orden de carga de la pantalla: nada que corre al cargar usa algo declarado en un <script> que carga después.
 *
 *   const { revisarOrdenDeCarga } = require('./orden-de-carga');
 *   revisarOrdenDeCarga()                 // → [] o ['js/app.html usa CAMPOS_VEHICULO (de js/app-vehiculos.html) al cargar', …]
 *   revisarOrdenDeCarga({ leer })         // leer(ruta relativa a src, sin .html) → texto; para revisar archivos propuestos
 *
 * Los <script> de la pantalla comparten el espacio global, en el orden de los include de Index.html. Una función que
 * se llama después (al navegar, con un clic) ve todo; pero lo que corre al cargar (fuera de funciones, o dentro de
 * una que se llama ahí mismo) solo ve lo de su archivo y de los anteriores: lo demás todavía no existe. Los nombres que
 * no declara ningún archivo son del navegador (document, location…) y no cuentan; tampoco un nombre que el archivo
 * pregunta con `typeof` (ya cuenta con que no exista).
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const eslintScope = require('eslint-scope');

const SRC = path.join(__dirname, '..', 'src');
const leerDisco = (ruta) => fs.readFileSync(path.join(SRC, ruta + '.html'), 'utf8');

/** Los <script> en el orden en que los ve el navegador: [{ archivo, js }] (resuelve los include como el servidor) */
function scriptsEnOrden(leer) {
  const salida = [];
  (function recorrer(ruta) {
    const texto = leer(ruta).replace(/\r\n/g, '\n');
    const piezas = /<\?!=\s*include\('([^']+)'\);?\s*\?>|<script>([\s\S]*?)<\/script>/g;
    let m;
    while ((m = piezas.exec(texto))) {
      if (m[1]) recorrer(m[1]);
      else salida.push({ archivo: ruta, js: m[2] });
    }
  })('html/Index');
  return salida;
}

/** ¿Se ejecuta al cargar? Fuera de funciones, o dentro de una que se llama ahí mismo ((function () { … })()) */
function alCargar(nodo, padre) {
  for (let n = nodo, p = padre.get(n); p; n = p, p = padre.get(p)) {
    if (/Function/.test(p.type) && p.body !== n && p.params && !p.params.includes(n) && n !== p.id) continue;
    if (/Function/.test(n.type)) {
      const llamada = p.type === 'CallExpression' && p.callee === n;
      if (!llamada) return false;
    }
    if (n.type === 'ClassBody') return false;
  }
  return true;
}

function revisarOrdenDeCarga(opciones) {
  const leer = (opciones && opciones.leer) || leerDisco;
  const scripts = scriptsEnOrden(leer).map((s, i) => {
    const ast = acorn.parse(s.js, { ecmaVersion: 2022, ranges: true });
    const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
    const padre = new Map();
    (function caminar(n, p) {
      if (!n || typeof n.type !== 'string') return;
      if (p) padre.set(n, p);
      for (const k of Object.keys(n)) {
        const v = n[k];
        if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && caminar(c, n));
        else if (v && typeof v.type === 'string') caminar(v, n);
      }
    })(ast, null);
    const declara = new Set(sm.globalScope.variables.map((v) => v.name));
    // Lo que el archivo pregunta con typeof (if (typeof HistorialApp !== 'undefined') …) ya cuenta con que no exista
    const conTypeof = new Set(sm.globalScope.through.filter((r) => {
      const p = padre.get(r.identifier);
      return p && p.type === 'UnaryExpression' && p.operator === 'typeof';
    }).map((r) => r.identifier.name));
    const usaAlCargar = sm.globalScope.through
      .filter((r) => !conTypeof.has(r.identifier.name) && alCargar(r.identifier, padre))
      .map((r) => r.identifier.name);
    return { i, archivo: s.archivo, declara, usaAlCargar: [...new Set(usaAlCargar)] };
  });
  const dondeSeDeclara = {};
  scripts.forEach((s) => s.declara.forEach((n) => { if (!(n in dondeSeDeclara)) dondeSeDeclara[n] = s; }));
  const malos = [];
  scripts.forEach((s) => s.usaAlCargar.forEach((n) => {
    const d = dondeSeDeclara[n];
    if (d && d.i > s.i) malos.push(s.archivo.replace(/^html\//, '') + ' usa ' + n + ' (de ' + d.archivo.replace(/^html\//, '') + ') al cargar');
  }));
  return malos;
}

module.exports = { revisarOrdenDeCarga, scriptsEnOrden };

if (require.main === module) {
  const malos = revisarOrdenDeCarga();
  console.log(malos.length ? malos.join('\n') : 'Nada que corre al cargar usa algo de un archivo posterior.');
  process.exit(malos.length ? 1 : 0);
}
