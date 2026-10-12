// Adquisición Vehicular (proceso externo, fuera de esta app): AdquisicionVehicularService.buscar
// YA NO lee los Excel externos en vivo (se rompió dos veces por su formato -- ver
// AdquisicionVehicularIndice.gs) -- consulta la hoja propia ADQUISICION_VEHICULAR_INDICE.
// leerFuente_/listarCarpetasAdquisicion_/buscarEnListaCarpetas_ son lo que usa el constructor de
// ese índice, no el botón de la ficha. guardarExpedienteAdquisicion (VehiculosService) sigue
// siendo el único camino para escribir FOLIO ADQUISICION / LIGA EXPEDIENTE ADQUISICION.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function hojaExcelFalsa(filas) {
  return { getSheets: () => [{ getDataRange: () => ({ getValues: () => filas }) }] };
}

function carpetaFalsa(estructura) {
  // estructura: objetos anidados por nombre de carpeta; una hoja (sin más hijos) es `null`.
  function folderDe(nombre, hijos) {
    return {
      getName: () => nombre,
      getUrl: () => 'https://drive.google.com/drive/folders/' + nombre,
      getId: () => nombre,
      getFoldersByName: (n) => {
        const lista = (hijos && hijos[n] !== undefined) ? [folderDe(n, hijos[n])] : [];
        let i = 0;
        return { hasNext: () => i < lista.length, next: () => lista[i++] };
      },
      getFolders: () => {
        const nombres = hijos ? Object.keys(hijos) : [];
        const lista = nombres.map((n) => folderDe(n, hijos[n]));
        let i = 0;
        return { hasNext: () => i < lista.length, next: () => lista[i++] };
      },
    };
  }
  const raiz = folderDe('raiz', estructura);
  return { getFolderById: () => raiz };
}

/** Hoja de cálculo en memoria: suficiente de getRange/getValues/setValues/deleteRow para
 *  indiceHoja_, mapaIndice_ y el constructor del índice. */
function hojaMock(filasIniciales) {
  const filas = (filasIniciales || []).map((f) => f.slice());
  return {
    getLastRow: () => filas.length,
    getRange(row, col, numRows, numCols) {
      return {
        setValues(valores) {
          valores.forEach((fila, i) => { filas[row - 1 + i] = fila.slice(); });
          return this;
        },
        getValues() {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const fila = filas[row - 1 + r] || [];
            out.push(Array.from({ length: numCols }, (_, c) => (fila[col - 1 + c] !== undefined ? fila[col - 1 + c] : '')));
          }
          return out;
        },
        setFontWeight() { return this; },
      };
    },
    deleteRow(row) { filas.splice(row - 1, 1); },
    setFrozenRows() { return this; },
  };
}

function libroMock() {
  const hojas = {};
  return { getSheetByName: (nombre) => hojas[nombre] || null, insertSheet(nombre) { hojas[nombre] = hojaMock([]); return hojas[nombre]; } };
}

function crearContexto({ fuentes2024 = [], fuentes2025 = [], fuentes2026 = [], drive = {}, libro } = {}) {
  const libroVehiculos = libro || libroMock();
  const contexto = vm.createContext({
    Permisos: { puedeLeer: () => {}, puedeEditar: () => {} },
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS_VEH' } },
    CacheHojas: { recordar: (clave, hojas2, armar) => armar() },   // sin caché: cada llamada relee la hoja
    SpreadsheetApp: {
      openById: (id) => {
        if (id === 'SS_VEH') return libroVehiculos;
        if (id === '1dduU0ItSqOi7T3qoY_m1h_RW0sY7LxsS') return hojaExcelFalsa(fuentes2024);
        if (id === '13KU1abKg1MzSRzH8vAFoS0MwnqFWjyLj') return hojaExcelFalsa(fuentes2025);
        if (id === '1lKg7bcODcAiFcqkJK9I0ShEL5wxWL1x7') return hojaExcelFalsa(fuentes2026);
        throw new Error('spreadsheet no esperado: ' + id);
      },
    },
    DriveApp: carpetaFalsa(drive),
    console,
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../src/services/AdquisicionVehicularService.gs'), 'utf8') +
    '\nthis.Servicio = AdquisicionVehicularService;',
    contexto
  );
  return { contexto, libroVehiculos };
}

// Encabezados reales (confirmados leyendo el .xlsx descomprimido, no el resumen de Drive -- ver
// el comentario en AdquisicionVehicularService.gs sobre el bug del 12-oct-2026).
const ENCABEZADO_2024 = ['NO. SERIE', 'FOLIO', 'ÁREA SOLICITANTE', 'NOMBRE DE LA CARPETA'];
const ENCABEZADO_2025 = ['# DE SERIE', 'TICKET HELP', 'ÁREA SOLICITANTE', 'LIGA DE LA CARPETA'];

// ---------------------------------------------------------------------------------------- leerFuente_

test('leerFuente_ regresa TODAS las filas de la fuente, no solo la primera', () => {
  const { contexto } = crearContexto({
    fuentes2024: [ENCABEZADO_2024,
      ['3C7WRAKT9RG165067', '3', 'CONSTRUCCIÓN', '00 - NOVIEMBRE 23 - RAM4000 CMP'],
      ['3N1CN8AE4RL847016', '1', 'CAPITAL HUMANO', '00- SEPTIEMBRE 2023 - XOCHITL']],
  });
  const filas = contexto.Servicio.leerFuente_(contexto.Servicio.FUENTES[0]);
  assert.equal(filas.length, 2);
  assert.equal(filas[0].serie, '3C7WRAKT9RG165067');
  assert.equal(filas[1].folio, '1');
});

test('leerFuente_ separa varias series en una sola celda (compra de lote)', () => {
  const { contexto } = crearContexto({
    fuentes2025: [ENCABEZADO_2025, ['ABC111 DEF222 GHI333', '30', 'COMERCIALIZACIÓN', 'https://dropbox.example/lote']],
  });
  const filas = contexto.Servicio.leerFuente_(contexto.Servicio.FUENTES[1]);
  assert.deepEqual(Array.from(filas.map((f) => f.serie)), ['ABC111', 'DEF222', 'GHI333']);
  assert.ok(filas.every((f) => f.folio === '30'));
});

test('leerFuente_ encuentra el encabezado aunque no sea el primer renglón (el archivo real de 2025 trae 5 filas de título encima)', () => {
  const { contexto } = crearContexto({
    fuentes2025: [
      ['SEGUIMIENTO A TICKETS|HELPDESK', '', '', 'AHORROS'], [], ['', '', '', '', '', '', '', '', '', '3'], [], ['', '', '46034'],
      ENCABEZADO_2025,
      ['JN1BE6DS1R9105926', '30371', 'CONSTRUCCIÓN', 'https://www.dropbox.com/scl/fo/x'],
    ],
  });
  const filas = contexto.Servicio.leerFuente_(contexto.Servicio.FUENTES[1]);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].folio, '30371');
});

test('FUENTES incluye 2026 (el HISTORICO maestro estaba en la raíz de la carpeta Drive del año, no se vio a la primera -- 12-oct-2026) con el mismo formato que 2025', () => {
  const { contexto } = crearContexto({
    fuentes2026: [ENCABEZADO_2025, ['MMBM7U5G7TH018473', '60134', 'CONSTRUCCION', '']],
  });
  assert.equal(contexto.Servicio.FUENTES.length, 3);
  const fuente2026 = contexto.Servicio.FUENTES.find((f) => f.año === '2026');
  assert.ok(fuente2026, 'debe existir una fuente para 2026');
  const filas = contexto.Servicio.leerFuente_(fuente2026);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].folio, '60134');
});

// ---------------------------------------------------------------------------------- carpetas de Drive

test('listarCarpetasAdquisicion_ ignora carpetas de año con otro nombre (REPORTE ANUAL PROVEEDORES) y recorre años/meses/solicitudes', () => {
  const { contexto } = crearContexto({
    drive: { '2024': { '11. NOVIEMBRE': { '00 - NOVIEMBRE 23 - RAM4000 CMP': null } }, 'REPORTE ANUAL PROVEEDORES': {} },
  });
  const carpetas = contexto.Servicio.listarCarpetasAdquisicion_();
  assert.equal(carpetas.length, 1);
  assert.equal(carpetas[0].año, '2024');
  assert.equal(carpetas[0].nombre, '00 - NOVIEMBRE 23 - RAM4000 CMP');
});

test('buscarCarpetaPorFolio_ encuentra por "<folio>-" al inicio del nombre (la convención real de 2025/2026)', () => {
  const { contexto } = crearContexto();
  const lista = [{ año: '2025', nombre: '30371-CONSTRUCCIÓN', url: 'https://drive/30371' }, { año: '2025', nombre: '30888-DIRECCIÓN GENERAL', url: 'https://drive/30888' }];
  assert.equal(contexto.Servicio.buscarCarpetaPorFolio_(lista, '2025', '30371'), 'https://drive/30371');
  assert.equal(contexto.Servicio.buscarCarpetaPorFolio_(lista, '2025', '303'), '', 'no matchea un folio que solo es prefijo de otro folio');
  assert.equal(contexto.Servicio.buscarCarpetaPorFolio_(lista, '2024', '30371'), '', 'año distinto no matchea');
});

test('buscarEnListaCarpetas_ encuentra por nombre dentro del año dado, sin volver a tocar Drive', () => {
  const { contexto } = crearContexto();
  const lista = [{ año: '2024', nombre: '00 - NOVIEMBRE 23 - RAM4000 CMP', url: 'https://drive/x' }];
  assert.equal(contexto.Servicio.buscarEnListaCarpetas_(lista, '2024', '00 - NOVIEMBRE 23 - RAM4000 CMP'), 'https://drive/x');
  assert.equal(contexto.Servicio.buscarEnListaCarpetas_(lista, '2025', '00 - NOVIEMBRE 23 - RAM4000 CMP'), '', 'año distinto no matchea');
  assert.equal(contexto.Servicio.buscarEnListaCarpetas_(lista, '2024', 'NO EXISTE'), '');
});

// ---------------------------------------------------------------------------------------------- buscar

test('buscar lee del índice propio (ADQUISICION_VEHICULAR_INDICE), no abre ningún Excel externo', () => {
  const libro = libroMock();
  const hoja = libro.insertSheet('ADQUISICION_VEHICULAR_INDICE');
  hoja.getRange(1, 1, 1, 7).setValues([['SERIE', 'FOLIO', 'AREA', 'AÑO', 'LIGA_CARPETA', 'FUENTE', 'ACTUALIZADO']]);
  hoja.getRange(2, 1, 1, 7).setValues([['JN1BE6DS1R9105926', '30371', 'CONSTRUCCIÓN', '2025', 'https://drive/x', 'EXCEL-2025', '2026-10-12']]);
  const { contexto } = crearContexto({ libro });
  const resultado = contexto.Servicio.buscar('tok', '  jn1be6ds1r9105926 ');
  assert.deepEqual(Object.assign({}, resultado), { año: '2025', folio: '30371', area: 'CONSTRUCCIÓN', liga: 'https://drive/x' });
});

test('buscar regresa null si la serie no está en el índice', () => {
  const libro = libroMock();
  const hoja = libro.insertSheet('ADQUISICION_VEHICULAR_INDICE');
  hoja.getRange(1, 1, 1, 7).setValues([['SERIE', 'FOLIO', 'AREA', 'AÑO', 'LIGA_CARPETA', 'FUENTE', 'ACTUALIZADO']]);
  hoja.getRange(2, 1, 1, 7).setValues([['AAA', '1', 'X', '2024', '', 'EXCEL-2024', '2026-10-12']]);
  const { contexto } = crearContexto({ libro });
  assert.equal(contexto.Servicio.buscar('tok', 'BBBBBB'), null);
});

test('buscar regresa null sin tronar si el índice todavía no existe (nadie lo ha corrido)', () => {
  const { contexto } = crearContexto({ libro: libroMock() });
  assert.equal(contexto.Servicio.buscar('tok', 'CUALQUIERA'), null);
});

// ---------------------------------------------------------------------------- VehiculosService.guardarExpedienteAdquisicion

function crearContextoVehiculos() {
  const llamadas = { update: [] };
  const contexto = vm.createContext({
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS' } },
    Permisos: { puedeEditar: (token, modulo) => { llamadas.permisoPedido = modulo; } },
    SheetUtils: {
      update: (ssId, hoja, id, cambios) => { llamadas.update.push({ ssId, hoja, id, cambios: Object.assign({}, cambios) }); return cambios; },
    },
    console,
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../src/services/VehiculosService.gs'), 'utf8') +
    '\nthis.Servicio = VehiculosService;',
    contexto
  );
  return { contexto, llamadas };
}

test('guardarExpedienteAdquisicion escribe FOLIO ADQUISICION y LIGA EXPEDIENTE ADQUISICION, revisando permiso de edición', () => {
  const { contexto, llamadas } = crearContextoVehiculos();
  contexto.Servicio.guardarExpedienteAdquisicion('tok', 'VEH-1', {
    'FOLIO ADQUISICION': '30371', 'LIGA EXPEDIENTE ADQUISICION': 'https://drive.example/x',
  });
  assert.equal(llamadas.permisoPedido, 'vehiculos');
  assert.equal(llamadas.update.length, 1);
  assert.equal(llamadas.update[0].id, 'VEH-1');
  assert.deepEqual(llamadas.update[0].cambios, {
    'FOLIO ADQUISICION': '30371', 'LIGA EXPEDIENTE ADQUISICION': 'https://drive.example/x',
  });
});

test('noEditables sigue bloqueando FOLIO ADQUISICION / LIGA EXPEDIENTE ADQUISICION en la edición normal', () => {
  const codigo = fs.readFileSync(path.join(__dirname, '../src/services/VehiculosService.gs'), 'utf8');
  assert.match(codigo, /noEditables:\s*\[[^\]]*'FOLIO ADQUISICION'[^\]]*\]/);
  assert.match(codigo, /noEditables:\s*\[[^\]]*'LIGA EXPEDIENTE ADQUISICION'[^\]]*\]/);
});
