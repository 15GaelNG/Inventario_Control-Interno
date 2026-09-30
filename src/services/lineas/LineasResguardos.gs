/**
 * LineasResguardos.gs
 * Mandar equipos a resguardo y la bandeja de Pau (reunión con Líneas, 30-sep-2026).
 *
 * Cómo lo pidió el área (ver migracion/RESULTADOS_REUNION_LINEAS_30SEP.md en la carpeta de documentación):
 * - "Mandar a resguardo" funciona con uno o varios equipos, pero cada NUCO lleva sus datos: DEPARTAMENTO (DISPONIBLE),
 *   SEDE y OFICINA / DESARROLLO (obligatorios: dónde está físicamente), ESTATUS EQUIPO, ESTATUS LINEA y un comentario.
 * - Los datos de la persona pasan a N/A en automático (responsable, puesto, jefe, director, PINs, cuenta Google) y el
 *   patrón se borra. El equipo, IMEI, SIM, accesorios, razón social, compañía y costo del plan se conservan.
 * - La línea queda DISPONIBLE si su adendum sigue vigente o va EN PROCESO DE CANCELACION si ya venció: el sistema lo
 *   propone con FIN PLAN y quien manda lo confirma.
 * - El estatus cambia al mandar ("ya deben venir con el estatus", Gio). Al mismo tiempo se crea el renglón de la
 *   bandeja de Pau en APP_RESGUARDOS, que sigue su propio camino, igual que la hoja de Bren:
 *     recepción:    PENDIENTE DE RECEPCION → EN RESGUARDO → ENTREGADO A LINEAS | VENDIDO
 *     cancelación:  POR FIRMAR → CARTA FIRMADA → CARTA ENVIADA → CANCELADA (solo si la línea va a cancelación)
 * - Al confirmar la cancelación, la línea queda CANCELADA y el NUCO pasa de EQUIPO + SIM a EQUIPO; el número queda en la
 *   bitácora (lo que hoy hacen a mano).
 * - PARA VENTA y PARA DESECHO (y POSIBLE VENTA-DAÑO) siguen esta misma lógica (usuario, 30-sep): desde la ficha,
 *   "Cambiar estatus" a cualquiera de ellos abre este formulario, y la edición directa no los acepta. Si el equipo ya
 *   estaba guardado (p. ej. RESGUARDO → PARA VENTA) no se pide otra recepción: se actualiza su renglón abierto o, si
 *   no tiene y su línea va a cancelación, se crea ya EN RESGUARDO.
 * - Quién aprueba (Pau y su suplente) se configura en la Script Property LINEAS_APROBADORES_RESGUARDO (correos
 *   separados por coma); ADMIN también puede. Cualquiera del módulo ve la bandeja (el avance).
 */
const LineasResguardos = (function () {
  const TAB = 'APP_RESGUARDOS';
  const ENCABEZADOS = ['ID', 'FECHA', 'REGISTRO_ID', 'NUCO', 'NUMERO', 'TIPO', 'MODELO', 'IMEI', 'COMPANIA', 'RAZON_SOCIAL', 'FIN_PLAN',
    'ESTATUS_EQUIPO', 'ESTATUS_LINEA', 'DEPARTAMENTO', 'SEDE', 'OFICINA', 'COMENTARIO', 'MOTIVO', 'SOLICITO_CORREO', 'SOLICITO_NOMBRE',
    'ESTADO', 'RECIBIDO_EN', 'RECIBIO', 'ENTREGADO_EN', 'ENTREGADO_A', 'ENTREGA_ASUNTO',
    'CANCELACION', 'ASESOR', 'CARTA_FIRMADA_EN', 'CARTA_ENVIADA_EN', 'CANCELACION_ASUNTO', 'CANCELADA_EN', 'CANCELO', 'ACTUALIZADO_EN'];

  const ESTADO = { PENDIENTE: 'PENDIENTE DE RECEPCION', RESGUARDO: 'EN RESGUARDO', ENTREGADO: 'ENTREGADO A LINEAS', VENDIDO: 'VENDIDO' };
  const FASE = { POR_FIRMAR: 'POR FIRMAR', FIRMADA: 'CARTA FIRMADA', ENVIADA: 'CARTA ENVIADA', CANCELADA: 'CANCELADA' };

  /** Estatus del equipo que tienen sentido al mandarlo al almacén (los demás son bajas). */
  const ESTATUS_EQUIPO_RESGUARDO = ['RESGUARDO', 'PARA VENTA', 'POSIBLE VENTA-DAÑO', 'PARA DESECHO'];
  const LINEA_DISPONIBLE = 'DISPONIBLE';
  const LINEA_CANCELACION = 'EN PROCESO DE CANCELACION';
  const ESTATUS_LINEA_RESGUARDO = [LINEA_DISPONIBLE, LINEA_CANCELACION];

  const NA = 'N/A';
  const NO_APLICA = 'NO APLICA';
  /** Datos de la persona que pasan a N/A (reunión 30-sep). Los PIN y la cuenta solo si tenían algo. */
  const CAMPOS_NA = ['RESPONSABLE', 'PUESTO', 'JEFE DIRECTO', 'DIRECTOR'];
  const CAMPOS_NA_SI_HAY = ['PIN WHATSAPP', 'PIN EQUIPO', 'CUENTA GOOGLE'];
  const CAMPOS_BORRAR = ['PATRON'];
  const COLS_UBICACION = ['DEPARTAMENTO', 'SEDE', 'OFICINA / DESARROLLO'];

  /** Asesor del proveedor según compañía y razón social (hoja de Bren, "PROCESO Y REFERENCIAS"). */
  const ASESORES = [
    { compania: /AT&T|ATT/, razon: /./, asesor: 'KARLA' },
    { compania: /TELCEL/, razon: /GPH|CONDOMINALES/, asesor: 'ALFREDO' },
    { compania: /TELCEL/, razon: /ROMITA|FRO/, asesor: 'WILBERTO' },
  ];

  const MAXIMO = 150;
  const PROP_APROBADORES = 'LINEAS_APROBADORES_RESGUARDO';

  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const may = (v) => txt(v).toUpperCase();
  const dia = (d) => Utilities.formatDate(d, LineasDatos.ZONA_APP, 'yyyy-MM-dd');

  // ---------------- Permisos ----------------

  function aprobadores_() {
    return String(PropertiesService.getScriptProperties().getProperty(PROP_APROBADORES) || '')
      .split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
  }

  /** Pau y su suplente (Script Property) o ADMIN. */
  function puedeAprobar(usuario) {
    return !!usuario && (usuario.esAdmin || aprobadores_().indexOf(String(usuario.correo || '').toLowerCase()) >= 0);
  }

  function exigirAprobador_(usuario) {
    if (!puedeAprobar(usuario)) throw new Error('Solo quien recibe los resguardos (y ADMIN) puede hacer este paso.');
  }

  // ---------------- Apoyos ----------------

  function asesorPara(compania, razonSocial) {
    const c = may(compania);
    const r = may(razonSocial);
    const regla = ASESORES.filter((a) => a.compania.test(c) && a.razon.test(r))[0];
    return regla ? regla.asesor : '';
  }

  /** Vigencia del adendum: { fin: 'dd/mm/aaaa' | '', vigencia: 'vigente' | 'vencido' | 'sin fecha' }. */
  function vigencia_(finPlan, hoy) {
    const ymd = LineasNotificaciones._diaFinPlan(finPlan);
    if (!ymd) return { fin: '', vigencia: 'sin fecha' };
    return { fin: ymd.slice(8, 10) + '/' + ymd.slice(5, 7) + '/' + ymd.slice(0, 4), vigencia: ymd >= hoy ? 'vigente' : 'vencido' };
  }

  /** Estatus de la línea que se propone: vencido → cancelación; vigente, sin fecha o SIM básico → disponible. */
  function propuestaLinea_(tipo, vig) {
    if (/BASICO|BASICA/.test(may(tipo))) return LINEA_DISPONIBLE; // los SIM básicos no tienen adendum
    return vig.vigencia === 'vencido' ? LINEA_CANCELACION : LINEA_DISPONIBLE;
  }

  function filasPorId_() {
    const porId = {};
    LineasDatos.leerTabla(LineasRepo.TAB.LINEAS).forEach((f) => { LineasDatos.idsDeFila(f).forEach((k) => { porId[k] = f; }); });
    return porId;
  }

  function limpiarIds_(ids) {
    const lista = (Array.isArray(ids) ? ids : []).map(txt).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
    if (!lista.length) throw new Error('Selecciona al menos un equipo.');
    if (lista.length > MAXIMO) throw new Error('Son ' + lista.length + '; el máximo por operación es ' + MAXIMO + '. Divide la selección.');
    return lista;
  }

  /** Campos de ubicación con las mismas listas (y reglas por coordinación) que "Editar información". */
  function camposUbicacion_(usuario) {
    const base = LineasRegistros._elementos({}, LineasRepo.catalogos(), usuario, { nuevo: false });
    return COLS_UBICACION.map((c) => Object.assign({}, base.filter((e) => e.columna === c)[0], {
      editable: 'SIEMPRE', requerido: 'SIEMPRE', valor: c === 'DEPARTAMENTO' ? LineasRepo.DEPARTAMENTO_DISPONIBLE : '',
    }));
  }

  // ---------------- Mandar a resguardo ----------------

  /**
   * Datos para el formulario: por cada equipo lo que tiene hoy y la propuesta de la línea. Los que no son equipo se
   * regresan en `omitidos`.
   */
  function formulario(ids, usuario) {
    const lista = limpiarIds_(ids);
    const porId = filasPorId_();
    const hoy = dia(new Date());
    const equipos = [];
    const omitidos = [];
    lista.forEach((id) => {
      const f = porId[id];
      if (!f) { omitidos.push({ id: id, motivo: 'Ya no existe en la hoja' }); return; }
      const tipo = may(LineasUtil.col(f, 'TIPO'));
      const nuco = LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO')) || '';
      if (!LineasRepo.TIPOS_CON_EQUIPO[tipo]) { omitidos.push({ id: id, nuco: nuco, motivo: 'No es un equipo (TIPO ' + (tipo || 'vacío') + ')' }); return; }
      const reg = LineasRepo.convertirRegistro(f);
      const linea = reg && reg.linea;
      const vig = vigencia_(LineasUtil.col(f, 'FIN PLAN'), hoy);
      equipos.push({
        id: txt(f['ID']), nuco: nuco, tipo: tipo, modelo: txt(LineasUtil.col(f, 'EQUIPO')), imei: txt(LineasUtil.col(f, 'IMEI')),
        responsable: txt(LineasUtil.col(f, 'RESPONSABLE')), estatusEquipo: txt(LineasUtil.col(f, 'ESTATUS EQUIPO')),
        departamento: txt(LineasUtil.col(f, 'DEPARTAMENTO')), sede: txt(LineasUtil.col(f, 'SEDE')), oficina: txt(LineasUtil.col(f, 'OFICINA / DESARROLLO')),
        tieneLinea: !!linea, numero: linea ? txt(LineasUtil.col(f, 'NUMERO TELEFONO')) : '', compania: txt(LineasUtil.col(f, 'COMPAÑIA')),
        estatusLinea: txt(LineasUtil.col(f, 'ESTATUS LINEA')), finPlan: vig.fin, vigencia: vig.vigencia,
        propuestaLinea: linea ? propuestaLinea_(tipo, vig) : '',
      });
    });
    return {
      maximo: MAXIMO, equipos: equipos, omitidos: omitidos, campos: camposUbicacion_(usuario),
      estatusEquipo: ESTATUS_EQUIPO_RESGUARDO, estatusLinea: ESTATUS_LINEA_RESGUARDO,
      camposNA: CAMPOS_NA.concat(CAMPOS_NA_SI_HAY), camposBorrar: CAMPOS_BORRAR,
    };
  }

  /** Cambios de LINEAS TELEFONICAS para un equipo que se manda a resguardo. */
  function cambiosResguardo_(f, pedido, tieneLinea) {
    const cambios = {};
    COLS_UBICACION.forEach((c) => { cambios[c] = pedido[c]; });
    cambios['ESTATUS EQUIPO'] = pedido['ESTATUS EQUIPO'];
    if (tieneLinea) cambios['ESTATUS LINEA'] = pedido['ESTATUS LINEA'];
    CAMPOS_NA.forEach((c) => { cambios[c] = NA; });
    CAMPOS_NA_SI_HAY.forEach((c) => {
      const actual = may(LineasUtil.col(f, c));
      if (actual && actual !== NO_APLICA && actual !== NA) cambios[c] = NA;
    });
    CAMPOS_BORRAR.forEach((c) => { if (txt(LineasUtil.col(f, c))) cambios[c] = ''; });
    // "Quien usa" sigue al responsable (Reset_If del AppSheet)
    if (may(LineasUtil.col(f, 'RESPONSABLE USA EL EQUIPO')) === 'SI') { cambios['NOMBRE QUIEN USA'] = NA; cambios['PUESTO QUIEN USA'] = NA; }
    if (txt(pedido.COMENTARIO).length > 3) cambios['COMENTARIOS'] = txt(pedido.COMENTARIO).toUpperCase();
    return cambios;
  }

  /**
   * datos = { motivo, porEquipo: { id: { DEPARTAMENTO, SEDE, 'OFICINA / DESARROLLO', 'ESTATUS EQUIPO', 'ESTATUS LINEA', COMENTARIO } } }.
   * Regresa { hechos: [{ id, nuco, cancelacion }], omitidos: [{ id, nuco, motivo }] }.
   */
  function mandar(ids, datos, usuario) {
    const lista = limpiarIds_(ids);
    const d = datos || {};
    const motivo = txt(d.motivo);
    if (motivo.length <= 3) throw new Error('Escribe el motivo del resguardo (queda en el historial de cada equipo).');
    const porEquipo = d.porEquipo || {};
    const campos = camposUbicacion_(usuario);

    // Validación completa antes de escribir nada
    const errores = [];
    const pedidos = {};
    lista.forEach((id) => {
      const p = porEquipo[id] || {};
      const etiqueta = p._ETIQUETA ? p._ETIQUETA + ': ' : '';
      const r = LineasRegistros._resolver(campos, {}, p, { nuevo: false });
      r.errores.forEach((e) => errores.push(etiqueta + e));
      const estatusEquipo = may(p['ESTATUS EQUIPO']);
      if (ESTATUS_EQUIPO_RESGUARDO.indexOf(estatusEquipo) < 0) errores.push(etiqueta + 'ESTATUS EQUIPO: elige ' + ESTATUS_EQUIPO_RESGUARDO.join(', '));
      const estatusLinea = may(p['ESTATUS LINEA']);
      if (estatusLinea && ESTATUS_LINEA_RESGUARDO.indexOf(estatusLinea) < 0) errores.push(etiqueta + 'ESTATUS LINEA: elige DISPONIBLE o EN PROCESO DE CANCELACION');
      pedidos[id] = Object.assign({}, r.valores, { 'ESTATUS EQUIPO': estatusEquipo, 'ESTATUS LINEA': estatusLinea, COMENTARIO: txt(p.COMENTARIO) });
    });
    if (errores.length) throw new Error(errores.slice(0, 6).join(' · '));

    const hechos = [];
    const omitidos = [];
    LineasDatos.conCandado(() => {
      if (!LineasDatos.existeTabla(TAB)) LineasDatos.asegurarPestana(TAB, ENCABEZADOS);
      const porId = filasPorId_();
      const hoy = dia(new Date());
      const nuevos = [];
      // Renglón abierto de la bandeja por equipo: si ya está guardado, no se pide otra recepción
      const abiertos = {};
      const bandejaActual = LineasDatos.leerTabla(TAB);
      bandejaActual.forEach((r) => {
        if ([ESTADO.PENDIENTE, ESTADO.RESGUARDO].indexOf(txt(r['ESTADO'])) >= 0) abiertos[txt(r['REGISTRO_ID'])] = r;
      });
      const cancelando = cancelacionesEnCurso_(bandejaActual);
      lista.forEach((id) => {
        const f = porId[id];
        const nuco = f ? LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO')) || '' : '';
        if (!f) { omitidos.push({ id: id, nuco: nuco, motivo: 'Ya no existe en la hoja' }); return; }
        const tipo = may(LineasUtil.col(f, 'TIPO'));
        if (!LineasRepo.TIPOS_CON_EQUIPO[tipo]) { omitidos.push({ id: id, nuco: nuco, motivo: 'No es un equipo' }); return; }
        const reg = LineasRepo.convertirRegistro(f);
        const tieneLinea = !!(reg && reg.linea);
        const pedido = pedidos[id];
        if (tieneLinea && !pedido['ESTATUS LINEA']) { omitidos.push({ id: id, nuco: nuco, motivo: 'Falta el estatus de la línea' }); return; }
        const antes = { estatus: txt(LineasUtil.col(f, 'ESTATUS EQUIPO')), estatusLinea: txt(LineasUtil.col(f, 'ESTATUS LINEA')), responsable: { nombre: txt(LineasUtil.col(f, 'RESPONSABLE')) } };
        // Ya estaba guardado (p. ej. RESGUARDO → PARA VENTA): el teléfono ya está con quien recibe
        const yaGuardado = ESTATUS_EQUIPO_RESGUARDO.indexOf(may(antes.estatus)) >= 0;
        const ahora = new Date();
        const guardado = LineasRepo.guardarCambiosRegistro(f, cambiosResguardo_(f, pedido, tieneLinea), usuario, ahora);
        LineasRepo.registrarMovimiento('RESGUARDO', { motivo: (yaGuardado ? 'Cambio a ' + pedido['ESTATUS EQUIPO'] : 'Mandar a resguardo') + ': ' + motivo }, usuario, ahora, {
          refs: [id], nuco: LineasUtil.col(f, 'NUCO'), numero: LineasUtil.col(f, 'NUMERO TELEFONO'),
          antes: antes, despues: { estatus: pedido['ESTATUS EQUIPO'], estatusLinea: tieneLinea ? pedido['ESTATUS LINEA'] : '' },
          detalle: { idsCambios: guardado.idsCambios, idsReasignacion: [], cambios: guardado.campos },
        });
        // Si su línea ya va en la bandeja de cancelaciones (Mandar a cancelación), no se abre otro camino
        const cancela = tieneLinea && pedido['ESTATUS LINEA'] === LINEA_CANCELACION &&
          !cancelando[claveCancelacion_(f['ID'], LineasUtil.col(f, 'NUMERO TELEFONO'))];
        const compania = txt(LineasUtil.col(f, 'COMPAÑIA'));
        const razon = txt(LineasUtil.col(f, 'RAZON SOCIAL'));
        const abierto = yaGuardado ? abiertos[txt(f['ID'])] : null;
        if (abierto) {
          // Se actualiza su renglón; si la línea ahora va a cancelación, arranca ese camino
          const nuevaCancelacion = cancela && !txt(abierto['CANCELACION']);
          LineasDatos.actualizarFila(TAB, abierto._fila, Object.assign({
            'ESTATUS_EQUIPO': pedido['ESTATUS EQUIPO'], 'ESTATUS_LINEA': tieneLinea ? pedido['ESTATUS LINEA'] : '',
            'DEPARTAMENTO': pedido.DEPARTAMENTO, 'SEDE': pedido.SEDE, 'OFICINA': pedido['OFICINA / DESARROLLO'], 'ACTUALIZADO_EN': ahora,
          }, nuevaCancelacion ? { 'CANCELACION': FASE.POR_FIRMAR, 'ASESOR': asesorPara(compania, razon) } : {}));
          hechos.push({ id: id, nuco: nuco, cancelacion: nuevaCancelacion, yaGuardado: true });
          return;
        }
        if (yaGuardado && !cancela) {
          // Sin renglón abierto (se guardó antes de la bandeja) y sin cancelación: no hay nada que recibir
          hechos.push({ id: id, nuco: nuco, cancelacion: false, yaGuardado: true });
          return;
        }
        nuevos.push({
          'FECHA': ahora, 'REGISTRO_ID': txt(f['ID']), 'NUCO': nuco, 'NUMERO': tieneLinea ? txt(LineasUtil.col(f, 'NUMERO TELEFONO')) : '',
          'TIPO': tipo, 'MODELO': txt(LineasUtil.col(f, 'EQUIPO')), 'IMEI': txt(LineasUtil.col(f, 'IMEI')), 'COMPANIA': compania,
          'RAZON_SOCIAL': razon, 'FIN_PLAN': vigencia_(LineasUtil.col(f, 'FIN PLAN'), hoy).fin,
          'ESTATUS_EQUIPO': pedido['ESTATUS EQUIPO'], 'ESTATUS_LINEA': tieneLinea ? pedido['ESTATUS LINEA'] : '',
          'DEPARTAMENTO': pedido.DEPARTAMENTO, 'SEDE': pedido.SEDE, 'OFICINA': pedido['OFICINA / DESARROLLO'],
          'COMENTARIO': pedido.COMENTARIO, 'MOTIVO': motivo, 'SOLICITO_CORREO': usuario.correo, 'SOLICITO_NOMBRE': usuario.nombre,
          // Ya guardado sin renglón abierto: solo arranca la cancelación, el teléfono ya está recibido
          'ESTADO': yaGuardado ? ESTADO.RESGUARDO : ESTADO.PENDIENTE, 'RECIBIO': yaGuardado ? 'Ya estaba en resguardo' : '',
          'CANCELACION': cancela ? FASE.POR_FIRMAR : '', 'ASESOR': cancela ? asesorPara(compania, razon) : '',
          'ACTUALIZADO_EN': ahora,
        });
        hechos.push({ id: id, nuco: nuco, cancelacion: cancela, yaGuardado: yaGuardado });
      });
      LineasDatos.agregarFilas(TAB, nuevos);
    });
    if (hechos.length) LineasRepo.indice(true);
    const porRecibir = hechos.filter((h) => !h.yaGuardado);
    const conCancelacion = hechos.filter((h) => h.cancelacion);
    if (porRecibir.length) {
      avisar_('RESGUARDO', 'Equipos por recibir · ' + porRecibir.length,
        usuario.nombre + ' mandó ' + porRecibir.length + ' equipo(s) a resguardo' + (conCancelacion.length ? ', ' + conCancelacion.length + ' con la línea para cancelación' : '') +
        ': NUCO ' + porRecibir.slice(0, 10).map((h) => h.nuco).join(', ') + (porRecibir.length > 10 ? '…' : '') + '.');
    } else if (conCancelacion.length) {
      avisar_('RESGUARDO', 'Líneas para cancelar · ' + conCancelacion.length,
        usuario.nombre + ' mandó a cancelación la línea de ' + conCancelacion.length + ' equipo(s) que ya estaban en resguardo: NUCO ' +
        conCancelacion.slice(0, 10).map((h) => h.nuco).join(', ') + '.');
    }
    return { hechos: hechos, omitidos: omitidos };
  }

  const claveCancelacion_ = (registroId, numero) => txt(registroId) + '|' + LineasUtil.digitos(numero);

  /** Líneas con un camino de cancelación abierto en la bandeja (clave REGISTRO_ID|número). */
  function cancelacionesEnCurso_(filas) {
    const m = {};
    filas.forEach((r) => {
      const fase = txt(r['CANCELACION']);
      if (fase && fase !== FASE.CANCELADA) m[claveCancelacion_(r['REGISTRO_ID'], r['NUMERO'])] = true;
    });
    return m;
  }

  // ---------------- Mandar a cancelación (sin resguardo) ----------------

  /**
   * "Mandar a cancelación" (usuario, 30-sep): una o varias líneas se mandan a cancelar sin mandar el equipo a
   * resguardo (el colaborador se queda con el teléfono, o es una línea suelta). La línea pasa a EN PROCESO DE
   * CANCELACION y entra a la pestaña Cancelaciones de la bandeja (POR FIRMAR, con su asesor). Su renglón no lleva
   * recepción (ESTADO vacío): no aparece en la pestaña Resguardos. Al confirmarla, queda CANCELADA como siempre.
   * datos = { motivo, comentario }. Regresa { hechos: [{ id, nuco, numero }], omitidos: [{ id, nuco, motivo }] }.
   */
  function mandarCancelacion(ids, datos, usuario) {
    const lista = limpiarIds_(ids);
    const d = datos || {};
    const motivo = txt(d.motivo);
    if (motivo.length <= 3) throw new Error('Escribe el motivo de la cancelación (queda en el historial de cada línea).');
    const hechos = [];
    const omitidos = [];
    LineasDatos.conCandado(() => {
      if (!LineasDatos.existeTabla(TAB)) LineasDatos.asegurarPestana(TAB, ENCABEZADOS);
      const porId = filasPorId_();
      const cancelando = cancelacionesEnCurso_(LineasDatos.leerTabla(TAB));
      const hoy = dia(new Date());
      const nuevos = [];
      lista.forEach((id) => {
        const f = porId[id];
        const nuco = f ? LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO')) || '' : '';
        if (!f) { omitidos.push({ id: id, nuco: nuco, motivo: 'Ya no existe en la hoja' }); return; }
        const reg = LineasRepo.convertirRegistro(f);
        const numero = txt(LineasUtil.col(f, 'NUMERO TELEFONO'));
        if (!reg || !reg.linea) { omitidos.push({ id: id, nuco: nuco, motivo: 'No tiene línea' }); return; }
        if (may(LineasUtil.col(f, 'ESTATUS LINEA')) === 'CANCELADA') { omitidos.push({ id: id, nuco: nuco, numero: numero, motivo: 'Ya está cancelada' }); return; }
        if (cancelando[claveCancelacion_(f['ID'], numero)]) { omitidos.push({ id: id, nuco: nuco, numero: numero, motivo: 'Ya está en la bandeja de cancelaciones' }); return; }
        const ahora = new Date();
        const antes = { estatusLinea: txt(LineasUtil.col(f, 'ESTATUS LINEA')) };
        const guardado = LineasRepo.guardarCambiosRegistro(f, { 'ESTATUS LINEA': LINEA_CANCELACION }, usuario, ahora);
        LineasRepo.registrarMovimiento('CANCELACION_LINEA', { motivo: 'Mandar a cancelación: ' + motivo }, usuario, ahora, {
          refs: [id], nuco: LineasUtil.col(f, 'NUCO'), numero: numero, antes: antes, despues: { estatusLinea: LINEA_CANCELACION },
          detalle: { idsCambios: guardado.idsCambios, idsReasignacion: [], cambios: guardado.campos },
        });
        const compania = txt(LineasUtil.col(f, 'COMPAÑIA'));
        const razon = txt(LineasUtil.col(f, 'RAZON SOCIAL'));
        nuevos.push({
          'FECHA': ahora, 'REGISTRO_ID': txt(f['ID']), 'NUCO': nuco, 'NUMERO': numero, 'TIPO': may(LineasUtil.col(f, 'TIPO')),
          'MODELO': txt(LineasUtil.col(f, 'EQUIPO')), 'IMEI': txt(LineasUtil.col(f, 'IMEI')), 'COMPANIA': compania, 'RAZON_SOCIAL': razon,
          'FIN_PLAN': vigencia_(LineasUtil.col(f, 'FIN PLAN'), hoy).fin, 'ESTATUS_EQUIPO': txt(LineasUtil.col(f, 'ESTATUS EQUIPO')),
          'ESTATUS_LINEA': LINEA_CANCELACION, 'DEPARTAMENTO': txt(LineasUtil.col(f, 'DEPARTAMENTO')), 'SEDE': txt(LineasUtil.col(f, 'SEDE')),
          'OFICINA': txt(LineasUtil.col(f, 'OFICINA / DESARROLLO')), 'COMENTARIO': txt(d.comentario), 'MOTIVO': motivo,
          'SOLICITO_CORREO': usuario.correo, 'SOLICITO_NOMBRE': usuario.nombre, 'ESTADO': '',
          'CANCELACION': FASE.POR_FIRMAR, 'ASESOR': asesorPara(compania, razon), 'ACTUALIZADO_EN': ahora,
        });
        hechos.push({ id: id, nuco: nuco, numero: numero });
      });
      LineasDatos.agregarFilas(TAB, nuevos);
    });
    if (hechos.length) {
      LineasRepo.indice(true);
      avisar_('RESGUARDO', 'Líneas para cancelar · ' + hechos.length,
        usuario.nombre + ' mandó a cancelación ' + hechos.length + ' línea(s): ' +
        hechos.slice(0, 10).map((h) => h.numero).join(', ') + (hechos.length > 10 ? '…' : '') + '.');
    }
    return { hechos: hechos, omitidos: omitidos };
  }

  /** Aviso en la campana solo para quien aprueba. */
  function avisar_(tipo, titulo, mensaje) {
    try {
      LineasNotificaciones.crear({ tipo: tipo, titulo: titulo, mensaje: mensaje, para: LineasNotificaciones.PARA_APROBADORES });
    } catch (e) { console.warn('LineasResguardos.avisar_: ' + e.message); }
  }

  // ---------------- Bandeja ----------------

  function fila_(r) {
    const o = {};
    ENCABEZADOS.forEach((h) => { o[h] = r[h] instanceof Date ? r[h] : txt(r[h]); });
    o._fila = r._fila;
    return o;
  }

  /** Todos los renglones de la bandeja, del más reciente al más antiguo, y si la persona puede aprobar. */
  function bandeja(usuario) {
    const filas = LineasDatos.existeTabla(TAB) ? LineasDatos.leerTabla(TAB).map(fila_) : [];
    filas.sort((a, b) => (b.FECHA instanceof Date ? b.FECHA.getTime() : 0) - (a.FECHA instanceof Date ? a.FECHA.getTime() : 0));
    return { puedeAprobar: puedeAprobar(usuario), filas: filas, estados: ESTADO, fases: FASE };
  }

  /** Aplica `cambiar(fila) → cambios | null` a los renglones `ids` (ID de APP_RESGUARDOS). */
  function actualizar_(ids, cambiar) {
    const lista = limpiarIds_(ids);
    const hechos = [];
    const omitidos = [];
    LineasDatos.conCandado(() => {
      const porId = {};
      LineasDatos.leerTabla(TAB).forEach((r) => { porId[txt(r['ID'])] = r; });
      lista.forEach((id) => {
        const r = porId[id];
        if (!r) { omitidos.push({ id: id, motivo: 'No existe' }); return; }
        const res = cambiar(r);
        if (!res || res.omitir) { omitidos.push({ id: id, nuco: txt(r['NUCO']), motivo: (res && res.omitir) || 'Sin cambio' }); return; }
        LineasDatos.actualizarFila(TAB, r._fila, Object.assign({ 'ACTUALIZADO_EN': new Date() }, res));
        hechos.push({ id: id, nuco: txt(r['NUCO']) });
      });
    });
    return { hechos: hechos, omitidos: omitidos };
  }

  /** Pau confirma que recibió físicamente los equipos. */
  function recibir(ids, usuario) {
    exigirAprobador_(usuario);
    return actualizar_(ids, (r) => (txt(r['ESTADO']) !== ESTADO.PENDIENTE ? { omitir: 'Ya estaba ' + (txt(r['ESTADO']) || 'sin estado').toLowerCase() }
      : { 'ESTADO': ESTADO.RESGUARDO, 'RECIBIDO_EN': new Date(), 'RECIBIO': usuario.nombre }));
  }

  /** Pau entrega a Líneas un equipo guardado (datos = { recibe, asunto }). */
  function entregar(ids, datos, usuario) {
    exigirAprobador_(usuario);
    const recibe = txt((datos || {}).recibe).toUpperCase();
    if (!recibe) throw new Error('Escribe quién de Líneas recibe el equipo.');
    return actualizar_(ids, (r) => (txt(r['ESTADO']) !== ESTADO.RESGUARDO ? { omitir: 'No está en resguardo' }
      : { 'ESTADO': ESTADO.ENTREGADO, 'ENTREGADO_EN': new Date(), 'ENTREGADO_A': recibe, 'ENTREGA_ASUNTO': txt((datos || {}).asunto) }));
  }

  /** Pau marca como vendido un equipo guardado; también cambia ESTATUS EQUIPO a VENDIDO en el inventario. */
  function vendido(ids, datos, usuario) {
    exigirAprobador_(usuario);
    const asunto = txt((datos || {}).asunto);
    const r = actualizar_(ids, (x) => (txt(x['ESTADO']) !== ESTADO.RESGUARDO ? { omitir: 'No está en resguardo' }
      : { 'ESTADO': ESTADO.VENDIDO, 'ENTREGA_ASUNTO': asunto }));
    espejar_(r.hechos, (f) => ({ 'ESTATUS EQUIPO': 'VENDIDO' }), 'Vendido (bandeja de resguardos)' + (asunto ? ': ' + asunto : ''), 'VENTA', usuario);
    return r;
  }

  /** Avance de la cancelación: fase FIRMADA o ENVIADA (datos = { asesor, asunto }). */
  function faseCancelacion(ids, fase, datos, usuario) {
    exigirAprobador_(usuario);
    const f = may(fase);
    if ([FASE.FIRMADA, FASE.ENVIADA].indexOf(f) < 0) throw new Error('Fase desconocida: ' + fase);
    const d = datos || {};
    return actualizar_(ids, (r) => {
      const actual = txt(r['CANCELACION']);
      if (!actual) return { omitir: 'Su línea no va a cancelación' };
      if (actual === FASE.CANCELADA) return { omitir: 'Ya está cancelada' };
      const cambios = { 'CANCELACION': f };
      if (txt(d.asesor)) cambios['ASESOR'] = may(d.asesor);
      if (txt(d.asunto)) cambios['CANCELACION_ASUNTO'] = txt(d.asunto);
      cambios[f === FASE.FIRMADA ? 'CARTA_FIRMADA_EN' : 'CARTA_ENVIADA_EN'] = new Date();
      return cambios;
    });
  }

  /**
   * El proveedor confirmó: la línea queda CANCELADA en el inventario, el NUCO pasa a solo EQUIPO y sus datos de línea se
   * limpian (el número queda en la bitácora). Solo si el registro sigue teniendo ese número.
   */
  function confirmarCancelacion(ids, datos, usuario) {
    exigirAprobador_(usuario);
    const asunto = txt((datos || {}).asunto);
    const porId = {};
    const r = actualizar_(ids, (x) => {
      const actual = txt(x['CANCELACION']);
      if (!actual) return { omitir: 'Su línea no va a cancelación' };
      if (actual === FASE.CANCELADA) return { omitir: 'Ya estaba cancelada' };
      porId[txt(x['ID'])] = x;
      return Object.assign({ 'CANCELACION': FASE.CANCELADA, 'CANCELADA_EN': new Date(), 'CANCELO': usuario.nombre }, asunto ? { 'CANCELACION_ASUNTO': asunto } : {});
    });
    espejar_(r.hechos, (f, sol) => {
      if (LineasUtil.digitos(LineasUtil.col(f, 'NUMERO TELEFONO')) !== LineasUtil.digitos(sol['NUMERO'])) return null; // ya tiene otra línea
      const tipo = may(LineasUtil.col(f, 'TIPO'));
      // Registro de solo línea (TIPO LINEA / LINEA BASICA): el número es el registro; solo queda CANCELADA
      if (!LineasRepo.TIPOS_CON_EQUIPO[tipo]) return { 'ESTATUS LINEA': 'CANCELADA' };
      const cambios = Object.assign({}, LineasRepo.VALORES_SIN_LINEA, { 'ESTATUS LINEA': 'CANCELADA' });
      cambios['TIPO'] = LineasRepo.tipoSinLinea(tipo);
      return cambios;
    }, 'Cancelación de línea confirmada' + (asunto ? ': ' + asunto : ''), 'CANCELACION_LINEA', usuario, porId);
    return r;
  }

  /** Lleva un paso de la bandeja al inventario (bitácora CAMBIOS y movimiento, como una edición). */
  function espejar_(hechos, cambiosDe, motivo, tipoMovimiento, usuario, solicitudes) {
    if (!hechos.length) return;
    const sol = solicitudes || {};
    const porIdBandeja = {};
    LineasDatos.leerTabla(TAB).forEach((r) => { porIdBandeja[txt(r['ID'])] = r; });
    LineasDatos.conCandado(() => {
      const porId = filasPorId_();
      hechos.forEach((h) => {
        const s = sol[h.id] || porIdBandeja[h.id];
        const f = s && porId[txt(s['REGISTRO_ID'])];
        if (!f) { h.aviso = 'El equipo ya no está en el inventario'; return; }
        const cambios = cambiosDe(f, s);
        if (!cambios) { h.aviso = 'El equipo ya tiene otra línea: el inventario no se tocó'; return; }
        const ahora = new Date();
        const antes = { estatus: txt(LineasUtil.col(f, tipoMovimiento === 'VENTA' ? 'ESTATUS EQUIPO' : 'ESTATUS LINEA')) };
        const guardado = LineasRepo.guardarCambiosRegistro(f, cambios, usuario, ahora);
        if (!guardado.campos.length) return;
        LineasRepo.registrarMovimiento(tipoMovimiento, { motivo: motivo }, usuario, ahora, {
          refs: [txt(f['ID'])], nuco: LineasUtil.col(f, 'NUCO'), numero: s['NUMERO'], antes: antes,
          despues: { estatus: tipoMovimiento === 'VENTA' ? 'VENDIDO' : 'CANCELADA' },
          detalle: { idsCambios: guardado.idsCambios, idsReasignacion: [], cambios: guardado.campos, resguardo: h.id },
        });
      });
    });
    LineasRepo.indice(true);
  }

  return {
    formulario, mandar, mandarCancelacion, bandeja, recibir, entregar, vendido, faseCancelacion, confirmarCancelacion, puedeAprobar, asesorPara,
    TAB, ENCABEZADOS, ESTADO, FASE, ESTATUS_EQUIPO_RESGUARDO, ESTATUS_LINEA_RESGUARDO, PROP_APROBADORES,
    _cambiosResguardo: cambiosResguardo_, _propuestaLinea: propuestaLinea_, _vigencia: vigencia_,
  };
})();
