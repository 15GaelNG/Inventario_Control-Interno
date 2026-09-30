/**
 * Pruebas del catálogo de entidades (src/config/Entidades.gs).
 * Es la tabla que comparten SheetUtils.insert, MigracionIds y el activador: si se degrada,
 * los registros nuevos empiezan a nacer con el prefijo equivocado y nadie se entera.
 * Correr: node tests/entidades.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const contexto = vm.createContext({ console });
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'Entidades.gs'), 'utf8') +
  '\nthis.Entidades = Entidades;',
  contexto
);
const { Entidades } = contexto;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
function truena(fn, texto) {
  let tronó = false;
  try { fn(); } catch (e) { tronó = true; }
  ok(tronó, texto);
}

console.log('1. El catálogo está sano');
const revision = Entidades.revisarCatalogo();
ok(revision.problemas.length === 0, 'sin problemas: ' + (revision.problemas.join(' | ') || 'ninguno'));
ok(revision.hojas === 27, 'tiene las 27 hojas de registros, no ' + revision.hojas);
ok(Entidades.migrables().length === 24,
   'de ellas 24 vienen de AppSheet y sí se migran, no ' + Entidades.migrables().length);

console.log('\n2. Los prefijos son únicos y bien formados');
const todas = Entidades.todas();
const prefijos = todas.map((e) => e.prefijo);
ok(new Set(prefijos).size === prefijos.length, 'ningún prefijo repetido');
ok(prefijos.every((p) => /^[A-Z]{3}$/.test(p)), 'todos son 3 letras mayúsculas');

console.log('\n3. Buscar por nombre de hoja');
ok(Entidades.prefijo('VEHICULOS') === 'VEH', 'VEHICULOS → VEH');
ok(Entidades.prefijo('INSPECCION VEHICULAR') === 'INS', 'INSPECCION VEHICULAR → INS');
ok(Entidades.prefijo('  inspeccion   vehicular  ') === 'INS',
   'aguanta espacios de sobra y minúsculas, como los encabezados reales de las hojas');
ok(Entidades.existe('TICKETS') && !Entidades.existe('PERFILES'), 'existe() distingue lo que sí guarda registros');

console.log('\n4. Una hoja desconocida truena en vez de inventar');
truena(() => Entidades.prefijo('HOJA QUE NO EXISTE'),
  'pedir el prefijo de una hoja fuera del catálogo truena');
truena(() => Entidades.prefijo(''), 'pedirlo sin nombre truena');
ok(Entidades.de('HOJA QUE NO EXISTE') === null, 'de() devuelve null, para poder preguntar sin tronar');

console.log('\n5. Del prefijo de vuelta a la hoja');
ok(Entidades.hojaDe('VEH') === 'VEHICULOS', 'VEH → VEHICULOS');
ok(Entidades.hojaDe('lin') === 'LINEAS TELEFONICAS', 'no importan las minúsculas');
ok(Entidades.hojaDe('XXX') === null, 'un prefijo inventado da null');

console.log('\n6. Cuáles hojas necesitan respaldar su llave vieja');
const pisan = Entidades.migrables().filter((e) => e.pisaLlaveAnterior).map((e) => e.hoja);
ok(pisan.length === 8, 'son 8 las hojas migrables cuya columna ya se llama ID, no ' + pisan.length);
ok(pisan.indexOf('LINEAS TELEFONICAS') !== -1 && pisan.indexOf('UBER') !== -1,
   'entre ellas Líneas y Uber');
ok(pisan.indexOf('VEHICULOS') === -1,
   'VEHICULOS NO: su columna se llama ID_VEHICULO y no se toca, respaldarla sería duplicar');

console.log('\n6b. Las pestañas del sistema nuevo no pasan por la migración');
const nuevas = todas.filter((e) => e.delSistemaNuevo).map((e) => e.hoja).sort();
ok(nuevas.join(',') === 'APP_EVIDENCIAS,APP_MOVIMIENTOS,APP_NOTIFICACIONES',
   'son las tres APP_ de Líneas: ' + nuevas.join(', '));
ok(Entidades.migrables().every((e) => !e.delSistemaNuevo), 'y quedan fuera de migrables()');
ok(Entidades.prefijo('APP_EVIDENCIAS') === 'EVI',
   'pero sí tienen prefijo, para que sus altas nazcan bien');

console.log('\n6c. La hoja que se me había escapado');
ok(Entidades.existe('HISTORIAL_REASIGNACIONES'),
   'HISTORIAL_REASIGNACIONES está en el catálogo (1,470 filas en producción)');
ok(Entidades.prefijo('HISTORIAL_REASIGNACIONES') === 'HIS', 'con prefijo HIS');
ok(Entidades.de('HISTORIAL_REASIGNACIONES').llaveAnterior === 'ID Historial',
   'y su llave anterior es "ID Historial", no "ID"');

console.log('\n7. Todas dicen dónde estaba su llave anterior, POR NOMBRE');
ok(todas.every((e) => e.llaveAnterior || e.columnaAnterior),
   'ninguna se quedó sin decir de dónde leer el valor viejo');
ok(todas.every((e) => e.llaveAnterior), 'y todas por nombre: ya ninguna depende de la posición');
ok(Entidades.de('CAMBIOS LINEAS TELEFONICAS').llaveAnterior === 'ID APPSHEET',
   'a la que no tenía encabezado se le puso "ID APPSHEET", que es justo lo que guarda');

console.log('\n7b. El caso donde la llave anterior ES la columna de respaldo');
const cli = Entidades.de('CAMBIOS LINEAS TELEFONICAS');
ok(cli.llaveAnterior === Entidades.COLUMNA_ID_ANTERIOR,
   'en esa hoja coinciden, y limpiarRespaldoRedundante tiene que NO borrarla');
ok(todas.filter((e) => e.llaveAnterior === Entidades.COLUMNA_ID_ANTERIOR).length === 1,
   'es la única así: si aparece otra, hay que revisar esa salvaguarda');

console.log('\n8. Los nombres de columna son los mismos para todos');
ok(Entidades.COLUMNA_ID === 'ID', 'la llave propia se llama ID');
ok(Entidades.COLUMNA_ID_ANTERIOR === 'ID APPSHEET', 'el respaldo se llama ID APPSHEET');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);
