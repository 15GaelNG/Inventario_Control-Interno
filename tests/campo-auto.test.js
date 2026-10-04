/**
 * Pruebas de comportamiento de CampoAuto (la etiqueta "auto") y FolioNucco (el par de campos
 * para elegir un vehículo) en un navegador simulado (jsdom), con los componentes REALES de
 * src/html/js/componentes. Correr con:  npm test
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = path.join(__dirname, '..', 'src', 'html', 'js', 'componentes');
const scriptDe = (archivo) => {
  const html = fs.readFileSync(path.join(SRC, archivo), 'utf8');
  return html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
};

const dom = new JSDOM(`<!doctype html><body>
  <form id="f">
    <div class="field"><label>Fecha de alta</label><input id="fija" disabled data-auto /></div>
    <div class="field"><label>Monto</label><input id="motivo" disabled data-auto="Viene de la caja chica" /></div>
    <div class="field"><label>Auditoría</label><input id="bloqueada" disabled /></div>
    <div class="field"><label>Departamento</label><input id="depto" /></div>
    <div class="field"><label>Folio</label><input id="folio" /></div>
    <div class="field"><label>Nucco</label><input id="nucco" /></div>
  </form>
  <div id="tarde"></div>
</body>`, { url: 'https://prueba.local/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.eval(['campo-auto.html', 'folio-nucco.html'].map(scriptDe).join('\n') +
  '\nwindow.CampoAuto = CampoAuto; window.FolioNucco = FolioNucco;');

const doc = window.document;
const $ = (s) => doc.querySelector(s);
const esperar = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const evento = (el, tipo) => el.dispatchEvent(new window.Event(tipo, { bubbles: true }));
const tag = (id) => $('#' + id).closest('.field').querySelector('label .auto-tag');
const visible = (id) => !!tag(id) && !tag(id).hidden;
const escribir = (id, valor) => { $('#' + id).value = valor; evento($('#' + id), 'input'); };

(async () => {
  const { CampoAuto, FolioNucco } = window;

  console.log('1. Campos fijos (data-auto)');
  ok(visible('fija'), 'un data-auto que ya estaba en la página lleva "auto" desde que carga');
  ok(tag('fija').title === 'Lo llena el sistema', 'con un tooltip que explica qué es');
  ok(tag('motivo').title === 'Viene de la caja chica', 'el texto de data-auto es el tooltip');
  ok(!tag('bloqueada'), 'un campo deshabilitado SIN data-auto no dice "auto" (se bloqueó por otra razón)');
  CampoAuto.fijo('fija');
  ok($('#fija').closest('.field').querySelectorAll('.auto-tag').length === 1, 'marcar dos veces no duplica la etiqueta');

  $('#tarde').innerHTML = '<div class="field"><label>Total</label><input id="total" disabled data-auto /></div>';
  await esperar();
  ok(visible('total'), 'HTML agregado después (innerHTML de cualquier motor) también recibe la etiqueta');

  console.log('2. Campos sugeridos (CampoAuto.llenar)');
  CampoAuto.llenar('depto', 'SISTEMAS');
  ok($('#depto').value === 'SISTEMAS' && visible('depto'), 'llenar pone el valor y la etiqueta');
  evento($('#depto'), 'change');
  ok(visible('depto'), 'un evento con el mismo valor no la quita');
  escribir('depto', 'COMPRAS');
  ok(!visible('depto') && $('#depto').value === 'COMPRAS', 'escribir otro valor la quita y respeta lo escrito');
  CampoAuto.llenar('depto', 'SISTEMAS');
  CampoAuto.llenar('depto', '');
  ok(!visible('depto'), 'llenar con vacío la quita');
  CampoAuto.llenar('depto', 'SISTEMAS');
  $('#f').reset();
  ok(!visible('depto'), 'resetear el formulario quita las de lo sugerido');
  ok(visible('fija'), 'pero no la de los campos fijos');

  console.log('3. FolioNucco');
  const vehiculos = [
    { FOLIO: 'AUT0100', NUCO: '12', MARCA: 'NISSAN', LINEA_VEHICULO: 'NP300' },
    { FOLIO: 'AUT0200', NUCO: '3', MARCA: 'VW' },
    { FOLIO: 'MOT0001', NUCO: '' },
  ];
  const porClave = FolioNucco.indexar(vehiculos);
  ok(porClave.AUT0100 === vehiculos[0] && porClave['12'] === vehiculos[0], 'indexar: una entrada por Folio y otra por Nucco');
  ok(!('' in porClave), 'sin Nucco no hay entrada vacía');
  const html = FolioNucco.opcionesNucco(vehiculos, true);
  ok(html.indexOf('value="3"') < html.indexOf('value="12"'), 'las opciones de Nucco van en orden numérico');
  ok(html.includes('>NISSAN NP300<'), 'con etiqueta de marca y línea si se pide');

  const resueltos = [];
  let folioDisparado = 0;
  $('#folio').addEventListener('input', () => { folioDisparado++; });
  FolioNucco.ligar('folio', 'nucco', { buscar: (t) => porClave[t], alResolver: (v) => resueltos.push(v), dispararFolio: true });

  escribir('folio', 'AUT0100');
  ok($('#nucco').value === '12' && visible('nucco'), 'escribir el Folio pone su Nucco con "auto"');
  ok(!visible('folio'), 'y el Folio, que escribió la persona, no dice "auto"');
  ok(resueltos.pop() === vehiculos[0], 'alResolver recibe el vehículo');

  folioDisparado = 0;
  escribir('nucco', '3');
  ok($('#folio').value === 'AUT0200' && visible('folio'), 'escribir el Nucco pone su Folio con "auto"');
  ok(!visible('nucco'), 'y el Nucco escrito a mano ya no dice "auto"');
  ok(folioDisparado === 1, 'dispararFolio lanza el input del Folio (para que corra su buscador)');
  ok($('#nucco').value === '3', 'sin que ese input vuelva a pisar el Nucco');

  escribir('folio', 'AUT01');
  ok($('#nucco').value === '3' && !visible('nucco'), 'sin coincidencia no se borra nada, solo deja de decir "auto"');
  ok(resueltos.pop() === null, 'y alResolver recibe null');

  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
