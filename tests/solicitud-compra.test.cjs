// SolicitudCompraService.gs -- puente hacia Adquisición Vehicular: el expediente de una compra
// desde el folio del ticket, antes de que exista el vehículo. La hoja SOLICITUD COMPRA no viene
// de AppSheet (no existe hasta que hace falta), así que el servicio NO usa HojaServicio.listar/
// crear/actualizar (esos exigen que la hoja ya exista) -- lee/escribe la hoja directo, mismo
// patrón que HelpdeskService.hoja_. Estas pruebas simulan esa hoja en memoria.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ENCABEZADOS = ['ID', 'FOLIO', 'AREA', 'NOMBRE', 'FECHA', 'ESTATUS', 'LIGA_CARPETA', 'CARPETA_ID', 'NUCCO_RESULTANTE'];

function hojaMock(filasIniciales) {
  const filas = (filasIniciales || []).map((f) => f.slice());
  return {
    getLastRow: () => filas.length,
    getRange(row, col, numRows, numCols) {
      return {
        getValues() {
          const out = [];
          for (let r = 0; r < (numRows || 1); r++) {
            const fila = filas[row - 1 + r] || [];
            out.push(Array.from({ length: numCols || 1 }, (_, c) => (fila[col - 1 + c] !== undefined ? fila[col - 1 + c] : '')));
          }
          return out;
        },
        setValues(valores) {
          valores.forEach((fila, r) => {
            while (filas.length < row - 1 + r + 1) filas.push([]);
            fila.forEach((v, c) => { filas[row - 1 + r][col - 1 + c] = v; });
          });
          return this;
        },
        setValue(v) {
          while (filas.length < row) filas.push([]);
          filas[row - 1][col - 1] = v;
          return this;
        },
        setFontWeight() { return this; },
      };
    },
    appendRow(fila) { filas.push(fila.slice()); },
    deleteRow(row) { filas.splice(row - 1, 1); },
    setFrozenRows() { return this; },
    _filas: filas,
  };
}

function libroMock(hojasIniciales) {
  const hojas = Object.assign({}, hojasIniciales);
  return {
    getSheetByName: (nombre) => hojas[nombre] || null,
    insertSheet(nombre) { const h = hojaMock([]); hojas[nombre] = h; return h; },
    _hojas: hojas,
  };
}

/** Carpeta en memoria genérica (sirve para raíz, año, mes y la de la solicitud -- misma forma).
 *  getName/setName llevan un estado mutable aparte: el ID (getId/getUrl) nunca cambia al
 *  renombrar, igual que en Drive de verdad. */
function carpetaMock(nombrePropio, subcarpetasIniciales) {
  const subcarpetas = Object.assign({}, subcarpetasIniciales);
  const estado = { nombre: nombrePropio };
  return {
    getId: () => 'id-' + nombrePropio,
    getUrl: () => 'https://drive.google.com/drive/folders/id-' + nombrePropio,
    getName: () => estado.nombre,
    setName(nuevo) { estado.nombre = nuevo; return this; },
    getFoldersByName(nombre) {
      const existe = subcarpetas[nombre];
      const lista = existe ? [existe] : [];
      let i = 0;
      return { hasNext: () => i < lista.length, next: () => lista[i++] };
    },
    getFolders() {
      const lista = Object.values(subcarpetas);
      let i = 0;
      return { hasNext: () => i < lista.length, next: () => lista[i++] };
    },
    createFolder(nombre) {
      const nueva = carpetaMock(nombre);
      subcarpetas[nombre] = nueva;
      return nueva;
    },
    _subcarpetas: subcarpetas,
  };
}

// Utilities.formatDate/Session.getScriptTimeZone se fijan a enero -- así la carpeta del mes
// siempre es "01. ENERO", sin importar qué día se corran las pruebas.
const MES_FIJO = '01. ENERO';
const ANIO_FIJO = '2026';

function crearContexto({ libro, archivosPorCarpeta = {}, subcarpetasEnMes = {}, carpetasPorId = {} } = {}) {
  const llamadas = { getFolderById: null, getFolderByIdTodas: [], subirArchivo: [], permisoLeer: [], permisoEditar: [], tocarHoja: 0 };
  const libroVehiculos = libro || libroMock();
  const carpetaMes = carpetaMock(MES_FIJO, subcarpetasEnMes);
  const carpetaAnio = carpetaMock(ANIO_FIJO, { [MES_FIJO]: carpetaMes });
  const raiz = carpetaMock('raiz', { [ANIO_FIJO]: carpetaAnio });
  const contexto = vm.createContext({
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS' } },
    Permisos: {
      puedeLeer: (token, modulo) => { llamadas.permisoLeer.push(modulo); },
      puedeEditar: (token, modulo) => { llamadas.permisoEditar.push(modulo); },
    },
    SpreadsheetApp: { openById: (id) => libroVehiculos },
    DriveApp: {
      getFolderById: (id) => {
        llamadas.getFolderById = id;
        llamadas.getFolderByIdTodas.push(id);
        if (id === 'RAIZ-ADQ-TEST') return raiz;
        if (carpetasPorId[id]) return carpetasPorId[id];
        throw new Error('Carpeta no encontrada (mock): ' + id);
      },
    },
    AdquisicionVehicularService: { RAIZ_ADQUISICION_VEHICULAR: 'RAIZ-ADQ-TEST' },
    DriveUtils: { ...require("./drive-utils-real")(),
      archivosDeCarpeta: (id) => archivosPorCarpeta[id] || [],
      carpetaDelAnio: (carpeta) => {
        const ex = carpeta.getFoldersByName(ANIO_FIJO);
        return ex.hasNext() ? ex.next() : carpeta.createFolder(ANIO_FIJO);
      },
    },
    Utilities: { formatDate: () => '1' },
    Session: { getScriptTimeZone: () => 'America/Mexico_City' },
    Ids: { nuevo: (prefijo) => prefijo + '-TEST-1' },
    Entidades: { prefijo: () => 'SOC' },
    CacheHojas: { tocarHoja: () => { llamadas.tocarHoja++; } },
    HojaServicio: {
      fechaISO: (v) => { if (!v) return ''; try { return new Date(v).toISOString(); } catch (e) { return ''; } },
      subirArchivo: (carpetaId, deQue, nombreArchivo, mimeType, base64Data) => {
        llamadas.subirArchivo.push({ carpetaId, deQue, nombreArchivo });
        return { url: 'https://drive/archivo-nuevo', id: 'file-nuevo', nombre: nombreArchivo };
      },
    },
    console,
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../src/services/SolicitudCompraService.gs'), 'utf8') +
    '\nthis.Servicio = SolicitudCompraService;',
    contexto
  );
  return { contexto, llamadas, libro: libroVehiculos, raiz, carpetaAnio, carpetaMes };
}

// ---------------------------------------------------------------------------------------- crear

test('crear hace la hoja SOLICITUD COMPRA la primera vez, la subcarpeta "<FOLIO>-<NOMBRE>" dentro de AÑO/MES y llena CARPETA_ID/LIGA_CARPETA/ESTATUS', () => {
  const { contexto, llamadas, libro, carpetaMes } = crearContexto();
  const creada = contexto.Servicio.crear('tok', { FOLIO: '30371', AREA: 'CONSTRUCCIÓN', NOMBRE: 'Camioneta para Construcción' });

  assert.equal(llamadas.permisoEditar[0], 'solicitud-compra');
  assert.equal(llamadas.getFolderById, 'RAIZ-ADQ-TEST', 'crea dentro de la raíz REAL de Adquisición Vehicular, no en una propia');
  assert.equal(creada.ESTATUS, 'ABIERTA');
  assert.equal(creada.FOLIO, '30371');
  assert.equal(creada.CARPETA_ID, 'id-30371-Camioneta para Construcción');
  assert.equal(creada.LIGA_CARPETA, 'https://drive.google.com/drive/folders/id-30371-Camioneta para Construcción');
  assert.ok(creada.FECHA, 'FECHA se pone sola y viaja como ISO');
  assert.ok(libro._hojas['SOLICITUD COMPRA'], 'la hoja se creó sola');
  assert.deepEqual(libro._hojas['SOLICITUD COMPRA']._filas[0], ENCABEZADOS);
  assert.ok(carpetaMes._subcarpetas['30371-Camioneta para Construcción'], 'la carpeta quedó dentro de AÑO/MES, no suelta en la raíz');
});

test('crear truena sin folio o sin nombre, sin tocar Drive', () => {
  const { contexto, llamadas } = crearContexto();
  assert.throws(() => contexto.Servicio.crear('tok', { NOMBRE: 'Algo' }), /folio/i);
  assert.throws(() => contexto.Servicio.crear('tok', { FOLIO: '1' }), /nombre/i);
  assert.equal(llamadas.getFolderById, null, 'nunca llegó a pedir la carpeta');
});

test('crear reusa la subcarpeta si ya existe una con ese mismo nombre dentro del mes (no crea una segunda)', () => {
  const existente = { getId: () => 'YA-EXISTE', getUrl: () => 'https://drive/ya-existe' };
  const { contexto, carpetaMes } = crearContexto({ subcarpetasEnMes: { '100-Prueba': existente } });
  const creada = contexto.Servicio.crear('tok', { FOLIO: '100', NOMBRE: 'Prueba' });
  assert.equal(creada.CARPETA_ID, 'YA-EXISTE');
  assert.equal(Object.keys(carpetaMes._subcarpetas).length, 1, 'sigue habiendo una sola carpeta con ese nombre');
});

test('crear da un mensaje claro si la cuenta no tiene permiso de EDITOR en la carpeta real', () => {
  const contexto = vm.createContext({
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS' } },
    Permisos: { puedeEditar: () => {} },
    SpreadsheetApp: { openById: () => libroMock() },
    DriveApp: { getFolderById: () => ({}) },
    AdquisicionVehicularService: { RAIZ_ADQUISICION_VEHICULAR: 'RAIZ-ADQ-TEST' },
    DriveUtils: { ...require("./drive-utils-real")(),
      archivosDeCarpeta: () => [],
      carpetaDelAnio: () => { throw new Error('You do not have permission to access the requested resource.'); },
    },
    Utilities: { formatDate: () => '1' },
    Session: { getScriptTimeZone: () => 'America/Mexico_City' },
    Ids: { nuevo: () => 'SOC-TEST' },
    Entidades: { prefijo: () => 'SOC' },
    CacheHojas: { tocarHoja: () => {} },
    HojaServicio: { fechaISO: () => '' },
    console,
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../src/services/SolicitudCompraService.gs'), 'utf8') +
    '\nthis.Servicio = SolicitudCompraService;',
    contexto
  );
  assert.throws(() => contexto.Servicio.crear('tok', { FOLIO: '1', NOMBRE: 'X' }), /permiso de EDITOR/);
});

// ---------------------------------------------------------------------------------------- listar / eliminar

test('listar regresa [] sin tronar si la hoja todavía no existe, y las más nuevas primero', () => {
  const { contexto } = crearContexto();
  assert.equal(contexto.Servicio.listar('tok').length, 0);

  const libro2 = libroMock({ 'SOLICITUD COMPRA': hojaMock([ENCABEZADOS,
    ['SOC-1', '1', 'X', 'Primera', '2026-10-01', 'ABIERTA', '', 'c1', ''],
    ['SOC-2', '2', 'Y', 'Segunda', '2026-10-02', 'ABIERTA', '', 'c2', ''],
  ]) });
  const { contexto: ctx2 } = crearContexto({ libro: libro2 });
  const lista = ctx2.Servicio.listar('tok');
  assert.equal(lista.length, 2);
  assert.equal(lista[0].ID, 'SOC-2', 'la más nueva (agregada al final) sale primero');
});

test('eliminar quita el renglón correcto y no truena si el ID no existe', () => {
  const libro = libroMock({ 'SOLICITUD COMPRA': hojaMock([ENCABEZADOS,
    ['SOC-1', '1', '', 'Primera', '', 'ABIERTA', '', 'c1', ''],
    ['SOC-2', '2', '', 'Segunda', '', 'ABIERTA', '', 'c2', ''],
  ]) });
  const { contexto, llamadas } = crearContexto({ libro });
  assert.equal(contexto.Servicio.eliminar('tok', 'SOC-1'), true);
  assert.equal(llamadas.permisoEditar[0], 'solicitud-compra');
  const restantes = libro._hojas['SOLICITUD COMPRA']._filas.slice(1).map((f) => f[0]);
  assert.deepEqual(restantes, ['SOC-2']);
  assert.equal(contexto.Servicio.eliminar('tok', 'NO-EXISTE'), false);
});

// ---------------------------------------------------------------- listar: sincroniza NOMBRE desde Drive

test('listar se entera si alguien renombró la carpeta real en Drive (no desde la app) y actualiza NOMBRE en la hoja', () => {
  const libro = libroMock({ 'SOLICITUD COMPRA': hojaMock([ENCABEZADOS,
    ['SOC-1', '30371', 'X', 'Camioneta Vieja', '', 'ABIERTA', '', 'carpeta-1', ''],
  ]) });
  const carpeta = carpetaMock('ya-renombrada');
  carpeta.setName('30371-Camioneta Reparada');   // alguien la renombró directo en Drive
  const { contexto, llamadas, libro: libroDevuelto } = crearContexto({ libro, carpetasPorId: { 'carpeta-1': carpeta } });

  const lista = contexto.Servicio.listar('tok');
  assert.equal(lista[0].NOMBRE, 'Camioneta Reparada', 'se queda con el nombre real, sin el folio al frente');
  assert.equal(llamadas.tocarHoja, 1, 'avisa que la hoja cambió');
  assert.equal(libroDevuelto._hojas['SOLICITUD COMPRA']._filas[1][3], 'Camioneta Reparada', 'quedó escrito en la hoja, no solo en lo que regresa');
});

test('listar usa el nombre completo de Drive si ya no trae el folio al frente', () => {
  const libro = libroMock({ 'SOLICITUD COMPRA': hojaMock([ENCABEZADOS,
    ['SOC-1', '30371', '', 'Camioneta Vieja', '', 'ABIERTA', '', 'carpeta-1', ''],
  ]) });
  const carpeta = carpetaMock('x');
  carpeta.setName('Otro nombre sin folio');
  const { contexto } = crearContexto({ libro, carpetasPorId: { 'carpeta-1': carpeta } });
  assert.equal(contexto.Servicio.listar('tok')[0].NOMBRE, 'Otro nombre sin folio');
});

test('listar no toca Drive de las CONVERTIDA (ya no cambian) ni truena si la carpeta ya no se puede leer', () => {
  const libro = libroMock({ 'SOLICITUD COMPRA': hojaMock([ENCABEZADOS,
    ['SOC-1', '1', '', 'Convertida', '', 'CONVERTIDA', '', 'carpeta-convertida', '0451'],
    ['SOC-2', '2', '', 'Abierta sin acceso', '', 'ABIERTA', '', 'carpeta-sin-acceso', ''],
  ]) });
  const { contexto, llamadas } = crearContexto({ libro });   // carpetasPorId vacío: getFolderById truena para ambas
  const lista = contexto.Servicio.listar('tok');
  assert.equal(lista.find((f) => f.ID === 'SOC-1').NOMBRE, 'Convertida', 'se queda igual, sin pedirle nada a Drive');
  assert.equal(lista.find((f) => f.ID === 'SOC-2').NOMBRE, 'Abierta sin acceso', 'no truena listar(); se queda con lo que ya había');
  assert.ok(!llamadas.getFolderByIdTodas.includes('carpeta-convertida'), 'nunca le preguntó a Drive por la CONVERTIDA');
});

test('listar no reescribe la hoja si el nombre real sigue igual al esperado (nadie la tocó desde fuera)', () => {
  const libro = libroMock({ 'SOLICITUD COMPRA': hojaMock([ENCABEZADOS,
    ['SOC-1', '30371', '', 'Camioneta', '', 'ABIERTA', '', 'carpeta-1', ''],
  ]) });
  const carpeta = carpetaMock('30371-Camioneta');
  const { contexto, llamadas } = crearContexto({ libro, carpetasPorId: { 'carpeta-1': carpeta } });
  assert.equal(contexto.Servicio.listar('tok')[0].NOMBRE, 'Camioneta');
  assert.equal(llamadas.tocarHoja, 0, 'nada cambió: no hay por qué avisar que la hoja se tocó');
});

// ---------------------------------------------------------------------------------------- archivos / subirArchivo

test('archivos delega en DriveUtils.archivosDeCarpeta con el CARPETA_ID de la solicitud', () => {
  const libro = libroMock({ 'SOLICITUD COMPRA': hojaMock([ENCABEZADOS,
    ['SOC-1', '1', '', 'X', '', 'ABIERTA', '', 'carpeta-X', ''],
  ]) });
  const { contexto } = crearContexto({ libro, archivosPorCarpeta: { 'carpeta-X': [{ id: 'f1', nombre: 'factura.pdf' }] } });
  const archivos = contexto.Servicio.archivos('tok', 'SOC-1');
  assert.equal(archivos.length, 1);
  assert.equal(archivos[0].nombre, 'factura.pdf');
});

test('archivos truena si la solicitud no existe', () => {
  const { contexto } = crearContexto();
  assert.throws(() => contexto.Servicio.archivos('tok', 'NO-EXISTE'));
});

test('subirArchivo revisa permiso de edición y sube a la carpeta de la solicitud', () => {
  const libro = libroMock({ 'SOLICITUD COMPRA': hojaMock([ENCABEZADOS,
    ['SOC-1', '1', '', 'X', '', 'ABIERTA', '', 'carpeta-X', ''],
  ]) });
  const { contexto, llamadas } = crearContexto({ libro });
  const subido = contexto.Servicio.subirArchivo('tok', 'SOC-1', 'factura.pdf', 'application/pdf', 'base64datos');
  assert.equal(llamadas.permisoEditar[0], 'solicitud-compra');
  assert.equal(llamadas.subirArchivo[0].carpetaId, 'carpeta-X');
  assert.equal(llamadas.subirArchivo[0].nombreArchivo, 'factura.pdf');
  assert.equal(subido.nombre, 'factura.pdf');
});

// ---------------------------------------------------------------------------------------- marcarConvertida

test('marcarConvertida escribe ESTATUS=CONVERTIDA y NUCCO_RESULTANTE en el renglón correcto, revisando permiso de edición', () => {
  const libro = libroMock({ 'SOLICITUD COMPRA': hojaMock([ENCABEZADOS,
    ['SOC-1', '1', '', 'X', '', 'ABIERTA', '', 'c1', ''],
    ['SOC-2', '2', '', 'Y', '', 'ABIERTA', '', 'c2', ''],
  ]) });
  const { contexto, llamadas } = crearContexto({ libro });
  const r = contexto.Servicio.marcarConvertida('tok', 'SOC-2', '0451');
  assert.equal(llamadas.permisoEditar[0], 'solicitud-compra');
  assert.equal(r.ESTATUS, 'CONVERTIDA');
  assert.equal(r.NUCCO_RESULTANTE, '0451');
  const filas = libro._hojas['SOLICITUD COMPRA']._filas;
  assert.equal(filas[1][5], 'ABIERTA', 'SOC-1 no se tocó');
  assert.equal(filas[2][5], 'CONVERTIDA');
  assert.equal(filas[2][8], '0451');
});

test('marcarConvertida truena si la solicitud no existe', () => {
  const { contexto } = crearContexto();
  assert.throws(() => contexto.Servicio.marcarConvertida('tok', 'NO-EXISTE', '0451'));
});

// ---------------------------------------------------------------------------------------- actualizar

test('actualizar cambia AREA/NOMBRE en la hoja y, como el nombre cambió, renombra la carpeta real en Drive', () => {
  const libro = libroMock({ 'SOLICITUD COMPRA': hojaMock([ENCABEZADOS,
    ['SOC-1', '30371', 'CONSTRUCCIÓN', 'Camioneta Vieja', '', 'ABIERTA', '', 'carpeta-1', ''],
  ]) });
  const carpeta = carpetaMock('30371-Camioneta Vieja');
  const { contexto, llamadas } = crearContexto({ libro, carpetasPorId: { 'carpeta-1': carpeta } });

  const r = contexto.Servicio.actualizar('tok', 'SOC-1', { AREA: 'OPERACIONES', NOMBRE: 'Camioneta Nueva' });
  assert.equal(llamadas.permisoEditar[0], 'solicitud-compra');
  assert.equal(r.NOMBRE, 'Camioneta Nueva');
  assert.equal(r.AREA, 'OPERACIONES');
  assert.equal(carpeta.getName(), '30371-Camioneta Nueva', 'la carpeta real quedó renombrada, con el folio al frente');
  const filas = libro._hojas['SOLICITUD COMPRA']._filas;
  assert.equal(filas[1][3], 'Camioneta Nueva');
  assert.equal(filas[1][2], 'OPERACIONES');
});

test('actualizar no toca Drive si el nombre no cambió (solo AREA)', () => {
  const libro = libroMock({ 'SOLICITUD COMPRA': hojaMock([ENCABEZADOS,
    ['SOC-1', '30371', 'CONSTRUCCIÓN', 'Camioneta', '', 'ABIERTA', '', 'carpeta-1', ''],
  ]) });
  const { contexto, llamadas } = crearContexto({ libro });   // sin registrar carpeta-1: si la pidiera, tronaría
  contexto.Servicio.actualizar('tok', 'SOC-1', { AREA: 'OPERACIONES', NOMBRE: 'Camioneta' });
  assert.equal(llamadas.getFolderById, null, 'nunca pidió la carpeta');
});

test('actualizar truena y no cambia la hoja si falla el renombrado en Drive (p. ej. sin permiso)', () => {
  const libro = libroMock({ 'SOLICITUD COMPRA': hojaMock([ENCABEZADOS,
    ['SOC-1', '30371', '', 'Camioneta Vieja', '', 'ABIERTA', '', 'carpeta-1', ''],
  ]) });
  const carpeta = carpetaMock('30371-Camioneta Vieja');
  carpeta.setName = () => { throw new Error('No access'); };
  const { contexto } = crearContexto({ libro, carpetasPorId: { 'carpeta-1': carpeta } });
  assert.throws(() => contexto.Servicio.actualizar('tok', 'SOC-1', { NOMBRE: 'Camioneta Nueva' }), /No se pudo renombrar/);
  assert.equal(libro._hojas['SOLICITUD COMPRA']._filas[1][3], 'Camioneta Vieja', 'la hoja se quedó como estaba');
});

test('actualizar exige nombre y truena si el ID no existe', () => {
  const { contexto } = crearContexto();
  assert.throws(() => contexto.Servicio.actualizar('tok', 'SOC-1', { NOMBRE: '' }), /nombre/i);

  const libro = libroMock({ 'SOLICITUD COMPRA': hojaMock([ENCABEZADOS,
    ['SOC-1', '1', '', 'X', '', 'ABIERTA', '', 'c1', ''],
  ]) });
  const { contexto: ctx2 } = crearContexto({ libro });
  assert.throws(() => ctx2.Servicio.actualizar('tok', 'NO-EXISTE', { NOMBRE: 'Y' }), /No se encontró/);
});
