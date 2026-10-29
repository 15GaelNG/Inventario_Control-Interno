/**
 * entorno.js — el código de Apps Script de las plantillas corriendo en Node, sobre documentos en memoria (el Docs
 * simulado): Plantilla.gs, MotorPlantillas.gs, PdfService.gs, InspeccionesService.gs e InspeccionesPlantillasDev.gs, tal
 * cual. Así la herramienta local convierte y compara con EXACTAMENTE el mismo código que la app y que sus pruebas, sin
 * una copia que mantener a la par.
 *
 *   const e = entorno(columnas);   // las columnas de la hoja de inspecciones (el contrato)
 *   e.poner('VIEJA', nombre, cuerpo);  e.ctx.inspDevConvertirDoc_('VIEJA', contrato) …
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const D = require('../../tests/docs-simulado');

const SRC = path.resolve(__dirname, '..', '..', 'src');
const ARCHIVOS = [['services', 'Plantilla.gs'], ['services', 'MotorPlantillas.gs'], ['services', 'PdfService.gs'],
  ['services', 'InspeccionesService.gs'], ['InspeccionesPlantillasDev.gs']];

function entorno(columnas) {
  const docs = {};
  let n = 0;
  const archivo = (id) => ({ getId: () => id, getName: () => docs[id].nombre });
  const hoja = { getLastColumn: () => columnas.length, getRange: () => ({ getValues: () => [columnas] }) };
  const ctx = vm.createContext({
    soloEditor_: () => {}, Logger: { log: () => {} }, console,
    Session: { getScriptTimeZone: () => 'America/Mexico_City' },
    Config: { ENTORNO: 'DEV', SPREADSHEET_IDS: { VEHICULOS: () => 'LOCAL' }, DRIVE_FOLDERS: {} },
    SheetUtils: { getSheetByColumns: () => hoja, normalizarEncabezado_: (s) => String(s == null ? '' : s).trim().toUpperCase() },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, removeAll: () => {} }) },
    DriveApp: { getFileById: archivo },
    DriveUtils: {
      copiar: (a, nombre) => {
        const id = 'MEMORIA-' + (++n);
        docs[id] = { nombre: nombre, cuerpo: docs[a.getId()].cuerpo.copy() };
        return archivo(id);
      },
      aPapelera: (a) => { delete docs[a.getId()]; },
    },
    DocumentApp: Object.assign({}, D.DocumentApp, {
      openById: (id) => ({ getBody: () => docs[id].cuerpo, getName: () => docs[id].nombre, saveAndClose: () => {} }),
    }),
    Utilities: {},
  });
  vm.runInContext(ARCHIVOS.map((p) => fs.readFileSync(path.join(SRC, ...p), 'utf8')).join('\n') +
    '\nObject.assign(this, { Plantilla, MotorPlantillas, PdfService, InspeccionesService });', ctx);
  return {
    ctx: ctx,
    poner: (id, nombre, cuerpo) => { docs[id] = { nombre: nombre, cuerpo: cuerpo }; },
    cuerpo: (id) => docs[id].cuerpo,
    /** Una constante de nivel superior de los .gs (no quedan en el contexto como propiedad) */
    valor: (nombre) => vm.runInContext(nombre, ctx),
  };
}

module.exports = { entorno };
