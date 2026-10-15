// Pruebas del componente Ayuda (src/html/js/componentes/ayuda.html) en un navegador simulado
// (jsdom): sin buscar se ven las preguntas de la pantalla; con `buscarEnTodas`, al escribir se
// busca en TODAS las preguntas de la app (con su etiqueta de pantalla), aunque esta pantalla no
// tenga ninguna propia (14-oct-2026, buscador general del asistente flotante).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'componentes', 'ayuda.html'), 'utf8');
const FORMATO = require('./formato-fuente');
const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

function montar() {
  const dom = new JSDOM('<!doctype html><body></body></html>', { url: 'https://prueba.local/', runScripts: 'outside-only' });
  dom.window.eval(FORMATO + js + '\nwindow.Ayuda = Ayuda;');
  return dom;
}

function escribir(dom, texto) {
  const buscador = dom.window.document.querySelector('.ayuda-buscar');
  buscador.value = texto;
  buscador.dispatchEvent(new dom.window.Event('input'));
}

test('sin buscarEnTodas: se ven las preguntas de la pantalla (la primera abierta) y no sale buscador con pocas', () => {
  const dom = montar();
  const { document, Ayuda } = dom.window;
  Ayuda.abrir([
    { pregunta: 'Uno', respuesta: 'Respuesta uno' },
    { pregunta: 'Dos', respuesta: 'Respuesta dos' },
  ]);
  assert.equal(document.querySelectorAll('.ayuda-item').length, 2);
  assert.ok(document.querySelector('.ayuda-item').hasAttribute('open'), 'la primera sale abierta');
  assert.equal(document.querySelector('.ayuda-buscar'), null, 'sin buscador: pocas preguntas y sin buscarEnTodas');
});

test('buscarEnTodas: el buscador sale aunque esta pantalla no tenga preguntas propias', () => {
  const dom = montar();
  const { document, Ayuda } = dom.window;
  Ayuda.abrir([], { buscarEnTodas: () => [] });
  assert.ok(document.querySelector('.ayuda-buscar'), 'el buscador sale aunque no haya preguntas locales');
  assert.match(document.querySelector('.ayuda-vacio').textContent, /busca arriba/);
});

test('buscarEnTodas: al escribir, deja de ver solo lo local y busca en TODAS, con la etiqueta de qué pantalla es cada una', () => {
  const dom = montar();
  const { document, Ayuda } = dom.window;
  const todas = [
    { pantalla: 'Vehículos', pregunta: '¿Cómo busco por serie?', respuesta: 'Usa el cuadro de búsqueda.' },
    { pantalla: 'Arqueos', pregunta: '¿Cómo cierro un arqueo?', respuesta: 'Con el botón Cerrar.' },
  ];
  Ayuda.abrir([{ pregunta: 'Local', respuesta: 'Nada que ver' }], { buscarEnTodas: () => todas });
  escribir(dom, 'serie');
  const items = document.querySelectorAll('.ayuda-item');
  assert.equal(items.length, 1, 'ya no mezcla con la pregunta local, que no hace match');
  assert.match(items[0].textContent, /Vehículos/);
  assert.match(items[0].textContent, /Cómo busco por serie/);
});

test('buscarEnTodas: encuentra por la respuesta (no solo la pregunta) y no distingue acentos/mayúsculas', () => {
  const dom = montar();
  const { document, Ayuda } = dom.window;
  const todas = [{ pantalla: 'Caja chica', pregunta: '¿Qué hago si falta dinero?', respuesta: 'Registra la DIFERENCIA en el cierre.' }];
  Ayuda.abrir([], { buscarEnTodas: () => todas });
  escribir(dom, 'diferencia');
  assert.equal(document.querySelectorAll('.ayuda-item').length, 1);
  escribir(dom, 'DÍFERENCIÁ');
  assert.equal(document.querySelectorAll('.ayuda-item').length, 1, 'ignora acentos y mayúsculas');
});

test('sin resultados avisa "nada encontrado", y lo que se pinta va escapado (pregunta/respuesta y etiqueta de pantalla)', () => {
  const dom = montar();
  const { document, Ayuda } = dom.window;
  Ayuda.abrir([{ pregunta: '<b>x</b>', respuesta: '"><img src=x onerror=alert(1)>' }], {
    buscarEnTodas: () => [{ pantalla: '<img src=y onerror=alert(2)>', pregunta: 'Algo', respuesta: 'Algo' }],
  });
  assert.ok(!document.querySelector('.ayuda-item img'), 'la pregunta/respuesta local va escapada');
  escribir(dom, 'algo');
  assert.ok(!document.querySelector('.ayuda-item img'), 'la etiqueta de pantalla también va escapada');
  escribir(dom, 'esto-no-existe-en-ningun-lado');
  assert.match(document.querySelector('.ayuda-vacio').textContent, /Nada encontrado/);
});

test('Esc cierra el panel', () => {
  const dom = montar();
  const { document, Ayuda } = dom.window;
  Ayuda.abrir([{ pregunta: 'Uno', respuesta: 'Resp' }]);
  assert.ok(document.querySelector('.ayuda-card'));
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(document.querySelector('.ayuda-card'), null);
});
