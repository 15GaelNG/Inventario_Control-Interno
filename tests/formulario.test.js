/**
 * Pruebas de comportamiento del componente Formulario en un navegador simulado (jsdom).
 * Usa los componentes REALES de src/html/js/componentes. Correr con:  npm test
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = path.join(__dirname, '..', 'src', 'html', 'js', 'componentes');
const scriptDe = (archivo) => {
  const html = fs.readFileSync(path.join(SRC, archivo), 'utf8');
  return html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
};

const dom = new JSDOM('<!doctype html><body><div id="f"></div></body>', { url: 'https://prueba.local/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.CSS = { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };
window.URL.createObjectURL = () => 'blob:prueba';
window.eval(['iconos.html', 'notificar.html', 'combobox.html', 'formulario.html'].map(scriptDe).join('\n') +
  '\nwindow.Formulario = Formulario; window.Notificar = Notificar; window.Combobox = Combobox;');

const doc = window.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));
const esperar = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const evento = (el, tipo) => el.dispatchEvent(new window.Event(tipo, { bubbles: true }));
const errorDe = (campo) => {
  const caja = $(`[data-campo="${campo}"] .form-error-campo`);
  return caja && !caja.hidden ? caja.textContent : null;
};

(async () => {
  let guardado = null;
  let vehiculo = {
    copiados: { PLACA: 'ABC-123', MARCA: 'NISSAN', 'LINEA VEHICULO': 'NP300', MODELO: 2020, DEPARTAMENTO: 'TI', COLOR: 'BLANCO' },
    combustibles: ['MAGNA', 'PREMIUM'],
    sensoresActivos: [],
    estatusVehiculo: 'UTILITARIO',
    serieSensorSugerida: 'G9SUGERIDA',
  };
  let fallarGuardado = false;

  const form = window.Formulario.crear($('#f'), {
    buscar: {
      campo: 'FOLIO', etiqueta: 'Folio del vehículo', ayuda: 'Escribe el folio',
      opciones: async () => [{ valor: 'AUT0100', etiqueta: 'ABC-123 · NISSAN' }],
      cargar: async (folio) => (folio === 'NOEXISTE' ? null : vehiculo),
      ficha: (d) => ({
        titulo: d.copiados.PLACA,
        subtitulo: [d.copiados.MARCA, d.copiados['LINEA VEHICULO']].join(' · '),
        avisos: d.sensoresActivos.length ? [{ tipo: 'alerta', texto: 'Ya tiene un sensor activo' }] : [],
        datos: [['Departamento', d.copiados.DEPARTAMENTO]],
        extra: [['Color', d.copiados.COLOR]],
      }),
      alCargar: (d, api) => api.setOpciones('COMBUSTIBLE', d.combustibles),
    },
    campos: [
      { id: 'SERIE', etiqueta: 'Serie del sensor', requerido: true, mayusculas: true, ayuda: 'La de la etiqueta del equipo' },
      { id: 'COMBUSTIBLE', etiqueta: 'Combustible', tipo: 'lista', requerido: true },
      { id: 'FECHA', etiqueta: 'Fecha de instalación', tipo: 'fecha', requerido: true, valor: '2026-09-17', seccion: 'Instalación' },
      { id: 'ESTATUS', etiqueta: 'Estatus', tipo: 'lista', opciones: ['ACTIVO', 'BAJA'], valor: 'ACTIVO' },
      { id: 'KM', etiqueta: 'Rendimiento', tipo: 'numero', min: 0 },
      { id: 'PDF', etiqueta: 'Responsiva', tipo: 'archivo', acepta: 'application/pdf', maxMB: 10, requerido: true },
      { id: 'NOTAS', etiqueta: 'Comentarios', tipo: 'parrafo' },
    ],
    ancho: 'medio',
    columnas: 2,
    textoGuardar: 'Registrar instalación',
    alValidar: (valores) => (valores.SERIE === 'REPETIDA' ? { SERIE: 'Esa serie ya está instalada' } : null),
    alGuardar: async (valores, archivos) => {
      if (fallarGuardado) throw new Error('El servidor dijo que no');
      guardado = { valores, archivo: archivos.PDF ? archivos.PDF.name : null };
    },
    textoExito: (v) => 'Registrado ' + v.FOLIO,
  });

  console.log('1. Estructura: rejilla, etiquetas y ayuda');
  ok(!!$('.form-medio') && $('form').style.getPropertyValue('--form-columnas') === '2',
    'respeta el ancho y las columnas que pidió el módulo');
  ok($('[data-campo="SERIE"] label').textContent === 'Serie del sensor', 'etiqueta arriba del campo');
  ok($('[data-campo="SERIE"] .form-ayuda').textContent === 'La de la etiqueta del equipo', 'la ayuda va debajo del campo');
  ok(!$('[data-campo="SERIE"] input').placeholder, 'sin placeholder (desaparece justo cuando hace falta)');
  ok($('[data-campo="SERIE"] input').required && !$('[data-campo="KM"] input').required,
    'required marca los obligatorios (el "*" lo pinta el CSS)');
  ok(!!$('.form-nota'), 'nota "Campos obligatorios" al inicio');
  ok($('[data-campo="FECHA"]').previousElementSibling.className === 'form-seccion' &&
    $('.form-seccion').textContent === 'Instalación', 'seccion agrupa los campos bajo un título');
  ok($('[data-campo="PDF"]').classList.contains('form-completo') && $('[data-campo="NOTAS"]').classList.contains('form-completo'),
    'archivos y párrafos ocupan el renglón completo');
  ok(!$('[data-campo="FECHA"]').classList.contains('form-completo'), 'los campos cortos comparten renglón');
  // En una pantalla ancha deben aparecer MÁS columnas, no campos más largos
  const cssForm = fs.readFileSync(path.join(SRC, 'formulario.html'), 'utf8');
  ok(/\.form-campos\s*\{[^}]*auto-fit/.test(cssForm.replace(/\n/g, ' ')),
    'la rejilla usa auto-fit: en pantallas anchas acomoda más columnas sola');
  ok($('[data-campo="FECHA"] input').value === '2026-09-17' && $('[data-campo="ESTATUS"] select').value === 'ACTIVO',
    'valores iniciales aplicados');
  ok(!$$('button').some((b) => /limpiar|borrar|reset/i.test(b.textContent)), 'no hay botón de limpiar');

  console.log('2. Validación al SALIR del campo, no mientras se escribe');
  const serie = $('[data-campo="SERIE"] input');
  serie.value = 'g9abc';
  evento(serie, 'input');
  ok(errorDe('SERIE') === null, 'mientras escribe no molesta con errores');
  serie.value = '';
  evento(serie, 'blur');
  ok(errorDe('SERIE') === 'Este dato es obligatorio', 'al salir vacío, error junto al campo');
  serie.value = 'g9abc';
  evento(serie, 'input');
  ok(errorDe('SERIE') === null, 'al corregir, el error se va de inmediato');

  console.log('3. Ficha de confirmación');
  const folio = $('[data-campo="FOLIO"] input');
  folio.value = 'AUT0100';
  evento(folio, 'blur');
  await esperar(20);
  ok(!$('.form-ficha').hidden && $('.form-ficha-titulo').textContent === 'ABC-123', 'muestra la ficha del vehículo');
  ok($('.form-ficha').textContent.includes('NISSAN · NP300'), 'subtítulo con marca y línea');
  ok($('.form-ficha-datos').textContent.includes('TI'), 'datos visibles sin desplegar nada');
  ok(!$('.form-ficha-extra') || $('.form-ficha-extra').hidden, 'lo demás viene colapsado');
  $('.form-ficha-mas').click();
  ok(!$('.form-ficha-extra').hidden && $('.form-ficha-extra').textContent.includes('BLANCO'), '"Ver todos los datos" despliega el resto');
  ok($('[data-campo="COMBUSTIBLE"] select').innerHTML.includes('MAGNA'), 'alCargar llenó las opciones que dependen del vehículo');
  ok(!$$('.form-ficha input').length, 'la ficha NO son campos deshabilitados (los lectores de pantalla los saltan)');

  console.log('4. Avisos de la ficha');
  vehiculo = Object.assign({}, vehiculo, { sensoresActivos: ['G9OTRO'] });
  folio.value = 'AUT0200';
  evento(folio, 'blur');
  await esperar(20);
  ok(!!$('.form-aviso-alerta') && $('.form-aviso-alerta').textContent.includes('sensor activo'), 'la ficha avisa lo que hay que saber antes de guardar');

  console.log('5. Folio que no existe');
  folio.value = 'NOEXISTE';
  evento(folio, 'blur');
  await esperar(20);
  ok(errorDe('FOLIO') === 'No se encontró' && $('.form-ficha').hidden, 'sin ficha y con error en el campo');
  folio.value = 'AUT0100';
  evento(folio, 'blur');
  await esperar(20);

  console.log('6. Archivos');
  const pdf = $('[data-campo="PDF"] input');
  const archivoFalso = (nombre, tipo, bytes) => {
    const f = new window.File(['x'], nombre, { type: tipo });
    Object.defineProperty(f, 'size', { value: bytes });
    return f;
  };
  Object.defineProperty(pdf, 'files', { value: [archivoFalso('foto.png', 'image/png', 1000)], configurable: true });
  evento(pdf, 'change');
  ok(errorDe('PDF') === 'El archivo debe ser PDF', 'rechaza un tipo que no corresponde');
  Object.defineProperty(pdf, 'files', { value: [archivoFalso('grande.pdf', 'application/pdf', 11 * 1024 * 1024)], configurable: true });
  evento(pdf, 'change');
  ok(errorDe('PDF') === 'El archivo pesa más de 10 MB', 'rechaza un archivo muy pesado');
  Object.defineProperty(pdf, 'files', { value: [archivoFalso('responsiva.pdf', 'application/pdf', 2000)], configurable: true });
  evento(pdf, 'change');
  ok(errorDe('PDF') === null && $('#f-PDF-info').textContent.includes('responsiva.pdf'), 'acepta el PDF y muestra su nombre');

  console.log('7. Guardar');
  $('[data-campo="COMBUSTIBLE"] select').value = 'MAGNA';
  serie.value = 'REPETIDA';
  evento($('form'), 'submit');
  await esperar(10);
  ok(guardado === null && errorDe('SERIE') === 'Esa serie ya está instalada', 'alValidar del módulo bloquea el guardado');

  serie.value = 'g9abc';
  evento($('form'), 'submit');
  await esperar(20);
  ok(guardado && guardado.valores.SERIE === 'G9ABC', 'mayusculas:true manda el valor en mayúsculas');
  ok(guardado.valores.FOLIO === 'AUT0100' && guardado.valores.FECHA === '2026-09-17', 'manda todos los valores');
  ok(guardado.archivo === 'responsiva.pdf', 'manda el archivo aparte');
  ok($$('.toast-exito').some((t) => t.textContent.includes('Registrado AUT0100')), 'aviso de éxito con el texto del módulo');
  ok($('[data-campo="SERIE"] input').value === '' && $('.form-ficha').hidden, 'al guardar se limpia el formulario y la ficha');
  ok($('[data-campo="FECHA"] input').value === '2026-09-17', 'los valores iniciales se restauran (fecha de hoy)');

  console.log('8. Campos faltantes y errores del servidor');
  guardado = null;
  evento($('form'), 'submit');
  await esperar(10);
  ok(guardado === null && errorDe('FOLIO') === 'Este dato es obligatorio' && errorDe('SERIE') === 'Este dato es obligatorio',
    'no guarda y marca TODOS los campos que faltan');
  ok(doc.activeElement === $('[data-campo="FOLIO"] input'), 'el foco se va al primer campo con error');

  folio.value = 'AUT0100';
  evento(folio, 'blur');
  await esperar(20);
  serie.value = 'G9ABC';
  $('[data-campo="COMBUSTIBLE"] select').value = 'MAGNA';
  Object.defineProperty(pdf, 'files', { value: [archivoFalso('r.pdf', 'application/pdf', 2000)], configurable: true });
  evento(pdf, 'change');
  fallarGuardado = true;
  evento($('form'), 'submit');
  await esperar(20);
  ok($('.error-msg').textContent === 'El servidor dijo que no' && !$('.error-msg').hidden, 'el error del servidor se muestra');
  ok($('[data-campo="SERIE"] input').value === 'G9ABC', 'si falla, NO se pierde lo capturado');
  ok(!$('form button[type="submit"]').disabled && $('form button[type="submit"]').textContent.includes('Registrar'),
    'el botón vuelve a la normalidad');

  console.log('9. Formulario por pasos');
  const cajaPasos = doc.body.appendChild(doc.createElement('div'));
  let guardadoPasos = null;
  window.Formulario.crear(cajaPasos, {
    pasos: [
      { titulo: 'Unidad', descripcion: 'Elige el vehículo', campos: ['A'] },
      { titulo: 'Equipo', campos: ['B', 'C'] },
    ],
    resumen: true,
    campos: [
      { id: 'A', etiqueta: 'Folio', requerido: true },
      { id: 'B', etiqueta: 'Serie', requerido: true },
      { id: 'C', etiqueta: 'Notas' },
    ],
    alGuardar: async (valores) => { guardadoPasos = valores; },
  });
  const p = (sel) => cajaPasos.querySelector(sel);
  const pasoVisible = () => Array.from(cajaPasos.querySelectorAll('.form-paso')).findIndex((s) => !s.hidden);
  const errorEn = (campo) => {
    const el = cajaPasos.querySelector(`[data-campo="${campo}"] .form-error-campo`);
    return el && !el.hidden ? el.textContent : null;
  };

  ok(cajaPasos.querySelectorAll('.form-paso-chip').length === 3, 'resumen:true agrega el paso de revisión (2 + 1)');
  ok(pasoVisible() === 0 && p('.form-cuenta').textContent === 'Paso 1 de 3', 'empieza en el primer paso e indica en cuál va');
  ok(p('.form-atras').hidden && !p('.form-siguiente').hidden && p('button[type="submit"]').hidden,
    'primer paso: sin "Atrás" y sin botón de guardar');

  p('.form-siguiente').click();
  ok(pasoVisible() === 0 && errorEn('A') === 'Este dato es obligatorio', 'no deja avanzar con un campo obligatorio vacío');

  p('[data-campo="A"] input').value = 'AUT0100';
  p('.form-siguiente').click();
  ok(pasoVisible() === 1 && !p('.form-atras').hidden, 'avanza al llenar lo pedido');
  ok(p('.form-paso-chip').classList.contains('completado'), 'el paso anterior se marca como completado');
  p('.form-atras').click();
  ok(pasoVisible() === 0 && p('[data-campo="A"] input').value === 'AUT0100', '"Atrás" regresa sin perder lo capturado');
  p('.form-siguiente').click();

  p('[data-campo="B"] input').value = 'G9ABC';
  p('[data-campo="C"] input').value = 'sin novedad';
  p('.form-siguiente').click();
  ok(pasoVisible() === 2 && !p('button[type="submit"]').hidden && p('.form-siguiente').hidden,
    'el último paso muestra el botón de guardar');
  ok(p('.form-resumen').textContent.includes('AUT0100') && p('.form-resumen').textContent.includes('G9ABC'),
    'el resumen muestra lo capturado en todos los pasos');
  ok(p('.form-resumen').textContent.includes('sin novedad'), 'incluye también lo opcional');

  cajaPasos.querySelectorAll('.form-paso-chip')[0].click();
  ok(pasoVisible() === 0, 'se puede regresar a un paso anterior desde el indicador');
  p('[data-campo="A"] input').value = '';
  cajaPasos.querySelectorAll('.form-paso-chip')[2].click();
  ok(pasoVisible() === 0 && errorEn('A'), 'no deja saltar adelante si el paso actual quedó incompleto');

  p('[data-campo="A"] input').value = 'AUT0100';
  cajaPasos.querySelectorAll('.form-paso-chip')[2].click();
  evento(p('form'), 'submit');
  await esperar(20);
  ok(guardadoPasos && guardadoPasos.A === 'AUT0100' && guardadoPasos.B === 'G9ABC', 'guarda los valores de todos los pasos');
  ok(pasoVisible() === 0 && p('[data-campo="B"] input').value === '', 'al guardar vuelve al primer paso y limpia');
  cajaPasos.remove();

  console.log('10. El formulario cambia según la respuesta (visibleSi)');
  const cajaSi = doc.body.appendChild(doc.createElement('div'));
  let guardadoSi = null;
  let ultimoCambio = null;
  window.Formulario.crear(cajaSi, {
    pasos: [
      { titulo: 'Tipo', campos: ['TIPO'] },
      { titulo: 'De flota', campos: ['FOLIO_FLOTA'], visibleSi: (v) => v.TIPO === 'FLOTA' },
      { titulo: 'Personal', campos: ['DUENO'], visibleSi: (v) => v.TIPO === 'PERSONAL' },
    ],
    campos: [
      { id: 'TIPO', tipo: 'opciones', etiqueta: '¿Qué unidad es?', requerido: true,
        opciones: [
          { valor: 'FLOTA', etiqueta: 'De la flota', descripcion: 'Está en el catálogo' },
          { valor: 'PERSONAL', etiqueta: 'Personal', descripcion: 'De un empleado' },
        ] },
      { id: 'FOLIO_FLOTA', etiqueta: 'Folio', requerido: true, visibleSi: (v) => v.TIPO === 'FLOTA' },
      { id: 'DUENO', etiqueta: 'Dueño', requerido: true, visibleSi: (v) => v.TIPO === 'PERSONAL' },
    ],
    alCambiar: (campo) => { ultimoCambio = campo; },
    alGuardar: async (valores) => { guardadoSi = valores; },
  });
  const s = (sel) => cajaSi.querySelector(sel);
  const pasoSi = () => Array.from(cajaSi.querySelectorAll('.form-paso')).findIndex((x) => !x.hidden);
  const chipsVisibles = () => Array.from(cajaSi.querySelectorAll('.form-pasos li')).filter((li) => !li.hidden).length;
  const elegir = (valor) => {
    const radio = Array.from(cajaSi.querySelectorAll('input[name="f-TIPO"]')).find((r) => r.value === valor);
    radio.checked = true;
    evento(radio, 'change');
  };

  ok(cajaSi.querySelectorAll('.form-opcion').length === 2 && cajaSi.querySelector('.form-opcion strong').textContent === 'De la flota',
    'el campo de opciones se pinta como botones con su descripción');
  ok(s('[data-campo="FOLIO_FLOTA"]').hidden && s('[data-campo="DUENO"]').hidden,
    'los campos que dependen de la respuesta empiezan ocultos');
  s('.form-siguiente').click();
  ok(pasoSi() === 0 && s('[data-campo="TIPO"] .form-error-campo').textContent === 'Elige una opción',
    'no deja avanzar sin responder');

  elegir('FLOTA');
  ok(ultimoCambio === 'TIPO', 'alCambiar avisa al módulo qué cambió');
  ok(!s('[data-campo="FOLIO_FLOTA"]').hidden && s('[data-campo="DUENO"]').hidden, 'aparece solo lo que aplica');
  ok(chipsVisibles() === 2, 'el paso que no aplica desaparece del indicador (3 → 2)');
  ok(s('.form-cuenta').textContent === 'Paso 1 de 2', 'la cuenta de pasos se ajusta');
  s('.form-siguiente').click();
  ok(pasoSi() === 1, 'avanza al paso de flota, saltándose el de personal');

  elegir('PERSONAL');
  ok(pasoSi() === 2, 'al cambiar la respuesta se mueve al paso que ahora aplica');
  ok(s('[data-campo="FOLIO_FLOTA"]').hidden && !s('[data-campo="DUENO"]').hidden, 'y se intercambian los campos');
  s('[data-campo="DUENO"] input').value = 'Juan';
  evento(s('form'), 'submit');
  await esperar(20);
  ok(guardadoSi && guardadoSi.DUENO === 'Juan', 'guarda lo que sí aplica');
  ok(guardadoSi.FOLIO_FLOTA === '', 'lo que quedó oculto NO se envía (ya no aplica)');
  cajaSi.remove();

  console.log('11. Lista de folios (Combobox, no <datalist>)');
  ok(!$('datalist'), 'no se usa <datalist> (se ve distinto en cada navegador y no se puede estilizar)');
  const caja = doc.body.appendChild(doc.createElement('div'));
  caja.innerHTML = '<input id="cbx-prueba" />';
  const entrada = caja.querySelector('input');
  let elegida = null;
  const cbx = window.Combobox.crear(entrada, {
    opciones: [
      { valor: 'AUT0100', etiqueta: 'ABC-123 · NISSAN' },
      { valor: 'AUT0200', etiqueta: 'XYZ-987 · NISSÁN' },
      { valor: 'MOT0300', etiqueta: 'QRS-456 · ITALIKA' },
    ],
    alElegir: (o) => { elegida = o.valor; },
  });
  const opcionesVisibles = () => Array.from(caja.querySelectorAll('.cbx-opcion')).map((el) => el.textContent.trim().split(/\s+/)[0]);
  const teclear = (texto) => { entrada.value = texto; evento(entrada, 'input'); };
  const tecla = (key) => entrada.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));

  evento(entrada, 'focus');
  ok(opcionesVisibles().length === 3, 'al enfocar muestra todas las opciones');
  teclear('aut');
  ok(opcionesVisibles().join() === 'AUT0100,AUT0200', 'filtra mientras se escribe');
  ok(!!caja.querySelector('.cbx-opcion mark'), 'resalta la parte que coincide');
  teclear('nissan');
  ok(opcionesVisibles().length === 2, 'busca también en la etiqueta y sin importar acentos (NISSÁN)');
  teclear('zzz');
  ok(!!caja.querySelector('.cbx-vacio'), 'dice cuando no hay coincidencias');

  teclear('aut');
  tecla('ArrowDown'); tecla('ArrowDown'); tecla('Enter');
  ok(entrada.value === 'AUT0200' && elegida === 'AUT0200', 'se puede elegir con el teclado (↓ ↓ Enter)');
  ok(!caja.querySelector('.cbx-lista'), 'al elegir se cierra la lista');
  evento(entrada, 'focus');
  caja.querySelectorAll('.cbx-opcion')[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok(entrada.value === 'AUT0100', 'y también con el mouse');
  ok(entrada.getAttribute('role') === 'combobox' && entrada.getAttribute('aria-expanded') === 'false',
    'accesible: role combobox y aria-expanded');
  cbx.destruir();
  caja.remove();

  console.log('12. Panel de contexto a la derecha');
  const cajaPanel = doc.body.appendChild(doc.createElement('div'));
  const formPanel = window.Formulario.crear(cajaPanel, {
    panel: { titulo: 'Resumen', capturado: true },
    panelExtra: (valores) => (valores.B ? '<p id="extra-prueba">nota</p>' : ''),
    buscar: {
      campo: 'A', etiqueta: 'Folio',
      cargar: async () => ({ PLACA: 'ABC-123' }),
      ficha: (d) => ({ titulo: d.PLACA, datos: [['Placa', d.PLACA]], extra: [['Color', 'BLANCO']], pie: 'Del catálogo' }),
    },
    campos: [
      { id: 'B', etiqueta: 'Serie', requerido: true },
      { id: 'C', etiqueta: 'Fecha', tipo: 'fecha' },
    ],
    alGuardar: async () => {},
  });
  const q = (sel) => cajaPanel.querySelector(sel);
  ok(!!q('.form-doble') && !!q('.form-panel'), 'el formulario se parte en captura + panel');
  ok(q('.form-panel .form-ficha') && !q('.form-principal .form-ficha'), 'la ficha vive en el panel, no entre los campos');
  ok(q('.form-panel-capturado').hidden, 'el panel no muestra nada mientras no haya nada capturado');

  q('[data-campo="A"] input').value = 'AUT0100';
  evento(q('[data-campo="A"] input'), 'blur');
  await esperar(20);
  ok(!q('.form-panel .form-ficha').hidden && q('.form-panel').textContent.includes('ABC-123'), 'la ficha aparece en el panel');
  ok(q('.form-panel').textContent.includes('BLANCO') && !q('.form-ficha-mas'),
    'en el panel la ficha se muestra completa, sin "Ver todos los datos"');
  ok(q('.form-ficha-pie') && q('.form-ficha-pie').textContent === 'Del catálogo',
    'la ficha puede llevar una nota al pie (se ancla abajo para llenar el alto)');

  const serieP = q('[data-campo="B"] input');
  serieP.value = 'G9ABC';
  evento(serieP, 'blur');
  ok(!q('.form-panel-capturado').hidden && q('.form-resumen-panel').textContent.includes('G9ABC'),
    'lo capturado se va acumulando en el panel');
  ok(!q('.form-resumen-panel').textContent.includes('Sin capturar'), 'el panel solo lista lo que ya se llenó');
  q('[data-campo="C"] input').value = '2026-09-17';
  evento(q('[data-campo="C"] input'), 'change');
  ok(q('.form-resumen-panel').textContent.includes('17/09/2026'), 'las fechas se muestran en formato legible');
  ok(!!q('#extra-prueba'), 'panelExtra deja al módulo poner su propio contenido');
  formPanel.setSoloLectura('B', true, 'Viene de otro módulo');
  ok(q('[data-campo="B"] input').readOnly && !q('[data-campo="B"] input').disabled,
    'setSoloLectura bloquea con readonly, no con disabled (los lectores de pantalla sí leen los readonly)');
  ok(q('[data-campo="B"] input').getAttribute('aria-readonly') === 'true', 'y lo anuncia como solo lectura');
  ok(formPanel.getValores().B === 'G9ABC', 'un campo de solo lectura SÍ se sigue enviando al guardar');
  formPanel.setSoloLectura('B', false);
  ok(!q('[data-campo="B"] input').readOnly, 'y se puede volver a liberar');
  formPanel.limpiar();
  ok(q('.form-panel-capturado').hidden && q('.form-ficha').hidden, 'al limpiar, el panel vuelve a quedar vacío');
  cajaPanel.remove();

  console.log('13. Los campos se ven iguales entre sí (estilos globales)');
  // Sin reglas propias, el navegador le pone su estilo al textarea y desentona con los inputs
  const estilosApp = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'styles.html'), 'utf8');
  const hoja = doc.createElement('style');
  hoja.textContent = estilosApp.slice(estilosApp.indexOf('<style>') + 7, estilosApp.indexOf('</style>'));
  doc.head.appendChild(hoja);
  const cajaEstilos = doc.body.appendChild(doc.createElement('div'));
  cajaEstilos.innerHTML = '<input id="e1" /><textarea id="e2"></textarea><select id="e3"></select>';
  const estilo = (sel) => window.getComputedStyle(cajaEstilos.querySelector(sel));
  const mismo = (prop) => estilo('input')[prop] === estilo('textarea')[prop] && estilo('input')[prop] === estilo('select')[prop];
  ok(mismo('borderRadius') && !!estilo('textarea').borderRadius, 'textarea, input y select con el mismo redondeo');
  ok(mismo('padding'), 'mismo relleno interno');
  ok(mismo('borderColor') && mismo('backgroundColor'), 'mismo borde y fondo');
  ok(estilo('textarea').resize === 'vertical', 'el textarea solo se puede estirar hacia abajo (no rompe el ancho)');
  cajaEstilos.remove();

  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
