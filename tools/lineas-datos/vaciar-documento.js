#!/usr/bin/env node
/**
 * tools/lineas-datos/vaciar-documento.js — lineas-revisor, 22-oct: los movimientos EDICION de cable-cubo.js llevaban en
 * DOCUMENTO el ID de la responsiva (RLI-) o del resguardo (RSG-) del renglón. El historial de la ficha toma un movimiento
 * con DOCUMENTO como el de ese documento: con RLI- tapa la responsiva original (su fecha y su PDF) y con RSG- muestra «Ver
 * inspección» hacia una que no existe. Vacía DOCUMENTO en los movimientos de ese script y de corregir-color.js (por su
 * COMENTARIO); lo demás del movimiento no cambia. Con permiso del usuario (22-oct). Reglas de estos programas: comun.js.
 *
 * Uso:   node tools/lineas-datos/vaciar-documento.js [--produccion] [--ensayo]
 */
'use strict';
const c = require('./comun.js');
const cableCubo = require('./cable-cubo.js');
const corregirColor = require('./corregir-color.js');

// También el de corregir-color.js: con DOCUMENTO ILI- tapaba la inspección del AppSheet del NUCO 0976 (lineas-revisor)
const COMENTARIOS = [cableCubo.COMENTARIO, corregirColor.COMENTARIO];

/** Los movimientos de esos scripts que traen DOCUMENTO. */
function porVaciar(mov) {
  return mov.filas.filter((f) => COMENTARIOS.indexOf(c.txt(f['COMENTARIO'])) >= 0 && c.txt(f['DOCUMENTO']) !== '');
}

async function main() {
  const libro = c.libro();
  const mov = await c.tabla(libro, 'MOVIMIENTOS');
  if (mov.enc.indexOf('DOCUMENTO') < 0) throw new Error('MOVIMIENTOS no tiene DOCUMENTO');
  const lista = porVaciar(mov);
  const prefijos = {};
  lista.forEach((f) => { const p = c.txt(f['DOCUMENTO']).slice(0, 4); prefijos[p] = (prefijos[p] || 0) + 1; });
  console.log('\nMovimientos con DOCUMENTO por vaciar: ' + lista.length + ' ' + JSON.stringify(prefijos));
  lista.forEach((f) => console.log('  renglón ' + f._n + ' · ' + c.txt(f['ID']) + ' · ' + c.txt(f['ID EQUIPO'] || f['ID LINEA']) + ' · DOCUMENTO ' + c.txt(f['DOCUMENTO'])));
  if (c.ENSAYO || !lista.length) return;
  await c.escribirCeldas(libro, lista.map((f) => ({ range: c.celda(mov, 'DOCUMENTO', f), values: [['']] })));
  console.log('\nEscrito: ' + lista.length + ' celdas. Falta «Recargar datos» en la app.');
}

if (require.main === module) main().catch((e) => { console.error('\n' + (e.message || e)); process.exitCode = 1; });
module.exports = { porVaciar, COMENTARIOS };
