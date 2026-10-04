/**
 * Pruebas de comportamiento de CamposHoja (el motor de los formularios declarados por
 * columnas: Vehículos, Caja Chica, Arqueos) en un navegador simulado (jsdom), con el
 * componente REAL de src/html/js/componentes. Correr con:  npm test
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = path.join(__dirname, '..', 'src', 'html', 'js', 'componentes');
const scriptDe = (archivo) => {
  const html = fs.readFileSync(path.join(SRC, archivo), 'utf8');
  return html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
};

const dom = new JSDOM('<!doctype html><body><div id="f"></div></body>', { url: 'https://prueba.local/', runScripts: 'outside-only' });
const { window } = dom;
// fechaParaInput vive en app.html: aquí una igual de simple para ver que se usa en los date
window.eval('function fechaParaInput(v) { return v ? v.split("/").reverse().join("-") : ""; }\n' + scriptDe('campos-hoja.html') + '\nwindow.CamposHoja = CamposHoja;');

const doc = window.document;
const $ = (s) => doc.querySelector(s);
let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

const CAMPOS = [
  { grupo: 'Uno', clave: 'MARCA', etiqueta: 'Marca', tipo: 'select', catalogo: true, opciones: ['SIN MARCA'] },
  { grupo: 'Uno', clave: 'CLASE', etiqueta: 'Clase', tipo: 'select', opciones: ['AUTO', 'MOTO'], requerido: true },
  { grupo: 'Uno', clave: 'ESTATUS', etiqueta: 'Estatus', tipo: 'select', opciones: ['VIGENTE', 'CERRADA'], bloqueadoAlCrear: true, valorPorDefecto: 'VIGENTE' },
  { grupo: 'Uno', clave: 'FOLIO', etiqueta: 'Folio', tipo: 'text', soloLectura: true, placeholder: 'Se genera solo' },
  { grupo: 'Dos', clave: 'CAPACIDAD (L)', etiqueta: 'Capacidad', tipo: 'number' },
  { grupo: 'Dos', clave: 'COSTO', etiqueta: 'Costo', tipo: 'number', moneda: true },
  { grupo: 'Dos', clave: 'FECHA COMPRA', etiqueta: 'Fecha', tipo: 'date' },
  { grupo: 'Dos', clave: 'FECHA CIERRE', etiqueta: 'Cierre', tipo: 'date', soloEdicion: true },
  { grupo: 'Tres', clave: '¿CHEQUE?', etiqueta: '¿Cheque?', tipo: 'select', opciones: ['SI', 'NO'] },
  { grupo: 'Tres', clave: 'NO CHEQUE', etiqueta: 'No. de cheque', tipo: 'text', mostrarSiCampo: '¿CHEQUE?', mostrarSiValor: 'SI' },
  { grupo: 'Tres', clave: 'RESPONSIVA', etiqueta: 'Responsiva', tipo: 'file' },
  { grupo: 'Tres', clave: 'EVIDENCIAS', etiqueta: 'Evidencias', tipo: 'file', multiple: true },
  { grupo: 'Tres', clave: 'FORMATO', etiqueta: 'Formato (PDF)', tipo: 'file', soloLectura: true },
  { grupo: 'Tres', clave: 'FIRMA', etiqueta: 'Firma', tipo: 'firma' },
];

const { CamposHoja } = window;
const pintar = (o) => { $('#f').innerHTML = CamposHoja.html(CAMPOS, o); };

console.log('1. Ids y secciones');
ok(CamposHoja.slug('CAPACIDAD COMBUSTIBLE (LTS)') === 'capacidad-combustible-lts', 'slug: minúsculas, sin símbolos');
ok(CamposHoja.slug('TIPO DE AUTORIZACIÓN') === 'tipo-de-autorizacion' && CamposHoja.slug('¿CHEQUE?') === 'cheque', 'slug: sin acentos ni signos');
pintar({ prefijo: 'x' });
ok([...doc.querySelectorAll('.info-section-title')].map((e) => e.textContent).join('|') === 'Uno|Dos|Tres', 'un título por grupo, en el orden de la lista');
ok(!!$('#x-capacidad-l') && !!$('#x-fecha-compra'), 'el id es prefijo + slug de la columna');

console.log('2. Cada tipo de campo');
ok($('#x-marca').tagName === 'INPUT' && $('#x-marca').getAttribute('list') === 'x-marca-lista', 'catálogo: caja de texto con sugerencias');
ok($('#x-marca-lista').innerHTML === '<option value="SIN MARCA"></option>', 'con sus opciones fijas ya en el datalist');
ok($('#x-clase').tagName === 'SELECT' && $('#x-clase').options.length === 3 && $('#x-clase').required, 'select cerrado: "Selecciona…" + opciones, y respeta requerido');
ok($('#x-folio').disabled && $('#x-folio').hasAttribute('data-auto') && $('#x-folio').placeholder === 'Se genera solo', 'soloLectura: bloqueado, con data-auto y su placeholder');
ok($('#x-capacidad-l').getAttribute('step') === 'any', 'number acepta decimales');
ok(!!$('#x-costo').closest('.input-moneda-wrap'), 'moneda: el "$" fijo a la izquierda');
ok($('#x-responsiva').accept === '.pdf,.png,.jpg,.jpeg' && !!$('#x-responsiva-actual'), 'file: PDF o imagen, con "archivo actual"');
ok($('#x-evidencias').multiple && $('#x-evidencias').accept === 'image/*' && /varias fotos/.test($('#x-evidencias').closest('.field').textContent), 'file múltiple: varias imágenes, con su ayuda');
ok(!$('#x-formato') && $('#x-formato-actual').hasAttribute('data-auto'), 'file soloLectura: sin input, marcado "auto"');
ok($('#x-firma').tagName === 'CANVAS' && !!$('[data-target="x-firma"]'), 'firma: recuadro y botón de limpiar');
ok($('#x-no-cheque').closest('.field').dataset.mostrarSiCampo === '¿CHEQUE?', 'mostrarSi queda en el campo');

console.log('3. Alta, edición y grupos');
ok(!$('#x-fecha-cierre'), 'soloEdicion no aparece al dar de alta');
ok($('#x-estatus').tagName === 'INPUT' && $('#x-estatus').value === 'VIGENTE' && $('#x-estatus').disabled, 'bloqueadoAlCrear: fijo en su valor por defecto');
pintar({ prefijo: 'x', esEdicion: true });
ok(!!$('#x-fecha-cierre'), 'en edición sí aparece');
ok($('#x-estatus').tagName === 'SELECT', 'y el bloqueado al crear vuelve a ser lista');
$('#f').innerHTML = CamposHoja.html(CAMPOS, { prefijo: 'x', soloGrupos: ['Dos'] });
ok(doc.querySelectorAll('.info-section-title').length === 1 && !!$('#x-costo') && !$('#x-marca'), 'soloGrupos: solo los de ese paso');

console.log('4. Poblar y recolectar');
pintar({ prefijo: 'x', esEdicion: true });
const antes = [], despues = [];
CamposHoja.poblar(CAMPOS, 'x', {
  MARCA: 'NISSAN', CLASE: 'CAMION', ESTATUS: 'CERRADA', FOLIO: 'AUT0001', 'CAPACIDAD (L)': '40', COSTO: '1500',
  'FECHA COMPRA': '02/01/2026', '¿CHEQUE?': 'SI', 'NO CHEQUE': '123', RESPONSIVA: 'https://drive/r', FIRMA: 'https://drive/f',
}, {
  antes: { 'CAPACIDAD (L)': () => antes.push($('#x-capacidad-l').value) },
  despues: { CLASE: () => despues.push($('#x-clase').value) },
  mostrar: (campo, valor) => (campo.clave === 'FOLIO' ? '#' + valor : undefined),
  limpiarFirma: (canvas) => { canvas.dataset.limpio = '1'; },
});
ok($('#x-marca').value === 'NISSAN' && $('#x-costo').value === '1500', 'pone cada valor en su control');
ok($('#x-fecha-compra').value === '2026-01-02', 'las fechas pasan por fechaParaInput');
ok($('#x-folio').value === '#AUT0001', 'mostrar() decide cómo se ve un valor');
ok($('#x-clase').value === 'CAMION' && /ya no está en la lista/.test($('#x-clase').selectedOptions[0].textContent),
  'un valor guardado que ya no está en la lista se conserva como opción extra (no se borra al guardar)');
ok(antes[0] === '' && despues[0] === 'CAMION', 'antes/despues corren en su columna, en orden');
ok(/Ver archivo actual/.test($('#x-responsiva-actual').innerHTML) && /Sin archivo/.test($('#x-evidencias-actual').innerHTML), 'file: enlace al actual o "Sin archivo"');
ok(/<img/.test($('#x-firma-actual').innerHTML) && $('#x-firma').dataset.limpio === '1', 'firma: se ve la guardada y el recuadro arranca limpio');
ok(!$('#x-no-cheque').closest('.field').hidden, 'mostrarSi: visible porque ¿Cheque? = SI');
$('#x-cheque').value = 'NO';
CamposHoja.actualizarVisibles(CAMPOS, 'x');
ok($('#x-no-cheque').closest('.field').hidden, 'y se oculta al cambiar a NO');

const datos = CamposHoja.recolectar(CAMPOS, 'x');
ok(!('FOLIO' in datos) && !('RESPONSIVA' in datos) && !('FIRMA' in datos), 'recolectar deja fuera soloLectura, file y firma');
ok(datos.MARCA === 'NISSAN' && datos['FECHA CIERRE'] === '' && Object.keys(datos).length === 9, 'y trae lo capturado a mano');
$('#x-marca').value = '  TOYOTA  ';
ok(CamposHoja.recolectar(CAMPOS, 'x').MARCA === 'TOYOTA', 'sin espacios de más');

console.log('5. llenarOpciones');
CamposHoja.llenarOpciones('x-marca', ['A', 'B']);
ok($('#x-marca-lista').options.length === 2, 'en un catálogo llena su datalist');
CamposHoja.llenarOpciones('x-clase', ['A', 'B']);
ok($('#x-clase').options.length === 3 && $('#x-clase').options[0].value === '', 'en un select reemplaza sus opciones, con "Selecciona…"');
CamposHoja.llenarOpciones('no-existe', ['A']);
ok(true, 'un id que no existe no truena');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
