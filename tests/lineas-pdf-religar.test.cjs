// Pendiente 2.18 (NUCO 0726, 6-oct): alguien subió a mano en Drive un PDF con el mismo nombre y quitó el del sistema; el
// viejo quedó suelto («Necesitas acceso») y el libro seguía apuntando a él. El sistema usa el que sí está en la carpeta y
// lo vuelve a ligar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

/**
 * LineasArchivos con Drive simulado (servicio avanzado, 7-oct): `archivos` = { id: { parents, trashed } }, `carpetas` =
 * { id: [{ id, name }] }. Los PDF que lista una carpeta son los de `carpetas` más los de `archivos` que estén en ella y no
 * en la papelera.
 */
function archivosCon(archivos, carpetas, opciones) {
  const o = opciones || {};
  const pedidas = [];
  const ctx = vm.createContext({
    console,
    Drive: { Files: { list: (p) => {
      pedidas.push(p);
      if (o.fallaDrive) throw new Error('API call to drive.files.list failed');
      const ids = Array.from(p.q.matchAll(/'([^']+)' in parents/g)).map((m) => m[1]);
      const files = [];
      ids.forEach((c) => {
        (carpetas[c] || []).forEach((a) => files.push(Object.assign({ parents: [c] }, a)));
        Object.keys(archivos).forEach((id) => {
          const f = archivos[id];
          if (!f.trashed && (f.parents || []).indexOf(c) >= 0) files.push({ id: id, name: 'ligado.pdf', parents: f.parents });
        });
      });
      return { files: files };
    } } },
    leerConfig_: () => null,
  });
  vm.runInContext(read('src/services/lineas/LineasArchivos.gs') + '\nthis.A = LineasArchivos;', ctx);
  return { A: ctx.A, pedidas };
}

const VIEJO = { pdfId: 'VIEJO', carpetaId: 'INSP0510', nombre: 'INSP 0726 05 10.pdf', prefijo: 'INSP' };

test('el PDF que sigue en su carpeta no se cambia; se pregunta cada vez, sin recordarlo (prueba del 6-oct)', () => {
  const { A, pedidas } = archivosCon({ VIEJO: { parents: ['INSP0510'], trashed: false } }, {});
  assert.deepEqual(JSON.parse(JSON.stringify(A.pdfsFueraDeCarpeta([VIEJO]))), [null]);
  assert.equal(pedidas.length, 1, 'una consulta para todas las carpetas');
  A.pdfsFueraDeCarpeta([VIEJO]);
  assert.equal(pedidas.length, 2);
  assert.doesNotMatch(read('src/services/lineas/LineasArchivos.gs'), /UrlFetchApp\.fetch/);
  assert.doesNotMatch(read('src/services/lineas/LineasArchivos.gs').slice(read('src/services/lineas/LineasArchivos.gs').indexOf('function pdfsFueraDeCarpeta(')), /CacheService/);
});

test('NUCO 0726: el ligado quedó fuera de la carpeta; se elige el del mismo nombre que sí está', () => {
  const { A } = archivosCon(
    { VIEJO: { parents: ['RAIZ_CUENTA_APP'], trashed: false } },
    { INSP0510: [{ id: 'OTRO', name: 'INSP 0726 01 10.pdf' }, { id: 'NUEVO', name: 'INSP 0726 05 10.pdf' }] });
  const r = JSON.parse(JSON.stringify(A.pdfsFueraDeCarpeta([VIEJO])));
  assert.deepEqual(r, [{ id: 'NUEVO', nombre: 'INSP 0726 05 10.pdf' }]);
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

test('fuera de su carpeta y sin otro: no se cambia; si Drive falla truena (revisarPdfsLigados lo ignora)', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(archivosCon({}, { INSP0510: [] }).A.pdfsFueraDeCarpeta([VIEJO]))), [null]);
  assert.throws(() => archivosCon({}, {}, { fallaDrive: true }).A.pdfsFueraDeCarpeta([VIEJO]));
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
