/**
 * partir-telefonicas.js — abre initTelefonicas (lineas-telefonicas.html) en partes (homologación, fase 6.2b; 19-oct).
 *
 *   node tools/lineas/partir-telefonicas.js            revisa y escribe
 *   node tools/lineas/partir-telefonicas.js --revisar  solo revisa y dice qué haría
 *
 * initTelefonicas era una sola función de 3,161 líneas. Se queda como el arranque y la lista; la ficha, documentos,
 * acciones, captura, historial y las páginas se van a lineas-telefonicas-<parte>.html, cada una una función (T) => {…}
 * que initTelefonicas monta. El cuerpo de las funciones no cambia:
 *   - lo de otra parte se pide arriba, como un import: const { abrirResguardo } = T.de('acciones') (se busca al llamar);
 *   - lo del arranque (raiz, pila, vigente…) sale de T;
 *   - un let que usan varias partes se queda en su dueña, que lo publica con get/set en T; las demás dicen T.captura
 *     (las únicas reescrituras del cuerpo).
 * Los ámbitos salen de eslint-scope (analisis-telefonicas.js), no de los nombres: una variable local que se llama igual
 * no se toca. Revisa que cada sentencia quede una vez y que los archivos nuevos no dejen ningún nombre sin resolver
 * que el original sí resolvía. Si master cambia lineas-telefonicas.html, se trae y se vuelve a correr.
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const eslintScope = require('eslint-scope');
const { analizar, PARTES, ARCHIVO } = require('./analisis-telefonicas');

const RAIZ = path.resolve(__dirname, '..', '..');
const JS = path.join(RAIZ, 'src', 'html', 'js');
const INDEX = path.join(RAIZ, 'src', 'html', 'Index.html');
const SOLO_REVISAR = process.argv.includes('--revisar');

const TITULOS = {
  ficha: 'la ficha de un equipo o una línea: abrir, migas, pestañas, General, encabezado y el menú ⋮',
  documentos: 'Detalles, evidencias, PDF pendiente o firmado y la pestaña Documentos de la ficha',
  acciones: 'las acciones sobre equipos y líneas: responsiva, masiva, resguardo, vínculo y cancelación',
  captura: 'el editor del inventario y la captura de inspección y responsiva',
  historial: 'el historial del registro y sus asignaciones número ↔ NUCO',
  paginas: 'la página de una inspección o una responsiva',
};
// Funciones de otra parte que se usan como valor (no se llaman ahí mismo). Un intermediario de T.de no es la misma
// función: solo se permite donde eso no importa
const COMO_VALOR_PERMITIDO = {
  pintarResponsiva: 'ficha las pone en un objeto { inspeccion, responsiva }[tipo] y la llama',
  pintarInspeccion: 'ficha las pone en un objeto { inspeccion, responsiva }[tipo] y la llama',
};

function fallar(msg) {
  console.error('✖ ' + msg);
  process.exit(1);
}

const crudo = fs.readFileSync(ARCHIVO, 'utf8');
const EOL = crudo.includes('\r\n') ? '\r\n' : '\n';
if (!/function initTelefonicas\(/.test(crudo)) fallar('no está initTelefonicas');
if (/Lineas\.telefonicas = \{/.test(crudo)) fallar('lineas-telefonicas.html ya está partido');
const A = analizar(crudo);
const { js, sentencias, region, vars, cruces } = A;
const ORDEN = PARTES.map((p) => p.parte);

// ---- Trozos: cada sentencia con su renglón completo; lo de arriba (comentarios) aparte, por si la sentencia se muda ----
const inicioRenglon = (pos) => js.lastIndexOf('\n', pos - 1) + 1;
const finRenglon = (pos) => js.indexOf('\n', pos) + 1;
let cursor = inicioRenglon(sentencias[0].start);
const cabezaTel = js.slice(0, cursor);   // del archivo hasta antes de la primera sentencia de initTelefonicas
const trozos = sentencias.map((st) => {
  const ini = inicioRenglon(st.start);
  const fin = finRenglon(st.end - 1);
  if (ini < cursor) fallar('dos sentencias en un renglón cerca de ' + js.slice(st.start, st.start + 40));
  const t = { st, region: region.get(st), arriba: js.slice(cursor, ini), inicio: ini, texto: js.slice(ini, fin) };
  cursor = fin;
  return t;
});
const colaTel = js.slice(cursor);         // el cierre de initTelefonicas y lo que sigue en el archivo
const nombresDe = (st) => (st.type === 'FunctionDeclaration' ? [st.id.name]
  : st.type === 'VariableDeclaration' ? st.declarations.filter((d) => d.id.type === 'Identifier').map((d) => d.id.name) : []);
const trozoDe = (nombre) => trozos.find((t) => nombresDe(t.st).includes(nombre));
const varDe = (nombre) => vars.find((x) => x.nombre === nombre);

// ---- Los let: a su dueña (la región que más los usa); las demás los leen con T.x ----
const reescribir = [];   // { trozo, identificador, nombre }
const dueñaDe = {};
vars.filter((x) => x.decl === 'let').forEach((x) => {
  const usos = {};
  x.v.references.forEach((r) => {
    if (r.init) return;   // la declaración misma
    const t = trozos.find((tt) => tt.st.start <= r.identifier.start && r.identifier.start < tt.st.end);
    usos[t.region] = (usos[t.region] || 0) + 1;
  });
  const regiones = Object.keys(usos);
  if (!regiones.length) fallar('let ' + x.nombre + ' sin usos');
  const dueña = regiones.sort((a, b) => usos[b] - usos[a])[0];
  dueñaDe[x.nombre] = dueña;
  x.v.references.forEach((r) => {
    if (r.init) return;
    const t = trozos.find((tt) => tt.st.start <= r.identifier.start && r.identifier.start < tt.st.end);
    if (t.region !== dueña) reescribir.push({ trozo: t, identificador: r.identifier, nombre: x.nombre });
  });
});
const compartidos = [...new Set(reescribir.map((r) => r.nombre))];
const sentenciaLet = (nombre) => {
  const t = trozoDe(nombre);
  if (t.st.declarations.length !== 1) fallar('let ' + nombre + ' comparte su declaración con otro nombre');
  return t;
};

// ---- Datos (const que no son función) que usa otra parte: literales fijos → al arranque, en T ----
const esLiteralFijo = (nodo) => {
  let fijo = true;
  (function ver(n) {
    if (!n || typeof n.type !== 'string' || !fijo) return;
    if (/Identifier|Call|New|Function|Member|Template|This|Await|Yield|Assignment|Update/.test(n.type) && n.type !== 'Literal') {
      fijo = false;
      return;
    }
    for (const k of Object.keys(n)) {
      if (k === 'key') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(ver); else if (v && typeof v.type === 'string') ver(v);
    }
  })(nodo);
  return fijo;
};
const subenAlArranque = new Set();
cruces.filter((c) => c.decl !== 'let' && c.region !== 'principal').forEach((c) => {
  if (c.esFuncion) return;
  const soloLlamadas = c.v.references.filter((r) => !r.init).every((r) => {
    const p = A.padre.get(r.identifier);
    return p && p.type === 'CallExpression' && p.callee === r.identifier;
  });
  if (soloLlamadas) { c.esFuncion = true; return; }   // un alias de función (actualizarProgresoChecklist): se llama
  const t = trozoDe(c.nombre);
  if (t.st.declarations.length !== 1 || !esLiteralFijo(t.st.declarations[0].init)) {
    fallar(c.nombre + ' (de ' + c.region + ') lo usa ' + c.desde + ' y no es un literal fijo: decidir a mano');
  }
  subenAlArranque.add(c.nombre);
});
// Funciones de otra parte usadas como valor
cruces.filter((c) => c.esFuncion && c.decl !== 'let' && !c.llamada && c.region !== 'principal').forEach((c) => {
  if (!COMO_VALOR_PERMITIDO[c.nombre]) fallar(c.desde + ' usa ' + c.nombre + ' (de ' + c.region + ') como valor: un intermediario no es la misma función');
});

// ---- Dónde se monta: antes del cableado de eventos (Tabs.iniciar), con lo del arranque ya declarado ----
// Lo que corre después (mostrarModulo, crearTabla…) ya puede llamar a cualquier parte
const usadoPorPartes = new Set(cruces.filter((c) => c.region === 'principal' && c.desde !== 'principal' && c.decl !== 'let').map((c) => c.nombre));
const principal = trozos.filter((t) => t.region === 'principal');
const iCableado = principal.findIndex((t) => /^\s*Tabs\.iniciar\(/.test(t.texto));
if (iCableado < 1) fallar('no encontré Tabs.iniciar( en el arranque');
const iMontar = iCableado - 1;
const trozoMontar = principal[iMontar];
principal.slice(0, iCableado).forEach((t) => {
  if (!/Declaration/.test(t.st.type) && /(abrir|pintar|mostrar|crear|cerrar)[A-Z]\w*\(/.test(t.texto.replace(/=>[\s\S]*/, ''))) {
    fallar('antes de montar corre algo que podría llamar a una parte: ' + t.texto.trim().slice(0, 90));
  }
});
// Del arranque, a T: lo declarado antes de montar y las funciones (se elevan); lo demás, perezoso con T.de('principal')
const enT = [...usadoPorPartes].filter((n) => {
  const t = trozoDe(n);
  return t.st.type === 'FunctionDeclaration' || t.st.start <= trozoMontar.st.start;
}).concat([...subenAlArranque]).sort();
const perezosos = [...usadoPorPartes].filter((n) => !enT.includes(n)).sort();
perezosos.forEach((n) => {
  if (!varDe(n).esFuncion) fallar(n + ' es un dato del arranque declarado después de montar y lo usa una parte: decidir a mano');
});

// ---- Lo que cada región pide de otra (encabezados) y lo que cada parte publica ----
const pide = {};       // región → parte → Set(nombre)
const publica = {};    // parte → Set(nombre)
cruces.forEach((c) => {
  if (c.decl === 'let' || subenAlArranque.has(c.nombre)) return;
  if (c.region === 'principal') {
    if (enT.includes(c.nombre)) return;
    ((pide[c.desde] = pide[c.desde] || {}).principal = pide[c.desde].principal || new Set()).add(c.nombre);
    return;
  }
  ((pide[c.desde] = pide[c.desde] || {})[c.region] = pide[c.desde][c.region] || new Set()).add(c.nombre);
  (publica[c.region] = publica[c.region] || new Set()).add(c.nombre);
});
const usaDeT = {};     // parte → Set(nombre del arranque)
cruces.forEach((c) => {
  if (c.desde === 'principal' || c.decl === 'let') return;
  if ((c.region === 'principal' && enT.includes(c.nombre)) || subenAlArranque.has(c.nombre)) (usaDeT[c.desde] = usaDeT[c.desde] || new Set()).add(c.nombre);
});
// Lo que sube al arranque también lo usa la parte donde estaba: ahora le llega de T
subenAlArranque.forEach((nombre) => {
  const x = varDe(nombre);
  if (x.v.references.some((r) => !r.init)) (usaDeT[x.region] = usaDeT[x.region] || new Set()).add(nombre);
});

// Cuántas veces se escribe cada trozo en la salida (tiene que ser una)
const escritos = new Map();
function emitir(t, texto) {
  escritos.set(t, (escritos.get(t) || 0) + 1);
  return texto === undefined ? textoDe(t) : texto;
}

// ---- Texto de cada trozo con las reescrituras (de atrás para adelante, por posición) ----
let reescritos = 0;
function textoDe(t) {
  let txt = t.texto;
  reescribir.filter((r) => r.trozo === t).sort((a, b) => b.identificador.start - a.identificador.start).forEach((r) => {
    const i = r.identificador.start - t.inicio;
    if (txt.slice(i, i + r.nombre.length) !== r.nombre) fallar('posición equivocada de ' + r.nombre);
    const p = A.padre.get(r.identificador);
    const nuevo = p && p.type === 'Property' && p.shorthand ? r.nombre + ': T.' + r.nombre : 'T.' + r.nombre;
    txt = txt.slice(0, i) + nuevo + txt.slice(i + r.nombre.length);
    reescritos++;
  });
  return txt;
}

function desestructurar(nombres, de, sangria) {
  const renglones = [];
  let r = sangria + 'const { ';
  nombres.forEach((n, i) => {
    const pieza = n + (i < nombres.length - 1 ? ', ' : '');
    if ((r + pieza).length > 118) { renglones.push(r.trimEnd()); r = sangria + '  '; }
    r += pieza;
  });
  renglones.push(r + ' } = ' + de + ';');
  return renglones.join('\n') + '\n';
}
function lista(nombres, sangria) {
  const renglones = [];
  let r = '';
  nombres.forEach((n) => {
    const pieza = n + ', ';
    if ((sangria + r + pieza).length > 118 && r) { renglones.push(sangria + r.trimEnd()); r = ''; }
    r += pieza;
  });
  if (r) renglones.push(sangria + r.trimEnd());
  return renglones.join('\n');
}
const importes = (reg, sangria) => ['principal'].concat(ORDEN).filter((p) => pide[reg] && pide[reg][p])
  .map((p) => desestructurar([...pide[reg][p]].sort(), "T.de('" + p + "')", sangria)).join('');

// ---- Las partes ----
const S6 = '      ';
const salida = {};
const sobrantes = [];   // lo de arriba de un trozo que se mudó: se queda en su lugar
ORDEN.forEach((parte) => {
  const mios = trozos.filter((t) => t.region === parte);
  const ext = A.externos[parte] || { comun: new Set(), pantalla: new Set() };
  let cuerpo = '';
  mios.forEach((t) => {
    if (subenAlArranque.has(nombresDe(t.st)[0])) { cuerpo += t.arriba; return; }
    cuerpo += t.arriba + emitir(t);
  });
  const lets = Object.keys(dueñaDe).filter((n) => dueñaDe[n] === parte && trozoDe(n).region !== parte);
  const letsTexto = lets.map((n) => { const t = sentenciaLet(n); return emitir(t, t.texto); }).join('');
  const propios = compartidos.filter((n) => dueñaDe[n] === parte);
  const publicar = [...(publica[parte] || [])].sort();
  salida['lineas-telefonicas-' + parte] = '<script>\n  /**\n   * lineas-telefonicas-' + parte + '.html — Líneas Telefónicas: ' + TITULOS[parte] + '.\n' +
    '   * Parte de initTelefonicas (fase 6.2b, tools/lineas/partir-telefonicas.js), que la monta: lo del arranque sale de T y\n' +
    "   * lo de otras partes, de T.de('parte') (se busca al llamar). Lo que publica es lo que usan las demás.\n   */\n" +
    "  (function () {\n    'use strict';\n" +
    (ext.comun.size ? desestructurar([...ext.comun].sort(), 'Lineas.comun', '    ') : '') +
    (ext.pantalla.size ? desestructurar([...ext.pantalla].sort(), 'Lineas.telefonicas.comun', '    ') : '') +
    "    Lineas.telefonicas.registrar('" + parte + "', (T) => {\n" +
    (usaDeT[parte] ? desestructurar([...usaDeT[parte]].sort(), 'T', S6) : '') +
    importes(parte, S6) +
    (letsTexto ? '\n' + letsTexto : '') +
    cuerpo +
    (propios.length ? '\n' + S6 + '// Lo que también usan otras partes (T.' + propios.join(', T.') + ')\n' +
      propios.map((n) => S6 + "Object.defineProperty(T, '" + n + "', { get: () => " + n + ', set: (v) => { ' + n + ' = v; } });\n').join('') : '') +
    '\n' + S6 + 'return {\n' + lista(publicar.map((n) => n + ': ' + n), S6 + '  ') + '\n' + S6 + '};\n' +
    '    });\n  })();\n</script>\n';
});

// ---- La principal (arranque + lista) ----
const telIni = A.tel.body.start;   // la llave de initTelefonicas
let cuerpoP = '';
principal.forEach((t, i) => {
  const nombre = nombresDe(t.st)[0];
  if (t.st.type === 'VariableDeclaration' && t.st.kind === 'let' && dueñaDe[nombre] && dueñaDe[nombre] !== 'principal') {
    cuerpoP += t.arriba;   // el let se va a su dueña; el comentario de arriba, si hay, se queda
    return;
  }
  cuerpoP += t.arriba + emitir(t);
  if (nombre === 'pila') {
    cuerpoP += S6 + '// Las partes (lineas-telefonicas-*.html): se montan abajo, cuando ya está lo que piden del arranque\n' +
      S6 + 'const T = contextoTelefonicas();\n' + importes('principal', S6);
  }
  if (i === iMontar) {
    const sube = [...subenAlArranque].map((n) => {
      const tt = trozoDe(n);
      return emitir(tt).replace(/^\s*/, S6).replace(/\n?$/, '') + ' // de ' + tt.region + '; lo usan otras partes\n';
    }).join('');
    cuerpoP += sube + S6 + 'T.montar({\n' + lista(enT, S6 + '  ') + '\n' + S6 + '}, () => ({\n' + lista(perezosos, S6 + '  ') + '\n' + S6 + '}));\n';
  }
});
if (!/const T = contextoTelefonicas\(\);/.test(cuerpoP)) fallar('no encontré dónde va T (const pila)');
// Las partes viven en su archivo: en initTelefonicas solo quedan lo de arriba de sus trozos que no es de ellas (nada)
const telAntes = js.slice(0, inicioRenglon(sentencias[0].start));
const REGISTRO = [
  '    // ---- Partes de Líneas Telefónicas (fase 6.2b) ----',
  '    // initTelefonicas es el arranque y la lista; la ficha, documentos, acciones, captura, historial y páginas viven en',
  '    // lineas-telefonicas-<parte>.html. Cada una es (T) => { …; return { lo que usan las demás } }: lo del arranque',
  "    // (raiz, pila…) sale de T, lo de otra parte de T.de('parte') (se busca al llamar, así no importa el orden) y un let",
  '    // que usan varias lo publica su dueña con get/set en T (T.captura). Al montar se revisa que exista todo lo pedido.',
  '    const PARTES_TELEFONICAS = {};',
  '    function contextoTelefonicas() {',
  '      const exportados = {};',
  '      const pedidos = [];',
  "      const de = (parte) => (typeof exportados[parte] === 'function' ? (exportados[parte] = exportados[parte]()) : exportados[parte] || {});",
  '      const T = {',
  '        de: (parte) => new Proxy({}, {',
  '          get: (_, nombre) => {',
  "            if (typeof nombre === 'string') pedidos.push([parte, nombre]);",
  '            return (...args) => de(parte)[nombre](...args);',
  '          },',
  '        }),',
  '        // datos: lo del arranque; principal: lo de la lista que piden las partes (perezoso: sus const van más abajo)',
  '        montar: (datos, principal) => {',
  '          Object.assign(T, datos);',
  '          exportados.principal = principal;',
  '          Object.keys(PARTES_TELEFONICAS).forEach((p) => { exportados[p] = PARTES_TELEFONICAS[p](T); });',
  "          pedidos.filter(([p]) => p !== 'principal').forEach(([p, nombre]) => {",
  "            if (typeof de(p)[nombre] !== 'function') console.error('Líneas Telefónicas: la parte ' + p + ' no publica ' + nombre);",
  '          });',
  '        },',
  '      };',
  '      return T;',
  '    }',
  '    Lineas.telefonicas = {',
  '      registrar: (nombre, fabrica) => { PARTES_TELEFONICAS[nombre] = fabrica; },',
  '      // Lo de esta pantalla que usan las partes',
  '      comun: { ' + [...new Set(ORDEN.flatMap((p) => [...((A.externos[p] || {}).pantalla || [])]))].sort().map((n) => n + ': ' + n).join(', ') + ' },',
  '    };',
  '',
].join('\n') + '\n';
const iTel = telAntes.lastIndexOf('    function initTelefonicas() {');
if (iTel < 0) fallar('no encontré "    function initTelefonicas() {"');
let principalJs = telAntes.slice(0, iTel) + REGISTRO + telAntes.slice(iTel) + cuerpoP + colaTel;

// La cabecera de Lineas.comun: solo lo que este archivo sigue usando
const htmlP = '<script>' + principalJs + '</script>\n';
function noResueltos(texto) {
  const j = texto.slice(texto.indexOf('<script>') + 8, texto.lastIndexOf('</script>'));
  const ast = acorn.parse(j, { ecmaVersion: 2022, ranges: true });
  const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
  return { sm, ast, j, globales: new Set(sm.globalScope.through.map((r) => r.identifier.name)) };
}
{
  const { sm, ast, j } = noResueltos(htmlP);
  const iife = sm.acquire(ast.body[0].expression.callee);
  const cab = ast.body[0].expression.callee.body.body.find((st) => st.type === 'VariableDeclaration' &&
    st.declarations[0].init && j.slice(st.declarations[0].init.start, st.declarations[0].init.end) === 'Lineas.comun');
  const usados = cab.declarations[0].id.properties.map((p) => p.key.name)
    .filter((n) => iife.set.get(n).references.some((r) => !r.init));
  const nueva = desestructurar(usados.sort(), 'Lineas.comun', '    ').replace(/\n$/, '');
  principalJs = principalJs.replace(j.slice(cab.start, cab.end), nueva.trim());
}
salida['lineas-telefonicas'] = '<script>' + principalJs + '</script>\n';

// ---- Revisiones ----
trozos.forEach((t) => {
  if (escritos.get(t) !== 1) {
    fallar('el trozo de ' + (nombresDe(t.st).join(',') || t.st.type + ' «' + t.texto.trim().slice(0, 40) + '»') + ' quedó ' + (escritos.get(t) || 0) + ' veces');
  }
});
if (reescritos !== reescribir.length) fallar('se reescribieron ' + reescritos + ' de ' + reescribir.length);
// Ningún nombre sin resolver que el original sí resolvía (un import que falta)
const antes = noResueltos(crudo.replace(/\r\n/g, '\n')).globales;
const nuevos = new Set();
Object.entries(salida).forEach(([a, txt]) => noResueltos(txt).globales.forEach((g) => { if (!antes.has(g)) nuevos.add(a + ': ' + g); }));
const PERMITIDOS = ['Proxy', 'console'];   // los usa contextoTelefonicas (el aviso de "no publica…")
const malos = [...nuevos].filter((x) => !PERMITIDOS.includes(x.split(': ')[1]));
if (malos.length) fallar('nombres sin resolver que antes sí: ' + malos.join(', '));

// ---- Index.html ----
const index = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');
const incTel = "  <?!= include('html/js/lineas-telefonicas'); ?>\n";
if (!index.includes(incTel)) fallar('Index.html no incluye lineas-telefonicas');
const incPartes = ORDEN.map((p) => "  <?!= include('html/js/lineas-telefonicas-" + p + "'); ?>\n").join('');
const indexNuevo = index.includes(incPartes) ? index : index.replace(incTel, incTel + incPartes);

// ---- Resumen y escritura ----
console.log('let a su dueña: ' + Object.entries(dueñaDe).filter(([, d]) => d !== 'principal').map(([n, d]) => n + '→' + d).join(', '));
console.log('compartidos con T.x: ' + compartidos.join(', ') + ' (' + reescritos + ' reescrituras)');
console.log('suben al arranque: ' + [...subenAlArranque].join(', '));
console.log('en T al montar: ' + enT.join(', '));
console.log('perezosos (T.de principal): ' + perezosos.join(', '));
console.log('se monta después de: ' + trozoMontar.texto.trim().slice(0, 60));
Object.entries(salida).forEach(([a, txt]) => console.log('  ' + (a + '.html').padEnd(36) + String(txt.split('\n').length).padStart(6) + ' líneas' +
  (publica[a.replace('lineas-telefonicas-', '')] ? '  · publica ' + publica[a.replace('lineas-telefonicas-', '')].size : '')));
if (SOLO_REVISAR) { console.log('(--revisar: no escribí nada)'); process.exit(0); }
Object.entries(salida).forEach(([a, txt]) => fs.writeFileSync(path.join(JS, a + '.html'), txt.replace(/\n/g, EOL)));
fs.writeFileSync(INDEX, indexNuevo.replace(/\n/g, EOL));
console.log('Escrito.');
