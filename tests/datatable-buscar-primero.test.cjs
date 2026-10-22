const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// DataTable con buscarPrimero (Líneas, 21-oct; pendiente 2.60): al buscar, primero lo que coincide por esas columnas
// (igual, empieza con, contiene) y al final lo que coincide por otra. Sin la opción, la búsqueda no cambia.
const SRC = path.join(__dirname, '..', 'src', 'html', 'js', 'componentes');
const scriptDe = (archivo) => {
  const html = fs.readFileSync(path.join(SRC, archivo), 'utf8');
  return html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
};

function tabla(opciones) {
  const dom = new JSDOM('<!doctype html><body><div id="t"></div></body>', { url: 'https://prueba.local/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.CSS = { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };
  window.eval(['formato.html', 'iconos.html', 'notificar.html', 'confirmar.html', 'datatable.html'].map(scriptDe).join('\n') +
    '\nwindow.DataTable = DataTable;');
  const datos = [
    { id: 'a', nuco: '0120', modelo: 'MOTO 12' },
    { id: 'b', nuco: '0412', modelo: 'IPHONE' },
    { id: 'c', nuco: '0012', modelo: 'SAMSUNG' },
    { id: 'd', nuco: '0500', modelo: 'NOKIA 12' },
    { id: 'e', nuco: '1200', modelo: 'XIAOMI' },
  ];
  window.DataTable.crear(window.document.querySelector('#t'), Object.assign({
    idCampo: 'id', datos: datos, tamanoPagina: 50,
    columnas: [{ campo: 'nuco', titulo: 'NUCO', tipo: 'texto' }, { campo: 'modelo', titulo: 'Modelo', tipo: 'texto' }],
  }, opciones));
  return (texto) => {
    const buscador = window.document.querySelector('.dt-buscar');
    buscador.value = texto;
    buscador.dispatchEvent(new window.Event('input', { bubbles: true }));
    return Array.from(window.document.querySelectorAll('tbody tr[data-id]')).map((tr) => tr.dataset.id);
  };
}

test('buscarPrimero: igual (sin ceros a la izquierda), empieza con, contiene y al final otra columna (2.60)', () => {
  const buscar = tabla({ buscarPrimero: ['nuco'] });
  // «12»: 0012 (igual), 0120 y 1200 (empiezan, sin contar los ceros, en su orden), 0412 (contiene) y NOKIA 12 (solo por
  // modelo)
  assert.deepEqual(buscar('12'), ['c', 'a', 'e', 'b', 'd']);
  assert.deepEqual(buscar('0012'), ['c']);
});

test('Sin buscarPrimero la búsqueda deja el orden de los datos (2.60)', () => {
  const buscar = tabla({});
  assert.deepEqual(buscar('12'), ['a', 'b', 'c', 'd', 'e']);
});

test('Líneas pide primero el NUCO en Equipos y el número en Líneas (2.60)', () => {
  const cliente = fs.readFileSync(path.join(__dirname, '../src/html/js/lineas.html'), 'utf8');
  assert.match(cliente, /detalle: 'equipo', textoVacio: 'Sin equipos',\s*buscarPrimero: \['nuco'\]/);
  assert.match(cliente, /detalle: 'linea', textoVacio: 'Sin líneas',\s*buscarPrimero: \['numero'\]/);
  assert.match(cliente, /buscarPrimero: cfg\.buscarPrimero,/);
});
