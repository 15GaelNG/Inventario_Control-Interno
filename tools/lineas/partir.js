/**
 * partir.js — parte src/html/js/lineas.html en la base + un archivo por pantalla (homologación, fase 6.2; 19-oct).
 *
 *   node tools/lineas/partir.js            revisa y escribe
 *   node tools/lineas/partir.js --revisar  solo revisa y dice qué haría (no escribe)
 *
 * lineas.html era una sola función que encierra todo (const Lineas = (function () { … })()). Las pantallas se van a su
 * archivo tal cual; lo que usan de la base lo toman de Lineas.comun y se publican con Object.assign(Lineas, …).
 * Únicos cambios de código: montaje pasa a { n } (lo reasignan todas las pantallas), las pantallas leen panelAbierto con
 * panelActual() (la base lo cambia; una copia se quedaría vieja), dinero y pedirDatos suben a la base (las usa
 * Telefónicas) y el return de la base se reparte.
 *
 * Si master cambia lineas.html mientras dura el corte, no se resuelven conflictos: se trae el lineas.html de master y se
 * vuelve a correr. Revisa que cada sentencia del original quede exactamente una vez en la salida; si no, no escribe.
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const RAIZ = path.resolve(__dirname, '..', '..');
const JS = path.join(RAIZ, 'src', 'html', 'js');
const INDEX = path.join(RAIZ, 'src', 'html', 'Index.html');
const SOLO_REVISAR = process.argv.includes('--revisar');

// Cada pantalla empieza en su primera declaración y llega hasta la siguiente (en el orden del archivo)
const PANTALLAS = [
  { archivo: 'lineas-telefonicas', desde: 'COLUMNAS_VISTA_LINEAS', titulo: 'Líneas Telefónicas: inventario (tabla, tarjetas o vínculos), ficha, documentos, historial y las capturas' },
  { archivo: 'lineas-panorama', desde: 'MESES_CORTOS', titulo: 'Panorama de Líneas: equipos y líneas por estatus, hoy y al cierre de cada mes' },
  { archivo: 'lineas-activos', desde: 'initGestionActivos', titulo: 'Gestión de Activos: busca un colaborador y muestra sus líneas y equipos' },
  { archivo: 'lineas-accesorios', desde: 'initAccesoriosLineas', titulo: 'Inventario de Accesorios de Líneas (ACCESORIOS CELULARES / MOVIMIENTOS_ACCESORIOS)' },
  { archivo: 'lineas-resguardos', desde: 'pedirDatos', titulo: 'Resguardos y cancelaciones: la bandeja de quien recibe los equipos' },
  { archivo: 'lineas-bitacora', desde: 'BITACORAS', titulo: 'Bitácora: Control de Cambios (fuera del menú; alimenta el Historial y el Panorama)' },
];
// De una pantalla a la base: las usa otra pantalla
const A_LA_BASE = ['dinero', 'pedirDatos'];
// Un let de la base que las pantallas solo LEEN (la base lo cambia): tomarlo de Lineas.comun lo congelaría en su valor
// al cargar, así que la base publica una función que da el valor vigente y la pantalla lee con ella
const LEIDOS = { panelAbierto: 'panelActual' };

function fallar(msg) {
  console.error('✖ ' + msg);
  process.exit(1);
}

const crudo = fs.readFileSync(path.join(JS, 'lineas.html'), 'utf8');
const EOL = crudo.includes('\r\n') ? '\r\n' : '\n';
const html = crudo.replace(/\r\n/g, '\n');
const PRE = "  const Lineas = (function () {\n    'use strict';\n";
const iPre = html.indexOf(PRE);
const iFin = html.lastIndexOf('  })();\n</script>');
if (iPre < 0 || iFin < 0) fallar('lineas.html no tiene la forma de siempre (const Lineas = (function () { … })())');
if (!/function initTelefonicas\(/.test(html)) fallar('lineas.html ya no trae las pantallas: ¿ya se partió?');

const cuerpo = html.slice(iPre + PRE.length, iFin);
const ast = acorn.parse('(function () {' + cuerpo + '})', { ecmaVersion: 2022 });
const AJUSTE = '(function () {'.length;
const sentencias = ast.body[0].expression.body.body;

// Cada sentencia con lo que tiene arriba (comentarios, renglones en blanco) hasta el fin de su renglón
let cursor = 0;
const trozos = sentencias.map((st) => {
  const fin = cuerpo.indexOf('\n', st.end - AJUSTE) + 1;
  const t = { st, inicio: cursor, texto: cuerpo.slice(cursor, fin), nombres: nombresDe(st) };
  cursor = fin;
  return t;
});
if (cuerpo.slice(cursor).trim()) fallar('quedó texto después del return');

function nombresDe(st) {
  if (st.type === 'FunctionDeclaration') return [st.id.name];
  if (st.type === 'VariableDeclaration') return st.declarations.map((d) => (d.id.type === 'Identifier' ? d.id.name : null)).filter(Boolean);
  return [];
}

// Destino de cada trozo
let actual = 'lineas';
const destinoDe = new Map();
trozos.forEach((t) => {
  const p = PANTALLAS.find((x) => t.nombres.includes(x.desde));
  if (p) actual = p.archivo;
  if (t.st.type === 'ReturnStatement') actual = 'return';
  destinoDe.set(t, t.nombres.some((n) => A_LA_BASE.includes(n)) ? 'lineas' : actual);
});
PANTALLAS.forEach((p) => { if (!trozos.some((t) => t.nombres.includes(p.desde))) fallar('no encontré ' + p.desde); });

const declaradoEn = {};
trozos.forEach((t) => t.nombres.forEach((n) => { declaradoEn[n] = destinoDe.get(t); }));
const tipoDe = {};
trozos.forEach((t) => { if (t.st.type === 'VariableDeclaration') t.nombres.forEach((n) => { tipoDe[n] = t.st.kind; }); });

// Los nombres que usa cada trozo (sin contar el nombre de una propiedad ni lo que él mismo declara)
function caminar(n, fn, padre, clave) {
  if (!n || typeof n.type !== 'string') return;
  fn(n, padre, clave);
  for (const k of Object.keys(n)) {
    const v = n[k];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && caminar(c, fn, n, k));
    else if (v && typeof v.type === 'string') caminar(v, fn, n, k);
  }
}
function usados(st) {
  const s = new Set();
  caminar(st, (n, p, k) => {
    if (n.type !== 'Identifier') return;
    if (p && p.type === 'MemberExpression' && k === 'property' && !p.computed) return;
    if (p && (p.type === 'Property' || p.type === 'MethodDefinition') && k === 'key' && !p.computed && !p.shorthand) return;
    if (p && ((p.type === 'VariableDeclarator' && k === 'id') || (p.type === 'FunctionDeclaration' && k === 'id'))) return;
    if (declaradoEn[n.name]) s.add(n.name);
  });
  return s;
}

const cambios = new Map();   // trozo → texto nuevo
const textoDe = (t) => (cambios.has(t) ? cambios.get(t) : t.texto);

// ---- Los let que las pantallas solo leen → su función (panelAbierto → panelActual()) ----
// Va primero: reemplaza por posición en el árbol, con el texto original de cada trozo
let reemplazosLeidos = 0;
Object.entries(LEIDOS).forEach(([nombre, fn]) => {
  const tDecl = trozos.find((t) => t.nombres.includes(nombre));
  if (!tDecl || tipoDe[nombre] !== 'let' || destinoDe.get(tDecl) !== 'lineas') fallar(nombre + ' no es un let de la base');
  const decl = new RegExp('^([ \\t]*)let ' + nombre + ' = [^\\n]*\\n', 'm').exec(tDecl.texto);
  if (!decl) fallar('no encontré "let ' + nombre + ' = …" en un renglón');
  cambios.set(tDecl, textoDe(tDecl).replace(decl[0], decl[0] + decl[1] + 'const ' + fn + ' = () => ' + nombre +
    '; // las pantallas leen el vigente (lineas-*.html, fase 6.2)\n'));
  declaradoEn[fn] = 'lineas';
  tipoDe[fn] = 'const';
  trozos.forEach((t) => {
    const d = destinoDe.get(t);
    if (d === 'lineas' || d === 'return') return;
    const sitios = [];
    caminar(t.st, (n, p, k) => {
      if (n.type !== 'Identifier' || n.name !== nombre) return;
      if (p && p.type === 'MemberExpression' && k === 'property' && !p.computed) return;
      if (p && ((p.type === 'AssignmentExpression' && k === 'left') || p.type === 'UpdateExpression')) fallar(d + ' cambia ' + nombre);
      sitios.push(n);
    });
    if (!sitios.length) return;
    if (cambios.has(t)) fallar('el trozo de ' + t.nombres.join(',') + ' ya tenía cambios: las posiciones no servirían');
    let txt = t.texto;
    sitios.sort((a, b) => b.start - a.start).forEach((n) => {
      const i = n.start - AJUSTE - t.inicio;
      if (txt.slice(i, i + nombre.length) !== nombre) fallar('posición equivocada de ' + nombre);
      txt = txt.slice(0, i) + fn + '()' + txt.slice(i + nombre.length);
      reemplazosLeidos++;
    });
    cambios.set(t, txt);
  });
});

// ---- montaje: lo reasignan todas las pantallas → { n } en la base ----
const trozoMontaje = trozos.find((t) => t.nombres.includes('montaje'));
if (!trozoMontaje || !/let montaje = 0;/.test(trozoMontaje.texto)) fallar('no encontré "let montaje = 0;"');
cambios.set(trozoMontaje, textoDe(trozoMontaje).replace('let montaje = 0;', 'const montaje = { n: 0 };'));
let reemplazosMontaje = 0;
trozos.forEach((t) => {
  const d = destinoDe.get(t);
  if (d === 'lineas' || d === 'return' || !/\bmontaje\b/.test(t.texto)) return;
  const nuevo = textoDe(t).replace(/\+\+montaje\b(?!\.)/g, () => { reemplazosMontaje++; return '++montaje.n'; })
    .replace(/n === montaje\b(?!\.)/g, () => { reemplazosMontaje++; return 'n === montaje.n'; });
  if (/\bmontaje\b(?!\.n)/.test(nuevo.replace(/\/\/.*$/gm, ''))) fallar('montaje se usa de otra forma en ' + t.nombres.join(','));
  cambios.set(t, nuevo);
});
if (reemplazosMontaje !== PANTALLAS.length * 2) fallar('esperaba ' + PANTALLAS.length * 2 + ' usos de montaje y hubo ' + reemplazosMontaje);
tipoDe.montaje = 'const';

// ---- Qué toma cada pantalla de la base y de otra pantalla ----
const usos = {};
const publicos = {};   // pantalla → nombres que otra pantalla toma de Lineas
trozos.forEach((t) => {
  const d = destinoDe.get(t);
  if (d === 'return') return;
  usados(t.st).forEach((n0) => {
    // en la pantalla ya no dice panelAbierto sino panelActual()
    const n = d !== 'lineas' && LEIDOS[n0] ? LEIDOS[n0] : n0;
    const de = declaradoEn[n];
    if (de === d || de === 'return') return;
    if (d === 'lineas') fallar('la base usaría ' + n + ' de ' + de);
    if (de === 'lineas' && tipoDe[n] === 'let') fallar(d + ' usa "let ' + n + '" de la base: tomarlo de Lineas.comun lo congelaría');
    (usos[d] = usos[d] || { base: new Set(), otras: new Set() })[de === 'lineas' ? 'base' : 'otras'].add(n);
    if (de !== 'lineas') {
      if (PANTALLAS.findIndex((p) => p.archivo === de) > PANTALLAS.findIndex((p) => p.archivo === d)) fallar(d + ' usa ' + n + ' de ' + de + ', que carga después');
      (publicos[de] = publicos[de] || new Set()).add(n);
    }
  });
});

// ---- El return: lo de la base se queda; lo de cada pantalla, con su Object.assign ----
const tRet = trozos.find((t) => t.st.type === 'ReturnStatement');
const props = tRet.st.argument.properties;
const lineaDe = (p) => {
  const ini = cuerpo.lastIndexOf('\n', p.start - AJUSTE) + 1;
  return cuerpo.slice(ini, cuerpo.indexOf('\n', p.end - AJUSTE));
};
const exportsDe = {};
const baseRet = [];
let comunProp = null;
props.forEach((p) => {
  if (p.key.name === 'comun') { comunProp = p; return; }
  const due = [...usados(p)].map((n) => declaradoEn[n]).filter((d) => d !== 'lineas');
  const d = due.length ? due[0] : 'lineas';
  if (new Set(due).size > 1) fallar('la propiedad ' + p.key.name + ' es de varias pantallas');
  if (d === 'lineas') baseRet.push(lineaDe(p).trim()); else (exportsDe[d] = exportsDe[d] || []).push(lineaDe(p).trim());
});
if (!comunProp) fallar('el return no trae comun');
const comunOriginal = comunProp.value.properties.map((p) => p.key.name);
const comunExtra = [...new Set(Object.values(usos).flatMap((u) => [...u.base]))].filter((n) => !comunOriginal.includes(n)).sort();
// Lo que otra pantalla toma de Lineas tiene que estar publicado por su dueña
Object.entries(publicos).forEach(([de, ns]) => ns.forEach((n) => {
  if (!(exportsDe[de] || []).some((l) => new RegExp('^' + n + ':').test(l))) fallar(n + ' (de ' + de + ') no está en el return');
}));

function lista(nombres, sangria, ancho) {
  const renglones = [];
  let r = '';
  nombres.forEach((n) => {
    const pieza = n + ': ' + n + ', ';
    if ((sangria + r + pieza).length > ancho && r) { renglones.push(sangria + r.trimEnd()); r = ''; }
    r += pieza;
  });
  if (r) renglones.push(sangria + r.trimEnd());
  return renglones.join('\n');
}
function desestructurar(nombres, de) {
  const renglones = [];
  let r = '    const { ';
  nombres.forEach((n, i) => {
    const pieza = n + (i < nombres.length - 1 ? ', ' : '');
    if ((r + pieza).length > 118) { renglones.push(r.trimEnd()); r = '      '; }
    r += pieza;
  });
  renglones.push(r + ' } = ' + de + ';');
  return renglones.join('\n');
}

// ---- Los archivos ----
const salida = {};
const baseTrozos = trozos.filter((t) => destinoDe.get(t) === 'lineas');
// dinero y pedirDatos se quedan al final de la base, con su comentario
const baseTexto = baseTrozos.filter((t) => !t.nombres.some((n) => A_LA_BASE.includes(n))).map(textoDe).join('') +
  '\n    // ---------------- De las pantallas, para varias (partir.js, fase 6.2) ----------------\n' +
  baseTrozos.filter((t) => t.nombres.some((n) => A_LA_BASE.includes(n))).map((t) => textoDe(t).replace(/^\n+/, '')).join('\n');
const retTexto = '\n    return {\n' +
  baseRet.map((l) => '      ' + l + '\n').join('') +
  '      // La base para las pantallas (lineas-*.html, fase 6.2) y para los módulos en su propio archivo (p. ej. el temporal\n' +
  '      // de correcciones, html/js/lineas-correcciones.html). Cada pantalla agrega su init… con Object.assign(Lineas, …).\n' +
  '      comun: {\n' + lista(comunOriginal.concat(comunExtra), '        ', 120) + '\n      },\n    };\n';
const cabecera = html.slice(0, iPre);
salida.lineas = cabecera
  .replace('Todo vive dentro del namespace `Lineas` para no chocar con el resto de app.js.',
    'Todo vive dentro del namespace `Lineas` para no chocar con el resto de app.js. Este archivo es la base (utilidades,\n' +
    '   * formularios, estado del módulo); cada pantalla vive en su archivo (lineas-telefonicas.html, lineas-panorama.html…)\n' +
    '   * y toma de aquí lo que usa con Lineas.comun (fase 6.2 de docs/homologacion-codigo.md, tools/lineas/partir.js).') +
  PRE + baseTexto + retTexto + '  })();\n</script>\n';

PANTALLAS.forEach((p) => {
  const mios = trozos.filter((t) => destinoDe.get(t) === p.archivo);
  const u = usos[p.archivo] || { base: new Set(), otras: new Set() };
  const exp = exportsDe[p.archivo] || [];
  if (!exp.length) fallar(p.archivo + ' no publica nada');
  salida[p.archivo] = '<script>\n  /**\n   * ' + p.archivo + '.html — ' + p.titulo + '.\n' +
    '   * Era parte de lineas.html (fase 6.2, tools/lineas/partir.js): lo de la base sale de Lineas.comun.\n   */\n' +
    '  (function () {\n    \'use strict\';\n' +
    desestructurar([...u.base].sort(), 'Lineas.comun') + '\n' +
    (u.otras.size ? desestructurar([...u.otras].sort(), 'Lineas') + '\n' : '') +
    mios.map(textoDe).join('') +
    '\n    Object.assign(Lineas, {\n' + exp.map((l) => '      ' + l + '\n').join('') + '    });\n  })();\n</script>\n';
});

// ---- Que no se pierda nada: cada trozo exactamente una vez, y el texto original al deshacer los cambios ----
const todo = Object.values(salida).join('');
trozos.forEach((t) => {
  if (t === tRet) return;
  const txt = textoDe(t).replace(/^\n+/, '');
  const veces = todo.split(txt).length - 1;
  if (veces !== 1) fallar('el trozo de ' + (t.nombres.join(',') || t.st.type) + ' quedó ' + veces + ' veces');
});
const reconstruido = trozos.filter((t) => t !== tRet).map((t) => t.texto).join('');
const sinCambios = trozos.filter((t) => t !== tRet).map((t) => textoDe(t)).join('')
  .replace('const montaje = { n: 0 };', 'let montaje = 0;').replace(/\+\+montaje\.n/g, '++montaje').replace(/n === montaje\.n/g, 'n === montaje')
  .replace(/\n[ \t]*const \w+ = \(\) => \w+; \/\/ las pantallas leen el vigente \(lineas-\*\.html, fase 6\.2\)/g, '')
  .replace(new RegExp('\\b(' + Object.values(LEIDOS).join('|') + ')\\(\\)', 'g'), (m, fn) => Object.keys(LEIDOS).find((k) => LEIDOS[k] === fn));
if (sinCambios !== reconstruido) fallar('deshaciendo los cambios no sale el original');
props.forEach((p) => { if (p !== comunProp && !todo.includes(lineaDe(p).trim())) fallar('se perdió ' + p.key.name + ' del return'); });

// ---- Index.html: las pantallas después de la base, en el orden de PANTALLAS ----
const index = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');
const incBase = "  <?!= include('html/js/lineas'); ?>\n";
if (!index.includes(incBase)) fallar('Index.html no incluye html/js/lineas');
const incPantallas = PANTALLAS.map((p) => "  <?!= include('html/js/" + p.archivo + "'); ?>\n").join('');
const indexNuevo = index.includes(incPantallas) ? index : index.replace(incBase, incBase + incPantallas);

// ---- Resumen y escritura ----
console.log('Base: ' + baseTrozos.length + ' declaraciones; Lineas.comun: ' + comunOriginal.length + ' de antes + ' + comunExtra.length + ' nuevas');
Object.entries(salida).forEach(([a, txt]) => {
  const u = usos[a];
  console.log('  ' + (a + '.html').padEnd(26) + String(txt.split('\n').length).padStart(6) + ' líneas' +
    (u ? '  · toma ' + u.base.size + ' de la base' + (u.otras.size ? ', ' + [...u.otras].join(', ') + ' de Lineas' : '') : ''));
});
console.log('  montaje: ' + reemplazosMontaje + ' usos → montaje.n; ' + Object.entries(LEIDOS).map(([a, b]) => a + ' → ' + b + '()').join(', ') + ': ' + reemplazosLeidos + ' usos; a la base: ' + A_LA_BASE.join(', '));
if (SOLO_REVISAR) { console.log('(--revisar: no escribí nada)'); process.exit(0); }
Object.entries(salida).forEach(([a, txt]) => fs.writeFileSync(path.join(JS, a + '.html'), txt.replace(/\n/g, EOL)));
fs.writeFileSync(INDEX, indexNuevo.replace(/\n/g, EOL));
console.log('Escrito.');
