/**
 * Pruebas de la caché del servidor que se invalida sola (src/utils/CacheHojas.gs) y de que
 * las escrituras de SheetUtils la invaliden. CacheService y Utilities son de mentira (el gzip
 * sí es el real de Node), con el mismo límite de 100 KB por valor. Correr: npm test
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const crypto = require('crypto');

function cacheFalsa() {
  const datos = new Map();
  const limite = (v) => { if (String(v).length > 100000) throw new Error('Argument too large'); };
  return {
    datos,
    get: (k) => (datos.has(k) ? datos.get(k) : null),
    put: (k, v) => { limite(v); datos.set(k, String(v)); },
    getAll: (ks) => { const r = {}; ks.forEach((k) => { if (datos.has(k)) r[k] = datos.get(k); }); return r; },
    putAll: (o) => { Object.keys(o).forEach((k) => limite(o[k])); Object.keys(o).forEach((k) => datos.set(k, String(o[k]))); },
    remove: (k) => datos.delete(k),
    removeAll: (ks) => ks.forEach((k) => datos.delete(k)),
  };
}
const cache = cacheFalsa();
const Utilities = {
  getUuid: () => crypto.randomUUID(),
  newBlob: (dato) => ({
    getBytes: () => (Buffer.isBuffer(dato) ? dato : Buffer.from(String(dato))),
    getDataAsString: () => (Buffer.isBuffer(dato) ? dato.toString() : String(dato)),
  }),
  gzip: (blob) => ({ getBytes: () => zlib.gzipSync(blob.getBytes()) }),
  ungzip: (blob) => ({ getDataAsString: () => zlib.gunzipSync(blob.getBytes()).toString() }),
  base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
  base64Decode: (texto) => Buffer.from(texto, 'base64'),
};

const contexto = vm.createContext({ CacheService: { getScriptCache: () => cache }, Utilities });
const leer = (p) => fs.readFileSync(path.join(__dirname, '..', 'src', p), 'utf8');
vm.runInContext(leer('utils/CacheHojas.gs') + '\nthis.CacheHojas = CacheHojas;', contexto);
const { CacheHojas } = contexto;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

console.log('1. recordar()');
let armados = 0;
const armar = () => { armados++; return [{ FOLIO: 'A1', N: armados }]; };
const VEH = [['libro1234567', 'VEHICULOS']];
let r = CacheHojas.recordar('veh', VEH, armar);
ok(armados === 1 && r[0].FOLIO === 'A1', 'la primera vez arma');
r = CacheHojas.recordar('veh', VEH, armar);
ok(armados === 1 && r[0].N === 1, 'la segunda devuelve lo guardado sin volver a armar');

console.log('2. tocar() invalida');
CacheHojas.tocar('libro1234567', 'VEHICULOS');
r = CacheHojas.recordar('veh', VEH, armar);
ok(armados === 2 && r[0].N === 2, 'después de escribir en la hoja se vuelve a armar');
CacheHojas.tocar('libro1234567', 'UBER');
CacheHojas.recordar('veh', VEH, armar);
ok(armados === 2, 'escribir en OTRA hoja no la invalida');
CacheHojas.tocar('libro1234567', ' vehiculos ');
CacheHojas.recordar('veh', VEH, armar);
ok(armados === 3, 'el nombre de la hoja se compara sin importar mayúsculas ni espacios');

console.log('3. Varias hojas');
let armadosHolo = 0;
const DOS = [['libro1234567', 'HOLOGRAMAS'], ['libro1234567', 'VEHICULOS']];
CacheHojas.recordar('holo', DOS, () => ++armadosHolo);
CacheHojas.recordar('holo', DOS, () => ++armadosHolo);
ok(armadosHolo === 1, 'con dos hojas también guarda');
CacheHojas.tocar('libro1234567', 'VEHICULOS');
CacheHojas.recordar('holo', DOS, () => ++armadosHolo);
ok(armadosHolo === 2, 'si cambia CUALQUIERA de las dos, se vuelve a armar');

console.log('4. Valores grandes y raros');
const grande = Array.from({ length: 30000 }, (_, i) => ({ ID: 'VEH-' + crypto.randomUUID(), N: i }));
let armadosGrande = 0;
CacheHojas.recordar('grande', VEH, () => { armadosGrande++; return grande; });
const deVuelta = CacheHojas.recordar('grande', VEH, () => { armadosGrande++; return grande; });
ok(armadosGrande === 1 && deVuelta.length === 30000 && deVuelta[29999].ID === grande[29999].ID, 'algo de más de 100 KB se guarda en trozos y regresa completo');
ok(CacheHojas.recordar('vacio', VEH, () => []).length === 0 && CacheHojas.recordar('vacio', VEH, () => ['otra']).length === 0, 'una lista vacía también se guarda (no se confunde con "no hay")');
const conFecha = CacheHojas.recordar('fecha', VEH, () => ({ f: new Date('2026-10-02T12:00:00Z') }));
ok(conFecha.f === '2026-10-02T12:00:00.000Z', 'una fecha sale como texto ISO desde la primera vez…');
ok(CacheHojas.recordar('fecha', VEH, () => null).f === '2026-10-02T12:00:00.000Z', '…y igual desde la caché: siempre la misma forma');

console.log('4b. calculo(): lo que sale de otras listas');
let calculados = 0;
const TIC = [['libro1234567', 'TICKETS']];
const inicio = () => {
  calculados++;
  const veh = CacheHojas.recordar('veh', VEH, armar);
  const tic = CacheHojas.recordar('tic', TIC, () => [1, 2, 3]);
  return { vehiculos: veh.length, tickets: tic.length, vez: calculados };
};
let calc = CacheHojas.calculo('inicio_A', inicio);
ok(calculados === 1 && calc.tickets === 3, 'la primera vez calcula');
calc = CacheHojas.calculo('inicio_A', inicio);
ok(calculados === 1 && calc.vez === 1, 'la segunda devuelve lo guardado');
CacheHojas.tocar('libro1234567', 'TICKETS');
calc = CacheHojas.calculo('inicio_A', inicio);
ok(calculados === 2 && calc.vez === 2, 'escribir en una hoja que consultó (sin decir cuál) lo vuelve a calcular');
CacheHojas.tocar('libro1234567', 'UBER');
CacheHojas.calculo('inicio_A', inicio);
ok(calculados === 2, 'escribir en una hoja que NO consultó no lo toca');
CacheHojas.calculo('inicio_B', inicio);
ok(calculados === 3, 'otra clave (otros permisos) es otro cálculo');
let sinGuardar = 0;
CacheHojas.calculo('falla', () => ++sinGuardar, { guardarSi: () => false });
CacheHojas.calculo('falla', () => ++sinGuardar, { guardarSi: () => false });
ok(sinGuardar === 2, 'guardarSi = false no lo guarda (se vuelve a calcular)');
cache.remove('ver_libro12345_TICKETS');
CacheHojas.calculo('inicio_A', inicio);
ok(calculados === 4, 'si se perdió la versión de una hoja, se recalcula (no se confía)');
let rehechos = 0;
CacheHojas.recordar('rh', VEH, () => ++rehechos);
CacheHojas.recordar('rh', VEH, () => ++rehechos, undefined, true);
ok(rehechos === 2 && CacheHojas.recordar('rh', VEH, () => ++rehechos) === 2, 'recordar(…, rehacer) vuelve a armar y deja guardado lo nuevo');

console.log('5. Si la caché falla, no truena');
const rota = vm.createContext({ CacheService: { getScriptCache: () => { throw new Error('sin caché'); } }, Utilities });
vm.runInContext(leer('utils/CacheHojas.gs') + '\nthis.CacheHojas = CacheHojas;', rota);
ok(rota.CacheHojas.recordar('x', VEH, () => 42) === 42, 'sin CacheService, simplemente arma');
rota.CacheHojas.tocar('libro', 'HOJA');
ok(true, 'y tocar() tampoco truena');

console.log('6. Las escrituras de SheetUtils invalidan');
const tocadas = [];
const filasHoja = [['ID', 'FOLIO'], ['VEH-1', 'A1']];
const hoja = {
  getLastRow: () => filasHoja.length, getLastColumn: () => 2,
  getRange: (f, c, nf, nc) => ({
    getValues: () => filasHoja.slice(f - 1, f - 1 + (nf || 1)).map((x) => x.slice(c - 1, c - 1 + (nc || 1))),
    setValues: (v) => { v.forEach((x, i) => { filasHoja[f - 1 + i] = x; }); },
  }),
  appendRow: (x) => filasHoja.push(x),
  deleteRow: (n) => filasHoja.splice(n - 1, 1),
  deleteRows: (n, k) => filasHoja.splice(n - 1, k),
};
const ctxSU = vm.createContext({
  SpreadsheetApp: { openById: () => ({ getSheetByName: () => hoja }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: {},
  Ids: { nuevo: () => 'VEH-2' }, Entidades: { prefijo: () => 'VEH' },
  CacheHojas: { tocar: (ss, h) => tocadas.push(ss + '|' + h) },
});
vm.runInContext(leer('utils/SheetUtils.gs') + '\nthis.SheetUtils = SheetUtils;', ctxSU);
const SU = ctxSU.SheetUtils;
SU.insert('libro', 'VEHICULOS', { FOLIO: 'A2' });
ok(tocadas.pop() === 'libro|VEHICULOS', 'insert toca la hoja');
SU.update('libro', 'VEHICULOS', 'VEH-1', { FOLIO: 'A1b' });
ok(tocadas.pop() === 'libro|VEHICULOS', 'update toca la hoja');
SU.remove('libro', 'VEHICULOS', 'VEH-1');
ok(tocadas.pop() === 'libro|VEHICULOS', 'remove toca la hoja');
SU.removeMany('libro', 'VEHICULOS', ['VEH-2']);
ok(tocadas.pop() === 'libro|VEHICULOS', 'removeMany toca la hoja');
SU.removeMany('libro', 'VEHICULOS', ['NO-EXISTE']);
ok(tocadas.length === 0, 'removeMany sin nada que borrar no toca');

console.log('7. conHuella() y vigentes(): para que la pantalla se actualice sola');
const LIB = [['libroHuella', 'SENSORES']];
let h = CacheHojas.conHuella(() => CacheHojas.recordar('sens_h', LIB, () => [1, 2]));
const claveSens = Object.keys(h.huella)[0];
ok(h.v.length === 2 && /^ver_libroHuell_SENSORES$/.test(claveSens), 'la lista sale con su huella (la versión de la hoja que leyó)');
ok(CacheHojas.vigentes([claveSens])[claveSens] === h.huella[claveSens], 'sin escrituras, la versión vigente es la misma');
CacheHojas.tocar('libroHuella', 'SENSORES');
ok(CacheHojas.vigentes([claveSens])[claveSens] !== h.huella[claveSens], 'después de escribir en la hoja, cambia');
ok(CacheHojas.vigentes(['ver_noexiste_X']).ver_noexiste_X === '', 'una versión que ya no está sale vacía (se toma como cambio)');
// calculo() que responde de la caché también entrega sus dependencias
CacheHojas.calculo('inicio_h', () => CacheHojas.recordar('sens_h', LIB, () => [1, 2]).length);
h = CacheHojas.conHuella(() => CacheHojas.calculo('inicio_h', () => { throw new Error('no debía recalcular'); }));
ok(h.v === 2 && h.huella[claveSens], 'calculo() desde la caché también da su huella');
h = CacheHojas.conHuella(() => 'sin hojas');
ok(Object.keys(h.huella).length === 0, 'una lista que no lee hojas por CacheHojas sale con huella vacía');
const getAllReal = cache.getAll;
cache.getAll = () => { throw new Error('Se produjo un error en el servidor al leer desde el almacenamiento. Código de error: DEADLINE_EXCEEDED'); };
ok(Object.keys(CacheHojas.vigentes([claveSens])).length === 0, 'si CacheService tarda de más (DEADLINE_EXCEEDED), vigentes no truena: regresa {} (no se sabe)');
cache.getAll = getAllReal;

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
