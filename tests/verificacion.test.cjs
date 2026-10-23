// Verificacion (src/services/Verificacion.gs, 23-oct): el código por correo solo cuando el dispositivo es nuevo o algo se
// ve raro, la llave del dispositivo (el servidor guarda solo su huella), el reto (vence, 5 intentos, reenvíos) y quitar
// u olvidar dispositivos. Con una hoja DISPOSITIVOS en memoria y un MailApp que guarda los correos.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const conSigno = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));

function hojaFalsa() {
  const datos = [];
  return {
    datos,
    getLastRow: () => datos.length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => datos.slice(r - 1, r - 1 + (nr || 1)).map((f) => Array.from({ length: nc || 1 }, (_, j) => (f[c - 1 + j] === undefined ? '' : f[c - 1 + j]))),
      setValues: (v) => v.forEach((f, i) => f.forEach((x, j) => { (datos[r - 1 + i] = datos[r - 1 + i] || [])[c - 1 + j] = x; })),
      setValue: (x) => { datos[r - 1][c - 1] = x; },
    }),
    appendRow: (fila) => { datos.push(fila.slice()); },
    setFrozenRows: () => {},
  };
}

function cargar(opciones) {
  const o = Object.assign({ config: {}, cuota: 100 }, opciones);
  const cache = o.cache || {};
  const hoja = o.hoja || hojaFalsa();
  const correos = [];
  const cerradas = [];
  const ctx = vm.createContext({
    Config: { SPREADSHEET_IDS: { USUARIOS: () => 'libro' } },
    leerConfig_: (k) => (k in o.config ? o.config[k] : null),
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => (hoja.datos.length ? hoja : null), insertSheet: () => hoja }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, texto) => conSigno(crypto.createHash('sha256').update(String(texto), 'utf8').digest()),
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, f) => (f === 'yyyy-MM-dd' ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 16)),
    },
    Session: { getScriptTimeZone: () => 'America/Mexico_City' },
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
    MailApp: { getRemainingDailyQuota: () => o.cuota, sendEmail: (m) => correos.push(m) },
    Candado: { con: (fn) => fn() },
    Credenciales: { bloqueado: (fila) => !!(fila && fila['BLOQUEO SEGURIDAD']), bloqueadoCorreo: () => false },
    Auth: { validarSesion: () => ({ correo: 'ana@gph.com' }), cerrarSesiones: (correo, op) => { cerradas.push({ correo, conservar: op && op.conservar }); return op && op.conservar ? { token: 'token-nuevo' } : null; } },
    Permisos: { puedeEditar: (token) => { if (token !== 'admin') throw new Error('Sin permiso'); return { correo: 'admin@x.com' }; } },
    console: { warn: () => {} },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'Correos.gs'), 'utf8'), ctx);   // la plantilla de verdad
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'Verificacion.gs'), 'utf8') + '\nthis.V = Verificacion;', ctx);
  return { V: ctx.V, correos, cache, hoja, cerradas };
}
const ANA = { CORREO: 'ana@gph.com', NOMBRE: 'Ana' };
const CHROME = { navegador: 'Chrome', sistema: 'Windows', nombre: 'Chrome en Windows' };
const codigoDe = (correo) => /^(\d{6}) /.exec(correo.subject)[1];
const truena = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

/** Entra con código y pide recordar: regresa la llave */
function recordar(V, correos, dispositivo) {
  const paso = V.decidir(ANA, 'contrasena', dispositivo);
  return V.verificarCodigo(paso.reto, codigoDe(correos[correos.length - 1]), true).llave;
}

test('apagada (VERIFICACION_DOS_PASOS = APAGADA) no pide nada', () => {
  const { V, correos } = cargar({ config: { VERIFICACION_DOS_PASOS: 'apagada' } });
  assert.equal(V.decidir(ANA, 'contrasena', CHROME), null);
  assert.equal(correos.length, 0);
});

test('dispositivo nuevo: manda el código a su correo; el bueno da una llave y la siguiente vez no se pide', () => {
  const { V, correos, hoja } = cargar();
  const paso = V.decidir(ANA, 'contrasena', CHROME);
  assert.equal(paso.pendiente, 'codigo');
  assert.equal(paso.motivo, 'nuevo');
  assert.equal(paso.correoOculto, 'a•••@gph.com');
  assert.equal(correos.length, 1);
  assert.equal(correos[0].to, 'ana@gph.com');
  assert.ok(!JSON.stringify(paso).includes(codigoDe(correos[0])), 'el código nunca va en la respuesta');
  const r = V.verificarCodigo(paso.reto, codigoDe(correos[0]), true);
  assert.match(r.llave, /^[0-9a-f]{64}$/);
  assert.equal(correos.length, 2, 'y el aviso de dispositivo nuevo');
  assert.match(correos[1].subject, /Nuevo dispositivo/);
  assert.ok(!JSON.stringify(hoja.datos).includes(r.llave), 'la hoja guarda la huella, nunca la llave');
  assert.equal(V.decidir(ANA, 'contrasena', Object.assign({ llave: r.llave }, CHROME)), null, 'con su llave: pasa');
  assert.throws(() => V.verificarCodigo(paso.reto, codigoDe(correos[0]), true), /venció/, 'el reto es de un solo uso');
});

test('equipo compartido: entra, pero no se recuerda (sin llave, sin renglón)', () => {
  const { V, correos, hoja } = cargar();
  const paso = V.decidir(ANA, 'contrasena', CHROME);
  const r = V.verificarCodigo(paso.reto, codigoDe(correos[0]), false);
  assert.equal(r.llave, '');
  assert.equal(hoja.datos.length, 0);
});

test('aunque la llave sea buena se pide si: cambió el navegador, tiene más de 60 días o hubo contraseñas malas', () => {
  const { V, correos, hoja, cache } = cargar();
  const llave = recordar(V, correos, CHROME);
  assert.equal(V.decidir(ANA, 'contrasena', Object.assign({}, CHROME, { llave, navegador: 'Firefox' })).motivo, 'cambio');
  cache['login_fallos_ana@gph.com'] = '3';
  assert.equal(V.decidir(ANA, 'contrasena', Object.assign({ llave }, CHROME)).motivo, 'fallos');
  delete cache['login_fallos_ana@gph.com'];
  hoja.datos[1][5] = new Date(Date.now() - 61 * 86400000);   // CREADO
  assert.equal(V.decidir(ANA, 'contrasena', Object.assign({ llave }, CHROME)).motivo, 'vencido');
  assert.equal(V.decidir(ANA, 'contrasena', { llave: 'inventada', navegador: 'Chrome' }).motivo, 'nuevo');
});

test('el código: 5 intentos y se acaba; reenviar espera 60 s y hasta 3 veces; sin cuota no se entra', () => {
  const { V, correos, cache } = cargar();
  const paso = V.decidir(ANA, 'contrasena', CHROME);
  for (let i = 0; i < 4; i++) assert.match(truena(() => V.verificarCodigo(paso.reto, '000000', true)), /no es correcto/);
  assert.match(truena(() => V.verificarCodigo(paso.reto, '000000', true)), /Demasiados intentos/);
  assert.match(truena(() => V.verificarCodigo(paso.reto, codigoDe(correos[0]), true)), /venció/, 'ni el bueno ya');

  const otro = V.decidir(ANA, 'contrasena', CHROME);
  assert.match(truena(() => V.reenviar(otro.reto)), /Espera un minuto/);
  const clave = 'login_codigo_' + otro.reto;
  for (let i = 0; i < 3; i++) {
    const r = JSON.parse(cache[clave]); r.ultimoEnvio = 0; cache[clave] = JSON.stringify(r);
    V.reenviar(otro.reto);
  }
  const r = JSON.parse(cache[clave]); r.ultimoEnvio = 0; cache[clave] = JSON.stringify(r);
  assert.match(truena(() => V.reenviar(otro.reto)), /varios códigos/);
  assert.match(truena(() => V.verificarCodigo(otro.reto, codigoDe(correos[1]), true)), /no es correcto/, 'un reenvío deja sin valor al anterior');
  assert.equal(V.verificarCodigo(otro.reto, codigoDe(correos[correos.length - 1]), false).correo, 'ana@gph.com');

  assert.match(truena(() => cargar({ cuota: 0 }).V.decidir(ANA, 'contrasena', CHROME)), /ya no se pueden mandar/);
});

test('mis dispositivos, quitar uno y que un admin olvide todos', () => {
  const { V, correos } = cargar();
  const enChrome = recordar(V, correos, CHROME);
  const enAndroid = recordar(V, correos, { navegador: 'Chrome', sistema: 'Android', nombre: 'Chrome en Android' });
  const lista = V.misDispositivos('t', enChrome);
  assert.deepEqual(lista.map((d) => d.nombre + (d.esEste ? ' (este)' : '')), ['Chrome en Windows (este)', 'Chrome en Android']);
  assert.ok(!JSON.stringify(lista).includes(enChrome), 'la lista no trae llaves');
  V.quitar('t', lista[1].id);
  assert.equal(V.decidir(ANA, 'contrasena', { llave: enAndroid, navegador: 'Chrome', sistema: 'Android' }).motivo, 'nuevo');
  assert.throws(() => V.olvidarDe('otro', 'ana@gph.com'), /Sin permiso/);
  assert.equal(V.olvidarDe('admin', 'ana@gph.com'), 1);
  assert.equal(V.decidir(ANA, 'contrasena', Object.assign({ llave: enChrome }, CHROME)).motivo, 'nuevo');
});

test('el correo del código usa la plantilla: 6 casillas, el código en una línea, versión en texto y nada sin escapar', () => {
  const { V, correos } = cargar();
  V.decidir({ CORREO: 'ana@gph.com', NOMBRE: 'Ana <script>' }, 'contrasena', CHROME);
  const m = correos[0];
  const codigo = codigoDe(m);
  assert.equal((m.htmlBody.match(/class="ci-casilla">\d</g) || []).length, 6, 'seis casillas');
  assert.ok(m.htmlBody.includes('aria-label="Código: ' + codigo.split('').join(' ') + '"'), 'con etiqueta para lectores de pantalla');
  assert.ok(m.htmlBody.includes('>' + codigo + '</span>'), 'y el código en una línea para copiarlo');
  assert.match(m.body, new RegExp('Código: ' + codigo), 'la versión en texto también lo trae');
  assert.ok(!m.htmlBody.includes('<script>') && m.htmlBody.includes('Ana &lt;script&gt;'), 'el nombre va escapado');
  assert.ok(m.htmlBody.length < 20000, 'lejos de los 102 KB en que Gmail corta: ' + m.htmlBody.length);
});

test('quitar un dispositivo o cerrar en los demás cierra las sesiones abiertas y conserva la de quien lo hizo; el admin, todas', () => {
  const { V, correos, cerradas } = cargar();
  const llave = recordar(V, correos, CHROME);
  recordar(V, correos, { navegador: 'Safari', sistema: 'iPhone o iPad', nombre: 'Safari en iPhone o iPad' });
  const r = V.quitarOtros('mi-token', llave);
  assert.equal(r.cerrados, 1);
  assert.equal(r.sesion.token, 'token-nuevo');
  const otro = V.misDispositivos('t', llave)[0];
  assert.equal(V.quitar('mi-token', otro.id).sesion.token, 'token-nuevo');
  V.olvidarDe('admin', 'ana@gph.com');
  assert.deepEqual(cerradas.map((c) => ({ ...c })), [
    { correo: 'ana@gph.com', conservar: 'mi-token' }, { correo: 'ana@gph.com', conservar: 'mi-token' }, { correo: 'ana@gph.com', conservar: undefined }]);
  assert.match(correos[correos.length - 1].subject, /Se cerraron tus sesiones/);
});

test('cuenta bloqueada por seguridad: el código sí se manda (sin la contraseña no sirve), el aviso de dispositivo nuevo no', () => {
  const { V, correos } = cargar();
  const bloqueada = { CORREO: 'ana@gph.com', NOMBRE: 'Ana', 'BLOQUEO SEGURIDAD': '2026-10-23 | admin@x.com | correo tomado' };
  const paso = V.decidir(bloqueada, 'contrasena', CHROME);
  assert.equal(correos.length, 1);
  assert.match(correos[0].subject, /es tu código/);
  V.verificarCodigo(paso.reto, codigoDe(correos[0]), true);
  assert.equal(correos.length, 1, 'sin "Nuevo dispositivo"');
});
