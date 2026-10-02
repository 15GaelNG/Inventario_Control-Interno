/**
 * Pruebas de homologarNombres (src/MigracionIds.gs): el paso "nombres" de la homologación de
 * una familia, que le pone a una columna el nombre que usa el resto de la base.
 *
 * Escribe encabezados, así que lo que protege esto: que el ensayo no toque nada, que correr
 * dos veces no haga nada la segunda, que nunca deje dos columnas con el mismo nombre, y que
 * solo toque las hojas de la familia pedida.
 *
 * Correr: node tests/nombres.test.js
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
function hojaFalsa(enc) {
  const encabezados = enc.slice();
  return {
    enc: encabezados,
    getLastColumn: () => encabezados.length,
    getLastRow: () => 1,
    getRange: (f, c, nf, nc) => ({
      getValues: () => [encabezados.slice(c - 1, c - 1 + (nc || encabezados.length))],
      setValue: (v) => { if (f === 1) encabezados[c - 1] = v; },
    }),
  };
}

function cargar(hojas) {
  const ctx = vm.createContext({
    soloEditor_: () => {},   // el candado de Code.gs: aquí siempre es "el editor"
    console,
    Logger: { log: () => {} },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => hojas[n] || null }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS_LAB' } },
  });
  const lee = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');
  vm.runInContext(lee('config', 'Entidades.gs'), ctx);
  vm.runInContext(lee('utils', 'Ids.gs'), ctx);
  vm.runInContext(lee('MigracionIds.gs') + '\nthis.api = { homologarNombres, MIGRACION_NOMBRES };', ctx);
  return ctx.api;
}

console.log('1. El ensayo dice qué haría y no toca nada');
{
  const hojas = { VEHICULOS: hojaFalsa(['ID', 'FOLIO', 'SEDE', 'UBICACION']) };
  const r = cargar(hojas).homologarNombres({ familia: 'vehiculos' });
  ok(/"UBICACION" → "OFICINA \/ DESARROLLO" \(limpieza #23\): se renombraría/.test(r), 'lo anuncia con su número de limpieza');
  ok(/1 columnas por renombrar/.test(r), 'el resumen lo cuenta');
  ok(hojas.VEHICULOS.enc[3] === 'UBICACION', 'y el encabezado sigue igual');
}

console.log('\n2. Escribiendo renombra; la segunda vez ya no hace nada');
{
  const hojas = { VEHICULOS: hojaFalsa(['ID', 'FOLIO', 'SEDE', 'UBICACION']) };
  const api = cargar(hojas);
  const r1 = api.homologarNombres({ familia: 'vehiculos', escribir: true });
  ok(hojas.VEHICULOS.enc[3] === 'OFICINA / DESARROLLO', 'la columna cambió de nombre, en su mismo lugar');
  ok(/1 columnas renombradas/.test(r1), 'y lo reporta');
  const r2 = api.homologarNombres({ familia: 'vehiculos', escribir: true });
  ok(/YA HOMOLOGADA/.test(r2) && /0 columnas renombradas, 1 ya homologadas/.test(r2), 'correrlo otra vez es inofensivo');
}

console.log('\n3. Nunca deja dos columnas con el mismo nombre');
{
  const hojas = { VEHICULOS: hojaFalsa(['ID', 'UBICACION', 'OFICINA / DESARROLLO']) };
  const r = cargar(hojas).homologarNombres({ familia: 'vehiculos', escribir: true });
  ok(/PROBLEMAS \(1\)/.test(r) && /existen LAS DOS/.test(r), 'si ya existen las dos, es un problema');
  ok(hojas.VEHICULOS.enc.join() === 'ID,UBICACION,OFICINA / DESARROLLO', 'y no toca nada');
}

console.log('\n4. Solo la familia pedida');
{
  const hojas = { VEHICULOS: hojaFalsa(['ID', 'UBICACION']) };
  const r = cargar(hojas).homologarNombres({ familia: 'cajachica', escribir: true });
  ok(hojas.VEHICULOS.enc[1] === 'UBICACION', 'Caja Chica no toca VEHICULOS');
  ok(/0 columnas renombradas/.test(r), 'y lo dice');
}

console.log('\n5. El catálogo está bien formado');
{
  const api = cargar({});
  ok(api.MIGRACION_NOMBRES.every((n) => n.hoja && n.de && n.a && n.de !== n.a && Number(n.limpieza) > 0),
    'cada renombre trae hoja, de, a y su número de limpieza');
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);
