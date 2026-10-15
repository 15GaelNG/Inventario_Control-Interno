// Hologramas: la solicitud de un vehículo con NUCO va a su expediente (1.-DOCUMENTACIÓN/7.-HOLOGRAMAS, usuario 15-oct) y
// la hoja guarda la liga; un vehículo personal (sin NUCO) sigue en la carpeta de AppSheet con su ruta.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function cargar(vehiculos) {
  const llamadas = { insert: [], archivar: [], guardados: [] };
  const ctx = vm.createContext({
    console,
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS' }, DRIVE_FOLDERS: { HOLOGRAMAS_ARCHIVOS: () => 'HOL_FILES', HOLOGRAMAS_IMAGENES: () => 'HOL_IMG' } },
    Permisos: { puedeEditar: () => ({}), puedeLeer: () => ({}) },
    SheetUtils: {
      getAll: (ss, hoja) => (hoja === 'VEHICULOS' ? vehiculos : []),
      insert: (ss, hoja, fila) => { llamadas.insert.push(fila); },
    },
    HojaServicio: {
      nombreHoja: () => 'HOLOGRAMAS', fechaISO: (v) => v,
      renombrarRuta: (fileId, id, etiqueta, ruta) => 'HOLOGRAMAS_Files_/' + id + '_' + etiqueta + '.pdf',
    },
    Ids: { nuevo: () => 'HOL-1' },
    Entidades: { prefijo: () => 'HOL' },
    DriveUtils: {
      guardarArchivoAppSheet: (p) => { llamadas.guardados.push(p.carpetaId); return { fileId: 'F1', ruta: 'HOLOGRAMAS_Files_/x.pdf' }; },
      eliminar: () => {},
    },
    DriveApp: { getFileById: (id) => ({ getId: () => id, getUrl: () => 'https://drive.google.com/file/d/' + id + '/view' }) },
    ExpedienteNuco: {
      tieneNuco: (n) => /^\d+$/.test(String(n || '').trim()),
      archivar: (archivo, nucco, documento) => { llamadas.archivar.push([archivo.getId(), nucco, documento]); },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'HologramasService.gs'), 'utf8') +
    '\nthis.S = HologramasService;', ctx);
  return { S: ctx.S, llamadas };
}

const datos = (serie) => ({
  SERIE_VEHICULO: serie, PROVEEDOR: 'EOX', RAZON_SOCIAL: 'FRACCIONADORA LA ROMITA SA DE CV', PLACA: 'ABC123', MARCA: 'NISSAN',
  LINEA: 'NP300', MODELO: '2022', ESTATUS_EOX: 'HABILITADO', ESTATUS_VEHICULO: 'UTILITARIO', COMBUSTIBLE: 'MAGNA', CAPACIDAD: '80',
  RESPONSABLE: 'ANA', AUTORIZADO_PESOS: '1000', AUTORIZADO_LITROS: '40', CALCOMANIA: 'C-1',
});
const archivo = { base64: 'QUJD', mimeType: 'application/pdf', nombre: 's.pdf' };

test('con NUCO: la solicitud va a 7.-HOLOGRAMAS del expediente y la hoja guarda su liga', () => {
  const { S, llamadas } = cargar([{ ID: 'VEH-1', 'SERIE VEHICULO': 'SERIE1', NUCCO: '88', PLACA: 'ABC123' }]);
  S.registrar('t', datos('SERIE1'), archivo);
  assert.equal(JSON.stringify(llamadas.archivar), JSON.stringify([['F1', '88', 'HOLOGRAMA']]));
  assert.equal(llamadas.insert[0].SOLICITUD, 'https://drive.google.com/file/d/F1/view');
  assert.equal(llamadas.insert[0]['ID VEHICULO'], 'VEH-1');
});

test('sin NUCO (vehículo personal): la carpeta de AppSheet y la ruta de siempre', () => {
  const { S, llamadas } = cargar([]);
  S.registrar('t', Object.assign(datos('PERSONAL1'), { ESTATUS_VEHICULO: 'PERSONAL' }), archivo);
  assert.equal(llamadas.archivar.length, 0);
  assert.equal(llamadas.insert[0].SOLICITUD, 'HOLOGRAMAS_Files_/HOL-1_SOLICITUD.pdf');
});
