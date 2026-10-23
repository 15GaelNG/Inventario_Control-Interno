// Accesos (src/services/Accesos.gs, 23-oct): la bitácora de inicios de sesión y la alerta de password spraying.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function cargar(opciones) {
  const o = opciones || {};
  const cache = {};
  const filas = [];
  const correos = [];
  const hoja = { appendRow: (f) => { if (o.hojaRota) throw new Error('sin hoja'); filas.push(f); }, getRange: () => ({ setValues: () => {} }), setFrozenRows: () => {} };
  const ctx = vm.createContext({
    Config: { SPREADSHEET_IDS: { USUARIOS: () => 'libro' } },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => hoja, insertSheet: () => hoja }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; } }) },
    SheetUtils: { getAll: () => [
      { CORREO: 'jefa@ciudadmaderas.com', ROL: 'ADMIN', ACTIVO: 'TRUE' },
      { CORREO: 'otro@ciudadmaderas.com', ROL: 'ADMIN', ACTIVO: 'FALSE' },
      { CORREO: 'usuario@ciudadmaderas.com', ROL: 'USER', ACTIVO: 'TRUE' },
    ] },
    MailApp: { sendEmail: (m) => correos.push(m) },
    console: { warn: () => {} },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'Accesos.gs'), 'utf8') + '\nthis.A = Accesos;', ctx);
  return { A: ctx.A, filas, correos };
}

test('anota cada entrada con su resultado, sin contraseñas ni códigos', () => {
  const { A, filas } = cargar();
  A.anotar(' Ana@GPH.com', 'contrasena', 'entro', 'Chrome en Windows');
  assert.equal(filas.length, 1);
  assert.deepEqual([...filas[0].slice(1, 5)], ['ana@gph.com', 'contrasena', 'entro', 'Chrome en Windows']);
});

test('15 correos distintos fallando en 10 min prenden la alerta y avisan a los ADMIN activos, una vez', () => {
  const { A, correos } = cargar();
  for (let i = 0; i < 30; i++) A.anotar('ana@gph.com', 'contrasena', 'contrasena-mala');
  assert.equal(A.enAlerta(), false, 'muchos fallos de UN correo no es spraying (eso lo para el límite por correo)');
  for (let i = 0; i < 14; i++) A.anotar('persona' + i + '@gph.com', 'contrasena', 'correo-desconocido');
  assert.equal(A.enAlerta(), true);
  assert.equal(correos.length, 1);
  assert.equal(correos[0].to, 'jefa@ciudadmaderas.com');
  for (let i = 0; i < 5; i++) A.anotar('mas' + i + '@gph.com', 'contrasena', 'contrasena-mala');
  assert.equal(correos.length, 1, 'un solo aviso mientras dura la alerta');
});

test('si la hoja falla, anotar no truena (la bitácora nunca impide entrar)', () => {
  const { A } = cargar({ hojaRota: true });
  assert.doesNotThrow(() => A.anotar('ana@gph.com', 'google', 'entro'));
});
