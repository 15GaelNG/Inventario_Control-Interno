/**
 * Tabs (src/html/js/componentes/tabs.html): las pestañas de todo el sistema, una sola implementación.
 *
 * Correr: node tests/tabs.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = path.join(__dirname, '..', 'src', 'html', 'js', 'componentes');
const scriptDe = (archivo) => { const h = fs.readFileSync(path.join(SRC, archivo), 'utf8'); return h.slice(h.indexOf('<script>') + 8, h.lastIndexOf('</script>')); };
const dom = new JSDOM('<!doctype html><body><div id="vista"></div></body>', { url: 'https://prueba.local/', runScripts: 'outside-only' });
const { window } = dom;
window.eval(require('./formato-fuente') + scriptDe('iconos.html') + scriptDe('tabs.html') + '\nwindow.Tabs = Tabs;');
const { Tabs, document } = window;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const visibles = (raiz) => Array.from(raiz.querySelectorAll('[data-tab-panel]')).filter((p) => !p.hidden).map((p) => p.dataset.tabPanel);
const clic = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

console.log('1. Una vista: iniciar y clic');
const vista = document.getElementById('vista');
vista.innerHTML = '<div class="tabs-lista"><button type="button" class="tab-btn activa" data-tab="lista">Catálogo</button>' +
  '<button type="button" class="tab-btn" data-tab="registrar">Registrar</button></div>' +
  '<div data-tab-panel="registrar" hidden>form</div><div data-tab-panel="lista">tabla</div><div id="ficha"></div>';
const cambios = [];
const t = Tabs.iniciar(vista, { alCambiar: (n) => cambios.push(n) });
ok(t.actual() === 'lista' && visibles(vista).join() === 'lista', 'empieza en la que viene marcada');
clic(vista.querySelector('[data-tab="registrar"]'));
ok(t.actual() === 'registrar' && visibles(vista).join() === 'registrar', 'el clic cambia de panel');
ok(vista.querySelector('[data-tab="registrar"]').getAttribute('aria-selected') === 'true', 'aria-selected');
ok(cambios.join() === 'lista,registrar', 'alCambiar al iniciar y al cambiar');

console.log('2. Una ficha adentro: Tabs.html, grupos que no se pisan');
t.mostrar('lista');
const ficha = document.getElementById('ficha');
ficha.innerHTML = Tabs.html([
  { id: 'datos', titulo: 'Datos', icono: 'x', contenido: '<p>datos</p>' },
  false,
  { id: 'historial', titulo: 'Historial <b>', num: 1234, contenido: 'h' },
], { activa: 'historial' });
ok(ficha.querySelectorAll('.tab-btn').length === 2, 'las pestañas false (sin permiso) no se pintan');
ok(Tabs.actual(ficha) === 'historial', 'abre en la pestaña pedida');
ok(ficha.innerHTML.includes('Historial &lt;b&gt;'), 'el título se escapa');
ok(ficha.querySelector('[data-tab-num="historial"]').textContent === '1,234', 'el contador con miles');
let evento = null;
ficha.addEventListener('tabs-cambio', (ev) => { evento = ev.detail.nombre; });
clic(ficha.querySelector('[data-tab="datos"]'));
ok(evento === 'datos' && Tabs.actual(ficha) === 'datos', 'el clic en la ficha avisa con tabs-cambio');
ok(t.actual() === 'lista' && visibles(vista).filter((n) => n === 'lista' || n === 'registrar').join() === 'lista',
  'la vista de afuera no se movió');
ok(Tabs.mostrar(ficha, 'no-existe') === false && Tabs.actual(ficha) === 'datos', 'una pestaña que no existe: se queda donde está');
Tabs.contar(ficha, 'datos', 7);
ok(ficha.querySelector('[data-tab-num="datos"]').textContent === '7', 'contar');
clic(vista.querySelector('[data-tab="registrar"]'));
ok(Tabs.actual(ficha) === 'datos', 'cambiar la vista no toca la ficha');

console.log('3. Lo que se pinta después');
ficha.innerHTML = Tabs.html([{ id: 'a', titulo: 'A' }, { id: 'b', titulo: 'B' }]);
clic(ficha.querySelector('[data-tab="b"]'));
ok(Tabs.actual(ficha) === 'b', 'una ficha repintada con innerHTML responde sin volver a conectar nada');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
