/**
 * LineasResguardos.gs
 * Mandar equipos a resguardo y la bandeja de Pau (reunión con Líneas, 30-sep-2026).
 *
 * Cómo lo pidió el área (ver migracion/RESULTADOS_REUNION_LINEAS_30SEP.md en la carpeta de documentación):
 * - "Mandar a resguardo" funciona con uno o varios equipos, pero cada NUCO lleva sus datos: DEPARTAMENTO (DISPONIBLE),
 *   SEDE y OFICINA / DESARROLLO (obligatorios: dónde está físicamente), ESTATUS EQUIPO, ESTATUS LINEA y un comentario.
 * - Los datos de la persona quedan en blanco en automático (responsable, puesto, jefe, director, PINs, cuenta Google)
 *   y el patrón se borra. En la reunión se dijo N/A; el usuario lo cambió a blanco el 4-oct, y es la única acción que
 *   los deja en blanco (Editar no puede: LineasRegistros.editar). El equipo, IMEI, SIM, accesorios, razón social,
 *   compañía y costo del plan se conservan.
 * - La línea queda DISPONIBLE si su adendum sigue vigente o va EN PROCESO DE CANCELACION si ya venció: el sistema lo
 *   propone con FIN PLAN y quien manda lo confirma.
 * - El estatus cambia al mandar ("ya deben venir con el estatus", Gio). Al mismo tiempo se crea el renglón de la
 *   bandeja de Pau en APP_RESGUARDOS, que sigue su propio camino, igual que la hoja de Bren:
 *     recepción:    PENDIENTE DE RECEPCION → EN RESGUARDO → ENTREGADO A LINEAS | VENDIDO
 *     cancelación:  POR FIRMAR → CARTA FIRMADA → CARTA ENVIADA → CANCELADA (solo si la línea va a cancelación)
 * - Al confirmar la cancelación, la línea queda CANCELADA y el NUCO pasa de EQUIPO + SIM a EQUIPO; el número queda en la
 *   bitácora (lo que hoy hacen a mano).
 * - PARA VENTA y PARA DESECHO siguen esta misma lógica (usuario, 30-sep; POSIBLE VENTA-DAÑO se quitó el 4-oct): desde la ficha,
 *   elegir cualquiera de ellos en Editar abre este formulario, y la edición directa no los acepta. Si el equipo ya
 *   estaba guardado (p. ej. RESGUARDO → PARA VENTA) no se pide otra recepción: se actualiza su renglón abierto o, si
 *   no tiene y su línea va a cancelación, se crea ya EN RESGUARDO.
 * - Aprueba quien EDITA Resguardos y cancelaciones (Pau por correo, y ADMIN): lo calcula TelefoniaService
 *   (usuario.puedeAprobar). El área de Líneas la ve (el avance) y manda desde Líneas telefónicas (usuario, 12-oct).
 * - Usuario, 13-oct: la ubicación sale siempre DISPONIBLE · QUERETARO · JARDINES DE LA HACIENDA (se puede cambiar), con
 *   PARA VENTA CON DETALLE como estatus nuevo. Un equipo que ya tiene su renglón abierto en la bandeja no se vuelve a
 *   mandar con el mismo estatus (solo a otro de los de resguardo); uno guardado sin renglón abierto (viene así del
 *   AppSheet, o Pau ya lo entregó a Líneas) entra a la bandeja por recibir: Líneas decide cuáles manda. Cada línea que va
 *   a cancelación lleva su motivo (MOTIVO_CANCELACION): LINEA VENCIDA o CANCELACION ANTICIPADA; en «Mandar a
 *   cancelación» se elige y aquí sale del adendum (vencido o no).
 * - Usuario, 13-oct: la bandeja espeja el inventario (plan §5.5) mientras su renglón sigue abierto: modelo, IMEI, tipo,
 *   accesorios, número, compañía, razón social y fin del adendum salen del registro de hoy (`espejo_`, al leer; la hoja
 *   guarda lo de cuando se mandó). Lo que se llena al mandar (estatus, departamento, sede, oficina, comentario) es del
 *   trámite y no sigue al inventario. Lo cerrado (entregado, vendido, cancelado) se queda como quedó.
 */
const LineasResguardos = (function () {
  const TAB = 'APP_RESGUARDOS';
  const ENCABEZADOS = ['ID', 'FECHA', 'REGISTRO_ID', 'NUCO', 'NUMERO', 'TIPO', 'MODELO', 'IMEI', 'COMPANIA', 'RAZON_SOCIAL', 'FIN_PLAN',
    'ESTATUS_EQUIPO', 'ESTATUS_LINEA', 'DEPARTAMENTO', 'SEDE', 'OFICINA', 'COMENTARIO', 'MOTIVO', 'SOLICITO_CORREO', 'SOLICITO_NOMBRE',
    'ESTADO', 'RECIBIDO_EN', 'RECIBIO', 'ENTREGADO_EN', 'ENTREGADO_A', 'ENTREGA_ASUNTO',
    'CANCELACION', 'ASESOR', 'CARTA_FIRMADA_EN', 'CARTA_ENVIADA_EN', 'CANCELACION_ASUNTO', 'CANCELADA_EN', 'CANCELO', 'ACTUALIZADO_EN',
    'MOTIVO_CANCELACION', 'ACCESORIOS'];

  const ESTADO = { PENDIENTE: 'PENDIENTE DE RECEPCION', RESGUARDO: 'EN RESGUARDO', ENTREGADO: 'ENTREGADO A LINEAS', VENDIDO: 'VENDIDO' };
  const FASE = { POR_FIRMAR: 'POR FIRMAR', FIRMADA: 'CARTA FIRMADA', ENVIADA: 'CARTA ENVIADA', CANCELADA: 'CANCELADA' };

  /** Estatus del equipo que tienen sentido al mandarlo al almacén (los demás son bajas). PARA VENTA CON DETALLE, 13-oct. */
  const ESTATUS_EQUIPO_RESGUARDO = ['RESGUARDO', 'PARA VENTA', 'PARA VENTA CON DETALLE', 'PARA DESECHO'];
  const LINEA_DISPONIBLE = 'DISPONIBLE';
  const LINEA_CANCELACION = 'EN PROCESO DE CANCELACION';
  const ESTATUS_LINEA_RESGUARDO = [LINEA_DISPONIBLE, LINEA_CANCELACION];
  /**
   * La línea con el adendum vencido que se manda sola a cancelación (usuario, 16-oct; pendiente 2.50): quien captura elige
   * el panel (EN PROCESO DE CANCELACION, con su renglón de cancelación) o directo, sin pasar por el panel (este estatus).
   */
  const LINEA_SIN_PANEL = 'CANCELADA';
  const CANCELACION_DIRECTA = 'DIRECTO';
  /** Por qué se cancela la línea (usuario, 13-oct). */
  const MOTIVO_VENCIDA = 'LINEA VENCIDA';
  const MOTIVOS_CANCELACION = [MOTIVO_VENCIDA, 'CANCELACION ANTICIPADA'];
  /** Dónde queda lo que se manda a resguardo, sin importar dónde estaba (usuario, 13-oct); se puede cambiar. */
  const UBICACION_RESGUARDO = { 'DEPARTAMENTO': 'DISPONIBLE', 'SEDE': 'QUERETARO', 'OFICINA / DESARROLLO': 'JARDINES DE LA HACIENDA' };

  const NO_APLICA = 'NO APLICA';
  /**
   * Datos de la persona que quedan en blanco (reunión 30-sep: N/A; en blanco desde el 4-oct, usuario). Los PIN y la
   * cuenta solo si tenían algo ("NO APLICA" por el TIPO se respeta).
   */
  const CAMPOS_PERSONA = ['RESPONSABLE', 'PUESTO', 'JEFE DIRECTO', 'DIRECTOR'];
  const CAMPOS_PERSONA_SI_HAY = ['PIN WHATSAPP', 'PIN EQUIPO', 'CUENTA GOOGLE'];
  const CAMPOS_BORRAR = ['PATRON'];
  const COLS_UBICACION = ['DEPARTAMENTO', 'SEDE', 'OFICINA / DESARROLLO'];

  /** Asesor del proveedor según compañía y razón social (hoja de Bren, "PROCESO Y REFERENCIAS"). */
  const ASESORES = [
    { compania: /AT&T|ATT/, razon: /./, asesor: 'KARLA' },
    { compania: /TELCEL/, razon: /GPH|CONDOMINALES/, asesor: 'ALFREDO' },
    { compania: /TELCEL/, razon: /ROMITA|FRO/, asesor: 'WILBERTO' },
  ];

  const MAXIMO = 150;

  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  /** Marca de tiempo del medidor del DEV (TelefoniaService.conPasosEnDev_); afuera no hace nada. */
  const marca_ = (que, desde) => { if (typeof LineasDatos.tiempo === 'function') LineasDatos.tiempo(que, desde); };
  const may = (v) => txt(v).toUpperCase();
  const dia = (d) => Utilities.formatDate(d, LineasDatos.ZONA_APP, 'yyyy-MM-dd');

  // ---------------- Permisos ----------------

  /** Quien edita Resguardos y cancelaciones (ver el encabezado). */
  function puedeAprobar(usuario) {
    return !!(usuario && usuario.puedeAprobar);
  }

  function exigirAprobador_(usuario) {
    if (!puedeAprobar(usuario)) throw new Error('Solo puedes consultar Resguardos y cancelaciones, no modificarlo.');
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

  /**
   * Motivo de la cancelación donde no se elige (Mandar a resguardo, Desvincular o Cambiar línea): lo dice el adendum.
   * Vencido → LINEA VENCIDA; vigente → CANCELACION ANTICIPADA; sin fecha o SIM básico (sin adendum) no se sabe: en blanco.
   */
  function motivoCancelacionDe_(f) {
    if (/BASICO|BASICA/.test(may(LineasUtil.col(f, 'TIPO')))) return '';
    const vig = vigencia_(LineasUtil.col(f, 'FIN PLAN'), dia(new Date())).vigencia;
    return vig === 'vencido' ? MOTIVO_VENCIDA : (vig === 'vigente' ? MOTIVOS_CANCELACION[1] : '');
  }

  /**
   * La línea que se manda sola a cancelación por su adendum (usuario, 16-oct; pendiente 2.50): vencido y no SIM básico,
   * la misma cuenta que propuestaLinea_. Lo usan Mandar a resguardo y el equipo que sale del inventario (Corregir).
   */
  function lineaVencida(f) {
    return propuestaLinea_(LineasUtil.col(f, 'TIPO'), vigencia_(LineasUtil.col(f, 'FIN PLAN'), dia(new Date()))) === LINEA_CANCELACION;
  }

  /**
   * La línea con el adendum vencido que quedó CANCELADA sin pasar por el panel (usuario, 16-oct; pendiente 2.50): en el
   * historial queda como cancelación, con su motivo (del adendum) y sin renglón en la bandeja. `f`: el registro de antes
   * (el equipo con su línea); `idLinea`: el ID de la línea, que desde ahora se ve sola.
   */
  function registrarCancelacionDirecta(f, idLinea, motivo, ticket, usuario, ahora) {
    LineasRepo.registrarMovimiento('CANCELACION_LINEA', { motivo: motivo, ticket: ticket }, usuario, ahora, {
      refs: [idLinea, txt(f['ID'])].filter(Boolean), nuco: LineasUtil.col(f, 'NUCO'), numero: LineasUtil.col(f, 'NUMERO TELEFONO'),
      antes: { estatusLinea: txt(LineasUtil.col(f, 'ESTATUS LINEA')) }, despues: { estatusLinea: LINEA_SIN_PANEL },
      detalle: { idsCambios: [], idsReasignacion: [], cambios: cambioMotivo_(motivoCancelacionDe_(f)), sinPanel: true },
    });
  }

  /** El motivo, como un renglón más de CAMBIOS en el historial (MOVIMIENTOS). */
  const cambioMotivo_ = (motivo) => (motivo ? [{ campo: 'MOTIVO DE CANCELACION', antes: '', despues: motivo }] : []);

  /** La bandeja con todas sus columnas (MOTIVO_CANCELACION llegó el 13-oct a una hoja que ya existía). */
  function asegurarBandeja_() {
    if (!LineasDatos.existeTabla(TAB)) { LineasDatos.asegurarPestana(TAB, ENCABEZADOS); return; }
    // La columna se revisa una vez cada 6 h, no en cada guardado (rapidez, 13-oct)
    const cache = typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null;
    if (cache && cache.get('ln_resguardos_esquema_v2') === '1') return;
    if (typeof LineasDatos.asegurarColumnas === 'function') LineasDatos.asegurarColumnas(TAB, ['MOTIVO_CANCELACION', 'ACCESORIOS']);
    if (cache) cache.put('ln_resguardos_esquema_v2', '1', 21600);
  }

  /** Renglón abierto de la bandeja (PENDIENTE DE RECEPCION o EN RESGUARDO) por ID de registro. */
  function abiertosPorRegistro_(filas) {
    const abiertos = {};
    filas.forEach((r) => {
      if ([ESTADO.PENDIENTE, ESTADO.RESGUARDO].indexOf(txt(r['ESTADO'])) >= 0) abiertos[txt(r['REGISTRO_ID'])] = r;
    });
    return abiertos;
  }
  const abiertoDe_ = (abiertos, f) => LineasDatos.idsDeFila(f).map((k) => abiertos[k]).filter(Boolean)[0] || null;

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

  /** Campos de ubicación con las mismas listas (y reglas por coordinación) que "Editar equipo". */
  function camposUbicacion_(usuario) {
    const base = LineasRegistros._elementos({}, LineasRepo.catalogos(), usuario, { nuevo: false });
    return COLS_UBICACION.map((c) => Object.assign({}, base.filter((e) => e.columna === c)[0], {
      editable: 'SIEMPRE', requerido: 'SIEMPRE', valor: UBICACION_RESGUARDO[c],
    }));
  }

  // ---------------- Mandar a resguardo ----------------

  /**
   * Datos para el formulario: por cada equipo lo que tiene hoy, la propuesta de la línea y los estatus que se pueden
   * elegir (sin el que ya tiene si ya está en la bandeja, 13-oct). Los que no son equipo se regresan en `omitidos`.
   */
  function formulario(ids, usuario) {
    const lista = limpiarIds_(ids);
    const porId = filasPorId_();
    const hoy = dia(new Date());
    const abiertos = abiertosPorRegistro_(LineasDatos.existeTabla(TAB) ? LineasDatos.leerTabla(TAB) : []);
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
      const inicio = vigencia_(LineasUtil.col(f, 'INICIO PLAN'), hoy).fin;
      const estatusActual = may(LineasUtil.col(f, 'ESTATUS EQUIPO'));
      const enBandeja = ESTATUS_EQUIPO_RESGUARDO.indexOf(estatusActual) >= 0 && !!abiertoDe_(abiertos, f);
      equipos.push({
        id: txt(f['ID']), nuco: nuco, tipo: tipo, modelo: txt(LineasUtil.col(f, 'EQUIPO')), imei: txt(LineasUtil.col(f, 'IMEI')),
        color: txt(LineasUtil.col(f, 'COLOR')), sim: linea ? txt(LineasUtil.col(f, 'NUMERO SIM')) : '', razonSocial: linea ? txt(LineasUtil.col(f, 'RAZON SOCIAL')) : '',
        inicioPlan: linea ? inicio : '', costoPlan: linea ? txt(LineasUtil.col(f, 'COSTO PLAN')) : '',
        responsable: txt(LineasUtil.col(f, 'RESPONSABLE')), estatusEquipo: txt(LineasUtil.col(f, 'ESTATUS EQUIPO')),
        departamento: txt(LineasUtil.col(f, 'DEPARTAMENTO')), sede: txt(LineasUtil.col(f, 'SEDE')), oficina: txt(LineasUtil.col(f, 'OFICINA / DESARROLLO')),
        tieneLinea: !!linea, numero: linea ? txt(LineasUtil.col(f, 'NUMERO TELEFONO')) : '', compania: txt(LineasUtil.col(f, 'COMPAÑIA')),
        estatusLinea: txt(LineasUtil.col(f, 'ESTATUS LINEA')), finPlan: vig.fin, vigencia: vig.vigencia,
        propuestaLinea: linea ? propuestaLinea_(tipo, vig) : '',
        enBandeja: enBandeja, opcionesEstatus: ESTATUS_EQUIPO_RESGUARDO.filter((x) => !enBandeja || x !== estatusActual),
      });
    });
    return {
      maximo: MAXIMO, equipos: equipos, omitidos: omitidos, campos: camposUbicacion_(usuario),
      estatusEquipo: ESTATUS_EQUIPO_RESGUARDO, estatusLinea: ESTATUS_LINEA_RESGUARDO,
      camposEnBlanco: CAMPOS_PERSONA.concat(CAMPOS_PERSONA_SI_HAY, CAMPOS_BORRAR),
    };
  }

  /** Cambios de LINEAS TELEFONICAS para un equipo que se manda a resguardo. */
  function cambiosResguardo_(f, pedido, tieneLinea) {
    const cambios = {};
    COLS_UBICACION.forEach((c) => { cambios[c] = pedido[c]; });
    cambios['ESTATUS EQUIPO'] = pedido['ESTATUS EQUIPO'];
    if (tieneLinea) cambios['ESTATUS LINEA'] = pedido['ESTATUS LINEA'];
    CAMPOS_PERSONA.forEach((c) => { cambios[c] = ''; });
    CAMPOS_PERSONA_SI_HAY.forEach((c) => {
      const actual = may(LineasUtil.col(f, c));
      if (actual && actual !== NO_APLICA) cambios[c] = '';
    });
    CAMPOS_BORRAR.forEach((c) => { if (txt(LineasUtil.col(f, c))) cambios[c] = ''; });
    // Los responsables adicionales siguen al responsable
    ['SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO'].reduce((a, n) => a.concat(['NO EMPLEADO ' + n + ' RESPONSABLE', 'NOMBRE ' + n + ' RESPONSABLE']), [])
      .forEach((c) => { cambios[c] = ''; });
    if (txt(pedido.COMENTARIO).length > 3) cambios['COMENTARIOS'] = txt(pedido.COMENTARIO).toUpperCase();
    return cambios;
  }

  /**
   * datos = { motivo, porEquipo: { id: { DEPARTAMENTO, SEDE, 'OFICINA / DESARROLLO', 'ESTATUS EQUIPO', 'ESTATUS LINEA', COMENTARIO } },
   *   inspecciones: { id: idInspeccion } }. Cada equipo que viene de una persona (USO) trae su inspección, capturada
   * dentro de la acción (pendiente 2.6; decisión del usuario, 3-oct); sin ella no se manda ninguno.
   * Regresa { hechos: [{ id, nuco, cancelacion }], omitidos: [{ id, nuco, motivo }] }.
   */
  function mandar(ids, datos, usuario) {
    const lista = limpiarIds_(ids);
    const d = datos || {};
    // Un solo COMENTARIO (plan §5.2): el general se copia a cada equipo y se puede cambiar en el que haga falta
    const motivo = txt(d.comentario || d.motivo);
    if (motivo.length <= 3) throw new Error('Escribe el comentario del resguardo (queda en el historial de cada equipo).');
    const ticket = txt(d.ticket);
    const porEquipo = d.porEquipo || {};
    const t0 = Date.now();
    const campos = camposUbicacion_(usuario);
    marca_('mandar · campos de ubicación', t0);

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
      pedidos[id] = Object.assign({}, r.valores, { 'ESTATUS EQUIPO': estatusEquipo, 'ESTATUS LINEA': estatusLinea, COMENTARIO: txt(p.COMENTARIO),
        directa: may(p.cancelacionLinea) === CANCELACION_DIRECTA });
    });
    if (errores.length) throw new Error(errores.slice(0, 6).join(' · '));

    const hechos = [];
    const omitidos = [];
    LineasDatos.conCandado(() => {
      asegurarBandeja_();
      const porId = filasPorId_();
      const hoy = dia(new Date());
      const nuevos = [];
      // Renglón abierto de la bandeja por equipo: si ya lo tiene, no se pide otra recepción
      const bandejaActual = LineasDatos.leerTabla(TAB);
      const abiertos = abiertosPorRegistro_(bandejaActual);
      const cancelando = cancelacionesEnCurso_(bandejaActual);
      // Ya en la bandeja con ese mismo estatus: no hay nada que mandar (usuario, 13-oct)
      lista.forEach((id) => {
        const f = porId[id];
        const actual = f ? may(LineasUtil.col(f, 'ESTATUS EQUIPO')) : '';
        if (!f || actual !== pedidos[id]['ESTATUS EQUIPO'] || !abiertoDe_(abiertos, f)) return;
        throw new Error('NUCO ' + (LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO')) || '') + ': ya está en Resguardos y cancelaciones como ' + actual + '; elige otro estatus.');
      });
      // Antes de escribir: la inspección de cada equipo que viene de una persona
      const t1 = Date.now();
      lista.forEach((id) => {
        const f = porId[id];
        if (!f || may(LineasUtil.col(f, 'ESTATUS EQUIPO')) !== 'USO') return;
        LineasCaptura.exigirInspeccion((d.inspecciones || {})[id], LineasDatos.idsDeFila(f), 'NUCO ' + (LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO')) || ''));
      });
      marca_('mandar · revisar inspecciones', t1);
      lista.forEach((id) => {
        const f = porId[id];
        const nuco = f ? LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO')) || '' : '';
        if (!f) { omitidos.push({ id: id, nuco: nuco, motivo: 'Ya no existe en la hoja' }); return; }
        const tipo = may(LineasUtil.col(f, 'TIPO'));
        if (!LineasRepo.TIPOS_CON_EQUIPO[tipo]) { omitidos.push({ id: id, nuco: nuco, motivo: 'No es un equipo' }); return; }
        const reg = LineasRepo.convertirRegistro(f);
        const tieneLinea = !!(reg && reg.linea);
        const pedido = pedidos[id];
        // Adendum vencido: la línea va a cancelación (usuario, 4-oct); quien captura eligió si pasa por el panel o queda
        // LINEA_SIN_PANEL directo (usuario, 16-oct; pendiente 2.50). Vigente o sin fecha: lo que se eligió
        const vencida = tieneLinea && propuestaLinea_(tipo, vigencia_(LineasUtil.col(f, 'FIN PLAN'), hoy)) === LINEA_CANCELACION;
        if (vencida) pedido['ESTATUS LINEA'] = pedido.directa ? LINEA_SIN_PANEL : LINEA_CANCELACION;
        if (tieneLinea && !pedido['ESTATUS LINEA']) { omitidos.push({ id: id, nuco: nuco, motivo: 'Falta el estatus de la línea' }); return; }
        const antes = { estatus: txt(LineasUtil.col(f, 'ESTATUS EQUIPO')), estatusLinea: txt(LineasUtil.col(f, 'ESTATUS LINEA')), responsable: { nombre: txt(LineasUtil.col(f, 'RESPONSABLE')) } };
        // Si su línea ya va en la bandeja de cancelaciones (Mandar a cancelación), no se abre otro camino
        const cancela = tieneLinea && pedido['ESTATUS LINEA'] === LINEA_CANCELACION &&
          !enCancelacion_(cancelando, f, LineasUtil.col(f, 'NUMERO TELEFONO'));
        const motivoCancelacion = cancela || (vencida && pedido.directa) ? motivoCancelacionDe_(f) : '';
        const ahora = new Date();
        const t2 = Date.now();
        const guardado = LineasRepo.guardarCambiosRegistro(f, cambiosResguardo_(f, pedido, tieneLinea), usuario, ahora);
        marca_('mandar · guardar el registro', t2);
        const t3 = Date.now();
        LineasRepo.registrarMovimiento('RESGUARDO', { motivo: pedido.COMENTARIO || motivo, ticket: ticket }, usuario, ahora, {
          refs: [id].concat(guardado.refs || []), nuco: LineasUtil.col(f, 'NUCO'), numero: LineasUtil.col(f, 'NUMERO TELEFONO'),
          antes: antes, despues: { estatus: pedido['ESTATUS EQUIPO'], estatusLinea: tieneLinea ? pedido['ESTATUS LINEA'] : '' },
          detalle: { idsCambios: guardado.idsCambios, idsReasignacion: [], cambios: guardado.campos.concat(cambioMotivo_(motivoCancelacion)) },
        });
        if (vencida && pedido.directa) registrarCancelacionDirecta(f, txt(LineasUtil.col(f, 'ID LINEA')), pedido.COMENTARIO || motivo, ticket, usuario, ahora);
        marca_('mandar · movimiento', t3);
        const compania = txt(LineasUtil.col(f, 'COMPAÑIA'));
        const razon = txt(LineasUtil.col(f, 'RAZON SOCIAL'));
        // Ya en la bandeja (p. ej. RESGUARDO → PARA VENTA): el teléfono ya está con quien recibe
        const abierto = ESTATUS_EQUIPO_RESGUARDO.indexOf(may(antes.estatus)) >= 0 ? abiertoDe_(abiertos, f) : null;
        if (abierto) {
          // Se actualiza su renglón; si la línea ahora va a cancelación, arranca ese camino
          const nuevaCancelacion = cancela && !txt(abierto['CANCELACION']);
          LineasDatos.actualizarFila(TAB, abierto._fila, Object.assign({
            'ESTATUS_EQUIPO': pedido['ESTATUS EQUIPO'], 'ESTATUS_LINEA': tieneLinea ? pedido['ESTATUS LINEA'] : '',
            'DEPARTAMENTO': pedido.DEPARTAMENTO, 'SEDE': pedido.SEDE, 'OFICINA': pedido['OFICINA / DESARROLLO'], 'ACTUALIZADO_EN': ahora,
            'ACCESORIOS': txt(LineasUtil.col(f, 'ACCESORIOS')),
          }, nuevaCancelacion ? { 'CANCELACION': FASE.POR_FIRMAR, 'ASESOR': asesorPara(compania, razon), 'MOTIVO_CANCELACION': motivoCancelacion } : {}));
          hechos.push({ id: id, nuco: nuco, cancelacion: nuevaCancelacion, porRecibir: false });
          return;
        }
        // Sin renglón abierto (viene de una persona, o está guardado desde el AppSheet o ya se entregó a Líneas): Pau
        // lo recibe (usuario, 13-oct; antes uno ya guardado no entraba a la bandeja)
        nuevos.push({
          'FECHA': ahora, 'REGISTRO_ID': txt(f['ID']), 'NUCO': nuco, 'NUMERO': tieneLinea ? txt(LineasUtil.col(f, 'NUMERO TELEFONO')) : '',
          'TIPO': tipo, 'MODELO': txt(LineasUtil.col(f, 'EQUIPO')), 'IMEI': txt(LineasUtil.col(f, 'IMEI')), 'COMPANIA': compania,
          'ACCESORIOS': txt(LineasUtil.col(f, 'ACCESORIOS')), 'RAZON_SOCIAL': razon, 'FIN_PLAN': vigencia_(LineasUtil.col(f, 'FIN PLAN'), hoy).fin,
          'ESTATUS_EQUIPO': pedido['ESTATUS EQUIPO'], 'ESTATUS_LINEA': tieneLinea ? pedido['ESTATUS LINEA'] : '',
          'DEPARTAMENTO': pedido.DEPARTAMENTO, 'SEDE': pedido.SEDE, 'OFICINA': pedido['OFICINA / DESARROLLO'],
          'COMENTARIO': pedido.COMENTARIO, 'MOTIVO': motivo, 'SOLICITO_CORREO': usuario.correo, 'SOLICITO_NOMBRE': usuario.nombre,
          'ESTADO': ESTADO.PENDIENTE, 'RECIBIO': '',
          'CANCELACION': cancela ? FASE.POR_FIRMAR : '', 'ASESOR': cancela ? asesorPara(compania, razon) : '', 'MOTIVO_CANCELACION': cancela ? motivoCancelacion : '',
          'ACTUALIZADO_EN': ahora,
        });
        hechos.push({ id: id, nuco: nuco, cancelacion: cancela, porRecibir: true });
      });
      LineasDatos.agregarFilas(TAB, nuevos);
    });
    const t4 = Date.now();
    const indice = hechos.length ? LineasRepo.refrescarIndice(hechos.map((h) => h.id)) : null; // solo los tocados
    marca_('mandar · refrescar el índice', t4);
    const t5 = Date.now();
    const porRecibir = hechos.filter((h) => h.porRecibir);
    const conCancelacion = hechos.filter((h) => h.cancelacion);
    if (porRecibir.length) {
      avisar_('RESGUARDO', 'Equipos por recibir · ' + porRecibir.length,
        usuario.nombre + ' mandó ' + porRecibir.length + ' equipo(s) a resguardo' + (conCancelacion.length ? ', ' + conCancelacion.length + ' con la línea para cancelación' : '') +
        ': NUCO ' + porRecibir.slice(0, 10).map((h) => h.nuco).join(', ') + (porRecibir.length > 10 ? '…' : '') + '.');
    } else if (conCancelacion.length) {
      avisar_('CANCELACION', 'Líneas para cancelar · ' + conCancelacion.length,
        usuario.nombre + ' mandó a cancelación la línea de ' + conCancelacion.length + ' equipo(s) que ya estaban en resguardo: NUCO ' +
        conCancelacion.slice(0, 10).map((h) => h.nuco).join(', ') + '.');
    }
    marca_('mandar · aviso en la campana', t5);
    return { hechos: hechos, omitidos: omitidos, indice: indice };
  }

  const claveCancelacion_ = (registroId, numero) => txt(registroId) + '|' + LineasUtil.digitos(numero);
  /**
   * ¿La línea del registro ya va en la bandeja de cancelaciones? Con cualquiera de sus IDs: la bandeja guarda el que
   * tenía el registro al mandarlo, y desde la reestructura (hojas nuevas) el registro tiene otro (EQU-/LIN-).
   */
  const enCancelacion_ = (cancelando, f, numero) => LineasDatos.idsDeFila(f).some((k) => cancelando[claveCancelacion_(k, numero)]);

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
   * datos = { motivoCancelacion (LINEA VENCIDA o CANCELACION ANTICIPADA, usuario 13-oct), comentario, ticket }. Regresa
   * { hechos: [{ id, nuco, numero }], omitidos: [{ id, nuco, motivo }] }. opciones.motivoDelAdendum (Desvincular y
   * Cambiar línea, que no lo eligen; no llega desde la pantalla): el motivo de cada línea sale de su adendum.
   */
  function mandarCancelacion(ids, datos, usuario, opciones) {
    const lista = limpiarIds_(ids);
    const d = datos || {};
    const delAdendum = !!(opciones && opciones.motivoDelAdendum);
    const motivoElegido = may(d.motivoCancelacion);
    if (!delAdendum && MOTIVOS_CANCELACION.indexOf(motivoElegido) < 0) throw new Error('Elige el motivo de la cancelación: ' + MOTIVOS_CANCELACION.join(' o ') + '.');
    const motivo = txt(d.comentario || d.motivo);
    if (motivo.length <= 3) throw new Error('Escribe el comentario de la cancelación (queda en el historial de cada línea).');
    const ticket = txt(d.ticket);
    const hechos = [];
    const omitidos = [];
    LineasDatos.conCandado(() => {
      asegurarBandeja_();
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
        if (enCancelacion_(cancelando, f, numero)) { omitidos.push({ id: id, nuco: nuco, numero: numero, motivo: 'Ya está en la bandeja de cancelaciones' }); return; }
        const ahora = new Date();
        const motivoCancelacion = delAdendum ? motivoCancelacionDe_(f) : motivoElegido;
        const antes = { estatusLinea: txt(LineasUtil.col(f, 'ESTATUS LINEA')) };
        const guardado = LineasRepo.guardarCambiosRegistro(f, { 'ESTATUS LINEA': LINEA_CANCELACION }, usuario, ahora);
        LineasRepo.registrarMovimiento('CANCELACION_LINEA', { motivo: motivo, ticket: ticket }, usuario, ahora, {
          refs: [id].concat(guardado.refs || []), nuco: LineasUtil.col(f, 'NUCO'), numero: numero, antes: antes, despues: { estatusLinea: LINEA_CANCELACION },
          detalle: { idsCambios: guardado.idsCambios, idsReasignacion: [], cambios: guardado.campos.concat(cambioMotivo_(motivoCancelacion)) },
        });
        const compania = txt(LineasUtil.col(f, 'COMPAÑIA'));
        const razon = txt(LineasUtil.col(f, 'RAZON SOCIAL'));
        nuevos.push({
          'FECHA': ahora, 'REGISTRO_ID': txt(f['ID']), 'NUCO': nuco, 'NUMERO': numero, 'TIPO': may(LineasUtil.col(f, 'TIPO')),
          'MODELO': txt(LineasUtil.col(f, 'EQUIPO')), 'IMEI': txt(LineasUtil.col(f, 'IMEI')), 'COMPANIA': compania, 'RAZON_SOCIAL': razon,
          'ACCESORIOS': txt(LineasUtil.col(f, 'ACCESORIOS')),
          'FIN_PLAN': vigencia_(LineasUtil.col(f, 'FIN PLAN'), hoy).fin, 'ESTATUS_EQUIPO': txt(LineasUtil.col(f, 'ESTATUS EQUIPO')),
          'ESTATUS_LINEA': LINEA_CANCELACION, 'DEPARTAMENTO': txt(LineasUtil.col(f, 'DEPARTAMENTO')), 'SEDE': txt(LineasUtil.col(f, 'SEDE')),
          'OFICINA': txt(LineasUtil.col(f, 'OFICINA / DESARROLLO')), 'COMENTARIO': '', 'MOTIVO': motivo,
          'SOLICITO_CORREO': usuario.correo, 'SOLICITO_NOMBRE': usuario.nombre, 'ESTADO': '',
          'CANCELACION': FASE.POR_FIRMAR, 'ASESOR': asesorPara(compania, razon), 'ACTUALIZADO_EN': ahora, 'MOTIVO_CANCELACION': motivoCancelacion,
        });
        hechos.push({ id: id, nuco: nuco, numero: numero });
      });
      LineasDatos.agregarFilas(TAB, nuevos);
    });
    let indice = null;
    if (hechos.length) {
      indice = LineasRepo.refrescarIndice(hechos.map((h) => h.id)); // solo los tocados
      avisar_('CANCELACION', 'Líneas para cancelar · ' + hechos.length,
        usuario.nombre + ' mandó a cancelación ' + hechos.length + ' línea(s): ' +
        hechos.slice(0, 10).map((h) => h.numero).join(', ') + (hechos.length > 10 ? '…' : '') + '.');
    }
    return { hechos: hechos, omitidos: omitidos, indice: indice };
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

  /** ¿El renglón sigue abierto? Por recibir o en resguardo, o con su cancelación en curso. */
  const abierto_ = (r) => [ESTADO.PENDIENTE, ESTADO.RESGUARDO].indexOf(r['ESTADO']) >= 0 ||
    (!!r['CANCELACION'] && r['CANCELACION'] !== FASE.CANCELADA);

  /**
   * El renglón abierto con lo de hoy del inventario (ver el encabezado). El equipo (modelo, IMEI, tipo, accesorios)
   * siempre; la línea (número, compañía, razón social, fin del adendum) si el renglón no va a cancelación o si el
   * registro sigue con el mismo número: una cancelación es de ese número, aunque el equipo ya tenga otra línea.
   */
  function espejo_(r, f, hoy) {
    if (!f || !abierto_(r)) return r;
    const tipo = may(LineasUtil.col(f, 'TIPO'));
    const numero = txt(LineasUtil.col(f, 'NUMERO TELEFONO'));
    const tieneLinea = !!numero && !/^EQUIPO$/.test(tipo);
    const o = Object.assign({}, r, {
      'NUCO': LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO')) || r['NUCO'], 'TIPO': tipo || r['TIPO'],
      'MODELO': txt(LineasUtil.col(f, 'EQUIPO')), 'IMEI': txt(LineasUtil.col(f, 'IMEI')), 'ACCESORIOS': txt(LineasUtil.col(f, 'ACCESORIOS')),
    });
    const mismaLinea = LineasUtil.digitos(numero) === LineasUtil.digitos(r['NUMERO']);
    if (r['CANCELACION'] && !mismaLinea) return o;
    if (!r['CANCELACION']) o['NUMERO'] = tieneLinea ? numero : '';
    if (tieneLinea) {
      o['COMPANIA'] = txt(LineasUtil.col(f, 'COMPAÑIA'));
      o['RAZON_SOCIAL'] = txt(LineasUtil.col(f, 'RAZON SOCIAL'));
      o['FIN_PLAN'] = vigencia_(LineasUtil.col(f, 'FIN PLAN'), hoy).fin;
    }
    return o;
  }

  /** Todos los renglones de la bandeja, del más reciente al más antiguo, y si la persona puede aprobar. */
  function bandeja(usuario) {
    let filas = LineasDatos.existeTabla(TAB) ? LineasDatos.leerTabla(TAB).map(fila_) : [];
    if (filas.some(abierto_)) {
      const porId = filasPorId_();
      const hoy = dia(new Date());
      filas = filas.map((r) => espejo_(r, porId[r['REGISTRO_ID']], hoy));
    }
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
      : { 'ESTADO': ESTADO.VENDIDO, 'ESTATUS_EQUIPO': 'VENDIDO', 'ENTREGA_ASUNTO': asunto }));
    espejar_(r.hechos, () => ({ 'ESTATUS EQUIPO': 'VENDIDO' }), 'Vendido (bandeja de resguardos)' + (asunto ? ': ' + asunto : ''), 'VENTA', usuario);
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
      // Registro de solo línea (TIPO LINEA / SIM BASICO): el número es el registro; solo queda CANCELADA
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
    const tocados = [];
    LineasDatos.conCandado(() => {
      const porId = filasPorId_();
      hechos.forEach((h) => {
        const s = sol[h.id] || porIdBandeja[h.id];
        const f = s && porId[txt(s['REGISTRO_ID'])];
        if (!f) { h.aviso = 'El equipo ya no está en el inventario'; return; }
        tocados.push(txt(f['ID']));
        const cambios = cambiosDe(f, s);
        if (!cambios) { h.aviso = 'El equipo ya tiene otra línea: el inventario no se tocó'; return; }
        const ahora = new Date();
        const antes = { estatus: txt(LineasUtil.col(f, tipoMovimiento === 'VENTA' ? 'ESTATUS EQUIPO' : 'ESTATUS LINEA')) };
        const guardado = LineasRepo.guardarCambiosRegistro(f, cambios, usuario, ahora);
        if (!guardado.campos.length) return;
        LineasRepo.registrarMovimiento(tipoMovimiento, { motivo: motivo }, usuario, ahora, {
          refs: [txt(f['ID'])].concat(guardado.refs || []), nuco: LineasUtil.col(f, 'NUCO'), numero: s['NUMERO'], antes: antes,
          despues: { estatus: tipoMovimiento === 'VENTA' ? 'VENDIDO' : 'CANCELADA' },
          detalle: { idsCambios: guardado.idsCambios, idsReasignacion: [], cambios: guardado.campos, resguardo: h.id },
        });
      });
    });
    if (tocados.length) LineasRepo.refrescarIndice(tocados); // solo los tocados
  }

  return {
    formulario, mandar, mandarCancelacion, lineaVencida, registrarCancelacionDirecta, bandeja, recibir, entregar, vendido, faseCancelacion, confirmarCancelacion, puedeAprobar, asesorPara,
    TAB, ENCABEZADOS, ESTADO, FASE, ESTATUS_EQUIPO_RESGUARDO, ESTATUS_LINEA_RESGUARDO, LINEA_SIN_PANEL, CANCELACION_DIRECTA, CAMPOS_PERSONA, CAMPOS_PERSONA_SI_HAY,
    MOTIVOS_CANCELACION, UBICACION_RESGUARDO, motivoCancelacionDe: motivoCancelacionDe_, cambioMotivo: cambioMotivo_, asegurarBandeja: asegurarBandeja_,
    _cambiosResguardo: cambiosResguardo_, _propuestaLinea: propuestaLinea_, _vigencia: vigencia_, _espejo: espejo_,
  };
})();
