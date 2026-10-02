/**
 * Exporta a tools/migracion/catalogo.json lo que la herramienta de Python necesita saber de
 * las hojas: el catálogo de Entidades.gs y las listas de la migración. Lo lee de los MISMOS
 * .gs que usa la app, para que haya una sola fuente; Python nunca lo escribe a mano.
 *
 *   node tools/migracion/exportar-catalogo.js            escribe catalogo.json
 *   node tools/migracion/exportar-catalogo.js --revisar  truena si catalogo.json está viejo
 *
 * El --revisar corre en `npm test`: un cambio en Entidades.gs sin reexportar no pasa.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..', '..');
const SALIDA = path.join(__dirname, 'catalogo.json');
const lee = (...p) => fs.readFileSync(path.join(RAIZ, 'src', ...p), 'utf8');

function construir() {
  const ctx = vm.createContext({ console });
  vm.runInContext(lee('config', 'Entidades.gs') + '\nthis.Entidades = Entidades;', ctx);
  // MigracionIds y Replanche solo declaran constantes y funciones al cargar: no llaman a
  // nada de Apps Script hasta que se ejecuta una función, así que basta con Entidades.
  vm.runInContext(lee('MigracionIds.gs') +
    '\nthis.MIGRACION_REFERENCIAS = MIGRACION_REFERENCIAS;' +
    '\nthis.MIGRACION_NOMBRES = MIGRACION_NOMBRES;' +
    '\nthis.ENCABEZADOS_DEDUCIDOS = ENCABEZADOS_DEDUCIDOS;' +
    '\nthis.MIGRACION_SS_PRODUCCION = MIGRACION_SS_PRODUCCION;' +
    '\nthis.MIGRACION_META_SELLO = MIGRACION_META_SELLO;', ctx);
  vm.runInContext(lee('MigracionReplanche.gs') +
    '\nthis.REPL = { destino: REPL_DESTINO, destinoNombre: REPL_DESTINO_NOMBRE, ' +
    'origen: REPL_ORIGEN, prohibidos: REPL_PROHIBIDOS, temporal: REPL_TEMPORAL };', ctx);

  const E = ctx.Entidades;
  // Copia limpia (sin prototipos del contexto vm) y con las llaves en orden estable
  const plano = (x) => JSON.parse(JSON.stringify(x));
  return {
    _aviso: 'GENERADO por tools/migracion/exportar-catalogo.js desde src/. No se edita a mano.',
    columnas: {
      id: E.COLUMNA_ID,
      idAnterior: E.COLUMNA_ID_ANTERIOR,
      idAnteriorLegado: E.COLUMNA_ID_ANTERIOR_LEGADO,
    },
    // todas(): moverIdsAlInicio las recorre todas; migrable dice cuáles pasan por los IDs
    hojas: plano(E.todas().map((e) => Object.assign({}, e, {
      migrable: !e.delSistemaNuevo && !e.externa,
    }))),
    familias: plano(E.familias()),
    referenciasEntidades: plano(E.REFERENCIAS),
    referenciasMigracion: plano(ctx.MIGRACION_REFERENCIAS),
    nombres: plano(ctx.MIGRACION_NOMBRES),
    encabezadosDeducidos: plano(ctx.ENCABEZADOS_DEDUCIDOS),
    produccion: ctx.MIGRACION_SS_PRODUCCION,
    selloMetadato: ctx.MIGRACION_META_SELLO,
    replanche: plano(ctx.REPL),
  };
}

const texto = JSON.stringify(construir(), null, 2) + '\n';
if (process.argv.includes('--revisar')) {
  const actual = fs.existsSync(SALIDA) ? fs.readFileSync(SALIDA, 'utf8').replace(/\r\n/g, '\n') : '';
  if (actual !== texto) {
    console.error('  ✘ tools/migracion/catalogo.json está viejo: corre node tools/migracion/exportar-catalogo.js');
    process.exit(1);
  }
  console.log('  ✔ tools/migracion/catalogo.json está al día con src/');
} else {
  fs.writeFileSync(SALIDA, texto);
  console.log('Escrito ' + SALIDA);
}
