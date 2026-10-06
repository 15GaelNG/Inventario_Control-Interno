// Responsiva Vehicular (formato F-CI01-045): el enganche con reasignación solo debe tocar
// VEHICULOS cuando el responsable que firma es distinto al actual, y sin la firma del
// responsable no se debe escribir nada (ni la fila de la responsiva, ni el PDF).
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
  const llamadas = { insert: [], update: [], actualizarVehiculo: [], imagenesSubidas: [] };
  const contexto = vm.createContext({
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS' }, DRIVE_FOLDERS: { REPORTES: () => 'FOLDER' } },
    Permisos: { puedeLeer: () => {}, puedeEditar: () => ({ nombre: 'TESTER', correo: 't@x.com' }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Ids: { nuevo: (prefijo) => prefijo + '-1' },
    Entidades: { prefijo: () => 'RSV' },
    Utilities: {
      formatDate: () => '1',
      base64Decode: (b64) => b64,
      newBlob: (bytes, mimeType, nombre) => ({ bytes, mimeType, nombre }),
    },
    DriveApp: {
      getFolderById: (id) => ({
        createFile: (blob) => { llamadas.imagenesSubidas.push({ carpetaId: id, nombre: blob.nombre }); return { id: 'file-' + llamadas.imagenesSubidas.length }; },
      }),
    },
    DriveUtils: { compartirLoMasAmplioPosible: () => 'DOMAIN' },
    SheetUtils: {
      getSheet: () => ({ getName: () => 'RESPONSIVA VEHICULAR' }),
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
    PdfService: {
      generar: () => ({ id: 'pdf1', nombre: 'r.pdf', url: 'https://drive/r.pdf' }),
      nombreArchivo: () => 'nombre',
      fechaParaNombre: () => '2026-10-05',
    },
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../src/services/ResponsivaVehicularService.gs'), 'utf8') +
    '\nthis.Servicio = ResponsivaVehicularService;',
    contexto
  );
  return { contexto, llamadas };
}

const FIRMA_OK = { 'FIRMA RESPONSABLE': { base64: 'abc', mimeType: 'image/png' } };

test('sin la firma del responsable truena antes de escribir nada', () => {
  const { contexto, llamadas } = crearContexto();
  assert.throws(
    () => contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'JUAN PEREZ' }, {}),
    /Falta la firma del responsable/
  );
  assert.deepEqual(llamadas.insert, []);
  assert.deepEqual(llamadas.actualizarVehiculo, []);
});

test('si el responsable que firma es el mismo que ya tiene el vehículo, no se reasigna', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' }, FIRMA_OK);
  assert.equal(llamadas.insert.length, 1);
  assert.deepEqual(llamadas.actualizarVehiculo, []);
});

test('si el responsable que firma es distinto, se reasigna el vehículo en la misma operación', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Maria Lopez', 'NO EMPLEADO': '200', DEPARTAMENTO: 'RH' }, FIRMA_OK);
  assert.equal(llamadas.insert.length, 1);
  assert.equal(llamadas.actualizarVehiculo.length, 1);
  assert.equal(llamadas.actualizarVehiculo[0].id, 'VEH-1');
  assert.equal(llamadas.actualizarVehiculo[0].cambios['RESPONSABLE VEHICULO'], 'Maria Lopez');
});

test('cada firma se respalda como imagen en la carpeta de imágenes, sin ligarla en la hoja', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA RESPONSABLE': { base64: 'abc', mimeType: 'image/png' }, 'FIRMA JEFE': { base64: 'def', mimeType: 'image/png' } });
  assert.equal(llamadas.imagenesSubidas.length, 2);
  assert.ok(llamadas.imagenesSubidas.every((img) => img.carpetaId === '12Zkdgdfiqv-jbVy-FPeGnNeucrCdIoPJ'));
  // La fila insertada no gana columnas de URL de firma -- solo queda en Drive.
  assert.ok(!Object.keys(llamadas.insert[0]).some((k) => k.toUpperCase().indexOf('FIRMA') !== -1));
});
