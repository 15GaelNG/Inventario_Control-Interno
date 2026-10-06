// Parte 6, pendiente 2.3 (usuario, 6-oct): OBSERVACIONES → COMENTARIO en INSPECCIONES y RESPONSIVAS LINEAS. La responsiva
// sigue con DIRECTOR (el director) y la inspección con JEFE DIRECTO. Mientras la hoja siga con el nombre viejo,
// LineasDatos lo trata como el nuevo; las copias de las plantillas cambian el título que se lee y el marcador de la
// columna sola (LineasPdf.renombresEnTexto).
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

test('la hoja con los nombres viejos se lee y se escribe con los nuevos', () => {
  const D = cargarDatos({
    'RESPONSIVAS LINEAS': [['ID', 'RESPONSABLE', 'DIRECTOR', 'OBSERVACIONES'], ['RLI-1', 'ANA', 'LUIS', 'ENTREGA']],
    'INSPECCIONES LINEAS': [['ID', 'JEFE DIRECTO', 'OBSERVACIONES'], ['ILI-1', 'LUIS', 'SIN DAÑOS']],
    'ASIGNACIONES': [['ID', 'DIRECTOR', 'JEFE DIRECTO'], ['ASG-1', 'MARTA', 'LUIS']],
  });
  const r = D.tablaFresca('RESPONSIVAS LINEAS');
  assert.equal(D.colIndice(r, 'COMENTARIO'), 3);
  assert.equal(D.colIndice(r, 'OBSERVACIONES'), -1, 'el nombre viejo ya no se usa');
  assert.equal(D.colIndice(r, 'DIRECTOR'), 2, 'la responsiva lleva al director');
  assert.equal(D.colIndice(r, 'JEFE DIRECTO'), -1);
  const fila = D.leerTabla('RESPONSIVAS LINEAS')[0];
  assert.equal(fila['DIRECTOR'], 'LUIS');
  assert.equal(fila['COMENTARIO'], 'ENTREGA');

  const i = D.tablaFresca('INSPECCIONES LINEAS');
  assert.equal(D.colIndice(i, 'COMENTARIO'), 2);
  assert.equal(D.colIndice(i, 'JEFE DIRECTO'), 1, 'la inspección ya tenía JEFE DIRECTO');

  // DIRECTOR de ASIGNACIONES es el director de la persona (Capital Humano): no se toca
  const a = D.tablaFresca('ASIGNACIONES');
  assert.equal(D.colIndice(a, 'DIRECTOR'), 1);
  assert.equal(D.colIndice(a, 'JEFE DIRECTO'), 2);
});

test('con la hoja ya renombrada no cambia nada, y si están los dos se queda cada uno', () => {
  const D = cargarDatos({
    'RESPONSIVAS LINEAS': [['ID', 'COMENTARIO', 'DIRECTOR', 'OBSERVACIONES'], ['RLI-1', 'ENTREGA', 'LUIS', 'VIEJO']],
  });
  const r = D.tablaFresca('RESPONSIVAS LINEAS');
  assert.equal(D.colIndice(r, 'COMENTARIO'), 1);
  assert.equal(D.colIndice(r, 'DIRECTOR'), 2);
  assert.equal(D.colIndice(r, 'OBSERVACIONES'), 3);
});

function cargarPdf() {
  const ctx = vm.createContext({ console });
  vm.runInContext(read('src/services/lineas/LineasPdf.gs') + '\nthis.P = LineasPdf;', ctx);
  return ctx.P;
}

// renombresEnTexto sirve para cualquier columna renombrada: se prueba también con una segunda (DIRECTOR)
test('las copias de las plantillas cambian el título y el marcador de la columna sola', () => {
  const P = cargarPdf();
  const mapa = { OBSERVACIONES: 'COMENTARIO', DIRECTOR: 'JEFE DIRECTO' };
  const aplicar = (texto) => {
    let s = texto;
    JSON.parse(JSON.stringify(P.renombresEnTexto(texto, mapa))).filter((c) => c.despues).reverse()
      .forEach((c) => { s = s.slice(0, c.inicio) + c.despues + s.slice(c.fin); });
    return s;
  };
  assert.equal(aplicar('OBSERVACIONES: <<[OBSERVACIONES]>>'), 'COMENTARIO: <<[COMENTARIO]>>');
  assert.equal(aplicar('Observaciones <<OBSERVACIONES>>'), 'Comentario <<COMENTARIO>>');
  assert.equal(aplicar('Director: <<UPPER([DIRECTOR])>>'), 'Jefe directo: <<UPPER([JEFE DIRECTO])>>');
  assert.equal(aplicar('director'), 'jefe directo');
  // Otra columna que solo contiene la palabra no se toca, y se avisa
  const otra = '<<[TITULO_CALIFICACION OBSERVACIONES Y FIRMAS]>>';
  assert.equal(aplicar(otra), otra);
  const r = JSON.parse(JSON.stringify(P.renombresEnTexto(otra, mapa)));
  assert.equal(r.length, 1);
  assert.equal(r[0].despues, null);
  assert.equal(r[0].marcador, otra);
  // Palabras más largas no cuentan
  assert.deepEqual(JSON.parse(JSON.stringify(P.renombresEnTexto('DIRECTORA, DIRECTORES, SUBDIRECTOR', mapa))), []);
  // Con el mapa de hoy (solo OBSERVACIONES) «Director» no se toca
  assert.deepEqual(JSON.parse(JSON.stringify(P.renombresEnTexto('Director', { OBSERVACIONES: 'COMENTARIO' }))), []);
});

test('las plantillas del AppSheet quedan aparte de las del sistema', () => {
  const P = cargarPdf();
  assert.equal(P.PLANTILLAS_APPSHEET.INSPECCION_CELULAR, '1YVYDhQ9aWOEjkqxO8_4AvHdmP3f91W7QVRB8C9kjlUI');
  assert.equal(P.PLANTILLAS_APPSHEET.RESPONSIVA_CELULAR, '1EfSbZaQwl6c3ylQ1Z60gxjOeIXAqZ7g1_IN-qfw-pMc');
  const admin = read('src/services/lineas/LineasAdmin.gs');
  assert.match(admin, /function lineasRenombrarColumnasDocumentos_revisar\(\)/);
  assert.match(admin, /function lineasPlantillasComentario_copiar\(\)/);
});
