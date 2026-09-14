/**
 * Code.gs
 * Punto de entrada de la web app. Sirve el shell (Index.html); la navegación
 * entre módulos ocurre del lado del cliente (SPA), no con más doGet.
 */

function doGet(e) {
  return Router.renderShell(e);
}

/** Helper estándar para incluir parciales HTML (styles.html, views/*.html, js/*.html) */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
