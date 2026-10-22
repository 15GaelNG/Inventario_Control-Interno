/**
 * en-partes.js — abre la función de arranque de una pantalla (initVehiculos…) en partes, sin cambiar el cuerpo de sus
 * funciones (homologación, fase 6.1b; 22-oct). Lo llama la config de cada pantalla (tools/app/partir-vehiculos.js).
 *
 * La función se queda como el arranque y la lista; cada parte se va a <prefijo>-<parte>.html como
 * Registro.registrar('parte', (T) => { … }) (componentes/partes.html). El cuerpo no cambia:
 *   - lo de otra parte se pide arriba, como un import: const { abrirAgregarSensor } = T.de('capturas');
 *   - lo del arranque (puedeEditar, funciones de la lista…) sale de T;
 *   - un let que usan varias se queda en su dueña, que lo publica con get/set en T; las demás dicen T.x (las únicas
 *     reescrituras).
 * Los ámbitos salen de eslint-scope, no de los nombres: una variable local que se llama igual no se toca. Para un
 * archivo global (no envuelto en una función), como app-vehiculos.html. Lo que hace fallar (y no escribe):
 *   - un ancla obligatoria que no está, o una sentencia que queda dos veces o ninguna;
 *   - un dato (no función) de una parte que usa otra; una función de una parte usada como valor sin permiso;
 *   - algo que corre antes de montar y llega (aunque sea de llamada en llamada) a una parte;
 *   - un await suelto en lo que se muda (las partes no son async);
 *   - un nombre que en las partes queda sin resolver y en el original sí se resolvía.
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const eslintScope = require('eslint-scope');

function fallar(msg) {
  console.error('✖ ' + msg);
  process.exit(1);
}

const nombresDe = (st) => (st.type === 'FunctionDeclaration' ? [st.id.name]
  : st.type === 'VariableDeclaration' ? st.declarations.filter((d) => d.id.type === 'Identifier').map((d) => d.id.name) : []);

function analizar(textoHtml, cfg) {
  const html = textoHtml.replace(/\r\n/g, '\n');
  const i0 = html.indexOf('<script>') + '<script>'.length;
  const js = html.slice(i0, html.lastIndexOf('</script>'));
  const ast = acorn.parse(js, { ecmaVersion: 2022, ranges: true });
  const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
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

  const fn = ast.body.find((n) => n.type === 'FunctionDeclaration' && n.id.name === cfg.funcion);
  if (!fn) fallar('no encontré function ' + cfg.funcion + ' en el primer nivel');
  const scopeFn = sm.acquire(fn);
  const sentencias = fn.body.body;

  // Región de cada sentencia: la del último ancla visto
  const anclas = new Map();
  cfg.partes.forEach((p) => p.desde.forEach((d) => anclas.set(d, p.parte)));
  (cfg.vuelveAPrincipal || []).forEach((d) => anclas.set(d, 'principal'));
  let actual = 'principal';
  const region = new Map();
  const vistas = new Set();
  sentencias.forEach((st) => {
    const a = nombresDe(st).find((n) => anclas.has(n));
    if (a) { actual = anclas.get(a); vistas.add(a); }
    region.set(st, actual);
  });
  cfg.partes.filter((p) => !p.opcional).forEach((p) => p.desde.forEach((d) => { if (!vistas.has(d)) fallar('no encontré el ancla ' + d + ' (' + p.parte + ')'); }));
  (cfg.vuelveAPrincipal || []).forEach((d) => { if (!vistas.has(d)) fallar('no encontré el ancla ' + d + ' (principal)'); });
  const presentes = cfg.partes.filter((p) => [...region.values()].includes(p.parte)).map((p) => p.parte);

  const sentenciaDe = (pos) => sentencias.find((st) => st.start <= pos && pos < st.end);
  const regionDe = (pos) => { const st = sentenciaDe(pos); return st ? region.get(st) : null; };
  const vars = scopeFn.variables.filter((v) => v.name !== 'arguments').map((v) => {
    const def = v.defs[0];
    const st = sentenciaDe(def.name.start);
    const decl = def.type === 'FunctionName' ? 'function' : def.parent && def.parent.kind;
    const esFuncion = decl === 'function' || !!(def.node.init && /Function/.test(def.node.init.type));
    return { v, nombre: v.name, sentencia: st, region: st ? region.get(st) : '?', decl, esFuncion };
  });
  const cruces = [];
  vars.forEach((x) => x.v.references.forEach((r) => {
    const reg = regionDe(r.identifier.start);
    if (!reg || reg === x.region) return;
    const p = padre.get(r.identifier);
    const llamada = !!(p && p.type === 'CallExpression' && p.callee === r.identifier);
    cruces.push({ ...x, desde: reg, ref: r, llamada });
  }));
  return { html, js, i0, ast, sm, fn, scopeFn, sentencias, region, vars, cruces, padre, presentes };
}

function partir(cfg) {
  const RAIZ = cfg.raiz;
  const JS = path.join(RAIZ, 'src', 'html', 'js');
  const ARCHIVO = path.join(JS, cfg.archivo + '.html');
  const INDEX = path.join(RAIZ, 'src', 'html', 'Index.html');
  const crudo = fs.readFileSync(ARCHIVO, 'utf8');
  const EOL = crudo.includes('\r\n') ? '\r\n' : '\n';
  if (new RegExp('const ' + cfg.registro + ' = Partes\\.crear\\(').test(crudo)) fallar(cfg.archivo + '.html ya está partido');
  const A = analizar(crudo, cfg);
  const { js, sentencias, region, vars, cruces } = A;
  const ORDEN = A.presentes;
  const S = ' '.repeat(cfg.sangria);           // sangría del cuerpo de la función (y de las partes)
  const S0 = ' '.repeat(cfg.sangria - 2);      // la de la función misma

  // ---- Trozos: cada sentencia con sus renglones completos; lo de arriba (comentarios) va con ella ----
  const inicioRenglon = (pos) => js.lastIndexOf('\n', pos - 1) + 1;
  const finRenglon = (pos) => js.indexOf('\n', pos) + 1;
  let cursor = inicioRenglon(sentencias[0].start);
  const trozos = sentencias.map((st) => {
    const ini = inicioRenglon(st.start);
    const fin = finRenglon(st.end - 1);
    if (ini < cursor) fallar('dos sentencias en un renglón cerca de ' + js.slice(st.start, st.start + 40));
    const t = { st, region: region.get(st), arriba: js.slice(cursor, ini), inicio: ini, texto: js.slice(ini, fin) };
    cursor = fin;
    return t;
  });
  const antesFn = js.slice(0, inicioRenglon(sentencias[0].start));   // del archivo hasta la primera sentencia
  const colaFn = js.slice(cursor);                                    // el cierre de la función y lo que sigue
  const trozoDe = (nombre) => trozos.find((t) => nombresDe(t.st).includes(nombre));
  const trozoEn = (pos) => trozos.find((t) => t.st.start <= pos && pos < t.st.end);
  const varDe = (nombre) => vars.find((x) => x.nombre === nombre);

  // ---- Los let: a su dueña (la región que más los usa); las demás los leen con T.x ----
  const reescribir = [];
  const dueñaDe = {};
  vars.filter((x) => x.decl === 'let').forEach((x) => {
    const usos = {};
    x.v.references.forEach((r) => { if (!r.init) { const t = trozoEn(r.identifier.start); usos[t.region] = (usos[t.region] || 0) + 1; } });
    const regiones = Object.keys(usos);
    if (!regiones.length) return;   // un let sin usos se queda donde está
    const dueña = regiones.sort((a, b) => usos[b] - usos[a] || (a === 'principal' ? -1 : 1))[0];
    dueñaDe[x.nombre] = dueña;
    x.v.references.forEach((r) => {
      if (r.init) return;
      const t = trozoEn(r.identifier.start);
      if (t.region !== dueña) reescribir.push({ trozo: t, identificador: r.identifier, nombre: x.nombre });
    });
  });
  Object.keys(dueñaDe).forEach((n) => {
    if (trozoDe(n).st.declarations.length !== 1) fallar('let ' + n + ' comparte su declaración con otro nombre');
  });
  const compartidos = [...new Set(reescribir.map((r) => r.nombre))];

  // ---- Datos y funciones como valor ----
  cruces.filter((c) => c.decl !== 'let' && c.region !== 'principal').forEach((c) => {
    if (c.esFuncion) {
      if (!c.llamada && !(cfg.comoValorPermitido || {})[c.nombre]) {
        fallar(c.desde + ' usa ' + c.nombre + ' (de ' + c.region + ') como valor: un intermediario de T.de no es la misma función');
      }
      return;
    }
    const soloLlamadas = c.v.references.filter((r) => !r.init).every((r) => {
      const p = A.padre.get(r.identifier);
      return p && p.type === 'CallExpression' && p.callee === r.identifier;
    });
    if (soloLlamadas) { c.esFuncion = true; return; }   // un alias de función: se llama
    fallar(c.nombre + ' (dato de ' + c.region + ') lo usa ' + c.desde + ': decidir a mano');
  });

  // ---- Un await suelto en lo que se muda no puede ir en una fábrica (T) => {} ----
  trozos.filter((t) => t.region !== 'principal').forEach((t) => {
    (function ver(n, dentro) {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'AwaitExpression' && !dentro) fallar('await suelto en ' + t.region + ': ' + t.texto.trim().slice(0, 60));
      const f = dentro || /Function/.test(n.type);
      for (const k of Object.keys(n)) {
        const v = n[k];
        if (Array.isArray(v)) v.forEach((c) => ver(c, f)); else if (v && typeof v.type === 'string') ver(v, f);
      }
    })(t.st, false);
  });

  // ---- Dónde se monta: antes de la primera sentencia de la principal (no declaración) que llega a una parte ----
  const principal = trozos.filter((t) => t.region === 'principal');
  const deParte = new Set(cruces.filter((c) => c.region !== 'principal' && c.desde === 'principal').map((c) => c.nombre));
  const funcionesPrincipal = new Map(principal.filter((t) => t.st.type === 'FunctionDeclaration').map((t) => [t.st.id.name, t.st]));
  // Lo que alcanza un nodo, de llamada en llamada por las funciones de la principal
  function alcanza(nodo, soloAlCargar) {
    const vistos = new Set();
    const pila = [[nodo, soloAlCargar]];
    while (pila.length) {
      const [n0, carga] = pila.pop();
      let encontrado = null;
      (function ver(n, dentro) {
        if (encontrado || !n || typeof n.type !== 'string') return;
        if (n.type === 'Identifier' && !(carga && dentro)) {
          if (deParte.has(n.name)) { encontrado = n.name; return; }
          if (funcionesPrincipal.has(n.name) && !vistos.has(n.name)) { vistos.add(n.name); pila.push([funcionesPrincipal.get(n.name).body, false]); }
        }
        const f = dentro || /Function/.test(n.type);
        for (const k of Object.keys(n)) {
          const v = n[k];
          if (Array.isArray(v)) v.forEach((c) => ver(c, f)); else if (v && typeof v.type === 'string') ver(v, f);
        }
      })(n0, false);
      if (encontrado) return encontrado;
    }
    return null;
  }
  const iMontar = principal.findIndex((t) => !/Declaration/.test(t.st.type) && alcanza(t.st, false));
  if (iMontar < 0) fallar('ninguna sentencia de la principal usa una parte: ¿anclas equivocadas?');
  principal.slice(0, iMontar).forEach((t) => {
    if (/Declaration/.test(t.st.type) && t.st.type !== 'VariableDeclaration') return;
    const llega = alcanza(t.st, true);
    if (llega) fallar('antes de montar corre algo que llega a ' + llega + ' (de una parte): ' + t.texto.trim().slice(0, 80));
  });
  const trozoMontar = principal[iMontar];

  // Del arranque, a T: funciones (se elevan) y lo declarado antes de montar; lo demás, perezoso (T.de('principal'))
  const usadoPorPartes = new Set(cruces.filter((c) => c.region === 'principal' && c.desde !== 'principal' && c.decl !== 'let').map((c) => c.nombre));
  const enT = [...usadoPorPartes].filter((n) => {
    const t = trozoDe(n);
    return t.st.type === 'FunctionDeclaration' || t.st.start < trozoMontar.st.start;
  }).sort();
  const perezosos = [...usadoPorPartes].filter((n) => !enT.includes(n)).sort();
  perezosos.forEach((n) => { if (!varDe(n).esFuncion) fallar(n + ' es un dato del arranque declarado después de montar y lo usa una parte'); });

  // ---- Lo que cada región pide de otra (los imports) y lo que cada parte publica ----
  const pide = {};
  const publica = {};
  cruces.forEach((c) => {
    if (c.decl === 'let') return;
    if (c.region === 'principal') {
      if (enT.includes(c.nombre)) return;
      ((pide[c.desde] = pide[c.desde] || {}).principal = pide[c.desde].principal || new Set()).add(c.nombre);
      return;
    }
    ((pide[c.desde] = pide[c.desde] || {})[c.region] = pide[c.desde][c.region] || new Set()).add(c.nombre);
    (publica[c.region] = publica[c.region] || new Set()).add(c.nombre);
  });
  const usaDeT = {};
  cruces.forEach((c) => {
    if (c.desde === 'principal' || c.decl === 'let') return;
    if (c.region === 'principal' && enT.includes(c.nombre)) (usaDeT[c.desde] = usaDeT[c.desde] || new Set()).add(c.nombre);
  });

  const escritos = new Map();
  let reescritos = 0;
  function textoDe(t) {
    escritos.set(t, (escritos.get(t) || 0) + 1);
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
  const importes = (reg) => ['principal'].concat(ORDEN).filter((p) => pide[reg] && pide[reg][p])
    .map((p) => desestructurar([...pide[reg][p]].sort(), "T.de('" + p + "')", S)).join('');
  const publicarCompartidos = (reg) => {
    const propios = compartidos.filter((n) => dueñaDe[n] === reg);
    return propios.length ? S + '// Lo que también usan otras partes (T.' + propios.join(', T.') + ')\n' +
      propios.map((n) => S + "Object.defineProperty(T, '" + n + "', { get: () => " + n + ', set: (v) => { ' + n + ' = v; } });\n').join('') : '';
  };

  // ---- Las partes ----
  const salida = {};
  ORDEN.forEach((parte) => {
    let cuerpo = '';
    trozos.filter((t) => t.region === parte).forEach((t) => {
      const nombre = nombresDe(t.st)[0];
      if (t.st.type === 'VariableDeclaration' && t.st.kind === 'let' && dueñaDe[nombre] && dueñaDe[nombre] !== parte) fallar('let ' + nombre + ' de ' + parte + ' con dueña ' + dueñaDe[nombre] + ': decidir a mano');
      cuerpo += t.arriba + textoDe(t);
    });
    const publicar = [...(publica[parte] || [])].sort();
    const compart = publicarCompartidos(parte);
    salida[cfg.archivo + '-' + parte] = '<script>\n' + S0 + '/**\n' +
      S0 + ' * ' + cfg.archivo + '-' + parte + '.html — ' + cfg.pantalla + ': ' + cfg.titulos[parte] + '.\n' +
      S0 + ' * Parte de ' + cfg.funcion + ' (' + cfg.fase + ', ' + cfg.script + '), que la monta: lo del arranque sale de T y\n' +
      S0 + " * lo de otras partes, de T.de('parte') (se busca al llamar). Lo que publica es lo que usan las demás.\n" +
      S0 + ' */\n' +
      S0 + cfg.registro + ".registrar('" + parte + "', (T) => {\n" +
      (usaDeT[parte] ? desestructurar([...usaDeT[parte]].sort(), 'T', S) : '') +
      importes(parte) +
      cuerpo +
      (compart ? '\n' + compart : '') +
      '\n' + S + 'return {\n' + lista(publicar.map((n) => n + ': ' + n), S + '  ') + '\n' + S + '};\n' +
      S0 + '});\n</script>\n';
  });

  // ---- La principal ----
  let cuerpoP = S + '// Las partes (' + cfg.archivo + '-*.html, componentes/partes.html): se montan abajo, con lo del arranque\n' +
    S + 'const T = ' + cfg.registro + '.contexto();\n' + importes('principal');
  principal.forEach((t, i) => {
    const nombre = nombresDe(t.st)[0];
    if (t.st.type === 'VariableDeclaration' && t.st.kind === 'let' && dueñaDe[nombre] && dueñaDe[nombre] !== 'principal') {
      fallar('let ' + nombre + ' de la principal con dueña ' + dueñaDe[nombre] + ': decidir a mano');
    }
    if (i === iMontar) {
      cuerpoP += publicarCompartidos('principal') +
        S + 'T.montar({\n' + lista(enT, S + '  ') + '\n' + S + '}' +
        (perezosos.length ? ', () => ({\n' + lista(perezosos.map((n) => n + ': ' + n), S + '  ') + '\n' + S + '})' : '') + ');\n';
    }
    cuerpoP += t.arriba + textoDe(t);
  });
  const iFn = antesFn.lastIndexOf('\n' + S0 + (A.fn.async ? 'async ' : '') + 'function ' + cfg.funcion + '(') + 1;
  if (iFn < 1) fallar('no encontré el renglón de function ' + cfg.funcion);
  const REGISTRO = S0 + '// ' + cfg.pantalla + ' en partes (' + cfg.fase + '): ' + cfg.funcion + ' es el arranque y la lista; ' +
    ORDEN.join(', ') + '\n' + S0 + '// viven en ' + cfg.archivo + '-<parte>.html y se registran aquí (componentes/partes.html).\n' +
    S0 + 'const ' + cfg.registro + " = Partes.crear('" + cfg.pantalla + "');\n\n";
  const principalJs = antesFn.slice(0, iFn) + REGISTRO + antesFn.slice(iFn) + cuerpoP + colaFn;
  salida[cfg.archivo] = '<script>' + principalJs + '</script>\n';

  // ---- Revisiones ----
  trozos.forEach((t) => {
    if (escritos.get(t) !== 1) fallar('la sentencia ' + (nombresDe(t.st).join(',') || '«' + t.texto.trim().slice(0, 40) + '»') + ' quedó ' + (escritos.get(t) || 0) + ' veces');
  });
  if (reescritos !== reescribir.length) fallar('se reescribieron ' + reescritos + ' de ' + reescribir.length);
  const globales = (texto) => {
    const j = texto.slice(texto.indexOf('<script>') + 8, texto.lastIndexOf('</script>'));
    let ast;
    try { ast = acorn.parse(j, { ecmaVersion: 2022, ranges: true }); } catch (e) { fallar('no compila: ' + e.message); }
    const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
    return { sinResolver: new Set(sm.globalScope.through.map((r) => r.identifier.name)), declara: new Set(sm.globalScope.variables.map((v) => v.name)) };
  };
  const antes = globales(crudo.replace(/\r\n/g, '\n')).sinResolver;
  const base = globales(salida[cfg.archivo]);
  const malos = [];
  Object.entries(salida).forEach(([a, txt]) => globales(txt).sinResolver.forEach((g) => {
    if (antes.has(g) || g === 'Partes') return;
    if (a !== cfg.archivo && base.declara.has(g)) return;   // lo del primer nivel del archivo de la pantalla
    malos.push(a + ': ' + g);
  }));
  if (malos.length) fallar('nombres sin resolver que antes sí: ' + malos.join(', '));

  // ---- Index.html: las partes justo después de la pantalla ----
  const index = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');
  const inc = "  <?!= include('html/js/" + cfg.archivo + "'); ?>\n";
  if (!index.includes(inc)) fallar('Index.html no incluye ' + cfg.archivo);
  const incPartes = ORDEN.map((p) => "  <?!= include('html/js/" + cfg.archivo + '-' + p + "'); ?>\n").join('');
  const indexNuevo = index.includes(incPartes) ? index : index.replace(inc, inc + incPartes);

  // ---- Resumen y escritura ----
  console.log('partes: ' + ORDEN.join(', '));
  console.log('let compartidos (T.x): ' + (compartidos.map((n) => n + '→' + dueñaDe[n]).join(', ') || '—') + ' (' + reescritos + ' reescrituras)');
  console.log('en T al montar: ' + enT.join(', '));
  console.log('perezosos (principal): ' + (perezosos.join(', ') || '—'));
  console.log('se monta antes de: ' + trozoMontar.texto.trim().slice(0, 70));
  Object.entries(salida).forEach(([a, txt]) => console.log('  ' + (a + '.html').padEnd(36) + String(txt.split('\n').length).padStart(6) + ' líneas' +
    (publica[a.replace(cfg.archivo + '-', '')] ? '  · publica ' + publica[a.replace(cfg.archivo + '-', '')].size : '')));
  if (cfg.soloRevisar) { console.log('(--revisar: no escribí nada)'); return; }
  Object.entries(salida).forEach(([a, txt]) => fs.writeFileSync(path.join(JS, a + '.html'), txt.replace(/\n/g, EOL)));
  fs.writeFileSync(INDEX, indexNuevo.replace(/\n/g, EOL));
  console.log('Escrito.');
}

module.exports = { partir, analizar };
