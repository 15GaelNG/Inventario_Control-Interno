// Adherente Vehicular (formato F-CI01-047): a diferencia de Responsiva Vehicular, NUNCA debe
// tocar VEHICULOS (el adherente se suma, no reemplaza al responsable), y sin la firma del
// adherente no se debe escribir nada (ni la fila, ni el PDF).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const VEHICULO_BASE = {
  ID: 'VEH-1', FOLIO: 'AUT0001', NUCCO: '00001', MARCA: 'NISSAN', CLASE: 'AUTOMOVIL',
  MODELO: '2023', COLOR: 'BLANCO', 'SERIE VEHICULO': 'VIN1', PLACA: 'ABC123',
  'RAZON SOCIAL': 'CIUDAD MADERAS', 'RESPONSABLE VEHICULO': 'JUAN PEREZ', 'NO EMPLEADO': '100',
  DEPARTAMENTO: 'VENTAS', SEDE: 'QRO', 'OFICINA / DESARROLLO': 'OF1',
};

function crearContexto() {
  const llamadas = { expediente: [], insert: [], update: [], actualizarVehiculo: [], imagenesSubidas: [] };
  const contexto = vm.createContext({
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS' }, DRIVE_FOLDERS: { REPORTES: () => 'FOLDER' } },
    Permisos: { puedeLeer: () => {}, puedeEditar: () => ({ nombre: 'TESTER', correo: 't@x.com' }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Ids: { nuevo: (prefijo) => prefijo + '-1' },
    Entidades: { prefijo: () => 'ADH' },
    Utilities: {
      formatDate: () => '1',
      base64Decode: (b64) => b64,
      newBlob: (bytes, mimeType, nombre) => ({ bytes, mimeType, nombre }),
    },
    DriveApp: {
      getFileById: (id) => ({ id }),
      getFolderById: (id) => ({
        createFile: (blob) => { llamadas.imagenesSubidas.push({ carpetaId: id, nombre: blob.nombre }); return { id: 'file-' + llamadas.imagenesSubidas.length }; },
      }),
    },
    DriveUtils: {
      compartirLoMasAmplioPosible: () => 'DOMAIN',
      marcarAutor: (archivo) => archivo,
      // Las carpetas se buscan por nombre en la raíz de la app: aquí el nombre hace de ID
      carpetaEnRaiz: (nombre) => ({
        getId: () => nombre,
        createFile: (blob) => { llamadas.imagenesSubidas.push({ carpeta: nombre, nombre: blob.nombre }); return { id: 'file-' + llamadas.imagenesSubidas.length }; },
      }),
    },
    SheetUtils: {
      getSheet: () => ({ getName: () => 'ADHERENTE VEHICULAR' }),
      insert: (ssId, hoja, fila) => { llamadas.insert.push(fila); },
      update: (ssId, hoja, id, cambios) => { llamadas.update.push({ id, cambios }); },
      remove: () => true,
      getAll: () => [],
      findById: () => null,
      leerColumnasDeHoja: () => ({ filas: 0, datos: {} }),
    },
    VehiculosService: {
      buscarPorFolio: () => Object.assign({}, VEHICULO_BASE),
      actualizar: (token, id, cambios) => { llamadas.actualizarVehiculo.push({ id, cambios }); },
    },
    ExpedienteNuco: {
      carpeta: (nucco, doc, sub) => { llamadas.expediente.push({ carpeta: [nucco, doc].concat(sub || []).join('/') }); return { getId: () => 'NUCO/' + [nucco, doc].concat(sub || []).join('/') }; },
      archivar: (archivo, nucco, doc, op) => { llamadas.expediente.push({ archivar: archivo.id, nucco, doc, adherente: !!(op && op.adherente) }); },
    },
    PdfService: {
      generar: (o) => { llamadas.pdfEn = o.carpetaId; return { fileId: 'pdf1', url: 'https://drive/x.pdf' }; },
      nombreArchivo: () => 'nombre',
      fechaParaNombre: () => '2026-10-06',
    },
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../src/services/AdherenteVehicularService.gs'), 'utf8') +
    '\nthis.Servicio = AdherenteVehicularService;',
    contexto
  );
  return { contexto, llamadas };
}

const FIRMA_OK = { 'FIRMA ADHERENTE': { base64: 'abc', mimeType: 'image/png' } };

test('sin la firma del adherente truena antes de escribir nada', () => {
  const { contexto, llamadas } = crearContexto();
  assert.throws(
    () => contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'MARIA LOPEZ' }, {}),
    /Falta la firma del adherente/
  );
  assert.deepEqual(llamadas.insert, []);
});

test('dar de alta un adherente nunca toca VEHICULOS, aunque el nombre sea el del responsable actual', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Juan Perez' }, FIRMA_OK);
  assert.equal(llamadas.insert.length, 1);
  assert.deepEqual(llamadas.actualizarVehiculo, []);
});

test('dar de alta un adherente distinto al responsable tampoco reasigna nada', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez', 'NO EMPLEADO': '200', DEPARTAMENTO: 'RH' }, FIRMA_OK);
  assert.equal(llamadas.insert.length, 1);
  assert.deepEqual(llamadas.actualizarVehiculo, []);
  assert.equal(llamadas.insert[0].ADHERENTE, 'Maria Lopez');
});

test('cada firma se respalda como imagen en la MISMA carpeta que usa Responsiva, sin ligarla en la hoja', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' },
    { 'FIRMA ADHERENTE': { base64: 'abc', mimeType: 'image/png' }, 'FIRMA JEFE': { base64: 'def', mimeType: 'image/png' } });
  assert.equal(llamadas.imagenesSubidas.length, 2);
  assert.ok(llamadas.imagenesSubidas.every((img) => img.carpeta === 'RESPONSIVAS VEHICULARES_Images'));
  assert.ok(!Object.keys(llamadas.insert[0]).some((k) => k.toUpperCase().indexOf('FIRMA') !== -1));
});

test('un adherente nuevo nace con ESTATUS ACTIVO', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' }, FIRMA_OK);
  assert.equal(llamadas.insert[0].ESTATUS, 'ACTIVO');
});

test('cambiarEstatus solo acepta ACTIVO o BAJA, y no toca nada más del registro', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.cambiarEstatus('tok', 'ADH-1', 'baja');
  assert.equal(llamadas.update.length, 1);
  assert.equal(llamadas.update[0].id, 'ADH-1');
  assert.equal(llamadas.update[0].cambios.ESTATUS, 'BAJA');
  assert.equal(Object.keys(llamadas.update[0].cambios).length, 1);
  assert.throws(() => contexto.Servicio.cambiarEstatus('tok', 'ADH-1', 'INACTIVO'), /Estatus inválido/);
});


test('el PDF se genera en el expediente del NUCO del vehículo y se archiva ahí (adherente)', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'MARIA LOPEZ' }, FIRMA_OK);
  assert.equal(llamadas.pdfEn, 'NUCO/00001/RESPONSIVA/ADHERENTES');
  assert.deepEqual(llamadas.expediente.filter((x) => x.archivar), [{ archivar: 'pdf1', nucco: '00001', doc: 'RESPONSIVA', adherente: true }]);
});
