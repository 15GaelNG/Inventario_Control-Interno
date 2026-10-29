/**
 * google.js — las APIs de Google (Drive, Docs, Sheets) con el token de usuario de la migración
 * (tools/migracion/autorizar.py: tools/migracion/.tokens/<destino>.json, fuera de git, con el cliente generic-tool.json).
 * Ese token puede editar cualquier documento de la cuenta: quien escribe (plantillas.js) revisa antes que el documento
 * sea suyo (su lista blanca), no este archivo.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const DOCS = 'https://docs.googleapis.com/v1/documents/';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets/';

let acceso = null;

async function token_(destino) {
  if (acceso && acceso.vence > Date.now()) return acceso.valor;
  const ruta = path.join(RAIZ, 'tools', 'migracion', '.tokens', destino + '.json');
  if (!fs.existsSync(ruta)) throw new Error('Falta el token: corre tools/migracion/autorizar.py ' + destino);
  const guardado = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  if ((guardado.scopes || []).indexOf('https://www.googleapis.com/auth/documents') === -1) {
    throw new Error('El token no tiene permiso de Google Docs: vuelve a correr tools/migracion/autorizar.py ' + destino);
  }
  const cliente = JSON.parse(fs.readFileSync(path.join(RAIZ, 'generic-tool.json'), 'utf8')).installed;
  const r = await fetch(cliente.token_uri, {
    method: 'POST',
    body: new URLSearchParams({ client_id: cliente.client_id, client_secret: cliente.client_secret, refresh_token: guardado.refresh_token, grant_type: 'refresh_token' }),
  });
  const t = await r.json();
  if (!t.access_token) throw new Error('Google no dio acceso: ' + (t.error_description || t.error));
  acceso = { valor: t.access_token, vence: Date.now() + (t.expires_in - 60) * 1000 };
  return acceso.valor;
}

/** Una llamada; si Google contesta un error, truena con su mensaje. Reintenta una vez si es por cuota (429) o del servidor (5xx). */
async function llamar(destino, metodo, url, cuerpo, intento) {
  const r = await fetch(url, {
    method: metodo,
    headers: Object.assign({ Authorization: 'Bearer ' + (await token_(destino)) }, cuerpo ? { 'Content-Type': 'application/json' } : {}),
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if ((r.status === 429 || r.status >= 500) && !intento) {
    await new Promise((listo) => setTimeout(listo, 5000));
    return llamar(destino, metodo, url, cuerpo, 1);
  }
  const texto = await r.text();
  const datos = texto ? JSON.parse(texto) : {};
  if (!r.ok) throw new Error(metodo + ' ' + url.split('?')[0] + ' → ' + r.status + ': ' + ((datos.error && datos.error.message) || texto.slice(0, 200)));
  return datos;
}

function cliente(destino) {
  const q = (o) => Object.keys(o).map((k) => k + '=' + encodeURIComponent(o[k])).join('&');
  return {
    archivo: (id, campos) => llamar(destino, 'GET', DRIVE + '/' + id + '?' + q({ supportsAllDrives: true, fields: campos || 'id,name,parents,mimeType,trashed' })),
    buscar: (consulta, campos) => llamar(destino, 'GET', DRIVE + '?' + q({
      q: consulta, supportsAllDrives: true, includeItemsFromAllDrives: true, pageSize: 200, fields: 'files(' + (campos || 'id,name,parents') + ')',
    })).then((r) => r.files || []),
    copiar: (id, nombre, carpeta) => llamar(destino, 'POST', DRIVE + '/' + id + '/copy?' + q({ supportsAllDrives: true, fields: 'id,name,parents' }),
      { name: nombre, parents: [carpeta] }),
    aPapelera: (id) => llamar(destino, 'PATCH', DRIVE + '/' + id + '?' + q({ supportsAllDrives: true }), { trashed: true }),
    documento: (id) => llamar(destino, 'GET', DOCS + id),
    cambiar: (id, requests) => llamar(destino, 'POST', DOCS + id + ':batchUpdate', { requests: requests }),
    celdas: (libro, rango) => llamar(destino, 'GET', SHEETS + libro + '/values/' + encodeURIComponent(rango) + '?valueRenderOption=FORMATTED_VALUE')
      .then((r) => r.values || []),
  };
}

module.exports = { cliente, RAIZ };
