/**
 * LineasCaptura.gs
 * Captura de INSPECCIONES y RESPONSIVAS nuevas de equipo/línea (portado del prototipo).
 *
 * Flujo desde la interfaz:
 *   1. contextoInspeccion / contextoResponsiva   → datos precargados (equipo/línea, responsable, checklist)
 *   2. LineasEvidencias.prepararCarpetaEvidencia → crea la carpeta en NUCOS (misma estructura que producción)
 *   3. LineasEvidencias.subirArchivo (por cada foto) → archivo dentro de esa carpeta
 *      Las firmas viajan en memoria únicamente para insertarlas en el PDF; no se persisten en Drive.
 *   4. guardarInspeccion / guardarResponsiva     → fila nueva en INSPECCIONES LINEAS / RESPONSIVAS LINEAS
 *      (mismas columnas que el AppSheet) + actualización del registro + bitácora + APP_EVIDENCIAS
 *   5. generarPdf (después de guardar, para no bloquear la respuesta ~30-40 s con el PDF)
 */

const LineasCaptura = (function () {
  const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

  function urlArchivo_(id) {
    return id ? 'https://drive.google.com/file/d/' + id + '/view' : '';
  }
  function idDeUrlDrive_(url) {
    const m = /\/d\/([\w-]{20,})/.exec(String(url || ''));
    return m ? m[1] : null;
  }

  function blobBase64_(base64, nombre) {
    return base64 ? Utilities.newBlob(Utilities.base64Decode(String(base64)), 'image/png', nombre || 'firma.png') : null;
  }

  function firmasCache_(tipo, id, nuevas) {
    const clave = 'firmas_' + tipo + '_' + id;
    const serializadas = nuevas ? JSON.stringify(nuevas) : null;
    if (serializadas) {
      try { CacheService.getScriptCache().put(clave, serializadas, 21600); } catch (e) { console.warn('No se pudieron conservar temporalmente las firmas: ' + e.message); }
    }
    const raw = serializadas || CacheService.getScriptCache().get(clave);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  /** Registro objetivo a partir de { equipoId } o { lineaId } (línea suelta). */
  function objetivoCaptura_(ref) {
    const id = ref.equipoId || ref.lineaId;
    const fila = LineasRepo.leerRegistroObligatorio(id, ref.equipoId ? 'el equipo' : 'la línea');
    const reg = LineasRepo.convertirRegistro(fila);
    if (ref.equipoId && !reg.equipo) throw new Error('El registro no es un equipo.');
    if (!ref.equipoId && !reg.linea) throw new Error('No existe la línea.');
    if (!ref.equipoId && reg.equipo) throw new Error('La línea está en un equipo: captura desde el equipo.');
    return { fila: fila, reg: reg, equipo: reg.equipo, linea: reg.linea };
  }

  function responsableObjetivo_(obj) {
    return (obj.equipo ? obj.equipo.responsable : obj.linea && obj.linea.responsable) || {};
  }

  function inspeccionesPrevias_(registroId) {
    return LineasRepo.evidenciasDeRegistro(registroId).inspecciones
      .filter((i) => i.checklist && Object.keys(i.checklist).length)
      .sort((a, b) => (b.fecha || 0) - (a.fecha || 0));
  }

  function resumenEquipo_(e) {
    return e ? { nuco: e.nuco || null, estatus: e.estatus || null, lineaId: e.lineaId || null, responsable: e.responsable ? e.responsable.nombre || null : null } : null;
  }
  function resumenLinea_(l) {
    return l ? { numero: l.numero || null, estatus: l.estatus || null, equipoId: l.equipoId || null } : null;
  }

  /** Mismo resumen que arma Operaciones al registrar un movimiento (aquí solo hay un `guardarCambiosRegistro`). */
  function detalleCambios_(guardados) {
    const d = { idsCambios: [], idsReasignacion: [], cambios: [] };
    guardados.forEach((g) => {
      Array.prototype.push.apply(d.idsCambios, g.idsCambios);
      if (g.idReasignacion) d.idsReasignacion.push(g.idReasignacion);
      Array.prototype.push.apply(d.cambios, g.campos.map((c) => Object.assign({ nuco: g.nuco || null }, c)));
    });
    return d;
  }

  // ---------------- Contexto (precarga de formularios) ----------------

  function contextoInspeccion(ref, usuario) {
    const obj = objetivoCaptura_(ref);
    const anterior = inspeccionesPrevias_(obj.reg.id)[0] || null;
    return {
      equipo: obj.equipo, linea: obj.linea, responsable: responsableObjetivo_(obj),
      secciones: LineasChecklist.puntosAplicables(obj.equipo ? obj.equipo.tipo : null, !!obj.linea),
      escalas: LineasChecklist.ESCALAS,
      anterior: anterior ? { id: anterior._id, fecha: anterior.fecha, checklist: anterior.checklist, calificacion: anterior.calificacion } : null,
      inspector: usuario.nombre,
    };
  }

  function contextoResponsiva(ref, usuario) {
    const obj = objetivoCaptura_(ref);
    return { equipo: obj.equipo, linea: obj.linea, responsable: responsableObjetivo_(obj), nombreCI: usuario.nombre };
  }

  // ---------------- Inspección ----------------

  function guardarInspeccion(datos, usuario) {
    const ref = { equipoId: datos.equipoId || null, lineaId: datos.equipoId ? null : datos.lineaId };
    if (!datos.carpetaId) throw new Error('Falta la carpeta de evidencia.');
    if (!datos.firmaInspectorBase64) throw new Error('La firma del inspector es obligatoria.');
    LineasEvidencias.validarArchivosEnCarpeta(
      (datos.fotos || []).map((f) => f.id),
      [datos.carpetaId, datos.fotosCarpetaId].filter(Boolean)
    );

    const id = LineasDatos.nuevoIdCorto();
    const res = LineasDatos.conCandado(() => {
      const ahora = new Date();
      const obj = objetivoCaptura_(ref);
      const secciones = LineasChecklist.puntosAplicables(obj.equipo ? obj.equipo.tipo : null, !!obj.linea);

      // Solo se aceptan valores válidos de los puntos que aplican; todos son obligatorios.
      const checklist = {};
      const faltantes = [];
      secciones.forEach((s) => {
        s.puntos.forEach((p) => {
          const v = String((datos.checklist || {})[p.clave] || '').toUpperCase();
          if (LineasChecklist.ESCALAS[p.escala].valores.indexOf(v) < 0) faltantes.push(p.etiqueta);
          else checklist[p.clave] = v;
        });
      });
      if (faltantes.length) throw new Error('Faltan puntos del checklist: ' + faltantes.slice(0, 6).join(', ') + (faltantes.length > 6 ? '…' : ''));

      const r = responsableObjetivo_(obj);
      const snapshot = {
        responsable: r.nombre || null, departamento: r.departamento || null, area: r.area || null, sede: r.sede || null,
        oficina: r.oficina || null, puesto: r.puesto || null, jefeDirecto: r.jefeDirecto || null,
        correo: obj.equipo ? obj.equipo.cuentaGoogle || null : null,
        numero: obj.linea ? obj.linea.numero || null : null, imei: obj.equipo ? obj.equipo.imei || null : null,
        sim: obj.linea ? obj.linea.sim || null : null, modelo: obj.equipo ? obj.equipo.modelo || null : null,
        color: obj.equipo ? obj.equipo.color || null : null, compania: obj.linea ? obj.linea.compania || null : null,
        plan: obj.linea && obj.linea.costoPlan !== undefined ? obj.linea.costoPlan : null, razonSocial: r.razonSocial || null,
      };
      const actual = { checklist: checklist, calificacion: LineasChecklist.calificacion(checklist, secciones), snapshot: snapshot };

      const inspeccion = {
        nuco: obj.reg.nuco, fecha: ahora, tipoRegistro: obj.reg.tipo, snapshot: snapshot, checklist: checklist,
        otraApp: LineasUtil.txt(datos.otraApp), calificacion: actual.calificacion, observaciones: LineasUtil.txt(datos.observaciones), ticket: LineasUtil.txt(datos.ticket),
        inspector: usuario.nombre, firmas: {},
        drive: { carpetaId: datos.carpetaId },
      };

      // 1) Fila en INSPECCIONES LINEAS con las columnas del AppSheet.
      const fila = {
        'ID': id, 'ID LINEA': obj.reg.id, 'NUCO': LineasUtil.col(obj.fila, 'NUCO'), 'TIPO': obj.reg.tipo,
        'RESPONSABLE': snapshot.responsable, 'DEPARTAMENTO': snapshot.departamento, 'AREA': snapshot.area, 'SEDE': snapshot.sede,
        'OFICINA / DESARROLLO': snapshot.oficina, 'PUESTO': snapshot.puesto, 'JEFE DIRECTO': snapshot.jefeDirecto, 'CORREO': snapshot.correo,
        'No TELEFONO': snapshot.numero, 'IMEI': snapshot.imei, 'SIM': snapshot.sim, 'MODELO': snapshot.modelo, 'COLOR': snapshot.color,
        'COMPAÑIA': snapshot.compania, 'PLAN': snapshot.plan, 'RAZON SOCIAL': snapshot.razonSocial,
        'OTRA': inspeccion.otraApp, 'CALIFICACION': actual.calificacion, 'OBSERVACIONES': inspeccion.observaciones, 'TICKET': inspeccion.ticket,
        'NOMBRE INSPECTOR': usuario.nombre, 'FECHA DE REGISTRO': ahora,
        'FIRMA RESPONSABLE': '', 'FIRMA INSPECTOR': '',
      };
      LineasChecklist.puntos().forEach((p) => { if (checklist[p.clave]) fila[p.columna] = checklist[p.clave]; });
      LineasDatos.agregarFilas(LineasRepo.TAB.INSP, [fila]);

      // 2) Registro: fecha de inspección, accesorios y estatus.
      const cambios = { 'FECHA INSPECCION': ahora };
      if (obj.equipo && datos.actualizarAccesorios) {
        const acc = {};
        (obj.equipo.accesorios || []).forEach((a) => { acc[a] = true; });
        [['cubo', 'CUBO'], ['cable', 'CABLE'], ['funda', 'FUNDA'], ['mica', 'MICA']].forEach((par) => {
          if (checklist[par[0]] === 'SI') acc[par[1]] = true;
          if (checklist[par[0]] === 'NO') delete acc[par[1]];
        });
        cambios['ACCESORIOS'] = Object.keys(acc).join(', ');
      }
      if (obj.equipo && LineasUtil.txt(datos.estatusEquipo)) cambios['ESTATUS EQUIPO'] = String(datos.estatusEquipo);
      const g = LineasRepo.guardarCambiosRegistro(obj.fila, cambios, usuario, ahora);

      // 3) Evidencia (carpeta y fotos) y movimiento.
      LineasRepo.asegurarPestanaApp(LineasRepo.TAB.APP_EVID);
      LineasDatos.agregarFilas(LineasRepo.TAB.APP_EVID, [{
        'ID': LineasDatos.nuevoIdCorto(), 'TIPO': 'INSPECCION', 'ORIGEN': 'SISTEMA', 'ID_REGISTRO': id, 'ID_LINEA': obj.reg.id, 'NUCO': obj.reg.nuco || '',
        'FECHA': ahora, 'CARPETA_ID': datos.carpetaId, 'RUTA': datos.ruta || '', 'FOTOS_CARPETA_ID': datos.fotosCarpetaId || '',
        'FOTOS': String((datos.fotos || []).length), 'PDFS_JSON': '[]', 'COINCIDENCIA_EXACTA': 'TRUE',
        'ALERTAS_JSON': '[]', 'ID_ANTERIOR': '', 'ACTUALIZADO_EN': ahora,
      }]);
      LineasRepo.registrarMovimiento('INSPECCION', { motivo: 'Inspección registrada', ticket: datos.ticket }, usuario, ahora, {
        refs: [obj.reg.id], nuco: obj.reg.nuco, numero: snapshot.numero,
        antes: { estado: obj.equipo ? resumenEquipo_(obj.equipo) : resumenLinea_(obj.linea) },
        despues: { calificacion: actual.calificacion, estatus: obj.equipo ? (cambios['ESTATUS EQUIPO'] || obj.equipo.estatus) : null },
        detalle: Object.assign(detalleCambios_([g]), { inspeccionId: id }),
      });
      return { inspeccion: inspeccion, obj: obj };
    });

    // El PDF se genera después (generarPdf), para que guardar no tarde ~30-40 s.
    firmasCache_('INSPECCION', id, { inspector: datos.firmaInspectorBase64, responsable: datos.firmaResponsableBase64 || null });
    const filas = LineasRepo.refrescarIndice([res.obj.reg.id]);
    return { id: id, calificacion: res.inspeccion.calificacion, pdfPendiente: true, filas: filas };
  }

  // ---------------- Responsiva ----------------

  function guardarResponsiva(datos, usuario) {
    const ref = { equipoId: datos.equipoId || null, lineaId: datos.equipoId ? null : datos.lineaId };
    if (!datos.carpetaId) throw new Error('Falta la carpeta de evidencia.');
    if (!LineasUtil.txt(datos.identificacion)) throw new Error('La identificación es obligatoria.');
    if (!datos.firmaCiBase64) throw new Error('La firma de Control Interno es obligatoria.');
    LineasEvidencias.validarArchivosEnCarpeta(
      (datos.archivos || []).map((a) => a.id),
      [datos.carpetaId]
    );

    const id = LineasDatos.nuevoIdCorto();
    const res = LineasDatos.conCandado(() => {
      const ahora = new Date();
      const obj = objetivoCaptura_(ref);
      const r = responsableObjetivo_(obj);
      if (!r.nombre) throw new Error('El registro no tiene responsable. Reasigna el responsable antes de generar la responsiva.');
      const mes = MESES[Number(Utilities.formatDate(ahora, 'America/Mexico_City', 'M')) - 1];
      const responsiva = {
        nuco: obj.reg.nuco, fecha: ahora,
        responsable: {
          nombre: r.nombre || null, noEmpleado: r.noEmpleado || null, identificacion: String(datos.identificacion).toUpperCase(),
          puesto: r.puesto || null, departamento: r.departamento || null, area: r.area || null, sede: r.sede || null,
          oficina: r.oficina || null, director: r.director || null, razonSocial: r.razonSocial || (obj.linea && obj.linea.razonSocial) || null,
          correo: obj.equipo ? obj.equipo.cuentaGoogle || null : null,
        },
        equipo: obj.equipo ? { modelo: obj.equipo.modelo || null, imei: obj.equipo.imei || null, color: obj.equipo.color || null, accesorios: (obj.equipo.accesorios || []).join(', ') } : null,
        linea: obj.linea ? { numero: obj.linea.numero || null, sim: obj.linea.sim || null, compania: obj.linea.compania || null } : null,
        tipoContrasena: LineasUtil.txt(datos.tipoContrasena), observaciones: LineasUtil.txt(datos.observaciones) ? String(datos.observaciones).toUpperCase() : null,
        responsableCI: usuario.nombre,
        firmas: {}, patron: LineasUtil.txt(datos.patron),
        drive: { carpetaId: datos.carpetaId },
      };

      LineasDatos.agregarFilas(LineasRepo.TAB.RESP, [{
        'ID': id, 'ID LINEA': obj.reg.id, 'NUCO': LineasUtil.col(obj.fila, 'NUCO'), 'No EMPLEADO': responsiva.responsable.noEmpleado,
        'RESPONSABLE': responsiva.responsable.nombre, 'IDENTIFICACION': responsiva.responsable.identificacion, 'RAZON SOCIAL': responsiva.responsable.razonSocial,
        'FECHA RESPONSIVA': ahora, 'SEDE': responsiva.responsable.sede, 'OFICINA / DESARROLLO': responsiva.responsable.oficina, 'AREA': responsiva.responsable.area,
        'PUESTO': responsiva.responsable.puesto, 'DIRECTOR': responsiva.responsable.director, 'CORREO': responsiva.responsable.correo,
        'No TELEFONO': responsiva.linea ? responsiva.linea.numero : '', 'COMPAÑIA': responsiva.linea ? responsiva.linea.compania : '',
        'DEPARTAMENTO': responsiva.responsable.departamento, 'MODELO': responsiva.equipo ? responsiva.equipo.modelo : '',
        'SIM': responsiva.linea ? responsiva.linea.sim : '', 'IMEI': responsiva.equipo ? responsiva.equipo.imei : '',
        'COLOR': responsiva.equipo ? responsiva.equipo.color : '', 'ACCESORIOS': responsiva.equipo ? responsiva.equipo.accesorios : '',
        'PIN WHATSAPP': obj.linea ? obj.linea.pinWhatsapp : '', 'TIPO CONTRASEÑA': responsiva.tipoContrasena,
        'PIN EQUIPO': responsiva.tipoContrasena === 'PATRON' ? '' : (obj.equipo ? obj.equipo.pinEquipo : ''),
        'CONTRASEÑA': responsiva.patron || '', 'OBSERVACIONES': responsiva.observaciones,
        'FIRMA RESPONSABLE': '', 'NOMBRE CI': usuario.nombre, 'FIRMA CI': '',
        'DIA': Number(Utilities.formatDate(ahora, 'America/Mexico_City', 'd')), 'MES': mes, 'AÑO': Number(Utilities.formatDate(ahora, 'America/Mexico_City', 'yyyy')),
      }]);

      let g = { idsCambios: [], idReasignacion: null, campos: [] };
      if (obj.equipo && LineasUtil.txt(datos.estatusEquipo)) g = LineasRepo.guardarCambiosRegistro(obj.fila, { 'ESTATUS EQUIPO': String(datos.estatusEquipo) }, usuario, ahora);

      LineasRepo.asegurarPestanaApp(LineasRepo.TAB.APP_EVID);
      LineasDatos.agregarFilas(LineasRepo.TAB.APP_EVID, [{
        'ID': LineasDatos.nuevoIdCorto(), 'TIPO': 'RESPONSIVA', 'ORIGEN': 'SISTEMA', 'ID_REGISTRO': id, 'ID_LINEA': obj.reg.id, 'NUCO': obj.reg.nuco || '',
        'FECHA': ahora, 'CARPETA_ID': datos.carpetaId, 'RUTA': datos.ruta || '', 'FOTOS': String((datos.archivos || []).length),
        'PDFS_JSON': '[]', 'COINCIDENCIA_EXACTA': 'TRUE', 'ACTUALIZADO_EN': ahora,
      }]);
      LineasRepo.registrarMovimiento('RESPONSIVA', { motivo: 'Responsiva firmada', ticket: datos.ticket }, usuario, ahora, {
        refs: [obj.reg.id], nuco: obj.reg.nuco, numero: responsiva.linea ? responsiva.linea.numero : null,
        antes: {}, despues: { responsable: { nombre: r.nombre } },
        detalle: Object.assign(detalleCambios_([g]), { responsivaId: id }),
      });
      return { responsiva: responsiva, obj: obj };
    });

    firmasCache_('RESPONSIVA', id, { responsable: datos.firmaResponsableBase64 || null, ci: datos.firmaCiBase64, patron: datos.patronBase64 || null });
    const filas = LineasRepo.refrescarIndice([res.obj.reg.id]);
    return { id: id, pdfPendiente: true, filas: filas };
  }

  // ---------------- PDF (generado después de guardar) ----------------

  function generarPdfInspeccion_(id, insp, obj, firmasBase64) {
    try {
      const registro = {
        'ID': id, 'NUCO': insp.nuco, 'TIPO': insp.tipoRegistro, 'FECHA DE REGISTRO': insp.fecha,
        'CALIFICACION': insp.calificacion === null ? '' : Math.round(insp.calificacion * 100) + '%',
        'RESPONSABLE': insp.snapshot.responsable, 'DEPARTAMENTO': insp.snapshot.departamento, 'AREA': insp.snapshot.area, 'SEDE': insp.snapshot.sede,
        'OFICINA / DESARROLLO': insp.snapshot.oficina, 'PUESTO': insp.snapshot.puesto, 'JEFE DIRECTO': insp.snapshot.jefeDirecto, 'CORREO': insp.snapshot.correo,
        'No TELEFONO': insp.snapshot.numero, 'IMEI': insp.snapshot.imei, 'SIM': insp.snapshot.sim, 'MODELO': insp.snapshot.modelo, 'COLOR': insp.snapshot.color,
        'COMPAÑIA': insp.snapshot.compania, 'PLAN': insp.snapshot.plan, 'RAZON SOCIAL': insp.snapshot.razonSocial,
        'OTRA': insp.otraApp, 'OBSERVACIONES': insp.observaciones, 'TICKET': insp.ticket, 'NOMBRE INSPECTOR': insp.inspector,
        'PIN WHATSAPP': obj.linea ? obj.linea.pinWhatsapp : '', 'PIN EQUIPO': obj.equipo ? obj.equipo.pinEquipo : '', 'CONTRASEÑA MODEM': obj.equipo ? obj.equipo.contrasenaModem : '',
      };
      LineasChecklist.puntos().forEach((p) => { registro[p.columna] = insp.checklist[p.clave] || ''; });
      const carpeta = DriveApp.getFolderById(insp.drive.carpetaId);
      const nombre = 'INSP ' + (insp.nuco || 'SIN NUCO') + ' ' + Utilities.formatDate(insp.fecha, 'America/Mexico_City', 'dd MM') + '.pdf';
      const pdf = LineasPdf.generarPdfDesdePlantilla(LineasPdf.PLANTILLAS.INSPECCION_CELULAR, registro, {
        'FIRMA RESPONSABLE': firmasBase64 ? blobBase64_(firmasBase64.responsable, 'firma-responsable.png') : LineasEvidencias.blobDeArchivo(insp.firmas.responsableId),
        'FIRMA INSPECTOR': firmasBase64 ? blobBase64_(firmasBase64.inspector, 'firma-inspector.png') : LineasEvidencias.blobDeArchivo(insp.firmas.inspectorId),
        'PATRON': null,
      }, carpeta, nombre);
      LineasDatos.conCandado(() => ligarPdf_(LineasRepo.TAB.INSP, 'FORMATO INSPECCIONES LINEAS', id, obj.reg.id, 'FORMATO INSPECCION', pdf));
      return pdf;
    } catch (e) {
      console.error('generarPdfInspeccion_ (' + id + '): ' + e.message);
      throw new Error('No se pudo generar el PDF de la inspección: ' + e.message);
    }
  }

  /** Escribe el enlace del PDF en la fila de la evidencia, en APP_EVIDENCIAS y en el registro de la línea. */
  function ligarPdf_(tabla, columnaPdf, id, registroId, columnaRegistro, pdf) {
    const url = urlArchivo_(pdf.id);
    const filas = LineasDatos.buscarFilas(tabla, 'ID', id);
    if (filas.length) LineasDatos.actualizarFila(tabla, filas[0], (() => { const o = {}; o[columnaPdf] = url; return o; })());
    if (LineasDatos.existeTabla(LineasRepo.TAB.APP_EVID)) {
      const filasEv = LineasDatos.buscarFilas(LineasRepo.TAB.APP_EVID, 'ID_REGISTRO', id);
      if (filasEv.length) LineasDatos.actualizarFila(LineasRepo.TAB.APP_EVID, filasEv[0], { 'PDFS_JSON': JSON.stringify([{ id: pdf.id, nombre: pdf.nombre }]), 'ACTUALIZADO_EN': new Date() });
    }
    if (columnaRegistro) {
      const filasReg = LineasDatos.buscarFilas(LineasRepo.TAB.LINEAS, 'ID', registroId);
      if (filasReg.length === 1) LineasDatos.actualizarFila(LineasRepo.TAB.LINEAS, filasReg[0], (() => { const o = {}; o[columnaRegistro] = url; return o; })());
    }
  }

  function generarPdfResponsiva_(id, resp, obj, usuario, firmasBase64) {
    try {
      const f = resp.fecha;
      const mes = MESES[Number(Utilities.formatDate(f, 'America/Mexico_City', 'M')) - 1];
      const registro = {
        'ID': id, 'NUCO': resp.nuco, 'DIA': Utilities.formatDate(f, 'America/Mexico_City', 'd'),
        'MES': mes.charAt(0) + mes.slice(1).toLowerCase(),
        'AÑO': Utilities.formatDate(f, 'America/Mexico_City', 'yyyy'), 'FECHA RESPONSIVA': f,
        'RESPONSABLE': resp.responsable.nombre, 'IDENTIFICACION': resp.responsable.identificacion, 'No EMPLEADO': resp.responsable.noEmpleado,
        'RAZON SOCIAL': resp.responsable.razonSocial, 'SEDE': resp.responsable.sede, 'OFICINA / DESARROLLO': resp.responsable.oficina, 'AREA': resp.responsable.area,
        'PUESTO': resp.responsable.puesto, 'DIRECTOR': resp.responsable.director, 'DEPARTAMENTO': resp.responsable.departamento, 'CORREO': resp.responsable.correo,
        'No TELEFONO': resp.linea ? resp.linea.numero : '', 'COMPAÑIA': resp.linea ? resp.linea.compania : '', 'SIM': resp.linea ? resp.linea.sim : '',
        'MODELO': resp.equipo ? resp.equipo.modelo : '', 'IMEI': resp.equipo ? resp.equipo.imei : '', 'COLOR': resp.equipo ? resp.equipo.color : '',
        'ACCESORIOS': resp.equipo ? resp.equipo.accesorios : '', 'PIN WHATSAPP': obj.linea ? obj.linea.pinWhatsapp : '',
        'PIN EQUIPO': resp.tipoContrasena === 'PATRON' ? '' : (obj.equipo ? obj.equipo.pinEquipo : ''),
        'OBSERVACIONES': resp.observaciones, 'NOMBRE CI': resp.responsableCI,
      };
      const carpeta = DriveApp.getFolderById(resp.drive.carpetaId);
      const nombre = 'RESP ' + (resp.nuco || 'SIN NUCO') + ' ' + Utilities.formatDate(f, 'America/Mexico_City', 'dd MM') + '.pdf';
      const pdf = LineasPdf.generarPdfDesdePlantilla(LineasPdf.PLANTILLAS.RESPONSIVA_CELULAR, registro, {
        'FIRMA RESPONSABLE': firmasBase64 ? blobBase64_(firmasBase64.responsable, 'firma-responsable.png') : LineasEvidencias.blobDeArchivo(resp.firmas.responsableId),
        'FIRMA CI': firmasBase64 ? blobBase64_(firmasBase64.ci, 'firma-ci.png') : LineasEvidencias.blobDeArchivo(resp.firmas.ciId),
        'CONTRASEÑA': firmasBase64 ? blobBase64_(firmasBase64.patron, 'patron.png') : LineasEvidencias.blobDeArchivo(resp.firmas.patronId),
      }, carpeta, nombre);
      LineasDatos.conCandado(() => {
        ligarPdf_(LineasRepo.TAB.RESP, 'FORMATO RESPONSIVA', id, null, null, pdf);
        // La columna RESPONSIVA del registro apunta a la última responsiva (queda en bitácora, como en el AppSheet).
        const fila = LineasRepo.leerRegistroPorId(obj.reg.id);
        if (fila) LineasRepo.guardarCambiosRegistro(fila, { 'RESPONSIVA': urlArchivo_(pdf.id) }, usuario, new Date());
      });
      return pdf;
    } catch (e) {
      console.error('generarPdfResponsiva_ (' + id + '): ' + e.message);
      throw new Error('No se pudo generar el PDF de la responsiva: ' + e.message);
    }
  }

  /** Genera (o regenera con forzar=true) el PDF de una inspección o responsiva capturada en el sistema. */
  function generarPdf(tipo, id, forzar, usuario, firmasNuevas) {
    if (tipo === 'INSPECCION') {
      const insp = LineasRepo.leerInspeccion(id);
      if (!insp || insp.origen !== 'SISTEMA') throw new Error('Solo se generan PDF de inspecciones capturadas en el sistema.');
      if (!forzar && insp.drive && insp.drive.pdfs && insp.drive.pdfs.length) return insp.drive.pdfs[0];
      const f = LineasRepo.leerRegistroObligatorio(insp.registroId, 'el registro de la inspección');
      const reg = LineasRepo.convertirRegistro(f);
      insp.firmas = { responsableId: idDeUrlDrive_(insp.firmas.responsableRuta), inspectorId: idDeUrlDrive_(insp.firmas.inspectorRuta) };
      if (insp.calificacion > 1) insp.calificacion = insp.calificacion / 100;
      const firmas = firmasCache_('INSPECCION', id, firmasNuevas);
      if (!firmas && !insp.firmas.inspectorId) throw new Error('La firma temporal ya no está disponible. Genera una inspección nueva.');
      return generarPdfInspeccion_(id, insp, { fila: f, reg: reg, equipo: reg.equipo, linea: reg.linea }, firmas);
    }
    if (tipo === 'RESPONSIVA') {
      const filas = LineasDatos.buscarFilas(LineasRepo.TAB.RESP, 'ID', id);
      if (!filas.length) throw new Error('No existe la responsiva ' + id);
      const filasEv = LineasDatos.existeTabla(LineasRepo.TAB.APP_EVID) ? LineasDatos.buscarFilas(LineasRepo.TAB.APP_EVID, 'ID_REGISTRO', id) : [];
      const r = LineasDatos.leerFilas([{ tabla: LineasRepo.TAB.RESP, filas: filas.slice(0, 1) }, { tabla: LineasRepo.TAB.APP_EVID, filas: filasEv.slice(0, 1) }]);
      const ev = r[1][0] ? LineasRepo.evidenciaDesdeFila(r[1][0]) : null;
      if (!ev || ev.origen !== 'SISTEMA') throw new Error('Solo se generan PDF de responsivas capturadas en el sistema.');
      if (!forzar && ev.pdfs && ev.pdfs.length) return ev.pdfs[0];
      const f = r[0][0];
      const texto = (c) => { const v = LineasUtil.txt(LineasUtil.col(f, c)); return v === null ? null : String(v); };
      const resp = {
        nuco: LineasUtil.nuco4(LineasUtil.col(f, 'NUCO')), fecha: LineasUtil.fecha(LineasUtil.col(f, 'FECHA RESPONSIVA')) || new Date(),
        responsable: {
          nombre: texto('RESPONSABLE'), noEmpleado: texto('No EMPLEADO'), identificacion: texto('IDENTIFICACION'), puesto: texto('PUESTO'),
          departamento: texto('DEPARTAMENTO'), area: texto('AREA'), sede: texto('SEDE'), oficina: texto('OFICINA / DESARROLLO'),
          director: texto('DIRECTOR'), razonSocial: texto('RAZON SOCIAL'), correo: texto('CORREO'),
        },
        equipo: { modelo: texto('MODELO'), imei: texto('IMEI'), color: texto('COLOR'), accesorios: texto('ACCESORIOS') },
        linea: { numero: texto('No TELEFONO'), sim: texto('SIM'), compania: texto('COMPAÑIA') },
        tipoContrasena: texto('TIPO CONTRASEÑA'), observaciones: texto('OBSERVACIONES'), responsableCI: texto('NOMBRE CI'),
        firmas: { responsableId: idDeUrlDrive_(LineasUtil.col(f, 'FIRMA RESPONSABLE')), ciId: idDeUrlDrive_(LineasUtil.col(f, 'FIRMA CI')), patronId: idDeUrlDrive_(LineasUtil.col(f, 'CONTRASEÑA')) },
        drive: { carpetaId: ev.carpetaId },
      };
      const obj = { reg: { id: LineasUtil.txt(LineasUtil.col(f, 'ID LINEA')) }, linea: { pinWhatsapp: texto('PIN WHATSAPP') }, equipo: { pinEquipo: texto('PIN EQUIPO') } };
      const firmas = firmasCache_('RESPONSIVA', id, firmasNuevas);
      if (!firmas && !resp.firmas.ciId) throw new Error('La firma temporal ya no está disponible. Genera una responsiva nueva.');
      return generarPdfResponsiva_(id, resp, obj, usuario, firmas);
    }
    throw new Error('Tipo de PDF inválido.');
  }

  return { objetivo: objetivoCaptura_, contextoInspeccion, contextoResponsiva, guardarInspeccion, guardarResponsiva, generarPdf };
})();
