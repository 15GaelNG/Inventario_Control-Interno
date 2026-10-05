/**
 * LineasEvidencias.gs
 * Fotos de las inspecciones (mejora del sistema nuevo: el AppSheet no tenía columna de fotos).
 *
 * Desde el corte a producción (2-oct-2026) van a NUCOS, en la carpeta de la inspección:
 *   <NUCO>/INSPECCIONES/<AÑO>/<N> CUATRIMESTRE/<MES>/INSP DD MM/FOTOS   (LineasArchivos.carpetaEvidenciaNuco)
 * Un registro sin NUCO las guarda en la carpeta de la app: INSPECCIONES LINEAS_Images/FOTOS <ID de la inspección>.
 * El PDF se guarda en la misma carpeta de la inspección (LineasCaptura.generarPdf).
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
  const claveNuco_ = (id) => 'ln_carpeta_nuco_' + id; // carpeta de NUCOS → su NUCO (evita subir por los padres en cada foto)

  /**
   * Carpeta de fotos de una inspección nueva (se crea al subir la primera foto) y autoriza (1 h) al usuario a subir
   * archivos en ella. Con NUCO: "INSP DD MM" en NUCOS (carpetaId) y su FOTOS (fotosCarpetaId), del día `fecha`.
   * Las responsivas no llevan fotos: no se crea nada (su carpeta en NUCOS la crea el PDF).
   */
  function prepararCarpetaEvidencia(tipo, idRegistro, correo, nuco, fecha) {
    if (tipo !== 'INSPECCION') return { carpetaId: null, fotosCarpetaId: null, ruta: '' };
    let c;
    if (LineasUtil.nuco4(nuco)) {
      c = LineasArchivos.carpetaEvidenciaNuco('INSPECCION', nuco, fecha || new Date());
    } else {
      const id = /^[\w-]{4,40}$/.test(String(idRegistro || '')) ? String(idRegistro) : Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyyMMdd HHmmss');
      const carpeta = carpetaUnica_(LineasArchivos.carpetaDeApp(CARPETA_FOTOS), 'FOTOS ' + id);
      c = { carpetaId: carpeta.getId(), fotosCarpetaId: carpeta.getId(), ruta: CARPETA_FOTOS + '/' + carpeta.getName() };
    }
    const cache = CacheService.getScriptCache();
    [c.carpetaId, c.fotosCarpetaId].forEach((id) => {
      cache.put(claveSubida_(correo, id), '1', 3600);
      if (LineasUtil.nuco4(nuco)) cache.put(claveNuco_(id), LineasUtil.nuco4(nuco), 3600);
    });
    cache.put(claveBorrador_(correo, c.carpetaId), '1', 3600);
    return { carpetaId: c.carpetaId, fotosCarpetaId: c.fotosCarpetaId, ruta: c.ruta };
  }

  /** Carpeta de fotos para una inspección ya guardada que no tenía (p. ej. del AppSheet), en NUCOS si tiene NUCO. */
  function crearCarpetaFotos(idRegistro, correo, nuco, fecha) {
    const c = prepararCarpetaEvidencia('INSPECCION', idRegistro, correo, nuco, fecha);
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
    // En NUCOS no: ahí cada archivo toma los permisos de la carpeta, como los que sube el área.
    const nuco = CacheService.getScriptCache().get(claveNuco_(carpetaId)) || (LineasArchivos.enNucos(carpetaId) ? nucoDeCarpeta_(carpetaId) : null);
    if (nuco) LineasArchivos.olvidarNuco(nuco);
    else archivo.setSharing(DriveApp.Access.DOMAIN, DriveApp.Permission.VIEW);
    return { id: archivo.getId(), nombre: archivo.getName() };
  }

  /** Envía a la papelera una carpeta de borrador que el mismo usuario acaba de crear (nunca otra). */
  function cancelarCarpetaEvidencia(correo, carpetaId) {
    const cache = CacheService.getScriptCache();
    if (!carpetaId || !cache.get(claveBorrador_(correo, carpetaId))) return { ok: false };
    LineasArchivos.descartarCarpeta(carpetaId);
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

  /** Autoriza (1 h) al usuario a subir archivos en estas carpetas (solo si son de la carpeta de la app o de NUCOS). */
  function autorizarSubida(correo, ids) {
    (ids || []).filter(Boolean).forEach(LineasArchivos.exigirEscribible);
    const cache = CacheService.getScriptCache();
    (ids || []).filter(Boolean).forEach((id) => cache.put(claveSubida_(correo, id), '1', 3600));
  }

  /** NUCO ("0599") de una carpeta dentro de NUCOS, o null. */
  function nucoDeCarpeta_(carpetaId) {
    const raiz = LineasArchivos.carpetaNucosId();
    let c = DriveApp.getFolderById(carpetaId);
    for (let n = 0; c && n < 10; n++) {
      const padres = c.getParents();
      const padre = padres.hasNext() ? padres.next() : null;
      if (padre && padre.getId() === raiz) return LineasUtil.nuco4(c.getName());
      c = padre;
    }
    return null;
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
