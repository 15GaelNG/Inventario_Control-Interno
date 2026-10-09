// Usuario, 6-oct: el PIN de WhatsApp y el PIN o la contraseña del equipo se pueden escribir en minúsculas. La regla de
// mayúsculas de app.html respeta los campos con data-respetar-texto; esa excepción se perdió al unir master el 1-oct.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('la regla de mayúsculas de app.html no toca los campos con data-respetar-texto', () => {
  const app = read('src/html/js/app.html');
  const regla = app.slice(app.indexOf("document.getElementById('view-container').addEventListener('input'"));
  const corte = regla.indexOf('el.value = el.value.toUpperCase();');
  assert.ok(corte > 0, 'existe la regla de mayúsculas');
  assert.match(regla.slice(0, corte), /if \(el\.closest\('\[data-respetar-texto\]'\)\) return;/);
});

test('los PIN, la contraseña del módem y el correo llevan data-respetar-texto (literal o secreto) en Editar y en las capturas', () => {
  assert.match(read('src/html/js/lineas.html'), /\(e\.literal \|\| e\.secreto \? ' data-respetar-texto' : ''\)/);
  const registros = read('src/services/lineas/LineasRegistros.gs');
  assert.match(registros, /ed\('PIN WHATSAPP', 'PIN de WhatsApp', 'texto', \{ valida: 'PIN_WA', literal: true, secreto: true,/);
  assert.match(registros, /ed\('PIN EQUIPO', 'PIN EQUIPO', 'texto', \{ valida: 'PIN_EQ', literal: true, secreto: true \}\)/);
  const captura = read('src/services/lineas/LineasCaptura.gs');
  assert.equal((captura.match(/campo_\('PIN WHATSAPP', 'PIN de WhatsApp', 'texto', \{[^}]*literal: true/g) || []).length, 2);
  assert.equal((captura.match(/campo_\('PIN EQUIPO', 'PIN EQUIPO', 'texto', \{[^}]*literal: true/g) || []).length, 2);
});
