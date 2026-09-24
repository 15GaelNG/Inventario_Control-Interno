/**
 * Router.gs
 * Renderiza el shell principal. El shell carga las "vistas" (src/html/views/*.html)
 * dinámicamente en el cliente con fetch a funciones google.script.run, no con
 * doGet por módulo, para mantener la app como una sola página (SPA).
 */

const Router = (function () {
  // Index.html SÍ se evalúa como template (createTemplateFromFile().evaluate())
  // a propósito — es el único archivo que necesita procesar scriptlets
  // <?!= include(...) ?> de verdad; los demás .html (styles, views, js) NO
  // los necesitan y los sirve include() sin evaluate() (ver Code.gs).
  //
  // (Ojo: NO se puede reemplazar este evaluate() por un regex manual sobre
  // HtmlService.createHtmlOutputFromFile('html/Index').getContent() — esa
  // función escapa cualquier cosa que parezca un scriptlet, "<?...?>" sale
  // como "&lt;?...?&gt;", así que un reemplazo así nunca encuentra nada.)
  function renderShell(e) {
    const template = HtmlService.createTemplateFromFile('html/Index');
    return template
      .evaluate()
      .setTitle('Control Interno — Ciudad Maderas')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return { renderShell };
})();
