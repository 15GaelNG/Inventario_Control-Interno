/**
 * Pruebas del componente Avatar (src/html/js/componentes/avatar.html) en un navegador simulado
 * (jsdom): iniciales sin foto, la foto encima cuando llegan las fotos (también en lo ya pintado),
 * nada que no sea una foto de Google en un src, y que una foto rota deje las iniciales.
 *
 * Correr: node tests/avatar.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'componentes', 'avatar.html'), 'utf8');
const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const dom = new JSDOM('<!doctype html><body><div id="antes"></div><div id="despues"></div></body>', { url: 'https://prueba.local/', runScripts: 'outside-only' });
const { window } = dom;
window.eval(js + '\nwindow.Avatar = Avatar;');
const { Avatar } = window;
const doc = window.document;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const G = 'https://lh3.googleusercontent.com/a/';

(async () => {
  console.log('1. Iniciales');
  ok(Avatar.iniciales('Ana  López Pérez') === 'AL' && Avatar.iniciales('luis.garcia@ejemplo.com') === 'LG' && Avatar.iniciales('') === '?',
    'dos iniciales, del nombre o del correo; "?" sin nada');

  console.log('\n2. Antes de que lleguen las fotos');
  doc.getElementById('antes').innerHTML = Avatar.html('Ana@Ejemplo.com', 'Ana López', { tam: 30 }) + Avatar.html('nadie@ejemplo.com', 'Sin Foto');
  const a = doc.querySelector('#antes [data-avatar-correo="ana@ejemplo.com"]');
  ok(a && a.textContent === 'AL' && !a.querySelector('img'), 'se pintan las iniciales');
  ok(a.style.width === '30px' && a.title === 'Ana López', 'con su tamaño y el nombre al pasar el mouse');
  const x = Avatar.html('<b>@x', '"><img src=x onerror=alert(1)>', { clase: 'c" onclick="y' });
  ok(!/<img src=x|onclick="y"/.test(x), 'lo que se pinta va escapado');

  console.log('\n3. Llegan las fotos');
  await Avatar.cargar(() => Promise.resolve({ 'ANA@ejemplo.com': G + 'ana', 'malo@ejemplo.com': 'javascript:alert(1)' }));
  const foto = a.querySelector('img.avatar-foto');
  ok(foto && foto.getAttribute('src') === G + 'ana' && foto.getAttribute('referrerpolicy') === 'no-referrer', 'lo ya pintado se completa con la foto (sin mandar de dónde se pide)');
  ok(!doc.querySelector('#antes [data-avatar-correo="nadie@ejemplo.com"] img'), 'quien no tiene foto se queda con sus iniciales');
  doc.getElementById('despues').innerHTML = Avatar.html('ana@ejemplo.com', 'Ana') + Avatar.html('malo@ejemplo.com', 'Malo');
  ok(doc.querySelector('#despues [data-avatar-correo="ana@ejemplo.com"] img') && !doc.querySelector('#despues [data-avatar-correo="malo@ejemplo.com"] img'),
    'lo que se pinta después ya sale con foto; una URL que no es de Google no se usa');
  let pedidas = 0;
  await Avatar.cargar(() => { pedidas++; return Promise.resolve({}); });
  ok(pedidas === 0, 'las fotos se piden una sola vez');
  ok(/avatar-foto/.test(Avatar.html('', 'Entrada', { foto: G + 'yo' })) && !/avatar-foto/.test(Avatar.html('', 'X', { foto: 'https://otro.com/y' })),
    'foto directa (la pantalla de entrada), solo si es de Google');
  ok(/avatar-llenar/.test(Avatar.html('a@b.c', 'A', { tam: 0 })) && !/style=/.test(Avatar.html('a@b.c', 'A', { tam: 0 })), 'tam 0 llena su contenedor');

  console.log('\n4. Una foto que no carga');
  foto.dispatchEvent(new window.Event('error'));
  ok(!a.querySelector('img') && a.textContent === 'AL', 'se quita y quedan las iniciales');

  console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
  process.exit(fallas ? 1 : 0);
})();
