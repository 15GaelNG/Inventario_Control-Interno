// El DEV de Emmanuel (5-oct) lee la copia de producción: Líneas toma el interruptor de las hojas nuevas y el retiro de
// LINEAS TELEFONICAS de Entornos.gs (en producción siguen en Script Properties).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('LineasLectura lee LINEAS_LECTURA y LINEAS_HOJA_VIEJA_RETIRADA con leerConfig_ (Entornos.gs o Script Property)', () => {
  const lectura = read('src/services/lineas/LineasLectura.gs');
  assert.match(lectura, /const config_ = \(clave\) => \(typeof leerConfig_ === 'function' \? leerConfig_\(clave\) : PropertiesService\.getScriptProperties\(\)\.getProperty\(clave\)\);/);
  assert.match(lectura, /activo_ = config_\(PROPIEDAD\) === VALOR_NUEVO;/);
  assert.match(lectura, /const v = config_\(PROPIEDAD_RETIRADA\);/);
});

test('el DEV de Emmanuel: copia de producción, hojas nuevas y Drive de pruebas (nunca NUCOS de producción)', () => {
  const entornos = read('src/config/Entornos.gs');
  const dev = entornos.slice(entornos.indexOf("'1rpvvay1hBTFfm5paVyvy6-Thmx-CQ6uUWVef20Jr8VmHQxkCWZ7UmeOa'"));
  assert.ok(dev.length > 100, 'falta el bloque del DEV');
  assert.match(dev, /LINEAS_LECTURA: 'ESTRUCTURA',/);
  assert.match(dev, /LINEAS_HOJA_VIEJA_RETIRADA: '\d{4}-\d{2}-\d{2}T/);
  assert.match(dev, /SS_ID_TELEFONIA: '1RgtHxKZgo6PFYY1e6ic9coqjBUaNhRlk2X8_Raz6HNQ'/);
  assert.doesNotMatch(dev, /17YrtuMYjGGg5LZm1BxMNrEZyCxTMI2DiUHSVUIldUlc|12SRBi1nZlIzfNx0d2y1fAtzOydA2QrT-/);
});
