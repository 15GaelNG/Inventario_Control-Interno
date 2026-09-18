/**
 * Pruebas de comportamiento de la captura de inspecciones por pasos (jsdom).
 * Usa el módulo REAL (src/html/js/modulos/inspecciones.html) y los componentes reales;
 * solo el servidor es falso. Correr con:  npm test
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML = path.join(__dirname, '..', 'src', 'html', 'js');
const scriptDe = (archivo) => {
  const html = fs.readFileSync(path.join(HTML, archivo), 'utf8');
  return html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
};

const dom = new JSDOM('<!doctype html><body><div id="ins-form"></div></body>',
  { url: 'https://prueba.local/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.CSS = { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };

// ----- servidor falso -----
const opciones = ['BUENO', 'REGULAR', 'MALO', 'N/A'];
const seccion = (titulo, peso, piezas, ops) => ({
  titulo, peso, campos: piezas.map((p) => ({ campo: p, opciones: ops || opciones })),
});
// Los 12 títulos reales de los formatos; Batería es de defectos y trae SI antes que NO
const ESTRUCTURA = {
  secciones: [
    seccion('Documentación', 10, ['TARJETA CIRCULACION', 'POLIZA']),
    seccion('Cristalería', 5, ['PARABRISAS']),
    seccion('Neumáticos', 10, ['LLANTA REFACCION']),
    seccion('Interiores', 10, ['ASIENTOS']),
    seccion('Latonería y pintura', 10, ['COFRE']),
    seccion('Inventarios', 5, ['GATO']),
    seccion('Cerraduras', 5, ['CHAPA PILOTO']),
    seccion('Limpieza', 5, ['LIMPIEZA INTERIOR']),
    seccion('Sistemas interiores', 10, ['CLAXON']),
    seccion('Sistema mecánico', 10, ['FRENOS']),
    seccion('Niveles', 10, ['ACEITE']),
    seccion('Batería', 10, ['SULFATADA'], ['SI', 'NO']),
  ],
  llantas: [{ campo: 'LLANTA DD', etiqueta: 'Delantera derecha' }],
};
ESTRUCTURA.piezas = ESTRUCTURA.secciones.reduce((s, x) => s + x.campos.length, 0);

const llamadas = [];
let registrado = null;
window.callServer = (fn, token, ...args) => {
  llamadas.push(fn);
  const respuestas = {
    apiListarVehiculosBasico: [{ FOLIO: 'AUT0100', PLACA: 'ABC-123', MARCA: 'MITSUBISHI', LINEA_VEHICULO: 'L200' }],
    apiTiposInspeccion: [{ tipo: 'AUTOS', listo: true }, { tipo: 'L200', listo: true }, { tipo: 'VIEJO', listo: false }],
    apiBuscarVehiculoPorFolio: args[0] === 'AUT0100'
      ? { FOLIO: 'AUT0100', PLACA: 'ABC-123', MARCA: 'MITSUBISHI', 'LINEA VEHICULO': 'L200', MODELO: 2022 }
      : null,
    apiEstructuraInspeccion: ESTRUCTURA,
    apiRegistrarInspeccion: (registrado = args[0], { puntaje: 90, pdf: '' }),
  };
  return Promise.resolve(respuestas[fn]);
};
let confirmar = true;
window.eval(['componentes/iconos.html', 'componentes/notificar.html', 'componentes/combobox.html'].map(scriptDe).join('\n') + `
  var state = { token: 't' };
  var Confirmar = { pedir: () => Promise.resolve(window.__confirmar()) };
  function escaparHtml(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';'); }
  function refreshIcons() {}
  ${scriptDe('modulos/inspecciones.html')}
  window.prepararCaptura = prepararCaptura;
  window.opcionBuena = opcionBuena;
`);
window.__confirmar = () => confirmar;

const doc = window.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));
const esperar = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const evento = (el, tipo) => el.dispatchEvent(new window.Event(tipo, { bubbles: true }));
const pasoVisible = () => $$('.form-paso').find((s) => !s.hidden);
const tituloPaso = () => pasoVisible().querySelector('.form-paso-titulo').textContent;
const chips = () => $$('.form-paso-chip').map((c) => c.textContent.trim().replace(/^\d+/, ''));
const marcar = (pieza, valor) => {
  const radio = $(`input[name="chk-${pieza}"][value="${valor}"]`);
  radio.checked = true;
  evento(radio, 'change');
};
const siguiente = async () => { $('#ins-siguiente').click(); await esperar(5); };

(async () => {
  let tabMostrada = null;
  let recargas = 0;
  window.prepararCaptura({ mostrar: (t) => { tabMostrada = t; } }, async () => { recargas++; });
  await esperar(5);

  console.log('1. Al abrir: solo el paso de la unidad');
  ok(tituloPaso() === 'Unidad', 'empieza en "Unidad"');
  ok($('#ins-pasos').hidden, 'sin tipo elegido no se muestran chips (uno solo no dice nada)');
  ok(!$('#ins-siguiente').hidden && $('#ins-guardar').hidden, 'hay "Siguiente" y todavía no "Guardar"');
  ok($$('#ins-tipo option[disabled]').length === 1, 'los tipos sin formato aparecen deshabilitados');

  console.log('2. El primer paso no deja avanzar sin unidad');
  await siguiente();
  ok(tituloPaso() === 'Unidad', 'sin folio se queda en "Unidad"');
  ok(!$('[data-campo="FOLIO"] .form-error-campo').hidden, 'y dice qué falta');
  $('#ins-folio').value = 'NOEXISTE';
  await siguiente();
  ok(tituloPaso() === 'Unidad' && /no se encontr/i.test($('[data-campo="FOLIO"] .form-error-campo').textContent),
    'un folio que no existe tampoco pasa');

  console.log('3. Al elegir el vehículo');
  $('#ins-folio').value = 'AUT0100';
  evento($('#ins-folio'), 'blur');
  await esperar(10);
  ok(/ABC-123/.test($('#ins-ficha').textContent), 'la ficha del panel muestra la unidad');
  ok($('#ins-tipo').value === 'L200', 'sugiere el tipo por la línea del vehículo');
  ok(chips().join('|') === 'Unidad|Exterior|Neumáticos|Interior|Mecánica|Cierre|Revisar y guardar',
    'arma los pasos: ' + chips().join(' → '));
  ok(!$('#ins-panel-avance').hidden && $$('#ins-avance-lista li').length === 12, 'el panel lista las 12 secciones');

  console.log('4. Cada sección cae en su paso');
  const seccionesDePaso = (n) => $$(`.form-paso[data-paso="${n}"] .chk-seccion h4`).map((h) => h.textContent);
  ok(seccionesDePaso(1).join('|') === 'Documentación|Cristalería|Latonería y pintura|Cerraduras', 'Exterior');
  ok(seccionesDePaso(2).join('|') === 'Neumáticos|Profundidad de las llantas', 'Neumáticos, con la profundidad en mm');
  ok(seccionesDePaso(3).join('|') === 'Interiores|Inventarios|Limpieza|Sistemas interiores', 'Interior');
  ok(seccionesDePaso(4).join('|') === 'Sistema mecánico|Niveles|Batería', 'Mecánica');
  ok($('.form-paso[data-paso="4"] #ins-voltaje') && $$('#ins-voltaje').length === 1, 'el voltaje va con la batería, una sola vez');

  console.log('5. Avanzar y capturar');
  await siguiente();
  ok(tituloPaso() === 'Exterior', '"Siguiente" lleva a Exterior');
  ok(!$('#ins-atras').hidden, 'ya se puede regresar');
  marcar('POLIZA', 'MALO');
  ok($('#ins-puntaje').textContent === '0%', 'el puntaje se recalcula en vivo (una pieza MALO = 0)');
  $('#ins-atras').click();
  await esperar(5);
  ok(tituloPaso() === 'Unidad', '"Atrás" regresa');
  const chipExterior = $$('.form-paso-chip')[1];
  ok(!chipExterior.disabled, 'el chip de un paso ya visitado permite volver a él');
  ok($$('.form-paso-chip')[4].disabled, 'a un paso no visitado no se salta con el chip');
  chipExterior.click();
  await esperar(5);
  ok(tituloPaso() === 'Exterior', 'el chip lleva al paso');

  console.log('6. "Todo bueno" elige la opción que vale, no la primera');
  const bateria = ESTRUCTURA.secciones[11].campos[0];
  ok(window.opcionBuena(bateria) === 'NO', 'en defectos (SI/NO) lo bueno es NO, aunque SI venga primero');
  $('[data-todo="11"]').click();
  ok($('input[name="chk-SULFATADA"][value="NO"]').checked, 'marca NO en "sulfatada"');
  ok(/Sin defectos/.test($('[data-todo="11"]').textContent) && /Todo bueno/.test($('[data-todo="0"]').textContent),
    'el botón dice "Sin defectos" en la batería y "Todo bueno" en las demás');

  console.log('7. Cambiar el tipo con respuestas pide confirmación');
  $$('.form-paso-chip')[0].click();
  await esperar(5);
  confirmar = false;
  $('#ins-tipo').value = 'AUTOS';
  evento($('#ins-tipo'), 'change');
  await esperar(10);
  ok($('#ins-tipo').value === 'L200' && $('input[name="chk-POLIZA"][value="MALO"]').checked,
    'si se cancela, se queda el tipo y las respuestas');
  confirmar = true;

  console.log('8. Revisión y guardado');
  for (let i = 0; i < 6; i++) await siguiente();
  ok(tituloPaso() === 'Revisar y guardar', 'llega al último paso');
  ok($('#ins-siguiente').hidden && !$('#ins-guardar').hidden, 'en el último paso se cambia "Siguiente" por "Guardar"');
  ok(/POLIZA/.test($('.ins-revision-problemas').textContent), 'la revisión lista lo que salió mal');
  ok(/Faltan \d+ piezas/.test($('#ins-revision').textContent), 'y avisa lo que falta por responder');
  const salto = $('#ins-revision [data-ir-seccion="3"]');
  salto.click();
  await esperar(5);
  ok(tituloPaso() === 'Interior', 'desde la revisión se salta a la sección que falta');
  for (let i = 0; i < 3; i++) await siguiente();

  $('#ins-voltaje').value = '12.6';
  $('#ins-conductor').value = 'JUAN PEREZ';
  $('#ins-guardar').click();
  await esperar(20);
  ok(registrado && registrado.FOLIO === 'AUT0100' && registrado.TIPO === 'L200', 'manda folio y tipo');
  ok(registrado && registrado.checklist.POLIZA === 'MALO' && registrado.checklist.SULFATADA === 'NO', 'manda las respuestas');
  ok(registrado && registrado.VOLTAJE === '12.6' && registrado.CONDUCTOR === 'JUAN PEREZ', 'manda los datos de los otros pasos');
  ok(tabMostrada === 'registros' && recargas === 1, 'regresa a la tabla y la recarga');
  ok(tituloPaso() === 'Unidad' && $('#ins-folio').value === '' && $('#ins-pasos').hidden, 'queda lista para la siguiente unidad');

  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
