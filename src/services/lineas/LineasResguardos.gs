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
 *     recepción:    PENDIENTE DE RECEPCION → EN RESGUARDO → ENTREGADO A LINEAS | VENDIDO | DONADO | DESECHADO
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
 *   PARA VENTA CON DETALLE como estatus nuevo. Uno guardado sin renglón abierto (viene así del
 *   AppSheet, o Pau ya lo entregó a Líneas) entra a la bandeja por recibir: Líneas decide cuáles manda. Cada línea que va
 *   a cancelación lleva su motivo (MOTIVO_CANCELACION): LINEA VENCIDA o CANCELACION ANTICIPADA; en «Mandar a
 *   cancelación» se elige y aquí sale del adendum (vencido o no).
 * - Usuario, 13-oct: la bandeja espeja el inventario (plan §5.5) mientras su renglón sigue abierto: modelo, IMEI, tipo,
 *   accesorios, número, compañía, razón social y fin del adendum salen del registro de hoy (`espejo_`, al leer; la hoja
 *   guarda lo de cuando se mandó). Lo que se llena al mandar (estatus, departamento, sede, oficina, comentario) es del
 *   trámite y no sigue al inventario. Lo cerrado (entregado, vendido, cancelado) se queda como quedó.
 * - Usuario, 20-oct (pendiente 3.12): resguardo y cancelación van separados. El renglón de Resguardos sigue al equipo
 *   (su línea DISPONIBLE o «Sin línea»; LINEA_AL_MANDAR guarda el número que tenía) y el de Cancelaciones sigue a la línea
 *   (ID_LINEA). Al mandar a resguardo un equipo cuya línea va a cancelación, la línea se separa primero y entra sola. Los
 *   renglones viejos que juntan las dos cosas se siguen leyendo (su cancelación se encuentra por el número). Un equipo ya
 *   en el panel no se vuelve a mandar: se corrige (Corregir resguardo) o, si Pau aún no lo recibe, se quita (Quitar del
 *   panel: regresa lo que nadie tocó después). Pau retira una cancelación (Retirar cancelación); Líneas no.
 */
const LineasResguardos = (function () {
  const TAB = 'APP_RESGUARDOS';
  const ENCABEZADOS = ['ID', 'FECHA', 'REGISTRO_ID', 'NUCO', 'NUMERO', 'TIPO', 'MODELO', 'IMEI', 'COMPANIA', 'RAZON_SOCIAL', 'FIN_PLAN',
    'ESTATUS_EQUIPO', 'ESTATUS_LINEA', 'DEPARTAMENTO', 'SEDE', 'OFICINA', 'COMENTARIO', 'MOTIVO', 'SOLICITO_CORREO', 'SOLICITO_NOMBRE',
    'ESTADO', 'RECIBIDO_EN', 'RECIBIO', 'ENTREGADO_EN', 'ENTREGADO_A', 'ENTREGA_ASUNTO',
    'CANCELACION', 'ASESOR', 'CARTA_FIRMADA_EN', 'CARTA_ENVIADA_EN', 'CANCELACION_ASUNTO', 'CANCELADA_EN', 'CANCELO', 'ACTUALIZADO_EN',
    'MOTIVO_CANCELACION', 'ACCESORIOS', 'ID_LINEA', 'LINEA_AL_MANDAR', 'MOVIMIENTO_ID', 'RETIRADO_EN', 'RETIRO', 'RETIRO_MOTIVO'];
  /** Las que llegaron después a una hoja que ya existía (13 y 20-oct). */
  const COLUMNAS_NUEVAS = ['MOTIVO_CANCELACION', 'ACCESORIOS', 'ID_LINEA', 'LINEA_AL_MANDAR', 'MOVIMIENTO_ID', 'RETIRADO_EN', 'RETIRO', 'RETIRO_MOTIVO'];

  // RETIRADA: Pau retiró la cancelación (pendiente 3.12). Lo que Líneas quita antes de que Pau lo reciba ya no queda: se
  // borra (Quitar del panel; usuario, 22-oct)
  const ESTADO = { PENDIENTE: 'PENDIENTE DE RECEPCION', RESGUARDO: 'EN RESGUARDO', ENTREGADO: 'ENTREGADO A LINEAS', VENDIDO: 'VENDIDO',
    DONADO: 'DONADO', DESECHADO: 'DESECHADO' };
  const FASE = { POR_FIRMAR: 'POR FIRMAR', FIRMADA: 'CARTA FIRMADA', ENVIADA: 'CARTA ENVIADA', CANCELADA: 'CANCELADA', RETIRADA: 'RETIRADA' };
  const ABIERTOS = [ESTADO.PENDIENTE, ESTADO.RESGUARDO];
  const EN_CURSO = [FASE.POR_FIRMAR, FASE.FIRMADA, FASE.ENVIADA];

  /** Estatus del equipo que tienen sentido al mandarlo al almacén (los demás son bajas). PARA VENTA CON DETALLE, 13-oct. */
  const ESTATUS_EQUIPO_RESGUARDO = ['RESGUARDO', 'PARA VENTA', 'PARA VENTA CON DETALLE', 'PARA DESECHO'];
  /**
   * El equipo que se mandó y Pau aún no recibe (usuario, 21-oct; pendiente 3.15): queda guardado así en EQUIPOS y el
   * estatus elegido espera en su renglón (ESTATUS_EQUIPO) hasta que Pau lo recibe. No se elige a mano: no está en
   * LineasRepo.CATALOGO.estatusEquipo ni en las listas.
   */
  const POR_RECIBIR = 'POR RECIBIR';
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

  /** La bandeja con todas sus columnas (COLUMNAS_NUEVAS llegaron después a una hoja que ya existía). */
  function asegurarBandeja_() {
    if (!LineasDatos.existeTabla(TAB)) { LineasDatos.asegurarPestana(TAB, ENCABEZADOS); return; }
    // Las columnas se revisan una vez cada 6 h, no en cada guardado (rapidez, 13-oct)
    const cache = typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null;
    if (cache && cache.get('ln_resguardos_esquema_v3') === '1') return;
    if (typeof LineasDatos.asegurarColumnas === 'function') LineasDatos.asegurarColumnas(TAB, COLUMNAS_NUEVAS);
    if (cache) cache.put('ln_resguardos_esquema_v3', '1', 21600);
  }

  /** Renglón abierto de la bandeja (PENDIENTE DE RECEPCION o EN RESGUARDO) por ID de registro. */
  function abiertosPorRegistro_(filas) {
    const abiertos = {};
    filas.forEach((r) => {
      if (ABIERTOS.indexOf(txt(r['ESTADO'])) >= 0) abiertos[txt(r['REGISTRO_ID'])] = r;
    });
    return abiertos;
  }
  const abiertoDe_ = (abiertos, f) => LineasDatos.idsDeFila(f).map((k) => abiertos[k]).filter(Boolean)[0] || null;

  /**
   * Equipos con su renglón abierto en el panel: { ID de registro: ESTADO }. Lo usa el índice de la pantalla para cambiar
   * «Mandar a resguardo» por «Corregir resguardo» y «Quitar del panel» (pendiente 3.12).
   */
  function abiertosPorEquipo() {
    if (!LineasDatos.existeTabla(TAB)) return {};
    const m = {};
    LineasDatos.leerTabla(TAB).forEach((r) => { if (ABIERTOS.indexOf(txt(r['ESTADO'])) >= 0) m[txt(r['REGISTRO_ID'])] = txt(r['ESTADO']); });
    return m;
  }

  /**
   * ¿El equipo `f` tiene su renglón abierto en el panel (por recibir o recibido)? Mientras tanto no lleva Responsiva ni
   * Inspección y Corregir no cambia su estatus (usuario, 21-oct; pendiente 3.15): lo sacan Quitar del panel, Corregir
   * resguardo o Pau (Entregar a líneas, Vendido).
   */
  function enPanel(f) {
    const m = abiertosPorEquipo();
    return LineasDatos.idsDeFila(f).some((k) => !!m[txt(k)]);
  }

  function filasPorId_() {
    return indices_().porId;
  }

  /**
   * Los registros del inventario por ID (con los anteriores), por ID de su línea y por número (el de la línea que no está
   * cancelada): una cancelación sigue a la línea esté donde esté (pendiente 3.12).
   */
  function indices_() {
    const porId = {};
    const porLinea = {};
    const porNumero = {};
    LineasDatos.leerTabla(LineasRepo.TAB.LINEAS).forEach((f) => {
      LineasDatos.idsDeFila(f).forEach((k) => { porId[k] = f; });
      const idLinea = txt(LineasUtil.col(f, 'ID LINEA'));
      if (idLinea) porLinea[idLinea] = f;
      const n = LineasUtil.digitos(LineasUtil.col(f, 'NUMERO TELEFONO'));
      if (n && (!porNumero[n] || may(LineasUtil.col(f, 'ESTATUS LINEA')) !== 'CANCELADA')) porNumero[n] = f;
    });
    return { porId: porId, porLinea: porLinea, porNumero: porNumero };
  }

  /** El registro donde está hoy la línea de un renglón de cancelación: por su ID o, en los viejos, por su número. */
  function registroDeLinea_(s, ix) {
    const idLinea = txt(s['ID_LINEA']);
    if (idLinea && (ix.porLinea[idLinea] || ix.porId[idLinea])) return ix.porLinea[idLinea] || ix.porId[idLinea];
    const n = LineasUtil.digitos(s['NUMERO']);
    const f = ix.porId[txt(s['REGISTRO_ID'])];
    if (f && LineasUtil.digitos(LineasUtil.col(f, 'NUMERO TELEFONO')) === n) return f;
    return (n && ix.porNumero[n]) || null;
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
   * elegir. Un equipo ya en el panel no se manda otra vez: se corrige (opciones.corregir, pendiente 3.12), con el
   * formulario lleno con lo de su renglón (`actual`) y sin restricciones de estatus. Si su línea ya está en Cancelaciones,
   * `cancelacion` dice su fase (su estatus no se cambia aquí). Los que no son equipo se regresan en `omitidos`.
   */
  function formulario(ids, usuario, opciones) {
    const corregir = !!(opciones && opciones.corregir);
    const lista = limpiarIds_(ids);
    const porId = filasPorId_();
    const hoy = dia(new Date());
    const bandejaActual = LineasDatos.existeTabla(TAB) ? LineasDatos.leerTabla(TAB) : [];
    const abiertos = abiertosPorRegistro_(bandejaActual);
    const cancelando = cancelacionesEnCurso_(bandejaActual);
    const equipos = [];
    const omitidos = [];
    lista.forEach((id) => {
      const f = porId[id];
      if (!f) { omitidos.push({ id: id, motivo: 'Ya no existe en la hoja' }); return; }
      const tipo = may(LineasUtil.col(f, 'TIPO'));
      const nuco = LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO')) || '';
      if (!LineasRepo.TIPOS_CON_EQUIPO[tipo]) { omitidos.push({ id: id, nuco: nuco, motivo: 'No es un equipo (TIPO ' + (tipo || 'vacío') + ')' }); return; }
      const abierto = abiertoDe_(abiertos, f);
      if (corregir && !abierto) { omitidos.push({ id: id, nuco: nuco, motivo: 'No está en Resguardos y cancelaciones' }); return; }
      if (!corregir && abierto) { omitidos.push({ id: id, nuco: nuco, motivo: 'Ya está en Resguardos y cancelaciones: usa «Corregir resguardo»' }); return; }
      const reg = LineasRepo.convertirRegistro(f);
      const linea = reg && reg.linea;
      const vig = vigencia_(LineasUtil.col(f, 'FIN PLAN'), hoy);
      const inicio = vigencia_(LineasUtil.col(f, 'INICIO PLAN'), hoy).fin;
      const enCurso = linea ? enCancelacion_(cancelando, f) : null;
      equipos.push({
        id: txt(f['ID']), nuco: nuco, tipo: tipo, modelo: txt(LineasUtil.col(f, 'EQUIPO')), imei: txt(LineasUtil.col(f, 'IMEI')),
        color: txt(LineasUtil.col(f, 'COLOR')), sim: linea ? txt(LineasUtil.col(f, 'NUMERO SIM')) : '', razonSocial: linea ? txt(LineasUtil.col(f, 'RAZON SOCIAL')) : '',
        inicioPlan: linea ? inicio : '', costoPlan: linea ? txt(LineasUtil.col(f, 'COSTO PLAN')) : '',
        responsable: txt(LineasUtil.col(f, 'RESPONSABLE')), estatusEquipo: txt(LineasUtil.col(f, 'ESTATUS EQUIPO')),
        departamento: txt(LineasUtil.col(f, 'DEPARTAMENTO')), sede: txt(LineasUtil.col(f, 'SEDE')), oficina: txt(LineasUtil.col(f, 'OFICINA / DESARROLLO')),
        tieneLinea: !!linea, numero: linea ? txt(LineasUtil.col(f, 'NUMERO TELEFONO')) : '', compania: txt(LineasUtil.col(f, 'COMPAÑIA')),
        estatusLinea: txt(LineasUtil.col(f, 'ESTATUS LINEA')), finPlan: vig.fin, vigencia: vig.vigencia,
        propuestaLinea: linea ? (enCurso ? LINEA_CANCELACION : propuestaLinea_(tipo, vig)) : '',
        cancelacion: enCurso ? txt(enCurso['CANCELACION']) : '',
        opcionesEstatus: ESTATUS_EQUIPO_RESGUARDO,
        actual: abierto ? {
          'DEPARTAMENTO': txt(abierto['DEPARTAMENTO']), 'SEDE': txt(abierto['SEDE']), 'OFICINA / DESARROLLO': txt(abierto['OFICINA']),
          // POR RECIBIR: el elegido está en su renglón (pendiente 3.15)
          'ESTATUS EQUIPO': may(LineasUtil.col(f, 'ESTATUS EQUIPO')) === POR_RECIBIR ? txt(abierto['ESTATUS_EQUIPO']) : txt(LineasUtil.col(f, 'ESTATUS EQUIPO')),
          'ESTATUS LINEA': linea ? txt(LineasUtil.col(f, 'ESTATUS LINEA')) : '',
          COMENTARIO: txt(abierto['COMENTARIO']) || txt(abierto['MOTIVO']), ESTADO: txt(abierto['ESTADO']),
        } : null,
      });
    });
    return {
      corregir: corregir, maximo: MAXIMO, equipos: equipos, omitidos: omitidos, campos: camposUbicacion_(usuario),
      estatusEquipo: ESTATUS_EQUIPO_RESGUARDO, estatusLinea: ESTATUS_LINEA_RESGUARDO,
      camposEnBlanco: CAMPOS_PERSONA.concat(CAMPOS_PERSONA_SI_HAY, CAMPOS_BORRAR),
    };
  }

  /**
   * Cambios de LINEAS TELEFONICAS para un equipo que se manda a resguardo. porRecibir: Pau aún no lo recibe; el equipo
   * queda POR RECIBIR y el estatus elegido va solo al renglón (pendiente 3.15).
   */
  function cambiosResguardo_(f, pedido, tieneLinea, porRecibir) {
    const cambios = {};
    COLS_UBICACION.forEach((c) => { cambios[c] = pedido[c]; });
    cambios['ESTATUS EQUIPO'] = porRecibir ? POR_RECIBIR : pedido['ESTATUS EQUIPO'];
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
   *   inspecciones: { id: idInspeccion }, corregir }. Cada equipo que viene de una persona (USO) trae su inspección,
   * capturada dentro de la acción (pendiente 2.6; decisión del usuario, 3-oct); sin ella no se manda ninguno.
   * Pendiente 3.12 (usuario, 20-oct): si su línea va a cancelación (o ya está en Cancelaciones), primero se separa del
   * equipo y entra sola a Cancelaciones; con CANCELADA directo queda cancelada y suelta. Al panel solo entra el equipo (su
   * línea DISPONIBLE o «Sin línea»; LINEA_AL_MANDAR guarda el número que tenía). datos.corregir (Corregir resguardo): el
   * equipo ya tiene su renglón abierto; sin inspección ni renglón nuevo, se actualiza el abierto y queda el movimiento.
   * Regresa { hechos: [{ id, nuco, cancelacion, porRecibir }], omitidos: [{ id, nuco, motivo }] }.
   */
  function mandar(ids, datos, usuario) {
    const lista = limpiarIds_(ids);
    const d = datos || {};
    const corregir = !!d.corregir;
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
      const bandejaActual = LineasDatos.leerTabla(TAB);
      const abiertos = abiertosPorRegistro_(bandejaActual);
      const cancelando = cancelacionesEnCurso_(bandejaActual);
      // Antes de escribir: la inspección de cada equipo que viene de una persona (Corregir no la pide)
      const t1 = Date.now();
      if (!corregir) {
        lista.forEach((id) => {
          const f = porId[id];
          if (!f || may(LineasUtil.col(f, 'ESTATUS EQUIPO')) !== 'USO' || abiertoDe_(abiertos, f)) return;
          LineasCaptura.exigirInspeccion((d.inspecciones || {})[id], LineasDatos.idsDeFila(f), 'NUCO ' + (LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO')) || ''));
        });
      }
      marca_('mandar · revisar inspecciones', t1);
      lista.forEach((id) => {
        let f = porId[id];
        const nuco = f ? LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO')) || '' : '';
        if (!f) { omitidos.push({ id: id, nuco: nuco, motivo: 'Ya no existe en la hoja' }); return; }
        const tipo = may(LineasUtil.col(f, 'TIPO'));
        if (!LineasRepo.TIPOS_CON_EQUIPO[tipo]) { omitidos.push({ id: id, nuco: nuco, motivo: 'No es un equipo' }); return; }
        // Un equipo ya en el panel no se vuelve a mandar: se corrige (pendiente 3.12)
        const abierto = abiertoDe_(abiertos, f);
        if (corregir && !abierto) { omitidos.push({ id: id, nuco: nuco, motivo: 'No está en Resguardos y cancelaciones' }); return; }
        if (!corregir && abierto) { omitidos.push({ id: id, nuco: nuco, motivo: 'Ya está en Resguardos y cancelaciones: usa «Corregir resguardo»' }); return; }
        const reg = LineasRepo.convertirRegistro(f);
        const tieneLinea = !!(reg && reg.linea);
        const numero = tieneLinea ? txt(LineasUtil.col(f, 'NUMERO TELEFONO')) : '';
        const pedido = pedidos[id];
        // Su línea ya está en Cancelaciones: sigue ahí (no se pasa a DISPONIBLE; la retira Pau)
        const enCurso = tieneLinea ? enCancelacion_(cancelando, f) : null;
        if (enCurso && pedido['ESTATUS LINEA'] && pedido['ESTATUS LINEA'] !== LINEA_CANCELACION) {
          omitidos.push({ id: id, nuco: nuco, motivo: avisoFase_(numero, enCurso) });
          return;
        }
        // Adendum vencido: la línea va a cancelación (usuario, 4-oct); quien captura eligió si pasa por el panel o queda
        // LINEA_SIN_PANEL directo (usuario, 16-oct; pendiente 2.50). Vigente o sin fecha: lo que se eligió. Corregir resguardo
        // no la manda solo: respeta lo que se eligió y la que ya está en Cancelaciones se queda como está (prueba del 20-oct)
        const vencida = !corregir && tieneLinea && !enCurso && propuestaLinea_(tipo, vigencia_(LineasUtil.col(f, 'FIN PLAN'), hoy)) === LINEA_CANCELACION;
        if (vencida || (corregir && pedido.directa)) pedido['ESTATUS LINEA'] = pedido.directa ? LINEA_SIN_PANEL : LINEA_CANCELACION;
        if (enCurso) pedido['ESTATUS LINEA'] = corregir ? may(LineasUtil.col(f, 'ESTATUS LINEA')) : LINEA_CANCELACION;
        if (tieneLinea && !pedido['ESTATUS LINEA']) { omitidos.push({ id: id, nuco: nuco, motivo: 'Falta el estatus de la línea' }); return; }
        // Cómo deja la línea al equipo: SIGUE (ya está en Cancelaciones), PANEL (entra a Cancelaciones) o DIRECTA
        const sale = !tieneLinea ? '' : (enCurso ? (corregir ? '' : 'SIGUE') : ({ [LINEA_CANCELACION]: 'PANEL', [LINEA_SIN_PANEL]: 'DIRECTA' })[pedido['ESTATUS LINEA']] || '');
        const lineaQueda = tieneLinea && !sale;
        const motivoCancelacion = sale === 'PANEL' || sale === 'DIRECTA' ? motivoCancelacionDe_(f) : '';
        const antes = { estatus: txt(LineasUtil.col(f, 'ESTATUS EQUIPO')), estatusLinea: txt(LineasUtil.col(f, 'ESTATUS LINEA')), responsable: { nombre: txt(LineasUtil.col(f, 'RESPONSABLE')) } };
        const ahora = new Date();
        const f0 = f;
        const cambios = [];
        const refs = [id];
        let idLinea = '';
        const t2 = Date.now();
        if (sale) {
          const s = LineasEscritura.separarLinea(f, ahora, sale === 'SIGUE' ? { estatus: LINEA_CANCELACION } : null);
          s.campos.forEach((c) => cambios.push(c));
          s.refs.forEach((x) => refs.push(x));
          idLinea = s.idLinea;
          f = LineasRepo.leerRegistroObligatorio(id, 'el equipo');
        }
        // Nuevo o aún por recibir: el equipo queda POR RECIBIR; ya recibido, Corregir resguardo le pone el elegido (3.15)
        const porRecibir = !abierto || txt(abierto['ESTADO']) === ESTADO.PENDIENTE;
        const guardado = LineasRepo.guardarCambiosRegistro(f, cambiosResguardo_(f, pedido, lineaQueda, porRecibir), usuario, ahora);
        guardado.campos.forEach((c) => cambios.push(c));
        (guardado.refs || []).forEach((x) => refs.push(x));
        marca_('mandar · guardar el registro', t2);
        const t3 = Date.now();
        const idMovimiento = LineasRepo.registrarMovimiento(corregir ? 'CORREGIR_RESGUARDO' : 'RESGUARDO', { motivo: pedido.COMENTARIO || motivo, ticket: ticket }, usuario, ahora, {
          refs: refs, nuco: LineasUtil.col(f0, 'NUCO'), numero: numero,
          antes: antes, despues: { estatus: porRecibir ? POR_RECIBIR : pedido['ESTATUS EQUIPO'], estatusLinea: tieneLinea ? pedido['ESTATUS LINEA'] : '' },
          detalle: { idsCambios: guardado.idsCambios, idsReasignacion: [], cambios: cambios.concat(cambioMotivo_(motivoCancelacion)) },
        });
        // La línea ya suelta: a Cancelaciones o cancelada sin panel
        let cancelacion = false;
        if (sale === 'PANEL' || sale === 'DIRECTA') {
          const fl = LineasRepo.leerRegistroObligatorio(idLinea, 'la línea');
          if (sale === 'PANEL') {
            nuevos.push(abrirCancelacion_(fl, idLinea, nuco, motivoCancelacion, pedido.COMENTARIO || motivo, ticket, usuario, ahora, hoy));
            cancelacion = true;
          } else {
            LineasRepo.guardarCambiosRegistro(fl, { 'ESTATUS LINEA': LINEA_SIN_PANEL }, usuario, ahora);
            registrarCancelacionDirecta(f0, idLinea, pedido.COMENTARIO || motivo, ticket, usuario, ahora);
          }
        }
        marca_('mandar · movimiento', t3);
        const ubicacion = { 'DEPARTAMENTO': pedido.DEPARTAMENTO, 'SEDE': pedido.SEDE, 'OFICINA': pedido['OFICINA / DESARROLLO'] };
        if (abierto) {
          // Corregir resguardo: se actualiza su renglón (el de un renglón viejo con su cancelación conserva el número)
          LineasDatos.actualizarFila(TAB, abierto._fila, Object.assign({
            'ESTATUS_EQUIPO': pedido['ESTATUS EQUIPO'], 'ESTATUS_LINEA': lineaQueda ? pedido['ESTATUS LINEA'] : '',
            'COMENTARIO': pedido.COMENTARIO || motivo, 'MOTIVO': motivo, 'ACTUALIZADO_EN': ahora, 'ACCESORIOS': txt(LineasUtil.col(f, 'ACCESORIOS')),
          }, ubicacion, !txt(abierto['LINEA_AL_MANDAR']) && txt(abierto['NUMERO']) ? { 'LINEA_AL_MANDAR': txt(abierto['NUMERO']) } : {}));
          hechos.push({ id: id, nuco: nuco, cancelacion: cancelacion, porRecibir: false });
          return;
        }
        // Sin renglón abierto (viene de una persona, o está guardado desde el AppSheet o ya se entregó a Líneas): Pau
        // lo recibe (usuario, 13-oct; antes uno ya guardado no entraba a la bandeja)
        nuevos.push(Object.assign({
          'FECHA': ahora, 'REGISTRO_ID': txt(f['ID']), 'NUCO': nuco, 'NUMERO': numero, 'LINEA_AL_MANDAR': numero,
          'TIPO': may(LineasUtil.col(f, 'TIPO')) || tipo, 'MODELO': txt(LineasUtil.col(f, 'EQUIPO')), 'IMEI': txt(LineasUtil.col(f, 'IMEI')),
          'COMPANIA': lineaQueda ? txt(LineasUtil.col(f, 'COMPAÑIA')) : '', 'ACCESORIOS': txt(LineasUtil.col(f, 'ACCESORIOS')),
          'RAZON_SOCIAL': lineaQueda ? txt(LineasUtil.col(f, 'RAZON SOCIAL')) : '', 'FIN_PLAN': lineaQueda ? vigencia_(LineasUtil.col(f, 'FIN PLAN'), hoy).fin : '',
          'ESTATUS_EQUIPO': pedido['ESTATUS EQUIPO'], 'ESTATUS_LINEA': lineaQueda ? pedido['ESTATUS LINEA'] : '',
          'COMENTARIO': pedido.COMENTARIO, 'MOTIVO': motivo, 'SOLICITO_CORREO': usuario.correo, 'SOLICITO_NOMBRE': usuario.nombre,
          'ESTADO': ESTADO.PENDIENTE, 'RECIBIO': '', 'CANCELACION': '', 'ASESOR': '', 'MOTIVO_CANCELACION': '',
          'MOVIMIENTO_ID': idMovimiento || '', 'ACTUALIZADO_EN': ahora,
        }, ubicacion));
        hechos.push({ id: id, nuco: nuco, cancelacion: cancelacion, porRecibir: true });
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

  /** «Línea 4421090805: está en POR FIRMAR en Cancelaciones; Pau tiene que retirarla.» (usuario, 20-oct) */
  const avisoFase_ = (numero, r) => 'Línea ' + (txt(numero) || txt(r['NUMERO'])) + ': está en ' + txt(r['CANCELACION']) + ' en Cancelaciones; Pau tiene que retirarla.';

  /**
   * ¿La línea del registro ya está en Cancelaciones? Por el ID de su línea o por su número (los renglones viejos no
   * guardan el ID). Regresa el renglón o null.
   */
  function enCancelacion_(cancelando, f) {
    const ids = [txt(LineasUtil.col(f, 'ID LINEA'))].concat(LineasDatos.idsDeFila(f)).filter(Boolean);
    for (let i = 0; i < ids.length; i++) if (cancelando.porLinea[ids[i]]) return cancelando.porLinea[ids[i]];
    const n = LineasUtil.digitos(LineasUtil.col(f, 'NUMERO TELEFONO'));
    return (n && cancelando.porNumero[n]) || null;
  }

  /** Renglones con su cancelación en curso (POR FIRMAR, CARTA FIRMADA o CARTA ENVIADA), por ID de línea y por número. */
  function cancelacionesEnCurso_(filas) {
    const m = { porLinea: {}, porNumero: {} };
    filas.forEach((r) => {
      if (EN_CURSO.indexOf(txt(r['CANCELACION'])) < 0) return;
      if (txt(r['ID_LINEA'])) m.porLinea[txt(r['ID_LINEA'])] = r;
      const n = LineasUtil.digitos(r['NUMERO']);
      if (n) m.porNumero[n] = r;
    });
    return m;
  }

  /** El renglón de Cancelaciones del registro `f`, o null (Desvincular, Cambiar línea y Corregir lo revisan). */
  function cancelacionDe(f) {
    if (!f || !LineasDatos.existeTabla(TAB)) return null;
    return enCancelacion_(cancelacionesEnCurso_(LineasDatos.leerTabla(TAB)), f);
  }

  /** Líneas no saca una línea de Cancelaciones: avisa su fase (usuario, 20-oct; pendiente 3.12). */
  function exigirSinCancelacion(f) {
    const r = cancelacionDe(f);
    if (r && txt(r['ID']) !== liberando_) throw new Error(avisoFase_(LineasUtil.col(f, 'NUMERO TELEFONO'), r));
  }

  /**
   * La línea `fl` entra a Cancelaciones: queda EN PROCESO DE CANCELACION, deja su movimiento y regresa su renglón (sin
   * recepción: ESTADO vacío). `nuco`: el equipo del que salió (la columna NUCO dice de dónde viene).
   */
  function abrirCancelacion_(fl, idLinea, nuco, motivoCancelacion, motivo, ticket, usuario, ahora, hoy) {
    const numero = txt(LineasUtil.col(fl, 'NUMERO TELEFONO'));
    const antes = { estatusLinea: txt(LineasUtil.col(fl, 'ESTATUS LINEA')) };
    const guardado = LineasRepo.guardarCambiosRegistro(fl, { 'ESTATUS LINEA': LINEA_CANCELACION }, usuario, ahora);
    LineasRepo.registrarMovimiento('CANCELACION_LINEA', { motivo: motivo, ticket: ticket }, usuario, ahora, {
      refs: [txt(fl['ID'])].concat(guardado.refs || []), nuco: nuco || LineasUtil.col(fl, 'NUCO'), numero: numero, antes: antes,
      despues: { estatusLinea: LINEA_CANCELACION },
      detalle: { idsCambios: guardado.idsCambios, idsReasignacion: [], cambios: guardado.campos.concat(cambioMotivo_(motivoCancelacion)) },
    });
    const compania = txt(LineasUtil.col(fl, 'COMPAÑIA'));
    const razon = txt(LineasUtil.col(fl, 'RAZON SOCIAL'));
    return {
      'FECHA': ahora, 'REGISTRO_ID': txt(fl['ID']), 'ID_LINEA': txt(idLinea) || txt(LineasUtil.col(fl, 'ID LINEA')) || txt(fl['ID']),
      'NUCO': nuco || LineasUtil.nucoVisible(LineasUtil.col(fl, 'NUCO')) || '', 'NUMERO': numero, 'TIPO': may(LineasUtil.col(fl, 'TIPO')),
      'MODELO': txt(LineasUtil.col(fl, 'EQUIPO')), 'IMEI': txt(LineasUtil.col(fl, 'IMEI')), 'COMPANIA': compania, 'RAZON_SOCIAL': razon,
      'ACCESORIOS': txt(LineasUtil.col(fl, 'ACCESORIOS')), 'FIN_PLAN': vigencia_(LineasUtil.col(fl, 'FIN PLAN'), hoy).fin,
      'ESTATUS_EQUIPO': txt(LineasUtil.col(fl, 'ESTATUS EQUIPO')), 'ESTATUS_LINEA': LINEA_CANCELACION,
      'DEPARTAMENTO': txt(LineasUtil.col(fl, 'DEPARTAMENTO')), 'SEDE': txt(LineasUtil.col(fl, 'SEDE')), 'OFICINA': txt(LineasUtil.col(fl, 'OFICINA / DESARROLLO')),
      'COMENTARIO': '', 'MOTIVO': motivo, 'SOLICITO_CORREO': usuario.correo, 'SOLICITO_NOMBRE': usuario.nombre, 'ESTADO': '',
      'CANCELACION': FASE.POR_FIRMAR, 'ASESOR': asesorPara(compania, razon), 'ACTUALIZADO_EN': ahora, 'MOTIVO_CANCELACION': motivoCancelacion,
    };
  }

  // ---------------- Mandar a cancelación (sin resguardo) ----------------

  /**
   * "Mandar a cancelación" (usuario, 30-sep): una o varias líneas se mandan a cancelar sin mandar el equipo a
   * resguardo (el colaborador se queda con el teléfono, o es una línea suelta). La línea pasa a EN PROCESO DE
   * CANCELACION y entra a la pestaña Cancelaciones de la bandeja (POR FIRMAR, con su asesor y el ID de la línea). Su
   * renglón no lleva recepción (ESTADO vacío): no aparece en la pestaña Resguardos. Al confirmarla, queda CANCELADA.
   * datos = { motivoCancelacion (LINEA VENCIDA o CANCELACION ANTICIPADA, usuario 13-oct), comentario, ticket }. Regresa
   * { hechos: [{ id, nuco, numero }], omitidos: [{ id, nuco, motivo }] }. opciones.motivoDelAdendum (Desvincular,
   * Cambiar línea y Corregir, que no lo eligen; no llega desde la pantalla): el motivo de cada línea sale de su adendum.
   * opciones.nucos: { id: NUCO } del equipo del que salió la línea (la línea suelta ya no lo tiene).
   */
  function mandarCancelacion(ids, datos, usuario, opciones) {
    const lista = limpiarIds_(ids);
    const d = datos || {};
    const delAdendum = !!(opciones && opciones.motivoDelAdendum);
    const nucos = (opciones && opciones.nucos) || {};
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
        if (enCancelacion_(cancelando, f)) { omitidos.push({ id: id, nuco: nuco, numero: numero, motivo: 'Ya está en la bandeja de cancelaciones' }); return; }
        const motivoCancelacion = delAdendum ? motivoCancelacionDe_(f) : motivoElegido;
        nuevos.push(abrirCancelacion_(f, txt(LineasUtil.col(f, 'ID LINEA')), nucos[id] || nuco, motivoCancelacion, motivo, ticket, usuario, new Date(), hoy));
        hechos.push({ id: id, nuco: nucos[id] || nuco, numero: numero });
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
    // Los renglones de antes del 3.12 no guardan LINEA_AL_MANDAR: era el número con que se mandó
    if (!o['LINEA_AL_MANDAR'] && o['ESTADO']) o['LINEA_AL_MANDAR'] = o['NUMERO'];
    o._fila = r._fila;
    return o;
  }

  /** ¿El renglón sigue abierto? Por recibir o en resguardo, o con su cancelación en curso. */
  const abierto_ = (r) => ABIERTOS.indexOf(r['ESTADO']) >= 0 || EN_CURSO.indexOf(r['CANCELACION']) >= 0;

  /**
   * El renglón abierto con lo de hoy del inventario (ver el encabezado). Resguardos sigue al equipo: modelo, IMEI, tipo,
   * accesorios, su estatus y su línea de hoy (o «Sin línea») con su estatus. Cancelaciones sigue a la línea, esté donde
   * esté (número, compañía, razón social, fin del adendum); su NUCO dice de qué equipo salió. Un renglón viejo que junta
   * las dos cosas conserva el número de su cancelación si el equipo ya tiene otra línea.
   */
  function espejo_(r, ix, hoy) {
    if (!abierto_(r)) return r;
    const deLinea = (f, o) => {
      o['NUMERO'] = txt(LineasUtil.col(f, 'NUMERO TELEFONO')) || o['NUMERO'];
      o['COMPANIA'] = txt(LineasUtil.col(f, 'COMPAÑIA'));
      o['RAZON_SOCIAL'] = txt(LineasUtil.col(f, 'RAZON SOCIAL'));
      o['FIN_PLAN'] = vigencia_(LineasUtil.col(f, 'FIN PLAN'), hoy).fin;
      return o;
    };
    if (ABIERTOS.indexOf(r['ESTADO']) < 0) {
      const fl = registroDeLinea_(r, ix);
      return fl ? deLinea(fl, Object.assign({}, r)) : r;
    }
    const f = ix.porId[r['REGISTRO_ID']];
    if (!f) return r;
    const tipo = may(LineasUtil.col(f, 'TIPO'));
    const numero = txt(LineasUtil.col(f, 'NUMERO TELEFONO'));
    const tieneLinea = !!numero && !/^EQUIPO$/.test(tipo);
    const estatusEquipoHoy = txt(LineasUtil.col(f, 'ESTATUS EQUIPO'));
    const o = Object.assign({}, r, {
      'NUCO': LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO')) || r['NUCO'], 'TIPO': tipo || r['TIPO'],
      'MODELO': txt(LineasUtil.col(f, 'EQUIPO')), 'IMEI': txt(LineasUtil.col(f, 'IMEI')), 'ACCESORIOS': txt(LineasUtil.col(f, 'ACCESORIOS')),
      // POR RECIBIR en el inventario: el panel muestra el que se eligió al mandarlo (pendiente 3.15)
      'ESTATUS_EQUIPO': estatusEquipoHoy && may(estatusEquipoHoy) !== POR_RECIBIR ? estatusEquipoHoy : r['ESTATUS_EQUIPO'],
    });
    const mismaLinea = LineasUtil.digitos(numero) === LineasUtil.digitos(r['NUMERO']);
    if (r['CANCELACION'] && !mismaLinea) return o;
    // Sin línea hoy, «Línea» sigue diciendo la que tenía al mandarlo, con su estatus de hoy (Líneas, 20-oct: «así les
    // funciona»; p. ej. EN PROCESO DE CANCELACION si se fue a Cancelaciones)
    if (!r['CANCELACION']) {
      const alMandar = txt(r['LINEA_AL_MANDAR']);
      const fl = !tieneLinea && alMandar ? ix.porNumero[LineasUtil.digitos(alMandar)] : null;
      o['NUMERO'] = tieneLinea ? numero : alMandar;
      o['ESTATUS_LINEA'] = tieneLinea ? txt(LineasUtil.col(f, 'ESTATUS LINEA')) : (fl ? txt(LineasUtil.col(fl, 'ESTATUS LINEA')) : '');
    }
    return tieneLinea ? deLinea(f, o) : o;
  }

  /** Todos los renglones de la bandeja, del más reciente al más antiguo, y lo que la persona puede hacer. */
  function bandeja(usuario) {
    let filas = LineasDatos.existeTabla(TAB) ? LineasDatos.leerTabla(TAB).map(fila_) : [];
    if (filas.some((r) => abierto_(r) || r['CANCELACION'])) {
      const ix = indices_();
      const hoy = dia(new Date());
      // Cancelaciones (usuario, 22-oct, como en el correo al asesor): la cuenta padre de la línea, también ya cancelada, y
      // la región por la lada. No se guardan: se leen del inventario
      filas = filas.map((r) => {
        const o = espejo_(r, ix, hoy);
        if (!o['CANCELACION']) return o;
        const fl = registroDeLinea_(o, ix);
        return Object.assign(o === r ? Object.assign({}, r) : o, {
          'CUENTA_PADRE': fl ? txt(LineasUtil.col(fl, 'CUENTA PADRE')) : '', 'REGION': LineasUtil.regionDeNumero(o['NUMERO']),
        });
      });
    }
    filas.sort((a, b) => (b.FECHA instanceof Date ? b.FECHA.getTime() : 0) - (a.FECHA instanceof Date ? a.FECHA.getTime() : 0));
    // puedeOperar: los de Líneas (Corregir resguardo y Quitar del panel; pendiente 3.12); operaPanel: quién las ve en el
    // panel (sin administradores; usuario, 21-oct)
    return { puedeAprobar: puedeAprobar(usuario), puedeOperar: !!(usuario && usuario.puedeOperar), operaPanel: !!(usuario && usuario.operaPanel),
      filas: filas, estados: ESTADO, fases: FASE };
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
        hechos.push({ id: id, nuco: txt(r['NUCO']), registro: txt(r['REGISTRO_ID']) });
      });
    });
    return { hechos: hechos, omitidos: omitidos };
  }

  /** El índice de la pantalla sabe qué equipos siguen en el panel: se rehace el de los tocados. */
  function refrescarEquipos_(r) {
    const ids = r.hechos.map((h) => h.registro).filter(Boolean);
    if (ids.length) r.indice = LineasRepo.refrescarIndice(ids);
    return r;
  }

  /**
   * Pau confirma que recibió físicamente los equipos: el equipo POR RECIBIR pasa al estatus elegido al mandarlo, con su
   * movimiento RECEPCION (usuario, 21-oct; pendiente 3.15; antes no tocaba el inventario).
   */
  function recibir(ids, usuario) {
    exigirAprobador_(usuario);
    const r = actualizar_(ids, (x) => (txt(x['ESTADO']) !== ESTADO.PENDIENTE ? { omitir: 'Ya estaba ' + (txt(x['ESTADO']) || 'sin estado').toLowerCase() }
      : { 'ESTADO': ESTADO.RESGUARDO, 'RECIBIDO_EN': new Date(), 'RECIBIO': usuario.nombre }));
    espejar_(r.hechos, (f, s) => (may(LineasUtil.col(f, 'ESTATUS EQUIPO')) === POR_RECIBIR && txt(s['ESTATUS_EQUIPO'])
      ? { 'ESTATUS EQUIPO': may(s['ESTATUS_EQUIPO']) } : {}), 'Recibido en resguardo', 'RECEPCION', usuario);
    return refrescarEquipos_(r);
  }

  /** Pau entrega a Líneas un equipo guardado (datos = { recibe, asunto }). */
  function entregar(ids, datos, usuario) {
    exigirAprobador_(usuario);
    const recibe = txt((datos || {}).recibe).toUpperCase();
    if (!recibe) throw new Error('Escribe quién de Líneas recibe el equipo.');
    return refrescarEquipos_(actualizar_(ids, (r) => (txt(r['ESTADO']) !== ESTADO.RESGUARDO ? { omitir: 'No está en resguardo' }
      : { 'ESTADO': ESTADO.ENTREGADO, 'ENTREGADO_EN': new Date(), 'ENTREGADO_A': recibe, 'ENTREGA_ASUNTO': txt((datos || {}).asunto) })));
  }

  /**
   * Pau cierra un equipo ya recibido (EN RESGUARDO): VENDIDO, DONADO o DESECHADO, en el panel y en ESTATUS EQUIPO del
   * inventario (DONADO y DESECHADO: pendiente 3.16, usuario 22-oct: «solo con la regla que sean los que ya están
   * recibidos»). datos = { asunto } (referencia opcional).
   */
  const CIERRES = {
    VENDIDO: { motivo: 'Vendido', movimiento: 'VENTA' },
    DONADO: { motivo: 'Donado', movimiento: 'CIERRE' },
    DESECHADO: { motivo: 'Desechado', movimiento: 'DESECHO' },
  };
  function cerrar_(ids, estatus, datos, usuario) {
    exigirAprobador_(usuario);
    const c = CIERRES[estatus];
    const asunto = txt((datos || {}).asunto);
    const r = actualizar_(ids, (x) => (txt(x['ESTADO']) !== ESTADO.RESGUARDO ? { omitir: 'No está en resguardo' }
      : { 'ESTADO': ESTADO[estatus], 'ESTATUS_EQUIPO': estatus, 'ENTREGA_ASUNTO': asunto }));
    espejar_(r.hechos, () => ({ 'ESTATUS EQUIPO': estatus }), c.motivo + ' (bandeja de resguardos)' + (asunto ? ': ' + asunto : ''), c.movimiento, usuario);
    return r;
  }
  const vendido = (ids, datos, usuario) => cerrar_(ids, 'VENDIDO', datos, usuario);
  const donado = (ids, datos, usuario) => cerrar_(ids, 'DONADO', datos, usuario);
  const desechado = (ids, datos, usuario) => cerrar_(ids, 'DESECHADO', datos, usuario);

  /** Avance de la cancelación: fase FIRMADA o ENVIADA (datos = { asesor, asunto }). */
  function faseCancelacion(ids, fase, datos, usuario) {
    exigirAprobador_(usuario);
    const f = may(fase);
    if ([FASE.FIRMADA, FASE.ENVIADA].indexOf(f) < 0) throw new Error('Fase desconocida: ' + fase);
    const d = datos || {};
    return actualizar_(ids, (r) => {
      const actual = txt(r['CANCELACION']);
      if (!actual) return { omitir: 'Su línea no va a cancelación' };
      // La fase solo avanza (se puede brincar hacia adelante; usuario, 22-oct)
      if (EN_CURSO.indexOf(actual) < 0 || EN_CURSO.indexOf(actual) >= EN_CURSO.indexOf(f)) return { omitir: 'Ya está ' + actual.toLowerCase() };
      const cambios = { 'CANCELACION': f };
      if (txt(d.asesor)) cambios['ASESOR'] = may(d.asesor);
      if (txt(d.asunto)) cambios['CANCELACION_ASUNTO'] = txt(d.asunto);
      cambios[f === FASE.FIRMADA ? 'CARTA_FIRMADA_EN' : 'CARTA_ENVIADA_EN'] = new Date();
      return cambios;
    });
  }

  /**
   * El proveedor confirmó: la línea queda CANCELADA en el inventario esté donde esté (pendiente 3.12: antes solo si el
   * equipo del renglón seguía con ese número; arregla 2.52 y 3.11). Si está en un equipo, el NUCO pasa a solo EQUIPO y
   * sus datos de línea se limpian (el número queda en la bitácora).
   */
  function confirmarCancelacion(ids, datos, usuario) {
    exigirAprobador_(usuario);
    const asunto = txt((datos || {}).asunto);
    const porId = {};
    const r = actualizar_(ids, (x) => {
      const actual = txt(x['CANCELACION']);
      if (!actual) return { omitir: 'Su línea no va a cancelación' };
      if (EN_CURSO.indexOf(actual) < 0) return { omitir: 'Ya estaba ' + actual.toLowerCase() };
      porId[txt(x['ID'])] = x;
      return Object.assign({ 'CANCELACION': FASE.CANCELADA, 'CANCELADA_EN': new Date(), 'CANCELO': usuario.nombre }, asunto ? { 'CANCELACION_ASUNTO': asunto } : {});
    });
    espejar_(r.hechos, (f) => {
      const tipo = may(LineasUtil.col(f, 'TIPO'));
      // Registro de solo línea (TIPO LINEA / SIM BASICO): el número es el registro; solo queda CANCELADA
      if (!LineasRepo.TIPOS_CON_EQUIPO[tipo]) return { 'ESTATUS LINEA': 'CANCELADA' };
      const cambios = Object.assign({}, LineasRepo.VALORES_SIN_LINEA, { 'ESTATUS LINEA': 'CANCELADA' });
      cambios['TIPO'] = LineasRepo.tipoSinLinea(tipo);
      return cambios;
    }, 'Cancelación de línea confirmada' + (asunto ? ': ' + asunto : ''), 'CANCELACION_LINEA', usuario, porId, true);
    return r;
  }

  /**
   * Lleva un paso de la bandeja al inventario (las hojas nuevas y su movimiento, como una edición). deLinea: el paso es
   * de la cancelación y sigue a la línea (registroDeLinea_); si no, al equipo del renglón.
   */
  function espejar_(hechos, cambiosDe, motivo, tipoMovimiento, usuario, solicitudes, deLinea) {
    if (!hechos.length) return;
    const sol = solicitudes || {};
    const porIdBandeja = {};
    LineasDatos.leerTabla(TAB).forEach((r) => { porIdBandeja[txt(r['ID'])] = r; });
    const tocados = [];
    LineasDatos.conCandado(() => {
      const ix = indices_();
      hechos.forEach((h) => {
        const s = sol[h.id] || porIdBandeja[h.id];
        const f = s && (deLinea ? registroDeLinea_(s, ix) : ix.porId[txt(s['REGISTRO_ID'])]);
        if (!f) { h.aviso = deLinea ? 'La línea ya no está en el inventario' : 'El equipo ya no está en el inventario'; return; }
        tocados.push(txt(f['ID']));
        const cambios = cambiosDe(f, s);
        if (!cambios) { h.aviso = 'La línea ya no estaba en proceso de cancelación: el inventario no se tocó'; return; }
        if (!Object.keys(cambios).length) return; // nada que llevar (p. ej. recibido sin POR RECIBIR, de antes del 3.15)
        const ahora = new Date();
        const columna = deLinea ? 'ESTATUS LINEA' : 'ESTATUS EQUIPO';
        const antes = { estatus: txt(LineasUtil.col(f, columna)) };
        const guardado = LineasRepo.guardarCambiosRegistro(f, cambios, usuario, ahora);
        if (!guardado.campos.length) return;
        LineasRepo.registrarMovimiento(tipoMovimiento, { motivo: motivo }, usuario, ahora, {
          refs: [txt(f['ID'])].concat(guardado.refs || []), nuco: LineasUtil.col(f, 'NUCO'), numero: s['NUMERO'], antes: antes,
          despues: { estatus: txt(cambios[columna]) },
          detalle: { idsCambios: guardado.idsCambios, idsReasignacion: [], cambios: guardado.campos, resguardo: h.id },
        });
      });
    });
    if (tocados.length) LineasRepo.refrescarIndice(tocados); // solo los tocados
  }

  // ---------------- Quitar del panel (pendiente 3.12) ----------------
  //
  // Para un equipo mandado por error que Pau aún no recibe (PENDIENTE DE RECEPCION); solo los de Líneas. El renglón se
  // borra del panel, y también el de la cancelación de su línea si salió con el envío (usuario, 22-oct: «lo ideal es que
  // se elimine directamente, no se quede guardado el registro»; antes quedaba RETIRADO); lo que pasó queda en el
  // movimiento QUITAR_PANEL. El equipo vuelve a como estaba antes de mandarlo, campo por campo, con lo que guardó el movimiento del envío:
  // solo regresa el campo que sigue con el valor que dejó el envío; lo que alguien cambió después se queda (usuario,
  // 20-oct). La línea que se fue con el envío también regresa si su cancelación sigue POR FIRMAR (usuario, 20-oct). Los
  // datos de la persona solo vuelven si el equipo vuelve a USO.

  /** Lo que el envío cambió pero no se regresa: la línea que salió, el tipo, el comentario y los calculados. */
  const NO_REGRESA = ['NUMERO TELEFONO', 'NUMERO SIM', 'TIPO', 'COMPAÑIA', 'RAZON SOCIAL', 'COMENTARIOS', 'MOTIVO DE CANCELACION', 'ID PERSONA'];
  const DE_LA_LINEA = ['ESTATUS LINEA', 'PIN WHATSAPP'];
  const DE_LA_PERSONA = ['NO EMPLEADO', 'RESPONSABLE', 'PUESTO', 'AREA', 'DIRECTOR', 'JEFE DIRECTO', 'CUENTA GOOGLE'];
  const esDeLaPersona_ = (c) => DE_LA_PERSONA.indexOf(c) >= 0 || / RESPONSABLE$/.test(c);
  /** En la ventana no se ve el valor (solo que regresa). */
  const SECRETOS = ['PIN EQUIPO', 'PIN WHATSAPP', 'PATRON', 'CONTRASEÑA MODEM'];
  const igualTexto_ = (a, b) => may(a).replace(/\s+/g, ' ') === may(b).replace(/\s+/g, ' ');

  /** Lo que cambió el envío (CAMBIOS del movimiento RESGUARDO): por su ID o, en los renglones viejos, por equipo y hora. */
  function cambiosDelEnvio_(r, f) {
    const MOV = LineasRepo.TAB.MOV;
    if (!MOV || !LineasDatos.existeTabla(MOV)) return [];
    const idMov = txt(r['MOVIMIENTO_ID']);
    const filas = idMov ? LineasDatos.buscarFilas(MOV, 'ID', idMov)
      : LineasDatos.buscarFilasVarios(MOV, 'ID EQUIPO', [txt(f['ID']), txt(LineasUtil.col(f, 'ID EQUIPO'))].filter(Boolean), true);
    if (!filas.length) return [];
    const t = r['FECHA'] instanceof Date ? r['FECHA'].getTime() : 0;
    const distancia = (m) => (m['FECHA'] instanceof Date ? Math.abs(m['FECHA'].getTime() - t) : Infinity);
    const m = LineasDatos.leerFilas([{ tabla: MOV, filas: filas }])[0]
      .filter((x) => txt(x['ACCION']) === 'RESGUARDO' && (idMov || distancia(x) < 120000))
      .sort((a, b) => distancia(a) - distancia(b))[0];
    if (!m) return [];
    try { return JSON.parse(txt(m['CAMBIOS']) || '[]'); } catch (e) { return []; }
  }

  /**
   * { regresa: [{ campo, de, a, linea? }], seQueda: [{ campo, valor, motivo }] } del renglón `r` y su equipo `f`. La línea
   * que el envío separó (se fue a Cancelaciones o quedó CANCELADA directo) también regresa (usuario, 20-oct), si Pau no ha
   * avanzado su cancelación (sigue POR FIRMAR) y no está en otro equipo: `linea` = { id, renglon } para quitarDelPanel.
   */
  function planQuitar_(r, f, ctx) {
    const porCampo = {};
    const orden = [];
    cambiosDelEnvio_(r, f).forEach((c) => {
      const k = txt(c.campo);
      if (!k) return;
      if (!porCampo[k]) { porCampo[k] = { antes: c.antes, despues: c.despues }; orden.push(k); } else porCampo[k].despues = c.despues;
    });
    const regresa = [];
    const seQueda = [];
    const numeroHoy = LineasUtil.digitos(LineasUtil.col(f, 'NUMERO TELEFONO'));
    const salio = porCampo['NUMERO TELEFONO'] && txt(porCampo['NUMERO TELEFONO'].antes) && !txt(porCampo['NUMERO TELEFONO'].despues) ? txt(porCampo['NUMERO TELEFONO'].antes) : '';
    let lineaSigue = !!numeroHoy && numeroHoy === LineasUtil.digitos(r['LINEA_AL_MANDAR'] || r['NUMERO']);
    if (salio && !numeroHoy) {
      const n = LineasUtil.digitos(salio);
      const fl = ctx.ix.porNumero[n];
      const renglon = fl ? enCancelacion_(ctx.cancelando, fl) : null;
      let motivo = '';
      if (!fl) motivo = 'La línea ya no está en el inventario';
      else if (LineasRepo.TIPOS_CON_EQUIPO[may(LineasUtil.col(fl, 'TIPO'))]) motivo = 'La línea ya está en el NUCO ' + (LineasUtil.nucoVisible(LineasUtil.col(fl, 'NUCO')) || '');
      else if (renglon && txt(renglon['CANCELACION']) !== FASE.POR_FIRMAR) motivo = avisoFase_(salio, renglon);
      else if (!renglon && ctx.confirmadas[n]) motivo = 'Su cancelación ya se confirmó';
      if (motivo) seQueda.push({ campo: 'NUMERO TELEFONO', valor: '', motivo: motivo });
      else {
        regresa.push({ campo: 'NUMERO TELEFONO', de: '', a: salio, linea: { id: txt(fl['ID']), renglon: renglon } });
        lineaSigue = true;
      }
    }
    orden.forEach((k) => {
      const c = porCampo[k];
      const K = LineasDatos.normCol(k);
      if (NO_REGRESA.indexOf(K) >= 0 || igualTexto_(c.antes, c.despues)) return;
      if (DE_LA_LINEA.indexOf(K) >= 0 && !lineaSigue) return;
      const hoy = txt(LineasUtil.col(f, k));
      // La línea que regresa vuelve con su estatus y su PIN de antes. POR RECIBIR solo lo pone el panel: nadie lo cambió
      // después (los mandados antes del 3.15 tienen en su envío el estatus elegido; tools/lineas-datos/por-recibir.js)
      const sinTocar = igualTexto_(hoy, c.despues) || (K === 'ESTATUS EQUIPO' && may(hoy) === POR_RECIBIR);
      if (sinTocar || (DE_LA_LINEA.indexOf(K) >= 0 && !numeroHoy)) regresa.push({ campo: k, de: hoy, a: txt(c.antes) });
      else seQueda.push({ campo: k, valor: hoy, motivo: 'Cambió después' });
    });
    // POR RECIBIR sin renglón no puede quedar (DEV, 22-oct: un envío que no cambió el estatus, como RESGUARDO a
    // RESGUARDO, no lo trae en su movimiento): vuelve al elegido en su renglón, que es el que tenía antes de mandarlo
    if (may(LineasUtil.col(f, 'ESTATUS EQUIPO')) === POR_RECIBIR && !regresa.some((x) => LineasDatos.normCol(x.campo) === 'ESTATUS EQUIPO')) {
      seQueda.splice(0, seQueda.length, ...seQueda.filter((x) => LineasDatos.normCol(x.campo) !== 'ESTATUS EQUIPO'));
      regresa.push({ campo: 'ESTATUS EQUIPO', de: POR_RECIBIR, a: txt(r['ESTATUS_EQUIPO']) || 'RESGUARDO', nota: 'Sale del panel: deja de estar POR RECIBIR' });
    }
    // Sin USO el equipo sigue guardado: la persona no regresa (y su línea no vuelve a USO)
    const estatus = regresa.filter((x) => LineasDatos.normCol(x.campo) === 'ESTATUS EQUIPO')[0];
    const final = may(estatus ? estatus.a : LineasUtil.col(f, 'ESTATUS EQUIPO'));
    if (final === 'USO') return { regresa: regresa, seQueda: seQueda };
    const queda = regresa.filter((x) => !(esDeLaPersona_(LineasDatos.normCol(x.campo)) || (LineasDatos.normCol(x.campo) === 'ESTATUS LINEA' && may(x.a) === 'USO')));
    regresa.filter((x) => queda.indexOf(x) < 0).forEach((x) => seQueda.push({ campo: x.campo, valor: x.de, motivo: 'El equipo sigue en ' + final }));
    return { regresa: queda, seQueda: seQueda };
  }

  /** Los renglones que se quitan: `ids` son de la bandeja o de equipos (el inventario manda el del equipo). */
  function renglonesParaQuitar_(ids) {
    const lista = limpiarIds_(ids);
    const filas = LineasDatos.existeTabla(TAB) ? LineasDatos.leerTabla(TAB) : [];
    const porIdBandeja = {};
    filas.forEach((r) => { porIdBandeja[txt(r['ID'])] = r; });
    const abiertos = abiertosPorRegistro_(filas);
    const confirmadas = {};
    filas.forEach((r) => { if (txt(r['CANCELACION']) === FASE.CANCELADA) confirmadas[LineasUtil.digitos(r['NUMERO'])] = true; });
    const ctx = { ix: indices_(), cancelando: cancelacionesEnCurso_(filas), confirmadas: confirmadas };
    return lista.map((id) => {
      const r = porIdBandeja[id] || (ctx.ix.porId[id] ? abiertoDe_(abiertos, ctx.ix.porId[id]) : null);
      const f = r ? ctx.ix.porId[txt(r['REGISTRO_ID'])] || null : null;
      let omitir = '';
      if (!r) omitir = 'No está en Resguardos y cancelaciones';
      else if (txt(r['ESTADO']) === ESTADO.RESGUARDO) omitir = 'Ya lo recibió Pau: lo saca con «Entregar a líneas»';
      else if (txt(r['ESTADO']) !== ESTADO.PENDIENTE) omitir = 'Ya no está por recibir';
      else if (!f) omitir = 'El equipo ya no está en el inventario';
      return { id: id, r: r, f: f, nuco: r ? txt(r['NUCO']) : '', omitir: omitir, ctx: ctx };
    });
  }

  /**
   * La ventana de Quitar del panel: qué regresa y qué se queda de cada equipo. Los secretos (PIN, patrón) solo con
   * verSecretos (ADMIN y el área de Líneas: TelefoniaService.puedeVerSecretos_).
   */
  function vistaQuitar(ids, verSecretos) {
    return {
      filas: renglonesParaQuitar_(ids).map((q) => {
        if (q.omitir) return { id: q.id, nuco: q.nuco, omitir: q.omitir, regresa: [], seQueda: [] };
        return Object.assign({ id: txt(q.r['ID']), nuco: q.nuco, modelo: txt(LineasUtil.col(q.f, 'EQUIPO')), estado: txt(q.r['ESTADO']), omitir: '' },
          paraVentana_(planQuitar_(q.r, q.f, q.ctx), verSecretos));
      }),
    };
  }

  /** Lo que ve la ventana de Quitar del panel o de Retirar cancelación: los secretos sin su valor si no puede verlos. */
  function paraVentana_(p, verSecretos) {
    const oculto = (x, c) => (!verSecretos && SECRETOS.indexOf(LineasDatos.normCol(x.campo)) >= 0 ? Object.assign({}, x, c) : x);
    return {
      regresa: p.regresa.map((x) => oculto(Object.assign({ campo: x.campo, de: x.de, a: x.a }, x.nota ? { nota: x.nota } : {}), { de: x.de ? '••••' : '', a: x.a ? '••••' : '' })),
      seQueda: p.seQueda.map((x) => oculto(x, { valor: x.valor ? '••••' : '' })),
    };
  }

  /** La línea que estaba en Cancelaciones por un envío que se quita: Quitar del panel la libera (exigirSinCancelacion). */
  let liberando_ = '';

  /** datos = { comentario, ticket }. Regresa { hechos: [{ id, nuco }], omitidos, indice }. */
  function quitarDelPanel(ids, datos, usuario) {
    const d = datos || {};
    const comentario = txt(d.comentario);
    if (comentario.length <= 3) throw new Error('Escribe el comentario (queda en el historial del equipo).');
    const hechos = [];
    const omitidos = [];
    const registros = [];
    const borrar = [];
    LineasDatos.conCandado(() => {
      asegurarBandeja_();
      renglonesParaQuitar_(ids).forEach((q) => {
        if (q.omitir) { omitidos.push({ id: q.id, nuco: q.nuco, motivo: q.omitir }); return; }
        const ahora = new Date();
        const p = planQuitar_(q.r, q.f, q.ctx);
        let f = q.f;
        const campos = [];
        const refs = [txt(f['ID'])];
        // La línea que se fue con el envío: sale de Cancelaciones (RETIRADA) o deja CANCELADA, y vuelve al equipo
        const vuelve = p.regresa.filter((x) => x.linea)[0];
        if (vuelve) {
          const L = vuelve.linea;
          if (L.renglon) borrar.push(L.renglon._fila);
          const fl = LineasRepo.leerRegistroObligatorio(L.id, 'la línea');
          const antesLinea = txt(LineasUtil.col(fl, 'ESTATUS LINEA'));
          if (may(antesLinea) !== LINEA_DISPONIBLE) {
            const g = LineasRepo.guardarCambiosRegistro(fl, { 'ESTATUS LINEA': LINEA_DISPONIBLE }, usuario, ahora);
            LineasRepo.registrarMovimiento(L.renglon ? 'RETIRAR_CANCELACION' : 'EDICION', { motivo: comentario, ticket: txt(d.ticket) }, usuario, ahora, {
              refs: [L.id].concat(g.refs || []), nuco: LineasUtil.col(f, 'NUCO'), numero: vuelve.a, antes: { estatus: antesLinea }, despues: { estatus: LINEA_DISPONIBLE },
              detalle: { idsCambios: g.idsCambios, idsReasignacion: [], cambios: g.campos, resguardo: txt(q.r['ID']) },
            });
          }
          liberando_ = L.renglon ? txt(L.renglon['ID']) : '';
          try {
            const g = LineasRepo.guardarCambiosRegistro(f, { 'NUMERO TELEFONO': vuelve.a, 'NUMERO SIM': txt(LineasUtil.col(fl, 'NUMERO SIM')) }, usuario, ahora);
            g.campos.forEach((c) => campos.push(c));
            (g.refs || []).forEach((x) => refs.push(x));
          } finally { liberando_ = ''; }
          f = LineasRepo.leerRegistroObligatorio(txt(f['ID']), 'el equipo');
        }
        const cambios = {};
        p.regresa.filter((x) => !x.linea).forEach((x) => { cambios[x.campo] = x.a; });
        if (Object.keys(cambios).length) {
          const g = LineasRepo.guardarCambiosRegistro(f, cambios, usuario, ahora);
          g.campos.forEach((c) => campos.push(c));
          (g.refs || []).forEach((x) => refs.push(x));
        }
        LineasRepo.registrarMovimiento('QUITAR_PANEL', { motivo: comentario, ticket: txt(d.ticket) }, usuario, ahora, {
          refs: refs, nuco: LineasUtil.col(f, 'NUCO'), numero: LineasUtil.col(f, 'NUMERO TELEFONO'),
          antes: { estatus: txt(LineasUtil.col(q.f, 'ESTATUS EQUIPO')) }, despues: { estatus: txt(cambios['ESTATUS EQUIPO'] || LineasUtil.col(f, 'ESTATUS EQUIPO')) },
          detalle: { idsCambios: [], idsReasignacion: [], cambios: campos, resguardo: txt(q.r['ID']) },
        });
        borrar.push(q.r._fila);
        registros.push(txt(f['ID']));
        if (vuelve) registros.push(vuelve.linea.id);
        hechos.push({ id: txt(q.r['ID']), nuco: q.nuco });
      });
      LineasDatos.eliminarFilas(TAB, borrar); // al final: recorre los números de fila
    });
    return { hechos: hechos, omitidos: omitidos, indice: registros.length ? LineasRepo.refrescarIndice(registros) : null };
  }

  // ---------------- Retirar cancelación (pendientes 3.12 y 3.14) ----------------
  //
  // Solo Pau. El renglón queda RETIRADA (en el historial) y la línea vuelve a como estaba antes de mandarla a cancelar,
  // con la misma lógica de Quitar del panel: regresa lo que nadie tocó y lo que alguien cambió después se queda (usuario,
  // 21-oct). La que se separó al mandar su equipo a resguardo vuelve a ese equipo, con su PIN de WhatsApp, si el equipo no
  // tiene otra línea. Su estatus es el de antes, salvo USO con un equipo que ya no está en USO: queda DISPONIBLE.

  /** Donde la línea puede volver: un equipo en USO o guardado (no vendido ni dado de baja). */
  const VUELVE_A = ['USO', POR_RECIBIR].concat(ESTATUS_EQUIPO_RESGUARDO);

  /**
   * Lo que cambió el envío que mandó la línea a cancelación: { cambios, equipo }. El del resguardo (el renglón viejo que
   * junta los dos, o el del equipo mandado a la misma hora con esa línea) dice también de qué equipo salió; si no hay, el
   * movimiento CANCELACION_LINEA de la línea (Mandar a cancelación, Desvincular). Sin ninguno, cambios vacíos.
   */
  function envioDeCancelacion_(r, filas, ix, fl) {
    const t = r['FECHA'] instanceof Date ? r['FECHA'].getTime() : 0;
    const cerca = (x) => x['FECHA'] instanceof Date && Math.abs(x['FECHA'].getTime() - t) < 120000;
    const n = LineasUtil.digitos(r['NUMERO']);
    const delEquipo = txt(r['ESTADO']) ? r
      : filas.filter((s) => s !== r && txt(s['ESTADO']) && n && LineasUtil.digitos(s['LINEA_AL_MANDAR']) === n && cerca(s))[0];
    const e = delEquipo ? ix.porId[txt(delEquipo['REGISTRO_ID'])] : null;
    if (e) return { cambios: cambiosDelEnvio_(delEquipo, e), equipo: e };
    const MOV = LineasRepo.TAB.MOV;
    const ids = [txt(r['ID_LINEA']), fl ? txt(LineasUtil.col(fl, 'ID LINEA')) : ''].filter(Boolean);
    if (!MOV || !LineasDatos.existeTabla(MOV) || !ids.length) return { cambios: [], equipo: null };
    const nums = LineasDatos.buscarFilasVarios(MOV, 'ID LINEA', ids, true);
    const distancia = (m) => (m['FECHA'] instanceof Date ? Math.abs(m['FECHA'].getTime() - t) : Infinity);
    const m = nums.length ? LineasDatos.leerFilas([{ tabla: MOV, filas: nums }])[0]
      .filter((x) => txt(x['ACCION']) === 'CANCELACION_LINEA' && cerca(x)).sort((a, b) => distancia(a) - distancia(b))[0] : null;
    try { return { cambios: m ? JSON.parse(txt(m['CAMBIOS']) || '[]') : [], equipo: null }; } catch (err) { return { cambios: [], equipo: null }; }
  }

  /**
   * { fl, regresa: [{ campo, de, a, nota?, equipo? }], seQueda: [{ campo, valor, motivo }] } del renglón de cancelación `r`.
   * `equipo` (en NUCO) = ID del equipo al que vuelve la línea; `nota` = por qué el estatus no es el de antes.
   */
  function planRetirar_(r, ctx) {
    const fl = registroDeLinea_(r, ctx.ix);
    if (!fl) return { fl: null, regresa: [], seQueda: [{ campo: 'NUMERO TELEFONO', valor: '', motivo: 'La línea ya no está en el inventario' }] };
    const envio = envioDeCancelacion_(r, ctx.filas, ctx.ix, fl);
    const antes = {};
    envio.cambios.forEach((c) => { const k = LineasDatos.normCol(txt(c.campo)); if (k && !(k in antes)) antes[k] = txt(c.antes); });
    const regresa = [];
    const seQueda = [];
    let equipo = LineasRepo.TIPOS_CON_EQUIPO[may(LineasUtil.col(fl, 'TIPO'))] ? fl : null;
    const nucoDe = (f) => LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO')) || '';
    // La que se separó de su equipo al mandarlo a resguardo vuelve a él
    const e = envio.equipo;
    const numero = LineasUtil.digitos(LineasUtil.col(fl, 'NUMERO TELEFONO'));
    if (!equipo && e && numero && LineasUtil.digitos(antes['NUMERO TELEFONO']) === numero) {
      const otra = txt(LineasUtil.col(e, 'NUMERO TELEFONO'));
      const estatus = may(LineasUtil.col(e, 'ESTATUS EQUIPO'));
      let motivo = '';
      if (otra) motivo = 'El NUCO ' + nucoDe(e) + ' ya tiene la línea ' + otra;
      else if (VUELVE_A.indexOf(estatus) < 0) motivo = 'El NUCO ' + nucoDe(e) + ' está en ' + (estatus || 'otro estatus');
      if (motivo) seQueda.push({ campo: 'NUCO', valor: '', motivo: motivo });
      else {
        regresa.push({ campo: 'NUCO', de: '', a: nucoDe(e), equipo: txt(e['ID']) });
        equipo = e;
        const pin = antes['PIN WHATSAPP'];
        const pinHoy = txt(LineasUtil.col(e, 'PIN WHATSAPP'));
        if (pin && !pinHoy) regresa.push({ campo: 'PIN WHATSAPP', de: '', a: pin });
        else if (pin && !igualTexto_(pin, pinHoy)) seQueda.push({ campo: 'PIN WHATSAPP', valor: pinHoy, motivo: 'Cambió después' });
      }
    }
    const hoy = txt(LineasUtil.col(fl, 'ESTATUS LINEA'));
    if (may(hoy) !== LINEA_CANCELACION) {
      if (hoy) seQueda.push({ campo: 'ESTATUS LINEA', valor: hoy, motivo: 'Cambió después' });
      return { fl: fl, regresa: regresa, seQueda: seQueda };
    }
    const enUso = !!equipo && may(LineasUtil.col(equipo, 'ESTATUS EQUIPO')) === 'USO';
    let a = may(antes['ESTATUS LINEA']);
    // Sin el envío (renglón muy viejo): DISPONIBLE, o USO si sigue en un equipo con persona
    if (!a || a === LINEA_CANCELACION || a === LINEA_SIN_PANEL) a = enUso ? 'USO' : LINEA_DISPONIBLE;
    let nota = '';
    if (a === 'USO' && !enUso) {
      nota = equipo ? 'Antes USO: el NUCO ' + nucoDe(equipo) + ' está en ' + may(LineasUtil.col(equipo, 'ESTATUS EQUIPO')) : 'Antes USO: la línea está sin equipo';
      a = LINEA_DISPONIBLE;
    }
    regresa.push(Object.assign({ campo: 'ESTATUS LINEA', de: hoy, a: a }, nota ? { nota: nota } : {}));
    return { fl: fl, regresa: regresa, seQueda: seQueda };
  }

  /** Los renglones de cancelación que se retiran, con su plan (o por qué no). */
  function renglonesParaRetirar_(ids) {
    const lista = limpiarIds_(ids);
    const filas = LineasDatos.existeTabla(TAB) ? LineasDatos.leerTabla(TAB) : [];
    const porId = {};
    filas.forEach((r) => { porId[txt(r['ID'])] = r; });
    const ctx = { ix: indices_(), filas: filas };
    return lista.map((id) => {
      const r = porId[id];
      const q = { id: id, r: r, nuco: r ? txt(r['NUCO']) : '', numero: r ? txt(r['NUMERO']) : '', omitir: '' };
      const actual = r ? txt(r['CANCELACION']) : '';
      if (!r) q.omitir = 'No existe';
      else if (EN_CURSO.indexOf(actual) < 0) q.omitir = actual ? 'Ya estaba ' + actual.toLowerCase() : 'Su línea no va a cancelación';
      else q.plan = planRetirar_(r, ctx);
      return q;
    });
  }

  /** La ventana de Retirar cancelación: qué regresa y qué se queda de cada línea (secretos como en Quitar del panel). */
  function vistaRetirar(ids, verSecretos) {
    return {
      filas: renglonesParaRetirar_(ids).map((q) => Object.assign({ id: q.id, nuco: q.nuco, numero: q.numero, omitir: q.omitir },
        q.omitir ? { regresa: [], seQueda: [] } : Object.assign({ fase: txt(q.r['CANCELACION']) }, paraVentana_(q.plan, verSecretos)))),
    };
  }

  /** datos = { comentario, ticket }. Regresa { hechos: [{ id, nuco, aviso? }], omitidos, indice }. */
  function retirarCancelacion(ids, datos, usuario) {
    exigirAprobador_(usuario);
    const d = datos || {};
    const comentario = txt(d.comentario);
    if (comentario.length <= 3) throw new Error('Escribe el comentario (queda en el historial de la línea).');
    const hechos = [];
    const omitidos = [];
    const registros = [];
    LineasDatos.conCandado(() => {
      asegurarBandeja_();
      renglonesParaRetirar_(ids).forEach((q) => {
        if (q.omitir) { omitidos.push({ id: q.id, nuco: q.nuco, motivo: q.omitir }); return; }
        const ahora = new Date();
        const p = q.plan;
        LineasDatos.actualizarFila(TAB, q.r._fila, { 'CANCELACION': FASE.RETIRADA, 'RETIRADO_EN': ahora, 'RETIRO': usuario.nombre,
          'RETIRO_MOTIVO': comentario, 'ACTUALIZADO_EN': ahora });
        if (!p.fl) { hechos.push({ id: q.id, nuco: q.nuco, aviso: p.seQueda[0].motivo }); return; }
        const valor = (c) => (p.regresa.filter((x) => x.campo === c)[0] || {}).a;
        const estatus = valor('ESTATUS LINEA');
        const vuelve = p.regresa.filter((x) => x.equipo)[0];
        const campos = [];
        const refs = [txt(p.fl['ID'])];
        const guardar = (f, cambios) => {
          const g = LineasRepo.guardarCambiosRegistro(f, cambios, usuario, ahora);
          g.campos.forEach((c) => campos.push(c));
          (g.refs || []).forEach((x) => refs.push(x));
        };
        if (vuelve) {
          // Suelta queda DISPONIBLE; al ponerla en el equipo toma el estatus que le toca y luego el de antes
          if (may(LineasUtil.col(p.fl, 'ESTATUS LINEA')) !== LINEA_DISPONIBLE) guardar(p.fl, { 'ESTATUS LINEA': LINEA_DISPONIBLE });
          liberando_ = txt(q.r['ID']);
          try {
            guardar(LineasRepo.leerRegistroObligatorio(vuelve.equipo, 'el equipo'),
              { 'NUMERO TELEFONO': txt(LineasUtil.col(p.fl, 'NUMERO TELEFONO')), 'NUMERO SIM': txt(LineasUtil.col(p.fl, 'NUMERO SIM')) });
          } finally { liberando_ = ''; }
          const e = LineasRepo.leerRegistroObligatorio(vuelve.equipo, 'el equipo');
          const resto = {};
          if (valor('PIN WHATSAPP') !== undefined) resto['PIN WHATSAPP'] = valor('PIN WHATSAPP');
          if (estatus !== undefined && may(LineasUtil.col(e, 'ESTATUS LINEA')) !== may(estatus)) resto['ESTATUS LINEA'] = estatus;
          if (Object.keys(resto).length) guardar(e, resto);
          refs.push(vuelve.equipo);
          registros.push(vuelve.equipo);
        } else if (estatus !== undefined) {
          guardar(p.fl, { 'ESTATUS LINEA': estatus });
        }
        LineasRepo.registrarMovimiento('RETIRAR_CANCELACION', { motivo: comentario, ticket: txt(d.ticket) }, usuario, ahora, {
          refs: refs, nuco: vuelve ? vuelve.a : LineasUtil.col(p.fl, 'NUCO') || q.nuco, numero: q.numero,
          antes: { estatus: LINEA_CANCELACION }, despues: { estatus: estatus || txt(LineasUtil.col(p.fl, 'ESTATUS LINEA')) },
          detalle: { idsCambios: [], idsReasignacion: [], cambios: campos, resguardo: txt(q.r['ID']) },
        });
        registros.push(txt(p.fl['ID']));
        hechos.push({ id: q.id, nuco: q.nuco });
      });
    });
    return { hechos: hechos, omitidos: omitidos, indice: registros.length ? LineasRepo.refrescarIndice(registros) : null };
  }

  return {
    formulario, mandar, mandarCancelacion, lineaVencida, registrarCancelacionDirecta, bandeja, recibir, entregar, vendido, donado, desechado, faseCancelacion, confirmarCancelacion,
    retirarCancelacion, vistaRetirar, vistaQuitar, quitarDelPanel, abiertosPorEquipo, enPanel, POR_RECIBIR, cancelacionDe, exigirSinCancelacion, puedeAprobar, asesorPara,
    TAB, ENCABEZADOS, ESTADO, FASE, ESTATUS_EQUIPO_RESGUARDO, ESTATUS_LINEA_RESGUARDO, LINEA_SIN_PANEL, CANCELACION_DIRECTA, CAMPOS_PERSONA, CAMPOS_PERSONA_SI_HAY,
    MOTIVOS_CANCELACION, UBICACION_RESGUARDO, motivoCancelacionDe: motivoCancelacionDe_, cambioMotivo: cambioMotivo_, asegurarBandeja: asegurarBandeja_,
    _cambiosResguardo: cambiosResguardo_, _propuestaLinea: propuestaLinea_, _vigencia: vigencia_, _espejo: espejo_, _planQuitar: planQuitar_,
  };
})();
