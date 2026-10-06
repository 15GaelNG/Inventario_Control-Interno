// Pendiente 2.18 (NUCO 0726, 6-oct): alguien subió a mano en Drive un PDF con el mismo nombre y quitó el del sistema; el
// viejo quedó suelto («Necesitas acceso») y el libro seguía apuntando a él. El sistema usa el que sí está en la carpeta y
// lo vuelve a ligar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

/** LineasArchivos con Drive simulado: `archivos` = { id: { parents, trashed } } (sin entrada = 404), `carpetas` = { id: [{ id, name }] }. */
function archivosCon(archivos, carpetas, opciones) {
  const o = opciones || {};
  const cache = Object.assign({}, o.cache);
  const pedidas = [];
  const respuesta = (codigo, cuerpo) => ({ getResponseCode: () => codigo, getContentText: () => JSON.stringify(cuerpo) });
  const ctx = vm.createContext({
    console,
    CacheService: { getScriptCache: () => ({
      getAll: (claves) => { const r = {}; claves.forEach((k) => { if (cache[k]) r[k] = cache[k]; }); return r; },
      putAll: (valores) => Object.assign(cache, valores),
    }) },
    ScriptApp: { getOAuthToken: () => 'tok' },
    UrlFetchApp: { fetchAll: (lista) => lista.map((p) => {
      pedidas.push(p.url);
      if (o.fallaDrive) return respuesta(500, {});
      const m = p.url.match(/\/files\/([^?]+)\?/);
      if (m) {
        const f = archivos[decodeURIComponent(m[1])];
        return f ? respuesta(200, f) : respuesta(404, {});
      }
      const carpeta = decodeURIComponent(p.url).match(/'([^']+)' in parents/)[1];
      return respuesta(200, { files: carpetas[carpeta] || [] });
    }) },
    leerConfig_: () => null,
  });
  vm.runInContext(read('src/services/lineas/LineasArchivos.gs') + '\nthis.A = LineasArchivos;', ctx);
  return { A: ctx.A, cache, pedidas };
}

const VIEJO = { pdfId: 'VIEJO', carpetaId: 'INSP0510', nombre: 'INSP 0726 05 10.pdf', prefijo: 'INSP' };

test('el PDF que sigue en su carpeta no se cambia y se recuerda 10 min', () => {
  const { A, cache, pedidas } = archivosCon({ VIEJO: { parents: ['INSP0510'], trashed: false } }, {});
  assert.deepEqual(JSON.parse(JSON.stringify(A.pdfsFueraDeCarpeta([VIEJO]))), [null]);
  assert.equal(cache['ln_pdf_carpeta_VIEJO_INSP0510'], '1');
  assert.equal(pedidas.length, 1, 'no lista la carpeta');
  // Ya revisado: no vuelve a preguntar a Drive
  A.pdfsFueraDeCarpeta([VIEJO]);
  assert.equal(pedidas.length, 1);
});

test('NUCO 0726: el ligado quedó fuera de la carpeta; se elige el del mismo nombre que sí está', () => {
  const { A, cache } = archivosCon(
    { VIEJO: { parents: ['RAIZ_CUENTA_APP'], trashed: false } },
    { INSP0510: [{ id: 'OTRO', name: 'INSP 0726 01 10.pdf' }, { id: 'NUEVO', name: 'INSP 0726 05 10.pdf' }] });
  const r = JSON.parse(JSON.stringify(A.pdfsFueraDeCarpeta([VIEJO])));
  assert.deepEqual(r, [{ id: 'NUEVO', nombre: 'INSP 0726 05 10.pdf' }]);
  assert.equal(cache['ln_pdf_carpeta_VIEJO_INSP0510'], undefined, 'el que se cambia no se recuerda: lleva otro id');
});

test('borrado, en la papelera o sin acceso: sin uno del mismo nombre, el más reciente del formato (no otros PDF)', () => {
  const carpetas = { INSP0510: [{ id: 'INE', name: 'INE 0726.pdf' }, { id: 'FIRMADO', name: 'INSP 0726 5 10 firmado.pdf' }] };
  assert.deepEqual(JSON.parse(JSON.stringify(archivosCon({}, carpetas).A.pdfsFueraDeCarpeta([VIEJO]))), [{ id: 'FIRMADO', nombre: 'INSP 0726 5 10 firmado.pdf' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(archivosCon({ VIEJO: { parents: ['INSP0510'], trashed: true } }, carpetas).A.pdfsFueraDeCarpeta([VIEJO]))),
    [{ id: 'FIRMADO', nombre: 'INSP 0726 5 10 firmado.pdf' }]);
  // Responsiva: solo «RESP…»
  const resp = { pdfId: 'R1', carpetaId: 'RESP0510', nombre: 'RESP 0726 05 10.pdf', prefijo: 'RESP' };
  assert.deepEqual(JSON.parse(JSON.stringify(archivosCon({}, { RESP0510: [{ id: 'INE', name: 'INE 0726.pdf' }] }).A.pdfsFueraDeCarpeta([resp]))), [null]);
});

test('fuera de su carpeta y sin otro: no se cambia; si Drive falla, no se decide ni se recuerda', () => {
  const sinOtro = archivosCon({}, { INSP0510: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(sinOtro.A.pdfsFueraDeCarpeta([VIEJO]))), [null]);
  assert.equal(sinOtro.cache['ln_pdf_carpeta_VIEJO_INSP0510'], '1');
  const falla = archivosCon({}, {}, { fallaDrive: true });
  assert.deepEqual(JSON.parse(JSON.stringify(falla.A.pdfsFueraDeCarpeta([VIEJO]))), [null]);
  assert.deepEqual(falla.cache, {});
});

/** LineasRepo con hojas simuladas: solo lo que usa revisarPdfsLigados. */
function repoCon(nuevos) {
  const hechos = { escritos: [], revisados: null };
  const filaInsp = { ID: 'ILI-1', 'FORMATO INSPECCIONES LINEAS': 'https://drive.google.com/file/d/VIEJO/view' };
  const LineasDatos = {
    conCandado: (f) => f(), actualizarFila: (tabla, fila, o) => hechos.escritos.push([tabla, fila, o]),
    buscarFilasPorId: (tabla, id) => (id === 'ILI-1' ? [5] : []), leerFilas: () => [[filaInsp]],
  };
  const LineasArchivos = { pdfsFueraDeCarpeta: (lista) => { hechos.revisados = lista; return nuevos; } };
  const Repo = new Function('LineasUtil', 'LineasDatos', 'LineasChecklist', 'Utilities', 'LineasArchivos', 'console',
    read('src/services/lineas/LineasRepo.gs') + '\nreturn LineasRepo;')({ col: (f, c) => f[c] }, LineasDatos, {}, {}, LineasArchivos, { log: () => {}, warn: () => {} });
  return { Repo, hechos };
}

test('se vuelve a ligar: PDFS_JSON y la columna del PDF de la hoja; la vista ya muestra el bueno', () => {
  const { Repo, hechos } = repoCon([{ id: 'NUEVO', nombre: 'INSP 0726 05 10.pdf' }]);
  const ev = { origen: 'SISTEMA', tipo: 'INSPECCION', idRegistro: 'ILI-1', nuco: '0726', carpetaId: 'INSP0510', pdfs: [{ id: 'VIEJO', nombre: 'INSP 0726 05 10.pdf' }], _fila: 9 };
  Repo.revisarPdfsLigados([ev]);
  assert.deepEqual(hechos.revisados, [{ pdfId: 'VIEJO', carpetaId: 'INSP0510', nombre: 'INSP 0726 05 10.pdf', prefijo: 'INSP' }]);
  assert.deepEqual(ev.pdfs, [{ id: 'NUEVO', nombre: 'INSP 0726 05 10.pdf' }]);
  assert.equal(hechos.escritos[0][0], 'APP_EVIDENCIAS');
  assert.equal(hechos.escritos[0][1], 9);
  assert.equal(hechos.escritos[0][2].PDFS_JSON, JSON.stringify([{ id: 'NUEVO', nombre: 'INSP 0726 05 10.pdf' }]));
  assert.deepEqual(hechos.escritos[1], ['INSPECCIONES LINEAS', 5, { 'FORMATO INSPECCIONES LINEAS': 'https://drive.google.com/file/d/NUEVO/view' }]);
});

test('solo capturas del sistema con NUCO, carpeta y PDF; las del AppSheet y de Drive no se tocan', () => {
  const { Repo, hechos } = repoCon([]);
  Repo.revisarPdfsLigados([
    { origen: 'APPSHEET', nuco: '0726', carpetaId: 'C', pdfs: [{ id: 'P' }] },
    { origen: 'DRIVE', nuco: '0726', carpetaId: 'C', pdfs: [{ id: 'P' }] },
    { origen: 'SISTEMA', nuco: '', carpetaId: 'C', pdfs: [{ id: 'P' }] },
    { origen: 'SISTEMA', nuco: '0726', carpetaId: '', pdfs: [{ id: 'P' }] },
    { origen: 'SISTEMA', nuco: '0726', carpetaId: 'C', pdfs: [] },
  ]);
  assert.equal(hechos.revisados, null);
  assert.equal(hechos.escritos.length, 0);
});

test('se revisa en Documentos, en la página del documento, en el Historial y antes de Regenerar o Subir PDF firmado', () => {
  const repo = read('src/services/lineas/LineasRepo.gs');
  const tramo = (desde, hasta) => repo.slice(repo.indexOf(desde), repo.indexOf(hasta, repo.indexOf(desde)));
  assert.match(tramo('function evidenciasDeRegistro(', 'return { inspecciones'), /revisarPdfsLigados\(evidencias\);/);
  assert.match(tramo('function leerInspeccion(', 'function leerResponsiva('), /if \(ev\) revisarPdfsLigados\(\[ev\]\);/);
  assert.match(tramo('function leerResponsiva(', 'const MOVIMIENTO_POR_CAMPO'), /if \(ev\) revisarPdfsLigados\(\[ev\]\);/);
  const captura = read('src/services/lineas/LineasCaptura.gs');
  assert.match(captura.slice(captura.indexOf('function evidenciaSistema_('), captura.indexOf('function registroPlantilla_(')), /LineasRepo\.revisarPdfsLigados\(\[ev\]\);/);
  // Subir PDF firmado toma el PDF de Documentos (evidencias → evidenciasDeRegistro)
  assert.match(read('src/services/TelefoniaService.gs'), /const docs = evidencias\(token, registroId\);/);
});
