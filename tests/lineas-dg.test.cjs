const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const LINEAS = require('./lineas-fuente');

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
  const cliente = LINEAS;
  assert.match(cliente, /const bloqueadoDG = \(r\) => !!\(r && \(r\.dg \|\| r\._dgOculto\)\) && !esAdmin\(\);/);
  assert.match(cliente, /const operar = \(f\) => puedeOperar\(\) && !\(f \|\| \[\]\)\.some\(bloqueadoDG\);/);
  assert.match(cliente, /if \(e\._dgOculto\) return;/);
});

// Pendiente 8.20 (usuario, 23-oct: «Sí, quítalos para DG»): a quien no es ADMIN, la ficha de DG solo con General y sin
// «Última responsiva / inspección» (salían y se quedaban en «Cargando…»: el servidor los rechaza con sinDG_)
test('DG: sin Documentos, Historial ni «Última responsiva / inspección» a quien no es ADMIN', () => {
  const cliente = LINEAS;
  assert.match(cliente, /function pestanasFicha\(general, conDocumentos\) \{[\s\S]*?const pasado = conDocumentos && veHistorial\(\);\s*conDocumentos = conDocumentos && veDocumentos\(\);/);
  assert.match(cliente, /'<\/div>', !e\._dgOculto\);/);
  assert.match(cliente, /'<\/div>', !l\._dgOculto\);/);
  assert.doesNotMatch(cliente, /pestanasFicha\([\s\S]{0,6000}?'<\/div>', true\);/);
  assert.match(cliente, /if \(e\.nuco && !e\._dgOculto\) precargarUltimosNucos\(id\);/);
  assert.match(cliente, /const conUltimo = \(r\) => tieneNuco\(r\) && !bloqueadoDG\(r\);/);
  assert.match(cliente, /c\.valor = \(r\) => \(conUltimo\(r\) \? titulo : ''\);/);
  assert.match(cliente, /c\.render = \(v, r\) => \(conUltimo\(r\) \? botonUltimoNucos\(tipo, r\.id\) : vacio\);/);
  assert.match(cliente, /if \(conUltimo\(r\)\) precargarUltimosNucos\(r\.id\);/);
  assert.match(cliente, /\(conUltimo\(r\) \? botonUltimoNucos\('RESPONSIVA', r\.id\)/);
  assert.doesNotMatch(cliente, /tieneNuco\(r\) \? botonUltimoNucos|if \(tieneNuco\(r\)\) precargarUltimosNucos/);

  // Las pestañas, armadas como en la ficha: ADMIN (o registro que no es DG) las tres; DG oculto, solo General
  const fuente = cliente.match(/function pestanasFicha\(general, conDocumentos\) \{[\s\S]*?\n {6}\}/)[0];
  const armar = new Function('veHistorial', 'veDocumentos', 'Tabs', 'pila', fuente + '; return pestanasFicha;');
  const pestanas = (con) => armar(() => true, () => true, { html: (t) => t.filter(Boolean).map((p) => p.id) }, [])('g', con);
  assert.deepEqual(pestanas(true), ['general', 'documentos', 'historial']);
  assert.deepEqual(pestanas(false), ['general']);
});

// Usuario, 22-oct: todo el responsable en blanco salvo AREA = DIRECCION GENERAL; solo la lista fija; ADMIN sí modifica
test('DG: solo queda el área; el índice la pone en departamento, la vista y la ficha en AREA', () => {
  // Vista del AppSheet con DEPARTAMENTO, AREA y SEDE: DEPARTAMENTO y SEDE en blanco
  const vcols = ['NUMERO TELEFONO', 'NUCO', 'RESPONSABLE', 'DEPARTAMENTO', 'AREA', 'SEDE', 'ESTATUS LINEA'];
  const vfila = ['E1', '4422798678', '11002', '', '', 'DIRECCION GENERAL', '', 'USO'];
  assert.deepEqual(DG.ocultarRenglon(vcols, vfila, 1), ['E1', '', '11002', 'DG', '', 'DIRECCION GENERAL', '', 'USO']);
  // Índice: departamento = DIRECCION GENERAL en los renglones de DG, para todos; sobre copias
  const ix = { generadoEn: 1, vista: { columnas: [], filas: [] },
    equipos: { columnas: ['id', 'responsable', 'departamento', 'dg'], filas: [['E1', 'DG', null, true], ['E2', 'JUAN', 'TI', false]] },
    lineas: { columnas: ['id', 'departamento', 'dg'], filas: [['L1', '', true]] } };
  const r = DG.conArea(ix);
  assert.deepEqual(r.equipos.filas, [['E1', 'DG', 'DIRECCION GENERAL', true], ['E2', 'JUAN', 'TI', false]]);
  assert.deepEqual(r.lineas.filas, [['L1', 'DIRECCION GENERAL', true]]);
  assert.equal(ix.equipos.filas[0][2], null);
  assert.equal(r.generadoEn, 1);
  const ficha = DG.fichaOculta({ _id: 'E1', nuco: '11002', estatus: 'USO' }, true);
  assert.deepEqual(ficha.responsable, { nombre: 'DG', departamento: '', area: 'DIRECCION GENERAL' });
  // Un registro con área DIRECCION GENERAL fuera de la lista no es DG
  assert.ok(!DG.esRegistro({ nuco: '1667' }, { numero: '4424949487' }));
  const tel = read('src/services/TelefoniaService.gs');
  assert.match(tel, /filtrarIndice_\(LineasDG\.conArea\(LineasRepo\.indice\(\)\), sesion\.alcance\)/);
  assert.match(tel, /LineasDG\.esRegistro\(r\.equipo, r\.linea\) \? LineasDG\.AREA/);
});

test('DG: limpiar-dg.js deja en blanco todo el responsable y solo pone AREA', () => {
  const js = read('tools/lineas-datos/limpiar-dg.js');
  const limpiar = js.match(/const LIMPIAR = (\[[^\]]*\])/)[1];
  ['ID PERSONA', 'NO EMPLEADO', 'RESPONSABLE', 'PUESTO', 'DEPARTAMENTO', 'SEDE', 'OFICINA / DESARROLLO', 'JEFE DIRECTO', 'DIRECTOR', 'CUENTA GOOGLE']
    .forEach((k) => assert.ok(limpiar.indexOf("'" + k + "'") >= 0, k));
  assert.match(js, /const AREA = \['AREA'\];/);
  assert.ok(limpiar.indexOf("'AREA'") < 0);
});

// Auditoría del 23-oct (lineas-revisor): llamadas del servidor que dejaban ver o escribir a quien no es ADMIN
test('DG: formulario, documentos, fotos, PDF, evidencia y panel también piden ser ADMIN', () => {
  const tel = read('src/services/TelefoniaService.gs');
  const fn = (nombre) => tel.slice(tel.indexOf('function ' + nombre + '('), tel.indexOf('\n  }\n', tel.indexOf('function ' + nombre + '(')));
  assert.match(fn('formularioRegistro'), /if \(id\) sinDG_\(sesion, id\);/);
  assert.match(fn('documento_'), /sinDGDocumento_\(sesion, \(\) => doc\);/);
  assert.match(fn('quitarFotoInspeccion'), /sinDGDocumento_\(sesion, \(\) => doc\);/);
  assert.match(fn('fotosInspeccion'), /sinDGDocumento_\(sesion, \(\) => externa \|\| LineasRepo\.leerInspeccion\(id\)\);/);
  assert.match(fn('generarPdf'), /sinDGDocumento_\(sesion, \(\) => \(tipo === 'INSPECCION' \? LineasRepo\.leerInspeccion\(id\) : LineasRepo\.leerResponsiva\(id\)\)\);/);
  assert.match(fn('prepararEvidencia'), /LineasDG\.exigirAdmin\(obj\.fila, usuarioOperacion_\(sesion\)\);/);
  assert.match(fn('vistaQuitarPanel'), /LineasResguardos\.vistaQuitar\(ids, puedeVerSecretos_\(sesion\), usuarioOperacion_\(sesion\)\)/);
  // El panel (formularioResguardo, quitarDelPanel, bandejaResguardos) lleva esAdmin en usuarioResguardo_
  assert.match(tel, /return Object\.assign\(usuarioOperacion_\(sesion\), \{ puedeAprobar:/);
  // sinDGDocumento_: ADMIN no lee el documento; los demás, por el registro al que pertenece
  const sin = tel.slice(tel.indexOf('function sinDGDocumento_('), tel.indexOf('function puedeVerSecretos_('));
  assert.match(sin, /if \(esAdmin_\(sesion\)\) return sesion;/);
  assert.match(sin, /return doc && doc\.registroId \? sinDG_\(sesion, doc\.registroId\) : sesion;/);
  // El renglón del panel: DG, sus estados y el área
  const o = DG.ocultarRenglonPanel({ ID: 'R1', NUCO: '11002', NUMERO: '4422798678', LINEA_AL_MANDAR: '4422798678', MODELO: 'IPHONE', ESTADO: 'EN RESGUARDO', COMENTARIO: 'X' });
  assert.deepEqual(o, { dg: true, ID: 'R1', NUCO: '11002', NUMERO: 'DG', LINEA_AL_MANDAR: 'DG', MODELO: '', ESTADO: 'EN RESGUARDO', COMENTARIO: '', DEPARTAMENTO: 'DIRECCION GENERAL' });
  assert.ok(DG.esRenglonPanel({ NUMERO: '', LINEA_AL_MANDAR: '4461399325' }));
  assert.ok(!DG.esRenglonPanel({ NUCO: '0012', NUMERO: '4421090805' }));
});
