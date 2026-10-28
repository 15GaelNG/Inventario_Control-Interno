const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const LINEAS = require('./lineas-fuente');

// Fallas y mejoras que pidió el usuario el 22-oct (pendientes 2.37, 2.47, 2.63, 3.10 y 7.12; abrir en Líneas y el buscador)
const leer = (r) => fs.readFileSync(path.join(__dirname, '..', r), 'utf8').replace(/\r/g, '');
const cliente = LINEAS;

test('2.47: un patrón («1-9-7») se escribe como texto en las hojas que no están en formato de texto', () => {
  const fuente = leer('src/services/lineas/LineasDatos.gs');
  const inicio = fuente.indexOf('function valorCelda_(');
  const fin = fuente.indexOf('\n', fuente.indexOf('const HOJAS_EN_TEXTO', inicio));
  const valorCelda = new Function('aHoraHoja', fuente.slice(inicio, fin) + '\nreturn valorCelda_;')(() => 'fecha');
  assert.strictEqual(valorCelda('1-9-7', 'INSPECCIONES LINEAS'), "'1-9-7");
  assert.strictEqual(valorCelda('1-9', 'RESPONSIVAS LINEAS'), "'1-9");
  assert.strictEqual(valorCelda('2-5-8-6', 'RESPONSIVAS LINEAS'), "'2-5-8-6");
  // Las hojas en formato de texto no llevan apóstrofo; lo demás sigue igual
  assert.strictEqual(valorCelda('1-9-7', 'EQUIPOS'), '1-9-7');
  assert.strictEqual(valorCelda('2026-10-22', 'INSPECCIONES LINEAS'), '2026-10-22');
  assert.strictEqual(valorCelda('0123', 'INSPECCIONES LINEAS'), "'0123");
  assert.strictEqual(valorCelda('PATRON', 'INSPECCIONES LINEAS'), 'PATRON');
});

test('2.47: patron-texto.js regresa la fecha a su patrón (1-sep-2007 → «1-9-7») y deja las que no salen de uno', () => {
  const { patronDeSerie } = require('../tools/lineas-datos/patron-texto.js');
  assert.strictEqual(patronDeSerie(39326), '1-9-7');
  assert.strictEqual(patronDeSerie(46317), null); // 22-oct-2026: no es un patrón
});

test('2.47: patron-texto.js deja sus movimientos como cable-cubo.js: sin DOCUMENTO, campo con el documento y su fecha', () => {
  const { COMENTARIO } = require('../tools/lineas-datos/patron-texto.js');
  assert.strictEqual(COMENTARIO, 'PATRON GUARDADO COMO FECHA: SE REGRESA A TEXTO', 'sin «(PENDIENTE 2.47)»');
  const fuente = leer('tools/lineas-datos/patron-texto.js');
  assert.doesNotMatch(fuente, /documento:/, 'un movimiento con DOCUMENTO tapa la inspección o la responsiva en el historial');
  assert.match(fuente, /campo: c\.campoDe\(x\.hoja, x\.f, x\.columna\)/);
});

test('7.12: los renglones nuevos se agregan desde el último con datos y movimientos-vacios.js quita los de en medio', () => {
  const { vacios } = require('../tools/lineas-datos/movimientos-vacios.js');
  assert.deepStrictEqual(vacios({ enc: ['ID', 'FECHA'], filas: [{ _n: 2, ID: 'a', FECHA: 'x' }, { _n: 3, ID: '', FECHA: '' }, { _n: 4, ID: 'b', FECHA: '' }] }), [3]);
  const comun = leer('tools/lineas-datos/comun.js');
  assert.doesNotMatch(comun, /rango\('MOVIMIENTOS', 'A1'\) \+ ':append/);
  assert.match(comun, /rango\('MOVIMIENTOS', 'A' \+ Math\.max\(1, ultimo\)\) \+ ':append/);
  const aplicar = path.join(__dirname, '../../reporte_lineas/actualizacion_base/aplicar.js');
  if (fs.existsSync(aplicar)) {
    const fuente = fs.readFileSync(aplicar, 'utf8');
    assert.doesNotMatch(fuente, /comun\.rango\(h, 'A1'\) \+\s*':append/);
  }
});

test('2.63: el PDF de un documento guardado dentro de una acción se espera; mientras, sin «Generar PDF»', () => {
  const flujo = cliente.slice(cliente.indexOf('function terminarFlujo('), cliente.indexOf('function abrirCaptura('));
  assert.match(flujo, /pdfsEnCurso\[r\.id\] = true;/);
  assert.match(flujo, /delete pdfsEnCurso\[r\.id\];/);
  assert.match(flujo, /if \(arriba\.tipo === 'equipo' \|\| arriba\.tipo === 'linea'\) cargarEvidencias\(arriba\.id\);/);
  // Al terminar el PDF se olvida lo que la ficha guardó mientras (2 min): si no, Documentos volvía sin el PDF (NUCO 1010)
  const alTerminar = flujo.slice(flujo.indexOf('pdf.then('), flujo.indexOf('cargarEvidencias(arriba.id)'));
  assert.match(alTerminar, /delete pdfsEnCurso\[r\.id\];[\s\S]*olvidarFicha\(\);[\s\S]*const arriba = pila\[pila\.length - 1\];/);
  assert.match(cliente, /const pdfsEnCurso = \{\};/);
  // La ficha vive en otro archivo que la base (fase 6.2): vacía la memoria con olvidarFicha, no asigna el let
  assert.match(cliente, /function olvidarFicha\(\) \{\n\s+fichaEnMemoria = \{\};\n\s+\}/);
  assert.match(cliente, /'Generar PDF', 'pdf', true, \(d\) => operar && !!d\.pdfPendiente && !pdfsEnCurso\[d\.id\]/);
  assert.match(cliente, /x\.origen === 'SISTEMA' && !x\.pdfId && !pdfsEnCurso\[x\.id\] \? \{ icono: 'file-plus', texto: 'Generar PDF'/);
});

test('2.37: con una ventana abierta, el panel lateral va detrás y no se queda con Escape', () => {
  const panel = cliente.slice(cliente.indexOf('function abrirPanelLateral('), cliente.indexOf('function cerrarMenusFlotantes('));
  assert.match(panel, /if \(ev\.key !== 'Escape' \|\| document\.querySelector\('#ln-modal-captura:not\(\[hidden\]\)'\)\) return;/);
  assert.match(panel, /fondo\.className = 'dt-panel-fondo ln-panel-fondo';/);
  // Escape cierra la ventana aunque el foco esté fuera de ella (en la página)
  assert.match(cliente, /if \(ev\.key !== 'Escape' \|\| raiz\.contains\(ev\.target\) \|\| \$\('#ln-modal-captura', raiz\)\.hidden\) return;\s*cerrarCaptura\(\);/);
  assert.match(cliente, /if \(!document\.body\.contains\(raiz\)\) \{ document\.removeEventListener\('keydown', escapeVentana\); return; \}/);
  const estilos = leer('src/html/lineas-estilos.html');
  assert.match(estilos, /body:has\(#ln-modal-captura:not\(\[hidden\]\)\) \.dt-panel\.ln-panel,\s*body:has\(#ln-modal-captura:not\(\[hidden\]\)\) \.ln-panel-fondo \{ z-index: 490; \}/);
});

test('3.10: el significado de EN PROCESO DE CANCELACION no dice que pasa a la bandeja', () => {
  assert.match(cliente, /'EN PROCESO DE CANCELACION': 'Se pide su cancelación al proveedor; falta confirmarla'/);
  assert.doesNotMatch(cliente, /Pasa a la bandeja de cancelaciones; se pide al proveedor/);
});

test('El área LINEAS entra directo a Líneas Telefónicas si tiene su permiso; las demás, al Inicio (usuario, 22-oct)', () => {
  const app = leer('src/html/js/app.html');
  const inicio = app.indexOf('function vistaInicial_()');
  const fuente = app.slice(inicio, app.indexOf('\n  }\n', inicio) + 4);
  const VISTAS = { 'lineas-telefonicas': { vista: 'lineas-telefonicas', requiere: 'lineas-telefonicas' } };
  const Formato = { normal: (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() };
  const crear = (departamento, permisos) => new Function('state', 'vistaDe', 'estaApagada', 'permisoDe', 'Formato', fuente + '\nreturn vistaInicial_;')(
    { sesion: { departamento } }, (v) => VISTAS[v] || null, () => false, (m) => permisos[m], Formato);
  assert.strictEqual(crear('LINEAS', { 'lineas-telefonicas': 'EDICION' })(), 'lineas-telefonicas');
  assert.strictEqual(crear('Líneas ', { 'lineas-telefonicas': 'LECTURA' })(), 'lineas-telefonicas');
  assert.strictEqual(crear('LINEAS', {})(), 'dashboard');
  assert.strictEqual(crear('CONTROL INTERNO', { 'lineas-telefonicas': 'EDICION' })(), 'dashboard');
  // Con los permisos de la visita anterior vacíos abre el Inicio y, al llegar los de verdad, su pantalla
  assert.match(app, /if \(inicial === 'dashboard' && vistaActual === 'dashboard' && vistaInicial_\(\) !== 'dashboard'\) navegarA\(vistaInicial_\(\)\);/);
  assert.match(app, /navegarA\(inicial\);/);
});

test('Buscador de las tablas: al entrar, lo que ya tiene queda seleccionado (usuario, 22-oct)', () => {
  assert.match(cliente, /const b = ev\.target\.closest && ev\.target\.closest\('\.dt-buscar, \.dt-buscar-col'\);\s*if \(!b \|\| !b\.value\) return;\s*b\.select\(\);/);
  assert.match(cliente, /if \(buscadorRecien && ev\.target === buscadorRecien\) ev\.preventDefault\(\);/);
});
