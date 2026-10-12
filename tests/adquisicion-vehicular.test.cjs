// Adquisición Vehicular (proceso externo, fuera de esta app): AdquisicionVehicularService.buscar
// cruza por SERIE VEHICULO contra las hojas externas conocidas (una por año, cada una con sus
// propios nombres de columna -- verificado a mano en Drive, 12-oct-2026) y nunca escribe nada
// ahí. guardarExpedienteAdquisicion (VehiculosService) es el único camino para guardar lo
// encontrado en la ficha -- noEditables bloquea la edición normal.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function hojaFalsa(filas) {
  return {
    getSheets: () => [{ getDataRange: () => ({ getValues: () => filas }) }],
  };
}

function carpetaFalsa(estructura) {
  // estructura: objetos anidados por nombre de carpeta; una hoja (sin más hijos) es `null`.
  // Ej.: { '2024': { '03. MARZO': { '03- MARZO -RAM 4000- GTO': null } } }
  function folderDe(nombre, hijos) {
    return {
      getName: () => nombre,
      getUrl: () => 'https://drive.google.com/drive/folders/' + nombre,
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

function crearContexto({ fuentes2024 = [], fuentes2025 = [], drive = {} } = {}) {
  const contexto = vm.createContext({
    Permisos: { puedeLeer: () => {}, puedeEditar: () => {} },
    SpreadsheetApp: {
      openById: (id) => {
        if (id === '1dduU0ItSqOi7T3qoY_m1h_RW0sY7LxsS') return hojaFalsa(fuentes2024);
        if (id === '13KU1abKg1MzSRzH8vAFoS0MwnqFWjyLj') return hojaFalsa(fuentes2025);
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
  return contexto;
}

// Encabezados reales (confirmados leyendo el .xlsx descomprimido, no el resumen de Drive --
// ver el comentario en AdquisicionVehicularService.gs sobre el bug del 12-oct-2026).
const ENCABEZADO_2024 = ['NO. SERIE', 'FOLIO', 'ÁREA SOLICITANTE', 'NOMBRE DE LA CARPETA'];
const ENCABEZADO_2025 = ['# DE SERIE', 'TICKET HELP', 'ÁREA SOLICITANTE', 'LIGA DE LA CARPETA'];

test('encuentra por serie en la fuente 2024 (una sola serie en la fila)', () => {
  const contexto = crearContexto({
    fuentes2024: [ENCABEZADO_2024, ['3C7WRAKT9RG165067', '3', 'CONSTRUCCIÓN', '00 - NOVIEMBRE 23 - RAM4000 CMP']],
    drive: { '2024': { '11. NOVIEMBRE': { '00 - NOVIEMBRE 23 - RAM4000 CMP': null } } },
  });
  const resultado = contexto.Servicio.buscar('tok', '3C7WRAKT9RG165067');
  assert.equal(resultado.año, '2024');
  assert.equal(resultado.folio, '3');
  assert.equal(resultado.area, 'CONSTRUCCIÓN');
  assert.match(resultado.liga, /00 - NOVIEMBRE 23 - RAM4000 CMP/);
});

test('encuentra por serie en la fuente 2025, usando LIGA DE LA CARPETA directo (sin buscar en Drive)', () => {
  const contexto = crearContexto({
    fuentes2025: [ENCABEZADO_2025, ['JN1BE6DS1R9105926', '30371', 'CONSTRUCCIÓN', 'https://www.dropbox.com/scl/fo/x']],
  });
  const resultado = contexto.Servicio.buscar('tok', 'JN1BE6DS1R9105926');
  assert.equal(resultado.año, '2025');
  assert.equal(resultado.folio, '30371');
  assert.equal(resultado.liga, 'https://www.dropbox.com/scl/fo/x');
});

test('el encabezado no siempre es el primer renglón (el archivo real de 2025 trae 5 filas de título/resumen encima)', () => {
  const filaVacia = [];
  const contexto = crearContexto({
    fuentes2025: [
      ['SEGUIMIENTO A TICKETS|HELPDESK', '', '', 'AHORROS'],
      filaVacia,
      ['', '', '', '', '', '', '', '', '', '3'],
      filaVacia,
      ['', '', '46034'],
      ENCABEZADO_2025,
      ['JN1BE6DS1R9105926', '30371', 'CONSTRUCCIÓN', 'https://www.dropbox.com/scl/fo/x'],
    ],
  });
  const resultado = contexto.Servicio.buscar('tok', 'JN1BE6DS1R9105926');
  assert.ok(resultado, 'debe saltarse las filas de título y encontrar el encabezado real más abajo');
  assert.equal(resultado.folio, '30371');
});

test('separa varias series en una sola celda (compra de lote) y encuentra la que corresponde', () => {
  const contexto = crearContexto({
    fuentes2025: [ENCABEZADO_2025,
      ['ABC111 DEF222 GHI333', '30', 'COMERCIALIZACIÓN', 'https://dropbox.example/lote']],
  });
  const resultado = contexto.Servicio.buscar('tok', 'def222');
  assert.ok(resultado, 'debe encontrar la serie DEF222 dentro de la celda con varias');
  assert.equal(resultado.folio, '30');
});

test('normaliza mayúsculas/espacios al comparar la serie buscada', () => {
  const contexto = crearContexto({
    fuentes2025: [ENCABEZADO_2025, ['JN1BE6DS1R9105926', '30371', 'CONSTRUCCIÓN', 'https://dropbox.example/x']],
  });
  const resultado = contexto.Servicio.buscar('tok', '  jn1be6ds1r9105926 ');
  assert.ok(resultado);
});

test('regresa null si la serie no aparece en ninguna fuente', () => {
  const contexto = crearContexto({
    fuentes2024: [ENCABEZADO_2024, ['AAA', '1', 'X', 'carpeta']],
    fuentes2025: [ENCABEZADO_2025, ['BBB', '2', 'Y', 'https://dropbox.example/y']],
  });
  assert.equal(contexto.Servicio.buscar('tok', 'CCCCCC'), null);
});

test('si la carpeta no existe en Drive, regresa folio/área sin liga (no truena)', () => {
  const contexto = crearContexto({
    fuentes2024: [ENCABEZADO_2024, ['3C7WRAKT9RG165067', '3', 'CONSTRUCCIÓN', '00 - NOVIEMBRE 23 - RAM4000 CMP']],
    drive: {}, // el año 2024 no existe en Drive -- igual que enero-mayo/noviembre de 2024 en la vida real
  });
  const resultado = contexto.Servicio.buscar('tok', '3C7WRAKT9RG165067');
  assert.equal(resultado.folio, '3');
  assert.equal(resultado.liga, '');
});

// --- VehiculosService.guardarExpedienteAdquisicion: único camino para escribir las dos columnas ---

function crearContextoVehiculos() {
  const llamadas = { update: [] };
  const contexto = vm.createContext({
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS' } },
    Permisos: { puedeEditar: (token, modulo) => { llamadas.permisoPedido = modulo; } },
    SheetUtils: {
      // Object.assign crea el objeto en el realm de este archivo (no el de vm): deepEqual, más
      // abajo, compara por prototipo además de por valor y cruzar vm/host realms lo rompe.
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
