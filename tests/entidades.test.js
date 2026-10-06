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
// 22 + las dos de Capital Humano (01/10/2026) + las 3 APP_ nuevas de Líneas
// + APP_HELPDESK, la copia de los tickets del helpdesk (05/10/2026) + RESPONSIVA VEHICULAR + ADHERENTE VEHICULAR
ok(revision.hojas === 36, 'tiene las 36 hojas de registros (27 + las 6 de la reestructura de Líneas + APP_HELPDESK + Responsiva y Adherente Vehicular), no ' + revision.hojas);
ok(Entidades.migrables().length === 20,
   'de ellas 20 vienen de AppSheet y sí se migran, no ' + Entidades.migrables().length);

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
ok(Entidades.hojaDe('lin') === 'LINEAS', 'no importan las minúsculas (LIN pasó a LINEAS al retirar LINEAS TELEFONICAS)');
ok(Entidades.hojaDe('XXX') === null, 'un prefijo inventado da null');

console.log('\n6. Cuáles hojas necesitan respaldar su llave vieja');
const pisan = Entidades.migrables().filter((e) => e.pisaLlaveAnterior).map((e) => e.hoja);
ok(pisan.length === 6, 'son 6 las hojas migrables cuya columna ya se llama ID, no ' + pisan.length);
ok(pisan.indexOf('LINEAS TELEFONICAS') !== -1 && pisan.indexOf('UBER') !== -1,
   'entre ellas Líneas y Uber');
ok(pisan.indexOf('VEHICULOS') === -1,
   'VEHICULOS NO: su columna se llama ID_VEHICULO y no se toca, respaldarla sería duplicar');

console.log('\n6b. Las pestañas del sistema nuevo no pasan por la migración');
const nuevas = todas.filter((e) => e.delSistemaNuevo).map((e) => e.hoja).sort();
ok(nuevas.join(',') === 'ADENDUMS,ADHERENTE VEHICULAR,APP_CORRECCIONES,APP_EVIDENCIAS,APP_HELPDESK,APP_MOVIMIENTOS,APP_NOTIFICACIONES,APP_RESGUARDOS,ASIGNACIONES,EQUIPOS,FACTURAS,LINEAS,MOVIMIENTOS,PERSONAS,RESPONSIVA VEHICULAR',
   'son las cinco APP_ de Líneas, APP_HELPDESK, las hojas de la reestructura, PERSONAS, RESPONSIVA VEHICULAR y ADHERENTE VEHICULAR: ' + nuevas.join(', '));

console.log('\n6c. Una hoja externa (se pega desde otro sistema) nunca pasa por la migración');
const externas = todas.filter((e) => e.externa).map((e) => e.hoja);
ok(externas.join(',') === 'COLABORADORES ACTUALIZADO', 'la única es la lista de Capital Humano: ' + externas.join(', '));
ok(!Entidades.migrables().some((e) => e.externa), 'y migrables() no la incluye: el siguiente pegado borraría su ID');
ok(Entidades.migrables().every((e) => !e.delSistemaNuevo), 'y quedan fuera de migrables()');
ok(Entidades.prefijo('APP_EVIDENCIAS') === 'EVI',
   'pero sí tienen prefijo, para que sus altas nazcan bien');

console.log('\n6c. Las cuatro hojas que Líneas eliminó ya NO están en el catálogo');
// Antes esta prueba aseguraba lo contrario: que HISTORIAL_REASIGNACIONES SÍ estuviera,
// porque se me había escapado del catálogo. El 30/09/2026 el área tuvo junta y Emmanuel
// eliminó cuatro pestañas, así que ahora lo que hay que asegurar es su ausencia —
// mientras estuvieran, revisarAntesDeMigrar detenía cualquier corrida que escribiera.
const ELIMINADAS = ['HISTORIAL_REASIGNACIONES', 'REACTIVACION DE LINEAS',
  'SOLICITUD DE LINEAS', 'BITACORA DE DESECHO'];
const quedan = ELIMINADAS.filter((h) => Entidades.existe(h));
ok(quedan.length === 0,
   quedan.length ? 'siguen en el catálogo: ' + quedan.join(', ')
   : 'las 4 salieron de Entidades');

// Y que el catálogo no quede a medias: una hoja fuera de Entidades pero con su
// referencia viva haría que reescribirReferencias buscara una hoja que no existe.
const fuente = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'MigracionIds.gs'), 'utf8');
const conRef = ELIMINADAS.filter((h) => new RegExp("hoja: '" + h + "'").test(fuente));
ok(conRef.length === 0,
   conRef.length ? 'siguen en MIGRACION_REFERENCIAS: ' + conRef.join(', ')
   : 'y también de MIGRACION_REFERENCIAS, así que el catálogo no quedó a medias');

console.log('\n7. Todas dicen dónde estaba su llave anterior, POR NOMBRE');
ok(todas.every((e) => e.llaveAnterior || e.columnaAnterior),
   'ninguna se quedó sin decir de dónde leer el valor viejo');
ok(todas.every((e) => e.llaveAnterior), 'y todas por nombre: ya ninguna depende de la posición');
ok(Entidades.de('CAMBIOS LINEAS TELEFONICAS').llaveAnterior === 'ID APPSHEET',
   'a la que no tenía encabezado se le puso "ID APPSHEET", que es justo lo que guarda');

console.log('\n7b. Ninguna llave anterior se llama igual que la columna de respaldo');
// Antes del 30/09/2026 el respaldo se llamaba "ID APPSHEET" y CAMBIOS LINEAS TELEFONICAS
// tenía una columna REAL con ese nombre: un mismo nombre para dos papeles, que obligaba a
// limpiarRespaldoRedundante a cuidar de no borrar el original comparándolo consigo mismo.
// Al renombrar el respaldo a "ID ANTERIOR", la ambigüedad desapareció. Esto lo vigila.
const choques = todas.filter((e) => e.llaveAnterior === Entidades.COLUMNA_ID_ANTERIOR);
ok(choques.length === 0,
   'cero colisiones: ' + (choques.length ? choques.map((e) => e.hoja).join(', ') : 'ninguna hoja usa ese nombre'));
const cli = Entidades.de('CAMBIOS LINEAS TELEFONICAS');
ok(cli.llaveAnterior === Entidades.COLUMNA_ID_ANTERIOR_LEGADO,
   'la que chocaba usa el nombre VIEJO del respaldo, que ya no se escribe: ' + cli.llaveAnterior);

console.log('\n7c. Las familias: migrar y homologar un módulo a la vez');
const fams = Entidades.familias();
ok(JSON.stringify(fams) === JSON.stringify(['cajachica', 'capitalhumano', 'lineas', 'otros', 'vehiculos']),
   'son las cinco esperadas: ' + fams.join(', '));
const suma = fams.reduce((a, f) => a + Entidades.deFamilia(f).length, 0);
ok(suma === Entidades.migrables().length,
   'cada migrable cae en exactamente una familia (' + suma + ' = ' + Entidades.migrables().length + ')');
ok(Entidades.deFamilia().length === Entidades.migrables().length,
   'deFamilia() sin filtro es lo mismo que migrables(): se puede pasar el filtro sin condicionales');
ok(Entidades.deFamilia('vehiculos').length === 8, 'la familia de vehículos son 8 hojas');
ok(Entidades.deFamilia(' VEHICULOS ').length === 8,
   'y el nombre se normaliza: con espacios y en mayúsculas da lo mismo');
ok(Entidades.deFamilia('no-existe').length === 0, 'una familia inventada da vacío, no todo');
ok(Entidades.deFamilia('vehiculos').every((e) => e.familia === 'vehiculos'),
   'y todas traen su familia puesta en el objeto, no solo en el catálogo');
// La trampa que valía la pena recordar: había DOS hojas de reasignaciones, y la que se
// llamaba HISTORIAL_REASIGNACIONES era de LÍNEAS, no de vehículos — su columna era
// "ID Linea", no un folio. Ya se eliminó; la que queda es la de vehículos.
ok(Entidades.de('REASIGNACIONES_VEHICULOS').familia === 'vehiculos',
   'la de vehículos es REASIGNACIONES_VEHICULOS, que sí trae Folio Vehiculo');
ok(Entidades.de('TICKETS').familia === 'otros',
   'TICKETS no es de vehículos: su PLACA puede decir VARIAS o traer dos placas');

console.log('\n8. Los nombres de columna son los mismos para todos');
ok(Entidades.COLUMNA_ID === 'ID', 'la llave propia se llama ID');
ok(Entidades.COLUMNA_ID_ANTERIOR === 'ID ANTERIOR', 'el respaldo se llama ID ANTERIOR');
ok(Entidades.COLUMNA_ID_ANTERIOR_LEGADO === 'ID APPSHEET',
   'y queda registrado el nombre viejo, solo para poder avisar si aparece en un libro');
ok(Entidades.COLUMNA_ID_ANTERIOR !== Entidades.COLUMNA_ID_ANTERIOR_LEGADO,
   'que son distintos es justo el punto del cambio');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);
