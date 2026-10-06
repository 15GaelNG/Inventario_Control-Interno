// PDF firmado de una inspección o responsiva (usuario, 5-oct): se sube después y reemplaza el PDF. Solo PDF.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('el servidor solo acepta el PDF que Documentos le muestra al registro', () => {
  const api = read('src/ClientApi.gs');
  assert.match(api, /function apiLineasSubirPdfFirmado\(token, registroId, tipo, docId, pdfId, base64\) \{\r?\n  return TelefoniaService\.subirPdfFirmado\(token, registroId, tipo, docId, pdfId, base64\);/);
  const servicio = read('src/services/TelefoniaService.gs');
  const fn = servicio.slice(servicio.indexOf('function subirPdfFirmado('), servicio.indexOf('/** Panorama de Líneas'));
  assert.match(fn, /const sesion = operar_\(token\);/);
  assert.match(fn, /const docs = evidencias\(token, registroId\);/);
  // El documento sale de Documentos por su id; si el cliente manda un PDF, debe ser el suyo
  assert.match(fn, /\.filter\(\(d\) => d\.id === docId\)\[0\];/);
  assert.match(fn, /if \(!doc \|\| \(pdfId && doc\.pdfId !== pdfId\)\) throw new Error\('El PDF no es de este registro\.'\);/);
  assert.match(fn, /origen: doc\.origen, fecha: doc\.fecha, pdfId: doc\.pdfId, carpetaId: doc\.carpetaId/);
});

test('mismo archivo de Drive: versión nueva, la anterior se conserva', () => {
  const archivos = read('src/services/lineas/LineasArchivos.gs');
  const fn = archivos.slice(archivos.indexOf('function reemplazarPdf('), archivos.indexOf('  return {', archivos.indexOf('function reemplazarPdf(')));
  assert.match(fn, /getMimeType\(\) !== MimeType\.PDF/);
  assert.match(fn, /exigirEscribible\(/);
  assert.match(fn, /keepForever: true/);
  assert.match(fn, /upload\/drive\/v3\/files\/' \+ encodeURIComponent\(archivoId\)/);
  assert.match(fn, /uploadType=media&supportsAllDrives=true/);
  assert.doesNotMatch(fn, /setTrashed|createFile/);
});

test('solo PDF: el contenido debe empezar con %PDF- y pesar 15 MB o menos; queda en el historial', () => {
  const captura = read('src/services/lineas/LineasCaptura.gs');
  const inicio = captura.indexOf('function subirPdfFirmado(');
  const fuente = captura.slice(inicio, captura.indexOf('\n  return {', inicio));
  const movimientos = [];
  const reemplazos = [];
  const olvidados = [];
  const ctx = {
    Utilities: { base64Decode: (b) => Array.from(Buffer.from(b, 'base64')) },
    LineasArchivos: { reemplazarPdf: (id, bytes) => { reemplazos.push([id, bytes.length]); return { id: id, name: 'RESP 0012 05 10.pdf' }; }, olvidarNuco: (n) => olvidados.push(n) },
    LineasDatos: { conCandado: (f) => f() },
    LineasRepo: { registrarMovimiento: (...a) => movimientos.push(a) },
  };
  vm.createContext(ctx);
  vm.runInContext(fuente + '\nthis.subirPdfFirmado = subirPdfFirmado;', ctx);
  const reg = { id: 'EQU-1', nuco: '0012' };
  const usuario = { correo: 'a@b.mx', nombre: 'A' };
  const doc = { tipo: 'RESPONSIVA', id: 'RES-9', pdfId: 'PDF1' };
  assert.throws(() => ctx.subirPdfFirmado(reg, doc, Buffer.from('\x89PNG....').toString('base64'), usuario), /Solo se aceptan archivos PDF/);
  assert.throws(() => ctx.subirPdfFirmado(reg, doc, '', usuario), /Elige el PDF firmado/);
  assert.equal(reemplazos.length, 0);
  const r = ctx.subirPdfFirmado(reg, doc, Buffer.from('%PDF-1.7 firmado').toString('base64'), usuario);
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { id: 'PDF1', nombre: 'RESP 0012 05 10.pdf' });
  assert.deepEqual(reemplazos, [['PDF1', 16]]);
  assert.deepEqual(olvidados, ['0012']);
  assert.equal(movimientos.length, 1);
  const [tipo, datos, quien, , extra] = movimientos[0];
  assert.equal(tipo, 'PDF_FIRMADO');
  assert.equal(quien, usuario);
  assert.equal(datos.motivo, '');
  assert.deepEqual(JSON.parse(JSON.stringify(extra)), { refs: ['EQU-1'], nuco: '0012',
    detalle: { responsivaId: 'RES-9', cambios: [{ campo: 'PDF', antes: '', despues: 'RESP 0012 05 10.pdf' }] } });
  assert.match(read('src/services/lineas/LineasRepo.gs'), /PDF_FIRMADO: 'PDF firmado',/);
});

test('la pantalla: «Subir PDF firmado» en Documentos, solo con permiso de operar y solo PDF', () => {
  const cliente = read('src/html/js/lineas.html');
  // Del sistema con su PDF; del AppSheet y de NUCOS siempre (usuario, 5-oct)
  assert.match(cliente, /\{ icono: 'file-up', titulo: 'Subir PDF firmado', visible: \(d\) => operar && \(!!d\.pdfId \|\| d\.origen !== 'SISTEMA'\), alHacer: \(d\) => subirPdfFirmado\(id, d\) \}/);
  const fn = cliente.slice(cliente.indexOf('function subirPdfFirmado('), cliente.indexOf('function soltarDocumentos('));
  assert.match(fn, /input\.accept = 'application\/pdf,\.pdf';/);
  assert.match(fn, /Solo se aceptan archivos PDF\./);
  assert.match(fn, /mostrarEspera\('Subiendo PDF firmado'\);/);
  assert.match(fn, /llamar\('apiLineasSubirPdfFirmado', registroId, d\.tipoPdf, d\.id, d\.pdfId \|\| '', base64\)/);
  assert.match(fn, /cargarEvidencias\(registroId\);\r?\n\s+cargarHistorial\(registroId\);/);
  assert.match(cliente, /'PDF firmado': 'file-up'/);
  assert.match(cliente, /\['Documentos', \['Inspección', 'Responsiva', 'PDF firmado', 'PDF regenerado'\]\]/);
});

test('del AppSheet o de NUCOS sin PDF: el firmado se guarda en NUCOS; del sistema, primero se genera', () => {
  const captura = read('src/services/lineas/LineasCaptura.gs');
  const inicio = captura.indexOf('function subirPdfFirmado(');
  const fuente = captura.slice(inicio, captura.indexOf('\n  return {', inicio));
  const creados = [];
  const escribibles = [];
  const carpeta = (id, nombre) => ({
    getId: () => id, getName: () => nombre,
    createFile: (blob) => { creados.push({ carpeta: id, nombre: blob.nombre, mime: blob.mime }); return { getId: () => 'NUEVO', getName: () => blob.nombre, setSharing: () => {} }; },
  });
  const carpetas = { INSP1: carpeta('INSP1', 'INSP 03 02'), NUEVA: carpeta('NUEVA', 'RESP 15 08') };
  const ctx = {
    ZONA: 'America/Mexico_City',
    MimeType: { PDF: 'application/pdf' },
    Utilities: { base64Decode: (b) => Array.from(Buffer.from(b, 'base64')), newBlob: (bytes, mime, nombre) => ({ mime, nombre }), formatDate: () => '09 09' },
    DriveApp: { getFolderById: (id) => carpetas[id], Access: { DOMAIN: 'D' }, Permission: { VIEW: 'V' } },
    LineasUtil: { nuco4: (n) => (n ? String(n).padStart(4, '0') : null) },
    LineasArchivos: {
      reemplazarPdf: () => { throw new Error('no debe reemplazar'); }, olvidarNuco: () => {},
      enNucos: (id) => id === 'INSP1', exigirEscribible: (id) => escribibles.push(id),
      carpetaEvidenciaNuco: (tipo, nuco) => ({ carpetaId: 'NUEVA', nombrePdf: 'RESP ' + nuco + ' 15 08.pdf' }),
    },
    LineasDatos: { conCandado: (f) => f() },
    LineasRepo: { registrarMovimiento: () => {} },
  };
  vm.createContext(ctx);
  vm.runInContext(fuente + '\nthis.subirPdfFirmado = subirPdfFirmado;', ctx);
  const pdf = Buffer.from('%PDF-1.7 firmado').toString('base64');
  const usuario = { nombre: 'A' };
  // De NUCOS, con su carpeta "INSP 03 02" y sin PDF: ahí, con el nombre de la carpeta
  let r = ctx.subirPdfFirmado({ id: 'EQU-1', nuco: '12' }, { tipo: 'INSPECCION', id: 'drive_INSP1', origen: 'DRIVE', carpetaId: 'INSP1' }, pdf, usuario);
  assert.equal(r.nombre, 'INSP 0012 03 02.pdf');
  // Del AppSheet sin carpeta: una nueva del día en NUCOS
  r = ctx.subirPdfFirmado({ id: 'EQU-1', nuco: '12' }, { tipo: 'RESPONSIVA', id: 'R1', origen: 'APPSHEET', fecha: '2025-08-15T18:00:00Z' }, pdf, usuario);
  assert.equal(r.nombre, 'RESP 0012 15 08.pdf');
  assert.deepEqual(JSON.parse(JSON.stringify(creados)).map((c) => c.carpeta), ['INSP1', 'NUEVA']);
  assert.deepEqual(escribibles, ['INSP1', 'NUEVA']);
  assert.ok(creados.every((c) => c.mime === 'application/pdf'));
  // Sin NUCO no hay carpeta en NUCOS; del sistema sin PDF, primero se genera
  assert.throws(() => ctx.subirPdfFirmado({ id: 'LIN-1', nuco: '' }, { tipo: 'RESPONSIVA', id: 'R2', origen: 'APPSHEET' }, pdf, usuario), /no tiene NUCO/);
  assert.throws(() => ctx.subirPdfFirmado({ id: 'EQU-1', nuco: '12' }, { tipo: 'RESPONSIVA', id: 'R3', origen: 'SISTEMA' }, pdf, usuario), /Primero genera el PDF/);
});
