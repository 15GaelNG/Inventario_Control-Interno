/**
 * Ficha (src/html/js/componentes/ficha.html): migas y encabezado de la página de un registro, igual en todos los módulos.
 *
 * Correr: node tests/ficha.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = path.join(__dirname, '..', 'src', 'html', 'js', 'componentes');
const scriptDe = (archivo) => { const h = fs.readFileSync(path.join(SRC, archivo), 'utf8'); return h.slice(h.indexOf('<script>') + 8, h.lastIndexOf('</script>')); };
const dom = new JSDOM('<!doctype html><body><div id="r"></div></body>', { url: 'https://prueba.local/', runScripts: 'outside-only' });
const { window } = dom;
window.eval(require('./formato-fuente') + scriptDe('iconos.html') + scriptDe('ficha.html') + '\nwindow.Ficha = Ficha;');
const { Ficha, document } = window;
const r = document.getElementById('r');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

console.log('1. Migas');
r.innerHTML = Ficha.migas({
  volver: { texto: 'Volver a <NUCO>', titulo: 'Volver a <NUCO>', atributos: 'data-volver' },
  ruta: [{ texto: 'Líneas', atributos: 'data-lista' }, { texto: 'NUCO 8', atributos: 'data-miga="0"' }],
  actual: 'Línea <b>',
});
ok(r.querySelector('nav.ficha-migas button[data-volver]').textContent.trim() === 'Volver a <NUCO>', 'Volver con su texto (escapado)');
ok(r.querySelectorAll('.ficha-migas-ruta li').length === 3, 'ruta + página actual');
ok(r.querySelector('[data-miga="0"]').tagName === 'BUTTON', 'cada nivel lleva los atributos con que lo conecta el módulo');
ok(r.querySelector('.ficha-miga-actual').getAttribute('aria-current') === 'page' && r.querySelector('.ficha-miga-actual').textContent === 'Línea <b>', 'la actual, escapada');
r.innerHTML = Ficha.migas({ volver: { atributos: 'id="v"' } });
ok(r.querySelector('#v').textContent.trim() === 'Volver' && !r.querySelector('ol'), 'solo Volver');

console.log('2. Encabezado');
r.innerHTML = Ficha.encabezado({
  icono: 'car', color: 'var(--tono-azul)', titulo: 'Nucco <24>', chips: '<span class="chip">Activo</span>',
  botones: '<button id="editar">Editar</button>',
  resumen: [['Placa', 'GGY<886>'], ['Vacío', ''], ['Liga', '<a href="#">x</a>', true], null],
});
ok(r.querySelector('.ficha-titulo h2').textContent === 'Nucco <24>', 'título escapado');
ok(r.querySelector('.ficha-icono.con-color').getAttribute('style') === 'color:var(--tono-azul)', 'color del ícono sin placa');
ok(r.querySelector('.ficha-chips .chip') && r.querySelector('.ficha-botones #editar'), 'chips y botones tal cual');
const dd = Array.from(r.querySelectorAll('.ficha-resumen dd'));
ok(dd.length === 3, 'el resumen salta los null');
ok(dd[0].textContent === 'GGY<886>', 'valor escapado');
ok(dd[1].textContent === '—', 'vacío → —');
ok(dd[2].querySelector('a'), 'con true el valor es HTML');
r.innerHTML = Ficha.encabezado({ iconoHtml: '<span id="av"></span>', tituloHtml: '<em>Ana</em>' });
ok(r.querySelector('.ficha-icono #av') && r.querySelector('h2 em'), 'iconoHtml y tituloHtml');
ok(!r.querySelector('.ficha-resumen'), 'sin resumen no hay dl');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
