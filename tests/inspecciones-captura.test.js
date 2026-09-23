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
// jsdom no dibuja ni carga imágenes: contexto 2D falso, medidas fijas del canvas y una
// Image que "carga" al instante. Basta para probar el comportamiento, no los pixeles.
const ctxFalso = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
window.HTMLCanvasElement.prototype.getContext = () => ctxFalso;
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,TRAZO';
window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200 });
window.Image = class {
  // Una foto pesada (la de un celular) se simula como una imagen de 4000 px de ancho
  set src(v) {
    this._src = v;
    this.naturalWidth = String(v).length > 5000 ? 4000 : 800;
    this.naturalHeight = this.naturalWidth / 2;
    setTimeout(() => this.onload && this.onload(), 0);
  }
  get src() { return this._src; }
};

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
  // IZQUIERDA no está en Drive (como pasa hoy en el ambiente de pruebas)
  diagramas: [
    { campo: 'INS FRONTAL', etiqueta: 'Frontal', ruta: 'MODELOS INSPECCION/L200/FRONTAL.png' },
    { campo: 'INS IZQUIERDA', etiqueta: 'Izquierda', ruta: 'MODELOS INSPECCION/L200/IZQUIERDA.png' },
  ],
};
ESTRUCTURA.piezas = ESTRUCTURA.secciones.reduce((s, x) => s + x.campos.length, 0);

const llamadas = [];
let registrado = null;
let imagenesMandadas = null;
window.callServer = (fn, token, ...args) => {
  llamadas.push(fn);
  if (fn === 'apiPrevisualizarImagenInspeccion') {
    return /FRONTAL/.test(args[0])
      ? Promise.resolve({ base64: 'DIBUJO', mimeType: 'image/png' })
      : Promise.reject(new Error('No se encontró la imagen en Drive'));
  }
  if (fn === 'apiRegistrarInspeccion') { registrado = args[0]; imagenesMandadas = args[1]; }
  const respuestas = {
    apiListarVehiculosBasico: [{ FOLIO: 'AUT0100', PLACA: 'ABC-123', MARCA: 'MITSUBISHI', LINEA_VEHICULO: 'L200' }],
    apiTiposInspeccion: [{ tipo: 'AUTOS', listo: true }, { tipo: 'L200', listo: true }, { tipo: 'VIEJO', listo: false }],
    apiBuscarVehiculoPorFolio: args[0] === 'AUT0100'
      ? { FOLIO: 'AUT0100', PLACA: 'ABC-123', MARCA: 'MITSUBISHI', 'LINEA VEHICULO': 'L200', MODELO: 2022 }
      : null,
    apiEstructuraInspeccion: ESTRUCTURA,
    apiRegistrarInspeccion: { puntaje: 90, pdf: '' },
  };
  return Promise.resolve(respuestas[fn]);
};
let confirmar = true;
window.eval(['componentes/iconos.html', 'componentes/notificar.html', 'componentes/combobox.html',
  'componentes/lienzo.html', 'componentes/firma.html'].map(scriptDe).join('\n') + `
  var state = { token: 't', sesion: { nombre: 'AYRTON SEPULVEDA' } };
  var Confirmar = { pedir: () => Promise.resolve(window.__confirmar()) };
  function escaparHtml(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';'); }
  function refreshIcons() {}
  ${scriptDe('modulos/inspecciones.html')}
  window.prepararCaptura = prepararCaptura;
  window.opcionBuena = opcionBuena;
  window.Firma = Firma;
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
/** Un trazo con el "dedo": bajar, mover, levantar */
const trazar = (canvas) => {
  const ev = (tipo, x, y) => canvas.dispatchEvent(new window.MouseEvent(tipo, { clientX: x, clientY: y, bubbles: true }));
  ev('pointerdown', 50, 50); ev('pointermove', 80, 60); ev('pointermove', 120, 90); ev('pointermove', 160, 70); ev('pointerup', 160, 70);
};
const PASOS = 'Vehículo|Exterior|Neumáticos|Interior|Mecánica|Daños|Cierre|Firmar';

(async () => {
  let tabMostrada = null;
  let recargas = 0;
  window.prepararCaptura({ mostrar: (t) => { tabMostrada = t; } }, async () => { recargas++; });
  await esperar(5);

  console.log('1. Al abrir: solo el paso de la unidad');
  ok(tituloPaso() === 'Vehículo', 'empieza en "Vehículo"');
  ok(!$('#ins-pasos').hidden && chips().join('|') === PASOS,
    'los pasos se ven desde el inicio, antes de elegir el tipo: ' + chips().join(' → '));
  ok($$('.form-paso-chip').slice(1).every((c) => c.disabled), 'pero no se puede saltar a ellos todavía');
  ok($('#ins-cuenta').textContent === 'Paso 1 de 8', 'dice en qué paso va');
  ok(!$('#ins-siguiente').hidden && $('#ins-guardar').hidden, 'hay "Siguiente" y todavía no "Guardar"');
  ok($$('#ins-tipo option[disabled]').length === 1, 'los tipos sin formato aparecen deshabilitados');

  console.log('2. El primer paso no deja avanzar sin unidad');
  await siguiente();
  ok(tituloPaso() === 'Vehículo', 'sin folio se queda en "Vehículo"');
  ok(!$('[data-campo="FOLIO"] .form-error-campo').hidden, 'y dice qué falta');
  $('#ins-folio').value = 'NOEXISTE';
  await siguiente();
  ok(tituloPaso() === 'Vehículo' && /no se encontr/i.test($('[data-campo="FOLIO"] .form-error-campo').textContent),
    'un folio que no existe tampoco pasa');

  console.log('3. Al elegir el vehículo');
  $('#ins-folio').value = 'AUT0100';
  evento($('#ins-folio'), 'blur');
  await esperar(10);
  ok(/ABC-123/.test($('#ins-ficha').textContent), 'la ficha del panel muestra la unidad');
  ok($('#ins-tipo').value === 'L200', 'sugiere el tipo por la línea del vehículo');
  ok(chips().join('|') === PASOS, 'arma los pasos del tipo: ' + chips().join(' → '));
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
  ok(tituloPaso() === 'Vehículo', '"Atrás" regresa');
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

  console.log('8. Daños sobre el diagrama');
  for (let i = 0; i < 5; i++) await siguiente();
  ok(tituloPaso() === 'Daños', 'después de Mecánica vienen los daños');
  const frontal = $('[data-diagrama="INS FRONTAL"]');
  const canvasFrontal = frontal.querySelector('canvas');
  ok(!!canvasFrontal, 'el diagrama frontal se puede marcar (su dibujo en blanco ya se descargó)');
  ok(/No está el dibujo en Drive/.test($('[data-diagrama="INS IZQUIERDA"]').textContent),
    'si el dibujo no está en Drive lo dice, en vez de dejar un hueco');
  ok(frontal.querySelector('[data-deshacer]').disabled, 'sin marcas, "Deshacer" está apagado');
  trazar(canvasFrontal);
  ok(!frontal.querySelector('[data-deshacer]').disabled, 'al marcar se puede deshacer');
  frontal.querySelector('[data-deshacer]').click();
  ok(frontal.querySelector('[data-deshacer]').disabled, 'deshacer quita la marca');
  trazar(canvasFrontal);
  const pedidasAntes = llamadas.filter((l) => l === 'apiPrevisualizarImagenInspeccion').length;

  console.log('9. Revisión y guardado');
  for (let i = 0; i < 2; i++) await siguiente();
  ok(tituloPaso() === 'Revisar y firmar', 'llega al último paso');
  ok(/Daños marcados\s*Frontal/.test($('#ins-revision').textContent), 'la revisión dice qué vistas tienen daños');
  ok($('[data-firma="FIRMA INSPECTOR"] .firma-nombre').textContent === 'AYRTON SEPULVEDA', 'bajo la línea de la firma del inspector va su nombre');
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

  console.log('10. Firmas');
  $('#ins-guardar').click();
  await esperar(20);
  ok(!registrado, 'sin la firma del inspector no se guarda');
  ok(tituloPaso() === 'Revisar y firmar' && /firma del inspector/i.test($('#ins-error').textContent),
    'lleva a las firmas y dice cuál falta');
  trazar($('[data-firma="FIRMA INSPECTOR"] canvas'));
  ok(/Firmado/.test($('[data-firma="FIRMA INSPECTOR"] .firma-estado').textContent) &&
    !$('[data-firma="FIRMA INSPECTOR"] .firma-borrar').disabled, 'la firma se marca como hecha y ya se puede borrar');

  // Plan B: la firma del responsable como foto
  const input = $('[data-firma="FIRMA RESPONSABLE"] .firma-archivo');
  Object.defineProperty(input, 'files', { configurable: true,
    value: [new window.File(['x'.repeat(10)], 'firma.png', { type: 'image/png' })] });
  evento(input, 'change');
  await esperar(20);
  ok(/con foto/.test($('[data-firma="FIRMA RESPONSABLE"] .firma-estado').textContent) &&
    !!$('[data-firma="FIRMA RESPONSABLE"] .firma-imagen'), 'la firma del responsable se puede subir como foto');
  Object.defineProperty(input, 'files', { configurable: true,
    value: [new window.File(['x'], 'firma.pdf', { type: 'application/pdf' })] });
  evento(input, 'change');
  await esperar(20);
  ok(!!$('[data-firma="FIRMA RESPONSABLE"] .firma-imagen'), 'un archivo que no es imagen se rechaza sin borrar la foto');

  $('#ins-guardar').click();
  await esperar(30);
  ok(registrado && registrado.FOLIO === 'AUT0100' && registrado.TIPO === 'L200', 'manda folio y tipo');
  ok(registrado && registrado.checklist.POLIZA === 'MALO' && registrado.checklist.SULFATADA === 'NO', 'manda las respuestas');
  ok(registrado && registrado.VOLTAJE === '12.6' && registrado.CONDUCTOR === 'JUAN PEREZ', 'manda los datos de los otros pasos');
  ok(imagenesMandadas && imagenesMandadas['INS FRONTAL'] && imagenesMandadas['INS FRONTAL'].base64 === 'TRAZO',
    'manda el diagrama marcado, con las marcas');
  ok(imagenesMandadas && !imagenesMandadas['INS IZQUIERDA'], 'no manda los diagramas sin marcar (el servidor usa el dibujo en blanco)');
  ok(imagenesMandadas && imagenesMandadas['FIRMA INSPECTOR'] && imagenesMandadas['FIRMA INSPECTOR'].mimeType === 'image/png',
    'manda la firma del inspector como PNG');
  ok(imagenesMandadas && imagenesMandadas['FIRMA RESPONSABLE'] && imagenesMandadas['FIRMA RESPONSABLE'].mimeType === 'image/png',
    'y la foto del responsable (chica y en PNG, se manda tal cual)');
  ok(tabMostrada === 'registros' && recargas === 1, 'regresa a la tabla y la recarga');
  ok(tituloPaso() === 'Vehículo' && $('#ins-folio').value === '' && $$('.form-paso-chip').slice(1).every((c) => c.disabled),
    'queda lista para la siguiente unidad');

  console.log('11. El dibujo en blanco se descarga una sola vez');
  $('#ins-folio').value = 'AUT0100';
  evento($('#ins-folio'), 'blur');
  await esperar(20);
  ok(llamadas.filter((l) => l === 'apiPrevisualizarImagenInspeccion').length === pedidasAntes + 1,
    'la siguiente unidad del mismo tipo reusa el frontal; solo reintenta el que faltaba');

  console.log('12. Foto de la firma: se reduce la de un celular');
  const caja = doc.createElement('div');
  doc.body.appendChild(caja);
  const firmaSuelta = window.Firma.crear(caja, {});
  const archivo = caja.querySelector('.firma-archivo');
  Object.defineProperty(archivo, 'files', { configurable: true,
    value: [new window.File(['x'.repeat(6000)], 'foto.png', { type: 'image/png' })] });
  evento(archivo, 'change');
  await esperar(20);
  const exportada = firmaSuelta.exportar();
  ok(exportada && exportada.mimeType === 'image/jpeg' && exportada.base64 === 'TRAZO',
    'una foto de 4000 px se redibuja a 1200 px en JPEG antes de mandarse');
  firmaSuelta.limpiar();
  ok(firmaSuelta.vacia() && !caja.querySelector('.firma-imagen'), '"Borrar" también quita la foto');

  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
