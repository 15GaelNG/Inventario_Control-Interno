// Pendiente 2.2 (usuario, 6-oct): la responsiva tiene su propia página, como la inspección, y las dos llevan a la vista
// «Ver PDF» y «Subir PDF firmado», y en ⋮ Ver equipo, Ver carpeta en Drive y Generar o Regenerar PDF.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('la responsiva se abre en su página desde Documentos, el doble clic y el Historial', () => {
  const lineas = read('src/html/js/lineas.html');
  assert.match(lineas, /inspeccion: pintarInspeccion, responsiva: pintarResponsiva \}\[tipo\]/);
  assert.match(lineas, /titulo: 'Ver responsiva', visible: \(d\) => d\.documento === 'Responsiva', alHacer: \(d\) => abrir\('responsiva', d\.id\)/);
  assert.match(lineas, /abrir\(d\.documento === 'Inspección' \? 'inspeccion' : 'responsiva', d\.id\);/);
  assert.match(lineas, /titulo: 'Ver responsiva', visible: \(m\) => m\.refTipo === 'responsiva' && !!m\.refId/);
  assert.match(read('src/ClientApi.gs'), /function apiLineasResponsiva\(token, id\) \{\s+return TelefoniaService\.responsiva\(token, id\);/);
});

test('la página de la responsiva muestra lo de ese día: responsable con director, equipo y línea, accesorios y comentario', () => {
  const lineas = read('src/html/js/lineas.html');
  const pagina = lineas.slice(lineas.indexOf('function pintarResponsiva('), lineas.indexOf('// ---- Inspección ----'));
  assert.match(pagina, /llamar\('apiLineasResponsiva', id\)/);
  assert.match(pagina, /\['Director', s\.director\]/);
  assert.match(pagina, /' Equipo y línea'/);
  assert.match(pagina, /' Accesorios entregados'/);
  assert.match(pagina, /' Comentario'/);
  assert.doesNotMatch(pagina, /pinEquipo|patron|firmas/i, 'sin PIN, patrón ni firmas, como la inspección');
  const repo = read('src/services/lineas/LineasRepo.gs');
  assert.match(repo, /director: txt\(col\(f, 'DIRECTOR'\)\)/);
  assert.match(repo, /comentario: txt\(col\(f, 'COMENTARIO'\)\)/);
  assert.match(repo, /function leerResponsiva\(id\)/);
});

test('las dos páginas: Ver PDF y Subir PDF firmado a la vista; lo demás en ⋮, con las reglas de Documentos', () => {
  const lineas = read('src/html/js/lineas.html');
  assert.match(lineas, /botonesDocumento\('INSPECCION', i, r\)/);
  assert.match(lineas, /botonesDocumento\('RESPONSIVA', d, r\)/);
  assert.match(lineas, /data-ln-doc-subir>' \+ icono\('file-up'\) \+ ' Subir PDF firmado/);
  assert.match(lineas, /r\.puedeOperar && x\.registroId && \(x\.pdfId \|\| x\.origen !== 'SISTEMA'\)/);
  const opciones = lineas.slice(lineas.indexOf('function opcionesDocumento('), lineas.indexOf('function botonesDocumento('));
  ['Ver equipo', 'Ver carpeta en Drive', 'Generar PDF', 'Regenerar PDF'].forEach((t) => assert.match(opciones, new RegExp("texto: '" + t + "'")));
  assert.match(opciones, /x\.tipoPdf === 'RESPONSIVA' && x\.origen === 'SISTEMA' && x\.pdfId/);
  // Desde la página, el registro va explícito (arriba de la pila está el documento) y la página se pinta de nuevo
  assert.match(lineas, /regenerarPdf\(x, x\.registroId\)/);
  assert.match(lineas, /else if \(arriba && arriba\.id === nuevoId && ETIQUETA_DOCUMENTO\[arriba\.tipo\]\) abrir\(arriba\.tipo, arriba\.id, true, true\);/);
  // La inspección dice «Comentario» (parte 6)
  assert.match(lineas, /' Comentario', '<p class="ln-lectura-notas">' \+ esc\(i\.observaciones \|\| 'Sin comentario registrado\.'\)/);
});

test('Documentos en orden: la responsiva del sistema toma la hora en que se guardó (su columna solo trae el día)', () => {
  const repo = read('src/services/lineas/LineasRepo.gs');
  const fn = repo.slice(repo.indexOf('function responsivaDesdeFila('), repo.indexOf('return {', repo.indexOf('function responsivaDesdeFila(')));
  const Utilities = { formatDate: (d, z, f) => (f === 'yyyy-MM-dd' ? d.toISOString().slice(0, 10) : d.toISOString().slice(11, 19)) };
  const desde = new Function('Utilities', 'LineasDatos', 'LineasUtil', 'col', 'fecha',
    fn.replace('function responsivaDesdeFila(f, ev) {', 'return function (f, ev) {') + 'return fch; };')(
    Utilities, { ZONA_APP: 'UTC' }, {}, (f, c) => f[c], (v) => (v instanceof Date ? v : null));
  const guardada = new Date('2026-10-06T12:37:00Z');
  // Sin hora (leída de varias filas): la del guardado, si es del mismo día
  assert.equal(desde({ 'FECHA RESPONSIVA': new Date('2026-10-06T00:00:00Z') }, { origen: 'SISTEMA', fecha: guardada }), guardada);
  // Con hora, de otro día o del AppSheet: la de la hoja
  const conHora = new Date('2026-10-06T10:54:00Z');
  assert.equal(desde({ 'FECHA RESPONSIVA': conHora }, { origen: 'SISTEMA', fecha: guardada }), conHora);
  const otroDia = new Date('2026-10-05T00:00:00Z');
  assert.equal(desde({ 'FECHA RESPONSIVA': otroDia }, { origen: 'SISTEMA', fecha: guardada }), otroDia);
  assert.equal(desde({ 'FECHA RESPONSIVA': otroDia }, null), otroDia);
});
