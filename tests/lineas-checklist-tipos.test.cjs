// Los tipos básicos (EQUIPO + SIM BASICO, LINEA BASICA; 4-oct) no existían en el AppSheet: la inspección del NUCO 0726
// solo mostraba unos cuantos puntos porque las reglas preguntaban por "EQUIPO + SIM" y "LINEA" exactos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const ctx = {};
vm.runInNewContext(read('src/services/lineas/LineasChecklist.gs') + '\nthis.LineasChecklist = LineasChecklist;', ctx);
const { cumple, puntos } = ctx.LineasChecklist;
const visibles = (tipo) => puntos().filter((p) => cumple(p.mostrar, tipo)).map((p) => p.columna).join('|');

test('EQUIPO + SIM BASICO muestra los mismos puntos que EQUIPO + SIM', () => {
  assert.equal(visibles('EQUIPO + SIM BASICO'), visibles('EQUIPO + SIM'));
  assert.ok(cumple('EQUIPOS', 'equipo + sim basico'));
});

test('LINEA BASICA muestra los mismos puntos que LINEA', () => {
  assert.equal(visibles('LINEA BASICA'), visibles('LINEA'));
  assert.ok(!cumple('NO_LINEA', 'LINEA BASICA'));
});

test('el formulario en el navegador usa la misma equivalencia', () => {
  assert.match(read('src/html/js/lineas.html'), /CONDICIONES_APPSHEET\[cond\]\(t\.replace\(\/ BASIC\[OA\]\$\/, ''\)\)/);
});
