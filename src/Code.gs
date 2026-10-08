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
  // ?firmar=1&tipo=...&token=...: liga de firma a distancia (Responsiva/Adherente Vehicular).
  // Página aparte, nunca la SPA completa -- quien la abre puede no tener usuario en el sistema,
  // así que no pasa por el login ni por el resto de la app (ver ClientApi.apiFirmaRemota*).
  if (e && e.parameter && e.parameter.firmar) {
    const t = HtmlService.createTemplateFromFile('html/FirmaExterna');
    t.tipo = e.parameter.tipo === 'adherente' ? 'adherente' : 'responsiva';
    t.quien = e.parameter.quien === 'jefe' ? 'jefe' : 'principal';
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
 * Deja pasar al editor y a los activadores (quien corre = dueño del script) y a quien
 * desplegó la app. A cualquier otra persona que llegue desde la web app, la detiene.
 */
function soloEditor_() {
  const activo = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  const efectivo = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (activo && efectivo && activo !== efectivo) {
    throw new Error('Esta función solo se corre desde el editor de Apps Script.');
  }
}
