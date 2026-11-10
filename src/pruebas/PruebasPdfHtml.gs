/**
 * PruebasPdfHtml.gs — comparar un documento en HTML con sus PDF reales (10-nov-2026; docs/pdf-motor.md).
 *
 * Lo pide tools/pdf/html/pedir.js en el /dev de un DEV (como ?revisar=plantillas: corre con la cuenta de quien sube y
 * solo la deja pasar a ella). En producción no corre.
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

  // Lo que el servicio del documento hace con el renglón antes de llenarlo (por omisión, las fechas como texto)
  // (Líneas lee la hoja con las abreviaturas de CH completas, como LineasDatos: «QRO» → «QUERETARO»)
  const comoLineas = (d) => Object.keys(d).reduce((o, k) => { o[k] = LineasUtil.mostrarCH(k, d[k]); return o; }, {});
  const ADAPTADORES = {
    arqueo: (d) => ArqueosService.datosHtml(d),
    'responsiva-celular': (d) => LineasCaptura.datosHtml(comoLineas(d)),
  };
  const adaptar = ADAPTADORES[p.documento] || PdfService.datosParaPlantilla_;
  const salida = [];
  paquete.casos.filter((c) => !p.caso || c.nombre === p.caso).forEach((c) => {
    const t0 = Date.now();
    const hecho = PdfHtml.pdf(p.documento, adaptar(c.datos), c.firmas);
    const bytes = hecho.blob.getBytes();   // aquí es donde de verdad convierte
    const t1 = Date.now();
    const nombre = 'HTML ' + c.nombre + '.pdf';
    const viejos = carpeta.getFilesByName(nombre);
    while (viejos.hasNext()) DriveUtils.aPapelera(viejos.next(), { temporal: true });
    const archivo = DriveUtils.crearArchivo(carpeta, Utilities.newBlob(bytes, 'application/pdf'), nombre, { temporal: true });
    if (p.html) {
      const html = PdfHtml.llenar(PdfHtml.plantilla(p.documento), adaptar(c.datos), c.firmas, PdfHtml.recursos());
      const viejosHtml = carpeta.getFilesByName(c.nombre + '.html');
      while (viejosHtml.hasNext()) DriveUtils.aPapelera(viejosHtml.next(), { temporal: true });
      DriveUtils.crearArchivo(carpeta, Utilities.newBlob(html, 'text/html'), c.nombre + '.html', { temporal: true });
    }
    salida.push({ caso: c.nombre, id: archivo.getId(), pdfMs: t1 - t0, sinResolver: hecho.sinResolver });
  });
  return { casos: salida };
}
