/**
 * Pruebas de cómo SheetUtils.insert le pone su ID a un renglón nuevo.
 * Es uno de los dos únicos lugares donde nace un ID. Ver docs/ids-asignacion.md, sección 8.
 * Correr: node tests/insert-ids.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const lee = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');

/** Una hoja falsa: solo lo que SheetUtils necesita de SpreadsheetApp */
function hojaFalsa(encabezados) {
  const filas = [];
  return {
    filas,
    getLastRow: () => filas.length + 1,
    getLastColumn: () => encabezados.length,
    getRange: (f, c, nf, nc) => ({
      getValues: () => (f === 1 ? [encabezados] : filas.slice(f - 2, f - 2 + (nf || 1))),
      setValues: () => {},
    }),
    appendRow: (fila) => filas.push(fila),
    getName: () => 'hoja',
  };
}

let hoja = null;
const contexto = vm.createContext({
  console,
  SpreadsheetApp: { openById: () => ({ getSheetByName: () => hoja }), flush: () => {} },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  LockService: {}, Utilities: {},
});
vm.runInContext(
  lee('utils', 'Ids.gs') + '\n' + lee('config', 'Entidades.gs') + '\n' + lee('utils', 'SheetUtils.gs') +
  '\nthis.SheetUtils = SheetUtils; this.Ids = Ids; this.Entidades = Entidades;',
  contexto
);
const { SheetUtils, Ids } = contexto;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
function truena(fn, texto) {
  let tronó = false, mensaje = '';
  try { fn(); } catch (e) { tronó = true; mensaje = e.message; }
  ok(tronó, texto + (tronó ? '' : '  (NO tronó)'));
  return mensaje;
}

console.log('1. Una hoja del catálogo recibe un ID con su prefijo');
hoja = hojaFalsa(['ID', 'NOMBRE COMPLETO', 'FECHA DE ALTA']);
const uber = SheetUtils.insert('ss', 'UBER', { 'NOMBRE COMPLETO': 'PRUEBA' });
ok(Ids.tieneForma(uber.ID), 'el ID tiene la forma del sistema: ' + uber.ID);
ok(Ids.prefijo(uber.ID) === 'UBE', 'y el prefijo de UBER, no otro');
ok(hoja.filas.length === 1 && hoja.filas[0][0] === uber.ID, 'quedó escrito en la columna ID de la hoja');

console.log('\n2. El objeto se muta, para que el servicio pueda devolver el ID');
hoja = hojaFalsa(['ID', 'TIPO ATENCION']);
const fila = { 'TIPO ATENCION': 'X' };
const devuelto = SheetUtils.insert('ss', 'TICKETS', fila);
ok(fila.ID && fila.ID === devuelto.ID, 'fila.ID quedó puesto: los "return { ID: fila[ID_COLUMN] }" siguen sirviendo');
ok(Ids.prefijo(fila.ID) === 'TCK', 'con el prefijo de TICKETS');

console.log('\n3. Si el objeto YA trae ID, se respeta');
hoja = hojaFalsa(['ID', 'FOLIO']);
const suyo = Ids.nuevo('INS');
const conId = SheetUtils.insert('ss', 'INSPECCION VEHICULAR', { ID: suyo, FOLIO: 'AUT0100' });
ok(conId.ID === suyo, 'no se le pone otro encima');
console.log('     (hace falta: InspeccionesService necesita el ID ANTES de escribir,');
console.log('      para nombrar las imágenes como AppSheet: <TABLA>_Images/<id>.<COLUMNA>…)');

console.log('\n4. Una hoja SIN columna ID no se toca');
hoja = hojaFalsa(['CORREO', 'NOMBRE', 'ROL']);
const usuario = SheetUtils.insert('ss', 'USUARIOS', { CORREO: 'a@b.com', NOMBRE: 'X', ROL: 'USER' });
ok(!usuario.ID, 'USUARIOS no recibe ID: no tiene esa columna y no está en el catálogo');
ok(hoja.filas.length === 1, 'y aun así el renglón se insertó');

console.log('\n5. Una hoja CON columna ID pero fuera del catálogo, truena');
hoja = hojaFalsa(['ID', 'ALGO']);
const mensaje = truena(() => SheetUtils.insert('ss', 'HOJA INVENTADA', { ALGO: 1 }),
  'no inventa un ID con formato desconocido');
ok(/Entidades/.test(mensaje), 'y el error dice dónde darla de alta: ' + mensaje.slice(0, 60) + '…');

console.log('\n6. Las pestañas del sistema nuevo también tienen prefijo');
hoja = hojaFalsa(['ID', 'TIPO', 'ORIGEN']);
const ev = SheetUtils.insert('ss', 'APP_EVIDENCIAS', { TIPO: 'INSPECCION' });
ok(Ids.prefijo(ev.ID) === 'EVI', 'APP_EVIDENCIAS → EVI');
hoja = hojaFalsa(['ID', 'FECHA', 'TIPO']);
const mov = SheetUtils.insert('ss', 'APP_MOVIMIENTOS', { TIPO: 'ALTA' });
ok(Ids.prefijo(mov.ID) === 'MOV', 'APP_MOVIMIENTOS → MOV');

console.log('\n7. Dos altas seguidas no chocan');
hoja = hojaFalsa(['ID', 'X']);
const vistos = {};
let repetidos = 0;
for (let i = 0; i < 300; i++) {
  const r = SheetUtils.insert('ss', 'TICKETS', { X: i });
  if (vistos[r.ID]) repetidos++;
  vistos[r.ID] = true;
}
ok(repetidos === 0, '300 altas seguidas, ningún ID repetido');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);
