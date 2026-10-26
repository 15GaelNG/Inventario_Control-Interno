// El login con contraseña (Auth.login) limita los intentos fallidos por correo (23-oct): con la web app abierta a
// cualquier cuenta de Google (POST VENTA, de gph), nadie debe poder probar contraseñas sin fin.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Credenciales simulado: la huella real la prueba credenciales.test.cjs; aquí solo importa qué decide el login
const guardadas = [];
const Credenciales = {
  verificar: (fila, clave) => ({ ok: fila['CONTRASEÑA'] === clave, migrar: fila['CONTRASEÑA'] === clave }),
  guardar: (correo, clave) => { guardadas.push(correo + ':' + clave); },
  revisarNueva: (clave) => { if (clave.length < 10) throw new Error('al menos 10'); },
  avisar_: () => {},
  bloqueado: (f) => !!(f && f['BLOQUEO SEGURIDAD']),
  MINIMO: 10,
};
let usuarios = [];
// Verificacion simulado: pedirCodigo decide si el dispositivo necesita el código (Verificacion.gs tiene su prueba)
let pedirCodigo = false;
const Verificacion = {
  // confirmar: el cambio de una contraseña VIEJA pide el código aunque la verificación esté apagada
  decidir: (fila, metodo, d, o) => (pedirCodigo || (o && o.confirmar)
    ? { pendiente: 'codigo', reto: 'r-codigo', metodo, motivo: o && o.confirmar ? 'confirmar' : 'nuevo' } : null),
  verificarCodigo: (reto, codigo, recordar) => {
    if (reto !== 'r-codigo' || codigo !== '123456') throw new Error('Ese código no es correcto.');
    return { correo: 'ana@gph.com', metodo: 'contrasena', llave: recordar ? 'llave-1' : '' };
  },
};

function cargar(debeCambiar) {
  usuarios = [{ CORREO: 'ana@gph.com', NOMBRE: 'Ana', ROL: 'CLIENT', ACTIVO: 'TRUE', 'CONTRASEÑA': 'buena',
    'DEBE CAMBIAR CONTRASEÑA': debeCambiar === true ? 'TRUE' : (debeCambiar || '') }];
  const cache = {};
  pedirCodigo = false;
  const ctx = vm.createContext({
    Credenciales,
    Verificacion,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
    console: { warn: () => {} },
    Config: { SPREADSHEET_IDS: { USUARIOS: () => 'libro' }, ROLES: { ADMIN: 'ADMIN', OPERADOR: 'OPERADOR', LECTURA: 'LECTURA', CLIENTE: 'CLIENTE' },
      SESION_DURACION_HORAS: 8 },
    SheetUtils: {
      getSheet: () => ({ getName: () => 'USUARIOS' }),
      getAll: () => usuarios,
    },
    CacheService: { getScriptCache: () => ({
      get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
    Utilities: { getUuid: (() => { let n = 0; return () => 'uuid-' + (++n); })() },
    // La cuenta de Google con la que se abrió la app ("Continuar como…")
    Session: { getActiveUser: () => ({ getEmail: () => 'ana@gph.com' }) },
    FotosDirectorio: { de: () => '' },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'Auth.gs'), 'utf8') + '\nthis.Auth = Auth;', ctx);
  return ctx.Auth;
}
const intento = (A, correo, clave) => { try { A.login(correo, clave); return 'entró'; } catch (e) { return e.message; } };

test('5 contraseñas malas bloquean ese correo, aunque la sexta sea la buena', () => {
  const A = cargar();
  for (let i = 0; i < 5; i++) assert.equal(intento(A, 'ana@gph.com', 'mala'), 'Usuario o contraseña incorrectos');
  assert.match(intento(A, 'ana@gph.com', 'buena'), /Demasiados intentos/);
  assert.match(intento(A, 'ANA@gph.com ', 'buena'), /Demasiados intentos/, 'sin importar mayúsculas ni espacios');
});

test('entrar bien antes del quinto fallo borra la cuenta', () => {
  const A = cargar();
  for (let i = 0; i < 4; i++) intento(A, 'ana@gph.com', 'mala');
  assert.equal(intento(A, 'ana@gph.com', 'buena'), 'entró');
  for (let i = 0; i < 4; i++) intento(A, 'ana@gph.com', 'mala');
  assert.equal(intento(A, 'ana@gph.com', 'buena'), 'entró', 'empieza de cero');
});

test('un correo que no existe cuenta igual, con el mismo mensaje', () => {
  const A = cargar();
  for (let i = 0; i < 5; i++) assert.equal(intento(A, 'nadie@gmail.com', 'x'), 'Usuario o contraseña incorrectos');
  assert.match(intento(A, 'nadie@gmail.com', 'x'), /Demasiados intentos/);
  assert.equal(intento(A, 'ana@gph.com', 'buena'), 'entró', 'y no bloquea a los demás correos');
});

test('entrar con la contraseña en texto plano la pasa a huella (Credenciales.guardar); fallar no guarda nada', () => {
  const A = cargar();
  guardadas.length = 0;
  intento(A, 'ana@gph.com', 'mala');
  assert.deepEqual(guardadas, []);
  assert.equal(intento(A, 'ana@gph.com', 'buena'), 'entró');
  assert.deepEqual(guardadas, ['ana@gph.com:buena']);
});

test('con una contraseña temporal no hay sesión: pide la nueva con un reto de un solo uso', () => {
  const A = cargar(true);
  const r = A.login('ana@gph.com', 'buena');
  assert.equal(r.pendiente, 'cambiar');
  assert.ok(r.reto && !r.token, 'sin token todavía');
  assert.throws(() => A.cambiarContrasenaInicial(r.reto, 'corta'), /al menos 10/);
  assert.throws(() => A.cambiarContrasenaInicial(r.reto, 'buena'), /distinta de la que tenías/);
  assert.equal(r.motivo, 'temporal');
  assert.throws(() => A.cambiarContrasenaInicial('inventado', 'Una frase larga 1'), /venció/);
  const s = A.cambiarContrasenaInicial(r.reto, 'Una frase larga 1');
  assert.ok(s.token && s.correo === 'ana@gph.com', 'ahora sí, la sesión');
  assert.throws(() => A.cambiarContrasenaInicial(r.reto, 'Otra frase larga 2'), /venció/, 'el reto ya se usó');
});

test('dispositivo nuevo: primero el código, después la contraseña nueva (si es temporal), y la llave viaja con la respuesta', () => {
  const A = cargar(true);
  pedirCodigo = true;
  const r = A.login('ana@gph.com', 'buena', { navegador: 'Chrome' });
  assert.equal(r.pendiente, 'codigo');
  assert.ok(!r.token);
  assert.throws(() => A.verificarCodigo('r-codigo', '000000', true), /no es correcto/);
  const despues = A.verificarCodigo('r-codigo', '123456', true);
  assert.equal(despues.pendiente, 'cambiar', 'el código no se salta la contraseña temporal');
  assert.deepEqual({ ...despues.dispositivo }, { correo: 'ana@gph.com', llave: 'llave-1' });
  const s = A.cambiarContrasenaInicial(despues.reto, 'Una frase larga 1');
  assert.ok(s.token);
  pedirCodigo = false;
});

test('bloqueada por seguridad: "Continuar como…" no aparece y entrar con Google se rechaza; con la temporal sí', () => {
  const A = cargar(true);
  assert.equal(A.identidadGoogle().coincide, true, 'sin bloqueo, el chip aparece');
  usuarios[0]['BLOQUEO SEGURIDAD'] = '2026-10-23 10:40 | admin@x.com | correo tomado';
  assert.equal(A.identidadGoogle().coincide, false, 'con bloqueo, no');
  assert.throws(() => A.loginConGoogle({}), /revisión de seguridad/);
  assert.equal(A.login('ana@gph.com', 'buena').pendiente, 'cambiar', 'con la contraseña que dio el admin sí entra (y cambia la suya)');
});

test('contraseña VIEJA (pedir cambio a todos, 26-oct): primero el código aunque la verificación esté apagada, luego la nueva', () => {
  const A = cargar('VIEJA');
  const r = A.login('ana@gph.com', 'buena', { navegador: 'Chrome' });
  assert.equal(r.pendiente, 'codigo', 'quien solo conoce la vieja (pudo verse en la hoja) no pasa sin el correo');
  assert.equal(r.motivo, 'confirmar');
  assert.ok(!r.token);
  assert.throws(() => A.cambiarContrasenaInicial('uuid-1', 'Una frase larga 1'), /venció/, 'sin el código no hay reto de cambio');
  assert.throws(() => A.verificarCodigo('r-codigo', '000000', false), /no es correcto/);
  const despues = A.verificarCodigo('r-codigo', '123456', false);
  assert.equal(despues.pendiente, 'cambiar');
  assert.equal(despues.motivo, 'vieja');
  assert.ok(A.cambiarContrasenaInicial(despues.reto, 'Una frase larga 1').token);
});

test('con Google: cualquier cambio pendiente (temporal o VIEJA) pide elegir la nueva, sin código; sin pendiente, entra', () => {
  for (const marca of [true, 'VIEJA', 'vieja ']) {
    const A = cargar(marca);
    const r = A.loginConGoogle({});
    assert.equal(r.pendiente, 'cambiar', 'marca ' + JSON.stringify(marca));
    assert.equal(r.motivo, 'google');
    assert.ok(A.cambiarContrasenaInicial(r.reto, 'Una frase larga 1').token);
  }
  assert.ok(cargar().loginConGoogle({}).token, 'sin marca: la sesión de siempre');
  assert.ok(cargar('FALSE').login('ana@gph.com', 'buena').token, 'otro valor en la columna no pide nada');
});
