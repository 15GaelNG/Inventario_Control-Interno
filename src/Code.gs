/**
 * Code.gs
 * Punto de entrada de la web app. Sirve el shell (Index.html); la navegación
 * entre módulos ocurre del lado del cliente (SPA), no con más doGet.
 */

function doGet(e) {
  // ?revisar=entorno: lo que tools/subir/subir.js revisa antes de desplegar (solo para quien desplegó)
  if (e && e.parameter && e.parameter.revisar === 'entorno') {
    return ContentService.createTextOutput(JSON.stringify(revisionEntorno_())).setMimeType(ContentService.MimeType.JSON);
  }
  // ?firmar=1&tipo=...&token=...: liga de firma a distancia (Responsiva/Adherente Vehicular,
  // Arqueos). Página aparte, nunca la SPA completa -- quien la abre puede no tener usuario en el
  // sistema, así que no pasa por el login ni por el resto de la app (ver ClientApi.apiFirmaRemota*).
  if (e && e.parameter && e.parameter.firmar) {
    const t = HtmlService.createTemplateFromFile('html/FirmaExterna');
    t.tipo = (e.parameter.tipo === 'adherente' || e.parameter.tipo === 'arqueo') ? e.parameter.tipo : 'responsiva';
    // 'jefe'/'principal' (Vehicular) o 'asistente'/'responsable' (Arqueos) -- cada servicio
    // valida su propio token por columna, así que un valor que no reconozca simplemente no
    // encuentra nada ("liga no válida"), sin necesidad de una lista fija aquí.
    t.quien = String(e.parameter.quien || '');
    t.token = e.parameter.token || '';
    return t.evaluate()
      .setTitle('Firmar documento — Control Interno')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return Router.renderShell(e);
}

/**
 * Helper estándar para incluir parciales HTML (styles.html, views/*.html, js/*.html).
 *
 * Usa createHtmlOutputFromFile (NO createTemplateFromFile().evaluate()) a
 * propósito: ninguno de estos parciales usa scriptlets <?!= ?> propios
 * (solo Index.html los usa, para llamar a include() — ver Router.gs), así
 * que no hace falta evaluarlos como template.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Candado de las funciones que se corren desde el editor (migración, configuración,
 * diagnósticos). En Apps Script CUALQUIER función de nivel superior que no termine en "_"
 * se puede llamar desde el navegador con google.script.run, y la web app corre con los
 * permisos de quien la desplegó (USER_DEPLOYING): sin esto, cualquier persona del dominio
 * podría, desde la consola, revertir la migración o borrar pestañas.
 *
 * Deja pasar al editor y a quien desplegó la app (quien corre = dueño del script). A cualquier
 * otra persona que llegue desde la web app, la detiene.
 *
 * Sin usuario activo (23-oct): así llega un activador de tiempo, pero también alguien de FUERA
 * del dominio (Google no le dice a la app quién es) cuando la web app está abierta a cualquier
 * cuenta de Google (access ANYONE, para POST VENTA de gph). Antes pasaba todo lo que llegaba sin
 * correo; ahora solo el activador de verdad: su evento (e) trae el triggerUid de un activador del
 * proyecto, que desde la consola no se puede inventar. Por eso cada función que corre un
 * activador de tiempo recibe (e) y llama soloEditor_(e).
 *
 * Lo que esa misma ejecución llame después (otra función con candado, sin el evento) ya pasa.
 */
let soloEditorConfirmado_ = false;
function soloEditor_(e) {
  if (soloEditorConfirmado_) return;
  const activo = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  const efectivo = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (activo) {
    if (efectivo && activo !== efectivo) throw new Error('Esta función solo se corre desde el editor de Apps Script.');
  } else {
    const uid = e && e.triggerUid ? String(e.triggerUid) : '';
    if (!uid || !ScriptApp.getProjectTriggers().some((t) => String(t.getUniqueId()) === uid)) {
      throw new Error('Esta función solo se corre desde el editor de Apps Script o un activador.');
    }
  }
  soloEditorConfirmado_ = true;
}
