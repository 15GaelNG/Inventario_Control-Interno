/**
 * pagina-servida.js — baja la página COMO LA ENTREGA Apps Script (la versión de prueba /dev,
 * que es el código recién subido) y revisa que cada <script> haya llegado completo y válido.
 *
 * Por qué: Apps Script procesa el HTML antes de mandarlo (corta lo que sigue a "//" y borra
 * entre "/*" y "*\/", aunque esté en un string). La vista previa local no hace eso, así que
 * no lo puede ver: el 6-oct la vista previa salió bien y la página real quedó en blanco.
 *
 * Usa las credenciales de clasp (~/.clasprc.json): con ellas se pide un token y se abre la
 * página igual que tu navegador. Solo lee.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

async function token_() {
  const t = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.clasprc.json'), 'utf8')).tokens.default;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: t.client_id, client_secret: t.client_secret, refresh_token: t.refresh_token, grant_type: 'refresh_token' }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('No se pudo pedir el token con ~/.clasprc.json: ' + JSON.stringify(j));
  return j.access_token;
}

/** El HTML que la app escribe en el navegador (va dentro de goog.script.init("…")) */
function htmlDeUsuario_(pagina) {
  const marca = 'goog.script.init("';
  const ini = pagina.indexOf(marca);
  if (ini < 0) throw new Error('La página no trae goog.script.init (¿error del servidor?): ' + pagina.slice(0, 300));
  let fin = ini + marca.length;
  while (!(pagina[fin] === '"' && pagina[fin - 1] !== '\\')) fin++;
  // Es un string de JS con escapes \xNN: pasados a \u00NN es JSON válido (sin evaluar nada)
  const literal = pagina.slice(ini + marca.length, fin).replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1');
  return JSON.parse(JSON.parse('"' + literal + '"')).userHtml;
}

/**
 * @param {string} idDespliegueHead  el despliegue @HEAD del proyecto (clasp list-deployments)
 * @param {string} dominio           p. ej. 'ciudadmaderas.com'
 * @param {string[]} bloquesSubidos  el JS de cada <script> comprimido que se subió
 * @return {{scripts: number}}  truena si algo llegó roto o cortado
 */
/**
 * /dev corre con la cuenta de quien lo abre (la de ~/.clasprc.json), no con la del dueño: si esa
 * cuenta nunca aceptó los permisos de ESE proyecto (o el manifiesto pidió uno nuevo), Google
 * contesta 200 con la página "Authorization needed" en vez de la app. Por script no se puede
 * aceptar: se corre una vez revisarEntorno() en el editor del proyecto con esa cuenta.
 */
function exigirAutorizado_(texto, url) {
  if (!/Authorization needed|Se necesita autorizaci|requires? (your )?authorization/i.test(texto)) return;
  throw new Error('Tu cuenta de clasp no ha aceptado los permisos de este proyecto (Google contestó "Authorization needed").\n' +
    '  Arréglalo una vez: abre el editor de Apps Script de ESE proyecto con la misma cuenta con la que hiciste\n' +
    '  "clasp login", elige revisarEntorno (Diagnostico.gs), dale Ejecutar y acepta todos los permisos.\n' +
    '  Luego vuelve a correr el mismo comando. (' + url + ')');
}

async function revisar(idDespliegueHead, dominio, bloquesSubidos) {
  const url = 'https://script.google.com/a/macros/' + dominio + '/s/' + idDespliegueHead + '/dev';
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + (await token_()) } });
  if (r.status !== 200) throw new Error('La página respondió ' + r.status + ' (' + url + ')');
  const texto = await r.text();
  exigirAutorizado_(texto, url);
  const html = htmlDeUsuario_(texto);

  const rotos = [];
  let scripts = 0;
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    scripts++;
    try { new Function(m[1]); } catch (e) { rotos.push('#' + scripts + ' (' + e.message + '): ' + m[1].slice(0, 80)); }
  }
  // Cada bloque comprimido debe llegar tal cual: si Apps Script le quitó algo, no está entero
  const cortados = bloquesSubidos.filter((b) => !html.includes(b)).map((b) => b.slice(0, 80));
  if (rotos.length || cortados.length) {
    throw new Error('La página que entrega Apps Script llegó rota:\n  ' +
      rotos.concat(cortados.map((c) => 'cortado: ' + c)).join('\n  '));
  }
  return { scripts: scripts };
}

module.exports = { revisar, htmlDeUsuario_, token_, exigirAutorizado_ };
