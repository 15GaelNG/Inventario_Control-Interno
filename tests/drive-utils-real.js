/**
 * Las funciones de DriveUtils que no tocan Drive por su cuenta (subcarpeta, claveCarpeta…), para las pruebas que
 * simulan Drive con un DriveUtils de mentira: así prueban la regla de verdad (fase 5.7: una sola "subcarpeta") en vez
 * de una copia. DriveUtils.gs no corre nada al cargar, así que se carga solo, sin más globales.
 *   const { subcarpeta, claveCarpeta } = require('./drive-utils-real')();
 * Desde el 28-oct también las primitivas de escritura (crearArchivo, crearCarpeta, mover, renombrar, copiar, aPapelera…):
 * trabajan sobre los objetos que les pasa el servicio, así que sirven con cualquier Drive de mentira. Para un DriveUtils de
 * mentira: { ...require('./drive-utils-real')(), loQueSeSimula }.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = function driveUtilsReal(globales) {
  // globales: lo de Drive que simula la prueba (Drive, DriveApp), para las primitivas que lo usan (crearConApi…)
  const ctx = vm.createContext(Object.assign({}, globales || {}));
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'DriveUtils.gs'), 'utf8') +
    '\nthis.DriveUtils = DriveUtils;', ctx);
  const D = ctx.DriveUtils;
  return {
    subcarpeta: D.subcarpeta, claveCarpeta: D.claveCarpeta,
    crearArchivo: D.crearArchivo, crearCarpeta: D.crearCarpeta, mover: D.mover, renombrar: D.renombrar, copiar: D.copiar,
    aPapelera: D.aPapelera, cambiarContenido: D.cambiarContenido, crearConApi: D.crearConApi, copiarConApi: D.copiarConApi, moverConApi: D.moverConApi,
    reemplazarConApi: D.reemplazarConApi, marcarAutor: D.marcarAutor,
  };
};
