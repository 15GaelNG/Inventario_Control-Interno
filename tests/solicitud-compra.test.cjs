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

function carpetaRaizMock(subcarpetasIniciales) {
  const subcarpetas = Object.assign({}, subcarpetasIniciales);
  return {
    getFoldersByName(nombre) {
      const existe = subcarpetas[nombre];
      const lista = existe ? [existe] : [];
      let i = 0;
      return { hasNext: () => i < lista.length, next: () => lista[i++] };
    },
    createFolder(nombre) {
      const nueva = { getId: () => 'id-' + nombre, getUrl: () => 'https://drive.google.com/drive/folders/id-' + nombre };
      subcarpetas[nombre] = nueva;
      return nueva;
    },
    _subcarpetas: subcarpetas,
  };
}

function crearContexto({ libro, archivosPorCarpeta = {}, subcarpetasIniciales = {} } = {}) {
  const llamadas = { carpetaEnRaiz: null, subirArchivo: [], permisoLeer: [], permisoEditar: [], tocarHoja: 0 };
  const libroVehiculos = libro || libroMock();
  const raiz = carpetaRaizMock(subcarpetasIniciales);
  const contexto = vm.createContext({
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS' } },
    Permisos: {
      puedeLeer: (token, modulo) => { llamadas.permisoLeer.push(modulo); },
      puedeEditar: (token, modulo) => { llamadas.permisoEditar.push(modulo); },
    },
    SpreadsheetApp: { openById: (id) => libroVehiculos },
    DriveUtils: {
      carpetaEnRaiz: (nombre) => { llamadas.carpetaEnRaiz = nombre; return raiz; },
      archivosDeCarpeta: (id) => archivosPorCarpeta[id] || [],
    },
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
  return { contexto, llamadas, libro: libroVehiculos, raiz };
}

// ---------------------------------------------------------------------------------------- crear

test('crear hace la hoja SOLICITUD COMPRA la primera vez, la subcarpeta "<FOLIO>-<NOMBRE>" y llena CARPETA_ID/LIGA_CARPETA/ESTATUS', () => {
  const { contexto, llamadas, libro } = crearContexto();
  const creada = contexto.Servicio.crear('tok', { FOLIO: '30371', AREA: 'CONSTRUCCIÓN', NOMBRE: 'Camioneta para Construcción' });

  assert.equal(llamadas.permisoEditar[0], 'solicitud-compra');
  assert.equal(llamadas.carpetaEnRaiz, 'SOLICITUDES_COMPRA');
  assert.equal(creada.ESTATUS, 'ABIERTA');
  assert.equal(creada.FOLIO, '30371');
  assert.equal(creada.CARPETA_ID, 'id-30371-Camioneta para Construcción');
  assert.equal(creada.LIGA_CARPETA, 'https://drive.google.com/drive/folders/id-30371-Camioneta para Construcción');
  assert.ok(creada.FECHA, 'FECHA se pone sola y viaja como ISO');
  assert.ok(libro._hojas['SOLICITUD COMPRA'], 'la hoja se creó sola');
  assert.deepEqual(libro._hojas['SOLICITUD COMPRA']._filas[0], ENCABEZADOS);
});

test('crear truena sin folio o sin nombre, sin tocar Drive', () => {
  const { contexto, llamadas } = crearContexto();
  assert.throws(() => contexto.Servicio.crear('tok', { NOMBRE: 'Algo' }), /folio/i);
  assert.throws(() => contexto.Servicio.crear('tok', { FOLIO: '1' }), /nombre/i);
  assert.equal(llamadas.carpetaEnRaiz, null, 'nunca llegó a pedir la carpeta');
});

test('crear reusa la subcarpeta si ya existe una con ese mismo nombre (no crea una segunda)', () => {
  const existente = { getId: () => 'YA-EXISTE', getUrl: () => 'https://drive/ya-existe' };
  const { contexto, raiz } = crearContexto({ subcarpetasIniciales: { '100-Prueba': existente } });
  const creada = contexto.Servicio.crear('tok', { FOLIO: '100', NOMBRE: 'Prueba' });
  assert.equal(creada.CARPETA_ID, 'YA-EXISTE');
  assert.equal(Object.keys(raiz._subcarpetas).length, 1, 'sigue habiendo una sola carpeta con ese nombre');
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
