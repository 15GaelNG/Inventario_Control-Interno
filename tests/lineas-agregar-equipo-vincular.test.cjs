const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

// Agregar equipo (usuario, 13-oct; pendiente 2.43): «¿Se vincula una línea?». Sí → una línea suelta DISPONIBLE que ya
// existe, con la misma escritura que «Vincular línea»; no → un número nuevo opcional, como siempre
function cargar() {
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')({}, {});
  return new Function('LineasRepo', 'CacheService', 'Utilities', 'SpreadsheetApp', 'Config', 'LineasUtil',
    read('src/services/lineas/LineasRegistros.gs') + '; return LineasRegistros;')(
    { CATALOGO: { estatusLinea: ['USO', 'DISPONIBLE', 'EN PROCESO DE CANCELACION', 'CANCELADA'], estatusEquipo: ['USO', 'RESGUARDO', 'PARA VENTA'] },
      TIPOS_CON_EQUIPO: { 'EQUIPO': 'CELULAR', 'EQUIPO + SIM': 'CELULAR' } },
    { getScriptCache: () => ({ get: () => '', put: () => {} }) },
    { formatDate: () => '2026-10-13' }, {}, {}, LineasUtil);
}
const ctx = { nuevo: true, parte: 'EQUIPO', nucoRepetido: () => false, telefonoRepetido: () => false, lineasSueltas: ['4420000003'] };
const campo = (els, c) => els.filter((e) => e.columna === c)[0];

test('Agregar equipo pregunta si se vincula una línea; al vincularla no se capturan la línea ni el adendum', () => {
  const Reg = cargar();
  const els = Reg._elementos({}, {}, { correo: 'x@y.z' }, ctx);
  assert.equal(campo(els, '_VINCULAR_LINEA').control, 'siNo');
  assert.equal(campo(els, '_VINCULAR_LINEA').valor, 'FALSE');
  assert.deepEqual(campo(els, '_LINEA').opciones, ['4420000003']);
  assert.ok(campo(els, '_LINEA').soloLista);
  assert.equal(campo(els, '_LINEA').sugerencias, 'LINEAS_DISPONIBLES');
  const si = { _VINCULAR_LINEA: 'TRUE' };
  const no = { _VINCULAR_LINEA: 'FALSE' };
  for (const c of ['NUMERO TELEFONO', 'NUMERO SIM', 'COMPAÑIA', 'RAZON SOCIAL', 'COSTO PLAN', 'INICIO PLAN', 'FIN PLAN']) {
    assert.ok(Reg._cumple(campo(els, c).mostrar, no, ctx), c + ' sin vincular');
    assert.ok(!Reg._cumple(campo(els, c).mostrar, si, ctx), c + ' vinculando');
  }
  assert.ok(Reg._cumple(campo(els, '_LINEA').requerido, si, ctx));
  assert.ok(!Reg._cumple(campo(els, '_LINEA').mostrar, no, ctx));
  // El PIN de WhatsApp sale con un número escrito o con la línea vinculada
  assert.ok(Reg._cumple(campo(els, 'PIN WHATSAPP').mostrar, si, ctx));
  assert.ok(Reg._cumple(campo(els, 'PIN WHATSAPP').mostrar, Object.assign({ 'NUMERO TELEFONO': '4421' }, no), ctx));
  assert.ok(!Reg._cumple(campo(els, 'PIN WHATSAPP').mostrar, no, ctx));
  // La línea es obligatoria al vincular
  const r = Reg._resolver(els, {}, { NUCO: '9001', EQUIPO: 'MOTO', 'ESTATUS EQUIPO': 'USO', _VINCULAR_LINEA: 'TRUE' }, ctx);
  assert.ok(r.errores.some((e) => /^Línea es obligatorio/.test(e)));
});

test('Agregar línea no cambia: sin la pregunta de Agregar equipo', () => {
  const Reg = cargar();
  const els = Reg._elementos({}, {}, { correo: 'x@y.z' }, Object.assign({}, ctx, { parte: 'LINEA' }));
  assert.ok(!campo(els, '_VINCULAR_LINEA'));
  assert.ok(campo(els, '_VINCULAR'));
});

test('solo líneas sueltas y DISPONIBLE', () => {
  const Reg = cargar();
  const l = (id, numero, estatus, tipo) => ({ ID: id, TIPO: tipo || 'LINEA', 'NUMERO TELEFONO': numero, 'ESTATUS LINEA': estatus });
  const filas = [l('LIN-1', '4420000001', 'DISPONIBLE'), l('LIN-2', '4420000002', 'USO'), l('LIN-3', '4420000003', 'DISPONIBLE', 'SIM BASICO'),
    l('EQU-1', '4420000004', 'DISPONIBLE', 'EQUIPO + SIM'), l('LIN-5', '', 'DISPONIBLE'), l('LIN-6', '4420000006', 'CANCELADA')];
  assert.deepEqual(Reg._lineasSueltas(filas).map((x) => x.id), ['LIN-1', 'LIN-3']);
});

test('al guardar: se revisa antes de escribir y se vincula como «Vincular línea»', () => {
  const reg = read('src/services/lineas/LineasRegistros.gs');
  const crear = reg.slice(reg.indexOf('function crear(datos, usuario)'), reg.indexOf('function lineaParaVincular_'));
  assert.match(crear, /lineaParaVincular_\(r\.valores\[LINEA_VINCULAR\], valores\) : null;/);
  assert.match(crear, /if \(vinculada\) COLUMNAS_LINEA_NUEVA\.forEach\(\(c\) => \{ valores\[c\] = ''; \}\);/);
  assert.match(crear, /LineasAcciones\.aplicarVinculo\(valores\.ID, vinculada\.id, '', comentario,/);
  // Antes de escribir: la línea sigue suelta y DISPONIBLE, y el equipo queda en USO o RESGUARDO
  const revisa = reg.slice(reg.indexOf('function lineaParaVincular_'), reg.indexOf('/** Columnas de la línea y de su adendum'));
  assert.match(revisa, /lineasSueltas_\(\)\.filter/);
  assert.match(revisa, /ESTATUS_VINCULABLE\.indexOf\(estatus\) < 0/);
  assert.match(read('src/html/js/lineas.html'), /if \(cond\.o\) return cond\.o\.some\(\(c\) => cumpleCondicion\(c, tipo, valores, ctx\)\);/);
});
