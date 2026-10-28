// El DEV de Emmanuel (5-oct) lee la copia de producción. El interruptor de las hojas nuevas (LINEAS_LECTURA) ya no se lee
// desde el 21-oct (7.13); el retiro de LINEAS TELEFONICAS sí, en Diagnostico.gs (en producción, Script Properties).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Líneas ya no tiene interruptor de lectura ni lee la hoja vieja (7.13)', () => {
  const lectura = read('src/services/lineas/LineasLectura.gs');
  assert.doesNotMatch(lectura, /LINEAS_LECTURA'|LINEAS_HOJA_VIEJA_RETIRADA'|function activo\(|function retirada\(|function vieja_\(/);
});

test('el DEV de Emmanuel: copia de producción, hojas nuevas y Drive de pruebas (nunca NUCOS de producción)', () => {
  const entornos = read('src/config/Entornos.gs');
  const dev = entornos.slice(entornos.indexOf("'1rpvvay1hBTFfm5paVyvy6-Thmx-CQ6uUWVef20Jr8VmHQxkCWZ7UmeOa'"));
  assert.ok(dev.length > 100, 'falta el bloque del DEV');
  assert.match(dev, /LINEAS_LECTURA: 'ESTRUCTURA',/);
  assert.match(dev, /LINEAS_HOJA_VIEJA_RETIRADA: '\d{4}-\d{2}-\d{2}T/);
  assert.match(dev, /SS_ID_TELEFONIA: '1L177getuQ0RSGXbVsLZEgc9Fn5d2QySDlwjvUuqu_0E'/);
  assert.doesNotMatch(dev, /17YrtuMYjGGg5LZm1BxMNrEZyCxTMI2DiUHSVUIldUlc|12SRBi1nZlIzfNx0d2y1fAtzOydA2QrT-/);
});
