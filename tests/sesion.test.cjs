// La sesión (Auth.gs, 23-oct): versión por persona para cerrar las abiertas, 60 min de inactividad, 8 h de máximo, y las
// llamadas automáticas no renuevan. Con un reloj que se controla: CacheService vence según ese reloj.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function cargar(op) {
  const reloj = { ahora: Date.UTC(2026, 9, 23, 9, 0) };
  class Fecha extends Date {
    constructor(...a) { if (a.length) super(...a); else super(reloj.ahora); }
    static now() { return reloj.ahora; }
  }
  const cache = {};
  const escrituras = [];
  const props = {};
  const avisos = [];
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
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; },
      deleteProperty: (k) => { delete props[k]; }, getProperties: () => Object.assign({}, props) }) },
    Utilities: { getUuid: () => 'token-' + (++n), sleep: () => {}, computeDigest: (a, t) => { if (op && op.copiaFalla) throw new Error('sin copia'); return t; }, DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 },
      base64EncodeWebSafe: (b) => 'huella-' + b },
    console: { log: (m) => avisos.push(m), warn: (m) => avisos.push(m), error: () => {} },
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
  return { A, nueva, minutos, vale, escrituras, reloj, cache, props, avisos };
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

// 9-nov: CacheService perdió sesiones recién creadas («Sesión expirada» en Auth:268). Cada una tiene una copia.
const perder = (cache, token) => { delete cache['sesion_' + token]; };
const COPIA = (token) => 'sesion_copia_huella-' + token;

test('copia: si la caché pierde la sesión, se rescata, se restaura y nadie sale', () => {
  const { A, nueva, vale, cache, props, avisos } = cargar();
  const { token } = A.login('ana@gph.com', 'x');
  assert.ok(props[COPIA(token)], 'se guarda bajo la huella del token');
  assert.equal(Object.keys(props).some((k) => k.includes('sesion_copia_' + token)), false, 'la clave no es el token');
  perder(cache, token);
  assert.equal(vale(nueva(), token), true);
  assert.ok(cache['sesion_' + token], 'vuelve a la caché');
  assert.ok(avisos.some((m) => m.includes('[sesion] rescatada') && m.includes('ana@gph.com')), 'queda en el registro');
});

test('copia: no alarga la sesión: vence a los 60 min sin uso, aunque la caché la haya perdido', () => {
  const { A, nueva, minutos, vale, cache, props } = cargar();
  const { token } = A.login('ana@gph.com', 'x');
  minutos(61);
  perder(cache, token);
  assert.match(vale(nueva(), token), /Sesión expirada/);
  assert.equal(props[COPIA(token)], undefined, 'la copia vencida se quita');
});

test('copia: las llamadas automáticas tampoco la renuevan', () => {
  const { A, nueva, minutos, vale, cache, reloj, props } = cargar();
  const { token } = A.login('ana@gph.com', 'x');
  const vence = JSON.parse(props[COPIA(token)]).e;
  minutos(30);
  perder(cache, token);
  const auto = nueva();
  auto.automatica();
  assert.equal(vale(auto, token), true);
  assert.equal(JSON.parse(props[COPIA(token)]).e, vence, 'sigue venciendo a la misma hora');
  assert.ok(cache['sesion_' + token].vence <= vence, 'y en la caché, lo mismo');
  assert.ok(reloj.ahora < vence);
});

test('copia: el máximo de 8 h y cerrar sesiones siguen valiendo', () => {
  const { A, nueva, minutos, vale, cache } = cargar();
  const { token } = A.login('ana@gph.com', 'x');
  for (let i = 0; i < 47; i++) { minutos(10); assert.equal(vale(nueva(), token), true); }
  minutos(11);
  perder(cache, token);
  assert.match(vale(nueva(), token), /Sesión expirada/, 'pasadas las 8 h no se rescata');
  const otra = cargar();
  const s = otra.A.login('ana@gph.com', 'x');
  otra.A.cerrarSesiones('ana@gph.com');
  perder(otra.cache, s.token);
  assert.match(otra.vale(otra.nueva(), s.token), /Sesión expirada: se cerró/, 'con otra versión, la copia no sirve');
});

test('copia: cerrar sesión la borra; un token desconocido no entra y deja su línea en el registro', () => {
  const { A, nueva, vale, props, avisos } = cargar();
  const { token } = A.login('ana@gph.com', 'x');
  A.logout(token);
  assert.equal(props[COPIA(token)], undefined);
  assert.match(vale(nueva(), token), /Sesión expirada/, 'cerrada no se rescata');
  assert.match(vale(nueva(), 'inventado'), /Sesión expirada/);
  assert.ok(avisos.some((m) => m.includes('[sesion] no encontrada: ni en la caché ni en su copia')));
});

test('copia: las vencidas se limpian al entrar, a lo más cada hora', () => {
  const { A, minutos, vale, props, cache } = cargar();
  const a = A.login('ana@gph.com', 'x');
  assert.equal(vale(A, a.token), true);
  props['sesion_copia_vieja'] = JSON.stringify({ e: 1, s: {} });
  delete cache['copias_de_sesion_limpias'];
  minutos(1);
  A.login('ana@gph.com', 'x');
  assert.equal(props['sesion_copia_vieja'], undefined, 'la vencida se fue');
  assert.ok(props[COPIA(a.token)], 'la vigente sigue');
  props['sesion_copia_vieja2'] = JSON.stringify({ e: 1, s: {} });
  A.login('ana@gph.com', 'x');
  assert.ok(props['sesion_copia_vieja2'], 'no limpia dos veces en la misma hora');
  const e = A.estadoCopias();
  assert.equal(e.vigentes, 3);
  assert.equal(e.copias, 4);
});

test('copia: si la copia falla, entrar y usar la app sigue funcionando como antes', () => {
  const { A, vale, avisos } = cargar({ copiaFalla: true });
  const { token } = A.login('ana@gph.com', 'x');
  assert.equal(vale(A, token), true);
  assert.ok(avisos.some((m) => m.includes('no se pudo guardar la copia')));
});

test('la pantalla avisa con la misma inactividad que el servidor (13-nov: el triple, 180 min y 24 h)', () => {
  const raiz = path.join(__dirname, '..');
  const config = fs.readFileSync(path.join(raiz, 'src/config/Config.gs'), 'utf8');
  const pantalla = fs.readFileSync(path.join(raiz, 'src/html/js/app-seguridad.html'), 'utf8');
  const servidor = Number((config.match(/SESION_INACTIVIDAD_MIN:\s*(\d+)/) || [])[1]);
  const cliente = Number((pantalla.match(/const INACTIVIDAD_MIN = (\d+);/) || [])[1]);
  assert.equal(servidor, 180);
  assert.equal(Number((config.match(/SESION_DURACION_HORAS:\s*(\d+)/) || [])[1]), 24);
  assert.equal(cliente, servidor, 'app-seguridad.html y Config.gs dicen lo mismo');
  assert.ok(servidor * 60 <= 21600, 'CacheService guarda a lo más 6 h');
});

test('la pantalla avisa con la misma inactividad que el servidor (13-nov: el triple, 180 min y 24 h)', () => {
  const raiz = path.join(__dirname, '..');
  const config = fs.readFileSync(path.join(raiz, 'src/config/Config.gs'), 'utf8');
  const pantalla = fs.readFileSync(path.join(raiz, 'src/html/js/app-seguridad.html'), 'utf8');
  const servidor = Number((config.match(/SESION_INACTIVIDAD_MIN:\s*(\d+)/) || [])[1]);
  const cliente = Number((pantalla.match(/const INACTIVIDAD_MIN = (\d+);/) || [])[1]);
  assert.equal(servidor, 180);
  assert.equal(Number((config.match(/SESION_DURACION_HORAS:\s*(\d+)/) || [])[1]), 24);
  assert.equal(cliente, servidor, 'app-seguridad.html y Config.gs dicen lo mismo');
  assert.ok(servidor * 60 <= 21600, 'CacheService guarda a lo más 6 h');
});
