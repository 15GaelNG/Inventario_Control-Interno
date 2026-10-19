const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const LINEAS = require('./lineas-fuente');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

// Editar línea aparte de Editar equipo y cambio de número (usuario, 8-oct; pendiente 2.23)
function cargar() {
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')({}, {});
  return new Function('LineasRepo', 'CacheService', 'Utilities', 'SpreadsheetApp', 'Config', 'LineasUtil',
    read('src/services/lineas/LineasRegistros.gs') + '; return LineasRegistros;')(
    { CATALOGO: { estatusLinea: ['USO', 'DISPONIBLE', 'EN PROCESO DE CANCELACION', 'CANCELADA'], estatusEquipo: ['USO', 'RESGUARDO'] },
      TIPOS_CON_EQUIPO: { 'EQUIPO': 'CELULAR', 'EQUIPO + SIM': 'CELULAR', 'EQUIPO + SIM BASICO': 'CELULAR' } },
    { getScriptCache: () => ({ get: () => '', put: () => {} }) },
    { formatDate: () => '2026-10-08' }, {}, {}, LineasUtil);
}
const usuario = { correo: 'x@y.z' };
const campo = (els, c) => els.filter((e) => e.columna === c)[0];
const titulos = (els) => els.filter((e) => e.tipo === 'titulo').map((e) => e.texto);
const enEquipo = { TIPO: 'EQUIPO + SIM', NUCO: '12', 'NUMERO TELEFONO': '4421090805', 'ESTATUS LINEA': 'USO', 'ESTATUS EQUIPO': 'USO', RESPONSABLE: 'DANAE' };
const sola = { TIPO: 'LINEA', 'NUMERO TELEFONO': '4420000001', 'ESTATUS LINEA': 'USO', RESPONSABLE: 'JUAN', 'COMPAÑIA': 'TELCEL' };

test('Editar información del equipo con línea no trae la línea; Editar línea trae solo la línea', () => {
  const Reg = cargar();
  const equipo = Reg._elementos(enEquipo, {}, usuario, Reg._contextoEdicion(enEquipo, null));
  assert.deepEqual(titulos(equipo).filter((t) => /LÍNEA|ADENDUM/.test(t)), []);
  assert.equal(campo(equipo, 'PIN WHATSAPP').mostrar, 'SIEMPRE');
  const ctx = Reg._contextoEdicion(enEquipo, 'LINEA');
  assert.ok(ctx.lineaEnEquipo);
  const linea = Reg._elementos(enEquipo, {}, usuario, ctx);
  assert.deepEqual(titulos(linea), ['LÍNEA', 'ADENDUM']);
  // El responsable es el del equipo: se ve, no se edita
  assert.ok(!campo(linea, 'RESPONSABLE'));
  assert.equal(campo(linea, '_RESPONSABLE_EQUIPO').valor, 'DANAE');
  assert.ok(campo(linea, '_RESPONSABLE_EQUIPO').soloLectura);
  // Sigue al equipo: solo se manda a cancelación o se cancela
  assert.deepEqual(campo(linea, 'ESTATUS LINEA').opciones, ['USO', 'EN PROCESO DE CANCELACION', 'CANCELADA']);
  // Sin línea, Editar línea es Editar información del equipo
  assert.ok(!Reg._contextoEdicion({ TIPO: 'EQUIPO' }, 'LINEA').parte);
});

test('al cambiar el número se dice si es cambio de número o corrección de captura', () => {
  const Reg = cargar();
  const ctx = Object.assign(Reg._contextoEdicion(enEquipo, 'LINEA'), { nucoRepetido: () => false, telefonoRepetido: () => false });
  const els = Reg._elementos(enEquipo, {}, usuario, ctx);
  const motivo = campo(els, '_CAMBIO_NUMERO');
  assert.deepEqual(motivo.opciones, ['CAMBIO DE NUMERO', 'CORRECCION DE CAPTURA']);
  assert.ok(!Reg._cumple(motivo.mostrar, { 'NUMERO TELEFONO': '4421090805' }, ctx));
  assert.ok(Reg._cumple(motivo.mostrar, { 'NUMERO TELEFONO': '4421090806' }, ctx));
  const r = Reg._resolver(els, enEquipo, Object.assign({}, enEquipo, { 'NUMERO TELEFONO': '4421090806' }), ctx);
  assert.ok(r.errores.some((e) => /^Motivo del cambio de número es obligatorio/.test(e)));
  const ok = Reg._resolver(els, enEquipo, Object.assign({}, enEquipo, { 'NUMERO TELEFONO': '4421090806', _CAMBIO_NUMERO: 'CAMBIO DE NUMERO' }), ctx);
  assert.deepEqual(ok.errores, []);
  // El servidor lo guarda como CAMBIO_NUMERO y «Números de esta línea» lo lee de MOVIMIENTOS
  const reg = read('src/services/lineas/LineasRegistros.gs');
  const repo = read('src/services/lineas/LineasRepo.gs');
  assert.match(reg, /registrarMovimiento\(cambioDeNumero \? LineasRepo\.ACCION_CAMBIO_NUMERO : 'EDICION'/);
  assert.match(repo, /const ACCION_CAMBIO_NUMERO = 'CAMBIO_NUMERO';/);
  assert.match(repo, /CAMBIO_NUMERO: 'Cambio de número'/);
  assert.match(repo, /LineasDatos\.buscarFilas\(TAB\.MOV, 'ACCION', ACCION_CAMBIO_NUMERO\)/);
  assert.match(repo, /idLinea: txt\(col\(f, 'ID LINEA'\)\) \|\| id,/);
  // «Números de esta línea» se quitó de la ficha (usuario, 13-oct): los anteriores van abajo del número y en el historial
  assert.doesNotMatch(read('src/services/TelefoniaService.gs'), /numeros: LineasRepo\.numerosDeLinea\(r\.linea\)/);
});

test('línea sola: Quitar responsable y responsable para USO', () => {
  const Reg = cargar();
  const ctx = Reg._contextoEdicion(sola, null);
  const els = Reg._elementos(sola, {}, usuario, ctx);
  assert.equal(campo(els, '_QUITAR_RESPONSABLE').control, 'siNo');
  assert.ok(!Reg._cumple(campo(els, 'RESPONSABLE').mostrar, { _QUITAR_RESPONSABLE: 'TRUE' }, ctx));
  const reg = read('src/services/lineas/LineasRegistros.gs');
  assert.match(reg, /if \(quitar\) cambios\['ESTATUS LINEA'\] = 'DISPONIBLE';/);
  assert.match(reg, /Una línea en USO lleva responsable/);
  // Sin responsable no hay «Quitar responsable»
  assert.ok(!campo(Reg._elementos(Object.assign({}, sola, { RESPONSABLE: '' }), {}, usuario, ctx), '_QUITAR_RESPONSABLE'));
});

test('la pantalla: Editar línea en los menús, { cambio } y la búsqueda por número anterior', () => {
  const html = LINEAS;
  // Corregir la línea solo desde la línea, en la lista y en la ficha; el equipo corrige el equipo (usuario, 13-oct). «Corregir»
  // en lugar de «Editar» (usuario, 16-oct; pendiente 2.50)
  assert.doesNotMatch(html, /'Editar línea'|'Editar equipo'/);
  assert.match(html, /texto: 'Corregir', separador: true, alHacer: \(\) => abrirEditor\(id\)/);
  assert.match(html, /texto: 'Corregir', separador: true, alHacer: \(\) => abrirEditor\(id, 'LINEA'\)/);
  assert.match(html, /textContent = id \? \(parte === 'LINEA' \? 'Corregir línea' : 'Corregir equipo'\) : agregar;/);
  assert.match(html, /if \(cond\.cambio\) return/);
  // La búsqueda encuentra la línea por un número anterior, pero en la celda solo va el actual; los anteriores, en la ficha
  // abajo del número (usuario, 12-oct)
  assert.match(html, /valor: \(r\) => \[r\.numero, r\.numerosAnteriores\]\.filter\(Boolean\)\.join\(' '\),/);
  assert.doesNotMatch(html, />antes ' \+ esc\(r\.numerosAnteriores\)/);
  assert.match(html, /anteriores \? 'Antes <span class="ln-mono">' \+ esc\(anteriores\) \+ '<\/span>' : ''\)/);
  assert.doesNotMatch(html, /tarjetaNumeros|Números de esta línea/);
  assert.match(read('src/services/lineas/LineasRepo.gs'), /'numerosAnteriores'\];/);
});

test('al editar, un SIM BASICO sin datos de adendum no enseña el adendum', () => {
  const Reg = cargar();
  const basica = { TIPO: 'SIM BASICO', 'NUMERO TELEFONO': '4420000002', 'TIPO DE LINEA': 'SIM BASICO', 'ESTATUS LINEA': 'DISPONIBLE' };
  const ctx = Reg._contextoEdicion(basica, null);
  const els = Reg._elementos(basica, {}, usuario, ctx);
  assert.ok(!Reg._cumple(campo(els, 'FIN PLAN').mostrar, basica, ctx));
  // Un SIM BASICO que ya traía datos de adendum los sigue enseñando y no se borran al editar otra cosa
  const conFin = Object.assign({}, basica, { 'FIN PLAN': '2027-01-01' });
  const ctxFin = Object.assign(Reg._contextoEdicion(conFin, null), { nucoRepetido: () => false, telefonoRepetido: () => false });
  const elsFin = Reg._elementos(conFin, {}, usuario, ctxFin);
  assert.equal(campo(elsFin, 'FIN PLAN').mostrar, 'SIEMPRE');
  const r = Reg._resolver(elsFin, conFin, Object.assign({}, conFin, { 'COMPAÑIA': 'TELCEL' }), ctxFin);
  assert.equal(r.valores['FIN PLAN'], '2027-01-01');
});

test('al editar, cambiar una línea a SIM BASICO esconde y borra el adendum (usuario, 12-oct; pendiente 2.33)', () => {
  const Reg = cargar();
  const plan = { TIPO: 'LINEA', 'NUMERO TELEFONO': '4420000003', 'TIPO DE LINEA': 'PLAN', 'ESTATUS LINEA': 'DISPONIBLE', 'COMPAÑIA': 'TELCEL',
    'COSTO PLAN': '299', 'INICIO PLAN': '2025-01-01', 'FIN PLAN': '2027-01-01' };
  const ctx = Object.assign(Reg._contextoEdicion(plan, 'LINEA'), { nucoRepetido: () => false, telefonoRepetido: () => false });
  const els = Reg._elementos(plan, {}, usuario, ctx);
  const aBasico = Object.assign({}, plan, { 'TIPO DE LINEA': 'SIM BASICO' });
  ['COSTO PLAN', 'INICIO PLAN', 'FIN PLAN'].forEach((c) => {
    assert.ok(Reg._cumple(campo(els, c).mostrar, plan, ctx), c + ' se ve con PLAN');
    assert.ok(!Reg._cumple(campo(els, c).mostrar, aBasico, ctx), c + ' se esconde con SIM BASICO');
    assert.ok(!Reg._cumple(campo(els, c).requerido, aBasico, ctx), c + ' no se pide');
  });
  const r = Reg._resolver(els, plan, aBasico, ctx);
  assert.deepEqual(r.errores, []);
  assert.deepEqual(['COSTO PLAN', 'INICIO PLAN', 'FIN PLAN'].map((c) => r.valores[c]), ['', '', '']);
  // Si se queda en PLAN, el adendum no se toca
  const igual = Reg._resolver(els, plan, Object.assign({}, plan, { 'COMPAÑIA': 'AT&T' }), ctx);
  assert.equal(igual.valores['COSTO PLAN'], '299');
});

test('LINEA BASICA ahora se llama SIM BASICO (usuario, 12-oct; pendiente 2.35)', () => {
  const Reg = cargar();
  const vieja = { TIPO: 'LINEA BASICA', 'NUMERO TELEFONO': '4420000004', 'TIPO DE LINEA': 'SIM BASICO', 'ESTATUS LINEA': 'DISPONIBLE', 'COMPAÑIA': 'TELCEL' };
  const ctx = Object.assign(Reg._contextoEdicion(vieja, 'LINEA'), { nucoRepetido: () => false, telefonoRepetido: () => false });
  const r = Reg._resolver(Reg._elementos(vieja, {}, usuario, ctx), vieja, vieja, ctx);
  assert.equal(r.valores.TIPO, 'SIM BASICO');
  assert.equal(Reg._tipoAutomatico('LINEA', { 'TIPO DE LINEA': 'SIM BASICO' }, ''), 'SIM BASICO');
  assert.doesNotMatch(LINEAS, /'Línea básica'/);
});
