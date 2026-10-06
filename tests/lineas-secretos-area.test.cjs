// PIN, patrones y contraseñas (usuario, 5-oct): los ven ADMIN y el área de Líneas (AREA = LINEAS en USUARIOS).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const fuente = fs.readFileSync(path.join(__dirname, '../src/services/TelefoniaService.gs'), 'utf8');

function puedeVer() {
  const inicio = fuente.indexOf("  const AREA_SECRETOS = 'LINEAS';");
  const fin = fuente.indexOf('  function ocultarSecretos_(', inicio);
  assert.ok(inicio > 0 && fin > inicio, 'regla de secretos en TelefoniaService');
  const ctx = vm.createContext({ Config: { ROLES: { ADMIN: 'ADMIN', OPERADOR: 'OPERADOR', LECTURA: 'LECTURA' } } });
  vm.runInContext(fuente.slice(inicio, fin) + '\nthis.f = puedeVerSecretos_;', ctx);
  return ctx.f;
}

test('ADMIN y el área LINEAS ven los secretos; las demás áreas no', () => {
  const f = puedeVer();
  assert.equal(f({ rol: 'ADMIN', departamento: 'ANALISIS DE DATOS' }), true);
  assert.equal(f({ rol: 'OPERADOR', departamento: 'LINEAS' }), true);
  assert.equal(f({ rol: 'LECTURA', departamento: ' Líneas ' }), true, 'sin acentos ni espacios ni mayúsculas');
  assert.equal(f({ rol: 'OPERADOR', departamento: 'POST VENTA' }), false);
  assert.equal(f({ rol: 'OPERADOR', departamento: '' }), false);
  assert.equal(f({ rol: 'OPERADOR' }), false);
});

test('los avisos dicen quién los ve', () => {
  const cliente = fs.readFileSync(path.join(__dirname, '../src/html/js/lineas.html'), 'utf8');
  assert.match(cliente, /Los PIN, patrones y contraseñas solo los ven administradores y el área de Líneas\./);
  assert.doesNotMatch(cliente, /ocultos para tu rol/);
});
