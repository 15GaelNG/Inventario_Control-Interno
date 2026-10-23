// La sesión (Auth.gs, 23-oct): versión por persona para cerrar las abiertas, 60 min de inactividad, 8 h de máximo, y las
// llamadas automáticas no renuevan. Con un reloj que se controla: CacheService vence según ese reloj.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function cargar() {
  const reloj = { ahora: Date.UTC(2026, 9, 23, 9, 0) };
  class Fecha extends Date {
    constructor(...a) { if (a.length) super(...a); else super(reloj.ahora); }
    static now() { return reloj.ahora; }
  }
  const cache = {};
  const escrituras = [];
  const props = {};
  let n = 0;
  // Una ejecución de Apps Script: contexto nuevo, misma caché, propiedades y reloj
  const crearCtx = () => vm.createContext({
    Date: Fecha,
    Config: { SPREADSHEET_IDS: { USUARIOS: () => 'libro' }, ROLES: { ADMIN: 'ADMIN', OPERADOR: 'OPERADOR', LECTURA: 'LECTURA', CLIENTE: 'CLIENTE' },
      SESION_DURACION_HORAS: 8, SESION_INACTIVIDAD_MIN: 60 },
    CacheService: { getScriptCache: () => ({
      get: (k) => (cache[k] && cache[k].vence > reloj.ahora ? cache[k].v : null),
      put: (k, v, seg) => { if (k.startsWith('sesion_') && !k.startsWith('sesion_version_')) escrituras.push(k); cache[k] = { v, vence: reloj.ahora + seg * 1000 }; },
      remove: (k) => { delete cache[k]; },
    }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
    Utilities: { getUuid: () => 'token-' + (++n), sleep: () => {} },
    SheetUtils: { getSheet: () => ({ getName: () => 'USUARIOS' }), getAll: () => [{ CORREO: 'ana@gph.com', NOMBRE: 'Ana', ROL: 'CLIENT', ACTIVO: 'TRUE', 'CONTRASEÑA': 'x' }] },
    Credenciales: { verificar: () => ({ ok: true, migrar: false }), MINIMO: 10 },
    Verificacion: { decidir: () => null },
    Session: {},
  });
  const fuente = fs.readFileSync(path.join(__dirname, '..', 'src', 'Auth.gs'), 'utf8');
  // Cada llamada de google.script.run es una ejecución nueva: la marca de "automática" no sobrevive entre llamadas
  const nueva = () => { const ctx = crearCtx(); vm.runInContext(fuente + '\nthis.Auth = Auth;', ctx); return ctx.Auth; };
  const A = nueva();
  const minutos = (m) => { reloj.ahora += m * 60000; };
  const vale = (Auth, token) => { try { Auth.validarSesion(token); return true; } catch (e) { return e.message; } };
  return { A, nueva, minutos, vale, escrituras, reloj, cache };
}

test('60 min sin usar la app: vence; usarla la renueva', () => {
  const { A, minutos, vale } = cargar();
  const { token } = A.login('ana@gph.com', 'x');
  minutos(50);
  assert.equal(vale(A, token), true, 'a los 50 min sigue, y esta llamada la renueva');
  minutos(50);
  assert.equal(vale(A, token), true, '50 min después de la última llamada, sigue');
  minutos(61);
  assert.match(vale(A, token), /Sesión expirada/, '61 min sin nada: vence');
});

test('las llamadas automáticas (vigía, campanita, sensores) no la renuevan', () => {
  const { A, nueva, minutos, vale } = cargar();
  const { token } = A.login('ana@gph.com', 'x');
  for (let i = 0; i < 5; i++) {   // 55 min de puras llamadas automáticas
    minutos(11);
    const auto = nueva();
    auto.automatica();
    assert.equal(vale(auto, token), true, 'la automática valida…');
  }
  minutos(7);
  assert.match(vale(nueva(), token), /Sesión expirada/, '…pero no renueva: 62 min después de entrar, vence');
});

test('con uso constante, nunca pasa de 8 h', () => {
  const { A, minutos, vale } = cargar();
  const { token } = A.login('ana@gph.com', 'x');
  for (let i = 0; i < 47; i++) { minutos(10); assert.equal(vale(A, token), true); }   // 7 h 50 min
  minutos(11);
  assert.match(vale(A, token), /Sesión expirada/);
});

test('renovar escribe en la caché a lo más cada 5 min, no en cada llamada', () => {
  const { A, minutos, vale, escrituras } = cargar();
  const { token } = A.login('ana@gph.com', 'x');
  escrituras.length = 0;
  for (let i = 0; i < 30; i++) { minutos(0.5); vale(A, token); }   // 30 llamadas en 15 min
  assert.ok(escrituras.length <= 3, escrituras.length + ' escrituras');
});

test('cerrarSesiones: las abiertas dejan de servir; con conservar, quien lo hizo sigue con un token nuevo', () => {
  const { A, vale } = cargar();
  const enLaCompu = A.login('ana@gph.com', 'x').token;
  const enElCel = A.login('ana@gph.com', 'x').token;
  const sigue = A.cerrarSesiones('ANA@gph.com', { conservar: enLaCompu });
  assert.match(vale(A, enElCel), /otro dispositivo o cambió tu contraseña/);
  assert.match(vale(A, enLaCompu), /Sesión expirada/, 'el token de antes tampoco: se cambió por uno nuevo');
  assert.ok(sigue.token && sigue.token !== enLaCompu);
  assert.equal(sigue.correo, 'ana@gph.com');
  assert.equal(vale(A, sigue.token), true);
  assert.equal(A.cerrarSesiones('ana@gph.com'), null, 'sin conservar: todas');
  assert.match(vale(A, sigue.token), /otro dispositivo/);
  assert.equal(vale(A, A.login('ana@gph.com', 'x').token), true, 'entrar de nuevo sí sirve');
});

test('una sesión de antes del cambio (sin versión ni fecha) sigue sirviendo al desplegar, y luego cuenta sus 8 h', () => {
  const { A, minutos, vale, cache, reloj } = cargar();
  // Como la guardaba el Auth de antes: sin v, creada ni renovada
  cache['sesion_vieja'] = { v: JSON.stringify({ correo: 'ana@gph.com', nombre: 'Ana', rol: 'CLIENTE' }), vence: reloj.ahora + 6 * 3600000 };
  assert.equal(vale(A, 'vieja'), true, 'nadie sale al desplegar');
  for (let i = 0; i < 47; i++) { minutos(10); assert.equal(vale(A, 'vieja'), true); }
  minutos(11);
  assert.match(vale(A, 'vieja'), /Sesión expirada/, 'desde su primera llamada ya tiene sus 8 h');
});
