/**
 * Pruebas del componente Carga (src/html/js/componentes/carga.html) en un navegador simulado (jsdom): cada forma
 * pinta su esqueleto, lo anuncia a un lector de pantalla, escapa el texto, es igual cada vez (sin azar) y
 * Carga.montar llena lo escrito fijo en una vista con data-carga.
 *
 * Correr: node tests/carga.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'componentes', 'carga.html'), 'utf8');
const FORMATO = require('./formato-fuente');
const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const css = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
const dom = new JSDOM('<!doctype html><body><div id="v"><div data-carga="lista" data-carga-n="2" data-carga-texto="Cargando colaboradores…"></div></div><div id="caja"></div></body>',
  { url: 'https://prueba.local/', runScripts: 'outside-only' });
const { window } = dom;
window.eval(FORMATO + js + '\nwindow.Carga = Carga;');
const { Carga } = window;
const doc = window.document;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const pintar = (h) => { const c = doc.getElementById('caja'); c.innerHTML = h; return c; };

console.log('1. Cada forma');
ok(Carga.FORMAS.join(',') === 'bloque,lista,kpis,ficha,caja,barras', 'bloque, lista, kpis, ficha, caja y barras');
Carga.FORMAS.forEach((f) => {
  const c = pintar(Carga.html(f));
  const raiz = c.firstElementChild;
  ok(raiz.classList.contains('carga') && raiz.classList.contains('carga-' + f) && c.querySelectorAll('.carga-hueso').length > 0,
    f + ': pinta huesos dentro de .carga');
});
ok(pintar(Carga.html('lista', { n: 6 })).querySelectorAll('.carga-fila').length === 6, 'n: cuántos renglones');
ok(pintar(Carga.html('kpis', { n: 3 })).querySelectorAll('.stat-tile').length === 3, 'kpis con la forma de .stat-tile');
ok(pintar(Carga.html('ficha', { n: 4, columnas: 3 })).querySelector('.carga-ficha-campos').style.getPropertyValue('--carga-columnas') === '3', 'ficha: columnas');
ok(/height:\s*180px/.test(pintar(Carga.html('caja', { alto: 180 })).querySelector('.carga-hueso').getAttribute('style')), 'caja: del alto que se pida');
ok(pintar(Carga.html('desconocida')).firstElementChild.classList.contains('carga-bloque'), 'una forma que no existe cae en bloque');
ok(pintar(Carga.html('ficha', { tarjeta: true })).firstElementChild.classList.contains('card'), 'tarjeta: envuelta en .card');

console.log('\n2. Lector de pantalla');
const c = pintar(Carga.html('bloque'));
ok(c.firstElementChild.getAttribute('role') === 'status' && c.firstElementChild.getAttribute('aria-busy') === 'true', 'role=status y aria-busy');
ok(c.querySelector('.carga-sr').textContent === 'Cargando…', 'dice "Cargando…" (oculto a la vista)');
ok(pintar(Carga.html('lista', { texto: '<b>x</b>' })).querySelector('.carga-sr').textContent === '<b>x</b>' &&
  !doc.querySelector('#caja b'), 'el texto va escapado');

console.log('\n3. Igual cada vez');
ok(Carga.html('ficha', { n: 8 }) === Carga.html('ficha', { n: 8 }) && Carga.html('lista') === Carga.html('lista'), 'sin azar: la misma pantalla se ve igual');

(async () => {
await new Promise((r) => (doc.readyState === 'loading' ? doc.addEventListener('DOMContentLoaded', r) : r()));
console.log('\n4. HTML fijo en una vista');
const fijo = doc.querySelector('[data-carga]');
ok(fijo.querySelectorAll('.carga-fila').length === 2 && fijo.querySelector('.carga-sr').textContent === 'Cargando colaboradores…',
  'Carga.montar llena [data-carga] al cargar, con su n y su texto');
const antes = fijo.innerHTML;
Carga.montar(doc);
ok(fijo.innerHTML === antes, 'montar dos veces no lo duplica');

console.log('\n5. Estilos');
ok(/prefers-reduced-motion:\s*reduce/.test(css) && /\.carga-hueso::after\s*\{\s*animation:\s*none/.test(css), 'sin brillo para quien pidió menos movimiento');
ok(/--color-text/.test(css) && !/#[0-9a-f]{3,6}\b/i.test(css), 'colores del tema, ningún color fijo');
ok(/animation:\s*carga-aparece[^;]*\.15s/.test(css), 'aparece después de 150 ms (una carga rápida no parpadea)');

console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
process.exitCode = fallas ? 1 : 0;
})();
