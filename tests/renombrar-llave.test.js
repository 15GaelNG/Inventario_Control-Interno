/**
 * Pruebas de renombrarLlaveAnterior (src/MigracionIds.gs) y de migColumnaAnterior_.
 *
 * Es el paso 2 del pipeline por familia: la llave vieja de cada hoja pasa a llamarse igual
 * en todas, "ID ANTERIOR". Escribe encabezados, así que lo que de verdad protege esto es:
 * que no cree columnas duplicadas, que no toque la hoja si no encuentra la llave, y que los
 * pasos que LEEN esa columna sigan funcionando antes y después del renombrado — si eso se
 * rompe, el orden de los pasos se vuelve una trampa y correr dos veces rompe la migración.
 *
 * Correr: node tests/renombrar-llave.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fallas = 0;
function ok(condicion, descripcion) {
  console.log('  ' + (condicion ? '✔' : '✘') + ' ' + descripcion);
  if (!condicion) fallas++;
}

/** Hoja falsa: solo hace falta el encabezado y poder escribirlo. */
function hojaFalsa(enc, filas) {
  const encabezados = enc.slice();
  const datos = (filas || []).map((f) => f.slice());
  return {
    enc: encabezados,
    datos,
    getLastColumn: () => encabezados.length,
    getLastRow: () => datos.length + 1,
    getMaxColumns: () => encabezados.length,
    getMaxRows: () => datos.length + 1,
    getRange: (f, c, nf, nc) => ({
      getValues: () => {
        if (f === 1) return [encabezados.slice(c - 1, c - 1 + (nc || encabezados.length))];
        const out = [];
        for (let i = 0; i < (nf || 1); i++) {
          out.push((datos[f - 2 + i] || []).slice(c - 1, c - 1 + (nc || 1)));
        }
        return out;
      },
      setValue: (v) => { if (f === 1) encabezados[c - 1] = v; },
      setValues: () => {},
      setNumberFormat: () => {},
      setFontWeight: () => {},
    }),
  };
}

function cargar(hojas) {
  const ctx = vm.createContext({
    console,
    Logger: { log: () => {} },
    SpreadsheetApp: {
      flush: () => {},
      openById: () => ({ getSheetByName: (n) => hojas[n] || null }),
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => true, releaseLock: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    Session: { getActiveUser: () => ({ getEmail: () => 'x@y.com' }), getScriptTimeZone: () => 'America/Mexico_City' },
    Utilities: { formatDate: () => '2026-09-30' },
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS_LAB' } },
  });
  const lee = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');
  vm.runInContext(lee('config', 'Entidades.gs'), ctx);
  vm.runInContext(lee('utils', 'Ids.gs'), ctx);
  vm.runInContext(lee('MigracionIds.gs') +
    '\nthis.api = { renombrarLlaveAnterior, migColumnaAnterior_, migColumna_,' +
    ' revisarAntesDeMigrar };', ctx);
  return ctx.api;
}

/** Las 8 hojas de la familia de vehículos, con su llave vieja como está hoy. */
function escenarioVehiculos() {
  return {
    'VEHICULOS': hojaFalsa(['ID_VEHICULO', 'FOLIO', 'PLACA'], [['refwf1', 'CTA0001', 'AAA111']]),
    'CAMBIOS VEHICULOS': hojaFalsa(['ID_CAMBIO', 'FOLIO'], [['d13c9d1d', 'CTA0001']]),
    'REASIGNACIONES_VEHICULOS': hojaFalsa(['ID Reasignacion Vehicular', 'Folio Vehiculo'], [['5aaaa5ac', 'CTA0001']]),
    'VERIFICACIONES': hojaFalsa(['ID_VERIFICACION', 'FOLIO VEHICULO'], [['e5818de5', 'CTA0001']]),
    'INSPECCION VEHICULAR': hojaFalsa(['ID INSPECCION', 'FOLIO'], [['2026_451_1', 'CTA0001']]),
    'INSTALACION DE SENSORES': hojaFalsa(['ID_SENSOR', 'FOLIO'], [['jnjdc53', 'CTA0001']]),
    'HOLOGRAMAS': hojaFalsa(['ID_HOLOGRAMA', 'SERIE VEHICULO'], [['feced1', 'SER1']]),
    'INCIDENCIAS': hojaFalsa(['ID_INCIDENCIA', 'FOLIO'], [['26bef186', 'CTA0001']]),
  };
}

// ------------------------------------------------------------------------- pruebas

console.log('1. El ensayo no toca ni un encabezado');
{
  const hojas = escenarioVehiculos();
  const api = cargar(hojas);
  const rep = api.renombrarLlaveAnterior({ familia: 'vehiculos' });
  ok(hojas['VEHICULOS'].enc[0] === 'ID_VEHICULO', 'VEHICULOS sigue con ID_VEHICULO');
  ok(rep.indexOf('ENSAYO') !== -1, 'el reporte lo dice');
  ok(rep.indexOf('"ID_VEHICULO"  ->  "ID ANTERIOR"') !== -1,
     'y enseña el cambio que haría, con los dos nombres');
  ok(rep.indexOf('7 columnas por renombrar') !== -1, '7 de las 8 hojas de la familia');
  ok(rep.indexOf('1 respetadas por ser dato de negocio') !== -1,
     'y la octava se respeta: el folio de INSPECCION VEHICULAR');
}

console.log('\n2. Escribiendo, las 8 quedan con el MISMO nombre');
{
  const hojas = escenarioVehiculos();
  const api = cargar(hojas);
  api.renombrarLlaveAnterior({ familia: 'vehiculos', escribir: true });
  const renombradas = Object.keys(hojas).filter((h) => h !== 'INSPECCION VEHICULAR');
  ok(renombradas.every((h) => hojas[h].enc[0] === 'ID ANTERIOR'),
     'las 7 dicen "ID ANTERIOR": ' + renombradas.map((h) => hojas[h].enc[0]).join(', '));
  // ID INSPECCION es un folio de negocio (2026_451_1), no un id de AppSheet: se queda.
  ok(hojas['INSPECCION VEHICULAR'].enc[0] === 'ID INSPECCION',
     'y INSPECCION VEHICULAR conserva su folio de negocio');
  ok(hojas['VEHICULOS'].datos[0][0] === 'refwf1',
     'y el VALOR no se tocó: solo cambió el encabezado');
  ok(hojas['VEHICULOS'].enc[1] === 'FOLIO', 'las demás columnas quedan en su lugar');
}

console.log('\n3. Correrlo dos veces no crea una segunda columna');
{
  const hojas = escenarioVehiculos();
  const api = cargar(hojas);
  api.renombrarLlaveAnterior({ familia: 'vehiculos', escribir: true });
  const antes = hojas['VEHICULOS'].enc.length;
  const rep = api.renombrarLlaveAnterior({ familia: 'vehiculos', escribir: true });
  ok(hojas['VEHICULOS'].enc.length === antes, 'la hoja tiene las mismas columnas');
  ok(hojas['VEHICULOS'].enc.filter((c) => c === 'ID ANTERIOR').length === 1,
     'y solo UNA se llama ID ANTERIOR');
  ok(rep.indexOf('ya tiene "ID ANTERIOR"') !== -1, 'el reporte dice que ya estaba');
  ok(rep.indexOf('7 ya estaban') !== -1, 'y las cuenta aparte de las renombradas');
}

console.log('\n4. Si no encuentra la llave vieja, NO toca la hoja');
{
  const hojas = escenarioVehiculos();
  hojas['VEHICULOS'] = hojaFalsa(['OTRA COSA', 'FOLIO'], [['x', 'CTA0001']]);
  const api = cargar(hojas);
  const rep = api.renombrarLlaveAnterior({ familia: 'vehiculos', escribir: true });
  ok(hojas['VEHICULOS'].enc[0] === 'OTRA COSA', 'la deja como estaba');
  ok(rep.indexOf('PROBLEMAS (1)') !== -1, 'y lo reporta como problema');
  ok(rep.indexOf('no encuentro su llave vieja') !== -1, 'diciendo qué buscaba');
}

console.log('\n5. El filtro de familia: no toca las hojas de otra');
{
  const hojas = escenarioVehiculos();
  hojas['LINEAS TELEFONICAS'] = hojaFalsa(['ID', 'NUMERO TELEFONO'], [['ee398840', '4421111111']]);
  const api = cargar(hojas);
  api.renombrarLlaveAnterior({ familia: 'vehiculos', escribir: true });
  ok(hojas['LINEAS TELEFONICAS'].enc[0] === 'ID',
     'LINEAS TELEFONICAS se queda intacta al correr solo vehiculos');
}

console.log('\n6. La hoja cuya columna se llamaba "ID" queda SIN ID');
{
  // Este es el punto de correr renombrar ANTES que ids: la hoja se queda sin ID y el paso
  // de ids crea uno limpio, sin respaldar ni pisar nada.
  const hojas = {
    'LINEAS TELEFONICAS': hojaFalsa(['ID', 'NUMERO TELEFONO'], [['ee398840', '4421111111']]),
    'TICKETS': hojaFalsa(['ID', 'TICKET'], [['aa11', 'T-1']]),
  };
  const api = cargar(hojas);
  api.renombrarLlaveAnterior({ familia: 'lineas', escribir: true });
  ok(hojas['LINEAS TELEFONICAS'].enc[0] === 'ID ANTERIOR', 'su ID pasó a ID ANTERIOR');
  ok(api.migColumna_(hojas['LINEAS TELEFONICAS'].enc, 'ID') === 0,
     'y la hoja ya NO tiene columna ID: el paso de ids va a crear una nueva');
  ok(hojas['TICKETS'].enc[0] === 'ID',
     'TICKETS no se tocó: es familia "otros", no "lineas"');
}

console.log('\n7. migColumnaAnterior_ funciona ANTES y DESPUÉS del renombrado');
{
  const api = cargar(escenarioVehiculos());
  const h = { llaveAnterior: 'ID_VEHICULO', columnaAnterior: 0 };
  ok(api.migColumnaAnterior_(['ID_VEHICULO', 'FOLIO'], h) === 1,
     'antes: la encuentra por el nombre del catálogo');
  ok(api.migColumnaAnterior_(['ID', 'ID ANTERIOR', 'FOLIO'], h) === 2,
     'después: la encuentra por el nombre nuevo');
  ok(api.migColumnaAnterior_(['ID', 'FOLIO'], h) === 0,
     'y si no está ninguna, devuelve 0 en vez de adivinar');
  // El nombre nuevo GANA: si por lo que sea estuvieran las dos, la verdad es la renombrada.
  ok(api.migColumnaAnterior_(['ID_VEHICULO', 'ID ANTERIOR'], h) === 2,
     'con las dos presentes, manda ID ANTERIOR');
  const sinNombre = { llaveAnterior: null, columnaAnterior: 1 };
  ok(api.migColumnaAnterior_(['', 'ID_LINEA'], sinNombre) === 1,
     'la que no tenía encabezado sigue resolviéndose por posición');
}

console.log('\n8. La columna SIN ENCABEZADO se encuentra por posición');
{
  // Esto paró el pipeline 1 en el laboratorio el 30/09/2026. CAMBIOS LINEAS TELEFONICAS
  // tiene su llave en la columna 1 SIN encabezado, y el catálogo la busca por el nombre
  // 'ID APPSHEET', que solo existe en el libro compartido del equipo porque Ayrton la nombró
  // ahí a mano. El ternario de antes nunca caía al respaldo por posición cuando
  // llaveAnterior estaba puesta, así que reportaba PROBLEMAS y detenía la corrida.
  const hojas = {
    'CAMBIOS LINEAS TELEFONICAS': hojaFalsa(['', 'ID_LINEA', '', 'IMEI'],
      [['ee398840', 'dv1sd13', '0', '35']]),
  };
  const api = cargar(hojas);
  const rep = api.renombrarLlaveAnterior({ familia: 'lineas', escribir: true });
  ok(hojas['CAMBIOS LINEAS TELEFONICAS'].enc[0] === 'ID ANTERIOR',
    'le puso nombre a la columna 1, que no tenía');
  ok(rep.indexOf('por POSICION') !== -1, 'y el reporte dice que la encontró por posición');
  ok(rep.indexOf('PROBLEMAS') === -1, 'sin reportar problemas: ya no detiene el pipeline');
  ok(hojas['CAMBIOS LINEAS TELEFONICAS'].datos[0][0] === 'ee398840', 'y el valor sigue ahí');
}

console.log('\n9. Si SÍ tiene el nombre, ese manda sobre la posición');
{
  const hojas = {
    'CAMBIOS LINEAS TELEFONICAS': hojaFalsa(['OTRA', 'ID APPSHEET', 'ID_LINEA'],
      [['x', 'ee398840', 'dv1sd13']]),
  };
  const api = cargar(hojas);
  api.renombrarLlaveAnterior({ familia: 'lineas', escribir: true });
  ok(hojas['CAMBIOS LINEAS TELEFONICAS'].enc[1] === 'ID ANTERIOR',
    'renombró la columna 2, la que se llama ID APPSHEET');
  ok(hojas['CAMBIOS LINEAS TELEFONICAS'].enc[0] === 'OTRA',
    'y NO tocó la columna 1, aunque el catálogo también diga posición 1');
}

console.log('\n10. La revisión previa NO reporta el encabezado que el paso 2 va a poner');
{
  // Esto detenía la corrida que escribe. El paso 1 marca PROBLEMAS y el orquestador se
  // para ahí, así que reportar "la columna 1 no tiene encabezado" en CAMBIOS LINEAS
  // TELEFONICAS bloqueaba todo el pipeline por una columna que el paso 2 nombra enseguida.
  const hojas = {
    'CAMBIOS LINEAS TELEFONICAS': hojaFalsa(['', 'ID_LINEA', '', 'IMEI'],
      [['ee398840', 'dv1sd13', '0', '35']]),
  };
  const api = cargar(hojas);
  const rep = api.revisarAntesDeMigrar({ familia: 'lineas' });
  ok(rep.indexOf('la columna 1 no tiene encabezado') === -1,
     'la columna 1 ya NO se reporta como problema');
  ok(rep.indexOf('el paso "renombrar" le va a poner') !== -1,
     'y explica que el paso 2 se lo pone');
  // La columna 3 tampoco: se deduce del contenido. Es el NUCO de la linea — 35,425 de
  // 35,428 filas coinciden con el NUCO de su padre. Ver ENCABEZADOS_DEDUCIDOS.
  ok(rep.indexOf('(deducido del contenido)') !== -1,
     'y la columna 3 se deduce del contenido: es el NUCO');
  // Solo dentro de la LISTA de problemas (las lineas "  - "): las de detalle tambien
  // mencionan el encabezado, y esas son informativas.
  const deEncabezado = rep.split('\n')
    .filter((l) => l.trim().indexOf('- ') === 0 && l.indexOf('no tiene encabezado') !== -1);
  ok(deEncabezado.length === 0,
     'asi que NO queda ningun problema de encabezado: ' + JSON.stringify(deEncabezado));
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);
