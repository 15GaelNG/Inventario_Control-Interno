/**
 * EL ORÁCULO: corre los pasos de la migración DE APPS SCRIPT (src/MigracionIds.gs, tal cual)
 * sobre un libro en JSON, y guarda cómo quedó. Las pruebas de paridad de Python
 * (tools/migracion/tests_py/test_paridad.py) corren lo mismo con el port y exigen celdas
 * idénticas. Mientras el oráculo y el port coincidan, el port hace lo que hacía Apps Script.
 *
 *   node tools/migracion/oraculo.js entrada.json salida.json --pasos revisar,renombrar,ids
 *        [--escribir] [--semilla 42] [--familia vehiculos]
 *
 * La salida trae { libro, reportes: [{ paso, texto }] }. El azar de los IDs sale de
 * mulberry32 con la semilla dada, el mismo generador que usa Python.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { libroEnMemoria, mulberry32 } = require('../../tests/fakes/libro-en-memoria');

const RAIZ = path.join(__dirname, '..', '..');
const lee = (...p) => fs.readFileSync(path.join(RAIZ, 'src', ...p), 'utf8');

/** Nombre del paso (el de los pipelines) → función de MigracionIds.gs */
const PASOS = {
  revisar: 'revisarAntesDeMigrar',
  renombrar: 'renombrarLlaveAnterior',
  ids: 'asignarIds',
  mover: 'moverIdsAlInicio',
  respaldo: 'limpiarRespaldoRedundante',
  auditar: 'auditarIds',
  nombres: 'homologarNombres',
  referencias: 'reescribirReferencias',
};

/**
 * @param {object} def        el libro en el formato de libro-en-memoria.js
 * @param {string[]} pasos    nombres de PASOS, en orden
 * @param {{escribir, semilla, familia}} opciones
 * @return {{libro: object, reportes: {paso: string, texto: string}[]}}
 */
function correr(def, pasos, opciones) {
  const o = Object.assign({ escribir: false, semilla: 42, familia: null }, opciones || {});
  const libro = libroEnMemoria(def);
  const props = {};
  if (def.sellado) props.MIGRACION_IDS_SELLADOS = def.id;

  const ctx = vm.createContext({
    console,
    Logger: { log: () => {} },
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => def.id } },
    SpreadsheetApp: {
      openById: (id) => {
        if (id !== def.id) throw new Error('El oráculo solo conoce el libro ' + def.id + ', no ' + id);
        return libro;
      },
      flush: () => {},
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; },
      }),
    },
    __azar: mulberry32(o.semilla),
  });
  vm.runInContext('Math.random = __azar;', ctx);
  vm.runInContext(lee('config', 'Entidades.gs'), ctx);
  vm.runInContext(lee('utils', 'Ids.gs'), ctx);
  vm.runInContext(lee('MigracionIds.gs') + '\nthis.__pasos = {' +
    Object.keys(PASOS).map((k) => k + ': ' + PASOS[k]).join(', ') + '};', ctx);

  const reportes = pasos.map((entrada) => {
    // "referencias:vehiculos" = ese paso, solo esa familia (gana sobre --familia)
    const [paso, familia] = entrada.split(":");
    const fn = ctx.__pasos[paso];
    if (!fn) throw new Error('Paso desconocido: ' + paso + '. Los que hay: ' + Object.keys(PASOS).join(', '));
    let texto;
    try {
      texto = String(fn({ escribir: o.escribir, familia: familia || o.familia }));
    } catch (err) {
      texto = 'TRONÓ: ' + err.message;
    }
    return { paso: entrada, texto };
  });

  const salida = libro._aJson();
  salida.sellado = String(props.MIGRACION_IDS_SELLADOS || '').split(',').indexOf(def.id) !== -1;
  return { libro: salida, reportes };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const valor = (bandera) => {
    const i = args.indexOf(bandera);
    return i === -1 ? null : args[i + 1];
  };
  const [entrada, salida] = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] || '').match(/^--(pasos|semilla|familia)$/));
  if (!entrada || !salida || !valor('--pasos')) {
    console.error('Uso: node oraculo.js entrada.json salida.json --pasos a,b [--escribir] [--semilla N] [--familia f]');
    process.exit(2);
  }
  const def = JSON.parse(fs.readFileSync(entrada, 'utf8'));
  const r = correr(def, valor('--pasos').split(','), {
    escribir: args.includes('--escribir'),
    semilla: Number(valor('--semilla') || 42),
    familia: valor('--familia'),
  });
  fs.writeFileSync(salida, JSON.stringify(r));
}

module.exports = { correr, PASOS };
