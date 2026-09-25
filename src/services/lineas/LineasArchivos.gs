/**
 * LineasArchivos.gs
 * Carpetas de Drive que usa Líneas y archivos que el AppSheet guarda como ruta relativa.
 *
 * Carpetas (Script Properties; si faltan se usan las de producción que indicó el usuario el 25-sep):
 *   LINEAS_DRIVE_APPSHEET   carpeta raíz del AppSheet: ahí están "<TABLA>_Files_" y "<TABLA>_Images".
 *                           Solo lectura.
 *   LINEAS_DRIVE_NUCOS      carpeta NUCOS: una carpeta por NUCO con INSPECCIONES y CARTA RESPONSIVA.
 *                           Solo lectura mientras se escriba en otra carpeta.
 *   LINEAS_DRIVE_CARPETA_RAIZ  donde el sistema GUARDA lo nuevo (inspecciones, fotos, PDF, responsivas).
 *                           En DEV es la carpeta de pruebas (ver LineasEvidencias).
 *
 * Una columna File/Image/Signature del AppSheet guarda "BITACORA DE DESECHO_Files_/xxxx.EVIDENCIA.123.jpg":
 * se resuelve caminando desde la carpeta raíz del AppSheet (nunca sale de ella).
 */

const LineasArchivos = (function () {
  const APPSHEET_PRODUCCION = '1FsC5mloJNhi_TR7pBX1KMEjUZfN_M9OM';
  const NUCOS_PRODUCCION = '12SRBi1nZlIzfNx0d2y1fAtzOydA2QrT-';
  const SEG_CACHE = 21600;
  // Archivos con secretos (patrón, contraseña) y firmas: solo quien puede ver secretos
  const RUTA_SECRETA = /\.(PATRON|CONTRASE(Ñ|N)A|FIRMA[ _A-Z]*)\.[^/]*$/i;

  const prop_ = (clave) => PropertiesService.getScriptProperties().getProperty(clave);
  function carpetaAppSheetId() { return prop_('LINEAS_DRIVE_APPSHEET') || APPSHEET_PRODUCCION; }
  function carpetaNucosId() { return prop_('LINEAS_DRIVE_NUCOS') || NUCOS_PRODUCCION; }
  function carpetaEscrituraId() { return prop_('LINEAS_DRIVE_CARPETA_RAIZ') || ''; }

  /** ¿Se escribe en las carpetas de producción? (solo si la carpeta de escritura ES la de NUCOS). */
  function escribeEnProduccion() { return carpetaEscrituraId() === carpetaNucosId(); }

  /** Id de Drive dentro de un enlace (file/d/<id>, open?id=<id>, uc?id=<id>). */
  function idDeUrl(v) {
    const m = String(v || '').match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{20,})/);
    return m ? m[1] : null;
  }

  function clave_(texto) {
    return 'ln_arch_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, texto, Utilities.Charset.UTF_8));
  }

  /**
   * Archivo de una ruta del AppSheet (o de un enlace de Drive) → { id, nombre, url } o null si no existe.
   * `puedeVerSecretos` false → rechaza patrones, contraseñas y firmas.
   */
  function resolver(ruta, puedeVerSecretos) {
    let v = String(ruta || '').trim();
    if (!v) return null;
    // Enlace del AppSheet (appsheet.com/template/gettablefileurl?…&fileName=TABLA_Files_/…): se usa su ruta
    const enlace = /appsheet\.com\/template\/gettablefileurl/i.test(v) && v.match(/[?&]fileName=([^&#]+)/i);
    if (enlace) {
      try { v = decodeURIComponent(enlace[1].replace(/\+/g, ' ')).trim(); } catch (e) { return null; }
    }
    if (!puedeVerSecretos && RUTA_SECRETA.test(v)) throw new Error('Este archivo solo lo puede ver un administrador.');
    const id = idDeUrl(v);
    if (id) return { id: id, nombre: v, url: 'https://drive.google.com/file/d/' + id + '/view' };
    if (/^https?:/i.test(v)) return { id: null, nombre: v, url: v };
    const partes = v.split('/').map((p) => p.trim()).filter(Boolean);
    if (partes.length < 2 || partes.some((p) => p === '..' || p === '.')) return null;

    const cache = CacheService.getScriptCache();
    const k = clave_(carpetaAppSheetId() + '|' + v);
    const guardado = cache.get(k);
    if (guardado) return guardado === '-' ? null : JSON.parse(guardado);

    const nombre = partes.pop();
    let carpeta = DriveApp.getFolderById(carpetaAppSheetId());
    let encontrado = null;
    for (let i = 0; i < partes.length && carpeta; i++) {
      const it = carpeta.getFoldersByName(partes[i]);
      carpeta = it.hasNext() ? it.next() : null;
    }
    if (carpeta) {
      const archivos = carpeta.getFilesByName(nombre);
      if (archivos.hasNext()) {
        const f = archivos.next();
        encontrado = { id: f.getId(), nombre: f.getName(), url: f.getUrl() };
      }
    }
    // Lo que no existe también se recuerda un rato (evita recorrer Drive en cada clic)
    cache.put(k, encontrado ? JSON.stringify(encontrado) : '-', encontrado ? SEG_CACHE : 600);
    return encontrado;
  }

  /** Imagen de una ruta como elemento de galería { id, nombre, enlace, miniatura } (firmas de inspecciones). */
  function imagen(ruta, puedeVerSecretos) {
    try {
      const f = resolver(ruta, puedeVerSecretos);
      if (!f || !f.id) return null;
      return { id: f.id, nombre: f.nombre, enlace: f.url, miniatura: 'https://drive.google.com/thumbnail?id=' + f.id + '&sz=w600' };
    } catch (e) {
      return null;
    }
  }

  /**
   * NUCO → id de su carpeta dentro de NUCOS (subcarpetas con nombre numérico). Lista la carpeta con la
   * API de Drive (1000 por página); caché 6 h.
   */
  function carpetasNucos() {
    const enCache = LineasDatos.cacheLeer('carpetas_nucos_v2');
    if (enCache) return enCache;
    const mapa = {};
    let pagina = null;
    do {
      const url = 'https://www.googleapis.com/drive/v3/files?' + [
        'q=' + encodeURIComponent("'" + carpetaNucosId() + "' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"),
        'pageSize=1000', 'fields=' + encodeURIComponent('nextPageToken,files(id,name)'),
        'supportsAllDrives=true', 'includeItemsFromAllDrives=true',
      ].concat(pagina ? ['pageToken=' + encodeURIComponent(pagina)] : []).join('&');
      const resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) throw new Error('No se pudo leer la carpeta NUCOS (' + resp.getResponseCode() + ').');
      const r = JSON.parse(resp.getContentText());
      (r.files || []).forEach((f) => {
        const nombre = String(f.name || '').trim();
        if (/^\d+$/.test(nombre)) mapa[LineasUtil.nuco4(nombre)] = f.id;
      });
      pagina = r.nextPageToken || null;
    } while (pagina);
    LineasDatos.cacheGuardar('carpetas_nucos_v2', mapa, SEG_CACHE);
    return mapa;
  }

  /**
   * ¿La carpeta está dentro de NUCOS o del AppSheet de producción? (sube hasta 12 niveles). Se usa para no
   * escribir ahí mientras la carpeta de escritura sea otra (DEV).
   */
  function estaEnProduccion(carpetaId) {
    const prohibidas = [carpetaNucosId(), carpetaAppSheetId()];
    let actual = [DriveApp.getFolderById(carpetaId)];
    for (let nivel = 0; nivel < 12 && actual.length; nivel++) {
      const siguiente = [];
      for (let i = 0; i < actual.length; i++) {
        if (prohibidas.indexOf(actual[i].getId()) >= 0) return true;
        const padres = actual[i].getParents();
        while (padres.hasNext()) siguiente.push(padres.next());
      }
      actual = siguiente;
    }
    return false;
  }

  /** Error si se intenta escribir en producción desde DEV. */
  function exigirEscribible(carpetaId) {
    if (!escribeEnProduccion() && estaEnProduccion(carpetaId)) {
      throw new Error('Esta carpeta es de producción (NUCOS/AppSheet); en este entorno no se agregan archivos ahí.');
    }
  }

  return {
    carpetaAppSheetId, carpetaNucosId, carpetaEscrituraId, escribeEnProduccion,
    idDeUrl, resolver, imagen, carpetasNucos, estaEnProduccion, exigirEscribible,
  };
})();
