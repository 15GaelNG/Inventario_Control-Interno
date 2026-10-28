// Usuario, 22-oct: la inspección pide los accesorios igual que la responsiva (la lista «Accesorios» en lugar de CUBO,
// CABLE, FUNDA y MICA SI/NO), los pasa a la ficha y no cuentan en la calificación. Su PDF sale de una plantilla nueva
// («- ACCESORIOS 22-oct»); el de una inspección de antes se vuelve a hacer con la del 19-oct.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const LINEAS = require('./lineas-fuente');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const plano = (x) => JSON.parse(JSON.stringify(x));

const CATALOGO = ['CAJA', 'CABLE', 'CUBO', 'FUNDA', 'MICA', 'TARJETA SD', 'NINGUNO'];
// Inspecciones guardadas que lee accesoriosDeInspeccion_ (por ID)
const INSPECCIONES = {
  'ILI-NUEVA': { ID: 'ILI-NUEVA', 'ID LINEA': 'EQU-1', ACCESORIOS: 'CABLE , CUBO', CUBO: '', CABLE: '', FUNDA: '', MICA: '' },
  'ILI-SIN-NADA': { ID: 'ILI-SIN-NADA', 'ID LINEA': 'EQU-1', ACCESORIOS: '' },
  'ILI-VIEJA': { ID: 'ILI-VIEJA', 'ID LINEA': 'EQU-1', CUBO: 'SI', CABLE: 'NO', FUNDA: 'SI', MICA: 'N/A' },
  'ILI-OTRO': { ID: 'ILI-OTRO', 'ID LINEA': 'EQU-9', ACCESORIOS: 'CAJA' },
};
function captura() {
  const ctx = vm.createContext({
    console, Utilities: { formatDate: () => '2026-10-22T12:00' },
    LineasRegistros: { camposAdicionales: () => [] },
    LineasRepo: { CATALOGO: { accesorios: CATALOGO }, TAB: { INSP: 'INSP', RESP: 'RESP' }, catalogos: () => ({}) },
    LineasDatos: { nuevoId: () => 'X-1', buscarFilasPorId: (tabla, id) => (tabla === 'INSP' && INSPECCIONES[id] ? [id] : []),
      leerFilas: (pedidos) => [[INSPECCIONES[pedidos[0].filas[0]]]] },
    LineasFirmas: { tiene: () => false },
    LineasUtil: { col: (f, c) => (c in f ? f[c] : null), nucoVisible: (v) => (v ? String(v) : null),
      sinCargador: (v) => String(v || '').replace(/CARGADOR/g, 'CABLE , CUBO') },
  });
  vm.runInContext(read('src/services/lineas/LineasChecklist.gs') + '\n' + read('src/services/lineas/LineasCaptura.gs') + '\nthis.C = LineasCaptura;', ctx);
  return ctx.C;
}
const C = captura();
const FICHA = { ID: 'EQU-1', NUCO: '12', TIPO: 'EQUIPO + SIM', EQUIPO: 'MOTO G', IMEI: '35', 'ESTATUS EQUIPO': 'USO', ACCESORIOS: 'FUNDA, SD, CARGADOR' };
const campos = (elementos) => elementos.filter((e) => e.tipo === 'campo');
const inspeccion = (fila, deResponsiva) => C._formularioInspeccion(fila, {}, { nombre: 'CI' }, 'INS-1', new Date(), false, deResponsiva || null);
const responsiva = (fila) => C._formularioResponsiva(fila, {}, { nombre: 'CI' }, 'RES-1', new Date(), 'RESPONSIVA', null, false);
const accesorios = (elementos) => campos(elementos).filter((e) => e.columna === 'ACCESORIOS')[0];

test('la inspección pide los accesorios con la lista de la responsiva, ya no CUBO, CABLE, FUNDA ni MICA', () => {
  const insp = inspeccion(FICHA);
  const columnas = campos(insp).map((e) => e.columna);
  ['CUBO', 'CABLE', 'FUNDA', 'MICA', 'CUBO 2', 'CABLE 2'].forEach((c) => assert.ok(columnas.indexOf(c) < 0, c));
  const a = accesorios(insp);
  const r = accesorios(responsiva(FICHA));
  // Las mismas opciones y el mismo valor (los del equipo, con SD como TARJETA SD y CARGADOR como CABLE y CUBO)
  assert.equal(a.control, 'multi');
  assert.deepEqual(plano(a.opciones), plano(r.opciones));
  assert.deepEqual(plano(a.opciones), CATALOGO);
  assert.equal(a.valor, 'FUNDA , TARJETA SD , CABLE , CUBO');
  assert.equal(a.valor, r.valor);
  assert.equal(a.etiqueta, 'Accesorios');
  assert.equal(r.etiqueta, 'Accesorios entregados');
  // Ninguno es obligatorio; en la inspección sale donde salían CUBO y CABLE (todo menos la línea sola)
  assert.equal(a.requerido, 'NUNCA');
  assert.equal(r.requerido, 'NUNCA');
  assert.equal(a.mostrar, 'NO_LINEA');
  // En su sección, después de IDENTIFICACION
  const i = insp.findIndex((e) => e.tipo === 'titulo' && e.texto === 'DOCUMENTACIÓN / ACCESORIOS');
  assert.deepEqual(plano(insp.slice(i + 1, i + 3).map((e) => e.columna)), ['IDENTIFICACION', 'ACCESORIOS']);
  assert.equal(insp[i + 3].tipo, 'titulo');
});

test('lo que el equipo trae fuera de la lista se conserva; en Reasignar empieza con lo de la responsiva', () => {
  const a = accesorios(inspeccion(Object.assign({}, FICHA, { ACCESORIOS: 'CAJA, AUDIFONOS' })));
  assert.deepEqual(plano(a.opciones), CATALOGO.concat(['AUDIFONOS']));
  assert.equal(a.valor, 'CAJA , AUDIFONOS');
  assert.equal(accesorios(inspeccion(FICHA, { valores: { ACCESORIOS: 'MICA' } })).valor, 'MICA');
  assert.equal(accesorios(inspeccion(Object.assign({}, FICHA, { ACCESORIOS: '' }))).valor, '');
});

test('al guardar: los accesorios quedan en la inspección (columna nueva) y pasan a la ficha, salvo en la línea sola', () => {
  const cap = read('src/services/lineas/LineasCaptura.gs');
  assert.match(cap, /const COLUMNAS_NUEVAS = \{ INSPECCION: \['No EMPLEADO', 'DIRECTOR', 'ACCESORIOS'\]/);
  assert.match(cap, /if \(LineasChecklist\.cumple\('NO_LINEA', valores\['TIPO'\] \|\| ''\)\) copia\['ACCESORIOS'\] = valores\['ACCESORIOS'\] \|\| '';\n\s+\/\/ tolerante/);
  // Va antes de guardar el registro, en todos los casos (también Mandar a resguardo y Reasignar), como el color
  const guardar = cap.slice(cap.indexOf('function guardarInspeccion'), cap.indexOf('LineasRepo.guardarCambiosRegistro(obj.fila, copia'));
  assert.match(guardar, /copia\['ACCESORIOS'\]/);
  const Checklist = new Function(read('src/services/lineas/LineasChecklist.gs') + '; return LineasChecklist;')();
  assert.equal(Checklist.cumple('NO_LINEA', 'LINEA'), false);
  assert.equal(Checklist.cumple('NO_LINEA', 'SIM BASICO'), false);
  assert.equal(Checklist.cumple('NO_LINEA', 'MODEM'), true);
});

test('Reasignar: la responsiva se guarda con los accesorios de la inspección que se acaba de guardar (manda la inspección)', () => {
  assert.equal(C._accesoriosDeInspeccion('ILI-NUEVA', 'EQU-1'), 'CABLE , CUBO');
  // Sin nada marcado también manda (la ficha queda sin accesorios, como lo dijo la inspección)
  assert.equal(C._accesoriosDeInspeccion('ILI-SIN-NADA', 'EQU-1'), '');
  // Sin inspección, de otro registro o con los puntos de antes: la responsiva se queda con lo suyo
  assert.equal(C._accesoriosDeInspeccion('', 'EQU-1'), null);
  assert.equal(C._accesoriosDeInspeccion('ILI-NO-EXISTE', 'EQU-1'), null);
  assert.equal(C._accesoriosDeInspeccion('ILI-OTRO', 'EQU-1'), null);
  assert.equal(C._accesoriosDeInspeccion('ILI-VIEJA', 'EQU-1'), null);
  // Va antes de guardar la fila de la responsiva y de pasar lo suyo a la ficha; la línea sin equipo no lleva
  const cap = read('src/services/lineas/LineasCaptura.gs');
  const candado = cap.slice(cap.indexOf('function guardarResponsivaEnCandado_'), cap.indexOf('LineasDatos.agregarFilas(LineasRepo.TAB.RESP'));
  assert.match(candado, /const deInspeccion = sinEquipo \? null : accesoriosDeInspeccion_\(datos\.inspeccionId, obj\.reg\.id\);\n\s+if \(deInspeccion !== null\) valores\['ACCESORIOS'\] = deInspeccion;/);
  // La pantalla manda la inspección con la responsiva en Reasignar
  assert.match(LINEAS, /llamar\('apiLineasGuardarResponsiva', Object\.assign\(\{\}, d, \{ inspeccionId: inspeccionId \}\)\)/);
});

test('los accesorios no cuentan en la calificación; los puntos quedan para leer las inspecciones de antes', () => {
  const Checklist = new Function(read('src/services/lineas/LineasChecklist.gs') + '; return LineasChecklist;')();
  assert.equal(Checklist.calificacion({ PANTALLA: 'SI', CUBO: 'NO', CABLE: 'NO', FUNDA: 'NO', MICA: 'NO', ACCESORIOS: 'NINGUNO' }), 1);
  assert.equal(Checklist.calificacion({ CUBO: 'SI', CABLE: 'SI' }), 0);
  const columnas = Checklist.puntos().map((p) => p.columna);
  ['CUBO', 'CABLE', 'FUNDA', 'MICA'].forEach((c) => assert.ok(columnas.indexOf(c) >= 0, c));
});

test('PDF: la plantilla nueva para las inspecciones con la lista; la del 19-oct para las de antes', () => {
  const ctx = vm.createContext({ console });
  vm.runInContext(read('src/services/lineas/LineasPdf.gs') + '\nthis.P = LineasPdf;', ctx);
  const P = ctx.P;
  assert.equal(P.plantillaInspeccion({ ACCESORIOS: 'CABLE , CUBO', CUBO: '', CABLE: '' }), P.PLANTILLAS.INSPECCION_CELULAR);
  assert.equal(P.plantillaInspeccion({ CUBO: 'SI' }), P.PLANTILLAS.INSPECCION_CELULAR_CHECKLIST);
  assert.equal(P.plantillaInspeccion({ MICA: 'N/A' }), P.PLANTILLAS.INSPECCION_CELULAR_CHECKLIST);
  // La línea sola no llevaba esos puntos y ya no se inspecciona: las suyas son de antes (lineas-revisor, 22-oct)
  ['LINEA', 'SIM BASICO', 'LINEA BASICA', 'linea'].forEach((tipo) => assert.equal(P.plantillaInspeccion({ TIPO: tipo }), P.PLANTILLAS.INSPECCION_CELULAR_CHECKLIST, tipo));
  assert.equal(P.plantillaInspeccion({ TIPO: 'EQUIPO + SIM', ACCESORIOS: '' }), P.PLANTILLAS.INSPECCION_CELULAR);
  assert.equal(P.plantillaInspeccion({ TIPO: 'EQUIPO + SIM BASICO', ACCESORIOS: 'CAJA' }), P.PLANTILLAS.INSPECCION_CELULAR);
  assert.notEqual(P.PLANTILLAS.INSPECCION_CELULAR, P.PLANTILLAS.INSPECCION_CELULAR_CHECKLIST);
  assert.match(read('src/services/lineas/LineasCaptura.gs'), /esInspeccion \? LineasPdf\.plantillaInspeccion\(fila\) : LineasPdf\.PLANTILLAS\.RESPONSIVA_CELULAR/);
  // Las dos las revisa revisarEntorno (todas las de LineasPdf.PLANTILLAS)
  assert.match(read('src/Diagnostico.gs'), /Object\.keys\(LineasPdf\.PLANTILLAS\)\.forEach/);
});
