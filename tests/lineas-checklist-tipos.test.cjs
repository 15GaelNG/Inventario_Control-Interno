// Los tipos básicos (EQUIPO + SIM BASICO y SIM BASICO, antes LINEA BASICA; 4-oct) no existían en el AppSheet: la inspección del NUCO 0726
// solo mostraba unos cuantos puntos porque las reglas preguntaban por "EQUIPO + SIM" y "LINEA" exactos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const LINEAS = require('./lineas-fuente');

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

test('SIM BASICO (antes LINEA BASICA, 12-oct) muestra los mismos puntos que LINEA', () => {
  assert.equal(visibles('SIM BASICO'), visibles('LINEA'));
  assert.ok(!cumple('NO_LINEA', 'SIM BASICO'));
  // Lo guardado con el nombre de antes sigue valiendo
  assert.equal(visibles('LINEA BASICA'), visibles('LINEA'));
});

test('el formulario en el navegador usa la misma equivalencia', () => {
  assert.match(LINEAS, /CONDICIONES_APPSHEET\[cond\]\(t === 'SIM BASICO' \|\| t === 'LINEA BASICA' \? 'LINEA' : t\.replace\(\/ BASIC\[OA\]\$\/, ''\)\)/);
});
