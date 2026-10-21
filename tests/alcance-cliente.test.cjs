// Rol CLIENT (POST VENTA, 14-oct): solo consulta, y en Vehículos y Líneas solo ve lo de sus departamentos
// (Permisos.alcanceDe). Se filtra en el servidor lo que se regresa, nunca la caché compartida.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const leer = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r/g, '');
const telefonia = leer('src/services/TelefoniaService.gs');

/** Los ayudantes de alcance de TelefoniaService, corridos solos (con el dentroDeAlcance real de Permisos) */
function ayudantes(registros) {
  const permisos = leer('src/services/PermisosService.gs');
  const ini = telefonia.indexOf('  const deptoDeRegistro_ = ');
  const fin = telefonia.indexOf("  const AREA_SECRETOS = 'LINEAS';", ini);
  assert.ok(ini > 0 && fin > ini, 'ayudantes de alcance en TelefoniaService');
  const ctx = vm.createContext({
    LineasRepo: { leerRegistroPorId: (id) => registros[id] || null, convertirRegistro: (f) => f },
  });
  vm.runInContext(permisos + '\n' + telefonia.slice(ini, fin) +
    '\nthis.r = { deptoDeRegistro_, exigirAlcance_, sinAlcance_, filtrarIndice_ };', ctx);
  return ctx.r;
}

const CLIENTE = { alcance: ['POST VENTA'] };
const TODOS = { alcance: null };

test('el índice: equipos, líneas y la vista, solo de sus departamentos', () => {
  const { filtrarIndice_ } = ayudantes({});
  const ix = {
    equipos: { columnas: ['id', 'nuco', 'departamento'], filas: [['R1', '1', 'POST VENTA'], ['R2', '2', 'CONSTRUCCION'], ['R3', '3', 'DISPONIBLE']] },
    lineas: { columnas: ['id', 'numero', 'departamento'], filas: [['R1', '44', 'Post Venta'], ['R4', '55', null]] },
    vista: { columnas: ['NUCO', 'DEPARTAMENTO'], secretas: [], filas: [['R1', '1', 'POST VENTA'], ['R2', '2', 'CONSTRUCCION']] },
    generadoEn: 'x',
  };
  const f = filtrarIndice_(ix, CLIENTE.alcance);
  assert.deepEqual(f.equipos.filas.map((r) => r[0]), ['R1'], 'el de resguardo (DISPONIBLE) ya no es suyo');
  assert.deepEqual(f.lineas.filas.map((r) => r[0]), ['R1'], 'sin acentos ni mayúsculas; sin departamento, no');
  assert.deepEqual(f.vista.filas.map((r) => r[0]), ['R1'], 'la vista: la primera posición es el ID');
  assert.equal(f.generadoEn, 'x');
  assert.equal(ix.equipos.filas.length, 3, 'la caché (el índice original) no se toca');
  assert.equal(filtrarIndice_(ix, null), ix, 'sin alcance, el índice tal cual');
  const sinColumna = filtrarIndice_({ equipos: { columnas: ['id'], filas: [['R1']] }, lineas: null, vista: null }, CLIENTE.alcance);
  assert.equal(sinColumna.equipos.filas.length, 0, 'si falta la columna de departamento, no ve nada');
});

test('la ficha y sus documentos: solo de un registro de su departamento', () => {
  const regs = {
    R1: { equipo: { responsable: { departamento: 'POST VENTA' } } },
    R2: { equipo: { responsable: { departamento: 'CONSTRUCCION' } } },
    R5: { linea: { responsable: { departamento: 'POST VENTA' } } },
  };
  const a = ayudantes(regs);
  assert.equal(a.deptoDeRegistro_(regs.R5), 'POST VENTA', 'una línea suelta: el de su responsable');
  assert.doesNotThrow(() => a.exigirAlcance_(CLIENTE, regs.R1));
  assert.doesNotThrow(() => a.exigirAlcance_(CLIENTE, regs.R5));
  assert.throws(() => a.exigirAlcance_(CLIENTE, regs.R2), /No tienes acceso a este registro/);
  assert.throws(() => a.exigirAlcance_(CLIENTE, null), /No tienes acceso/, 'sin registro no se sabe de quién es');
  assert.doesNotThrow(() => a.exigirAlcance_(TODOS, regs.R2), 'sin alcance no se revisa');
  assert.throws(() => a.sinAlcance_(CLIENTE), /No tienes acceso a esta parte de Líneas/);
  assert.equal(a.sinAlcance_(TODOS), TODOS);
});

test('toda lectura de Líneas pasa por el alcance', () => {
  // Una función nueva que lea con leer_ debe filtrar, revisar el registro, negarse al rol CLIENT o pasarle
  // su alcance a quien arma la respuesta (exportarBase → LineasExportar)
  // (registrarMediciones y pasosServidor son el medidor de tiempos del DEV: no regresan datos de nadie)
  const NO_SON_DE_UN_DEPARTAMENTO = ['permisos', 'catalogos', 'colaboradores', 'registrarMediciones', 'pasosServidor'];
  const funciones = telefonia.split(/\n  function /).slice(1).map((t) => ({ nombre: t.match(/^(\w+)/)[1], cuerpo: t }));
  // Lee quien pide leer: con leer_ (cualquier pantalla de Líneas), su sección o un módulo (permisos en árbol)
  const leen = funciones.filter((f) => /\bleer_\(token\)|\bleerSeccion_\(token|Permisos\.puedeLeer\(token/.test(f.cuerpo) &&
    NO_SON_DE_UN_DEPARTAMENTO.indexOf(f.nombre) === -1);
  assert.ok(leen.length >= 12, leen.length + ' funciones leen');
  const sueltas = leen.filter((f) => !/exigirAlcance_|filtrarIndice_|sinAlcance_|documento_\(token|, sesion\.alcance[,)]/.test(f.cuerpo));
  assert.deepEqual(sueltas.map((f) => f.nombre), [], 'leen Líneas sin revisar el alcance del rol CLIENT');
  assert.match(telefonia, /function notificaciones\(token, limite\) \{[^}]*Permisos\.alcanceDe\(sesion\.correo\)/,
    'la campana de Líneas sale vacía para un CLIENT');
  assert.match(telefonia, /function bandejaResguardos\(token\) \{\s+const sesion = sinAlcance_\(/);
  // Sin historial (usuario, 14-oct): el pasado del registro puede ser de otro departamento; ni el directorio de CH
  ['historial', 'asignaciones', 'evidencias', 'documento_', 'ultimoDocumentoNuco', 'colaboradores', 'panorama', 'bitacora'].forEach((n) => {
    const f = funciones.find((x) => x.nombre === n);
    assert.ok(f && /sinAlcance_\(/.test(f.cuerpo), n + ' se le niega al rol CLIENT');
  });
  // Y la pantalla no pinta las pestañas ni los botones que no va a poder abrir
  const lineas = leer('src/html/js/lineas.html');
  // Documentos e Historial: su sección (permisos en árbol). Nunca para un CLIENT: no respetan el alcance, así que al
  // limitado se le resuelven Sin acceso (lo revisa abajo «Modulos: Documentos e Historial sin alcance»)
  assert.match(lineas, /const veDocumentos = \(\) => veSeccion\('documentos'\);/);
  assert.match(lineas, /const veHistorial = \(\) => veSeccion\('historial'\);/);
  const modulos = leer('src/config/Modulos.gs');
  ['documentos', 'historial'].forEach((s) => assert.match(modulos, new RegExp("\\{ id: '" + s + "', etiqueta: '[^']+', icono: '[^']+' \\}"), s + ' sin alcance: true'));
  assert.match(leer('src/services/PermisosService.gs'), /if \(limitado && !Modulos\.respetaAlcance\(m\)\) v = NINGUNO;/);
  // Los permisos de Líneas salen de la sesión, sin otra llamada (fase 5.1)
  assert.doesNotMatch(lineas, /apiLineasPermisos|memoria\.permisos/);
  assert.match(lineas, /function cargarEvidencias\(id\) \{\s+if \(!veDocumentos\(\)\) return;/);
  assert.match(lineas, /function cargarHistorial\(id, nombre, vista\) \{\s+if \(!veHistorial\(\)\) return;/);
  assert.match(lineas, /function botonUltimoNucos\(tipo, id\) \{\s+if \(!veDocumentos\(\)\) return '';/);
  assert.match(lineas, /pasado && \{ id: 'historial', titulo: 'Historial', icono: 'history'/);
  // El directorio de CH que piden los formularios de Vehículos (solo pedía sesión)
  assert.match(leer('src/services/CapitalHumano.gs'),
    /function listarColaboradores\(token\) \{\s+const sesion = Auth\.validarSesion\(token\);[^\n]*\n[^\n]*\n\s+if \(Permisos\.alcanceDe\(sesion\.correo\)\) return \[\];/);
  assert.match(leer('src/services/lineas/LineasCorrecciones.gs'), /puedeLeer\(token, 'correcciones-lineas'\);\s+\/\/[^\n]*\n\s+if \(sesion\.alcance\) throw/);
  assert.match(leer('src/services/lineas/LineasExportar.gs'), /if \(alcance && tablas\.some/, 'exportar: solo el inventario');
});

test('Vehículos: todas sus listas llevan el alcance, y la búsqueda a mano también', () => {
  const v = leer('src/services/VehiculosService.gs');
  const def = v.slice(v.indexOf('  const VEHICULOS = {'), v.indexOf('alCrear:', v.indexOf('  const VEHICULOS = {')));
  assert.match(def, /alcance: 'DEPARTAMENTO'/);
  ['BASICO', 'RESUMEN', 'SEGURO'].forEach((n) => {
    const i = v.indexOf('  const ' + n + ' = ');
    assert.ok(i > 0 && v.slice(i, i + 60).indexOf('Object.assign({}, VEHICULOS,') !== -1, n + ' hereda de VEHICULOS (y su alcance)');
    const bloque = v.slice(i, v.indexOf('\n  });', i));
    assert.ok(!/alcance:/.test(bloque), n + ' no le quita el alcance');
    // fila() regresa DEPARTAMENTO: es el campo que se filtra
    assert.match(bloque, /DEPARTAMENTO: r\['DEPARTAMENTO'\]/, n + ' regresa DEPARTAMENTO');
  });
  assert.match(v, /function buscarPor_\(token, columna, valor\) \{[\s\S]*?Permisos\.dentroDeAlcance\(sesion\.alcance/);
  // Lo que se lee de la carpeta de un NUCO (documentos, inspecciones y sus fotos): solo de un vehículo suyo
  const api = leer('src/ClientApi.gs');
  ['apiDocumentosVehiculo', 'apiInspeccionesExpediente', 'apiFotosInspeccion'].forEach((f) =>
    assert.match(api, new RegExp('function ' + f + '\\(token, nucco[^)]*\\) \\{\\s+(const sesion = Permisos\\.puedeLeer\\([^;]+;\\s+exigirNuccoEnAlcance_\\(sesion|exigirNuccoEnAlcance_\\()'), f));
  assert.match(api, /function exigirNuccoEnAlcance_\(sesion, token, nucco\) \{\s+if \(sesion\.alcance && !VehiculosService\.nuccoEnAlcance\(token, nucco\)\)/);
  assert.match(leer('src/services/lineas/LineasAccesorios.gs'), /if \(sesion\.alcance\) throw new Error\('No tienes acceso a esta parte de Líneas\.'\);/);
  // La pestaña Adquisición de la ficha (13-oct): por serie, y por la liga de su carpeta. Con el permiso de
  // Adquisición, no el de Vehículos (14-oct: POST VENTA, sin Adquisición, la veía)
  const adq = leer('src/services/AdquisicionVehicularService.gs');
  assert.match(adq, /function buscar\(token, serie\) \{\s+const sesion = Permisos\.puedeLeer\(token, 'adquisicion-vehicular'\);/);
  assert.match(adq, /function archivos\(token, liga\) \{\s+const sesion = Permisos\.puedeLeer\(token, 'adquisicion-vehicular'\);/);
  assert.match(leer('src/html/js/app.html'), /permisoDe\('adquisicion-vehicular'\) && \{ id: 'adquisicion', titulo: 'Adquisición'/);
  assert.match(adq, /function buscar\(token, serie\) \{[\s\S]*?sesion\.alcance && !VehiculosService\.serieEnAlcance/);
  assert.match(adq, /function archivos\(token, liga\) \{[\s\S]*?if \(sesion\.alcance\) \{[\s\S]*?serieEnAlcance/);
});

test('la firma del Inicio y la campanita separa a un CLIENT de quien ve los mismos módulos', () => {
  assert.match(leer('src/services/PermisosService.gs'), /function firmaDeLectura\(correo\) \{[\s\S]*?alcanceDe\(correo\)/);
});
