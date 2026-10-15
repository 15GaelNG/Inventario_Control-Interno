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
  const llamadas = { expediente: [], pdfEn: null, insert: [], update: [], actualizarVehiculo: [], imagenesSubidas: [], pdfGenerados: 0, vistasPrevias: 0 };
  let uuids = 0;
  // Drive falso para las firmas TEMP (guardarFirmaTemp_/leerFirmaTemp_): guarda el "contenido"
  // (aquí, el base64 tal cual -- base64Decode/base64Encode son identidad) para que lo que se lee
  // de vuelta sea lo mismo que se guardó, igual que en Drive real.
  const archivosDrive = {};
  let contadorArchivos = 0;
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
      base64Encode: (bytes) => bytes,
      newBlob: (bytes, mimeType, nombre) => ({ bytes, mimeType, nombre }),
      getUuid: () => 'token-' + (++uuids),
    },
    DriveApp: {
      getFileById: (id) => ({
        id,
        getId: () => id,
        getBlob: () => ({ getBytes: () => (archivosDrive[id] || {}).bytes }),
        setTrashed: (v) => { if (archivosDrive[id]) archivosDrive[id].trashed = v; },
      }),
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
        createFile: (blob) => {
          const id = 'file-' + (++contadorArchivos);
          archivosDrive[id] = { bytes: blob.bytes, trashed: false };
          llamadas.imagenesSubidas.push({ carpeta: nombre, nombre: blob.nombre });
          return { id, getId: () => id, setTrashed: (v) => { archivosDrive[id].trashed = v; } };
        },
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
      // Mismo "lee-mezcla-escribe" que update: para que regenerarLiga encuentre el renglón
      // recién insertado/actualizado por su ID.
      findById: (ssId, hoja, id) => {
        const fila = llamadas.insert.find((f) => f.ID === id);
        return fila ? { data: fila, rowIndex: 2 } : null;
      },
      leerColumnasDeHoja: () => ({ filas: 0, datos: {} }),
    },
    VehiculosService: {
      buscar: () => Object.assign({}, VEHICULO_BASE),
      actualizar: (token, id, cambios) => { llamadas.actualizarVehiculo.push({ id, cambios }); },
    },
    ExpedienteNuco: {
      carpeta: (nucco, doc, sub) => ({ getId: () => 'NUCO/' + [nucco, doc].concat(sub || []).join('/') }),
      FIRMAS: 'FIRMAS',
      tieneNuco: (n) => /^[0-9]+$/.test(String(n == null ? '' : n).trim()),
      // El respaldo final de cada firma: al expediente del NUCO (5.-RESPONSIVA/FIRMAS)
      guardar: (blob, carpeta, prefijo) => {
        llamadas.imagenesSubidas.push({ carpeta: carpeta.getId(), nombre: prefijo });
        return { getId: () => 'firma-' + llamadas.imagenesSubidas.length };
      },
      archivar: (archivo, nucco, doc, op) => { llamadas.expediente.push({ archivar: archivo.id, nucco, doc, adherente: !!(op && op.adherente) }); },
    },
    PdfService: {
      generar: (o) => { llamadas.pdfGenerados++; llamadas.pdfEn = o.carpetaId; llamadas.imagenesPdf = o.imagenes; return { id: 'pdf1', fileId: 'pdf1', nombre: 'a.pdf', url: 'https://drive/a.pdf' }; },
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
  return { contexto, llamadas, archivosDrive };
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
  assert.ok(llamadas.imagenesSubidas.every((img) => img.carpeta === 'NUCO/00001/RESPONSIVA/FIRMAS'), 'el respaldo de cada firma va al expediente del NUCO');
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

test('cambiarEstatus solo acepta ACTIVO o BAJA, y no toca nada más del registro (sin firmas viejas que migrar)', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' }, FIRMA_OK);
  const id = llamadas.insert[0].ID;

  contexto.Servicio.cambiarEstatus('tok', id, 'baja');

  const ultimoUpdate = llamadas.update[llamadas.update.length - 1];
  assert.equal(ultimoUpdate.id, id);
  assert.equal(ultimoUpdate.cambios.ESTATUS, 'BAJA');
  assert.equal(Object.keys(ultimoUpdate.cambios).length, 1, 'nada que migrar -- no agrega ninguna otra columna');
  assert.throws(() => contexto.Servicio.cambiarEstatus('tok', id, 'INACTIVO'), /Estatus inválido/);
});

test('cambiarEstatus truena si el registro no existe', () => {
  const { contexto } = crearContexto();
  assert.throws(() => contexto.Servicio.cambiarEstatus('tok', 'NO-EXISTE', 'BAJA'), /No se encontró/);
});

test('cambiarEstatus: si alguna firma …TEMP se quedó con el base64 crudo de antes del 9-oct, la migra a Drive al guardar -- se puede dar de baja con la firma todavía PENDIENTE', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const id = llamadas.insert[0].ID;
  assert.equal(llamadas.insert[0]['ESTADO FIRMA'], 'PENDIENTE', 'se da de baja antes de que termine de firmarse');
  // Simula un renglón viejo: la firma de CI quedó con el formato de antes del arreglo del 9-oct.
  llamadas.insert[0]['FIRMA CI TEMP'] = JSON.stringify({ base64: 'w'.repeat(200000), mimeType: 'image/jpeg' });

  const res = contexto.Servicio.cambiarEstatus('tok', id, 'baja');

  assert.equal(res.ESTATUS, 'BAJA');
  const migrada = JSON.parse(llamadas.insert[0]['FIRMA CI TEMP']);
  assert.ok(migrada.archivoId, 'la firma de CI quedó migrada a archivo de Drive');
  assert.ok(!migrada.base64, 'el base64 crudo ya no vive en la celda');
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

test('retrocompatibilidad: una liga pendiente creada ANTES de este arreglo (base64 directo en TEMP, sin archivoId) se completa igual', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' }, { 'FIRMA CI': FIRMA_CI }, { remoto: true });
  // Simula lo que dejó el código viejo antes de desplegar este arreglo: el base64 directo en la
  // celda (sin archivoId), de una firma de Jefe que ya había llegado presencial.
  llamadas.insert[0]['FIRMA JEFE TEMP'] = JSON.stringify({ base64: 'jefe-de-antes-del-arreglo', mimeType: 'image/png' });
  const token = llamadas.insert[0]['TOKEN FIRMA'];
  const res = contexto.Servicio.completarFirma(token, { base64: 'respondio-despues-del-arreglo', mimeType: 'image/png' });
  assert.ok(!res.pendiente);
  assert.equal(llamadas.pdfGenerados, 1);
  // La firma vieja (sin archivoId) sí llegó al PDF -- antes de este arreglo se habría perdido
  // en silencio.
  assert.equal(llamadas.imagenesPdf['FIRMA JEFE'].base64, 'jefe-de-antes-del-arreglo');
  assert.equal(llamadas.imagenesPdf['FIRMA ADHERENTE'].base64, 'respondio-despues-del-arreglo');
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
  // 2 temporales al crear (Jefe + CI) + 1 temporal al completar (la que acaba de llegar) + 3
  // respaldos finales (Adherente/Jefe/CI) al generar el PDF = 6.
  assert.equal(llamadas.imagenesSubidas.length, 6);
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

// ---------------------------------------------------------------------------- regenerarLiga ("Generar nueva liga")

test('regenerarLiga: token distinto al anterior, expira +15 días, y la liga coincide con ligaDeToken del token nuevo', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const id = llamadas.insert[0].ID;
  const tokenViejo = llamadas.insert[0]['TOKEN FIRMA'];

  const ahora = Date.now();
  const liga = contexto.Servicio.regenerarLiga('tok', id, 'principal');

  const tokenNuevo = llamadas.insert[0]['TOKEN FIRMA'];
  assert.notEqual(tokenNuevo, tokenViejo);
  assert.equal(liga, contexto.Servicio.ligaDeToken('tok', tokenNuevo, 'principal'));
  const expira = new Date(llamadas.insert[0]['TOKEN FIRMA EXPIRA']).getTime();
  assert.ok(expira > ahora + 14 * 24 * 60 * 60 * 1000 && expira <= ahora + 15 * 24 * 60 * 60 * 1000 + 1000);
});

test('regenerarLiga: también funciona del lado del jefe, sin tocar el token del adherente', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const id = llamadas.insert[0].ID;
  const tokenAdherente = llamadas.insert[0]['TOKEN FIRMA'];

  contexto.Servicio.regenerarLiga('tok', id, 'jefe');

  assert.equal(llamadas.insert[0]['TOKEN FIRMA'], tokenAdherente, 'no toca el token del adherente');
});

test('regenerarLiga: truena si la firma ya se completó (ESTADO FIRMA ya no PENDIENTE)', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' },
    { 'FIRMA ADHERENTE': FIRMA_ADHERENTE, 'FIRMA JEFE': FIRMA_JEFE, 'FIRMA CI': FIRMA_CI });
  const id = llamadas.insert[0].ID;
  assert.throws(() => contexto.Servicio.regenerarLiga('tok', id, 'principal'), /ya se completó/);
});

test('regenerarLiga: truena si el registro no existe', () => {
  const { contexto } = crearContexto();
  assert.throws(() => contexto.Servicio.regenerarLiga('tok', 'NO-EXISTE', 'principal'), /No se encontró/);
});

test('regenerarLiga: revisa permiso de edición antes de tocar nada', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' }, { 'FIRMA CI': FIRMA_CI }, { remoto: true });
  const id = llamadas.insert[0].ID;
  let pedido = null;
  contexto.Permisos.puedeEditar = (token, modulo) => { pedido = modulo; return { nombre: 'TESTER', correo: 't@x.com' }; };
  contexto.Servicio.regenerarLiga('tok', id, 'principal');
  assert.equal(pedido, 'adherente-vehicular');
});

test('regenerarLiga: si esa parte ya firmó MAL y la otra sigue pendiente, se puede regenerar -- descarta la firma anterior', () => {
  const { contexto, llamadas, archivosDrive } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const id = llamadas.insert[0].ID;
  const tokenAdherente = llamadas.insert[0]['TOKEN FIRMA'];
  contexto.Servicio.completarFirma(tokenAdherente, { base64: 'firmo-mal', mimeType: 'image/png' });
  assert.equal(llamadas.insert[0]['ESTADO FIRMA'], 'PENDIENTE', 'el jefe todavía no firma -- el documento sigue abierto');
  assert.ok(llamadas.insert[0]['FIRMA ADHERENTE TEMP'], 'la firma mala quedó guardada');
  const archivoFirmaMala = JSON.parse(llamadas.insert[0]['FIRMA ADHERENTE TEMP']).archivoId;

  contexto.Servicio.regenerarLiga('tok', id, 'principal');

  assert.ok(llamadas.insert[0]['TOKEN FIRMA'], 'token nuevo generado');
  assert.equal(llamadas.insert[0]['FIRMA ADHERENTE TEMP'], '', 'la firma mala se descarta');
  assert.equal(llamadas.insert[0]['FIRMADO POR'], '', 'ya no hay quién la firmó -- hay que volver a firmar');
  assert.equal(archivosDrive[archivoFirmaMala].trashed, true, 'el archivo de Drive de la firma mala también se tira');
});

test('regenerarLiga: truena si esa parte firmó presencial (nunca tuvo liga) -- no hay nada que regenerar', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' },
    { 'FIRMA JEFE': FIRMA_JEFE, 'FIRMA CI': FIRMA_CI }, { remoto: true });
  const id = llamadas.insert[0].ID;
  assert.equal(llamadas.insert[0]['ESTADO FIRMA'], 'PENDIENTE');
  assert.throws(() => contexto.Servicio.regenerarLiga('tok', id, 'jefe'), /firmó presencial/);
  assert.ok(llamadas.insert[0]['FIRMA JEFE TEMP'], 'su firma presencial sigue intacta -- no se tocó');
});

test('regenerarLiga: si OTRA columna …TEMP se quedó con el base64 crudo de antes del arreglo del 9-oct, la migra a Drive al guardar (si no, reescribir el renglón para cambiar solo el token puede tronar el límite de 50000 por celda -- bug real, 14-oct-2026)', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const id = llamadas.insert[0].ID;
  // Simula un renglón viejo: el adherente ya firmó, pero con el formato de ANTES del arreglo
  // del 9-oct (el base64 crudo directo en la celda, no el JSON con archivoId de guardarFirmaTemp_).
  llamadas.insert[0]['TOKEN FIRMA'] = '';
  llamadas.insert[0]['FIRMADO POR'] = 'adherente@ciudadmaderas.com';
  llamadas.insert[0]['FIRMA ADHERENTE TEMP'] = JSON.stringify({ base64: 'x'.repeat(200000), mimeType: 'image/jpeg' });

  const liga = contexto.Servicio.regenerarLiga('tok', id, 'jefe');

  assert.ok(liga, 'no truena generando la liga del jefe, aunque la del adherente siga en el formato viejo');
  const migrada = JSON.parse(llamadas.insert[0]['FIRMA ADHERENTE TEMP']);
  assert.ok(migrada.archivoId, 'se migró a archivo de Drive -- ya no es base64 crudo en la celda');
  assert.ok(!migrada.base64, 'el base64 crudo ya no vive en la celda');
});

test('completarFirma: si la firma de CI (capturada en persona al crear) sigue con el base64 crudo de antes del 9-oct, se migra al guardar el "falta la firma del jefe", sin tronar', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const id = llamadas.insert[0].ID;
  const tokenAdherente = llamadas.insert[0]['TOKEN FIRMA'];
  // Simula que este renglón es viejo: la firma de CI, capturada en persona al crear, quedó
  // guardada con el formato de ANTES del arreglo del 9-oct (base64 crudo en la celda).
  llamadas.insert[0]['FIRMA CI TEMP'] = JSON.stringify({ base64: 'z'.repeat(200000), mimeType: 'image/jpeg' });

  const resultado = contexto.Servicio.completarFirma(tokenAdherente, { base64: 'firma-adherente', mimeType: 'image/png' });

  assert.equal(resultado.pendiente, true, 'el jefe sigue sin firmar -- no debe tronar aunque CI siga en el formato viejo');
  const migrada = JSON.parse(llamadas.insert[0]['FIRMA CI TEMP']);
  assert.ok(migrada.archivoId, 'la firma de CI también quedó migrada a archivo de Drive');
  assert.ok(!migrada.base64, 'el base64 crudo ya no vive en la celda');
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
  assert.ok(JSON.parse(llamadas.insert[0]['FIRMA ADHERENTE TEMP']).archivoId);
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
  // 2 temporales al crear (Adherente + CI) + 1 temporal al completar (Jefe, recién llegada) + 3
  // respaldos finales (Adherente/Jefe/CI) al generar el PDF = 6.
  assert.equal(llamadas.imagenesSubidas.length, 6);
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
  // 1 temporal al crear (CI) + 1 al completar la del adherente + 1 al completar la del jefe + 3
  // respaldos finales (Adherente/Jefe/CI) al generar el PDF = 6.
  assert.equal(llamadas.imagenesSubidas.length, 6);

  assert.throws(() => contexto.Servicio.completarFirma(token, { base64: 'x', mimeType: 'image/png' }), /no es válida/);
  assert.throws(() => contexto.Servicio.completarFirmaJefe(tokenJefe, { base64: 'x', mimeType: 'image/png' }), /no es válida/);
});

test('completarFirmaJefe: si la firma del adherente (ya completada) no se puede leer al cerrar el documento, NO se marca Firmado ni se pierde la firma del jefe que sí se acaba de completar (bug real, prod 14-oct-2026)', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' }, { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const token = llamadas.insert[0]['TOKEN FIRMA'];
  const tokenJefe = llamadas.insert[0]['TOKEN FIRMA JEFE'];
  contexto.Servicio.completarFirma(token, { base64: 'adherente', mimeType: 'image/png' });
  assert.ok(llamadas.insert[0]['FIRMA ADHERENTE TEMP'], 'la firma del adherente quedó guardada');

  // Simula que, al momento de cerrar el documento, el archivo de Drive de la firma del
  // adherente ya no se puede leer (borrado, sin permiso...) -- DriveApp.getFileById truena
  // solo para ESE archivo.
  const archivoAdherente = JSON.parse(llamadas.insert[0]['FIRMA ADHERENTE TEMP']).archivoId;
  const getFileByIdOriginal = contexto.DriveApp.getFileById;
  contexto.DriveApp.getFileById = (id) => {
    if (id === archivoAdherente) throw new Error('No se encontró el archivo (o no tienes acceso).');
    return getFileByIdOriginal(id);
  };

  const resultado = contexto.Servicio.completarFirmaJefe(tokenJefe, { base64: 'firma-jefe', mimeType: 'image/png' });

  assert.equal(resultado.PDF, null, 'no genera el PDF: faltaría la firma del adherente');
  assert.ok(resultado.pendiente, 'el documento queda pendiente, no se da por completado');
  assert.match(resultado.aviso, /no se pudo leer/i);
  assert.equal(llamadas.pdfGenerados, 0, 'nunca llegó a generar el PDF');
  assert.notEqual(llamadas.insert[0]['ESTADO FIRMA'], 'FIRMADO', 'el documento NO se cierra como Firmado sin la firma del adherente');
  assert.ok(llamadas.insert[0]['FIRMA JEFE TEMP'], 'la firma del jefe que SÍ se pudo completar no se pierde');
  assert.equal(llamadas.insert[0]['TOKEN FIRMA JEFE'], '', 'su token ya se consumió, no se puede reusar la misma liga');
  assert.equal(llamadas.insert[0]['FIRMADO POR JEFE'], 'firmante@ciudadmaderas.com');
});


test('el PDF se genera en el expediente del NUCO del vehículo y se archiva ahí (adherente)', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'MARIA LOPEZ' }, FIRMA_OK);
  assert.equal(llamadas.pdfEn, 'NUCO/00001/RESPONSIVA/ADHERENTES');
  assert.deepEqual(llamadas.expediente, [{ archivar: 'pdf1', nucco: '00001', doc: 'RESPONSIVA', adherente: true }]);
});

// ---------------------------------------------------------------------------- actualizar ("Editar", 15-oct-2026)

test('actualizar: mientras sigue PENDIENTE, corrige los datos editables', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true });
  const id = llamadas.insert[0].ID;

  const res = contexto.Servicio.actualizar('tok', id, { DEPARTAMENTO: 'COBRANZA', PUESTO: 'GERENTE', 'LUGAR DE RESGUARDO': 'QRO BODEGA 2' });

  assert.equal(res.ID, id);
  const fila = llamadas.insert[0];
  assert.equal(fila['DEPARTAMENTO'], 'COBRANZA');
  assert.equal(fila['PUESTO'], 'GERENTE');
  assert.equal(fila['LUGAR DE RESGUARDO'], 'QRO BODEGA 2');
});

test('actualizar: ignora campos que no son editables (ADHERENTE, vehículo, PDF, ESTADO FIRMA, tokens, ESTATUS), aunque se manden', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true });
  const id = llamadas.insert[0].ID;

  contexto.Servicio.actualizar('tok', id, {
    ADHERENTE: 'Otra Persona', 'FOLIO VEHICULO': 'AUT9999', PDF: 'https://drive/falso',
    'ESTADO FIRMA': 'FIRMADO', 'TOKEN FIRMA': 'robado', ESTATUS: 'BAJA',
  });

  const fila = llamadas.insert[0];
  assert.equal(fila['ADHERENTE'], 'Maria Lopez');
  assert.equal(fila['FOLIO VEHICULO'], 'AUT0001');
  assert.equal(fila['PDF'], '');
  assert.equal(fila['ESTADO FIRMA'], 'PENDIENTE');
  assert.ok(fila['TOKEN FIRMA'] && fila['TOKEN FIRMA'] !== 'robado');
  assert.equal(fila['ESTATUS'], 'ACTIVO', 'ESTATUS tiene su propio endpoint (cambiarEstatus), no se toca aquí');
});

test('actualizar: truena si ya se firmó del todo (ESTADO FIRMA ya no PENDIENTE) -- el documento ya quedó impreso con esos datos', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', ADHERENTE: 'Maria Lopez' }, FIRMA_OK);
  const id = llamadas.insert[0].ID;
  assert.equal(llamadas.insert[0]['ESTADO FIRMA'], 'FIRMADO', 'presencial: queda firmado de una vez');
  assert.throws(() => contexto.Servicio.actualizar('tok', id, { PUESTO: 'GERENTE' }), /ya quedó firmado; ya no se puede editar/);
  assert.notEqual(llamadas.insert[0]['PUESTO'], 'GERENTE');
});

test('actualizar: truena si el registro no existe', () => {
  const { contexto } = crearContexto();
  assert.throws(() => contexto.Servicio.actualizar('tok', 'ADH-X', { PUESTO: 'GERENTE' }), /No se encontró el registro/);
});
