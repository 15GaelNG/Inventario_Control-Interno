/**
 * SubirFotos (src/html/js/componentes/subir-fotos.html): fotos por sección, con la cámara o eligiendo varias.
 *
 * Correr: node tests/subir-fotos.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = path.join(__dirname, '..', 'src', 'html', 'js', 'componentes');
const scriptDe = (archivo) => { const h = fs.readFileSync(path.join(SRC, archivo), 'utf8'); return h.slice(h.indexOf('<script>') + 8, h.lastIndexOf('</script>')); };
const dom = new JSDOM('<!doctype html><body><div id="caja"></div></body>', { url: 'https://prueba.local/', runScripts: 'outside-only' });
const { window } = dom;
window.eval(require('./formato-fuente') + scriptDe('iconos.html') + scriptDe('subir-fotos.html') + '\nwindow.SubirFotos = SubirFotos;');
const { SubirFotos, document } = window;
window.URL.createObjectURL = () => 'blob:local';
window.URL.revokeObjectURL = () => {};

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const espera = () => new Promise((r) => setTimeout(r, 0));
const archivo = (nombre) => new window.File(['x'], nombre, { type: 'image/jpeg' });
function elegir(caja, seccion, archivos) {
  const input = Array.from(caja.querySelectorAll('.sf-seccion')).find((c) => c.dataset.seccion === seccion)
    .querySelector('input[type="file"]:not([capture])');
  Object.defineProperty(input, 'files', { value: archivos, configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
}

(async () => {
  console.log('1. Una tarjeta por sección, con cámara y elegir');
  const caja = document.getElementById('caja');
  const subidas = [];
  let fallarUna = false;
  let cambios = 0;
  const fotos = SubirFotos.crear(caja, {
    secciones: [{ id: 'NEUMATICOS', titulo: 'Neumáticos' }, { id: 'INTERIORES', titulo: 'Interiores' }],
    preparar: (a) => Promise.resolve({ nombre: a.name, mime: 'image/jpeg', base64: 'eA==' }),
    subir: (seccion, f) => {
      if (fallarUna) { fallarUna = false; return Promise.reject(new Error('Sin señal')); }
      subidas.push(seccion + ':' + f.nombre);
      return Promise.resolve({ id: 'id-' + subidas.length, nombre: f.nombre, miniatura: 'https://x/' + subidas.length });
    },
    quitar: () => Promise.resolve(),
    puedeQuitar: (s, cuantas) => cuantas > 1,
    alCambiar: () => cambios++,
  });
  ok(caja.querySelectorAll('.sf-seccion').length === 2, 'dos secciones');
  ok(caja.querySelectorAll('input[capture="environment"]').length === 2 && caja.querySelectorAll('input[multiple]').length === 4,
    'cada una con "Tomar foto" (cámara trasera) y "Elegir fotos" (varias)');
  ok(fotos.faltan().join() === 'Neumáticos,Interiores', 'al empezar faltan las dos');
  ok(caja.querySelectorAll('.sf-falta:not([hidden])').length === 2, 'y lo dice en cada tarjeta');

  console.log('2. Elegir varias sube cada una');
  elegir(caja, 'NEUMATICOS', [archivo('a.jpg'), archivo('b.jpg')]);
  ok(fotos.subiendo(), 'mientras suben, subiendo() es true');
  await espera(); await espera(); await espera();
  ok(!fotos.subiendo() && subidas.join() === 'NEUMATICOS:a.jpg,NEUMATICOS:b.jpg', 'subieron las dos a su sección');
  ok(fotos.faltan().join() === 'Interiores', 'ya solo falta Interiores');
  ok(fotos.fotos().NEUMATICOS.map((f) => f.id).join() === 'id-1,id-2', 'fotos() da los ids del servidor');
  ok(cambios > 0, 'avisa con alCambiar');

  console.log('3. Una que falla se puede reintentar');
  fallarUna = true;
  elegir(caja, 'INTERIORES', [archivo('c.jpg')]);
  await espera(); await espera(); await espera();
  ok(fotos.conError() === 1 && fotos.faltan().join() === 'Interiores', 'falló: sigue faltando y queda marcada');
  caja.querySelector('[data-reintentar]').click();
  await espera(); await espera(); await espera();
  ok(fotos.conError() === 0 && fotos.faltan().length === 0, 'al reintentar sube y ya no falta nada');

  console.log('4. Quitar, sin dejar la sección vacía si así se pide');
  const quitarDe = (s) => Array.from(caja.querySelectorAll('.sf-seccion')).find((c) => c.dataset.seccion === s).querySelectorAll('[data-quitar]');
  ok(quitarDe('INTERIORES')[0].disabled, 'la única foto de Interiores no se puede quitar (puedeQuitar)');
  quitarDe('NEUMATICOS')[0].click();
  await espera(); await espera();
  ok(fotos.fotos().NEUMATICOS.length === 1, 'se quitó una de Neumáticos');
  ok(quitarDe('NEUMATICOS')[0].disabled, 'y la que queda ya no se puede quitar');

  console.log('4b. Máximo por sección');
  const caja3 = document.createElement('div');
  document.body.appendChild(caja3);
  const f3 = SubirFotos.crear(caja3, {
    secciones: [{ id: 'OTROS', titulo: 'Otros' }], maximo: 3,
    preparar: (a) => Promise.resolve({ nombre: a.name, mime: 'image/jpeg', base64: 'eA==' }),
    subir: (s, f) => Promise.resolve({ id: f.nombre, nombre: f.nombre }),
  });
  elegir(caja3, 'OTROS', [archivo('1.jpg'), archivo('2.jpg'), archivo('3.jpg'), archivo('4.jpg'), archivo('5.jpg')]);
  await espera(); await espera(); await espera();
  ok(f3.fotos().OTROS.length === 3, 'de 5 elegidas solo entran 3 (el máximo)');
  ok(/se agregaron 3 de las 5/.test(caja3.querySelector('.sf-aviso').textContent) && !caja3.querySelector('.sf-aviso').hidden, 'y dice cuántas entraron');
  ok(caja3.querySelector('.sf-seccion').classList.contains('sf-llena'), 'con la sección llena se esconden los botones');
  caja3.querySelector('[data-quitar]').click();
  await espera(); await espera();
  ok(!caja3.querySelector('.sf-seccion').classList.contains('sf-llena') && caja3.querySelector('.sf-aviso').hidden, 'al quitar una, se puede agregar otra y se va el aviso');
  f3.destruir();

  console.log('5. Lo que ya estaba (editar / borrador)');
  const caja2 = document.createElement('div');
  document.body.appendChild(caja2);
  const f2 = SubirFotos.crear(caja2, {
    secciones: [{ id: 'CRISTALERIA', titulo: 'Cristalería' }],
    iniciales: { CRISTALERIA: [{ id: 'x1', nombre: 'CRISTALERIA-0088.jpg', miniatura: 'https://x/m' }] },
    subir: () => Promise.reject(new Error('no')),
  });
  ok(f2.faltan().length === 0 && caja2.querySelectorAll('.sf-foto img').length === 1, 'pinta las iniciales y no falta nada');
  f2.destruir();
  ok(caja2.innerHTML === '', 'destruir limpia');

  if (fallas) { console.error('\n' + fallas + ' falla(s)'); process.exit(1); }
  console.log('\nTODO OK');
})();
