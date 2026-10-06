// Firma guardada de quien captura en Líneas (usuario, 6-oct): DAFNE, GAMALIEL y YOVANNI. Va cifrada en las propiedades del
// proyecto, nunca llega a la pantalla y solo se usa la del usuario de la sesión. Al terminar Reasignar se ofrecen los dos PDF.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// Utilities de Apps Script con bytes con signo (-128…127), como los regresa Google
const conSigno = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
const aBuffer = (v) => (typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map((b) => b & 255)));
function cargar() {
  const guardadas = {};
  const Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, v) => conSigno(crypto.createHash('sha256').update(aBuffer(v)).digest()),
    computeHmacSha256Signature: (v, k) => conSigno(crypto.createHmac('sha256', aBuffer(k)).update(aBuffer(v)).digest()),
    base64Encode: (b) => aBuffer(b).toString('base64'),
    base64Decode: (s) => conSigno(Buffer.from(s, 'base64')),
    getUuid: () => crypto.randomUUID(),
    newBlob: (s) => ({ getBytes: () => conSigno(Buffer.from(s, 'utf8')) }),
  };
  const PropertiesService = { getScriptProperties: () => ({
    getProperty: (k) => (k in guardadas ? guardadas[k] : null),
    setProperty: (k, v) => { guardadas[k] = v; },
    setProperties: (o) => Object.assign(guardadas, o),
    deleteProperty: (k) => { delete guardadas[k]; },
    getProperties: () => Object.assign({}, guardadas),
  }) };
  const ctx = vm.createContext({ Utilities, PropertiesService, JSON, Date, Math, Object, Array, String });
  vm.runInContext(read('src/services/lineas/LineasFirmas.gs') + '\nthis.F = LineasFirmas;', ctx);
  return { F: ctx.F, guardadas };
}

test('se guarda cifrada y regresa igual; las propiedades no traen la imagen ni el correo en la llave', () => {
  const { F, guardadas } = cargar();
  const png = conSigno(crypto.randomBytes(12554)); // del tamaño de la más grande
  png[0] = -119; // 0x89 de un PNG
  assert.equal(F.tiene('ejecutivotelefonia.ci@ciudadmaderas.com'), false);
  F.guardar('Ejecutivotelefonia.ci@ciudadmaderas.com ', png);
  assert.equal(F.tiene('ejecutivotelefonia.ci@ciudadmaderas.com'), true);
  assert.equal(F.png('EJECUTIVOTELEFONIA.CI@ciudadmaderas.com'), Buffer.from(png.map((b) => b & 255)).toString('base64'));
  const llaves = Object.keys(guardadas);
  assert.ok(llaves.includes('LINEAS_FIRMAS_CLAVE'));
  assert.ok(llaves.every((k) => !/@/.test(k)), 'el correo no va en la llave');
  const original = Buffer.from(png.map((b) => b & 255)).toString('base64');
  assert.ok(Object.values(guardadas).every((v) => v.indexOf(original.slice(0, 40)) < 0), 'la imagen no se guarda tal cual');
  assert.ok(Object.values(guardadas).every((v) => v.length <= 9000), 'cada propiedad cabe (9 KB)');
  assert.deepEqual(F.lista().map((x) => x.correo), ['ejecutivotelefonia.ci@ciudadmaderas.com']);
  // Otra persona no tiene
  assert.equal(F.png('auxiliar3procesos.ci@ciudadmaderas.com'), null);
  assert.equal(F.png(''), null);
});

test('si alguien cambia lo guardado, no se usa; sin la clave tampoco', () => {
  const { F, guardadas } = cargar();
  F.guardar('a@ciudadmaderas.com', conSigno(crypto.randomBytes(500)));
  const parte = Object.keys(guardadas).find((k) => /_P0$/.test(k));
  const o = JSON.parse(guardadas[parte]);
  const c = Buffer.from(o.c, 'base64'); c[10] ^= 1; o.c = c.toString('base64');
  guardadas[parte] = JSON.stringify(o);
  assert.throws(() => F.png('a@ciudadmaderas.com'), /integridad/);
  delete guardadas.LINEAS_FIRMAS_CLAVE;
  assert.equal(F.tiene('a@ciudadmaderas.com'), false);
  assert.equal(F.png('a@ciudadmaderas.com'), null);
});

test('quitar borra todas sus partes; reemplazar no deja partes viejas', () => {
  const { F, guardadas } = cargar();
  F.guardar('a@ciudadmaderas.com', conSigno(crypto.randomBytes(20000)));
  F.guardar('a@ciudadmaderas.com', conSigno(crypto.randomBytes(300)));
  assert.equal(Object.keys(guardadas).filter((k) => /^LINEAS_FIRMA_/.test(k)).length, 2, 'meta y una parte');
  F.quitar('a@ciudadmaderas.com');
  assert.deepEqual(Object.keys(guardadas), ['LINEAS_FIRMAS_CLAVE']);
});

test('la imagen solo la usa el servidor, con el correo de la sesión; la pantalla solo sabe que hay una', () => {
  const todo = fs.readdirSync(path.join(__dirname, '../src'), { recursive: true }).filter((f) => /\.(gs|html)$/.test(f))
    .map((f) => [f.replace(/\\/g, '/'), read('src/' + f)]);
  const conPng = todo.filter(([, s]) => /LineasFirmas\.png\(/.test(s)).map(([f]) => f);
  assert.deepEqual(conPng, ['services/lineas/LineasCaptura.gs']);
  const cap = read('src/services/lineas/LineasCaptura.gs');
  assert.match(cap, /const png = LineasFirmas\.png\(usuario && usuario\.correo\);/);
  assert.match(cap, /if \(datos\.usarFirmaGuardada\) datos\.firmaInspectorBase64 = firmaPropia_\(usuario\);/);
  assert.match(cap, /if \(datos\.usarFirmaGuardada\) datos\.firmaCiBase64 = firmaPropia_\(usuario\);/);
  assert.equal((cap.match(/firmaGuardada: LineasFirmas\.tiene\(usuario\.correo\)/g) || []).length, 2);
  // Al regenerar, solo la de quien hizo el documento
  assert.match(cap, /nombreCI === String\(usuario\.nombre \|\| ''\)\.trim\(\)\.toUpperCase\(\)/);
  // La caché junta lo nuevo con lo que ya había (la pantalla no manda la firma guardada)
  assert.match(cap, /Object\.keys\(nuevas\)\.forEach\(\(k\) => \{ if \(nuevas\[k\]\) juntas\[k\] = nuevas\[k\]; \}\);/);
  const lineas = read('src/html/js/lineas.html');
  assert.match(lineas, /function firmaGuardadaEn\(contenedor, nombre, alFirmarAMano\)/);
  assert.match(lineas, /base64: \(\) => Promise\.resolve\(null\) \}/);
  assert.match(lineas, /usarFirmaGuardada: !!firmaInspector\.guardada,/);
  assert.match(lineas, /usarFirmaGuardada: !!firmaCi\.guardada,/);
  // Carga: desde una carpeta privada, por correo de USUARIOS, y no si está compartida
  const admin = read('src/services/lineas/LineasAdmin.gs');
  assert.match(admin, /function lineasFirmasGuardadas_revisar\(\)/);
  assert.match(admin, /if \(aplicar && salida\.compartida\) throw/);
  assert.match(admin, /ese correo no está en USUARIOS/);
});

test('al terminar Reasignar se ofrecen los dos PDF, cada uno con su nombre', () => {
  const lineas = read('src/html/js/lineas.html');
  assert.match(lineas, /flujo\.resolver\(Object\.assign\(\{\}, r, \{ pdfPromesa: pdf \}\)\);/);
  assert.match(lineas, /pdfInspeccion = r\.pdfPromesa \|\| null;/);
  assert.match(lineas, /refrescarDespuesDeCaptura\(fila\.id, 'RESPONSIVA', r\.id, false, pdfInspeccion \? \{ promesa: pdfInspeccion, texto: 'Ver PDF de la inspección' \} : null\);/);
  assert.match(lineas, /tipo === 'INSPECCION' \? 'Ver PDF de la inspección' : 'Ver PDF de la responsiva'/);
  assert.match(lineas, /conOtro \? 'Tus PDF están listos' : 'Tu PDF está listo'/);
});
