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
  ok(cristal.anchos.length === 5 && cristal.anchos.slice(1).every((w) => w === 20),
    'las opciones se reparten parejo, sin bajar de lo que miden en la sección que ya trae N/A (20)');
  ok(cristal.anchos[0] === 95, 'al nombre solo se le quita lo que faltó (5)');
  ok(cristal.anchos.reduce((a, b) => a + b, 0) === 175, 'el ancho total no cambia');
  ok(/opciones miden desde 20 pt/.test(ensayo), 'el ensayo dice cuánto miden las opciones de las secciones con N/A');
  ok(textos(inventario)[0].length === 5 && textos(datos)[0].length === 2, 'la que ya traía N/A y la de datos, igual');
  ok(doc.guardado === 1, 'se guarda el documento');
  ok(/0 secciones con N\/A nuevo \(0 piezas\) · 2 ya lo traían/.test(ctx.inspeccionesNA3EscribirTodas()), 'correrla otra vez no agrega otra columna');
}

console.log('2. Los anchos: primero las opciones, el nombre solo si hace falta');
{
  const holgada = seccion('Cristalería 10%', ['Parabrisas'], ['Bueno', 'Regular', 'Malo'], false, [140, 46, 46, 48]);
  const conNA = seccion('Inventarios 10%', ['Gato'], ['Bueno', 'Regular', 'Malo'], true, [100, 30, 30, 30, 30]);
  const x = armar([holgada, conNA]);
  x.ctx.inspeccionesNA2EscribirAutos();
  ok(holgada.anchos[0] === 140 && holgada.anchos.slice(1).every((w) => w === 35), 'opciones holgadas: el nombre no se toca (4 × 35)');

  const angosta = seccion('Niveles 10%', ['Aceite'], ['Bueno', 'Regular', 'Malo'], false, [40, 30, 30, 30]);
  const { ctx } = armar([angosta]);
  const ensayo = ctx.inspeccionesNA1Ensayo();
  ctx.inspeccionesNA2EscribirAutos();
  const a = angosta.anchos;
  ok(a[0] === 24, 'sin sección con N/A de referencia, el mínimo es la opción de hoy; el nombre baja solo hasta el 60%');
  ok(Math.abs(a.reduce((p, q) => p + q, 0) - 130) < 0.5 && a.slice(1).every((w) => w === a[1]), 'las opciones, parejas, y el total igual');
  ok(/OPCIONES MÁS ANGOSTAS QUE 30 pt/.test(ensayo), 'si quedan bajo el mínimo, el ensayo lo avisa');
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
