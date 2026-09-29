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

  function rolesOperan_() {
    return [Config.ROLES.ADMIN, Config.ROLES.OPERADOR];
  }

  /** PIN, patrones y contraseñas de equipos: solo ADMIN. */
  function puedeVerSecretos_(sesion) {
    return sesion.rol === Config.ROLES.ADMIN;
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
    const sesion = Auth.validarSesion(token);
    return {
      puedeOperar: rolesOperan_().indexOf(sesion.rol) >= 0,
      puedeVerSecretos: puedeVerSecretos_(sesion),
      esAdmin: sesion.rol === Config.ROLES.ADMIN,
    };
  }

  /** Índices de equipos y líneas para los listados, con las columnas de la vista del AppSheet (caché 30 min). */
  function indice(token) {
    const sesion = Auth.validarSesion(token);
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
    const sesion = Auth.validarSesion(token);
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
    const sesion = Auth.validarSesion(token);
    const r = registro_(id);
    if (!r || !r.linea) throw new Error('No existe la línea ' + id);
    return LineasUtil.paraCliente({
      linea: ocultarSecretos_(r.linea, CAMPOS_SECRETOS_LINEA, sesion),
      equipo: ocultarSecretos_(r.equipo, CAMPOS_SECRETOS_EQUIPO, sesion),
      detalles: r.detalles,
    });
  }

  /** Carpeta del NUCO del registro en NUCOS (caché 10 min por NUCO), sin firmas ni patrones si no es ADMIN. */
  function carpetaNucoDe_(id, sesion) {
    const f = LineasRepo.leerRegistroPorId(id);
    if (!f) throw new Error('No existe el registro ' + id);
    const nuco = LineasUtil.nuco4(LineasUtil.col(f, 'NUCO'));
    if (!nuco) return { nuco: null, carpetaId: null, grupos: [] };
    const clave = 'nucos_archivos_v2_' + nuco;
    let r = LineasDatos.cacheLeer(clave);
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
    const sesion = Auth.validarSesion(token);
    if (tipo !== 'INSPECCION' && tipo !== 'RESPONSIVA') throw new Error('Tipo de documento inválido.');
    const nombreTipo = tipo === 'INSPECCION' ? 'inspección' : 'responsiva';
    const r = carpetaNucoDe_(id, sesion);
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
    const sesion = Auth.validarSesion(token);
    const ev = LineasRepo.evidenciasDeRegistro(id);
    let nucos = [];
    try {
      nucos = evidenciasNucos_(id, sesion);
    } catch (e) {
      console.warn('evidencias NUCOS ' + id + ': ' + e.message); // sin acceso a NUCOS: solo lo de la hoja
    }
    const listas = { INSPECCION: ev.inspecciones, RESPONSIVA: ev.responsivas };
    const conCarpeta = {};
    ev.inspecciones.concat(ev.responsivas).forEach((d) => { if (d.drive && d.drive.carpetaId) conCarpeta[d.drive.carpetaId] = true; });
    nucos.forEach((n) => {
      if (conCarpeta[n.doc.drive.carpetaId]) return;
      const lista = listas[n.tipo];
      const mismoDia = lista.filter((d) => !(d.drive && d.drive.carpetaId) && d.fecha && dia_(d.fecha) === dia_(n.doc.fecha))[0];
      if (mismoDia) mismoDia.drive = n.doc.drive;
      else lista.push(n.doc);
    });
    return LineasUtil.paraCliente({ inspecciones: resumirEvidencias_(ev.inspecciones), responsivas: resumirEvidencias_(ev.responsivas) });
  }

  /**
   * Inspección que solo existe en NUCOS ("drive_<carpeta>"): fecha y NUCO de su ruta, su PDF y sus fotos. Solo
   * carpetas dentro de NUCOS.
   */
  function inspeccionNucos_(carpetaId) {
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
    const pdfs = ordenarPdfs_(archivos.filter((a) => /pdf/i.test(a.mimeType)).map((a) => ({ id: a.id, nombre: a.name })), 'INSPECCION');
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
    const sesion = Auth.validarSesion(token);
    return LineasUtil.paraCliente(LineasRepo.historialDeRegistro(id, puedeVerSecretos_(sesion)));
  }

  /** Números que ha tenido el NUCO del registro (vista 'equipo') o NUCOs por los que pasó su número (vista 'linea'). */
  function asignaciones(token, id, vista) {
    Auth.validarSesion(token);
    return LineasUtil.paraCliente(LineasRepo.asignacionesDeRegistro(id, vista));
  }

  /** Archivos de una carpeta de Drive (fotos/PDF) con miniaturas. */
  function archivosCarpeta_(carpetaId, limite) {
    const url = 'https://www.googleapis.com/drive/v3/files?' + [
      'q=' + encodeURIComponent("'" + carpetaId + "' in parents and trashed = false"),
      'pageSize=' + (limite || 200),
      'orderBy=name',
      'fields=' + encodeURIComponent('files(id,name,mimeType,thumbnailLink,webViewLink)'),
      'supportsAllDrives=true', 'includeItemsFromAllDrives=true',
    ].join('&');
    const resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return [];
    return JSON.parse(resp.getContentText()).files || [];
  }

  /**
   * Detalle de una inspección: datos, observaciones, fotos y PDF. Los archivos vienen de NUCOS: su carpeta, o la de
   * NUCOS del mismo día si la inspección es de la hoja y no tiene carpeta.
   */
  function inspeccion(token, id) {
    const sesion = Auth.validarSesion(token);
    const insp = LineasRepo.leerInspeccion(id) || (/^drive_/.test(id) ? inspeccionNucos_(id.slice(6)) : null);
    if (!insp) throw new Error('No existe la inspección ' + id);
    // PIN, patrón y firmas solo para ADMIN (igual que en la ficha)
    if (!puedeVerSecretos_(sesion)) {
      insp.pinEquipo = insp.pinEquipo ? '••••' : null;
      insp.patronRuta = insp.patronRuta ? '••••' : null;
      insp.firmas = null;
    }
    let eq = null;
    if (insp.registroId) {
      const f = LineasRepo.leerRegistroPorId(insp.registroId);
      const r = f ? LineasRepo.convertirRegistro(f) : null;
      if (r && r.equipo) eq = { _id: r.id, nuco: r.equipo.nuco, modelo: r.equipo.modelo, imei: r.equipo.imei, tipo: r.equipo.tipo };
    }

    if (!insp.drive && insp.registroId && insp.fecha) {
      try {
        const n = evidenciasNucos_(insp.registroId, sesion).filter((x) => x.tipo === 'INSPECCION' && dia_(x.doc.fecha) === dia_(insp.fecha))[0];
        if (n) insp.drive = n.doc.drive;
      } catch (e) {
        console.warn('inspección ' + id + ' en NUCOS: ' + e.message);
      }
    }

    const fotos = [];
    const pdfs = insp.drive && insp.drive.pdfs ? insp.drive.pdfs.slice() : [];
    // Fotos agregadas en el sistema a una inspección de NUCOS: viven en una carpeta de la app (APP_EVIDENCIAS)
    const carpetaExtra = /^drive_/.test(String(id)) ? carpetaFotosExtra_(id) : null;
    if (insp.drive || carpetaExtra) {
      const vistos = {};
      [insp.drive && insp.drive.fotosCarpetaId, insp.drive && insp.drive.carpetaId, carpetaExtra].filter(Boolean).forEach((c) => {
        archivosCarpeta_(c, 200).forEach((f) => {
          if (vistos[f.id]) return;
          vistos[f.id] = true;
          if (!/^(image|video)\//.test(f.mimeType)) return;
          if (/^(FIRMA|PATRON)/i.test(f.name)) return; // las firmas y el patrón solo van en el PDF
          fotos.push({ id: f.id, nombre: f.name, miniatura: f.thumbnailLink || null, enlace: f.webViewLink, video: /^video\//.test(f.mimeType) });
        });
      });
    }
    return LineasUtil.paraCliente({
      inspeccion: insp,
      equipo: eq,
      fotos: fotos,
      pdfs: pdfs,
      puedeOperar: rolesOperan_().indexOf(sesion.rol) >= 0,
    });
  }

  /**
   * Abre un archivo guardado por el AppSheet como ruta relativa ("BITACORA DE DESECHO_Files_/…"): lo busca en la
   * carpeta del AppSheet y regresa { id, nombre, url }. Patrones, contraseñas y firmas solo para ADMIN.
   */
  function archivo(token, ruta) {
    const sesion = Auth.validarSesion(token);
    const f = LineasArchivos.resolver(ruta, puedeVerSecretos_(sesion));
    if (!f) throw new Error('No se encontró el archivo en la carpeta del AppSheet: ' + String(ruta || '').split('/').pop());
    return f;
  }

  /** Catálogos para formularios (enums + LISTAS TELEFONOS + lugares de desecho). */
  function catalogos(token) {
    Auth.validarSesion(token);
    return LineasRepo.catalogos();
  }

  /** Catálogo de colaboradores para autocompletar. */
  function colaboradores(token) {
    Auth.validarSesion(token);
    return LineasRepo.indiceColaboradores();
  }

  /** Página de una bitácora de control: CAMBIOS | REASIGNACIONES | DESECHOS. */
  function bitacora(token, tipo, opciones) {
    const sesion = Auth.validarSesion(token);
    const o = opciones || {};
    return LineasUtil.paraCliente(LineasRepo.bitacora(tipo, o.q, o.pagina, o.porPagina, puedeVerSecretos_(sesion)));
  }

  /**
   * "Exportar a Excel": base completa del módulo (todas las filas y columnas de su pestaña).
   * Viaja comprimida (gzip en base64) salvo que el navegador no pueda descomprimir.
   */
  function exportarBase(token, modulo, comprimir) {
    const sesion = Auth.validarSesion(token);
    const json = JSON.stringify(LineasExportar.baseCompleta(modulo, puedeVerSecretos_(sesion)));
    if (!comprimir) return json;
    return Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(json, 'application/json')).getBytes());
  }

  /** Reactivación, Solicitud y Post Venta, conservando las tablas del AppSheet. */
  function vistaOperativa(token, tipo, opciones) {
    const sesion = Auth.validarSesion(token);
    return LineasUtil.paraCliente(LineasRepo.vistaOperativa(tipo, opciones || {}, puedeVerSecretos_(sesion)));
  }

  /** Formulario de alta de Reactivación / Solicitud tal como el del AppSheet. */
  function formularioOperativa(token, tipo) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasOperativas.formulario(tipo, usuarioOperacion_(sesion)));
  }

  /** Formulario de edición de un registro de Reactivación, Solicitud o Desecho (acción EDIT del AppSheet). */
  function formularioEdicionOperativa(token, tipo, fila, llave) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasOperativas.formularioEdicion(tipo, fila, llave, usuarioOperacion_(sesion)));
  }

  function editarVistaOperativa(token, tipo, fila, llave, datos) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasOperativas.editar(tipo, fila, llave, datos || {}, usuarioOperacion_(sesion)));
  }

  function crearVistaOperativa(token, tipo, datos) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasOperativas.crear(tipo, datos || {}, usuarioOperacion_(sesion));
  }

  /** Formulario de alta (id vacío) o edición de LINEAS TELEFONICAS, como el del AppSheet. */
  function formularioRegistro(token, id) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasRegistros.formulario(id || null, usuarioOperacion_(sesion), puedeVerSecretos_(sesion)));
  }

  function crearRegistro(token, datos) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasRegistros.crear(datos || {}, usuarioOperacion_(sesion)));
  }

  function editarRegistro(token, id, datos) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasRegistros.editar(id, datos || {}, usuarioOperacion_(sesion), puedeVerSecretos_(sesion)));
  }

  /** Cambio rápido de estatus del equipo o de la línea. */
  function cambiarEstatus(token, id, datos) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasRegistros.cambiarEstatus(id, datos || {}, usuarioOperacion_(sesion)));
  }

  /** Fotos de una inspección ya guardada: 'preparar' (carpeta autorizada) o 'actualizar' (recuento). */
  function fotosInspeccion(token, id, accion) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    if (accion !== 'preparar' && accion !== 'actualizar') throw new Error('Acción inválida.');
    // Inspección de la carpeta NUCOS: se valida que la carpeta sea de NUCOS y se pasa armada (las fotos van a la app)
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
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasCaptura.contextoInspeccion(ref, usuarioOperacion_(sesion), puedeVerSecretos_(sesion)));
  }

  /** Datos precargados para el formulario de una responsiva nueva. */
  function contextoResponsiva(token, ref) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasCaptura.contextoResponsiva(ref, usuarioOperacion_(sesion), puedeVerSecretos_(sesion)));
  }

  /** Crea la carpeta de evidencia en Drive (NUCOS) para una inspección o responsiva nueva. */
  function prepararEvidencia(token, tipo, ref, idRegistro) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    if (tipo !== 'INSPECCION' && tipo !== 'RESPONSIVA') throw new Error('Tipo de evidencia inválido.');
    LineasCaptura.objetivo(ref); // valida que el equipo o la línea existan
    return LineasUtil.paraCliente(LineasEvidencias.prepararCarpetaEvidencia(tipo, idRegistro, sesion.correo));
  }

  /** Sube una foto (base64) a la carpeta de fotos ya preparada. Las firmas llegan al guardar. */
  function subirArchivo(token, carpetaId, nombre, mime, base64) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasEvidencias.subirArchivo(sesion.correo, carpetaId, nombre, mime, base64));
  }

  /** Descarta una carpeta creada para una captura que el usuario canceló. */
  function cancelarEvidencia(token, carpetaId) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasEvidencias.cancelarCarpetaEvidencia(sesion.correo, carpetaId);
  }

  /** Guarda una inspección nueva (checklist, snapshot y bitácora). El PDF se pide aparte. */
  function guardarInspeccion(token, datos) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasCaptura.guardarInspeccion(datos, usuarioOperacion_(sesion), puedeVerSecretos_(sesion)));
  }

  /** Guarda una responsiva nueva. El PDF se pide aparte. */
  function guardarResponsiva(token, datos) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasCaptura.guardarResponsiva(datos, usuarioOperacion_(sesion), puedeVerSecretos_(sesion)));
  }

  /** Genera (o regenera) el PDF de una inspección/responsiva capturada en el sistema. */
  function generarPdf(token, tipo, id, forzar, firmas) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasCaptura.generarPdf(tipo, id, !!forzar, usuarioOperacion_(sesion), firmas || null));
  }

  /** Panorama de Líneas: equipos y líneas por estatus, hoy y al cierre de cada mes. */
  function panorama(token, forzar) {
    Auth.validarSesion(token);
    return LineasPanorama.panorama(!!forzar);
  }

  /** Acciones masivas de equipos (resguardo, reasignar, cancelar): formulario y aplicación. */
  function formularioMasivo(token, accion) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasRegistros.formularioMasivo(accion, usuarioOperacion_(sesion)));
  }

  function accionMasiva(token, accion, ids, datos) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasRegistros.accionMasiva(accion, ids, datos || {}, usuarioOperacion_(sesion)));
  }

  /** Notificaciones de la campana (adendum por vencer). Las ve cualquier sesión; cada quien marca las suyas. */
  function notificaciones(token, limite) {
    const sesion = Auth.validarSesion(token);
    return LineasUtil.paraCliente(LineasNotificaciones.bandeja(sesion.correo, Number(limite) || 0));
  }

  function marcarNotificaciones(token, ids) {
    const sesion = Auth.validarSesion(token);
    return LineasNotificaciones.marcarLeidas(sesion.correo, Array.isArray(ids) ? ids : null);
  }

  return {
    permisos, indice, equipo, linea, evidencias, historial, asignaciones, inspeccion, catalogos, colaboradores, bitacora, vistaOperativa, formularioOperativa, crearVistaOperativa, formularioRegistro, recargarDatos,
    contextoInspeccion, contextoResponsiva, prepararEvidencia, cancelarEvidencia, subirArchivo, guardarInspeccion, guardarResponsiva, generarPdf, crearRegistro, editarRegistro,
    cambiarEstatus, fotosInspeccion, exportarBase, archivo, ultimoDocumentoNuco,
    formularioEdicionOperativa, editarVistaOperativa, notificaciones, marcarNotificaciones, formularioMasivo, accionMasiva, panorama,
  };
})();
