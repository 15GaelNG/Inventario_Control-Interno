/**
 * FiltroTipo (src/html/js/componentes/filtro-tipo.html): la franja de íconos para filtrar una tabla por tipo, clase o estatus.
 *
 * Correr: node tests/filtro-tipo.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = path.join(__dirname, '..', 'src', 'html', 'js', 'componentes');
const scriptDe = (archivo) => { const h = fs.readFileSync(path.join(SRC, archivo), 'utf8'); return h.slice(h.indexOf('<script>') + 8, h.lastIndexOf('</script>')); };
const dom = new JSDOM('<!doctype html><body><nav id="f"></nav><nav id="g"></nav></body>', { url: 'https://prueba.local/', runScripts: 'outside-only' });
const { window } = dom;
window.eval(require('./formato-fuente') + scriptDe('iconos.html') + scriptDe('filtro-tipo.html') + '\nwindow.FiltroTipo = FiltroTipo;');
const { FiltroTipo, document } = window;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const clic = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

console.log('1. Pintar desde las filas');
const elegidos = [];
const f = document.getElementById('f');
const panel = FiltroTipo.crear(f, {
  titulo: 'Clase', todos: 'Todas', campo: 'CLASE', orden: ['AUTOMOVIL', 'CAMION'],
  estilos: { AUTOMOVIL: { icono: 'car', color: 'var(--tono-azul)' } }, nombre: (c) => (c === 'CAMION' ? 'Camión' : c),
  alElegir: (v) => elegidos.push(v),
});
panel.pintar([{ CLASE: 'automovil' }, { CLASE: 'AUTOMOVIL' }, { CLASE: 'REMOLQUE' }, { CLASE: '' }]);
const items = () => Array.from(f.querySelectorAll('.filtro-tipo-item'));
ok(items().map((b) => b.dataset.valor).join() === '*,AUTOMOVIL,CAMION,REMOLQUE', 'Todas, el orden dado y luego lo demás (sin vacíos)');
ok(f.querySelector('.filtro-tipo-titulo').textContent === 'Clase', 'título');
ok(items()[1].querySelector('.filtro-tipo-num').textContent === '2' && items()[0].querySelector('.filtro-tipo-num').textContent === '4', 'conteos (en mayúsculas) y el total');
ok(items()[2].classList.contains('filtro-tipo-item-vacio') && items()[2].textContent.includes('Camión'), 'el que no tiene filas sale tenue, con su nombre');
ok(items()[1].querySelector('.filtro-tipo-ico').getAttribute('style') === 'color:var(--tono-azul)', 'ícono con su color');
ok(items()[0].classList.contains('activo'), 'sin filtro: Todas marcada');

console.log('2. Elegir y marcar');
clic(items()[1]);
ok(elegidos[0] === 'AUTOMOVIL', 'clic en uno → alElegir(valor)');
panel.marcar({ valores: ['AUTOMOVIL'] });
ok(items()[1].classList.contains('activo') && items()[1].getAttribute('aria-pressed') === 'true' && !items()[0].classList.contains('activo'), 'marcar con el filtro de la tabla');
clic(items()[1]);
ok(elegidos[1] === null, 'clic en el elegido → quita el filtro (null)');
clic(items()[0]);
ok(elegidos[2] === null, 'Todas → null');
panel.pintar([{ CLASE: 'AUTOMOVIL' }]);
ok(items()[1].classList.contains('activo'), 'al repintar se queda marcado lo elegido');
panel.marcar(null);
ok(items()[0].classList.contains('activo'), 'marcar(null) vuelve a Todas');

console.log('3. Conteos ya calculados (Líneas)');
const g = document.getElementById('g');
let elegido;
FiltroTipo.crear(g, { titulo: 'Tipo', todos: 'TODOS', nombre: (t) => t || 'SIN TIPO', alElegir: (v) => { elegido = v; } })
  .pintar({ conteo: { LINEA: 1500, '': 2 }, total: 1502, valores: ['LINEA', ''] });
const b = Array.from(g.querySelectorAll('.filtro-tipo-item'));
ok(b[1].querySelector('.filtro-tipo-num').textContent === '1,500', 'conteo con miles');
ok(b[2].textContent.includes('SIN TIPO'), 'el vacío con su nombre');
clic(b[2]);
ok(elegido === '', 'elegir el vacío manda "" (no null)');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
