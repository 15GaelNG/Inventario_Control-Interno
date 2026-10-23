// Recuperacion (src/services/Recuperacion.gs, 23-oct): "¿Olvidaste tu contraseña?" con un enlace por correo (OWASP).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const conSigno = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));

function cargar() {
  const reloj = { ahora: Date.UTC(2026, 9, 23, 9, 0) };
  const cache = {};
  const correos = [];
  const guardadas = [];
  const cerradas = [];
  const avisos = [];
  const bitacora = [];
  const alertas = [];
  const ctx = vm.createContext({
    Config: { SPREADSHEET_IDS: { USUARIOS: () => 'libro' }, urlApp: () => 'https://app.ejemplo/exec' },
    CacheService: { getScriptCache: () => ({
      get: (k) => (cache[k] && cache[k].vence > reloj.ahora ? cache[k].v : null),
      put: (k, v, seg) => { cache[k] = { v, vence: reloj.ahora + seg * 1000 }; },
      remove: (k) => { delete cache[k]; },
    }) },
    SheetUtils: { getAll: () => [
      { CORREO: 'Ana@gph.com', NOMBRE: 'Ana', ACTIVO: 'TRUE' },
      { CORREO: 'beto@x.com', NOMBRE: 'Beto', ACTIVO: 'FALSE' },
      { CORREO: 'caro@gph.com', NOMBRE: 'Caro', ACTIVO: 'TRUE', 'BLOQUEO SEGURIDAD': '2026-10-23 10:40 | admin@x.com | correo tomado' },
    ] },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, t) => conSigno(crypto.createHash('sha256').update(String(t), 'utf8').digest()),
      getUuid: () => crypto.randomUUID(),
      formatDate: (d) => d.toISOString(),
    },
    Session: { getScriptTimeZone: () => 'America/Mexico_City' },
    MailApp: { sendEmail: (m) => correos.push(m) },
    Credenciales: {
      MINIMO: 8,
      bloqueado: (f) => !!(f && f['BLOQUEO SEGURIDAD']),
      revisarNueva: (n) => { if (String(n).length < 8) throw new Error('al menos 8'); },
      guardar: (correo, n, o) => guardadas.push([correo, n, o.debeCambiar]),
      avisar_: (fila, motivo) => avisos.push([fila.CORREO, motivo]),
    },
    Auth: { cerrarSesiones: (c) => cerradas.push(c) },
    Accesos: { anotar: (correo, metodo, resultado) => bitacora.push(resultado), alertarAdmins: (asunto, c) => alertas.push(asunto + ' · ' + c.parrafos.join(' ')) },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'Correos.gs'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'Recuperacion.gs'), 'utf8') + '\nthis.R = Recuperacion;', ctx);
  const enlaceDe = (m) => /recuperar=([0-9a-f]{64})/.exec(m.htmlBody)[1];
  const minutos = (n) => { reloj.ahora += n * 60000; };
  return { R: ctx.R, correos, guardadas, cerradas, avisos, bitacora, alertas, enlaceDe, minutos };
}

test('la respuesta es la misma exista o no el correo (no se averigua quién está)', () => {
  const { R, correos, bitacora } = cargar();
  const existe = R.pedir(' ana@GPH.com ');
  const noExiste = R.pedir('nadie@gph.com');
  const inactivo = R.pedir('beto@x.com');
  const malo = R.pedir('no es un correo');
  assert.equal(JSON.stringify(existe), JSON.stringify(noExiste));
  assert.equal(JSON.stringify(existe), JSON.stringify(inactivo));
  assert.equal(JSON.stringify(existe), JSON.stringify(malo));
  assert.equal(correos.length, 1, 'solo al que existe y está activo');
  assert.equal(correos[0].to, 'Ana@gph.com');
  assert.deepEqual([...bitacora], ['enlace-enviado', 'recuperar-desconocido', 'recuperar-desconocido']);
});

test('el correo lleva un botón a la app con el enlace, también en su versión en texto', () => {
  const { R, correos, enlaceDe } = cargar();
  R.pedir('ana@gph.com');
  const m = correos[0];
  assert.match(m.htmlBody, /https:\/\/app\.ejemplo\/exec\?recuperar=[0-9a-f]{64}/);
  assert.match(m.subject, /contraseña nueva/);
  assert.match(m.body, /recuperar=/, 'la versión en texto también lo trae');
  assert.equal(R.estado(enlaceDe(m)).correo, 'Ana@gph.com');
});

test('3 por correo por hora; después, la misma respuesta pero sin correo', () => {
  const { R, correos, bitacora, minutos } = cargar();
  for (let i = 0; i < 5; i++) R.pedir('ana@gph.com');
  assert.equal(correos.length, 3);
  assert.equal(bitacora.filter((b) => b === 'recuperar-limite').length, 2);
  minutos(61);
  R.pedir('ana@gph.com');
  assert.equal(correos.length, 4, 'pasada la hora, otra vez');
});

test('sirve una vez, pedir otro anula el anterior, y vence a los 30 min', () => {
  const { R, correos, enlaceDe, minutos } = cargar();
  R.pedir('ana@gph.com');
  const primero = enlaceDe(correos[0]);
  R.pedir('ana@gph.com');
  const segundo = enlaceDe(correos[1]);
  assert.throws(() => R.estado(primero), /venció o ya se usó/, 'el anterior ya no');
  assert.equal(R.cambiar(segundo, 'Ayrt05n!').ok, true);
  assert.throws(() => R.cambiar(segundo, 'Otra1!clave'), /venció o ya se usó/, 'una sola vez');
  R.pedir('ana@gph.com');
  const tercero = enlaceDe(correos[2]);
  minutos(31);
  assert.throws(() => R.estado(tercero), /venció/);
  assert.throws(() => R.estado('abc'), /venció/, 'un enlace con otra forma tampoco');
});

test('al cambiarla: revisa la regla, guarda sin "debe cambiar", cierra sus sesiones, avisa y lo anota', () => {
  const { R, correos, enlaceDe, guardadas, cerradas, avisos, bitacora } = cargar();
  R.pedir('ana@gph.com');
  const enlace = enlaceDe(correos[0]);
  assert.throws(() => R.cambiar(enlace, 'corta'), /al menos 8/);
  assert.equal(R.estado(enlace).correo, 'Ana@gph.com', 'una contraseña mala no gasta el enlace');
  R.cambiar(enlace, 'Ayrt05n!');
  assert.deepEqual(guardadas.map((g) => [...g]), [['Ana@gph.com', 'Ayrt05n!', false]]);
  assert.deepEqual([...cerradas], ['Ana@gph.com']);
  assert.deepEqual(avisos.map((a) => [...a]), [['Ana@gph.com', 'cambiada']]);
  assert.ok(bitacora.includes('contrasena-recuperada'));
});

test('cuenta bloqueada por seguridad: la misma respuesta, nada a su correo y alerta a los admins', () => {
  const { R, correos, bitacora, alertas } = cargar();
  const normal = R.pedir('ana@gph.com');
  const r = R.pedir('caro@gph.com');
  assert.equal(JSON.stringify(r), JSON.stringify(normal), 'quien pregunta no puede saber que está bloqueada');
  assert.equal(correos.filter((m) => m.to === 'caro@gph.com').length, 0, 'ningún enlace a ese buzón');
  assert.ok(bitacora.includes('recuperar-bloqueado'));
  assert.equal(alertas.length, 1);
  assert.match(alertas[0], /cuenta bloqueada/);
  assert.match(alertas[0], /caro@gph.com/);
});
