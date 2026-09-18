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

  /** Índices de equipos y líneas para los listados (caché 30 min). */
  function indice(token) {
    Auth.validarSesion(token);
    const ix = LineasRepo.indice();
    return { equipos: Object.assign({ generadoEn: ix.generadoEn }, ix.equipos), lineas: ix.lineas };
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
    });
  }

  /** Resumen ligero de inspecciones/responsivas para tablas (sin checklist completo). */
  function resumirEvidencias_(docs) {
    return (docs || []).map((d) => {
      const pdf = d.pdf && d.pdf.id ? d.pdf.id : (d.drive && d.drive.pdfs && d.drive.pdfs.length ? d.drive.pdfs[0].id : null);
      return {
        id: d._id, origen: d.origen, fecha: d.fecha, calificacion: d.calificacion === undefined ? null : d.calificacion,
        alertas: (d.alertas || []).length, inspector: d.inspector || d.responsableCI || null,
        pdfPendiente: d.origen === 'SISTEMA' && !pdf,
        responsable: d.snapshot ? d.snapshot.responsable : (d.responsable ? d.responsable.nombre : null),
        fotos: d.drive ? d.drive.fotos : 0, carpetaId: d.drive ? d.drive.carpetaId : null, pdfId: pdf,
      };
    }).sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  }

  /** Inspecciones y responsivas de un registro. */
  function evidencias(token, id) {
    Auth.validarSesion(token);
    const ev = LineasRepo.evidenciasDeRegistro(id);
    return LineasUtil.paraCliente({ inspecciones: resumirEvidencias_(ev.inspecciones), responsivas: resumirEvidencias_(ev.responsivas) });
  }

  /** Historial de un registro (bitácora, reasignaciones, desechos y operaciones del sistema). */
  function historial(token, id) {
    const sesion = Auth.validarSesion(token);
    return LineasUtil.paraCliente(LineasRepo.historialDeRegistro(id, puedeVerSecretos_(sesion)));
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

  /** Detalle de inspección con checklist, alertas y fotos de Drive. */
  function inspeccion(token, id) {
    const sesion = Auth.validarSesion(token);
    const insp = LineasRepo.leerInspeccion(id);
    if (!insp) throw new Error('No existe la inspección ' + id);
    let eq = null;
    if (insp.registroId) {
      const f = LineasRepo.leerRegistroPorId(insp.registroId);
      const r = f ? LineasRepo.convertirRegistro(f) : null;
      if (r && r.equipo) eq = { _id: r.id, nuco: r.equipo.nuco, modelo: r.equipo.modelo, imei: r.equipo.imei, tipo: r.equipo.tipo };
    }

    const fotos = [];
    const firmas = [];
    if (insp.drive) {
      const vistos = {};
      [insp.drive.fotosCarpetaId, insp.drive.carpetaId].filter(Boolean).forEach((c) => {
        archivosCarpeta_(c, 200).forEach((f) => {
          if (vistos[f.id]) return;
          vistos[f.id] = true;
          if (!/^(image|video)\//.test(f.mimeType)) return;
          const item = { id: f.id, nombre: f.name, miniatura: f.thumbnailLink || null, enlace: f.webViewLink, video: /^video\//.test(f.mimeType) };
          if (/^(FIRMA|PATRON)/i.test(f.name)) firmas.push(item);
          else fotos.push(item);
        });
      });
    }
    return LineasUtil.paraCliente({
      inspeccion: insp,
      equipo: eq,
      checklist: LineasChecklist.secciones(),
      fotos: fotos,
      firmas: puedeVerSecretos_(sesion) ? firmas : [],
      pdfs: insp.drive && insp.drive.pdfs ? insp.drive.pdfs : [],
      puedeOperar: rolesOperan_().indexOf(sesion.rol) >= 0,
    });
  }

  /** Catálogos para formularios (enums + LISTAS TELEFONOS + lugares de desecho). */
  function catalogos(token) {
    Auth.validarSesion(token);
    return LineasRepo.catalogos();
  }

  /** Inspecciones con alertas contra la anterior (para seguimiento). */
  function alertas(token) {
    Auth.validarSesion(token);
    return LineasRepo.alertasInspeccion();
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

  /** Reactivación, Solicitud y Post Venta, conservando las tablas del AppSheet. */
  function vistaOperativa(token, tipo, opciones) {
    const sesion = Auth.validarSesion(token);
    return LineasUtil.paraCliente(LineasRepo.vistaOperativa(tipo, opciones || {}, puedeVerSecretos_(sesion)));
  }

  function crearVistaOperativa(token, tipo, datos) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasRepo.crearVistaOperativa(tipo, datos || {}, usuarioOperacion_(sesion));
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
    return LineasUtil.paraCliente(LineasCaptura.contextoInspeccion(ref, usuarioOperacion_(sesion)));
  }

  /** Datos precargados para el formulario de una responsiva nueva. */
  function contextoResponsiva(token, ref) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasCaptura.contextoResponsiva(ref, usuarioOperacion_(sesion)));
  }

  /** Crea la carpeta de evidencia en Drive (NUCOS) para una inspección o responsiva nueva. */
  function prepararEvidencia(token, tipo, ref) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    if (tipo !== 'INSPECCION' && tipo !== 'RESPONSIVA') throw new Error('Tipo de evidencia inválido.');
    const obj = LineasCaptura.objetivo(ref);
    const nuco = obj.reg.nuco || ('LINEA ' + (obj.linea && obj.linea.numero || ''));
    return LineasUtil.paraCliente(LineasEvidencias.prepararCarpetaEvidencia(tipo, nuco, new Date(), sesion.correo));
  }

  /** Sube una foto o firma (base64) a una carpeta de evidencia ya preparada. */
  function subirArchivo(token, carpetaId, nombre, mime, base64) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasEvidencias.subirArchivo(sesion.correo, carpetaId, nombre, mime, base64));
  }

  /** Descarta una carpeta creada para una captura que el usuario canceló. */
  function cancelarEvidencia(token, carpetaId, fotosCarpetaId) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasEvidencias.cancelarCarpetaEvidencia(sesion.correo, carpetaId, fotosCarpetaId);
  }

  /** Guarda una inspección nueva (checklist, snapshot, alertas y bitácora). El PDF se pide aparte. */
  function guardarInspeccion(token, datos) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasCaptura.guardarInspeccion(datos, usuarioOperacion_(sesion)));
  }

  /** Guarda una responsiva nueva. El PDF se pide aparte. */
  function guardarResponsiva(token, datos) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasCaptura.guardarResponsiva(datos, usuarioOperacion_(sesion)));
  }

  /** Genera (o regenera) el PDF de una inspección/responsiva capturada en el sistema. */
  function generarPdf(token, tipo, id, forzar) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    return LineasUtil.paraCliente(LineasCaptura.generarPdf(tipo, id, !!forzar, usuarioOperacion_(sesion)));
  }

  return {
    permisos, indice, equipo, linea, evidencias, historial, inspeccion, catalogos, alertas, colaboradores, bitacora, vistaOperativa, crearVistaOperativa, recargarDatos,
    contextoInspeccion, contextoResponsiva, prepararEvidencia, cancelarEvidencia, subirArchivo, guardarInspeccion, guardarResponsiva, generarPdf,
  };
})();
