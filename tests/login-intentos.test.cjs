// El login con contraseña (Auth.login) limita los intentos fallidos por correo (23-oct): con la web app abierta a
// cualquier cuenta de Google (POST VENTA, de gph), nadie debe poder probar contraseñas sin fin.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function cargar() {
  const cache = {};
  const ctx = vm.createContext({
    Config: { SPREADSHEET_IDS: { USUARIOS: () => 'libro' }, ROLES: { ADMIN: 'ADMIN', OPERADOR: 'OPERADOR', LECTURA: 'LECTURA', CLIENTE: 'CLIENTE' },
      SESION_DURACION_HORAS: 8 },
    SheetUtils: {
      getSheet: () => ({ getName: () => 'USUARIOS' }),
      getAll: () => [{ CORREO: 'ana@gph.com', NOMBRE: 'Ana', ROL: 'CLIENT', ACTIVO: 'TRUE', 'CONTRASEÑA': 'buena' }],
    },
    CacheService: { getScriptCache: () => ({
      get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
    Utilities: { getUuid: () => 'token-1' },
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
