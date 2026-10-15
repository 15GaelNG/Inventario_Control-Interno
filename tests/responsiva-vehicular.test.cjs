// Responsiva Vehicular (formato F-CI01-045): el enganche con reasignación solo debe tocar
// VEHICULOS cuando el responsable que firma es distinto al actual, y sin la firma del
// responsable ni la de quien entrega no se debe escribir nada (ni la fila, ni el PDF). El
// responsable y el jefe pueden firmar cada quien por su propia liga, independiente uno del
// otro -- el PDF se genera hasta que TODAS las ligas que se mandaron se completen.
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
    Entidades: { prefijo: () => 'RSV' },
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
      getSheet: () => ({ getName: () => 'RESPONSIVA VEHICULAR' }),
      insert: (ssId, hoja, fila) => { llamadas.insert.push(fila); },
      // Igual que el SheetUtils.update real (lee-mezcla-escribe): así una llamada después sí
      // ve ESTADO FIRMA/TOKEN FIRMA ya actualizados.
      update: (ssId, hoja, id, cambios) => {
        llamadas.update.push({ id, cambios });
        const fila = llamadas.insert.find((f) => f.ID === id);
        if (fila) Object.assign(fila, cambios);
      },
      remove: () => true,
      // Simula la hoja con lo que ya se insertó -- suficiente para que buscarPorToken_
      // (SheetUtils.getAll(...).find(...)) encuentre el renglón pendiente que un
      // crear(..., {remoto:true}/{remotoJefe:true}) anterior ya guardó.
      getAll: () => llamadas.insert,
      // devolverPrestamo busca por ID (no por token): mismo "lee-mezcla-escribe" que update,
      // para que lo recién insertado/actualizado se encuentre.
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
      PRESTAMOS: 'PRESTAMOS',
      archivar: (archivo, nucco, doc, op) => { llamadas.expediente.push(Object.assign({ archivar: archivo.id, nucco, doc, adherente: !!(op && op.adherente) }, op && op.prestamo ? { prestamo: true } : {})); },
    },
    PdfService: {
      generar: (o) => { llamadas.pdfGenerados++; llamadas.pdfEn = o.carpetaId; llamadas.imagenesPdf = o.imagenes; return { id: 'pdf1', fileId: 'pdf1', nombre: 'r.pdf', url: 'https://drive/r.pdf' }; },
      generarVistaPrevia: (p) => { llamadas.vistasPrevias++; return { base64: 'pdf-bytes', mimeType: 'application/pdf', imagenes: p.imagenes }; },
      nombreArchivo: () => 'nombre',
      fechaParaNombre: () => '2026-10-05',
    },
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../src/services/ResponsivaVehicularService.gs'), 'utf8') +
    '\nthis.Servicio = ResponsivaVehicularService;',
    contexto
  );
  return { contexto, llamadas, archivosDrive };
}

const FIRMA_RESPONSABLE = { base64: 'abc', mimeType: 'image/png' };
const FIRMA_JEFE = { base64: 'jefe', mimeType: 'image/png' };
const FIRMA_CI = { base64: 'ci', mimeType: 'image/png' };
const FIRMA_OK = { 'FIRMA RESPONSABLE': FIRMA_RESPONSABLE, 'FIRMA CI': FIRMA_CI };

// Columnas que SIEMPRE se insertan (metadatos del flujo de firma, nunca la firma en sí) --
// las únicas con "FIRMA" en el nombre que un renglón normal debe traer.
const METADATO = [
  'ESTADO FIRMA', 'TOKEN FIRMA', 'TOKEN FIRMA EXPIRA', 'TOKEN FIRMA JEFE', 'TOKEN FIRMA JEFE EXPIRA',
  'FIRMADO POR', 'FIRMADO POR JEFE', 'FIRMA RESPONSABLE TEMP', 'FIRMA JEFE TEMP', 'FIRMA CI TEMP',
];

test('sin la firma del responsable truena antes de escribir nada', () => {
  const { contexto, llamadas } = crearContexto();
  assert.throws(
    () => contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'JUAN PEREZ' }, { 'FIRMA CI': FIRMA_CI }),
    /Falta la firma del responsable/
  );
  assert.deepEqual(llamadas.insert, []);
  assert.deepEqual(llamadas.actualizarVehiculo, []);
});

test('sin la firma de quien entrega truena antes de escribir nada (presencial, remoto o remotoJefe)', () => {
  const { contexto, llamadas } = crearContexto();
  assert.throws(
    () => contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'JUAN PEREZ' }, { 'FIRMA RESPONSABLE': FIRMA_RESPONSABLE }),
    /Falta la firma de quien entrega/
  );
  assert.throws(
    () => contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'JUAN PEREZ' }, {}, { remoto: true }),
    /Falta la firma de quien entrega/
  );
  assert.throws(
    () => contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'JUAN PEREZ' }, { 'FIRMA RESPONSABLE': FIRMA_RESPONSABLE }, { remotoJefe: true }),
    /Falta la firma de quien entrega/
  );
  assert.deepEqual(llamadas.insert, []);
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

test('presencial: cada firma se respalda como imagen en Drive, sin ligarla en la hoja, y cierra FIRMADO de una vez', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA RESPONSABLE': FIRMA_RESPONSABLE, 'FIRMA JEFE': FIRMA_JEFE, 'FIRMA CI': FIRMA_CI });
  assert.equal(llamadas.imagenesSubidas.length, 3);
  assert.ok(llamadas.imagenesSubidas.every((img) => img.carpeta === 'NUCO/00001/RESPONSIVA/FIRMAS'), 'el respaldo de cada firma va al expediente del NUCO');
  const otrasColumnas = Object.keys(llamadas.insert[0]).filter((k) => METADATO.indexOf(k) === -1);
  assert.ok(!otrasColumnas.some((k) => k.toUpperCase().indexOf('FIRMA') !== -1));
  assert.equal(llamadas.insert[0]['FIRMA JEFE TEMP'], '');
  assert.equal(llamadas.insert[0]['FIRMA CI TEMP'], '');
  assert.equal(llamadas.insert[0]['FIRMA RESPONSABLE TEMP'], '');
  assert.equal(llamadas.insert[0]['ESTADO FIRMA'], 'FIRMADO');
  assert.equal(llamadas.pdfGenerados, 1);
});

// ---------- Firma a distancia: liga del RESPONSABLE (opciones.remoto) ----------

test('remoto: no exige la firma del responsable (CI sigue siendo obligatoria), no genera PDF, y sí reasigna si el responsable cambió', () => {
  const { contexto, llamadas } = crearContexto();
  const res = contexto.Servicio.crear(
    'tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Maria Lopez' }, { 'FIRMA CI': FIRMA_CI }, { remoto: true }
  );
  assert.equal(llamadas.insert.length, 1);
  assert.equal(llamadas.insert[0]['ESTADO FIRMA'], 'PENDIENTE');
  assert.ok(llamadas.insert[0]['TOKEN FIRMA']);
  assert.equal(llamadas.insert[0]['TOKEN FIRMA JEFE'], '');
  // CI ya firmó al generar la liga: se guarda TEMP (como archivo chico de Drive, no el base64
  // directo en la celda -- Sheets no deja más de 50,000 caracteres por celda, ver el comentario
  // de guardarFirmaTemp_), pero el PDF final todavía no se genera.
  assert.ok(llamadas.insert[0]['FIRMA CI TEMP']);
  assert.ok(JSON.parse(llamadas.insert[0]['FIRMA CI TEMP']).archivoId);
  assert.equal(llamadas.pdfGenerados, 0);
  assert.equal(llamadas.imagenesSubidas.length, 1);   // la de CI, guardada como temporal
  // La reasignación la decide quien captura, con su sesión, aquí y ahora -- no se puede
  // posponer a completarFirma (que no tiene sesión, ver el comentario del archivo).
  assert.equal(llamadas.actualizarVehiculo.length, 1);
  assert.equal(llamadas.actualizarVehiculo[0].cambios['RESPONSABLE VEHICULO'], 'Maria Lopez');
  assert.ok(res.liga.includes('tipo=responsiva'));
  assert.ok(!res.liga.includes('quien=jefe'));
  assert.ok(res.liga.includes(llamadas.insert[0]['TOKEN FIRMA']));
  assert.ok(!res.ligaJefe);
});

test('remoto: la firma de Jefe que sí llegó (presencial) se guarda temporalmente (como archivo de Drive, no el base64 directo en la celda), no se pierde', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA JEFE': FIRMA_JEFE, 'FIRMA CI': FIRMA_CI }, { remoto: true });
  // La celda solo trae el ID del archivo, nunca el base64: así nunca rebasa los 50,000
  // caracteres por celda sin importar qué tan pesada sea la firma (bug real, 9-oct, con una
  // firma por foto).
  assert.ok(JSON.parse(llamadas.insert[0]['FIRMA JEFE TEMP']).archivoId);
  assert.ok(JSON.parse(llamadas.insert[0]['FIRMA CI TEMP']).archivoId);
  // Lo que de verdad importa: que al leerla de vuelta (vistaPrevia) sea la misma imagen de antes.
  const vista = contexto.Servicio.vistaPrevia(llamadas.insert[0]['TOKEN FIRMA']);
  assert.equal(vista.imagenes['FIRMA JEFE'].base64, 'jefe');
  assert.equal(vista.imagenes['FIRMA CI'].base64, 'ci');
});

test('retrocompatibilidad: una liga pendiente creada ANTES de este arreglo (base64 directo en TEMP, sin archivoId) se completa igual', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' }, { 'FIRMA CI': FIRMA_CI }, { remoto: true });
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
  assert.equal(llamadas.imagenesPdf['FIRMA RESPONSABLE'].base64, 'respondio-despues-del-arreglo');
});

test('vistaPrevia (liga del responsable): el PDF sin guardar, con las firmas TEMP ya puestas y sin la del responsable todavía', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA CI': FIRMA_CI, 'FIRMA JEFE': FIRMA_JEFE }, { remoto: true });
  const res = contexto.Servicio.vistaPrevia(llamadas.insert[0]['TOKEN FIRMA']);
  assert.equal(llamadas.vistasPrevias, 1);
  assert.equal(llamadas.pdfGenerados, 0);
  assert.equal(res.base64, 'pdf-bytes');
  assert.ok(res.imagenes['FIRMA JEFE']);
  assert.ok(res.imagenes['FIRMA CI']);
  assert.ok(!res.imagenes['FIRMA RESPONSABLE'], 'todavía no hay firma del responsable -- es justo lo que se está por decidir');
});

test('vistaPrevia: token inválido truena', () => {
  const { contexto } = crearContexto();
  assert.throws(() => contexto.Servicio.vistaPrevia('no-existe'), /liga no es válida/);
});

test('completarFirma: token inválido truena sin tocar nada', () => {
  const { contexto, llamadas } = crearContexto();
  assert.throws(() => contexto.Servicio.completarFirma('no-existe', { base64: 'x', mimeType: 'image/png' }), /liga no es válida/);
  assert.equal(llamadas.update.length, 0);
});

test('completarFirma: token ya usado (ESTADO FIRMA ya no PENDIENTE) truena', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' }, { 'FIRMA CI': FIRMA_CI }, { remoto: true });
  llamadas.insert[0]['ESTADO FIRMA'] = 'FIRMADO';
  assert.throws(
    () => contexto.Servicio.completarFirma(llamadas.insert[0]['TOKEN FIRMA'], { base64: 'x', mimeType: 'image/png' }),
    /ya se usó/
  );
});

test('completarFirma: token vencido truena', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' }, { 'FIRMA CI': FIRMA_CI }, { remoto: true });
  llamadas.insert[0]['TOKEN FIRMA EXPIRA'] = new Date(Date.now() - 1000);
  assert.throws(
    () => contexto.Servicio.completarFirma(llamadas.insert[0]['TOKEN FIRMA'], { base64: 'x', mimeType: 'image/png' }),
    /venció/
  );
});

test('completarFirma: sin liga de Jefe pendiente, genera el PDF de una vez (junta Jefe/CI TEMP con la nueva) y limpia el token', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA CI': FIRMA_CI, 'FIRMA JEFE': FIRMA_JEFE }, { remoto: true });
  const token = llamadas.insert[0]['TOKEN FIRMA'];
  const res = contexto.Servicio.completarFirma(token, { base64: 'firmo-aqui', mimeType: 'image/png' });
  assert.equal(llamadas.pdfGenerados, 1);
  assert.equal(res.PDF, 'https://drive/r.pdf');
  assert.ok(!res.pendiente);
  // 2 temporales al crear (Jefe + CI, que ya venían firmados) + 1 temporal al completar (la que
  // acaba de llegar) + 3 respaldos finales (Responsable/Jefe/CI) al generar el PDF = 6.
  assert.equal(llamadas.imagenesSubidas.length, 6);
  const cambios = llamadas.update[llamadas.update.length - 1].cambios;
  assert.equal(cambios['ESTADO FIRMA'], 'FIRMADO');
  assert.equal(cambios['TOKEN FIRMA'], '');
  assert.equal(cambios['FIRMA JEFE TEMP'], '');
  assert.equal(cambios['FIRMADO POR'], 'firmante@ciudadmaderas.com');
});

test('completarFirma: si TAMBIÉN hay una liga de Jefe pendiente, solo se guarda y se espera (sin PDF)', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' }, { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const token = llamadas.insert[0]['TOKEN FIRMA'];
  const res = contexto.Servicio.completarFirma(token, { base64: 'firmo-aqui', mimeType: 'image/png' });
  assert.equal(llamadas.pdfGenerados, 0);
  assert.equal(res.PDF, null);
  assert.equal(res.pendiente, true);
  assert.match(res.aviso, /jefe directo/);
  assert.equal(llamadas.insert[0]['ESTADO FIRMA'], 'PENDIENTE');
  assert.equal(llamadas.insert[0]['TOKEN FIRMA'], '');            // la suya ya se limpió
  assert.ok(llamadas.insert[0]['TOKEN FIRMA JEFE']);               // la del jefe sigue viva
  assert.ok(JSON.parse(llamadas.insert[0]['FIRMA RESPONSABLE TEMP']).archivoId);
});

// ---------- Firma a distancia: liga del JEFE (opciones.remotoJefe) ----------

test('remotoJefe: exige la firma del responsable AHORA (no es ella la que se difiere), y nunca la del jefe', () => {
  const { contexto, llamadas } = crearContexto();
  assert.throws(
    () => contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' }, { 'FIRMA CI': FIRMA_CI }, { remotoJefe: true }),
    /Falta la firma del responsable/
  );
  const res = contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA RESPONSABLE': FIRMA_RESPONSABLE, 'FIRMA CI': FIRMA_CI }, { remotoJefe: true });
  assert.equal(llamadas.insert.length, 1);
  assert.equal(llamadas.insert[0]['ESTADO FIRMA'], 'PENDIENTE');
  assert.ok(llamadas.insert[0]['TOKEN FIRMA JEFE']);
  assert.equal(llamadas.insert[0]['TOKEN FIRMA'], '');
  // El responsable ya firmó, pero como el jefe sigue pendiente, su firma se guarda TEMP.
  assert.ok(JSON.parse(llamadas.insert[0]['FIRMA RESPONSABLE TEMP']).archivoId);
  assert.equal(llamadas.pdfGenerados, 0);
  assert.ok(res.ligaJefe.includes('tipo=responsiva'));
  assert.ok(res.ligaJefe.includes('quien=jefe'));
  assert.ok(res.ligaJefe.includes(llamadas.insert[0]['TOKEN FIRMA JEFE']));
  assert.ok(!res.liga);
});

test('remoto + remotoJefe juntos: dos ligas independientes en el mismo renglón', () => {
  const { contexto, llamadas } = crearContexto();
  const res = contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  assert.ok(res.liga && res.ligaJefe);
  assert.notEqual(res.liga, res.ligaJefe);
  assert.ok(llamadas.insert[0]['TOKEN FIRMA'] && llamadas.insert[0]['TOKEN FIRMA JEFE']);
  assert.notEqual(llamadas.insert[0]['TOKEN FIRMA'], llamadas.insert[0]['TOKEN FIRMA JEFE']);
});

test('ligaDeToken: arma la misma liga que crear() para cada token, siempre del lado del servidor', () => {
  const { contexto, llamadas } = crearContexto();
  const res = contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const token = llamadas.insert[0]['TOKEN FIRMA'];
  const tokenJefe = llamadas.insert[0]['TOKEN FIRMA JEFE'];
  assert.equal(contexto.Servicio.ligaDeToken('tok', token, 'principal'), res.liga);
  assert.equal(contexto.Servicio.ligaDeToken('tok', tokenJefe, 'jefe'), res.ligaJefe);
});

test('la liga usa el despliegue público si está configurado (Config.urlFirmaPublica), en vez del despliegue normal', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Config.urlFirmaPublica = () => 'https://script.google.com/macros/s/PUBLICO/exec';
  const res = contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true });
  assert.ok(res.liga.startsWith('https://script.google.com/macros/s/PUBLICO/exec'));
});

// ---------------------------------------------------------------------------- regenerarLiga ("Generar nueva liga")

test('regenerarLiga: token distinto al anterior, expira +15 días, y la liga coincide con ligaDeToken del token nuevo', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
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

test('regenerarLiga: el token viejo deja de servir en cuanto se genera el nuevo', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' }, { 'FIRMA CI': FIRMA_CI }, { remoto: true });
  const id = llamadas.insert[0].ID;
  const tokenViejo = llamadas.insert[0]['TOKEN FIRMA'];

  contexto.Servicio.regenerarLiga('tok', id, 'principal');

  assert.equal(contexto.Servicio.obtenerPendientePorToken(tokenViejo).vigente, false);
});

test('regenerarLiga: también funciona del lado del jefe, sin tocar el token del responsable', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const id = llamadas.insert[0].ID;
  const tokenResponsable = llamadas.insert[0]['TOKEN FIRMA'];

  contexto.Servicio.regenerarLiga('tok', id, 'jefe');

  assert.equal(llamadas.insert[0]['TOKEN FIRMA'], tokenResponsable, 'no toca el token del responsable');
  assert.ok(contexto.Servicio.obtenerPendientePorToken(tokenResponsable).vigente, 'el del responsable sigue sirviendo');
});

test('regenerarLiga: truena si la firma ya se completó (ESTADO FIRMA ya no PENDIENTE)', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA RESPONSABLE': FIRMA_RESPONSABLE, 'FIRMA JEFE': FIRMA_JEFE, 'FIRMA CI': FIRMA_CI });
  const id = llamadas.insert[0].ID;
  assert.throws(() => contexto.Servicio.regenerarLiga('tok', id, 'principal'), /ya se completó/);
});

test('regenerarLiga: truena si el registro no existe', () => {
  const { contexto } = crearContexto();
  assert.throws(() => contexto.Servicio.regenerarLiga('tok', 'NO-EXISTE', 'principal'), /No se encontró/);
});

test('regenerarLiga: revisa permiso de edición antes de tocar nada', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' }, { 'FIRMA CI': FIRMA_CI }, { remoto: true });
  const id = llamadas.insert[0].ID;
  let pedido = null;
  contexto.Permisos.puedeEditar = (token, modulo) => { pedido = modulo; return { nombre: 'TESTER', correo: 't@x.com' }; };
  contexto.Servicio.regenerarLiga('tok', id, 'principal');
  assert.equal(pedido, 'responsiva-vehicular');
});

test('regenerarLiga: si esa parte ya firmó MAL y la otra sigue pendiente, se puede regenerar -- descarta la firma anterior', () => {
  const { contexto, llamadas, archivosDrive } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const id = llamadas.insert[0].ID;
  const tokenResponsable = llamadas.insert[0]['TOKEN FIRMA'];
  contexto.Servicio.completarFirma(tokenResponsable, { base64: 'firmo-mal', mimeType: 'image/png' });
  assert.equal(llamadas.insert[0]['ESTADO FIRMA'], 'PENDIENTE', 'el jefe todavía no firma -- el documento sigue abierto');
  assert.equal(llamadas.insert[0]['TOKEN FIRMA'], '', 'ya se usó, no por vencida -- la firmó (mal)');
  assert.ok(llamadas.insert[0]['FIRMA RESPONSABLE TEMP'], 'la firma mala quedó guardada');
  const archivoFirmaMala = JSON.parse(llamadas.insert[0]['FIRMA RESPONSABLE TEMP']).archivoId;

  contexto.Servicio.regenerarLiga('tok', id, 'principal');

  assert.ok(llamadas.insert[0]['TOKEN FIRMA'], 'token nuevo generado');
  assert.equal(llamadas.insert[0]['FIRMA RESPONSABLE TEMP'], '', 'la firma mala se descarta');
  assert.equal(llamadas.insert[0]['FIRMADO POR'], '', 'ya no hay quién la firmó -- hay que volver a firmar');
  assert.equal(archivosDrive[archivoFirmaMala].trashed, true, 'el archivo de Drive de la firma mala también se tira');
});

test('regenerarLiga: después de regenerar, SÍ se puede volver a firmar con el token nuevo', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const id = llamadas.insert[0].ID;
  const tokenOriginal = llamadas.insert[0]['TOKEN FIRMA'];
  contexto.Servicio.completarFirma(tokenOriginal, { base64: 'firmo-mal', mimeType: 'image/png' });

  contexto.Servicio.regenerarLiga('tok', id, 'principal');
  const tokenNuevo = llamadas.insert[0]['TOKEN FIRMA'];
  assert.ok(tokenNuevo && tokenNuevo !== tokenOriginal);

  const pendiente = contexto.Servicio.obtenerPendientePorToken(tokenNuevo);
  assert.equal(pendiente.vigente, true, 'la liga nueva se ve vigente antes de firmar');

  const resultado = contexto.Servicio.completarFirma(tokenNuevo, { base64: 'firmo-bien', mimeType: 'image/png' });
  assert.equal(resultado.pendiente, true, 'el jefe sigue sin firmar -- se guarda y se espera, sin tronar');
  assert.equal(llamadas.insert[0]['TOKEN FIRMA'], '', 'el token nuevo ya se consumió, correcto');
  assert.ok(llamadas.insert[0]['FIRMADO POR'], 'quedó registrado quién firmó esta vez');
});

test('regenerarLiga: truena si esa parte firmó presencial (nunca tuvo liga) -- no hay nada que regenerar', () => {
  const { contexto, llamadas } = crearContexto();
  // Jefe firma presencial al crear (imagen directa); responsable se difiere -- el documento
  // sigue PENDIENTE (falta el responsable), pero el jefe nunca tuvo una liga que regenerar.
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA JEFE': FIRMA_JEFE, 'FIRMA CI': FIRMA_CI }, { remoto: true });
  const id = llamadas.insert[0].ID;
  assert.equal(llamadas.insert[0]['ESTADO FIRMA'], 'PENDIENTE');
  assert.throws(() => contexto.Servicio.regenerarLiga('tok', id, 'jefe'), /firmó presencial/);
  assert.ok(llamadas.insert[0]['FIRMA JEFE TEMP'], 'su firma presencial sigue intacta -- no se tocó');
});

test('regenerarLiga: si OTRA columna …TEMP se quedó con el base64 crudo de antes del arreglo del 9-oct, la migra a Drive al guardar (si no, reescribir el renglón para cambiar solo el token puede tronar el límite de 50000 por celda -- bug real, 14-oct-2026)', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const id = llamadas.insert[0].ID;
  // Simula un renglón viejo: el responsable ya firmó, pero con el formato de ANTES del arreglo
  // del 9-oct (el base64 crudo directo en la celda, no el JSON con archivoId de guardarFirmaTemp_).
  llamadas.insert[0]['TOKEN FIRMA'] = '';
  llamadas.insert[0]['FIRMADO POR'] = 'responsable@ciudadmaderas.com';
  llamadas.insert[0]['FIRMA RESPONSABLE TEMP'] = JSON.stringify({ base64: 'x'.repeat(200000), mimeType: 'image/jpeg' });

  const liga = contexto.Servicio.regenerarLiga('tok', id, 'jefe');

  assert.ok(liga, 'no truena generando la liga del jefe, aunque la del responsable siga en el formato viejo');
  const migrada = JSON.parse(llamadas.insert[0]['FIRMA RESPONSABLE TEMP']);
  assert.ok(migrada.archivoId, 'se migró a archivo de Drive -- ya no es base64 crudo en la celda');
  assert.ok(!migrada.base64, 'el base64 crudo ya no vive en la celda');
});

test('completarFirma: si la firma de CI (capturada en persona al crear) sigue con el base64 crudo de antes del 9-oct, se migra al guardar el "falta la firma del jefe", sin tronar', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const id = llamadas.insert[0].ID;
  const tokenResponsable = llamadas.insert[0]['TOKEN FIRMA'];
  // Simula que este renglón es viejo: la firma de CI, capturada en persona al crear, quedó
  // guardada con el formato de ANTES del arreglo del 9-oct (base64 crudo en la celda).
  llamadas.insert[0]['FIRMA CI TEMP'] = JSON.stringify({ base64: 'z'.repeat(200000), mimeType: 'image/jpeg' });

  const resultado = contexto.Servicio.completarFirma(tokenResponsable, { base64: 'firma-responsable', mimeType: 'image/png' });

  assert.equal(resultado.pendiente, true, 'el jefe sigue sin firmar -- no debe tronar aunque CI siga en el formato viejo');
  const migrada = JSON.parse(llamadas.insert[0]['FIRMA CI TEMP']);
  assert.ok(migrada.archivoId, 'la firma de CI también quedó migrada a archivo de Drive');
  assert.ok(!migrada.base64, 'el base64 crudo ya no vive en la celda');
});

test('obtenerPendienteJefePorToken: igual de estricto que el del responsable (no existe / ya firmado / vencido)', () => {
  const { contexto, llamadas } = crearContexto();
  assert.equal(contexto.Servicio.obtenerPendienteJefePorToken('no-existe').vigente, false);

  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA RESPONSABLE': FIRMA_RESPONSABLE, 'FIRMA CI': FIRMA_CI }, { remotoJefe: true });
  const tokenJefe = llamadas.insert[0]['TOKEN FIRMA JEFE'];
  const info = contexto.Servicio.obtenerPendienteJefePorToken(tokenJefe);
  assert.equal(info.vigente, true);
  assert.equal(info.nombre, 'Juan Perez');   // a quién pertenece la responsiva, para que el jefe sepa qué firma

  llamadas.insert[0]['TOKEN FIRMA JEFE EXPIRA'] = new Date(Date.now() - 1000);
  assert.equal(contexto.Servicio.obtenerPendienteJefePorToken(tokenJefe).vigente, false);
});

test('completarFirmaJefe: sin liga del responsable pendiente, genera el PDF de una vez', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA RESPONSABLE': FIRMA_RESPONSABLE, 'FIRMA CI': FIRMA_CI }, { remotoJefe: true });
  const tokenJefe = llamadas.insert[0]['TOKEN FIRMA JEFE'];
  const res = contexto.Servicio.completarFirmaJefe(tokenJefe, { base64: 'firma-jefe-remota', mimeType: 'image/png' });
  assert.equal(llamadas.pdfGenerados, 1);
  assert.equal(res.PDF, 'https://drive/r.pdf');
  assert.ok(!res.pendiente);
  // 2 temporales al crear (Responsable + CI) + 1 temporal al completar (Jefe, recién llegada)
  // + 3 respaldos finales (Responsable/Jefe/CI) al generar el PDF = 6.
  assert.equal(llamadas.imagenesSubidas.length, 6);
  const cambios = llamadas.update[llamadas.update.length - 1].cambios;
  assert.equal(cambios['ESTADO FIRMA'], 'FIRMADO');
  assert.equal(cambios['TOKEN FIRMA JEFE'], '');
  assert.equal(cambios['FIRMADO POR JEFE'], 'firmante@ciudadmaderas.com');
});

test('completarFirmaJefe: si TAMBIÉN hay una liga del responsable pendiente, solo se guarda y se espera', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const tokenJefe = llamadas.insert[0]['TOKEN FIRMA JEFE'];
  const res = contexto.Servicio.completarFirmaJefe(tokenJefe, { base64: 'firma-jefe-remota', mimeType: 'image/png' });
  assert.equal(llamadas.pdfGenerados, 0);
  assert.equal(res.pendiente, true);
  assert.match(res.aviso, /responsable/);
  assert.ok(llamadas.insert[0]['TOKEN FIRMA'], 'la liga del responsable sigue viva');
  assert.equal(llamadas.insert[0]['TOKEN FIRMA JEFE'], '');
});

test('las dos ligas, cada una completada por su lado, terminan generando el PDF una sola vez (la segunda en llegar)', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' }, { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const token = llamadas.insert[0]['TOKEN FIRMA'];
  const tokenJefe = llamadas.insert[0]['TOKEN FIRMA JEFE'];

  const primero = contexto.Servicio.completarFirmaJefe(tokenJefe, { base64: 'jefe', mimeType: 'image/png' });
  assert.equal(primero.pendiente, true);
  assert.equal(llamadas.pdfGenerados, 0);

  const segundo = contexto.Servicio.completarFirma(token, { base64: 'responsable', mimeType: 'image/png' });
  assert.ok(!segundo.pendiente);
  assert.equal(llamadas.pdfGenerados, 1);
  // 1 temporal al crear (CI) + 1 al completar la del jefe + 1 al completar la del responsable
  // + 3 respaldos finales (Responsable/Jefe/CI) al generar el PDF = 6.
  assert.equal(llamadas.imagenesSubidas.length, 6);

  // Repetir cualquiera de las dos ligas ya usadas truena (de un solo uso).
  assert.throws(() => contexto.Servicio.completarFirma(token, { base64: 'x', mimeType: 'image/png' }), /no es válida/);
  assert.throws(() => contexto.Servicio.completarFirmaJefe(tokenJefe, { base64: 'x', mimeType: 'image/png' }), /no es válida/);
});

test('completarFirma: si la firma del jefe (ya completada) no se puede leer al cerrar el documento, NO se marca Firmado ni se pierde la firma del responsable que sí se acaba de completar (bug real, prod 14-oct-2026)', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' }, { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const token = llamadas.insert[0]['TOKEN FIRMA'];
  const tokenJefe = llamadas.insert[0]['TOKEN FIRMA JEFE'];
  contexto.Servicio.completarFirmaJefe(tokenJefe, { base64: 'jefe', mimeType: 'image/png' });
  assert.ok(llamadas.insert[0]['FIRMA JEFE TEMP'], 'la firma del jefe quedó guardada');

  // Simula que, al momento de cerrar el documento, el archivo de Drive de la firma del jefe ya
  // no se puede leer (borrado, sin permiso...) -- DriveApp.getFileById truena solo para ESE
  // archivo.
  const archivoJefe = JSON.parse(llamadas.insert[0]['FIRMA JEFE TEMP']).archivoId;
  const getFileByIdOriginal = contexto.DriveApp.getFileById;
  contexto.DriveApp.getFileById = (id) => {
    if (id === archivoJefe) throw new Error('No se encontró el archivo (o no tienes acceso).');
    return getFileByIdOriginal(id);
  };

  const resultado = contexto.Servicio.completarFirma(token, { base64: 'firma-responsable', mimeType: 'image/png' });

  assert.equal(resultado.PDF, null, 'no genera el PDF: faltaría la firma del jefe');
  assert.ok(resultado.pendiente, 'el documento queda pendiente, no se da por completado');
  assert.match(resultado.aviso, /no se pudo leer/i);
  assert.equal(llamadas.pdfGenerados, 0, 'nunca llegó a generar el PDF');
  assert.notEqual(llamadas.insert[0]['ESTADO FIRMA'], 'FIRMADO', 'el documento NO se cierra como Firmado sin la firma del jefe');
  assert.ok(llamadas.insert[0]['FIRMA RESPONSABLE TEMP'], 'la firma del responsable que SÍ se pudo completar no se pierde');
  assert.equal(llamadas.insert[0]['TOKEN FIRMA'], '', 'su token ya se consumió, no se puede reusar la misma liga');
  assert.equal(llamadas.insert[0]['FIRMADO POR'], 'firmante@ciudadmaderas.com');
});


test('el PDF se genera en el expediente del NUCO del vehículo y se archiva ahí (responsiva)', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' }, FIRMA_OK);
  assert.equal(llamadas.pdfEn, 'NUCO/00001/RESPONSIVA');
  assert.deepEqual(llamadas.expediente, [{ archivar: 'pdf1', nucco: '00001', doc: 'RESPONSIVA', adherente: false }]);
});

// ---------- Préstamo Vehicular (TIPO RESPONSIVA / devolverPrestamo) ----------

test('préstamo: su PDF va a 5.-RESPONSIVA/PRESTAMOS y no desplaza a la responsiva vigente del dueño', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Maria Lopez', 'TIPO RESPONSIVA': 'PRESTAMO' }, FIRMA_OK);
  assert.equal(llamadas.pdfEn, 'NUCO/00001/RESPONSIVA/PRESTAMOS');
  assert.deepEqual(llamadas.expediente, [{ archivar: 'pdf1', nucco: '00001', doc: 'RESPONSIVA', adherente: false, prestamo: true }]);
});

test('préstamo: reasigna el vehículo a quien lo recibe y respalda a quién lo tenía antes', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok',
    { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Maria Lopez', 'TIPO RESPONSIVA': 'PRESTAMO', 'FECHA FIN PRESTAMO': '2026-10-15' },
    FIRMA_OK);
  assert.equal(llamadas.insert[0]['TIPO RESPONSIVA'], 'PRESTAMO');
  assert.equal(llamadas.insert[0]['ESTATUS PRESTAMO'], 'EN PRESTAMO');
  assert.equal(llamadas.insert[0]['RESPONSABLE ANTERIOR'], 'JUAN PEREZ');   // quien tenía el vehículo antes
  assert.ok(llamadas.insert[0]['FECHA FIN PRESTAMO']);
  assert.equal(llamadas.actualizarVehiculo.length, 1);
  assert.equal(llamadas.actualizarVehiculo[0].cambios['RESPONSABLE VEHICULO'], 'Maria Lopez');
});

test('sin TIPO RESPONSIVA (o con DEFINITIVA) se comporta exactamente como hoy -- regresión', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Maria Lopez' }, FIRMA_OK);
  assert.equal(llamadas.insert[0]['TIPO RESPONSIVA'], 'DEFINITIVA');
  assert.equal(llamadas.insert[0]['ESTATUS PRESTAMO'], '');
  assert.equal(llamadas.insert[0]['RESPONSABLE ANTERIOR'], '');
  assert.equal(llamadas.insert[0]['FECHA FIN PRESTAMO'], '');
});

test('FECHA FIN PRESTAMO se ignora si TIPO RESPONSIVA no es PRESTAMO (el formulario la oculta, pero el servidor no confía solo en eso)', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok',
    { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez', 'TIPO RESPONSIVA': 'DEFINITIVA', 'FECHA FIN PRESTAMO': '2026-10-15' },
    FIRMA_OK);
  assert.equal(llamadas.insert[0]['FECHA FIN PRESTAMO'], '');
});

test('devolverPrestamo: regresa el vehículo al responsable anterior y marca DEVUELTO, sin PDF ni firma', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok',
    { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Maria Lopez', 'TIPO RESPONSIVA': 'PRESTAMO' }, FIRMA_OK);
  const id = llamadas.insert[0].ID;
  const pdfAntes = llamadas.pdfGenerados;
  const res = contexto.Servicio.devolverPrestamo('tok', id);
  assert.equal(res.ESTATUS_PRESTAMO, 'DEVUELTO');
  assert.equal(llamadas.insert[0]['ESTATUS PRESTAMO'], 'DEVUELTO');
  // Una reasignación al crear (a Maria) y otra al devolver (de vuelta a Juan).
  assert.equal(llamadas.actualizarVehiculo.length, 2);
  assert.equal(llamadas.actualizarVehiculo[1].cambios['RESPONSABLE VEHICULO'], 'JUAN PEREZ');
  assert.equal(llamadas.pdfGenerados, pdfAntes);
});

test('devolverPrestamo truena si el registro no es un préstamo', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok', { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Juan Perez' }, FIRMA_OK);
  const id = llamadas.insert[0].ID;
  assert.throws(() => contexto.Servicio.devolverPrestamo('tok', id), /no es un préstamo/);
});

test('devolverPrestamo truena si el préstamo ya se devolvió (de un solo uso)', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok',
    { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Maria Lopez', 'TIPO RESPONSIVA': 'PRESTAMO' }, FIRMA_OK);
  const id = llamadas.insert[0].ID;
  contexto.Servicio.devolverPrestamo('tok', id);
  assert.throws(() => contexto.Servicio.devolverPrestamo('tok', id), /ya se devolvió/);
});

test('devolverPrestamo: si alguna firma …TEMP se quedó con el base64 crudo de antes del 9-oct, la migra a Drive al guardar -- puede devolverse con la firma todavía PENDIENTE', () => {
  const { contexto, llamadas } = crearContexto();
  contexto.Servicio.crear('tok',
    { 'FOLIO VEHICULO': 'AUT0001', RESPONSABLE: 'Maria Lopez', 'TIPO RESPONSIVA': 'PRESTAMO' },
    { 'FIRMA CI': FIRMA_CI }, { remoto: true, remotoJefe: true });
  const id = llamadas.insert[0].ID;
  assert.equal(llamadas.insert[0]['ESTATUS PRESTAMO'], 'EN PRESTAMO');
  assert.equal(llamadas.insert[0]['ESTADO FIRMA'], 'PENDIENTE', 'se devuelve antes de que se termine de firmar');
  // Simula un renglón viejo: la firma de CI quedó con el formato de antes del arreglo del 9-oct.
  llamadas.insert[0]['FIRMA CI TEMP'] = JSON.stringify({ base64: 'w'.repeat(200000), mimeType: 'image/jpeg' });

  const res = contexto.Servicio.devolverPrestamo('tok', id);

  assert.equal(res.ESTATUS_PRESTAMO, 'DEVUELTO');
  const migrada = JSON.parse(llamadas.insert[0]['FIRMA CI TEMP']);
  assert.ok(migrada.archivoId, 'la firma de CI quedó migrada a archivo de Drive');
  assert.ok(!migrada.base64, 'el base64 crudo ya no vive en la celda');
});
