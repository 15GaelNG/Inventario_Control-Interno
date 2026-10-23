// Credenciales (src/services/Credenciales.gs, 23-oct): la huella v2 (PBKDF2-HMAC-SHA256), la migración desde la
// CONTRASEÑA en texto plano y el v1, las reglas de una contraseña nueva y la escritura por CORREO en USUARIOS.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Utilities de Apps Script con crypto de Node: los bytes van con signo (-128..127), como en Apps Script
const conSigno = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));
const aBuffer = (v) => (typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map((b) => (b + 256) % 256)));
const Utilities = {
  computeHmacSha256Signature: (valor, llave) => conSigno(crypto.createHmac('sha256', aBuffer(llave)).update(aBuffer(valor)).digest()),
  newBlob: (texto) => ({ getBytes: () => conSigno(Buffer.from(String(texto), 'utf8')) }),
  getUuid: () => crypto.randomUUID(),
  formatDate: (d) => d.toISOString().slice(0, 10),
};

/** USUARIOS en memoria: encabezados + renglones, con lo que usa Credenciales de una hoja */
function hojaFalsa(encabezados, filas) {
  const datos = [encabezados.slice()].concat(filas.map((f) => encabezados.map((h) => (f[h] === undefined ? '' : f[h]))));
  const hoja = {
    datos,
    getLastRow: () => datos.length,
    getLastColumn: () => datos[0].length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => datos.slice(r - 1, r - 1 + (nr || 1)).map((fila) => fila.slice(c - 1, c - 1 + (nc || 1)).map((x) => (x === undefined ? '' : x))),
      setValues: (v) => v.forEach((fila, i) => fila.forEach((x, j) => { (datos[r - 1 + i] = datos[r - 1 + i] || [])[c - 1 + j] = x; })),
      setValue: (x) => { datos[r - 1][c - 1] = x; },
    }),
  };
  return hoja;
}
const comoObjetos = (hoja) => hoja.datos.slice(1).map((f) => Object.fromEntries(hoja.datos[0].map((h, i) => [h, f[i] === undefined ? '' : f[i]])));

function cargar(hoja, sesion) {
  const cache = {};
  const permisos = [];
  const cerradas = [];
  const correos = [];
  const ctx = vm.createContext({
    Utilities,
    Session: { getScriptTimeZone: () => 'America/Mexico_City' },
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
    Auth: {
      validarSesion: () => { if (!sesion) throw new Error('Sesión expirada'); return sesion; },
      // Lo que cerró cada llamada: { correo, conservar }
      cerrarSesiones: (correo, o) => { cerradas.push({ correo, conservar: o && o.conservar }); return o && o.conservar ? { token: 'token-nuevo' } : null; },
    },
    MailApp: { sendEmail: (m) => correos.push(m) },
    console: { warn: () => {} },
    Permisos: { puedeEditar: (token, modulo) => { permisos.push(modulo); if (token !== 'admin') throw new Error('Sin permiso'); return { correo: 'admin@x.com' }; } },
    Config: { SPREADSHEET_IDS: { USUARIOS: () => 'libro' } },
    SheetUtils: {
      getSheet: () => hoja,
      getAll: () => comoObjetos(hoja),
      indiceDeColumnas: (enc, nombres) => Object.fromEntries(nombres.map((n) => [n, enc.map((e) => String(e).trim().toUpperCase()).indexOf(n.toUpperCase())])),
    },
    Candado: { con: (fn) => fn() },
    CacheHojas: { tocarHoja: () => {} },
    Logger: { log: () => {} },
    soloEditor_: () => {},
  });
  ctx.permisos = permisos;
  ctx.cerradas = cerradas;
  ctx.correos = correos;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'Correos.gs'), 'utf8'), ctx);   // la plantilla de verdad
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'Credenciales.gs'), 'utf8') +
    '\nthis.C = Credenciales; this.revisar = contrasenasAHashRevisar; this.pasar = contrasenasAHash;' +
    ' this.temporalesRevisar = contrasenasTemporalesRevisar; this.temporalesParaTodos = contrasenasTemporalesParaTodos;', ctx);
  return ctx;
}

test('la huella v2 es PBKDF2-HMAC-SHA256 de verdad (igual que crypto.pbkdf2Sync) y cada una lleva su sal', () => {
  const { C } = cargar(hojaFalsa(['CORREO'], []));
  const h = C.crear('Una contraseña larga');
  const [version, iter, sal, hash] = h.split('$');
  assert.equal(version, 'v2');
  assert.equal(Number(iter), C.ITERACIONES);
  assert.equal(hash, crypto.pbkdf2Sync('Una contraseña larga', sal, Number(iter), 32, 'sha256').toString('hex'));
  assert.notEqual(C.crear('Una contraseña larga'), h, 'otra sal, otra huella');
  assert.deepEqual({ ...C.verificar({ PASSWORD_HASH: h }, 'Una contraseña larga') }, { ok: true, migrar: false });
  assert.equal(C.verificar({ PASSWORD_HASH: h }, 'otra').ok, false);
});

test('texto plano y v1 se aceptan y piden pasar a v2; una v2 con menos iteraciones también', () => {
  const { C } = cargar(hojaFalsa(['CORREO'], []));
  assert.deepEqual({ ...C.verificar({ 'CONTRASEÑA': 'vieja123' }, 'vieja123') }, { ok: true, migrar: true });
  assert.equal(C.verificar({ 'CONTRASEÑA': 'vieja123' }, 'otra').ok, false);
  const v1 = Buffer.from(Utilities.computeHmacSha256Signature('clave v1', 'sal-v1').map((b) => (b + 256) % 256)).toString('hex');
  assert.deepEqual({ ...C.verificar({ SALT: 'sal-v1', PASSWORD_HASH: v1 }, 'clave v1') }, { ok: true, migrar: true });
  const debil = 'v2$10$abc$' + crypto.pbkdf2Sync('x1234567890', 'abc', 10, 32, 'sha256').toString('hex');
  assert.deepEqual({ ...C.verificar({ PASSWORD_HASH: debil }, 'x1234567890') }, { ok: true, migrar: true });
  // Un admin escribió una nueva en la hoja a alguien que ya tenía huella: sirve (y se migra)
  assert.deepEqual({ ...C.verificar({ PASSWORD_HASH: C.crear('la de antes 1'), 'CONTRASEÑA': 'la que puso el admin' }, 'la que puso el admin') },
    { ok: true, migrar: true });
  assert.equal(C.verificar({}, '').ok, false, 'sin nada guardado no entra nadie, ni con contraseña vacía');
});

test('guardar escribe la huella por CORREO, borra CONTRASEÑA y crea las columnas que falten', () => {
  const hoja = hojaFalsa(['CORREO', 'NOMBRE', 'CONTRASEÑA'], [
    { CORREO: 'otra@x.com', NOMBRE: 'Otra', 'CONTRASEÑA': 'no tocar' },
    { CORREO: 'Ana@GPH.com ', NOMBRE: 'Ana', 'CONTRASEÑA': 'plana' },
  ]);
  const { C } = cargar(hoja);
  C.guardar('ana@gph.com', 'Nueva contraseña 9', { debeCambiar: true });
  const ana = comoObjetos(hoja)[1];
  assert.equal(ana['CONTRASEÑA'], '', 'la de texto plano se borra');
  assert.match(String(ana.PASSWORD_HASH), /^v2\$/);
  assert.equal(ana['DEBE CAMBIAR CONTRASEÑA'], 'TRUE');
  assert.equal(C.verificar(ana, 'Nueva contraseña 9').ok, true);
  assert.equal(comoObjetos(hoja)[0]['CONTRASEÑA'], 'no tocar', 'los demás renglones quedan igual');
  assert.throws(() => C.guardar('nadie@x.com', 'algo largo 123'), /No existe el usuario/);
});

test('contrasenasAHash: revisar solo cuenta; aplicar pasa todas las de texto plano y no deja ninguna', () => {
  const hoja = hojaFalsa(['CORREO', 'CONTRASEÑA', 'PASSWORD_HASH', 'SALT'], [
    { CORREO: 'a@x.com', 'CONTRASEÑA': 'uno-uno-uno' },
    { CORREO: 'b@x.com', 'CONTRASEÑA': 'dos-dos-dos' },
    { CORREO: 'c@x.com' },
  ]);
  const ctx = cargar(hoja);
  const antes = ctx.revisar();
  assert.equal(antes.planas, 2);
  assert.equal(antes.sinContrasena, 1);
  assert.equal(comoObjetos(hoja)[0]['CONTRASEÑA'], 'uno-uno-uno', 'revisar no cambia nada');
  const r = ctx.pasar();
  assert.equal(r.pasadas, 2);
  const despues = comoObjetos(hoja);
  assert.ok(despues.every((f) => f['CONTRASEÑA'] === ''), 'ninguna en texto plano');
  assert.equal(ctx.C.verificar(despues[1], 'dos-dos-dos').ok, true, 'y la misma contraseña sigue sirviendo');
});

test('reglas de una contraseña nueva (NIST 800-63B): largo, comunes, correo, nombre y distinta de la actual', () => {
  const { C } = cargar(hojaFalsa(['CORREO'], []));
  const motivo = (p, c) => { try { C.revisarNueva(p, c); return 'ok'; } catch (e) { return e.message; } };
  assert.match(motivo('Ay05n!'), /al menos 8/);
  // Como "Ayrt05n!": mayúscula, minúscula, número y símbolo (el espacio no es símbolo)
  assert.match(motivo('ayrt05n!x'), /falta: una mayúscula/);
  assert.match(motivo('AYRT05N!X'), /falta: una minúscula/);
  assert.match(motivo('Ayrtonx!y'), /falta: un número/);
  assert.match(motivo('Ayrt05n x'), /falta: un símbolo/);
  assert.match(motivo('Password123!'), /más usadas/, 'las comunes que sí cumplen la forma también se rechazan');
  assert.match(motivo('Ana.lopez26!', { correo: 'ana.lopez@gph.com' }), /tu correo/);
  assert.match(motivo('Guadalupe9!', { nombre: 'Maria Guadalupe Perez' }), /tu nombre/);
  assert.match(motivo('Misma1!clave', { actual: 'Misma1!clave' }), /distinta/);
  assert.equal(motivo('Ayrt05n!', { correo: 'ana@gph.com', nombre: 'Ana' }), 'ok', 'el ejemplo del área');
});

test('restablecer: solo con EDICIÓN en usuarios; la temporal sirve, la de antes no, y queda "debe cambiar"', () => {
  const hoja = hojaFalsa(['CORREO', 'NOMBRE', 'CONTRASEÑA'], [{ CORREO: 'ana@gph.com', NOMBRE: 'Ana', 'CONTRASEÑA': 'la de antes 123' }]);
  const ctx = cargar(hoja);
  assert.throws(() => ctx.C.restablecer('otro', 'ana@gph.com'), /Sin permiso/);
  assert.deepEqual([...ctx.permisos], ['usuarios']);
  const r = ctx.C.restablecer('admin', 'ANA@gph.com');
  assert.equal(r.correo, 'ana@gph.com');
  assert.match(r.temporal, /^[A-HJ-NP-Za-km-np-z2-9]{10}$/, '10 caracteres sin los que se confunden');
  const ana = comoObjetos(hoja)[0];
  assert.equal(ctx.C.verificar(ana, r.temporal).ok, true);
  assert.equal(ctx.C.verificar(ana, 'la de antes 123').ok, false);
  assert.equal(ana['DEBE CAMBIAR CONTRASEÑA'], 'TRUE');
  assert.notEqual(ctx.C.restablecer('admin', 'ana@gph.com').temporal, r.temporal, 'cada una distinta');
});

test('cambiar la mía: pide la actual (5 errores y espera), revisa las reglas y quita el "debe cambiar"', () => {
  const hoja = hojaFalsa(['CORREO', 'NOMBRE', 'CONTRASEÑA', 'DEBE CAMBIAR CONTRASEÑA'],
    [{ CORREO: 'ana@gph.com', NOMBRE: 'Ana', 'CONTRASEÑA': 'actual 12345', 'DEBE CAMBIAR CONTRASEÑA': 'TRUE' }]);
  const { C } = cargar(hoja, { correo: 'ana@gph.com' });
  assert.throws(() => C.cambiarMia('t', 'actual 12345', 'corta'), /al menos 8/);
  for (let i = 0; i < 5; i++) assert.throws(() => C.cambiarMia('t', 'mala', 'Nuev4 clave!'), /actual no es correcta/);
  assert.throws(() => C.cambiarMia('t', 'actual 12345', 'Nuev4 clave!'), /Demasiados intentos/);
  const otra = cargar(hoja, { correo: 'ana@gph.com' }).C;   // otra ejecución, sin la cuenta de errores
  const r = otra.cambiarMia('t', 'actual 12345', 'Nuev4 clave!');
  assert.equal(r.ok, true);
  assert.equal(r.sesion.token, 'token-nuevo', 'quien la cambió sigue, con un token nuevo');
  const ana = comoObjetos(hoja)[0];
  assert.equal(otra.verificar(ana, 'Nuev4 clave!').ok, true);
  assert.equal(ana['DEBE CAMBIAR CONTRASEÑA'], '');
  assert.equal(ana['CONTRASEÑA'], '');
});

test('quien solo entraba con Google crea su contraseña sin "actual"; sin sesión, nada', () => {
  const hoja = hojaFalsa(['CORREO', 'NOMBRE'], [{ CORREO: 'beto@ciudadmaderas.com', NOMBRE: 'Beto' }]);
  const { C } = cargar(hoja, { correo: 'beto@ciudadmaderas.com' });
  const antes = C.estado('t');
  assert.equal(antes.tieneContrasena, false);
  assert.equal(antes.minimo, C.MINIMO);
  assert.equal(antes.cambiada, '', 'nunca la ha cambiado');
  assert.equal(C.cambiarMia('t', '', 'Segur4!clave').ok, true);
  assert.equal(C.estado('t').tieneContrasena, true);
  assert.match(C.estado('t').cambiada, /^\d{4}-\d{2}-\d{2}$/, 'y ya sabe cuándo la cambió');
  assert.throws(() => cargar(hoja, null).C.cambiarMia('t', '', 'Segur4!clave'), /Sesión expirada/);
});

test('restablecer y cambiar la mía cierran sesiones y avisan por correo (sin la temporal)', () => {
  const hoja = hojaFalsa(['CORREO', 'NOMBRE', 'CONTRASEÑA'], [{ CORREO: 'ana@gph.com', NOMBRE: 'Ana', 'CONTRASEÑA': 'actual 12345' }]);
  const ctx = cargar(hoja, { correo: 'ana@gph.com' });
  const r = ctx.C.restablecer('admin', 'ana@gph.com');
  assert.deepEqual(ctx.cerradas.map((c) => ({ ...c })), [{ correo: 'ana@gph.com', conservar: undefined }], 'todas las de ella, sin conservar ninguna');
  const aviso = ctx.correos[0];
  assert.equal(aviso.to, 'ana@gph.com');
  assert.match(aviso.subject, /restableció/);
  assert.ok(!aviso.htmlBody.includes(r.temporal) && !aviso.body.includes(r.temporal), 'el correo nunca trae la temporal');
  assert.ok(aviso.htmlBody.includes('admin@x.com'), 'dice quién lo hizo');

  const otra = cargar(hoja, { correo: 'ana@gph.com' });
  otra.C.cambiarMia('mi-token', r.temporal, 'Nuev4 clave!');
  assert.deepEqual(otra.cerradas.map((c) => ({ ...c })), [{ correo: 'ana@gph.com', conservar: 'mi-token' }], 'las demás; la suya se conserva');
  assert.match(otra.correos[0].subject, /se cambió/);
});

test('temporales para todos: solo a los activos, 10 caracteres, debe cambiar, sin tocar lo demás del renglón y cerrando sesiones', () => {
  const hoja = hojaFalsa(['CORREO', 'NOMBRE', 'ROL', 'ACTIVO', 'AREA', 'CONTRASEÑA'], [
    { CORREO: 'ana@gph.com', NOMBRE: 'Ana', ROL: 'CLIENT', ACTIVO: 'TRUE', AREA: 'POST VENTA', 'CONTRASEÑA': 'vieja' },
    { CORREO: 'beto@x.com', NOMBRE: 'Beto', ROL: 'USER', ACTIVO: 'FALSE', AREA: 'TI', 'CONTRASEÑA': 'otra' },
    { CORREO: 'caro@x.com', NOMBRE: 'Caro', ROL: 'ADMIN', ACTIVO: 'TRUE', AREA: 'TI' },
  ]);
  const ctx = cargar(hoja);
  assert.equal(ctx.C.temporalesParaActivos(false).activos, 2, 'revisar solo cuenta');
  assert.equal(comoObjetos(hoja)[0]['CONTRASEÑA'], 'vieja', 'y no cambia nada');
  const r = ctx.C.temporalesParaActivos(true);
  assert.equal(r.asignadas, 2);
  const filas = comoObjetos(hoja);
  r.lista.forEach((x) => assert.match(x.temporal, /^[A-HJ-NP-Za-km-np-z2-9]{10}$/));
  assert.equal(ctx.C.verificar(filas[0], r.lista[0].temporal).ok, true, 'la de la lista sirve');
  assert.equal(ctx.C.verificar(filas[0], 'vieja').ok, false, 'la de antes ya no');
  assert.equal(filas[0]['DEBE CAMBIAR CONTRASEÑA'], 'TRUE');
  assert.equal(filas[0].ROL, 'CLIENT', 'lo demás del renglón no se toca');
  assert.equal(filas[1]['CONTRASEÑA'], 'otra', 'al inactivo no se le asigna');
  assert.deepEqual([...r.lista.map((x) => x.correo)], ['ana@gph.com', 'caro@x.com']);
  assert.deepEqual([...ctx.cerradas.map((c) => c.correo)], ['ana@gph.com', 'caro@x.com'], 'sus sesiones se cierran');
});

test('temporales para todos: en producción no corre sin la confirmación', () => {
  const hoja = hojaFalsa(['CORREO', 'ACTIVO'], [{ CORREO: 'ana@gph.com', ACTIVO: 'TRUE' }]);
  const ctx = cargar(hoja);
  ctx.leerConfig_ = () => 'PROD';
  assert.throws(() => ctx.temporalesParaTodos(), /PRODUCCIÓN/);
  assert.equal(comoObjetos(hoja)[0].PASSWORD_HASH, undefined, 'nada cambió');
});
