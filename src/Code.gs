/**
 * Code.gs
 * Punto de entrada de la web app. Sirve el shell (Index.html); la navegación
 * entre módulos ocurre del lado del cliente (SPA), no con más doGet.
 */

function doGet(e) {
  return Router.renderShell(e);
}

/**
 * Helper estándar para incluir parciales HTML (styles.html, views/*.html, js/*.html).
 * Usa createTemplateFromFile (no createHtmlOutputFromFile) para que los parciales
 * incluidos puedan a su vez usar sus propios scriptlets <?!= ... ?> (ej. el logo
 * en base64 dentro de views/login.html) — si no, quedarían como texto literal
 * sin evaluar.
 */
function include(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}
