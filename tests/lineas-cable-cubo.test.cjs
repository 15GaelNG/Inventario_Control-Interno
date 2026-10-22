// Usuario, 22-oct: «en accesorios que se homologue cable y cubo, eliminar CARGADOR. O sea que los registros anteriores si
// tienen "cargador" se separe como cable y cubo, eliminamos ese accesorio». CARGADOR ya no se ofrece; lo que llega con él
// se guarda como CABLE y CUBO, y tools/lineas-datos/cable-cubo.js corrige lo que ya estaba en el libro.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const U = new Function(read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')();

test('sinCargador: CABLE y CUBO en su lugar, sin repetir y con el mismo separador; sin CARGADOR, igual', () => {
  assert.equal(U.sinCargador('CARGADOR'), 'CABLE , CUBO');
  assert.equal(U.sinCargador('CARGADOR , MICA'), 'CABLE , CUBO , MICA');
  assert.equal(U.sinCargador('CAJA, CARGADOR, FUNDA'), 'CAJA, CABLE, CUBO, FUNDA');
  assert.equal(U.sinCargador('CAJA,cargador'), 'CAJA,CABLE,CUBO');
  assert.equal(U.sinCargador('CUBO, CARGADOR, MICA'), 'CUBO, CABLE, MICA');
  assert.equal(U.sinCargador('CARGADOR, CABLE'), 'CABLE, CUBO');
  assert.equal(U.sinCargador('CAJA, CABLE'), 'CAJA, CABLE');
  assert.equal(U.sinCargador(''), '');
  assert.equal(U.sinCargador(null), null);
});

test('cable-cubo.js: solo cambia lo que trae CARGADOR, con la regla de la app', () => {
  const { accesoriosSinCargador } = require('../tools/lineas-datos/cable-cubo.js');
  assert.equal(accesoriosSinCargador('CAJA, CARGADOR'), 'CAJA, CABLE, CUBO');
  assert.equal(accesoriosSinCargador('CAJA, CABLE, CUBO'), null);
  assert.equal(accesoriosSinCargador(''), null);
});

test('CARGADOR ya no es opción en ninguna lista de accesorios', () => {
  assert.match(read('src/services/lineas/LineasRepo.gs'), /accesorios: \['CAJA', 'CABLE', 'CUBO', 'FUNDA', 'MICA', 'TARJETA SD', 'NINGUNO'\],/);
  assert.match(read('src/services/lineas/LineasRegistros.gs'), /const ACCESORIOS = \['CAJA', 'CABLE', 'CUBO', 'FUNDA', 'MICA', 'TARJETA SD', 'NINGUNO'\];/);
  // La responsiva y Corregir equipo muestran CABLE y CUBO en lugar del CARGADOR de antes
  assert.match(read('src/services/lineas/LineasCaptura.gs'), /const accesorios = String\(LineasUtil\.sinCargador\(acceso\('ACCESORIOS'\)\) \|\| ''\)/);
  // La ficha también
  assert.match(read('src/services/lineas/LineasRepo.gs'), /accesorios: \(txt\(LineasUtil\.sinCargador\(col\(f, 'ACCESORIOS'\)\)\) \|\| ''\)/);
});
