/**
 * ExpedienteNuco.gs — dónde se guarda cada documento de un vehículo: en la carpeta de su NUCO, dentro de
 * NUCOS VEHICULOS, con la estructura que pidió el área (junta del 8-oct-2026, docs/nucos-expediente.md):
 *
 *   <NUCO>/1.-DOCUMENTACIÓN/
 *      1.-FACTURA  2.-SEGURO  3.-ALTA DE PLACAS  4.-TARJETA DE CIRCULACIÓN  5.-RESPONSIVA  6.-TENENCIA
 *   <NUCO>/2.-SERVICIOS   3.-VERIFICACIONES   4.-INSPECCIONES
 *
 * Los nombres van sin espacio después del guion, como sus subcarpetas (11-oct-2026). Una carpeta se reconoce aunque
 * su nombre traiga espacios o acentos de más o de menos ("2.- SERVICIOS", "3.-VERIFICACIÓN ES"): nunca se crea
 * otra al lado de la que ya está.
 *
 * Es lo mismo que hace tools/nucos (que ordenó la carpeta real): si cambia una regla, cambia en los dos.
 *
 * Uso:
 *   ExpedienteNuco.archivar(archivo, nucco, 'SEGURO')            → 2.-SEGURO/SEGURO-0088.pdf; la póliza que estaba
 *                                                                  ahí pasa a SEGUROS ANTERIORES con su fecha
 *   ExpedienteNuco.archivar(archivo, nucco, 'RESPONSIVA', { adherente: true })   → 5.-RESPONSIVA/ADHERENTES/ADHERENTE-0088.pdf
 *   ExpedienteNuco.archivar(archivo, nucco, 'RESPONSIVA', { prestamo: true })    → 5.-RESPONSIVA/PRESTAMOS/PRESTAMO-0088 <fecha>.pdf
 *                                                                  (un préstamo NO desplaza a la responsiva vigente)
 *   ExpedienteNuco.carpeta(nucco, 'RESPONSIVA')                  → la carpeta (para generar un PDF directo ahí)
 *
 * De dónde sale NUCOS VEHICULOS: DRIVE_FOLDER_ID_NUCOS_VEHICULOS en Entornos.gs (producción: la real). Sin eso
 * (un DEV), una carpeta "NUCOS VEHICULOS" de pruebas en la raíz de ESE proyecto: un DEV nunca escribe en la real.
 *
 * Archivar MUEVE el archivo (no lo copia): conserva su ID, así que la liga que guarda la hoja sigue abriendo.
 * Nada corre al cargar el archivo.
 */
const ExpedienteNuco = (function () {
  const RAIZ_NOMBRE = 'NUCOS VEHICULOS';
  const DOCUMENTACION = '1.-DOCUMENTACIÓN';
  const OTRAS = ['2.-SERVICIOS', '3.-VERIFICACIONES', '4.-INSPECCIONES'];
  /** Cada documento: su carpeta, el prefijo del nombre y dónde van las versiones anteriores (null: se quedan junto) */
  const DOCUMENTOS = {
    FACTURA: { carpeta: '1.-FACTURA', prefijo: 'FACTURA', anteriores: null },
    SEGURO: { carpeta: '2.-SEGURO', prefijo: 'SEGURO', anteriores: 'SEGUROS ANTERIORES' },
    ALTA: { carpeta: '3.-ALTA DE PLACAS', prefijo: 'ALTA DE PLACAS', anteriores: null },
    TARJETA: { carpeta: '4.-TARJETA DE CIRCULACIÓN', prefijo: 'TARJETA DE CIRCULACION', anteriores: null },
    RESPONSIVA: { carpeta: '5.-RESPONSIVA', prefijo: 'RESPONSIVA', anteriores: 'RESPONSIVAS ANTERIORES' },
    TENENCIA: { carpeta: '6.-TENENCIA', prefijo: 'TENENCIA', anteriores: 'TENENCIAS ANTERIORES' },
  };
  const ADHERENTES = 'ADHERENTES';
  const PRESTAMOS = 'PRESTAMOS';

  function raiz_() {
    const id = Config.DRIVE_FOLDERS.NUCOS_VEHICULOS();
    return id ? DriveApp.getFolderById(id) : DriveUtils.carpetaEnRaiz(RAIZ_NOMBRE);
  }

  /** Para comparar nombres de carpeta: sin espacios ni acentos, en mayúsculas ("2.- Servicios" = "2.-SERVICIOS") */
  function clave_(nombre) {
    return String(nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').toUpperCase();
  }

  function subcarpeta_(padre, nombre) {
    const exacta = padre.getFoldersByName(nombre);
    if (exacta.hasNext()) return exacta.next();
    const buscada = clave_(nombre);
    const todas = padre.getFolders();
    while (todas.hasNext()) {
      const c = todas.next();
      if (clave_(c.getName()) === buscada) return c;
    }
    return padre.createFolder(nombre);
  }

  /** "88", "0088" y 88 son el mismo NUCO; la carpeta se llama sin ceros, como las que ya existen */
  function nombreNuco_(nucco) {
    const n = String(nucco == null ? '' : nucco).trim();
    if (!/^\d+$/.test(n)) throw new Error('El vehículo no tiene NUCCO: no se puede guardar en su expediente');
    return String(Number(n));
  }

  /** La carpeta del NUCO; si no existe (un vehículo nuevo), se crea con toda la estructura */
  function carpetaNuco(nucco) {
    const nombre = nombreNuco_(nucco);
    const nucos = raiz_();
    const hay = nucos.getFoldersByName(nombre);
    if (hay.hasNext()) return hay.next();
    const nueva = nucos.createFolder(nombre);
    const doc = nueva.createFolder(DOCUMENTACION);
    Object.keys(DOCUMENTOS).forEach((k) => doc.createFolder(DOCUMENTOS[k].carpeta));
    OTRAS.forEach((o) => nueva.createFolder(o));
    return nueva;
  }

  function definicion_(documento) {
    const d = DOCUMENTOS[documento];
    if (!d) throw new Error('Documento desconocido para el expediente: ' + documento);
    return d;
  }

  /** La carpeta de un documento ("RESPONSIVA" → <NUCO>/1.-DOCUMENTACIÓN/5.-RESPONSIVA), más subcarpetas si se piden */
  function carpeta(nucco, documento, subcarpetas) {
    let c = subcarpeta_(subcarpeta_(carpetaNuco(nucco), DOCUMENTACION), definicion_(documento).carpeta);
    (subcarpetas || []).forEach((s) => { c = subcarpeta_(c, s); });
    return c;
  }

  function extension_(nombre) {
    const m = /\.([A-Za-z0-9]{2,4})$/.exec(nombre || '');
    return m ? '.' + m[1].toLowerCase() : '';
  }

  function existe_(carpetaDrive, nombre) {
    return carpetaDrive.getFilesByName(nombre).hasNext();
  }

  /** SEGURO-0088.pdf; si ya hay uno, con la fecha; si también, (2), (3)… (como tools/nucos/reglas.nombre_final) */
  function nombreLibre(carpetaDrive, prefijo, nucco, ext, fecha) {
    const base = prefijo + '-' + ('0000' + nombreNuco_(nucco)).slice(-4);
    const conFecha = base + ' ' + Utilities.formatDate(fecha || new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (!existe_(carpetaDrive, base + ext)) return base + ext;
    if (!existe_(carpetaDrive, conFecha + ext)) return conFecha + ext;
    let n = 2;
    while (existe_(carpetaDrive, base + ' (' + n + ')' + ext)) n++;
    return base + ' (' + n + ')' + ext;
  }

  /**
   * Lo que hoy es el documento vigente (los archivos sueltos de la carpeta) pasa a la de anteriores, con su fecha
   * en el nombre. Lo que no se puede mover (de otra cuenta, sin permiso) se queda y se avisa en el log.
   */
  function apartarVigente_(carpetaDoc, def, nucco, nuevoId) {
    if (!def.anteriores) return;
    const anteriores = subcarpeta_(carpetaDoc, def.anteriores);
    const hay = carpetaDoc.getFiles();
    while (hay.hasNext()) {
      const f = hay.next();
      if (f.getId() === nuevoId) continue;
      try {
        const nombre = nombreLibre(anteriores, def.prefijo, nucco, extension_(f.getName()), f.getLastUpdated());
        f.moveTo(anteriores);
        f.setName(nombre);
      } catch (e) {
        console.error('Expediente NUCO ' + nucco + ': no se pudo pasar "' + f.getName() + '" a ' + def.anteriores + ': ' + e.message);
      }
    }
  }

  /**
   * Guarda un archivo de Drive en el expediente del NUCO: lo mueve a la carpeta de su documento y le pone su nombre.
   * Si el documento lleva "anteriores" (seguro, responsiva, tenencia), lo que estaba vigente pasa ahí. Un adherente
   * va a 5.-RESPONSIVA/ADHERENTES y no toca la responsiva vigente.
   * @return {{ carpetaId: string, nombre: string }}
   */
  function archivar(archivo, nucco, documento, opciones) {
    const op = opciones || {};
    const def = definicion_(documento);
    const ext = extension_(archivo.getName());
    if (op.adherente || op.prestamo) {
      // Un adherente o un préstamo no es la responsiva del dueño: va a su subcarpeta y no toca la vigente
      const destino = carpeta(nucco, 'RESPONSIVA', [op.adherente ? ADHERENTES : PRESTAMOS]);
      const nombre = nombreLibre(destino, op.adherente ? 'ADHERENTE' : 'PRESTAMO', nucco, ext, new Date());
      archivo.moveTo(destino);
      archivo.setName(nombre);
      return { carpetaId: destino.getId(), nombre: nombre };
    }
    const destino = carpeta(nucco, documento);
    apartarVigente_(destino, def, nucco, archivo.getId());
    const nombre = nombreLibre(destino, def.prefijo, nucco, ext, new Date());
    archivo.moveTo(destino);
    archivo.setName(nombre);
    return { carpetaId: destino.getId(), nombre: nombre };
  }

  const TITULOS = { FACTURA: 'Factura', SEGURO: 'Póliza de seguro', ALTA: 'Alta de placas', TARJETA: 'Tarjeta de circulación',
    RESPONSIVA: 'Responsiva', TENENCIA: 'Tenencia' };

  /** La carpeta hija que se llama así (tolerando espacios y acentos), o null. Nunca crea. */
  function buscar_(padre, nombre) {
    if (!padre) return null;
    const exacta = padre.getFoldersByName(nombre);
    if (exacta.hasNext()) return exacta.next();
    const buscada = clave_(nombre);
    const todas = padre.getFolders();
    while (todas.hasNext()) {
      const c = todas.next();
      if (clave_(c.getName()) === buscada) return c;
    }
    return null;
  }

  function archivos_(carpetaDrive) {
    const out = [];
    const it = carpetaDrive.getFiles();
    while (it.hasNext()) {
      const f = it.next();
      if (f.isTrashed && f.isTrashed()) continue;
      out.push({ id: f.getId(), nombre: f.getName(), url: f.getUrl(), mime: f.getMimeType(),
        fecha: (f.getDateCreated ? f.getDateCreated() : f.getLastUpdated()).toISOString() });
    }
    return out.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }

  /** Lo que hay en las subcarpetas (anteriores, adherentes, préstamos…), en grupos con su ruta */
  function grupos_(carpetaDrive, ruta, out, nivel) {
    const it = carpetaDrive.getFolders();
    while (it.hasNext()) {
      const c = it.next();
      if (c.isTrashed && c.isTrashed()) continue;
      const r = ruta.concat(c.getName());
      const archivos = archivos_(c);
      if (archivos.length) out.push({ grupo: r.join(' / '), raiz: r[0], archivos: archivos });
      if (nivel < 3) grupos_(c, r, out, nivel + 1);
    }
    return out;
  }

  /**
   * SOLO LECTURA: el expediente de un NUCO tal como está en Drive (no crea nada). Para la pestaña "Documentos
   * vehicular" de la ficha. → { existe, url, carpetas: [{nombre, url}], documentos: [{clave, titulo, url, vigentes,
   * anteriores: [{grupo, raiz, archivos}]}], otros: [{grupo, raiz, archivos}] }. Los archivos van del más nuevo al
   * más viejo. Quién puede ver qué (responsivas, préstamos, adherentes) lo decide quien llama.
   */
  function listar(nucco) {
    const nucos = raiz_();
    const hay = nucos.getFoldersByName(nombreNuco_(nucco));
    if (!hay.hasNext()) return { existe: false, documentos: [], otros: [], carpetas: [] };
    const nuco = hay.next();
    const doc = buscar_(nuco, DOCUMENTACION);
    const carpetas = [DOCUMENTACION].concat(OTRAS).map((n) => buscar_(nuco, n))
      .filter(Boolean).map((c) => ({ nombre: c.getName(), url: c.getUrl() }));
    const usadas = {};
    const documentos = Object.keys(DOCUMENTOS).map((k) => {
      const c = buscar_(doc, DOCUMENTOS[k].carpeta);
      if (c) usadas[c.getId()] = true;
      return { clave: k, titulo: TITULOS[k], url: c ? c.getUrl() : '', vigentes: c ? archivos_(c) : [],
        anteriores: c ? grupos_(c, [], [], 1) : [] };
    });
    // Lo demás de 1.-DOCUMENTACIÓN (ANTERIORES: Oxxo Gas, permisos… y archivos sueltos)
    const otros = [];
    if (doc) {
      const sueltos = archivos_(doc);
      if (sueltos.length) otros.push({ grupo: '(sueltos en ' + DOCUMENTACION + ')', raiz: '', archivos: sueltos });
      const it = doc.getFolders();
      while (it.hasNext()) {
        const c = it.next();
        if (usadas[c.getId()] || (c.isTrashed && c.isTrashed())) continue;
        const archivos = archivos_(c);
        if (archivos.length) otros.push({ grupo: c.getName(), raiz: c.getName(), archivos: archivos });
        grupos_(c, [c.getName()], otros, 2);
      }
    }
    return { existe: true, nuco: nombreNuco_(nucco), url: nuco.getUrl(), carpetas, documentos, otros };
  }

  const CARPETA_MIME = 'application/vnd.google-apps.folder';

  /** Hijos de varias carpetas a la vez (Drive API, una consulta por cada 40 padres), con miniatura */
  function hijosDrive_(padres) {
    const out = [];
    for (let i = 0; i < padres.length; i += 40) {
      const grupo = padres.slice(i, i + 40);
      let pagina = null;
      do {
        const r = Drive.Files.list({
          q: '(' + grupo.map((p) => "'" + p + "' in parents").join(' or ') + ') and trashed = false',
          pageSize: 1000, orderBy: 'name', supportsAllDrives: true, includeItemsFromAllDrives: true,
          fields: 'nextPageToken,files(id,name,mimeType,parents,thumbnailLink,webViewLink,createdTime)',
          pageToken: pagina || undefined,
        });
        (r.files || []).forEach((f) => out.push(f));
        pagina = r.nextPageToken;
      } while (pagina);
    }
    return out;
  }

  /** "INSPECCION-0024 2026-07-09.pdf" o "POR BAJA 2025-06-23" → "2026-07-09" */
  const fechaEnNombre_ = (n) => ((/(20\d\d-\d\d-\d\d)/.exec(n || '') || [])[1] || '');

  /**
   * SOLO LECTURA: las inspecciones del expediente del NUCO (4.-INSPECCIONES, ya homologada: <año>/<periodo o motivo>/
   * <sección>/foto). → [{ id, anio, nombre, fecha, url, pdfs: [{id, nombre, url}], secciones: [{nombre, fotos: [{id,
   * nombre, mime, miniatura, enlace}]}], fotos }], de la más nueva a la más vieja. Sin _POR REVISAR. Para la pestaña
   * Inspecciones de la ficha: junto con las de la app, y la vista de fotos de cada una.
   */
  function inspecciones(nucco) {
    const hay = raiz_().getFoldersByName(nombreNuco_(nucco));
    if (!hay.hasNext()) return [];
    const raiz = buscar_(hay.next(), OTRAS[2]);
    if (!raiz) return [];
    const archivo = (f) => ({ id: f.id, nombre: f.name, mime: f.mimeType, enlace: f.webViewLink,
      miniatura: f.thumbnailLink || null, fecha: f.createdTime || '' });
    const anios = hijosDrive_([raiz.getId()]).filter((f) => f.mimeType === CARPETA_MIME && /^\s*20\d\d\s*$/.test(f.name));
    const insp = hijosDrive_(anios.map((a) => a.id)).filter((f) => f.mimeType === CARPETA_MIME);
    const anioDe = {};
    anios.forEach((a) => { anioDe[a.id] = a.name.trim(); });
    const porId = {};
    const lista = insp.map((c) => {
      const x = { id: c.id, anio: anioDe[c.parents[0]], nombre: c.name.trim(), fecha: fechaEnNombre_(c.name), url: c.webViewLink,
        pdfs: [], sueltos: [], secciones: [], fotos: 0 };
      porId[c.id] = x;
      return x;
    });
    const nivel3 = hijosDrive_(insp.map((c) => c.id));
    const seccionDe = {};
    nivel3.forEach((f) => {
      const x = porId[f.parents[0]];
      if (!x) return;
      if (f.mimeType === CARPETA_MIME) {
        const s = { nombre: f.name.trim(), fotos: [] };
        x.secciones.push(s);
        seccionDe[f.id] = { x: x, s: s };
      } else if (/pdf/.test(f.mimeType)) {
        x.pdfs.push({ id: f.id, nombre: f.name, url: f.webViewLink });
        if (!x.fecha) x.fecha = fechaEnNombre_(f.name);
      } else {
        x.sueltos.push(archivo(f));
      }
    });
    hijosDrive_(Object.keys(seccionDe)).forEach((f) => {
      const d = seccionDe[f.parents[0]];
      if (!d || f.mimeType === CARPETA_MIME) return;
      d.s.fotos.push(archivo(f));
    });
    lista.forEach((x) => {
      if (x.sueltos.length) x.secciones.unshift({ nombre: 'SIN SECCIÓN', fotos: x.sueltos });
      delete x.sueltos;
      x.secciones = x.secciones.filter((s) => s.fotos.length);
      x.fotos = x.secciones.reduce((n, s) => n + s.fotos.length, 0);
    });
    return lista.sort((a, b) => ((b.fecha || b.anio + '-00') > (a.fecha || a.anio + '-00') ? 1 : -1));
  }

  /** El ID de Drive dentro de una liga (".../file/d/<id>/view", "...?id=<id>") o null si no es una liga de Drive */
  function idDeLiga(liga) {
    const m = /\/d\/([A-Za-z0-9_-]{20,})|[?&]id=([A-Za-z0-9_-]{20,})/.exec(String(liga || ''));
    return m ? (m[1] || m[2]) : null;
  }

  return { DOCUMENTOS, PRESTAMOS, ADHERENTES, listar, inspecciones, carpetaNuco, carpeta, archivar, nombreLibre, idDeLiga };
})();
