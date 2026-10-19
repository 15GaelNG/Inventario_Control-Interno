/**
 * analisis-telefonicas.js — lo que necesita partir-telefonicas.js: lee lineas-telefonicas.html y, con los ámbitos de
 * eslint-scope (qué nombre es de verdad cuál, sin confundir una variable local que se llama igual), dice para cada
 * región de initTelefonicas qué declara y qué usa de las demás. Solo lee.
 *
 *   node tools/lineas/analisis-telefonicas.js
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const eslintScope = require('eslint-scope');

const ARCHIVO = path.join(__dirname, '..', '..', 'src', 'html', 'js', 'lineas-telefonicas.html');

// La primera declaración de cada parte (lo de antes es la principal: arranque + lista)
const PARTES = [
  { parte: 'ficha', desde: 'abrir' },
  { parte: 'documentos', desde: 'textoDetalles' },
  { parte: 'acciones', desde: 'abrirResponsiva' },
  { parte: 'captura', desde: 'abrirEditor' },
  { parte: 'historial', desde: 'ICONO_MOVIMIENTO' },
  { parte: 'paginas', desde: 'datosDocumento' },
];

function analizar(textoHtml) {
  const html = textoHtml.replace(/\r\n/g, '\n');
  const i0 = html.indexOf('<script>') + '<script>'.length;
  const js = html.slice(i0, html.lastIndexOf('</script>'));
  const ast = acorn.parse(js, { ecmaVersion: 2022, ranges: true });
  const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });

  // Padre de cada nodo (para saber si un nombre se llama o se usa como valor)
  const padre = new Map();
  (function caminar(n, p) {
    if (!n || typeof n.type !== 'string') return;
    padre.set(n, p);
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && caminar(c, n));
      else if (v && typeof v.type === 'string') caminar(v, n);
    }
  })(ast, null);

  let tel = null;
  for (const n of padre.keys()) if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'initTelefonicas') tel = n;
  if (!tel) throw new Error('no encontré function initTelefonicas');
  const scopeTel = sm.acquire(tel);
  const scopePantalla = scopeTel.upper;   // la función que envuelve el archivo
  const sentencias = tel.body.body;

  // Región de cada sentencia
  let actual = 'principal';
  const region = new Map();
  sentencias.forEach((st) => {
    const nombres = st.type === 'FunctionDeclaration' ? [st.id.name]
      : st.type === 'VariableDeclaration' ? st.declarations.filter((d) => d.id.type === 'Identifier').map((d) => d.id.name) : [];
    const p = PARTES.find((x) => nombres.includes(x.desde));
    if (p) actual = p.parte;
    region.set(st, actual);
  });
  PARTES.forEach((p) => { if (![...region.values()].includes(p.parte)) throw new Error('no encontré ' + p.desde); });
  const sentenciaDe = (pos) => sentencias.find((st) => st.start <= pos && pos < st.end);
  const regionDe = (pos) => { const st = sentenciaDe(pos); return st ? region.get(st) : null; };

  // Variables de initTelefonicas
  const vars = scopeTel.variables.filter((v) => v.name !== 'arguments').map((v) => {
    const def = v.defs[0];
    const st = sentenciaDe(def.name.start);
    const decl = def.type === 'FunctionName' ? 'function' : def.parent && def.parent.kind;
    const esFuncion = decl === 'function' || (def.node.init && /Function/.test(def.node.init.type));
    return { v, nombre: v.name, sentencia: st, region: st ? region.get(st) : '?', decl, esFuncion, def };
  });

  // Usos de una región a otra
  const cruces = [];
  vars.forEach((x) => x.v.references.forEach((r) => {
    const reg = regionDe(r.identifier.start);
    if (!reg || reg === x.region) return;
    const p = padre.get(r.identifier);
    const llamada = p && p.type === 'CallExpression' && p.callee === r.identifier;
    cruces.push({ ...x, desde: reg, ref: r, llamada, escribe: r.isWrite() });
  }));

  // Lo que cada región usa de afuera de initTelefonicas, pero del archivo (Lineas.comun o lo de la pantalla)
  const externos = {};
  scopePantalla.variables.forEach((v) => v.references.forEach((r) => {
    const reg = regionDe(r.identifier.start);
    if (!reg) return;
    const def = v.defs[0];
    const deComun = def && def.node && def.node.init && def.node.init.type === 'MemberExpression' &&
      js.slice(def.node.init.start, def.node.init.end) === 'Lineas.comun';
    ((externos[reg] = externos[reg] || { comun: new Set(), pantalla: new Set() })[deComun ? 'comun' : 'pantalla']).add(v.name);
  }));

  return { html, js, i0, ast, sm, tel, sentencias, region, vars, cruces, externos, padre, scopeTel, scopePantalla };
}

module.exports = { analizar, PARTES, ARCHIVO };

if (require.main === module) {
  const a = analizar(fs.readFileSync(ARCHIVO, 'utf8'));
  const lineaDe = (pos) => a.html.slice(0, a.i0 + pos).split('\n').length;
  const tam = {};
  a.sentencias.forEach((st) => { const r = a.region.get(st); tam[r] = (tam[r] || 0) + lineaDe(st.end) - lineaDe(st.start) + 1; });
  console.log('líneas por región:', JSON.stringify(tam));

  const lets = a.vars.filter((x) => x.decl === 'let');
  console.log('\nlet (dónde se declara → regiones que lo usan):');
  lets.forEach((x) => {
    const usos = {};
    x.v.references.forEach((r) => { const reg = a.region.get(a.sentencias.find((s) => s.start <= r.identifier.start && r.identifier.start < s.end)); usos[reg] = (usos[reg] || 0) + 1; });
    console.log('  ' + x.nombre.padEnd(20) + x.region.padEnd(12) + JSON.stringify(usos));
  });

  const llamadas = a.cruces.filter((c) => c.esFuncion && c.decl !== 'let');
  console.log('\nfunciones de otra región: ' + llamadas.filter((c) => c.llamada).length + ' llamadas');
  const comoValor = llamadas.filter((c) => !c.llamada);
  console.log('funciones de otra región usadas como VALOR: ' + comoValor.length);
  comoValor.forEach((c) => console.log('  ' + c.desde + ' usa ' + c.nombre + ' (de ' + c.region + ') L' + lineaDe(c.ref.identifier.start) + ': ' +
    a.js.slice(a.padre.get(c.ref.identifier).start, a.padre.get(c.ref.identifier).start + 80).replace(/\s+/g, ' ')));

  const datos = a.cruces.filter((c) => !c.esFuncion && c.decl !== 'let');
  console.log('\ndatos (const que no son función) de otra región:');
  const porDato = {};
  datos.forEach((c) => { const k = c.nombre + ' (de ' + c.region + ')'; (porDato[k] = porDato[k] || new Set()).add(c.desde); });
  Object.entries(porDato).forEach(([k, s]) => console.log('  ' + k.padEnd(40) + ' ← ' + [...s].join(', ')));

  console.log('\nde afuera de initTelefonicas, por región:');
  Object.entries(a.externos).forEach(([r, e]) => console.log('  ' + r.padEnd(12) + 'Lineas.comun: ' + e.comun.size + ' · de la pantalla: ' + [...e.pantalla].join(', ')));
}
