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
 *   ExpedienteNuco.archivar(archivo, nucco, 'ALTA', { subcarpeta: 'BAJAS', prefijo: 'BAJA' })
 *                                                                → 3.-ALTA DE PLACAS/BAJAS/BAJA-0088.pdf (no toca la vigente)
 *
 * Lo que llega de los módulos (12-oct-2026, plan "Vehículos: todo por NUCO"): la hoja guarda la LIGA del archivo.
 *   ExpedienteNuco.carpetaInspeccion(nucco, fecha)    → 4.-INSPECCIONES/<año>/<N> TRIMESTRE (antes de 2026, BIMESTRE)
 *   ExpedienteNuco.carpetaVerificacion(nucco, fecha)  → 3.-VERIFICACIONES/<año>/<1ER|2DO> SEMESTRE
 *   ExpedienteNuco.carpeta(nucco, 'RESPONSIVA', ['SENSORES'])  (o ['FIRMAS']) → 5.-RESPONSIVA/SENSORES
 *   ExpedienteNuco.guardar(blob, carpeta, 'VERIFICACION', nucco, fecha) → VERIFICACION-0088 2026-06-11.png
 *   Los periodos son las reglas de la homologación (tools/nucos/homologar_insp.py y verificaciones.py).
 *
 * De dónde sale NUCOS VEHICULOS: DRIVE_FOLDER_ID_NUCOS_VEHICULOS en Entornos.gs (producción: la real). Sin eso
 * (un DEV), una carpeta "NUCOS VEHICULOS" de pruebas en la raíz de ESE proyecto: un DEV nunca escribe en la real.
 *
 * Archivar MUEVE el archivo (no lo copia): conserva su ID, así que la liga que guarda la hoja sigue abriendo.
 * Nada corre al cargar el archivo.
 */
const ExpedienteNuco = (function () {
  // La estructura (carpetas, documentos, periodos) y el buscador viven en Expediente.gs, tipo 'vehiculo' (6-nov): aquí
  // queda lo propio de Vehículos (archivar con anteriores, nombres SEGURO-0088, leer la pestaña Documentos).
  const TIPO = 'vehiculo';
  const def_ = () => Expediente.TIPOS[TIPO];
  const ADHERENTES = 'ADHERENTES';
  const PRESTAMOS = 'PRESTAMOS';
  const SENSORES = 'SENSORES';
  const FIRMAS = 'FIRMAS';
  const FIRMAS_Y_DIAGRAMAS = 'FIRMAS Y DIAGRAMAS';

  // Reconocer una carpeta aunque su nombre traiga espacios o acentos de más: DriveUtils (la misma regla en todo el sistema)
  const clave_ = (nombre) => DriveUtils.claveCarpeta(nombre);
  const subcarpeta_ = (padre, nombre) => DriveUtils.subcarpeta(padre, nombre);

  /** "88", "0088" y 88 son el mismo NUCO; la carpeta se llama sin ceros, como las que ya existen */
  const nombreNuco_ = (nucco) => def_().clave(nucco);

  /** La carpeta del NUCO; si no existe (un vehículo nuevo), se crea con toda la estructura */
  function carpetaNuco(nucco) {
    return Expediente.carpetaActivo(TIPO, nucco);
  }

  function definicion_(documento) {
    const d = def_().archivos[documento];
    if (!d) throw new Error('Documento desconocido para el expediente: ' + documento);
    return d;
  }

  /** La carpeta de un documento ("RESPONSIVA" → <NUCO>/1.-DOCUMENTACIÓN/5.-RESPONSIVA), más subcarpetas si se piden */
  function carpeta(nucco, documento, subcarpetas) {
    definicion_(documento);
    return Expediente.carpetaDocumento(TIPO, nucco, documento, null, subcarpetas).carpeta;
  }

  function extension_(nombre) {
    const m = /\.([A-Za-z0-9]{2,4})$/.exec(nombre || '');
    return m ? '.' + m[1].toLowerCase() : '';
  }

  function existe_(carpetaDrive, nombre) {
    return carpetaDrive.getFilesByName(nombre).hasNext();
  }

  /** ¿Tiene NUCCO (número)? Sin él no hay expediente: quien guarda usa su carpeta de antes */
  function tieneNuco(nucco) {
    return /^\d+$/.test(String(nucco == null ? '' : nucco).trim());
  }

  const fecha_ = (f, formato) => Utilities.formatDate(f || new Date(), Session.getScriptTimeZone(), formato);

  /** Periodo de una inspección (trimestre desde 2026) y semestre de una verificación: las reglas de Expediente.gs */
  const periodoInspeccion = (fecha) => Expediente.periodoInspeccion(fecha);
  const semestreVerificacion = (fecha) => Expediente.semestreVerificacion(fecha);

  /** <NUCO>/4.-INSPECCIONES/<año>/<trimestre> y <NUCO>/3.-VERIFICACIONES/<año>/<semestre> (las crea si faltan) */
  function carpetaInspeccion(nucco, fecha) {
    return Expediente.carpetaDocumento(TIPO, nucco, 'INSPECCION', fecha).carpeta;
  }
  function carpetaVerificacion(nucco, fecha) {
    return Expediente.carpetaDocumento(TIPO, nucco, 'VERIFICACION', fecha).carpeta;
  }

  /** PREFIJO-0088 2026-06-11.ext; si ya existe, (2), (3)… Para lo que se acumula por fecha (inspecciones, verificaciones) */
  function nombreConFecha(carpetaDrive, prefijo, nucco, ext, fecha) {
    const base = prefijo + '-' + ('0000' + nombreNuco_(nucco)).slice(-4) + ' ' + fecha_(fecha, 'yyyy-MM-dd');
    if (!existe_(carpetaDrive, base + ext)) return base + ext;
    let n = 2;
    while (existe_(carpetaDrive, base + ' (' + n + ')' + ext)) n++;
    return base + ' (' + n + ')' + ext;
  }

  /**
   * Crea un archivo en una carpeta del expediente con su nombre (nombreConFecha), anota quién lo subió y borra la copia
   * de la lectura del NUCO. El blob ya viene revisado (DriveUtils.blobRevisado). → File (getUrl() es lo que guarda la hoja)
   */
  function guardar(blob, carpetaDrive, prefijo, nucco, fecha, ext) {
    const extension = ext || extension_(blob.getName()) || '';
    const nombre = nombreConFecha(carpetaDrive, prefijo, nucco, extension, fecha);
    const archivo = DriveUtils.crearArchivo(carpetaDrive, blob, nombre);
    olvidar(nucco);
    return archivo;
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
        DriveUtils.mover(f, anteriores, nombre);
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
    olvidar(nucco);
    const op = opciones || {};
    const def = definicion_(documento);
    const ext = extension_(archivo.getName());
    const aparte = op.adherente ? { sub: ADHERENTES, prefijo: 'ADHERENTE' } : op.prestamo ? { sub: PRESTAMOS, prefijo: 'PRESTAMO' }
      : op.subcarpeta ? { sub: op.subcarpeta, prefijo: op.prefijo || def.prefijo } : null;
    if (aparte) {
      // Un adherente, un préstamo o una baja no es el documento vigente: va a su subcarpeta y no lo toca
      const destino = carpeta(nucco, documento, [aparte.sub]);
      const nombre = nombreLibre(destino, aparte.prefijo, nucco, ext, new Date());
      DriveUtils.mover(archivo, destino, nombre);
      return { carpetaId: destino.getId(), nombre: nombre };
    }
    const destino = carpeta(nucco, documento);
    apartarVigente_(destino, def, nucco, archivo.getId());
    const nombre = nombreLibre(destino, def.prefijo, nucco, ext, new Date());
    DriveUtils.mover(archivo, destino, nombre);
    return { carpetaId: destino.getId(), nombre: nombre };
  }

  const TITULOS = { FACTURA: 'Factura', SEGURO: 'Póliza de seguro', ALTA: 'Alta de placas', TARJETA: 'Tarjeta de circulación',
    RESPONSIVA: 'Responsiva', TENENCIA: 'Tenencia' };

  /**
   * La imagen de relleno que el área pone cuando no hay documento ("SEGURO-0001 NO APLICA.jpg", "CARPETA SIN
   * INFORMACIÓN.jpg"): no es un documento. → 'NO APLICA' | 'SIN INFORMACIÓN' | null (como tools/nucos/reglas.RELLENO)
   */
  function relleno_(nombre) {
    const n = clave_(nombre);
    if (/NOAPLICA/.test(n)) return 'NO APLICA';
    if (/SININFORMACI|NOTIENE/.test(n)) return 'SIN INFORMACIÓN';
    return null;
  }

  // ---- Leer el expediente rápido (12-oct-2026): la API de Drive por NIVELES (una consulta trae los hijos de hasta 40
  // carpetas) en vez de DriveApp carpeta por carpeta, y una copia de 10 min en CacheService (se borra al archivar).
  const CACHE_MIN = 600;
  const claveDocs_ = (n) => 'exp_docs_v1_' + n;
  const claveInsp_ = (n) => 'exp_insp_v1_' + n;
  const enCache_ = (clave) => { try { const v = CacheService.getScriptCache().get(clave); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const guardar_ = (clave, valor, seg) => {
    try { const t = JSON.stringify(valor); if (t.length < 95000) CacheService.getScriptCache().put(clave, t, seg); } catch (e) { /* sin copia: no pasa nada */ }
  };
  /** Después de archivar algo en el NUCO: la próxima lectura va a Drive */
  function olvidar(nucco) {
    try { CacheService.getScriptCache().removeAll([claveDocs_(nombreNuco_(nucco)), claveInsp_(nombreNuco_(nucco))]); } catch (e) { /* no-op */ }
  }

  /** El ID de la carpeta de un NUCO (el mapa de Expediente, 6 h; uno nuevo lo vuelve a leer) o null */
  const nucoId_ = (nucco) => Expediente.idActivo(TIPO, nucco);

  /** El árbol bajo una carpeta, una consulta por nivel → { hijos: {padre: [carpeta]}, archivos: {padre: [archivo]} } */
  function arbol_(raizId, niveles) {
    const t = { hijos: {}, archivos: {} };
    let nivel = [raizId];
    for (let n = 0; n < niveles && nivel.length; n++) {
      const sig = [];
      hijosDrive_(nivel).forEach((f) => {
        const padre = (f.parents || [])[0];
        if (f.mimeType === CARPETA_MIME) {
          (t.hijos[padre] = t.hijos[padre] || []).push({ id: f.id, nombre: f.name, url: f.webViewLink });
          sig.push(f.id);
        } else {
          (t.archivos[padre] = t.archivos[padre] || []).push({ id: f.id, nombre: f.name, url: f.webViewLink, mime: f.mimeType,
            fecha: f.createdTime || '' });
        }
      });
      nivel = sig;
    }
    return t;
  }
  const masNuevos_ = (l) => (l || []).slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const hija_ = (t, padre, nombre) => (t.hijos[padre] || []).find((c) => clave_(c.nombre) === clave_(nombre)) || null;

  /** Lo que hay en las subcarpetas (anteriores, adherentes, préstamos…), en grupos con su ruta */
  function grupos_(t, padre, ruta, out) {
    (t.hijos[padre] || []).forEach((c) => {
      const r = ruta.concat(c.nombre);
      const archivos = masNuevos_(t.archivos[c.id]).filter((a) => !relleno_(a.nombre));
      if (archivos.length) out.push({ grupo: r.join(' / '), raiz: r[0], archivos: archivos });
      grupos_(t, c.id, r, out);
    });
    return out;
  }

  /**
   * SOLO LECTURA: el expediente de un NUCO tal como está en Drive (no crea nada). Para la pestaña "Documentos" de la
   * ficha. → { existe, url, carpetas: [{nombre, url}], documentos: [{clave, titulo, url, vigentes, relleno,
   * anteriores: [{grupo, raiz, archivos}]}], otros: [{grupo, raiz, archivos}] }. Los archivos van del más nuevo al
   * más viejo. Quién puede ver qué lo decide quien llama.
   */
  function listar(nucco) {
    const n = nombreNuco_(nucco);
    const guardado = enCache_(claveDocs_(n));
    if (guardado) return guardado;
    const id = nucoId_(nucco);
    if (!id) return { existe: false, documentos: [], otros: [], carpetas: [] };
    const { documentacion: DOCUMENTACION, otras: OTRAS, archivos: DOCUMENTOS } = def_();
    const nivel1 = { hijos: {} };
    nivel1.hijos[id] = hijosDrive_([id]).filter((f) => f.mimeType === CARPETA_MIME).map((f) => ({ id: f.id, nombre: f.name, url: f.webViewLink }));
    const doc = hija_(nivel1, id, DOCUMENTACION);
    const carpetas = [DOCUMENTACION].concat(OTRAS).map((x) => hija_(nivel1, id, x)).filter(Boolean)
      .map((c) => ({ nombre: c.nombre, url: c.url }));
    const t = doc ? arbol_(doc.id, 5) : { hijos: {}, archivos: {} };
    const usadas = {};
    const documentos = Object.keys(DOCUMENTOS).map((k) => {
      const c = doc ? hija_(t, doc.id, DOCUMENTOS[k].carpeta) : null;
      if (c) usadas[c.id] = true;
      const todos = c ? masNuevos_(t.archivos[c.id]) : [];
      const vigentes = todos.filter((a) => !relleno_(a.nombre));
      // Sin documento, pero con la imagen de relleno: la sección dice "No aplica" / "Sin información"
      const relleno = !vigentes.length && todos.length ? relleno_(todos[0].nombre) : null;
      return { clave: k, titulo: TITULOS[k], url: c ? c.url : '', vigentes: vigentes, relleno: relleno,
        anteriores: c ? grupos_(t, c.id, [], []) : [] };
    });
    // Lo demás de 1.-DOCUMENTACIÓN (ANTERIORES: Oxxo Gas, permisos… y archivos sueltos)
    const otros = [];
    if (doc) {
      const sueltos = masNuevos_(t.archivos[doc.id]).filter((a) => !relleno_(a.nombre));
      if (sueltos.length) otros.push({ grupo: '(sueltos en ' + DOCUMENTACION + ')', raiz: '', archivos: sueltos });
      (t.hijos[doc.id] || []).filter((c) => !usadas[c.id]).forEach((c) => {
        const archivos = masNuevos_(t.archivos[c.id]).filter((a) => !relleno_(a.nombre));
        if (archivos.length) otros.push({ grupo: c.nombre, raiz: c.nombre, archivos: archivos });
        grupos_(t, c.id, [c.nombre], otros);
      });
    }
    const exp = { existe: true, nuco: n, url: 'https://drive.google.com/drive/folders/' + id, carpetas, documentos, otros };
    guardar_(claveDocs_(n), exp, CACHE_MIN);
    return exp;
  }

  const CARPETA_MIME = 'application/vnd.google-apps.folder';

  /** Hijos de varias carpetas a la vez (Expediente.hijos: una consulta por cada 40 padres), con miniatura */
  const CAMPOS_CONTAR = 'nextPageToken,files(id,mimeType,parents)';
  const hijosDrive_ = (padres, campos) => Expediente.hijos(padres, { campos: campos });

  /** "INSPECCION-0024 2026-07-09.pdf" o "POR BAJA 2025-06-23" → "2026-07-09" */
  const fechaEnNombre_ = (n) => ((/(20\d\d-\d\d-\d\d)/.exec(n || '') || [])[1] || '');

  /**
   * SOLO LECTURA: las inspecciones del expediente del NUCO (4.-INSPECCIONES, ya homologada: <año>/<periodo o motivo>/
   * <sección>/foto), SIN las fotos: solo cuántas hay (la tabla de la pestaña no necesita más y así la respuesta es chica,
   * cabe en la copia de 10 min y se precarga). Las fotos de una inspección: fotosInspeccion(nucco, id).
   * → [{ id, anio, nombre, fecha, url, pdfs: [{id, nombre, url}], secciones: [{nombre, fotos: número}], fotos }],
   * de la más nueva a la más vieja. Sin _POR REVISAR.
   */
  function inspecciones(nucco) {
    const n = nombreNuco_(nucco);
    const guardado = enCache_(claveInsp_(n));
    if (guardado) return guardado;
    const id = nucoId_(nucco);
    if (!id) return [];
    const raiz = hijosDrive_([id]).find((f) => f.mimeType === CARPETA_MIME && clave_(f.name) === clave_(def_().otras[2]));
    if (!raiz) return [];
    const anios = hijosDrive_([raiz.id]).filter((f) => f.mimeType === CARPETA_MIME && /^\s*20\d\d\s*$/.test(f.name));
    const insp = hijosDrive_(anios.map((a) => a.id)).filter((f) => f.mimeType === CARPETA_MIME);
    const anioDe = {};
    anios.forEach((a) => { anioDe[a.id] = a.name.trim(); });
    const porId = {};
    const lista = insp.map((c) => {
      const x = { id: c.id, anio: anioDe[c.parents[0]], nombre: c.name.trim(), fecha: fechaEnNombre_(c.name), url: c.webViewLink,
        pdfs: [], sueltos: 0, secciones: [], fotos: 0 };
      porId[c.id] = x;
      return x;
    });
    const seccionDe = {};
    hijosDrive_(insp.map((c) => c.id)).forEach((f) => {
      const x = porId[f.parents[0]];
      if (!x) return;
      if (f.mimeType === CARPETA_MIME) {
        const s_ = { nombre: f.name.trim(), fotos: 0 };
        x.secciones.push(s_);
        seccionDe[f.id] = s_;
      } else if (/pdf/.test(f.mimeType)) {
        x.pdfs.push({ id: f.id, nombre: f.name, url: f.webViewLink });
        if (!x.fecha) x.fecha = fechaEnNombre_(f.name);
      } else {
        x.sueltos++;
      }
    });
    // Las fotos de las secciones solo se CUENTAN (id, padre y tipo: lo mínimo que manda Drive)
    hijosDrive_(Object.keys(seccionDe), CAMPOS_CONTAR).forEach((f) => {
      const s_ = seccionDe[f.parents[0]];
      if (s_ && f.mimeType !== CARPETA_MIME) s_.fotos++;
    });
    lista.forEach((x) => {
      if (x.sueltos) x.secciones.unshift({ nombre: 'SIN SECCIÓN', fotos: x.sueltos });
      delete x.sueltos;
      x.secciones = x.secciones.filter((s_) => s_.fotos);
      x.fotos = x.secciones.reduce((k, s_) => k + s_.fotos, 0);
    });
    const ordenada = lista.sort((a, b) => ((b.fecha || b.anio + '-00') > (a.fecha || a.anio + '-00') ? 1 : -1));
    guardar_(claveInsp_(n), ordenada, CACHE_MIN);
    return ordenada;
  }

  /**
   * SOLO LECTURA: las fotos de UNA inspección del expediente, por sección, con su miniatura de Drive. Solo de una
   * inspección de ese NUCO (la carpeta tiene que estar en inspecciones(nucco)). Copia de 10 min (las miniaturas duran horas).
   * → { secciones: [{ nombre, fotos: [{ id, nombre, mime, miniatura, enlace, fecha }] }] }
   */
  function fotosInspeccion(nucco, carpetaId) {
    const clave = 'exp_fotos_v1_' + carpetaId;
    const guardado = enCache_(clave);
    if (guardado) return guardado;
    if (!inspecciones(nucco).some((x) => x.id === carpetaId)) throw new Error('Esa inspección no es de este vehículo.');
    const archivo = (f) => ({ id: f.id, nombre: f.name, mime: f.mimeType, enlace: f.webViewLink,
      miniatura: f.thumbnailLink || null, fecha: f.createdTime || '' });
    const secciones = [];
    const sueltos = [];
    const seccionDe = {};
    hijosDrive_([carpetaId]).forEach((f) => {
      if (f.mimeType === CARPETA_MIME) { seccionDe[f.id] = { nombre: f.name.trim(), fotos: [] }; secciones.push(seccionDe[f.id]); }
      else if (!/pdf/.test(f.mimeType)) sueltos.push(archivo(f));
    });
    hijosDrive_(Object.keys(seccionDe)).forEach((f) => {
      const s_ = seccionDe[f.parents[0]];
      if (s_ && f.mimeType !== CARPETA_MIME) s_.fotos.push(archivo(f));
    });
    if (sueltos.length) secciones.unshift({ nombre: 'SIN SECCIÓN', fotos: sueltos });
    const r = { secciones: secciones.filter((s_) => s_.fotos.length) };
    guardar_(clave, r, CACHE_MIN);
    return r;
  }

  /** El ID de Drive dentro de una liga (o null): el mismo de DriveUtils */
  const idDeLiga = (liga) => DriveUtils.idDeLiga(liga);

  return { get DOCUMENTOS() { return def_().archivos; }, PRESTAMOS, ADHERENTES, SENSORES, FIRMAS, FIRMAS_Y_DIAGRAMAS, listar, inspecciones, fotosInspeccion,
    olvidar, carpetaNuco, carpeta, archivar, nombreLibre, idDeLiga, tieneNuco, periodoInspeccion, semestreVerificacion,
    carpetaInspeccion, carpetaVerificacion, nombreConFecha, guardar, subcarpeta: subcarpeta_ };
})();
