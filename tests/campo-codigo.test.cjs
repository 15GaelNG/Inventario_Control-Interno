// CampoCodigo (componentes/campo-codigo.html, 23-oct): el código en 6 recuadros. Pegar en cualquier recuadro reparte el
// código venga como venga (con espacios, guiones o los tabuladores de copiar las casillas del correo), escribir avanza,
// borrar regresa, y el autollenado del celular también se reparte. En un navegador simulado (jsdom).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'componentes', 'campo-codigo.html'), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

function montar() {
  const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.eval(script + '\nwindow.CampoCodigo = CampoCodigo;');
  const completos = [];
  const campo = window.CampoCodigo.crear(window.document.getElementById('c'), { alCompletar: (v) => completos.push(v) });
  const cajas = [...window.document.querySelectorAll('#c input')];
  const pegar = (i, texto) => {
    const ev = new window.Event('paste', { bubbles: true, cancelable: true });
    ev.clipboardData = { getData: () => texto };
    cajas[i].dispatchEvent(ev);
  };
  const escribir = (i, texto) => { cajas[i].value = texto; cajas[i].dispatchEvent(new window.Event('input', { bubbles: true })); };
  const tecla = (i, key) => cajas[i].dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  return { window, campo, cajas, completos, pegar, escribir, tecla };
}

test('6 recuadros, con lo que necesitan el celular y los lectores de pantalla', () => {
  const { cajas, window } = montar();
  assert.equal(cajas.length, 6);
  assert.equal(cajas[0].getAttribute('autocomplete'), 'one-time-code');
  assert.ok(cajas.every((c) => c.getAttribute('inputmode') === 'numeric'));
  assert.equal(cajas[2].getAttribute('aria-label'), 'Dígito 3 de 6');
  assert.equal(window.document.getElementById('c').getAttribute('role'), 'group');
});

test('pegar en cualquier recuadro reparte el código, venga como venga', () => {
  for (const [texto, en] of [['482915', 0], ['4 8 2 9 1 5', 3], ['4\t8\t2\t9\t1\t5', 5], ['482-915', 2], ['Código: 482915\n', 0], ['4\n8\n2\n9\n1\n5', 1]]) {
    const { campo, completos, pegar } = montar();
    pegar(en, texto);
    assert.equal(campo.valor(), '482915', JSON.stringify(texto) + ' pegado en el recuadro ' + (en + 1));
    assert.deepEqual(completos, ['482915'], 'y avisa que está completo, una vez');
  }
});

test('el autollenado del celular (el código entero en el primero) también se reparte', () => {
  const { campo, completos, escribir } = montar();
  escribir(0, '482915');
  assert.equal(campo.valor(), '482915');
  assert.deepEqual(completos, ['482915']);
});

test('escribir avanza, borrar regresa, y escribir sobre uno lleno lo reemplaza', () => {
  const { window, campo, cajas, completos, escribir, tecla } = montar();
  escribir(0, '4');
  assert.equal(window.document.activeElement, cajas[1], 'avanza al siguiente');
  escribir(1, 'x');
  assert.equal(cajas[1].value, '', 'solo dígitos');
  escribir(1, '8'); escribir(2, '2'); escribir(3, '9'); escribir(4, '1');
  assert.deepEqual(completos, []);
  escribir(5, '5');
  assert.deepEqual(completos, ['482915']);
  escribir(5, '57');
  assert.equal(campo.valor(), '482917', 'dos dígitos en uno lleno: se queda el último');
  cajas[5].value = '';
  tecla(5, 'Backspace');
  assert.equal(window.document.activeElement, cajas[4], 'borrar en uno vacío regresa');
  assert.equal(cajas[4].value, '');
  campo.limpiar();
  assert.equal(campo.valor(), '');
  assert.equal(window.document.activeElement, cajas[0]);
});
