/**
 * El SheetUtils de verdad dentro del contexto (vm) de una prueba que simula las hojas a mano: desde el 28-oct toda
 * escritura de un servicio pasa por las primitivas de SheetUtils (agregarFilas, cambiarCeldas…), y así la prueba usa
 * la regla de verdad en vez de una copia.
 *   require('./sheet-utils-real')(contexto);   // antes de cargar el servicio
 * Si el contexto ya trae un SheetUtils de mentira (getAll, getSheet…), se le agregan las primitivas que no tenga; si no
 * trae Candado ni LockService, se cargan el de verdad y un candado que siempre se obtiene.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const util = (archivo) => fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', archivo), 'utf8');

module.exports = function sheetUtilsReal(contexto) {
  const hay = (nombre) => vm.runInContext('typeof ' + nombre, contexto) !== 'undefined';
  if (!hay('LockService')) contexto.LockService = { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) };
  if (!hay('Candado')) vm.runInContext(util('Candado.gs'), contexto);
  vm.runInContext(util('SheetUtils.gs').replace('const SheetUtils = (function', 'this.__SheetUtilsReal = (function'), contexto);
  const real = contexto.__SheetUtilsReal;
  if (!hay('SheetUtils')) {
    contexto.SheetUtils = real;
  } else {
    const deMentira = vm.runInContext('SheetUtils', contexto);
    Object.keys(real).forEach((k) => { if (!(k in deMentira)) deMentira[k] = real[k]; });
  }
  return real;
};
