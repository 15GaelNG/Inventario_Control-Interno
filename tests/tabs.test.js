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

console.log('4. Subpestañas (un grupo con hijos)');
const insp = { id: 'inspecciones', titulo: 'Inspecciones', num: 12, contenido: 'tabla insp' };
ficha.innerHTML = Tabs.html([
  { id: 'datos', titulo: 'Datos', contenido: 'd' },
  { id: 'cumplimiento', titulo: 'Cumplimiento', hijos: [{ id: 'verificaciones', titulo: 'Verificaciones', num: 2, contenido: 'v' }, insp, false] },
  { id: 'equipamiento', titulo: 'Equipamiento', hijos: [false, { id: 'sensor', titulo: 'Sensor', contenido: 's' }] },
  { id: 'seguimiento', titulo: 'Seguimiento', hijos: [false, false] },
], { activa: 'inspecciones' });
const principales = () => Array.from(ficha.querySelector('.tabs-lista').children).map((b) => b.dataset.tab);
ok(principales().join() === 'datos,cumplimiento,sensor', 'un grupo de un solo hijo es ese hijo; uno sin hijos no sale');
ok(ficha.querySelectorAll('.tabs-sub .tab-btn').length === 2, 'las subpestañas sin permiso no se pintan');
ok(Tabs.actual(ficha) === 'inspecciones' && visibles(ficha).includes('cumplimiento') && visibles(ficha).includes('inspecciones'),
  'activa con el id de una subpestaña abre su grupo y a ella');
const avisos = [];
ficha.addEventListener('tabs-cambio', (ev) => avisos.push(ev.detail.nombre));
clic(ficha.querySelector('[data-tab="datos"]'));
avisos.length = 0;
clic(ficha.querySelector('[data-tab="cumplimiento"]'));
ok(avisos.includes('inspecciones'), 'abrir el grupo avisa también la subpestaña que se ve (lo que carga al abrir)');
avisos.length = 0;
ok(Tabs.mostrar(ficha, 'verificaciones') === true && Tabs.actual(ficha) === 'verificaciones', 'mostrar con el id de una subpestaña');
ok(!avisos.includes('inspecciones'), 'ir directo a una subpestaña no avisa la que tenía su grupo');
clic(ficha.querySelector('[data-tab="datos"]'));
ok(Tabs.mostrar(ficha, 'inspecciones') && visibles(ficha).includes('cumplimiento'), 'desde otra pestaña, mostrar abre el grupo de la subpestaña');
clic(ficha.querySelector('.tabs-sub [data-tab="verificaciones"]'));
ok(Tabs.actual(ficha) === 'verificaciones', 'el clic en una píldora');
Tabs.contar(ficha, 'inspecciones', 1500);
ok(ficha.querySelector('[data-tab-num="inspecciones"]').textContent === '1,500', 'contar una subpestaña');
ok(Tabs.mostrar(ficha, 'seguimiento') === false && Tabs.mostrar(ficha, 'no-existe') === false, 'lo que no se pintó no se abre');
clic(ficha.querySelector('[data-tab="datos"]'));
clic(ficha.querySelector('.tabs-sub [data-tab="inspecciones"]'));
ok(Tabs.actual(ficha) === 'inspecciones' && visibles(ficha).includes('cumplimiento'), 'un clic (desde código) en la píldora de un grupo escondido abre el grupo');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
