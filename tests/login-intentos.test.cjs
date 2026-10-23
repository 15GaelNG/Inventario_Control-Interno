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
  MINIMO: 10,
};
let usuarios = [];
// Verificacion simulado: pedirCodigo decide si el dispositivo necesita el código (Verificacion.gs tiene su prueba)
let pedirCodigo = false;
const Verificacion = {
  decidir: (fila, metodo) => (pedirCodigo ? { pendiente: 'codigo', reto: 'r-codigo', metodo } : null),
  verificarCodigo: (reto, codigo, recordar) => {
    if (reto !== 'r-codigo' || codigo !== '123456') throw new Error('Ese código no es correcto.');
    return { correo: 'ana@gph.com', metodo: 'contrasena', llave: recordar ? 'llave-1' : '' };
  },
};

function cargar(debeCambiar) {
  usuarios = [{ CORREO: 'ana@gph.com', NOMBRE: 'Ana', ROL: 'CLIENT', ACTIVO: 'TRUE', 'CONTRASEÑA': 'buena',
    'DEBE CAMBIAR CONTRASEÑA': debeCambiar ? 'TRUE' : '' }];
  const cache = {};
  pedirCodigo = false;
  const ctx = vm.createContext({
    Credenciales,
    Verificacion,
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
    Session: {},
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
  assert.throws(() => A.cambiarContrasenaInicial(r.reto, 'buena'), /distinta de la temporal/);
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
