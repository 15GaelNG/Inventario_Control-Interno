// Pendiente 2.54 (usuario, 19-oct): la responsiva y la inspección piden EXACTAMENTE los mismos datos del responsable
// (número de empleado, nombre, puesto, departamento, área, sede, oficina, jefe directo, director y correo), llenados igual
// desde la ficha o Capital Humano. La única diferencia: la responsiva pide la identificación y permite subir la INE. La
// responsiva es la que cambia al responsable (pendiente 2.49), así que ahora también guarda el jefe directo en la ficha.
// Obligatorio lo que Capital Humano siempre trae; jefe directo, director y correo pueden venir vacíos de CH y no lo son.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const LINEAS = require('./lineas-fuente');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function captura() {
  const ctx = vm.createContext({
    console, Utilities: { formatDate: () => '2026-10-19T12:00' },
    LineasRegistros: { camposAdicionales: () => [] },
    LineasRepo: { CATALOGO: { accesorios: ['CUBO'] }, TAB: { INSP: 'INSP', RESP: 'RESP' }, catalogos: () => ({}) },
    LineasDatos: { nuevoId: () => 'X-1' }, LineasFirmas: { tiene: () => false },
    LineasUtil: { col: (f, c) => (c in f ? f[c] : null), nucoVisible: (v) => (v ? String(v) : null), sinCargador: (v) => v },
  });
  vm.runInContext(read('src/services/lineas/LineasChecklist.gs') + '\n' + read('src/services/lineas/LineasCaptura.gs') + '\nthis.C = LineasCaptura;', ctx);
  return ctx.C;
}
const C = captura();
const CATALOGOS = { puestos: ['GERENTE'], departamentos: ['VENTAS'], areas: ['NORTE'], sedes: ['QUERETARO'], oficinas: ['CENTRO'],
  jefes: ['LUIS'], directores: ['EVA'] };
const FICHA = { ID: 'EQU-1', NUCO: '12', TIPO: 'EQUIPO + SIM', EQUIPO: 'MOTO G', IMEI: '35', 'ESTATUS EQUIPO': 'USO', 'NUMERO TELEFONO': '442',
  'NO EMPLEADO': 'AC1', RESPONSABLE: 'ANA', PUESTO: 'GERENTE', DEPARTAMENTO: 'VENTAS', AREA: 'NORTE', SEDE: 'QUERETARO',
  'OFICINA / DESARROLLO': 'CENTRO', 'JEFE DIRECTO': 'LUIS', DIRECTOR: 'EVA', 'CUENTA GOOGLE': 'ana@x.mx' };
const PERSONA = ['No EMPLEADO', 'RESPONSABLE', 'PUESTO', 'DEPARTAMENTO', 'AREA', 'SEDE', 'OFICINA / DESARROLLO', 'JEFE DIRECTO', 'DIRECTOR', 'CORREO'];

/** Los campos que van entre el título RESPONSABLE y el siguiente título, como los ve la pantalla. */
function responsable(elementos) {
  const i = elementos.findIndex((e) => e.tipo === 'titulo' && e.texto === 'RESPONSABLE');
  const fin = elementos.findIndex((e, k) => k > i && e.tipo === 'titulo');
  return elementos.slice(i + 1, fin < 0 ? undefined : fin);
}
const inspeccion = (fila, enAccion, deResponsiva) => responsable(C._formularioInspeccion(fila, CATALOGOS, { nombre: 'CI' }, 'INS-1', new Date(), enAccion, deResponsiva));
const responsiva = (fila, modo) => responsable(C._formularioResponsiva(fila, CATALOGOS, { nombre: 'CI' }, 'RES-1', new Date(), modo || 'RESPONSIVA', null, false));
const porColumna = (campos) => Object.fromEntries(campos.map((e) => [e.columna, e]));
const columnas = (campos) => JSON.parse(JSON.stringify(campos.map((e) => e.columna)));
// Lo que importa de cada campo para comparar los dos formularios (sin las referencias del contexto de vm)
const forma = (e) => JSON.parse(JSON.stringify({ columna: e.columna, etiqueta: e.etiqueta, control: e.control, requerido: e.requerido || '',
  valor: e.valor, opciones: e.opciones, sugerencias: e.sugerencias, autollenar: e.autollenar, llenarVacios: !!e.llenarVacios, literal: !!e.literal }));

test('los mismos datos del responsable, en el mismo orden, en la inspección y la responsiva', () => {
  const insp = inspeccion(FICHA, false, null);
  const resp = responsiva(FICHA);
  assert.deepEqual(columnas(insp), PERSONA);
  // La única diferencia: la identificación de la responsiva (su tipo y la INE), después del nombre
  assert.deepEqual(columnas(resp), PERSONA.slice(0, 2).concat(['IDENTIFICACION', '_IDENTIFICACION_0'], PERSONA.slice(2)));
  const sinIdentificacion = resp.filter((e) => !/IDENTIFICACION/.test(e.columna));
  assert.deepEqual(sinIdentificacion.map(forma), insp.map(forma));
});

test('obligatorio lo que Capital Humano siempre trae; jefe directo, director y correo no (usuario, 19-oct)', () => {
  [inspeccion(FICHA, false, null), responsiva(FICHA)].forEach((campos, k) => {
    const c = porColumna(campos);
    ['No EMPLEADO', 'RESPONSABLE', 'PUESTO', 'DEPARTAMENTO', 'AREA', 'SEDE', 'OFICINA / DESARROLLO']
      .forEach((col) => assert.equal(c[col].requerido, 'SIEMPRE', ['inspección', 'responsiva'][k] + ' ' + col));
    ['JEFE DIRECTO', 'DIRECTOR', 'CORREO'].forEach((col) => assert.equal(c[col].requerido, 'NUNCA', ['inspección', 'responsiva'][k] + ' ' + col));
  });
  // La identificación sigue obligatoria y la INE opcional (solo en la responsiva)
  const r = porColumna(responsiva(FICHA));
  assert.equal(r['IDENTIFICACION'].requerido, 'SIEMPRE');
  assert.equal(r['_IDENTIFICACION_0'].control, 'identificacion');
  // Sin persona, un dato vacío de CH impide guardar solo si es obligatorio
  const valores = { 'No EMPLEADO': 'AC1', RESPONSABLE: 'ANA', PUESTO: 'GERENTE', DEPARTAMENTO: 'VENTAS', AREA: 'NORTE', SEDE: 'QUERETARO',
    'OFICINA / DESARROLLO': 'CENTRO', 'JEFE DIRECTO': '', DIRECTOR: '', CORREO: '' };
  const vacia = Object.assign({}, FICHA, { 'ESTATUS EQUIPO': 'RESGUARDO' });
  const campos = responsable(C._formularioResponsiva(vacia, CATALOGOS, { nombre: 'CI' }, 'RES-1', new Date(), 'RESPONSIVA', null, false));
  assert.deepEqual(JSON.parse(JSON.stringify(C._validar(campos, Object.assign({ IDENTIFICACION: 'INE' }, valores), {}).errores)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(C._validar(campos, Object.assign({ IDENTIFICACION: 'INE' }, valores, { PUESTO: '' }), {}).errores)), ['Puesto es obligatorio']);
});

test('se llenan igual: de la ficha y, al elegir a la persona, de Capital Humano (con su jefe y su director)', () => {
  const c = porColumna(inspeccion(FICHA, false, null));
  assert.equal(c['No EMPLEADO'].valor, 'AC1');
  assert.equal(c['JEFE DIRECTO'].valor, 'LUIS');
  assert.equal(c['DIRECTOR'].valor, 'EVA');
  assert.equal(c['CORREO'].valor, 'ana@x.mx');
  const auto = JSON.parse(JSON.stringify(c['RESPONSABLE'].autollenar));
  assert.deepEqual(auto, { 'No EMPLEADO': 'noEmpleado', PUESTO: 'puesto', DEPARTAMENTO: 'departamento', AREA: 'area', SEDE: 'sede',
    'OFICINA / DESARROLLO': 'oficina', 'JEFE DIRECTO': 'jefe', DIRECTOR: 'director', CORREO: 'correo' });
  assert.equal(JSON.parse(JSON.stringify(c['No EMPLEADO'].autollenar)).RESPONSABLE, 'nombre');
  assert.deepEqual(JSON.parse(JSON.stringify(c['JEFE DIRECTO'].opciones)), ['LUIS']);
  assert.deepEqual(JSON.parse(JSON.stringify(c['DIRECTOR'].opciones)), ['EVA']);
});

test('dentro de la responsiva (reasignación), la inspección empieza con su jefe directo y su director', () => {
  const desdeResponsiva = { valores: { 'No EMPLEADO': 'BC2', RESPONSABLE: 'BETO', 'JEFE DIRECTO': 'JEFA NUEVA', DIRECTOR: 'DIR NUEVO', CORREO: 'beto@x.mx' } };
  const c = porColumna(inspeccion(FICHA, false, desdeResponsiva));
  assert.equal(c['No EMPLEADO'].valor, 'BC2');
  assert.equal(c['RESPONSABLE'].valor, 'BETO');
  assert.equal(c['JEFE DIRECTO'].valor, 'JEFA NUEVA');
  assert.equal(c['DIRECTOR'].valor, 'DIR NUEVO');
  assert.equal(c['CORREO'].valor, 'beto@x.mx');
});

test('Mandar a resguardo: en blanco, solo personas de procesos; Vincular: nombre y número fijos', () => {
  const r = porColumna(inspeccion(FICHA, true, null));
  PERSONA.forEach((col) => assert.equal(r[col].valor, '', col));
  assert.equal(r['RESPONSABLE'].soloLista, true);
  assert.ok(r['RESPONSABLE'].opciones.length > 0);
  // El número sale de la persona de procesos elegida: sin su propia lista, para no elegir a alguien de fuera
  assert.equal(r['No EMPLEADO'].sugerencias, undefined);
  assert.equal(r['No EMPLEADO'].autollenar, undefined);
  const v = porColumna(responsiva(FICHA, 'LINEA'));
  assert.equal(v['No EMPLEADO'].soloLectura, true);
  assert.equal(v['RESPONSABLE'].soloLectura, true);
  assert.equal(v['JEFE DIRECTO'].soloLectura, false);
});

test('al guardar: la inspección pasa también número y director a la ficha; las hojas reciben sus columnas nuevas', () => {
  const cap = read('src/services/lineas/LineasCaptura.gs');
  const copia = cap.slice(cap.indexOf('const COPIA_INSPECCION_A_LINEA'), cap.indexOf('const ACCESOS_INSPECCION'));
  assert.match(copia, /\['NO EMPLEADO', 'No EMPLEADO'\], \['DIRECTOR', 'DIRECTOR'\]/);
  assert.match(cap, /const COLUMNAS_NUEVAS = \{ INSPECCION: \['No EMPLEADO', 'DIRECTOR', 'ACCESORIOS'\], RESPONSIVA: \['JEFE DIRECTO'\] \};/);
  assert.match(cap, /const nuevas = COLUMNAS_NUEVAS\.INSPECCION\.filter\(\(c\) => fila\[c\]\);\s+if \(nuevas\.length\) LineasDatos\.asegurarColumnas\(LineasRepo\.TAB\.INSP, nuevas\);\s+LineasDatos\.agregarFilas\(LineasRepo\.TAB\.INSP/);
  assert.match(cap, /const nuevas = COLUMNAS_NUEVAS\.RESPONSIVA\.filter\(\(c\) => fila\[c\]\);\s+if \(nuevas\.length\) LineasDatos\.asegurarColumnas\(LineasRepo\.TAB\.RESP, nuevas\);\s+LineasDatos\.agregarFilas\(LineasRepo\.TAB\.RESP/);
  // La responsiva guarda el jefe directo en la ficha, como lo demás de la persona (renovación y reasignación)
  assert.match(read('src/services/lineas/LineasAcciones.gs'), /\['OFICINA \/ DESARROLLO', 'OFICINA \/ DESARROLLO'\], \['JEFE DIRECTO', 'JEFE DIRECTO'\], \['DIRECTOR', 'DIRECTOR'\]/);
});

test('al elegir a otra persona, lo que Capital Humano no tiene de ella queda vacío, no lo de la anterior (19-oct)', () => {
  // Caso del 19-oct: de EMMANUEL (con correo) a ABED (sin CORREO EMPRESARIAL en CH); el correo de Emmanuel se quedaba
  const cliente = LINEAS;
  const inicio = cliente.indexOf('alElegir: (opcion) => {') + 'alElegir: (opcion) => {'.length;
  const cuerpoFn = cliente.slice(inicio, cliente.indexOf('\n          },\n', inicio));
  const alElegir = new Function('e', 'cuerpo', 'input', 'CampoAuto', 'CSS', 'Event', 'opcion', cuerpoFn);
  const campos = { CORREO: { value: 'auxiliar7datos.ci@ciudadmaderas.com' }, 'JEFE DIRECTO': { value: 'KARLA' }, PUESTO: { value: 'AUXILIAR' },
    DIRECTOR: { value: 'FIJO', readOnly: true } };
  Object.values(campos).forEach((c) => { c.dispatchEvent = () => {}; });
  const cuerpo = { querySelector: (sel) => campos[/data-columna="([^"]+)"/.exec(sel)[1]] || null };
  const CampoAuto = { llenar: (el, v) => { el.value = v; } };
  const e = { autollenar: { CORREO: 'correo', 'JEFE DIRECTO': 'jefe', PUESTO: 'puesto', DIRECTOR: 'director' } };
  alElegir(e, cuerpo, { dispatchEvent: () => {} }, CampoAuto, { escape: (s) => s }, function () {}, { datos: { puesto: 'ANALISTA', correo: '', jefe: null } });
  assert.equal(campos.PUESTO.value, 'ANALISTA');
  assert.equal(campos.CORREO.value, '');
  assert.equal(campos['JEFE DIRECTO'].value, '');
  assert.equal(campos.DIRECTOR.value, 'FIJO', 'lo fijo no se toca');
  // Al abrir (llenarVacios) solo se llenan los vacíos: eso no cambia
  assert.match(cliente, /if \(!destino \|\| destino\.disabled \|\| destino\.readOnly \|\| !valor \|\| String\(destino\.value \|\| ''\)\.trim\(\)\) return;/);
});
