const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Agregar equipo propone el NUCO (usuario, 21-oct; pendiente 2.59): el más alto de la serie normal (hasta 4 dígitos) + 1,
// sin rellenar huecos; los bloques de 5 dígitos (10001-10100 y 11001-11011, Dirección General) no cuentan. Se puede cambiar.
const registros = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasRegistros.gs'), 'utf8');
const cliente = fs.readFileSync(path.join(__dirname, '../src/html/js/lineas.html'), 'utf8');

function nucoSiguiente(nucos) {
  const util = new Function('LineasDatos', 'LineasArchivos', fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasUtil.gs'), 'utf8') +
    '\nreturn LineasUtil;')({ normCol: (c) => String(c).toUpperCase().trim() }, {});
  const fuente = registros.slice(registros.indexOf('function nucoSiguiente_(filas)'), registros.indexOf('function equiposSinLinea_(filas)'));
  const fn = new Function('LineasUtil', 'texto_', fuente + '\nreturn nucoSiguiente_;')(
    { col: (f, c) => f[c], nuco4: util.nuco4 }, (v) => String(v == null ? '' : v).trim());
  return fn(nucos.map((n) => ({ NUCO: n })));
}

test('NUCO del alta: el más alto de la serie normal + 1, a 4 dígitos (2.59)', () => {
  assert.equal(nucoSiguiente(['0179', 1712, '0005', '10100', '11011', 'NO APLICA', '']), '1713');
  assert.equal(nucoSiguiente(['0001', '0003']), '0004', 'los huecos no se rellenan');
  assert.equal(nucoSiguiente([]), '0001');
  assert.equal(nucoSiguiente(['9999']), '', 'sin lugar en la serie, no propone');
});

test('NUCO del alta: se propone solo en Agregar equipo y la pantalla lo marca «auto» hasta que lo cambien (2.59)', () => {
  assert.match(registros, /conEquipo && nuevo \? ed\('NUCO', 'NUCO', 'numero', \{ valor: \(ctx && ctx\.nucoSiguiente\) \|\| '', sugerido: !!\(ctx && ctx\.nucoSiguiente\), requerido: 'SIEMPRE', valida: 'NUCO' \}\)/);
  assert.match(registros, /ctx\.nucoSiguiente = nucoSiguiente_\(filas\);/);
  // Al guardar se sigue revisando que no esté repetido
  assert.ok(registros.includes("case 'NUCO': return /^\\d+$/.test(valor) && !ctx.nucoRepetido(valor);"));
  // En el formulario de Agregar / Corregir (abrirEditor), que es donde se arma el alta
  const editor = cliente.slice(cliente.indexOf('function abrirEditor(id, parte)'), cliente.indexOf('const patron = elementos.filter', cliente.indexOf('function abrirEditor(id, parte)')));
  assert.match(editor, /const el = e\.sugerido && e\.valor && cuerpo\.querySelector\('\[data-columna="' \+ CSS\.escape\(e\.columna\) \+ '"\]'\);\s*if \(el\) CampoAuto\.llenar\(el, e\.valor\);/);
});
