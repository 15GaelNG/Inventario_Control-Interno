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
    template.apagados = JSON.stringify(Config.apagados());
    template.temporada = TemporadaService.actual();
    // El enlace de "¿Olvidaste tu contraseña?" (?recuperar=<64 hex>, Recuperacion.gs): se lo da el servidor a la pantalla,
    // que así no depende de google.script.url.getLocation (en /dev no lo veía, 23-oct). Solo si tiene la forma exacta.
    const recuperar = String((e && e.parameter && e.parameter.recuperar) || '');
    template.recuperar = /^[0-9a-f]{64}$/.test(recuperar) ? recuperar : '';
    // La marca de la cuenta de Google que abre (Marcas.gs, 4-nov): la entrada sale con su logo, sin parpadeo. Sin
    // cuenta detectada (de fuera del dominio) o sin usuario, las dos
    let marca = Marcas.AMBAS;
    try { marca = Marcas.paraLogin(Session.getActiveUser().getEmail()); } catch (e) { /* las dos */ }
    template.marca = marca;
    template.marcas = JSON.stringify(Marcas.LISTA);
    let modulos = {};
    try { modulos = Marcas.mapa(); } catch (e) { /* la pantalla usa FT; apiMisPermisos lo corrige */ }
    template.marcasModulos = JSON.stringify(modulos);
    // El ícono de la pestaña: el logo de su marca si tiene; si no, el de siempre
    template.marcaIcono = (Marcas.LISTA[marca] && Marcas.LISTA[marca].logo) || Marcas.LISTA.CI.logo;
    return template
      .evaluate()
      .setTitle((marca === Marcas.AMBAS ? Marcas.LISTA.CI.nombre + ' · ' + Marcas.LISTA.FT.nombre : Marcas.nombreDe(marca)) + ' — Ciudad Maderas')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return { renderShell };
})();
