// El analizador de Plantilla.gs (fase 2 del motor único de PDF, 9-nov): uno solo para las plantillas de Vehículos y de
// Líneas, con la estructura del de Líneas (piezas + precedencia) y las reglas de Vehículos. Casos chicos; las plantillas
// reales las cubre tests/pdf-expresiones-diferencial.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/services/Plantilla.gs'), 'utf8') + '\nthis.P = Plantilla;', ctx);
const P = ctx.P;
const r = (texto, datos) => P.resolver(texto, datos || {});

test('precedencia y aritmética: * antes que +, paréntesis, resultado con a lo más 2 decimales', () => {
  assert.equal(r('<<1 + 2 * 3>>'), '7');
  assert.equal(r('<<(1 + 2) * 3>>'), '9');
  assert.equal(r('<<[A] / 3>>', { A: '10' }), '3.33');
  assert.equal(r('<<[M 0,50] * 0.50>>', { 'M 0,50': '8' }), '4');
  assert.equal(r('<<-[A] + 1>>', { A: '3' }), '-2');
});

test('un vacío en una cuenta da vacío (como [X] * 0.50 sin dato), y no se divide entre cero', () => {
  assert.equal(r('<<[A] * 0.50>>', { A: '' }), '');
  assert.equal(r('<<[A] + 1>>', {}), '');
  assert.equal(r('<<[A] / 0>>', { A: '4' }), '');
});

test('& une textos y RIGHT/LEFT/LEN cortan: el NUCO a 4 dígitos de la responsiva de celular', () => {
  assert.equal(r('<<RIGHT("000" & [NUCO], 4)>>', { NUCO: '599' }), '0599');
  assert.equal(r('<<RIGHT("000" & [NUCO], 4)>>', { NUCO: '12' }), '0012');
  assert.equal(r('<<RIGHT("000" & [NUCO], 4)>>', { NUCO: '1234' }), '1234');
  assert.equal(r('<<LEFT([A], 3)>>', { A: 'ABCDEF' }), 'ABC');
  assert.equal(r('<<LEN([A])>>', { A: 'ABCDEF' }), '6');
  assert.equal(r('<<CONCATENATE([A], "-", [B])>>', { A: 'X', B: 'Y' }), 'X-Y');
});

test('IF dentro de IF, AND / OR / NOT, ISBLANK', () => {
  const t = '<<IF([A] = "SI", IF([B] = "SI", "LOS DOS", "SOLO A"), "NINGUNO")>>';
  assert.equal(r(t, { A: 'SI', B: 'SI' }), 'LOS DOS');
  assert.equal(r(t, { A: 'SI', B: 'NO' }), 'SOLO A');
  assert.equal(r(t, { A: 'NO' }), 'NINGUNO');
  assert.equal(r('<<IF(AND([A] = "X", OR([B] = "1", [B] = "2")), "✓", "")>>', { A: 'x', B: '2' }), '✓');
  assert.equal(r('<<IF(NOT([A] = "X"), "✓", "")>>', { A: 'Y' }), '✓');
  assert.equal(r('<<IF(ISBLANK([A]), "vacío", "lleno")>>', { A: '  ' }), 'vacío');
});

test('comparar: texto sin espacios de más ni mayúsculas; números si uno es número de verdad; vacío no cumple', () => {
  assert.equal(r('<<IF([A] = "BUENO", "✓", "")>>', { A: ' bueno ' }), '✓');
  assert.equal(r('<<IF([N] = 5, "✓", "")>>', { N: '5.0' }), '✓');
  assert.equal(r('<<IF([N] = "5", "✓", "")>>', { N: '5.0' }), '', 'contra un texto "5" compara texto');
  assert.equal(r('<<If:([LLANTA DD] <= 1.6)>>BAJA<<EndIf>>', { 'LLANTA DD': '' }), '', 'la llanta sin medir no sale como desgastada');
  assert.equal(r('<<If:([LLANTA DD] <= 1.6)>>BAJA<<EndIf>>', { 'LLANTA DD': '1.4' }), 'BAJA');
  assert.equal(r('<<If:(LLANTA DD <= 1.6)>>BAJA<<EndIf>>', { 'LLANTA DD': '1.4' }), 'BAJA', 'columna sin corchetes de varias palabras');
});

test('campo suelto: el nombre completo con espacios, tal cual está en los datos; una fecha sin formatear, solo el día', () => {
  assert.equal(r('<<PUNTAJE FINAL INSPECCION>>', { 'PUNTAJE FINAL INSPECCION': 87 }), '87');
  assert.equal(r('<<[ VOLTAJE ]>>', { VOLTAJE: '12.456' }), '12.456', 'el valor no se redondea: solo las cuentas');
  // La fecha se crea dentro del contexto de Plantilla (en Apps Script todo vive en uno solo)
  assert.equal(r('<<FECHA>>', { FECHA: vm.runInContext('new Date(2026, 10, 9, 15, 30)', ctx) }), '09/11/2026');
});

test('lo que no se entiende lanza error, nunca un hueco en blanco', () => {
  const truena = (t, patron) => assert.throws(() => r(t, { X: '1' }), patron, t);
  truena('<<ALGUNA_FUNCION_RARA([X])>>', /no soportado/);
  truena('<<IF([X] = "1", "✓")>>', /3 partes/);
  truena('<<RIGHT([X])>>', /RIGHT no lleva 1 partes/);
  truena('<<IF([X], "a", "b")>>', /necesita una condición/);
  truena('<<If:([X])>>a<<EndIf>>', /No se entiende la condición/);
  truena('<<IF([X] = "1, "a", "b")>>', /Comillas sin cerrar|no soportado|condición/);
  truena('<<([X] + 1>>', /paréntesis/);
  truena('<<[X] # 2>>', /Carácter no soportado/);
});
