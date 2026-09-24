/**
 * LineasCaptura.gs
 * Captura de INSPECCIONES LINEAS y RESPONSIVAS LINEAS, réplica del AppSheet (v1.001924).
 *
 * El servidor arma cada formulario como lista ordenada de elementos (mismo orden que
 * INSPECCIONES LINEAS_Form / RESPONSIVAS LINEAS_Form), con valores iniciales calculados
 * como los "Initial value" del AppSheet a partir de la fila de LINEAS TELEFONICAS, y con
 * los Show_If / Required_If / Valid_If como códigos (LineasChecklist.CONDICIONES).
 *
 * Al guardar se replica lo que hacen los bots del AppSheet:
 *   - Inspección  → fila en INSPECCIONES LINEAS (CALIFICACION con la fórmula del AppSheet) y
 *                   bot ACTUALIZAR DESDE INSPECCION: copia 13 campos a LINEAS TELEFONICAS
 *                   (con su bitácora en CAMBIOS LINEAS TELEFONICAS / HISTORIAL_REASIGNACIONES).
 *   - Responsiva  → fila en RESPONSIVAS LINEAS; bot MAYUSCULAS (IDENTIFICACION, OBSERVACIONES).
 *                   No toca LINEAS TELEFONICAS (igual que el AppSheet).
 *   - Ambos       → PDF con las plantillas del AppSheet, después de guardar (generarPdf).
 * Del sistema nuevo se conservan: carpeta de evidencia en NUCOS, fotos opcionales de la
 * inspección, APP_EVIDENCIAS y APP_MOVIMIENTOS (pestañas propias, no las lee AppSheet).
 */

const LineasCaptura = (function () {
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const ZONA = 'America/Mexico_City';

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

  /** Valor de la fila de LINEAS TELEFONICAS como texto (para los "Initial value"). */
  function valorLinea_(fila, columna) {
    const v = LineasUtil.col(fila, columna);
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return Utilities.formatDate(v, ZONA, 'dd/MM/yyyy');
    return String(v);
  }

  function resumenEquipo_(e) {
    return e ? { nuco: e.nuco || null, estatus: e.estatus || null, lineaId: e.lineaId || null, responsable: e.responsable ? e.responsable.nombre || null : null } : null;
  }
  function resumenLinea_(l) {
    return l ? { numero: l.numero || null, estatus: l.estatus || null, equipoId: l.equipoId || null } : null;
  }

  function detalleCambios_(guardados) {
    const d = { idsCambios: [], idsReasignacion: [], cambios: [] };
    guardados.forEach((g) => {
      Array.prototype.push.apply(d.idsCambios, g.idsCambios);
      if (g.idReasignacion) d.idsReasignacion.push(g.idReasignacion);
      Array.prototype.push.apply(d.cambios, g.campos.map((c) => Object.assign({ nuco: g.nuco || null }, c)));
    });
    return d;
  }

  // ======================================================================
  // Definición de los formularios (orden, etiquetas, condiciones del AppSheet)
  // ======================================================================
  // Elemento: { tipo: 'titulo', texto } o { tipo: 'campo', columna, etiqueta, control, requerido, mostrar,
  //   soloLectura, opciones, escala, valor }. control: texto | area | lista | escala | fechaHora |
  //   patron | firma | calculado.   requerido/mostrar: código de LineasChecklist.CONDICIONES.

  const titulo_ = (texto, icono) => ({ tipo: 'titulo', texto: texto, icono: icono || null });
  const campo_ = (columna, etiqueta, control, extra) => Object.assign({
    tipo: 'campo', columna: columna, etiqueta: etiqueta, control: control, requerido: 'NUNCA', mostrar: 'SIEMPRE', soloLectura: false,
  }, extra || {});

  /** INSPECCIONES LINEAS_Form. `catalogos` trae las listas de LISTAS TELEFONOS (Valid_If). */
  function formularioInspeccion_(fila, catalogos, usuario, id, ahora) {
    const v = (c) => valorLinea_(fila, c);
    const tipo = v('TIPO').trim().toUpperCase();
    const esEquipo = tipo === 'EQUIPO';
    const req = { requerido: 'SIEMPRE' };
    const elementos = [
      titulo_('FORMATO DE INSPECCIÓN CELULAR', 'smartphone'),
      campo_('FECHA DE REGISTRO', 'FECHA DE REGISTRO', 'fechaHora', Object.assign({ valor: Utilities.formatDate(ahora, ZONA, "yyyy-MM-dd'T'HH:mm") }, req)),
      campo_('ID', 'ID', 'texto', { valor: id, soloLectura: true }),
      campo_('ID LINEA', 'ID LINEA', 'texto', { valor: v('IMEI') || v('ID'), soloLectura: true }),
      campo_('NUCO', 'NUCO', 'texto', Object.assign({ valor: v('NUCO') }, req)),
      campo_('RESPONSABLE', 'RESPONSABLE', 'texto', Object.assign({ valor: v('RESPONSABLE') }, req)),
      campo_('DEPARTAMENTO', 'DEPARTAMENTO', 'lista', Object.assign({ valor: v('DEPARTAMENTO'), opciones: catalogos.departamentos || [] }, req)),
      campo_('AREA', 'AREA', 'lista', Object.assign({ valor: v('AREA'), opciones: catalogos.areas || [] }, req)),
      campo_('SEDE', 'SEDE', 'lista', Object.assign({ valor: v('SEDE'), opciones: catalogos.sedes || [] }, req)),
      campo_('OFICINA / DESARROLLO', 'OFICINA / DESARROLLO', 'lista', Object.assign({ valor: v('OFICINA / DESARROLLO'), opciones: catalogos.oficinas || [] }, req)),
      campo_('PUESTO', 'PUESTO', 'texto', Object.assign({ valor: v('PUESTO') }, req)),
      campo_('JEFE DIRECTO', 'JEFE DIRECTO', 'texto', Object.assign({ valor: v('JEFE DIRECTO') }, req)),
      campo_('CORREO', 'CORREO', 'texto', Object.assign({ valor: v('CUENTA GOOGLE'), literal: true }, req)),
      campo_('TIPO', 'TIPO', 'texto', Object.assign({ valor: v('TIPO'), controlaTipo: true }, req)),
      campo_('No TELEFONO', 'No TELEFONO', 'texto', Object.assign({ valor: v('NUMERO TELEFONO') }, req)),
      campo_('IMEI', 'IMEI', 'texto', Object.assign({ valor: v('IMEI') }, req)),
      campo_('SIM', 'SIM', 'texto', Object.assign({ valor: v('NUMERO SIM') }, req)),
      campo_('MODELO', 'MODELO', 'texto', Object.assign({ valor: v('EQUIPO') }, req)),
      campo_('COLOR', 'COLOR', 'texto', Object.assign({ valor: v('COLOR') }, req)),
      campo_('COMPAÑIA', 'COMPAÑIA', 'texto', { valor: esEquipo ? '' : v('COMPAÑIA'), mostrar: 'NO_EQUIPO' }),
      campo_('PLAN', 'PLAN', 'texto', { valor: esEquipo ? '' : v('COSTO PLAN'), mostrar: 'NO_EQUIPO' }),
      campo_('RAZON SOCIAL', 'RAZON SOCIAL', 'texto', { valor: v('RAZON SOCIAL') }),
    ];
    const agregarSeccion = (nombre) => {
      const s = LineasChecklist.secciones().filter((x) => x.seccion === nombre)[0];
      elementos.push(titulo_(s.seccion));
      s.puntos.filter((p) => p.mostrar !== 'NUNCA').forEach((p) => elementos.push(campo_(p.columna, p.etiqueta, 'escala', {
        escala: p.escala, opciones: LineasChecklist.ESCALAS[p.escala].valores, mostrar: p.mostrar, requerido: p.requerido, valor: '', checklist: true,
      })));
    };
    ['DOCUMENTACIÓN / ACCESORIOS', 'SISTEMA', 'CONECTIVIDAD', 'ESTADO FÍSICO GENERAL', 'DESEMPEÑO'].forEach(agregarSeccion);
    elementos.push(
      titulo_('BLOQUEO Y CONTRASEÑAS'),
      campo_('CONTRASEÑA MODEM', 'CONTRASEÑA MODEM', 'texto', { valor: '', mostrar: 'MODEM', literal: true, secreto: true }),
      campo_('PIN WHATSAPP', 'PIN WHATSAPP', 'texto', { valor: v('PIN WHATSAPP'), mostrar: 'VOZ', literal: true, secreto: true }),
      campo_('PIN EQUIPO', 'PIN EQUIPO', 'texto', { valor: v('PIN EQUIPO'), mostrar: 'EQUIPOS', literal: true, secreto: true }),
      campo_('PATRON', 'PATRON', 'patron', { valor: v('PATRON'), mostrar: 'EQUIPOS', secreto: true })
    );
    agregarSeccion('APPS INSTALADAS');
    elementos.push(
      campo_('OTRA', 'OTRA', 'texto', { valor: '', mostrar: 'EQUIPOS' }),
      titulo_('CALIFICACIÓN, OBSERVACIONES Y FIRMAS'),
      campo_('CALIFICACION', 'CALIFICACION', 'calculado', { valor: '', soloLectura: true }),
      campo_('TICKET', 'TICKET', 'texto', { valor: '' }),
      campo_('OBSERVACIONES', 'OBSERVACIONES', 'area', { valor: '' }),
      campo_('FIRMA RESPONSABLE', 'FIRMA RESPONSABLE', 'firma', { valor: '' }),
      campo_('NOMBRE INSPECTOR', 'NOMBRE INSPECTOR', 'texto', { valor: usuario.nombre || '', soloLectura: true }),
      campo_('FIRMA INSPECTOR', 'FIRMA INSPECTOR', 'firma', Object.assign({ valor: '' }, req))
    );
    return elementos;
  }

  /** RESPONSIVAS LINEAS_Form (sin Show_If; TIPO CONTRASEÑA está oculta en el AppSheet). */
  function formularioResponsiva_(fila, usuario, id, ahora) {
    const v = (c) => valorLinea_(fila, c);
    const ro = (columna, etiqueta, valor) => campo_(columna, etiqueta, 'texto', { valor: valor, soloLectura: true });
    const dia = Utilities.formatDate(ahora, ZONA, 'd');
    const mes = MESES[Number(Utilities.formatDate(ahora, ZONA, 'M')) - 1];
    const anio = Utilities.formatDate(ahora, ZONA, 'yyyy');
    return [
      ro('ID', 'ID', id),
      ro('ID LINEA', 'ID LINEA', v('IMEI') || v('ID')),
      ro('NUCO', 'NUCO', v('NUCO')),
      ro('No EMPLEADO', 'NÚMERO DE EMPLEADO', v('NO EMPLEADO')),
      campo_('DIA', 'DIA', 'texto', { valor: dia, requerido: 'SIEMPRE' }),
      campo_('MES', 'MES', 'texto', { valor: mes, requerido: 'SIEMPRE', literal: true }),
      campo_('AÑO', 'AÑO', 'texto', { valor: anio, requerido: 'SIEMPRE' }),
      ro('RESPONSABLE', 'RESPONSABLE', v('RESPONSABLE')),
      campo_('IDENTIFICACION', 'IDENTIFICACION', 'texto', { valor: '', requerido: 'SIEMPRE' }),
      ro('RAZON SOCIAL', 'RAZON SOCIAL', v('RAZON SOCIAL')),
      ro('FECHA RESPONSIVA', 'FECHA DE REGISTRO DE RESPONSIVA', ''),
      ro('SEDE', 'SEDE', v('SEDE')),
      ro('OFICINA / DESARROLLO', 'OFICINA O DESARROLLO', v('OFICINA / DESARROLLO')),
      ro('AREA', 'AREA', v('AREA')),
      ro('PUESTO', 'PUESTO', v('PUESTO')),
      ro('DIRECTOR', 'DIRECTOR', v('DIRECTOR')),
      ro('CORREO', 'CORREO ELECTRÓNICO', v('CUENTA GOOGLE')),
      ro('No TELEFONO', 'NÚMERO DE TELÉFONO', v('NUMERO TELEFONO')),
      ro('COMPAÑIA', 'COMPAÑIA', v('COMPAÑIA')),
      ro('DEPARTAMENTO', 'DEPARTAMENTO', v('DEPARTAMENTO')),
      ro('MODELO', 'MODELO', v('EQUIPO')),
      ro('SIM', 'SIM', v('NUMERO SIM')),
      ro('IMEI', 'IMEI', v('IMEI')),
      campo_('COLOR', 'COLOR', 'texto', { valor: v('COLOR'), requerido: 'SIEMPRE' }),
      ro('ACCESORIOS', 'ACCESORIOS', v('ACCESORIOS')),
      campo_('PIN WHATSAPP', 'PIN WHATSAPP', 'texto', { valor: v('PIN WHATSAPP'), literal: true, secreto: true }),
      campo_('PIN EQUIPO', 'PIN EQUIPO', 'texto', { valor: v('PIN EQUIPO'), literal: true, secreto: true }),
      campo_('CONTRASEÑA', 'PATRÓN', 'patron', { valor: v('PATRON'), secreto: true }),
      campo_('OBSERVACIONES', 'OBSERVACIONES', 'area', { valor: '' }),
      campo_('FIRMA RESPONSABLE', 'FIRMA RESPONSABLE', 'firma', { valor: '' }),
      ro('NOMBRE CI', 'NOMBRE RESPONSABLE DE CONTROL INTERNO', usuario.nombre || ''),
      campo_('FIRMA CI', 'FIRMA RESPONSABLE DE CONTROL INTERNO', 'firma', { valor: '', requerido: 'SIEMPRE' }),
    ];
  }

  /** Oculta PIN/patrón/contraseñas a quien no es ADMIN (el PDF sí los lleva, como en el AppSheet). */
  function ocultarSecretos_(elementos, puedeVerSecretos) {
    if (puedeVerSecretos) return elementos;
    return elementos.map((e) => (e.secreto && e.valor ? Object.assign({}, e, { valor: '', valorOculto: true }) : e));
  }

  // ======================================================================
  // Contexto (formulario precargado)
  // ======================================================================

  function contextoInspeccion(ref, usuario, puedeVerSecretos) {
    const obj = objetivoCaptura_(ref);
    const ahora = new Date();
    return {
      equipo: obj.equipo, linea: obj.linea, idPropuesto: LineasDatos.nuevoIdCorto(),
      formulario: null, inspector: usuario.nombre, condiciones: LineasChecklist.CONDICIONES,
      _armar: (id) => ocultarSecretos_(formularioInspeccion_(obj.fila, LineasRepo.catalogos(), usuario, id, ahora), puedeVerSecretos),
    };
  }

  function contextoResponsiva(ref, usuario, puedeVerSecretos) {
    const obj = objetivoCaptura_(ref);
    const ahora = new Date();
    return {
      equipo: obj.equipo, linea: obj.linea, idPropuesto: LineasDatos.nuevoIdCorto(), nombreCI: usuario.nombre,
      _armar: (id) => ocultarSecretos_(formularioResponsiva_(obj.fila, usuario, id, ahora), puedeVerSecretos),
    };
  }

  /** Lo que viaja al cliente: el formulario ya armado con el ID propuesto. */
  function paraCliente_(ctx) {
    const salida = Object.assign({}, ctx);
    salida.formulario = ctx._armar(ctx.idPropuesto);
    delete salida._armar;
    return salida;
  }

  // ======================================================================
  // Validación común (Required_If / Show_If / Valid_If del AppSheet)
  // ======================================================================

  /**
   * Toma los valores enviados solo de los campos editables del formulario, aplica los obligatorios
   * visibles, valida opciones y listas, y regresa { valores, errores }. Los campos ocultos conservan
   * su valor inicial (AppSheet calcula los "Initial value" aunque el campo no se muestre).
   * Los secretos que no se mostraron (sin permiso) conservan el valor de la línea.
   */
  function validarFormulario_(elementos, enviados, valoresOcultos) {
    const campos = elementos.filter((e) => e.tipo === 'campo');
    const valores = {};
    campos.forEach((e) => { valores[e.columna] = e.valor === undefined || e.valor === null ? '' : String(e.valor); });
    campos.forEach((e) => {
      if (e.soloLectura || e.control === 'firma' || e.control === 'calculado') return;
      if (e.valorOculto && !(enviados && String(enviados[e.columna] || '').trim())) { valores[e.columna] = valoresOcultos[e.columna] || ''; return; }
      if (enviados && Object.prototype.hasOwnProperty.call(enviados, e.columna)) {
        valores[e.columna] = String(enviados[e.columna] === null || enviados[e.columna] === undefined ? '' : enviados[e.columna]).trim();
      }
    });
    const tipo = valores['TIPO'] || '';
    const errores = [];
    campos.forEach((e) => {
      if (e.soloLectura || e.control === 'calculado' || e.control === 'firma') return;
      const visible = LineasChecklist.cumple(e.mostrar, tipo);
      const valor = valores[e.columna];
      if (visible && LineasChecklist.cumple(e.requerido, tipo) && !valor) { errores.push(e.etiqueta + ' es obligatorio'); return; }
      if (!valor) return;
      if (e.control === 'escala' && e.opciones.indexOf(valor.toUpperCase()) < 0) errores.push(e.etiqueta + ': valor no válido');
      if (e.control === 'escala') valores[e.columna] = valor.toUpperCase();
      // Valid_If = IN([COLUMNA], SORT(SELECT(LISTAS TELEFONOS[COLUMNA], TRUE)))
      if (e.control === 'lista' && e.opciones.map((o) => String(o).toUpperCase()).indexOf(valor.toUpperCase()) < 0) errores.push(e.etiqueta + ': el valor no está en la lista');
    });
    return { valores: valores, errores: errores };
  }

  // ======================================================================
  // Inspección
  // ======================================================================

  /** Columnas de LINEAS TELEFONICAS que copia el bot ACTUALIZAR DESDE INSPECCION (acción ACTUALIZAR DESDE INSPECCION CELULAR). */
  const COPIA_INSPECCION_A_LINEA = [
    ['RESPONSABLE', 'RESPONSABLE'], ['DEPARTAMENTO', 'DEPARTAMENTO'], ['AREA', 'AREA'], ['SEDE', 'SEDE'],
    ['OFICINA / DESARROLLO', 'OFICINA / DESARROLLO'], ['PUESTO', 'PUESTO'], ['JEFE DIRECTO', 'JEFE DIRECTO'],
    ['CUENTA GOOGLE', 'CORREO'], ['PIN WHATSAPP', 'PIN WHATSAPP'], ['PIN EQUIPO', 'PIN EQUIPO'], ['PATRON', 'PATRON'],
    ['CONTRASEÑA MODEM', 'CONTRASEÑA MODEM'],
  ];

  function guardarInspeccion(datos, usuario, puedeVerSecretos) {
    const ref = { equipoId: datos.equipoId || null, lineaId: datos.equipoId ? null : datos.lineaId };
    if (!datos.carpetaId) throw new Error('Falta la carpeta de evidencia.');
    if (!datos.firmaInspectorBase64) throw new Error('FIRMA INSPECTOR es obligatorio');
    const id = /^[\w-]{6,40}$/.test(String(datos.id || '')) ? String(datos.id) : LineasDatos.nuevoIdCorto();
    LineasEvidencias.validarArchivosEnCarpeta((datos.fotos || []).map((f) => f.id), [datos.carpetaId, datos.fotosCarpetaId].filter(Boolean));

    const res = LineasDatos.conCandado(() => {
      const ahora = new Date();
      const obj = objetivoCaptura_(ref);
      const elementos = formularioInspeccion_(obj.fila, LineasRepo.catalogos(), usuario, id, ahora)
        .map((e) => (e.secreto && !puedeVerSecretos ? Object.assign({}, e, { valorOculto: true }) : e));
      const ocultos = {};
      elementos.forEach((e) => { if (e.secreto) ocultos[e.columna] = e.valor; });
      const r = validarFormulario_(elementos, datos.valores || {}, ocultos);
      if (r.errores.length) throw new Error(r.errores.slice(0, 6).join(' · ') + (r.errores.length > 6 ? '…' : ''));
      const valores = r.valores;
      // PATRON: puntos trazados en el sistema ("1-2-3") o el valor que ya tenía la línea
      if (datos.patron !== undefined && datos.patron !== null) valores['PATRON'] = String(datos.patron);
      const fechaRegistro = valores['FECHA DE REGISTRO'] ? new Date(valores['FECHA DE REGISTRO']) : ahora;
      const calificacion = LineasChecklist.calificacion(valores);

      // 1) Fila en INSPECCIONES LINEAS con las columnas del AppSheet.
      const fila = Object.assign({}, valores, {
        'ID': id, 'ID LINEA': obj.reg.id, 'FECHA DE REGISTRO': isNaN(fechaRegistro) ? ahora : fechaRegistro,
        'CALIFICACION': calificacion, 'NOMBRE INSPECTOR': usuario.nombre, 'FIRMA RESPONSABLE': '', 'FIRMA INSPECTOR': '',
      });
      LineasDatos.agregarFilas(LineasRepo.TAB.INSP, [fila]);

      // 2) Bot ACTUALIZAR DESDE INSPECCION: copia a la línea (la bitácora la deja guardarCambiosRegistro).
      // FECHA INSPECCION es Date (sin hora) en LINEAS TELEFONICAS
      const fr = fila['FECHA DE REGISTRO'];
      const copia = { 'FECHA INSPECCION': new Date(fr.getFullYear(), fr.getMonth(), fr.getDate()) };
      COPIA_INSPECCION_A_LINEA.forEach(([destino, origen]) => { copia[destino] = valores[origen] === undefined ? '' : valores[origen]; });
      const g = LineasRepo.guardarCambiosRegistro(obj.fila, copia, usuario, ahora);

      // 3) Evidencia del sistema nuevo (carpeta y fotos) y movimiento.
      LineasRepo.asegurarPestanaApp(LineasRepo.TAB.APP_EVID);
      LineasDatos.agregarFilas(LineasRepo.TAB.APP_EVID, [{
        'ID': LineasDatos.nuevoIdCorto(), 'TIPO': 'INSPECCION', 'ORIGEN': 'SISTEMA', 'ID_REGISTRO': id, 'ID_LINEA': obj.reg.id, 'NUCO': obj.reg.nuco || '',
        'FECHA': ahora, 'CARPETA_ID': datos.carpetaId, 'RUTA': datos.ruta || '', 'FOTOS_CARPETA_ID': datos.fotosCarpetaId || '',
        'FOTOS': String((datos.fotos || []).length), 'PDFS_JSON': '[]', 'COINCIDENCIA_EXACTA': 'TRUE',
        'ALERTAS_JSON': '[]', 'ID_ANTERIOR': '', 'ACTUALIZADO_EN': ahora,
      }]);
      LineasRepo.registrarMovimiento('INSPECCION', { motivo: 'Inspección registrada', ticket: valores['TICKET'] }, usuario, ahora, {
        refs: [obj.reg.id], nuco: obj.reg.nuco, numero: valores['No TELEFONO'],
        antes: { estado: obj.equipo ? resumenEquipo_(obj.equipo) : resumenLinea_(obj.linea) },
        despues: { calificacion: calificacion },
        detalle: Object.assign(detalleCambios_([g]), { inspeccionId: id }),
      });
      return { obj: obj, calificacion: calificacion };
    });

    firmasCache_('INSPECCION', id, { inspector: datos.firmaInspectorBase64, responsable: datos.firmaResponsableBase64 || null, patron: datos.patronBase64 || null });
    const filas = LineasRepo.refrescarIndice([res.obj.reg.id]);
    return { id: id, calificacion: res.calificacion, pdfPendiente: true, filas: filas };
  }

  // ======================================================================
  // Responsiva
  // ======================================================================

  function guardarResponsiva(datos, usuario, puedeVerSecretos) {
    const ref = { equipoId: datos.equipoId || null, lineaId: datos.equipoId ? null : datos.lineaId };
    if (!datos.carpetaId) throw new Error('Falta la carpeta de evidencia.');
    if (!datos.firmaCiBase64) throw new Error('FIRMA RESPONSABLE DE CONTROL INTERNO es obligatorio');
    const id = /^[\w-]{6,40}$/.test(String(datos.id || '')) ? String(datos.id) : LineasDatos.nuevoIdCorto();

    const res = LineasDatos.conCandado(() => {
      const ahora = new Date();
      const obj = objetivoCaptura_(ref);
      const elementos = formularioResponsiva_(obj.fila, usuario, id, ahora)
        .map((e) => (e.secreto && !puedeVerSecretos ? Object.assign({}, e, { valorOculto: true }) : e));
      const ocultos = {};
      elementos.forEach((e) => { if (e.secreto) ocultos[e.columna] = e.valor; });
      const r = validarFormulario_(elementos, datos.valores || {}, ocultos);
      if (r.errores.length) throw new Error(r.errores.join(' · '));
      const valores = r.valores;
      if (datos.patron !== undefined && datos.patron !== null) valores['CONTRASEÑA'] = String(datos.patron);
      // Bot MAYUSCULAS
      valores['IDENTIFICACION'] = String(valores['IDENTIFICACION'] || '').toUpperCase();
      valores['OBSERVACIONES'] = String(valores['OBSERVACIONES'] || '').toUpperCase();

      const fila = Object.assign({}, valores, {
        'ID': id, 'ID LINEA': obj.reg.id, 'FECHA RESPONSIVA': '', 'TIPO CONTRASEÑA': '',
        'NOMBRE CI': usuario.nombre, 'FIRMA RESPONSABLE': '', 'FIRMA CI': '',
      });
      LineasDatos.agregarFilas(LineasRepo.TAB.RESP, [fila]);

      LineasRepo.asegurarPestanaApp(LineasRepo.TAB.APP_EVID);
      LineasDatos.agregarFilas(LineasRepo.TAB.APP_EVID, [{
        'ID': LineasDatos.nuevoIdCorto(), 'TIPO': 'RESPONSIVA', 'ORIGEN': 'SISTEMA', 'ID_REGISTRO': id, 'ID_LINEA': obj.reg.id, 'NUCO': obj.reg.nuco || '',
        'FECHA': ahora, 'CARPETA_ID': datos.carpetaId, 'RUTA': datos.ruta || '', 'FOTOS': '0',
        'PDFS_JSON': '[]', 'COINCIDENCIA_EXACTA': 'TRUE', 'ACTUALIZADO_EN': ahora,
      }]);
      LineasRepo.registrarMovimiento('RESPONSIVA', { motivo: 'Responsiva firmada' }, usuario, ahora, {
        refs: [obj.reg.id], nuco: obj.reg.nuco, numero: valores['No TELEFONO'] || null,
        antes: {}, despues: { responsable: { nombre: valores['RESPONSABLE'] || null } },
        detalle: { idsCambios: [], idsReasignacion: [], cambios: [], responsivaId: id },
      });
      return { obj: obj };
    });

    firmasCache_('RESPONSIVA', id, { responsable: datos.firmaResponsableBase64 || null, ci: datos.firmaCiBase64, patron: datos.patronBase64 || null });
    const filas = LineasRepo.refrescarIndice([res.obj.reg.id]);
    return { id: id, pdfPendiente: true, filas: filas };
  }

  // ======================================================================
  // PDF (después de guardar), con la fila tal como quedó en la hoja
  // ======================================================================

  function leerFilaPorId_(tabla, id) {
    const filas = LineasDatos.buscarFilas(tabla, 'ID', id);
    if (!filas.length) return null;
    return LineasDatos.leerFilas([{ tabla: tabla, filas: filas.slice(0, 1) }])[0][0];
  }

  function evidenciaSistema_(id) {
    const filasEv = LineasDatos.existeTabla(LineasRepo.TAB.APP_EVID) ? LineasDatos.buscarFilas(LineasRepo.TAB.APP_EVID, 'ID_REGISTRO', id) : [];
    if (!filasEv.length) return null;
    const ev = LineasRepo.evidenciaDesdeFila(LineasDatos.leerFilas([{ tabla: LineasRepo.TAB.APP_EVID, filas: filasEv.slice(0, 1) }])[0][0]);
    return ev && ev.origen === 'SISTEMA' ? ev : null;
  }

  /** Registro para la plantilla: la fila con los formatos que muestra el AppSheet. */
  function registroPlantilla_(fila) {
    const registro = {};
    Object.keys(fila).forEach((k) => { if (k !== '_fila') registro[k] = fila[k]; });
    if ('CALIFICACION' in registro) registro['CALIFICACION'] = LineasChecklist.calificacionTexto(registro['CALIFICACION']);
    return registro;
  }

  /** Escribe el enlace del PDF en la fila (columna File del AppSheet) y en APP_EVIDENCIAS. */
  function ligarPdf_(tabla, columnaPdf, id, pdf) {
    const filas = LineasDatos.buscarFilas(tabla, 'ID', id);
    if (filas.length) { const o = {}; o[columnaPdf] = urlArchivo_(pdf.id); LineasDatos.actualizarFila(tabla, filas[0], o); }
    if (LineasDatos.existeTabla(LineasRepo.TAB.APP_EVID)) {
      const filasEv = LineasDatos.buscarFilas(LineasRepo.TAB.APP_EVID, 'ID_REGISTRO', id);
      if (filasEv.length) LineasDatos.actualizarFila(LineasRepo.TAB.APP_EVID, filasEv[0], { 'PDFS_JSON': JSON.stringify([{ id: pdf.id, nombre: pdf.nombre }]), 'ACTUALIZADO_EN': new Date() });
    }
  }

  /** Genera (o regenera con forzar=true) el PDF de una inspección o responsiva capturada en el sistema. */
  function generarPdf(tipo, id, forzar, usuario, firmasNuevas) {
    const esInspeccion = tipo === 'INSPECCION';
    if (!esInspeccion && tipo !== 'RESPONSIVA') throw new Error('Tipo de PDF inválido.');
    const tabla = esInspeccion ? LineasRepo.TAB.INSP : LineasRepo.TAB.RESP;
    const fila = leerFilaPorId_(tabla, id);
    if (!fila) throw new Error('No existe ' + (esInspeccion ? 'la inspección ' : 'la responsiva ') + id);
    const ev = evidenciaSistema_(id);
    if (!ev) throw new Error('Solo se generan PDF de registros capturados en el sistema.');
    if (!forzar && ev.pdfs && ev.pdfs.length) return ev.pdfs[0];

    const firmas = firmasCache_(tipo, id, firmasNuevas);
    const archivo = (col) => LineasEvidencias.blobDeArchivo(idDeUrlDrive_(LineasUtil.col(fila, col)));
    const imagen = (clave, col, nombre) => (firmas && firmas[clave] ? blobBase64_(firmas[clave], nombre) : archivo(col));
    if (!firmas && !idDeUrlDrive_(LineasUtil.col(fila, esInspeccion ? 'FIRMA INSPECTOR' : 'FIRMA CI'))) {
      throw new Error('La firma temporal ya no está disponible. Captura ' + (esInspeccion ? 'una inspección nueva.' : 'una responsiva nueva.'));
    }
    const fecha = LineasUtil.fecha(LineasUtil.col(fila, esInspeccion ? 'FECHA DE REGISTRO' : 'FECHA RESPONSIVA')) || ev.fecha || new Date();
    const nuco = LineasUtil.nuco4(LineasUtil.col(fila, 'NUCO')) || 'SIN NUCO';
    const nombre = (esInspeccion ? 'INSP ' : 'RESP ') + nuco + ' ' + Utilities.formatDate(fecha, ZONA, 'dd MM') + '.pdf';
    const imagenes = esInspeccion
      ? { 'FIRMA RESPONSABLE': imagen('responsable', 'FIRMA RESPONSABLE', 'firma-responsable.png'), 'FIRMA INSPECTOR': imagen('inspector', 'FIRMA INSPECTOR', 'firma-inspector.png'), 'PATRON': imagen('patron', 'PATRON', 'patron.png') }
      : { 'FIRMA RESPONSABLE': imagen('responsable', 'FIRMA RESPONSABLE', 'firma-responsable.png'), 'FIRMA CI': imagen('ci', 'FIRMA CI', 'firma-ci.png'), 'CONTRASEÑA': imagen('patron', 'CONTRASEÑA', 'patron.png') };
    try {
      const pdf = LineasPdf.generarPdfDesdePlantilla(
        esInspeccion ? LineasPdf.PLANTILLAS.INSPECCION_CELULAR : LineasPdf.PLANTILLAS.RESPONSIVA_CELULAR,
        registroPlantilla_(fila), imagenes, DriveApp.getFolderById(ev.carpetaId), nombre);
      LineasDatos.conCandado(() => ligarPdf_(tabla, esInspeccion ? 'FORMATO INSPECCIONES LINEAS' : 'FORMATO RESPONSIVA', id, pdf));
      return pdf;
    } catch (e) {
      console.error('generarPdf ' + tipo + ' (' + id + '): ' + e.message);
      throw new Error('No se pudo generar el PDF de la ' + (esInspeccion ? 'inspección' : 'responsiva') + ': ' + e.message);
    }
  }

  return {
    objetivo: objetivoCaptura_, guardarInspeccion, guardarResponsiva, generarPdf,
    contextoInspeccion: (ref, usuario, puedeVerSecretos) => paraCliente_(contextoInspeccion(ref, usuario, puedeVerSecretos)),
    contextoResponsiva: (ref, usuario, puedeVerSecretos) => paraCliente_(contextoResponsiva(ref, usuario, puedeVerSecretos)),
    // Para pruebas: las definiciones de los formularios
    _formularioInspeccion: formularioInspeccion_, _formularioResponsiva: formularioResponsiva_, _validar: validarFormulario_,
  };
})();
