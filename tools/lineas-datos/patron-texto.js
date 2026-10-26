#!/usr/bin/env node
/**
 * tools/lineas-datos/patron-texto.js — pendiente 2.47 (15-oct, NUCO 0785): un patrón de dos o tres puntos («1-9-7»)
 * escrito en un renglón nuevo de INSPECCIONES LINEAS (PATRON) o RESPONSIVAS LINEAS (CONTRASEÑA) Sheets lo tomaba como
 * fecha (1-sep-2007, día-mes-año). El sistema ya lo escribe como texto (LineasDatos.valorCelda_); este programa regresa
 * a texto los que quedaron como fecha: día-mes-(año - 2000). Si la fecha no sale de un patrón (un número mayor que 9),
 * solo la reporta. Cada documento deja un movimiento EDICION. Reglas de estos programas: comun.js.
 *
 * Uso:   node tools/lineas-datos/patron-texto.js [--produccion] [--ensayo]
 */
'use strict';
const c = require('./comun.js');

// Solo la acción que se hizo (usuario, 22-oct; textos-movimientos.js corrigió los ya escritos)
const COMENTARIO = 'PATRON GUARDADO COMO FECHA: SE REGRESA A TEXTO';
const HOJAS = [{ hoja: 'INSPECCIONES LINEAS', columna: 'PATRON' }, { hoja: 'RESPONSIVAS LINEAS', columna: 'CONTRASEÑA' }];

/** El patrón de una fecha de Sheets (número de serie): «1-9-7» quedó como 1-sep-2007. null si no sale de un patrón. */
function patronDeSerie(serie) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serie * 86400000));
  const partes = [d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear() - 2000];
  return partes.every((n) => n >= 1 && n <= 9) ? partes.join('-') : null;
}

async function main() {
  const libro = c.libro();
  const mov = await c.tabla(libro, 'MOVIMIENTOS');
  const cambios = [];
  const dudosos = [];
  for (const { hoja, columna } of HOJAS) {
    const t = await c.tablaSinFormato(libro, hoja);
    if (t.enc.indexOf(columna) < 0) { console.log(hoja + ' no tiene ' + columna); continue; }
    t.filas.forEach((f) => {
      const v = f[columna];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 1000) return; // un número chico no es fecha
      const patron = patronDeSerie(v);
      const x = { t, f, hoja, columna, serie: v, patron, quien: 'NUCO ' + (c.txt(f['NUCO']) || '—') + ' · ' + c.txt(f['ID']) };
      (patron ? cambios : dudosos).push(x);
    });
  }
  console.log('\nPatrones guardados como fecha: ' + cambios.length);
  cambios.forEach((x) => console.log('  ' + x.hoja + ' renglón ' + x.f._n + ' · ' + x.quien + ' · ' + x.serie + ' → «' + x.patron + '»'));
  if (dudosos.length) {
    console.log('\nFechas que no salen de un patrón (no se tocan): ' + dudosos.length);
    dudosos.forEach((x) => console.log('  ' + x.hoja + ' renglón ' + x.f._n + ' · ' + x.quien + ' · ' + x.serie));
  }
  if (c.ENSAYO || !cambios.length) return;
  await c.escribirCeldas(libro, cambios.map((x) => ({ range: c.celda(x.t, x.columna, x.f), values: [[x.patron]] })));
  console.log('\nEscrito: ' + cambios.length + ' celdas');
  await c.agregarMovimientos(libro, mov, cambios.map((x) => {
    const reg = c.txt(x.f['ID LINEA']);
    const esLinea = /^LIN-/i.test(reg);
    // Sin DOCUMENTO: el historial toma un movimiento con DOCUMENTO RLI- o ILI- como el de ese documento y tapa la
    // responsiva o la inspección original (lineas-revisor, 22-oct; vaciar-documento.js limpia los ya escritos)
    return { accion: 'EDICION', equipo: esLinea ? '' : reg, linea: esLinea ? reg : '', comentario: COMENTARIO,
      cambios: [{ campo: c.campoDe(x.hoja, x.f, x.columna), antes: String(x.serie), despues: x.patron }] };
  }));
}

if (require.main === module) main().catch((e) => { console.error('\n' + (e.message || e)); process.exitCode = 1; });
module.exports = { patronDeSerie, COMENTARIO };
