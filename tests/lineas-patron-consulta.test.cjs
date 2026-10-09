// Patrón en la pestaña General y en las capturas (usuario, 5-oct): el trazado en el sistema ("1-5-9") se dibuja; el del
// AppSheet (imagen "INSPECCIONES LINEAS_Images/xxxx.PATRON.123456.png") se pide al servidor mientras PATRON guarde su ruta.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const cliente = read('src/html/js/lineas.html');
const tramo = (desde, hasta) => {
  const i = cliente.indexOf(desde);
  const f = cliente.indexOf(hasta, i);
  assert.ok(i >= 0 && f > i, 'tramo ' + desde);
  return cliente.slice(i, f);
};

function funcionesCliente() {
  const codigo = tramo('    const rutaDeEnlaceAppSheet', '    function botonArchivo(') +
    tramo('    const POSICIONES_PATRON', '    function htmlPatron(') +
    tramo('    function rutaPatronAppSheet(', '    const patronesAppSheet') +
    '\nthis.f = { rutaPatronAppSheet, vistaPatron };';
  const ctx = vm.createContext({
    esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    vacio: '—',
    esPuntosPatron: (v) => /^[1-9](-[1-9])*$/.test(String(v || '')),
    botonArchivo: (ruta, texto) => '[' + texto + ': ' + ruta + ']',
  });
  vm.runInContext(codigo, ctx);
  return ctx.f;
}

const RUTA = 'INSPECCIONES LINEAS_Images/b8c7bc14.PATRON.204214.png';

test('cliente: reconoce las formas en que el AppSheet dejó la ruta del patrón', () => {
  const { rutaPatronAppSheet } = funcionesCliente();
  assert.equal(rutaPatronAppSheet(RUTA), RUTA);
  assert.equal(rutaPatronAppSheet('INSPECCIONES LINEAS::' + RUTA), RUTA);
  assert.equal(rutaPatronAppSheet('https://www.appsheet.com/image/getimageurl?appName=X&tableName=INSPECCIONES%20LINEAS&fileName=INSPECCIONES%20LINEAS_Images%2Fb8c7bc14.PATRON.204214.png&appVersion=1&signature=abc'), RUTA);
  assert.equal(rutaPatronAppSheet('1-5-9'), null);
  assert.equal(rutaPatronAppSheet('••••'), null);
  assert.equal(rutaPatronAppSheet('INSPECCIONES LINEAS_Images/b8c7bc14.FIRMA RESPONSABLE.1.png'), null);
});

test('cliente: los puntos se dibujan, la imagen del AppSheet se pide y lo oculto queda oculto', () => {
  const { vistaPatron } = funcionesCliente();
  const dibujo = vistaPatron('1-5-9');
  assert.match(dibujo, /<svg class="ln-patron-vista"/);
  assert.match(dibujo, /<polyline points="50,50 150,150 250,250" \/>/);
  assert.equal((dibujo.match(/class="ln-patron-marcado"/g) || []).length, 3);
  assert.equal((dibujo.match(/class="ln-patron-inicio"/g) || []).length, 1);
  assert.match(dibujo, /aria-label="Patrón 1 → 5 → 9"/);
  assert.doesNotMatch(dibujo, /<\/svg><span/, 'sin el texto de los puntos debajo del dibujo');
  assert.match(vistaPatron(RUTA), new RegExp('data-ln-patron-appsheet="' + RUTA.replace(/\./g, '\\.') + '"'));
  assert.equal(vistaPatron('••••'), '••••');
  assert.equal(vistaPatron(''), '—');
  assert.equal(vistaPatron(null), '—');
});

test('cliente: General y las capturas muestran el patrón', () => {
  assert.match(cliente, /\['Patrón', vistaPatron\(e\.patronRuta\), true\]/);
  assert.match(cliente, /cargarPatronesAppSheet\(detalle\);/);
  assert.match(cliente, /cargarPatronesAppSheet\(bloque\.parentNode\);/);
  assert.match(cliente, /llamar\('apiLineasPatronAppSheet', ruta\)/);
  assert.doesNotMatch(tramo('    function rutaPatronAppSheet(', '    const patronesAppSheet'), /'https?:\/\//, 'sin "//" en strings de un .html');
});

test('servidor: rutaAppSheet quita el enlace y la tabla delante', () => {
  const LA = new Function('PropertiesService', 'leerConfig_', 'CacheService', 'Utilities', 'DriveApp',
    read('src/services/lineas/LineasArchivos.gs') + '\nreturn LineasArchivos;')({}, () => null, {}, {}, {});
  assert.equal(LA.rutaAppSheet(RUTA), RUTA);
  assert.equal(LA.rutaAppSheet('INSPECCIONES LINEAS::' + RUTA), RUTA);
  assert.equal(LA.rutaAppSheet('https://www.appsheet.com/image/getimageurl?appName=X&fileName=INSPECCIONES%20LINEAS_Images%2Fb8c7bc14.PATRON.204214.png&signature=abc'), RUTA);
  assert.equal(LA.rutaAppSheet('https://www.appsheet.com/template/gettablefileurl?appName=X&fileName=Files%2Fa.pdf'), 'Files/a.pdf');
  assert.equal(LA.rutaAppSheet('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view'), 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view');
});

test('servidor: la imagen del patrón solo la piden ADMIN y el área de Líneas, y solo de un patrón', () => {
  const fuente = read('src/services/TelefoniaService.gs').replace(/\r/g, '');
  const i = fuente.indexOf('  function patronAppSheet(');
  const f = fuente.indexOf('\n  }\n', i);
  assert.ok(i > 0 && f > i);
  const correr = (puede, ruta) => {
    const ctx = vm.createContext({
      leer_: () => ({}), puedeVerSecretos_: () => puede,
      LineasArchivos: { rutaAppSheet: (r) => r, resolver: () => ({ id: 'ID1' }) },
      DriveApp: { getFileById: () => ({ getBlob: () => ({ getContentType: () => 'image/png', getBytes: () => [1, 2, 3] }) }) },
      Utilities: { base64Encode: () => 'AQID' },
    });
    vm.runInContext(fuente.slice(i, f + 4) +'\nthis.r = patronAppSheet("t", ' + JSON.stringify(ruta) + ');', ctx);
    return ctx.r;
  };
  assert.equal(correr(true, RUTA).imagen, 'data:image/png;base64,AQID');
  assert.throws(() => correr(false, RUTA), /administradores y el área de Líneas/);
  assert.throws(() => correr(true, 'Files/RESPONSIVA1.pdf'), /No es un patrón/);
  assert.match(read('src/ClientApi.gs'), /function apiLineasPatronAppSheet\(token, ruta\) \{\s+return TelefoniaService\.patronAppSheet\(token, ruta\);/);
});

test('servidor: el archivo del AppSheet se busca en la carpeta de la app, en la de solo lectura y por su nombre', () => {
  const archivo = (id, nombre, padre) => ({ getId: () => id, getName: () => nombre, getUrl: () => 'u/' + id, getParents: () => iter(padre ? [padre] : []) });
  const iter = (xs) => { let i = 0; return { hasNext: () => i < xs.length, next: () => xs[i++] }; };
  const carpetas = {};
  const carpeta = (id, padre, sub, archivos) => (carpetas[id] = {
    getId: () => id, getParents: () => iter(padre ? [carpetas[padre]] : []),
    getFoldersByName: (n) => iter((sub || {})[n] ? [carpetas[sub[n]]] : []),
    getFilesByName: (n) => iter((archivos || {})[n] ? [archivos[n]] : []),
  });
  carpeta('PRUEBAS', null, {});
  carpeta('PROD', null, { 'INSPECCIONES LINEAS_Images': 'IMGS', OTRA: 'OTRA' });
  carpeta('IMGS', 'PROD', {}, { 'a.PATRON.1.png': archivo('P1', 'a.PATRON.1.png', null) });
  carpeta('OTRA', 'PROD', {});
  carpeta('AJENA', null, {});
  const enOtra = archivo('P2', 'b.PATRON.2.png', carpetas.OTRA);
  const ajeno = archivo('X', 'c.PATRON.3.png', carpetas.AJENA);
  const busquedas = [];
  const memoria = {};
  const LA = new Function('PropertiesService', 'leerConfig_', 'CacheService', 'Utilities', 'DriveApp',
    read('src/services/lineas/LineasArchivos.gs') + '\nreturn LineasArchivos;')(
    {}, (k) => ({ LINEAS_DRIVE_APPSHEET: 'PRUEBAS', LINEAS_DRIVE_APPSHEET_LECTURA: 'PROD' })[k] || null,
    { getScriptCache: () => ({ get: (k) => memoria[k] || null, put: (k, v) => { memoria[k] = v; } }) },
    { base64EncodeWebSafe: (b) => String(b), computeDigest: (a, t) => t, DigestAlgorithm: {}, Charset: {} },
    {
      getFolderById: (id) => carpetas[id],
      searchFiles: (q) => { busquedas.push(q); return iter([ajeno, enOtra].filter((f) => q.indexOf('"' + f.getName() + '"') >= 0)); },
    });
  assert.equal(LA.resolver('INSPECCIONES LINEAS_Images/a.PATRON.1.png', true).id, 'P1', 'en la carpeta de solo lectura');
  assert.equal(busquedas.length, 0, 'encontrado por la ruta: no se busca por nombre');
  assert.equal(LA.resolver('INSPECCIONES LINEAS_Images/b.PATRON.2.png', true).id, 'P2', 'en otra subcarpeta de la app');
  assert.equal(LA.resolver('INSPECCIONES LINEAS_Images/c.PATRON.3.png', true), null, 'nunca fuera de la app');
  assert.match(busquedas[0], /^title = "b\.PATRON\.2\.png" and trashed = false$/);
});

test('servidor: la responsiva pasa al equipo el patrón trazado', () => {
  const captura = read('src/services/lineas/LineasCaptura.gs').replace(/\r/g, '');
  const resp = captura.slice(captura.indexOf('  function guardarResponsiva('), captura.indexOf('  function exigirInspeccion('));
  assert.match(resp, /if \(datos\.patron !== undefined && datos\.patron !== null\) \{\n\s+copia\['PATRON'\] = String\(datos\.patron\);/);
  assert.match(resp, /LineasRepo\.guardarCambiosRegistro\(obj\.fila, copia, usuario, ahora, \{ tolerante: true \}\)/);
  assert.match(read('src/config/Entornos.gs'), /LINEAS_DRIVE_APPSHEET_LECTURA: '1WPFFd4imLiui6zIpAa3OL62ZEu_a5BJn'/);
});

test('cliente: sin patrón no hay campo, y al guardar una captura la ficha se pinta de nuevo', () => {
  assert.match(cliente, /e\.patronRuta \? \['Patrón', vistaPatron\(e\.patronRuta\), true\] : null/);
  assert.match(cliente, /if \(arriba && arriba\.id === idAbierto && \(arriba\.tipo === 'equipo' \|\| arriba\.tipo === 'linea'\)\) abrir\(arriba\.tipo, arriba\.id, true, true\);/);
});

test('cliente: PIN EQUIPO = PATRON con patrón guardado no repite la palabra', () => {
  assert.match(cliente, /!\(e\.patronRuta && \/\^PATR\[OÓ\]N\$\/i\.test\(String\(e\.pinEquipo \|\| ''\)\.trim\(\)\)\)\s+\? \['PIN equipo', e\.pinEquipo\] : null/);
});
