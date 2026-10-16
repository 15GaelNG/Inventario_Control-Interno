/**
 * Pasos (componentes/pasos.html): la navegación de los formularios por pasos, la misma en Formulario y en las capturas
 * de Líneas. Se prueba sola, sin campos: quien la usa dice qué paso aplica y si el actual tiene errores. Correr: npm test
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'componentes', 'pasos.html'), 'utf8');
const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
const { window } = dom;
window.eval(html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>')) + '\nwindow.Pasos = Pasos;');
const doc = window.document;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

/** Un formulario de 4 pasos; `aplica` y `errores` se cambian desde la prueba. */
function armar(opciones) {
  const caja = doc.body.appendChild(doc.createElement('div'));
  caja.innerHTML = window.Pasos.htmlChips(['Uno', 'Dos', 'Tres', 'Cuatro']) +
    [0, 1, 2, 3].map((i) => '<section class="form-paso" data-paso="' + i + '"' + (i ? ' hidden' : '') + '><input id="c' + i + '"></section>').join('') +
    '<button class="atras"></button><button class="sig"></button><button class="guardar"></button><span class="cuenta"></span>';
  const estado = { aplica: [true, true, true, true], errores: {}, mostrados: [] };
  const q = (s) => caja.querySelector(s);
  const nav = window.Pasos.navegar(Object.assign({
    secciones: Array.from(caja.querySelectorAll('.form-paso')),
    chips: Array.from(caja.querySelectorAll('.form-paso-chip')),
    atras: q('.atras'), siguiente: q('.sig'), guardar: q('.guardar'), cuenta: q('.cuenta'), teclas: caja,
    aplica: (i) => estado.aplica[i],
    validar: (i) => !!estado.errores[i],
    alMostrar: (i, sinFoco) => estado.mostrados.push([i, sinFoco]),
  }, opciones || {}));
  nav.ir(0, true);
  const visible = () => Array.from(caja.querySelectorAll('.form-paso')).findIndex((s) => !s.hidden);
  const chip = (i) => caja.querySelectorAll('.form-paso-chip')[i];
  return { caja, nav, estado, q, visible, chip };
}

console.log('1. El indicador');
let f = armar();
ok(f.caja.querySelectorAll('.form-pasos .form-paso-chip').length === 4 && f.chip(0).textContent === '1Uno', 'un chip por paso, con su número');
ok(!f.chip(0).disabled && f.chip(1).disabled, 'solo el primero arranca habilitado');
ok(f.q('.cuenta').textContent === 'Paso 1 de 4' && f.q('.atras').hidden && !f.q('.sig').hidden && f.q('.guardar').hidden,
  'primer paso: sin Atrás ni Guardar, con Siguiente y la cuenta');

console.log('2. Avanzar y regresar');
f.estado.errores[0] = true;
f.q('.sig').click();
ok(f.visible() === 0, 'con errores en el paso no avanza');
f.estado.errores[0] = false;
f.q('.sig').click();
ok(f.visible() === 1 && f.chip(0).classList.contains('completado') && f.chip(1).classList.contains('activo'), 'sin errores avanza; el anterior queda completado');
f.q('.atras').click();
ok(f.visible() === 0, 'Atrás regresa');
f.estado.errores[0] = true;
f.chip(1).click();
ok(f.visible() === 0, 'a un paso ya visto, adelante, tampoco se salta con errores');
f.estado.errores[0] = false;
f.chip(1).click();
ok(f.visible() === 1, 'y sin errores sí');
ok(f.chip(3).disabled, 'a uno no visitado no se salta desde el indicador');

console.log('3. Pasos que no aplican');
f.estado.aplica[2] = false;
f.nav.refrescar();
ok(f.chip(2).closest('li').hidden && f.q('.cuenta').textContent === 'Paso 2 de 3' && f.chip(3).textContent.charAt(0) === '3',
  'desaparecen del indicador y la cuenta y los números se ajustan');
f.q('.sig').click();
ok(f.visible() === 3 && !f.q('.guardar').hidden && f.q('.sig').hidden, 'Siguiente se los salta; en el último sale Guardar');
f.estado.aplica[3] = false;
f.nav.refrescar();
ok(f.visible() === 1, 'si el actual deja de aplicar, se pasa a otro (el anterior que sí aplica)');

console.log('4. Enter, reiniciar y modo libre');
f.estado.aplica = [true, true, true, true];
f.nav.reiniciar();
ok(f.visible() === 0 && f.chip(1).disabled, 'reiniciar vuelve al primero, como nuevo');
const enter = (el, prevenido) => {
  const ev = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  if (prevenido) ev.preventDefault();
  el.dispatchEvent(ev);
};
enter(f.caja.querySelector('#c0'), true);
ok(f.visible() === 0, 'Enter que ya usó una lista (Combobox) no avanza');
enter(f.caja.querySelector('#c0'));
ok(f.visible() === 1, 'Enter en un campo avanza de paso');
ok(f.estado.mostrados.some(([i, sinFoco]) => i === 1 && sinFoco === false), 'alMostrar recibe el paso (con foco al navegar)');
f.caja.remove();

f = armar({ libre: true });
ok(!f.chip(3).disabled && !f.q('.guardar').hidden, 'libre (edición): todos los pasos a la mano y Guardar siempre');
f.estado.errores[0] = true;
f.chip(3).click();
ok(f.visible() === 3, 'libre: salta aunque el paso tenga errores (se revisan al guardar)');
f.caja.remove();

f = armar({ libre: true, guardarAlFinal: true });
ok(!f.chip(2).disabled && f.q('.guardar').hidden, 'libre con guardarAlFinal (Arqueos, Vehículo): se navega libre, pero sin Guardar al inicio');
f.chip(3).click();
ok(f.visible() === 3 && !f.q('.guardar').hidden && f.q('.sig').hidden, 'y Guardar sale en el último paso');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
