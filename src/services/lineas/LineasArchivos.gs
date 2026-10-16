/**
 * LineasArchivos.gs
 * Carpetas de Drive que usa Líneas y archivos que el AppSheet guarda como ruta relativa.
 *
 * Solo hay dos carpetas (Script Properties; si faltan se usan las que indicó el usuario el 28-sep):
 *   LINEAS_DRIVE_APPSHEET   carpeta de la app AppSheet (en DEV: "PruebasCONTROLVEHICYTELEF-172665033", la de la hoja
 *                           VEHICULOS). Ahí están "<TABLA>_Files_", "<TABLA>_Images", "INSPECCIONES_Files_" y "Files".
 *                           Se lee y se ESCRIBE aquí, con las mismas rutas que usa el AppSheet.
 *   LINEAS_DRIVE_NUCOS      carpeta NUCOS de producción (una carpeta por NUCO; solo en el bloque de producción de
 *                           Entornos.gs: un DEV sin la clave usa una "NUCOS TELEFONICOS" de pruebas en su raíz y nunca
 *                           escribe en la real; revisarEntorno avisa si un DEV apunta a ella). La ficha la muestra en "Documentos"
 *                           y, desde el corte a producción (2-oct-2026), las inspecciones y responsivas nuevas
 *                           guardan ahí su PDF y sus fotos, con la misma estructura que llena el área a mano:
 *                             <NUCO>/INSPECCIONES/<AÑO>/<N> CUATRIMESTRE/<MES>/INSP DD MM/  (+ FOTOS)
 *                             <NUCO>/CARTA RESPONSIVA/<AÑO>/RESP DD MM/
 *                           Un registro sin NUCO sigue en la carpeta de la app.
 *   LINEAS_DRIVE_LINEAS     carpeta LINEAS, junto a NUCOS (pendiente 2.45, 15-oct): la responsiva de una línea sin
 *                           equipo va a la carpeta de su línea, no a NUCOS (que es de los equipos):
 *                             <NÚMERO>/CARTA RESPONSIVA/<AÑO>/RESP DD MM/
 *                           En producción se configura (la crea el área junto a NUCOS, con sus permisos); en un DEV sin
 *                           la clave es una carpeta «LINEAS» dentro de la de pruebas.
 *
 * Una columna File/Image/Signature del AppSheet guarda "BITACORA DE DESECHO_Files_/xxxx.EVIDENCIA.123.jpg":
 * se resuelve caminando desde la carpeta de la app (nunca sale de ella).
 */

const LineasArchivos = (function () {
  const APPSHEET_POR_OMISION = '1FsC5mloJNhi_TR7pBX1KMEjUZfN_M9OM';
  // Sin LINEAS_DRIVE_NUCOS (un DEV): una "NUCOS TELEFONICOS" de pruebas en la raíz de ESE proyecto, como ExpedienteNuco.
  // Antes caía al ID de NUCOS de producción y un DEV sin la clave escribía ahí sus inspecciones y responsivas (15-oct).
  const NUCOS_PRUEBAS = 'NUCOS TELEFONICOS';
  const ZONA = 'America/Mexico_City';
  const SEG_CACHE = 21600;
  // Archivos con secretos (patrón, contraseña) y firmas: solo quien puede ver secretos
  const RUTA_SECRETA = /\.(PATRON|CONTRASE(Ñ|N)A|FIRMA[ _A-Z]*)\.[^/]*$/i;
  const TIPOS_PERMITIDOS = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;
  const EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };

  const prop_ = (clave) => leerConfig_(clave);   // config/Entornos.gs o Script Properties
  function carpetaAppSheetId() { return prop_('LINEAS_DRIVE_APPSHEET') || APPSHEET_POR_OMISION; }
  function carpetaNucosId() { return prop_('LINEAS_DRIVE_NUCOS') || DriveUtils.carpetaEnRaiz(NUCOS_PRUEBAS).getId(); }
  /**
   * Dónde se buscan los archivos del AppSheet: la carpeta de la app y, si está configurada, otra solo para leer
   * (el DEV escribe en una carpeta de pruebas, pero su libro es copia de producción y sus rutas son de la app real).
   */
  function carpetasLectura_() {
    const lectura = prop_('LINEAS_DRIVE_APPSHEET_LECTURA');
    return [carpetaAppSheetId()].concat(lectura && lectura !== carpetaAppSheetId() ? [lectura] : []);
  }

  /** Id de Drive dentro de un enlace (file/d/<id>, open?id=<id>, uc?id=<id>). */
  function idDeUrl(v) {
    const m = String(v || '').match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{20,})/);
    return m ? m[1] : null;
  }

  function clave_(texto) {
    return 'ln_arch_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, texto, Utilities.Charset.UTF_8));
  }

  /** Subcarpeta por nombre (la crea si no existe). */
  const subcarpeta_ = (padre, nombre) => DriveUtils.subcarpeta(padre, nombre);

  /** Carpeta de la app "<ruta>" ("INSPECCIONES_Files_", "Files", …); la crea si no existe. */
  function carpetaDeApp(ruta) {
    return String(ruta).split('/').filter(Boolean).reduce((c, parte) => subcarpeta_(c, parte), DriveApp.getFolderById(carpetaAppSheetId()));
  }

  /**
   * Ruta del AppSheet tal como se busca en su carpeta. Además de "TABLA_Images/archivo.png" la hoja trae enlaces del
   * AppSheet (template/gettablefileurl o image/getimageurl, con la ruta en fileName) y rutas con la tabla delante
   * ("INSPECCIONES LINEAS::INSPECCIONES LINEAS_Images/…", lo que copiaba un bot de otra tabla). null si el enlace no se lee.
   */
  function rutaAppSheet(ruta) {
    let v = String(ruta || '').trim();
    const enlace = /appsheet\.com\/(template\/gettablefileurl|image\/getimageurl)/i.test(v) && v.match(/[?&]fileName=([^&#]+)/i);
    if (enlace) {
      try { v = decodeURIComponent(enlace[1].replace(/\+/g, ' ')).trim(); } catch (e) { return null; }
    }
    return /^https?:/i.test(v) ? v : v.replace(/^[^\/]*::/, '').trim();
  }

  /**
   * Archivo de una ruta del AppSheet (o de un enlace de Drive) → { id, nombre, url } o null si no existe.
   * `puedeVerSecretos` false → rechaza patrones, contraseñas y firmas.
   */
  function resolver(ruta, puedeVerSecretos) {
    const v = rutaAppSheet(ruta);
    if (!v) return null;
    if (!puedeVerSecretos && RUTA_SECRETA.test(v)) throw new Error('Este archivo solo lo ven administradores y el área de Líneas.');
    const id = idDeUrl(v);
    if (id) return { id: id, nombre: v, url: 'https://drive.google.com/file/d/' + id + '/view' };
    if (/^https?:/i.test(v)) return { id: null, nombre: v, url: v };
    const partes = v.split('/').map((p) => p.trim()).filter(Boolean);
    if (partes.length < 2 || partes.some((p) => p === '..' || p === '.')) return null;

    const raices = carpetasLectura_();
    const cache = CacheService.getScriptCache();
    const k = clave_(raices.join(',') + '|' + v);
    const guardado = cache.get(k);
    if (guardado) return guardado === '-' ? null : JSON.parse(guardado);

    const nombre = partes.pop();
    const comoArchivo = (f) => ({ id: f.getId(), nombre: f.getName(), url: f.getUrl() });
    let encontrado = null;
    // 1) La ruta tal cual, desde cada carpeta raíz
    for (let r = 0; r < raices.length && !encontrado; r++) {
      let carpeta = DriveApp.getFolderById(raices[r]);
      for (let i = 0; i < partes.length && carpeta; i++) {
        const it = carpeta.getFoldersByName(partes[i]);
        carpeta = it.hasNext() ? it.next() : null;
      }
      const archivos = carpeta ? carpeta.getFilesByName(nombre) : null;
      if (archivos && archivos.hasNext()) encontrado = comoArchivo(archivos.next());
    }
    // 2) Si no está donde dice la ruta: el nombre exacto (único: llave + columna + hora) en cualquier subcarpeta de
    //    esas raíces. Nunca un archivo de fuera de la app.
    if (!encontrado) {
      const it = DriveApp.searchFiles('title = "' + nombre.replace(/["\\]/g, '\\$&') + '" and trashed = false');
      for (let n = 0; n < 10 && it.hasNext() && !encontrado; n++) {
        const f = it.next();
        const padres = f.getParents();
        const padre = padres.hasNext() ? padres.next().getId() : null;
        if (padre && raices.some((raiz) => estaDentroDe(padre, raiz))) encontrado = comoArchivo(f);
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
    const archivo = DriveUtils.marcarAutor(carpetaDeApp(carpeta).createFile(Utilities.newBlob(bytes, mime, nombre)));
    compartirEnDominio(archivo);
    return carpeta + '/' + nombre;
  }

  /**
   * Abre al dominio (solo ver) un archivo que la app crea fuera de NUCOS y LINEAS: sin esto, si su carpeta no lo comparte,
   * solo lo ve la cuenta que despliega la app. Si Drive no deja cambiar cómo se comparte («Acceso denegado: DriveApp»,
   * 16-oct: la responsiva de la línea 4461456715 en `Files`, con la cuenta de producción), el archivo ya se guardó y se
   * queda con los permisos de su carpeta: no es error. Regresa si lo compartió.
   */
  function compartirEnDominio(archivo) {
    try {
      archivo.setSharing(DriveApp.Access.DOMAIN, DriveApp.Permission.VIEW);
      return true;
    } catch (e) {
      console.warn('No se pudo compartir con el dominio el archivo ' + archivo.getId() + ': ' + e.message);
      return false;
    }
  }

  // ---------------- NUCOS (producción): lectura ----------------

  /**
   * files.list de Drive con el servicio avanzado (appsscript.json), no con UrlFetchApp (7-oct): Líneas solo depende del
   * permiso de Drive, que toda la app necesita. UrlFetchApp pide además el de servicios externos; si quien despliega no
   * lo dio (v65), las fotos y los PDF dejan de funcionar para todos. `opciones` = q, pageSize, orderBy, fields, pageToken.
   */
  function listarDrive(opciones) {
    const parametros = { supportsAllDrives: true, includeItemsFromAllDrives: true };
    Object.keys(opciones).forEach((k) => { if (opciones[k] != null) parametros[k] = opciones[k]; }); // sin pageToken vacío
    return Drive.Files.list(parametros);
  }

  /** NUCO → id de su carpeta dentro de NUCOS (subcarpetas con nombre numérico). Caché 6 h. */
  function carpetasNucos() {
    const enCache = LineasDatos.cacheLeer('carpetas_nucos_v2');
    if (enCache) return enCache;
    const mapa = {};
    let pagina = null;
    do {
      const r = listarDrive({
        q: "'" + carpetaNucosId() + "' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        pageSize: 1000, fields: 'nextPageToken,files(id,name)', pageToken: pagina || undefined,
      });
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
          const r = listarDrive({
            q: '(' + padres.map((p) => "'" + p + "' in parents").join(' or ') + ') and trashed = false',
            pageSize: 1000, orderBy: 'name',
            fields: 'nextPageToken,files(id,name,mimeType,parents,thumbnailLink,webViewLink,modifiedTime)',
            pageToken: pagina || undefined,
          });
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

  // ---------------- Escritura en LINEAS: la carpeta de cada línea sin equipo (pendiente 2.45, 15-oct) ----------------

  /**
   * Carpeta LINEAS: la de Entornos.gs. Sin ella, en producción no hay dónde guardar (truena: la crea el área junto a
   * NUCOS y su ID va en LINEAS_DRIVE_LINEAS); en un DEV, «LINEAS» dentro de la carpeta de pruebas.
   */
  function carpetaLineasId() {
    const id = prop_('LINEAS_DRIVE_LINEAS');
    if (id) return id;
    if (Config.ENTORNO === 'PROD') throw new Error('Falta la carpeta LINEAS en Drive (LINEAS_DRIVE_LINEAS en Entornos.gs).');
    return subcarpeta_(DriveApp.getFolderById(carpetaNucosId()), 'LINEAS').getId();
  }

  /**
   * ID de la línea → { id, nombre } de su carpeta dentro de LINEAS. La carpeta se reconoce por la propiedad `idLinea` de
   * Drive, no por su nombre: el número cambia (Editar, Cambiar línea, la carga del proveedor) y la compañía lo recicla
   * para otra línea. Caché 6 h.
   */
  function carpetasLineas() {
    const enCache = LineasDatos.cacheLeer('carpetas_lineas_v1');
    if (enCache) return enCache;
    const mapa = {};
    let pagina = null;
    do {
      const r = listarDrive({
        q: "'" + carpetaLineasId() + "' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        pageSize: 1000, fields: 'nextPageToken,files(id,name,properties)', pageToken: pagina || undefined,
      });
      (r.files || []).forEach((f) => {
        const idLinea = f.properties && f.properties.idLinea;
        if (idLinea) mapa[idLinea] = { id: f.id, nombre: f.name };
      });
      pagina = r.nextPageToken || null;
    } while (pagina);
    LineasDatos.cacheGuardar('carpetas_lineas_v1', mapa, SEG_CACHE);
    return mapa;
  }

  /** «4421234567» o, si ya hay otra carpeta con ese nombre (un número reciclado), «4421234567 (2)». */
  function nombreLibre_(padre, nombre, propiaId) {
    const ocupado = (n) => {
      const it = padre.getFoldersByName(n);
      while (it.hasNext()) { if (it.next().getId() !== propiaId) return true; }
      return false;
    };
    let candidato = nombre;
    for (let n = 2; ocupado(candidato); n++) candidato = nombre + ' (' + n + ')';
    return candidato;
  }

  /**
   * Carpeta de la línea en LINEAS, con el número de hoy como nombre. Se crea con su primera responsiva (no todas de
   * golpe; usuario, 15-oct) y, si el número cambió desde entonces, se renombra al usarla.
   */
  function carpetaDeLinea_(lineaId, numero) {
    const nombre = LineasUtil.digitos(numero);
    if (!lineaId) throw new Error('Falta la línea.');
    if (!nombre) throw new Error('La línea no tiene número: captúralo con Corregir.');
    let carpeta = null;
    const abrir = (x) => {
      try { const c = x ? DriveApp.getFolderById(x.id) : null; return c && !c.isTrashed() ? c : null; } catch (e) { return null; }
    };
    carpeta = abrir(carpetasLineas()[lineaId]);
    if (!carpeta) {
      LineasDatos.cacheBorrar('carpetas_lineas_v1');
      carpeta = abrir(carpetasLineas()[lineaId]);
    }
    const raiz = DriveApp.getFolderById(carpetaLineasId());
    if (!carpeta) {
      const nueva = Drive.Files.create({ name: nombreLibre_(raiz, nombre, null), mimeType: 'application/vnd.google-apps.folder',
        parents: [raiz.getId()], properties: { idLinea: String(lineaId) } }, null, { supportsAllDrives: true, fields: 'id' });
      LineasDatos.cacheBorrar('carpetas_lineas_v1');
      return DriveApp.getFolderById(nueva.id);
    }
    if (carpeta.getName().replace(/ \(\d+\)$/, '') !== nombre) {
      carpeta.setName(nombreLibre_(raiz, nombre, carpeta.getId()));
      LineasDatos.cacheBorrar('carpetas_lineas_v1');
    }
    return carpeta;
  }

  /** Id de la carpeta de la línea, si ya tiene (la ficha: «Ver carpeta en Drive»), o null. Sin LINEAS, null. */
  function carpetaLineaId(lineaId) {
    try {
      const x = lineaId ? carpetasLineas()[lineaId] : null;
      return x ? x.id : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Carpeta nueva de una responsiva de la línea sin equipo, del día `fecha`:
   *   LINEAS/<NÚMERO>/CARTA RESPONSIVA/<AÑO>/RESP DD MM   (el PDF «RESP <NÚMERO> DD MM.pdf» y las identificaciones)
   * Regresa { carpetaId, ruta, nombrePdf }, como carpetaEvidenciaNuco.
   */
  function carpetaEvidenciaLinea(lineaId, numero, fecha) {
    const f = fecha instanceof Date && !isNaN(fecha) ? fecha : new Date();
    const anio = Utilities.formatDate(f, ZONA, 'yyyy');
    const ddmm = Utilities.formatDate(f, ZONA, 'dd MM');
    const raizLinea = carpetaDeLinea_(lineaId, numero);
    const ramas = ['CARTA RESPONSIVA', anio];
    const carpeta = carpetaUnica_(ramas.reduce((c, nombre) => subcarpeta_(c, nombre), raizLinea), 'RESP ' + ddmm);
    return {
      carpetaId: carpeta.getId(),
      ruta: ['LINEAS', raizLinea.getName()].concat(ramas, [carpeta.getName()]).join('/'),
      nombrePdf: 'RESP ' + LineasUtil.digitos(numero) + ' ' + ddmm + '.pdf',
    };
  }

  /** ¿La carpeta está dentro de LINEAS? Sin LINEAS configurada, no. */
  function enLineas(carpetaId) {
    if (!carpetaId) return false;
    let raiz;
    try { raiz = carpetaLineasId(); } catch (e) { return false; }
    return estaDentroDe(carpetaId, raiz);
  }

  /**
   * Manda a la papelera la carpeta de una captura cancelada y las carpetas de año / cuatrimestre / mes que quedaron
   * vacías por ella (nunca la del NUCO, ni INSPECCIONES / CARTA RESPONSIVA). En LINEAS, también la de la línea si quedó
   * vacía (su primera responsiva no se guardó).
   */
  function descartarCarpeta(carpetaId) {
    const c = DriveApp.getFolderById(carpetaId);
    const dentroDeLineas = enLineas(carpetaId);
    const dentroDeNucos = !dentroDeLineas && estaDentroDe(carpetaId, carpetaNucosId());
    const padres = c.getParents();
    let padre = padres.hasNext() ? padres.next() : null;
    c.setTrashed(true);
    if (dentroDeLineas) {
      // RESP DD MM → <AÑO> → CARTA RESPONSIVA → <NÚMERO>; nunca LINEAS
      const raiz = carpetaLineasId();
      for (let n = 0; padre && n < 3 && padre.getId() !== raiz; n++) {
        if (padre.searchFiles('trashed = false').hasNext() || padre.searchFolders('trashed = false').hasNext()) break;
        const arriba = padre.getParents();
        const siguiente = arriba.hasNext() ? arriba.next() : null;
        padre.setTrashed(true);
        padre = siguiente;
      }
      LineasDatos.cacheBorrar('carpetas_lineas_v1');
      return;
    }
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

  /** Error si la carpeta no es de la app AppSheet, de NUCOS ni de LINEAS. */
  function exigirEscribible(carpetaId) {
    if (!carpetaId || !(estaDentroDe(carpetaId, carpetaAppSheetId()) || enNucos(carpetaId) || enLineas(carpetaId))) {
      throw new Error('Los archivos solo se pueden guardar en la carpeta de la app, en NUCOS o en LINEAS.');
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
    // Servicio avanzado de Drive, no UrlFetchApp (ver listarDrive)
    let ultima = null;
    try {
      ultima = (Drive.Revisions.list(archivoId, { pageSize: 1000, fields: 'revisions(id)' }).revisions || []).pop() || null;
    } catch (e) { /* sin historial: se reemplaza igual */ }
    if (ultima) {
      try {
        Drive.Revisions.update({ keepForever: true }, archivoId, ultima.id);
      } catch (e) {
        console.warn('reemplazarPdf ' + archivoId + ': la versión anterior no se marcó (' + e.message + ').');
      }
    }
    let r;
    try {
      r = Drive.Files.update({}, archivoId, Utilities.newBlob(bytes, 'application/pdf'), { supportsAllDrives: true, fields: 'id,name' });
    } catch (e) {
      throw new Error('No se pudo guardar el PDF en Drive (' + e.message + ').');
    }
    return { id: r.id, name: r.name };
  }

  /**
   * PDF ligado que ya no está en su carpeta (pendiente 2.18, NUCO 0726, 6-oct): quien no es dueño de un archivo y lo quita
   * de una carpeta (p. ej. al subir a mano en Drive otro con el mismo nombre) no lo borra, solo lo saca; queda suelto en
   * la unidad de la cuenta de la app, sin los permisos de la carpeta («Necesitas acceso»).
   * `lista` = [{ pdfId, carpetaId, nombre, prefijo }]. Regresa, en el mismo orden, el PDF que sí está en la carpeta
   * ({ id, nombre }: el del mismo nombre o, si no hay, el más reciente que empiece con `prefijo`) o null si el ligado sigue
   * ahí o si la carpeta no tiene otro. Se pregunta cada vez: si se recordara, quien abre la carpeta desde la ficha y
   * cambia el PDF a mano seguiría viendo el viejo (prueba del 6-oct). Una consulta por cada 40 carpetas (los PDF que
   * hay en ellas, lo más reciente primero): el ligado sigue ahí si sale en la de su carpeta. Si Drive no responde,
   * truena y no se decide nada.
   */
  function pdfsFueraDeCarpeta(lista) {
    const salida = lista.map(() => null);
    if (!lista.length) return salida;
    const enCarpeta = {};
    lista.forEach((x) => { enCarpeta[x.carpetaId] = []; });
    const carpetas = Object.keys(enCarpeta);
    for (let i = 0; i < carpetas.length; i += 40) {
      const grupo = carpetas.slice(i, i + 40);
      let pagina = null;
      do {
        const r = listarDrive({
          q: '(' + grupo.map((c) => "'" + c + "' in parents").join(' or ') + ") and trashed = false and mimeType = 'application/pdf'",
          orderBy: 'modifiedTime desc', pageSize: 1000, fields: 'nextPageToken,files(id,name,parents)',
          pageToken: pagina || undefined,
        });
        (r.files || []).forEach((a) => (a.parents || []).forEach((p) => { if (enCarpeta[p]) enCarpeta[p].push(a); }));
        pagina = r.nextPageToken || null;
      } while (pagina);
    }
    const mismo = (n) => String(n || '').trim().toUpperCase();
    lista.forEach((x, i) => {
      const pdfs = enCarpeta[x.carpetaId];
      if (pdfs.some((a) => a.id === x.pdfId)) return;
      const otros = pdfs.filter((a) => a.id !== x.pdfId);
      const elegido = otros.filter((a) => mismo(a.name) === mismo(x.nombre))[0] ||
        otros.filter((a) => x.prefijo && mismo(a.name).indexOf(mismo(x.prefijo)) === 0)[0];
      if (elegido) salida[i] = { id: elegido.id, nombre: elegido.name };
    });
    return salida;
  }

  return {
    carpetaAppSheetId, carpetaNucosId, carpetaDeApp, idDeUrl, rutaAppSheet, resolver, imagen, blob, guardarComoAppSheet, compartirEnDominio,
    carpetasNucos, archivosNuco, estaDentroDe, exigirEscribible, enNucos, carpetaEvidenciaNuco, descartarCarpeta, olvidarNuco,
    reemplazarPdf, pdfsFueraDeCarpeta, listarDrive, carpetaLineasId, carpetasLineas, carpetaLineaId, carpetaEvidenciaLinea, enLineas,
  };
})();
