/**
 * LineasRegistros.gs
 * Alta y edición de LINEAS TELEFONICAS, réplica de LINEAS TELEFONICAS_Form del AppSheet (v1.001924):
 * orden de campos, display names, listas y su orden, valores iniciales, Show_If, Required_If,
 * Editable_If, Reset_If y Valid_If con sus mensajes. Al final van los campos que agregó el sistema
 * nuevo (COLOR persistente, patrón de 9 puntos y CONTRASEÑA MODEM, que el formulario del AppSheet no tiene).
 *
 * Condiciones (mismo formato que evalúa lineas.html):
 *   'SIEMPRE' | 'NUNCA' | { tipoLleno: true } | { tipoEn: [...] } | { tipoNoEn: [...] } |
 *   { campo, igual } | { lleno: campo } | { nuevo: true } | { y: [cond, ...] }
 * Validaciones (Valid_If; solo se evalúan con valor, como en el AppSheet):
 *   MAYUS · TELEFONO · NUCO · EQUIPO · PIN_WA · PIN_EQ · CUENTA · COMENTARIOS · ACCESORIOS · LISTA
 */
const LineasRegistros = (function () {
  const ZONA = 'America/Mexico_City';
  const NO_APLICA = 'NO APLICA';
  // "TARJETA SD" en lugar de "SD" (usuario, 4-oct); SD y CARGADOR de antes siguen siendo válidos (no se cambian)
  const ACCESORIOS = ['CAJA', 'CABLE', 'CUBO', 'FUNDA', 'MICA', 'TARJETA SD', 'NINGUNO'];
  const ACCESORIOS_VALIDOS = ['CAJA', 'CARGADOR', 'FUNDA', 'MICA', 'CABLE', 'CUBO', 'TARJETA SD', 'SD', 'NINGUNO'];
  /** Ya no se asignan (usuario, 4-oct): los registros que los tienen se quedan así. */
  const TIPOS_HISTORICOS = ['MODEM', 'BANDA ANCHA', 'CAMARA'];
  const TIPOS_DE_LINEA = ['PLAN', 'SIM BASICO'];
  // Agregar línea (usuario, 8-oct): campos que no son columnas (empiezan con «_»: no se escriben en la hoja)
  const VINCULAR = '_VINCULAR';
  const NUCO_VINCULAR = '_NUCO';
  // Editar línea (usuario, 8-oct; pendiente 2.23): por qué cambia el número y «Quitar responsable» de la línea sola
  const CAMBIO_NUMERO = '_CAMBIO_NUMERO';
  const MOTIVO_CAMBIO_NUMERO = 'CAMBIO DE NUMERO';
  const MOTIVOS_NUMERO = [MOTIVO_CAMBIO_NUMERO, 'CORRECCION DE CAPTURA'];
  const QUITAR_RESPONSABLE = '_QUITAR_RESPONSABLE';
  /** Estatus de la línea que en Editar se aceptan solo con el aviso confirmado (no entran a la bandeja de Pau). */
  const ESTATUS_LINEA_PANEL = ['EN PROCESO DE CANCELACION', 'CANCELADA'];
  /** Equipos a los que se les puede vincular una línea: en uso o en resguardo, y sin línea. */
  const ESTATUS_VINCULABLE = ['USO', 'RESGUARDO'];
  const MENSAJES = {
    MAYUS: 'ESCRIBIR EN MAYUSCULAS Y SIN ACENTOS',
    TELEFONO: 'ESTE VALOR DEBE SER UNICO',
    NUCO: 'ESTE CAMPO DEBE SER NUMEROS Y NO SE DEBE REPETIR',
    EQUIPO: 'DEBE ESCRIBIR EN MAYUSCULAS SIN ACENTOS Y EL NOMBRE DEBE ESTAR EN LA LISTA AUTORIZADA',
    PIN_WA: 'INGRESE UN VALOR VALIDO, Y NO MAYOR A 13 CARACTERES',
    PIN_EQ: 'INGRESE UN VALOR VALIDO, Y NO MAYOR A 6 CARACTERES',
    CUENTA: 'INGRESE UN VALOR VALIDO',
    COMENTARIOS: 'ESCRIBE MÁS DE 3 CARACTERES',
    ACCESORIOS: 'SELECCIONA UN VALOR PERMITIDO',
    LISTA: 'VALOR NO ENCONTRADO EN LA LISTA',
  };

  function texto_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

  // ---------------- Condiciones ----------------

  function cumple_(cond, valores, ctx) {
    if (cond === 'SIEMPRE' || cond === undefined || cond === null) return true;
    if (cond === 'NUNCA') return false;
    const tipo = texto_(valores['TIPO']).toUpperCase();
    if (cond.y) return cond.y.every((c) => cumple_(c, valores, ctx));
    if (cond.tipoLleno) return !!tipo;
    if (cond.tipoEn) return cond.tipoEn.indexOf(tipo) >= 0;
    if (cond.tipoNoEn) return cond.tipoNoEn.indexOf(tipo) < 0;
    if (cond.nuevo) return !!ctx.nuevo;
    if (cond.campo && cond.distinto !== undefined) return texto_(valores[cond.campo]).toUpperCase() !== String(cond.distinto).toUpperCase();
    if (cond.campo) return texto_(valores[cond.campo]).toUpperCase() === String(cond.igual).toUpperCase();
    if (cond.lleno) return !!texto_(valores[cond.lleno]);
    if (cond.cuantos) return cuantosCumple_(cond, valores[cond.cuantos]);
    // { cambio: COLUMNA }: el valor ya no es el que tenía el registro (ctx.base)
    if (cond.cambio) return texto_(valores[cond.cambio]) !== texto_(((ctx && ctx.base) || {})[cond.cambio]);
    return true;
  }
  /** { cuantos: COLUMNA, alMenos: n } o { cuantos: COLUMNA, menos: n }: compara el número que guarda COLUMNA. */
  function cuantosCumple_(cond, valor) {
    const k = Number(texto_(valor)) || 0;
    return cond.alMenos !== undefined ? k >= cond.alMenos : k < cond.menos;
  }

  /**
   * Responsables adicionales (usuario, 6-oct): reemplazan «¿El responsable usa el equipo?» y «Quien lo usa». Hasta cuatro
   * más (como el AppSheet: segundo…quinto), cada uno con su número de empleado y su nombre de Capital Humano, en su propio
   * bloque («RESPONSABLE 2», con «Quitar») y un botón «Agregar responsable» al final. Cuántos hay lo lleva
   * RESPONSABLES ADICIONALES (no se guarda): los bloques de más se borran al guardar.
   */
  const ORDEN_ADICIONALES = ['SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO'];
  const CUENTA_ADICIONALES = 'RESPONSABLES ADICIONALES';
  function cuantosAdicionales(valorDe) {
    let k = 0;
    ORDEN_ADICIONALES.forEach((n, i) => { if (texto_(valorDe('NOMBRE ' + n + ' RESPONSABLE')) || texto_(valorDe('NO EMPLEADO ' + n + ' RESPONSABLE'))) k = i + 1; });
    return k;
  }
  function camposAdicionales(campo, valorDe) {
    const k = cuantosAdicionales(valorDe);
    const titulo = (i) => ({ tipo: 'titulo', texto: 'RESPONSABLE ' + (i + 2), icono: 'user-plus', quitarAdicional: i });
    return ORDEN_ADICIONALES.reduce((a, n, i) => {
      const mostrar = { cuantos: CUENTA_ADICIONALES, alMenos: i + 1 };
      const reset = { cuando: { cuantos: CUENTA_ADICIONALES, menos: i + 1 }, valor: '' };
      const num = 'NO EMPLEADO ' + n + ' RESPONSABLE';
      const nom = 'NOMBRE ' + n + ' RESPONSABLE';
      return a.concat([
        titulo(i),
        campo(num, 'No. de empleado', 'listaAbierta', { valor: valorDe(num), mostrar: mostrar, sugerencias: 'NO_EMPLEADO', autollenar: { [nom]: 'nombre' }, reset: reset }),
        campo(nom, 'Nombre', 'listaAbierta', { valor: valorDe(nom), mostrar: mostrar, sugerencias: 'PERSONAS', autollenar: { [num]: 'noEmpleado' }, reset: reset }),
      ]);
    }, []).concat([
      // Sección sin título: el botón queda debajo del último responsable
      { tipo: 'titulo', texto: '', sinTexto: true },
      campo(CUENTA_ADICIONALES, 'Agregar responsable', 'adicionales', { valor: String(k), mostrar: { cuantos: CUENTA_ADICIONALES, menos: ORDEN_ADICIONALES.length } }),
    ]);
  }

  const campo_ = (columna, etiqueta, control, extra) => Object.assign({
    tipo: 'campo', columna: columna, etiqueta: etiqueta, control: control, requerido: 'NUNCA', mostrar: 'SIEMPRE', editable: 'SIEMPRE', soloLectura: false,
  }, extra || {});

  /** Coordinación del usuario en USUARIOS (AppSheet la usa en Valid_If de SEDE, EQUIPO…). Caché 1 h. */
  function coordinacion_(correo) {
    const clave = 'ln_coord_' + String(correo || '').toLowerCase();
    const cache = CacheService.getScriptCache();
    const guardada = cache.get(clave);
    if (guardada !== null) return guardada;
    let valor = '';
    try {
      const hoja = SpreadsheetApp.openById(Config.SPREADSHEET_IDS.USUARIOS()).getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();
      const h = datos[0].map((x) => String(x).trim().toUpperCase());
      const iCorreo = h.indexOf('CORREO');
      const iCoord = h.indexOf('COORDINACION');
      const fila = datos.slice(1).filter((f) => String(f[iCorreo]).trim().toLowerCase() === String(correo || '').toLowerCase())[0];
      valor = fila && iCoord >= 0 ? String(fila[iCoord] || '').trim().toUpperCase() : '';
    } catch (e) { console.warn('coordinacion_: ' + e.message); }
    cache.put(clave, valor, 3600);
    return valor;
  }

  // ---------------- Definición del formulario (LINEAS TELEFONICAS_Form) ----------------

  /**
   * `base`: valores actuales de la fila (edición) o valores iniciales (alta). `usuario` trae correo y nombre.
   * Las listas de SEDE / OFICINA / DEPARTAMENTO / AREA / JEFE / DIRECTOR traen los valores de Capital Humano.
   */
  function elementos_(base, catalogos, usuario, ctx) {
    const coord = coordinacion_(usuario.correo);
    const excepcionEquipo = coord === 'AUDITORIAS Y CALIDAD' || String(usuario.correo || '').toLowerCase() === 'auxiliartelefonia1.ci@ciudadmaderas.com';
    const v = (c) => (base[c] === undefined || base[c] === null ? '' : base[c]);
    const enBlanco = (c) => (((LineasRepo.ESTATUS_EN_BLANCO || {})[c] || []).indexOf(String(v(c)).trim().toUpperCase()) >= 0 ? '' : v(c));
    // Datos del responsable: lista con los valores de Capital Humano (COLABORADORES); lo que no esté se agrega
    // eligiendo "Agregar 'x'" y se queda solo en este registro (PLAN_REESTRUCTURA_LINEAS.md §3.6)
    const listaCH = (columna, etiqueta, opciones) => campo_(columna, etiqueta, 'listaAbierta', { valor: v(columna), opciones: opciones });
    // Al elegir a la persona se llenan sus datos con lo que dice CH (el correo empresarial va a CUENTA GOOGLE)
    const datosCH = { 'PUESTO': 'puesto', 'DEPARTAMENTO': 'departamento', 'AREA': 'area', 'SEDE': 'sede', 'OFICINA / DESARROLLO': 'oficina',
      'JEFE DIRECTO': 'jefe', 'DIRECTOR': 'director', 'CUENTA GOOGLE': 'correo' };
    const puestos = catalogos.puestos || [];
    const nuevo = !!(ctx && ctx.nuevo);
    // Editar y Agregar (usuario, 4-oct): todo lo guardado se edita, en pestañas; FOLIO, NUCO y TIPO no. El registro es un
    // EQUIPO (con o sin línea) o una LINEA sola: en el alta lo dice el botón (Agregar equipo / Agregar línea) y en la
    // edición, lo que ya es. El TIPO se asigna solo con eso y con la línea (tipoAutomatico); MODEM, BANDA ANCHA y CAMARA
    // se quedan como están (histórico), ya no se asignan.
    const tipoActual = texto_(v('TIPO')).toUpperCase();
    const parte = parteDe_(ctx, tipoActual);
    const conEquipo = parte === 'EQUIPO';
    const historico = TIPOS_HISTORICOS.indexOf(tipoActual) >= 0;
    const tieneLinea = !nuevo && !!(LineasUtil.txt(v('NUMERO TELEFONO')) || LineasUtil.txt(v('NUMERO SIM')));
    // Editar línea y Editar equipo por separado (usuario, 8-oct): la línea de un NUCO se edita sola (su responsable es el
    // del equipo: se ve, no se cambia) y el equipo con línea se edita sin la línea ni el adendum
    const lineaEnEquipo = !!(ctx && ctx.lineaEnEquipo);
    const equipoConLinea = conEquipo && tieneLinea;
    const lineaSola = !nuevo && !conEquipo && !lineaEnEquipo;
    // Sin la línea en el formulario, el TIPO no se puede calcular en pantalla: se muestra el que tiene
    const tipoFijo = historico || lineaEnEquipo || equipoConLinea;
    const fijo = (columna, etiqueta, valor, extra) => campo_(columna, etiqueta, 'calculado', Object.assign({ valor: valor, soloLectura: true, fijo: true }, extra || {}));
    const ed = (columna, etiqueta, control, extra) => campo_(columna, etiqueta, control, Object.assign({ valor: v(columna) }, extra || {}));
    const titulo = (texto, icono) => ({ tipo: 'titulo', texto: texto, icono: icono });
    // Una línea sola no tiene NUCO (si trae uno viejo, para sus documentos, se muestra)
    const identificacion = [
      fijo('FOLIO', 'Folio', v('FOLIO'), { formula: 'FOLIO' }),
      conEquipo && nuevo ? ed('NUCO', 'NUCO', 'numero', { valor: '', requerido: 'SIEMPRE', valida: 'NUCO' })
        : (conEquipo || LineasUtil.nucoVisible(v('NUCO')) ? fijo('NUCO', 'NUCO', LineasUtil.nucoVisible(v('NUCO')) || '') : null),
      fijo('TIPO', 'Tipo', tipoFijo ? tipoActual : (nuevo ? '' : tipoActual), tipoFijo ? {} : { formula: 'TIPO_' + parte }),
      lineaEnEquipo ? fijo('_RESPONSABLE_EQUIPO', 'Responsable (del equipo)', v('RESPONSABLE') || '—') : null,
    ].filter(Boolean);
    const equipo = !conEquipo ? [] : [
      titulo('EQUIPO', 'smartphone'),
    ].concat(identificacion, [
      ed('EQUIPO', 'Modelo', 'listaAbierta', { opciones: catalogos.modelos || [], valida: excepcionEquipo ? null : 'EQUIPO', requerido: 'SIEMPRE' }),
      ed('IMEI', 'IMEI', 'texto'),
      ed('COLOR', 'Color', 'listaAbierta', { opciones: catalogos.colores || [] }),
      // Los estatus se cambian aquí (sin «Cambiar estatus», usuario 4-oct). RESGUARDO, PARA VENTA y PARA DESECHO, con un
      // aviso confirmado: no entran al panel de Pau, solo al historial (usuario, 8-oct; ver editar)
      ed('ESTATUS EQUIPO', 'Estatus del equipo', 'lista', { valor: enBlanco('ESTATUS EQUIPO'), opciones: LineasRepo.CATALOGO.estatusEquipo,
        requerido: 'SIEMPRE', valida: 'LISTA', validaSiCambia: true }),
    ], nuevo ? [] : [fijo('FECHA REGISTRO', 'Fecha de alta', v('FECHA REGISTRO'))]);
    const responsable = [
      titulo('RESPONSABLE', 'user'),
      ed('NO EMPLEADO', 'No. de empleado', 'listaAbierta', { valida: 'MAYUS', sugerencias: 'NO_EMPLEADO', autollenar: Object.assign({ 'RESPONSABLE': 'nombre' }, datosCH) }),
      ed('RESPONSABLE', 'Nombre', 'listaAbierta', { valida: 'MAYUS', sugerencias: 'PERSONAS', autollenar: Object.assign({ 'NO EMPLEADO': 'noEmpleado' }, datosCH) }),
      ed('PUESTO', 'Puesto', 'listaAbierta', { valida: 'MAYUS', opciones: puestos, sugerencias: 'PUESTOS' }),
      listaCH('DEPARTAMENTO', 'Departamento', catalogos.departamentos || []),
      listaCH('AREA', 'Área', catalogos.areas || []),
      listaCH('SEDE', 'Sede', catalogos.sedes || []),
      listaCH('OFICINA / DESARROLLO', 'Oficina o desarrollo', catalogos.oficinas || []),
      listaCH('JEFE DIRECTO', 'Jefe directo', catalogos.jefes || []),
      listaCH('DIRECTOR', 'Director', catalogos.directores || []),
      ed('CUENTA GOOGLE', 'Correo', 'texto', { literal: true }),
    ].concat(camposAdicionales((columna, etiqueta, control, extra) => campo_(columna, etiqueta, control, extra), v));
    // Agregar línea (usuario, 8-oct): primero se pregunta si va en un equipo. Sí → se elige un NUCO sin línea y el
    // responsable es el del equipo (no se captura); no → el responsable se escribe a mano y es opcional
    const altaLinea = nuevo && !conEquipo;
    if (altaLinea) {
      const sinEquipo = { campo: VINCULAR, igual: 'FALSE' };
      const conNuco = { campo: VINCULAR, igual: 'TRUE' };
      responsable.forEach((e) => {
        if (e.tipo !== 'campo') return;
        e.mostrar = e.mostrar === 'SIEMPRE' ? sinEquipo : { y: [sinEquipo, e.mostrar] };
      });
      responsable.splice(1, 0,
        campo_(VINCULAR, '¿Se vincula a un equipo?', 'siNo', { valor: 'FALSE', requerido: 'SIEMPRE' }),
        campo_(NUCO_VINCULAR, 'NUCO', 'listaAbierta', { valor: '', opciones: (ctx && ctx.equiposSinLinea) || [], soloLista: true,
          sugerencias: 'EQUIPOS_SIN_LINEA', mostrar: conNuco, requerido: conNuco, mensaje: 'ELIGE UN NUCO SIN LÍNEA' }),
        campo_('_RESPONSABLE_EQUIPO', 'Responsable', 'calculado', { valor: '', soloLectura: true, formula: 'RESPONSABLE_EQUIPO', mostrar: conNuco }));
    }
    // Línea sola con responsable (usuario, 8-oct): «Quitar responsable» la deja DISPONIBLE (ver editar)
    if (lineaSola && texto_(v('RESPONSABLE'))) {
      const conPersona = { campo: QUITAR_RESPONSABLE, igual: 'FALSE' };
      responsable.forEach((e) => {
        if (e.tipo !== 'campo') return;
        e.mostrar = e.mostrar === 'SIEMPRE' ? conPersona : { y: [conPersona, e.mostrar] };
      });
      responsable.splice(1, 0, campo_(QUITAR_RESPONSABLE, 'Quitar responsable', 'siNo', { valor: 'FALSE' }));
    }
    // Línea: obligatoria en una línea sola; opcional en un equipo. A un equipo sin línea se le puede poner una: un número
    // nuevo o una línea sola que ya existe (se elige de la lista y se llenan sus datos)
    // La línea de un equipo, como en el formulario del equipo: sin obligatorios (hay registros viejos sin compañía)
    const lineaReq = conEquipo || lineaEnEquipo ? 'NUNCA' : 'SIEMPRE';
    const enlazar = conEquipo && !nuevo && !tieneLinea;
    const tiposLinea = TIPOS_DE_LINEA.concat(TIPOS_DE_LINEA.indexOf(texto_(v('TIPO DE LINEA')).toUpperCase()) < 0 && texto_(v('TIPO DE LINEA')) ? [texto_(v('TIPO DE LINEA')).toUpperCase()] : []);
    const linea = [
      titulo('LÍNEA', 'card-sim'),
    ].concat(conEquipo ? [] : identificacion, [
      enlazar
        ? ed('NUMERO TELEFONO', 'Número', 'listaAbierta', { valida: 'TELEFONO', literal: true, sugerencias: 'NUMEROS',
          autollenar: { 'NUMERO SIM': 'sim', 'COMPAÑIA': 'compania', 'RAZON SOCIAL': 'razonSocial' } })
        : ed('NUMERO TELEFONO', 'Número', 'texto', { valida: 'TELEFONO', literal: true, requerido: lineaReq }),
    ], !nuevo && !conEquipo && texto_(v('NUMERO TELEFONO')) ? [
      // Al cambiar el número se dice si la línea ahora tiene otro (va a «Números de esta línea») o si estaba mal capturado
      campo_(CAMBIO_NUMERO, 'Motivo del cambio de número', 'lista', { valor: '', opciones: MOTIVOS_NUMERO,
        mostrar: { cambio: 'NUMERO TELEFONO' }, requerido: { cambio: 'NUMERO TELEFONO' } }),
    ] : [], [
      ed('NUMERO SIM', 'SIM', 'texto', { literal: true }),
      ed('TIPO DE LINEA', 'Tipo de línea', 'lista', { valor: v('TIPO DE LINEA') || (nuevo ? 'PLAN' : ''), opciones: tiposLinea }),
      ed('COMPAÑIA', 'Compañía', 'listaAbierta', { opciones: ['TELCEL', 'AT&T', 'BAIT'], valida: 'MAYUS', requerido: lineaReq }),
      // La razón social es de la línea (la del contrato), no del responsable (§3.3)
      ed('RAZON SOCIAL', 'Razón social', 'lista', { opciones: catalogos.razonesSociales || [], valida: 'LISTA', validaSiCambia: true }),
    ], altaLinea ? [
      // Estatus solo (usuario, 8-oct): USO con equipo en uso o con responsable; DISPONIBLE si no. La cancelación ya no se
      // elige en el alta: se hace en Editar o con «Mandar a cancelación». El servidor hace la misma cuenta (estatusAltaLinea_)
      campo_('ESTATUS LINEA', 'Estatus de la línea', 'calculado', { valor: '', soloLectura: true, formula: 'ESTATUS_LINEA_ALTA' }),
    ] : [
      // La línea de un equipo sigue al equipo (USO o DISPONIBLE); aquí solo se manda a cancelación o se cancela
      ed('ESTATUS LINEA', 'Estatus de la línea', 'lista', { valor: enBlanco('ESTATUS LINEA'),
        opciones: lineaEnEquipo ? [enBlanco('ESTATUS LINEA')].concat(ESTATUS_LINEA_PANEL).filter((x, i, a) => x && a.indexOf(x) === i)
          : LineasRepo.CATALOGO.estatusLinea,
        requerido: lineaReq, valida: 'LISTA', validaSiCambia: true }),
    ]);
    // INICIO y FIN del adendum: solo al dar de alta la línea (pedido del área, 29-sep; confirmado por el usuario el 4-oct)
    const fechas = nuevo || !tieneLinea ? 'SIEMPRE' : 'NUNCA';
    // En el alta no se muestra con SIM BASICO: no tiene adendum y no se le pide (usuario, 8-oct; plan §4.3)
    const conPlan = { campo: 'TIPO DE LINEA', distinto: 'SIM BASICO' };
    // Al editar también se esconde con SIM BASICO, salvo que ya tenga datos de adendum (no se ocultan ni se borran)
    const conAdendum = ['COSTO PLAN', 'INICIO PLAN', 'FIN PLAN'].some((c) => texto_(v(c)));
    const soloPlan = nuevo ? { mostrar: conPlan, reset: { cuando: { campo: 'TIPO DE LINEA', igual: 'SIM BASICO' }, valor: '' } }
      : (conAdendum ? {} : { mostrar: conPlan });
    const adendum = [
      titulo('ADENDUM', 'file-text'),
      ed('COSTO PLAN', 'Costo del plan', 'numero', soloPlan),
      ed('INICIO PLAN', 'Inicio', 'fecha', Object.assign({ editable: fechas, requerido: altaLinea ? conPlan : 'NUNCA' }, soloPlan)),
      ed('FIN PLAN', 'Fin', 'fecha', Object.assign({ editable: fechas, requerido: altaLinea ? conPlan : 'NUNCA' }, soloPlan)),
    ];
    // PIN de WhatsApp: del equipo, no de la línea sola (usuario, 8-oct; pendiente 2.25)
    const accesos = [
      titulo(conEquipo ? 'ACCESORIOS Y ACCESOS' : 'ACCESOS', 'key-round'),
    ].concat(conEquipo ? [
      ed('ACCESORIOS', 'Accesorios', 'multi', { opciones: ACCESORIOS, valida: 'ACCESORIOS' }),
      // Sin línea no hay PIN de WhatsApp: en el alta y en un equipo sin línea aparece al escribir el número
      ed('PIN WHATSAPP', 'PIN de WhatsApp', 'texto', { valida: 'PIN_WA', literal: true, secreto: true,
        mostrar: equipoConLinea ? 'SIEMPRE' : { lleno: 'NUMERO TELEFONO' } }),
    ] : [], conEquipo ? [
      ed('PIN EQUIPO', 'PIN EQUIPO', 'texto', { valida: 'PIN_EQ', literal: true, secreto: true }),
      ed('PATRON', 'Patrón', 'patron', { secreto: true }),
    ] : [], ['MODEM', 'BANDA ANCHA'].indexOf(tipoActual) >= 0 ? [
      ed('CONTRASEÑA MODEM', 'Contraseña del módem', 'texto', { literal: true, secreto: true }),
    ] : []);
    const conAccesos = accesos.length > 1 ? accesos : [];
    if (lineaEnEquipo) return linea.concat(adendum);
    if (equipoConLinea) return equipo.concat(responsable, conAccesos); // su línea, con «Editar línea»
    return conEquipo ? equipo.concat(responsable, linea, adendum, conAccesos) : linea.concat(responsable, adendum, conAccesos);
  }

  /**
   * Equipos sin línea (o con su línea CANCELADA) en USO o RESGUARDO: los que se pueden elegir en «¿Se vincula a un
   * equipo?». Regresa [{ id, nuco, fila }].
   */
  function equiposSinLinea_(filas) {
    return (filas || LineasDatos.leerTabla(LineasRepo.TAB.LINEAS)).filter((f) => {
      if (!LineasRepo.TIPOS_CON_EQUIPO[texto_(LineasUtil.col(f, 'TIPO')).toUpperCase()]) return false;
      if (!LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO'))) return false;
      if (ESTATUS_VINCULABLE.indexOf(texto_(LineasUtil.col(f, 'ESTATUS EQUIPO')).toUpperCase()) < 0) return false;
      const conLinea = !!(LineasUtil.txt(LineasUtil.col(f, 'NUMERO TELEFONO')) || LineasUtil.txt(LineasUtil.col(f, 'NUMERO SIM')));
      return !conLinea || texto_(LineasUtil.col(f, 'ESTATUS LINEA')).toUpperCase() === 'CANCELADA';
    }).map((f) => ({ id: texto_(f['ID']), nuco: LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO')), fila: f }));
  }

  /**
   * Estatus de una línea nueva (usuario, 8-oct): con equipo, la del equipo (USO si está en uso; DISPONIBLE si está
   * guardado: opción A); sola, USO con responsable y DISPONIBLE sin él. La pantalla hace la misma cuenta
   * (formulaRegistro, ESTATUS_LINEA_ALTA).
   */
  function estatusAltaLinea_(valores, equipo) {
    if (equipo) return texto_(LineasUtil.col(equipo, 'ESTATUS EQUIPO')).toUpperCase() === 'USO' ? 'USO' : 'DISPONIBLE';
    return texto_(valores['RESPONSABLE']) ? 'USO' : 'DISPONIBLE';
  }

  /** EQUIPO o LINEA: lo que dice el botón en el alta o lo que ya es el registro. */
  function parteDe_(ctx, tipoActual) {
    if (ctx && ctx.parte) return String(ctx.parte).toUpperCase() === 'LINEA' ? 'LINEA' : 'EQUIPO';
    return LineasRepo.TIPOS_CON_EQUIPO[String(tipoActual || '').toUpperCase()] ? 'EQUIPO' : 'LINEA';
  }

  /**
   * TIPO asignado solo (usuario, 4-oct): un equipo sin línea es EQUIPO; con línea, EQUIPO + SIM, o EQUIPO + SIM BASICO si
   * la línea es básica; una línea sola, LINEA o LINEA BASICA. Una línea CANCELADA ya no cuenta. MODEM, BANDA ANCHA y
   * CAMARA se quedan (histórico). La pantalla hace la misma cuenta (tipoAutomatico) para mostrarlo en vivo.
   */
  function tipoAutomatico_(parte, valores, tipoActual) {
    const actual = String(tipoActual || '').toUpperCase();
    if (TIPOS_HISTORICOS.indexOf(actual) >= 0) return actual;
    const conLinea = !!(LineasUtil.txt(valores['NUMERO TELEFONO']) || LineasUtil.txt(valores['NUMERO SIM'])) &&
      texto_(valores['ESTATUS LINEA']).toUpperCase() !== 'CANCELADA';
    const basica = texto_(valores['TIPO DE LINEA']).toUpperCase() === 'SIM BASICO';
    if (parte === 'EQUIPO') return !conLinea ? 'EQUIPO' : (basica ? 'EQUIPO + SIM BASICO' : 'EQUIPO + SIM');
    return basica ? 'LINEA BASICA' : 'LINEA';
  }

  /** Valores de la fila como texto/fecha ISO local para el formulario. */
  function baseDeFila_(fila) {
    const base = {};
    Object.keys(fila || {}).forEach((k) => {
      if (k === '_fila') return;
      const v = fila[k];
      base[k] = v instanceof Date
        ? (/INICIO PLAN|FIN PLAN|FECHA INSPECCION/.test(k) ? Utilities.formatDate(v, ZONA, 'yyyy-MM-dd') : Utilities.formatDate(v, ZONA, 'dd/MM/yyyy HH:mm'))
        : (v === null || v === undefined ? '' : String(v));
    });
    return base;
  }

  /** Valores iniciales de un alta (Initial value del AppSheet, que dependen de TIPO: se aplican al guardar). */
  function baseNueva_() {
    return { 'FECHA REGISTRO': Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy HH:mm') };
  }

  function ocultarSecretos_(elementos, puedeVerSecretos) {
    if (puedeVerSecretos) return elementos;
    return elementos.map((e) => (e.secreto && e.valor ? Object.assign({}, e, { valor: '', valorOculto: true }) : e));
  }

  /**
   * Contexto de una edición: `parte` 'LINEA' edita solo la línea del registro (Editar línea, 8-oct); si no, lo que es el
   * registro (equipo o línea sola). lineaEnEquipo: la línea está en un NUCO.
   */
  function contextoEdicion_(base, parte) {
    const conLinea = !!(LineasUtil.txt(base['NUMERO TELEFONO']) || LineasUtil.txt(base['NUMERO SIM']));
    const deEquipo = !!LineasRepo.TIPOS_CON_EQUIPO[texto_(base['TIPO']).toUpperCase()];
    const soloLinea = String(parte || '').toUpperCase() === 'LINEA' && conLinea;
    return { nuevo: false, parte: soloLinea ? 'LINEA' : null, lineaEnEquipo: soloLinea && deEquipo, base: base };
  }

  /** Formulario para el cliente: alta (id vacío) o edición. */
  function formulario(id, usuario, puedeVerSecretos, parte) {
    const fila = id ? LineasRepo.leerRegistroObligatorio(id, 'el registro') : null;
    const base = fila ? baseDeFila_(fila) : baseNueva_();
    const ctx = fila ? contextoEdicion_(base, parte) : { nuevo: true, parte: parte };
    // Agregar línea: los NUCO a los que se le puede vincular (se leen solo aquí; al guardar se revisan otra vez)
    if (!fila && parteDe_(ctx, '') === 'LINEA') ctx.equiposSinLinea = equiposSinLinea_().map((x) => x.nuco);
    // idDG: el ID con el que ESTATUS GENERAL reconoce al personal de DG (DG001…); tras migrar quedó en ID APPSHEET
    const idDG = fila ? LineasDatos.idsDeFila(fila).filter((k) => /^DG/i.test(k))[0] || null : null;
    const tipo = texto_(base['TIPO']).toUpperCase();
    return { nuevo: ctx.nuevo, idDG: idDG, parte: parteDe_(ctx, tipo), tipo: tipo, historico: TIPOS_HISTORICOS.indexOf(tipo) >= 0 || !!ctx.lineaEnEquipo ||
      (!ctx.nuevo && !ctx.parte && !!LineasRepo.TIPOS_CON_EQUIPO[tipo] && !!(LineasUtil.txt(base['NUMERO TELEFONO']) || LineasUtil.txt(base['NUMERO SIM']))), estatusLinea: texto_(base['ESTATUS LINEA']).toUpperCase(),
      elementos: ocultarSecretos_(elementos_(base, LineasRepo.catalogos(), usuario, ctx), puedeVerSecretos) };
  }

  // ---------------- Valid_If ----------------

  const mayusSinAcentos_ = (v) => v === v.toUpperCase() && !/[ÁÉÍÓÚ]/.test(v);

  function valida_(codigo, valor, valores, e, ctx) {
    switch (codigo) {
      case 'MAYUS': return mayusSinAcentos_(valor);
      case 'NUCO': return /^\d+$/.test(valor) && !ctx.nucoRepetido(valor);
      // Sin TIPO que elegir (se asigna solo, 4-oct): lo vacío o "NO APLICA" ya no se pide por TIPO; se guarda en blanco
      case 'TELEFONO': return valor === NO_APLICA || !ctx.telefonoRepetido(valor);
      case 'EQUIPO': return valor !== NO_APLICA;
      case 'PIN_WA': return valor === NO_APLICA || valor.length <= 13;
      case 'PIN_EQ': return valor === NO_APLICA || valor.length <= 6;
      case 'CUENTA': return true;
      case 'COMENTARIOS': return valor.length > 3;
      case 'ACCESORIOS': return valor.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean).every((x) => ACCESORIOS_VALIDOS.indexOf(x) >= 0);
      case 'LISTA': return (e.opciones || []).map((o) => String(o).toUpperCase()).indexOf(valor.toUpperCase()) >= 0;
      default: return true;
    }
  }

  /**
   * Aplica Editable_If, Reset_If e Initial value y valida como el AppSheet.
   * Regresa { valores (por columna), errores }.
   */
  function resolver_(elementos, base, enviados, ctx) {
    const valores = Object.assign({}, base);
    // 1) TIPO primero (casi todo depende de él); luego el resto en orden del formulario
    const orden = elementos.filter((e) => e.tipo === 'campo');
    const tomar = (e) => {
      if (e.soloLectura || e.control === 'calculado') return;
      if (e.valorOculto && !texto_(enviados[e.columna])) return; // secreto sin permiso: se conserva
      if (!cumple_(e.editable, valores, ctx)) return;
      if (Object.prototype.hasOwnProperty.call(enviados, e.columna)) valores[e.columna] = texto_(enviados[e.columna]);
    };
    const campoTipo = orden.filter((e) => e.columna === 'TIPO')[0];
    if (campoTipo) tomar(campoTipo); // las acciones masivas no traen TIPO
    const tipo = texto_(valores['TIPO']).toUpperCase();
    orden.forEach((e) => { if (e.columna !== 'TIPO') tomar(e); });
    // 2) Reset_If
    const tipoCambio = ctx.nuevo || texto_(base['TIPO']).toUpperCase() !== tipo;
    orden.forEach((e) => {
      if (!e.reset || !cumple_(e.reset.cuando, valores, ctx)) return;
      if (e.reset.soloCambioTipo && !tipoCambio) return;
      valores[e.columna] = e.reset.copiar ? texto_(valores[e.reset.copiar]) : e.reset.valor;
    });
    // 3) Obligatorios visibles y Valid_If (solo con valor)
    const errores = [];
    orden.forEach((e) => {
      if (e.soloLectura || e.control === 'calculado' || e.valorOculto) return;
      if (!cumple_(e.mostrar, valores, ctx)) return;
      const valor = texto_(valores[e.columna]);
      if (!valor) { if (cumple_(e.requerido, valores, ctx)) errores.push(e.etiqueta + ' es obligatorio'); return; }
      if (e.control === 'lista' && !e.valida && e.opciones && e.opciones.map((o) => String(o).toUpperCase()).indexOf(valor.toUpperCase()) < 0) {
        errores.push(e.etiqueta + ': ' + MENSAJES.LISTA);
        return;
      }
      // Un valor viejo que no se tocó no se vuelve a validar (p. ej. un estatus de antes del 30-sep en una edición)
      if (e.validaSiCambia && valor.toUpperCase() === texto_(base[e.columna]).toUpperCase()) return;
      if (e.valida && !valida_(e.valida, valor, valores, e, ctx)) errores.push(e.etiqueta + ': ' + MENSAJES[e.valida]);
    });
    return { valores: valores, errores: errores };
  }

  // ---------------- Guardar ----------------

  /**
   * COLOR es una columna real del sistema nuevo (en AppSheet es virtual): se crea si falta. Con las hojas nuevas
   * (reestructura) LINEAS TELEFONICAS ya no se toca.
   */
  function asegurarEsquema_() {
    if (LineasLectura.activo()) return;
    const tabla = LineasDatos.tablaFresca(LineasRepo.TAB.LINEAS);
    if (LineasDatos.colIndice(tabla, 'COLOR') < 0) LineasDatos.asegurarPestana(LineasRepo.TAB.LINEAS, ['COLOR']);
  }

  /** Columnas que se escriben en la hoja (las del formulario, sin las calculadas). */
  function columnasEscribibles_(elementos) {
    return elementos.filter((e) => e.tipo === 'campo' && e.control !== 'calculado' && e.control !== 'adicionales' && !e.soloLectura &&
      e.columna.charAt(0) !== '_').map((e) => e.columna);
  }

  function contextoValidacion_(id, nuevo, permitirLineaSola) {
    const filas = LineasDatos.leerTabla(LineasRepo.TAB.LINEAS);
    const otros = filas.filter((f) => texto_(f['ID']) !== texto_(id));
    const esLineaSola = (f) => !LineasRepo.TIPOS_CON_EQUIPO[texto_(LineasUtil.col(f, 'TIPO')).toUpperCase()];
    return {
      nuevo: nuevo,
      nucoRepetido: (nuco) => otros.some((f) => texto_(LineasUtil.col(f, 'NUCO')).replace(/^0+/, '') === String(nuco).replace(/^0+/, '')),
      // Una línea CANCELADA no aparta su número (en la hoja vieja se borraba al cancelar; en las nuevas lo conserva). Al
      // ponerle línea a un equipo, una línea sola con ese número no cuenta: es la que se le pone
      telefonoRepetido: (num) => otros.some((f) => texto_(LineasUtil.col(f, 'NUMERO TELEFONO')) === num &&
        texto_(LineasUtil.col(f, 'ESTATUS LINEA')).toUpperCase() !== 'CANCELADA' && !(permitirLineaSola && esLineaSola(f))),
    };
  }

  /** Convierte a los tipos de la hoja (Date, número) los valores del formulario. */
  function aHoja_(elementos, valores) {
    const salida = {};
    columnasEscribibles_(elementos).forEach((c) => {
      const e = elementos.filter((x) => x.columna === c)[0];
      let v = valores[c] === undefined ? '' : valores[c];
      if (e.control === 'fecha' && v) { const d = new Date(v + 'T12:00:00'); v = isNaN(d) ? v : new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
      if ((e.control === 'numero') && v !== '' && !isNaN(Number(v))) v = Number(v);
      if (e.control === 'multi') v = String(v).split(',').map((x) => x.trim()).filter(Boolean).join(' , ');
      salida[c] = v;
    });
    return salida;
  }

  /** NUCO homologado: siempre a 4 dígitos ("5" → "0005"). */
  function homologarNuco_(valores) {
    if (valores.NUCO !== undefined && valores.NUCO !== null && valores.NUCO !== '') valores.NUCO = LineasUtil.nucoVisible(valores.NUCO);
    return valores;
  }

  /**
   * Datos de la persona que solo «Mandar a resguardo» deja en blanco (usuario, 4-oct; LineasResguardos.CAMPOS_PERSONA).
   * "NO APLICA" no cuenta como blanco: lo pone el TIPO (módem, banda ancha, línea).
   */
  const PERSONA_SOLO_RESGUARDO = ['NO EMPLEADO', 'RESPONSABLE', 'PUESTO', 'JEFE DIRECTO', 'DIRECTOR', 'PIN WHATSAPP', 'PIN EQUIPO', 'CUENTA GOOGLE']
    .concat(ORDEN_ADICIONALES.reduce((a, n) => a.concat(['NO EMPLEADO ' + n + ' RESPONSABLE', 'NOMBRE ' + n + ' RESPONSABLE']), []));
  const enBlanco_ = (v) => ['', 'N/A', 'NA', 'N / A', '-'].indexOf(texto_(v).trim().toUpperCase()) >= 0;

  /** Un solo COMENTARIO obligatorio en cada acción (plan §5.2): el del alta o el de la corrección. */
  function comentarioObligatorio_(datos, que) {
    const c = texto_(datos && (datos.comentario || datos.motivo));
    if (c.length <= 3) throw new Error('Escribe el comentario: ' + que + ' (queda en el historial).');
    return c;
  }

  function crear(datos, usuario) {
    asegurarEsquema_();
    const comentario = comentarioObligatorio_(datos, 'de dónde sale este registro');
    LineasUtil.exigirPinEquipo(datos);
    const enviados = (datos && datos.valores) || datos || {};
    // Agregar equipo o Agregar línea (usuario, 4-oct): el TIPO no se elige, se asigna solo
    const parte = parteDe_({ parte: (datos && datos.parte) || 'EQUIPO' }, '');
    const ctx = Object.assign(contextoValidacion_(null, true), { parte: parte });
    const elementos = elementos_(baseNueva_(), LineasRepo.catalogos(), usuario, ctx);
    const r = resolver_(elementos, baseNueva_(), enviados, ctx);
    if (r.errores.length) throw new Error(r.errores.slice(0, 8).join(' · '));
    const valores = homologarNuco_(aHoja_(elementos, r.valores));
    if (parte === 'LINEA' && !LineasUtil.txt(valores['NUMERO TELEFONO']) && !LineasUtil.txt(valores['NUMERO SIM'])) {
      throw new Error('Escribe el número o la SIM de la línea.');
    }
    if (parte === 'LINEA') {
      // Agregar línea (usuario, 8-oct): en un equipo, se le pone al equipo; sola, su estatus sale de lo capturado
      if (texto_(r.valores[VINCULAR]).toUpperCase() === 'TRUE') return crearLineaEnEquipo_(r.valores, valores, comentario, datos, usuario);
      valores['ESTATUS LINEA'] = estatusAltaLinea_(r.valores, null);
    }
    valores.TIPO = tipoAutomatico_(parte, valores, '');
    // Con las hojas nuevas, el ID del registro lo pone agregarRegistro (el del equipo o el de la línea)
    const estructura = LineasLectura.activo();
    const ahora = new Date();
    valores.ID = estructura ? '' : LineasDatos.nuevoId(LineasRepo.TAB.LINEAS);
    valores['FECHA REGISTRO'] = ahora;
    if (!estructura) valores['ESTATUS GENERAL'] = LineasRepo.estatusGeneralRegistro(valores.ID, texto_(valores.TIPO).toUpperCase(), texto_(valores['ESTATUS EQUIPO']), texto_(valores['ESTATUS LINEA']));
    LineasDatos.conCandado(() => {
      const alta = LineasRepo.agregarRegistro(valores);
      // El bot CAMBIOS TELEFONIA es UPDATES_ONLY: un alta no deja filas en la bitácora del AppSheet
      LineasRepo.registrarMovimiento('ALTA', { motivo: comentario, ticket: texto_(datos && datos.ticket) }, usuario, ahora, {
        refs: [valores.ID].concat((alta && alta.refs) || []), nuco: valores.NUCO, numero: valores['NUMERO TELEFONO'], antes: {}, despues: valores, detalle: {},
      });
    });
    LineasNotificaciones.revisarPronto(); // si el adendum ya vence esta semana, el aviso sale en la siguiente consulta
    return { id: valores.ID, filas: LineasRepo.refrescarIndice([valores.ID]) };
  }

  /** Columnas de la línea y de su adendum que se le ponen al equipo al vincularla en el alta. */
  const COLUMNAS_LINEA_ALTA = ['NUMERO TELEFONO', 'NUMERO SIM', 'TIPO DE LINEA', 'COMPAÑIA', 'RAZON SOCIAL', 'COSTO PLAN', 'INICIO PLAN', 'FIN PLAN'];

  /**
   * Agregar línea vinculada a un equipo (usuario, 8-oct): la línea se crea y queda con el equipo, en su asignación (la
   * misma escritura que ponerle línea a un equipo en Editar: LineasEscritura.lineaParaEquipo_). El responsable es el del
   * equipo y su estatus lo sigue: USO si está en uso, DISPONIBLE si está guardado (opción A; lo pone la escritura).
   * Regresa { id: el del equipo, filas }.
   */
  function crearLineaEnEquipo_(enviados, valores, comentario, datos, usuario) {
    const nuco = LineasUtil.nucoVisible(enviados[NUCO_VINCULAR]) || '';
    const ahora = new Date();
    let id = null;
    LineasDatos.conCandado(() => {
      const eq = equiposSinLinea_().filter((x) => x.nuco === nuco)[0];
      if (!eq) throw new Error('NUCO ' + (nuco || '—') + ': elige un equipo en uso o en resguardo y sin línea.');
      const fila = LineasRepo.leerRegistroObligatorio(eq.id, 'el equipo');
      const cambios = {};
      COLUMNAS_LINEA_ALTA.forEach((c) => { if (valores[c] !== undefined && valores[c] !== null && valores[c] !== '') cambios[c] = valores[c]; });
      const guardado = LineasRepo.guardarCambiosRegistro(fila, cambios, usuario, ahora);
      id = eq.id;
      LineasRepo.registrarMovimiento('ALTA', { motivo: comentario, ticket: texto_(datos && datos.ticket) }, usuario, ahora, {
        refs: [id].concat(guardado.refs || []), nuco: nuco, numero: cambios['NUMERO TELEFONO'] || '', antes: {}, despues: cambios,
        detalle: { vinculadaA: 'NUCO ' + nuco, cambios: guardado.campos },
      });
    });
    LineasNotificaciones.revisarPronto();
    return { id: id, filas: LineasRepo.refrescarIndice([id]) };
  }

  function editar(id, datos, usuario, puedeVerSecretos) {
    asegurarEsquema_();
    LineasUtil.exigirPinEquipo(datos);
    const enviados = (datos && datos.valores) || datos || {};
    const resultado = LineasDatos.conCandado(() => {
      const fila = LineasRepo.leerRegistroObligatorio(id, 'el registro');
      const base = baseDeFila_(fila);
      // Editar línea (datos.parte = 'LINEA') o lo que es el registro
      const edicion = contextoEdicion_(base, datos && datos.parte);
      const parte = parteDe_(edicion, base['TIPO']);
      // A un equipo sin línea se le puede poner una línea sola que ya existe: su número no cuenta como repetido
      const sinLinea = parte === 'EQUIPO' && !LineasUtil.txt(base['NUMERO TELEFONO']) && !LineasUtil.txt(base['NUMERO SIM']);
      const ctx = Object.assign(contextoValidacion_(id, false, sinLinea), edicion, { parte: parte });
      const elementos = elementos_(base, LineasRepo.catalogos(), usuario, ctx)
        .map((e) => (e.secreto && !puedeVerSecretos ? Object.assign({}, e, { valorOculto: true }) : e));
      const r = resolver_(elementos, base, enviados, ctx);
      if (r.errores.length) throw new Error(r.errores.slice(0, 8).join(' · '));
      const valores = homologarNuco_(aHoja_(elementos, r.valores));
      // Solo lo que cambió (las fechas sin cambio se comparan por texto para no reescribirlas)
      const cambios = {};
      Object.keys(valores).forEach((c) => {
        const antes = base[c] === undefined ? '' : base[c];
        const despues = valores[c] instanceof Date ? Utilities.formatDate(valores[c], ZONA, 'yyyy-MM-dd') : texto_(valores[c]);
        if (texto_(antes) !== despues) cambios[c] = valores[c];
      });
      // Los datos de la persona solo quedan en blanco al mandar a resguardo (usuario, 4-oct): aquí no se vacían
      const vacios = PERSONA_SOLO_RESGUARDO.filter((c) => !enBlanco_(base[c]) && c in cambios && enBlanco_(valores[c]));
      if (vacios.length) throw new Error(vacios.join(', ') + ': no se deja en blanco al editar; solo «Mandar a resguardo» lo deja en blanco.');
      // Editar es corregir un dato mal capturado: siempre con su comentario (qué se corrigió y por qué), §5.2
      const motivo = comentarioObligatorio_(datos, 'qué se corrigió y por qué');
      // RESGUARDO, PARA VENTA y PARA DESECHO del equipo, y EN PROCESO DE CANCELACION y CANCELADA de la línea (usuario,
      // 8-oct): se cambian aquí si la pantalla avisó que no entran al panel de Resguardos y cancelaciones y se confirmó
      // (datos.sinPanel); quedan en el historial. Al panel se llega con «Mandar a resguardo» y «Mandar a cancelación»
      const sinPanel = !!(datos && datos.sinPanel);
      const estatusEquipo = texto_(valores['ESTATUS EQUIPO']).toUpperCase();
      const estatusLinea = texto_(valores['ESTATUS LINEA']).toUpperCase();
      if (!sinPanel) {
        if ('ESTATUS EQUIPO' in cambios) exigirFormularioResguardo_(base.TIPO, base['ESTATUS EQUIPO'], valores['ESTATUS EQUIPO']);
        if ('ESTATUS LINEA' in cambios && ESTATUS_LINEA_PANEL.indexOf(estatusLinea) >= 0) {
          throw new Error('La línea a ' + estatusLinea + ': confirma el aviso (no entra a Resguardos y cancelaciones) o usa «Mandar a cancelación».');
        }
      }
      // El equipo que se guarda (sin persona) se lleva su línea en uso: queda DISPONIBLE, como en el alta (opción A)
      const aGuardado = 'ESTATUS EQUIPO' in cambios && LineasResguardos.ESTATUS_EQUIPO_RESGUARDO.indexOf(estatusEquipo) >= 0;
      if (sinPanel && aGuardado && !('ESTATUS LINEA' in cambios) && texto_(base['ESTATUS LINEA']).toUpperCase() === 'USO') {
        cambios['ESTATUS LINEA'] = 'DISPONIBLE';
      }
      // Línea sola (usuario, 8-oct): «Quitar responsable» la deja DISPONIBLE; con un responsable nuevo pasa a USO; en USO
      // lleva responsable
      const lineaSola = parte === 'LINEA' && !edicion.lineaEnEquipo;
      const quitar = lineaSola && texto_(r.valores[QUITAR_RESPONSABLE]).toUpperCase() === 'TRUE';
      if (lineaSola && ESTATUS_LINEA_PANEL.indexOf(estatusLinea) < 0) {
        if (quitar) cambios['ESTATUS LINEA'] = 'DISPONIBLE';
        else if (!texto_(base['RESPONSABLE']) && texto_(valores['RESPONSABLE']) && estatusLinea === 'DISPONIBLE') cambios['ESTATUS LINEA'] = 'USO';
        const final = texto_('ESTATUS LINEA' in cambios ? cambios['ESTATUS LINEA'] : base['ESTATUS LINEA']).toUpperCase();
        if (final === 'USO' && !quitar && !texto_(valores['RESPONSABLE'])) {
          throw new Error('Una línea en USO lleva responsable: escríbelo o pon la línea DISPONIBLE.');
        }
      }
      // Cambio de número (usuario, 8-oct): CAMBIO DE NUMERO es otro número de la misma línea («Números de esta línea»);
      // CORRECCION DE CAPTURA, un dato mal escrito (solo Edición en el historial)
      const cambioDeNumero = 'NUMERO TELEFONO' in cambios && !!texto_(base['NUMERO TELEFONO']) &&
        texto_(r.valores[CAMBIO_NUMERO]).toUpperCase() === MOTIVO_CAMBIO_NUMERO;
      const antes = LineasRepo.convertirRegistro(fila);
      // corregir: cambiar a la persona aquí es corregir el dato en la misma asignación (usuario, 4-oct); pasar el equipo a
      // otra persona es Reasignar, con su responsiva
      const guardado = LineasRepo.guardarCambiosRegistro(fila, cambios, usuario, new Date(), { corregir: true });
      LineasRepo.registrarMovimiento(cambioDeNumero ? LineasRepo.ACCION_CAMBIO_NUMERO : 'EDICION', { motivo: motivo, ticket: texto_(datos && datos.ticket) }, usuario, new Date(), {
        refs: [id].concat(guardado.refs || []), nuco: valores.NUCO, numero: valores['NUMERO TELEFONO'], antes: antes, despues: cambios,
        detalle: { idsCambios: guardado.idsCambios, idsReasignacion: guardado.idReasignacion ? [guardado.idReasignacion] : [], cambios: guardado.campos,
          sinPanel: sinPanel || undefined },
      });
      return guardado;
    });
    return { id: id, cambios: resultado.campos, filas: LineasRepo.refrescarIndice([id]) };
  }

  /**
   * RESGUARDO, PARA VENTA y PARA DESECHO siguen la lógica de "Mandar a resguardo" (pedido del
   * usuario, 30-sep): los datos de la persona quedan en blanco y se eligen departamento, sede, oficina y el estatus de la
   * línea. Por eso un equipo no llega a esos estatus por el cambio rápido ni por la edición directa: la ficha abre el
   * formulario de resguardo (LineasResguardos).
   */
  function exigirFormularioResguardo_(tipo, estatusAntes, estatusNuevo) {
    const nuevo = texto_(estatusNuevo).trim().toUpperCase();
    if (!LineasRepo.TIPOS_CON_EQUIPO[texto_(tipo).trim().toUpperCase()]) return;
    if (LineasResguardos.ESTATUS_EQUIPO_RESGUARDO.indexOf(nuevo) < 0 || nuevo === texto_(estatusAntes).trim().toUpperCase()) return;
    throw new Error('Para pasar el equipo a ' + nuevo + ' usa «Mandar a resguardo»: ' +
      'ese formulario cierra la asignación de la persona y pide departamento, sede y oficina.');
  }

  // «Cambiar estatus» se quitó (usuario, 4-oct): los estatus se cambian en Editar (ver editar y la pantalla)

  // ---------------- Acciones masivas de equipos (pedido del área, 29-sep) ----------------
  //
  // Uno o varios equipos: reasignar. Cada equipo deja su movimiento REASIGNACION con el comentario. Sin acciones
  // masivas en la pantalla por ahora (usuario, 4-oct): Reasignar abre la responsiva (LineasAcciones.reasignar).

  const MASIVAS = {
    // "Mandar a resguardo" vive en LineasResguardos (datos por NUCO, persona en blanco y bandeja de Pau), 30-sep
    // Al reasignar, el equipo queda en USO: el estatus no se elige (decisión del usuario D5.1, 3-oct; el 29-sep era
    // RESGUARDO). Si su línea estaba DISPONIBLE, también pasa a USO: se entrega con el equipo (plan §5.3)
    REASIGNAR: { titulo: 'Reasignar equipos', texto: 'Reasignar', estatusEquipo: 'USO', lineaDisponibleAUso: true, movimiento: 'REASIGNACION' },
    // "Cancelar equipos" se quitó el 30-sep: los equipos no se cancelan, solo las líneas (reunión con Líneas)
  };
  const MASIVA_MINIMO = 1; // Reasignar también con un solo equipo (barra de selección tipo Drive, 30-sep)
  const MASIVA_MAXIMO = 150; // cada equipo son ~4 escrituras: que quepa en el límite de 6 min de Apps Script
  const COLS_REASIGNAR = ['NO EMPLEADO', 'RESPONSABLE', 'PUESTO', 'DEPARTAMENTO'];
  /** Reasignar pide a la persona. */
  const conResponsable_ = (clave) => clave === 'REASIGNAR';

  function masiva_(accion) {
    const cfg = MASIVAS[String(accion || '').toUpperCase()];
    if (!cfg) throw new Error('Acción masiva desconocida: ' + accion);
    return cfg;
  }

  /**
   * Campos del formulario de la acción. Reasignar usa los mismos campos, listas y autollenado del colaborador que
   * "Editar información" (se toman de elementos_), editables siempre porque aquí no hay TIPO.
   */
  function elementosMasivos_(accion, catalogos, usuario) {
    const salida = [];
    if (conResponsable_(accion)) {
      const base = elementos_({}, catalogos, usuario, { nuevo: false });
      const de = (c) => Object.assign({}, base.filter((e) => e.columna === c)[0], { etiqueta: c, editable: 'SIEMPRE', valor: '' });
      salida.push({ tipo: 'titulo', texto: 'NUEVO RESPONSABLE', icono: 'user-round-check' });
      COLS_REASIGNAR.forEach((c) => salida.push(Object.assign(de(c), c === 'RESPONSABLE' ? { requerido: 'SIEMPRE' } : {})));
    }
    // Un solo COMENTARIO obligatorio y el TICKET opcional en cada acción (plan §5.2 y D-I2)
    salida.push({ tipo: 'titulo', texto: 'COMENTARIO', icono: 'message-square-text' });
    salida.push(campo_('_MOTIVO', 'COMENTARIO (queda en el historial de cada uno)', 'area', { requerido: 'SIEMPRE', valida: 'COMENTARIOS' }));
    salida.push(campo_('_TICKET', 'TICKET O ASUNTO DEL CORREO (opcional)', 'texto', { literal: true }));
    return salida;
  }

  function formularioMasivo(accion, usuario) {
    const cfg = masiva_(accion);
    const clave = String(accion).toUpperCase();
    return {
      accion: clave, titulo: cfg.titulo, minimo: MASIVA_MINIMO, maximo: MASIVA_MAXIMO, elementos: elementosMasivos_(clave, LineasRepo.catalogos(), usuario),
      columnasResponsable: conResponsable_(clave) ? COLS_REASIGNAR : [],
    };
  }

  /**
   * Reasignar "uno por uno": cada equipo trae sus datos de responsable (porEquipo = { id: { RESPONSABLE, … } }).
   * Se validan con los mismos campos del formulario; un equipo sin RESPONSABLE se deja como está.
   * Regresa { id: cambios }.
   */
  function reasignacionIndividual_(elementos, porEquipo, ids) {
    const campos = elementos.filter((e) => COLS_REASIGNAR.indexOf(e.columna) >= 0);
    const errores = [];
    const salida = {};
    ids.forEach((id) => {
      const vals = (porEquipo || {})[id] || {};
      if (!texto_(vals.RESPONSABLE)) return;
      const r = resolver_(campos, {}, vals, { nuevo: false });
      r.errores.forEach((e) => errores.push((vals._ETIQUETA ? vals._ETIQUETA + ' · ' : '') + e));
      const cambios = {};
      COLS_REASIGNAR.forEach((c) => { if (texto_(r.valores[c])) cambios[c] = texto_(r.valores[c]); });
      salida[id] = cambios;
    });
    if (errores.length) throw new Error(errores.slice(0, 6).join(' · '));
    if (!Object.keys(salida).length) throw new Error('Escribe el responsable de al menos un equipo.');
    return salida;
  }

  /**
   * Aplica la acción a los equipos `ids`. Regresa { hechos: [{ id, nuco, campos }], omitidos: [{ id, nuco, motivo }] }.
   * Se omiten (sin error) los que ya no existen, los que no son equipo y los que ya tenían esos datos.
   */
  function accionMasiva(accion, ids, datos, usuario) {
    const cfg = masiva_(accion);
    const clave = String(accion).toUpperCase();
    const lista = (Array.isArray(ids) ? ids : []).map(texto_).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
    if (lista.length < MASIVA_MINIMO) throw new Error('Selecciona al menos un' + (cfg.parte === 'linea' ? 'a línea.' : ' equipo.'));
    if (lista.length > MASIVA_MAXIMO) throw new Error('Son ' + lista.length + ' equipos; el máximo por operación es ' + MASIVA_MAXIMO + '. Divide la selección.');

    const elementos = elementosMasivos_(clave, LineasRepo.catalogos(), usuario);
    // Reasignar uno por uno: los datos del responsable vienen por equipo; aquí solo estatus y motivo (comunes)
    const individual = conResponsable_(clave) && datos && datos.modo === 'INDIVIDUAL';
    const comunes = individual ? elementos.filter((e) => e.tipo !== 'campo' || COLS_REASIGNAR.indexOf(e.columna) < 0) : elementos;
    const r = resolver_(comunes, {}, (datos && datos.valores) || {}, { nuevo: false });
    if (r.errores.length) throw new Error(r.errores.slice(0, 6).join(' · '));
    const motivo = texto_(r.valores._MOTIVO);
    const ticket = texto_(r.valores._TICKET);
    const porEquipo = individual ? reasignacionIndividual_(elementos, datos.porEquipo, lista) : null;

    const pedidos = {};
    if (cfg.estatusEquipo) pedidos['ESTATUS EQUIPO'] = cfg.estatusEquipo;
    if (cfg.estatusLinea) pedidos['ESTATUS LINEA'] = cfg.estatusLinea;
    if (conResponsable_(clave) && !individual) COLS_REASIGNAR.forEach((c) => { if (texto_(r.valores[c])) pedidos[c] = texto_(r.valores[c]); });

    const hechos = [];
    const omitidos = [];
    LineasDatos.conCandado(() => {
      const porId = {};
      LineasDatos.leerTabla(LineasRepo.TAB.LINEAS).forEach((f) => { LineasDatos.idsDeFila(f).forEach((k) => { porId[k] = f; }); });
      lista.forEach((id) => {
        const f = porId[id];
        const nuco = f ? LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO')) || '' : '';
        if (!f) { omitidos.push({ id: id, nuco: nuco, motivo: 'Ya no existe en la hoja' }); return; }
        const tipo = texto_(LineasUtil.col(f, 'TIPO')).toUpperCase();
        const conEquipo = !!LineasRepo.TIPOS_CON_EQUIPO[tipo];
        if (cfg.parte === 'linea' ? conEquipo : !conEquipo) {
          omitidos.push({ id: id, nuco: nuco, numero: texto_(LineasUtil.col(f, 'NUMERO TELEFONO')),
            motivo: cfg.parte === 'linea' ? 'Está en un equipo: se entrega con su equipo' : 'No es un equipo (TIPO ' + (tipo || 'vacío') + ')' });
          return;
        }
        if (porEquipo && !porEquipo[id]) { omitidos.push({ id: id, nuco: nuco, motivo: 'Sin cambios' }); return; }
        const estatusAntes = texto_(LineasUtil.col(f, cfg.parte === 'linea' ? 'ESTATUS LINEA' : 'ESTATUS EQUIPO')).toUpperCase();
        const cambios = Object.assign({}, pedidos, porEquipo ? porEquipo[id] : {});
        if (cfg.lineaDisponibleAUso && texto_(LineasUtil.col(f, 'ESTATUS LINEA')).toUpperCase() === 'DISPONIBLE') cambios['ESTATUS LINEA'] = 'USO';
        // Ya no se copia el responsable a "quien usa" (lo hacía el AppSheet): solo se guarda si es otra persona (§3.7)
        const ahora = new Date();
        const guardado = LineasRepo.guardarCambiosRegistro(f, cambios, usuario, ahora);
        if (!guardado.campos.length) { omitidos.push({ id: id, nuco: nuco, motivo: 'Ya tenía esos datos' }); return; }
        const nombreAntes = texto_(LineasUtil.col(f, 'RESPONSABLE'));
        LineasRepo.registrarMovimiento(cfg.movimiento, { motivo: motivo, ticket: ticket }, usuario, ahora, {
          refs: [id].concat(guardado.refs || []), nuco: LineasUtil.col(f, 'NUCO'), numero: LineasUtil.col(f, 'NUMERO TELEFONO'),
          antes: { estatus: estatusAntes, responsable: { nombre: nombreAntes } },
          despues: { estatus: cfg.estatusEquipo || cfg.estatusLinea, responsable: { nombre: cambios.RESPONSABLE || nombreAntes } },
          detalle: {
            masiva: clave, individual: !!individual, total: lista.length, idsCambios: guardado.idsCambios,
            idsReasignacion: guardado.idReasignacion ? [guardado.idReasignacion] : [], cambios: guardado.campos,
          },
        });
        hechos.push({ id: id, nuco: nuco, campos: guardado.campos });
      });
    });
    // Solo los registros tocados (y los que aparecen por el cambio): rearmar el índice completo tardaba ~4 s
    const indice = hechos.length ? LineasRepo.refrescarIndice(hechos.map((h) => h.id)) : null;
    return { accion: clave, titulo: cfg.titulo, hechos: hechos, omitidos: omitidos, indice: indice };
  }

  return {
    formulario, crear, editar, formularioMasivo, accionMasiva, camposAdicionales, cuantosAdicionales, CUENTA_ADICIONALES,
    _elementos: elementos_, _resolver: resolver_, _cumple: cumple_, _elementosMasivos: elementosMasivos_, _tipoAutomatico: tipoAutomatico_,
    _estatusAltaLinea: estatusAltaLinea_, _equiposSinLinea: equiposSinLinea_, _contextoEdicion: contextoEdicion_, ESTATUS_LINEA_PANEL,
  };
})();
