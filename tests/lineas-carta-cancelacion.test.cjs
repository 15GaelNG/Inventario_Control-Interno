const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// LineasCartaCancelacion.gs: la columna CARTA DE CANCELACION de LINEAS (SI / NO) a partir de un libro con los números de
// las cartas. Hoja LINEAS en memoria; la columna nueva y su escritura se simulan como SheetUtils.
const fuente = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasCartaCancelacion.gs'), 'utf8');

function cargar(numeros, opciones) {
  const o = opciones || {};
  const encabezados = ['ID', 'NUMERO TELEFONO', 'ESTATUS LINEA'].concat(o.conColumna ? ['CARTA DE CANCELACION'] : []);
  const lineas = o.lineas || [
    { _fila: 2, 'ID': 'LIN-1', 'NUMERO TELEFONO': '4421090805', 'ESTATUS LINEA': 'CANCELADA' },
    { _fila: 3, 'ID': 'LIN-2', 'NUMERO TELEFONO': 4422000000, 'ESTATUS LINEA': 'USO' },
    { _fila: 5, 'ID': 'LIN-3', 'NUMERO TELEFONO': '+52 442 111 2233', 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION' },
    { _fila: 6, 'ID': 'D-009', 'NUMERO TELEFONO': 'D-009', 'ESTATUS LINEA': 'USO' },
  ];
  const escrito = { columnas: [], valores: null, desde: null };
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
      escrito.valores = valores; escrito.desde = desde;
    },
  };
  const tabla = [['CARTA', 'FECHA', 'NUMERO']].concat(numeros.map((n) => ['Carta AT&T', '2026-07-30', n]));
  const hoja = {
    getLastColumn: () => 3,
    getRange: () => ({ getDisplayValues: () => [tabla[0]] }),
    getDataRange: () => ({ getDisplayValues: () => tabla }),
  };
  const SpreadsheetApp = { openById: () => ({ getName: () => 'Cartas', getSheets: () => [hoja] }) };
  const registros = [];
  const propiedades = Object.assign({}, o.propiedades || {});
  const PropertiesService = { getScriptProperties: () => ({
    getProperty: (k) => (k in propiedades ? propiedades[k] : null), deleteProperty: (k) => { delete propiedades[k]; } }) };
  const m = new Function('LineasDatos', 'SheetUtils', 'SpreadsheetApp', 'Config', 'Logger', 'PropertiesService', 'soloEditor_',
    fuente + '; return { lineasCartaRevisar, lineasCartaAplicar };')(
    LineasDatos, SheetUtils, SpreadsheetApp, { ENTORNO: o.entorno || 'DEV' }, { log: (t) => registros.push(t) }, PropertiesService, () => {});
  return { m, escrito, propiedades, log: () => registros.join('\n') };
}

test('revisar no escribe y cuenta SI / NO por los últimos 10 dígitos', () => {
  const x = cargar(['4421090805', '524421112233', '4429999999']);
  const r = x.m.lineasCartaRevisar('LIBRO');
  assert.match(r, /^REVISIÓN/);
  assert.match(r, /3 números en las cartas · LINEAS: 4 registros → 2 SI · 2 NO · 4 cambiarían/);
  assert.strictEqual(x.escrito.valores, null);
  assert.deepStrictEqual(x.escrito.columnas, []);
  assert.match(x.log(), /no están en LINEAS \(1\): 4429999999/);
});

test('aplicar crea la columna y la escribe completa desde el renglón 2 (un renglón vacío queda vacío)', () => {
  const x = cargar(['4421090805', '4421112233']);
  const r = x.m.lineasCartaAplicar('LIBRO');
  assert.match(r, /^APLICADO/);
  assert.deepStrictEqual(x.escrito.columnas, ['CARTA DE CANCELACION']);
  assert.strictEqual(x.escrito.desde, 2);
  // filas 2, 3, 4 (vacía), 5, 6
  assert.deepStrictEqual(x.escrito.valores, ['SI', 'NO', '', 'SI', 'NO']);
});

test('con carta y hoy activa: sale en el registro para revisarla', () => {
  const x = cargar(['4422000000']);
  x.m.lineasCartaRevisar('LIBRO');
  assert.match(x.log(), /Con carta y hoy no están cancelados ni en proceso \(1\): 4422000000 \(USO\)/);
});

test('se puede correr de nuevo: si nada cambia no escribe', () => {
  const lineas = [
    { _fila: 2, 'NUMERO TELEFONO': '4421090805', 'ESTATUS LINEA': 'CANCELADA', 'CARTA DE CANCELACION': 'SI' },
    { _fila: 3, 'NUMERO TELEFONO': '4422000000', 'ESTATUS LINEA': 'USO', 'CARTA DE CANCELACION': 'NO' },
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
