// Responsables adicionales (usuario, 6-oct): en lugar de «¿El responsable usa el equipo?» y «Quien lo usa», hasta cuatro
// responsables más (segundo…quinto, como el AppSheet), cada uno con su número de empleado y su nombre. En la responsiva
// cada uno firma, y el PDF los muestra como el AppSheet: nombres con « / » y las firmas juntas en una línea.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

function registros() {
  const ctx = vm.createContext({ console });
  vm.runInContext(read('src/services/lineas/LineasRegistros.gs') + '\nthis.R = LineasRegistros;', ctx);
  return ctx.R;
}
const campo = (columna, etiqueta, control, extra) => Object.assign({ tipo: 'campo', columna, etiqueta, control, mostrar: 'SIEMPRE' }, extra || {});

test('la pregunta «¿Más de un responsable?» y hasta cuatro responsables, cada uno con número de empleado y nombre', () => {
  const R = registros();
  const vacio = JSON.parse(JSON.stringify(R.camposAdicionales(campo, () => '')));
  assert.equal(vacio.length, 9);
  assert.deepEqual([vacio[0].columna, vacio[0].valor, vacio[0].opciones], ['MAS DE UN RESPONSABLE', 'NO', ['SI', 'NO']]);
  assert.deepEqual(vacio.slice(1).map((e) => e.columna), ['NO EMPLEADO SEGUNDO RESPONSABLE', 'NOMBRE SEGUNDO RESPONSABLE',
    'NO EMPLEADO TERCER RESPONSABLE', 'NOMBRE TERCER RESPONSABLE', 'NO EMPLEADO CUARTO RESPONSABLE', 'NOMBRE CUARTO RESPONSABLE',
    'NO EMPLEADO QUINTO RESPONSABLE', 'NOMBRE QUINTO RESPONSABLE']);
  // El segundo aparece con SI; el tercero, cuando el segundo tiene nombre; con NO se borran
  assert.deepEqual(vacio[2].mostrar, { campo: 'MAS DE UN RESPONSABLE', igual: 'SI' });
  assert.deepEqual(vacio[4].mostrar, { y: [{ campo: 'MAS DE UN RESPONSABLE', igual: 'SI' }, { lleno: 'NOMBRE SEGUNDO RESPONSABLE' }] });
  assert.deepEqual(vacio[2].reset, { cuando: { campo: 'MAS DE UN RESPONSABLE', igual: 'NO' }, valor: '' });
  assert.equal(vacio[2].sugerencias, 'PERSONAS');
  assert.equal(vacio[1].sugerencias, 'NO_EMPLEADO');
  // Si ya hay un segundo responsable, la pregunta empieza en SI y los campos con lo guardado
  const con = JSON.parse(JSON.stringify(R.camposAdicionales(campo, (c) => ({ 'NOMBRE SEGUNDO RESPONSABLE': 'LUIS', 'NO EMPLEADO SEGUNDO RESPONSABLE': 'AC1' })[c] || '')));
  assert.equal(con[0].valor, 'SI');
  assert.equal(con[2].valor, 'LUIS');
  // La condición { lleno } también la entiende el servidor
  assert.equal(R._cumple({ lleno: 'NOMBRE SEGUNDO RESPONSABLE' }, { 'NOMBRE SEGUNDO RESPONSABLE': 'LUIS' }, {}), true);
  assert.equal(R._cumple({ lleno: 'NOMBRE SEGUNDO RESPONSABLE' }, {}, {}), false);
});

test('Editar ya no pregunta «¿El responsable usa el equipo?»; la responsiva pide los adicionales y su firma', () => {
  const reg = read('src/services/lineas/LineasRegistros.gs');
  assert.doesNotMatch(reg, /RESPONSABLE USA EL EQUIPO|'Quien lo usa'/);
  assert.match(reg, /\.concat\(camposAdicionales\(/);
  const cap = read('src/services/lineas/LineasCaptura.gs');
  assert.match(cap, /LineasRegistros\.camposAdicionales\(/);
  assert.match(cap, /FIRMAS_ADICIONALES\.map\(\(c, i\) => campo_\(c, 'Firma del responsable ' \+ \(i \+ 2\), 'firma'/);
  // Sin SI no se guarda ninguno; las columnas se agregan a RESPONSIVAS LINEAS cuando hace falta
  assert.match(cap, /if \(String\(valores\['MAS DE UN RESPONSABLE'\] \|\| ''\)\.toUpperCase\(\) !== 'SI'\) ADICIONALES\.forEach/);
  assert.match(cap, /LineasDatos\.asegurarColumnas\(LineasRepo\.TAB\.RESP, ADICIONALES\)/);
  // Reasignar los pasa a la asignación
  assert.match(read('src/services/lineas/LineasAcciones.gs'), /\['NOMBRE ' \+ n \+ ' RESPONSABLE', 'NOMBRE ' \+ n \+ ' RESPONSABLE'\]/);
});

test('el PDF de la responsiva: nombres y números de empleado con « / », y las firmas juntas', () => {
  const cap = read('src/services/lineas/LineasCaptura.gs');
  const reg = cap.slice(cap.indexOf('function registroPlantilla_('), cap.indexOf('function ligarPdf_('));
  // registroPlantilla_ usa ORDEN_ADICIONALES del archivo
  const conOrden = new Function('LineasChecklist', "const ORDEN_ADICIONALES = ['SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO'];\n" + reg + '\nreturn registroPlantilla_;')({ calificacionTexto: (v) => v });
  const r = conOrden({ _fila: 3, RESPONSABLE: 'ANA', 'No EMPLEADO': 'AC1', 'NOMBRE SEGUNDO RESPONSABLE': 'LUIS', 'NO EMPLEADO SEGUNDO RESPONSABLE': 'AC2',
    'NOMBRE TERCER RESPONSABLE': 'EVA', 'NO EMPLEADO TERCER RESPONSABLE': '' });
  assert.equal(r.RESPONSABLE, 'ANA / LUIS / EVA');
  assert.equal(r['No EMPLEADO'], 'AC1 / AC2');
  assert.equal(r._fila, undefined);
  const solo = conOrden({ RESPONSABLE: 'ANA', 'No EMPLEADO': 'AC1' });
  assert.equal(solo.RESPONSABLE, 'ANA');
  // La pantalla une las firmas visibles en una imagen; el PDF la deja más ancha
  const lineas = read('src/html/js/lineas.html');
  assert.match(lineas, /function unirFirmas\(lista, fondo\)/);
  assert.match(lineas, /Promise\.all\(firmasResponsables\.map\(\(f\) => f\.base64\('#ffffff'\)\)\)\.then\(\(lista\) => unirFirmas\(lista, '#ffffff'\)\)/);
  assert.match(cap, /'firmas-responsables\.png' : 'firma-responsable\.png'/);
});

test('la ficha muestra los responsables adicionales y «quien lo usa» se copia como segundo responsable', () => {
  const repo = read('src/services/lineas/LineasRepo.gs');
  assert.match(repo, /rol: 'Responsable ' \+ \(i \+ 2\), nombre: txt\(col\(f, 'NOMBRE ' \+ n \+ ' RESPONSABLE'\)\)/);
  assert.match(read('src/html/js/lineas.html'), /<div class="ln-subtitulo">Responsables adicionales<\/div>/);
  const admin = read('src/services/lineas/LineasAdmin.gs');
  assert.match(admin, /function lineasQuienUsaASegundo_revisar\(\)/);
  assert.match(admin, /LineasDatos\.actualizarFila\(hoja, a\._fila, \{ 'NOMBRE SEGUNDO RESPONSABLE': usa \}\)/);
});
