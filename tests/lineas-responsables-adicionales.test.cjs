// Responsables adicionales (usuario, 6-oct): en lugar de «¿El responsable usa el equipo?» y «Quien lo usa» (que se quitaron
// por completo), hasta cuatro responsables más (segundo…quinto, como el AppSheet), cada uno con su número de empleado y su
// nombre, en su propio bloque con «Quitar» y un botón «Agregar responsable». Van en Editar, la responsiva y la inspección;
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
const plano = (x) => JSON.parse(JSON.stringify(x));

test('un bloque «RESPONSABLE N» por cada adicional, con «Quitar», y «Agregar responsable» al final', () => {
  const R = registros();
  const vacio = plano(R.camposAdicionales(campo, () => ''));
  const titulos = vacio.filter((e) => e.tipo === 'titulo');
  assert.deepEqual(titulos.map((t) => t.texto), ['RESPONSABLE 2', 'RESPONSABLE 3', 'RESPONSABLE 4', 'RESPONSABLE 5', '']);
  assert.deepEqual(titulos.slice(0, 4).map((t) => t.quitarAdicional), [0, 1, 2, 3]);
  assert.equal(titulos[4].sinTexto, true);
  const campos = vacio.filter((e) => e.tipo === 'campo');
  assert.deepEqual(campos.map((e) => e.columna), ['NO EMPLEADO SEGUNDO RESPONSABLE', 'NOMBRE SEGUNDO RESPONSABLE',
    'NO EMPLEADO TERCER RESPONSABLE', 'NOMBRE TERCER RESPONSABLE', 'NO EMPLEADO CUARTO RESPONSABLE', 'NOMBRE CUARTO RESPONSABLE',
    'NO EMPLEADO QUINTO RESPONSABLE', 'NOMBRE QUINTO RESPONSABLE', 'RESPONSABLES ADICIONALES']);
  assert.deepEqual(campos.slice(0, 8).map((e) => e.etiqueta), ['No. de empleado', 'Nombre', 'No. de empleado', 'Nombre', 'No. de empleado', 'Nombre', 'No. de empleado', 'Nombre']);
  // Cada bloque se ve según cuántos hay; los de más se borran al guardar
  assert.deepEqual(campos[2].mostrar, { cuantos: 'RESPONSABLES ADICIONALES', alMenos: 2 });
  assert.deepEqual(campos[2].reset, { cuando: { cuantos: 'RESPONSABLES ADICIONALES', menos: 2 }, valor: '' });
  assert.equal(campos[1].sugerencias, 'PERSONAS');
  assert.equal(campos[0].sugerencias, 'NO_EMPLEADO');
  const cuenta = campos[8];
  assert.deepEqual([cuenta.control, cuenta.etiqueta, cuenta.valor], ['adicionales', 'Agregar responsable', '0']);
  assert.deepEqual(cuenta.mostrar, { cuantos: 'RESPONSABLES ADICIONALES', menos: 4 });
  // Con lo guardado, la cuenta llega hasta el último que tiene dato
  const con = plano(R.camposAdicionales(campo, (c) => ({ 'NOMBRE TERCER RESPONSABLE': 'EVA' })[c] || ''));
  assert.equal(con.filter((e) => e.columna === 'RESPONSABLES ADICIONALES')[0].valor, '2');
  // El servidor entiende { cuantos } (mostrar y borrar)
  assert.equal(R._cumple({ cuantos: 'RESPONSABLES ADICIONALES', alMenos: 2 }, { 'RESPONSABLES ADICIONALES': '2' }, {}), true);
  assert.equal(R._cumple({ cuantos: 'RESPONSABLES ADICIONALES', alMenos: 3 }, { 'RESPONSABLES ADICIONALES': '2' }, {}), false);
  assert.equal(R._cumple({ cuantos: 'RESPONSABLES ADICIONALES', menos: 1 }, {}, {}), true);
});

test('fijo (inspección de Reasignar): solo los de la responsiva, sin cambiarlos, sin agregar ni quitar', () => {
  const R = registros();
  const fijos = plano(R.camposAdicionales(campo, (c) => ({ 'NOMBRE SEGUNDO RESPONSABLE': 'LUIS', 'NO EMPLEADO SEGUNDO RESPONSABLE': 'AC2' })[c] || '', true));
  assert.deepEqual(fijos.map((e) => e.texto || e.columna), ['RESPONSABLE 2', 'NO EMPLEADO SEGUNDO RESPONSABLE', 'NOMBRE SEGUNDO RESPONSABLE']);
  assert.equal(fijos[0].quitarAdicional, null);
  assert.ok(fijos.slice(1).every((e) => e.soloLectura && e.control === 'texto'));
  assert.equal(fijos[2].valor, 'LUIS');
  assert.deepEqual(plano(R.camposAdicionales(campo, () => '', true)), []);
});

test('Editar, la responsiva y la inspección piden los adicionales; Editar no guarda la cuenta', () => {
  const reg = read('src/services/lineas/LineasRegistros.gs');
  assert.doesNotMatch(reg, /RESPONSABLE USA EL EQUIPO|'Quien lo usa'|MAS DE UN RESPONSABLE/);
  assert.match(reg, /\.concat\(camposAdicionales\(/);
  assert.match(reg, /e\.control !== 'adicionales' && !e\.soloLectura/);
  const cap = read('src/services/lineas/LineasCaptura.gs');
  assert.doesNotMatch(cap, /MAS DE UN RESPONSABLE/);
  // Responsiva e inspección (fuera de Mandar a resguardo; en Reasignar, fijos)
  assert.equal((cap.match(/LineasRegistros\.camposAdicionales\(/g) || []).length, 2);
  assert.match(cap, /enAccion \? \[\] : LineasRegistros\.camposAdicionales\([\s\S]{0,160}, !!resp\)\);/);
  // Cada adicional firma, en las dos
  assert.match(cap, /\], firmasAdicionales_\(null\), \[/);
  assert.match(cap, /if \(!enAccion\) Array\.prototype\.push\.apply\(elementos, firmasAdicionales_\(resp \? \(c\) => deResp\(c, ''\) : null\)\);/);
  // Los bloques quitados se borran; las columnas se agregan cuando hace falta
  assert.match(cap, /function limpiarAdicionales_\(valores\)/);
  assert.equal((cap.match(/limpiarAdicionales_\(valores\);/g) || []).length, 2);
  assert.match(cap, /LineasDatos\.asegurarColumnas\(LineasRepo\.TAB\.RESP, ADICIONALES\)/);
  assert.match(cap, /LineasDatos\.asegurarColumnas\(LineasRepo\.TAB\.INSP, ADICIONALES\)/);
  // Reasignar los pasa a la asignación
  assert.match(read('src/services/lineas/LineasAcciones.gs'), /\['NOMBRE ' \+ n \+ ' RESPONSABLE', 'NOMBRE ' \+ n \+ ' RESPONSABLE'\]/);
});

test('limpiarAdicionales_: borra los bloques de más y no guarda la cuenta; sin cuenta no toca nada', () => {
  const cap = read('src/services/lineas/LineasCaptura.gs');
  const fn = cap.slice(cap.indexOf('function limpiarAdicionales_('), cap.indexOf('/** Oculta PIN/patrón'));
  const limpiar = new Function('LineasRegistros', "const ORDEN_ADICIONALES = ['SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO'];\n" + fn + '\nreturn limpiarAdicionales_;')(
    { CUENTA_ADICIONALES: 'RESPONSABLES ADICIONALES' });
  const v = { 'RESPONSABLES ADICIONALES': '1', 'NOMBRE SEGUNDO RESPONSABLE': 'LUIS', 'NOMBRE TERCER RESPONSABLE': 'EVA', 'NO EMPLEADO TERCER RESPONSABLE': 'AC3' };
  limpiar(v);
  assert.equal(v['NOMBRE SEGUNDO RESPONSABLE'], 'LUIS');
  assert.equal(v['NOMBRE TERCER RESPONSABLE'], '');
  assert.equal(v['NO EMPLEADO TERCER RESPONSABLE'], '');
  assert.ok(!('RESPONSABLES ADICIONALES' in v));
  const fijos = { 'NOMBRE SEGUNDO RESPONSABLE': 'LUIS' };
  limpiar(fijos);
  assert.deepEqual(fijos, { 'NOMBRE SEGUNDO RESPONSABLE': 'LUIS' });
});

test('la pantalla: «Agregar responsable», «Quitar» (los de abajo suben) y la condición { cuantos }', () => {
  const lineas = read('src/html/js/lineas.html');
  assert.match(lineas, /if \(e\.control === 'adicionales'\)/);
  assert.match(lineas, /data-agregar-adicional/);
  assert.match(lineas, /data-quitar-adicional="' \+ Number\(e\.quitarAdicional\) \+ '"/);
  assert.match(lineas, /function activarAdicionales\(cuerpo, alQuitar\)/);
  assert.match(lineas, /const origen = j \+ 1 < ORDEN_ADICIONALES\.length \? entrada\(p, ORDEN_ADICIONALES\[j \+ 1\]\) : null;/);
  assert.match(lineas, /if \(cond\.cuantos\) \{/);
  // En la captura y en Editar
  assert.equal((lineas.match(/activarAdicionales\(cuerpo(\)|, \(i\))/g) || []).length, 2);
  assert.match(read('src/html/lineas-estilos.html'), /\.ln-af-campo\[data-af-columna="RESPONSABLES ADICIONALES"\]/);
});

test('el PDF: nombres y números de empleado con « / », las firmas juntas (responsiva e inspección) y sin la palabra PATRON', () => {
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
  // Responsiva: «<<[CONTRASEÑA]>><<[PIN EQUIPO]>>»; con patrón, solo la imagen (usuario, 6-oct)
  assert.equal(conOrden({ CONTRASEÑA: '1-5-9', 'PIN EQUIPO': 'PATRON' })['PIN EQUIPO'], '');
  assert.equal(conOrden({ CONTRASEÑA: '', 'PIN EQUIPO': 'PATRON' })['PIN EQUIPO'], 'PATRON');
  assert.equal(conOrden({ CONTRASEÑA: '', 'PIN EQUIPO': '1234' })['PIN EQUIPO'], '1234');
  assert.equal(conOrden({ PATRON: '1-5-9', 'PIN EQUIPO': 'PATRON' })['PIN EQUIPO'], 'PATRON', 'la inspección no cambia');
  // La pantalla une las firmas visibles en una imagen, en las dos; el PDF la deja más ancha
  const lineas = read('src/html/js/lineas.html');
  assert.match(lineas, /function unirFirmas\(lista, fondo\)/);
  assert.match(lineas, /function firmasDeResponsables\(cuerpo, firmas, fondo\)/);
  assert.match(lineas, /firmasDeResponsables\(cuerpoCaptura, sesion\.firmas, '#ddebf7'\)/);
  assert.match(lineas, /firmasDeResponsables\(cuerpoCaptura, sesion\.firmas, '#ffffff'\)/);
  assert.match(cap, /'firmas-responsables\.png' : 'firma-responsable\.png'/);
  assert.match(cap, /imagen\('responsable', 'FIRMA RESPONSABLE', nombreFirmaResponsable\), 'FIRMA INSPECTOR'/);
});

test('«quien lo usa» se quitó por completo: ni se lee ni se escribe, y sus columnas se borran con lineasQuitarQuienUsa', () => {
  ['LineasEscritura', 'LineasLectura', 'LineasResguardos', 'LineasRetiro', 'LineasEstructura', 'LineasRegistros', 'LineasCaptura']
    .forEach((f) => assert.doesNotMatch(read('src/services/lineas/' + f + '.gs'), /'(NOMBRE|PUESTO) QUIEN USA'/, f));
  assert.doesNotMatch(read('src/html/js/lineas.html'), /QUIEN USA/);
  const admin = read('src/services/lineas/LineasAdmin.gs');
  assert.doesNotMatch(admin, /QuienUsaASegundo/);
  assert.match(admin, /function lineasQuitarQuienUsa_revisar\(\)/);
  assert.match(admin, /if \(aplicar\) salida\.columnas = LineasDatos\.quitarColumnas\(hoja, columnas\);/);
  const datos = read('src/services/lineas/LineasDatos.gs');
  const q = datos.slice(datos.indexOf('function quitarColumnas('), datos.indexOf('function asegurarPestana('));
  assert.match(q, /\.sort\(\(a, b\) => b - a\)/, 'de derecha a izquierda');
  assert.match(q, /cacheBorrar\('enc_' \+ nombre\);/);
  // La ficha sigue mostrando a los adicionales
  const repo = read('src/services/lineas/LineasRepo.gs');
  assert.match(repo, /rol: 'Responsable ' \+ \(i \+ 2\), nombre: txt\(col\(f, 'NOMBRE ' \+ n \+ ' RESPONSABLE'\)\)/);
  assert.match(read('src/html/js/lineas.html'), /<div class="ln-subtitulo">Responsables adicionales<\/div>/);
});

test('inspección de Reasignar: lo de la responsiva fijo en pantalla (patrón sin trazo, bloqueo sin elegir)', () => {
  const lineas = read('src/html/js/lineas.html');
  assert.match(lineas, /\} else if \(e\.control === 'patron' && e\.soloLectura\) \{/);
  assert.match(lineas, /if \(e\.control === 'patron' && !e\.soloLectura\) \{/);
  assert.match(lineas, /if \(pin\.soloLectura\) Object\.assign\(selector, \{ control: 'texto', soloLectura: true \}\);/);
  assert.match(lineas, /e\.soloLectura && e\.control !== 'calculado' && e\.control !== 'patron' && ocultos\.indexOf\(e\) < 0/);
});
