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
 *
 * Usa createHtmlOutputFromFile (NO createTemplateFromFile().evaluate()) a
 * propósito: ninguno de estos parciales usa scriptlets <?!= ?> propios
 * (solo Index.html los usa, para llamar a include() — ver Router.gs), así
 * que no hace falta evaluarlos como template.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
