const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Lista de colores (usuario, 22-oct): «NEGO», de una sola inspección del AppSheet, salía como opción
const repo = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasRepo.gs'), 'utf8');

function coloresSugeridos(deEquipos, capturados) {
  const ini = repo.indexOf('  const NO_SON_COLOR = ');
  const fuente = repo.slice(ini, repo.indexOf('\n  }\n', repo.indexOf('function coloresSugeridos(', ini)) + 4);
  return new Function(fuente + '\nreturn coloresSugeridos;')()(deEquipos, capturados);
}

test('colores: los de los equipos y los capturados que se repiten, sin lo que no es color', () => {
  const capturados = ['NEGRO', 'NEGO', 'PLATA', 'PLATA', 'NARANJA', 'NA', 'NA', 'N/A', 'N/A', 'NO APLICA', 'NO APLICA', 'AZUL'];
  assert.deepEqual(coloresSugeridos(['NEGRO', 'AZUL', 'GRIS'], capturados), ['AZUL', 'GRIS', 'NEGRO', 'PLATA']);
  assert.deepEqual(coloresSugeridos([], []), []);
  // Un color de un equipo se ofrece aunque ninguna captura lo traiga
  assert.deepEqual(coloresSugeridos(['ROSA'], ['ROSA']), ['ROSA']);
  assert.match(repo, /colores: coloresSugeridos\(unicos\(lineas, 'COLOR'\), porRenglon\(inspecciones, 'COLOR'\)\.concat\(porRenglon\(responsivas, 'COLOR'\)\)\),/);
  assert.match(repo, /cacheLeer\('catalogos_telefonia_v9'\)/);
  assert.match(repo, /'catalogos_telefonia_v8', 'catalogos_telefonia_v9',/, 'Recargar datos borra la caché nueva');
});

test('corregir-color.js: pasa NEGO a NEGRO y nada más', () => {
  const { colorCorregido } = require('../tools/lineas-datos/corregir-color.js');
  assert.equal(colorCorregido('NEGO'), 'NEGRO');
  assert.equal(colorCorregido(' nego '), 'NEGRO');
  assert.equal(colorCorregido('NEGRO'), null);
  assert.equal(colorCorregido(''), null);
  assert.equal(colorCorregido('constructor'), null);
});

test('tablas: al desplazar de lado se acomodan después de las columnas fijas (usuario, 22-oct)', () => {
  const dt = fs.readFileSync(path.join(__dirname, '../src/html/js/componentes/datatable.html'), 'utf8');
  assert.match(dt, /\.dt \.dt-scroll \{ scroll-snap-type: x proximity; \}/);
  assert.match(dt, /\.dt thead th \{ scroll-snap-align: start; \}/);
  const fijadas = dt.slice(dt.indexOf('function aplicarFijadas()'), dt.indexOf('function ajustarAlto()'));
  assert.match(fijadas, /\$\('\.dt-scroll'\)\.style\.scrollPaddingLeft = izquierda \+ 'px';/);
});
