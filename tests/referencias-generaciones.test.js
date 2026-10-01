/**
 * Pruebas de reescribirReferencias (src/MigracionIds.gs) contra un padre con VARIAS
 * generaciones de ID, que es como quedó LINEAS TELEFONICAS en el libro del equipo:
 *
 *   ID            LIN-… vigente (corrida del 30/09)
 *   ID ANTERIOR   LIN-… de la corrida del 29/09
 *   ID APPSHEET   el de AppSheet (hex, DV1SD…, DG…)
 *
 * Las hijas citan casi todas al de AppSheet y unas pocas al del 29/09. Lo que protege esto:
 * que las dos generaciones viejas se reescriban al vigente, que un LIN-… viejo NO cuente como
 * "ya migrado" solo por tener forma de ID, que el vigente sí cuente, y que lo que no está en
 * ninguna generación quede intacto como huérfano.
 *
 * Correr: node tests/referencias-generaciones.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fallas = 0;
function ok(condicion, descripcion) {
  console.log('  ' + (condicion ? '✔' : '✘') + ' ' + descripcion);
  if (!condicion) fallas++;
}

/** Hoja falsa que lee por rango y guarda lo que se le escribe por columna. */
function hojaFalsa(enc, filas) {
  const encabezados = enc.slice();
  const datos = filas.map((f) => f.slice());
  const escrito = {};
  return {
    escrito,
    getLastColumn: () => encabezados.length,
    getLastRow: () => datos.length + 1,
    getMaxColumns: () => encabezados.length,
    getMaxRows: () => datos.length + 1,
    getRange: (f, c, nf, nc) => ({
      getValues: () => {
        if (f === 1) return [encabezados.slice(c - 1, c - 1 + (nc || encabezados.length))];
        const out = [];
        for (let i = 0; i < (nf || 1); i++) out.push((datos[f - 2 + i] || []).slice(c - 1, c - 1 + (nc || 1)));
        return out;
      },
      setValue: (v) => { if (f === 1) encabezados[c - 1] = v; },
      setValues: (v) => { escrito[encabezados[c - 1]] = v.map((r) => r[0]); },
      setNumberFormat: () => {},
    }),
  };
}

function cargar(hojas, props) {
  const ctx = vm.createContext({
    console,
    Logger: { log: () => {} },
    SpreadsheetApp: { flush: () => {}, openById: () => ({ getSheetByName: (n) => hojas[n] || null }) },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }),
    },
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS_LAB' } },
  });
  const lee = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');
  vm.runInContext(lee('config', 'Entidades.gs'), ctx);
  vm.runInContext(lee('utils', 'Ids.gs'), ctx);
  vm.runInContext(lee('MigracionIds.gs') + '\nthis.api = { reescribirReferencias, migMapaDelPadre_ };', ctx);
  return ctx.api;
}

// IDs reales del libro del equipo (01/10/2026)
const HOY = ['LIN-000000006SRC6J', 'LIN-00000001EPD2BY', 'LIN-00000002JSD2GP'];
const AYER = ['LIN-00000000N5FEC7', 'LIN-00000001EZC7A3', 'LIN-00000002J3ENNS'];
const APPSHEET = ['873bb085', 'DV1SD13', 'DG001'];

function escenario() {
  return {
    'LINEAS TELEFONICAS': hojaFalsa(['ID', 'ID ANTERIOR', 'NUCO', 'ID APPSHEET'],
      HOY.map((id, i) => [id, AYER[i], String(100 + i), APPSHEET[i]])),
    'INSPECCIONES LINEAS': hojaFalsa(['ID', 'ID ANTERIOR', 'ID LINEA'], [
      ['ILI-1', 'x', '873bb085'],   // AppSheet, minúsculas como en la hoja
      ['ILI-2', 'x', 'dv1sd13'],    // AppSheet, distinto de mayúsculas
      ['ILI-3', 'x', AYER[2]],      // LIN-… del 29/09: forma de ID, pero viejo
      ['ILI-4', 'x', HOY[0]],       // ya vigente
      ['ILI-5', 'x', 'eeba06a3'],   // el padre borrado
      ['ILI-6', 'x', ''],
    ]),
  };
}

console.log('migMapaDelPadre_ junta las tres generaciones');
{
  const api = cargar(escenario(), {});
  const hojas = escenario();
  const mapa = api.migMapaDelPadre_({ getSheetByName: (n) => hojas[n] }, 'LINEAS TELEFONICAS');
  ok(mapa['873BB085'] === HOY[0], 'el de AppSheet lleva al vigente');
  ok(mapa[AYER[1]] === HOY[1], 'el del 29/09 lleva al vigente');
  ok(mapa[HOY[2]] === HOY[2], 'el vigente se apunta a sí mismo');
}

console.log('migMapaDelPadre_ no adivina un valor repetido entre renglones');
{
  const hojas = {
    'LINEAS TELEFONICAS': hojaFalsa(['ID', 'ID ANTERIOR', 'ID APPSHEET'], [
      [HOY[0], AYER[0], 'REPETIDO'],
      [HOY[1], AYER[1], 'REPETIDO'],
    ]),
  };
  const api = cargar(hojas, {});
  const mapa = api.migMapaDelPadre_({ getSheetByName: (n) => hojas[n] }, 'LINEAS TELEFONICAS');
  ok(!('REPETIDO' in mapa), 'el ambiguo sale del mapa');
  ok(mapa[AYER[0]] === HOY[0], 'lo demás sigue');
}

console.log('reescribirReferencias, ensayo y escritura');
{
  const hojas = escenario();
  const props = {};
  const api = cargar(hojas, props);
  const ensayo = api.reescribirReferencias({ familia: 'lineas' });
  ok(/INSPECCIONES LINEAS\.ID LINEA -> LINEAS TELEFONICAS: 3 cambiadas, 1 huérfanas, 1 vacías, 1 ya migradas/.test(ensayo),
    'cuenta: 3 cambiadas (2 AppSheet + 1 del 29/09), 1 huérfana, 1 vacía, 1 ya vigente');
  ok(!hojas['INSPECCIONES LINEAS'].escrito['ID LINEA'], 'el ensayo no escribe');

  api.reescribirReferencias({ familia: 'lineas', escribir: true });
  const col = hojas['INSPECCIONES LINEAS'].escrito['ID LINEA'];
  ok(col && col[0] === HOY[0] && col[1] === HOY[1], 'las de AppSheet quedan en el vigente');
  ok(col && col[2] === HOY[2], 'el LIN-… del 29/09 se reescribe, no se da por hecho');
  ok(col && col[3] === HOY[0], 'el vigente se queda');
  ok(col && col[4] === 'eeba06a3', 'la huérfana se conserva intacta');
  ok(col && col[5] === '', 'la vacía sigue vacía');
}

console.log('una segunda corrida sobre el resultado no cambia nada');
{
  const hojas = {
    'LINEAS TELEFONICAS': escenario()['LINEAS TELEFONICAS'],
    'INSPECCIONES LINEAS': hojaFalsa(['ID', 'ID ANTERIOR', 'ID LINEA'], [['ILI-1', 'x', HOY[0]], ['ILI-2', 'x', HOY[2]]]),
  };
  const api = cargar(hojas, {});
  const r = api.reescribirReferencias({ familia: 'lineas' });
  ok(/INSPECCIONES LINEAS\.ID LINEA -> LINEAS TELEFONICAS: YA MIGRADA \(2 referencias\)/.test(r), 'reporta YA MIGRADA');
}

console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
process.exit(fallas ? 1 : 0);
