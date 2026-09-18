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
  };

  const ENCABEZADOS_APP = {
    APP_MOVIMIENTOS: ['ID', 'FECHA', 'TIPO', 'REFS', 'NUCO', 'NUMERO', 'NUCO_DESTINO', 'MOTIVO', 'TICKET', 'USUARIO_CORREO', 'USUARIO_NOMBRE', 'ANTES_JSON', 'DESPUES_JSON', 'DETALLE_JSON'],
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
    estatusEquipo: ['USO', 'RESGUARDO', 'ESPERA DE EQUIPO', 'ESPERA DE RESPONSIVA', 'EN ENVIO', 'CANCELADO', 'EXTRAVIADO', 'VENDIDO', 'DONADO', 'VENTA', 'POSIBLE VENTA', 'DESECHO', 'DESECHADO', 'BLOQUEADO', 'ROBO'],
    estatusLinea: ['USO', 'SUSPENDIDA', 'RESGUARDO', 'ESPERA DE EQUIPO', 'ESPERA DE RESPONSIVA', 'EN ENVIO', 'RENOVADA', 'SIN LINEA', 'EN PROCESO DE CANCELACION', 'CANCELADA'],
    companias: ['TELCEL', 'AT&T', 'BAIT'],
    accesorios: ['CAJA', 'CARGADOR', 'CABLE', 'CUBO', 'FUNDA', 'MICA', 'SD', 'NINGUNO'],
  };

  /** Columnas que describen la línea dentro de una fila. */
  const COLS_LINEA = ['NUMERO TELEFONO', 'NUMERO SIM', 'COMPAÑIA', 'COSTO PLAN', 'INICIO PLAN', 'FIN PLAN', 'ESTATUS LINEA', 'PIN WHATSAPP', 'FECHA CAMBIO TEMPORAL', 'EMAIL USUARIO'];
  /** Valores con los que el área de líneas deja una fila de equipo al quitarle la línea. */
  const VALORES_SIN_LINEA = {
    'NUMERO TELEFONO': 'NO APLICA', 'NUMERO SIM': 'NO APLICA', 'PIN WHATSAPP': 'NO APLICA', 'COMPAÑIA': '',
    'COSTO PLAN': 0, 'INICIO PLAN': '', 'FIN PLAN': '', 'ESTATUS LINEA': 'SIN LINEA', 'FECHA CAMBIO TEMPORAL': '', 'EMAIL USUARIO': '',
  };
  const COLS_RESPONSABLE = {
    noEmpleado: 'NO EMPLEADO', nombre: 'RESPONSABLE', puesto: 'PUESTO', departamento: 'DEPARTAMENTO', area: 'AREA',
    sede: 'SEDE', oficina: 'OFICINA / DESARROLLO', jefeDirecto: 'JEFE DIRECTO', director: 'DIRECTOR', razonSocial: 'RAZON SOCIAL',
  };
  /** Campos que registraba el bot "CAMBIOS TELEFONIA" del AppSheet. */
  const CAMPOS_BITACORA = ['RESPONSABLE', 'RESPONSIVA', 'ESTATUS LINEA', 'OFICINA / DESARROLLO', 'ESTATUS EQUIPO', 'CUENTA GOOGLE', 'AREA',
    'COMENTARIOS', 'PIN EQUIPO', 'PIN WHATSAPP', 'NUMERO SIM', 'DEPARTAMENTO', 'ACCESORIOS', 'NUMERO TELEFONO', 'SEDE', 'COSTO PLAN', 'TIPO',
    'INICIO PLAN', 'EQUIPO', 'FIN PLAN', 'RAZON SOCIAL', 'COMPAÑIA', 'NUCO', 'IMEI', 'COLOR', 'PATRON', 'CONTRASEÑA MODEM'];

  const COLS_INDICE_EQUIPOS = ['id', 'nuco', 'tipo', 'modelo', 'imei', 'estatus', 'responsable', 'departamento', 'sede', 'lineaId', 'numero', 'compania', 'estatusLinea'];
  const COLS_INDICE_LINEAS = ['id', 'numero', 'sim', 'compania', 'estatus', 'equipoId', 'nucoEquipo', 'responsable', 'departamento', 'suelta'];
  const SEG_CACHE_INDICE = 30 * 60;

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
      id: id, fila: f._fila, folio: folioRegistro(tipo, col(f, 'NUCO')), tipo: tipo || null,
      nuco: txt(col(f, 'NUCO')) === null ? null : String(col(f, 'NUCO')),
      estatusGeneral: estatusGeneralRegistro(id, tipo, txt(col(f, 'ESTATUS EQUIPO')), txt(col(f, 'ESTATUS LINEA'))),
      comentarios: txt(col(f, 'COMENTARIOS')),
      responsivaRuta: txt(col(f, 'RESPONSIVA')), formatoInspeccionRuta: txt(col(f, 'FORMATO INSPECCION')),
      fechaInspeccion: fecha(col(f, 'FECHA INSPECCION')), fechaRegistro: fecha(col(f, 'FECHA REGISTRO')),
      puestoInventario: txt(col(f, 'PUESTO INV')),
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

    return { id: id, tipo: tipo, nuco: nuco, equipo: equipo, linea: linea };
  }

  /** "Quien usa el equipo" y segundo…quinto responsable, como lista. */
  function usuariosAdicionales_(f) {
    const lista = [];
    const agregar = (rol, nombre, puesto) => {
      const n = txt(col(f, nombre));
      if (n) lista.push({ rol: rol, nombre: n, puesto: txt(col(f, puesto)) });
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
      equipo.lineaId || null, linea ? linea.numero || null : null, linea ? linea.compania || null : null, linea ? linea.estatus || null : null];
  }

  function filaIndiceLinea_(linea, equipo) {
    const r = (equipo ? equipo.responsable : linea.responsable) || {};
    return [linea._id, linea.numero || null, linea.sim || null, linea.compania || null, linea.estatus || null, linea.equipoId || null,
      equipo ? equipo.nuco || null : linea.nucoLegado || null, r.nombre || null, r.departamento || null, !linea.equipoId];
  }

  /** Índices de equipos y líneas (1 lectura de la pestaña; caché 30 min). */
  function indice(forzar) {
    if (!forzar) {
      const enCache = LineasDatos.cacheLeer('indice_telefonia');
      if (enCache) return enCache;
    }
    const equipos = [];
    const lineas = [];
    LineasDatos.leerTabla(TAB.LINEAS).forEach((f) => {
      const r = convertirRegistro(f);
      if (!r) return;
      if (r.equipo) equipos.push(filaIndiceEquipo_(r.equipo, r.linea));
      if (r.linea) lineas.push(filaIndiceLinea_(r.linea, r.equipo));
    });
    const ix = LineasUtil.paraCliente({
      equipos: { columnas: COLS_INDICE_EQUIPOS, filas: equipos },
      lineas: { columnas: COLS_INDICE_LINEAS, filas: lineas },
      generadoEn: new Date(),
    });
    LineasDatos.cacheGuardar('indice_telefonia', ix, SEG_CACHE_INDICE);
    return ix;
  }

  /**
   * Tras una operación: vuelve a leer los registros tocados y actualiza la caché del índice.
   * Devuelve { equipos: [filas], lineas: [filas], quitar: { equipos: [ids], lineas: [ids] } } para que la
   * interfaz se actualice sin recargar (un registro puede dejar de ser línea o desaparecer).
   */
  function refrescarIndice(ids) {
    const cambios = { equipos: [], lineas: [], quitar: { equipos: [], lineas: [] } };
    const ix = LineasDatos.cacheLeer('indice_telefonia');
    (ids || []).filter(Boolean).forEach((id) => {
      const f = leerRegistroPorId(id);
      const r = f ? convertirRegistro(f) : null;
      if (ix) {
        ix.equipos.filas = ix.equipos.filas.filter((x) => x[0] !== id);
        ix.lineas.filas = ix.lineas.filas.filter((x) => x[0] !== id);
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
    if (ix) LineasDatos.cacheGuardar('indice_telefonia', ix, SEG_CACHE_INDICE);
    return cambios;
  }

  function leerRegistroPorId(id) {
    const filas = LineasDatos.buscarFilas(TAB.LINEAS, 'ID', id);
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
   * usuario = { correo, nombre }. Devuelve { idsCambios, idReasignacion, campos: [{campo, antes, despues}] }.
   */
  function guardarCambiosRegistro(f, cambios, usuario, ahora) {
    const t = LineasDatos.tablaFresca(TAB.LINEAS);
    const efectivos = [];
    const nuevo = Object.assign({}, f);
    Object.keys(cambios).forEach((c) => {
      if (LineasDatos.colIndice(t, c) < 0) return;
      const antes = col(f, c);
      if (normalizarComparacion_(antes) === normalizarComparacion_(cambios[c])) return;
      efectivos.push({ campo: c, antes: antes, despues: cambios[c] });
      nuevo[t.encabezados[LineasDatos.colIndice(t, c)]] = cambios[c];
    });
    if (!efectivos.length) return { idsCambios: [], idReasignacion: null, campos: [] };

    const escribir = {};
    efectivos.forEach((e) => { escribir[e.campo] = e.despues; });
    const tipoNuevo = (txt(col(nuevo, 'TIPO')) || '').toUpperCase();
    if (LineasDatos.colIndice(t, 'FOLIO') >= 0) escribir['FOLIO'] = folioRegistro(tipoNuevo, col(nuevo, 'NUCO'));
    if (LineasDatos.colIndice(t, 'ESTATUS GENERAL') >= 0) {
      escribir['ESTATUS GENERAL'] = estatusGeneralRegistro(f['ID'], tipoNuevo, txt(col(nuevo, 'ESTATUS EQUIPO')), txt(col(nuevo, 'ESTATUS LINEA')));
    }
    LineasDatos.actualizarFila(TAB.LINEAS, f._fila, escribir);

    const bitacora = efectivos.filter((e) => CAMPOS_BITACORA.indexOf(LineasDatos.normCol(e.campo)) >= 0).map((e) => ({
      'ID_CAMBIO': LineasDatos.nuevoIdCorto(), 'ID_LINEA': f['ID'], 'NUCO': col(f, 'NUCO'), 'IMEI': col(f, 'IMEI'), 'TABLA': TAB.LINEAS,
      'CAMPO': e.campo, 'ANTES': textoBitacora_(e.antes), 'DESPUES': textoBitacora_(e.despues),
      'ACTUALIZADO POR': usuario.nombre, 'FECHA ACTUALIZACION': ahora,
    }));
    LineasDatos.agregarFilas(TAB.CAMBIOS, bitacora);

    let idReasignacion = null;
    if (efectivos.some((e) => LineasDatos.normCol(e.campo) === 'RESPONSABLE')) {
      idReasignacion = LineasDatos.nuevoIdCorto();
      LineasDatos.agregarFilas(TAB.REASIG, [{
        'ID Historial': idReasignacion, 'ID Linea': f['ID'], 'Fecha de Reasignacion': ahora, 'NUCO': col(f, 'NUCO'),
        'No Empleado Saliente': col(f, 'NO EMPLEADO'), 'Responsable Saliente': col(f, 'RESPONSABLE'), 'Departamento Saliente': col(f, 'DEPARTAMENTO'),
        'No Empleado Entrante': col(nuevo, 'NO EMPLEADO'), 'Responsable Entrante': col(nuevo, 'RESPONSABLE'), 'Departamento Entrante': col(nuevo, 'DEPARTAMENTO'),
        'QUIEN REGISTRO': usuario.nombre,
      }]);
    }
    return {
      idsCambios: bitacora.map((b) => b['ID_CAMBIO']),
      idReasignacion: idReasignacion,
      campos: efectivos.map((e) => ({ campo: e.campo, antes: textoBitacora_(e.antes), despues: textoBitacora_(e.despues) })),
    };
  }

  /** Nueva fila en LINEAS TELEFONICAS (con FOLIO / ESTATUS GENERAL calculados). */
  function agregarRegistro(datos) {
    const t = LineasDatos.tablaFresca(TAB.LINEAS);
    const tipo = (datos['TIPO'] || '').toUpperCase();
    if (LineasDatos.colIndice(t, 'FOLIO') >= 0) datos['FOLIO'] = folioRegistro(tipo, datos['NUCO']);
    if (LineasDatos.colIndice(t, 'ESTATUS GENERAL') >= 0) datos['ESTATUS GENERAL'] = estatusGeneralRegistro(datos['ID'], tipo, txt(datos['ESTATUS EQUIPO']), txt(datos['ESTATUS LINEA']));
    return LineasDatos.agregarFilas(TAB.LINEAS, [datos])[0];
  }

  /** Registro de la operación en APP_MOVIMIENTOS (motivo, ticket y resumen antes/después). */
  function registrarMovimiento(tipo, datos, usuario, ahora, extra) {
    asegurarPestanaApp(TAB.APP_MOV);
    const id = LineasDatos.nuevoIdCorto();
    LineasDatos.agregarFilas(TAB.APP_MOV, [{
      'ID': id, 'FECHA': ahora, 'TIPO': tipo, 'REFS': ',' + (extra.refs || []).filter(Boolean).join(',') + ',',
      'NUCO': extra.nuco || '', 'NUMERO': extra.numero || '', 'NUCO_DESTINO': extra.nucoDestino || '',
      'MOTIVO': txt(datos.motivo) || '', 'TICKET': txt(datos.ticket) || '',
      'USUARIO_CORREO': usuario.correo, 'USUARIO_NOMBRE': usuario.nombre,
      'ANTES_JSON': JSON.stringify(extra.antes || {}), 'DESPUES_JSON': JSON.stringify(extra.despues || {}),
      'DETALLE_JSON': JSON.stringify(extra.detalle || {}),
    }]);
    return id;
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
      _id: txt(f['ID']), origen: ev && ev.origen === 'SISTEMA' ? 'SISTEMA' : 'APPSHEET', registroId: txt(col(f, 'ID LINEA')),
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
      observaciones: txt(col(f, 'OBSERVACIONES')), ticket: ticket === null ? null : String(ticket), inspector: txt(col(f, 'NOMBRE INSPECTOR')),
      firmas: { responsableRuta: txt(col(f, 'FIRMA RESPONSABLE')), inspectorRuta: txt(col(f, 'FIRMA INSPECTOR')) },
      pdfRuta: txt(col(f, 'FORMATO INSPECCIONES LINEAS')),
      drive: driveDeEvidencia_(ev),
      pdf: ev && ev.pdfs && ev.pdfs.length ? { id: ev.pdfs[0].id, nombre: ev.pdfs[0].nombre } : null,
    };
  }

  /** Inspección histórica que solo existe como carpeta en Drive. */
  function inspeccionDesdeEvidencia(ev) {
    return {
      _id: 'drive_' + ev.carpetaId, origen: 'DRIVE', registroId: ev.idLinea, nuco: ev.nuco, fecha: ev.fecha,
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
      _id: txt(f['ID']), origen: ev && ev.origen === 'SISTEMA' ? 'SISTEMA' : 'APPSHEET', registroId: txt(col(f, 'ID LINEA')),
      nuco: nuco4(col(f, 'NUCO')), fecha: fch,
      responsable: { nombre: txt(col(f, 'RESPONSABLE')) },
      responsableCI: txt(col(f, 'NOMBRE CI')), drive: driveDeEvidencia_(ev),
      pdf: ev && ev.pdfs && ev.pdfs.length ? { id: ev.pdfs[0].id } : null,
    };
  }

  /**
   * Inspecciones y responsivas de un registro (fila de LINEAS TELEFONICAS):
   * las del AppSheet/sistema (por ID LINEA) + las históricas solo en Drive (por NUCO).
   */
  function evidenciasDeRegistro(id) {
    const hayApp = LineasDatos.existeTabla(TAB.APP_EVID);
    const peticiones = [
      { tabla: TAB.INSP, filas: LineasDatos.buscarFilas(TAB.INSP, 'ID LINEA', id) },
      { tabla: TAB.RESP, filas: LineasDatos.buscarFilas(TAB.RESP, 'ID LINEA', id) },
    ];
    // Las carpetas históricas (solo Drive) quedan con ID_LINEA del equipo de su NUCO al sincronizar.
    if (hayApp) peticiones.push({ tabla: TAB.APP_EVID, filas: LineasDatos.buscarFilas(TAB.APP_EVID, 'ID_LINEA', id) });
    const r = LineasDatos.leerFilas(peticiones);
    const evidencias = hayApp ? r[2].map(evidenciaDesdeFila) : [];
    const evPorRegistro = {};
    evidencias.forEach((e) => { if (e.idRegistro) evPorRegistro[e.idRegistro] = e; });

    const inspecciones = r[0].map((f) => inspeccionDesdeFila(f, evPorRegistro[txt(f['ID'])]));
    const responsivas = r[1].map((f) => responsivaDesdeFila(f, evPorRegistro[txt(f['ID'])]));
    evidencias.forEach((e) => {
      if (e.origen !== 'DRIVE') return;
      if (e.idLinea && e.idLinea !== id) return;
      if (e.tipo === 'INSPECCION') inspecciones.push(inspeccionDesdeEvidencia(e));
      else responsivas.push({ _id: 'drive_' + e.carpetaId, origen: 'DRIVE', nuco: e.nuco, fecha: e.fecha, drive: driveDeEvidencia_(e) });
    });
    return { inspecciones: inspecciones, responsivas: responsivas };
  }

  /** Inspección por id: fila de INSPECCIONES LINEAS, o "drive_<carpetaId>" si solo existe en Drive. */
  function leerInspeccion(id) {
    if (/^drive_/.test(id)) {
      const filas = LineasDatos.buscarFilas(TAB.APP_EVID, 'CARPETA_ID', id.slice(6));
      if (!filas.length) return null;
      return inspeccionDesdeEvidencia(evidenciaDesdeFila(LineasDatos.leerFilas([{ tabla: TAB.APP_EVID, filas: filas.slice(0, 1) }])[0][0]));
    }
    const filas = LineasDatos.buscarFilas(TAB.INSP, 'ID', id);
    if (!filas.length) return null;
    const f = LineasDatos.leerFilas([{ tabla: TAB.INSP, filas: filas.slice(0, 1) }])[0][0];
    const filasEv = LineasDatos.existeTabla(TAB.APP_EVID) ? LineasDatos.buscarFilas(TAB.APP_EVID, 'ID_REGISTRO', id) : [];
    const ev = filasEv.length ? evidenciaDesdeFila(LineasDatos.leerFilas([{ tabla: TAB.APP_EVID, filas: filasEv.slice(0, 1) }])[0][0]) : null;
    return inspeccionDesdeFila(f, ev);
  }

  /** Historial: bitácora de cambios, reasignaciones, desechos y movimientos del nuevo sistema. */
  function historialDeRegistro(id, puedeVerSecretos) {
    const hayMov = LineasDatos.existeTabla(TAB.APP_MOV);
    const filasCambios = LineasDatos.buscarFilas(TAB.CAMBIOS, 'ID_LINEA', id).slice(-400); // las más recientes
    const peticiones = [
      { tabla: TAB.CAMBIOS, filas: filasCambios },
      { tabla: TAB.REASIG, filas: LineasDatos.buscarFilas(TAB.REASIG, 'ID Linea', id) },
      { tabla: TAB.DESECHO, filas: LineasDatos.buscarFilas(TAB.DESECHO, 'ID_EQUIPO', id) },
    ];
    if (hayMov) peticiones.push({ tabla: TAB.APP_MOV, filas: LineasDatos.buscarFilas(TAB.APP_MOV, 'REFS', ',' + id + ',', true) });
    const r = LineasDatos.leerFilas(peticiones);
    const ocultar = (campo, v) => (!puedeVerSecretos && /PIN|PATRON|CONTRASE/i.test(campo || '') && v ? '••••' : v);
    const json = (v) => { try { return JSON.parse(v || '{}'); } catch (e) { return {}; } };

    const ocultosCambios = {};
    const ocultasReasig = {};
    const ocultosDesechos = {};
    const movimientos = (hayMov ? r[3] : []).map((f) => {
      const detalle = json(f['DETALLE_JSON']);
      (detalle.idsCambios || []).forEach((x) => { ocultosCambios[x] = true; });
      (detalle.idsReasignacion || []).forEach((x) => { ocultasReasig[x] = true; });
      if (detalle.idDesecho) ocultosDesechos[detalle.idDesecho] = true;
      return {
        tipo: f['TIPO'], origen: 'SISTEMA', fecha: fecha(f['FECHA']), nuco: txt(f['NUCO']), numero: txt(f['NUMERO']), nucoDestino: txt(f['NUCO_DESTINO']),
        motivo: txt(f['MOTIVO']), ticket: txt(f['TICKET']), usuario: { correo: txt(f['USUARIO_CORREO']), nombre: txt(f['USUARIO_NOMBRE']) },
        antes: json(f['ANTES_JSON']), despues: json(f['DESPUES_JSON']), inspeccionId: detalle.inspeccionId || null, responsivaId: detalle.responsivaId || null,
        folio: detalle.folio || null, detalle: detalle.lugar ? { lugar: detalle.lugar, estado: detalle.estado } : null,
        cambios: (detalle.cambios || []).map((c) => ({ campo: c.campo, antes: ocultar(c.campo, c.antes), despues: ocultar(c.campo, c.despues) })),
      };
    });

    r[1].forEach((f) => {
      if (ocultasReasig[txt(f['ID Historial'])]) return;
      movimientos.push({
        tipo: 'REASIGNACION', origen: 'LEGADO', fecha: fecha(col(f, 'Fecha de Reasignacion')), nuco: nuco4(col(f, 'NUCO')),
        antes: { responsable: { nombre: txt(col(f, 'Responsable Saliente')), noEmpleado: txt(col(f, 'No Empleado Saliente')), departamento: txt(col(f, 'Departamento Saliente')) } },
        despues: { responsable: { nombre: txt(col(f, 'Responsable Entrante')), noEmpleado: txt(col(f, 'No Empleado Entrante')), departamento: txt(col(f, 'Departamento Entrante')) } },
        usuario: { nombre: txt(col(f, 'QUIEN REGISTRO')) },
      });
    });
    r[2].forEach((f) => {
      if (ocultosDesechos[txt(f['ID_DESECHO'])]) return;
      movimientos.push({
        tipo: 'DESECHO', origen: 'LEGADO', fecha: fecha(col(f, 'FECHA DE DESECHO')) || fecha(col(f, 'FECHA DE REGISTRO')),
        folio: txt(col(f, 'FOLIO DESECHO')), motivo: txt(col(f, 'MOTIVO')),
        detalle: { lugar: txt(col(f, 'LUGAR DE DESECHO')), estado: txt(col(f, 'ESTADO')) }, usuario: { nombre: txt(col(f, 'QUIEN REGISTRO')) },
      });
    });

    const eventos = r[0].filter((f) => !ocultosCambios[txt(f['ID_CAMBIO'])]).map((f) => {
      const campo = txt(col(f, 'CAMPO'));
      const antes = txt(col(f, 'ANTES'));
      const despues = txt(col(f, 'DESPUES'));
      return {
        fecha: fecha(col(f, 'FECHA ACTUALIZACION')), campo: campo,
        antes: ocultar(campo, antes === null ? null : String(antes)), despues: ocultar(campo, despues === null ? null : String(despues)),
        usuario: txt(col(f, 'ACTUALIZADO POR')),
      };
    }).sort((a, b) => (b.fecha || 0) - (a.fecha || 0));

    return {
      movimientos: movimientos.sort((a, b) => (b.fecha || 0) - (a.fecha || 0)),
      legado: { eventos: eventos, total: eventos.length },
    };
  }

  // ---------------- Bitácoras (vistas de control) ----------------

  /** Pestañas que se consultan como bitácora completa desde el menú. */
  const BITACORAS = {
    CAMBIOS: { tabla: TAB.CAMBIOS, ocultarSecretos: 'CAMPO' },
    REASIGNACIONES: { tabla: TAB.REASIG },
    DESECHOS: { tabla: TAB.DESECHO },
  };

  /**
   * Página de una bitácora, de la más reciente a la más antigua (las filas se agregan al final).
   * Con `q` busca el texto en cualquier columna (TextFinder) y pagina solo las coincidencias.
   * Devuelve { encabezados, filas: [{columna: valor}], total, pagina, paginas }.
   */
  function bitacora(tipo, q, pagina, porPagina, puedeVerSecretos) {
    const cfg = BITACORAS[tipo];
    if (!cfg) throw new Error('Bitácora desconocida: ' + tipo);
    porPagina = Math.min(Math.max(Number(porPagina) || 50, 10), 200);
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
        if (cfg.ocultarSecretos && !puedeVerSecretos && /PIN|PATRON|CONTRASE/i.test(String(f[cfg.ocultarSecretos] || ''))) {
          if (o['ANTES']) o['ANTES'] = '••••';
          if (o['DESPUES']) o['DESPUES'] = '••••';
        }
        return o;
      });
    return { encabezados: encabezados, filas: salida, total: total, pagina: pagina, paginas: Math.max(1, Math.ceil(total / porPagina)) };
  }

  // ---------------- Vistas operativas heredadas de AppSheet ----------------

  const VISTAS_OPERATIVAS = {
    REACTIVACION: {
      tabla: TAB.REACTIVACION, grupo: 'ESTATUS',
      encabezados: ['FOLIO', 'LINEA SUSPENDIDA', 'COMPAÑIA', 'SIM', 'CORREO / TICKET', 'FECHA DE SUSPENSION',
        'ESTATUS', 'ESTADO DEL EQUIPO', 'IMEI', 'RETRO DE SOLICITUD', 'FECHA DE REACTIVACION', 'NUEVO NUMERO',
        'FECHA DE REGISTRO', 'QUIEN REGISTRO', 'COMENTARIOS'],
    },
    SOLICITUD: {
      tabla: TAB.SOLICITUD, grupo: 'ESTATUS',
      encabezados: ['FOLIO', 'FECHA DE SOLICITUD', 'TIPO DE PLAN', 'TICKET', 'NÚMERO DE EMPLEADO DEL SOLICITANTE',
        'NOMBRE COMPLETO DEL SOLICITANTE', 'PUESTO DEL SOLICITANTE', 'DEPARTAMENTO DEL SOLICITANTE', 'SEDE',
        'DEPARTAMENTO', 'TIPO', 'PUESTO', 'COLABORADOR', 'SOLICITANTE', 'FECHA DE ENTREGA', 'ASIGNACION',
        'REASIGNACION', 'COMPAÑIA', 'EQUIPO', 'NUMERO ANTERIOR', 'NUMERO ACTUAL', 'IMEI', 'SIM', 'ESTATUS',
        'FECHA DE REGISTRO', 'QUIEN REGISTRO', 'COMENTARIOS'],
    },
    POST_VENTA: {
      tabla: TAB.LINEAS, grupo: 'TIPO', departamento: 'POST VENTA',
      encabezados: ['NUMERO TELEFONO', 'FOLIO', 'NUCO', 'TIPO', 'RESPONSABLE', 'EQUIPO', 'IMEI', 'NUMERO SIM',
        'ACCESORIOS', 'SEDE', 'OFICINA / DESARROLLO', 'DEPARTAMENTO', 'AREA', 'RAZON SOCIAL', 'PIN WHATSAPP',
        'PIN EQUIPO', 'CUENTA GOOGLE', 'COMPAÑIA', 'COSTO PLAN', 'FECHA REGISTRO', 'INICIO PLAN', 'FIN PLAN',
        'ESTATUS LINEA', 'ESTATUS EQUIPO'],
    },
  };

  const CAMPOS_ALTA_OPERATIVA = {
    REACTIVACION: ['LINEA SUSPENDIDA', 'COMPAÑIA', 'SIM', 'CORREO / TICKET', 'FECHA DE SUSPENSION', 'ESTATUS',
      'ESTADO DEL EQUIPO', 'IMEI', 'RETRO DE SOLICITUD', 'FECHA DE REACTIVACION', 'NUEVO NUMERO', 'COMENTARIOS'],
    SOLICITUD: ['FECHA DE SOLICITUD', 'TIPO DE PLAN', 'TICKET', 'NÚMERO DE EMPLEADO DEL SOLICITANTE',
      'NOMBRE COMPLETO DEL SOLICITANTE', 'PUESTO DEL SOLICITANTE', 'DEPARTAMENTO DEL SOLICITANTE', 'SEDE',
      'DEPARTAMENTO', 'TIPO', 'PUESTO', 'COLABORADOR', 'SOLICITANTE', 'FECHA DE ENTREGA', 'ASIGNACION',
      'REASIGNACION', 'COMPAÑIA', 'EQUIPO', 'NUMERO ANTERIOR', 'NUMERO ACTUAL', 'IMEI', 'SIM', 'ESTATUS', 'COMENTARIOS'],
  };

  /**
   * Página buscable de Reactivación, Solicitud o Líneas Post Venta. Las dos
   * primeras leen sus tablas del AppSheet; Post Venta es la misma selección
   * de LINEAS TELEFONICAS cuyo departamento es POST VENTA.
   */
  function vistaOperativa(tipo, opciones, puedeVerSecretos) {
    const cfg = VISTAS_OPERATIVAS[String(tipo || '').toUpperCase()];
    if (!cfg) throw new Error('Vista operativa desconocida: ' + tipo);
    if (!LineasDatos.existeTabla(cfg.tabla)) throw new Error('No existe la pestaña "' + cfg.tabla + '" en la base de telefonía.');

    const o = opciones || {};
    const pagina = Math.max(0, Number(o.pagina) || 0);
    const porPagina = Math.min(200, Math.max(10, Number(o.porPagina) || 50));
    const q = String(o.q || '').trim().toUpperCase();
    const grupo = String(o.grupo || '').trim().toUpperCase();
    const tabla = LineasDatos.tabla(cfg.tabla);
    const encabezados = cfg.encabezados.map((h) => {
      const objetivo = LineasDatos.normCol(h);
      return tabla.encabezados.find((real) => LineasDatos.normCol(real) === objetivo);
    }).filter(Boolean);

    let filas;
    if (cfg.departamento) {
      const numeros = LineasDatos.buscarFilas(cfg.tabla, 'DEPARTAMENTO', cfg.departamento, false);
      filas = LineasDatos.leerFilas([{ tabla: cfg.tabla, filas: numeros }])[0]
        .filter((f) => /^EQUIPO(?: \+ SIM(?: BASICO)?)?$/.test(String(col(f, 'TIPO') || '').trim().toUpperCase()));
    } else {
      filas = LineasDatos.leerTabla(cfg.tabla);
    }

    const grupos = {};
    filas.forEach((f) => {
      const valor = String(col(f, cfg.grupo) || 'SIN ESTATUS').trim().toUpperCase();
      grupos[valor] = (grupos[valor] || 0) + 1;
    });
    const totalSinFiltro = filas.length;
    filas = filas.filter((f) => {
      if (grupo && String(col(f, cfg.grupo) || 'SIN ESTATUS').trim().toUpperCase() !== grupo) return false;
      if (!q) return true;
      return encabezados.some((h) => String(f[h] === null || f[h] === undefined ? '' : f[h]).toUpperCase().indexOf(q) >= 0);
    });

    const total = filas.length;
    const desde = pagina * porPagina;
    const salida = filas.slice(desde, desde + porPagina).map((f) => {
      const fila = { _fila: f._fila };
      encabezados.forEach((h) => {
        const secreto = /^(PIN WHATSAPP|PIN EQUIPO|CONTRASEÑA MODEM)$/i.test(h);
        fila[h] = secreto && !puedeVerSecretos && f[h] ? '••••' : f[h];
      });
      return fila;
    });
    return {
      encabezados: encabezados, filas: salida, total: total, totalSinFiltro: totalSinFiltro,
      pagina: pagina, paginas: Math.max(1, Math.ceil(total / porPagina)), campoGrupo: cfg.grupo,
      grupos: Object.keys(grupos).sort().map((nombre) => ({ nombre: nombre, total: grupos[nombre] })),
    };
  }

  /** Agrega un registro conservando las columnas y folios de las tablas del AppSheet. */
  function crearVistaOperativa(tipo, datos, usuario) {
    const clave = String(tipo || '').toUpperCase();
    const cfg = VISTAS_OPERATIVAS[clave];
    const permitidos = CAMPOS_ALTA_OPERATIVA[clave];
    if (!cfg || !permitidos) throw new Error('Este módulo no admite altas.');
    datos = datos || {};
    const requeridos = clave === 'REACTIVACION' ? ['LINEA SUSPENDIDA', 'ESTATUS'] : ['FECHA DE SOLICITUD', 'TIPO DE PLAN'];
    requeridos.forEach((campo) => {
      if (datos[campo] === null || datos[campo] === undefined || String(datos[campo]).trim() === '') {
        throw new Error('El campo "' + campo + '" es obligatorio.');
      }
    });

    return LineasDatos.conCandado(() => {
      const existentes = LineasDatos.leerTabla(cfg.tabla);
      const folio = existentes.reduce((max, f) => Math.max(max, Number(col(f, 'FOLIO')) || 0), 0) + 1;
      const fila = { FOLIO: folio, 'FECHA DE REGISTRO': new Date(), 'QUIEN REGISTRO': usuario.nombre || usuario.correo };
      permitidos.forEach((campo) => {
        if (!(campo in datos)) return;
        let valor = datos[campo];
        if (/^FECHA /.test(campo) && valor) valor = new Date(valor + (String(valor).length === 10 ? 'T12:00:00' : ''));
        fila[campo] = valor;
      });
      const numeroFila = LineasDatos.agregarFilas(cfg.tabla, [fila])[0];
      return { ok: true, folio: folio, fila: numeroFila };
    });
  }

  // ---------------- Catálogos y colaboradores ----------------

  /** Catálogos para formularios: enums del AppSheet + valores de LISTAS TELEFONOS y BITACORA DE DESECHO. */
  function catalogos() {
    const enCache = LineasDatos.cacheLeer('catalogos_telefonia');
    if (enCache) return enCache;
    const unicos = (filas, columna) => {
      const m = {};
      filas.forEach((f) => { const v = txt(col(f, columna)); if (v && !(v instanceof Date)) m[String(v).trim().toUpperCase()] = true; });
      return Object.keys(m).sort();
    };
    const listas = LineasDatos.existeTabla(TAB.LISTAS) ? LineasDatos.leerTabla(TAB.LISTAS) : [];
    const desechos = LineasDatos.leerTabla(TAB.DESECHO);
    const c = Object.assign({}, CATALOGO, {
      modelos: unicos(listas, 'EQUIPO'),
      razonesSociales: unicos(listas, 'RAZON SOCIAL'),
      companias: CATALOGO.companias.concat(unicos(listas, 'COMPAÑIA')).filter((v, i, a) => a.indexOf(v) === i),
      lugaresDesecho: unicos(desechos, 'LUGAR DE DESECHO'),
      estadosDesecho: unicos(desechos, 'ESTADO'),
    });
    LineasDatos.cacheGuardar('catalogos_telefonia', c, 21600);
    return c;
  }

  function indiceColaboradores() {
    const enCache = LineasDatos.cacheLeer('indice_colaboradores');
    if (enCache) return enCache;
    const filas = LineasDatos.leerTabla(TAB.COLAB).map((f) => {
      const n = txt(col(f, 'No EMPLEADO'));
      return [n === null ? null : String(n), txt(col(f, 'NOMBRE COMPLETO')), txt(col(f, 'PUESTO')), txt(col(f, 'DEPARTAMENTO')),
        txt(col(f, 'AREA')), txt(col(f, 'SEDE')), txt(col(f, 'OFICINA/DESARROLLO')), txt(col(f, 'ESTATUS COLABORADOR'))];
    }).filter((c) => c[1]);
    const ix = LineasUtil.paraCliente({ columnas: ['noEmpleado', 'nombre', 'puesto', 'departamento', 'area', 'sede', 'oficina', 'estatus'], filas: filas, generadoEn: new Date() });
    LineasDatos.cacheGuardar('indice_colaboradores', ix, 21600);
    return ix;
  }

  /** Vacía las cachés del módulo (índices, catálogos y carpetas). */
  function borrarCaches() {
    ['indice_telefonia', 'indice_colaboradores', 'carpetas_nucos', 'catalogos_telefonia'].forEach(LineasDatos.cacheBorrar);
  }

  return {
    TAB, ENCABEZADOS_APP, TIPOS_CON_EQUIPO, TIPOS_CON_LINEA, TIPOS_LINEA_OPCIONAL, CATALOGO,
    COLS_LINEA, VALORES_SIN_LINEA, COLS_RESPONSABLE, CAMPOS_BITACORA,
    tipoConLinea, tipoSinLinea, convertirRegistro, folioRegistro, estatusGeneralRegistro,
    indice, refrescarIndice, leerRegistroPorId, leerRegistroObligatorio,
    guardarCambiosRegistro, agregarRegistro, registrarMovimiento, asegurarPestanaApp,
    evidenciaDesdeFila, inspeccionDesdeFila, inspeccionDesdeEvidencia, responsivaDesdeFila,
    evidenciasDeRegistro, leerInspeccion, historialDeRegistro, bitacora, vistaOperativa, crearVistaOperativa,
    catalogos, indiceColaboradores, borrarCaches,
  };
})();
