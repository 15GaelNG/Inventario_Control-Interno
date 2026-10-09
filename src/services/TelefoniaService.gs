/**
 * TelefoniaService.gs
 * Fachada del módulo de Líneas (equipos y líneas telefónicas) para ClientApi.gs.
 * Valida la sesión y el rol en el servidor; la lógica vive en services/lineas/:
 *   LineasDatos       acceso a la hoja (caché, búsquedas, escritura por lotes)
 *   LineasUtil        normalización de valores del AppSheet
 *   LineasChecklist   checklist de inspección de equipo
 *   LineasRepo        traducción hoja ↔ modelo (equipo / línea / responsable) y bitácoras
 *
 * Hoja: Config.SPREADSHEET_IDS.TELEFONIA() — misma estructura que el AppSheet.
 */

const TelefoniaService = (function () {
  const CAMPOS_SECRETOS_EQUIPO = ['pinEquipo', 'patronRuta', 'contrasenaModem'];
  const CAMPOS_SECRETOS_LINEA = ['pinWhatsapp'];

  /**
   * Los datos de equipos y líneas los comparten varios módulos (Líneas Telefónicas, su Panorama,
   * Resguardos, Gestión de Activos…): para LEER basta con ver uno. Para modificarlos manda
   * 'lineas-telefonicas', como en AppSheet, donde la edición se decidía por tabla y no por vista.
   */
  const MODULOS_LINEAS = ['lineas-telefonicas', 'panorama-lineas', 'resguardos-lineas', 'correcciones-lineas',
    'cambios-lineas', 'accesorios-lineas', 'gestion-activos'];
  const MODULO_OPERAR = 'lineas-telefonicas';
  const MODULO_RESGUARDOS = 'resguardos-lineas';

  const leer_ = (token) => Permisos.puedeLeerAlguno(token, MODULOS_LINEAS);
  const operar_ = (token) => Permisos.puedeEditar(token, MODULO_OPERAR);
  const puedeOperar_ = (sesion) => sesion.permisos[MODULO_OPERAR] === Permisos.EDICION;

  /**
   * PIN, patrones y contraseñas de equipos: ADMIN y el área de Líneas (usuario, 5-oct: la columna AREA de USUARIOS
   * = LINEAS; llega a la sesión como `departamento`).
   */
  const AREA_SECRETOS = 'LINEAS';
  function puedeVerSecretos_(sesion) {
    const area = String(sesion.departamento || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
    return sesion.rol === Config.ROLES.ADMIN || area === AREA_SECRETOS;
  }

  function ocultarSecretos_(doc, campos, sesion) {
    if (!doc) return doc;
    const puedeVer = puedeVerSecretos_(sesion);
    campos.forEach((c) => {
      if (c in doc) doc[c] = puedeVer ? doc[c] : (doc[c] ? '••••' : null);
    });
    doc._secretosVisibles = puedeVer;
    return doc;
  }

  /** Permisos del usuario dentro del módulo (la interfaz decide qué botones mostrar). */
  function permisos(token) {
    const sesion = leer_(token);
    return {
      puedeOperar: puedeOperar_(sesion),
      puedeVerSecretos: puedeVerSecretos_(sesion),
      esAdmin: sesion.rol === Config.ROLES.ADMIN,
      puedeAprobarResguardos: LineasResguardos.puedeAprobar(usuarioResguardo_(sesion)),
    };
  }

  /** Índices de equipos y líneas para los listados, con las columnas de la vista del AppSheet (caché 30 min). */
  function indice(token) {
    const sesion = leer_(token);
    const ix = LineasRepo.indice();
    let vista = ix.vista || { columnas: [], secretas: [], filas: [] };
    // PIN WHATSAPP / PIN EQUIPO: solo ADMIN (la caché es la misma para todos: se copia antes de ocultar)
    if (!puedeVerSecretos_(sesion)) {
      const posiciones = (vista.secretas || []).map((c) => vista.columnas.indexOf(c) + 1).filter((i) => i > 0);
      vista = Object.assign({}, vista, {
        filas: vista.filas.map((fila) => {
          if (!posiciones.some((i) => fila[i])) return fila;
          const copia = fila.slice();
          posiciones.forEach((i) => { if (copia[i]) copia[i] = '••••'; });
          return copia;
        }),
      });
    }
    return { equipos: Object.assign({ generadoEn: ix.generadoEn }, ix.equipos), lineas: ix.lineas, vista: vista };
  }

  function registro_(id) {
    const f = LineasRepo.leerRegistroPorId(id);
    return f ? LineasRepo.convertirRegistro(f, LineasUtil.carpetasNucos()) : null;
  }

  /** Ficha de un equipo con su línea (evidencias e historial se piden aparte, en paralelo). */
  function equipo(token, id) {
    const sesion = leer_(token);
    const r = registro_(id);
    if (!r || !r.equipo) throw new Error('No existe el equipo ' + id);
    return LineasUtil.paraCliente({
      equipo: ocultarSecretos_(r.equipo, CAMPOS_SECRETOS_EQUIPO, sesion),
      linea: ocultarSecretos_(r.linea, CAMPOS_SECRETOS_LINEA, sesion),
      detalles: r.detalles,
    });
  }

  /** Ficha de una línea con su equipo. */
  function linea(token, id) {
    const sesion = leer_(token);
    const r = registro_(id);
    if (!r || !r.linea) throw new Error('No existe la línea ' + id);
    return LineasUtil.paraCliente({
      linea: ocultarSecretos_(r.linea, CAMPOS_SECRETOS_LINEA, sesion),
      equipo: ocultarSecretos_(r.equipo, CAMPOS_SECRETOS_EQUIPO, sesion),
      detalles: r.detalles,
      // «Números de esta línea»: sus cambios de número (Editar línea, 8-oct)
      numeros: LineasRepo.numerosDeLinea(r.linea),
    });
  }

  /** Carpeta del NUCO del registro en NUCOS (caché 10 min por NUCO), sin firmas ni patrones si no es ADMIN. */
  /**
   * `soloTipo`: solo la rama INSPECCIONES o CARTA RESPONSIVA (para "Última …"). Si ya está en caché el NUCO completo
   * se usa ese; si no, se recorre solo esa rama (mucho más rápido) y se guarda aparte.
   */
  function carpetaNucoDe_(id, sesion, soloTipo) {
    const f = LineasRepo.leerRegistroPorId(id);
    if (!f) throw new Error('No existe el registro ' + id);
    const nuco = LineasUtil.nuco4(LineasUtil.col(f, 'NUCO'));
    if (!nuco) return { nuco: null, carpetaId: null, grupos: [] };
    const clave = 'nucos_archivos_v2_' + nuco;
    let r = LineasDatos.cacheLeer(clave);
    if (!r && soloTipo) {
      const claveRama = clave + '_' + soloTipo;
      r = LineasDatos.cacheLeer(claveRama);
      if (!r) {
        r = LineasUtil.paraCliente(LineasArchivos.archivosNuco(nuco, soloTipo));
        LineasDatos.cacheGuardar(claveRama, r, 600);
      }
    }
    if (!r) {
      r = LineasUtil.paraCliente(LineasArchivos.archivosNuco(nuco));
      LineasDatos.cacheGuardar(clave, r, 600);
    }
    let grupos = r.grupos;
    if (!puedeVerSecretos_(sesion)) {
      grupos = grupos.map((g) => Object.assign({}, g, { archivos: g.archivos.filter((a) => !/^(FIRMA|PATRON|CONTRASE)/i.test(a.nombre)) }))
        .filter((g) => g.archivos.length);
    }
    return { nuco: nuco, carpetaId: r.carpetaId, grupos: grupos };
  }

  /**
   * Última inspección o responsiva del registro en su carpeta de NUCOS (solo lectura): la carpeta más reciente de
   * INSPECCIONES o CARTA RESPONSIVA (fecha de su ruta: ".../2025/.../INSP 02 10") y su PDF; si esa carpeta no tiene
   * PDF, la carpeta. Botones "Última inspección" / "Última responsiva" de la tabla y de la ficha.
   */
  function ultimoDocumentoNuco(token, id, tipo) {
    const sesion = leer_(token);
    if (tipo !== 'INSPECCION' && tipo !== 'RESPONSIVA') throw new Error('Tipo de documento inválido.');
    const nombreTipo = tipo === 'INSPECCION' ? 'inspección' : 'responsiva';
    const r = carpetaNucoDe_(id, sesion, tipo);
    if (!r.nuco) throw new Error('Este registro no tiene NUCO: no tiene carpeta en NUCOS.');
    if (!r.carpetaId) throw new Error('No hay carpeta del NUCO ' + r.nuco + ' en NUCOS.');
    const grupos = r.grupos.filter((g) => g.tipo === tipo); // ya vienen de la más reciente a la más antigua
    if (!grupos.length) throw new Error('No hay ' + nombreTipo + ' en la carpeta NUCOS del NUCO ' + r.nuco + '.');
    const ultimos = grupos.filter((g) => g.fecha === grupos[0].fecha);
    const pdfs = [];
    ultimos.forEach((g) => g.archivos.forEach((a) => { if (esPdf_(a)) pdfs.push(a); }));
    ordenarPdfs_(pdfs, tipo);
    if (pdfs.length) return { nuco: r.nuco, fecha: grupos[0].fecha, nombre: pdfs[0].nombre, url: pdfs[0].enlace, carpeta: false };
    // Sin PDF: la carpeta de esa fecha (la de ruta más corta: "INSP 02 10" antes que "INSP 02 10/FOTOS")
    const carpeta = ultimos.slice().sort((a, b) => a.ruta.length - b.ruta.length)[0];
    return {
      nuco: r.nuco, fecha: grupos[0].fecha, nombre: carpeta.ruta.split('/').pop(), carpeta: true,
      url: 'https://drive.google.com/drive/folders/' + carpeta.carpetaId,
    };
  }

  const esPdf_ = (a) => /pdf/i.test(a.mime || '') || /\.pdf$/i.test(a.nombre || '');

  /** Primero el formato ("RESP 0005 02 01.pdf" / "INSP 0005 02 01.pdf"), no otros PDF de la carpeta (p. ej. "INE 0005.pdf"). */
  function ordenarPdfs_(pdfs, tipo) {
    const prefijo = tipo === 'INSPECCION' ? /^INSP/i : /^RESP/i;
    return pdfs.sort((a, b) => (prefijo.test(b.nombre) - prefijo.test(a.nombre)) || (String(a.fecha || '') < String(b.fecha || '') ? 1 : -1));
  }

  /**
   * Inspecciones y responsivas de la carpeta del NUCO en NUCOS (solo lectura), una por carpeta "INSP DD MM" /
   * "RESP DD MM" (junto con su FOTOS): fecha de la ruta, su PDF, número de fotos y la carpeta. Mismo modelo que las
   * históricas "solo en Drive" (origen DRIVE, id "drive_<carpeta>").
   */
  function evidenciasNucos_(id, sesion) {
    const r = carpetaNucoDe_(id, sesion);
    const eventos = {};
    r.grupos.forEach((g) => {
      if (g.tipo !== 'INSPECCION' && g.tipo !== 'RESPONSIVA') return;
      const partes = g.ruta.split('/');
      const i = partes.map((p) => /^(INSP|RESP)\s+\d/i.test(p.trim())).lastIndexOf(true);
      const clave = g.tipo + '|' + (i >= 0 ? partes.slice(0, i + 1).join('/') : g.ruta);
      const ev = eventos[clave] || (eventos[clave] = { tipo: g.tipo, fecha: g.fecha, carpetaId: null, fotosCarpetaId: null, pdfs: [], fotos: 0 });
      if (i < 0 || i === partes.length - 1) ev.carpetaId = g.carpetaId;
      else if (!ev.fotosCarpetaId) ev.fotosCarpetaId = g.carpetaId;
      g.archivos.forEach((a) => {
        if (esPdf_(a)) ev.pdfs.push(a);
        else if (/^(image|video)\//.test(a.mime || '') && !/^(FIRMA|PATRON)/i.test(a.nombre || '')) ev.fotos++;
      });
    });
    return Object.keys(eventos).map((k) => {
      const ev = eventos[k];
      const carpeta = ev.carpetaId || ev.fotosCarpetaId;
      return {
        tipo: ev.tipo,
        doc: {
          _id: 'drive_' + carpeta, origen: 'DRIVE', nuco: r.nuco, fecha: ev.fecha, calificacion: null,
          drive: { carpetaId: carpeta, fotosCarpetaId: ev.fotosCarpetaId, fotos: ev.fotos, pdfs: ordenarPdfs_(ev.pdfs, ev.tipo).map((a) => ({ id: a.id, nombre: a.nombre })) },
        },
      };
    });
  }

  /** Día "yyyy-MM-dd" de una fecha de la hoja (Date) o de NUCOS (texto ISO). */
  function dia_(v) {
    if (!v) return '';
    if (v instanceof Date) return Utilities.formatDate(v, LineasDatos.ZONA_APP, 'yyyy-MM-dd');
    return String(v).slice(0, 10);
  }

  /** Resumen ligero de inspecciones/responsivas para tablas (sin checklist completo). */
  function resumirEvidencias_(docs) {
    return (docs || []).map((d) => {
      const pdf = d.pdf && d.pdf.id ? d.pdf.id : (d.drive && d.drive.pdfs && d.drive.pdfs.length ? d.drive.pdfs[0].id : null);
      return {
        id: d._id, origen: d.origen, fecha: d.fecha, calificacion: d.calificacion === undefined ? null : d.calificacion,
        inspector: d.inspector || d.responsableCI || null,
        pdfPendiente: d.origen === 'SISTEMA' && !pdf,
        responsable: d.snapshot ? d.snapshot.responsable : (d.responsable ? d.responsable.nombre : null),
        fotos: d.drive ? d.drive.fotos : 0, carpetaId: d.drive ? d.drive.carpetaId : null, pdfId: pdf,
      };
    }).sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  }

  /**
   * Inspecciones y responsivas de un registro: las de la hoja (AppSheet y sistema) y las de la carpeta del NUCO en
   * NUCOS. Una de la hoja sin carpeta y del mismo día que una de NUCOS toma su PDF y su carpeta (no se repite).
   */
  function evidencias(token, id) {
    const sesion = leer_(token);
    const ev = LineasRepo.evidenciasDeRegistro(id);
    let nucos = [];
    try {
      nucos = evidenciasNucos_(id, sesion);
    } catch (e) {
      console.warn('evidencias NUCOS ' + id + ': ' + e.message); // sin acceso a NUCOS: solo lo de la hoja
    }
    const listas = { INSPECCION: ev.inspecciones, RESPONSIVA: ev.responsivas };
    // Las capturadas en el sistema ya tienen su carpeta en NUCOS (la de "INSP DD MM" o su FOTOS): no se repiten
    const conCarpeta = {};
    ev.inspecciones.concat(ev.responsivas).forEach((d) => {
      if (d.drive && d.drive.carpetaId) conCarpeta[d.drive.carpetaId] = true;
      if (d.drive && d.drive.fotosCarpetaId) conCarpeta[d.drive.fotosCarpetaId] = true;
    });
    nucos.forEach((n) => {
      if (conCarpeta[n.doc.drive.carpetaId] || (n.doc.drive.fotosCarpetaId && conCarpeta[n.doc.drive.fotosCarpetaId])) return;
      const lista = listas[n.tipo];
      const mismoDia = lista.filter((d) => !(d.drive && d.drive.carpetaId) && d.fecha && dia_(d.fecha) === dia_(n.doc.fecha))[0];
      if (mismoDia) mismoDia.drive = n.doc.drive;
      else lista.push(n.doc);
    });
    return LineasUtil.paraCliente({ inspecciones: resumirEvidencias_(ev.inspecciones), responsivas: resumirEvidencias_(ev.responsivas) });
  }

  /**
   * Inspección o responsiva que solo existe en NUCOS ("drive_<carpeta>"): fecha y NUCO de su ruta, su PDF y sus fotos.
   * Solo carpetas dentro de NUCOS.
   */
  function inspeccionNucos_(carpetaId) {
    return documentoNucos_(carpetaId, 'INSPECCION');
  }
  function documentoNucos_(carpetaId, tipo) {
    if (!LineasArchivos.estaDentroDe(carpetaId, LineasArchivos.carpetaNucosId())) return null;
    let carpeta = DriveApp.getFolderById(carpetaId);
    if (/^FOTOS$/i.test(carpeta.getName().trim()) && carpeta.getParents().hasNext()) carpeta = carpeta.getParents().next();
    const nombres = [];
    let nuco = null;
    for (let c = carpeta, n = 0; c && n < 10; n++) {
      const padres = c.getParents();
      const padre = padres.hasNext() ? padres.next() : null;
      if (padre && padre.getId() === LineasArchivos.carpetaNucosId()) nuco = LineasUtil.nuco4(c.getName());
      nombres.push(c.getName().trim());
      c = padre;
    }
    const anio = nombres.filter((x) => /^\d{4}$/.test(x) && x !== nuco)[0];
    const dm = nombres.map((x) => x.match(/^(?:INSP|RESP)\s+(\d{1,2})\s+(\d{1,2})\b/i)).filter(Boolean)[0];
    const archivos = archivosCarpeta_(carpeta.getId(), 200);
    const fotos = archivos.filter((a) => a.mimeType === 'application/vnd.google-apps.folder' && /^FOTOS$/i.test(a.name.trim()))[0];
    const pdfs = ordenarPdfs_(archivos.filter((a) => /pdf/i.test(a.mimeType)).map((a) => ({ id: a.id, nombre: a.name })), tipo || 'INSPECCION');
    let registroId = null;
    if (nuco) {
      const ix = LineasRepo.indice();
      const iNuco = ix.equipos.columnas.indexOf('nuco');
      const fila = ix.equipos.filas.filter((f) => f[iNuco] === nuco)[0];
      registroId = fila ? fila[0] : null;
    }
    return {
      _id: 'drive_' + carpetaId, origen: 'DRIVE', registroId: registroId, nuco: nuco,
      fecha: anio && dm ? new Date(Number(anio), Number(dm[2]) - 1, Number(dm[1]), 12) : null,
      checklist: {}, calificacion: null,
      drive: { carpetaId: carpeta.getId(), fotosCarpetaId: fotos ? fotos.id : null, pdfs: pdfs, fotos: 0 },
    };
  }

  /** Carpeta de fotos que el sistema le agregó a una inspección de NUCOS ("drive_<carpeta>"), o null. */
  function carpetaFotosExtra_(id) {
    const TAB_EV = LineasRepo.TAB.APP_EVID;
    if (!LineasDatos.existeTabla(TAB_EV)) return null;
    const filas = LineasDatos.buscarFilas(TAB_EV, 'ID_REGISTRO', id);
    if (!filas.length) return null;
    const f = LineasDatos.leerFilas([{ tabla: TAB_EV, filas: filas.slice(0, 1) }])[0][0];
    return String(f['FOTOS_CARPETA_ID'] || '').trim() || null;
  }

  /** Historial de un registro (bitácora, reasignaciones, desechos y operaciones del sistema). */
  function historial(token, id) {
    const sesion = leer_(token);
    return LineasUtil.paraCliente(LineasRepo.historialDeRegistro(id, puedeVerSecretos_(sesion)));
  }

  /** Números que ha tenido el NUCO del registro (vista 'equipo') o NUCOs por los que pasó su número (vista 'linea'). */
  function asignaciones(token, id, vista) {
    leer_(token);
    return LineasUtil.paraCliente(LineasRepo.asignacionesDeRegistro(id, vista));
  }

  /** Archivos de una carpeta de Drive (fotos/PDF) con miniaturas. */
  function archivosCarpeta_(carpetaId, limite) {
    try {
      return LineasArchivos.listarDrive({
        q: "'" + carpetaId + "' in parents and trashed = false", pageSize: limite || 200, orderBy: 'name',
        fields: 'files(id,name,mimeType,thumbnailLink,webViewLink)',
      }).files || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Detalle de una inspección: datos, observaciones, fotos y PDF. Los archivos vienen de NUCOS: su carpeta, o la de
   * NUCOS del mismo día si la inspección es de la hoja y no tiene carpeta.
   */
  function inspeccion(token, id) {
    return documento_(token, id, 'INSPECCION');
  }

  /** Página de una responsiva (usuario, 6-oct): como la de la inspección; sin fotos, que la responsiva no lleva. */
  function responsiva(token, id) {
    return documento_(token, id, 'RESPONSIVA');
  }

  function documento_(token, id, tipo) {
    const sesion = leer_(token);
    const esInspeccion = tipo === 'INSPECCION';
    const doc = (esInspeccion ? LineasRepo.leerInspeccion(id) : LineasRepo.leerResponsiva(id)) ||
      (/^drive_/.test(id) ? documentoNucos_(id.slice(6), tipo) : null);
    if (!doc) throw new Error('No existe ' + (esInspeccion ? 'la inspección ' : 'la responsiva ') + id);
    // PIN, patrón y firmas solo para ADMIN (igual que en la ficha)
    if (esInspeccion && !puedeVerSecretos_(sesion)) {
      doc.pinEquipo = doc.pinEquipo ? '••••' : null;
      doc.patronRuta = doc.patronRuta ? '••••' : null;
      doc.firmas = null;
    }
    let eq = null;
    if (doc.registroId) {
      const f = LineasRepo.leerRegistroPorId(doc.registroId);
      const r = f ? LineasRepo.convertirRegistro(f) : null;
      if (r && r.equipo) eq = { _id: r.id, nuco: r.equipo.nuco, modelo: r.equipo.modelo, imei: r.equipo.imei, tipo: r.equipo.tipo };
    }

    if (!doc.drive && doc.registroId && doc.fecha) {
      try {
        const n = evidenciasNucos_(doc.registroId, sesion).filter((x) => x.tipo === tipo && dia_(x.doc.fecha) === dia_(doc.fecha))[0];
        if (n) doc.drive = n.doc.drive;
      } catch (e) {
        console.warn((esInspeccion ? 'inspección ' : 'responsiva ') + id + ' en NUCOS: ' + e.message);
      }
    }

    const fotos = [];
    const pdfs = doc.drive && doc.drive.pdfs ? doc.drive.pdfs.slice() : [];
    // Fotos agregadas en el sistema a una inspección de NUCOS: viven en una carpeta de la app (APP_EVIDENCIAS)
    const carpetaExtra = esInspeccion && /^drive_/.test(String(id)) ? carpetaFotosExtra_(id) : null;
    if (esInspeccion && (doc.drive || carpetaExtra)) {
      const vistos = {};
      [doc.drive && doc.drive.fotosCarpetaId, doc.drive && doc.drive.carpetaId, carpetaExtra].filter(Boolean).forEach((c) => {
        archivosCarpeta_(c, 200).forEach((f) => {
          if (vistos[f.id]) return;
          vistos[f.id] = true;
          if (!/^(image|video)\//.test(f.mimeType)) return;
          if (/^(FIRMA|PATRON)/i.test(f.name)) return; // las firmas y el patrón solo van en el PDF
          fotos.push({ id: f.id, nombre: f.name, miniatura: f.thumbnailLink || null, enlace: f.webViewLink, video: /^video\//.test(f.mimeType) });
        });
      });
    }
    const salida = { equipo: eq, fotos: fotos, pdfs: pdfs, puedeOperar: puedeOperar_(sesion) };
    // Identificación de cada responsable, subida con la responsiva (usuario, 9-oct; pendiente 2.27)
    if (!esInspeccion) salida.identificaciones = LineasIdentificaciones.deResponsiva([id]);
    salida[esInspeccion ? 'inspeccion' : 'responsiva'] = doc;
    return LineasUtil.paraCliente(salida);
  }

  /**
   * Abre un archivo guardado por el AppSheet como ruta relativa ("BITACORA DE DESECHO_Files_/…"): lo busca en la
   * carpeta del AppSheet y regresa { id, nombre, url }. Patrones, contraseñas y firmas solo para ADMIN.
   */
  function archivo(token, ruta) {
    const sesion = leer_(token);
    const f = LineasArchivos.resolver(ruta, puedeVerSecretos_(sesion));
    if (!f) throw new Error('No se encontró el archivo en la carpeta del AppSheet: ' + String(ruta || '').split('/').pop());
    return f;
  }

  /**
   * Imagen del patrón capturado en AppSheet ("INSPECCIONES LINEAS_Images/xxxx.PATRON.123456.png") para verlo en la ficha
   * y en las capturas. Se ve mientras EQUIPOS.PATRON guarde esa ruta: al trazar uno en el sistema la columna guarda los
   * puntos ("1-5-9") y la imagen ya no se pide. Solo ADMIN y el área de Líneas.
   */
  function patronAppSheet(token, ruta) {
    const sesion = leer_(token);
    if (!puedeVerSecretos_(sesion)) throw new Error('El patrón solo lo ven administradores y el área de Líneas.');
    if (!/\.PATRON\.[^\/]*$/i.test(LineasArchivos.rutaAppSheet(ruta) || '')) throw new Error('No es un patrón del AppSheet.');
    const f = LineasArchivos.resolver(ruta, true);
    if (!f || !f.id) throw new Error('No se encontró el patrón en la carpeta del AppSheet.');
    const b = DriveApp.getFileById(f.id).getBlob();
    const tipo = b.getContentType() || '';
    if (!/^image\//.test(tipo)) throw new Error('El patrón del AppSheet no es una imagen.');
    const bytes = b.getBytes();
    if (bytes.length > 2 * 1024 * 1024) throw new Error('La imagen del patrón supera 2 MB.');
    return { imagen: 'data:' + tipo + ';base64,' + Utilities.base64Encode(bytes) };
  }

  /** Catálogos para formularios (enums + LISTAS TELEFONOS + lugares de desecho). */
  function catalogos(token) {
    leer_(token);
    return LineasRepo.catalogos();
  }

  /** Catálogo de colaboradores para autocompletar. */
  function colaboradores(token) {
    leer_(token);
    return LineasRepo.indiceColaboradores();
  }

  /** Página de una bitácora de control: CAMBIOS | REASIGNACIONES | DESECHOS. */
  function bitacora(token, tipo, opciones) {
    const sesion = leer_(token);
    const o = opciones || {};
    return LineasUtil.paraCliente(LineasRepo.bitacora(tipo, o.q, o.pagina, o.porPagina, puedeVerSecretos_(sesion)));
  }

  /**
   * "Exportar a Excel": base completa del módulo (todas las filas y columnas de su pestaña).
   * Viaja comprimida (gzip en base64) salvo que el navegador no pueda descomprimir.
   */
  function exportarBase(token, modulo, comprimir) {
    const sesion = leer_(token);
    const json = JSON.stringify(LineasExportar.baseCompleta(modulo, puedeVerSecretos_(sesion)));
    if (!comprimir) return json;
    return Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(json, 'application/json')).getBytes());
  }

  /** Formulario de alta (id vacío) o edición de LINEAS TELEFONICAS, como el del AppSheet. */
  /** parte (alta): EQUIPO o LINEA, según el botón (Agregar equipo / Agregar línea). */
  function formularioRegistro(token, id, parte) {
    const sesion = operar_(token);
    return LineasUtil.paraCliente(LineasRegistros.formulario(id || null, usuarioOperacion_(sesion), puedeVerSecretos_(sesion), parte));
  }

  function crearRegistro(token, datos) {
    const sesion = operar_(token);
    return LineasUtil.paraCliente(LineasRegistros.crear(datos || {}, usuarioOperacion_(sesion)));
  }

  function editarRegistro(token, id, datos) {
    const sesion = operar_(token);
    return LineasUtil.paraCliente(LineasRegistros.editar(id, datos || {}, usuarioOperacion_(sesion), puedeVerSecretos_(sesion)));
  }

  /** Vincular, cambiar o desvincular línea y equipo (LineasAcciones.vincular; etapa 3, 8-oct). */
  function vincular(token, datos) {
    const sesion = operar_(token);
    return LineasUtil.paraCliente(LineasAcciones.vincular(datos || {}, usuarioOperacion_(sesion), puedeVerSecretos_(sesion)));
  }

  /** Reasignar: la responsiva es la acción (LineasAcciones.reasignar). */
  function reasignar(token, responsiva) {
    const sesion = operar_(token);
    return LineasUtil.paraCliente(LineasAcciones.reasignar(responsiva || {}, usuarioOperacion_(sesion), puedeVerSecretos_(sesion)));
  }

  /** Fotos de una inspección ya guardada: 'preparar' (carpeta autorizada) o 'actualizar' (recuento). */
  function fotosInspeccion(token, id, accion) {
    const sesion = operar_(token);
    if (accion !== 'preparar' && accion !== 'actualizar') throw new Error('Acción inválida.');
    // Inspección de la carpeta NUCOS: se valida que la carpeta sea de NUCOS y se pasa armada (las fotos van a su FOTOS)
    const externa = /^drive_/.test(String(id)) ? inspeccionNucos_(String(id).slice(6)) : null;
    if (/^drive_/.test(String(id)) && !externa) throw new Error('No existe la inspección ' + id);
    return LineasUtil.paraCliente(LineasCaptura.fotosInspeccion(id, accion, sesion.correo, externa));
  }

  /** Vacía las cachés del módulo (después de editar la hoja a mano). Solo ADMIN. */
  function recargarDatos(token) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN]);
    LineasRepo.borrarCaches();
    return { ok: true };
  }

  // ---------------- Captura: inspección y responsiva nuevas ----------------

  function usuarioOperacion_(sesion) {
    return { correo: sesion.correo, nombre: sesion.nombre || sesion.correo };
  }

  /** Datos precargados para el formulario de una inspección nueva. */
  function contextoInspeccion(token, ref) {
    const sesion = operar_(token);
    return LineasUtil.paraCliente(LineasCaptura.contextoInspeccion(ref, usuarioOperacion_(sesion), puedeVerSecretos_(sesion)));
  }

  /** Datos precargados para el formulario de una responsiva nueva. */
  function contextoResponsiva(token, ref) {
    const sesion = operar_(token);
    return LineasUtil.paraCliente(LineasCaptura.contextoResponsiva(ref, usuarioOperacion_(sesion), puedeVerSecretos_(sesion)));
  }

  /** Crea la carpeta de evidencia en Drive (NUCOS, si el registro tiene NUCO) para una inspección nueva. */
  function prepararEvidencia(token, tipo, ref, idRegistro) {
    const sesion = operar_(token);
    if (tipo !== 'INSPECCION' && tipo !== 'RESPONSIVA') throw new Error('Tipo de evidencia inválido.');
    const obj = LineasCaptura.objetivo(ref); // valida que el equipo o la línea existan
    return LineasUtil.paraCliente(LineasEvidencias.prepararCarpetaEvidencia(tipo, idRegistro, sesion.correo, obj.reg.nuco, new Date()));
  }

  /** Sube una foto (base64) a la carpeta de fotos ya preparada. Las firmas llegan al guardar. */
  function subirArchivo(token, carpetaId, nombre, mime, base64) {
    const sesion = operar_(token);
    return LineasUtil.paraCliente(LineasEvidencias.subirArchivo(sesion.correo, carpetaId, nombre, mime, base64));
  }

  /** Descarta una carpeta creada para una captura que el usuario canceló. */
  function cancelarEvidencia(token, carpetaId) {
    const sesion = operar_(token);
    return LineasEvidencias.cancelarCarpetaEvidencia(sesion.correo, carpetaId);
  }

  /** Guarda una inspección nueva (checklist, snapshot y bitácora). El PDF se pide aparte. */
  function guardarInspeccion(token, datos) {
    const sesion = operar_(token);
    return LineasUtil.paraCliente(LineasCaptura.guardarInspeccion(datos, usuarioOperacion_(sesion), puedeVerSecretos_(sesion)));
  }

  /** Guarda una responsiva nueva. El PDF se pide aparte. */
  function guardarResponsiva(token, datos) {
    const sesion = operar_(token);
    return LineasUtil.paraCliente(LineasCaptura.guardarResponsiva(datos, usuarioOperacion_(sesion), puedeVerSecretos_(sesion)));
  }

  /** Genera (o regenera) el PDF de una inspección/responsiva capturada en el sistema. */
  function generarPdf(token, tipo, id, forzar, firmas) {
    const sesion = operar_(token);
    return LineasUtil.paraCliente(LineasCaptura.generarPdf(tipo, id, !!forzar, usuarioOperacion_(sesion), firmas || null));
  }

  /**
   * PDF firmado de una inspección o responsiva (usuario, 5-oct), del sistema, del AppSheet o de la carpeta NUCOS. Solo
   * documentos que Documentos le muestra a ese registro, y su PDF y su carpeta salen de ahí, no del cliente.
   */
  function subirPdfFirmado(token, registroId, tipo, docId, pdfId, base64) {
    const sesion = operar_(token);
    if (tipo !== 'INSPECCION' && tipo !== 'RESPONSIVA') throw new Error('Tipo de documento inválido.');
    const r = registro_(registroId);
    if (!r) throw new Error('No existe el registro ' + registroId);
    const docs = evidencias(token, registroId);
    const doc = (tipo === 'INSPECCION' ? docs.inspecciones : docs.responsivas).filter((d) => d.id === docId)[0];
    if (!doc || (pdfId && doc.pdfId !== pdfId)) throw new Error('El PDF no es de este registro.');
    return LineasUtil.paraCliente(LineasCaptura.subirPdfFirmado(r, {
      tipo: tipo, id: docId, origen: doc.origen, fecha: doc.fecha, pdfId: doc.pdfId, carpetaId: doc.carpetaId,
    }, base64, usuarioOperacion_(sesion)));
  }

  /** Panorama de Líneas: equipos y líneas por estatus, hoy y al cierre de cada mes. */
  function panorama(token, forzar) {
    leer_(token);
    return LineasPanorama.panorama(!!forzar);
  }

  /** Acciones masivas de equipos (resguardo, reasignar, cancelar): formulario y aplicación. */
  function formularioMasivo(token, accion) {
    const sesion = operar_(token);
    return LineasUtil.paraCliente(LineasRegistros.formularioMasivo(accion, usuarioOperacion_(sesion)));
  }

  function accionMasiva(token, accion, ids, datos) {
    const sesion = operar_(token);
    return LineasUtil.paraCliente(LineasRegistros.accionMasiva(accion, ids, datos || {}, usuarioOperacion_(sesion)));
  }

  /** Notificaciones de la campana. Cada quien marca las suyas; las de resguardos solo las ve quien aprueba. */
  function notificaciones(token, limite) {
    const sesion = Auth.validarSesion(token);
    const esAprobador = LineasResguardos.puedeAprobar(usuarioResguardo_(sesion));
    return LineasUtil.paraCliente(LineasNotificaciones.bandeja(sesion.correo, Number(limite) || 0, { esAprobador: esAprobador }));
  }

  // ---- Resguardo y bandeja de Pau (reunión con Líneas, 30-sep) ----

  function usuarioResguardo_(sesion) {
    return Object.assign(usuarioOperacion_(sesion), { esAdmin: sesion.rol === Config.ROLES.ADMIN });
  }

  /** Formulario de "Mandar a resguardo": datos de cada equipo y la propuesta de su línea. */
  function formularioResguardo(token, ids) {
    const sesion = Permisos.puedeEditar(token, MODULO_RESGUARDOS);
    return LineasUtil.paraCliente(LineasResguardos.formulario(ids, usuarioResguardo_(sesion)));
  }

  function mandarResguardo(token, ids, datos) {
    const sesion = Permisos.puedeEditar(token, MODULO_RESGUARDOS);
    return LineasUtil.paraCliente(LineasResguardos.mandar(ids, datos || {}, usuarioResguardo_(sesion)));
  }

  /** "Mandar a cancelación": una o varias líneas a la bandeja de cancelaciones sin mandar el equipo a resguardo. */
  function mandarCancelacion(token, ids, datos) {
    const sesion = Permisos.puedeEditar(token, MODULO_RESGUARDOS);
    return LineasUtil.paraCliente(LineasResguardos.mandarCancelacion(ids, datos || {}, usuarioResguardo_(sesion)));
  }

  /** Bandeja de resguardos y cancelaciones: la ve todo el módulo; los pasos solo quien aprueba. */
  function bandejaResguardos(token) {
    const sesion = Permisos.puedeLeer(token, MODULO_RESGUARDOS);
    return JSON.stringify(LineasUtil.paraCliente(LineasResguardos.bandeja(usuarioResguardo_(sesion))));
  }

  /** accion: RECIBIR | ENTREGAR | VENDIDO | CARTA_FIRMADA | CARTA_ENVIADA | CANCELADA. */
  function accionBandejaResguardo(token, accion, ids, datos) {
    // Cada paso además exige ser aprobador (LineasResguardos.exigirAprobador_)
    const sesion = Permisos.puedeLeer(token, MODULO_RESGUARDOS);
    const u = usuarioResguardo_(sesion);
    const d = datos || {};
    const R = LineasResguardos;
    const hacer = {
      RECIBIR: () => R.recibir(ids, u),
      ENTREGAR: () => R.entregar(ids, d, u),
      VENDIDO: () => R.vendido(ids, d, u),
      CARTA_FIRMADA: () => R.faseCancelacion(ids, R.FASE.FIRMADA, d, u),
      CARTA_ENVIADA: () => R.faseCancelacion(ids, R.FASE.ENVIADA, d, u),
      CANCELADA: () => R.confirmarCancelacion(ids, d, u),
    }[String(accion || '').toUpperCase()];
    if (!hacer) throw new Error('Acción desconocida: ' + accion);
    return LineasUtil.paraCliente(hacer());
  }

  function marcarNotificaciones(token, ids) {
    const sesion = Auth.validarSesion(token);
    return LineasNotificaciones.marcarLeidas(sesion.correo, Array.isArray(ids) ? ids : null);
  }

  return {
    permisos, indice, equipo, linea, evidencias, historial, asignaciones, inspeccion, responsiva, catalogos, colaboradores, bitacora, formularioRegistro, recargarDatos,
    contextoInspeccion, contextoResponsiva, prepararEvidencia, cancelarEvidencia, subirArchivo, guardarInspeccion, guardarResponsiva, generarPdf, subirPdfFirmado, crearRegistro, editarRegistro,
    reasignar, vincular, fotosInspeccion, exportarBase, archivo, patronAppSheet, ultimoDocumentoNuco,
    notificaciones, marcarNotificaciones, formularioMasivo, accionMasiva, panorama,
    formularioResguardo, mandarResguardo, mandarCancelacion, bandejaResguardos, accionBandejaResguardo,
    MODULOS_LINEAS,
  };
})();
