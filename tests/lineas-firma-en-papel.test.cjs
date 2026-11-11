/**
 * Firma en papel (usuario, 11-nov): en la Responsiva y la Inspección, para casos especiales (quien no sabe usar la
 * liga), se elige «En papel» en la firma del responsable principal: no se difiere ningún rol, el PDF sale de una vez
 * con sus casillas en blanco y se sube firmado con «Subir PDF firmado». Por omisión, por liga.
 */
const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const LINEAS = require('./lineas-fuente');

function trozo(desde, hasta) {
  const a = LINEAS.indexOf(desde);
  const b = LINEAS.indexOf(hasta, a);
  assert.ok(a >= 0 && b > a, 'no encontré ' + desde);
  return LINEAS.slice(a, b);
}

function cargar() {
  const dom = new JSDOM('<!doctype html><div id="c"></div>');
  const codigo = trozo('    const NOTA_FIRMA_ = {', '    // Responsables adicionales (6-oct)') +
    '\nreturn { htmlFirmaRemota_, activarFirmaEnPapel };';
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const icono = (n) => '<i data-i="' + n + '"></i>';
  const api = new Function('esc', 'icono', codigo)(esc, icono);
  const c = dom.window.document.getElementById('c');
  const campo = (col) => '<div class="field ln-af-campo" data-af-columna="' + col + '">' + api.htmlFirmaRemota_(col) + '</div>';
  c.innerHTML = campo('FIRMA RESPONSABLE') + campo('FIRMA SEGUNDO RESPONSABLE');
  return { c, enPapel: api.activarFirmaEnPapel(c) };
}

test('por omisión firman por liga; «En papel» cambia las notas de todos y apaga las ligas', () => {
  const { c, enPapel } = cargar();
  assert.strictEqual(c.querySelectorAll('[data-firma-modo]').length, 1, 'el selector va solo en el principal');
  assert.strictEqual(enPapel(), false);
  c.querySelector('[data-modo-firma="PAPEL"]').click();
  assert.strictEqual(enPapel(), true);
  const notas = Array.from(c.querySelectorAll('[data-firma-nota]')).map((n) => n.textContent);
  assert.strictEqual(notas.length, 2);
  notas.forEach((t) => assert.match(t, /Subir PDF firmado/));
  assert.strictEqual(c.querySelector('[data-modo-firma="PAPEL"]').getAttribute('aria-pressed'), 'true');
  c.querySelector('[data-modo-firma="LIGA"]').click();
  assert.strictEqual(enPapel(), false);
  notas.forEach((_, i) => assert.match(c.querySelectorAll('[data-firma-nota]')[i].textContent, /liga/));
});

test('si la firma del principal no se ve (sin responsable), no cuenta como en papel', () => {
  const { c, enPapel } = cargar();
  c.querySelector('[data-modo-firma="PAPEL"]').click();
  c.querySelector('[data-af-columna="FIRMA RESPONSABLE"]').hidden = true;
  assert.strictEqual(enPapel(), false);
});

test('sin selector en el formulario (otras capturas), nunca es en papel', () => {
  const dom = new JSDOM('<!doctype html><div id="c"></div>');
  const codigo = trozo('    const NOTA_FIRMA_ = {', '    // Responsables adicionales (6-oct)') + '\nreturn activarFirmaEnPapel;';
  const activar = new Function('esc', 'icono', codigo)(String, () => '');
  assert.strictEqual(activar(dom.window.document.getElementById('c'))(), false);
});

test('la Responsiva y la Inspección no difieren ningún rol si se eligió en papel', () => {
  const linea = "const rolesDiferidos = sesion.firmaEnPapel && sesion.firmaEnPapel() ? [] : ['PRINCIPAL'].concat(ORDEN_ADICIONALES);";
  assert.strictEqual(LINEAS.split(linea).length - 1, 2);
  assert.ok(!/const rolesDiferidos = \['PRINCIPAL'\]/.test(LINEAS), 'queda un guardado que siempre difiere');
  assert.ok(LINEAS.includes('captura.firmaEnPapel = activarFirmaEnPapel(cuerpo);'));
});
