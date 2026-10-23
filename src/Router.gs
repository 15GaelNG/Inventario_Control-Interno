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
  function renderShell() {
    const template = HtmlService.createTemplateFromFile('html/Index');
    template.apagados = JSON.stringify(Config.apagados());
    template.temporada = TemporadaService.actual();
    // El enlace de "¿Olvidaste tu contraseña?" (?recuperar=<64 hex>, Recuperacion.gs): se lo da el servidor a la pantalla,
    // que así no depende de google.script.url.getLocation (en /dev no lo veía, 23-oct). Solo si tiene la forma exacta.
    const recuperar = String((e && e.parameter && e.parameter.recuperar) || '');
    template.recuperar = /^[0-9a-f]{64}$/.test(recuperar) ? recuperar : '';
    return template
      .evaluate()
      .setTitle('Control Interno — Ciudad Maderas')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return { renderShell };
})();
