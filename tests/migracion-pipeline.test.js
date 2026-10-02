/**
 * Pruebas de la reversa y las guardas del pipeline (src/MigracionPipeline.gs).
 * Ver el plan en docs/ids-asignacion.md y el archivo mismo.
 *
 * Lo que de verdad protege esto: que deshacer la migración no borre una columna que era
 * original, y que no invente valores viejos para filas que nunca los tuvieron.
 * Correr: node tests/migracion-pipeline.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const lee = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');

/**
 * Una hoja falsa con las operaciones que el pipeline usa. Guarda las columnas por nombre
 * para poder revisar al final qué quedó y qué se borró.
 */
function hojaFalsa(encabezados, filas) {
  const datos = filas.map((f) => f.slice());
  const enc = encabezados.slice();
  const api = {
    nombre: null,
    enc, datos,
    getName: () => api.nombre,
    getLastRow: () => datos.length + 1,
    getLastColumn: () => enc.length,
    getMaxRows: () => datos.length + 1,
    getMaxColumns: () => enc.length,
    getRange: (f, c, nf, nc) => ({
      getValues: () => {
        if (f === 1) return [enc.slice(c - 1, c - 1 + (nc || 1))];
        const out = [];
        for (let i = 0; i < (nf || 1); i++) {
          const fila = datos[f - 2 + i] || [];
          out.push(fila.slice(c - 1, c - 1 + (nc || 1)));
        }
        return out;
      },
      setValues: (vals) => {
        vals.forEach((fila, i) => {
          const dest = f === 1 ? enc : (datos[f - 2 + i] = datos[f - 2 + i] || []);
          fila.forEach((v, j) => {
            if (f === 1) enc[c - 1 + j] = v; else dest[c - 1 + j] = v;
          });
        });
      },
      setValue: (v) => { if (f === 1) enc[c - 1] = v; },
      setNumberFormat: () => {},
      setFontWeight: () => {},
    }),
    insertColumnsAfter: () => {},
    setFrozenRows: () => {},
    appendRow: () => {},
    setName: (n) => { api.nombre = n; },
    deleteRows: (desde, cuantas) => { datos.splice(desde - 2, cuantas); },
    getMaxRows: () => datos.length + 1,
    /** copyTo simulado: mete una copia en el destino, como lo hace Apps Script */
    copyTo: (dest) => {
      const copia = hojaFalsa(enc.slice(), datos.map((f) => f.slice()));
      copia.nombre = 'Copia de ' + api.nombre;
      // El destino que expone SpreadsheetApp.create guarda por api.nombre, así que la
      // copia se registra y setName la reubica.
      const reg = () => {
        Object.keys(destino.hojas).forEach((k) => { if (destino.hojas[k] === copia) delete destino.hojas[k]; });
        destino.hojas[copia.nombre] = copia;
      };
      reg();
      const setNameOriginal = copia.setName;
      copia.setName = (n) => { setNameOriginal(n); reg(); };
      return copia;
    },
    deleteColumn: (pos) => {
      enc.splice(pos - 1, 1);
      datos.forEach((f) => f.splice(pos - 1, 1));
    },
    /** Lo que quedó en una columna, por nombre */
    col(nombre) {
      const i = enc.findIndex((c) => String(c).trim().toUpperCase() === nombre.toUpperCase());
      return i === -1 ? null : datos.map((f) => f[i]);
    },
    tiene(nombre) { return this.col(nombre) !== null; },
  };
  return api;
}

const hojas = {};
const props = {};
let destino = null;
/** El libro original: las mismas hojas, más copiar y borrar pestañas */
const libro = {
  getSheetByName: (n) => hojas[n] || null,
  insertSheet: (n) => { hojas[n] = hojaFalsa(['FECHA'], []); hojas[n].nombre = n; return hojas[n]; },
  getSheets: () => Object.keys(hojas).map((k) => hojas[k]),
  deleteSheet: (s) => { delete hojas[s.nombre]; },
};
const contexto = vm.createContext({
  console,
  Logger: { log: () => {} },
  Session: { getScriptTimeZone: () => 'America/Mexico_City', getActiveUser: () => ({ getEmail: () => 'prueba@x.com' }) },
  Utilities: { formatDate: () => '2026-09-29 1200' },
  DriveApp: { getFileById: () => ({ getName: () => 'X', makeCopy: () => ({ getId: () => 'COPIA1', getUrl: () => 'url' }) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperties: (o) => Object.assign(props, o),
      setProperty: (k, v) => { props[k] = v; },
    }),
  },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  SpreadsheetApp: {
    flush: () => {},
    openById: () => libro,
    create: (nombre) => {
      destino = { nombre: nombre, hojas: {} };
      destino.hojas['Hoja 1'] = hojaFalsa(['x'], []);
      destino.hojas['Hoja 1'].nombre = 'Hoja 1';
      return {
        getName: () => nombre,
        getUrl: () => 'url-destino',
        getId: () => 'ID_DESTINO',
        getSheets: () => Object.keys(destino.hojas).map((k) => destino.hojas[k]),
        getSheetByName: (n) => destino.hojas[n] || null,
        deleteSheet: (s) => { delete destino.hojas[s.nombre]; },
      };
    },
  },
  Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS_PRUEBA' } },
});
vm.runInContext(
  lee('utils', 'Ids.gs') + '\n' + lee('config', 'Entidades.gs') + '\n' +
  lee('MigracionIds.gs') + '\n' + lee('MigracionPipeline.gs') +
  '\nthis.migracionRevertir = migracionRevertir; this.migracionEstado = migracionEstado;' +
  '\nthis.asignarIds = asignarIds; this.migracionEstadoSello = migracionEstadoSello;' +
  '\nthis.migracionSellar_ = migracionSellar_; this.migracionSellado_ = migracionSellado_;' +
  '\nthis.MIGRACION_PROP_SELLO = MIGRACION_PROP_SELLO;' +
  '\nthis.Ids = Ids; this.Entidades = Entidades;',
  contexto
);
const { migracionRevertir, Ids } = contexto;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

/** Arma el escenario: padre pisado, hijo con referencia pisada, y una hoja no pisada */
function escenario() {
  Object.keys(hojas).forEach((k) => delete hojas[k]);
  // LINEAS TELEFONICAS: su columna se llamaba ID -> se pisó, tiene respaldo.
  // La fila 3 nació DESPUÉS de migrar: su respaldo está vacío.
  hojas['LINEAS TELEFONICAS'] = hojaFalsa(
    ['ID', 'FOLIO', 'ID ANTERIOR'],
    [['LIN-00000000AAAAAA', 'EQP0001', 'viejo1'],
     ['LIN-00000001BBBBBB', 'EQP0002', 'viejo2'],
     ['LIN-00000002CCCCCC', 'EQP0003', '']]);
  // INSPECCIONES LINEAS: su ID LINEA se reescribió en su lugar
  hojas['INSPECCIONES LINEAS'] = hojaFalsa(
    ['ID', 'ID LINEA'],
    [['ILI-00000000DDDDDD', 'LIN-00000000AAAAAA'],
     ['ILI-00000001EEEEEE', 'LIN-00000002CCCCCC']]);
  // VEHICULOS: su columna se llama ID_VEHICULO -> NO se pisó, el ID es nuestro
  hojas['VEHICULOS'] = hojaFalsa(
    ['ID', 'ID_VEHICULO', 'FOLIO'],
    [['VEH-00000000FFFFFF', 'refwf1', 'MOT0001']]);
  // VERIFICACIONES: su folio se respetó y el ID del padre fue a una columna nueva
  hojas['VERIFICACIONES'] = hojaFalsa(
    ['ID', 'FOLIO VEHICULO', 'ID VEHICULO'],
    [['VER-00000000GGGGGG', 'MOT0001', 'VEH-00000000FFFFFF']]);
  // CAMBIOS LINEAS TELEFONICAS: su "ID APPSHEET" es la columna ORIGINAL, no un respaldo
  hojas['CAMBIOS LINEAS TELEFONICAS'] = hojaFalsa(
    ['ID', 'ID APPSHEET', 'ID_LINEA'],
    [['CLI-00000000HHHHHH', 'ee398840', 'LIN-00000000AAAAAA']]);
  Object.keys(hojas).forEach((k) => { hojas[k].nombre = k; });
}

console.log('1. El ensayo no toca nada');
escenario();
const antes = JSON.stringify(hojas['LINEAS TELEFONICAS'].datos);
migracionRevertir();
ok(JSON.stringify(hojas['LINEAS TELEFONICAS'].datos) === antes, 'sin { escribir: true } las hojas quedan igual');

console.log('\n2. Las columnas ID pisadas recuperan su valor viejo');
escenario();
migracionRevertir({ escribir: true });
const lin = hojas['LINEAS TELEFONICAS'];
ok(lin.col('ID')[0] === 'viejo1' && lin.col('ID')[1] === 'viejo2',
   'ID volvió a "viejo1" y "viejo2", tomados de ID ANTERIOR');
ok(!lin.tiene('ID ANTERIOR'), 'y el respaldo se borró: ya cumplió');

console.log('\n3. Una fila creada DESPUÉS de migrar no inventa un valor viejo');
ok(lin.col('ID')[2] === '', 'su ID queda vacío, porque nunca tuvo uno viejo');
console.log('     (por eso la reversa no es una máquina del tiempo: para eso está la copia)');

console.log('\n4. Las referencias pisadas se reconstruyen desde el padre');
escenario();
migracionRevertir({ escribir: true });
const insp = hojas['INSPECCIONES LINEAS'];
ok(insp.col('ID LINEA')[0] === 'viejo1',
   'ID LINEA volvió a "viejo1": se resolvió por el ID del padre y su ID ANTERIOR');
ok(insp.col('ID LINEA')[1] === 'LIN-00000002CCCCCC',
   'la que apunta a una fila nueva se deja intacta, no se borra');

console.log('\n5. Donde el ID era NUESTRO, la columna entera se borra');
escenario();
migracionRevertir({ escribir: true });
ok(!hojas['VEHICULOS'].tiene('ID'), 'VEHICULOS pierde su columna ID');
ok(hojas['VEHICULOS'].col('ID_VEHICULO')[0] === 'refwf1', 'y su ID_VEHICULO sigue intacto');
ok(hojas['VEHICULOS'].col('FOLIO')[0] === 'MOT0001', 'igual que el folio');

console.log('\n6. Las columnas de referencia agregadas también se borran');
ok(!hojas['VERIFICACIONES'].tiene('ID VEHICULO'), 'VERIFICACIONES pierde "ID VEHICULO"');
ok(hojas['VERIFICACIONES'].col('FOLIO VEHICULO')[0] === 'MOT0001',
   'y su FOLIO VEHICULO nunca se tocó: sigue siendo el folio, no un ID');

console.log('\n7. LA TRAMPA: el ID APPSHEET de CAMBIOS LINEAS es la columna ORIGINAL');
escenario();
migracionRevertir({ escribir: true });
const cli = hojas['CAMBIOS LINEAS TELEFONICAS'];
ok(cli.tiene('ID APPSHEET'), 'NO se borró: esa columna no la creamos nosotros');
ok(cli.col('ID APPSHEET')[0] === 'ee398840', 'y conserva su valor');
ok(!cli.tiene('ID'), 'lo que sí se borra es su columna ID, que sí era nuestra');

console.log('\n8. Deshacer dos veces no hace daño');
escenario();
migracionRevertir({ escribir: true });
const trasUna = JSON.stringify({ v: hojas['VEHICULOS'].enc, c: hojas['CAMBIOS LINEAS TELEFONICAS'].enc });
migracionRevertir({ escribir: true });
ok(JSON.stringify({ v: hojas['VEHICULOS'].enc, c: hojas['CAMBIOS LINEAS TELEFONICAS'].enc }) === trasUna,
   'la segunda corrida no borra nada más');

console.log('\n9. Queda rastro en LOG_MIGRACION');
ok(!!hojas['LOG_MIGRACION'], 'se creó la hoja de bitácora sola');

const truenaCon = (fn, patron) => {
  try { fn(); return false; } catch (e) { return patron.test(e.message); }
};

// ---------------------------------------------------------------------------- el sello
//
// Lo que protege esto: que después de cablear las referencias, nadie pueda regenerar ni
// deshacer los IDs. No es paranoia — son dos funciones de un clic en el editor de Apps
// Script, y cualquiera de las dos deja TODOS los `ID VEHICULO` / `ID LINEA` apuntando a
// IDs que ya no existen, sin error, sin aviso y sin forma de reconstruirlos.
const LIBRO = 'SS_PRUEBA'; // el que devuelve Config.SPREADSHEET_IDS.VEHICULOS en las pruebas
const desellar = () => { delete props[contexto.MIGRACION_PROP_SELLO]; };

console.log('\n16. Sin sello, nada estorba');
escenario();
desellar();
ok(!contexto.migracionSellado_(LIBRO), 'el libro arranca sin sello');
ok(!truenaCon(() => migracionRevertir({ escribir: true }), /SELLADO/),
   'deshacer corre, porque todavía no hay referencias colgando de los IDs');

console.log('\n17. El sello es por libro, no global');
desellar();
ok(contexto.migracionSellar_(LIBRO) === true, 'sellar el libro devuelve true la primera vez');
ok(contexto.migracionSellar_(LIBRO) === false, 'y false la segunda: no se sella dos veces');
ok(contexto.migracionSellado_(LIBRO), 'el libro quedó sellado');
ok(!contexto.migracionSellado_('OTRO_LIBRO'),
   'y OTRO_LIBRO no: sellar el laboratorio no sella producción');
ok(contexto.migracionSellar_('OTRO_LIBRO') && contexto.migracionSellado_(LIBRO),
   'sellar un segundo libro no borra el sello del primero');

console.log('\n18. Con sello, deshacer se niega');
escenario();
desellar();
contexto.migracionSellar_(LIBRO);
const antesDelSello = JSON.stringify(hojas['LINEAS TELEFONICAS'].datos);
ok(truenaCon(() => migracionRevertir({ escribir: true }), /SELLADO/),
   'migracionRevertir({escribir:true}) truena diciendo que el libro está sellado');
ok(JSON.stringify(hojas['LINEAS TELEFONICAS'].datos) === antesDelSello,
   'y no alcanzó a tocar una sola celda');
console.log('     (la guarda de producción NO alcanzaba: el libro nuevo tiene otro id)');

console.log('\n19. Con sello, regenerar los IDs se niega');
escenario();
desellar();
contexto.migracionSellar_(LIBRO);
ok(truenaCon(() => contexto.asignarIds({ escribir: true, rehacer: true }), /SELLADO/),
   'asignarIds({rehacer:true, escribir:true}) truena');

console.log('\n20. El sello solo frena lo que destruye');
escenario();
desellar();
contexto.migracionSellar_(LIBRO);
ok(!truenaCon(() => contexto.asignarIds({ rehacer: true }), /SELLADO/),
   'el ENSAYO de rehacer sí corre: no escribe nada, y sirve para ver qué pasaría');
ok(!truenaCon(() => migracionRevertir(), /SELLADO/),
   'el ensayo de deshacer también');
ok(!truenaCon(() => contexto.asignarIds({ escribir: true }), /SELLADO/),
   'y asignarIds SIN rehacer corre aunque esté sellado: solo llena los huecos, no pisa');
console.log('     (ese último es el que se vuelve a correr cuando la corrida se corta por tiempo)');

console.log('\n21. Y se puede consultar sin cambiar nada');
desellar();
const sinSellos = contexto.migracionEstadoSello();
ok(/Ning[uú]n libro/.test(sinSellos), 'con la lista vacía lo dice claro');
contexto.migracionSellar_(LIBRO);
const conSello = contexto.migracionEstadoSello();
ok(conSello.indexOf(LIBRO) !== -1 && /Sellado: S/.test(conSello),
   'y con sello nombra el libro y avisa que el apuntado está sellado');
desellar();

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);
