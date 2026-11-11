/**
 * PruebasPdfHtml.gs — comparar un documento en HTML con sus PDF reales (10-nov-2026; docs/pdf-motor.md).
 *
 * Lo pide tools/pdf/html/pedir.js en el /dev de un DEV (como ?revisar=plantillas: corre con la cuenta de quien sube y
 * solo la deja pasar a ella). En producción no corre: ahí se prueba desde el editor con pdfHtmlProbarAqui (abajo).
 *   ?revisar=pdfhtml&documento=<doc>&carpeta=<id>[&caso=r01][&html=1]
 *       en la carpeta está casos.json (datos y firmas de registros reales, que deja tools/pdf/html/bajar.py: nada de eso
 *       va en el repo). Por cada caso arma el PDF por el mismo camino que la app (PdfHtml.pdf, con RECURSOS PDF de
 *       este proyecto) y lo deja en la carpeta como "HTML <caso>.pdf" (y el .html si se pide).
 *   ?revisar=pdfhtml&instalar=<id>
 *       copia a RECURSOS PDF de este proyecto las tipografías y logos de esa carpeta (PdfHtml.instalarRecursos).
 */
function pdfHtmlPrueba_(e) {
  const activo = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  const efectivo = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!activo || activo !== efectivo) return { error: 'Solo para quien desplegó la app.' };
  if (Config.ENTORNO === 'PROD') return { error: 'Solo en un DEV.' };
  const p = (e && e.parameter) || {};
  const id = (x) => /^[\w-]{20,}$/.test(x || '');
  if (id(p.instalar)) return { instalados: PdfHtml.instalarRecursos(p.instalar) };
  if (!id(p.carpeta)) return { error: 'Falta ?carpeta=<id de la carpeta con casos.json>' };
  if (!/^[\w-]+$/.test(p.documento || '')) return { error: 'Falta ?documento=<nombre de src/html/pdf>' };

  const carpeta = DriveApp.getFolderById(p.carpeta);
  const archivos = carpeta.getFilesByName('casos.json');
  if (!archivos.hasNext()) return { error: 'La carpeta no tiene casos.json' };
  const paquete = JSON.parse(archivos.next().getBlob().getDataAsString());
  const adaptar = pdfHtmlAdaptador_(p.documento);
  const salida = [];
  paquete.casos.filter((c) => !p.caso || c.nombre === p.caso).forEach((c) => {
    const t0 = Date.now();
    const hecho = PdfHtml.pdf(p.documento, adaptar(c.datos, c), c.firmas);
    const bytes = hecho.blob.getBytes();   // aquí es donde de verdad convierte
    const t1 = Date.now();
    const nombre = 'HTML ' + c.nombre + '.pdf';
    const viejos = carpeta.getFilesByName(nombre);
    while (viejos.hasNext()) DriveUtils.aPapelera(viejos.next(), { temporal: true });
    const archivo = DriveUtils.crearArchivo(carpeta, Utilities.newBlob(bytes, 'application/pdf'), nombre, { temporal: true });
    if (p.html) {
      const html = PdfHtml.llenar(PdfHtml.plantilla(p.documento), adaptar(c.datos, c), c.firmas, PdfHtml.recursos());
      const viejosHtml = carpeta.getFilesByName(c.nombre + '.html');
      while (viejosHtml.hasNext()) DriveUtils.aPapelera(viejosHtml.next(), { temporal: true });
      DriveUtils.crearArchivo(carpeta, Utilities.newBlob(html, 'text/html'), c.nombre + '.html', { temporal: true });
    }
    salida.push({ caso: c.nombre, id: archivo.getId(), pdfMs: t1 - t0, sinResolver: hecho.sinResolver });
  });
  return { casos: salida };
}

/**
 * Lo que el servicio del documento hace con el renglón de casos.json antes de llenarlo (por omisión, las fechas como
 * texto). Líneas lee la hoja con las abreviaturas de CH completas («QRO» → «QUERETARO») y las fechas como Date.
 */
function pdfHtmlAdaptador_(documento) {
  const fecha = (v) => {
    const f = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2}))?/.exec(typeof v === 'string' ? v : '');
    return f ? new Date(+f[3], +f[2] - 1, +f[1], +(f[4] || 0), +(f[5] || 0)) : v;
  };
  const comoLineas = (d) => Object.keys(d).reduce((o, k) => { o[k] = fecha(LineasUtil.mostrarCH(k, d[k])); return o; }, {});
  const ADAPTADORES = {
    arqueo: (d) => ArqueosService.datosHtml(d),
    'responsiva-celular': (d) => LineasCaptura.datosHtml(comoLineas(d)),
    'inspeccion-celular': (d) => LineasCaptura.datosInspeccionHtml(comoLineas(d)),
    'inspeccion-celular-checklist': (d) => LineasCaptura.datosInspeccionHtml(comoLineas(d)),
    // La inspección vehicular: el formato de su tipo y las fechas como Date (con segundos), como las lee la app
    'inspeccion-vehicular': (d, c) => InspeccionHtml.datos(PdfService.datosParaPlantilla_(Object.keys(d).reduce((o, k) => {
      const f = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(typeof d[k] === 'string' ? d[k].trim() : '');
      o[k] = f ? new Date(+f[3], +f[2] - 1, +f[1], +(f[4] || 0), +(f[5] || 0), +(f[6] || 0)) : d[k];
      return o;
    }, {})), c.tipo),
  };
  return ADAPTADORES[documento] || PdfService.datosParaPlantilla_;
}

/**
 * Desde el editor de PRODUCCIÓN (o de un DEV), antes de encender un documento ahí (prod: true en PdfHtml.DOCUMENTOS):
 * arma con el convertidor y RECURSOS PDF de ESTE proyecto los documentos en HTML de casos reales y los deja en
 * «PRUEBA PDF HTML/PRODUCCION» (o el entorno que sea) para revisarlos. Los casos son los casos.json de
 * «PRUEBA PDF HTML/<documento>» (registros de prod con sus firmas, los deja tools/pdf/html/bajar.py).
 * NO lee ni escribe hojas, expedientes ni la raíz del proyecto, y funciona aunque el documento siga apagado.
 *   pdfHtmlProbarAqui('<id de PRUEBA PDF HTML>')             uno de cada documento (la inspección vehicular: carro y moto)
 *   pdfHtmlProbarAqui('<id de PRUEBA PDF HTML>', 'arqueo')   todos los casos de ese documento
 */
function pdfHtmlProbarAqui(carpetaId, documento) {
  soloEditor_();
  if (typeof carpetaId !== 'string' || !/^[\w-]{20,}$/.test(carpetaId)) {
    throw new Error('Pásale el ID de la carpeta «PRUEBA PDF HTML»: pdfHtmlProbarAqui(\'<id>\')');
  }
  // Los mismos casos de la carpeta ANTES Y DESPUÉS
  const UNO_DE_CADA = {
    'responsiva-vehicular': ['r01'], 'adherente-vehicular': ['r01'], 'inspeccion-vehicular': ['r12', 'r03'],
    'responsiva-celular': ['r01'], 'inspeccion-celular': ['r01'], 'inspeccion-celular-checklist': ['r01'], arqueo: ['r01'],
  };
  const documentos = documento ? [documento] : Object.keys(UNO_DE_CADA);
  documentos.forEach((d) => { if (!PdfHtml.DOCUMENTOS[d]) throw new Error('No es un documento en HTML: ' + d); });
  const raiz = DriveApp.getFolderById(carpetaId);
  const destino = DriveUtils.subcarpeta(raiz, String(Config.ENTORNO || 'SIN ENTORNO').toUpperCase());
  const inicio = Date.now();
  const hechos = [];
  for (const doc of documentos) {
    const carpetas = raiz.getFoldersByName(doc);
    const casosJson = carpetas.hasNext() ? carpetas.next().getFilesByName('casos.json') : null;
    if (!casosJson || !casosJson.hasNext()) { console.log(doc + ': no encontré «' + doc + '/casos.json»'); continue; }
    const casos = JSON.parse(casosJson.next().getBlob().getDataAsString()).casos
      .filter((c) => documento || UNO_DE_CADA[doc].indexOf(c.nombre) !== -1);
    const adaptar = pdfHtmlAdaptador_(doc);
    for (const c of casos) {
      // Apps Script corta a los 6 min: se para antes y dice hasta dónde llegó
      if (Date.now() - inicio > 4.5 * 60 * 1000) {
        console.log('Me detuve por tiempo antes de ' + doc + ' ' + c.nombre + '; vuelve a correrlo con ese documento.');
        return hechos;
      }
      const t0 = Date.now();
      try {
        const hecho = PdfHtml.pdf(doc, adaptar(c.datos, c), c.firmas);
        const bytes = hecho.blob.getBytes();   // aquí es donde de verdad convierte
        const ms = Date.now() - t0;
        const nombre = doc + ' ' + c.nombre + '.pdf';
        const viejos = destino.getFilesByName(nombre);
        while (viejos.hasNext()) DriveUtils.aPapelera(viejos.next(), { temporal: true });
        DriveUtils.crearArchivo(destino, Utilities.newBlob(bytes, 'application/pdf'), nombre, { temporal: true });
        hechos.push({ documento: doc, caso: c.nombre, ms: ms, sinResolver: hecho.sinResolver });
        console.log('✓ ' + nombre + ' en ' + (ms / 1000).toFixed(1) + ' s' +
          (hecho.sinResolver.length ? ' · sin dato: ' + hecho.sinResolver.join(', ') : ''));
      } catch (e) {
        hechos.push({ documento: doc, caso: c.nombre, error: String(e && e.message || e) });
        console.log('✘ ' + doc + ' ' + c.nombre + ': ' + (e && e.message || e));
      }
    }
  }
  console.log(hechos.filter((h) => !h.error).length + ' de ' + hechos.length + ' bien. Carpeta: ' + destino.getUrl());
  return hechos;
}
