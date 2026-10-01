/**
 * LineasCorrecciones.gs
 * Módulo TEMPORAL "Correcciones de Líneas" (plan de correcciones, fase 3; usuario, 30-sep-2026).
 *
 * Para qué: juntar en un solo lugar los casos del inventario que necesitan el criterio de Líneas o una revisión
 * física (QUIEN RESUELVE = LINEAS en la conciliación), para que los corrijan sin buscarlos uno por uno. Cuando terminen,
 * el módulo SE ELIMINA. Por eso vive aislado: nada del sistema depende de él.
 *
 * De dónde salen los casos: `conversion_estatus.py` (carpeta "1. Reporte de líneas telefónicas/_script") escribe
 * "CORRECCIONES - para cargar.json"; `npm run correcciones:semilla -- "<ruta>"` lo convierte en
 * LineasCorreccionesSemilla.gs (NO va a GitHub: trae datos del inventario) y `npm run push` lo sube. En el módulo,
 * ADMIN pulsa "Cargar casos". También trae, de solo consulta, lo que se aplica solo al migrar (SISTEMA).
 *
 * Volver a cargar (verificación sola):
 * - un caso que ya existía conserva su estado; si estaba CORREGIDO y sigue apareciendo en una conciliación hecha
 *   con un inventario posterior a cuando se marcó, se REABRE;
 * - un caso que ya no aparece: si el inventario es más nuevo, pasa a VERIFICADO; si es el mismo inventario (cambió una
 *   regla), se quita si nadie lo había tocado;
 * - lo aplicado solo (AUTOMATICO) se reemplaza completo.
 *
 * Para eliminarlo: borrar este archivo, LineasCorreccionesSemilla.gs, html/views/lineas/lineas-correcciones.html,
 * html/js/lineas-correcciones.html, sus dos include de Index.html, su línea en navegarA y en NAV_GRUPOS (app.html), su
 * entrada en Modulos.gs y en Entidades.gs (APP_CORRECCIONES), el script `correcciones:semilla` y la pestaña
 * APP_CORRECCIONES de la hoja. `Lineas.comun` (lineas.html) puede quedarse.
 */
const LineasCorrecciones = (function () {
  const TAB = 'APP_CORRECCIONES';
  const ENCABEZADOS = ['ID', 'TIPO', 'LLAVE', 'ESTADO', 'CLAVE', 'CATEGORIA', 'PRIORIDAD', 'NUCO', 'ID_APPSHEET', 'NUMERO',
    'TIPO_REGISTRO', 'CAMPO', 'INVENTARIO', 'EVIDENCIA', 'QUE_PASA', 'SUGERENCIA', 'FUENTE', 'ANTES', 'DESPUES', 'REGLA',
    'QUE_HACE', 'QUIEN_RESUELVE', 'COMENTARIO', 'ATENDIO_CORREO', 'ATENDIO_NOMBRE', 'ATENDIDO_EN', 'CARGA',
    'FECHA_INVENTARIO', 'CREADO_EN', 'VISTO_EN'];

  const TIPO = { CORREGIR: 'CORREGIR', AUTOMATICO: 'AUTOMATICO' };
  const ESTADO = { PENDIENTE: 'PENDIENTE', CORREGIDO: 'CORREGIDO', NO_APLICA: 'NO APLICA', VERIFICADO: 'VERIFICADO', AL_MIGRAR: 'AL MIGRAR' };
  const MAXIMO = 600;

  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const ahora = () => new Date();
  /** 'yyyy-mm-dd' de la semilla → Date a mediodía (sin brincos de zona). */
  const diaIso = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(txt(s));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null;
  };
  const ms = (d) => (d instanceof Date && !isNaN(d) ? d.getTime() : 0);

  // ---------------- Semilla ----------------

  /** Datos de la semilla (LineasCorreccionesSemilla.gs) o null si no se subió. */
  function semilla_() {
    if (typeof LINEAS_CORRECCIONES_SEMILLA === 'undefined') return null;
    const s = LINEAS_CORRECCIONES_SEMILLA;
    const bytes = Utilities.base64Decode(s.datos.join(''));
    return JSON.parse(Utilities.ungzip(Utilities.newBlob(bytes, 'application/x-gzip')).getDataAsString('UTF-8'));
  }

  function resumenSemilla_() {
    if (typeof LINEAS_CORRECCIONES_SEMILLA === 'undefined') return null;
    const s = LINEAS_CORRECCIONES_SEMILLA;
    return { carga: s.carga, inventario: s.inventario, fechaInventario: s.fechaInventario, casos: s.casos, automaticos: s.automaticos };
  }

  // ---------------- Lectura ----------------

  function filas_() {
    return LineasDatos.existeTabla(TAB) ? LineasDatos.leerTabla(TAB) : [];
  }

  /** ID del AppSheet o NUCO → ID vigente en LINEAS TELEFONICAS (para "Abrir NUCO"). */
  function resolvedor_() {
    const porId = {};
    const porNuco = {};
    LineasDatos.leerTabla(LineasRepo.TAB.LINEAS).forEach((f) => {
      const ids = LineasDatos.idsDeFila(f);
      if (!ids.length) return;
      ids.forEach((k) => { porId[k.toLowerCase()] = ids[0]; });
      const n = LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO'));
      if (n && !porNuco[n]) porNuco[n] = ids[0];
    });
    return (idAppsheet, nuco) => porId[txt(idAppsheet).toLowerCase()] || porNuco[LineasUtil.nucoVisible(nuco) || '-'] || '';
  }

  function aCliente_(r, resolver) {
    const o = {};
    ENCABEZADOS.forEach((h) => { o[h] = r[h] instanceof Date ? r[h] : txt(r[h]); });
    o.PRIORIDAD = Number(o.PRIORIDAD) || 3;
    o.NUCO = o.NUCO ? (LineasUtil.nucoVisible(o.NUCO) || o.NUCO) : '';
    o.REGISTRO_ID = resolver(o.ID_APPSHEET, o.NUCO);
    return o;
  }

  /** Todo lo que pinta el módulo: casos, aplicados solos, permisos y la semilla disponible para cargar. */
  function estado(usuario) {
    const resolver = resolvedor_();
    const filas = filas_().map((r) => aCliente_(r, resolver));
    const corregir = filas.filter((f) => f.TIPO === TIPO.CORREGIR);
    const ultima = corregir.concat(filas).reduce((m, f) => (f.CARGA > m.carga ? { carga: f.CARGA, fechaInventario: f.FECHA_INVENTARIO } : m), { carga: '', fechaInventario: '' });
    return {
      puedeOperar: !!usuario.puedeOperar,
      puedeCargar: !!usuario.esAdmin,
      semilla: resumenSemilla_(),
      cargado: ultima.carga ? ultima : null,
      corregir: corregir,
      automaticos: filas.filter((f) => f.TIPO === TIPO.AUTOMATICO),
      estados: ESTADO,
    };
  }

  // ---------------- Carga ----------------

  function deCaso_(c, fechaInv, carga) {
    return {
      'TIPO': TIPO.CORREGIR, 'LLAVE': c.llave, 'CLAVE': c.clave, 'CATEGORIA': c.categoria, 'PRIORIDAD': c.prioridad,
      'NUCO': c.nuco, 'ID_APPSHEET': c.idAppsheet, 'NUMERO': c.numero, 'TIPO_REGISTRO': c.tipo, 'CAMPO': c.campo,
      'INVENTARIO': c.inventario, 'EVIDENCIA': c.evidencia, 'QUE_PASA': c.quePasa, 'SUGERENCIA': c.sugerencia,
      'FUENTE': c.fuente, 'CARGA': carga, 'FECHA_INVENTARIO': fechaInv,
    };
  }

  function deAutomatico_(a, fechaInv, carga, cuando) {
    return {
      'TIPO': TIPO.AUTOMATICO, 'ESTADO': ESTADO.AL_MIGRAR, 'CLAVE': a.regla, 'NUCO': a.nuco, 'ID_APPSHEET': a.idAppsheet,
      'TIPO_REGISTRO': a.tipo, 'CAMPO': a.campo, 'ANTES': a.antes, 'DESPUES': a.despues, 'REGLA': a.regla,
      'QUE_HACE': a.queHace, 'QUIEN_RESUELVE': a.quien, 'EVIDENCIA': a.evidencia, 'CARGA': carga,
      'FECHA_INVENTARIO': fechaInv, 'CREADO_EN': cuando, 'VISTO_EN': cuando,
    };
  }

  /**
   * Junta lo que ya hay en la pestaña con la semilla (ver la cabecera). Pura: no lee ni escribe la hoja, para poder
   * probarla. actuales = filas de la hoja (objetos por encabezado). Regresa { filas, resumen }.
   */
  function combinar(actuales, datos, cuando, nuevoId) {
    const fechaInv = diaIso(datos.fechaInventario);
    const carga = txt(datos.carga);
    const resumen = { nuevos: 0, siguen: 0, reabiertos: 0, verificados: 0, quitados: 0, automaticos: 0 };
    const porLlave = {};
    actuales.filter((r) => txt(r['TIPO']) === TIPO.CORREGIR).forEach((r) => { porLlave[txt(r['LLAVE'])] = r; });
    const vistos = {};
    const salida = [];

    (datos.casos || []).forEach((c) => {
      vistos[c.llave] = true;
      const r = porLlave[c.llave];
      if (!r) {
        salida.push(Object.assign(deCaso_(c, fechaInv, carga), { 'ID': nuevoId(), 'ESTADO': ESTADO.PENDIENTE, 'CREADO_EN': cuando, 'VISTO_EN': cuando }));
        resumen.nuevos++;
        return;
      }
      const fila = Object.assign({}, r, deCaso_(c, fechaInv, carga), { 'VISTO_EN': cuando });
      const est = txt(r['ESTADO']);
      // Se marcó corregido y una conciliación con un inventario POSTERIOR lo sigue encontrando: se reabre
      if ((est === ESTADO.CORREGIDO || est === ESTADO.VERIFICADO) && ms(fechaInv) > ms(r['ATENDIDO_EN'])) {
        fila['ESTADO'] = ESTADO.PENDIENTE;
        fila['COMENTARIO'] = [txt(r['COMENTARIO']), 'Reabierto: sigue en la conciliación con el inventario del ' + txt(datos.fechaInventario) + '.'].filter(Boolean).join(' ');
        resumen.reabiertos++;
      } else {
        resumen.siguen++;
      }
      salida.push(fila);
    });

    Object.keys(porLlave).forEach((k) => {
      if (vistos[k]) return;
      const r = porLlave[k];
      const est = txt(r['ESTADO']);
      const inventarioNuevo = ms(fechaInv) > ms(r['FECHA_INVENTARIO']);
      if (est === ESTADO.NO_APLICA || est === ESTADO.VERIFICADO) { salida.push(r); return; }
      if (inventarioNuevo || est === ESTADO.CORREGIDO) {
        salida.push(Object.assign({}, r, { 'ESTADO': ESTADO.VERIFICADO, 'COMENTARIO': [txt(r['COMENTARIO']), 'Ya no aparece en la conciliación del ' + txt(datos.fechaInventario) + '.'].filter(Boolean).join(' ') }));
        resumen.verificados++;
      } else {
        resumen.quitados++; // mismo inventario, cambió una regla y nadie lo había tocado
      }
    });

    (datos.automaticos || []).forEach((a) => { salida.push(Object.assign(deAutomatico_(a, fechaInv, carga, cuando), { 'ID': nuevoId() })); });
    resumen.automaticos = (datos.automaticos || []).length;
    return { filas: salida, resumen: resumen };
  }

  /** ADMIN: carga (o vuelve a cargar) los casos de la semilla. Reescribe la pestaña completa bajo candado. */
  function cargar(usuario) {
    if (!usuario.esAdmin) throw new Error('Solo ADMIN puede cargar los casos.');
    const datos = semilla_();
    if (!datos) throw new Error('No hay casos para cargar: falta subir LineasCorreccionesSemilla.gs (npm run correcciones:semilla).');
    let resumen = null;
    LineasDatos.conCandado(() => {
      if (!LineasDatos.existeTabla(TAB)) LineasDatos.asegurarPestana(TAB, ENCABEZADOS);
      const t = LineasDatos.tablaFresca(TAB);
      const actuales = LineasDatos.leerTabla(TAB);
      const r = combinar(actuales, datos, ahora(), () => LineasDatos.nuevoId(TAB));
      resumen = r.resumen;
      const encabezados = t.encabezados;
      const valor = (v) => (v instanceof Date ? LineasDatos.aHoraHoja(v) : (v === null || v === undefined ? '' : v));
      const matriz = r.filas.map((o) => encabezados.map((h) => valor(o[h])));
      const hoja = t.hoja;
      const antes = Math.max(0, hoja.getLastRow() - 1);
      const faltan = matriz.length + 1 - hoja.getMaxRows();
      if (faltan > 0) hoja.insertRowsAfter(hoja.getMaxRows(), faltan);
      if (matriz.length) hoja.getRange(2, 1, matriz.length, encabezados.length).setValues(matriz);
      if (antes > matriz.length) hoja.getRange(matriz.length + 2, 1, antes - matriz.length, encabezados.length).clearContent();
    });
    LineasDatos.cacheBorrar('enc_' + TAB);
    console.log('Correcciones cargadas por ' + usuario.correo + ': ' + JSON.stringify(resumen));
    return resumen;
  }

  // ---------------- Marcar ----------------

  /**
   * accion: CORREGIDO | NO_APLICA (comentario obligatorio) | REABRIR. Solo casos para corregir (no lo aplicado solo).
   * Todas las celdas van en una llamada a la API de Sheets.
   */
  function marcar(accion, ids, comentario, usuario) {
    if (!usuario.puedeOperar) throw new Error('No tienes permiso para marcar correcciones.');
    const a = txt(accion).toUpperCase();
    const nuevo = { CORREGIDO: ESTADO.CORREGIDO, NO_APLICA: ESTADO.NO_APLICA, REABRIR: ESTADO.PENDIENTE }[a];
    if (!nuevo) throw new Error('Acción desconocida: ' + accion);
    const nota = txt(comentario);
    if (a === 'NO_APLICA' && !nota) throw new Error('Para "No aplica" escribe por qué.');
    const lista = (Array.isArray(ids) ? ids : []).map(txt).filter(Boolean).filter((x, i, l) => l.indexOf(x) === i);
    if (!lista.length) throw new Error('Selecciona al menos un caso.');
    if (lista.length > MAXIMO) throw new Error('Son ' + lista.length + '; el máximo por operación es ' + MAXIMO + '.');
    const hechos = [];
    const omitidos = [];
    LineasDatos.conCandado(() => {
      const porId = {};
      filas_().forEach((r) => { porId[txt(r['ID'])] = r; });
      const cuando = ahora();
      const cambios = [];
      lista.forEach((id) => {
        const r = porId[id];
        if (!r || txt(r['TIPO']) !== TIPO.CORREGIR) { omitidos.push({ id: id, motivo: 'No es un caso para corregir' }); return; }
        if (txt(r['ESTADO']) === nuevo) { omitidos.push({ id: id, nuco: txt(r['NUCO']), motivo: 'Ya estaba ' + nuevo.toLowerCase() }); return; }
        const c = { 'ESTADO': nuevo, 'ATENDIO_CORREO': usuario.correo, 'ATENDIO_NOMBRE': usuario.nombre, 'ATENDIDO_EN': cuando };
        if (nota) c['COMENTARIO'] = [txt(r['COMENTARIO']), (a === 'REABRIR' ? 'Reabierto: ' : '') + nota].filter(Boolean).join(' · ');
        cambios.push({ fila: r._fila, cambios: c });
        hechos.push({ id: id, nuco: txt(r['NUCO']) });
      });
      escribir_(cambios);
    });
    return { hechos: hechos, omitidos: omitidos, estado: nuevo };
  }

  /** [{ fila, cambios: { COLUMNA: valor } }] en una sola llamada (textos RAW, fechas USER_ENTERED); sin API, fila por fila. */
  function escribir_(lista) {
    if (!lista.length) return;
    const t = LineasDatos.tablaFresca(TAB);
    const hoja = "'" + TAB + "'!";
    const crudos = [];
    const fechas = [];
    lista.forEach((x) => Object.keys(x.cambios).forEach((col) => {
      const c = LineasDatos.colIndice(t, col);
      if (c < 0) return;
      const v = x.cambios[col];
      const rango = hoja + LineasDatos.letraColumna(c + 1) + x.fila;
      if (v instanceof Date) fechas.push({ range: rango, values: [[Utilities.formatDate(v, LineasDatos.ZONA_APP, 'yyyy-MM-dd HH:mm:ss')]] });
      else crudos.push({ range: rango, values: [[v === null || v === undefined ? '' : v]] });
    }));
    try {
      SpreadsheetApp.flush();
      if (crudos.length) LineasDatos.sheetsApi('/values:batchUpdate', { valueInputOption: 'RAW', data: crudos });
      if (fechas.length) LineasDatos.sheetsApi('/values:batchUpdate', { valueInputOption: 'USER_ENTERED', data: fechas });
    } catch (e) {
      console.warn('Correcciones: sin API de Sheets, fila por fila (' + e.message + ')');
      lista.forEach((x) => LineasDatos.actualizarFila(TAB, x.fila, x.cambios));
    }
  }

  return { TAB, ENCABEZADOS, TIPO, ESTADO, estado, cargar, marcar, combinar };
})();

// ---------------- API (aquí y no en ClientApi.gs: el módulo se borra con sus archivos) ----------------

function usuarioCorrecciones_(sesion) {
  return {
    correo: sesion.correo, nombre: sesion.nombre || sesion.correo,
    esAdmin: sesion.rol === Config.ROLES.ADMIN,
    puedeOperar: [Config.ROLES.ADMIN, Config.ROLES.OPERADOR].indexOf(sesion.rol) >= 0,
  };
}

/** Casos y lo aplicado solo. Viaja como texto JSON (como las demás tablas grandes). */
function apiLineasCorrecciones(token) {
  const sesion = Auth.validarSesion(token);
  return JSON.stringify(LineasUtil.paraCliente(LineasCorrecciones.estado(usuarioCorrecciones_(sesion))));
}

function apiLineasCorreccionesCargar(token) {
  const sesion = Auth.requiereRol(token, [Config.ROLES.ADMIN]);
  return LineasUtil.paraCliente(LineasCorrecciones.cargar(usuarioCorrecciones_(sesion)));
}

function apiLineasCorreccionesMarcar(token, accion, ids, comentario) {
  const sesion = Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
  return LineasUtil.paraCliente(LineasCorrecciones.marcar(accion, ids, comentario, usuarioCorrecciones_(sesion)));
}
