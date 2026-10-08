const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

// Agregar línea (usuario, 8-oct; pendiente 2.22): se vincula o no a un equipo, el estatus se pone solo y el SIM BASICO
// no pide adendum
function cargar() {
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')({}, {});
  return new Function('LineasRepo', 'CacheService', 'Utilities', 'SpreadsheetApp', 'Config', 'LineasUtil',
    read('src/services/lineas/LineasRegistros.gs') + '; return LineasRegistros;')(
    { CATALOGO: { estatusLinea: ['USO', 'DISPONIBLE', 'EN PROCESO DE CANCELACION', 'CANCELADA'], estatusEquipo: ['USO', 'RESGUARDO'] },
      TIPOS_CON_EQUIPO: { 'EQUIPO': 'CELULAR', 'EQUIPO + SIM': 'CELULAR' } },
    { getScriptCache: () => ({ get: () => '', put: () => {} }) },
    { formatDate: () => '2026-10-08' }, {}, {}, LineasUtil);
}
const ctx = { nuevo: true, parte: 'LINEA', nucoRepetido: () => false, telefonoRepetido: () => false, equiposSinLinea: ['0012'] };
const campo = (els, c) => els.filter((e) => e.columna === c)[0];

test('Agregar línea pregunta si se vincula a un equipo y el responsable solo se escribe si no', () => {
  const Reg = cargar();
  const els = Reg._elementos({}, {}, { correo: 'x@y.z' }, ctx);
  assert.equal(campo(els, '_VINCULAR').control, 'siNo');
  assert.deepEqual(campo(els, '_NUCO').opciones, ['0012']);
  assert.ok(campo(els, '_NUCO').soloLista);
  assert.ok(Reg._cumple(campo(els, 'RESPONSABLE').mostrar, { _VINCULAR: 'FALSE' }, ctx));
  assert.ok(!Reg._cumple(campo(els, 'RESPONSABLE').mostrar, { _VINCULAR: 'TRUE' }, ctx));
  assert.ok(Reg._cumple(campo(els, '_NUCO').requerido, { _VINCULAR: 'TRUE' }, ctx));
  // El responsable es opcional y el NUCO se pide solo al vincular
  const r = Reg._resolver(els, {}, { 'NUMERO TELEFONO': '4420000001', 'TIPO DE LINEA': 'SIM BASICO', _VINCULAR: 'TRUE', _CANCELACION: 'NO' }, ctx);
  assert.ok(r.errores.some((e) => /^NUCO es obligatorio/.test(e)));
  const sola = Reg._resolver(els, {}, { 'NUMERO TELEFONO': '4420000001', 'TIPO DE LINEA': 'SIM BASICO', 'COMPAÑIA': 'TELCEL', _VINCULAR: 'FALSE', _CANCELACION: 'NO' }, ctx);
  assert.deepEqual(sola.errores, []);
});

test('el estatus de la línea nueva se pone solo; la cancelación solo si se elige', () => {
  const Reg = cargar();
  const els = Reg._elementos({}, {}, { correo: 'x@y.z' }, ctx);
  assert.equal(campo(els, 'ESTATUS LINEA').control, 'calculado');
  assert.equal(campo(els, 'ESTATUS LINEA').formula, 'ESTATUS_LINEA_ALTA');
  assert.deepEqual(campo(els, '_CANCELACION').opciones, ['NO', 'EN PROCESO DE CANCELACION', 'CANCELADA']);
  const e = Reg._estatusAltaLinea;
  assert.equal(e({ _CANCELACION: 'NO', RESPONSABLE: 'JUAN' }, null), 'USO');
  assert.equal(e({ _CANCELACION: 'NO', RESPONSABLE: '' }, null), 'DISPONIBLE');
  assert.equal(e({ _CANCELACION: 'EN PROCESO DE CANCELACION', RESPONSABLE: 'JUAN' }, null), 'EN PROCESO DE CANCELACION');
  // Con equipo, sigue al equipo (opción A): en uso → USO; guardado → DISPONIBLE
  assert.equal(e({ _CANCELACION: 'NO' }, { 'ESTATUS EQUIPO': 'USO' }), 'USO');
  assert.equal(e({ _CANCELACION: 'NO' }, { 'ESTATUS EQUIPO': 'RESGUARDO' }), 'DISPONIBLE');
});

test('solo se vinculan equipos en uso o en resguardo y sin línea', () => {
  const Reg = cargar();
  const f = (nuco, estatus, numero, estatusLinea) => ({ ID: 'EQU-' + nuco, TIPO: numero ? 'EQUIPO + SIM' : 'EQUIPO', NUCO: nuco,
    'ESTATUS EQUIPO': estatus, 'NUMERO TELEFONO': numero || '', 'NUMERO SIM': '', 'ESTATUS LINEA': estatusLinea || '' });
  const filas = [f('12', 'USO'), f('13', 'RESGUARDO'), f('14', 'VENDIDO'), f('15', 'USO', '4420000001', 'USO'), f('16', 'USO', '4420000002', 'CANCELADA'),
    { ID: 'LIN-1', TIPO: 'LINEA', NUCO: '', 'ESTATUS EQUIPO': '', 'NUMERO TELEFONO': '4420000003' }];
  assert.deepEqual(Reg._equiposSinLinea(filas).map((x) => x.nuco), ['0012', '0013', '0016']);
});

test('la pantalla hace las mismas cuentas y los campos con «_» no se escriben en la hoja', () => {
  const html = read('src/html/js/lineas.html');
  const reg = read('src/services/lineas/LineasRegistros.gs');
  assert.match(html, /nombre === 'ESTATUS_LINEA_ALTA'/);
  assert.match(html, /nombre === 'RESPONSABLE_EQUIPO'/);
  assert.match(html, /tipo === 'EQUIPOS_SIN_LINEA'/);
  assert.match(html, /cond\.campo && cond\.distinto !== undefined/);
  assert.match(reg, /e\.columna\.charAt\(0\) !== '_'/);
  assert.match(reg, /function crearLineaEnEquipo_/);
  assert.match(reg, /Una línea CANCELADA no se vincula a un equipo\./);
});
