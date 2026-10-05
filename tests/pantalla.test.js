/**
 * Pruebas de comportamiento de Pantalla (los cortes celular / tableta / escritorio / táctil)
 * con el componente REAL de src/html/js/componentes y un matchMedia simulado al que se le
 * cambia el ancho. Correr con:  npm test
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'componentes', 'pantalla.html'), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

/** Un navegador con ancho y puntero controlables; matchMedia solo entiende lo que usa Pantalla */
function navegador(ancho, dedo, { soloAddListener } = {}) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
  const { window } = dom;
  const pantalla = { ancho, dedo };
  const listas = [];
  const evalua = (q) => {
    const m = /\(max-width: (\d+)px\)/.exec(q);
    if (m) return pantalla.ancho <= Number(m[1]);
    if (q === '(pointer: coarse)') return pantalla.dedo;
    throw new Error('consulta inesperada: ' + q);
  };
  window.matchMedia = (q) => {
    const oyentes = new Set();
    const lista = { media: q, matches: evalua(q) };
    if (soloAddListener) {
      lista.addListener = (f) => oyentes.add(f);
      lista.removeListener = (f) => oyentes.delete(f);
    } else {
      lista.addEventListener = (tipo, f) => oyentes.add(f);
      lista.removeEventListener = (tipo, f) => oyentes.delete(f);
    }
    lista._oyentes = oyentes;
    listas.push(lista);
    return lista;
  };
  window.eval(script + '\nwindow.Pantalla = Pantalla;');
  /** Cambia la pantalla y avisa como el navegador: solo a las consultas que cambiaron */
  const cambiar = (nuevo) => {
    Object.assign(pantalla, nuevo);
    listas.forEach((l) => {
      const antes = l.matches;
      l.matches = evalua(l.media);
      if (antes !== l.matches) l._oyentes.forEach((f) => f({ matches: l.matches }));
    });
  };
  return { Pantalla: window.Pantalla, cambiar, listas };
}

console.log('1. Cortes');
const casos = [
  [390, true, { celular: true, tableta: false, angosta: true, tactil: true }, 'celular (390)'],
  [640, true, { celular: true, tableta: false, angosta: true, tactil: true }, 'el borde 640 todavía es celular'],
  [641, true, { celular: false, tableta: true, angosta: true, tactil: true }, '641 ya es tableta'],
  [768, true, { celular: false, tableta: true, angosta: true, tactil: true }, 'tableta vertical (768)'],
  [1024, true, { celular: false, tableta: true, angosta: true, tactil: true }, 'el borde 1024 todavía es tableta'],
  [1025, false, { celular: false, tableta: false, angosta: false, tactil: false }, '1025 ya es escritorio'],
  [1366, true, { celular: false, tableta: false, angosta: false, tactil: true }, 'tableta horizontal grande: escritorio por ancho, pero táctil'],
];
casos.forEach(([ancho, dedo, esperado, texto]) => {
  const { Pantalla } = navegador(ancho, dedo);
  ok(JSON.stringify(Pantalla.estado()) === JSON.stringify(esperado), texto);
});
const { Pantalla: p } = navegador(390, true);
ok(p.esCelular() && !p.esTableta() && p.esAngosta() && p.esTactil(), 'los métodos sueltos dicen lo mismo que estado()');
ok(Object.isFrozen(p.CONSULTAS) && p.CONSULTAS.celular === '(max-width: 640px)' && p.CONSULTAS.angosta === '(max-width: 1024px)',
  'CONSULTAS expone los mismos cortes que usa el CSS y no se pueden cambiar');

console.log('2. alCambiar');
{
  const { Pantalla, cambiar, listas } = navegador(1280, false);
  const avisos = [];
  const dejar = Pantalla.alCambiar((e) => avisos.push(e));
  cambiar({ ancho: 1200 });
  ok(avisos.length === 0, 'cambiar el ancho sin cruzar un corte no avisa');
  cambiar({ ancho: 800 });
  ok(avisos.length === 1 && avisos[0].tableta && !avisos[0].celular, 'cruzar 1024 avisa con el estado nuevo (tableta)');
  cambiar({ ancho: 390, dedo: true });
  ok(avisos.length >= 2 && avisos[avisos.length - 1].celular && avisos[avisos.length - 1].tactil, 'girar a celular táctil avisa con el estado final');
  ok(listas.length === 3, 'usa una sola lista por consulta, aunque se pregunte muchas veces');
  dejar();
  const antes = avisos.length;
  cambiar({ ancho: 1400, dedo: false });
  ok(avisos.length === antes, 'después de dejar de escuchar ya no avisa');
}
{
  const { Pantalla, cambiar } = navegador(1280, false, { soloAddListener: true });
  let n = 0;
  const dejar = Pantalla.alCambiar(() => { n++; });
  cambiar({ ancho: 600 });
  ok(n > 0, 'funciona en Safari viejo (solo addListener)');
  dejar();
  const antes = n;
  cambiar({ ancho: 1400 });
  ok(n === antes, 'y también deja de escuchar ahí');
}

console.log('3. Sin matchMedia');
{
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
  delete dom.window.matchMedia;
  dom.window.eval(script + '\nwindow.Pantalla = Pantalla;');
  const P = dom.window.Pantalla;
  let error = null;
  try { P.alCambiar(() => {})(); } catch (e) { error = e; }
  ok(!P.esCelular() && !P.esAngosta() && !error, 'sin matchMedia se comporta como escritorio y no truena');
}

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
