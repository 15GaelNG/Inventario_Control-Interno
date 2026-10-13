const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Arrastrar y soltar archivos y carátula de los PDF (usuario, 13-oct; pendiente 2.42): soltar sobre un botón de subir o
// un campo de archivo es como elegirlos, y un PDF elegido se ve como las fotos, con su primera hoja.
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const lineas = read('src/html/js/lineas.html');
const css = read('src/html/lineas-estilos.html');
const bloque = lineas.slice(lineas.indexOf('// ---- Arrastrar y soltar archivos'), lineas.indexOf('/** La miniatura de Drive'));

test('qué archivo acepta cada lugar: el accept del input (comodín, tipo exacto o extensión)', () => {
  const fuente = bloque.slice(bloque.indexOf('function aceptaArchivo'), bloque.indexOf('let zonaEncima'));
  const aceptaArchivo = new Function(fuente + '\nreturn aceptaArchivo;')();
  const foto = { type: 'image/jpeg', name: 'a.jpg' };
  const pdf = { type: 'application/pdf', name: 'a.pdf' };
  const pdfSinTipo = { type: '', name: 'CARTA.PDF' };
  assert.equal(aceptaArchivo({ accept: 'image/*' }, foto), true);
  assert.equal(aceptaArchivo({ accept: 'image/*' }, pdf), false);
  assert.equal(aceptaArchivo({ accept: 'image/*,application/pdf' }, pdf), true);
  assert.equal(aceptaArchivo({ accept: 'application/pdf,.pdf' }, pdfSinTipo), true);
  assert.equal(aceptaArchivo({ accept: '' }, pdf), true);
});

test('soltar: solo en los botones de subir y los campos de archivo de Líneas, por su input y su change', () => {
  assert.ok(bloque.includes("const ZONAS_SOLTAR = '.ln-upload, .ln-af-archivo';"));
  assert.ok(bloque.includes("input[type=\"file\"]:not([capture]):not([disabled])"), 'no el de la cámara');
  assert.ok(bloque.includes("!ev.target.closest('.ln-modulo')"), 'solo dentro de Líneas');
  assert.ok(bloque.includes('.slice(0, input.multiple ? archivos.length : 1)'));
  assert.ok(bloque.includes("input.dispatchEvent(new Event('change', { bubbles: true }));"));
  assert.ok(!/'\/\*'/.test(bloque), 'nada de «/*» en un string de un .html (Apps Script lo borra)');
  assert.match(css, /\.ln-upload\.ln-soltar, \.ln-af-archivo\.ln-soltar \{/);
  // «Suelta aquí» en todos los lugares mientras se arrastra, y se quita solo al dejar de llegar dragover
  assert.ok(bloque.includes("document.documentElement.classList.toggle('ln-arrastrando', si);"));
  assert.ok(bloque.includes('finArrastre = setTimeout(() => { arrastrando(false); marcarZona(null); }, 250);'));
  assert.ok(css.includes("content: 'Suelta aquí';"));
  assert.ok(css.includes('.ln-arrastrando .ln-upload:has(input[type="file"]:not([capture]):not([disabled]))'));
});

test('carátula del PDF con pdf.js (se carga la primera vez) en la identificación y en los campos de archivo', () => {
  assert.ok(bloque.includes("const URL_PDFJS = 'https:\\/\\/cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';"));
  assert.ok(bloque.includes("window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL_PDFJS + 'pdf.worker.min.js';"));
  assert.ok(bloque.includes('function caratulaPdf(archivo, ancho)'));
  assert.ok(bloque.includes('function htmlMiniaturaPdf(url, nombre, caratula, quitar)'));
  assert.ok(lineas.includes("? htmlMiniaturaPdf(s.pdf.url, s.pdf.archivo.name, s.pdf.caratula,"), 'identificación');
  assert.ok(lineas.includes('caratulaPdf(pdfs[0]).then((c) => { if (caja._ine.pdf === pdf) { pdf.caratula = c; pintar(caja); } })'));
  assert.ok(bloque.includes("ev.target.closest('.ln-af-archivo input[type=\"file\"][data-archivo]')"), 'campo de archivo');
  assert.match(css, /\.ln-miniatura-pdf \{ aspect-ratio: 3 \/ 4;/);
});
