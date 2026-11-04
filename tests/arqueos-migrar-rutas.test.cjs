// ArqueosService.migrarRutasAUrls (15-oct-2026): los arqueos migrados de AppSheet (antes del
// 7-oct-2026) guardan en la hoja una ruta relativa ("ARQUEOS_Files_/archivo.pdf") en vez de una
// URL -- se resuelve al vuelo al abrirla desde la app (resolverArchivo), pero en la hoja misma se
// ve como texto plano, no como link (usuario, producción). Esta migración de una sola vez
// reescribe esas rutas por la URL real, en una sola llamada a Sheets (SheetUtils.updateMany) sin
// importar cuántos arqueos cambien.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function crearContexto(filasUber, urlsPorRuta) {
  const llamadas = { updateMany: [] };
  const hoja = (filasUber || []).map((f) => Object.assign({}, f));
  const contexto = vm.createContext({
    Config: {
      SPREADSHEET_IDS: { VEHICULOS: () => 'SS' },
      DRIVE_FOLDERS: { RAIZ: () => 'RAIZ-ID', ARQUEOS_HISTORICO: () => 'HISTORICO-ID' },
    },
    Permisos: {
      puedeLeer: () => {},
      puedeEditar: () => ({ nombre: 'TESTER' }),
    },
    DriveUtils: {
      // Mismo contrato que el real: ruta encontrada -> URL; si no, null (resolverRutaAUrl_ sigue
      // buscando en la otra raíz; aquí basta con una tabla fija ruta->url para las pruebas).
      urlDeRutaProfunda: (ruta) => (urlsPorRuta && urlsPorRuta[ruta]) || null,
    },
    SheetUtils: {
      getAll: () => hoja,
      updateMany: (ssId, nombreHoja, updates) => {
        llamadas.updateMany.push(updates);
        let cambiadas = 0;
        updates.forEach(({ id, changes }) => {
          const fila = hoja.find((f) => f['ID ARQUEO'] === id);
          if (fila) { Object.assign(fila, changes); cambiadas++; }
        });
        return cambiadas;
      },
    },
    HojaServicio: {},
    DriveApp: {},
    DocumentApp: {},
    LockService: {},
    ScriptApp: {},
    Session: {},
    Utilities: {},
    CapitalHumano: {},
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../src/services/ArqueosService.gs'), 'utf8') +
    '\nthis.Servicio = ArqueosService;',
    contexto
  );
  return { contexto, llamadas, hoja };
}

test('migrarRutasAUrls: reescribe una ruta vieja de AppSheet por la URL real', () => {
  const { contexto, llamadas, hoja } = crearContexto(
    [{ 'ID ARQUEO': '2026_225_001', EVIDENCIAS: 'ARQUEOS_Files_/2026_225_001.EVIDENCIAS.184031.pdf' }],
    { 'ARQUEOS_Files_/2026_225_001.EVIDENCIAS.184031.pdf': 'https://drive.google.com/file/d/ABC/view' },
  );
  const r = contexto.Servicio.migrarRutasAUrls();
  assert.equal(r.revisados, 1);
  assert.equal(r.actualizados, 1);
  assert.equal(r.noEncontrados.length, 0);
  assert.equal(hoja[0].EVIDENCIAS, 'https://drive.google.com/file/d/ABC/view');
  assert.equal(llamadas.updateMany.length, 1, 'todos los cambios van en una sola llamada');
});

test('migrarRutasAUrls: no toca lo que ya es una URL', () => {
  const { contexto, llamadas, hoja } = crearContexto([
    { 'ID ARQUEO': '2026_1_001', EVIDENCIAS: 'https://drive.google.com/file/d/YA-ES-URL/view' },
  ]);
  const r = contexto.Servicio.migrarRutasAUrls();
  assert.equal(r.actualizados, 0);
  assert.equal(hoja[0].EVIDENCIAS, 'https://drive.google.com/file/d/YA-ES-URL/view');
  assert.equal(llamadas.updateMany.length, 0, 'nada que cambiar no debe llamar a Sheets');
});

test('migrarRutasAUrls: una ruta que ya no existe en Drive se reporta, no truena, y no se toca', () => {
  const { contexto, hoja } = crearContexto([
    { 'ID ARQUEO': '2026_9_001', EVIDENCIAS: 'ARQUEOS_Files_/perdido.pdf' },
  ]);
  const r = contexto.Servicio.migrarRutasAUrls();
  assert.equal(r.actualizados, 0);
  assert.equal(r.noEncontrados.length, 1);
  assert.match(r.noEncontrados[0], /2026_9_001.*EVIDENCIAS.*perdido\.pdf/);
  assert.equal(hoja[0].EVIDENCIAS, 'ARQUEOS_Files_/perdido.pdf', 'se deja como estaba si no se encuentra');
});

test('migrarRutasAUrls: varias columnas y varios arqueos de un jalón, en una sola llamada', () => {
  const { contexto, llamadas, hoja } = crearContexto(
    [
      {
        'ID ARQUEO': '2026_222_001',
        'FIRMA RESPONSABLE': 'ARQUEOS_Images/2026_222_001.FIRMA RESPONSABLE.204553.png',
        'FIRMA ESPECIALISTA': 'ARQUEOS_Images/2026_222_001.FIRMA ESPECIALISTA.204553.png',
        EVIDENCIAS: 'ARQUEOS_Files_/2026_222_001.EVIDENCIAS.204553.pdf',
        'FORMATO ARQUEO': 'ARQUEOS/2026/ARQUEO2026_222_001.pdf',
      },
      { 'ID ARQUEO': '2026_8_001', EVIDENCIAS: 'ARQUEOS_Files_/2026_8_001.EVIDENCIAS.183404.pdf' },
    ],
    {
      'ARQUEOS_Images/2026_222_001.FIRMA RESPONSABLE.204553.png': 'https://drive/R',
      'ARQUEOS_Images/2026_222_001.FIRMA ESPECIALISTA.204553.png': 'https://drive/E',
      'ARQUEOS_Files_/2026_222_001.EVIDENCIAS.204553.pdf': 'https://drive/EV1',
      'ARQUEOS/2026/ARQUEO2026_222_001.pdf': 'https://drive/PDF',
      'ARQUEOS_Files_/2026_8_001.EVIDENCIAS.183404.pdf': 'https://drive/EV2',
    },
  );
  const r = contexto.Servicio.migrarRutasAUrls();
  assert.equal(r.revisados, 2);
  assert.equal(r.actualizados, 2);
  assert.equal(llamadas.updateMany.length, 1, 'los 2 arqueos van juntos en una sola llamada a Sheets');
  assert.equal(hoja[0]['FIRMA RESPONSABLE'], 'https://drive/R');
  assert.equal(hoja[0]['FIRMA ESPECIALISTA'], 'https://drive/E');
  assert.equal(hoja[0].EVIDENCIAS, 'https://drive/EV1');
  assert.equal(hoja[0]['FORMATO ARQUEO'], 'https://drive/PDF');
  assert.equal(hoja[1].EVIDENCIAS, 'https://drive/EV2');
});
