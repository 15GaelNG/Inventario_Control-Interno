/**
 * LineasRegistros.gs
 * Alta y edición de LINEAS TELEFONICAS, réplica de LINEAS TELEFONICAS_Form del AppSheet (v1.001924):
 * orden de campos, display names, listas y su orden, valores iniciales, Show_If, Required_If,
 * Editable_If, Reset_If y Valid_If con sus mensajes. Al final van los campos que agregó el sistema
 * nuevo (COLOR persistente, patrón de 9 puntos y CONTRASEÑA MODEM, que el formulario del AppSheet no tiene).
 *
 * Condiciones (mismo formato que evalúa lineas.html):
 *   'SIEMPRE' | 'NUNCA' | { tipoLleno: true } | { tipoEn: [...] } | { tipoNoEn: [...] } |
 *   { campo, igual } | { nuevo: true } | { y: [cond, ...] }
 * Validaciones (Valid_If; solo se evalúan con valor, como en el AppSheet):
 *   MAYUS · TELEFONO · NUCO · EQUIPO · PIN_WA · PIN_EQ · CUENTA · COMENTARIOS · ACCESORIOS · LISTA
 */
const LineasRegistros = (function () {
  const ZONA = 'America/Mexico_City';
  const NO_APLICA = 'NO APLICA';
  const BA_MODEM = ['BANDA ANCHA', 'MODEM'];
  const BA_LINEA_MODEM = ['BANDA ANCHA', 'LINEA', 'MODEM'];
  const ACCESORIOS = ['CAJA', 'CABLE', 'CUBO', 'FUNDA', 'MICA', 'SD', 'NINGUNO'];
  const ACCESORIOS_VALIDOS = ['CAJA', 'CARGADOR', 'FUNDA', 'MICA', 'CABLE', 'CUBO', 'SD', 'NINGUNO'];
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
    if (cond.campo) return texto_(valores[cond.campo]).toUpperCase() === String(cond.igual).toUpperCase();
    return true;
  }

  const campo_ = (columna, etiqueta, control, extra) => Object.assign({
    tipo: 'campo', columna: columna, etiqueta: etiqueta, control: control, requerido: 'NUNCA', mostrar: 'SIEMPRE', editable: 'SIEMPRE', soloLectura: false,
  }, extra || {});
  const conTipo = { tipoLleno: true };
  const siEditable = (extra) => Object.assign({ editable: conTipo }, extra || {});

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
   * Las listas de SEDE / OFICINA / DEPARTAMENTO / AREA admiten otros valores solo a la coordinación LINEAS.
   */
  function elementos_(base, catalogos, usuario, ctx) {
    const coord = coordinacion_(usuario.correo);
    const listaLibre = coord === 'LINEAS';
    const excepcionEquipo = coord === 'AUDITORIAS Y CALIDAD' || String(usuario.correo || '').toLowerCase() === 'auxiliartelefonia1.ci@ciudadmaderas.com';
    const v = (c) => (base[c] === undefined || base[c] === null ? '' : base[c]);
    const lista = (columna, opciones) => campo_(columna, columna, listaLibre ? 'listaAbierta' : 'lista', siEditable({ valor: v(columna), opciones: opciones, valida: listaLibre ? null : 'LISTA' }));
    // Mejora sobre AppSheet (texto libre): lista desplegable con COLABORADORES / valores ya capturados.
    // `sugerencias` las completa el navegador; `autollenar` copia datos del colaborador elegido.
    const puestos = catalogos.puestos || [];
    const responsableExtra = (n, previo, pregunta) => [
      campo_(pregunta, '¿EXISTE OTRO COLABORADOR QUE USE EL EQUIPO?', 'escala', { valor: v(pregunta), opciones: ['SI', 'NO'], mostrar: previo ? { campo: previo, igual: 'SI' } : 'SIEMPRE' }),
      campo_('NOMBRE ' + n + ' RESPONSABLE', 'NOMBRE ' + n + ' RESPONSABLE', 'listaAbierta', { valor: v('NOMBRE ' + n + ' RESPONSABLE'), mostrar: { campo: pregunta, igual: 'SI' },
        sugerencias: 'PERSONAS', autollenar: { ['PUESTO ' + n + ' RESPONSABLE']: 'puesto' } }),
      campo_('PUESTO ' + n + ' RESPONSABLE', 'PUESTO ' + n + ' RESPONSABLE', 'listaAbierta', { valor: v('PUESTO ' + n + ' RESPONSABLE'), mostrar: { campo: pregunta, igual: 'SI' },
        opciones: puestos, sugerencias: 'PUESTOS' }),
    ];
    const elementos = [
      campo_('FOLIO', 'FOLIO', 'calculado', { formula: 'FOLIO', valor: v('FOLIO'), soloLectura: true }),
      campo_('TIPO', 'TIPO', 'lista', { valor: v('TIPO'), opciones: LineasRepo.CATALOGO.tipos, requerido: 'SIEMPRE' }),
      campo_('NUMERO TELEFONO', 'NUMERO TELEFONO', 'texto', {
        valor: v('NUMERO TELEFONO'), requerido: 'SIEMPRE', valida: 'TELEFONO',
        editable: { y: [conTipo, { tipoNoEn: ['EQUIPO'] }] }, reset: { cuando: { tipoEn: ['EQUIPO'] }, valor: NO_APLICA },
      }),
      campo_('NUCO', 'NUCO', 'numero', siEditable({ valor: v('NUCO'), requerido: 'SIEMPRE', valida: 'NUCO' })),
      campo_('EQUIPO', 'EQUIPO', 'listaAbierta', {
        valor: v('EQUIPO'), opciones: catalogos.modelos || [], valida: excepcionEquipo ? null : 'EQUIPO',
        editable: { y: [conTipo, { tipoNoEn: ['LINEA'] }] }, reset: { cuando: { tipoEn: ['LINEA'] }, valor: NO_APLICA },
      }),
      campo_('NO EMPLEADO', 'No EMPLEADO', 'listaAbierta', siEditable({ valor: v('NO EMPLEADO'), valida: 'MAYUS',
        sugerencias: 'NO_EMPLEADO', autollenar: { 'RESPONSABLE': 'nombre', 'PUESTO': 'puesto' } })),
      campo_('ESTATUS GENERAL', 'ESTATUS GENERAL', 'calculado', { formula: 'ESTATUS_GENERAL', valor: v('ESTATUS GENERAL'), soloLectura: true }),
      campo_('RESPONSABLE', 'RESPONSABLE', 'listaAbierta', siEditable({ valor: v('RESPONSABLE'), valida: 'MAYUS',
        sugerencias: 'PERSONAS', autollenar: { 'NO EMPLEADO': 'noEmpleado', 'PUESTO': 'puesto' } })),
      campo_('PUESTO', 'PUESTO', 'listaAbierta', siEditable({ valor: v('PUESTO'), valida: 'MAYUS', opciones: puestos, sugerencias: 'PUESTOS' })),
      campo_('RESPONSABLE USA EL EQUIPO', '¿EL RESPONSABLE SERÁ QUIEN USE EL EQUIPO?', 'escala', { valor: v('RESPONSABLE USA EL EQUIPO'), opciones: ['SI', 'NO'] }),
      campo_('NOMBRE QUIEN USA', 'NOMBRE DEL COLABORADOR QUE USARÁ EL EQUIPO', 'listaAbierta', {
        valor: v('NOMBRE QUIEN USA'), mostrar: { campo: 'RESPONSABLE USA EL EQUIPO', igual: 'NO' },
        sugerencias: 'PERSONAS', autollenar: { 'PUESTO QUIEN USA': 'puesto' },
        reset: { cuando: { campo: 'RESPONSABLE USA EL EQUIPO', igual: 'SI' }, copiar: 'RESPONSABLE' },
      }),
      campo_('PUESTO QUIEN USA', 'PUESTO DEL COLABORADOR QUE USARÁ EL EQUIPO', 'listaAbierta', {
        valor: v('PUESTO QUIEN USA'), mostrar: { campo: 'RESPONSABLE USA EL EQUIPO', igual: 'NO' }, opciones: puestos, sugerencias: 'PUESTOS',
        reset: { cuando: { campo: 'RESPONSABLE USA EL EQUIPO', igual: 'SI' }, copiar: 'PUESTO' },
      }),
    ]
      .concat(responsableExtra('SEGUNDO', null, 'SEGUNDO RESPONSABLE'))
      .concat(responsableExtra('TERCER', 'SEGUNDO RESPONSABLE', 'TERCER RESPONSABLE'))
      .concat(responsableExtra('CUARTO', 'TERCER RESPONSABLE', 'CUARTO RESPONSABLE'))
      .concat(responsableExtra('QUINTO', 'CUARTO RESPONSABLE', 'QUINTO RESPONSABLE'))
      .concat([
        campo_('IMEI', 'IMEI', 'texto', { valor: v('IMEI') }),
        campo_('NUMERO SIM', 'NUMERO SIM', 'texto', {
          valor: v('NUMERO SIM'), mostrar: { tipoNoEn: ['EQUIPO'] },
          editable: { y: [conTipo, { tipoNoEn: ['EQUIPO'] }] }, reset: { cuando: { tipoEn: ['EQUIPO'] }, valor: NO_APLICA, soloCambioTipo: true },
        }),
        campo_('ACCESORIOS', 'ACCESORIOS', 'multi', siEditable({ valor: v('ACCESORIOS'), opciones: ACCESORIOS, valida: 'ACCESORIOS' })),
        lista('SEDE', catalogos.sedes || []),
        lista('OFICINA / DESARROLLO', catalogos.oficinas || []),
        lista('DEPARTAMENTO', catalogos.departamentos || []),
        lista('AREA', catalogos.areas || []),
        campo_('JEFE DIRECTO', 'JEFE DIRECTO', 'listaAbierta', siEditable({ valor: v('JEFE DIRECTO'), valida: 'MAYUS', opciones: catalogos.jefes || [], sugerencias: 'PERSONAS' })),
        campo_('DIRECTOR', 'DIRECTOR', 'listaAbierta', siEditable({ valor: v('DIRECTOR'), valida: 'MAYUS', opciones: catalogos.directores || [], sugerencias: 'PERSONAS' })),
        campo_('RAZON SOCIAL', 'RAZON SOCIAL', 'lista', siEditable({ valor: v('RAZON SOCIAL'), opciones: catalogos.razonesSociales || [], valida: 'LISTA' })),
        campo_('PIN WHATSAPP', 'PIN WHATSAPP', 'texto', {
          valor: v('PIN WHATSAPP'), valida: 'PIN_WA', literal: true, secreto: true,
          editable: { y: [conTipo, { tipoNoEn: BA_MODEM }] }, reset: { cuando: { tipoEn: BA_MODEM }, valor: NO_APLICA },
        }),
        campo_('PIN EQUIPO', 'PIN EQUIPO', 'texto', {
          valor: v('PIN EQUIPO'), valida: 'PIN_EQ', literal: true, secreto: true,
          editable: { y: [conTipo, { tipoNoEn: BA_LINEA_MODEM }] }, reset: { cuando: { tipoEn: BA_LINEA_MODEM }, valor: NO_APLICA },
        }),
        campo_('CUENTA GOOGLE', 'CUENTA GOOGLE', 'texto', {
          valor: v('CUENTA GOOGLE'), valida: 'CUENTA', literal: true,
          editable: { y: [conTipo, { tipoNoEn: BA_LINEA_MODEM }] }, reset: { cuando: { tipoEn: BA_LINEA_MODEM }, valor: NO_APLICA },
        }),
        campo_('COMPAÑIA', 'COMPAÑIA', 'listaAbierta', siEditable({ valor: v('COMPAÑIA'), opciones: ['TELCEL', 'AT&T', 'BAIT'], valida: 'MAYUS' })),
        campo_('COSTO PLAN', 'COSTO PLAN', 'numero', { valor: v('COSTO PLAN'), editable: { tipoNoEn: ['EQUIPO'] } }),
        campo_('FECHA REGISTRO', 'FECHA REGISTRO', 'calculado', { valor: v('FECHA REGISTRO'), soloLectura: true }),
        campo_('INICIO PLAN', 'INICIO PLAN', 'fecha', { valor: v('INICIO PLAN'), mostrar: { nuevo: true }, requerido: { nuevo: true } }),
        campo_('FIN PLAN', 'FIN PLAN', 'fecha', { valor: v('FIN PLAN'), mostrar: { nuevo: true }, requerido: { nuevo: true } }),
        campo_('ESTATUS LINEA', 'ESTATUS LINEA', 'lista', siEditable({ valor: v('ESTATUS LINEA'), opciones: LineasRepo.CATALOGO.estatusLinea, valida: 'MAYUS' })),
        campo_('ESTATUS EQUIPO', 'ESTATUS EQUIPO', 'lista', siEditable({ valor: v('ESTATUS EQUIPO'), opciones: LineasRepo.CATALOGO.estatusEquipo, valida: 'MAYUS' })),
        campo_('RESPONSIVA', 'RESPONSIVA', 'archivo', siEditable({ valor: v('RESPONSIVA') })),
        campo_('FECHA INSPECCION', 'FECHA INSPECCION', 'fecha', { valor: v('FECHA INSPECCION') }),
        campo_('FORMATO INSPECCION', 'FORMATO INSPECCION', 'archivo', { valor: v('FORMATO INSPECCION') }),
        campo_('COMENTARIOS', 'COMENTARIOS', 'texto', { valor: v('COMENTARIOS'), valida: 'COMENTARIOS' }),
        // ---- Agregados por el sistema nuevo (no están en el formulario del AppSheet) ----
        { tipo: 'titulo', texto: 'DATOS DEL SISTEMA NUEVO', icono: 'sparkles' },
        campo_('COLOR', 'COLOR', 'listaAbierta', { valor: v('COLOR'), opciones: catalogos.colores || [], extra: true }),
        campo_('CONTRASEÑA MODEM', 'CONTRASEÑA MODEM', 'texto', { valor: v('CONTRASEÑA MODEM'), mostrar: { tipoEn: ['MODEM', 'BANDA ANCHA'] }, literal: true, secreto: true, extra: true }),
        campo_('PATRON', 'PATRÓN DEL EQUIPO', 'patron', { valor: v('PATRON'), mostrar: { tipoEn: ['EQUIPO + SIM', 'EQUIPO'] }, secreto: true, extra: true }),
      ]);
    return elementos;
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

  /** Formulario para el cliente: alta (id vacío) o edición. */
  function formulario(id, usuario, puedeVerSecretos) {
    const fila = id ? LineasRepo.leerRegistroObligatorio(id, 'el registro') : null;
    const base = fila ? baseDeFila_(fila) : baseNueva_();
    const ctx = { nuevo: !fila };
    return { nuevo: ctx.nuevo, elementos: ocultarSecretos_(elementos_(base, LineasRepo.catalogos(), usuario, ctx), puedeVerSecretos) };
  }

  // ---------------- Valid_If ----------------

  const mayusSinAcentos_ = (v) => v === v.toUpperCase() && !/[ÁÉÍÓÚ]/.test(v);

  function valida_(codigo, valor, valores, e, ctx) {
    const tipo = texto_(valores['TIPO']).toUpperCase();
    switch (codigo) {
      case 'MAYUS': return mayusSinAcentos_(valor);
      case 'NUCO': return /^\d+$/.test(valor) && !ctx.nucoRepetido(valor);
      case 'TELEFONO': return tipo === 'EQUIPO' ? valor === NO_APLICA : (valor !== NO_APLICA && !ctx.telefonoRepetido(valor));
      case 'EQUIPO': return tipo === 'LINEA' ? valor === NO_APLICA : valor !== NO_APLICA;
      case 'PIN_WA': return BA_MODEM.indexOf(tipo) >= 0 ? valor === NO_APLICA : (valor !== NO_APLICA && valor.length <= 13);
      case 'PIN_EQ': return BA_LINEA_MODEM.indexOf(tipo) >= 0 ? valor === NO_APLICA : (valor !== NO_APLICA && valor.length <= 6);
      case 'CUENTA': return BA_LINEA_MODEM.indexOf(tipo) >= 0 ? valor === NO_APLICA : valor !== NO_APLICA;
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
    tomar(orden.filter((e) => e.columna === 'TIPO')[0]);
    const tipo = texto_(valores['TIPO']).toUpperCase();
    if (ctx.nuevo) {
      // Initial value del AppSheet para un alta
      if (!Object.prototype.hasOwnProperty.call(enviados, 'NUMERO TELEFONO') || !texto_(enviados['NUMERO TELEFONO'])) valores['NUMERO TELEFONO'] = tipo === 'EQUIPO' ? NO_APLICA : '';
      if (!texto_(enviados['NUMERO SIM'])) valores['NUMERO SIM'] = tipo === 'EQUIPO' ? NO_APLICA : '';
      if (!texto_(enviados['EQUIPO'])) valores['EQUIPO'] = tipo === 'LINEA' ? NO_APLICA : '';
      if (!texto_(enviados['PIN WHATSAPP'])) valores['PIN WHATSAPP'] = BA_MODEM.indexOf(tipo) >= 0 ? NO_APLICA : '';
      if (!texto_(enviados['PIN EQUIPO'])) valores['PIN EQUIPO'] = BA_LINEA_MODEM.indexOf(tipo) >= 0 ? NO_APLICA : '';
      if (!texto_(enviados['CUENTA GOOGLE'])) valores['CUENTA GOOGLE'] = BA_LINEA_MODEM.indexOf(tipo) >= 0 ? NO_APLICA : '';
    }
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
      if (e.valida && !valida_(e.valida, valor, valores, e, ctx)) errores.push(e.etiqueta + ': ' + MENSAJES[e.valida]);
    });
    return { valores: valores, errores: errores };
  }

  // ---------------- Guardar ----------------

  /** COLOR es una columna real del sistema nuevo (en AppSheet es virtual): se crea si falta. */
  function asegurarEsquema_() {
    const tabla = LineasDatos.tablaFresca(LineasRepo.TAB.LINEAS);
    if (LineasDatos.colIndice(tabla, 'COLOR') < 0) LineasDatos.asegurarPestana(LineasRepo.TAB.LINEAS, ['COLOR']);
  }

  /** Columnas que se escriben en la hoja (las del formulario, sin las calculadas). */
  function columnasEscribibles_(elementos) {
    return elementos.filter((e) => e.tipo === 'campo' && e.control !== 'calculado' && !e.soloLectura).map((e) => e.columna);
  }

  function contextoValidacion_(id, nuevo) {
    const filas = LineasDatos.leerTabla(LineasRepo.TAB.LINEAS);
    const otros = filas.filter((f) => texto_(f['ID']) !== texto_(id));
    return {
      nuevo: nuevo,
      nucoRepetido: (nuco) => otros.some((f) => texto_(LineasUtil.col(f, 'NUCO')).replace(/^0+/, '') === String(nuco).replace(/^0+/, '')),
      telefonoRepetido: (num) => otros.some((f) => texto_(LineasUtil.col(f, 'NUMERO TELEFONO')) === num),
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

  /** Sube los archivos de las columnas File (RESPONSIVA, FORMATO INSPECCION) a la carpeta del NUCO. */
  function subirArchivos_(archivos, nuco, valores) {
    Object.keys(archivos || {}).forEach((columna) => {
      const a = archivos[columna];
      if (!a || !a.base64) return;
      valores[columna] = LineasEvidencias.guardarArchivoDeRegistro(nuco, columna === 'RESPONSIVA' ? 'CARTA RESPONSIVA' : 'INSPECCIONES', a.nombre, a.mime, a.base64);
    });
  }

  function crear(datos, usuario) {
    asegurarEsquema_();
    const enviados = (datos && datos.valores) || datos || {};
    const ctx = contextoValidacion_(null, true);
    const elementos = elementos_(baseNueva_(), LineasRepo.catalogos(), usuario, ctx);
    const r = resolver_(elementos, baseNueva_(), enviados, ctx);
    if (r.errores.length) throw new Error(r.errores.slice(0, 8).join(' · '));
    const valores = aHoja_(elementos, r.valores);
    subirArchivos_(datos && datos.archivos, valores['NUCO'], valores);
    const id = LineasDatos.nuevoIdCorto();
    const ahora = new Date();
    valores.ID = id;
    valores['FECHA REGISTRO'] = ahora;
    valores['ESTATUS GENERAL'] = LineasRepo.estatusGeneralRegistro(id, texto_(valores.TIPO).toUpperCase(), texto_(valores['ESTATUS EQUIPO']), texto_(valores['ESTATUS LINEA']));
    LineasDatos.conCandado(() => {
      LineasRepo.agregarRegistro(valores);
      // El bot CAMBIOS TELEFONIA es UPDATES_ONLY: un alta no deja filas en la bitácora del AppSheet
      LineasRepo.registrarMovimiento('ALTA', { motivo: 'Alta de registro' }, usuario, ahora, {
        refs: [id], nuco: valores.NUCO, numero: valores['NUMERO TELEFONO'], antes: {}, despues: valores, detalle: {},
      });
    });
    return { id: id, filas: LineasRepo.refrescarIndice([id]) };
  }

  function editar(id, datos, usuario, puedeVerSecretos) {
    asegurarEsquema_();
    const enviados = (datos && datos.valores) || datos || {};
    const resultado = LineasDatos.conCandado(() => {
      const fila = LineasRepo.leerRegistroObligatorio(id, 'el registro');
      const base = baseDeFila_(fila);
      const ctx = contextoValidacion_(id, false);
      const elementos = elementos_(base, LineasRepo.catalogos(), usuario, ctx)
        .map((e) => (e.secreto && !puedeVerSecretos ? Object.assign({}, e, { valorOculto: true }) : e));
      const r = resolver_(elementos, base, enviados, ctx);
      if (r.errores.length) throw new Error(r.errores.slice(0, 8).join(' · '));
      const valores = aHoja_(elementos, r.valores);
      subirArchivos_(datos && datos.archivos, valores['NUCO'], valores);
      // Solo lo que cambió (las fechas sin cambio se comparan por texto para no reescribirlas)
      const cambios = {};
      Object.keys(valores).forEach((c) => {
        const antes = base[c] === undefined ? '' : base[c];
        const despues = valores[c] instanceof Date ? Utilities.formatDate(valores[c], ZONA, 'yyyy-MM-dd') : texto_(valores[c]);
        if (texto_(antes) !== despues) cambios[c] = valores[c];
      });
      const antes = LineasRepo.convertirRegistro(fila);
      const guardado = LineasRepo.guardarCambiosRegistro(fila, cambios, usuario, new Date());
      LineasRepo.registrarMovimiento('EDICION', { motivo: 'Edición del registro' }, usuario, new Date(), {
        refs: [id], nuco: valores.NUCO, numero: valores['NUMERO TELEFONO'], antes: antes, despues: cambios,
        detalle: { idsCambios: guardado.idsCambios, idsReasignacion: guardado.idReasignacion ? [guardado.idReasignacion] : [], cambios: guardado.campos },
      });
      return guardado;
    });
    return { id: id, cambios: resultado.campos, filas: LineasRepo.refrescarIndice([id]) };
  }

  /**
   * Cambio rápido de ESTATUS EQUIPO / ESTATUS LINEA desde la ficha (mejora: en AppSheet había que abrir todo el
   * formulario). Solo acepta valores de las listas del AppSheet; deja la bitácora CAMBIOS (bot de 23 campos),
   * recalcula ESTATUS GENERAL y registra el motivo en APP_MOVIMIENTOS.
   */
  function cambiarEstatus(id, datos, usuario) {
    const d = datos || {};
    const pedidos = {};
    [['ESTATUS EQUIPO', d.estatusEquipo, LineasRepo.CATALOGO.estatusEquipo], ['ESTATUS LINEA', d.estatusLinea, LineasRepo.CATALOGO.estatusLinea]]
      .forEach(([columna, valor, lista]) => {
        if (valor === undefined || valor === null || valor === '') return;
        const v = String(valor).trim().toUpperCase();
        if (lista.indexOf(v) < 0) throw new Error(columna + ': el valor no está en la lista.');
        pedidos[columna] = v;
      });
    if (!Object.keys(pedidos).length) throw new Error('Elige el nuevo estatus.');
    const resultado = LineasDatos.conCandado(() => {
      const fila = LineasRepo.leerRegistroObligatorio(id, 'el registro');
      const guardado = LineasRepo.guardarCambiosRegistro(fila, pedidos, usuario, new Date());
      if (!guardado.campos.length) throw new Error('El estatus ya tenía ese valor.');
      const motivo = texto_(d.motivo).trim();
      LineasRepo.registrarMovimiento('EDICION', { motivo: 'Cambio de estatus' + (motivo ? ': ' + motivo : '') }, usuario, new Date(), {
        refs: [id], nuco: LineasUtil.col(fila, 'NUCO'), numero: LineasUtil.col(fila, 'NUMERO TELEFONO'), antes: {}, despues: pedidos,
        detalle: { idsCambios: guardado.idsCambios, idsReasignacion: [], cambios: guardado.campos },
      });
      return guardado;
    });
    return { id: id, cambios: resultado.campos, filas: LineasRepo.refrescarIndice([id]) };
  }

  return { formulario, crear, editar, cambiarEstatus, _elementos: elementos_, _resolver: resolver_, _cumple: cumple_ };
})();
