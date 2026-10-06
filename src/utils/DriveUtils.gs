/**
 * DriveUtils.gs
 * Archivos (imágenes, comprobantes) compatibles con AppSheet.
 *
 * AppSheet no guarda URLs en la hoja, sino una RUTA RELATIVA a la carpeta de
 * la app, con este formato:
 *   <CARPETA>/<ID de la fila>.<NOMBRE COLUMNA>.<HHmmss>.<ext>
 *   imágenes: VERIFICACIONES_Images/a1b2c3d4.COMPROBANTE VERIFICACION.142530.png
 *   archivos: INSTALACION DE SENSORES_Files_/a1b2c3d4.RESPONSIVA SENSOR.142530.pdf
 *
 * Guardamos igual para que las dos apps vean los mismos archivos mientras
 * convivan. Para mostrar un archivo, se busca por NOMBRE dentro de la(s)
 * carpeta(s) configuradas.
 */

const DriveUtils = (function () {
  const EXTENSIONES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf' };
  const IMAGENES = ['image/png', 'image/jpeg'];
  const MAX_BYTES = 10 * 1024 * 1024;

  /**
   * Guarda un archivo con el nombre y la ruta que usa AppSheet.
   *
   * @param {Object} p
   * @param {string} p.carpetaId        carpeta de Drive destino
   * @param {string} p.carpetaRelativa  nombre de esa carpeta en la ruta, ej. 'VERIFICACIONES_Images'
   * @param {string} p.idFila           clave de la fila
   * @param {string} p.columna          ej. 'COMPROBANTE VERIFICACION'
   * @param {{base64: string, mimeType: string}} p.archivo  base64 sin prefijo "data:..."
   * @param {string[]} [p.permitidos]   mime types aceptados (por defecto PNG y JPG)
   * @param {string} [p.etiqueta]       cómo llamarlo en los mensajes de error ('la imagen', 'el PDF'…)
   * @return {{ruta: string, fileId: string}}
   */
  function guardarArchivoAppSheet(p) {
    const permitidos = p.permitidos || IMAGENES;
    const etiqueta = p.etiqueta || 'el archivo';
    const mimeType = p.archivo && p.archivo.mimeType;
    if (permitidos.indexOf(mimeType) === -1) {
      throw new Error('Solo se aceptan archivos ' + permitidos.map((m) => EXTENSIONES[m] || m).join(' o ').toUpperCase());
    }

    const bytes = Utilities.base64Decode(p.archivo.base64);
    if (bytes.length > MAX_BYTES) throw new Error(etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1) + ' pesa más de 10 MB');

    const hora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HHmmss');
    const nombre = p.idFila + '.' + p.columna + '.' + hora + '.' + EXTENSIONES[mimeType];
    let archivo;
    try {
      archivo = marcarAutor(DriveApp.getFolderById(p.carpetaId).createFile(Utilities.newBlob(bytes, mimeType, nombre)));
    } catch (err) {
      // "Acceso denegado: DriveApp" casi siempre = la cuenta puede VER la carpeta pero no EDITARLA
      throw new Error(
        'No se pudo guardar ' + etiqueta + ' en Drive (' + err.message + '). ' +
        'Verifica que tu cuenta (' + Session.getEffectiveUser().getEmail() + ') tenga permiso de ' +
        'EDITOR en la carpeta ' + p.carpetaRelativa + ' (ID ' + p.carpetaId + ').'
      );
    }

    return { ruta: p.carpetaRelativa + '/' + nombre, fileId: archivo.getId() };
  }

  /** Imagen (PNG/JPG) en la carpeta <TABLA>_Images — atajo de guardarArchivoAppSheet */
  function guardarImagenAppSheet(p) {
    return guardarArchivoAppSheet({
      carpetaId: p.carpetaId,
      carpetaRelativa: p.tabla + '_Images',
      idFila: p.idFila,
      columna: p.columna,
      archivo: p.archivo,
      permitidos: IMAGENES,
      etiqueta: 'la imagen',
    });
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

  /**
   * Archivo a partir de una ruta con subcarpetas, contada desde la carpeta raíz de la app.
   * Así guarda AppSheet las rutas largas, por ejemplo:
   *   "INSPECCIONES VEHICULARES/INSPECCIONES L200/INSPECCION ….pdf"
   *   "MODELOS INSPECCION/L200/frontal.png"
   *   "INSPECCION VEHICULAR_Images/a1b2.FIRMA INSPECTOR.142530.png"
   *
   * @param {string} ruta      ruta relativa, con "/" entre carpetas
   * @param {string} raizId    carpeta raíz de la app
   * @return {File|null}
   */
  function archivoDeRutaProfunda(ruta, raizId) {
    const partes = String(ruta || '').split('/').map((p) => p.trim()).filter(Boolean);
    if (partes.length < 2 || !raizId) return null;

    let carpeta;
    try {
      carpeta = DriveApp.getFolderById(raizId);
    } catch (e) {
      return null;
    }

    // La ruta puede venir con el nombre de la carpeta raíz al frente: si coincide, se salta
    let inicio = 0;
    if (partes[0].toUpperCase() === carpeta.getName().toUpperCase()) inicio = 1;

    for (let i = inicio; i < partes.length - 1; i++) {
      carpeta = subcarpetaOAcceso_(carpeta, partes[i]);
      if (!carpeta) return null;
    }

    const archivos = carpeta.getFilesByName(partes[partes.length - 1]);
    return archivos.hasNext() ? sinAcceso_(archivos.next()) : null;
  }

  /**
   * Accesos directos: en la raíz de producción "MODELOS INSPECCION" es un ACCESO DIRECTO a
   * la carpeta real, no una carpeta. Para Drive un acceso directo es un archivo, así que
   * getFoldersByName no lo ve y la ruta no se encontraba. Se sigue hasta su destino.
   */
  const ACCESO_DIRECTO = 'application/vnd.google-apps.shortcut';
  const CARPETA = 'application/vnd.google-apps.folder';

  function subcarpetaOAcceso_(carpeta, nombre) {
    const reales = carpeta.getFoldersByName(nombre);
    if (reales.hasNext()) return reales.next();
    const accesos = carpeta.getFilesByName(nombre);
    while (accesos.hasNext()) {
      const acceso = accesos.next();
      if (acceso.getMimeType() !== ACCESO_DIRECTO || acceso.getTargetMimeType() !== CARPETA) continue;
      try { return DriveApp.getFolderById(acceso.getTargetId()); } catch (e) { /* sin permiso al destino */ }
    }
    return null;
  }

  /** Si el archivo es un acceso directo, el archivo al que apunta (null si no se puede abrir) */
  function sinAcceso_(archivo) {
    if (archivo.getMimeType() !== ACCESO_DIRECTO) return archivo;
    try { return DriveApp.getFileById(archivo.getTargetId()); } catch (e) { return null; }
  }

  function urlDeRutaProfunda(ruta, raizId) {
    const archivo = archivoDeRutaProfunda(ruta, raizId);
    return archivo ? archivo.getUrl() : null;
  }

  /** Igual que previsualizarRuta, pero resolviendo la ruta con subcarpetas */
  function previsualizarRutaProfunda(ruta, raizId) {
    const MAX_PREVIEW = 4 * 1024 * 1024;
    const archivo = archivoDeRutaProfunda(ruta, raizId);
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

  /**
   * Comparte un archivo recién creado lo más ampliamente posible: primero con
   * todo el dominio (lo normal); si una política de Workspace lo bloquea
   * (pasa en algunas carpetas que no son de quien sube el archivo), intenta
   * "cualquiera con el enlace" como respaldo — algunas políticas bloquean una
   * forma de compartir pero no la otra. Regresa 'DOMAIN' | 'ANYONE_WITH_LINK'
   * si logró alguna, o null si ninguna (el archivo ya se creó de todos modos,
   * solo quedó visible nada más para quien lo subió).
   */
  function compartirLoMasAmplioPosible(archivo) {
    try {
      archivo.setSharing(DriveApp.Access.DOMAIN, DriveApp.Permission.VIEW);
      return 'DOMAIN';
    } catch (e) {
      try {
        archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        return 'ANYONE_WITH_LINK';
      } catch (e2) {
        return null;
      }
    }
  }

  /**
   * La carpeta "nombre" dentro de la raíz de la app (DRIVE_FOLDER_ID_RAIZ de ESTE proyecto),
   * real o por acceso directo — así las organiza AppSheet ("ARQUEOS_Images", "UBER_Files_").
   * Sustituye a los IDs fijos en el código: con un ID fijo, todos los DEV escribían en las
   * carpetas de producción, y una que apuntaba a la copia de pruebas (FIRMA EXTERNA de Arqueos)
   * hacía que producción escribiera en pruebas (6-oct). Producción tiene todas en su raíz.
   *
   * Si no existe: en un DEV se crea (en su raíz de pruebas); en producción truena con el nombre,
   * para que nadie escriba en una carpeta nueva que AppSheet no conoce. Guarda el ID 6 horas.
   * @return {Folder}
   */
  function carpetaEnRaiz(nombre) {
    const raizId = Config.DRIVE_FOLDERS.RAIZ();
    const clave = 'carpeta_en_raiz_' + Utilities.base64EncodeWebSafe(raizId + '|' + nombre);
    const cache = CacheService.getScriptCache();
    const guardada = cache.get(clave);
    if (guardada) {
      try { return DriveApp.getFolderById(guardada); } catch (e) { /* ya no está: se busca otra vez */ }
    }
    const raiz = DriveApp.getFolderById(raizId);
    let carpeta = subcarpetaOAcceso_(raiz, nombre);
    if (!carpeta) {
      if (String(leerConfig_('ENTORNO') || '').toUpperCase() === 'PROD') {
        throw new Error('No existe la carpeta "' + nombre + '" dentro de la raíz de la app ("' + raiz.getName() + '"). ' +
          'Créala ahí (o un acceso directo con ese nombre) y vuelve a intentarlo.');
      }
      carpeta = raiz.createFolder(nombre);
    }
    cache.put(clave, carpeta.getId(), 6 * 60 * 60);
    return carpeta;
  }

  /** Para revisarEntorno: la carpeta o el acceso directo con ese nombre en `raiz`, o null (no crea nada) */
  function carpetaEnRaizSiExiste(raiz, nombre) {
    return subcarpetaOAcceso_(raiz, nombre);
  }

  /** La subcarpeta del año en curso dentro de `carpeta` (la crea si no existe todavía) */
  function carpetaDelAnio(carpeta) {
    const anio = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy');
    const existentes = carpeta.getFoldersByName(anio);
    return existentes.hasNext() ? existentes.next() : carpeta.createFolder(anio);
  }

  /**
   * Deja en la descripción del archivo quién lo subió y cuándo. La app corre como quien la
   * desplegó (USER_DEPLOYING), así que Drive pone a ESA cuenta como dueña de todo lo que se
   * crea: sin esto no hay forma de saber quién capturó un archivo (6-oct: tres fotos de una
   * inspección "a nombre" de quien desplegó, que no las había subido). En el mismo dominio,
   * getActiveUser sí es quien usa la app. Nunca truena: un archivo sin nota sigue sirviendo.
   */
  function marcarAutor(archivo) {
    try {
      const quien = Session.getActiveUser().getEmail();
      if (archivo && quien) {
        archivo.setDescription('Subido por ' + quien + ' desde Control Interno, el ' +
          Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'));
      }
    } catch (e) { /* no-op */ }
    return archivo;
  }

  return {
    guardarArchivoAppSheet, guardarImagenAppSheet, archivoDeRuta, urlDeRuta, previsualizarRuta,
    archivoDeRutaProfunda, urlDeRutaProfunda, previsualizarRutaProfunda, eliminar, compartirLoMasAmplioPosible,
    marcarAutor, carpetaEnRaiz, carpetaEnRaizSiExiste, carpetaDelAnio,
  };
})();
