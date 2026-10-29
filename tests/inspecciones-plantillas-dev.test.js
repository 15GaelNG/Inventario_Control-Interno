/**
 * La columna N/A en las copias de las plantillas de inspección (src/InspeccionesPlantillasDev.gs), contra un Docs de
 * mentira: tablas de sección dentro de una tabla de acomodo, como la plantilla real de AUTOS.
 *
 * El Docs de mentira es el compartido (tests/docs-simulado.js).
 *
 * Correr: node tests/inspecciones-plantillas-dev.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const D = require('./docs-simulado');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

const { celda, tabla, DocumentApp } = D;
const marca = (pieza, op) => '<<IF([' + pieza + '] ="' + op + '", "✓", "")>>';
const seccion = (titulo, piezas, ops, conNA, anchos) => tabla(
  [[titulo].concat(ops).concat(conNA ? ['N/A'] : [])].concat(piezas.map((p) =>
    [p].concat(ops.concat(conNA ? ['N/A'] : []).map((o) => marca(p.toUpperCase(), o.toUpperCase()))))),
  anchos);

function armar(cuerpo, opciones) {
  const o = opciones || {};
  const doc = {
    nombre: o.nombre || 'Copia de FORMATO AUTOS (DEV)', guardado: 0,
    getName: () => doc.nombre,
    getBody: () => ({ getNumChildren: () => cuerpo.length, getChild: (i) => cuerpo[i] }),
    saveAndClose: () => { doc.guardado++; },
  };
  const props = { INSPECCIONES_PLANTILLAS_ORIGINALES: JSON.stringify({ AUTOS: 'ORIG' }) };
  const ctx = vm.createContext({
    soloEditor_: () => {},
    Config: { ENTORNO: o.entorno || 'DEV', SPREADSHEET_IDS: { VEHICULOS: () => 'SS' } },
    SheetUtils: {
      getAll: () => [{ TIPO: 'AUTOS', PLANTILLA: o.plantilla || 'COPIA' }],
      normalizarEncabezado_: (s) => String(s).trim().toUpperCase(),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null }) },
    CacheService: { getScriptCache: () => ({ removeAll: () => {} }) },
    DocumentApp: Object.assign({}, DocumentApp, { openById: () => doc }),
    Logger: { log: () => {} },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'InspeccionesPlantillasDev.gs'), 'utf8'), ctx);
  return { ctx, doc };
}

const textos = (t) => t.filas.map((r) => r.celdas.map((c) => c.getText()));

console.log('1. Agrega N/A a la sección que no lo trae, con el total de ancho igual');
{
  const cristal = seccion('Cristalería 10%', ['Parabrisas', 'Medallon'], ['Bueno', 'Regular', 'Malo'], false, [100, 25, 25, 25]);
  const inventario = seccion('Inventarios 10%', ['Gato'], ['Bueno', 'Regular', 'Malo'], true, [90, 20, 20, 20, 20]);
  const datos = tabla([['Fecha:', '<<[FECHA]>>']], [50, 100]);
  const acomodo = tabla([[celda('', [datos, cristal]), celda(''), celda('', [inventario])]]);
  const { ctx, doc } = armar([acomodo]);
  const ensayo = ctx.inspeccionesNA1Ensayo();
  ok(textos(cristal)[0].length === 4 && doc.guardado === 0, 'el ensayo no cambia nada');
  ok(/1 secciones sin N\/A \(2 piezas\) · 1 ya lo traían/.test(ensayo), 'el ensayo cuenta lo que haría y lo que ya estaba');
  ctx.inspeccionesNA2EscribirAutos();
  const t = textos(cristal);
  ok(t[0][4] === 'N/A', 'encabezado: "Malo" → "N/A" (en la copia de la celda)');
  ok(t[1][4] === marca('PARABRISAS', 'N/A') && t[2][4] === marca('MEDALLON', 'N/A'), 'cada pieza con su fórmula de N/A, igual a las otras');
  ok(t[1][3] === marca('PARABRISAS', 'MALO'), 'la opción de antes no se toca');
  const necesita = (texto) => ctx.inspDevAnchoTexto_(texto) + 10.5;
  ok(cristal.anchos.length === 5 && ['Bueno', 'Regular', 'Malo', 'N/A'].every((e, i) => cristal.anchos[i + 1] >= necesita(e) - 0.05),
    'ninguna opción más angosta que su encabezado (con el relleno): no se parte un «Bueno»');
  ok(cristal.anchos[0] >= ctx.inspDevAnchoTexto_('Parabrisas', true) + 10.5 && cristal.anchos[0] < 100,
    'el nombre cede lo que hace falta, sin bajar de lo que mide su pieza más larga (en letra normal)');
  ok(Math.abs(cristal.anchos.reduce((a, b) => a + b, 0) - 175) < 0.3, 'el ancho total no cambia');
  ok(textos(inventario)[0].length === 5 && textos(datos)[0].length === 2, 'la que ya traía N/A y la de datos, igual');
  ok(doc.guardado === 1, 'se guarda el documento');
  ok(/0 secciones con N\/A nuevo \(0 piezas\) · 2 ya lo traían/.test(ctx.inspeccionesNA3EscribirTodas()), 'correrla otra vez no agrega otra columna');
}

console.log('2. Los anchos: lo que mide cada texto (Arial negrita 6.5 pt, como sale el PDF)');
{
  const x0 = armar([]);
  const mide = (t) => Math.round(x0.ctx.inspDevAnchoTexto_(t) * 10) / 10;
  ok(mide('Bueno') === 20.2 && mide('Regular') === 24.2, 'las medidas: «Bueno» 20.2 pt y «Regular» 24.2 pt (con 10 de relleno: se partía en 27, cabía en 35)');

  const holgada = seccion('Cristalería 10%', ['Parabrisas'], ['Bueno', 'Regular', 'Malo'], false, [140, 46, 46, 48]);
  const x = armar([holgada]);
  x.ctx.inspeccionesNA2EscribirAutos();
  ok(holgada.anchos[0] === 140 && holgada.anchos.slice(1).every((w) => w === 35), 'con espacio de sobra: el nombre igual y las opciones parejas (4 × 35)');

  const angosta = seccion('Niveles 10%', ['Aceite'], ['Bueno', 'Regular', 'Malo'], false, [40, 30, 30, 30]);
  const { ctx } = armar([angosta]);
  const ensayo = ctx.inspeccionesNA1Ensayo();
  ctx.inspeccionesNA2EscribirAutos();
  ok(Math.abs(angosta.anchos.reduce((p, q) => p + q, 0) - 130) < 0.3, 'si no cabe, el total igual');
  ok(/NO CABE/.test(ensayo), 'y el ensayo lo dice (para hacerla a mano)');
}

console.log('2c. Una sección que se sale de su columna de la página se acomoda dentro');
{
  // Como "Sistemas interiores" en la página 2: 280 pt en una columna de 258 (el PDF le cortaba la N/A)
  const ancha = seccion('Sistemas interiores 10%', ['Luces altas', 'Mandos/botonera de vidrios y seguros'], ['Bueno', 'Regular', 'Malo'], true, [140, 35, 38.9, 35.4, 30.7]);
  ancha._contenedor = 258.1;
  const cabe = seccion('Inventarios 10%', ['Gato'], ['Bueno', 'Regular', 'Malo'], true, [140, 35, 38, 35.5, 31.5]);
  cabe._contenedor = 280;
  const { ctx } = armar([ancha, cabe]);
  const ensayo = ctx.inspeccionesNA1Ensayo();
  ok(/1 se salían de su columna/.test(ensayo) && /"Sistemas interiores 10%" \(ya traía N\/A; se salía de su columna\)/.test(ensayo), 'el ensayo la reporta');
  ctx.inspeccionesNA2EscribirAutos();
  const a = ancha.anchos;
  ok(a.reduce((p, q) => p + q, 0) <= 258.1 + 0.3, 'ya cabe en su columna (' + Math.round(a.reduce((p, q) => p + q, 0) * 10) / 10 + ' pt)');
  ok(['Bueno', 'Regular', 'Malo', 'N/A'].every((e, i) => a[i + 1] >= ctx.inspDevAnchoTexto_(e) + 10.5 - 0.05) &&
    a[0] >= ctx.inspDevAnchoTexto_('Mandos/botonera de vidrios y seguros', true) + 10.5 - 0.05, 'sin partir encabezados ni el nombre más largo');
  ok(cabe.anchos.join(',') === '140,35,38,35.5,31.5', 'la que sí cabe no se toca');
}

console.log('2b. Un tipo con los mismos anchos que otro no los repite en el reporte');
{
  const doc = { nombre: 'Copia de FORMATO AUTOS (DEV)', getName: () => doc.nombre, saveAndClose: () => {},
    getBody: () => { const t = seccion('Cristalería 10%', ['Parabrisas'], ['Bueno', 'Regular', 'Malo'], false, [140, 46, 46, 48]);
      return { getNumChildren: () => 1, getChild: () => t }; } };
  const ctx = vm.createContext({
    soloEditor_: () => {}, Logger: { log: () => {} },
    Config: { ENTORNO: 'DEV', SPREADSHEET_IDS: { VEHICULOS: () => 'SS' } },
    SheetUtils: { getAll: () => [{ TIPO: 'KWID', PLANTILLA: 'C1' }, { TIPO: 'AUTOS', PLANTILLA: 'C2' }],
      normalizarEncabezado_: (s) => String(s).trim().toUpperCase() },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => JSON.stringify({ KWID: 'O1', AUTOS: 'O2' }) }) },
    CacheService: { getScriptCache: () => ({ removeAll: () => {} }) },
    DocumentApp: Object.assign({}, DocumentApp, { openById: () => doc }),
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'InspeccionesPlantillasDev.gs'), 'utf8'), ctx);
  const r = ctx.inspeccionesNA1Ensayo();
  ok((r.match(/"Cristalería 10%"/g) || []).length === 1 && /anchos: igual que KWID/.test(r), 'AUTOS dice "igual que KWID"');
}

console.log('3. Lo raro no se toca y sale en el reporte');
{
  const dispareja = tabla([['Batería 5%', 'Si', 'No'], ['Sarro', marca('SARRO', 'SI')], ['Inflada', marca('INFLADA', 'SI'), marca('INFLADA', 'NO')]], [60, 20, 20]);
  const { ctx } = armar([dispareja]);
  const r = ctx.inspeccionesNA3EscribirTodas();
  ok(/SALTADA "Batería 5%": renglones con distinto número de celdas/.test(r) && textos(dispareja)[2].length === 3, 'renglones disparejos: saltada');
  const sinAnchos = seccion('Interiores 5%', ['Tablero'], ['Bueno', 'Regular', 'Malo'], false, null);
  const x = armar([sinAnchos]);
  ok(/anchos automáticos/.test(x.ctx.inspeccionesNA1Ensayo()), 'sin anchos fijos lo avisa');
}

console.log('4. Nunca toca un documento que no sea su copia del DEV');
{
  const s = () => seccion('Cristalería 10%', ['Parabrisas'], ['Bueno', 'Regular', 'Malo'], false, [100, 25, 25, 25]);
  const original = s();
  const a = armar([original], { plantilla: 'ORIG' });
  ok(/no usa una copia del DEV/.test(a.ctx.inspeccionesNA3EscribirTodas()) && textos(original)[0].length === 4, 'el ID original: no se toca');
  const sinNombre = s();
  const b = armar([sinNombre], { nombre: 'Copia de FORMATO AUTOS' });
  ok(/no es una copia "\(DEV\)"/.test(b.ctx.inspeccionesNA3EscribirTodas()) && textos(sinNombre)[0].length === 4, 'sin "(DEV)" en el nombre: no se toca');
  const prod = armar([s()], { entorno: 'PROD' });
  let tronó = false;
  try { prod.ctx.inspeccionesNA1Ensayo(); } catch (e) { tronó = /solo para un DEV/.test(e.message); }
  ok(tronó, 'en producción no corre');
}

if (fallas) { console.error('\n' + fallas + ' FALLA(S)'); process.exit(1); }
console.log('\nTODO OK');
