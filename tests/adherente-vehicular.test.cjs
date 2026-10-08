// Adherente Vehicular (formato F-CI01-047): a diferencia de Responsiva Vehicular, NUNCA debe
// tocar VEHICULOS (el adherente se suma, no reemplaza al responsable), y sin la firma del
// adherente ni la de quien entrega no se debe escribir nada (ni la fila, ni el PDF). El
// adherente y el jefe pueden firmar cada quien por su propia liga, independiente uno del otro
// -- el PDF se genera hasta que TODAS las ligas que se mandaron se completen.
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
  const llamadas = { insert: [], update: [], actualizarVehiculo: [], imagenesSubidas: [], pdfGenerados: 0, vistasPrevias: 0 };
  let uuids = 0;
  const contexto = vm.createContext({
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS' }, DRIVE_FOLDERS: { REPORTES: () => 'FOLDER' }, urlFirmaPublica: () => '' },
    Permisos: { puedeLeer: () => {}, puedeEditar: () => ({ nombre: 'TESTER', correo: 't@x.com' }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Ids: { nuevo: (prefijo) => prefijo + '-1' },
    Entidades: { prefijo: () => 'ADH' },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/exec' }) },
    Session: { getActiveUser: () => ({ getEmail: () => 'firmante@ciudadmaderas.com' }) },
    Utilities: {
      formatDate: () => '1',
      base64Decode: (b64) => b64,
      newBlob: (bytes, mimeType, nombre) => ({ bytes, mimeType, nombre }),
      getUuid: () => 'token-' + (++uuids),
    },
    DriveApp: {
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
      // Igual que el SheetUtils.update real (lee-mezcla-escribe): así una llamada después sí
      // ve ESTADO FIRMA/TOKEN FIRMA ya actualizados -- necesario para probar que una liga usada
      // dos veces truena la segunda, y que las dos ligas independientes se ven una a la otra.
      update: (ssId, hoja, id, cambios) => {
        llamadas.update.push({ id, cambios });
        const fila = llamadas.insert.find((f) => f.ID === id);
        if (fila) Object.assign(fila, cambios);
      },
      remove: () => true,
      getAll: () => llamadas.insert,
      findById: () => null,
      leerColumnasDeHoja: () => ({ filas: 0, datos: {} }),
    },
    VehiculosService: {
      buscarPorFolio: () => Object.assign({}, VEHICULO_BASE),
      actualizar: (token, id, cambios) => { llamadas.actualizarVehiculo.push({ id, cambios }); },
    },
    PdfService: {
      generar: () => { llamadas.pdfGenerados++; return { id: 'pdf1', nombre: 'a.pdf', url: 'https://drive/a.pdf' }; },
      generarVistaPrevia: (p) => { llamadas.vistasPrevias++; return { base64: 'pdf-bytes', mimeType: 'application/pdf', imagenes: p.imagenes }; },
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

const FIRMA_ADHERENTE = { base64: 'abc', mimeType: 'image/png' };
const FIRMA_JEFE = { base64: 'jefe', mimeType: 'image/png' };
const FIRMA_CI = { base64: 'ci', mimeType: 'image/png' };
const FIRMA_OK = { 'FIRMA ADHERENTE': FIRMA_ADHERENTE, 'FIRMA CI': FIRMA_CI };

// Columnas que SIEMPRE se insertan (metadatos del flujo de firma, nunca la firma en sí) --
// las únicas con "FIRMA" en el nombre que un renglón normal debe traer.
const METADATO = [
  'ESTADO FIRMA', 'TOKEN FIRMA', 'TOKEN FIRMA EXPIRA', 'TOKEN FIRMA JEFE', 'TOKEN FIRMA JEFE EXPIRA',
  'FIRMADO POR', 'FIRMADO POR JEFE', 'FIRMA ADHERENTE TEMP', 'FIRMA JEFE TEMP', 'FIRMA CI TEMP',
];

test('sin la firma del adherente truena antes de escribir nada', () => {
  const { contexto, llamadas } = crearContexto();
  assert.throws(
    () => contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'MARIA LOPEZ' }, { 'FIRMA CI': FIRMA_CI }),
    /Falta la firma del adherente/
  );
  assert.deepEqual(llamadas.insert, []);
});

test('sin la firma de quien entrega truena antes de escribir nada (presencial, remoto o remotoJefe)', () => {
  const { contexto, llamadas } = crearContexto();
  assert.throws(
    () => contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'MARIA LOPEZ' }, { 'FIRMA ADHERENTE': FIRMA_ADHERENTE }),
    /Falta la firma de quien entrega/
  );
  assert.throws(
    () => contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'MARIA LOPEZ' }, {}, { remoto: true }),
    /Falta la firma de quien entrega/
  );
  assert.throws(
    () => contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'MARIA LOPEZ' }, { 'FIRMA ADHERENTE': FIRMA_ADHERENTE }, { remotoJefe: true }),
    /Falta la firma de quien entrega/
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

test('presencial: cada firma se respalda en la MISMA carpeta que usa Responsiva, sin ligarla en la hoja', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' },
    { 'FIRMA ADHERENTE': FIRMA_ADHERENTE, 'FIRMA JEFE': FIRMA_JEFE, 'FIRMA CI': FIRMA_CI });
  assert.equal(llamadas.imagenesSubidas.length, 3);
  assert.ok(llamadas.imagenesSubidas.every((img) => img.carpeta === 'RESPONSIVAS VEHICULARES_Images'));
  const otrasColumnas = Object.keys(llamadas.insert[0]).filter((k) => METADATO.indexOf(k) === -1);
  assert.ok(!otrasColumnas.some((k) => k.toUpperCase().indexOf('FIRMA') !== -1));
  assert.equal(llamadas.insert[0]['FIRMA JEFE TEMP'], '');
  assert.equal(llamadas.insert[0]['FIRMA CI TEMP'], '');
  assert.equal(llamadas.insert[0]['FIRMA ADHERENTE TEMP'], '');
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

// ---------- Firma a distancia: liga del ADHERENTE (opciones.remoto) ----------

test('remoto: no exige la firma del adherente (CI sigue siendo obligatoria), no genera PDF, y nunca toca VEHICULOS', () => {
  const { contexto, llamadas } = crearContexto();
  const res = contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' }, { 'FIRMA CI': FIRMA_CI }, { remoto: true });
  assert.equal(llamadas.insert.length, 1);
  assert.equal(llamadas.insert[0]['ESTADO FIRMA'], 'PENDIENTE');
  assert.ok(llamadas.insert[0]['TOKEN FIRMA']);
  assert.equal(llamadas.insert[0]['TOKEN FIRMA JEFE'], '');
  assert.ok(llamadas.insert[0]['FIRMA CI TEMP']);
  assert.equal(llamadas.pdfGenerados, 0);
  assert.deepEqual(llamadas.actualizarVehiculo, []);
  assert.ok(res.liga.includes('tipo=adherente'));
  assert.ok(!res.liga.includes('quien=jefe'));
  assert.ok(res.liga.includes(llamadas.insert[0]['TOKEN FIRMA']));
  assert.ok(!res.ligaJefe);
});

test('vistaPrevia (liga del adherente): el PDF sin guardar, con las firmas TEMP ya puestas y sin la del adherente todavía', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' },
    { 'FIRMA CI': FIRMA_CI, 'FIRMA JEFE': FIRMA_JEFE }, { remoto: true });
  const res = contexto.Servicio.vistaPrevia(llamadas.insert[0]['TOKEN FIRMA']);
  assert.equal(llamadas.vistasPrevias, 1);
  assert.equal(llamadas.pdfGenerados, 0);
  assert.equal(res.base64, 'pdf-bytes');
  assert.ok(res.imagenes['FIRMA JEFE']);
  assert.ok(res.imagenes['FIRMA CI']);
  assert.ok(!res.imagenes['FIRMA ADHERENTE']);
});

test('completarFirma: token inválido/vencido truena; sin liga de Jefe pendiente genera el PDF de una vez y limpia el token', () => {
  const { contexto, llamadas } = crearContexto();
  assert.throws(() => contexto.Servicio.completarFirma('no-existe', { base64: 'x', mimeType: 'image/png' }), /liga no es válida/);

  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' },
    { 'FIRMA CI': FIRMA_CI, 'FIRMA JEFE': FIRMA_JEFE }, { remoto: true });
  const token = llamadas.insert[0]['TOKEN FIRMA'];

  llamadas.insert[0]['TOKEN FIRMA EXPIRA'] = new Date(Date.now() - 1000);
  assert.throws(() => contexto.Servicio.completarFirma(token, { base64: 'x', mimeType: 'image/png' }), /venció/);
  llamadas.insert[0]['TOKEN FIRMA EXPIRA'] = new Date(Date.now() + 1000 * 60 * 60);

  const res = contexto.Servicio.completarFirma(token, { base64: 'firmo-aqui', mimeType: 'image/png' });
  assert.equal(llamadas.pdfGenerados, 1);
  assert.equal(res.PDF, 'https://drive/a.pdf');
  assert.ok(!res.pendiente);
  assert.equal(llamadas.imagenesSubidas.length, 3);   // la que llegó por la liga + Jefe y CI (TEMP)
  const cambios = llamadas.update[llamadas.update.length - 1].cambios;
  assert.equal(cambios['ESTADO FIRMA'], 'FIRMADO');
  assert.equal(cambios['TOKEN FIRMA'], '');
  assert.equal(cambios['FIRMADO POR'], 'firmante@ciudadmaderas.com');

  // El TOKEN FIRMA ya se limpió (de un solo uso): repetirlo ya no encuentra el renglón.
  assert.throws(() => contexto.Servicio.completarFirma(token, { base64: 'x', mimeType: 'image/png' }), /no es válida/);
});

test('completarFirma: si TAMBIÉN hay una liga de Jefe pendiente, solo se guarda y se espera (sin PDF)', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' }, { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const token = llamadas.insert[0]['TOKEN FIRMA'];
  const res = contexto.Servicio.completarFirma(token, { base64: 'firmo-aqui', mimeType: 'image/png' });
  assert.equal(llamadas.pdfGenerados, 0);
  assert.equal(res.pendiente, true);
  assert.match(res.aviso, /jefe directo/);
  assert.ok(llamadas.insert[0]['TOKEN FIRMA JEFE']);
});

test('ligaDeToken: arma la misma liga que crear() para cada token, siempre del lado del servidor', () => {
  const { contexto, llamadas } = crearContexto();
  const res = contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const token = llamadas.insert[0]['TOKEN FIRMA'];
  const tokenJefe = llamadas.insert[0]['TOKEN FIRMA JEFE'];
  assert.equal(contexto.Servicio.ligaDeToken('tok', token, 'principal'), res.liga);
  assert.equal(contexto.Servicio.ligaDeToken('tok', tokenJefe, 'jefe'), res.ligaJefe);
});

test('la liga usa el despliegue público si está configurado (Config.urlFirmaPublica), en vez del despliegue normal', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Config.urlFirmaPublica = () => 'https://script.google.com/macros/s/PUBLICO/exec';
  const res = contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true });
  assert.ok(res.liga.startsWith('https://script.google.com/macros/s/PUBLICO/exec'));
});

// ---------- Firma a distancia: liga del JEFE (opciones.remotoJefe) ----------

test('remotoJefe: exige la firma del adherente AHORA, nunca toca VEHICULOS, y genera una liga aparte para el jefe', () => {
  const { contexto, llamadas } = crearContexto();
  assert.throws(
    () => contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' }, { 'FIRMA CI': FIRMA_CI }, { remotoJefe: true }),
    /Falta la firma del adherente/
  );
  const res = contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' },
    { 'FIRMA ADHERENTE': FIRMA_ADHERENTE, 'FIRMA CI': FIRMA_CI }, { remotoJefe: true });
  assert.equal(llamadas.insert.length, 1);
  assert.equal(llamadas.insert[0]['ESTADO FIRMA'], 'PENDIENTE');
  assert.ok(llamadas.insert[0]['TOKEN FIRMA JEFE']);
  assert.ok(JSON.parse(llamadas.insert[0]['FIRMA ADHERENTE TEMP']).base64, 'abc');
  assert.equal(llamadas.pdfGenerados, 0);
  assert.deepEqual(llamadas.actualizarVehiculo, []);
  assert.ok(res.ligaJefe.includes('tipo=adherente'));
  assert.ok(res.ligaJefe.includes('quien=jefe'));
  assert.ok(!res.liga);
});

test('completarFirmaJefe: sin liga del adherente pendiente, genera el PDF de una vez', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' },
    { 'FIRMA ADHERENTE': FIRMA_ADHERENTE, 'FIRMA CI': FIRMA_CI }, { remotoJefe: true });
  const tokenJefe = llamadas.insert[0]['TOKEN FIRMA JEFE'];
  const res = contexto.Servicio.completarFirmaJefe(tokenJefe, { base64: 'firma-jefe-remota', mimeType: 'image/png' });
  assert.equal(llamadas.pdfGenerados, 1);
  assert.equal(res.PDF, 'https://drive/a.pdf');
  assert.equal(llamadas.imagenesSubidas.length, 3);   // Adherente (TEMP) + CI (TEMP) + Jefe
  const cambios = llamadas.update[llamadas.update.length - 1].cambios;
  assert.equal(cambios['FIRMADO POR JEFE'], 'firmante@ciudadmaderas.com');
});

test('las dos ligas, cada una completada por su lado, terminan generando el PDF una sola vez', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' }, { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const token = llamadas.insert[0]['TOKEN FIRMA'];
  const tokenJefe = llamadas.insert[0]['TOKEN FIRMA JEFE'];

  const primero = contexto.Servicio.completarFirma(token, { base64: 'adherente', mimeType: 'image/png' });
  assert.equal(primero.pendiente, true);
  assert.equal(llamadas.pdfGenerados, 0);

  const segundo = contexto.Servicio.completarFirmaJefe(tokenJefe, { base64: 'jefe', mimeType: 'image/png' });
  assert.ok(!segundo.pendiente);
  assert.equal(llamadas.pdfGenerados, 1);
  assert.equal(llamadas.imagenesSubidas.length, 3);

  assert.throws(() => contexto.Servicio.completarFirma(token, { base64: 'x', mimeType: 'image/png' }), /no es válida/);
  assert.throws(() => contexto.Servicio.completarFirmaJefe(tokenJefe, { base64: 'x', mimeType: 'image/png' }), /no es válida/);
});
