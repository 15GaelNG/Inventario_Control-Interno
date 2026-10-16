/**
 * Pruebas de la búsqueda de columnas por encabezado (SheetUtils.gs).
 * Los encabezados de las hojas reales traen espacios de más y acentos inconsistentes;
 * comparar en crudo hacía que una columna existente se diera por ausente. Correr: npm test
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const contexto = vm.createContext({
  SpreadsheetApp: {}, CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  LockService: {}, Utilities: {},
});
const leerUtil = (archivo) => fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', archivo), 'utf8');
vm.runInContext(leerUtil('Candado.gs') + leerUtil('SheetUtils.gs') + '\nthis.SheetUtils = SheetUtils;\nthis.Candado = Candado;', contexto);
const { SheetUtils } = contexto;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

// Encabezados como vienen de la hoja real de inspecciones
const ENCABEZADOS = ['ID INSPECCION', 'FOLIO', 'NUCO', 'TIPO', 'FECHA', 'MODELO / AÑO', 'OFICINA / DESARROLLO'];
const indice = (nombres, encabezados) => SheetUtils.indiceDeColumnas(encabezados || ENCABEZADOS, nombres);

console.log('1. Búsqueda normal');
const base = indice(['ID INSPECCION', 'FOLIO', 'TIPO']);
ok(base['ID INSPECCION'] === 0 && base['FOLIO'] === 1 && base['TIPO'] === 3, 'encuentra las columnas por nombre');
ok(indice(['NO EXISTE'])['NO EXISTE'] === -1, 'una columna que no está devuelve -1');

console.log('2. Lo que rompía antes: espacios de más en la hoja');
const conEspacios = ['ID INSPECCION ', ' FOLIO', 'TIPO  '];
const r1 = indice(['ID INSPECCION', 'FOLIO', 'TIPO'], conEspacios);
ok(r1['ID INSPECCION'] === 0 && r1['FOLIO'] === 1 && r1['TIPO'] === 2,
  'un espacio al inicio o al final ya no esconde la columna');
const r2 = indice(['MODELO / AÑO'], ['MODELO  /  AÑO']);
ok(r2['MODELO / AÑO'] === 0, 'los espacios de más en medio tampoco');

console.log('3. Acentos');
ok(indice(['MODELO / AÑO'], ['MODELO / ANO'])['MODELO / AÑO'] === 0, 'la ñ y la n se tratan igual');
ok(indice(['AREA'], ['ÁREA'])['AREA'] === 0, 'con o sin acento es la misma columna');

console.log('4. Mayúsculas y celdas vacías');
ok(indice(['folio'], ['FOLIO'])['folio'] === 0, 'no importan las mayúsculas');
ok(indice(['FOLIO'], ['', null, 'FOLIO'])['FOLIO'] === 2, 'las columnas sin nombre no estorban');
ok(indice([], ENCABEZADOS) && Object.keys(indice([], ENCABEZADOS)).length === 0, 'sin columnas pedidas, no truena');

console.log('5. Lo que NO debe confundirse');
const parecidas = ['TIPO', 'TIPO COMBUSTIBLE'];
const r3 = indice(['TIPO', 'TIPO COMBUSTIBLE'], parecidas);
ok(r3['TIPO'] === 0 && r3['TIPO COMBUSTIBLE'] === 1, 'dos columnas parecidas no se confunden entre sí');
ok(indice(['LLANTA D'], ['LLANTA DD', 'LLANTA D'])['LLANTA D'] === 1, 'se busca la columna exacta, no la que empieza igual');

console.log('6. Al ESCRIBIR una fila (lo más peligroso: fallar aquí pierde datos en silencio)');
const fila = (encabezados, obj) => SheetUtils.objectToRow_(encabezados, obj);
ok(fila(['FOLIO', 'TIPO'], { FOLIO: 'AUT0100', TIPO: 'L200' }).join() === 'AUT0100,L200',
  'cada valor va en su columna');
ok(fila(['FOLIO ', ' TIPO'], { FOLIO: 'AUT0100', TIPO: 'L200' }).join() === 'AUT0100,L200',
  'un encabezado con espacios de más ya no pierde el dato');
ok(fila(['MODELO / AÑO'], { 'MODELO / ANO': 2020 }).join() === '2020', 'los acentos tampoco');
ok(fila(['FOLIO', 'SIN DATO'], { FOLIO: 'AUT0100' }).join() === 'AUT0100,', 'lo que no se manda queda vacío');
ok(fila(['FOLIO'], {}).join() === '' && fila(['FOLIO'], null).join() === '', 'sin datos no truena');
ok(fila(['A', 'B'], { B: 2, A: 1 }).join() === '1,2', 'respeta el orden de la hoja, no el del objeto');

console.log('7. Leer columnas en bloques (cada getValues es un viaje a Sheets)');
// Hoja falsa de 195 columnas como INSPECCION VEHICULAR; cuenta cuántas lecturas se hacen
const hojaFalsa = (encabezados, filas) => {
  const lecturas = [];
  return {
    lecturas,
    getLastRow: () => filas.length + 1,
    getLastColumn: () => encabezados.length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => {
        if (r > 1) lecturas.push([c, c + nc - 1]);
        return r === 1 ? [encabezados.slice(c - 1, c - 1 + nc)]
          : filas.slice(r - 2, r - 2 + nr).map((f) => f.slice(c - 1, c - 1 + nc));
      },
    }),
  };
};
const ENC_195 = Array.from({ length: 195 }, (_, i) => 'COL ' + (i + 1));
const FILAS = Array.from({ length: 4 }, (_, f) => ENC_195.map((_, c) => `f${f}c${c + 1}`));
const pedidas = [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 173, 174, 176, 178, 195].map((n) => 'COL ' + n);
const hoja = hojaFalsa(ENC_195, FILAS);
const leido = SheetUtils.leerColumnas(hoja, pedidas);
ok(hoja.lecturas.length === 3, `las 23 columnas de la lista se leen en 3 viajes, no 23 (fueron ${hoja.lecturas.length})`);
ok(leido.filas === 4, 'cuenta las filas de datos (sin el encabezado)');
ok(pedidas.every((col) => leido.datos[col].length === 4 && leido.datos[col][2] === 'f2c' + col.slice(4)),
  'cada columna trae SUS valores, en orden, aunque se hayan leído junto con otras');
ok(leido.datos['COL 3'] === undefined, 'las columnas leídas de paso (huecos) no se devuelven');

const hoja2 = hojaFalsa(['A', 'B ', 'C'], [[1, 2, 3]]);
const r = SheetUtils.leerColumnas(hoja2, ['B', 'NO EXISTE']);
ok(r.datos['B'][0] === 2, 'tolerante a espacios en el encabezado');
ok(Array.isArray(r.datos['NO EXISTE']) && r.datos['NO EXISTE'].length === 0, 'una columna que no existe queda como lista vacía');
ok(SheetUtils.leerColumnas(hojaFalsa(['A'], []), ['A']).filas === 0, 'hoja sin datos: cero filas, sin leer nada');

console.log('8. Encabezados con espacios de más al buscar, actualizar y leer (caso real: "ID INSPECCION ")');
// Hoja falsa en memoria que sí se puede escribir
const libro = {};
contexto.SpreadsheetApp.openById = () => ({ getSheetByName: (n) => libro[n] || null });
contexto.LockService.getScriptLock = () => ({ waitLock: () => {}, releaseLock: () => {} });
const hojaEditable = (valores) => ({
  valores,
  getLastRow: () => valores.length,
  getLastColumn: () => valores[0].length,
  getRange: (r, c, nr, nc) => ({
    getValues: () => valores.slice(r - 1, r - 1 + nr).map((f) => f.slice(c - 1, c - 1 + nc)),
    setValues: (nuevos) => nuevos.forEach((f, i) => f.forEach((v, j) => { valores[r - 1 + i][c - 1 + j] = v; })),
  }),
  deleteRow: (n) => valores.splice(n - 1, 1),
  deleteRows: (n, cuantas) => valores.splice(n - 1, cuantas),
});
libro['INSPECCION VEHICULAR'] = hojaEditable([
  ['ID INSPECCION ', 'FOLIO', ' PLACAS', 'FORMATO INSPECCION VEHICULAR'],
  ['2026_25_290', 'AUT0024', 'XYZ-1', ''],
  ['2026_25_291', 'AUT0025', 'ABC-2', ''],
]);
const encontrada = SheetUtils.findById('x', 'INSPECCION VEHICULAR', '2026_25_291', 'ID INSPECCION');
ok(encontrada && encontrada.rowIndex === 3, 'encuentra la fila aunque el encabezado del ID traiga un espacio al final');
ok(encontrada && encontrada.data['ID INSPECCION'] === '2026_25_291' && encontrada.data['PLACAS'] === 'ABC-2',
  'las claves de la fila vienen sin los espacios sobrantes');

SheetUtils.update('x', 'INSPECCION VEHICULAR', '2026_25_291', { 'FORMATO INSPECCION VEHICULAR': 'X/INSPECCION.pdf' }, 'ID INSPECCION');
const escrita = libro['INSPECCION VEHICULAR'].valores[2];
ok(escrita[3] === 'X/INSPECCION.pdf', 'update escribe el cambio');
ok(escrita[0] === '2026_25_291' && escrita[1] === 'AUT0025' && escrita[2] === 'ABC-2', 'y conserva lo demás de la fila');
SheetUtils.update('x', 'INSPECCION VEHICULAR', '2026_25_291', { PLACAS: 'NUEVA-9' }, 'ID INSPECCION');
ok(libro['INSPECCION VEHICULAR'].valores[2][2] === 'NUEVA-9',
  'cambiar una columna con espacio en el encabezado NO se pierde (antes ganaba el valor viejo)');

const todas = SheetUtils.getAll('x', 'INSPECCION VEHICULAR');
ok(todas.length === 2 && todas[1]['ID INSPECCION'] === '2026_25_291', 'getAll también entrega claves limpias');
ok(SheetUtils.removeMany('x', 'INSPECCION VEHICULAR', ['2026_25_290'], 'ID INSPECCION') === 1 &&
  libro['INSPECCION VEHICULAR'].valores.length === 2, 'removeMany encuentra el ID con espacio y borra');
let mensaje = '';
try { SheetUtils.findById('x', 'INSPECCION VEHICULAR', '1', 'NO EXISTE'); } catch (e) { mensaje = e.message; }
ok(/no tiene columna "NO EXISTE"/.test(mensaje), 'una columna de ID que de verdad no existe sigue dando error claro');

console.log('9. Escribir sin pisar a nadie (fase 1 de docs/homologacion-codigo.md)');
// LockService como el real: no es reentrante (pedirlo dos veces sin soltarlo truena). Cada lectura y escritura
// queda en `bitacora` para ver el orden.
let bitacora = [];
let tomado = false;
contexto.LockService.getScriptLock = () => ({
  waitLock: () => { if (tomado) throw new Error('Lock timeout'); tomado = true; bitacora.push('candado'); },
  releaseLock: () => { tomado = false; bitacora.push('suelta'); },
});
const hojaVigilada = (valores) => {
  const h = hojaEditable(valores);
  const getRange = h.getRange;
  h.getRange = (r, c, nr, nc) => {
    const rango = getRange(r, c, nr, nc);
    return {
      getValues: () => { bitacora.push('lee ' + r + ',' + c + ' ' + (nr || 1) + 'x' + (nc || 1)); return rango.getValues(); },
      setValues: (v) => { bitacora.push('escribe ' + r + ',' + c + ' ' + v.length + 'x' + v[0].length); return rango.setValues(v); },
    };
  };
  h.deleteRow = (n) => { bitacora.push('borra ' + n); valores.splice(n - 1, 1); };
  return h;
};
libro.CAJAS = hojaVigilada([
  ['ID', 'ID CCH', 'MONTO ACTUAL', 'TOTAL (FÓRMULA)', 'RESPONSABLE', 'DEPARTAMENTO'],
  ['CCH-1', 'C1', 100, '=C2*2', 'ANA', 'VENTAS'],
  ['CCH-2', 'C2', 200, '=C3*2', 'LUIS', 'OBRA'],
]);
const cajas = libro.CAJAS.valores;

bitacora = [];
const r9 = SheetUtils.update('x', 'CAJAS', 'CCH-2', { 'MONTO ACTUAL': 250, RESPONSABLE: 'PEPE' });
ok(cajas[2][3] === '=C3*2', 'no toca la columna de fórmula (antes la reescribía con su valor)');
ok(cajas[2][2] === 250 && cajas[2][4] === 'PEPE' && cajas[2][5] === 'OBRA', 'escribe lo que cambió y deja lo demás');
ok(bitacora.filter((b) => b.startsWith('escribe')).join('|') === 'escribe 3,3 1x1|escribe 3,5 1x1',
  'solo escribe las celdas que cambian, por tramos (MONTO y RESPONSABLE no están juntas)');
ok(bitacora[0] === 'candado' && bitacora[bitacora.length - 1] === 'suelta', 'busca, lee y escribe bajo el candado');
ok(!bitacora.some((b) => /^lee 2,1 \d+x6$/.test(b)) && bitacora.includes('lee 2,1 2x1'),
  'para buscar el ID lee solo esa columna, no la hoja entera');
ok(r9['MONTO ACTUAL'] === 250 && r9['ID CCH'] === 'C2' && r9['DEPARTAMENTO'] === 'OBRA', 'regresa el registro completo, ya mezclado');

// Otro cambió DEPARTAMENTO mientras tanto: el update de MONTO no lo regresa a lo de antes
cajas[1][5] = 'CAMBIO DE OTRO';
SheetUtils.update('x', 'CAJAS', 'CCH-1', { 'MONTO ACTUAL': 110 });
ok(cajas[1][5] === 'CAMBIO DE OTRO', 'no pisa lo que otro cambió en otra columna');

bitacora = [];
SheetUtils.update('x', 'CAJAS', 'CCH-1', { 'NO EXISTE': 1 });
ok(!bitacora.some((b) => b.startsWith('escribe')), 'una columna que la hoja no tiene no escribe nada');

bitacora = [];
contexto.Candado.con(() => {
  SheetUtils.update('x', 'CAJAS', 'CCH-1', { 'MONTO ACTUAL': 120 });
  ok(SheetUtils.remove('x', 'CAJAS', 'NO-EXISTE') === false, 'remove de algo que no existe: false');
});
ok(cajas[1][2] === 120 && bitacora.filter((b) => b === 'candado').length === 1,
  'dentro de un candado ya tomado (Cambios de Monto → Cajas) no se cuelga ni lo pide otra vez');

bitacora = [];
ok(SheetUtils.remove('x', 'CAJAS', 'CCH-1') === true && cajas.length === 2 && cajas[1][0] === 'CCH-2', 'remove borra el renglón');
ok(bitacora[0] === 'candado' && bitacora.indexOf('borra 2') > 0 && bitacora[bitacora.length - 1] === 'suelta',
  'y busca y borra bajo el candado (antes, sin él, otro podía recorrer los renglones en medio)');
let msg9 = '';
try { SheetUtils.update('x', 'CAJAS', 'CCH-9', { RESPONSABLE: 'X' }); } catch (e) { msg9 = e.message; }
ok(/No se encontró el registro con ID=CCH-9/.test(msg9) && !tomado, 'un ID que no existe truena claro y suelta el candado');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
