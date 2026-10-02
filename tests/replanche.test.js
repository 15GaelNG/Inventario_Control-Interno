/**
 * Pruebas del replanchado producción → libro de experimentos (src/MigracionReplanche.gs).
 *
 * Lo que de verdad protege esto: que el único procedimiento que escribe en un libro que NO
 * es el suyo no pueda apuntar al libro equivocado. Producción y el libro de pruebas
 * compartido del equipo están en la lista negra; el destino se comprueba por id Y por
 * nombre. Lo demás —que el ensayo no escriba, que las columnas de la migración se vayan y
 * las capturadas a mano no— viene después en importancia.
 *
 * Correr: node tests/replanche.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fallas = 0;
function ok(condicion, descripcion) {
  console.log('  ' + (condicion ? '✔' : '✘') + ' ' + descripcion);
  if (!condicion) fallas++;
}
function truena(fn, textoEsperado, descripcion) {
  let msg = null;
  try { fn(); } catch (e) { msg = e.message; }
  const bien = msg !== null && (!textoEsperado || msg.indexOf(textoEsperado) !== -1);
  ok(bien, descripcion + (msg === null ? ' (NO tronó)' : ''));
  return msg;
}

// ------------------------------------------------------------------- hoja falsa

function hojaFalsa(enc, filas) {
  const datos = filas.map((f) => f.slice());
  const api = {
    _enc: enc.slice(),
    _datos: datos,
    _congeladas: 1,
    _maxFilas: datos.length + 50,
    _maxCols: enc.length + 5,
    _limpiada: 0,
    getLastRow: () => (api._enc.length ? api._datos.length + 1 : 0),
    getLastColumn: () => api._enc.length,
    getMaxRows: () => api._maxFilas,
    getMaxColumns: () => api._maxCols,
    getFrozenRows: () => api._congeladas,
    setFrozenRows: (n) => { api._congeladas = n; },
    clear: () => { api._enc = []; api._datos.length = 0; api._limpiada++; },
    insertRowsAfter: (desde, n) => { api._maxFilas += n; },
    deleteRows: (desde, n) => { api._maxFilas -= n; },
    insertColumnsAfter: (desde, n) => { api._maxCols += n; },
    deleteColumns: (desde, n) => { api._maxCols -= n; },
    getName: () => api._nombre,
    setName: (n) => { api._libro._renombrar(api, n); },
    getParent: () => api._libro._api,
    getRange: (f, c, nf, nc) => ({
      // copyValuesToRange simulado: solo valores, a otra hoja del MISMO libro
      copyValuesToRange: (destino, c1, c2, f1, f2) => {
        if (destino._libro !== api._libro) throw new Error('copyValuesToRange entre libros distintos');
        const vals = api.getRange(f, c, nf, nc).getValues();
        destino.getRange(f1, c1, f2 - f1 + 1, c2 - c1 + 1).setValues(vals);
      },
      getValues: () => {
        const out = [];
        for (let i = 0; i < (nf || 1); i++) {
          const fila = f + i === 1 ? api._enc : (api._datos[f + i - 2] || []);
          out.push(fila.slice(c - 1, c - 1 + (nc || 1)));
        }
        return out;
      },
      setValues: (vals) => {
        vals.forEach((fila, i) => {
          if (f + i === 1) { api._enc = fila.slice(); return; }
          const j = f + i - 2;
          api._datos[j] = (api._datos[j] || []).slice();
          fila.forEach((v, k) => { api._datos[j][c - 1 + k] = v; });
        });
      },
    }),
    // copyTo simulado: la hoja entera llega como pestaña nueva al libro destino
    copyTo: (libro) => {
      const copia = hojaFalsa(api._enc, api._datos);
      libro._agregar(copia);
      return copia;
    },
    // helpers de la prueba
    col(nombre) {
      const i = api._enc.findIndex((c) => String(c).trim().toUpperCase() === nombre.toUpperCase());
      return i === -1 ? null : api._datos.map((f) => f[i]);
    },
    tiene(nombre) { return api.col(nombre) !== null; },
  };
  return api;
}

// ------------------------------------------------------------------- el escenario

const ID_PROD = '1h5ibDsmVtrG27rwMaOvj-lm08QZUHzDv3woPmkfRQrk';
const ID_DEV = '1fC77Uu1ePVUySNvhgWXMHqWpLhGhBMTZZMEblU2nUhI';
const ID_LAB = '1-RA6lmh-rZ-OKfsZSLl2Qd9lLyuDZ3dx3fP0M7qL-5o';

let libros, props, logueado, nombreLab;

function escenario() {
  props = {};
  logueado = [];
  nombreLab = 'Inventario Reemplazable';
  // Producción: estado PRE-migración (sin ID, con su llave vieja)
  const prod = {
    'VEHICULOS': hojaFalsa(['ID_VEHICULO', 'FOLIO', 'PLACA'],
      [['REFWF1', 'CTA0001', 'AAA111'], ['REFWF2', 'CTA0002', 'BBB222']]),
    'LINEAS TELEFONICAS': hojaFalsa(['ID', 'NUMERO'], [['ee398840', '4421111111']]),
    'TICKETS': hojaFalsa(['ID', 'TICKET'], [['aa11', 'T-1']]),
  };
  // El LAB: ya migrado (tiene ID y respaldo), y con una columna capturada a mano
  const lab = {
    'VEHICULOS': hojaFalsa(['ID', 'ID_VEHICULO', 'FOLIO', 'PLACA'],
      [['VEH-00000000AAAAAA', 'REFWF1', 'CTA0001', 'AAA111']]),
    'LINEAS TELEFONICAS': hojaFalsa(['ID', 'ID ANTERIOR', 'NUMERO', 'COLOR'],
      [['LIN-00000000BBBBBB', 'ee398840', '4421111111', 'ROJO']]),
    'TICKETS': hojaFalsa(['ID', 'ID APPSHEET', 'TICKET'],
      [['TCK-00000000CCCCCC', 'aa11', 'T-1']]),
  };
  libros = {};
  libros[ID_PROD] = { nombre: 'ControlVehicular', hojas: prod };
  libros[ID_LAB] = { nombre: null, hojas: lab };   // el nombre se lee de nombreLab
  libros[ID_DEV] = { nombre: 'VEHICULOS', hojas: {} };
  return { prod, lab };
}

/** Un arreglo `const NOMBRE = [...]` de MigracionIds.gs, el de verdad (sin cargar todo el archivo). */
function catalogoDeMigracionIds(nombre) {
  const fuente = fs.readFileSync(path.join(__dirname, '..', 'src', 'MigracionIds.gs'), 'utf8').replace(/\r\n/g, '\n');
  const desde = fuente.indexOf('const ' + nombre + ' = [');
  const bloque = fuente.slice(fuente.indexOf('[', desde), fuente.indexOf('\n];', desde) + 2);
  return vm.runInNewContext('(' + bloque + ')');
}

function cargar() {
  const ctx = vm.createContext({
    ENCABEZADOS_DEDUCIDOS: catalogoDeMigracionIds('ENCABEZADOS_DEDUCIDOS'),
    MIGRACION_NOMBRES: catalogoDeMigracionIds('MIGRACION_NOMBRES'),
    console,
    Logger: { log: () => {} },
    Session: { getActiveUser: () => ({ getEmail: () => 'ayrton@x.com' }) },
    Utilities: { formatDate: () => '2026-09-30' },
    MIGRACION_SS_PRODUCCION: ID_PROD,
    pipeLog_: (ssId, paso, modo, res) => logueado.push([ssId, paso, modo, res]),
    SpreadsheetApp: {
      flush: () => {},
      openById: (id) => {
        const l = libros[id];
        if (!l) throw new Error('libro desconocido ' + id);
        if (!l._api) {
          const enlazar = (h, n) => { h._nombre = n; h._libro = l; };
          Object.keys(l.hojas).forEach((n) => enlazar(l.hojas[n], n));
          l._agregar = (h) => { let n = 'Copia de X'; while (l.hojas[n]) n += '+'; l.hojas[n] = h; enlazar(h, n); };
          l._renombrar = (h, n) => {
            if (l.hojas[n]) throw new Error('ya existe una hoja llamada ' + n);
            delete l.hojas[h._nombre]; l.hojas[n] = h; h._nombre = n;
          };
          l._api = {
            getName: () => (id === ID_LAB ? nombreLab : l.nombre),
            getSheetByName: (n) => l.hojas[n] || null,
            getSheets: () => Object.keys(l.hojas).map((n) => l.hojas[n]),
            deleteSheet: (h) => { delete l.hojas[h._nombre]; },
            _agregar: (h) => l._agregar(h),
          };
        }
        return l._api;
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; },
        deleteProperty: (k) => { delete props[k]; },
      }),
    },
  });
  const lee = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');
  vm.runInContext(lee('config', 'Entidades.gs'), ctx);
  vm.runInContext(lee('MigracionReplanche.gs') +
    '\nthis.api = { replancharDesdeProduccion, replDestino_, replEsArtefacto_, replHojas_,' +
    ' REPL_DESTINO, REPL_ORIGEN, REPL_PROHIBIDOS, REPL_PROP_PERDIDAS_OK };', ctx);
  return ctx.api;
}

// ------------------------------------------------------------------------ pruebas

console.log('1. Las guardas de dirección (lo más importante)');
{
  escenario();
  const api = cargar();
  ok(api.REPL_DESTINO !== api.REPL_ORIGEN, 'el destino no es el origen');
  ok(!!api.REPL_PROHIBIDOS[ID_PROD], 'PRODUCCIÓN está en la lista negra');
  ok(!!api.REPL_PROHIBIDOS[ID_DEV], 'el libro de pruebas COMPARTIDO está en la lista negra');
  ok(!api.REPL_PROHIBIDOS[api.REPL_DESTINO], 'y el destino configurado NO está prohibido');
  ok(api.REPL_ORIGEN === ID_PROD, 'el origen es producción, y de ahí solo se lee');
}

console.log('\n2. Si el libro destino no se llama como debe, no se escribe');
{
  escenario();
  const api = cargar();
  nombreLab = 'Otro libro cualquiera';
  truena(() => api.replDestino_(), 'se esperaba',
    'con otro nombre truena en vez de escribir en un desconocido');
  nombreLab = 'Inventario Reemplazable';
  ok(!!api.replDestino_(), 'con el nombre correcto sí resuelve');
}

console.log('\n3. Qué cuenta como columna de la migración');
{
  escenario();
  const api = cargar();
  ok(api.replEsArtefacto_('VEHICULOS', 'ID'), 'ID sí');
  ok(api.replEsArtefacto_('VEHICULOS', 'ID ANTERIOR'), 'ID ANTERIOR sí');
  ok(api.replEsArtefacto_('VEHICULOS', 'id anterior'), 'sin importar mayúsculas ni espacios');
  ok(api.replEsArtefacto_('TICKETS', 'ID APPSHEET'), 'el nombre viejo también, para poder limpiarlo');
  ok(!api.replEsArtefacto_('VEHICULOS', 'COLOR'), 'COLOR no: eso lo capturó alguien');
  ok(!api.replEsArtefacto_('VEHICULOS', 'ID_VEHICULO'), 'ni la llave vieja de producción');
  // Lo que agregan los otros pasos (falsas alarmas del 01/10/2026)
  ok(api.replEsArtefacto_('HOLOGRAMAS', 'ID VEHICULO'), 'la llave foránea que escribe referencias');
  ok(api.replEsArtefacto_('ARQUEOS', 'ID CAJA CHICA'), 'también la de Caja Chica');
  ok(api.replEsArtefacto_('CAMBIOS LINEAS TELEFONICAS', 'NUCO'), 'el encabezado deducido');
  ok(api.replEsArtefacto_('VEHICULOS', 'OFICINA / DESARROLLO'), 'el nombre nuevo de una columna renombrada');
  ok(api.replEsArtefacto_('VEHICULOS', 'ID PERSONA'), 'la liga de Capital Humano');
  ok(!api.replEsArtefacto_('VEHICULOS', 'NUCO'), 'pero solo en SU hoja: NUCO en VEHICULOS no es de la migración');
  ok(!api.replEsArtefacto_('TICKETS', 'ID VEHICULO'), 'ni una llave foránea que esa hoja no tiene');
}

console.log('\n4. El ensayo no escribe, y avisa qué se perdería');
{
  const { lab } = escenario();
  const api = cargar();
  const rep = api.replancharDesdeProduccion();
  ok(lab['VEHICULOS']._limpiada === 0, 'no limpió ni una hoja');
  ok(lab['LINEAS TELEFONICAS'].tiene('COLOR'), 'COLOR sigue ahí');
  ok(rep.indexOf('ENSAYO') !== -1, 'el reporte lo dice');
  ok(rep.indexOf('LINEAS TELEFONICAS.COLOR') !== -1,
    'nombra la columna capturada a mano que se perdería');
  ok(rep.indexOf('VEHICULOS.') === -1 || rep.indexOf('SE PIERDE: ID') === -1,
    'y no cuenta como pérdida lo que sí es de la migración');
}

console.log('\n5. Escribir sin permiso explícito NO borra una columna capturada a mano');
{
  const { lab } = escenario();
  const api = cargar();
  truena(() => api.replancharDesdeProduccion({ escribir: true }), 'COLOR',
    'truena nombrando la columna en riesgo');
  ok(lab['LINEAS TELEFONICAS'].tiene('COLOR'), 'y COLOR sobrevive');
}

console.log('\n6. Con el permiso puesto, replancha de verdad');
{
  const { prod, lab } = escenario();
  const api = cargar();
  props['REPLANCHE_ACEPTO_PERDER_COLUMNAS'] = ID_LAB;
  const rep = api.replancharDesdeProduccion({ escribir: true });

  ok(!lab['VEHICULOS'].tiene('ID'), 'VEHICULOS perdió la columna ID: es el objetivo');
  ok(lab['VEHICULOS'].tiene('ID_VEHICULO'), 'y recuperó la llave vieja de producción');
  ok(!lab['LINEAS TELEFONICAS'].tiene('ID ANTERIOR'), 'el respaldo se fue');
  ok(!lab['TICKETS'].tiene('ID APPSHEET'), 'y el respaldo con el nombre viejo también');
  ok(!lab['LINEAS TELEFONICAS'].tiene('COLOR'), 'COLOR se fue, con permiso');
  ok(lab['LINEAS TELEFONICAS'].col('ID')[0] === 'ee398840',
    'LINEAS TELEFONICAS quedó con el ID viejo de AppSheet, como producción');
  ok(lab['VEHICULOS'].col('FOLIO').length === 2,
    'trae las 2 filas de producción, no la 1 que tenía');
  ok(JSON.stringify(lab['VEHICULOS']._enc) === JSON.stringify(prod['VEHICULOS']._enc),
    'los encabezados quedaron idénticos a producción');
  ok(rep.indexOf('PRE-migración') !== -1, 'el reporte dice que quedó listo');
  ok(logueado.length === 1 && logueado[0][0] === ID_LAB && logueado[0][2] === 'ESCRIBIR',
    'quedó constancia en LOG_MIGRACION, del lado del destino');
  ok(props['REPLANCHE_HOJAS_LISTAS'] === undefined,
    'y al terminar borra el avance, para que la próxima empiece de cero');
}

console.log('\n7. Nunca escribe en producción');
{
  const { prod } = escenario();
  const api = cargar();
  props['REPLANCHE_ACEPTO_PERDER_COLUMNAS'] = ID_LAB;
  api.replancharDesdeProduccion({ escribir: true });
  ok(prod['VEHICULOS']._limpiada === 0 && prod['LINEAS TELEFONICAS']._limpiada === 0,
    'ninguna hoja de producción se limpió');
  ok(prod['VEHICULOS'].col('FOLIO')[0] === 'CTA0001', 'y sus datos están intactos');
}

console.log('\n8. La copia la hace Google: no deja pestañas temporales, y limpia las de una corrida muerta');
{
  const { lab } = escenario();
  const api = cargar();
  props['REPLANCHE_ACEPTO_PERDER_COLUMNAS'] = ID_LAB;
  // una temporal que dejó una corrida que se murió a la mitad
  lab['__replanche VEHICULOS'] = hojaFalsa(['BASURA'], [['x']]);
  const hojaVehiculos = lab['VEHICULOS'];
  api.replancharDesdeProduccion({ escribir: true });
  const temporales = Object.keys(lab).filter((n) => n.indexOf('__replanche') === 0 || n.indexOf('Copia de') === 0);
  ok(temporales.length === 0, 'no quedó ninguna pestaña temporal (había: ' + temporales.join(', ') + ')');
  ok(lab['VEHICULOS'] === hojaVehiculos, 'VEHICULOS es la MISMA hoja de antes (conserva su gid), no una nueva');
  ok(Object.keys(lab).sort().join() === 'LINEAS TELEFONICAS,TICKETS,VEHICULOS', 'el libro tiene exactamente sus hojas');
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);
