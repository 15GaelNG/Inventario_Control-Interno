#!/usr/bin/env node
/**
 * tools/lineas-resguardos/por-recibir.js — pendiente 3.15 (usuario, 21-oct): los equipos que ya estaban en el panel de
 * Pau por recibir (su renglón de APP_RESGUARDOS en PENDIENTE DE RECEPCION) pasan a ESTATUS EQUIPO «POR RECIBIR» en
 * EQUIPOS, como los que se mandan desde el 3.15 (LineasResguardos.mandar). El estatus elegido ya está en su renglón
 * (ESTATUS_EQUIPO): Pau se lo pone al recibirlo. Antes de cambiarlo, si el renglón no tiene ESTATUS_EQUIPO se le pone el
 * que tiene hoy el equipo, para no perderlo.
 *
 * Cada equipo deja su movimiento EDICION en MOVIMIENTOS, con QUIEN «AUTOMATIZACIÓN» y ORIGEN «AUTOMATIZACION» (como
 * reporte_lineas/actualizacion_base/actualizar.py). El renglón cuyo REGISTRO_ID no es de ningún equipo (los viejos del
 * 3.13) solo se reporta.
 *
 * DEV por omisión (bloque de .clasp.json en Entornos.gs, que diga ENTORNO 'DEV'). --produccion: el libro de producción
 * (bloque de .clasp.produccion.json, ENTORNO 'PROD'), solo con permiso del usuario. --ensayo: dice qué haría, sin
 * escribir. Se puede volver a correr: el equipo que ya está POR RECIBIR se salta. Después, «Recargar datos» en la app.
 *
 * Uso:   node tools/lineas-resguardos/por-recibir.js [--produccion] [--ensayo]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const comun = require('../lineas-ine/leer-ine.js');

const { api, valores, rango, SHEETS, REPO } = comun;
const PRODUCCION = process.argv.indexOf('--produccion') > 0;
const ENSAYO = process.argv.indexOf('--ensayo') > 0;
const POR_RECIBIR = 'POR RECIBIR';
const PENDIENTE = 'PENDIENTE DE RECEPCION';
const QUIEN = 'AUTOMATIZACIÓN';
const ORIGEN = 'AUTOMATIZACION';
const COMENTARIO = 'POR RECIBIR: SIGUE PENDIENTE DE RECEPCION EN RESGUARDOS Y CANCELACIONES (PENDIENTE 3.15)';

/** El libro de producción, del bloque de .clasp.produccion.json en Entornos.gs (que diga ENTORNO 'PROD'). */
function entornoProduccion() {
  const scriptId = JSON.parse(fs.readFileSync(path.join(REPO, '.clasp.produccion.json'), 'utf8')).scriptId;
  const fuente = fs.readFileSync(path.join(REPO, 'src/config/Entornos.gs'), 'utf8').replace(/\r/g, '');
  const inicio = fuente.indexOf("'" + scriptId + "'");
  if (inicio < 0) throw new Error('Entornos.gs no tiene el bloque de producción ' + scriptId);
  const bloque = fuente.slice(inicio, fuente.indexOf('\n  },', inicio));
  const valor = (k) => { const m = bloque.match(new RegExp(k + ":\\s*'([^']*)'")); return m ? m[1] : ''; };
  if (valor('ENTORNO') !== 'PROD') throw new Error('El bloque de .clasp.produccion.json no dice ENTORNO PROD.');
  return { telefonia: valor('SS_ID_TELEFONIA') };
}

/** Ids.nuevo del mismo .gs (nada corre al cargar). */
function idsGs() {
  const ctx = vm.createContext({ Math, Date });
  vm.runInContext(fs.readFileSync(path.join(REPO, 'src/utils/Ids.gs'), 'utf8') + '\nthis.Ids = Ids;', ctx);
  return ctx.Ids;
}

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const may = (v) => txt(v).toUpperCase();
const letra = (i) => { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
/** Fecha de hoy como número de serie de Sheets (hora local), como la escribe aplicar.js. */
function serieAhora() {
  const d = new Date();
  return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000 +
    (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
}

/** Una hoja como { enc, filas: [{ _n (renglón), columna: valor }] }. */
async function tabla(libro, hoja) {
  const v = await valores(libro, hoja, 'A1:ZZ');
  const enc = (v[0] || []).map((c) => txt(c).toUpperCase());
  return { enc, filas: v.slice(1).map((f, i) => { const o = { _n: i + 2 }; enc.forEach((c, j) => { o[c] = f[j] === undefined ? '' : f[j]; }); return o; }) };
}

async function main() {
  const libro = PRODUCCION ? entornoProduccion().telefonia : comun.entornoDev().telefonia;
  if (!libro) throw new Error('No se encontró el libro de telefonía.');
  console.log((PRODUCCION ? 'PRODUCCIÓN' : 'DEV') + ' · libro ' + libro + (ENSAYO ? ' · ENSAYO (no escribe)' : ''));
  const [resg, equipos, mov] = await Promise.all([tabla(libro, 'APP_RESGUARDOS'), tabla(libro, 'EQUIPOS'), tabla(libro, 'MOVIMIENTOS')]);
  ['ESTADO', 'REGISTRO_ID', 'ESTATUS_EQUIPO'].forEach((c) => { if (resg.enc.indexOf(c) < 0) throw new Error('APP_RESGUARDOS no tiene ' + c); });
  ['ID', 'ESTATUS EQUIPO'].forEach((c) => { if (equipos.enc.indexOf(c) < 0) throw new Error('EQUIPOS no tiene ' + c); });
  // El equipo por cualquiera de sus IDs (LineasDatos.idsDeFila: ID, ID ANTERIOR e ID APPSHEET)
  const porId = {};
  equipos.filas.forEach((e) => ['ID', 'ID ANTERIOR', 'ID APPSHEET'].forEach((c) => { if (txt(e[c])) porId[txt(e[c])] = e; }));

  const cambios = [];
  const sinEquipo = [];
  const yaEstan = [];
  resg.filas.filter((r) => may(r['ESTADO']) === PENDIENTE).forEach((r) => {
    const e = porId[txt(r['REGISTRO_ID'])];
    if (!e) { sinEquipo.push(r); return; }
    if (may(e['ESTATUS EQUIPO']) === POR_RECIBIR) { yaEstan.push(r); return; }
    cambios.push({ r, e, antes: txt(e['ESTATUS EQUIPO']), elegido: txt(r['ESTATUS_EQUIPO']) || txt(e['ESTATUS EQUIPO']) });
  });
  console.log('\nPor recibir en el panel: ' + (cambios.length + sinEquipo.length + yaEstan.length) + ' · a POR RECIBIR: ' + cambios.length +
    ' · ya estaban: ' + yaEstan.length + ' · sin equipo: ' + sinEquipo.length);
  cambios.forEach((c) => console.log('  NUCO ' + (txt(c.e['NUCO']) || '—') + ' · ' + txt(c.e['ID']) + ' · ' + (c.antes || '(vacío)') + ' → ' + POR_RECIBIR +
    ' · elegido en el renglón: ' + c.elegido + (txt(c.r['ESTATUS_EQUIPO']) ? '' : ' (se le pone al renglón)')));
  sinEquipo.forEach((r) => console.log('  SIN EQUIPO · renglón ' + txt(r['ID']) + ' · REGISTRO_ID ' + txt(r['REGISTRO_ID']) + ' · NUCO ' + txt(r['NUCO'])));
  if (ENSAYO || !cambios.length) return;

  // 1) El estatus elegido que le falte al renglón; 2) EQUIPOS a POR RECIBIR; 3) un movimiento por equipo
  const col = (t, c) => letra(t.enc.indexOf(c));
  const datos = [];
  cambios.forEach((c) => {
    if (!txt(c.r['ESTATUS_EQUIPO'])) datos.push({ range: "'APP_RESGUARDOS'!" + col(resg, 'ESTATUS_EQUIPO') + c.r._n, values: [[c.elegido]] });
    datos.push({ range: "'EQUIPOS'!" + col(equipos, 'ESTATUS EQUIPO') + c.e._n, values: [[POR_RECIBIR]] });
  });
  await api('POST', SHEETS + libro + '/values:batchUpdate', { valueInputOption: 'RAW', data: datos });
  console.log('\nEscrito: ' + datos.length + ' celdas');

  const Ids = idsGs();
  const fecha = serieAhora();
  const filas = cambios.map((c) => {
    const m = { 'ID': Ids.nuevo('MVT'), 'FECHA': fecha, 'ACCION': 'EDICION', 'ID EQUIPO': txt(c.e['ID']), 'ID LINEA': '', 'ID ASIGNACION': '',
      'COMENTARIO': COMENTARIO, 'TICKET': '', 'DOCUMENTO': '', 'CAMBIOS': JSON.stringify([{ campo: 'ESTATUS EQUIPO', antes: c.antes, despues: POR_RECIBIR }]),
      'QUIEN': QUIEN, 'ORIGEN': ORIGEN };
    return mov.enc.map((h) => (h in m ? m[h] : ''));
  });
  const r = await api('POST', SHEETS + libro + '/values/' + rango('MOVIMIENTOS', 'A1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { values: filas });
  // Con el formato del renglón 2 (la fecha como fecha), como aplicar.js
  const m = r.updates.updatedRange.match(/![A-Z]+(\d+):[A-Z]+(\d+)$/);
  const meta = await api('GET', SHEETS + libro + '?fields=sheets.properties(title,sheetId)');
  const hoja = meta.sheets.filter((s) => s.properties.title === 'MOVIMIENTOS')[0].properties.sheetId;
  if (m && mov.filas.length) {
    await api('POST', SHEETS + libro + ':batchUpdate', { requests: [{ copyPaste: {
      source: { sheetId: hoja, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: mov.enc.length },
      destination: { sheetId: hoja, startRowIndex: +m[1] - 1, endRowIndex: +m[2], startColumnIndex: 0, endColumnIndex: mov.enc.length },
      pasteType: 'PASTE_FORMAT' } }] });
  }
  console.log('MOVIMIENTOS: ' + filas.length + ' renglones (' + r.updates.updatedRange + '). Falta «Recargar datos» en la app.');
}

if (require.main === module) main().catch((e) => { console.error('\n' + (e.message || e)); process.exitCode = 1; });
