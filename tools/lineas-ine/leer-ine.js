#!/usr/bin/env node
/**
 * tools/lineas-ine/leer-ine.js — pendiente 2.28, etapa B desde la computadora (9-oct).
 *
 * Hace lo mismo que lineasIneLectura_todo() (src/services/lineas/LineasIneLectura.gs), pero varios archivos a la vez:
 * en Apps Script van de uno en uno, con cortes cada 6 min y un límite de tiempo al día (unas 8 h para las 5 mil); aquí
 * tarda menos de una hora. Lo que tarda es el OCR de Google, que es el mismo en los dos lados.
 *
 *   - Lee el inventario («INE NUCOS») del libro del DEV y salta lo que ya está en «INE LECTURA».
 *   - Cada candidata: copia como Documento con OCR en «INE NUCOS - OCR TEMPORAL» (dentro de la carpeta de NUCOS del DEV,
 *     nunca la de producción), baja su texto y tira la copia. NUCOS de producción solo se lee.
 *   - El texto se interpreta con ineLecInterpretar_ del mismo .gs (cargado como en las pruebas): mismo resultado.
 *   - Escribe en «INE LECTURA» las mismas columnas. Después, lineasIneEnsayo() en el editor del DEV arma el ensayo.
 *
 * Los IDs (libro, carpetas) salen del bloque del DEV de .clasp.json en src/config/Entornos.gs: si ese bloque no dice
 * ENTORNO 'DEV' o su carpeta de NUCOS es la de producción, no corre.
 *
 * Credencial: un ID de cliente OAuth «App de escritorio» del proyecto de Google Cloud «CI Control Activos» (interno de
 * la empresa), en ../credenciales/lineas-ine-cliente.json (fuera del repo). La primera vez abre el navegador para
 * autorizar con tu cuenta y guarda el permiso en ../credenciales/lineas-ine-token.json.
 *
 * Uso:   node tools/lineas-ine/leer-ine.js [--paralelo 6] [--limite N]
 * No correr a la vez que lineasIneLectura_todo() en el DEV (se leerían dos veces): primero lineasIneLectura_detener().
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { execFile } = require('node:child_process');

const REPO = path.join(__dirname, '..', '..');
const CREDENCIALES = process.env.LINEAS_INE_CREDENCIALES || path.join(REPO, '..', 'credenciales');
const ARCHIVO_CLIENTE = path.join(CREDENCIALES, 'lineas-ine-cliente.json');
const ARCHIVO_TOKEN = path.join(CREDENCIALES, 'lineas-ine-token.json');
const ALCANCES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets';

const arg = (nombre, omision) => {
  const i = process.argv.indexOf('--' + nombre);
  return i > 0 ? Number(process.argv[i + 1]) : omision;
};
const PARALELO = arg('paralelo', 6);
const LIMITE = arg('limite', Infinity);

// ------------------------------------------------------------------ configuración y lógica del .gs

/** El bloque del DEV (scriptId de .clasp.json) en Entornos.gs. */
function entornoDev() {
  const scriptId = JSON.parse(fs.readFileSync(path.join(REPO, '.clasp.json'), 'utf8')).scriptId;
  const fuente = fs.readFileSync(path.join(REPO, 'src/config/Entornos.gs'), 'utf8');
  const inicio = fuente.indexOf("'" + scriptId + "'");
  if (inicio < 0) throw new Error('Entornos.gs no tiene el bloque de ' + scriptId);
  const bloque = fuente.slice(inicio, fuente.indexOf('\n  },', inicio));
  const valor = (k) => { const m = bloque.match(new RegExp(k + ":\\s*'([^']*)'")); return m ? m[1] : ''; };
  const prod = fs.readFileSync(path.join(REPO, 'src/services/lineas/LineasAdmin.gs'), 'utf8').match(/LINEAS_DRIVE_NUCOS_ID = '([^']+)'/)[1];
  const e = { entorno: valor('ENTORNO'), telefonia: valor('SS_ID_TELEFONIA'), vehiculos: valor('SS_ID_VEHICULOS'), nucos: valor('LINEAS_DRIVE_NUCOS') };
  if (e.entorno !== 'DEV') throw new Error('El proyecto de .clasp.json no es un DEV: no corre.');
  if (!e.nucos || e.nucos === prod) throw new Error('La carpeta de NUCOS del DEV es la de producción (o no está): no corre.');
  return e;
}

/** Las funciones y constantes de LineasIneNucos.gs y LineasIneLectura.gs, como en las pruebas (nada corre al cargar). */
function logicaGs() {
  const leer = (f) => fs.readFileSync(path.join(REPO, 'src/services/lineas', f), 'utf8');
  const ctx = vm.createContext({});
  vm.runInContext(leer('LineasIneNucos.gs') + '\n' + leer('LineasIneLectura.gs') + '\nthis.g = { ineLecInterpretar_, ineLecPersonas_, ' +
    'INE_NUCOS_PESTANA, INE_LEC_PESTANA, INE_LEC_ENCABEZADOS, INE_LEC_TEMPORAL };', ctx);
  return ctx.g;
}

// ------------------------------------------------------------------ OAuth (App de escritorio, con redirección local)

let token = null;

async function pedirToken(parametros) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams(parametros) });
  const j = await r.json();
  if (!r.ok) throw new Error('OAuth: ' + (j.error_description || j.error || r.status));
  return j;
}

async function autorizar(cliente) {
  const verificador = crypto.randomBytes(48).toString('base64url');
  const reto = crypto.createHash('sha256').update(verificador).digest('base64url');
  const estado = crypto.randomBytes(16).toString('hex');
  const { codigo, redireccion } = await new Promise((resolve, reject) => {
    const servidor = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (!u.searchParams.get('code') && !u.searchParams.get('error')) { res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<p style="font-family:sans-serif">Listo, ya puedes cerrar esta pestaña y volver a la terminal.</p>');
      servidor.close();
      if (u.searchParams.get('state') !== estado) return reject(new Error('OAuth: la respuesta no corresponde a esta solicitud'));
      if (u.searchParams.get('error')) return reject(new Error('OAuth: ' + u.searchParams.get('error')));
      resolve({ codigo: u.searchParams.get('code'), redireccion: 'http://127.0.0.1:' + servidor.address().port });
    });
    servidor.listen(0, '127.0.0.1', () => {
      const redireccionUri = 'http://127.0.0.1:' + servidor.address().port;
      const url = cliente.auth_uri + '?' + new URLSearchParams({ client_id: cliente.client_id, redirect_uri: redireccionUri,
        response_type: 'code', scope: ALCANCES, access_type: 'offline', prompt: 'consent', state: estado,
        code_challenge: reto, code_challenge_method: 'S256' });
      console.log('\nAutoriza con tu cuenta de Ciudad Maderas en el navegador. Si no se abre solo, copia esta dirección:\n' + url + '\n');
      execFile('rundll32', ['url.dll,FileProtocolHandler', url], () => {});
    });
  });
  const j = await pedirToken({ client_id: cliente.client_id, client_secret: cliente.client_secret, code: codigo,
    redirect_uri: redireccion, grant_type: 'authorization_code', code_verifier: verificador });
  return { refresh_token: j.refresh_token, access_token: j.access_token, vence: Date.now() + (j.expires_in - 60) * 1000 };
}

async function accessToken() {
  if (token && token.access_token && Date.now() < token.vence) return token.access_token;
  if (!fs.existsSync(ARCHIVO_CLIENTE)) throw new Error('Falta la credencial: ' + ARCHIVO_CLIENTE);
  const cliente = JSON.parse(fs.readFileSync(ARCHIVO_CLIENTE, 'utf8')).installed;
  if (!token && fs.existsSync(ARCHIVO_TOKEN)) token = JSON.parse(fs.readFileSync(ARCHIVO_TOKEN, 'utf8'));
  if (token && token.refresh_token) {
    const j = await pedirToken({ client_id: cliente.client_id, client_secret: cliente.client_secret,
      refresh_token: token.refresh_token, grant_type: 'refresh_token' });
    token = { refresh_token: token.refresh_token, access_token: j.access_token, vence: Date.now() + (j.expires_in - 60) * 1000 };
  } else {
    token = await autorizar(cliente);
    fs.writeFileSync(ARCHIVO_TOKEN, JSON.stringify({ refresh_token: token.refresh_token }), { mode: 0o600 });
  }
  return token.access_token;
}

// ------------------------------------------------------------------ llamadas a Google, con reintento

class ErrorCuota extends Error {}

async function api(metodo, url, cuerpo, comoTexto) {
  for (let intento = 0; ; intento++) {
    const r = await fetch(url, { method: metodo, headers: Object.assign({ Authorization: 'Bearer ' + await accessToken() },
      cuerpo ? { 'Content-Type': 'application/json' } : {}), body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    if (r.ok) return comoTexto ? r.text() : (r.status === 204 ? null : r.json());
    const texto = await r.text();
    if (r.status === 401 && intento < 2) { token.vence = 0; continue; }
    const limite = r.status === 429 || r.status >= 500 || (r.status === 403 && /rate ?limit|quota|userRateLimitExceeded/i.test(texto));
    if (limite && intento < 8) { await new Promise((ok) => setTimeout(ok, Math.min(64000, 1000 * 2 ** intento) + Math.random() * 1000)); continue; }
    const e = limite ? new ErrorCuota('Límite de Google: ' + texto.slice(0, 200)) : new Error(r.status + ' ' + texto.slice(0, 300));
    throw e;
  }
}

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets/';
const rango = (pestana, a1) => encodeURIComponent("'" + pestana + "'!" + a1);

async function valores(libro, pestana, a1) {
  const j = await api('GET', SHEETS + libro + '/values/' + rango(pestana, a1) + '?valueRenderOption=FORMATTED_VALUE');
  return j.values || [];
}

async function carpetaTemporal(nucosDev, nombre) {
  const q = "'" + nucosDev + "' in parents and name = '" + nombre + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  const r = await api('GET', DRIVE + '?' + new URLSearchParams({ q, fields: 'files(id)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' }));
  if (r.files && r.files.length) return r.files[0].id;
  return (await api('POST', DRIVE + '?supportsAllDrives=true&fields=id', { name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [nucosDev] })).id;
}

/** El texto de un archivo de NUCOS: copia con OCR en la carpeta temporal, se baja el texto y se tira la copia. */
async function textoOcr(id, temporal) {
  const copia = await api('POST', DRIVE + '/' + id + '/copy?ocrLanguage=es&supportsAllDrives=true&fields=id',
    { name: 'OCR ' + id, mimeType: 'application/vnd.google-apps.document', parents: [temporal] });
  try {
    return (await api('GET', DRIVE + '/' + copia.id + '/export?mimeType=text/plain', null, true)).replace(/^\uFEFF/, '').replace(/\r/g, '');
  } finally {
    await api('PATCH', DRIVE + '/' + copia.id + '?supportsAllDrives=true&fields=id', { trashed: true })
      .catch(() => console.warn('No se tiró la copia ' + copia.id + ' (queda en la carpeta temporal)'));
  }
}

// ------------------------------------------------------------------ principal

async function main() {
  const dev = entornoDev();
  const g = logicaGs();
  const encabezados = [...g.INE_LEC_ENCABEZADOS];
  console.log('Libro del DEV ' + dev.telefonia + ' · carpeta de NUCOS de pruebas ' + dev.nucos);

  // La pestaña de lectura: se crea, o se vacía si es la de la muestra (con TEXTO); si no, se continúa
  const meta = await api('GET', SHEETS + dev.telefonia + '?fields=sheets.properties.title');
  const titulos = meta.sheets.map((s) => s.properties.title);
  if (titulos.indexOf(g.INE_NUCOS_PESTANA) < 0) throw new Error('Falta el inventario «' + g.INE_NUCOS_PESTANA + '»: corre lineasIneNucos_inventario().');
  if (titulos.indexOf(g.INE_LEC_PESTANA) < 0) {
    await api('POST', SHEETS + dev.telefonia + ':batchUpdate', { requests: [{ addSheet: { properties: { title: g.INE_LEC_PESTANA } } }] });
  }
  const primera = (await valores(dev.telefonia, g.INE_LEC_PESTANA, '1:1'))[0] || [];
  if (primera.join('|') !== encabezados.join('|')) {
    await api('POST', SHEETS + dev.telefonia + '/values/' + rango(g.INE_LEC_PESTANA, 'A:Z') + ':clear', {});
    await api('PUT', SHEETS + dev.telefonia + '/values/' + rango(g.INE_LEC_PESTANA, 'A1') + '?valueInputOption=RAW', { values: [encabezados] });
    if (primera.length) console.log('«' + g.INE_LEC_PESTANA + '» era la de la muestra: se vació.');
  }
  const leidas = new Set((await valores(dev.telefonia, g.INE_LEC_PESTANA, 'A2:A')).map((r) => r[0]));

  const candidatas = (await valores(dev.telefonia, g.INE_NUCOS_PESTANA, 'A2:I'))
    .filter((r) => r[7] || r[8])
    .map((r) => ({ nuco: r[0], ruta: r[1], nombre: r[2], id: r[3], tipo: r[4], kb: r[5] || '' }))
    .filter((c) => !leidas.has(c.id));
  const lista = candidatas.slice(0, LIMITE === Infinity ? undefined : LIMITE);

  // Vocabulario: las palabras de los nombres de Capital Humano (como ineLecVocabulario_)
  const ch = await valores(dev.vehiculos, 'COLABORADORES ACTUALIZADO', 'A:AZ');
  const enc = (ch[0] || []).map((x) => String(x).trim());
  const personas = g.ineLecPersonas_(ch.slice(1).map((r) => { const o = {}; enc.forEach((k, i) => { o[k] = r[i] || ''; }); return o; }), {});
  const vocabulario = {};
  personas.forEach((p) => p.palabras.forEach((w) => { vocabulario[w] = true; }));

  const temporal = await carpetaTemporal(dev.nucos, g.INE_LEC_TEMPORAL);
  console.log('Ya leídas: ' + leidas.size + ' · por leer: ' + candidatas.length + (lista.length < candidatas.length ? ' (esta vez ' + lista.length + ')' : '') +
    ' · ' + PARALELO + ' a la vez\n');

  let filas = [];
  let escribiendo = Promise.resolve();
  const vaciar = () => {
    if (!filas.length) return escribiendo;
    const lote = filas;
    filas = [];
    escribiendo = escribiendo.then(() => api('POST', SHEETS + dev.telefonia + '/values/' + rango(g.INE_LEC_PESTANA, 'A1') +
      ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { values: lote }));
    return escribiendo;
  };

  const inicio = Date.now();
  let hechos = 0;
  let errores = 0;
  let detener = null;
  let siguiente = 0;
  process.on('SIGINT', () => { detener = detener || new Error('Detenido con Ctrl+C'); console.log('\nTerminando lo que va en curso…'); });

  const trabajador = async () => {
    while (!detener && siguiente < lista.length) {
      const c = lista[siguiente++];
      const t0 = Date.now();
      let texto = '';
      let error = '';
      try {
        texto = await textoOcr(c.id, temporal);
      } catch (e) {
        if (e instanceof ErrorCuota) { detener = detener || e; return; }
        error = String(e.message || e).slice(0, 200);
      }
      const l = g.ineLecInterpretar_(texto, vocabulario);
      filas.push([c.id, c.nuco, c.ruta, c.nombre, c.kb, l.tipo, l.lado, l.curp, l.curpOk ? 'SI' : '', l.nacimiento, l.sexo,
        l.nombreVuelta, l.idmex, l.clave, [...l.nombres].join(' '), error, Math.round((Date.now() - t0) / 1000)]);
      hechos++;
      if (error) errores++;
      if (filas.length >= 25) vaciar();
      if (hechos % 25 === 0 || hechos === lista.length) {
        const porSeg = hechos / ((Date.now() - inicio) / 1000);
        const faltan = Math.round((lista.length - hechos) / porSeg / 60);
        console.log(hechos + ' de ' + lista.length + ' · con error ' + errores + ' · ' + porSeg.toFixed(1) + ' por segundo · faltan ~' + faltan + ' min');
      }
    }
  };
  await Promise.all(Array.from({ length: PARALELO }, trabajador));
  await vaciar();
  console.log('\nLeídos ' + hechos + ' en ' + Math.round((Date.now() - inicio) / 60000) + ' min · con error ' + errores);
  if (detener) {
    console.log((detener instanceof ErrorCuota ? 'Se detuvo por un límite de Google; vuelve a correrlo en un rato: ' : 'Se detuvo: ') + detener.message +
      '\nLo leído quedó guardado; al volver a correrlo sigue donde se quedó.');
    process.exitCode = 1;
  } else if (hechos === candidatas.length) {
    console.log('Terminó. Ahora corre lineasIneEnsayo() en el editor del DEV.');
  }
}

if (require.main === module) main().catch((e) => { console.error('\n' + (e.message || e)); process.exitCode = 1; });
module.exports = { entornoDev, logicaGs };
