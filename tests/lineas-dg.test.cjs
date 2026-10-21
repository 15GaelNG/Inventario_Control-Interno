const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

// Pendiente 8.16 (usuario, 21-oct): Dirección General en una lista fija; etiqueta DG; solo ADMIN ve y modifica
const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')(
  { normCol: (c) => String(c).toUpperCase().trim() }, {});
const DG = new Function('LineasUtil', read('src/services/lineas/LineasDG.gs') + '; return LineasDG;')(LineasUtil);

test('DG: las 12 líneas y los NUCO 11001 a 11011, por número o por NUCO', () => {
  assert.equal(DG.NUMEROS.length, 12);
  assert.deepEqual([DG.NUCOS[0], DG.NUCOS[10]], ['11001', '11011']);
  assert.ok(DG.esRegistro(null, { numero: '442 279 8678' }));
  assert.ok(DG.esRegistro({ nuco: '11005' }, null));
  assert.ok(!DG.esRegistro({ nuco: '0012' }, { numero: '4421090805' }));
  assert.ok(DG.esFila({ 'NUCO': '', 'NUMERO TELEFONO': '4428242693' }));
  assert.ok(!DG.esFila({ 'NUCO': '1100', 'NUMERO TELEFONO': '' }));
});

test('DG: solo ADMIN la modifica; los demás la ven con DG, su estatus y el área', () => {
  const fila = { 'NUCO': '11002', 'NUMERO TELEFONO': '' };
  assert.throws(() => DG.exigirAdmin(fila, { esAdmin: false }), /Es de Dirección General: solo ADMIN lo modifica\./);
  assert.throws(() => DG.exigirAdmin(fila, null), /solo ADMIN/);
  assert.doesNotThrow(() => DG.exigirAdmin(fila, { esAdmin: true }));
  assert.doesNotThrow(() => DG.exigirAdmin({ 'NUCO': '0012' }, { esAdmin: false }));
  // Índice (columnas en camelCase)
  const cols = ['id', 'nuco', 'tipo', 'modelo', 'imei', 'estatus', 'responsable', 'departamento', 'sede', 'lineaId', 'numero', 'compania', 'estatusLinea', 'tipoHoja', 'panel', 'dg'];
  const fila2 = ['E1', '11002', 'CELULAR', 'IPHONE', '35111', 'USO', 'DG', 'DIRECCION GENERAL', 'QUERETARO', 'L1', '4422798678', 'TELCEL', 'USO', 'EQUIPO + SIM', null, true];
  assert.deepEqual(DG.ocultarRenglon(cols, fila2, 0),
    ['E1', '11002', '', '', '', 'USO', 'DG', 'DIRECCION GENERAL', '', 'L1', '', '', 'USO', 'EQUIPO + SIM', null, true]);
  // Vista del AppSheet: el ID va primero (desfase 1)
  const vcols = ['NUMERO TELEFONO', 'NUCO', 'RESPONSABLE', 'IMEI', 'AREA', 'ESTATUS LINEA'];
  const vfila = ['E1', '4422798678', '11002', 'JUAN', '35111', 'DIRECCION GENERAL', 'USO'];
  assert.ok(DG.esRenglonVista(vcols, vfila, 1));
  assert.deepEqual(DG.ocultarRenglon(vcols, vfila, 1), ['E1', '', '11002', 'DG', '', 'DIRECCION GENERAL', 'USO']);
  const ficha = DG.fichaOculta({ _id: 'L1', numero: '4422798678', estatus: 'USO', sim: '8952', equipoId: 'E1' }, false);
  assert.deepEqual([ficha.numero, ficha.sim, ficha._dgOculto, ficha.responsable.area], ['DG', undefined, true, 'DIRECCION GENERAL']);
});

test('DG: el servidor oculta y rechaza; la pantalla no pide lo que no ve', () => {
  const tel = read('src/services/TelefoniaService.gs');
  assert.match(tel, /return \{ correo: sesion\.correo, nombre: sesion\.nombre \|\| sesion\.correo, esAdmin: esAdmin_\(sesion\) \};/);
  assert.match(tel, /if \(!esAdmin_\(sesion\)\) return LineasUtil\.paraCliente\(\{ equipo: LineasDG\.fichaOculta\(r\.equipo, true\)/);
  assert.match(tel, /const sesion = sinDG_\(sinAlcance_\(leerSeccion_\(token, 'historial'\)\), id\);/);
  assert.match(tel, /LineasExportar\.baseCompleta\(modulo, puedeVerSecretos_\(sesion\), sesion\.alcance, !esAdmin_\(sesion\)\)/);
  assert.match(read('src/services/lineas/LineasRepo.gs'), /LineasDG\.exigirAdmin\(f, usuario\); \/\/ Dirección General: solo ADMIN/);
  assert.equal((read('src/services/lineas/LineasCaptura.gs').match(/LineasDG\.exigirAdmin\(obj\.fila, usuario\)/g) || []).length, 3);
  const cliente = read('src/html/js/lineas.html');
  assert.match(cliente, /const bloqueadoDG = \(r\) => !!\(r && \(r\.dg \|\| r\._dgOculto\)\) && !esAdmin\(\);/);
  assert.match(cliente, /const operar = \(f\) => puedeOperar\(\) && !\(f \|\| \[\]\)\.some\(bloqueadoDG\);/);
  assert.match(cliente, /if \(e\._dgOculto\) return;/);
});
