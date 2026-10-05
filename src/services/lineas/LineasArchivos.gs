/**
 * LineasArchivos.gs
 * Carpetas de Drive que usa Líneas y archivos que el AppSheet guarda como ruta relativa.
 *
 * Solo hay dos carpetas (Script Properties; si faltan se usan las que indicó el usuario el 28-sep):
 *   LINEAS_DRIVE_APPSHEET   carpeta de la app AppSheet (en DEV: "PruebasCONTROLVEHICYTELEF-172665033", la de la hoja
 *                           VEHICULOS). Ahí están "<TABLA>_Files_", "<TABLA>_Images", "INSPECCIONES_Files_" y "Files".
 *                           Se lee y se ESCRIBE aquí, con las mismas rutas que usa el AppSheet.
 *   LINEAS_DRIVE_NUCOS      carpeta NUCOS de producción (una carpeta por NUCO). La ficha la muestra en "Documentos"
 *                           y, desde el corte a producción (2-oct-2026), las inspecciones y responsivas nuevas
 *                           guardan ahí su PDF y sus fotos, con la misma estructura que llena el área a mano:
 *                             <NUCO>/INSPECCIONES/<AÑO>/<N> CUATRIMESTRE/<MES>/INSP DD MM/  (+ FOTOS)
 *                             <NUCO>/CARTA RESPONSIVA/<AÑO>/RESP DD MM/
 *                           Un registro sin NUCO sigue en la carpeta de la app.
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

  const prop_ = (clave) => leerConfig_(clave);   // config/Entornos.gs o Script Properties
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
    if (!puedeVerSecretos && RUTA_SECRETA.test(v)) throw new Error('Este archivo solo lo ven administradores y el área de Líneas.');
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
    const archivo = carpetaDeApp(carpeta).createFile(Utilities.newBlob(bytes, mime, nombre));
    // Sin esto, el archivo solo lo puede ver la cuenta que despliega la app
    // (quien lo creó) — nadie más puede abrir el link, aunque sea válido.
    archivo.setSharing(DriveApp.Access.DOMAIN, DriveApp.Permission.VIEW);
    return carpeta + '/' + nombre;
  }

  // ---------------- NUCOS (producción): lectura ----------------

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

  // ---------------- Escritura en NUCOS: carpeta de cada inspección / responsiva ----------------

  const MESES_ = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const CUATRIMESTRES_ = ['1ER CUATRIMESTRE', '2DO CUATRIMESTRE', '3ER CUATRIMESTRE'];

  /** Crea una carpeta con nombre único (agrega " (2)", " (3)"… si ya existe). */
  function carpetaUnica_(padre, nombre) {
    let candidato = nombre;
    for (let n = 2; padre.getFoldersByName(candidato).hasNext(); n++) candidato = nombre + ' (' + n + ')';
    return padre.createFolder(candidato);
  }

  /** Carpeta del NUCO dentro de NUCOS ("0599" o "599", la que ya exista); si no hay, la crea a 4 dígitos. */
  function carpetaDelNuco_(nuco) {
    const n4 = LineasUtil.nuco4(nuco);
    if (!n4) throw new Error('El registro no tiene NUCO.');
    const id = carpetasNucos()[n4];
    if (id) {
      try { const c = DriveApp.getFolderById(id); if (!c.isTrashed()) return c; } catch (e) { /* se borró: se vuelve a buscar */ }
    }
    LineasDatos.cacheBorrar('carpetas_nucos_v2');
    const raiz = DriveApp.getFolderById(carpetaNucosId());
    const otra = carpetasNucos()[n4];
    return otra ? DriveApp.getFolderById(otra) : raiz.createFolder(n4);
  }

  /** Olvida lo que se tenía en caché del NUCO (Documentos, "Última inspección / responsiva"). */
  function olvidarNuco(nuco) {
    const n4 = LineasUtil.nuco4(nuco);
    if (!n4) return;
    ['', '_INSPECCION', '_RESPONSIVA'].forEach((s) => LineasDatos.cacheBorrar('nucos_archivos_v2_' + n4 + s));
  }

  /**
   * Carpeta nueva en NUCOS para una inspección o responsiva del día `fecha`:
   *   INSPECCION → <NUCO>/INSPECCIONES/<AÑO>/<N> CUATRIMESTRE/<MES>/INSP DD MM  y su FOTOS
   *   RESPONSIVA → <NUCO>/CARTA RESPONSIVA/<AÑO>/RESP DD MM
   * Si ya hay una del mismo día, la nueva es "INSP DD MM (2)". Regresa { carpetaId, fotosCarpetaId, ruta, nombrePdf }.
   */
  function carpetaEvidenciaNuco(tipo, nuco, fecha) {
    const n4 = LineasUtil.nuco4(nuco);
    const f = fecha instanceof Date && !isNaN(fecha) ? fecha : new Date();
    const anio = Utilities.formatDate(f, ZONA, 'yyyy');
    const mes = Number(Utilities.formatDate(f, ZONA, 'M'));
    const ddmm = Utilities.formatDate(f, ZONA, 'dd MM');
    const raizNuco = carpetaDelNuco_(n4);
    let carpeta, fotos = null, ramas;
    if (tipo === 'INSPECCION') {
      ramas = ['INSPECCIONES', anio, CUATRIMESTRES_[Math.floor((mes - 1) / 4)], MESES_[mes - 1]];
      carpeta = carpetaUnica_(ramas.reduce((c, nombre) => subcarpeta_(c, nombre), raizNuco), 'INSP ' + ddmm);
      fotos = carpeta.createFolder('FOTOS');
    } else if (tipo === 'RESPONSIVA') {
      ramas = ['CARTA RESPONSIVA', anio];
      carpeta = carpetaUnica_(ramas.reduce((c, nombre) => subcarpeta_(c, nombre), raizNuco), 'RESP ' + ddmm);
    } else {
      throw new Error('Tipo de evidencia inválido.');
    }
    olvidarNuco(n4);
    return {
      carpetaId: carpeta.getId(), fotosCarpetaId: fotos ? fotos.getId() : null,
      ruta: [raizNuco.getName()].concat(ramas, [carpeta.getName()]).join('/'),
      nombrePdf: (tipo === 'INSPECCION' ? 'INSP ' : 'RESP ') + n4 + ' ' + ddmm + '.pdf',
    };
  }

  /**
   * Manda a la papelera la carpeta de una captura cancelada y las carpetas de año / cuatrimestre / mes que quedaron
   * vacías por ella (nunca la del NUCO, ni INSPECCIONES / CARTA RESPONSIVA).
   */
  function descartarCarpeta(carpetaId) {
    const c = DriveApp.getFolderById(carpetaId);
    const dentroDeNucos = estaDentroDe(carpetaId, carpetaNucosId());
    const padres = c.getParents();
    let padre = padres.hasNext() ? padres.next() : null;
    c.setTrashed(true);
    if (!dentroDeNucos) return;
    for (let n = 0; padre && n < 3; n++) {
      const nombre = padre.getName().trim();
      if (!/^\d{4}$|CUATRIMESTRE$|^[A-Z]+$/.test(nombre) || /^(INSPECCIONES|FOTOS)$/i.test(nombre)) break;
      if (padre.searchFiles('trashed = false').hasNext() || padre.searchFolders('trashed = false').hasNext()) break;
      const arriba = padre.getParents();
      const siguiente = arriba.hasNext() ? arriba.next() : null;
      if (!siguiente || siguiente.getId() === carpetaNucosId()) break; // es la carpeta del NUCO
      padre.setTrashed(true);
      padre = siguiente;
    }
  }

  // ---------------- Escritura: carpeta de la app o NUCOS ----------------

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

  /** ¿La carpeta está dentro de NUCOS? */
  function enNucos(carpetaId) {
    return !!carpetaId && estaDentroDe(carpetaId, carpetaNucosId());
  }

  /** Error si la carpeta no es de la app AppSheet ni de NUCOS. */
  function exigirEscribible(carpetaId) {
    if (!carpetaId || !(estaDentroDe(carpetaId, carpetaAppSheetId()) || enNucos(carpetaId))) {
      throw new Error('Los archivos solo se pueden guardar en la carpeta de la app o en NUCOS.');
    }
  }

  /**
   * PDF firmado (usuario, 5-oct): versión nueva del MISMO archivo de Drive (mismo id y enlace, que ya están en la hoja y
   * en APP_EVIDENCIAS). La versión que se reemplaza se marca para conservarse en el historial de versiones de Drive.
   * Solo PDF de NUCOS o de la carpeta de la app.
   */
  function reemplazarPdf(archivoId, bytes) {
    const archivo = DriveApp.getFileById(archivoId);
    if (archivo.getMimeType() !== MimeType.PDF) throw new Error('El documento no es un PDF.');
    const padres = archivo.getParents();
    exigirEscribible(padres.hasNext() ? padres.next().getId() : null);
    const opciones = (metodo, extra) => Object.assign({ method: metodo, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }, extra || {});
    const base = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(archivoId);
    const revisiones = UrlFetchApp.fetch(base + '/revisions?pageSize=1000&fields=' + encodeURIComponent('revisions(id)'), opciones('get'));
    const ultima = revisiones.getResponseCode() === 200 ? (JSON.parse(revisiones.getContentText()).revisions || []).pop() : null;
    if (ultima) {
      const r = UrlFetchApp.fetch(base + '/revisions/' + encodeURIComponent(ultima.id), opciones('patch', { contentType: 'application/json', payload: JSON.stringify({ keepForever: true }) }));
      if (r.getResponseCode() !== 200) console.warn('reemplazarPdf ' + archivoId + ': la versión anterior no se marcó (' + r.getResponseCode() + ').');
    }
    const resp = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(archivoId) +
      '?uploadType=media&supportsAllDrives=true&fields=' + encodeURIComponent('id,name'), opciones('patch', { contentType: 'application/pdf', payload: bytes }));
    if (resp.getResponseCode() !== 200) throw new Error('No se pudo guardar el PDF en Drive (' + resp.getResponseCode() + ').');
    return JSON.parse(resp.getContentText());
  }

  return {
    carpetaAppSheetId, carpetaNucosId, carpetaDeApp, idDeUrl, resolver, imagen, blob, guardarComoAppSheet,
    carpetasNucos, archivosNuco, estaDentroDe, exigirEscribible, enNucos, carpetaEvidenciaNuco, descartarCarpeta, olvidarNuco,
    reemplazarPdf,
  };
})();
