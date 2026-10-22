/**
 * tools/lineas-datos/comun.js — lo que comparten los programas que corrigen datos del libro de Líneas desde la
 * computadora (por-recibir.js, pendiente 3.15; limpiar-dg.js, pendiente 8.16). Usan la credencial y las llamadas a Google
 * de tools/lineas-ine/leer-ine.js.
 *
 * Reglas (usuario; memoria «escribir en producción con permiso»): DEV por omisión; --produccion solo con permiso del
 * usuario; siempre --ensayo primero (dice qué haría, sin escribir); se pueden volver a correr; cada cambio deja su
 * movimiento con QUIEN «AUTOMATIZACIÓN» y ORIGEN «AUTOMATIZACION» (como reporte_lineas/actualizacion_base/actualizar.py).
 * Después, «Recargar datos» en la app.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ine = require('../lineas-ine/leer-ine.js');

const { api, valores, rango, SHEETS, REPO } = ine;
const PRODUCCION = process.argv.indexOf('--produccion') > 0;
const ENSAYO = process.argv.indexOf('--ensayo') > 0;
const QUIEN = 'AUTOMATIZACIÓN';
const ORIGEN = 'AUTOMATIZACION';

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

/** El libro de telefonía de este corrida (DEV o, con --produccion, producción). */
function libro() {
  const l = PRODUCCION ? entornoProduccion().telefonia : ine.entornoDev().telefonia;
  if (!l) throw new Error('No se encontró el libro de telefonía.');
  console.log((PRODUCCION ? 'PRODUCCIÓN' : 'DEV') + ' · libro ' + l + (ENSAYO ? ' · ENSAYO (no escribe)' : ''));
  return l;
}

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const may = (v) => txt(v).toUpperCase();
const letra = (i) => { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };

/** Una hoja como { hoja, enc, filas: [{ _n (renglón), columna: valor }] }. */
async function tabla(idLibro, hoja) {
  const v = await valores(idLibro, hoja, 'A1:ZZ');
  const enc = (v[0] || []).map((c) => may(c));
  return { hoja, enc, filas: v.slice(1).map((f, i) => { const o = { _n: i + 2 }; enc.forEach((c, j) => { o[c] = f[j] === undefined ? '' : f[j]; }); return o; }) };
}

/** La celda A1 de `columna` en el renglón `fila` de la tabla. */
function celda(t, columna, fila) {
  const i = t.enc.indexOf(columna);
  if (i < 0) throw new Error(t.hoja + ' no tiene ' + columna);
  return "'" + t.hoja + "'!" + letra(i) + fila._n;
}

async function escribirCeldas(idLibro, datos) {
  for (let i = 0; i < datos.length; i += 500) {
    await api('POST', SHEETS + idLibro + '/values:batchUpdate', { valueInputOption: 'RAW', data: datos.slice(i, i + 500) });
  }
}

/** Fecha de hoy como número de serie de Sheets (hora local), como la escribe aplicar.js. */
function serieAhora() {
  const d = new Date();
  return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000 +
    (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
}

/** Ids.nuevo del mismo .gs (nada corre al cargar). */
function idsGs() {
  const ctx = vm.createContext({ Math, Date });
  vm.runInContext(fs.readFileSync(path.join(REPO, 'src/utils/Ids.gs'), 'utf8') + '\nthis.Ids = Ids;', ctx);
  return ctx.Ids;
}

/**
 * Agrega a MOVIMIENTOS un renglón por cambio: m = { accion, equipo, linea, asignacion, comentario, cambios: [{ campo,
 * antes, despues }] }, con el formato del renglón 2 (la fecha como fecha), como aplicar.js.
 */
async function agregarMovimientos(idLibro, mov, lista) {
  if (!lista.length) return;
  const Ids = idsGs();
  const fecha = serieAhora();
  const filas = lista.map((m) => {
    const o = { 'ID': Ids.nuevo('MVT'), 'FECHA': fecha, 'ACCION': m.accion, 'ID EQUIPO': m.equipo || '', 'ID LINEA': m.linea || '',
      'ID ASIGNACION': m.asignacion || '', 'COMENTARIO': m.comentario, 'TICKET': '', 'DOCUMENTO': m.documento || '', 'CAMBIOS': JSON.stringify(m.cambios),
      'QUIEN': QUIEN, 'ORIGEN': ORIGEN };
    return mov.enc.map((h) => (h in o ? o[h] : ''));
  });
  // Desde el último renglón con datos (pendiente 7.12): desde A1, el append toma la tabla hasta el primer renglón vacío y
  // con uno a la mitad de la hoja metía los nuevos ahí, no al final
  const ultimo = (await valores(idLibro, 'MOVIMIENTOS', 'A1:ZZ')).length;
  const r = await api('POST', SHEETS + idLibro + '/values/' + rango('MOVIMIENTOS', 'A' + Math.max(1, ultimo)) + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { values: filas });
  const m = r.updates.updatedRange.match(/![A-Z]+(\d+):[A-Z]+(\d+)$/);
  const meta = await api('GET', SHEETS + idLibro + '?fields=sheets.properties(title,sheetId)');
  const hoja = meta.sheets.filter((s) => s.properties.title === 'MOVIMIENTOS')[0].properties.sheetId;
  if (m && mov.filas.length) {
    await api('POST', SHEETS + idLibro + ':batchUpdate', { requests: [{ copyPaste: {
      source: { sheetId: hoja, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: mov.enc.length },
      destination: { sheetId: hoja, startRowIndex: +m[1] - 1, endRowIndex: +m[2], startColumnIndex: 0, endColumnIndex: mov.enc.length },
      pasteType: 'PASTE_FORMAT' } }] });
  }
  console.log('MOVIMIENTOS: ' + filas.length + ' renglones (' + r.updates.updatedRange + '). Falta «Recargar datos» en la app.');
}

/** Como `tabla`, con los valores sin formato: una fecha llega como su número de serie (pendiente 2.47). */
async function tablaSinFormato(idLibro, hoja) {
  const j = await api('GET', SHEETS + idLibro + '/values/' + rango(hoja, 'A1:ZZ') + '?valueRenderOption=UNFORMATTED_VALUE');
  const v = j.values || [];
  const enc = (v[0] || []).map((c) => may(c));
  return { hoja, enc, filas: v.slice(1).map((f, i) => { const o = { _n: i + 2 }; enc.forEach((c, j2) => { o[c] = f[j2] === undefined ? '' : f[j2]; }); return o; }) };
}

/** El sheetId de una pestaña (para borrar renglones). */
async function idDeHoja(idLibro, hoja) {
  const meta = await api('GET', SHEETS + idLibro + '?fields=sheets.properties(title,sheetId)');
  const h = meta.sheets.filter((s) => s.properties.title === hoja)[0];
  if (!h) throw new Error('El libro no tiene la pestaña ' + hoja);
  return h.properties.sheetId;
}

/** Las columnas que le falten a la tabla, al final del encabezado (en negritas, como LineasDatos.asegurarColumnas). */
async function asegurarColumnas(idLibro, t, columnas) {
  const faltan = columnas.filter((k) => t.enc.indexOf(k) < 0);
  if (!faltan.length) return [];
  const meta = await api('GET', SHEETS + idLibro + '?fields=sheets.properties(title,sheetId,gridProperties)');
  const p = meta.sheets.filter((s) => s.properties.title === t.hoja)[0].properties;
  const requests = [];
  const sobran = t.enc.length + faltan.length - p.gridProperties.columnCount;
  if (sobran > 0) requests.push({ appendDimension: { sheetId: p.sheetId, dimension: 'COLUMNS', length: sobran } });
  requests.push({ repeatCell: { range: { sheetId: p.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: t.enc.length, endColumnIndex: t.enc.length + faltan.length },
    cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } });
  await api('POST', SHEETS + idLibro + ':batchUpdate', { requests });
  await escribirCeldas(idLibro, [{ range: "'" + t.hoja + "'!" + letra(t.enc.length) + '1', values: [faltan] }]);
  faltan.forEach((k) => t.enc.push(k));
  return faltan;
}

/**
 * Agrega renglones (objetos por columna) al final de la tabla, cada uno con el formato del renglón `formatoDe[i]` (su
 * número en la hoja): así una fecha escrita como número de serie se ve como fecha.
 */
async function agregarFilas(idLibro, t, objetos, formatoDe) {
  if (!objetos.length) return;
  const ultimo = (await valores(idLibro, t.hoja, 'A1:ZZ')).length;
  const r = await api('POST', SHEETS + idLibro + '/values/' + rango(t.hoja, 'A' + Math.max(1, ultimo)) + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
    { values: objetos.map((o) => t.enc.map((h) => (h in o ? o[h] : ''))) });
  const m = r.updates.updatedRange.match(/![A-Z]+(\d+):[A-Z]+(\d+)$/);
  if (!m) return;
  const hoja = await idDeHoja(idLibro, t.hoja);
  await api('POST', SHEETS + idLibro + ':batchUpdate', { requests: objetos.map((o, i) => ({ copyPaste: {
    source: { sheetId: hoja, startRowIndex: formatoDe[i] - 1, endRowIndex: formatoDe[i], startColumnIndex: 0, endColumnIndex: t.enc.length },
    destination: { sheetId: hoja, startRowIndex: +m[1] - 1 + i, endRowIndex: +m[1] + i, startColumnIndex: 0, endColumnIndex: t.enc.length },
    pasteType: 'PASTE_FORMAT' } })) });
  console.log(t.hoja + ': ' + objetos.length + ' renglones nuevos (' + r.updates.updatedRange + ')');
}

module.exports = { PRODUCCION, ENSAYO, REPO, libro, tabla, tablaSinFormato, idDeHoja, celda, escribirCeldas, agregarMovimientos, asegurarColumnas,
  agregarFilas, serieAhora, idsGs, txt, may, api, SHEETS };
