const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const LINEAS = require('./lineas-fuente');

// Fichas de equipo y de línea (usuario, 22-oct): cada tarjeta de la pestaña General lleva un botón para copiarla,
// «Etiqueta: valor» un renglón por dato con valor
const cliente = LINEAS;
const css = fs.readFileSync(path.join(__dirname, '../src/html/lineas-estilos.html'), 'utf8');

function preparar(html) {
  const dom = new JSDOM('<!doctype html><body><div id="d">' + html + '</div></body>');
  const { window } = dom;
  // jsdom no trae innerText
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
  const ini = cliente.indexOf('      function ponerCopiarTarjetas(detalle) {');
  const fuente = cliente.slice(ini, cliente.indexOf('      function cargarEvidencias(id) {', ini));
  const fns = new Function('icono', fuente + '\nreturn { ponerCopiarTarjetas, textoTarjeta };')(() => '<svg class="ln-icon"></svg>');
  const detalle = window.document.getElementById('d');
  fns.ponerCopiarTarjetas(detalle);
  return { detalle, textoTarjeta: fns.textoTarjeta };
}

const general = (cards) => '<div data-tab-panel="general"><div class="ln-grid-2">' + cards + '</div></div>';

test('Copiar tarjeta: botón en el título de cada tarjeta con datos, solo en la pestaña General', () => {
  const { detalle } = preparar(general(
    '<div class="card ln-card"><h3><svg></svg> Línea</h3><dl class="ln-campos"><dt>SIM</dt><dd>895</dd></dl></div>' +
    '<div class="card ln-card"><h3><svg></svg> Línea</h3><p class="empty-state">Este equipo no tiene línea asignada.</p></div>') +
    '<div data-tab-panel="detalles"><div class="ln-grid-2"><div class="card ln-card"><h3>Otra</h3><dl class="ln-campos"><dt>A</dt><dd>1</dd></dl></div></div></div>');
  const botones = detalle.querySelectorAll('[data-ln-copiar-tarjeta]');
  assert.equal(botones.length, 1, 'sin datos (equipo sin línea) ni fuera de General no hay botón');
  assert.equal(botones[0].getAttribute('aria-label'), 'Copiar');
});

test('Copiar tarjeta: título con el mes, un renglón por dato con valor, vida del plan y meses', () => {
  const { detalle, textoTarjeta } = preparar(general(
    '<div class="card ln-card"><h3><svg></svg> Facturación<span class="ln-card-titulo-dato">Septiembre 2026</span></h3>' +
    '<dl class="ln-campos"><dt>Cobrado</dt><dd>$269.78</dd><dt>Diferencia</dt><dd><span class="ln-dif-igual">Igual</span></dd><dt>Equipo</dt><dd>—</dd></dl>' +
    '<div class="ln-meses"><div class="ln-meses-titulo">Últimos 2 meses</div><div class="ln-meses-cuerpo">' +
    '<div class="ln-meses-fila ln-meses-encabezado"><span>Mes</span><span>Cobrado</span><span>Diferencia</span></div>' +
    '<div class="ln-meses-fila"><span>Septiembre</span><span>$269.78</span><span><span>Igual</span></span></div>' +
    '<div class="ln-meses-fila"><span>Agosto</span><span>$299</span><span></span></div></div></div>' +
    '<div class="ln-card-pie">Factura del proveedor</div></div>' +
    '<div class="card ln-card"><h3><svg></svg> Plan de la línea</h3><dl class="ln-campos"><dt>Renta</dt><dd>$299</dd></dl>' +
    '<div class="ln-vida"><div class="ln-vida-barra"><span></span></div><div class="ln-vida-texto"><span>Faltan 17 meses</span><span class="ln-tenue">7 de 24 meses</span></div></div></div>' +
    '<div class="card ln-card"><h3><svg></svg> Equipo</h3><dl class="ln-campos"><dt>Patrón</dt><dd><div class="ln-patron-consulta" data-ln-texto="1-5-9"><svg></svg></div></dd></dl></div>'));
  const [fact, plan, equipo] = detalle.querySelectorAll('.ln-card');
  assert.equal(textoTarjeta(fact), 'Facturación · Septiembre 2026\nCobrado: $269.78\nDiferencia: Igual\nSeptiembre: $269.78 · Igual\nAgosto: $299');
  assert.equal(textoTarjeta(plan), 'Plan de la línea\nRenta: $299\nFaltan 17 meses · 7 de 24 meses');
  assert.equal(textoTarjeta(equipo), 'Equipo\nPatrón: 1-5-9', 'el patrón dibujado se copia con sus puntos');
});

test('Copiar tarjeta: se pone en las dos fichas, el clic copia con aviso y el botón va a la derecha del título', () => {
  for (const ficha of ['pintarEquipo', 'pintarLinea']) {
    const cuerpo = cliente.slice(cliente.indexOf('      function ' + ficha + '('), cliente.indexOf('\n      }\n', cliente.indexOf('      function ' + ficha + '(')));
    assert.match(cuerpo, /ponerCopiarTarjetas\(detalle\);/, ficha);
  }
  assert.match(cliente, /const copiarCard = ev\.target\.closest\('\[data-ln-copiar-tarjeta\]'\);/);
  assert.match(cliente, /copiarConAviso\(copiarCard, textoTarjeta\(card\), /);
  assert.match(cliente, /if \(esPuntosPatron\(v\)\) return '<div class="ln-patron-consulta" data-ln-texto="' \+ esc\(v\) \+ '">'/);
  assert.match(css, /\.ln-card h3 \.ln-copiar-tarjeta \{ margin-left: auto;/);
});
