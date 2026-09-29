/**
 * Pruebas de DriveUtils.archivoDeRutaProfunda con un Drive simulado: rutas de AppSheet
 * ("MODELOS INSPECCION/PIPA/FRONTAL.png") resueltas desde distintas carpetas, incluidos
 * los accesos directos que usa producción. Correr con:  npm test
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ACCESO = 'application/vnd.google-apps.shortcut';
const CARPETA = 'application/vnd.google-apps.folder';

// ---------- Drive simulado ----------
const porId = {};
let siguienteId = 1;
const iterador = (lista) => { let i = 0; return { hasNext: () => i < lista.length, next: () => lista[i++] }; };
function carpeta(nombre, hijos) {
  const c = { id: 'c' + siguienteId++, nombre, hijos: hijos || [], tipo: CARPETA };
  c.getName = () => nombre;
  c.getFoldersByName = (n) => iterador(c.hijos.filter((h) => h.tipo === CARPETA && h.nombre === n));
  c.getFilesByName = (n) => iterador(c.hijos.filter((h) => h.tipo !== CARPETA && h.nombre === n));
  porId[c.id] = c;
  return c;
}
function archivo(nombre) {
  const a = { id: 'a' + siguienteId++, nombre, tipo: 'image/png' };
  a.getMimeType = () => a.tipo;
  porId[a.id] = a;
  return a;
}
function acceso(nombre, destino) {
  const a = { id: 'x' + siguienteId++, nombre, tipo: ACCESO };
  a.getMimeType = () => ACCESO;
  a.getTargetId = () => destino.id;
  a.getTargetMimeType = () => destino.tipo;
  return a;
}

// Producción: la carpeta real de modelos vive aparte; en la raíz hay un acceso directo a ella
const frontalPipa = archivo('FRONTAL.png');
const izquierdaReal = archivo('IZQUIERDA.png');
const modelosReal = carpeta('MODELOS INSPECCION', [
  carpeta('PIPA', [frontalPipa, acceso('IZQUIERDA.png', izquierdaReal)]),
]);
const raizProd = carpeta('ControlVehicular', [acceso('MODELOS INSPECCION', modelosReal), carpeta('VEHICULOS_Images')]);

const contexto = vm.createContext({
  DriveApp: {
    getFolderById: (id) => { if (!porId[id] || porId[id].tipo !== CARPETA) throw new Error('No existe'); return porId[id]; },
    getFileById: (id) => { if (!porId[id] || porId[id].tipo === CARPETA) throw new Error('No existe'); return porId[id]; },
  },
  Utilities: {}, Session: {},
});
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'DriveUtils.gs'), 'utf8') + '\nthis.DriveUtils = DriveUtils;',
  contexto
);
const buscar = (ruta, raiz) => contexto.DriveUtils.archivoDeRutaProfunda(ruta, raiz.id);

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

console.log('1. Desde la carpeta MODELOS INSPECCION misma (lo que usa DEV)');
ok(buscar('MODELOS INSPECCION/PIPA/FRONTAL.png', modelosReal) === frontalPipa,
  'la ruta trae "MODELOS INSPECCION/" al frente y ese tramo se salta');

console.log('2. Desde la raíz de producción, donde MODELOS INSPECCION es un acceso directo');
ok(buscar('MODELOS INSPECCION/PIPA/FRONTAL.png', raizProd) === frontalPipa,
  'se sigue el acceso directo hasta la carpeta real (antes daba "no está en Drive")');

console.log('3. El archivo mismo puede ser un acceso directo');
ok(buscar('MODELOS INSPECCION/PIPA/IZQUIERDA.png', modelosReal) === izquierdaReal,
  'se entrega el archivo al que apunta, no el acceso');

console.log('4. Lo que no existe');
ok(buscar('MODELOS INSPECCION/PIPA/DERECHA.png', modelosReal) === null, 'un archivo que no está da null');
ok(buscar('MODELOS INSPECCION/NP300/FRONTAL.png', raizProd) === null, 'una carpeta que no está da null');
ok(buscar('FRONTAL.png', modelosReal) === null, 'una ruta sin carpeta no se resuelve (no es ruta de AppSheet)');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
