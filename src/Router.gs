/**
 * Router.gs
 * Renderiza el shell principal. El shell carga las "vistas" (src/html/views/*.html)
 * dinámicamente en el cliente con fetch a funciones google.script.run, no con
 * doGet por módulo, para mantener la app como una sola página (SPA).
 */

const Router = (function () {
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
