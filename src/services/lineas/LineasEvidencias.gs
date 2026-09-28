/**
 * LineasEvidencias.gs
 * Fotos de las inspecciones (mejora del sistema nuevo: el AppSheet no tenía columna de fotos).
 *
 * Todo va en la carpeta de la app AppSheet (LineasArchivos.carpetaAppSheetId), junto a sus imágenes:
 *   INSPECCIONES LINEAS_Images/FOTOS <ID de la inspección>
 * Firmas, PDF y archivos de columnas File se guardan con las rutas del AppSheet (LineasArchivos.guardarComoAppSheet,
 * LineasCaptura.generarPdf). NUCOS de producción es de solo lectura.
 */

const LineasEvidencias = (function () {
  const CARPETA_FOTOS = 'INSPECCIONES LINEAS_Images';

  /** Crea una carpeta con nombre único (agrega " (2)", " (3)"… si ya existe). */
  function carpetaUnica_(padre, nombre) {
    let candidato = nombre;
    for (let n = 2; padre.getFoldersByName(candidato).hasNext(); n++) candidato = nombre + ' (' + n + ')';
    return padre.createFolder(candidato);
  }

  const claveSubida_ = (correo, id) => 'ln_subida_' + correo + '_' + id;
  const claveBorrador_ = (correo, id) => 'ln_borrador_' + correo + '_' + id;

  /**
   * Carpeta de fotos de una inspección nueva (se crea al subir la primera foto) y autoriza (1 h) al usuario a subir
   * archivos en ella. Las responsivas no llevan fotos: no se crea nada.
   */
  function prepararCarpetaEvidencia(tipo, idRegistro, correo) {
    if (tipo !== 'INSPECCION') return { carpetaId: null, fotosCarpetaId: null, ruta: '' };
    const id = /^[\w-]{4,40}$/.test(String(idRegistro || '')) ? String(idRegistro) : Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyyMMdd HHmmss');
    const carpeta = carpetaUnica_(LineasArchivos.carpetaDeApp(CARPETA_FOTOS), 'FOTOS ' + id);
    const cache = CacheService.getScriptCache();
    cache.put(claveSubida_(correo, carpeta.getId()), '1', 3600);
    cache.put(claveBorrador_(correo, carpeta.getId()), '1', 3600);
    return { carpetaId: carpeta.getId(), fotosCarpetaId: carpeta.getId(), ruta: CARPETA_FOTOS + '/' + carpeta.getName() };
  }

  /** Carpeta de fotos para una inspección ya guardada que no tenía (p. ej. del AppSheet). */
  function crearCarpetaFotos(idRegistro, correo) {
    const c = prepararCarpetaEvidencia('INSPECCION', idRegistro, correo);
    CacheService.getScriptCache().remove(claveBorrador_(correo, c.carpetaId)); // ya no es borrador: no se descarta
    return c;
  }

  /** Sube un archivo (base64) a una carpeta previamente autorizada para este usuario. */
  function subirArchivo(correo, carpetaId, nombre, mime, base64) {
    if (!CacheService.getScriptCache().get(claveSubida_(correo, carpetaId))) {
      throw new Error('Carpeta no autorizada para subir archivos (o la sesión de captura expiró: vuelve a empezar la inspección).');
    }
    if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(mime)) throw new Error('Tipo de archivo no permitido: ' + mime);
    const bytes = Utilities.base64Decode(base64);
    if (bytes.length > 15 * 1024 * 1024) throw new Error('El archivo supera 15 MB.');
    const archivo = DriveApp.getFolderById(carpetaId).createFile(Utilities.newBlob(bytes, mime, String(nombre).replace(/[\\/]/g, '_')));
    // Sin esto, el archivo solo lo puede ver la cuenta que despliega la app
    // (quien lo creó) — nadie más puede abrir el link, aunque sea válido.
    archivo.setSharing(DriveApp.Access.DOMAIN, DriveApp.Permission.VIEW);
    return { id: archivo.getId(), nombre: archivo.getName() };
  }

  /** Envía a la papelera una carpeta de borrador que el mismo usuario acaba de crear (nunca otra). */
  function cancelarCarpetaEvidencia(correo, carpetaId) {
    const cache = CacheService.getScriptCache();
    if (!carpetaId || !cache.get(claveBorrador_(correo, carpetaId))) return { ok: false };
    DriveApp.getFolderById(carpetaId).setTrashed(true);
    cache.remove(claveBorrador_(correo, carpetaId));
    cache.remove(claveSubida_(correo, carpetaId));
    return { ok: true };
  }

  /** Valida que los archivos (fotos) estén dentro de las carpetas autorizadas de la evidencia. */
  function validarArchivosEnCarpeta(ids, carpetaIds) {
    (ids || []).filter(Boolean).forEach((id) => {
      const padres = DriveApp.getFileById(id).getParents();
      let ok = false;
      while (padres.hasNext()) { if (carpetaIds.indexOf(padres.next().getId()) >= 0) { ok = true; break; } }
      if (!ok) throw new Error('El archivo ' + id + ' no pertenece a la carpeta de la evidencia.');
    });
  }

  /** Autoriza (1 h) al usuario a subir archivos en estas carpetas (solo si son de la carpeta de la app). */
  function autorizarSubida(correo, ids) {
    (ids || []).filter(Boolean).forEach(LineasArchivos.exigirEscribible);
    const cache = CacheService.getScriptCache();
    (ids || []).filter(Boolean).forEach((id) => cache.put(claveSubida_(correo, id), '1', 3600));
  }

  /** Fotos (imágenes que no son firma ni patrón) de una carpeta. */
  function contarImagenes(carpetaId) {
    const it = DriveApp.getFolderById(carpetaId).getFiles();
    let n = 0;
    while (it.hasNext()) {
      const f = it.next();
      if (/^image\//.test(f.getMimeType()) && !/^(FIRMA|PATRON)/i.test(f.getName())) n++;
    }
    return n;
  }

  return {
    CARPETA_FOTOS, prepararCarpetaEvidencia, crearCarpetaFotos, cancelarCarpetaEvidencia, subirArchivo,
    validarArchivosEnCarpeta, autorizarSubida, contarImagenes,
  };
})();
