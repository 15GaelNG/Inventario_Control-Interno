const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// LineasCartaCancelacion.gs: la columna CARTA DE CANCELACION de LINEAS (SI / NO) a partir de un libro con los números de
// las cartas. Hoja LINEAS en memoria; la columna nueva y su escritura se simulan como SheetUtils.
const fuente = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasCartaCancelacion.gs'), 'utf8');

function cargar(numeros, opciones) {
  const o = opciones || {};
  const encabezados = ['ID', 'NUMERO TELEFONO', 'ESTATUS LINEA'].concat(o.conColumna ? ['CARTA DE CANCELACION', 'LINK CARTA DE CANCELACION'] : []);
  const lineas = o.lineas || [
    { _fila: 2, 'ID': 'LIN-1', 'NUMERO TELEFONO': '4421090805', 'ESTATUS LINEA': 'CANCELADA' },
    { _fila: 3, 'ID': 'LIN-2', 'NUMERO TELEFONO': 4422000000, 'ESTATUS LINEA': 'USO' },
    { _fila: 5, 'ID': 'LIN-3', 'NUMERO TELEFONO': '+52 442 111 2233', 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION' },
    { _fila: 6, 'ID': 'D-009', 'NUMERO TELEFONO': 'D-009', 'ESTATUS LINEA': 'USO' },
  ];
  const escrito = { columnas: [], valores: null, links: null, desde: null };
  const LineasDatos = {
    leerTabla: (n) => { assert.strictEqual(n, 'LINEAS'); return lineas.map((f) => Object.assign({}, f)); },
    asegurarColumnas: (n, cols) => { escrito.columnas.push(...cols); encabezados.push(...cols.filter((c) => encabezados.indexOf(c) < 0)); },
    paraEscribir: (n) => ({ nombre: n, encabezados: encabezados.slice() }),
    conCandado: (fn) => fn(),
    olvidarTabla: () => {},
  };
  const SheetUtils = {
    cambiarColumna: (t, columna, valores, desde) => {
      assert.ok(t.encabezados.indexOf(columna) >= 0, 'la columna ya existe al escribir');
      if (columna === 'CARTA DE CANCELACION') escrito.valores = valores; else escrito.links = valores;
      escrito.desde = desde;
    },
  };
  // cada número con el link de su carta; el mismo número en dos cartas trae dos links
  const tabla = [['CARTA', 'FECHA', 'NUMERO', 'LINK']].concat(numeros.map((n, i) => ['Carta ' + i, '2026-07-30', n, 'https://drive/' + n.slice(-4)]))
    .concat((o.repetidos || []).map((n) => ['Otra carta', '2026-10-21', n, 'https://drive/otra']));
  const hoja = {
    getLastColumn: () => 4,
    getRange: () => ({ getDisplayValues: () => [tabla[0]] }),
    getDataRange: () => ({ getDisplayValues: () => tabla }),
  };
  const SpreadsheetApp = { openById: () => ({ getName: () => 'Cartas', getSheets: () => [hoja] }) };
  const registros = [];
  const propiedades = Object.assign({}, o.propiedades || {});
  const PropertiesService = { getScriptProperties: () => ({
    getProperty: (k) => (k in propiedades ? propiedades[k] : null), deleteProperty: (k) => { delete propiedades[k]; } }) };
  const leerConfig_ = (k) => (k in propiedades ? propiedades[k] : null);
  const m = new Function('LineasDatos', 'SheetUtils', 'SpreadsheetApp', 'Config', 'Logger', 'PropertiesService', 'leerConfig_', 'soloEditor_',
    fuente + '; return { lineasCartaRevisar, lineasCartaAplicar };')(
    LineasDatos, SheetUtils, SpreadsheetApp, { ENTORNO: o.entorno || 'DEV' }, { log: (t) => registros.push(t) }, PropertiesService, leerConfig_, () => {});
  return { m, escrito, propiedades, log: () => registros.join('\n') };
}

test('revisar no escribe y cuenta SI / NO por los últimos 10 dígitos', () => {
  const x = cargar(['4421090805', '524421112233', '4429999999']);
  const r = x.m.lineasCartaRevisar('LIBRO');
  assert.match(r, /^REVISIÓN/);
  assert.match(r, /3 números en las cartas · LINEAS: 4 registros → 2 SI \(2 con link\) · 2 NO · 4 cambiarían/);
  assert.strictEqual(x.escrito.valores, null);
  assert.strictEqual(x.escrito.links, null);
  assert.deepStrictEqual(x.escrito.columnas, []);
  assert.match(x.log(), /no están en LINEAS \(1\): 4429999999/);
});

test('aplicar crea las dos columnas y las escribe completas desde el renglón 2 (un renglón vacío queda vacío)', () => {
  const x = cargar(['4421090805', '4421112233'], { repetidos: ['4421090805'] });
  const r = x.m.lineasCartaAplicar('LIBRO');
  assert.match(r, /^APLICADO/);
  assert.deepStrictEqual(x.escrito.columnas, ['CARTA DE CANCELACION', 'LINK CARTA DE CANCELACION']);
  assert.strictEqual(x.escrito.desde, 2);
  // filas 2, 3, 4 (vacía), 5, 6
  assert.deepStrictEqual(x.escrito.valores, ['SI', 'NO', '', 'SI', 'NO']);
  // un link por carta (uno por renglón dentro de la celda); vacío en las NO
  assert.deepStrictEqual(x.escrito.links, ['https://drive/0805\nhttps://drive/otra', '', '', 'https://drive/2233', '']);
});

test('con carta y hoy activa: sale en el registro para revisarla', () => {
  const x = cargar(['4422000000']);
  x.m.lineasCartaRevisar('LIBRO');
  assert.match(x.log(), /Con carta y hoy no están cancelados ni en proceso \(1\): 4422000000 \(USO\)/);
});

test('se puede correr de nuevo: si nada cambia no escribe', () => {
  const lineas = [
    { _fila: 2, 'NUMERO TELEFONO': '4421090805', 'ESTATUS LINEA': 'CANCELADA', 'CARTA DE CANCELACION': 'SI', 'LINK CARTA DE CANCELACION': 'https://drive/0805' },
    { _fila: 3, 'NUMERO TELEFONO': '4422000000', 'ESTATUS LINEA': 'USO', 'CARTA DE CANCELACION': 'NO', 'LINK CARTA DE CANCELACION': '' },
  ];
  const x = cargar(['4421090805'], { lineas, conColumna: true });
  assert.match(x.m.lineasCartaAplicar('LIBRO'), /^SIN CAMBIOS .* 0 escritos/);
  assert.strictEqual(x.escrito.valores, null);
});

test('en producción pide la confirmación, también desde la propiedad (y la borra)', () => {
  assert.throws(() => cargar(['4421090805'], { entorno: 'PROD' }).m.lineasCartaAplicar('LIBRO'), /SI, EN PROD/);
  const x = cargar(['4421090805'], { entorno: 'PROD', propiedades: { LINEAS_CARTA_LIBRO: 'LIBRO', LINEAS_CARTA_CONFIRMACION: 'SI, EN PROD' } });
  assert.match(x.m.lineasCartaAplicar(), /^APLICADO/);
  assert.ok(!('LINEAS_CARTA_CONFIRMACION' in x.propiedades));
});

test('sin libro: error que dice qué propiedad poner', () => {
  assert.throws(() => cargar([]).m.lineasCartaRevisar(), /LINEAS_CARTA_LIBRO/);
});

test('si cambia solo el link (la carta se movió de lugar), también escribe', () => {
  const lineas = [{ _fila: 2, 'NUMERO TELEFONO': '4421090805', 'ESTATUS LINEA': 'CANCELADA', 'CARTA DE CANCELACION': 'SI', 'LINK CARTA DE CANCELACION': 'https://viejo' }];
  const x = cargar(['4421090805'], { lineas, conColumna: true });
  assert.match(x.m.lineasCartaAplicar('LIBRO'), /^APLICADO .* 1 escritos/);
  assert.deepStrictEqual(x.escrito.links, ['https://drive/0805']);
});
