/**
 * LineasRepo.gs
 * Capa de traducción de Líneas sobre las pestañas del AppSheet (misma estructura).
 *
 * Una fila de `LINEAS TELEFONICAS` es un equipo, una línea o ambos según su TIPO.
 * Aquí se convierte al modelo que usa la interfaz (equipo / línea / responsable) y,
 * al guardar, se traduce de vuelta a columnas + bitácora en el mismo formato que
 * dejaban los bots del AppSheet (CAMBIOS LINEAS TELEFONICAS, HISTORIAL_REASIGNACIONES).
 *
 * Si algún día cambia la estructura de la hoja, solo cambia este archivo.
 */

const LineasRepo = (function () {
  const TAB = {
    LINEAS: 'LINEAS TELEFONICAS',
    CAMBIOS: 'CAMBIOS LINEAS TELEFONICAS',
    REASIG: 'HISTORIAL_REASIGNACIONES',
    DESECHO: 'BITACORA DE DESECHO',
    INSP: 'INSPECCIONES LINEAS',
    RESP: 'RESPONSIVAS LINEAS',
    COLAB: 'COLABORADORES',
    LISTAS: 'LISTAS TELEFONOS',
    REACTIVACION: 'REACTIVACION DE LINEAS',
    SOLICITUD: 'SOLICITUD DE LINEAS',
    // Pestañas propias del nuevo sistema (AppSheet las ignora).
    APP_MOV: 'APP_MOVIMIENTOS',
    APP_EVID: 'APP_EVIDENCIAS',
    // El historial de las hojas nuevas (etapa 3, paso 3, plan §5.5): un renglón por acción. APP_MOVIMIENTOS se queda
    // como está y se pasa en la parte 9 (decisión del usuario, 4-oct); mientras, el historial lee las dos
    MOV: 'MOVIMIENTOS',
  };

  const ENCABEZADOS_APP = {
    APP_MOVIMIENTOS: ['ID', 'FECHA', 'TIPO', 'REFS', 'NUCO', 'NUMERO', 'NUCO_DESTINO', 'MOTIVO', 'TICKET', 'USUARIO_CORREO', 'USUARIO_NOMBRE', 'ANTES_JSON', 'DESPUES_JSON', 'DETALLE_JSON'],
    MOVIMIENTOS: ['ID', 'FECHA', 'ACCION', 'ID EQUIPO', 'ID LINEA', 'ID ASIGNACION', 'COMENTARIO', 'TICKET', 'DOCUMENTO', 'CAMBIOS', 'QUIEN', 'ORIGEN'],
    APP_EVIDENCIAS: ['ID', 'TIPO', 'ORIGEN', 'ID_REGISTRO', 'ID_LINEA', 'NUCO', 'FECHA', 'CARPETA_ID', 'RUTA', 'FOTOS_CARPETA_ID', 'FOTOS', 'PDFS_JSON', 'COINCIDENCIA_EXACTA', 'ALERTAS_JSON', 'ID_ANTERIOR', 'ACTUALIZADO_EN'],
  };

  const TIPOS_CON_EQUIPO = {
    'EQUIPO': 'CELULAR',
    'EQUIPO + SIM': 'CELULAR',
    'EQUIPO + SIM BASICO': 'CELULAR_BASICO',
    'MODEM': 'MODEM',
    'BANDA ANCHA': 'BANDA_ANCHA',
    'CAMARA': 'CAMARA',
  };
  const TIPOS_CON_LINEA = ['EQUIPO + SIM', 'EQUIPO + SIM BASICO', 'LINEA', 'LINEA BASICA', 'MODEM', 'BANDA ANCHA', 'CAMARA'];
  /** Tipos cuyo nombre no cambia al quitar/poner la línea: tienen línea solo si hay número o SIM. */
  const TIPOS_LINEA_OPCIONAL = ['MODEM', 'BANDA ANCHA', 'CAMARA'];

  /** Catálogos del AppSheet (enums de LINEAS TELEFONICAS). */
  const CATALOGO = {
    tipos: ['EQUIPO', 'EQUIPO + SIM', 'EQUIPO + SIM BASICO', 'LINEA', 'LINEA BASICA', 'BANDA ANCHA', 'MODEM', 'CAMARA'],
    // Estatus acordados con Líneas el 30-sep (ya no son los del AppSheet). Los equipos no se cancelan: solo las líneas.
    // Sin acentos, como pide el AppSheet ("MAYÚSCULAS Y SIN ACENTOS"). Los valores viejos que sigan en la hoja se
    // muestran "(no está en la lista)" y Líneas los corrige; la conversión propuesta está en
    // migracion/CONVERSION_ESTATUS_LINEAS.md de la carpeta de documentación.
    // POSIBLE VENTA-DAÑO se quitó (usuario, 4-oct): los 42 que lo tenían regresan a POSIBLE VENTA, el de antes, y se corrigen
    // en Correcciones de Líneas (40 tienen PDF de venta)
    estatusEquipo: ['USO', 'RESGUARDO', 'PARA VENTA', 'PARA DESECHO', 'VENDIDO', 'DONADO', 'DESECHADO', 'EXTRAVIO-ROBO'],
    // Un registro sin línea deja ESTATUS LINEA en blanco (antes "SIN LINEA").
    estatusLinea: ['USO', 'DISPONIBLE', 'EN PROCESO DE CANCELACION', 'CANCELADA'],
    companias: ['TELCEL', 'AT&T', 'BAIT'],
    // Una sola lista (D5.5); "TARJETA SD" en lugar de "SD" (usuario, 4-oct). CARGADOR y SD de antes se quedan como están
    accesorios: ['CAJA', 'CABLE', 'CUBO', 'FUNDA', 'MICA', 'TARJETA SD', 'NINGUNO'],
  };
  /** Valores viejos que hoy significan "sin estatus": el formulario los muestra en blanco. */
  const ESTATUS_EN_BLANCO = { 'ESTATUS LINEA': ['SIN LINEA'], 'ESTATUS EQUIPO': ['N/A'] };
  /**
   * Departamento de lo que no está asignado a nadie (resguardo o libre), pedido de Líneas el 30-sep. Se agrega a la
   * lista; CONTROL INTERNO sigue para lo que usa su propio personal.
   */
  const DEPARTAMENTO_DISPONIBLE = 'DISPONIBLE';

  /** Columnas que describen la línea dentro de una fila. */
  const COLS_LINEA = ['NUMERO TELEFONO', 'NUMERO SIM', 'COMPAÑIA', 'COSTO PLAN', 'INICIO PLAN', 'FIN PLAN', 'ESTATUS LINEA', 'PIN WHATSAPP', 'FECHA CAMBIO TEMPORAL', 'EMAIL USUARIO'];
  /** Valores con los que el área de líneas deja una fila de equipo al quitarle la línea. */
  const VALORES_SIN_LINEA = {
    'NUMERO TELEFONO': 'NO APLICA', 'NUMERO SIM': 'NO APLICA', 'PIN WHATSAPP': 'NO APLICA', 'COMPAÑIA': '',
    'COSTO PLAN': 0, 'INICIO PLAN': '', 'FIN PLAN': '', 'ESTATUS LINEA': '', 'FECHA CAMBIO TEMPORAL': '', 'EMAIL USUARIO': '',
  };
  const COLS_RESPONSABLE = {
    noEmpleado: 'NO EMPLEADO', nombre: 'RESPONSABLE', puesto: 'PUESTO', departamento: 'DEPARTAMENTO', area: 'AREA',
    sede: 'SEDE', oficina: 'OFICINA / DESARROLLO', jefeDirecto: 'JEFE DIRECTO', director: 'DIRECTOR', razonSocial: 'RAZON SOCIAL',
  };
  /** Los 23 campos que registra el bot "CAMBIOS TELEFONIA" del AppSheet (una fila por campo que cambia). */
  const CAMPOS_BITACORA = ['NUMERO TELEFONO', 'RESPONSABLE', 'EQUIPO', 'NUMERO SIM', 'ACCESORIOS', 'SEDE', 'OFICINA / DESARROLLO', 'DEPARTAMENTO',
    'AREA', 'RAZON SOCIAL', 'PIN WHATSAPP', 'PIN EQUIPO', 'CUENTA GOOGLE', 'INICIO PLAN', 'FIN PLAN', 'ESTATUS LINEA', 'ESTATUS EQUIPO',
    'RESPONSIVA', 'TIPO', 'COMPAÑIA', 'COSTO PLAN', 'NUCO', 'COMENTARIOS'];

  const COLS_INDICE_EQUIPOS = ['id', 'nuco', 'tipo', 'modelo', 'imei', 'estatus', 'responsable', 'departamento', 'sede', 'lineaId', 'numero', 'compania', 'estatusLinea', 'tipoHoja'];
  const COLS_INDICE_LINEAS = ['id', 'numero', 'sim', 'compania', 'estatus', 'equipoId', 'nucoEquipo', 'responsable', 'departamento', 'suelta', 'tipoHoja'];
  const SEG_CACHE_INDICE = 30 * 60;
  const CLAVE_INDICE = 'indice_telefonia_v5'; // v5: oficinas con AGS / MTY / SLP completas (3-oct)
  /**
   * Vista de tabla LINEAS TELEFONICAS del AppSheet: sus columnas en su orden (ViewDefinition.ColumnOrder; ID va
   * oculta y "No EMPLEADO" / "NO EMPLEADO" es la misma columna). FOLIO y ESTATUS GENERAL son fórmulas del AppSheet.
   */
  const COLS_VISTA_LINEAS = ['NUMERO TELEFONO', 'NUCO', 'TIPO', 'ESTATUS GENERAL', 'NO EMPLEADO', 'RESPONSABLE', 'PUESTO',
    'NOMBRE RESPONSABLES 2', 'PUESTO RESPONSABLES 2', 'EQUIPO', 'IMEI', 'NUMERO SIM', 'ACCESORIOS', 'SEDE', 'OFICINA / DESARROLLO',
    'DEPARTAMENTO', 'AREA', 'JEFE DIRECTO', 'DIRECTOR', 'FOLIO', 'RAZON SOCIAL', 'PIN WHATSAPP', 'PIN EQUIPO', 'CUENTA GOOGLE',
    'COMPAÑIA', 'COSTO PLAN', 'FECHA REGISTRO', 'INICIO PLAN', 'FIN PLAN', 'ESTATUS LINEA', 'FECHA CAMBIO TEMPORAL',
    'EMAIL USUARIO', 'ESTATUS EQUIPO', 'RESPONSIVA', 'COMENTARIOS', 'FECHA INSPECCION', 'FORMATO INSPECCION'];
  /** Columnas de la vista con secretos (las ven ADMIN y el área de Líneas: TelefoniaService.puedeVerSecretos_). */
  const COLS_VISTA_SECRETAS = ['PIN WHATSAPP', 'PIN EQUIPO'];

  // Atajos (se resuelven al llamar, no al cargar el archivo).
  function txt(v) { return LineasUtil.txt(v); }
  function col(f, c) { return LineasUtil.col(f, c); }
  function fecha(v) { return LineasUtil.fecha(v); }
  function digitos(v) { return LineasUtil.digitos(v); }
  function nuco4(v) { return LineasUtil.nuco4(v); }

  /** TIPO que queda en la fila de un equipo al ponerle línea. */
  function tipoConLinea(tipoEquipo, basico) {
    if (tipoEquipo === 'EQUIPO' || /^EQUIPO \+ SIM/.test(tipoEquipo)) return basico ? 'EQUIPO + SIM BASICO' : 'EQUIPO + SIM';
    return tipoEquipo;
  }

  /** TIPO que queda en la fila de un equipo al quitarle la línea. */
  function tipoSinLinea(tipo) {
    return /^EQUIPO/.test(tipo) ? 'EQUIPO' : tipo;
  }

  // ---------------- Lectura: fila → modelo ----------------

  /** Convierte una fila de LINEAS TELEFONICAS en { id, tipo, nuco, equipo, linea } (null si no tiene ID). */
  function convertirRegistro(f, carpetas) {
    const id = txt(f['ID']);
    if (!id) return null;
    const tipo = (txt(col(f, 'TIPO')) || '').toUpperCase();
    const nuco = nuco4(col(f, 'NUCO'));
    const tieneEquipo = tipo in TIPOS_CON_EQUIPO;
    const tieneLinea = TIPOS_CON_LINEA.indexOf(tipo) >= 0 &&
      (TIPOS_LINEA_OPCIONAL.indexOf(tipo) < 0 || !!(digitos(col(f, 'NUMERO TELEFONO')) || digitos(col(f, 'NUMERO SIM'))));

    const responsable = txt(col(f, 'RESPONSABLE'));
    const esCodigoResguardo = !!(responsable && /^[A-Z]{1,4}-\d+/i.test(responsable));
    const noEmpleado = txt(col(f, 'NO EMPLEADO'));
    const datosResponsable = {
      noEmpleado: noEmpleado === null ? null : String(noEmpleado),
      noEmpleados: noEmpleado ? String(noEmpleado).split('/').map((s) => s.trim()).filter(Boolean) : [],
      nombre: responsable,
      nombres: responsable && !esCodigoResguardo ? responsable.split('/').map((s) => s.trim()).filter(Boolean) : (responsable ? [responsable] : []),
      codigoResguardo: esCodigoResguardo ? responsable : null,
      puesto: txt(col(f, 'PUESTO')),
      departamento: txt(col(f, 'DEPARTAMENTO')),
      area: txt(col(f, 'AREA')),
      sede: txt(col(f, 'SEDE')),
      oficina: txt(col(f, 'OFICINA / DESARROLLO')),
      jefeDirecto: txt(col(f, 'JEFE DIRECTO')),
      director: txt(col(f, 'DIRECTOR')),
      razonSocial: txt(col(f, 'RAZON SOCIAL')),
      usuariosAdicionales: usuariosAdicionales_(f),
    };
    const legado = {
      id: id, idAnterior: txt(col(f, LineasDatos.COL_ID_APPSHEET)), fila: f._fila, folio: folioRegistro(tipo, col(f, 'NUCO')), tipo: tipo || null,
      nuco: txt(col(f, 'NUCO')) === null ? null : LineasUtil.nucoVisible(col(f, 'NUCO')),
      estatusGeneral: estatusGeneralRegistro(idParaDG_(f), tipo, txt(col(f, 'ESTATUS EQUIPO')), txt(col(f, 'ESTATUS LINEA'))),
      comentarios: txt(col(f, 'COMENTARIOS')),
      responsivaRuta: txt(col(f, 'RESPONSIVA')), formatoInspeccionRuta: txt(col(f, 'FORMATO INSPECCION')),
      fechaInspeccion: fecha(col(f, 'FECHA INSPECCION')), fechaRegistro: fecha(col(f, 'FECHA REGISTRO')),
    };
    const sim = digitos(col(f, 'NUMERO SIM'));
    const texto = (c) => { const v = txt(col(f, c)); return v === null ? null : String(v); };

    const equipo = tieneEquipo ? {
      _id: id, nuco: nuco, tipo: TIPOS_CON_EQUIPO[tipo], modelo: txt(col(f, 'EQUIPO')), imei: digitos(col(f, 'IMEI')),
      simResidual: tipo === 'EQUIPO' ? sim : null,
      accesorios: (txt(col(f, 'ACCESORIOS')) || '').split(',').map((s) => s.trim()).filter(Boolean),
      pinEquipo: texto('PIN EQUIPO'), patronRuta: texto('PATRON'), cuentaGoogle: texto('CUENTA GOOGLE'), contrasenaModem: texto('CONTRASEÑA MODEM'),
      color: texto('COLOR'),
      estatus: txt(col(f, 'ESTATUS EQUIPO')), lineaId: tieneLinea ? id : null, responsable: datosResponsable,
      carpetaDriveId: nuco && carpetas ? (carpetas[nuco] || null) : null, legado: legado,
      actualizadoEn: legado.fechaRegistro,
    } : null;

    const estatusLinea = txt(col(f, 'ESTATUS LINEA'));
    const linea = tieneLinea ? {
      _id: id, numero: digitos(col(f, 'NUMERO TELEFONO')), sim: sim, compania: txt(col(f, 'COMPAÑIA')),
      costoPlan: LineasUtil.numero(col(f, 'COSTO PLAN')), inicioPlan: fecha(col(f, 'INICIO PLAN')), finPlan: fecha(col(f, 'FIN PLAN')),
      razonSocial: txt(col(f, 'RAZON SOCIAL')), pinWhatsapp: texto('PIN WHATSAPP'), estatus: estatusLinea,
      usoTemporal: estatusLinea === 'USO TEMPORAL' ? { desde: fecha(col(f, 'FECHA CAMBIO TEMPORAL')), correo: txt(col(f, 'EMAIL USUARIO')) } : null,
      equipoId: tieneEquipo ? id : null,
      responsable: tieneEquipo ? null : datosResponsable, // solo si la línea está suelta
      nucoLegado: tieneEquipo ? null : nuco, legado: legado,
    } : null;

    // Columna virtual DETALLES LINEAS TELEFONICAS del AppSheet: los valores tal cual están en la fila
    const crudo = (c) => {
      const v = col(f, c);
      return v === null || v === undefined ? '' : (v instanceof Date ? v : String(v).trim());
    };
    const detalles = {
      nuco: LineasUtil.nucoVisible(crudo('NUCO')) || '', responsable: crudo('RESPONSABLE'), imei: crudo('IMEI'), sim: crudo('NUMERO SIM'),
      numero: crudo('NUMERO TELEFONO'), modelo: crudo('EQUIPO'), compania: crudo('COMPAÑIA'), razonSocial: crudo('RAZON SOCIAL'),
      finPlan: crudo('FIN PLAN'), estatusLinea: estatusLinea || '',
    };

    return { id: id, tipo: tipo, nuco: nuco, equipo: equipo, linea: linea, detalles: detalles };
  }

  /**
   * "Quien usa el equipo" y segundo…quinto responsable, como lista. No se lista a quien es el mismo responsable:
   * el AppSheet lo copiaba en "quien usa" cuando él mismo usa el equipo (NUCO 0234; PLAN_REESTRUCTURA_LINEAS.md §3.7).
   */
  function usuariosAdicionales_(f) {
    const lista = [];
    const mismo = (a, b) => String(a || '').replace(/\s+/g, ' ').trim().toUpperCase() === String(b || '').replace(/\s+/g, ' ').trim().toUpperCase();
    const responsable = txt(col(f, 'RESPONSABLE'));
    const agregar = (rol, nombre, puesto) => {
      const n = txt(col(f, nombre));
      if (n && !mismo(n, responsable)) lista.push({ rol: rol, nombre: n, puesto: txt(col(f, puesto)) });
    };
    agregar('USA EL EQUIPO', 'NOMBRE QUIEN USA', 'PUESTO QUIEN USA');
    agregar('SEGUNDO', 'NOMBRE SEGUNDO RESPONSABLE', 'PUESTO SEGUNDO RESPONSABLE');
    agregar('TERCERO', 'NOMBRE TERCER RESPONSABLE', 'PUESTO TERCER RESPONSABLE');
    agregar('CUARTO', 'NOMBRE CUARTO RESPONSABLE', 'PUESTO CUARTO RESPONSABLE');
    agregar('QUINTO', 'NOMBRE QUINTO RESPONSABLE', 'PUESTO QUINTO RESPONSABLE');
    return lista;
  }

  /** Fórmula FOLIO del AppSheet. */
  function folioRegistro(tipo, nuco) {
    const prefijo = { 'EQUIPO + SIM': 'EQS', 'LINEA': 'LIN', 'MODEM': 'MOD', 'CAMARA': 'CAM', 'BANDA ANCHA': 'BAN', 'EQUIPO': 'EQP' }[tipo] || '';
    return prefijo + ('0000' + (nuco === null || nuco === undefined ? '' : String(nuco))).slice(-4);
  }

  /**
   * ID con el que la fórmula reconoce al personal de DG (DG001, DG002…). Tras la migración de IDs ese valor quedó en
   * ID APPSHEET y el ID es LIN-…
   */
  function idParaDG_(f) {
    return txt(col(f, LineasDatos.COL_ID_APPSHEET)) || txt(f['ID']);
  }

  /** Fórmula ESTATUS GENERAL del AppSheet. */
  function estatusGeneralRegistro(id, tipo, estatusEquipo, estatusLinea) {
    if (/^DG/i.test(id || '')) return 'PERSONAL DG';
    if (tipo === 'EQUIPO') {
      return { 'ESPERA DE RESPONSIVA': 'USO', 'EN ENVIO': 'USO', 'VENTA': 'RESGUARDO', 'DESECHADO': 'DESECHO' }[estatusEquipo] || estatusEquipo || '';
    }
    if (['EQUIPO + SIM', 'LINEA', 'MODEM', 'BANDA ANCHA'].indexOf(tipo) >= 0) {
      return { 'ESPERA DE RESPONSIVA': 'USO', 'SIN LINEA': 'CANCELADA', 'EN PROCESO DE CANCELACION': 'CANCELADA' }[estatusLinea] || estatusLinea || '';
    }
    return '';
  }

  // ---------------- Índices de listados (caché) ----------------

  function filaIndiceEquipo_(equipo, linea) {
    const r = equipo.responsable || {};
    return [equipo._id, equipo.nuco || null, equipo.tipo || null, equipo.modelo || null, equipo.imei || null, equipo.estatus || null,
      r.nombre || null, r.departamento || null, r.sede || null,
      equipo.lineaId || null, linea ? linea.numero || null : null, linea ? linea.compania || null : null, linea ? linea.estatus || null : null,
      (equipo.legado || {}).tipo || null]; // tipoHoja: TIPO tal cual en la hoja (reglas de formato del AppSheet)
  }

  function filaIndiceLinea_(linea, equipo) {
    const r = (equipo ? equipo.responsable : linea.responsable) || {};
    return [linea._id, linea.numero || null, linea.sim || null, linea.compania || null, linea.estatus || null, linea.equipoId || null,
      equipo ? equipo.nuco || null : linea.nucoLegado || null, r.nombre || null, r.departamento || null, !linea.equipoId,
      ((equipo || linea).legado || {}).tipo || null];
  }

  /** Valores de la fila para la vista de tabla del AppSheet: [id, …COLS_VISTA_LINEAS]. */
  function filaVista_(f, r) {
    const legado = ((r.equipo || r.linea) || {}).legado || {};
    return [r.id].concat(COLS_VISTA_LINEAS.map((c) => {
      if (c === 'FOLIO') return legado.folio || null;
      if (c === 'ESTATUS GENERAL') return legado.estatusGeneral || null;
      const v = col(f, c);
      if (v === '' || v === null || v === undefined) return null;
      if (v instanceof Date) return v;
      if (c === 'NUCO') return LineasUtil.nucoVisible(v); // siempre a 4 dígitos
      // Identificadores y textos como texto (un IMEI o SIM numérico no se debe redondear); COSTO PLAN, número
      return typeof v === 'number' && c !== 'COSTO PLAN' ? String(v) : v;
    }));
  }

  /** Índices de equipos y líneas + columnas de la vista de tabla del AppSheet (1 lectura de la pestaña; caché 30 min). */
  function indice(forzar) {
    const inicio = Date.now();
    if (!forzar) {
      const enCache = LineasDatos.cacheLeer(CLAVE_INDICE);
      if (enCache) { LineasDatos.tiempo('índice (de la caché)', inicio); return enCache; }
    }
    const equipos = [];
    const lineas = [];
    const vista = [];
    LineasDatos.leerTabla(TAB.LINEAS).forEach((f) => {
      const r = convertirRegistro(f);
      if (!r) return;
      if (r.equipo) equipos.push(filaIndiceEquipo_(r.equipo, r.linea));
      if (r.linea) lineas.push(filaIndiceLinea_(r.linea, r.equipo));
      if (r.equipo || r.linea) vista.push(filaVista_(f, r));
    });
    const ix = LineasUtil.paraCliente({
      equipos: { columnas: COLS_INDICE_EQUIPOS, filas: equipos },
      lineas: { columnas: COLS_INDICE_LINEAS, filas: lineas },
      vista: { columnas: COLS_VISTA_LINEAS, secretas: COLS_VISTA_SECRETAS, filas: vista },
      generadoEn: new Date(),
    });
    LineasDatos.cacheGuardar(CLAVE_INDICE, ix, SEG_CACHE_INDICE);
    LineasDatos.tiempo('índice (armado completo)', inicio);
    return ix;
  }

  /**
   * Tras una operación: vuelve a leer los registros tocados y actualiza la caché del índice.
   * Devuelve { equipos: [filas], lineas: [filas], quitar: { equipos: [ids], lineas: [ids] } } para que la
   * interfaz se actualice sin recargar (un registro puede dejar de ser línea o desaparecer).
   */
  function refrescarIndice(ids) {
    const inicio = Date.now();
    try { return refrescarIndice_(ids); } finally { LineasDatos.tiempo('índice (solo los tocados)', inicio); }
  }

  function refrescarIndice_(ids) {
    const cambios = { equipos: [], lineas: [], vista: [], quitar: { equipos: [], lineas: [] } };
    const ix = LineasDatos.cacheLeer(CLAVE_INDICE);
    // Hojas nuevas: una línea que se separa de su equipo aparece como registro aparte
    const todos = (ids || []).concat(LineasLectura.activo() ? LineasEscritura.tocados() : []);
    todos.filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).forEach((id) => {
      const f = leerRegistroPorId(id);
      const r = f ? convertirRegistro(f) : null;
      if (ix) {
        ix.equipos.filas = ix.equipos.filas.filter((x) => x[0] !== id);
        ix.lineas.filas = ix.lineas.filas.filter((x) => x[0] !== id);
        if (ix.vista) ix.vista.filas = ix.vista.filas.filter((x) => x[0] !== id);
      }
      // La fila de la vista de tabla: también para la pantalla, que cambia solo estos registros (rapidez, paso 2)
      if (r && (r.equipo || r.linea)) {
        const fv = LineasUtil.paraCliente(filaVista_(f, r));
        cambios.vista.push(fv);
        if (ix && ix.vista) ix.vista.filas.push(fv);
      }
      if (r && r.equipo) {
        const fe = LineasUtil.paraCliente(filaIndiceEquipo_(r.equipo, r.linea));
        cambios.equipos.push(fe);
        if (ix) ix.equipos.filas.push(fe);
      } else {
        cambios.quitar.equipos.push(id);
      }
      if (r && r.linea) {
        const fl = LineasUtil.paraCliente(filaIndiceLinea_(r.linea, r.equipo));
        cambios.lineas.push(fl);
        if (ix) ix.lineas.filas.push(fl);
      } else {
        cambios.quitar.lineas.push(id);
      }
    });
    if (ix) LineasDatos.cacheGuardar(CLAVE_INDICE, ix, SEG_CACHE_INDICE);
    return cambios;
  }

  // ---------------- IDs de antes y después de la migración ----------------

  const CLAVE_IDS = 'ids_lineas_v2'; // v2: también ID ANTERIOR (corrida de IDs del 30-sep)

  /**
   * { viejo: {ID anterior → ID}, nuevo: {ID → [IDs anteriores]} } de LINEAS TELEFONICAS (claves en minúsculas).
   * Cada corrida de IDs deja el ID de antes en una columna: ID APPSHEET (el del AppSheet) e ID ANTERIOR (el LIN-… del
   * 29-sep, desde la corrida del 30-sep). Las pestañas que citan al registro (inspecciones, responsivas, bitácoras,
   * APP_*) pueden seguir con cualquiera de ellos hasta que se reescriban.
   */
  function equivalenciasIds_() {
    const enCache = LineasDatos.cacheLeer(CLAVE_IDS);
    if (enCache && enCache.viejo) return enCache;
    const m = { viejo: {}, nuevo: {} };
    LineasDatos.leerTabla(TAB.LINEAS).forEach((f) => {
      const ids = LineasDatos.idsDeFila(f);
      if (ids.length < 2) return;
      ids.slice(1).forEach((k) => { m.viejo[k.toLowerCase()] = ids[0]; });
      m.nuevo[ids[0].toLowerCase()] = ids.slice(1);
    });
    LineasDatos.cacheGuardar(CLAVE_IDS, m, 6 * 3600); // los registros nuevos no traen ID viejo: no hay que invalidarla
    return m;
  }

  /** ID vigente de un registro citado con su ID actual o con uno anterior. */
  function idActual(id) {
    const t = txt(id);
    if (!t) return t;
    return equivalenciasIds_().viejo[String(t).toLowerCase()] || String(t);
  }

  /** Todos los IDs con los que las demás pestañas pueden citar al registro: [ID, ID ANTERIOR, ID APPSHEET]. */
  function idsDeRegistro(id) {
    const actual = idActual(id);
    if (!actual) return [];
    const viejos = equivalenciasIds_().nuevo[actual.toLowerCase()];
    return [actual].concat(Array.isArray(viejos) ? viejos : (viejos ? [viejos] : []));
  }

  function leerRegistroPorId(id) {
    const filas = LineasDatos.buscarFilasPorId(TAB.LINEAS, id);
    if (!filas.length) return null;
    if (filas.length > 1) throw new Error('El ID ' + id + ' está repetido en LINEAS TELEFONICAS (filas ' + filas.join(', ') + ').');
    return LineasDatos.leerFilas([{ tabla: TAB.LINEAS, filas: filas }])[0][0];
  }

  function leerRegistroObligatorio(id, descripcion) {
    const f = id ? leerRegistroPorId(id) : null;
    if (!f) throw new Error('No existe ' + (descripcion || 'el registro') + ' (' + id + ').');
    return f;
  }

  // ---------------- Escritura: modelo → columnas + bitácora ----------------

  function normalizarComparacion_(v) {
    if (v instanceof Date) return 'D' + v.getTime();
    if (v === null || v === undefined) return '';
    return String(v).trim().toUpperCase();
  }

  function textoBitacora_(v) {
    if (v instanceof Date) return Utilities.formatDate(v, LineasDatos.ZONA_APP, 'dd/MM/yyyy');
    return v === null || v === undefined ? '' : String(v);
  }

  /**
   * Aplica cambios de columnas a una fila de LINEAS TELEFONICAS (recién leída, dentro del candado)
   * y registra la bitácora como los bots del AppSheet. Recalcula FOLIO y ESTATUS GENERAL si existen.
   * usuario = { correo, nombre }. Devuelve { idsCambios, idReasignacion, campos: [{campo, antes, despues}], refs }.
   * Reestructura, etapa 3: con el interruptor de la etapa 2 encendido, los cambios van a las hojas nuevas
   * (LineasEscritura) y `refs` trae los IDs de equipo, línea, adendum y asignaciones que tocó (para APP_MOVIMIENTOS).
   * opciones.tolerante: lo que no tiene dónde guardarse en las hojas nuevas se ignora (la inspección).
   */
  function guardarCambiosRegistro(f, cambios, usuario, ahora, opciones) {
    if (LineasLectura.activo()) return LineasEscritura.guardar(f, cambios, usuario, ahora, opciones);
    const t = LineasDatos.tablaFresca(TAB.LINEAS);
    const efectivos = [];
    const soloFormato = {}; // NUCO "5" → "0005": se escribe homologado, pero no es un cambio para la bitácora
    const nuevo = Object.assign({}, f);
    Object.keys(cambios).forEach((c) => {
      if (LineasDatos.colIndice(t, c) < 0) return;
      const antes = col(f, c);
      if (normalizarComparacion_(antes) === normalizarComparacion_(cambios[c])) return;
      nuevo[t.encabezados[LineasDatos.colIndice(t, c)]] = cambios[c];
      if (LineasDatos.normCol(c) === 'NUCO' && LineasUtil.nucoVisible(antes) === LineasUtil.nucoVisible(cambios[c])) {
        soloFormato[c] = cambios[c];
        return;
      }
      efectivos.push({ campo: c, antes: antes, despues: cambios[c] });
    });
    if (!efectivos.length && !Object.keys(soloFormato).length) return { idsCambios: [], idReasignacion: null, campos: [] };

    const escribir = Object.assign({}, soloFormato);
    efectivos.forEach((e) => { escribir[e.campo] = e.despues; });
    const tipoNuevo = (txt(col(nuevo, 'TIPO')) || '').toUpperCase();
    if (LineasDatos.colIndice(t, 'FOLIO') >= 0) escribir['FOLIO'] = folioRegistro(tipoNuevo, col(nuevo, 'NUCO'));
    if (LineasDatos.colIndice(t, 'ESTATUS GENERAL') >= 0) {
      escribir['ESTATUS GENERAL'] = estatusGeneralRegistro(idParaDG_(f), tipoNuevo, txt(col(nuevo, 'ESTATUS EQUIPO')), txt(col(nuevo, 'ESTATUS LINEA')));
    }
    conPersona_(t, escribir, nuevo);
    LineasDatos.actualizarFila(TAB.LINEAS, f._fila, escribir);

    const bitacora = efectivos.filter((e) => CAMPOS_BITACORA.indexOf(LineasDatos.normCol(e.campo)) >= 0).map((e) => ({
      // NUCO e IMEI ya actualizados, como [NUCO] / [IMEI] en las acciones del bot
      'ID': idCambio_(), 'ID_LINEA': f['ID'], 'NUCO': LineasUtil.nucoVisible(col(nuevo, 'NUCO')) || '', 'IMEI': col(nuevo, 'IMEI'), 'TABLA': TAB.LINEAS,
      'CAMPO': e.campo, 'ANTES': textoBitacora_(e.antes), 'DESPUES': textoBitacora_(e.despues),
      'ACTUALIZADO POR': usuario.nombre, 'FECHA ACTUALIZACION': ahora,
    }));
    // Mismo valor en ID y en ID_CAMBIO: la hoja tiene una u otra según esté o no migrada
    bitacora.forEach((b) => { b['ID_CAMBIO'] = b['ID']; });
    LineasDatos.agregarFilas(TAB.CAMBIOS, bitacora);

    // HISTORIAL_REASIGNACIONES ya no se escribe (módulo retirado el 30-sep): el cambio de responsable queda en la
    // bitácora CAMBIOS y en el movimiento de APP_MOVIMIENTOS de la operación.
    const idReasignacion = null;
    return {
      idsCambios: bitacora.map((b) => b['ID']),
      idReasignacion: idReasignacion,
      campos: efectivos.map((e) => ({ campo: e.campo, antes: textoBitacora_(e.antes), despues: textoBitacora_(e.despues) })),
      refs: [f['ID']],
    };
  }

  /**
   * Nueva fila en LINEAS TELEFONICAS (con FOLIO / ESTATUS GENERAL calculados).
   * Reestructura, etapa 3: con el interruptor encendido crea equipo, línea, adendum y asignación en las hojas nuevas
   * (LineasEscritura), pone en datos.ID el ID del registro y regresa { id, refs }.
   */
  function agregarRegistro(datos) {
    if (LineasLectura.activo()) return LineasEscritura.agregar(datos);
    const t = LineasDatos.tablaFresca(TAB.LINEAS);
    const tipo = (datos['TIPO'] || '').toUpperCase();
    if (LineasDatos.colIndice(t, 'FOLIO') >= 0) datos['FOLIO'] = folioRegistro(tipo, datos['NUCO']);
    if (LineasDatos.colIndice(t, 'ESTATUS GENERAL') >= 0) datos['ESTATUS GENERAL'] = estatusGeneralRegistro(datos['ID'], tipo, txt(datos['ESTATUS EQUIPO']), txt(datos['ESTATUS LINEA']));
    conPersona_(t, datos, datos);
    return LineasDatos.agregarFilas(TAB.LINEAS, [datos])[0];
  }

  const personas_ = {}; // por ejecución: un resguardo o reasignación masiva calcula una sola vez por persona

  /**
   * ID PERSONA (catálogo de Ayrton, Capital Humano): no se captura, se calcula del responsable como en Vehículos y
   * Caja Chica (CapitalHumano.idPara). Solo si en `escribir` cambia alguna columna de la persona (RESPONSABLE,
   * NO EMPLEADO, EMAIL USUARIO) y la hoja ya tiene la columna. null = todavía no hay PERSONAS: no se toca.
   */
  function conPersona_(t, escribir, registro) {
    if (typeof CapitalHumano === 'undefined' || LineasDatos.colIndice(t, CapitalHumano.COLUMNA) < 0) return;
    Object.keys(escribir).forEach((c) => { if (LineasDatos.normCol(c) === CapitalHumano.COLUMNA) delete escribir[c]; });
    const columnas = CapitalHumano.columnasDePersona(TAB.LINEAS);
    const norm = columnas.map(LineasDatos.normCol);
    if (!Object.keys(escribir).some((c) => norm.indexOf(LineasDatos.normCol(c)) >= 0)) return;
    const persona = {};
    columnas.forEach((c) => { persona[c] = txt(col(registro, c)) || ''; });
    const clave = JSON.stringify(persona);
    try {
      if (!(clave in personas_)) personas_[clave] = CapitalHumano.idPara(TAB.LINEAS, persona);
      if (personas_[clave] !== null) escribir[CapitalHumano.COLUMNA] = personas_[clave];
    } catch (err) {
      console.error('CapitalHumano: no se pudo calcular la persona de la línea: ' + err.message);
    }
  }

  /** ID de una fila de la bitácora CAMBIOS (CLI-…). */
  function idCambio_() {
    return LineasDatos.nuevoId(TAB.CAMBIOS);
  }

  /**
   * Registro de la acción en el historial. Con las hojas nuevas (etapa 3, paso 3, §5.5), un renglón en MOVIMIENTOS; sin
   * ellas, APP_MOVIMIENTOS como antes. datos = { motivo (el comentario, sin el nombre de la acción delante), ticket };
   * extra = { refs, detalle: { cambios, inspeccionId, responsivaId }, despues, origen }.
   */
  function registrarMovimiento(tipo, datos, usuario, ahora, extra) {
    if (typeof LineasLectura !== 'undefined' && LineasLectura.activo()) return registrarEnMovimientos_(tipo, datos, usuario, ahora, extra || {});
    asegurarPestanaApp(TAB.APP_MOV);
    const id = LineasDatos.nuevoId(TAB.APP_MOV);
    LineasDatos.agregarFilas(TAB.APP_MOV, [{
      'ID': id, 'FECHA': ahora, 'TIPO': tipo, 'REFS': ',' + (extra.refs || []).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(',') + ',',
      'NUCO': LineasUtil.nucoVisible(extra.nuco) || '', 'NUMERO': extra.numero || '', 'NUCO_DESTINO': LineasUtil.nucoVisible(extra.nucoDestino) || '',
      'MOTIVO': txt(datos.motivo) || '', 'TICKET': txt(datos.ticket) || '',
      'USUARIO_CORREO': usuario.correo, 'USUARIO_NOMBRE': usuario.nombre,
      'ANTES_JSON': JSON.stringify(extra.antes || {}), 'DESPUES_JSON': JSON.stringify(extra.despues || {}),
      'DETALLE_JSON': JSON.stringify(extra.detalle || {}),
    }]);
    return id;
  }

  /** Lo que no es un cambio en el alta: IDs, campos calculados y los de la pantalla (empiezan con _). */
  const NO_VA_EN_ALTA = ['ID', 'ID ANTERIOR', 'ID APPSHEET', 'FOLIO', 'FECHA REGISTRO', 'ESTATUS GENERAL', 'ID PERSONA'];

  /**
   * Un renglón de MOVIMIENTOS: ID, FECHA, ACCION, ID EQUIPO, ID LINEA, ID ASIGNACION (las que tocó), COMENTARIO, TICKET,
   * DOCUMENTO (la inspección o la responsiva), CAMBIOS (lo que cambió, antes → después), QUIEN (nombre · correo) y ORIGEN.
   */
  function registrarEnMovimientos_(tipo, datos, usuario, ahora, extra) {
    asegurarPestanaApp(TAB.MOV);
    const detalle = extra.detalle || {};
    let cambios = (detalle.cambios || []).map((c) => ({ campo: c.campo, antes: textoBitacora_(c.antes), despues: textoBitacora_(c.despues) }));
    if (tipo === 'ALTA') {
      const v = extra.despues || {};
      // Sin número ni SIM no hay línea: el tipo de línea que trae el formulario por omisión no es un cambio
      const conLinea = textoBitacora_(v['NUMERO TELEFONO']).trim() !== '' || textoBitacora_(v['NUMERO SIM']).trim() !== '';
      cambios = Object.keys(v).filter((c) => c.charAt(0) !== '_' && NO_VA_EN_ALTA.indexOf(LineasDatos.normCol(c)) < 0 && textoBitacora_(v[c]).trim() !== '' &&
        (conLinea || LineasDatos.normCol(c) !== 'TIPO DE LINEA'))
        .map((c) => ({ campo: c, antes: '', despues: LineasDatos.normCol(c) === 'NUCO' ? LineasUtil.nucoVisible(v[c]) || textoBitacora_(v[c]) : textoBitacora_(v[c]) }));
    }
    const p = partesDeRefs_(extra.refs || []);
    const id = Ids.nuevo(PREFIJO_MOVIMIENTOS);
    LineasDatos.agregarFilas(TAB.MOV, [{
      'ID': id, 'FECHA': ahora, 'ACCION': tipo, 'ID EQUIPO': p.equipo.join(', '), 'ID LINEA': p.linea.join(', '),
      'ID ASIGNACION': p.asignacion.join(', '), 'COMENTARIO': txt(datos.motivo) || '', 'TICKET': txt(datos.ticket) || '',
      'DOCUMENTO': detalle.inspeccionId || detalle.responsivaId || '', 'CAMBIOS': cambios.length ? JSON.stringify(cambios) : '',
      'QUIEN': [usuario.nombre, usuario.correo].filter(Boolean).join(' · '), 'ORIGEN': extra.origen || ORIGEN_A_MANO,
    }]);
    return id;
  }
  const PREFIJO_MOVIMIENTOS = 'MVT';
  const ORIGEN_A_MANO = 'A MANO';

  /**
   * Equipo, línea y asignaciones que tocó una acción, de los IDs que regresa la escritura (refs). Se reconocen en las
   * hojas que la escritura ya tiene en memoria; si la acción no escribió (una inspección sin cambios), por el registro.
   */
  function partesDeRefs_(refs) {
    const p = { equipo: [], linea: [], asignacion: [] };
    const poner = (k, v) => { const x = String(v === null || v === undefined ? '' : v).trim(); if (x && p[k].indexOf(x) < 0) p[k].push(x); };
    const mem = typeof LineasEscritura !== 'undefined' ? LineasEscritura.hojasEnMemoria() : null;
    const ids = (hoja) => { const o = {}; ((mem && mem[hoja]) || []).forEach((r) => { if (r['ID']) o[String(r['ID'])] = true; }); return o; };
    const E = ids('EQUIPOS');
    const L = ids('LINEAS');
    const A = ids('ASIGNACIONES');
    const D = ids('ADENDUMS');
    let registros = null;
    refs.filter(Boolean).map((r) => String(r).trim()).forEach((r) => {
      if (E[r]) return poner('equipo', r);
      if (L[r]) return poner('linea', r);
      if (A[r]) return poner('asignacion', r);
      if (D[r] || /^ADE-/i.test(r)) return;
      if (!registros) {
        registros = {};
        LineasLectura.filas().forEach((f) => { registros[String(f['ID'])] = f; });
      }
      const f = registros[r];
      if (!f) return;
      poner('equipo', f['ID EQUIPO']);
      poner('linea', f['ID LINEA']);
      poner('asignacion', f['ID ASIGNACION']);
    });
    return p;
  }

  function asegurarPestanaApp(nombre) {
    if (!LineasDatos.existeTabla(nombre)) LineasDatos.asegurarPestana(nombre, ENCABEZADOS_APP[nombre]);
  }

  // ---------------- Evidencias, inspecciones, responsivas e historial ----------------

  function evidenciaDesdeFila(f) {
    const json = (c, porDefecto) => { try { return JSON.parse(col(f, c) || ''); } catch (e) { return porDefecto; } };
    return {
      id: txt(f['ID']), tipo: txt(f['TIPO']), origen: txt(f['ORIGEN']), idRegistro: txt(f['ID_REGISTRO']), idLinea: txt(f['ID_LINEA']),
      nuco: txt(f['NUCO']), fecha: fecha(f['FECHA']) || (txt(f['FECHA']) ? new Date(f['FECHA']) : null),
      carpetaId: txt(f['CARPETA_ID']), ruta: txt(f['RUTA']), fotosCarpetaId: txt(f['FOTOS_CARPETA_ID']), fotos: Number(f['FOTOS']) || 0,
      pdfs: json('PDFS_JSON', []), coincidenciaExacta: String(f['COINCIDENCIA_EXACTA']).toUpperCase() !== 'FALSE', _fila: f._fila,
    };
  }

  function driveDeEvidencia_(ev) {
    return ev ? { carpetaId: ev.carpetaId, ruta: ev.ruta, pdfs: ev.pdfs || [], fotosCarpetaId: ev.fotosCarpetaId, fotos: ev.fotos, coincidenciaExacta: ev.coincidenciaExacta } : null;
  }

  /** Inspección (fila de INSPECCIONES LINEAS) en el modelo de la interfaz. */
  function inspeccionDesdeFila(f, ev) {
    const checklist = {};
    LineasChecklist.puntos().forEach((p) => {
      const v = txt(col(f, p.columna));
      if (v !== null && v !== undefined) checklist[p.clave] = String(v).toUpperCase();
    });
    const ticket = txt(col(f, 'TICKET'));
    return {
      _id: txt(f['ID']), _idsAnteriores: LineasDatos.idsDeFila(f).slice(1), origen: ev && ev.origen === 'SISTEMA' ? 'SISTEMA' : 'APPSHEET',
      registroId: idActual(col(f, 'ID LINEA')),
      nuco: nuco4(col(f, 'NUCO')), fecha: fecha(col(f, 'FECHA DE REGISTRO')), tipoRegistro: txt(col(f, 'TIPO')),
      snapshot: {
        responsable: txt(col(f, 'RESPONSABLE')), departamento: txt(col(f, 'DEPARTAMENTO')), area: txt(col(f, 'AREA')),
        sede: txt(col(f, 'SEDE')), oficina: txt(col(f, 'OFICINA / DESARROLLO')), puesto: txt(col(f, 'PUESTO')),
        jefeDirecto: txt(col(f, 'JEFE DIRECTO')), correo: txt(col(f, 'CORREO')), numero: digitos(col(f, 'No TELEFONO')),
        imei: digitos(col(f, 'IMEI')), sim: digitos(col(f, 'SIM')), modelo: txt(col(f, 'MODELO')), color: txt(col(f, 'COLOR')),
        compania: txt(col(f, 'COMPAÑIA')), plan: txt(col(f, 'PLAN')), razonSocial: txt(col(f, 'RAZON SOCIAL')),
      },
      checklist: checklist, otraApp: txt(col(f, 'OTRA')), calificacion: LineasUtil.numero(col(f, 'CALIFICACION')),
      tipoContrasena: txt(col(f, 'PIN EQUIPO')) === 'PATRON' ? 'PATRON' : (txt(col(f, 'PIN EQUIPO')) ? 'PIN' : null),
      pinEquipo: txt(col(f, 'PIN EQUIPO')), patronRuta: txt(col(f, 'PATRON')),
      observaciones: txt(col(f, 'COMENTARIO')), ticket: ticket === null ? null : String(ticket), inspector: txt(col(f, 'NOMBRE INSPECTOR')),
      firmas: { responsableRuta: txt(col(f, 'FIRMA RESPONSABLE')), inspectorRuta: txt(col(f, 'FIRMA INSPECTOR')) },
      pdfRuta: txt(col(f, 'FORMATO INSPECCIONES LINEAS')),
      drive: driveDeEvidencia_(ev),
      pdf: ev && ev.pdfs && ev.pdfs.length ? { id: ev.pdfs[0].id, nombre: ev.pdfs[0].nombre } : null,
    };
  }

  /** Inspección histórica que solo existe como carpeta en Drive. */
  function inspeccionDesdeEvidencia(ev) {
    return {
      _id: 'drive_' + ev.carpetaId, origen: 'DRIVE', registroId: idActual(ev.idLinea), nuco: ev.nuco, fecha: ev.fecha,
      checklist: {}, calificacion: null, drive: driveDeEvidencia_(ev),
    };
  }

  function responsivaDesdeFila(f, ev) {
    let fch = fecha(col(f, 'FECHA RESPONSIVA'));
    if (!fch) {
      const dia = Number(col(f, 'DIA'));
      const mes = LineasUtil.mesNumero(col(f, 'MES'));
      const anio = Number(col(f, 'AÑO'));
      if (dia && mes && anio) fch = new Date(anio, mes - 1, dia, 12);
    }
    return {
      _id: txt(f['ID']), _idsAnteriores: LineasDatos.idsDeFila(f).slice(1), origen: ev && ev.origen === 'SISTEMA' ? 'SISTEMA' : 'APPSHEET',
      registroId: idActual(col(f, 'ID LINEA')),
      nuco: nuco4(col(f, 'NUCO')), fecha: fch,
      responsable: { nombre: txt(col(f, 'RESPONSABLE')) },
      responsableCI: txt(col(f, 'NOMBRE CI')), drive: driveDeEvidencia_(ev),
      pdf: ev && ev.pdfs && ev.pdfs.length ? { id: ev.pdfs[0].id } : null,
      pdfRuta: txt(col(f, 'FORMATO RESPONSIVA')),
      // Para su página (usuario, 6-oct): lo que dice la responsiva de ese día, como el snapshot de la inspección
      snapshot: {
        responsable: txt(col(f, 'RESPONSABLE')), noEmpleado: txt(col(f, 'No EMPLEADO')), puesto: txt(col(f, 'PUESTO')),
        departamento: txt(col(f, 'DEPARTAMENTO')), area: txt(col(f, 'AREA')), sede: txt(col(f, 'SEDE')),
        oficina: txt(col(f, 'OFICINA / DESARROLLO')), director: txt(col(f, 'DIRECTOR')), correo: txt(col(f, 'CORREO')),
        identificacion: txt(col(f, 'IDENTIFICACION')), numero: digitos(col(f, 'No TELEFONO')), imei: digitos(col(f, 'IMEI')),
        sim: digitos(col(f, 'SIM')), modelo: txt(col(f, 'MODELO')), color: txt(col(f, 'COLOR')), compania: txt(col(f, 'COMPAÑIA')),
        razonSocial: txt(col(f, 'RAZON SOCIAL')),
      },
      accesorios: txt(col(f, 'ACCESORIOS')), comentario: txt(col(f, 'COMENTARIO')),
    };
  }

  /** Responsiva que solo existe como carpeta en Drive. */
  function responsivaDesdeEvidencia(ev) {
    return { _id: 'drive_' + ev.carpetaId, origen: 'DRIVE', registroId: idActual(ev.idLinea), nuco: ev.nuco, fecha: ev.fecha, drive: driveDeEvidencia_(ev) };
  }

  /**
   * Inspecciones y responsivas de un registro (fila de LINEAS TELEFONICAS):
   * las del AppSheet/sistema (por ID LINEA) + las históricas solo en Drive (por NUCO).
   */
  function evidenciasDeRegistro(id) {
    const ids = idsDeRegistro(id);
    const hayApp = LineasDatos.existeTabla(TAB.APP_EVID);
    const peticiones = [
      { tabla: TAB.INSP, filas: LineasDatos.buscarFilasVarios(TAB.INSP, 'ID LINEA', ids) },
      { tabla: TAB.RESP, filas: LineasDatos.buscarFilasVarios(TAB.RESP, 'ID LINEA', ids) },
    ];
    // Las carpetas históricas (solo Drive) quedan con ID_LINEA del equipo de su NUCO al sincronizar.
    if (hayApp) peticiones.push({ tabla: TAB.APP_EVID, filas: LineasDatos.buscarFilasVarios(TAB.APP_EVID, 'ID_LINEA', ids) });
    const r = LineasDatos.leerFilas(peticiones);
    const evidencias = hayApp ? r[2].map(evidenciaDesdeFila) : [];
    const evPorRegistro = {};
    evidencias.forEach((e) => { if (e.idRegistro) evPorRegistro[e.idRegistro] = e; });
    const evDe = (f) => LineasDatos.idsDeFila(f).map((k) => evPorRegistro[k]).filter(Boolean)[0];

    const inspecciones = r[0].map((f) => inspeccionDesdeFila(f, evDe(f)));
    const responsivas = r[1].map((f) => responsivaDesdeFila(f, evDe(f)));
    evidencias.forEach((e) => {
      if (e.origen !== 'DRIVE') return;
      if (e.idLinea && idActual(e.idLinea) !== ids[0]) return;
      if (e.tipo === 'INSPECCION') inspecciones.push(inspeccionDesdeEvidencia(e));
      else responsivas.push(responsivaDesdeEvidencia(e));
    });
    return { inspecciones: inspecciones, responsivas: responsivas };
  }

  /** Inspección por id: fila de INSPECCIONES LINEAS, o "drive_<carpetaId>" si solo existe en Drive. */
  function leerInspeccion(id) {
    if (/^drive_/.test(id)) {
      if (!LineasDatos.existeTabla(TAB.APP_EVID)) return null; // sin la pestaña: se lee de NUCOS (TelefoniaService)
      const filas = LineasDatos.buscarFilas(TAB.APP_EVID, 'CARPETA_ID', id.slice(6));
      if (!filas.length) return null;
      return inspeccionDesdeEvidencia(evidenciaDesdeFila(LineasDatos.leerFilas([{ tabla: TAB.APP_EVID, filas: filas.slice(0, 1) }])[0][0]));
    }
    const filas = LineasDatos.buscarFilasPorId(TAB.INSP, id);
    if (!filas.length) return null;
    const f = LineasDatos.leerFilas([{ tabla: TAB.INSP, filas: filas.slice(0, 1) }])[0][0];
    const filasEv = LineasDatos.existeTabla(TAB.APP_EVID) ? LineasDatos.buscarFilasVarios(TAB.APP_EVID, 'ID_REGISTRO', LineasDatos.idsDeFila(f)) : [];
    const ev = filasEv.length ? evidenciaDesdeFila(LineasDatos.leerFilas([{ tabla: TAB.APP_EVID, filas: filasEv.slice(0, 1) }])[0][0]) : null;
    return inspeccionDesdeFila(f, ev);
  }

  /** Responsiva por id: fila de RESPONSIVAS LINEAS, o "drive_<carpetaId>" si solo existe en Drive (como leerInspeccion). */
  function leerResponsiva(id) {
    if (/^drive_/.test(id)) {
      if (!LineasDatos.existeTabla(TAB.APP_EVID)) return null;
      const filas = LineasDatos.buscarFilas(TAB.APP_EVID, 'CARPETA_ID', id.slice(6));
      if (!filas.length) return null;
      return responsivaDesdeEvidencia(evidenciaDesdeFila(LineasDatos.leerFilas([{ tabla: TAB.APP_EVID, filas: filas.slice(0, 1) }])[0][0]));
    }
    const filas = LineasDatos.buscarFilasPorId(TAB.RESP, id);
    if (!filas.length) return null;
    const f = LineasDatos.leerFilas([{ tabla: TAB.RESP, filas: filas.slice(0, 1) }])[0][0];
    const filasEv = LineasDatos.existeTabla(TAB.APP_EVID) ? LineasDatos.buscarFilasVarios(TAB.APP_EVID, 'ID_REGISTRO', LineasDatos.idsDeFila(f)) : [];
    const ev = filasEv.length ? evidenciaDesdeFila(LineasDatos.leerFilas([{ tabla: TAB.APP_EVID, filas: filasEv.slice(0, 1) }])[0][0]) : null;
    return responsivaDesdeFila(f, ev);
  }

  // Movimiento (lo que se filtra en el historial) según la columna que cambió.
  const MOVIMIENTO_POR_CAMPO = [
    [/RESPONSABLE$|^QUIEN USA/, 'Reasignación'],
    [/^ESTATUS/, 'Cambio de estatus'],
    [/^(NUMERO TELEFONO|NUMERO SIM|COMPANIA)$/, 'Cambio de línea'],
    [/PLAN$/, 'Cambio de plan'],
    [/^(EQUIPO|IMEI|NUCO|TIPO|ACCESORIOS|COLOR)$/, 'Cambio de equipo'],
    [/^(SEDE|OFICINA \/ DESARROLLO|DEPARTAMENTO|AREA|RAZON SOCIAL|PUESTO|JEFE DIRECTO|DIRECTOR|NO EMPLEADO)$/, 'Cambio de área o ubicación'],
    [/PIN|PATRON|CONTRASE|CUENTA GOOGLE/, 'Cambio de accesos'],
  ];
  const MOVIMIENTO_APP = {
    ALTA: 'Alta de registro', INSPECCION: 'Inspección', RESPONSIVA: 'Responsiva', DESECHO: 'Desecho', REASIGNACION: 'Reasignación',
    CAMBIO_ESTATUS_EQUIPO: 'Cambio de estatus', CAMBIO_ESTATUS_LINEA: 'Cambio de estatus',
    ASIGNAR_LINEA: 'Cambio de línea', RETIRAR_LINEA: 'Cambio de línea', CAMBIO_EQUIPO: 'Cambio de equipo',
    // Resguardos y cancelaciones (30-sep)
    RESGUARDO: 'Resguardo', CANCELACION_LINEA: 'Cancelación de línea', VENTA: 'Venta',
    // Acciones con nombre (etapa 3, paso 2): Entregar y el cierre (vendido, donado, desechado o extravío-robo)
    ENTREGA: 'Entrega', CIERRE: 'Cierre', NOTA: 'Nota', CAMBIO_LINEA: 'Cambio de línea',
    // Editar (corrige y cambia estatus, 4-oct)
    EDICION: 'Edición',
    // El COMENTARIOS que tenía la hoja vieja al retirarla (paso 4)
    COMENTARIO_ANTERIOR: 'Comentario anterior',
    // PDF de la inspección o la responsiva, ya firmado o vuelto a hacer con la plantilla (5-oct)
    PDF_FIRMADO: 'PDF firmado', PDF_REGENERADO: 'PDF regenerado',
  };
  const sinAcentos_ = (v) => String(v === null || v === undefined ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  function movimientoDeCampo(campo) {
    const c = sinAcentos_(campo);
    const regla = MOVIMIENTO_POR_CAMPO.find((r) => r[0].test(c));
    return regla ? regla[1] : 'Otros cambios';
  }

  /** Nombre de una edición del AppSheet con varios campos: el del campo que más pesa (el orden de MOVIMIENTO_POR_CAMPO). */
  function movimientoDeCampos_(campos) {
    let mejor = MOVIMIENTO_POR_CAMPO.length;
    campos.forEach((campo) => {
      const i = MOVIMIENTO_POR_CAMPO.findIndex((r) => r[0].test(sinAcentos_(campo)));
      if (i >= 0 && i < mejor) mejor = i;
    });
    return mejor < MOVIMIENTO_POR_CAMPO.length ? MOVIMIENTO_POR_CAMPO[mejor][1] : 'Otros cambios';
  }

  /** Pestañas de módulos retirados cuyos renglones se migraron a APP_MOVIMIENTOS (TIPO HISTORICO), 30-sep. */
  const HOJAS_MIGRADAS = [TAB.REASIG, TAB.DESECHO, TAB.REACTIVACION];
  const ISO_FECHA_ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

  /**
   * Separa los movimientos migrados de los demás. Cada uno trae en DETALLE_JSON { hojaAnterior, fila } el renglón
   * original completo; las fechas vuelven a ser Date. Regresa { filas: { hoja: [...] }, ids: { 'hoja|ID': true }, resto }.
   */
  function separarMigrados_(filasMov) {
    const salida = { filas: {}, ids: {}, resto: [] };
    (filasMov || []).forEach((f) => {
      let detalle = null;
      if (txt(f['TIPO']) === 'HISTORICO') {
        try { detalle = JSON.parse(f['DETALLE_JSON'] || '{}'); } catch (e) { detalle = null; }
      }
      if (!detalle || HOJAS_MIGRADAS.indexOf(detalle.hojaAnterior) < 0 || !detalle.fila) { salida.resto.push(f); return; }
      const fila = {};
      Object.keys(detalle.fila).forEach((c) => {
        const v = detalle.fila[c];
        fila[c] = typeof v === 'string' && ISO_FECHA_.test(v) ? new Date(v) : v;
      });
      (salida.filas[detalle.hojaAnterior] = salida.filas[detalle.hojaAnterior] || []).push(fila);
      salida.ids[detalle.hojaAnterior + '|' + txt(fila['ID'])] = true;
    });
    return salida;
  }

  /**
   * Historial de un registro: un renglón por acción (etapa 3, paso 3, plan §5.5), con su comentario, su ticket, lo que
   * cambió (antes → después) y, de ese momento, el responsable y los estatus. Fuentes: MOVIMIENTOS (hojas nuevas),
   * APP_MOVIMIENTOS (sistema nuevo antes de la reestructura y lo migrado de las pestañas retiradas), bitácora CAMBIOS
   * (del AppSheet: los campos que una persona cambió en menos de 2 minutos son una sola edición),
   * HISTORIAL_REASIGNACIONES, BITACORA DE DESECHO, REACTIVACION DE LINEAS e inspecciones y responsivas (AppSheet,
   * Drive y sistema). Lo que el sistema nuevo registró oculta sus propias filas de las pestañas del AppSheet.
   * El responsable y los estatus de cada renglón se reconstruyen hacia atrás desde los de hoy con los cambios de cada
   * acción: no se copian (§5.5).
   */
  function historialDeRegistro(id, puedeVerSecretos) {
    const ids = idsDeRegistro(id);
    id = ids[0] || id;
    const hayMov = LineasDatos.existeTabla(TAB.APP_MOV);
    const hayNuevo = LineasDatos.existeTabla(TAB.MOV);
    // Las pestañas de los módulos retirados (30-sep) ya no existen en la BD de pruebas: sus renglones viven en
    // APP_MOVIMIENTOS (TIPO HISTORICO). Si todavía existen (p. ej. producción), también se leen.
    const siExiste = (tabla, columna) => (LineasDatos.existeTabla(tabla) ? LineasDatos.buscarFilasVarios(tabla, columna, ids) : []);
    // MOVIMIENTOS solo guarda IDs de las hojas nuevas: el del equipo o el de la línea (con varios, separados por coma)
    const filasNuevo = hayNuevo ? LineasDatos.buscarFilasVarios(TAB.MOV, 'ID EQUIPO', [id], true)
      .concat(LineasDatos.buscarFilasVarios(TAB.MOV, 'ID LINEA', [id], true)).filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b) : [];
    const peticiones = [
      { tabla: TAB.CAMBIOS, filas: LineasDatos.buscarFilasVarios(TAB.CAMBIOS, 'ID_LINEA', ids).slice(-1500) }, // las más recientes
      { tabla: TAB.REASIG, filas: siExiste(TAB.REASIG, 'ID Linea') },
      { tabla: TAB.DESECHO, filas: siExiste(TAB.DESECHO, 'ID_EQUIPO') },
      { tabla: TAB.APP_MOV, filas: hayMov ? LineasDatos.buscarFilasVarios(TAB.APP_MOV, 'REFS', ids.map((k) => ',' + k + ','), true) : [] },
      { tabla: TAB.MOV, filas: filasNuevo },
      { tabla: TAB.REACTIVACION, filas: siExiste(TAB.REACTIVACION, 'IMEI') },
    ].filter((p) => p.filas.length);
    // Una fila está oculta si el sistema nuevo la registró con cualquiera de sus IDs (el de hoy o el de antes)
    const oculta = (mapa, f, ...columnas) => columnas.concat(['ID'], LineasDatos.COLS_ID_ANTERIOR).some((c) => mapa[txt(f[c])]);
    const leidas = peticiones.length ? LineasDatos.leerFilas(peticiones) : [];
    const r = {};
    peticiones.forEach((p, i) => { r[p.tabla] = leidas[i]; });
    // Renglones migrados de las pestañas retiradas: se leen como si vinieran de su pestaña (sin repetir)
    const migrados = separarMigrados_(r[TAB.APP_MOV] || []);
    r[TAB.APP_MOV] = migrados.resto;
    const de = (tabla) => (r[tabla] || []).filter((f) => !migrados.ids[tabla + '|' + txt(f['ID'])]).concat(migrados.filas[tabla] || []);
    const ocultar = (campo, v) => (!puedeVerSecretos && /PIN|PATRON|CONTRASE/i.test(campo || '') && v ? '••••' : v);
    const json = (v, vacio) => { try { return v ? JSON.parse(v) : vacio; } catch (e) { return vacio; } };
    const texto = (v) => (v === null || v === undefined ? '' : (v instanceof Date ? Utilities.formatDate(v, LineasDatos.ZONA_APP, 'dd/MM/yyyy') : String(v)));
    const unir = (partes) => partes.filter((p) => p !== null && p !== undefined && String(p).trim() !== '').join(' · ');
    const eventos = [];
    let n = 0;
    const limpiarCambio = (c) => {
      const campo = String(c.campo || '').trim();
      let antes = texto(c.antes);
      let despues = texto(c.despues);
      if (/^NUCO$/i.test(campo)) {
        antes = LineasUtil.nucoVisible(antes) || antes;
        despues = LineasUtil.nucoVisible(despues) || despues;
      }
      return { campo: campo, antes: ocultar(campo, antes), despues: ocultar(campo, despues) };
    };
    const agregar = (e) => {
      const cambios = (Array.isArray(e.cambios) ? e.cambios : []).filter((c) => c && c.campo).map(limpiarCambio);
      eventos.push({
        id: 'h' + (++n), fecha: e.fecha || null, movimiento: e.movimiento, comentario: txt(e.comentario) || '', ticket: txt(e.ticket) || '',
        cambios: cambios, cambiosTexto: cambios.map((c) => c.campo + ': ' + (c.antes || '—') + ' → ' + (c.despues || '—')).join('\n'),
        detalle: e.detalle || '', usuario: e.usuario || '', origen: e.origen, refTipo: e.refTipo || null, refId: e.refId || null, pdfId: e.pdfId || null,
      });
    };

    // 1) Lo registrado por el sistema nuevo: MOVIMIENTOS y APP_MOVIMIENTOS
    const ocultosCambios = {};
    const ocultasReasig = {};
    const ocultosDesechos = {};
    const inspeccionesSistema = {};
    const responsivasSistema = {};
    const ORIGEN_VISIBLE = {};
    ORIGEN_VISIBLE[ORIGEN_A_MANO] = 'Nuevo sistema';
    ORIGEN_VISIBLE['MIGRACION'] = 'Migración';
    de(TAB.MOV).forEach((f) => {
      const accion = txt(f['ACCION']) || '';
      const documento = txt(f['DOCUMENTO']) || '';
      const refTipo = !documento ? null : (accion === 'RESPONSIVA' || /^RLI-/i.test(documento) ? 'responsiva' : 'inspeccion');
      if (refTipo === 'inspeccion') inspeccionesSistema[documento] = true;
      if (refTipo === 'responsiva') responsivasSistema[documento] = true;
      const origen = txt(f['ORIGEN']) || ORIGEN_A_MANO;
      agregar({
        fecha: fecha(f['FECHA']), origen: ORIGEN_VISIBLE[origen] || origen, usuario: String(txt(f['QUIEN']) || '').split(' · ')[0],
        movimiento: MOVIMIENTO_APP[accion] || accion, comentario: f['COMENTARIO'], ticket: f['TICKET'], cambios: json(f['CAMBIOS'], []),
        refTipo: refTipo, refId: documento || null,
      });
    });
    de(TAB.APP_MOV).forEach((f) => {
      const detalle = json(f['DETALLE_JSON'], {});
      (detalle.idsCambios || []).forEach((x) => { ocultosCambios[x] = true; });
      (detalle.idsReasignacion || []).concat(detalle.idReasignacion ? [detalle.idReasignacion] : []).forEach((x) => { ocultasReasig[x] = true; });
      if (detalle.idDesecho) ocultosDesechos[detalle.idDesecho] = true;
      const tipo = txt(f['TIPO']) || '';
      const despues = json(f['DESPUES_JSON'], {});
      const e = {
        fecha: fecha(f['FECHA']), origen: 'Nuevo sistema', usuario: txt(f['USUARIO_NOMBRE']) || txt(f['USUARIO_CORREO']),
        movimiento: MOVIMIENTO_APP[tipo] || tipo, comentario: f['MOTIVO'], ticket: f['TICKET'],
        cambios: tipo === 'ALTA' ? [] : (detalle.cambios || []),
      };
      const extra = [];
      if (tipo === 'INSPECCION') {
        if (detalle.inspeccionId) inspeccionesSistema[detalle.inspeccionId] = true;
        const cal = despues.calificacion;
        if (cal !== null && cal !== undefined && cal !== '') extra.push('Calificación ' + Math.round(Number(cal) * 100) + '%');
        e.refTipo = 'inspeccion';
        e.refId = detalle.inspeccionId;
      }
      if (tipo === 'RESPONSIVA') {
        if (detalle.responsivaId) responsivasSistema[detalle.responsivaId] = true;
        extra.push('Responsable: ' + ((despues.responsable && despues.responsable.nombre) || '—'));
        e.refTipo = 'responsiva';
        e.refId = detalle.responsivaId;
      }
      if (detalle.folio) extra.push('Folio ' + detalle.folio);
      if (txt(f['NUCO_DESTINO'])) extra.push('NUCO destino ' + txt(f['NUCO_DESTINO']));
      e.detalle = unir(extra);
      agregar(e);
    });

    // 2) HISTORIAL_REASIGNACIONES (bot "Cambio de Responsable" del AppSheet)
    const diaDe = (d) => (d ? Utilities.formatDate(d, LineasDatos.ZONA_APP, 'yyyy-MM-dd') : '');
    const reasignadoEl = {};
    de(TAB.REASIG).forEach((f) => {
      if (oculta(ocultasReasig, f, 'ID Historial')) return;
      const cuando = fecha(col(f, 'Fecha de Reasignacion'));
      const entrante = txt(col(f, 'Responsable Entrante'));
      reasignadoEl[diaDe(cuando) + '|' + sinAcentos_(entrante)] = true;
      const cambio = (campo, antes, despues) => (txt(antes) || txt(despues) ? { campo: campo, antes: txt(antes) || '', despues: txt(despues) || '' } : null);
      agregar({
        fecha: cuando, origen: 'AppSheet', movimiento: 'Reasignación', usuario: txt(col(f, 'QUIEN REGISTRO')),
        cambios: [
          cambio('RESPONSABLE', col(f, 'Responsable Saliente'), entrante),
          cambio('NO EMPLEADO', col(f, 'No Empleado Saliente'), col(f, 'No Empleado Entrante')),
          cambio('DEPARTAMENTO', col(f, 'Departamento Saliente'), col(f, 'Departamento Entrante')),
        ].filter(Boolean),
      });
    });

    // 3) Bitácora CAMBIOS LINEAS TELEFONICAS (una fila por campo). El cambio de RESPONSABLE que ya aparece como
    //    reasignación ese mismo día no se repite. Los campos que una persona cambió seguidos son una sola edición.
    const sueltos = [];
    de(TAB.CAMBIOS).forEach((f) => {
      if (oculta(ocultosCambios, f, 'ID_CAMBIO')) return;
      const campo = txt(col(f, 'CAMPO'));
      const cuando = fecha(col(f, 'FECHA ACTUALIZACION'));
      const despues = txt(col(f, 'DESPUES'));
      if (sinAcentos_(campo) === 'RESPONSABLE' && reasignadoEl[diaDe(cuando) + '|' + sinAcentos_(despues)]) return;
      sueltos.push({ fecha: cuando, campo: campo, antes: txt(col(f, 'ANTES')), despues: despues, usuario: txt(col(f, 'ACTUALIZADO POR')) || '' });
    });
    sueltos.sort((a, b) => (a.fecha || 0) - (b.fecha || 0));
    let edicion = null;
    const cerrarEdicion = () => {
      if (edicion) {
        agregar({ fecha: edicion.fecha, origen: 'AppSheet', usuario: edicion.usuario, movimiento: movimientoDeCampos_(edicion.cambios.map((c) => c.campo)), cambios: edicion.cambios });
      }
      edicion = null;
    };
    sueltos.forEach((s) => {
      if (edicion && s.usuario === edicion.usuario && s.fecha && edicion.fecha && s.fecha - edicion.fecha <= MS_MISMA_EDICION) {
        edicion.cambios.push(s);
        edicion.fecha = s.fecha;
        return;
      }
      cerrarEdicion();
      edicion = { fecha: s.fecha, usuario: s.usuario, cambios: [s] };
    });
    cerrarEdicion();

    // 4) BITACORA DE DESECHO
    de(TAB.DESECHO).forEach((f) => {
      if (oculta(ocultosDesechos, f, 'ID_DESECHO')) return;
      agregar({
        fecha: fecha(col(f, 'FECHA DE DESECHO')) || fecha(col(f, 'FECHA DE REGISTRO')), origen: 'AppSheet', movimiento: 'Desecho',
        comentario: col(f, 'MOTIVO'),
        detalle: unir([txt(col(f, 'FOLIO DESECHO')) ? 'Folio ' + txt(col(f, 'FOLIO DESECHO')) : null, txt(col(f, 'LUGAR DE DESECHO')), txt(col(f, 'ESTADO'))]),
        usuario: txt(col(f, 'QUIEN REGISTRO')),
      });
    });

    // 5) REACTIVACION DE LINEAS (su columna IMEI es la referencia al registro)
    de(TAB.REACTIVACION).forEach((f) => {
      agregar({
        fecha: fecha(col(f, 'FECHA DE REGISTRO')) || fecha(col(f, 'FECHA DE REACTIVACION')) || fecha(col(f, 'FECHA DE SUSPENSION')),
        origen: 'AppSheet', movimiento: 'Reactivación', comentario: col(f, 'RETRO DE SOLICITUD'), ticket: col(f, 'CORREO / TICKET'),
        cambios: txt(col(f, 'ESTATUS')) ? [{ campo: 'ESTATUS', antes: '', despues: txt(col(f, 'ESTATUS')) }] : [],
        detalle: unir([txt(col(f, 'FOLIO')) ? 'Folio ' + txt(col(f, 'FOLIO')) : null, txt(col(f, 'NUEVO NUMERO')) ? 'Nuevo número ' + txt(col(f, 'NUEVO NUMERO')) : null]),
        usuario: txt(col(f, 'QUIEN REGISTRO')),
      });
    });

    // 6) Inspecciones y responsivas del AppSheet y las históricas que solo están en Drive; las del sistema ya salieron
    //    con su acción y aquí solo se les pone su PDF y su calificación o responsable
    const origenEv = (o) => (o === 'DRIVE' ? 'Drive' : (o === 'SISTEMA' ? 'Nuevo sistema' : 'AppSheet'));
    const textoCal = (cal) => (cal !== null && cal !== undefined && cal !== '' ? 'Calificación ' + Math.round(cal > 1 ? cal : cal * 100) + '%' : null);
    const ev = evidenciasDeRegistro(id);
    const documentos = {};
    ev.inspecciones.forEach((i) => {
      [i._id].concat(i._idsAnteriores || []).forEach((k) => { documentos['inspeccion|' + k] = i; });
      if ([i._id].concat(i._idsAnteriores || []).some((k) => inspeccionesSistema[k])) return;
      agregar({
        fecha: i.fecha, origen: origenEv(i.origen), movimiento: 'Inspección', refTipo: 'inspeccion', refId: i._id, pdfId: i.pdf ? i.pdf.id : null,
        ticket: i.ticket, detalle: unir([textoCal(i.calificacion)]), usuario: i.inspector,
      });
    });
    ev.responsivas.forEach((x) => {
      [x._id].concat(x._idsAnteriores || []).forEach((k) => { documentos['responsiva|' + k] = x; });
      if ([x._id].concat(x._idsAnteriores || []).some((k) => responsivasSistema[k])) return;
      agregar({
        fecha: x.fecha, origen: origenEv(x.origen), movimiento: 'Responsiva', refTipo: 'responsiva', refId: x._id, pdfId: x.pdf ? x.pdf.id : null,
        detalle: x.responsable && x.responsable.nombre ? 'Responsable: ' + x.responsable.nombre : '', usuario: x.responsableCI,
      });
    });
    eventos.forEach((e) => {
      const doc = e.refId ? documentos[e.refTipo + '|' + e.refId] : null;
      if (!doc) return;
      if (!e.pdfId && doc.pdf) e.pdfId = doc.pdf.id;
      if (!e.detalle) e.detalle = e.refTipo === 'inspeccion' ? (textoCal(doc.calificacion) || '') : (doc.responsable && doc.responsable.nombre ? 'Responsable: ' + doc.responsable.nombre : '');
    });

    // 7) Responsable y estatus de ese momento: los de hoy, deshaciendo los cambios de cada acción de la más nueva a la más vieja
    eventos.sort((a, b) => (b.fecha || 0) - (a.fecha || 0));
    let registro = null;
    try { registro = leerRegistroPorId(id); } catch (e) { registro = null; }
    const estado = { 'RESPONSABLE': '', 'ESTATUS EQUIPO': '', 'ESTATUS LINEA': '' };
    Object.keys(estado).forEach((c) => { estado[c] = registro ? texto(txt(col(registro, c))) : ''; });
    eventos.forEach((e) => {
      e.responsable = estado['RESPONSABLE'];
      e.estatusEquipo = estado['ESTATUS EQUIPO'];
      e.estatusLinea = estado['ESTATUS LINEA'];
      e.cambios.slice().reverse().forEach((c) => {
        const k = sinAcentos_(c.campo);
        if (k in estado) estado[k] = c.antes;
      });
    });
    return { eventos: eventos, total: eventos.length };
  }

  // ---------------- Asignaciones número ↔ NUCO ----------------

  /** NUCO a 4 dígitos, o null si está vacío o es "NO APLICA". */
  function nucoDe_(v) {
    const t = txt(v);
    return t === null || t instanceof Date ? null : LineasUtil.nucoVisible(t);
  }

  /** Cambios que caen en la misma edición (el bot escribe un campo tras otro con NOW()). */
  const MS_MISMA_EDICION = 2 * 60 * 1000;
  /** Tope de filas de LINEAS TELEFONICAS por consulta (una línea o un NUCO pasan por pocas filas). */
  const MAX_FILAS_ASIGNACION = 25;

  /**
   * Periodos en los que un número estuvo en un NUCO. Se reconstruyen fila por fila de LINEAS TELEFONICAS con su
   * estado actual y, hacia atrás, los cambios de NUMERO TELEFONO y NUCO de la bitácora CAMBIOS (el AppSheet y el
   * sistema nuevo escriben ahí). El motivo sale de APP_MOVIMIENTOS (sistema nuevo) o de REACTIVACION DE LINEAS.
   * vista 'equipo' → números que ha tenido el NUCO del registro; 'linea' → NUCOs en los que ha estado su número.
   */
  function asignacionesDeRegistro(id, vista) {
    const porNuco = vista !== 'linea';
    const actual = leerRegistroObligatorio(id, 'el registro');
    const clave = porNuco ? nucoDe_(col(actual, 'NUCO')) : digitos(col(actual, 'NUMERO TELEFONO'));
    const salida = { vista: porNuco ? 'equipo' : 'linea', clave: clave, periodos: [], incompleto: false };
    if (!clave || !/\d/.test(clave)) return salida; // un NUCO sin número ("N/A"…) no identifica a un equipo

    // 1) Dónde aparece la clave: filas actuales y cambios (el NUCO de la fila en cada cambio, o el campo cambiado)
    const variantes = porNuco && /^\d+$/.test(clave) ? [clave, String(Number(clave))].filter((v, i, a) => a.indexOf(v) === i) : [clave];
    const filasLineas = {};
    const filasCambios = {};
    variantes.forEach((v) => {
      LineasDatos.buscarFilas(TAB.LINEAS, porNuco ? 'NUCO' : 'NUMERO TELEFONO', v).forEach((n) => { filasLineas[n] = true; });
      (porNuco ? ['NUCO', 'ANTES', 'DESPUES'] : ['ANTES', 'DESPUES'])
        .forEach((c) => LineasDatos.buscarFilas(TAB.CAMBIOS, c, v).forEach((n) => { filasCambios[n] = true; }));
    });
    const numeros = (o) => Object.keys(o).map(Number);
    const primera = LineasDatos.leerFilas([{ tabla: TAB.LINEAS, filas: numeros(filasLineas) }, { tabla: TAB.CAMBIOS, filas: numeros(filasCambios) }]);
    const campoAsignacion = (f) => {
      const c = sinAcentos_(col(f, 'CAMPO'));
      return c === 'NUMERO TELEFONO' ? 'numero' : (c === 'NUCO' ? 'nuco' : null);
    };
    const valorDe = (campo, v) => (campo === 'nuco' ? nucoDe_(v) : digitos(v));
    const ids = {};
    const filaActual = {};
    primera[0].forEach((f) => { const k = txt(f['ID']); if (k) { ids[k] = true; filaActual[k] = f; } });
    primera[1].forEach((f) => {
      const k = idActual(f['ID_LINEA']);
      if (!k) return;
      const campo = campoAsignacion(f);
      // La clave en el NUCO de la fila, o como antes/después de un cambio de número o NUCO (no de otro campo)
      const enNucoFila = porNuco && nucoDe_(f['NUCO']) === clave;
      const enCambio = campo === (porNuco ? 'nuco' : 'numero') && (valorDe(campo, col(f, 'ANTES')) === clave || valorDe(campo, col(f, 'DESPUES')) === clave);
      if (enNucoFila || enCambio) ids[k] = true;
    });
    let listaIds = Object.keys(ids);
    if (listaIds.length > MAX_FILAS_ASIGNACION) { listaIds = listaIds.slice(0, MAX_FILAS_ASIGNACION); salida.incompleto = true; }

    // 2) Toda la bitácora de número y NUCO de esas filas, su fila actual si falta, y los motivos
    const hayMov = LineasDatos.existeTabla(TAB.APP_MOV);
    const hayReact = LineasDatos.existeTabla(TAB.REACTIVACION); // retirada el 30-sep: sus renglones están en APP_MOVIMIENTOS
    const faltantes = listaIds.filter((k) => !filaActual[k]);
    const todosLosIds = [].concat.apply([], listaIds.map(idsDeRegistro));
    const segunda = LineasDatos.leerFilas([
      { tabla: TAB.CAMBIOS, filas: LineasDatos.buscarFilasVarios(TAB.CAMBIOS, 'ID_LINEA', todosLosIds) },
      { tabla: TAB.LINEAS, filas: [].concat.apply([], faltantes.map((k) => LineasDatos.buscarFilasPorId(TAB.LINEAS, k))) },
      { tabla: TAB.APP_MOV, filas: hayMov ? LineasDatos.buscarFilasVarios(TAB.APP_MOV, 'REFS', todosLosIds.map((k) => ',' + k + ','), true) : [] },
      { tabla: TAB.REACTIVACION, filas: hayReact ? LineasDatos.buscarFilasVarios(TAB.REACTIVACION, 'IMEI', todosLosIds) : [] },
    ]);
    segunda[1].forEach((f) => { const k = txt(f['ID']); if (k) filaActual[k] = f; });
    const migradosAsig = separarMigrados_(segunda[2]);
    const reactivacionesHoja = segunda[3].filter((f) => !migradosAsig.ids[TAB.REACTIVACION + '|' + txt(f['ID'])])
      .concat(migradosAsig.filas[TAB.REACTIVACION] || []);
    const motivoCambio = {};
    migradosAsig.resto.forEach((f) => {
      let detalle = {};
      try { detalle = JSON.parse(f['DETALLE_JSON'] || '{}'); } catch (e) { /* sin detalle */ }
      const motivo = [txt(f['MOTIVO']), txt(f['TICKET']) ? 'Ticket ' + txt(f['TICKET']) : null].filter(Boolean).join(' · ');
      (detalle.idsCambios || []).forEach((x) => { motivoCambio[x] = motivo; });
    });
    const reactivaciones = reactivacionesHoja.map((f) => ({
      id: idActual(col(f, 'IMEI')), numero: digitos(col(f, 'NUEVO NUMERO')),
      motivo: ['Reactivación', txt(col(f, 'FOLIO')) ? 'folio ' + txt(col(f, 'FOLIO')) : null, txt(col(f, 'RETRO DE SOLICITUD')), txt(col(f, 'CORREO / TICKET'))].filter(Boolean).join(' · '),
    })).filter((r) => r.id && r.numero);
    const cambiosPorId = {};
    segunda[0].forEach((f) => {
      const campo = campoAsignacion(f);
      const k = idActual(f['ID_LINEA']);
      const cuando = fecha(col(f, 'FECHA ACTUALIZACION'));
      if (!campo || !k || !cuando || !ids[k]) return;
      const idCambio = ['ID', 'ID_CAMBIO'].concat(LineasDatos.COLS_ID_ANTERIOR).map((c) => txt(f[c])).filter((x) => x && x in motivoCambio)[0];
      (cambiosPorId[k] = cambiosPorId[k] || []).push({
        campo: campo, antes: valorDe(campo, col(f, 'ANTES')), despues: valorDe(campo, col(f, 'DESPUES')), fecha: cuando,
        nucoFila: nucoDe_(f['NUCO']), usuario: txt(col(f, 'ACTUALIZADO POR')) || '',
        nuevoSistema: idCambio in motivoCambio, motivo: motivoCambio[idCambio] || '',
      });
    });

    // 3) Línea de tiempo de cada fila, del estado actual hacia atrás
    const periodos = [];
    listaIds.forEach((k) => {
      const f = filaActual[k];
      const cambios = (cambiosPorId[k] || []).sort((a, b) => a.fecha - b.fecha);
      const ultimo = (campo) => cambios.filter((c) => c.campo === campo).pop();
      // Si la fila ya no existe, su último estado sale de la bitácora
      let estado = f ? { nuco: nucoDe_(col(f, 'NUCO')), numero: digitos(col(f, 'NUMERO TELEFONO')) } : {
        nuco: ultimo('nuco') ? ultimo('nuco').despues : (cambios.length ? cambios[cambios.length - 1].nucoFila : null),
        numero: ultimo('numero') ? ultimo('numero').despues : null,
      };
      const grupos = [];
      cambios.forEach((c) => {
        const g = grupos[grupos.length - 1];
        if (g && c.fecha - g.fin <= MS_MISMA_EDICION) { g.cambios.push(c); g.fin = c.fecha; } else grupos.push({ fecha: c.fecha, fin: c.fecha, cambios: [c] });
      });
      const tramos = [];
      let hasta = null;
      for (let i = grupos.length - 1; i >= 0; i--) {
        const g = grupos[i];
        tramos.unshift({ nuco: estado.nuco, numero: estado.numero, desde: g.fecha, hasta: hasta, inicio: g });
        estado = Object.assign({}, estado);
        g.cambios.forEach((c) => { estado[c.campo] = c.antes; });
        hasta = g.fecha;
      }
      // Primer tramo: desde el alta de la fila (FECHA REGISTRO = NOW() al crearla) si es anterior al primer cambio
      const alta = f ? fecha(col(f, 'FECHA REGISTRO')) : null;
      tramos.unshift({ nuco: estado.nuco, numero: estado.numero, desde: alta && (!hasta || alta <= hasta) ? alta : null, hasta: hasta, inicio: null, alta: true });
      // Tramos seguidos con el mismo número y NUCO son uno solo (p. ej. cambió otro dato en la misma edición)
      const unidos = [];
      tramos.forEach((t) => {
        const previo = unidos[unidos.length - 1];
        if (previo && previo.nuco === t.nuco && previo.numero === t.numero) previo.hasta = t.hasta;
        else unidos.push(Object.assign({}, t));
      });
      unidos.forEach((t) => {
        if ((porNuco ? t.nuco : t.numero) !== clave) return;
        const g = t.inicio;
        const reactivacion = t.numero ? reactivaciones.filter((r) => r.id === k && r.numero === t.numero)[0] : null;
        const conMotivo = g ? g.cambios.filter((c) => c.motivo)[0] : null;
        periodos.push({
          registroId: k, nuco: t.nuco, numero: t.numero, desde: t.desde, hasta: t.hasta,
          vigente: !!f && t.hasta === null, registroExiste: !!f,
          motivo: conMotivo ? conMotivo.motivo : (reactivacion ? reactivacion.motivo : (g ? '' : (t.desde ? 'Alta del registro' : ''))),
          usuario: g ? g.cambios[0].usuario : '', origen: g ? (g.cambios.some((c) => c.nuevoSistema) ? 'Nuevo sistema' : 'AppSheet') : '',
        });
      });
    });

    // 4) A dónde lleva cada fila: el registro que hoy tiene ese número (vista equipo) o ese NUCO (vista línea)
    const ix = indice();
    const destino = {};
    const tabla = porNuco ? ix.lineas : ix.equipos;
    const iId = tabla.columnas.indexOf('id');
    const iClave = tabla.columnas.indexOf(porNuco ? 'numero' : 'nuco');
    tabla.filas.forEach((x) => {
      const v = porNuco ? digitos(x[iClave]) : nucoDe_(x[iClave]);
      if (v && !(v in destino)) destino[v] = x[iId];
    });
    periodos.forEach((p, n) => {
      p.id = 'a' + (n + 1);
      const otro = porNuco ? p.numero : p.nuco;
      p.irId = otro ? destino[otro] || null : null;
    });
    periodos.sort((a, b) => (b.hasta === null) - (a.hasta === null) || (b.hasta || 0) - (a.hasta || 0) || (b.desde || 0) - (a.desde || 0));
    salida.periodos = periodos;
    return salida;
  }

  // ---------------- Bitácoras (vistas de control) ----------------

  /** Máximo de filas por petición para las tablas del cliente. */
  const MAX_FILAS_TABLA = 5000;

  /** Pestañas que se consultan como bitácora completa desde el menú. */
  const BITACORAS = {
    CAMBIOS: { tabla: TAB.CAMBIOS, ocultarSecretos: 'CAMPO' },
    // REASIGNACIONES y DESECHOS se retiraron con sus pestañas (30-sep): sus renglones están en APP_MOVIMIENTOS
  };

  /**
   * Página de una bitácora, de la más reciente a la más antigua (las filas se agregan al final).
   * Con `q` busca el texto en cualquier columna (TextFinder) y pagina solo las coincidencias.
   * Devuelve { encabezados, filas: [{columna: valor}], total, pagina, paginas }.
   */
  function bitacora(tipo, q, pagina, porPagina, puedeVerSecretos) {
    const cfg = BITACORAS[tipo];
    if (!cfg) throw new Error('Bitácora desconocida: ' + tipo);
    // Hasta 5000 por petición: las tablas del cliente (DataTable) piden de golpe lo más reciente
    porPagina = Math.min(Math.max(Number(porPagina) || 50, 10), MAX_FILAS_TABLA);
    pagina = Math.max(Number(pagina) || 0, 0);
    const t = LineasDatos.tabla(cfg.tabla);
    const texto = String(q || '').trim();

    let total;
    let filas;
    if (texto) {
      const coincidencias = LineasDatos.buscarEnTabla(cfg.tabla, texto).reverse();
      total = coincidencias.length;
      filas = LineasDatos.leerFilas([{ tabla: cfg.tabla, filas: coincidencias.slice(pagina * porPagina, (pagina + 1) * porPagina) }])[0];
    } else {
      const ultima = LineasDatos.ultimaFila(cfg.tabla);
      total = Math.max(0, ultima - 1);
      const hasta = ultima - pagina * porPagina;
      const desde = Math.max(2, hasta - porPagina + 1);
      filas = hasta >= 2 ? LineasDatos.leerRango(cfg.tabla, desde, hasta).reverse() : [];
    }

    const encabezados = t.encabezados.filter(Boolean);
    const salida = filas
      .filter((f) => encabezados.some((h) => f[h] !== '' && f[h] !== null))
      .map((f) => {
        const o = { _fila: f._fila };
        encabezados.forEach((h) => { o[h] = f[h]; });
        // NUCO siempre a 4 dígitos (la hoja lo guarda como número: 234)
        encabezados.forEach((h) => { if (/^NUCO( |_|$)/i.test(h) && o[h] !== '' && o[h] !== null) o[h] = LineasUtil.nucoVisible(o[h]); });
        if (/^NUCO$/i.test(String(f['CAMPO'] || '').trim())) {
          ['ANTES', 'DESPUES'].forEach((h) => { if (o[h] !== undefined && o[h] !== '' && o[h] !== null) o[h] = LineasUtil.nucoVisible(o[h]); });
        }
        if (cfg.ocultarSecretos && !puedeVerSecretos && /PIN|PATRON|CONTRASE/i.test(String(f[cfg.ocultarSecretos] || ''))) {
          if (o['ANTES']) o['ANTES'] = '••••';
          if (o['DESPUES']) o['DESPUES'] = '••••';
        }
        return o;
      });
    return { encabezados: encabezados, filas: salida, total: total, pagina: pagina, paginas: Math.max(1, Math.ceil(total / porPagina)) };
  }


  // ---------------- Catálogos y colaboradores ----------------

  /**
   * Catálogos para formularios: enums del AppSheet + valores de LISTAS TELEFONOS y BITACORA DE DESECHO,
   * y sugerencias (valores ya capturados) para los campos que en AppSheet eran texto libre: así se elige de
   * una lista en vez de escribir (personas, puestos y números se completan en el navegador con COLABORADORES
   * y el índice).
   *
   * Reestructura (2-oct-2026, PLAN_REESTRUCTURA_LINEAS.md §3): los datos del responsable (sede, oficina,
   * departamento, área, puesto, jefe directo, director) salen SOLO de la base de Capital Humano (COLABORADORES,
   * personas activas), para que de aquí en adelante todo quede homologado con CH. Lo que alguien agregue con
   * "Agregar 'x'" se queda en su registro y no entra a estas listas.
   */
  function catalogos() {
    const enCache = LineasDatos.cacheLeer('catalogos_telefonia_v7');
    if (enCache) return enCache;
    const unicos = (filas, columna) => {
      const m = {};
      filas.forEach((f) => { const v = txt(col(f, columna)); if (v && !(v instanceof Date)) m[String(v).trim().toUpperCase()] = true; });
      return Object.keys(m).sort();
    };
    const listas = LineasDatos.existeTabla(TAB.LISTAS) ? LineasDatos.leerTabla(TAB.LISTAS) : [];
    const desechos = LineasDatos.existeTabla(TAB.DESECHO) ? LineasDatos.leerTabla(TAB.DESECHO) : []; // retirada el 30-sep
    const lineas = LineasDatos.leerTabla(TAB.LINEAS);
    const inspecciones = LineasDatos.leerTabla(TAB.INSP);
    const responsivas = LineasDatos.leerTabla(TAB.RESP);
    const juntar = function () {
      return Array.prototype.concat.apply([], arguments).filter((v, i, a) => a.indexOf(v) === i).sort();
    };
    const ch = colaboradoresActivos_();
    // Listas de LISTAS TELEFONOS con que el AppSheet valida (Valid_If = IN(..., SORT(SELECT(LISTAS TELEFONOS[...]))))
    const c = Object.assign({}, CATALOGO, {
      sedes: unicos(ch, 'SEDE'),
      departamentos: juntar([DEPARTAMENTO_DISPONIBLE], unicos(ch, 'DEPARTAMENTO')),
      areas: unicos(ch, 'AREA'),
      oficinas: unicos(ch, 'OFICINA/DESARROLLO'),
      modelos: unicos(listas, 'EQUIPO'),
      razonesSociales: unicos(listas, 'RAZON SOCIAL'),
      companias: CATALOGO.companias.concat(unicos(listas, 'COMPAÑIA')).filter((v, i, a) => a.indexOf(v) === i),
      lugaresDesecho: unicos(desechos, 'LUGAR DE DESECHO'),
      estadosDesecho: unicos(desechos, 'ESTADO'),
      // Sugerencias (lo que ya se ha capturado)
      motivosDesecho: unicos(desechos, 'MOTIVO'),
      colores: juntar(unicos(lineas, 'COLOR'), unicos(inspecciones, 'COLOR'), unicos(responsivas, 'COLOR')),
      puestos: unicos(ch, 'PUESTO'),
      jefes: unicos(ch, 'JEFE DIRECTO'),
      directores: unicos(ch, 'DIRECTOR'),
      otrasApps: unicos(inspecciones, 'OTRA'),
      identificaciones: unicos(responsivas, 'IDENTIFICACION'),
    });
    LineasDatos.cacheGuardar('catalogos_telefonia_v7', c, 21600);
    return c;
  }

  /**
   * Las personas ACTIVAS de la base de Capital Humano. La base guarda también las bajas, para el histórico, pero las
   * listas de los formularios solo ofrecen a quien está activo.
   *
   * Producción (usuario, 4-oct): la base es la pestaña COLABORADORES ACTUALIZADO, la que pega Ayrton y usan sus
   * módulos. Líneas solo la lee, con las columnas acordadas (reestructuraLeerHojaCH_), y no toca ni esa ni
   * COLABORADORES. Sin esa pestaña (la base de pruebas), sigue leyendo COLABORADORES.
   */
  function colaboradoresActivos_() {
    const ch = typeof reestructuraLeerHojaCH_ === 'function' ? reestructuraLeerHojaCH_(LineasDatos.libro()) : null;
    return (ch || LineasDatos.leerTabla(TAB.COLAB)).filter((f) => String(col(f, 'ESTATUS COLABORADOR') || '').trim().toUpperCase() === 'ACTIVO');
  }

  /** Personas activas de CH para elegir al responsable: al elegir una se llenan sus datos (autollenar). */
  function indiceColaboradores() {
    const enCache = LineasDatos.cacheLeer('indice_colaboradores_v4');
    if (enCache) return enCache;
    const filas = colaboradoresActivos_().map((f) => {
      const n = txt(col(f, 'No EMPLEADO'));
      return [n === null ? null : String(n), txt(col(f, 'NOMBRE COMPLETO')), txt(col(f, 'PUESTO')), txt(col(f, 'DEPARTAMENTO')),
        txt(col(f, 'AREA')), txt(col(f, 'SEDE')), txt(col(f, 'OFICINA/DESARROLLO')), txt(col(f, 'ESTATUS COLABORADOR')),
        txt(col(f, 'DIRECTOR')), txt(col(f, 'JEFE DIRECTO')), txt(col(f, 'CORREO EMPRESARIAL'))];
    }).filter((c) => c[1]);
    const ix = LineasUtil.paraCliente({
      columnas: ['noEmpleado', 'nombre', 'puesto', 'departamento', 'area', 'sede', 'oficina', 'estatus', 'director', 'jefe', 'correo'],
      filas: filas, generadoEn: new Date(),
    });
    LineasDatos.cacheGuardar('indice_colaboradores_v4', ix, 21600);
    return ix;
  }

  /** Vacía las cachés del módulo (índices, catálogos y carpetas). */
  function borrarCaches() {
    ['indice_telefonia_v2', 'indice_telefonia_v3', 'indice_telefonia_v4', CLAVE_INDICE, 'indice_colaboradores', 'indice_colaboradores_v2', 'indice_colaboradores_v3', 'indice_colaboradores_v4',
      'carpetas_nucos', 'carpetas_nucos_v2', 'catalogos_telefonia_v2', 'catalogos_telefonia_v3', 'catalogos_telefonia_v4', 'catalogos_telefonia_v5', 'catalogos_telefonia_v6', 'catalogos_telefonia_v7',
      CLAVE_IDS].forEach(LineasDatos.cacheBorrar);
  }

  return {
    TAB, ENCABEZADOS_APP, TIPOS_CON_EQUIPO, TIPOS_CON_LINEA, TIPOS_LINEA_OPCIONAL, CATALOGO,
    COLS_LINEA, VALORES_SIN_LINEA, ESTATUS_EN_BLANCO, DEPARTAMENTO_DISPONIBLE, COLS_RESPONSABLE, CAMPOS_BITACORA,
    tipoConLinea, tipoSinLinea, convertirRegistro, folioRegistro, estatusGeneralRegistro,
    indice, refrescarIndice, leerRegistroPorId, leerRegistroObligatorio, idActual, idsDeRegistro,
    guardarCambiosRegistro, agregarRegistro, registrarMovimiento, asegurarPestanaApp,
    evidenciaDesdeFila, inspeccionDesdeFila, inspeccionDesdeEvidencia, responsivaDesdeFila,
    evidenciasDeRegistro, leerInspeccion, leerResponsiva, historialDeRegistro, asignacionesDeRegistro, movimientoDeCampo, bitacora,
    catalogos, indiceColaboradores, borrarCaches,
  };
})();
