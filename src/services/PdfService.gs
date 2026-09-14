/**
 * PdfService.gs
 * Genera PDFs descargables a partir de un formulario + un dibujo hecho por el
 * usuario sobre un diagrama (marcas de daños en autos/celulares).
 *
 * Flujo:
 *   1. En el cliente, un <canvas> se dibuja encima de la imagen del diagrama
 *      (ver html/js/inspeccion.html). El usuario marca con el dedo/mouse.
 *   2. Al guardar, el cliente exporta el canvas como PNG (dataURL base64) y lo
 *      manda junto con los datos del formulario a generarReporteDanios().
 *   3. Aquí se combina esa imagen + los datos en una plantilla de Google Docs
 *      (con marcadores tipo {{CAMPO}}), se reemplazan los marcadores, se
 *      inserta la imagen anotada, y se exporta el Doc como PDF.
 *   4. El PDF se guarda en una carpeta de Drive y se regresa la URL de
 *      descarga al cliente.
 *
 * Requiere una plantilla de Google Docs por tipo de reporte (vehículo / celular)
 * con marcadores de texto tipo {{PLACA}}, {{RESPONSABLE}}, etc. y un marcador
 * {{DIAGRAMA}} donde se insertará la imagen anotada.
 */

const PdfService = (function () {
  const CARPETA_REPORTES_ID_PROP = 'DRIVE_FOLDER_ID_REPORTES';
  const PLANTILLA_DOC_ID_PROP_PREFIX = 'PLANTILLA_DOC_ID_'; // + 'VEHICULO' | 'CELULAR'

  function carpetaReportes_() {
    const id = PropertiesService.getScriptProperties().getProperty(CARPETA_REPORTES_ID_PROP);
    if (!id) throw new Error('Falta configurar ' + CARPETA_REPORTES_ID_PROP + ' en Script Properties');
    return DriveApp.getFolderById(id);
  }

  function plantilla_(tipo) {
    const id = PropertiesService.getScriptProperties().getProperty(PLANTILLA_DOC_ID_PROP_PREFIX + tipo);
    if (!id) throw new Error('Falta configurar la plantilla para tipo "' + tipo + '"');
    return id;
  }

  /**
   * @param {string} token           sesión del usuario
   * @param {"VEHICULO"|"CELULAR"} tipo
   * @param {Object} datosFormulario claves = marcadores {{CLAVE}} en la plantilla
   * @param {string} imagenBase64    dataURL del canvas (sin el prefijo "data:image/png;base64,")
   * @return {{url: string, fileId: string}}
   */
  function generarReporteDanios(token, tipo, datosFormulario, imagenBase64) {
    Auth.validarSesion(token);

    const plantillaId = plantilla_(tipo);
    const copia = DriveApp.getFileById(plantillaId).makeCopy(
      tipo + '_' + (datosFormulario.FOLIO || Utilities.getUuid()),
      carpetaReportes_()
    );

    const doc = DocumentApp.openById(copia.getId());
    const body = doc.getBody();

    Object.keys(datosFormulario).forEach((clave) => {
      body.replaceText('{{' + clave + '}}', String(datosFormulario[clave] || ''));
    });

    const marcadorImagen = body.findText('{{DIAGRAMA}}');
    if (marcadorImagen) {
      const elemento = marcadorImagen.getElement();
      const parrafo = elemento.getParent().asParagraph();
      parrafo.clear();
      const blob = Utilities.newBlob(
        Utilities.base64Decode(imagenBase64), 'image/png', 'diagrama.png'
      );
      parrafo.appendInlineImage(blob);
    }

    doc.saveAndClose();

    const pdfBlob = DriveApp.getFileById(copia.getId()).getAs('application/pdf');
    const pdfFile = carpetaReportes_().createFile(pdfBlob).setName(copia.getName() + '.pdf');

    // La copia del Doc ya no se necesita, solo el PDF final
    DriveApp.getFileById(copia.getId()).setTrashed(true);

    return { url: pdfFile.getUrl(), fileId: pdfFile.getId() };
  }

  return { generarReporteDanios };
})();
