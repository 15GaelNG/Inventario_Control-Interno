// Pendiente 2.19 (usuario, 6-oct): con el tipo de bloqueo «PIN», el PIN del equipo solo acepta números; la «CONTRASEÑA»
// acepta todo. PIN y contraseña van en la misma columna PIN EQUIPO: el bloqueo elegido viaja aparte (`datos.bloqueo`).
// Editar, la inspección y la responsiva; en la pantalla y en el servidor.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const cliente = read('src/html/js/lineas.html');
const tramo = (desde, hasta) => {
  const i = cliente.indexOf(desde);
  const f = cliente.indexOf(hasta, i);
  assert.ok(i >= 0 && f > i, 'tramo ' + desde);
  return cliente.slice(i, f);
};

const LineasUtil = new Function(read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')();

test('servidor: con «PIN» solo números; la contraseña, el patrón o sin bloqueo aceptan todo', () => {
  const pin = (bloqueo, valor) => () => LineasUtil.exigirPinEquipo({ bloqueo: bloqueo, valores: { 'PIN EQUIPO': valor } });
  assert.doesNotThrow(pin('PIN', '123456'));
  assert.doesNotThrow(pin('PIN', ''), 'vacío: lo decide el obligatorio, no esta regla');
  assert.throws(pin('PIN', '12ab'), /PIN DEL EQUIPO: SOLO NUMEROS/);
  assert.throws(pin('PIN', '12 34'), /SOLO NUMEROS/);
  assert.doesNotThrow(pin('CONTRASEÑA', 'Abc12x'));
  assert.doesNotThrow(pin('PATRÓN', 'PATRON'));
  assert.doesNotThrow(pin('SIN BLOQUEO', 'N/A'));
  assert.doesNotThrow(() => LineasUtil.exigirPinEquipo({ valores: { 'PIN EQUIPO': 'ab' } }), 'una página sin la lista no manda bloqueo');
  assert.doesNotThrow(() => LineasUtil.exigirPinEquipo(null));
});

test('servidor: Editar, Agregar, la inspección y la responsiva lo revisan antes de guardar', () => {
  const registros = read('src/services/lineas/LineasRegistros.gs');
  assert.match(registros, /function crear\(datos, usuario\) \{[\s\S]{0,200}LineasUtil\.exigirPinEquipo\(datos\);/);
  assert.match(registros, /function editar\(id, datos, usuario, puedeVerSecretos\) \{\s*asegurarEsquema_\(\);\s*LineasUtil\.exigirPinEquipo\(datos\);/);
  const captura = read('src/services/lineas/LineasCaptura.gs');
  assert.match(captura, /function guardarInspeccion\(datos, usuario, puedeVerSecretos\) \{\s*LineasUtil\.exigirPinEquipo\(datos\);/);
  assert.match(captura, /function guardarResponsiva\(datos, usuario, puedeVerSecretos, accion\) \{\s*LineasUtil\.exigirPinEquipo\(datos\);/);
});

function funcionesCliente() {
  const codigo = tramo('    function aplicarBloqueo(', '    /** Caja de firma') + '\nthis.f = { aplicarBloqueo, bloqueoElegido, errorPinBloqueo, activarBloqueo };';
  const ctx = vm.createContext({});
  vm.runInContext(codigo, ctx);
  return ctx.f;
}

/** Formulario mínimo: la lista _BLOQUEO y el input de PIN EQUIPO. */
function cuerpoFalso(bloqueo, pin) {
  const escuchas = {};
  const input = { value: pin, inputMode: '', matches: (s) => s === 'input[data-columna="PIN EQUIPO"]' };
  const sel = { value: bloqueo, matches: (s) => s === '[data-columna="_BLOQUEO"]' };
  const campoPin = { classList: { toggle() {} }, querySelector: (s) => (s === 'input' ? input : null) };
  return {
    input, sel, escuchas,
    addEventListener: (tipo, fn) => { (escuchas[tipo] = escuchas[tipo] || []).push(fn); },
    querySelector: (s) => ({ 'select[data-columna="_BLOQUEO"]': sel, 'input[data-columna="PIN EQUIPO"]': input, '.ln-af-campo[data-af-columna="PIN EQUIPO"]': campoPin })[s] || null,
  };
}

test('pantalla: el error sale solo con «PIN» y letras', () => {
  const { errorPinBloqueo, bloqueoElegido } = funcionesCliente();
  assert.equal(errorPinBloqueo(cuerpoFalso('PIN', '12a4')), 'SOLO NUMEROS');
  assert.equal(errorPinBloqueo(cuerpoFalso('PIN', '1234')), '');
  assert.equal(errorPinBloqueo(cuerpoFalso('CONTRASEÑA', 'abC1')), '');
  assert.equal(bloqueoElegido({ querySelector: () => null }), null, 'formulario sin la lista: no se manda');
  assert.equal(bloqueoElegido(cuerpoFalso('', '')), '', 'con la lista y sin elegir: vacío (el servidor lo rechaza)');
});

test('tipo de bloqueo obligatorio siempre que se ve (usuario, 9-oct): la lista ya trae SIN BLOQUEO', () => {
  assert.throws(() => LineasUtil.exigirPinEquipo({ bloqueo: '', valores: {} }), /TIPO DE BLOQUEO DEL EQUIPO es obligatorio/);
  assert.doesNotThrow(() => LineasUtil.exigirPinEquipo({ bloqueo: null, valores: {} }), 'sin la lista (o oculta) no llega');
  assert.doesNotThrow(() => LineasUtil.exigirPinEquipo({ bloqueo: 'SIN BLOQUEO', valores: { 'PIN EQUIPO': 'N/A' } }));
  const cliente = read('src/html/js/lineas.html');
  assert.match(cliente, /columna: '_BLOQUEO', etiqueta: 'TIPO DE BLOQUEO DEL EQUIPO', control: 'lista', opciones: OPCIONES_BLOQUEO, valor: inicial, mostrar: pin\.mostrar, requerido: pin\.mostrar, virtual: true/);
  assert.match(cliente, /const v = \(e\.columna === '_BLOQUEO' \? bloqueoElegido\(cuerpo\) : valores\[e\.columna\]\) \|\| '';/, 'Editar y Agregar');
  assert.match(cliente, /if \(e\.columna === '_BLOQUEO' && bloqueoElegido\(cuerpo\) === null\) return;/,
    'Editar: si la lista no está a la vista no se pide (usuario, 9-oct: salió «obligatorio» al editar una línea)');
  assert.match(cliente, /if \(bloqueoElegido\(\$\('#ln-captura-cuerpo', raiz\)\) === ''\) errores\.push\(\{ columna: '_BLOQUEO'/, 'inspección y responsiva');
});

test('pantalla: con «PIN» las letras no se escriben; con contraseña sí', () => {
  const { activarBloqueo } = funcionesCliente();
  const escribir = (bloqueo, valor) => {
    const c = cuerpoFalso(bloqueo, '');
    activarBloqueo(c);
    c.input.value = valor;
    c.escuchas.input.forEach((fn) => fn({ target: c.input }));
    return c;
  };
  const conPin = escribir('PIN', '12a3B');
  assert.equal(conPin.input.value, '123');
  assert.equal(conPin.input.inputMode, 'numeric');
  assert.equal(escribir('CONTRASEÑA', 'Ab1x').input.value, 'Ab1x');
});

test('pantalla: al cambiar a «PIN» se borra una contraseña con letras', () => {
  const { aplicarBloqueo } = funcionesCliente();
  const c = cuerpoFalso('PIN', 'clave1');
  aplicarBloqueo(c, true);
  assert.equal(c.input.value, '');
  const d = cuerpoFalso('PIN', '4321');
  aplicarBloqueo(d, true);
  assert.equal(d.input.value, '4321');
});

test('pantalla: Editar tiene la lista de bloqueo y los tres formularios mandan el bloqueo elegido', () => {
  assert.match(cliente, /const elementos = conSelectorBloqueo\(form\.elementos\);/);
  assert.equal((cliente.match(/activarBloqueo\(cuerpo\);/g) || []).length, 2, 'Editar y las capturas');
  assert.match(cliente, /parte: ctx\.parte, bloqueo: bloqueoElegido\(cuerpo\),/);
  assert.equal((cliente.match(/valores: valores, patron: patron, bloqueo: bloqueo,/g) || []).length, 2, 'inspección y responsiva');
  assert.match(tramo('    function erroresFormularioEn(', '    /** FOLIO y ESTATUS GENERAL'), /errorPinBloqueo\(cuerpo\)/);
  assert.match(tramo('      function erroresCaptura(', '      function patronParaGuardar('), /errorPinBloqueo\(/);
});

// Usuario, 9-oct: el NUCO 0896 mostraba su PIN y, a la vez, la imagen de un patrón que dejó una inspección del AppSheet
// (la inspección del 7-oct eligió «PIN» y el patrón viejo se quedó). Un solo bloqueo.
test('un solo bloqueo: con PIN, contraseña o sin bloqueo el patrón se borra al guardar y no se muestra', () => {
  assert.equal(LineasUtil.bloqueoSinPatron({ bloqueo: 'PIN' }), true);
  assert.equal(LineasUtil.bloqueoSinPatron({ bloqueo: 'CONTRASEÑA' }), true);
  assert.equal(LineasUtil.bloqueoSinPatron({ bloqueo: 'SIN BLOQUEO' }), true);
  assert.equal(LineasUtil.bloqueoSinPatron({ bloqueo: 'PATRÓN' }), false);
  assert.equal(LineasUtil.bloqueoSinPatron({ bloqueo: null }), false, 'sin la lista no se toca');
  const img = 'INSPECCIONES LINEAS_Images/cbbef8da.PATRON.175320.png';
  assert.equal(LineasUtil.patronVigente('123456', img), '', 'NUCO 0896');
  assert.equal(LineasUtil.patronVigente('Clave1', img), '');
  assert.equal(LineasUtil.patronVigente('PATRON', img), img);
  assert.equal(LineasUtil.patronVigente('PATRÓN', '1-5-9'), '1-5-9');
  assert.equal(LineasUtil.patronVigente('', img), img, 'sin PIN: el del AppSheet se sigue viendo');
  assert.equal(LineasUtil.patronVigente('N/A', img), img, 'N/A del AppSheet: como estaba');

  const captura = read('src/services/lineas/LineasCaptura.gs');
  assert.match(captura, /valores\['PATRON'\] = String\(datos\.patron\);\s*if \(LineasUtil\.bloqueoSinPatron\(datos\)\) valores\['PATRON'\] = '';/, 'inspección');
  assert.match(captura, /valores\['CONTRASEÑA'\] = String\(datos\.patron\);\s*if \(LineasUtil\.bloqueoSinPatron\(datos\)\) valores\['CONTRASEÑA'\] = '';/, 'responsiva');
  assert.match(captura, /if \(LineasUtil\.bloqueoSinPatron\(datos\)\) \{ copia\['PATRON'\] = ''; copia\['PIN EQUIPO'\] = valores\['PIN EQUIPO'\] \|\| ''; \}/, 'responsiva → equipo');
  assert.match(captura, /const rutaPatron = LineasUtil\.patronVigente\(col\('PIN EQUIPO'\), col\(colPatron\)\);/, 'PDF');
  assert.match(read('src/services/lineas/LineasRegistros.gs'), /if \(LineasUtil\.bloqueoSinPatron\(datos\) && 'PATRON' in valores\) valores\['PATRON'\] = '';/, 'Editar');
  const repo = read('src/services/lineas/LineasRepo.gs');
  assert.equal((repo.match(/patronRuta: LineasUtil\.patronVigente\(col\(f, 'PIN EQUIPO'\), col\(f, 'PATRON'\)\) \|\| null/g) || []).length, 2, 'ficha e inspección');
});
