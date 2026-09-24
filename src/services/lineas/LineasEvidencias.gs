/**
 * LineasEvidencias.gs
 * Carpetas y archivos de evidencia (fotos, firmas) en Drive para inspecciones y responsivas
 * capturadas desde el sistema (misma carpeta NUCOS que ya lee LineasUtil.carpetasNucos()).
 *
 * Estructura (igual a la de producción):
 *   <NUCO>/INSPECCIONES/<AÑO>/<N> CUATRIMESTRE/<MES>/INSP DD MM/FOTOS
 *   <NUCO>/CARTA RESPONSIVA/<AÑO>/RESP DD MM
 *
 * Script Property: LINEAS_DRIVE_CARPETA_RAIZ (misma que usa LineasUtil para el inventario de NUCOS).
 */

const LineasEvidencias = (function () {
  const MESES_MAYUS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const CUATRIMESTRES = ['1ER CUATRIMESTRE', '2DO CUATRIMESTRE', '3ER CUATRIMESTRE'];

  function carpetaRaiz_() {
    const raiz = PropertiesService.getScriptProperties().getProperty('LINEAS_DRIVE_CARPETA_RAIZ');
    if (!raiz) throw new Error('Falta configurar LINEAS_DRIVE_CARPETA_RAIZ (corre LineasAdmin.configurarLineasDev()).');
    return DriveApp.getFolderById(raiz);
  }

  function subcarpeta_(padre, nombre) {
    const it = padre.getFoldersByName(nombre);
    return it.hasNext() ? it.next() : padre.createFolder(nombre);
  }

  /** Crea una carpeta con nombre único (agrega " (2)", " (3)"… si ya existe). */
  function carpetaUnica_(padre, nombre) {
    let candidato = nombre;
    for (let n = 2; padre.getFoldersByName(candidato).hasNext(); n++) candidato = nombre + ' (' + n + ')';
    return padre.createFolder(candidato);
  }

  /** Carpeta del NUCO: reutiliza la que ya existe (inventario de NUCOS) o crea una nueva por nombre. */
  function carpetaNuco_(nuco) {
    const raiz = carpetaRaiz_();
    const nuco4 = nuco ? LineasUtil.nuco4(nuco) : null;
    const id = nuco4 && LineasUtil.carpetasNucos()[nuco4];
    if (id) {
      try { return DriveApp.getFolderById(id); } catch (e) { /* la carpeta del inventario ya no existe: se crea una nueva abajo */ }
    }
    return subcarpeta_(raiz, nuco4 || 'SIN NUCO');
  }

  /** Crea la carpeta de una evidencia nueva y autoriza (1 h) al usuario a subir archivos en ella. */
  function prepararCarpetaEvidencia(tipo, nuco, fecha, correo) {
    const nucoCarpeta = carpetaNuco_(nuco);
    const anio = Utilities.formatDate(fecha, 'America/Mexico_City', 'yyyy');
    const mes = Number(Utilities.formatDate(fecha, 'America/Mexico_City', 'M'));
    const ddmm = Utilities.formatDate(fecha, 'America/Mexico_City', 'dd MM');
    let carpeta, fotos = null;
    if (tipo === 'INSPECCION') {
      const base = subcarpeta_(subcarpeta_(subcarpeta_(subcarpeta_(nucoCarpeta, 'INSPECCIONES'), anio), CUATRIMESTRES[Math.floor((mes - 1) / 4)]), MESES_MAYUS[mes - 1]);
      carpeta = carpetaUnica_(base, 'INSP ' + ddmm);
      fotos = carpeta.createFolder('FOTOS');
    } else {
      carpeta = carpetaUnica_(subcarpeta_(subcarpeta_(nucoCarpeta, 'CARTA RESPONSIVA'), anio), 'RESP ' + ddmm);
    }
    const permitidas = [carpeta.getId()].concat(fotos ? [fotos.getId()] : []);
    const cache = CacheService.getScriptCache();
    permitidas.forEach((id) => cache.put('ln_subida_' + correo + '_' + id, '1', 3600));
    return {
      carpetaId: carpeta.getId(), fotosCarpetaId: fotos ? fotos.getId() : null,
      ruta: [nuco || 'SIN NUCO', tipo === 'INSPECCION' ? 'INSPECCIONES' : 'CARTA RESPONSIVA', anio, carpeta.getName()].join('/'),
    };
  }

  /** Sube un archivo (base64) a una carpeta previamente autorizada para este usuario (prepararCarpetaEvidencia). */
  function subirArchivo(correo, carpetaId, nombre, mime, base64) {
    if (!CacheService.getScriptCache().get('ln_subida_' + correo + '_' + carpetaId)) {
      throw new Error('Carpeta no autorizada para subir archivos (o la sesión de captura expiró: vuelve a empezar la inspección/responsiva).');
    }
    if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(mime)) throw new Error('Tipo de archivo no permitido: ' + mime);
    const bytes = Utilities.base64Decode(base64);
    if (bytes.length > 15 * 1024 * 1024) throw new Error('El archivo supera 15 MB.');
    const archivo = DriveApp.getFolderById(carpetaId).createFile(Utilities.newBlob(bytes, mime, String(nombre).replace(/[\\/]/g, '_')));
    return { id: archivo.getId(), nombre: archivo.getName() };
  }

  /** Envía a la papelera una carpeta de borrador que el mismo usuario acaba de preparar. */
  function cancelarCarpetaEvidencia(correo, carpetaId, fotosCarpetaId) {
    const cache = CacheService.getScriptCache();
    const clave = 'ln_subida_' + correo + '_' + carpetaId;
    if (!carpetaId || !cache.get(clave)) return { ok: false };
    DriveApp.getFolderById(carpetaId).setTrashed(true);
    cache.remove(clave);
    if (fotosCarpetaId) cache.remove('ln_subida_' + correo + '_' + fotosCarpetaId);
    return { ok: true };
  }

  /**
   * Archivo de una columna File de LINEAS TELEFONICAS (RESPONSIVA, FORMATO INSPECCION) capturado desde el
   * formulario del registro: se guarda en <NUCO>/<subcarpeta> y regresa el enlace que queda en la hoja.
   */
  function guardarArchivoDeRegistro(nuco, subcarpeta, nombre, mime, base64) {
    if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(mime)) throw new Error('Tipo de archivo no permitido: ' + mime);
    const bytes = Utilities.base64Decode(base64);
    if (bytes.length > 15 * 1024 * 1024) throw new Error('El archivo supera 15 MB.');
    const carpeta = subcarpeta_(carpetaNuco_(nuco), subcarpeta);
    const archivo = carpeta.createFile(Utilities.newBlob(bytes, mime, String(nombre || 'archivo').replace(/[\/]/g, '_')));
    return 'https://drive.google.com/file/d/' + archivo.getId() + '/view';
  }

  /** Blob de un archivo de Drive (para insertar firmas en el PDF). null si no existe o no hay id. */
  function blobDeArchivo(id) {
    if (!id) return null;
    try { return DriveApp.getFileById(id).getBlob(); } catch (e) { return null; }
  }

  /** Valida que los archivos (fotos/firmas) estén dentro de las carpetas autorizadas de la evidencia. */
  function validarArchivosEnCarpeta(ids, carpetaIds) {
    (ids || []).filter(Boolean).forEach((id) => {
      const padres = DriveApp.getFileById(id).getParents();
      let ok = false;
      while (padres.hasNext()) { if (carpetaIds.indexOf(padres.next().getId()) >= 0) { ok = true; break; } }
      if (!ok) throw new Error('El archivo ' + id + ' no pertenece a la carpeta de la evidencia.');
    });
  }

  return { prepararCarpetaEvidencia, cancelarCarpetaEvidencia, subirArchivo, guardarArchivoDeRegistro, blobDeArchivo, validarArchivosEnCarpeta };
})();
