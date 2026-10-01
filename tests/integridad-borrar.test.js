/**
 * Pruebas de la integridad al borrar (ON DELETE RESTRICT) — Relaciones.borrar y
 * Relaciones.queImpideBorrar, con el catálogo Entidades.REFERENCIAS.
 *
 * Lo que de verdad protege esto: que borrar un vehículo o una caja chica no deje
 * inspecciones, arqueos o reasignaciones apuntando a un ID que ya no existe. Y que el
 * catálogo permanente no se separe del de la migración, que es el que llenó esas columnas.
 * Correr: node tests/integridad-borrar.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fallas = 0;
function ok(condicion, descripcion) {
  console.log('  ' + (condicion ? '✔' : '✘') + ' ' + descripcion);
  if (!condicion) fallas++;
}
function mensajeDe(fn) {
  try { fn(); return ''; } catch (e) { return e.message; }
}

// ---------------------------------------------------------------- hojas falsas

function hoja(nombre, enc, filasObj) {
  const datos = filasObj.map((o) => enc.map((c) => (c in o ? o[c] : '')));
  return {
    getName: () => nombre,
    getLastRow: () => datos.length + 1,
    getLastColumn: () => enc.length,
    getRange: (f, c, nf, nc) => ({
      getValues: () => {
        const out = [];
        for (let i = 0; i < (nf || 1); i++) {
          const fila = f + i === 1 ? enc : datos[f - 2 + i] || [];
          out.push(fila.slice(c - 1, c - 1 + (nc || 1)));
        }
        return out;
      },
    }),
    deleteRow: (f) => { datos.splice(f - 2, 1); },
    datos, enc,
  };
}

const COL_VEH = ['ID', 'FOLIO', 'SERIE VEHICULO', 'ESTATUS'];
const COL_CCH = ['ID', 'ID CCH', 'ESTATUS', 'RESPONSABLE DE CAJA CHICA'];

/** Un libro de prueba. AUT0001 tiene historia; AUT0002 solo por FOLIO; AUT0003 está libre. */
function libro(cambios) {
  const hojas = {
    'VEHICULOS': hoja('VEHICULOS', COL_VEH, [
      { ID: 'VEH-1', FOLIO: 'AUT0001', 'SERIE VEHICULO': 'SERIE1' },
      { ID: 'VEH-2', FOLIO: 'AUT0002', 'SERIE VEHICULO': 'SERIE2' },
      { ID: 'VEH-3', FOLIO: 'AUT0003', 'SERIE VEHICULO': 'SERIE3' },
      { ID: 'VEH-4', FOLIO: 'AUT0004', 'SERIE VEHICULO': 'SERIE4' },
    ]),
    'INSPECCION VEHICULAR': hoja('INSPECCION VEHICULAR', ['ID', 'ID VEHICULO', 'FOLIO'], [
      { ID: 'INS-1', 'ID VEHICULO': 'VEH-1', FOLIO: 'AUT0001' },
      { ID: 'INS-2', 'ID VEHICULO': 'VEH-1', FOLIO: 'AUT0001' },
      // Sin llave foránea (no emparejó en la migración): cuenta por FOLIO
      { ID: 'INS-3', 'ID VEHICULO': '', FOLIO: 'AUT0002' },
      // Llave foránea a otro vehículo con el folio de AUT0003: manda la llave foránea
      { ID: 'INS-4', 'ID VEHICULO': 'VEH-4', FOLIO: 'AUT0003' },
    ]),
    'INCIDENCIAS': hoja('INCIDENCIAS', ['ID', 'ID VEHICULO', 'FOLIO'], [
      { ID: 'INC-1', 'ID VEHICULO': 'VEH-1', FOLIO: 'AUT0001' },
    ]),
    'REASIGNACIONES_VEHICULOS': hoja('REASIGNACIONES_VEHICULOS', ['ID', 'ID VEHICULO', 'Folio Vehiculo'], []),
    'CAJAS CHICAS': hoja('CAJAS CHICAS', COL_CCH, [
      { ID: 'CCH-1', 'ID CCH': 225 },
      { ID: 'CCH-2', 'ID CCH': 226 },
    ]),
    'ARQUEOS': hoja('ARQUEOS', ['ID ARQUEO', 'ID CCH', 'ID CAJA CHICA'], [
      { 'ID ARQUEO': '2026_225_001', 'ID CCH': 225, 'ID CAJA CHICA': 'CCH-1' },
    ]),
  };
  Object.assign(hojas, cambios || {});
  return hojas;
}

function cargar(hojas) {
  const candado = { tomado: 0, soltado: 0 };
  const ctx = vm.createContext({
    console,
    Logger: { log: () => {} },
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS', TELEFONIA: () => 'SS_TEL' } },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => hojas[n] || null }) },
    LockService: { getScriptLock: () => ({ waitLock: () => { candado.tomado++; }, releaseLock: () => { candado.soltado++; } }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  });
  const lee = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');
  vm.runInContext(lee('config', 'Entidades.gs'), ctx);
  vm.runInContext(lee('utils', 'SheetUtils.gs'), ctx);
  vm.runInContext(lee('services', 'Relaciones.gs') + '\nthis.Relaciones = Relaciones; this.Entidades = Entidades;', ctx);
  return { R: ctx.Relaciones, E: ctx.Entidades, candado };
}
const folios = (h) => h.datos.map((d) => d[1]).join();

// ------------------------------------------------------------------ pruebas

console.log('\n1. Un vehículo con historial no se borra, y el mensaje dice qué lo impide');
{
  const hojas = libro();
  const { R, candado } = cargar(hojas);
  const msg = mensajeDe(() => R.borrar('VEHICULOS', ['VEH-1']));
  ok(/vehículo AUT0001 tiene 2 inspecciones y 1 incidencia/.test(msg), 'cuenta por tipo: ' + msg);
  ok(/BAJA VEHICULAR/.test(msg), 'y dice cómo darlo de baja');
  ok(folios(hojas.VEHICULOS) === 'AUT0001,AUT0002,AUT0003,AUT0004', 'no se borró nada');
  ok(candado.tomado === 1 && candado.soltado === 1, 'el candado se suelta aunque truene');
}

console.log('\n2. Una hija vieja sin llave foránea cuenta por su llave de negocio');
{
  const hojas = libro();
  const { R } = cargar(hojas);
  const msg = mensajeDe(() => R.borrar('VEHICULOS', ['VEH-2']));
  ok(/AUT0002 tiene 1 inspección/.test(msg), 'la inspección con solo FOLIO lo protege');
}

console.log('\n3. La llave foránea manda sobre la de negocio');
{
  const hojas = libro();
  const { R } = cargar(hojas);
  const r = R.borrar('VEHICULOS', ['VEH-3']);
  ok(r.eliminadas === 1, 'AUT0003 se borra: la inspección con su folio apunta a VEH-4');
  ok(folios(hojas.VEHICULOS) === 'AUT0001,AUT0002,AUT0004', 'y se borró el renglón correcto');
}

console.log('\n4. Varios a la vez: todos o ninguno');
{
  const hojas = libro();
  const { R } = cargar(hojas);
  const msg = mensajeDe(() => R.borrar('VEHICULOS', ['VEH-3', 'VEH-1']));
  ok(/No se eliminó ninguno/.test(msg), 'lo dice');
  ok(hojas.VEHICULOS.datos.length === 4, 'AUT0003, que estaba libre, tampoco se borró');
}

console.log('\n5. queImpideBorrar pregunta sin borrar');
{
  const hojas = libro();
  const { R, candado } = cargar(hojas);
  const r = R.queImpideBorrar('VEHICULOS', ['VEH-1', 'VEH-2', 'VEH-3']);
  ok(r.bloqueados.map((b) => b.clave).join() === 'AUT0001,AUT0002', 'dos bloqueados: ' + r.bloqueados.map((b) => b.clave));
  ok(r.bloqueados[0].hijos['INSPECCION VEHICULAR'] === 2, 'con sus cuentas por hoja');
  ok(hojas.VEHICULOS.datos.length === 4 && candado.tomado === 0, 'no borra ni toma el candado');
  ok(R.queImpideBorrar('VEHICULOS', ['VEH-3']).mensaje === '', 'uno libre: mensaje vacío');
}

console.log('\n6. Caja chica: se busca por ID CCH y se niega si tiene arqueos');
{
  const hojas = libro();
  const { R } = cargar(hojas);
  const msg = mensajeDe(() => R.borrar('CAJAS CHICAS', [225]));
  ok(/caja chica 225 tiene 1 arqueo/.test(msg) && /CERRADA/.test(msg), msg);
  ok(R.borrar('CAJAS CHICAS', ['226']).eliminadas === 1, 'la 226 sin arqueos sí se borra (y "226" casa con 226)');
}

console.log('\n7. Lo que no existe no se borra ni truena');
{
  const { R } = cargar(libro());
  ok(R.borrar('VEHICULOS', ['VEH-NO']).eliminadas === 0, 'eliminadas: 0 (el servicio dice "no se encontró")');
}

console.log('\n8. Falla cerrado: una hija sin la columna para revisar impide borrar');
{
  const hojas = libro({ 'INCIDENCIAS': hoja('INCIDENCIAS', ['ID', 'DESCRIPCION'], [{ ID: 'INC-9' }]) });
  const { R } = cargar(hojas);
  const msg = mensajeDe(() => R.borrar('VEHICULOS', ['VEH-3']));
  ok(/no tiene la columna ID VEHICULO/.test(msg), 'no supone que no depende nada');
  ok(hojas.VEHICULOS.datos.length === 4, 'y no borra');
  // Una hoja que simplemente no existe en este libro no impide nada (p. ej. CAMBIOS VEHICULOS)
  ok(!hojas['CAMBIOS VEHICULOS'], '(CAMBIOS VEHICULOS no existe en el libro de prueba y no estorbó en la prueba 3)');
}

console.log('\n9. Solo se borra lo que está en BORRABLES');
{
  const { R } = cargar(libro());
  ok(/no se puede eliminar desde la app/.test(mensajeDe(() => R.borrar('LINEAS TELEFONICAS', ['LIN-1']))), 'Líneas no');
  ok(/no se puede eliminar desde la app/.test(mensajeDe(() => R.borrar('PERSONAS', ['PER-1']))), 'PERSONAS no');
}

console.log('\n10. Con muchos bloqueados, el mensaje no los lista todos');
{
  const muchos = [];
  const insp = [];
  for (let i = 1; i <= 8; i++) {
    muchos.push({ ID: 'VEH-' + i, FOLIO: 'AUT000' + i });
    insp.push({ ID: 'INS-' + i, 'ID VEHICULO': 'VEH-' + i });
  }
  const hojas = libro({
    'VEHICULOS': hoja('VEHICULOS', COL_VEH, muchos),
    'INSPECCION VEHICULAR': hoja('INSPECCION VEHICULAR', ['ID', 'ID VEHICULO', 'FOLIO'], insp),
  });
  const { R } = cargar(hojas);
  const msg = mensajeDe(() => R.borrar('VEHICULOS', muchos.map((v) => v.ID)));
  ok(/y 3 vehículos más/.test(msg), 'cinco y "y 3 vehículos más"');
}

// ------------------------------------------------- el catálogo contra la migración

console.log('\n11. Entidades.REFERENCIAS dice lo mismo que MIGRACION_REFERENCIAS');
{
  const { E } = cargar(libro());
  const fuente = fs.readFileSync(path.join(__dirname, '..', 'src', 'MigracionIds.gs'), 'utf8');
  const bloque = fuente.slice(fuente.indexOf('const MIGRACION_REFERENCIAS = ['));
  const migracion = vm.runInNewContext('(' + bloque.slice(bloque.indexOf('['), bloque.indexOf('\n];') + 2) + ')');
  const clave = (hoja, padre, columna) => hoja + ' → ' + padre + ' por ' + columna;
  const deMig = migracion.map((r) => clave(r.hoja, r.padre, r.destino || r.columna)).sort();
  const deEnt = E.REFERENCIAS.filter((r) => r.padre !== 'PERSONAS').map((r) => clave(r.hoja, r.padre, r.columna)).sort();
  const faltan = deMig.filter((x) => deEnt.indexOf(x) === -1);
  const sobran = deEnt.filter((x) => deMig.indexOf(x) === -1);
  ok(!faltan.length, 'ninguna de la migración falta: ' + faltan.join('; '));
  ok(!sobran.length, 'ninguna sobra: ' + sobran.join('; '));
  // La llave de respaldo debe ser la misma con que la migración emparejó
  const malLlave = migracion.filter((m) => m.porLlaveNegocio).filter((m) => {
    const e = E.REFERENCIAS.find((r) => r.hoja === m.hoja && r.padre === m.padre);
    return !e || !e.llave || e.llave.columna !== m.columna;
  }).map((m) => m.hoja);
  ok(!malLlave.length, 'la llave de negocio de respaldo es la columna que usó la migración: ' + malLlave.join());
}

console.log('\n12. Toda hoja del catálogo de llaves foráneas está en Entidades y tiene nombre legible');
{
  const { E, R } = cargar(libro());
  const sinEntidad = E.REFERENCIAS.filter((r) => !E.existe(r.hoja) || !E.existe(r.padre)).map((r) => r.hoja);
  ok(!sinEntidad.length, 'hojas y padres existen: ' + sinEntidad.join());
  const sinNombre = E.REFERENCIAS.filter((r) => R.etiqueta(r.hoja).uno === 'registro').map((r) => r.hoja);
  ok(!sinNombre.length, 'todas tienen etiqueta: ' + sinNombre.join());
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);
