#!/usr/bin/env node
/**
 * tools/lineas-ine/registrar-ine.js — pendiente 2.28, etapa C (9-oct): las INE de NUCOS al registro, en el DEV.
 *
 * Qué entra (decisión del usuario, 9-oct; ineLecParaRegistro_ de LineasIneLectura.gs): las SEGURA de «INE ENSAYO» de
 * personal activo, de carpetas de responsiva y con «INE» en el nombre de cada archivo; una por persona (la que tiene
 * los dos lados y, entre esas, la más reciente).
 *
 * Por persona: un PDF como el del paso 1 (pendiente 2.27): si ya hay un PDF con los dos lados, ese tal cual; si son
 * fotos, frente y vuelta en carta, dos por hoja, con armarPdfDeJpeg de la pantalla (src/html/js/lineas.html). Las fotos
 * llegan reducidas por Google a 2400 px (la miniatura grande de Drive), como las reduce la pantalla del paso 1. Se llama
 * como en el paso 1 (LineasIdentificaciones.nombreArchivo: «INE - NOMBRE - ID PERSONA.pdf») y queda un renglón en
 * APP_IDENTIFICACIONES con ORIGEN «NUCOS» y su ID de Ids.nuevo (los mismos .gs, cargados como en las pruebas).
 *
 * En el DEV: el PDF va a la carpeta de NUCOS de pruebas, con la misma ruta que su original
 * (<NUCO>/CARTA RESPONSIVA/<AÑO>/RESP DD MM) y el registro al libro del DEV. Los originales de NUCOS de producción solo
 * se leen. Producción no está aquí: cuando el usuario lo diga, se agrega aparte.
 *
 * Se puede volver a correr: salta a quien ya tiene su renglón con ORIGEN «NUCOS» y, si el PDF ya está en la carpeta, no
 * lo vuelve a subir.
 *
 * Uso:   node tools/lineas-ine/registrar-ine.js [--limite N] [--paralelo 4]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const comun = require('./leer-ine.js');

const { api, valores, rango, accessToken, ErrorCuota, DRIVE, SHEETS, REPO } = comun;
const arg = (nombre, omision) => {
  const i = process.argv.indexOf('--' + nombre);
  return i > 0 ? Number(process.argv[i + 1]) : omision;
};
const LIMITE = arg('limite', Infinity);
const PARALELO = arg('paralelo', 4);
const LADO_MAXIMO = 2400;
const ORIGEN = 'NUCOS';

/** armarPdfDeJpeg de la pantalla (el mismo del paso 1), como en tests/lineas-identificacion.test.cjs. */
function armadorPdf() {
  const pantalla = fs.readFileSync(path.join(REPO, 'src/html/js/lineas.html'), 'utf8').replace(/\r/g, '');
  const inicio = pantalla.indexOf('    function armarPdfDeJpeg(fotos) {');
  const fin = pantalla.indexOf('\n    }\n', inicio) + 6;
  if (inicio < 0 || fin < 6) throw new Error('No se encontró armarPdfDeJpeg en lineas.html');
  const ctx = vm.createContext({ TextEncoder, Uint8Array });
  vm.runInContext(pantalla.slice(inicio, fin) + '\nthis.armar = armarPdfDeJpeg;', ctx);
  return ctx.armar;
}

/** Ancho, alto y canales de un JPEG (su marcador SOF). */
function medidasJpeg(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const largo = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7), canales: b[i + 9] };
    }
    i += 2 + largo;
  }
  return null;
}

/**
 * Qué archivos forman el PDF: un PDF que ya trae los dos lados, tal cual; si no, una imagen con los dos lados, o el
 * frente y la vuelta (las imágenes de un PDF de un solo lado salen de su primera hoja).
 */
function piezas(x, esPdf) {
  const items = x.ids.map((id, i) => ({ id, lado: x.lados[i], pdf: esPdf(id) }));
  const pdfDos = items.filter((it) => it.pdf && it.lado === 'LOS DOS')[0];
  if (pdfDos) return { pdf: pdfDos.id };
  const dos = items.filter((it) => it.lado === 'LOS DOS')[0];
  if (dos) return { imagenes: [dos.id] };
  const lados = ['FRENTE', 'VUELTA'].map((l) => items.filter((it) => it.lado === l)[0]).filter(Boolean);
  return { imagenes: (lados.length ? lados : items).map((it) => it.id) };
}

/** Una llamada a Google con cuerpo o respuesta binarios, con el mismo reintento que `api`. */
async function bruto(metodo, url, cabeceras, cuerpo) {
  for (let intento = 0; ; intento++) {
    const r = await fetch(url, { method: metodo, headers: Object.assign({ Authorization: 'Bearer ' + await accessToken() }, cabeceras || {}), body: cuerpo });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const texto = await r.text();
    const limite = r.status === 429 || r.status >= 500 || (r.status === 403 && /rate ?limit|quota/i.test(texto));
    if (limite && intento < 8) { await new Promise((ok) => setTimeout(ok, Math.min(64000, 1000 * 2 ** intento) + Math.random() * 1000)); continue; }
    throw limite ? new ErrorCuota('Límite de Google: ' + texto.slice(0, 200)) : new Error(r.status + ' ' + texto.slice(0, 300));
  }
}

/** La imagen de un archivo de Drive, reducida por Google a LADO_MAXIMO px, en JPEG. */
async function jpegDe(id) {
  const meta = await api('GET', DRIVE + '/' + id + '?supportsAllDrives=true&fields=thumbnailLink,name');
  if (!meta.thumbnailLink) throw new Error(meta.name + ': Drive no tiene su imagen');
  const url = meta.thumbnailLink.replace(/=s\d+(-[a-z0-9-]+)?$/i, '') + '=s' + LADO_MAXIMO + '-rj';
  const bytes = await bruto('GET', url);
  const m = medidasJpeg(bytes);
  if (!m) throw new Error(meta.name + ': la imagen no llegó como JPEG');
  if (m.canales !== 3) throw new Error(meta.name + ': JPEG con ' + m.canales + ' canales (no RGB)');
  return { ancho: m.ancho, alto: m.alto, bytes: new Uint8Array(bytes) };
}

const comillas = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function buscarEn(padre, nombre, soloCarpetas) {
  const q = "'" + padre + "' in parents and name = '" + comillas(nombre) + "' and trashed = false" +
    (soloCarpetas ? " and mimeType = 'application/vnd.google-apps.folder'" : '');
  const r = await api('GET', DRIVE + '?' + new URLSearchParams({ q, fields: 'files(id)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' }));
  return r.files && r.files.length ? r.files[0].id : null;
}

/** <raíz>/<NUCO>/<ruta>, creando lo que falte. Una sola vez por ruta aunque vayan varios a la vez. */
const carpetas = {};
function carpetaDestino(raiz, partes) {
  const clave = partes.join('/');
  if (!carpetas[clave]) {
    carpetas[clave] = (async () => {
      const padre = partes.length > 1 ? await carpetaDestino(raiz, partes.slice(0, -1)) : raiz;
      const nombre = partes[partes.length - 1];
      return (await buscarEn(padre, nombre, true)) ||
        (await api('POST', DRIVE + '?supportsAllDrives=true&fields=id', { name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [padre] })).id;
    })();
  }
  return carpetas[clave];
}

async function subirPdf(carpeta, nombre, bytes, descripcion) {
  const limite = 'lineas' + crypto.randomBytes(12).toString('hex');
  const meta = { name: nombre, parents: [carpeta], mimeType: 'application/pdf', description: descripcion };
  const cuerpo = Buffer.concat([
    Buffer.from('--' + limite + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + limite +
      '\r\nContent-Type: application/pdf\r\n\r\n'),
    Buffer.from(bytes), Buffer.from('\r\n--' + limite + '--'),
  ]);
  const r = await bruto('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',
    { 'Content-Type': 'multipart/related; boundary=' + limite }, cuerpo);
  return JSON.parse(r.toString('utf8')).id;
}

const dos = (n) => String(n).padStart(2, '0');
const ahora = () => { const d = new Date(); return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()) + ' ' + dos(d.getHours()) + ':' + dos(d.getMinutes()) + ':' + dos(d.getSeconds()); };

async function main() {
  const dev = comun.entornoDev();
  const g = comun.logicaGs();
  const armar = armadorPdf();
  const ENC = [...g.LineasIdentificaciones.ENCABEZADOS];
  const HOJA = g.LineasIdentificaciones.HOJA;
  const quien = (await api('GET', 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)')).user.emailAddress;
  console.log('DEV: PDF a la carpeta de NUCOS de pruebas ' + dev.nucos + ' · registro en ' + HOJA + ' del libro ' + dev.telefonia + ' · ' + quien);

  // Lo que va al registro, con la misma función que el .gs
  const ensayo = await valores(dev.telefonia, g.INE_ENSAYO_PESTANA, 'A2:L');
  const nombres = {};
  (await valores(dev.telefonia, g.INE_LEC_PESTANA, 'A2:D')).forEach((r) => { nombres[r[0]] = r[3] || ''; });
  const mimes = {};
  const carpetaNuco = {};
  (await valores(dev.telefonia, g.INE_NUCOS_PESTANA, 'A2:E')).forEach((r) => { mimes[r[3]] = r[4] || ''; carpetaNuco[r[3]] = r[0]; });
  const ch = await valores(dev.vehiculos, 'COLABORADORES ACTUALIZADO', 'A:AZ');
  const iNum = ch[0].indexOf('No EMPLEADO');
  const iSt = ch[0].indexOf('STATUS');
  const activos = new Set(ch.slice(1).filter((r) => /ACTIV/i.test(r[iSt] || '')).map((r) => String(r[iNum] || '').trim().toUpperCase()));
  const todos = g.ineLecParaRegistro_(ensayo.map((r) => { const f = r.slice(); while (f.length < 12) f.push(''); return f; }),
    (id) => nombres[id] || '', (n) => activos.has(n));

  // Registro: la pestaña (si no está) y quién ya tiene su renglón de NUCOS
  const meta = await api('GET', SHEETS + dev.telefonia + '?fields=sheets.properties.title');
  if (meta.sheets.map((s) => s.properties.title).indexOf(HOJA) < 0) {
    await api('POST', SHEETS + dev.telefonia + ':batchUpdate', { requests: [{ addSheet: { properties: { title: HOJA } } }] });
    await api('PUT', SHEETS + dev.telefonia + '/values/' + rango(HOJA, 'A1') + '?valueInputOption=RAW', { values: [ENC] });
  }
  const registro = await valores(dev.telefonia, HOJA, 'A:Z');
  const col = (k) => registro[0].indexOf(k);
  const yaEstan = new Set(registro.slice(1).filter((r) => r[col('ORIGEN')] === ORIGEN).map((r) => r[col('ID PERSONA')] || r[col('NOMBRE')]));
  const faltan = todos.filter((x) => !yaEstan.has(x.idPersona || x.nombre));
  const lista = faltan.slice(0, LIMITE === Infinity ? undefined : LIMITE);
  console.log('Personas: ' + todos.length + ' · ya registradas: ' + (todos.length - faltan.length) + ' · esta vez: ' + lista.length + ' · ' + PARALELO + ' a la vez\n');

  let filas = [];
  let escribiendo = Promise.resolve();
  const vaciar = () => {
    if (!filas.length) return escribiendo;
    const lote = filas;
    filas = [];
    escribiendo = escribiendo.then(() => api('POST', SHEETS + dev.telefonia + '/values/' + rango(HOJA, 'A1') +
      ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS', { values: lote }));
    return escribiendo;
  };
  const texto = (v) => (v ? "'" + v : ''); // con USER_ENTERED, «0209» y los números de empleado se quedan como texto

  const inicio = Date.now();
  let hechos = 0;
  const errores = [];
  let detener = null;
  let siguiente = 0;
  process.on('SIGINT', () => { detener = detener || new Error('Detenido con Ctrl+C'); console.log('\nTerminando lo que va en curso…'); });

  const trabajador = async () => {
    while (!detener && siguiente < lista.length) {
      const x = lista[siguiente++];
      try {
        const p = piezas(x, (id) => /pdf/i.test(mimes[id] || ''));
        const nombre = g.LineasIdentificaciones.nombreArchivo('INE', x.nombre, x.idPersona);
        const carpeta = await carpetaDestino(dev.nucos, [carpetaNuco[x.ids[0]] || x.nuco].concat(x.ruta.split('/')));
        let id = await buscarEn(carpeta, nombre, false);
        if (!id) {
          const bytes = p.pdf ? await bruto('GET', DRIVE + '/' + p.pdf + '?alt=media&supportsAllDrives=true')
            : armar(await Promise.all(p.imagenes.map(jpegDe)));
          const d = new Date();
          id = await subirPdf(carpeta, nombre, bytes, 'Subido por ' + quien + ' desde Control Interno, el ' + dos(d.getDate()) + '/' +
            dos(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + dos(d.getHours()) + ':' + dos(d.getMinutes()));
        }
        const o = { 'ID': g.Ids.nuevo('IDN'), 'ID PERSONA': texto(x.idPersona), 'NO EMPLEADO': texto(x.noEmpleado), 'NOMBRE': texto(x.nombre),
          'TIPO': 'INE', 'ARCHIVO ID': texto(id), 'ARCHIVO': texto(nombre), 'NUCO': texto(x.nuco), 'ID RESPONSIVA': '', 'ID LINEA': '',
          'ORIGEN': ORIGEN, 'FECHA': ahora(), 'QUIEN': quien };
        filas.push(registro[0].map((k) => (k in o ? o[k] : '')));
        if (filas.length >= 20) vaciar();
      } catch (e) {
        if (e instanceof ErrorCuota) { detener = detener || e; return; }
        errores.push('NUCO ' + x.nuco + ' · ' + x.nombre + ': ' + (e.message || e));
      }
      hechos++;
      if (hechos % 20 === 0 || hechos === lista.length) {
        const porSeg = hechos / ((Date.now() - inicio) / 1000);
        console.log(hechos + ' de ' + lista.length + ' · con error ' + errores.length + ' · faltan ~' + Math.round((lista.length - hechos) / porSeg / 60) + ' min');
      }
    }
  };
  await Promise.all(Array.from({ length: PARALELO }, trabajador));
  await vaciar();
  console.log('\nRegistradas ' + (hechos - errores.length) + ' en ' + Math.round((Date.now() - inicio) / 60000) + ' min · con error ' + errores.length);
  errores.forEach((e) => console.log('  ' + e));
  if (detener) {
    console.log((detener instanceof ErrorCuota ? 'Se detuvo por un límite de Google: ' : 'Se detuvo: ') + detener.message +
      '\nLo hecho quedó guardado; al volver a correrlo sigue donde se quedó.');
    process.exitCode = 1;
  }
}

if (require.main === module) main().catch((e) => { console.error('\n' + (e.message || e)); process.exitCode = 1; });
module.exports = { medidasJpeg, piezas, armadorPdf };
