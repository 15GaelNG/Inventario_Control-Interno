/**
 * PruebasPdfHtml.gs — el experimento del documento en HTML (10-nov-2026): ¿el convertidor de Apps Script deja una
 * responsiva vehicular igual a la que hoy sale del Google Doc?
 *
 * Lo pide tools en el /dev de un DEV (?revisar=pdfhtml&carpeta=<id>, como ?revisar=plantillas: corre con la cuenta de
 * quien sube y solo la deja pasar a ella). En esa carpeta de Drive está casos.json, con los datos de unas responsivas
 * reales, sus firmas, el logo y la tipografía (nada de eso va en el repo: es público). Por cada caso llena
 * src/html/pdf/responsiva-vehicular.html con PdfHtml, lo convierte a PDF y lo deja en la misma carpeta ("HTML <caso>.pdf").
 * En producción no corre.
 */
function pdfHtmlPrueba_(e) {
  const activo = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  const efectivo = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!activo || activo !== efectivo) return { error: 'Solo para quien desplegó la app.' };
  if (Config.ENTORNO === 'PROD') return { error: 'Solo en un DEV.' };
  const p = (e && e.parameter) || {};
  if (!/^[\w-]{20,}$/.test(p.carpeta || '')) return { error: 'Falta ?carpeta=<id de la carpeta con casos.json>' };

  const carpeta = DriveApp.getFolderById(p.carpeta);
  if (p.documento === 'prueba-fuentes') return pruebaFuentesPdf_(carpeta);
  if (p.documento === 'prueba-escala') return pruebaEscalaPdf_(carpeta);
  const archivos = carpeta.getFilesByName('casos.json');
  if (!archivos.hasNext()) return { error: 'La carpeta no tiene casos.json' };
  const paquete = JSON.parse(archivos.next().getBlob().getDataAsString());
  const documento = /^[\w-]+$/.test(p.documento || '') ? p.documento : 'responsiva-vehicular';
  const plantilla = HtmlService.createHtmlOutputFromFile('html/pdf/' + documento).getContent();

  const salida = [];
  paquete.casos.filter((c) => !p.caso || c.nombre === p.caso).forEach((c) => {
    const t0 = Date.now();
    const html = PdfHtml.llenar(plantilla, c.datos, c.firmas, paquete.recursos);
    const t1 = Date.now();
    const nombre = 'HTML ' + c.nombre + '.pdf';
    const pdf = Utilities.newBlob(html, 'text/html', c.nombre + '.html').getAs('application/pdf').setName(nombre);
    const t2 = Date.now();
    const viejos = carpeta.getFilesByName(nombre);
    while (viejos.hasNext()) DriveUtils.aPapelera(viejos.next(), { temporal: true });
    const archivo = DriveUtils.crearArchivo(carpeta, pdf, nombre, { temporal: true });
    if (p.html) {
      const viejosHtml = carpeta.getFilesByName(c.nombre + '.html');
      while (viejosHtml.hasNext()) DriveUtils.aPapelera(viejosHtml.next(), { temporal: true });
      DriveUtils.crearArchivo(carpeta, Utilities.newBlob(html, 'text/html'), c.nombre + '.html', { temporal: true });
    }
    salida.push({ caso: c.nombre, id: archivo.getId(), llenarMs: t1 - t0, pdfMs: t2 - t1, guardarMs: Date.now() - t2 });
  });
  return { casos: salida };
}

/**
 * ¿Cómo acepta el convertidor una tipografía? Un renglón por manera de cargarla (incrustada en ttf / woff / woff2, con y
 * sin format(), por URL y por nombre instalado); el PDF dice cuáles se usaron. fuentes.json: { ttf, woff, woff2 } en base64.
 */
function pruebaFuentesPdf_(carpeta) {
  const f = JSON.parse(carpeta.getFilesByName('fuentes.json').next().getBlob().getDataAsString());
  const variantes = [
    ['TtfFmt', 'url(data:font/ttf;base64,' + f.ttf + ') format("truetype")'],
    ['TtfXFont', 'url(data:application/x-font-ttf;base64,' + f.ttf + ')'],
    ['TtfOctet', 'url("data:application/octet-stream;base64,' + f.ttf + '")'],
    ['Woff', 'url(data:font/woff;base64,' + f.woff + ') format("woff")'],
    ['WoffApp', 'url(data:application/font-woff;base64,' + f.woff + ') format("woff")'],
    ['Woff2', 'url(data:font/woff2;base64,' + f.woff2 + ') format("woff2")'],
    ['UrlGoogle', 'url(https:' + '/' + '/fonts.gstatic.com/s/questrial/v18/QdVUSTchPBm7nuUeVf70viFl.ttf) format("truetype")'],
  ];
  const css = variantes.map((v) => '@font-face{font-family:"' + v[0] + '";src:' + v[1] + '}').join('\n');
  const nombres = ['Century Gothic', 'CenturyGothic', 'Questrial', 'Didact Gothic', 'Poppins', 'Montserrat', 'Roboto', 'Open Sans', 'Lato'];
  const renglones = variantes.map((v) => v[0]).concat(nombres).map((n) =>
    '<p style="font-family:\'' + n + '\', \'Courier New\';font-size:14pt;margin:4pt 0">' + n + ': Querétaro CARTA RESPONSIVA 0123456789</p>').join('');
  const html = '<html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' + renglones + '</body></html>';
  const nombre = 'HTML prueba-fuentes.pdf';
  const viejos = carpeta.getFilesByName(nombre);
  while (viejos.hasNext()) DriveUtils.aPapelera(viejos.next(), { temporal: true });
  const pdf = Utilities.newBlob(html, 'text/html', 'f.html').getAs('application/pdf');
  const archivo = DriveUtils.crearArchivo(carpeta, pdf, nombre, { temporal: true });
  return { casos: [{ caso: 'prueba-fuentes', id: archivo.getId() }] };
}

/** ¿El convertidor acepta transform / zoom? El mismo renglón de 7 pt normal, maquetado a 4× y encogido de tres formas */
function pruebaEscalaPdf_(carpeta) {
  const f = JSON.parse(carpeta.getFilesByName('fuentes.json').next().getBlob().getDataAsString());
  const css = '@font-face{font-family:"CG";src:url(data:font/ttf;base64,' + f.ttf + ') format("truetype")}' +
    'body{margin:0;font-family:"CG"} .c{position:absolute;left:50pt;white-space:nowrap}';
  const t = 'Solicitaré en tiempo y forma la gestión de la verificación de la unidad de acuerdo a las fechas que corresponda así como';
  const html = '<html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' +
    '<div class="c" style="top:40pt;font-size:7pt">' + t + '</div>' +
    '<div class="c" style="top:80pt;font-size:28pt;-webkit-transform:scale(0.25);transform:scale(0.25);-webkit-transform-origin:0 0;transform-origin:0 0">' + t + '</div>' +
    '<div class="c" style="top:120pt;font-size:28pt;zoom:0.25">' + t + '</div>' +
    '<div class="c" style="top:160pt;font-size:7pt;text-rendering:geometricPrecision">' + t + '</div>' +
    '</body></html>';
  const nombre = 'HTML prueba-escala.pdf';
  const viejos = carpeta.getFilesByName(nombre);
  while (viejos.hasNext()) DriveUtils.aPapelera(viejos.next(), { temporal: true });
  const archivo = DriveUtils.crearArchivo(carpeta, Utilities.newBlob(html, 'text/html', 'e.html').getAs('application/pdf'), nombre, { temporal: true });
  return { casos: [{ caso: 'prueba-escala', id: archivo.getId() }] };
}
