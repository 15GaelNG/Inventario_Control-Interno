// Parte 6, pendiente 2.3 (usuario, 6-oct): OBSERVACIONES → COMENTARIO en INSPECCIONES y RESPONSIVAS LINEAS. La responsiva
// sigue con DIRECTOR (el director) y la inspección con JEFE DIRECTO. Las dos hojas se renombraron (DEV el 6-oct,
// producción el 7-oct) y el 7-oct se quitó la compatibilidad con el nombre viejo y las funciones de una sola vez.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

/** LineasDatos con un libro en memoria: { pestaña: [encabezados, ...filas] }. */
function cargarDatos(hojas) {
  const libro = {
    getSheetByName: (n) => {
      const datos = hojas[n];
      if (!datos) return null;
      return {
        getLastColumn: () => datos[0].length,
        getLastRow: () => datos.length,
        getMaxRows: () => datos.length,
        getRange: (fila, col, filas, cols) => ({
          getValues: () => datos.slice(fila - 1, fila - 1 + filas).map((r) => r.slice(col - 1, col - 1 + cols)),
        }),
      };
    },
  };
  const ctx = vm.createContext({
    Config: { SPREADSHEET_IDS: { TELEFONIA: () => 'LIBRO-PRUEBA' }, ENTORNO: 'DEV' },
    SpreadsheetApp: { openById: () => libro },
    CacheHojas: { leer: () => null, guardar: () => {}, borrar: () => {}, tocar: () => {} },
    LineasUtil: { mostrarCH: (h, v) => v, guardarCH: (h, v) => v },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    console,
  });
  vm.runInContext(read('src/services/lineas/LineasDatos.gs') + '\nthis.D = LineasDatos;', ctx);
  return ctx.D;
}

test('las hojas se leen con COMENTARIO; DIRECTOR y JEFE DIRECTO se quedan como están', () => {
  const D = cargarDatos({
    'RESPONSIVAS LINEAS': [['ID', 'RESPONSABLE', 'DIRECTOR', 'COMENTARIO'], ['RLI-1', 'ANA', 'LUIS', 'ENTREGA']],
    'INSPECCIONES LINEAS': [['ID', 'JEFE DIRECTO', 'COMENTARIO'], ['ILI-1', 'LUIS', 'SIN DAÑOS']],
    'ASIGNACIONES': [['ID', 'DIRECTOR', 'JEFE DIRECTO'], ['ASG-1', 'MARTA', 'LUIS']],
  });
  const r = D.tablaFresca('RESPONSIVAS LINEAS');
  assert.equal(D.colIndice(r, 'COMENTARIO'), 3);
  assert.equal(D.colIndice(r, 'DIRECTOR'), 2, 'la responsiva lleva al director');
  assert.equal(D.colIndice(r, 'JEFE DIRECTO'), -1);
  const fila = D.leerTabla('RESPONSIVAS LINEAS')[0];
  assert.equal(fila['DIRECTOR'], 'LUIS');
  assert.equal(fila['COMENTARIO'], 'ENTREGA');
  const i = D.tablaFresca('INSPECCIONES LINEAS');
  assert.equal(D.colIndice(i, 'COMENTARIO'), 2);
  assert.equal(D.colIndice(i, 'JEFE DIRECTO'), 1);
  const a = D.tablaFresca('ASIGNACIONES');
  assert.equal(D.colIndice(a, 'DIRECTOR'), 1);
  assert.equal(D.colIndice(a, 'JEFE DIRECTO'), 2);
});

test('sin compatibilidad: OBSERVACIONES ya no cuenta como COMENTARIO', () => {
  const D = cargarDatos({ 'RESPONSIVAS LINEAS': [['ID', 'OBSERVACIONES'], ['RLI-1', 'VIEJO']] });
  const r = D.tablaFresca('RESPONSIVAS LINEAS');
  assert.equal(D.colIndice(r, 'COMENTARIO'), -1);
  assert.equal(D.colIndice(r, 'OBSERVACIONES'), 1);
  assert.doesNotMatch(read('src/services/lineas/LineasDatos.gs'), /COLUMNAS_RENOMBRADAS/);
});

function cargarPdf() {
  const ctx = vm.createContext({ console });
  vm.runInContext(read('src/services/lineas/LineasPdf.gs') + '\nthis.P = LineasPdf;', ctx);
  return ctx.P;
}

test('las plantillas del AppSheet quedan aparte de las del sistema', () => {
  const P = cargarPdf();
  assert.equal(P.PLANTILLAS_APPSHEET.INSPECCION_CELULAR, '1YVYDhQ9aWOEjkqxO8_4AvHdmP3f91W7QVRB8C9kjlUI');
  assert.equal(P.PLANTILLAS_APPSHEET.RESPONSIVA_CELULAR, '1EfSbZaQwl6c3ylQ1Z60gxjOeIXAqZ7g1_IN-qfw-pMc');
  // El sistema usa las copias «(SISTEMA)» (6-oct), y el ajuste de impresión de la responsiva va con la copia
  assert.equal(P.PLANTILLAS.INSPECCION_CELULAR, '11l9vL9KK4T1vawnI-X0arnNTMHDa53Y92kmO-m5Alw4');
  assert.equal(P.PLANTILLAS.RESPONSIVA_CELULAR, '13qeTsLmV5FiRxgNI9hbb_8BH83olIiSVB6GdXNbXIF0');
  assert.match(read('src/services/lineas/LineasPdf.gs'), /\[PLANTILLAS\.RESPONSIVA_CELULAR\]: \{ altoFuente/);
  // Las funciones de una sola vez (renombrar columnas, copiar plantillas) ya se corrieron y se quitaron (7-oct)
  const admin = read('src/services/lineas/LineasAdmin.gs');
  assert.doesNotMatch(admin, /lineasRenombrarColumnasDocumentos|lineasPlantillasComentario/);
  assert.deepEqual(Object.keys(P).sort(), ['PLANTILLAS', 'PLANTILLAS_APPSHEET', 'generarPdfDesdePlantilla']);
});
