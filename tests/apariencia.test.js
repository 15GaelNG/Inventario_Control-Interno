/**
 * Pruebas del componente Apariencia (src/html/js/componentes/apariencia.html, el engrane de la
 * barra) con el componente REAL y Pantalla real, en un navegador simulado (jsdom) cuyo modo
 * oscuro del sistema se puede cambiar.
 *
 * Correr: node tests/apariencia.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const leer = (rel) => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'componentes', rel), 'utf8');
  return html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
};
const PANTALLA = leer('pantalla.html');
const APARIENCIA = leer('apariencia.html');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

/** Un navegador con lo guardado en localStorage y el modo del sistema que se pida */
function navegador({ guardado = {}, sistemaOscuro = false, temporada } = {}) {
  const dom = new JSDOM('<!doctype html><head></head><body><button type="button" class="ap-boton" aria-expanded="false"></button></body>',
    { url: 'https://prueba.local/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  Object.entries(guardado).forEach(([k, v]) => window.localStorage.setItem(k, v));
  const sistema = { oscuro: sistemaOscuro, oyentes: new Set() };
  window.matchMedia = (q) => {
    if (q === '(prefers-color-scheme: dark)') {
      return {
        get matches() { return sistema.oscuro; },
        addEventListener: (t, f) => sistema.oyentes.add(f),
        removeEventListener: (t, f) => sistema.oyentes.delete(f),
      };
    }
    return { matches: false, addEventListener() {}, removeEventListener() {} };
  };
  window.cambiarSistema = (oscuro) => { sistema.oscuro = oscuro; sistema.oyentes.forEach((f) => f()); };
  if (temporada) window.Temporada = temporada;
  window.eval(PANTALLA + '\n' + APARIENCIA + '\nwindow.Apariencia = Apariencia;');
  return window;
}
const tema = (w) => w.document.documentElement.getAttribute('data-theme');
const attr = (w, n) => w.document.documentElement.getAttribute(n);
const clic = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

console.log('1. Lo guardado');
{
  const w = navegador();
  ok(tema(w) === null && attr(w, 'data-color') === null, 'sin nada guardado: claro y los colores de marca');
  const v = navegador({ guardado: { tema: 'dark' } });
  ok(tema(v) === 'dark' && v.Apariencia.preferencias().modo === 'dark', 'quien tenía "tema: dark" de antes sigue en oscuro');
  const x = navegador({ guardado: { apariencia: JSON.stringify({ modo: 'raro', color: 'fucsia', letra: 'comic' }) } });
  const p = x.Apariencia.preferencias();
  ok(p.modo === 'light' && p.color === 'marca' && p.letra === 'poppins', 'algo que no existe vuelve a lo de siempre');
  const r = navegador({ guardado: { apariencia: '{roto' } });
  ok(r.Apariencia.preferencias().modo === 'light', 'un JSON roto no truena');
}

console.log('\n2. Cambiar');
{
  const w = navegador();
  let avisos = 0;
  w.document.addEventListener('tema-cambiado', () => avisos++);
  w.Apariencia.cambiar({ modo: 'dark' });
  ok(tema(w) === 'dark' && avisos === 1, 'oscuro: pone data-theme y avisa "tema-cambiado"');
  w.Apariencia.cambiar({ color: 'verde' });
  ok(avisos === 1, 'cambiar el color no avisa de tema');
  const guardado = JSON.parse(w.localStorage.getItem('apariencia'));
  ok(guardado.modo === 'dark' && guardado.color === 'verde' && w.localStorage.getItem('tema') === 'dark', 'se guarda (y "tema" para versiones anteriores)');
  w.Apariencia.cambiar({ ancho: 'contenedor', letra: 'inter' });
  ok(attr(w, 'data-color') === 'verde' && attr(w, 'data-ancho') === 'contenedor' && attr(w, 'data-letra') === 'inter', 'color, ancho y letra en <html>');
  const links = [...w.document.head.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href);
  ok(links.length === 1 && links[0].startsWith('https://fonts.googleapis.com/css2?family=Inter:'), 'la letra se pide a Google Fonts una vez, con la dirección completa');
  w.Apariencia.cambiar({ color: 'marca', ancho: 'fluido', letra: 'poppins' });
  ok(attr(w, 'data-color') === null && attr(w, 'data-ancho') === null && attr(w, 'data-letra') === null, 'lo de siempre no deja atributos');
}

console.log('\n3. Auto sigue al sistema');
{
  const w = navegador({ sistemaOscuro: true, guardado: { apariencia: JSON.stringify({ modo: 'auto' }) } });
  ok(tema(w) === 'dark', 'sistema en oscuro: oscuro desde que carga');
  let avisos = 0;
  w.document.addEventListener('tema-cambiado', () => avisos++);
  w.cambiarSistema(false);
  ok(tema(w) === null && avisos === 1, 'el sistema pasa a claro: la página también, y avisa');
  w.Apariencia.cambiar({ modo: 'dark' });
  w.cambiarSistema(false);
  ok(tema(w) === 'dark', 'con un modo elegido, el sistema ya no manda');
}

console.log('\n4. El panel');
(async () => {
  const llamadas = [];
  const w = navegador({
    temporada: { opciones: (cont) => { llamadas.push(cont); cont.innerHTML = '<p class="dm-x">Día de Muertos</p>'; return true; } },
  });
  const doc = w.document;
  const boton = doc.querySelector('.ap-boton');
  clic(w, boton);
  await new Promise((r) => w.requestAnimationFrame(r));
  const panel = doc.getElementById('ap-panel');
  ok(panel && !panel.hidden && panel.classList.contains('ap-visible') && boton.getAttribute('aria-expanded') === 'true', 'el engrane abre el panel');
  ok(doc.querySelector('[data-ap="modo"][data-valor="light"]').getAttribute('aria-pressed') === 'true', 'marca lo que está elegido');
  clic(w, doc.querySelector('[data-ap="modo"][data-valor="dark"]'));
  ok(tema(w) === 'dark' && doc.querySelector('[data-ap="modo"][data-valor="dark"]').getAttribute('aria-pressed') === 'true'
    && doc.querySelector('[data-ap="modo"][data-valor="light"]').getAttribute('aria-pressed') === 'false', 'un clic en Oscuro lo aplica y lo marca');
  clic(w, doc.querySelector('[data-ap="color"][data-valor="morado"]'));
  ok(attr(w, 'data-color') === 'morado', 'un clic en un color lo aplica');
  ok(doc.querySelectorAll('link[rel="stylesheet"]').length === 3, 'al abrir se piden las otras letras para verlas en su botón');
  const sec = doc.getElementById('ap-temporada');
  ok(llamadas[0] === sec && !sec.hidden && sec.querySelector('.dm-x'), 'la temporada pinta su sección');
  clic(w, doc.querySelector('[data-ap-restablecer]'));
  ok(tema(w) === null && attr(w, 'data-color') === null, 'Restablecer vuelve a lo de siempre');
  panel.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok(!panel.classList.contains('ap-visible') && boton.getAttribute('aria-expanded') === 'false', 'Esc lo cierra');
  await new Promise((r) => setTimeout(r, 300));
  ok(panel.hidden, 'y queda escondido al terminar la animación');

  const sin = navegador({ temporada: { opciones: () => false } });
  clic(sin, sin.document.querySelector('.ap-boton'));
  ok(sin.document.getElementById('ap-temporada').hidden, 'sin temporada abierta (y sin ser ADMIN), no hay sección');
  clic(sin, sin.document.querySelector('.ap-fondo'));
  ok(!sin.document.getElementById('ap-panel').classList.contains('ap-visible'), 'tocar fuera lo cierra');

  console.log(fallas ? `\n${fallas} prueba(s) fallaron` : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})();
