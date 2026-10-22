#!/usr/bin/env node
/**
 * tools/lineas-datos/movimientos-vacios.js — pendiente 7.12 (19-oct, lineas-revisor): MOVIMIENTOS de producción tiene un
 * renglón vacío a la mitad (fila 5062, desde el 16-oct; causa desconocida). La app no se afecta, pero el append de
 * aplicar.js y de comun.js metía ahí los renglones nuevos (ya escriben desde el último renglón con datos). Este programa
 * quita los renglones vacíos que quedan antes del último con datos; los de abajo no se tocan. Sin movimiento: no cambia
 * ningún dato. Reglas de estos programas: comun.js.
 *
 * Uso:   node tools/lineas-datos/movimientos-vacios.js [--produccion] [--ensayo]
 */
'use strict';
const c = require('./comun.js');

const HOJA = 'MOVIMIENTOS';

/** Renglones (número de la hoja) sin ningún valor; la tabla solo llega hasta el último con datos. */
function vacios(t) {
  return t.filas.filter((f) => t.enc.every((h) => !c.txt(f[h]))).map((f) => f._n);
}

async function main() {
  const libro = c.libro();
  const t = await c.tabla(libro, HOJA);
  const ns = vacios(t);
  console.log('\n' + HOJA + ': ' + t.filas.length + ' renglones de datos; vacíos a la mitad: ' + ns.length + (ns.length ? ' (' + ns.join(', ') + ')' : ''));
  ns.forEach((n) => {
    const antes = t.filas.filter((f) => f._n === n - 1)[0];
    const despues = t.filas.filter((f) => f._n === n + 1)[0];
    console.log('  renglón ' + n + ' · antes ' + (antes ? c.txt(antes['ID']) + ' ' + c.txt(antes['FECHA']) : '—') +
      ' · después ' + (despues ? c.txt(despues['ID']) + ' ' + c.txt(despues['FECHA']) : '—'));
  });
  if (c.ENSAYO || !ns.length) return;
  const sheetId = await c.idDeHoja(libro, HOJA);
  // De abajo hacia arriba, para que no se recorran los números de renglón
  const requests = ns.sort((a, b) => b - a).map((n) => ({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: n - 1, endIndex: n } } }));
  await c.api('POST', c.SHEETS + libro + ':batchUpdate', { requests });
  console.log('\nQuitados: ' + ns.length + ' renglones. Falta «Recargar datos» en la app.');
}

if (require.main === module) main().catch((e) => { console.error('\n' + (e.message || e)); process.exitCode = 1; });
module.exports = { vacios };
