/**
 * Las funciones de DriveUtils que no tocan Drive por su cuenta (subcarpeta, claveCarpeta…), para las pruebas que
 * simulan Drive con un DriveUtils de mentira: así prueban la regla de verdad (fase 5.7: una sola "subcarpeta") en vez
 * de una copia. DriveUtils.gs no corre nada al cargar, así que se carga solo, sin más globales.
 *   const { subcarpeta, claveCarpeta } = require('./drive-utils-real')();
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = function driveUtilsReal() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'DriveUtils.gs'), 'utf8') +
    '\nthis.DriveUtils = DriveUtils;', ctx);
  const D = ctx.DriveUtils;
  return { subcarpeta: D.subcarpeta, claveCarpeta: D.claveCarpeta };
};
