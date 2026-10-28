// MedidorContrasena (componentes/medidor-contrasena.html, 23-oct): la barra se llena y la lista se palomea con cada
// requisito, como "Mar1posa!" (8+, mayúscula, minúscula, número, símbolo, sin el correo, las dos iguales). jsdom.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'componentes', 'medidor-contrasena.html'), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

function montar() {
  const dom = new JSDOM('<!doctype html><body><input id="n"><input id="r"><div id="m"></div></body>', { runScripts: 'outside-only' });
  const { window } = dom;
  window.eval(script + '\nwindow.MedidorContrasena = MedidorContrasena;');
  const d = window.document;
  const medidor = window.MedidorContrasena.crear(d.getElementById('m'), { nueva: d.getElementById('n'), repetida: d.getElementById('r'), minimo: 8, correo: 'ana.lopez@gph.com' });
  const escribir = (id, v) => { d.getElementById(id).value = v; d.getElementById(id).dispatchEvent(new window.Event('input')); };
  const palomeados = () => [...d.querySelectorAll('#m li.ok')].map((li) => li.dataset.req).sort();
  const barra = () => d.querySelector('#m .medidor-barra');
  return { medidor, escribir, palomeados, barra, d };
}

test('vacío: barra en cero, nada palomeado', () => {
  const { barra, palomeados } = montar();
  assert.equal(barra().dataset.nivel, 'vacio');
  assert.deepEqual(palomeados(), []);
});

test('la barra avanza con cada requisito y "Mar1posa!" queda Lista cuando las dos coinciden', () => {
  const { escribir, palomeados, barra, medidor, d } = montar();
  escribir('n', 'mar');
  assert.deepEqual(palomeados(), ['correo', 'minuscula']);
  assert.equal(barra().dataset.nivel, 'falta');
  escribir('n', 'Mar1pos');
  assert.deepEqual(palomeados(), ['correo', 'mayuscula', 'minuscula', 'numero']);
  escribir('n', 'Mar1posa!');
  assert.equal(medidor.cumple(), false, 'falta repetirla');
  assert.equal(barra().dataset.nivel, 'casi');
  escribir('r', 'Mar1posa!');
  assert.equal(medidor.cumple(), true);
  assert.equal(barra().dataset.nivel, 'lista');
  assert.equal(d.querySelector('#m .medidor-relleno').style.width, '100%');
  assert.match(d.querySelector('#m .medidor-texto').textContent, /Lista · 7 de 7/);
});

test('con el correo dentro o un espacio en vez de símbolo, no cumple', () => {
  const { escribir, palomeados, medidor } = montar();
  escribir('n', 'Ana.lopez26!'); escribir('r', 'Ana.lopez26!');
  assert.ok(!palomeados().includes('correo'));
  assert.equal(medidor.cumple(), false);
  escribir('n', 'Mar1posa x'); escribir('r', 'Mar1posa x');
  assert.ok(!palomeados().includes('simbolo'), 'el espacio no es símbolo');
});
