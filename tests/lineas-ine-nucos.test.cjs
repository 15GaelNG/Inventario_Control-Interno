// Pendiente 2.28, etapa A (usuario, 9-oct): inventario de las INE que ya están en NUCOS. Solo lee NUCOS de producción y
// escribe en el libro del DEV.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const fuente = fs.readFileSync(path.join(__dirname, '..', 'src/services/lineas/LineasIneNucos.gs'), 'utf8').replace(/\r/g, '');

function cargar() {
  const ctx = vm.createContext({});
  vm.runInContext(fuente + '\nthis.f = { ineNucosPorNombre_, ineNucosSeOmite_ };', ctx);
  return ctx.f;
}

test('el nombre del archivo sugiere el tipo: INE, IFE, licencia…; no confunde palabras que lo contienen', () => {
  const { ineNucosPorNombre_ } = cargar();
  assert.equal(ineNucosPorNombre_('INE JUAN PEREZ.jpg'), 'INE');
  assert.equal(ineNucosPorNombre_('ine_frente.png'), 'INE');
  assert.equal(ineNucosPorNombre_('Identificación oficial.pdf'), 'IDENTIFICACION');
  assert.equal(ineNucosPorNombre_('LICENCIA 2024.pdf'), 'LICENCIA');
  assert.equal(ineNucosPorNombre_('LINEA 4421090805.pdf'), '');
  assert.equal(ineNucosPorNombre_('IMG_20250101.jpg'), '');
});

test('se omiten los PDF de inspección y responsiva, las firmas, los patrones y los videos', () => {
  const { ineNucosSeOmite_ } = cargar();
  assert.equal(ineNucosSeOmite_({ name: 'INSP 0012 05 10.pdf', mimeType: 'application/pdf' }), true);
  assert.equal(ineNucosSeOmite_({ name: 'RESP 0012 05 10.pdf', mimeType: 'application/pdf' }), true);
  assert.equal(ineNucosSeOmite_({ name: 'FIRMA RESPONSABLE.png', mimeType: 'image/png' }), true);
  assert.equal(ineNucosSeOmite_({ name: 'VID_1.mp4', mimeType: 'video/mp4' }), true);
  assert.equal(ineNucosSeOmite_({ name: 'INE - JUAN PEREZ.pdf', mimeType: 'application/pdf' }), false);
  assert.equal(ineNucosSeOmite_({ name: 'IMG_1.jpg', mimeType: 'image/jpeg' }), false, 'una foto cualquiera puede ser una INE');
});

test('solo lee NUCOS: nada de crear, mover, renombrar ni borrar en Drive; solo corre en un DEV y desde el editor', () => {
  assert.doesNotMatch(fuente, /createFile|setTrashed|setName|moveTo|addFile|removeFile|Drive\.Files\.(update|create|copy|remove|delete)|makeCopy/);
  assert.match(fuente, /if \(Config\.ENTORNO !== 'DEV'\) throw/);
  assert.match(fuente, /function lineasIneNucos_inventario\(\) \{\n  soloEditor_\(\);\n  ineNucosExigirDev_\(\);/);
  assert.match(fuente, /"'" \+ LINEAS_DRIVE_NUCOS_ID \+ "' in parents/, 'NUCOS de producción, la de LineasAdmin');
  assert.match(fuente, /SpreadsheetApp\.openById\(Config\.SPREADSHEET_IDS\.TELEFONIA\(\)\)/, 'escribe en el libro del proyecto (el del DEV)');
});
