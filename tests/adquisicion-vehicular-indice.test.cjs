// Constructor del índice propio de Adquisición Vehicular (AdquisicionVehicularIndice.gs): llena
// ADQUISICION_VEHICULAR_INDICE en dos pasadas -- Excel (2024/2025, rápida) y OCR de facturas
// (solo lo que el Excel no cubre, hoy básicamente 2026). AdquisicionVehicularService se mockea
// completo: estas pruebas son del constructor, no de ese servicio (ver adquisicion-vehicular.test.cjs).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function hojaMock(filasIniciales) {
  const filas = (filasIniciales || []).map((f) => f.slice());
  return {
    getName: () => 'INDICE ADQUISICION',
    getLastRow: () => filas.length,
    getMaxRows: () => Math.max(1000, filas.length),
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
    deleteRows(row, n) { filas.splice(row - 1, n); },
    appendRow(fila) { filas.push(fila.slice()); },
    setFrozenRows() { return this; },
    _filas: filas,
  };
}

function propertiesServiceMock() {
  const store = {};
  return { getScriptProperties: () => ({
    getProperty: (k) => (k in store ? store[k] : null),
    setProperty: (k, v) => { store[k] = v; },
  }) };
}

function scriptAppMock() {
  const triggers = [];
  return {
    _triggers: triggers,
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: (t) => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
    newTrigger: (fn) => ({
      timeBased: () => ({ after: () => ({ create: () => { const t = { getHandlerFunction: () => fn }; triggers.push(t); return t; } }) }),
    }),
  };
}

const ENCABEZADOS_INDICE = ['SERIE', 'FOLIO', 'AREA', 'AÑO', 'LIGA_CARPETA', 'FUENTE', 'ACTUALIZADO'];

function crearContexto({ hojaIndice, listarCarpetas = () => [], leerFuente = () => [], fuentes = [{ año: '2024' }, { año: '2025' }],
  buscarEnListaCarpetas = () => '', buscarCarpetaPorFolio = () => '', archivosPorCarpeta = {}, drivePropsStore, listaFinal = [] } = {}) {
  const hoja = hojaIndice || hojaMock([ENCABEZADOS_INDICE]);
  const propiedades = drivePropsStore || propertiesServiceMock();
  const scriptApp = scriptAppMock();
  const contexto = vm.createContext({
    soloEditor_: () => {},
    ADQUISICION_VEHICULAR_LISTA_FINAL_: listaFinal,
    AdquisicionVehicularService: {
      indiceHoja_: () => hoja,
      listarCarpetasAdquisicion_: listarCarpetas,
      leerFuente_: leerFuente,
      buscarEnListaCarpetas_: buscarEnListaCarpetas,
      buscarCarpetaPorFolio_: buscarCarpetaPorFolio,
      FUENTES: fuentes,
      ENCABEZADOS_INDICE,
      normalizarSerie_: (s) => String(s || '').toUpperCase().replace(/\s+/g, ''),
    },
    DriveApp: {
      getFolderById: (id) => ({
        getFiles: () => {
          const lista = archivosPorCarpeta[id] || [];
          let i = 0;
          return { hasNext: () => i < lista.length, next: () => lista[i++] };
        },
        setTrashed: () => {},
      }),
    },
    DriveUtils: { ...require('./drive-utils-real')(), carpetaEnRaiz: () => ({ getId: () => 'TEMP-FOLDER' }) },
    CacheHojas: { tocarHoja: () => {} },
    Drive: { Files: { copy: (meta, id) => ({ id: 'copia-' + id }) } },
    DocumentApp: { openById: (id) => ({ getBody: () => ({ getText: () => (contexto._textoOcr || {})[id] || '' }) }) },
    PropertiesService: propiedades,
    ScriptApp: scriptApp,
    console,
  });
  require('./sheet-utils-real')(contexto);   // escribe por SheetUtils (28-oct)
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/services/AdquisicionVehicularIndice.gs'), 'utf8'), contexto);
  return { contexto, hoja, scriptApp, propiedades };
}

// ---------------------------------------------------------------------------------------- series del texto (VIN)

test('indiceAdqSeriesDelTexto_ saca un VIN de 17 caracteres aunque haya ruido alrededor', () => {
  const { contexto } = crearContexto();
  const texto = 'NRO. DE SERIE: JN1BE6DS1R9105926\nNo. de Motor: QR25845769Q\nColor: BLANCO';
  assert.deepEqual(Array.from(contexto.indiceAdqSeriesDelTexto_(texto)), ['JN1BE6DS1R9105926']);
});

test('indiceAdqSeriesDelTexto_ no confunde I/O/Q (fuera del alfabeto de un VIN) y saca varias series sin repetir', () => {
  const { contexto } = crearContexto();
  const texto = 'Unidad 1: JN1BE6DS1R9105926. Unidad 2: 3C7WRAKT9RG165067. Repetida: JN1BE6DS1R9105926.';
  assert.deepEqual(Array.from(contexto.indiceAdqSeriesDelTexto_(texto)), ['JN1BE6DS1R9105926', '3C7WRAKT9RG165067']);
  assert.deepEqual(Array.from(contexto.indiceAdqSeriesDelTexto_('sin ningún VIN aquí')), []);
});

// ---------------------------------------------------------------------------------------- candidatas de OCR

test('indiceAdqCandidatasOcr_ parsea folio/área del nombre de la carpeta y se salta lo ya indexado', () => {
  const hojaIndice = hojaMock([ENCABEZADOS_INDICE, ['JN1BE6DS1R9105926', '30371', 'CONSTRUCCIÓN', '2025', '', 'EXCEL-2025', '']]);
  const { contexto } = crearContexto({
    hojaIndice,
    listarCarpetas: () => [
      { año: '2025', nombre: '30371-CONSTRUCCIÓN', id: 'C1', url: 'https://drive/C1' },   // ya en el índice (Excel): se salta
      { año: '2026', nombre: '60134-CONSTRUCCIÓN', id: 'C2', url: 'https://drive/C2' },   // nueva: candidata
      { año: '2026', nombre: 'SIN TICKET - CONSTRUCCIÓN', id: 'C3', url: 'https://drive/C3' },   // sin folio numérico: se ignora
    ],
  });
  const candidatas = contexto.indiceAdqCandidatasOcr_(hojaIndice);
  assert.equal(candidatas.length, 1);
  assert.equal(candidatas[0].folio, '60134');
  assert.equal(candidatas[0].area, 'CONSTRUCCIÓN');
  assert.equal(candidatas[0].año, '2026');
});

// ---------------------------------------------------------------------------------------- archivo de factura

test('indiceAdqFactura_ prefiere el PDF de factura sobre el XML del CFDI, y null si no hay ninguno', () => {
  const archivo = (nombre, mime) => ({ getName: () => nombre, getMimeType: () => mime, getId: () => nombre });
  const { contexto } = crearContexto({
    archivosPorCarpeta: {
      CON_FACTURA: [
        archivo('09-FOTOS-30371', 'application/vnd.google-apps.folder'),
        archivo('06-FACTURA XML-30371', 'text/xml'),
        archivo('05-FACTURA ESCANEADA-30371', 'application/pdf'),
      ],
      SIN_FACTURA: [archivo('01- SOLICITUD- 60134', 'application/pdf'), archivo('02- AUTORIZACIÓN-60134', 'application/pdf')],
    },
  });
  const factura = contexto.indiceAdqFactura_('CON_FACTURA');
  assert.equal(factura.getName(), '05-FACTURA ESCANEADA-30371');
  assert.equal(contexto.indiceAdqFactura_('SIN_FACTURA'), null, 'solicitud todavía sin factura subida');
});

// ---------------------------------------------------------------------------------------- pasada A (Excel)

test('indiceAdqPasadaExcel_ reemplaza solo las filas de cada FUENTE, prefiriendo SIEMPRE la carpeta real de Drive sobre lo que traiga el Excel', () => {
  const hojaIndice = hojaMock([ENCABEZADOS_INDICE,
    ['VIEJA', '9', 'X', '2024', '', 'EXCEL-2024', 'ayer'],       // de una corrida anterior: debe desaparecer
    ['OTRA-FUENTE', '1', 'Y', '2026', '', 'OCR-2026', 'ayer']]); // de otra FUENTE: no se toca
  const { contexto } = crearContexto({
    hojaIndice,
    fuentes: [
      { año: '2024', colCarpeta: true },
      { año: '2025' },
    ],
  });
  // leerFuente_ regresa una fila por fuente, usando fuente.año para distinguir cuál es cuál
  contexto.AdquisicionVehicularService.leerFuente_ = (fuente) => (fuente.año === '2024'
    ? [{ serie: '3C7WRAKT9RG165067', año: '2024', folio: '3', area: 'CONSTRUCCIÓN', liga: '', nombreCarpeta: '00 - NOVIEMBRE 23 - RAM4000 CMP' }]
    : [{ serie: 'JN1BE6DS1R9105926', año: '2025', folio: '30371', area: 'CONSTRUCCIÓN', liga: 'https://dropbox/x', nombreCarpeta: '' }]);
  // 2024: el folio ("3") no aparece como prefijo del nombre real -- falla la búsqueda por folio, cae al nombre
  // 2025: "30371-CONSTRUCCIÓN" SÍ existe en Drive -- gana sobre el link de Dropbox que trae el Excel
  contexto.AdquisicionVehicularService.buscarCarpetaPorFolio_ = (lista, año, folio) => (año === '2025' && folio === '30371' ? 'https://drive/real-2025' : '');
  contexto.AdquisicionVehicularService.buscarEnListaCarpetas_ = (lista, año, nombre) => (nombre === '00 - NOVIEMBRE 23 - RAM4000 CMP' ? 'https://drive/real-2024' : '');
  contexto.AdquisicionVehicularService.listarCarpetasAdquisicion_ = () => [{ año: '2024', nombre: '00 - NOVIEMBRE 23 - RAM4000 CMP' }, { año: '2025', nombre: '30371-CONSTRUCCIÓN' }];

  contexto.indiceAdqPasadaExcel_();

  const filas = hojaIndice._filas.slice(1);
  const porFuente = (f) => filas.filter((r) => r[5] === f);
  assert.equal(porFuente('EXCEL-2024').length, 1);
  assert.equal(porFuente('EXCEL-2024')[0][0], '3C7WRAKT9RG165067');
  assert.equal(porFuente('EXCEL-2024')[0][4], 'https://drive/real-2024', 'liga de 2024 resuelta por nombre de carpeta (no hay match por folio)');
  assert.equal(porFuente('EXCEL-2025').length, 1);
  assert.equal(porFuente('EXCEL-2025')[0][4], 'https://drive/real-2025', 'liga de 2025 prefiere Drive sobre el Dropbox del Excel');
  assert.equal(porFuente('OCR-2026').length, 1, 'una FUENTE distinta no se toca');
  assert.equal(filas.some((r) => r[0] === 'VIEJA'), false, 'la fila vieja de EXCEL-2024 se reemplazó');
});

test('indiceAdqPasadaExcel_ usa el link del Excel como último recurso si Drive de verdad no tiene la carpeta', () => {
  const hojaIndice = hojaMock([ENCABEZADOS_INDICE]);
  const { contexto } = crearContexto({ hojaIndice, fuentes: [{ año: '2025' }] });
  contexto.AdquisicionVehicularService.leerFuente_ = () =>
    [{ serie: 'JN1BE6DS1R9105926', año: '2025', folio: '30371', area: 'CONSTRUCCIÓN', liga: 'https://dropbox/x', nombreCarpeta: '' }];
  contexto.AdquisicionVehicularService.buscarCarpetaPorFolio_ = () => '';
  contexto.AdquisicionVehicularService.buscarEnListaCarpetas_ = () => '';
  contexto.AdquisicionVehicularService.listarCarpetasAdquisicion_ = () => [];

  contexto.indiceAdqPasadaExcel_();
  assert.equal(hojaIndice._filas[1][4], 'https://dropbox/x');
});

test('indiceAdqPasadaExcel_ no reinserta una serie que ya está cargada con FUENTE=MANUAL', () => {
  const hojaIndice = hojaMock([ENCABEZADOS_INDICE,
    ['JN1BE6DS1R9105926', '30371', 'CONSTRUCCIÓN', '2025', 'https://drive/manual', 'MANUAL', 'ayer']]);
  const { contexto } = crearContexto({ hojaIndice, fuentes: [{ año: '2025' }] });
  // El Excel vivo SÍ trae esta serie (y otra más, nueva) -- la de MANUAL se tiene que saltar, la otra no
  contexto.AdquisicionVehicularService.leerFuente_ = () => [
    { serie: 'JN1BE6DS1R9105926', año: '2025', folio: '30371', area: 'CONSTRUCCIÓN', liga: '', nombreCarpeta: '' },
    { serie: 'OTRASERIE2025XXXX', año: '2025', folio: '99999', area: 'TI', liga: 'https://drive/otra', nombreCarpeta: '' },
  ];
  contexto.AdquisicionVehicularService.buscarCarpetaPorFolio_ = () => '';
  contexto.AdquisicionVehicularService.buscarEnListaCarpetas_ = () => '';
  contexto.AdquisicionVehicularService.listarCarpetasAdquisicion_ = () => [];

  contexto.indiceAdqPasadaExcel_();

  const filas = hojaIndice._filas.slice(1);
  assert.equal(filas.filter((r) => r[0] === 'JN1BE6DS1R9105926').length, 1, 'no se duplica la serie ya en MANUAL');
  assert.equal(filas.find((r) => r[0] === 'JN1BE6DS1R9105926')[5], 'MANUAL', 'la fila que queda sigue siendo la MANUAL');
  assert.equal(filas.some((r) => r[0] === 'OTRASERIE2025XXXX' && r[5] === 'EXCEL-2025'), true, 'una serie nueva sí se agrega normal');
});

// ---------------------------------------------------------------------------------------- importar lista final (manual)

test('adquisicionVehicularIndice_importarListaFinal carga la semilla con FUENTE=MANUAL', () => {
  const hojaIndice = hojaMock([ENCABEZADOS_INDICE, ['VIEJA', '9', 'X', '2024', '', 'EXCEL-2024', 'ayer']]);
  const { contexto } = crearContexto({
    hojaIndice,
    listaFinal: [
      ['3C7WRAKT9RG165067', '3', 'CONSTRUCCIÓN', '2024', 'https://drive.google.com/drive/folders/abc'],
      ['9BD281HJ5SYG30459', '51', 'POSTVENTA', '2024', 'https://www.dropbox.com/scl/fo/xyz'],
    ],
  });

  const informe = contexto.adquisicionVehicularIndice_importarListaFinal();

  assert.equal(informe, 'Cargadas 2 series con FUENTE=MANUAL.');
  const filas = hojaIndice._filas.slice(1);
  assert.equal(filas.some((r) => r[0] === 'VIEJA'), true, 'no toca lo que ya había de otra FUENTE');
  const manual = filas.filter((r) => r[5] === 'MANUAL');
  assert.equal(manual.length, 2);
  assert.deepEqual(manual.map((r) => r[0]).sort(), ['3C7WRAKT9RG165067', '9BD281HJ5SYG30459']);
  assert.equal(manual.find((r) => r[0] === '9BD281HJ5SYG30459')[4], 'https://www.dropbox.com/scl/fo/xyz', 'también carga ligas de Dropbox');
});

test('adquisicionVehicularIndice_importarListaFinal es idempotente: correrla dos veces no duplica', () => {
  const hojaIndice = hojaMock([ENCABEZADOS_INDICE]);
  const { contexto } = crearContexto({
    hojaIndice,
    listaFinal: [['3C7WRAKT9RG165067', '3', 'CONSTRUCCIÓN', '2024', 'https://drive.google.com/drive/folders/abc']],
  });

  contexto.adquisicionVehicularIndice_importarListaFinal();
  contexto.adquisicionVehicularIndice_importarListaFinal();

  const manual = hojaIndice._filas.slice(1).filter((r) => r[5] === 'MANUAL');
  assert.equal(manual.length, 1, 'la segunda corrida reemplaza, no agrega');
});

// ---------------------------------------------------------------------------------------- estado / informe

test('adquisicionVehicularIndice_estado dice "Sin correr" si nunca se ha corrido', () => {
  const { contexto } = crearContexto();
  assert.equal(contexto.adquisicionVehicularIndice_estado(), 'Sin correr');
});

test('adquisicionVehicularIndice_detener marca DETENIDO y borra el trigger de continuar', () => {
  const propiedades = propertiesServiceMock();
  propiedades.getScriptProperties().setProperty('ADQUISICION_VEHICULAR_INDICE_ESTADO', JSON.stringify({ fase: 'OCR', procesados: 1, errores: 0 }));
  const { contexto, scriptApp } = crearContexto({ drivePropsStore: propiedades });
  scriptApp._triggers.push({ getHandlerFunction: () => 'adquisicionVehicularIndice_continuar' });
  contexto.adquisicionVehicularIndice_detener();
  const guardado = JSON.parse(propiedades.getScriptProperties().getProperty('ADQUISICION_VEHICULAR_INDICE_ESTADO'));
  assert.equal(guardado.fase, 'DETENIDO');
  assert.equal(scriptApp._triggers.length, 0);
});
