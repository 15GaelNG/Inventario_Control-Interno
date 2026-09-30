/**
 * LineasArchivos.gs
 * Carpetas de Drive que usa Líneas y archivos que el AppSheet guarda como ruta relativa.
 *
 * Solo hay dos carpetas (Script Properties; si faltan se usan las que indicó el usuario el 28-sep):
 *   LINEAS_DRIVE_APPSHEET   carpeta de la app AppSheet (en DEV: "PruebasCONTROLVEHICYTELEF-172665033", la de la hoja
 *                           VEHICULOS). Ahí están "<TABLA>_Files_", "<TABLA>_Images", "INSPECCIONES_Files_" y "Files".
 *                           Se lee y se ESCRIBE aquí, con las mismas rutas que usa el AppSheet.
 *   LINEAS_DRIVE_NUCOS      carpeta NUCOS de producción (una carpeta por NUCO, que el área llena a mano).
 *                           SOLO LECTURA: la ficha la muestra en "Documentos"; el sistema nunca escribe ahí.
 *
 * Una columna File/Image/Signature del AppSheet guarda "BITACORA DE DESECHO_Files_/xxxx.EVIDENCIA.123.jpg":
 * se resuelve caminando desde la carpeta de la app (nunca sale de ella).
 */

const LineasArchivos = (function () {
  const APPSHEET_POR_OMISION = '1FsC5mloJNhi_TR7pBX1KMEjUZfN_M9OM';
  const NUCOS_POR_OMISION = '12SRBi1nZlIzfNx0d2y1fAtzOydA2QrT-';
  const ZONA = 'America/Mexico_City';
  const SEG_CACHE = 21600;
  // Archivos con secretos (patrón, contraseña) y firmas: solo quien puede ver secretos
  const RUTA_SECRETA = /\.(PATRON|CONTRASE(Ñ|N)A|FIRMA[ _A-Z]*)\.[^/]*$/i;
  const TIPOS_PERMITIDOS = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;
  const EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };

  const prop_ = (clave) => PropertiesService.getScriptProperties().getProperty(clave);
  function carpetaAppSheetId() { return prop_('LINEAS_DRIVE_APPSHEET') || APPSHEET_POR_OMISION; }
  function carpetaNucosId() { return prop_('LINEAS_DRIVE_NUCOS') || NUCOS_POR_OMISION; }

  /** Id de Drive dentro de un enlace (file/d/<id>, open?id=<id>, uc?id=<id>). */
  function idDeUrl(v) {
    const m = String(v || '').match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{20,})/);
    return m ? m[1] : null;
  }

  function clave_(texto) {
    return 'ln_arch_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, texto, Utilities.Charset.UTF_8));
  }

  /** Subcarpeta por nombre (la crea si no existe). */
  function subcarpeta_(padre, nombre) {
    const it = padre.getFoldersByName(nombre);
    return it.hasNext() ? it.next() : padre.createFolder(nombre);
  }

  /** Carpeta de la app "<ruta>" ("INSPECCIONES_Files_", "Files", …); la crea si no existe. */
  function carpetaDeApp(ruta) {
    return String(ruta).split('/').filter(Boolean).reduce((c, parte) => subcarpeta_(c, parte), DriveApp.getFolderById(carpetaAppSheetId()));
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

  /** Blob de una ruta del AppSheet o enlace de Drive (firmas para el PDF). null si no existe. */
  function blob(ruta) {
    try {
      const f = resolver(ruta, true);
      return f && f.id ? DriveApp.getFileById(f.id).getBlob() : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Guarda un archivo como lo hace el AppSheet y regresa la ruta que va en la hoja:
   *   "<carpeta>/<llave>.<COLUMNA>.<HHmmss>.<ext>"   (p. ej. "BITACORA DE DESECHO_Files_/9f2c1a7b.EVIDENCIA.101530.jpg")
   */
  function guardarComoAppSheet(carpeta, llave, columna, mime, base64) {
    if (!TIPOS_PERMITIDOS.test(mime)) throw new Error('Tipo de archivo no permitido: ' + mime);
    const bytes = Utilities.base64Decode(base64);
    if (bytes.length > 15 * 1024 * 1024) throw new Error('El archivo supera 15 MB.');
    const nombre = String(llave).replace(/[\\/]/g, '_') + '.' + columna + '.' + Utilities.formatDate(new Date(), ZONA, 'HHmmss') + '.' + EXTENSION[mime];
    carpetaDeApp(carpeta).createFile(Utilities.newBlob(bytes, mime, nombre));
    return carpeta + '/' + nombre;
  }

  // ---------------- NUCOS (producción, solo lectura) ----------------

  function driveApi_(parametros) {
    const url = 'https://www.googleapis.com/drive/v3/files?' + parametros.concat(['supportsAllDrives=true', 'includeItemsFromAllDrives=true']).join('&');
    const resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) throw new Error('No se pudo leer Drive (' + resp.getResponseCode() + ').');
    return JSON.parse(resp.getContentText());
  }

  /** NUCO → id de su carpeta dentro de NUCOS (subcarpetas con nombre numérico). Caché 6 h. */
  function carpetasNucos() {
    const enCache = LineasDatos.cacheLeer('carpetas_nucos_v2');
    if (enCache) return enCache;
    const mapa = {};
    let pagina = null;
    do {
      const r = driveApi_([
        'q=' + encodeURIComponent("'" + carpetaNucosId() + "' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"),
        'pageSize=1000', 'fields=' + encodeURIComponent('nextPageToken,files(id,name)'),
      ].concat(pagina ? ['pageToken=' + encodeURIComponent(pagina)] : []));
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
   * Todo lo que hay dentro de la carpeta del NUCO en NUCOS (solo lectura), agrupado por la carpeta que contiene
   * archivos: [{ carpetaId, ruta: "INSPECCIONES/2026/…/INSP 12 08/FOTOS", tipo, archivos: [{ id, nombre, mime,
   * miniatura, enlace, video }] }]. Una consulta a Drive por nivel (todas las carpetas del nivel a la vez).
   */
  function archivosNuco(nuco, soloTipo) {
    const n4 = nuco ? LineasUtil.nuco4(nuco) : null;
    const raiz = n4 && carpetasNucos()[n4];
    if (!raiz) return { carpetaId: null, grupos: [] };
    const rutas = {};
    rutas[raiz] = '';
    const grupos = {};
    // `soloTipo` ('INSPECCION' | 'RESPONSIVA'): del primer nivel solo se baja a INSPECCIONES o CARTA RESPONSIVA.
    // "Última inspección / responsiva" no necesita recorrer todo el NUCO (era lo que la hacía tardar).
    const ramaPermitida = soloTipo === 'INSPECCION' ? /^INSPECCIONES$/i : (soloTipo === 'RESPONSIVA' ? /^CARTA RESPONSIVA$/i : null);
    let nivel = [raiz];
    for (let profundidad = 0; nivel.length && profundidad < 8; profundidad++) {
      const siguiente = [];
      for (let i = 0; i < nivel.length; i += 40) {
        const padres = nivel.slice(i, i + 40);
        let pagina = null;
        do {
          const r = driveApi_([
            'q=' + encodeURIComponent('(' + padres.map((p) => "'" + p + "' in parents").join(' or ') + ') and trashed = false'),
            'pageSize=1000', 'orderBy=name',
            'fields=' + encodeURIComponent('nextPageToken,files(id,name,mimeType,parents,thumbnailLink,webViewLink,modifiedTime)'),
          ].concat(pagina ? ['pageToken=' + encodeURIComponent(pagina)] : []));
          (r.files || []).forEach((f) => {
            const padre = (f.parents || []).filter((p) => p in rutas)[0];
            if (padre === undefined) return;
            const ruta = (rutas[padre] ? rutas[padre] + '/' : '') + f.name;
            if (f.mimeType === 'application/vnd.google-apps.folder') {
              if (ramaPermitida && padre === raiz && !ramaPermitida.test(f.name.trim())) return;
              rutas[f.id] = ruta;
              siguiente.push(f.id);
              return;
            }
            if (ramaPermitida && padre === raiz) return; // archivos sueltos del NUCO: no son de esa rama
            if (!grupos[padre]) {
              const tipo = /(^|\/)(INSPECCIONES)(\/|$)/i.test(rutas[padre]) ? 'INSPECCION' : (/(^|\/)CARTA RESPONSIVA(\/|$)/i.test(rutas[padre]) ? 'RESPONSIVA' : 'OTRO');
              grupos[padre] = { carpetaId: padre, ruta: rutas[padre], tipo: tipo, archivos: [] };
            }
            grupos[padre].archivos.push({
              id: f.id, nombre: f.name, mime: f.mimeType, miniatura: f.thumbnailLink || null, enlace: f.webViewLink,
              video: /^video\//.test(f.mimeType), fecha: f.modifiedTime || null,
            });
          });
          pagina = r.nextPageToken || null;
        } while (pagina);
      }
      nivel = siguiente;
    }
    // Fecha de cada carpeta: la de su ruta (".../2025/.../INSP 02 10" = 2 de octubre de 2025); si la ruta no la trae,
    // la del archivo más reciente. Lo más reciente primero.
    const lista = Object.keys(grupos).map((k) => {
      const g = grupos[k];
      const partes = g.ruta.split('/');
      const anio = partes.filter((p) => /^\d{4}$/.test(p.trim())).pop();
      const dm = partes.map((p) => p.trim().match(/^(?:INSP|RESP)\s+(\d{1,2})\s+(\d{1,2})\b/i)).filter(Boolean).pop();
      const dosDigitos = (n) => ('0' + n).slice(-2);
      g.fecha = anio && dm ? anio + '-' + dosDigitos(dm[2]) + '-' + dosDigitos(dm[1]) + 'T12:00:00'
        : g.archivos.reduce((max, a) => (a.fecha && a.fecha > max ? a.fecha : max), '');
      return g;
    }).sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
    return { carpetaId: raiz, grupos: lista };
  }

  // ---------------- Escritura: solo dentro de la carpeta de la app ----------------

  /** ¿La carpeta está dentro de `raizId`? (sube hasta 12 niveles). */
  function estaDentroDe(carpetaId, raizId) {
    let actual = [DriveApp.getFolderById(carpetaId)];
    for (let nivel = 0; nivel < 12 && actual.length; nivel++) {
      const siguiente = [];
      for (let i = 0; i < actual.length; i++) {
        if (actual[i].getId() === raizId) return true;
        const padres = actual[i].getParents();
        while (padres.hasNext()) siguiente.push(padres.next());
      }
      actual = siguiente;
    }
    return false;
  }

  /** Error si la carpeta no es de la app AppSheet (p. ej. NUCOS de producción, que es de solo lectura). */
  function exigirEscribible(carpetaId) {
    if (!carpetaId || !estaDentroDe(carpetaId, carpetaAppSheetId())) {
      throw new Error('Esta carpeta es de solo consulta (NUCOS de producción); los archivos nuevos se guardan en la carpeta de la app.');
    }
  }

  return {
    carpetaAppSheetId, carpetaNucosId, carpetaDeApp, idDeUrl, resolver, imagen, blob, guardarComoAppSheet,
    carpetasNucos, archivosNuco, estaDentroDe, exigirEscribible,
  };
})();
