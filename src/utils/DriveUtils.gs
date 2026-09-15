/**
 * DriveUtils.gs
 * Archivos (imágenes, comprobantes) compatibles con AppSheet.
 *
 * AppSheet no guarda URLs en la hoja, sino una RUTA RELATIVA a la carpeta de
 * la app, con este formato:
 *   <TABLA>_Images/<ID de la fila>.<NOMBRE COLUMNA>.<HHmmss>.<ext>
 *   ej. VERIFICACIONES_Images/a1b2c3d4.COMPROBANTE VERIFICACION.142530.png
 *
 * Guardamos igual para que las dos apps vean los mismos archivos mientras
 * convivan. Para mostrar un archivo, se busca por NOMBRE dentro de la(s)
 * carpeta(s) configuradas.
 */

const DriveUtils = (function () {
  const EXTENSIONES = { 'image/png': 'png', 'image/jpeg': 'jpg' };
  const MAX_BYTES = 10 * 1024 * 1024;

  /**
   * @param {Object} p
   * @param {string} p.carpetaId  carpeta de Drive destino (la *_Images)
   * @param {string} p.tabla      ej. 'VERIFICACIONES'
   * @param {string} p.idFila     clave de la fila
   * @param {string} p.columna    ej. 'COMPROBANTE VERIFICACION'
   * @param {{base64: string, mimeType: string}} p.archivo  base64 sin prefijo "data:..."
   * @return {{ruta: string, fileId: string}}
   */
  function guardarImagenAppSheet(p) {
    const ext = EXTENSIONES[p.archivo && p.archivo.mimeType];
    if (!ext) throw new Error('Solo se aceptan imágenes PNG o JPG');

    const bytes = Utilities.base64Decode(p.archivo.base64);
    if (bytes.length > MAX_BYTES) throw new Error('La imagen pesa más de 10 MB');

    const hora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HHmmss');
    const nombre = p.idFila + '.' + p.columna + '.' + hora + '.' + ext;
    let archivo;
    try {
      archivo = DriveApp.getFolderById(p.carpetaId)
        .createFile(Utilities.newBlob(bytes, p.archivo.mimeType, nombre));
    } catch (err) {
      // "Acceso denegado: DriveApp" casi siempre = la cuenta puede VER la carpeta pero no EDITARLA
      throw new Error(
        'No se pudo guardar la imagen en Drive (' + err.message + '). ' +
        'Verifica que tu cuenta (' + Session.getEffectiveUser().getEmail() + ') tenga permiso de ' +
        'EDITOR en la carpeta ' + p.tabla + '_Images (ID ' + p.carpetaId + ').'
      );
    }

    return { ruta: p.tabla + '_Images/' + nombre, fileId: archivo.getId() };
  }

  /** Archivo de Drive a partir de su ruta AppSheet, buscando en orden en las carpetas dadas (o null). */
  function archivoDeRuta(ruta, carpetasIds) {
    const nombre = String(ruta || '').split('/').pop();
    if (!nombre) return null;

    for (const id of carpetasIds.filter(Boolean)) {
      let archivos;
      try {
        archivos = DriveApp.getFolderById(id).getFilesByName(nombre);
      } catch (e) {
        continue; // sin acceso a esa carpeta: probar la siguiente
      }
      if (archivos.hasNext()) return archivos.next();
    }
    return null;
  }

  function urlDeRuta(ruta, carpetasIds) {
    const archivo = archivoDeRuta(ruta, carpetasIds);
    return archivo ? archivo.getUrl() : null;
  }

  /**
   * Imagen lista para <img src="data:…">: un link de Drive no se puede incrustar dentro
   * de la web app, así que se manda el contenido. Imágenes grandes → solo la URL.
   * @return {{url: string, mimeType: string, base64: string|null}|null}
   */
  function previsualizarRuta(ruta, carpetasIds) {
    const MAX_PREVIEW = 4 * 1024 * 1024;
    const archivo = archivoDeRuta(ruta, carpetasIds);
    if (!archivo) return null;
    const mimeType = archivo.getMimeType();
    const esImagen = /^image\//.test(mimeType);
    return {
      url: archivo.getUrl(),
      mimeType: mimeType,
      base64: esImagen && archivo.getSize() <= MAX_PREVIEW ? Utilities.base64Encode(archivo.getBlob().getBytes()) : null,
    };
  }

  function eliminar(fileId) {
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* no-op */ }
  }

  return { guardarImagenAppSheet, archivoDeRuta, urlDeRuta, previsualizarRuta, eliminar };
})();
