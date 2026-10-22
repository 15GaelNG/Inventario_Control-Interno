#!/usr/bin/env node
/**
 * tools/lineas-datos/corregir-color.js — usuario, 22-oct: un color mal escrito («NEGO», de la inspección del AppSheet
 * ILI-000000VH85J6DY del NUCO 0976) salía como opción en la lista de colores. Pasa cada error de CORRECCIONES a su color
 * en la columna COLOR de EQUIPOS, INSPECCIONES LINEAS y RESPONSIVAS LINEAS. Cada renglón deja un movimiento EDICION.
 * Reglas de estos programas: comun.js.
 *
 * Uso:   node tools/lineas-datos/corregir-color.js [--produccion] [--ensayo]
 */
'use strict';
const c = require('./comun.js');

const CORRECCIONES = { NEGO: 'NEGRO' };
const COMENTARIO = 'COLOR MAL ESCRITO: SE CORRIGE (USUARIO, 22-OCT)';
// El registro del renglón: en EQUIPOS su ID; en inspecciones y responsivas, ID LINEA (equipo o línea suelta)
const HOJAS = [{ hoja: 'EQUIPOS', registro: 'ID' }, { hoja: 'INSPECCIONES LINEAS', registro: 'ID LINEA' }, { hoja: 'RESPONSIVAS LINEAS', registro: 'ID LINEA' }];

/** El color corregido, o null si no es uno de los errores conocidos. */
function colorCorregido(valor) {
  const v = c.may(valor);
  return Object.prototype.hasOwnProperty.call(CORRECCIONES, v) ? CORRECCIONES[v] : null;
}

async function main() {
  const libro = c.libro();
  const mov = await c.tabla(libro, 'MOVIMIENTOS');
  const cambios = [];
  for (const { hoja, registro } of HOJAS) {
    const t = await c.tabla(libro, hoja);
    if (t.enc.indexOf('COLOR') < 0) { console.log(hoja + ' no tiene COLOR'); continue; }
    t.filas.forEach((f) => {
      const nuevo = colorCorregido(f['COLOR']);
      if (nuevo) cambios.push({ t, f, hoja, registro: c.txt(f[registro]), antes: c.txt(f['COLOR']), nuevo });
    });
  }
  console.log('\nColores mal escritos: ' + cambios.length);
  cambios.forEach((x) => console.log('  ' + x.hoja + ' renglón ' + x.f._n + ' · NUCO ' + (c.txt(x.f['NUCO']) || '—') + ' · ' + c.txt(x.f['ID']) +
    ' · «' + x.antes + '» → «' + x.nuevo + '»'));
  if (c.ENSAYO || !cambios.length) return;
  await c.escribirCeldas(libro, cambios.map((x) => ({ range: c.celda(x.t, 'COLOR', x.f), values: [[x.nuevo]] })));
  console.log('\nEscrito: ' + cambios.length + ' celdas');
  await c.agregarMovimientos(libro, mov, cambios.map((x) => {
    const esLinea = /^LIN-/i.test(x.registro);
    // Sin DOCUMENTO: el historial toma un movimiento con DOCUMENTO RLI- o ILI- como el de ese documento y tapa la
    // responsiva o la inspección original (lineas-revisor, 22-oct; vaciar-documento.js)
    return { accion: 'EDICION', equipo: esLinea ? '' : x.registro, linea: esLinea ? x.registro : '', comentario: COMENTARIO,
      cambios: [{ campo: x.hoja + ' · COLOR', antes: x.antes, despues: x.nuevo }] };
  }));
}

if (require.main === module) main().catch((e) => { console.error('\n' + (e.message || e)); process.exitCode = 1; });
module.exports = { colorCorregido, CORRECCIONES, COMENTARIO };
