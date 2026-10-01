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
 * Evidencias (1-oct): `evidencias.py` (misma carpeta de scripts) arma "EVIDENCIAS PARA SUBIR" con los archivos que
 * cita cada caso (facturas, estados de cuenta, barridos, adendums, ventas), un recorte por línea con el renglón marcado
 * y evidencias.json (qué archivo va con qué LLAVE). ADMIN los arrastra en "Subir evidencias": se guardan en la carpeta
 * "Correcciones_Evidencias" de la app en Drive (los Excel como Google Sheets, para ligar al renglón) y cada caso muestra
 * sus enlaces. Drive no abre un PDF en una página: por eso el recorte.
 *
 * Para eliminarlo: borrar este archivo, LineasCorreccionesSemilla.gs, html/views/lineas/lineas-correcciones.html,
 * html/js/lineas-correcciones.html, sus dos include de Index.html, su línea en navegarA y en NAV_GRUPOS (app.html), su
 * entrada en Modulos.gs y en Entidades.gs (APP_CORRECCIONES), el script `correcciones:semilla`, la pestaña
 * APP_CORRECCIONES de la hoja y la carpeta Correcciones_Evidencias de Drive. `Lineas.comun` (lineas.html) puede quedarse.
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
    const ev = evidencias_();
    const filas = filas_().map((r) => aCliente_(r, resolver));
    filas.forEach((f) => { f.ARCHIVOS = enlacesDe(ev.casos[f.LLAVE] || [], ev.archivos); });
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
      evidencias: usuario.esAdmin ? resumenEvidencias_(ev) : null,
    };
  }

  // ---------------- Evidencias (archivos en Drive) ----------------

  const CARPETA_EVIDENCIAS = 'Correcciones_Evidencias';
  const MANIFIESTO = 'evidencias.json';
  const CLAVE_EVIDENCIAS = 'ln_corr_evidencias_v1';
  const MIME_HOJA = 'application/vnd.google-apps.spreadsheet';
  const SUBIBLES = /\.(pdf|jpe?g|png|xlsx|xls|json)$/i;

  const carpetaEvidencias_ = () => LineasArchivos.carpetaDeApp(CARPETA_EVIDENCIAS);

  /**
   * Lo que hay en la carpeta: { casos: {LLAVE: [entradas de evidencias.json]}, archivos: {nombre: {id, hoja, gids}},
   * esperados: [nombres], carpetaUrl }. Caché 6 h (se borra al subir).
   */
  function evidencias_() {
    const enCache = LineasDatos.cacheLeer(CLAVE_EVIDENCIAS);
    if (enCache) return enCache;
    const vacio = { casos: {}, archivos: {}, esperados: [], carpetaUrl: '' };
    let carpeta;
    try { carpeta = carpetaEvidencias_(); } catch (e) { console.warn('Evidencias: ' + e.message); return vacio; }
    const r = Object.assign({}, vacio, { carpetaUrl: carpeta.getUrl() });
    const it = carpeta.getFiles();
    while (it.hasNext()) {
      const f = it.next();
      const nombre = f.getName();
      if (nombre === MANIFIESTO) {
        try {
          const m = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
          r.casos = m.casos || {};
          r.esperados = (m.originales || []).concat(m.recortes || []);
        } catch (e) { console.warn('Evidencias: evidencias.json no se pudo leer (' + e.message + ')'); }
        continue;
      }
      const o = { id: f.getId(), hoja: f.getMimeType() === MIME_HOJA };
      if (o.hoja) {
        o.gids = {};
        try { SpreadsheetApp.openById(o.id).getSheets().forEach((h) => { o.gids[h.getName()] = h.getSheetId(); }); } catch (e) { /* sin hojas: liga al archivo */ }
      }
      r.archivos[nombre] = o;
    }
    LineasDatos.cacheGuardar(CLAVE_EVIDENCIAS, r, 6 * 3600);
    return r;
  }

  /** Para el panel de ADMIN: qué falta subir de lo que pide evidencias.json. */
  function resumenEvidencias_(ev) {
    const subidos = Object.keys(ev.archivos);
    return {
      carpetaUrl: ev.carpetaUrl, subidos: subidos, manifiesto: Object.keys(ev.casos).length > 0,
      faltan: ev.esperados.filter((n) => subidos.indexOf(n) < 0), casos: Object.keys(ev.casos).length,
    };
  }

  /** Letra de columna (1 → A, 27 → AA). */
  function letra_(n) {
    let s = '';
    for (let k = Math.max(1, n); k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
    return s;
  }

  /**
   * Entradas de evidencias.json de un caso → enlaces para la interfaz. Pura (se prueba sin Drive).
   * entrada: { etiqueta, archivo, recorte?, paginas?, hoja?, fila?, columnas? } · archivos: { nombre: { id, hoja, gids } }
   * Regresa [{ etiqueta, linea: { url, texto } | null, original: { url, texto } }]; lo que no se ha subido no aparece.
   */
  function enlacesDe(entradas, archivos) {
    const ver = (id) => 'https://drive.google.com/file/d/' + id + '/view';
    const salida = [];
    (entradas || []).forEach((e) => {
      const a = archivos[e.archivo];
      if (!a) return;
      const r = { etiqueta: e.etiqueta || e.archivo, linea: null, original: null };
      if (a.hoja) {
        const base = 'https://docs.google.com/spreadsheets/d/' + a.id + '/edit';
        const gid = e.hoja && a.gids && a.gids[e.hoja] !== undefined ? a.gids[e.hoja] : null;
        r.original = { url: base + (gid !== null ? '#gid=' + gid : ''), texto: 'Abrir la hoja completa' };
        if (gid !== null && e.fila) {
          r.linea = { url: base + '#gid=' + gid + '&range=A' + e.fila + ':' + letra_(e.columnas || 1) + e.fila, texto: 'Ver el renglón ' + e.fila };
        }
      } else {
        const pags = (e.paginas || []).length ? ' (págs. ' + e.paginas.join(', ') + ')' : '';
        r.original = { url: ver(a.id), texto: 'Abrir el documento completo' + pags };
        const rec = e.recorte && archivos[e.recorte];
        if (rec) r.linea = { url: ver(rec.id), texto: 'Ver la línea marcada' };
      }
      salida.push(r);
    });
    return salida;
  }

  /**
   * ADMIN: guarda un archivo de "EVIDENCIAS PARA SUBIR". Lo que ya está con el mismo nombre no se vuelve a subir (salvo
   * evidencias.json, que se reemplaza). Los Excel se convierten a Google Sheets (para ligar al renglón).
   */
  function subirEvidencia(usuario, nombre, mime, base64) {
    if (!usuario.esAdmin) throw new Error('Solo ADMIN puede subir evidencias.');
    const n = txt(nombre);
    if (!n || /[\\/]/.test(n) || !SUBIBLES.test(n)) throw new Error('Archivo no permitido: ' + n + ' (solo PDF, JPG, PNG, Excel y evidencias.json).');
    const bytes = Utilities.base64Decode(base64);
    if (bytes.length > 30 * 1024 * 1024) throw new Error(n + ' supera 30 MB.');
    const carpeta = carpetaEvidencias_();
    const existentes = carpeta.getFilesByName(n);
    if (n === MANIFIESTO) {
      if (existentes.hasNext()) existentes.next().setContent(Utilities.newBlob(bytes).getDataAsString('UTF-8'));
      else carpeta.createFile(Utilities.newBlob(bytes, 'application/json', n));
    } else if (existentes.hasNext()) {
      return { nombre: n, yaEstaba: true };
    } else if (/\.xlsx?$/i.test(n)) {
      convertirAHoja_(carpeta.getId(), n, bytes);
    } else {
      carpeta.createFile(Utilities.newBlob(bytes, mime || 'application/octet-stream', n));
    }
    LineasDatos.cacheBorrar(CLAVE_EVIDENCIAS);
    return { nombre: n, yaEstaba: false };
  }

  /** Sube un Excel convirtiéndolo a Google Sheets (API de Drive; el nombre se queda con su extensión). */
  function convertirAHoja_(carpetaId, nombre, bytes) {
    const limite = 'lnc' + Utilities.getUuid().replace(/-/g, '');
    const meta = JSON.stringify({ name: nombre, mimeType: MIME_HOJA, parents: [carpetaId] });
    const tipo = /\.xls$/i.test(nombre) ? 'application/vnd.ms-excel' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const cuerpo = Utilities.newBlob('--' + limite + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta +
      '\r\n--' + limite + '\r\nContent-Type: ' + tipo + '\r\n\r\n').getBytes()
      .concat(bytes, Utilities.newBlob('\r\n--' + limite + '--').getBytes());
    const resp = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
      method: 'post', contentType: 'multipart/related; boundary=' + limite, payload: cuerpo,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) throw new Error('No se pudo convertir ' + nombre + ' a Google Sheets (' + resp.getResponseCode() + '): ' + resp.getContentText().slice(0, 200));
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

  return { TAB, ENCABEZADOS, TIPO, ESTADO, estado, cargar, marcar, combinar, subirEvidencia, enlacesDe };
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

/** ADMIN: un archivo de "EVIDENCIAS PARA SUBIR" (base64). */
function apiLineasCorreccionesSubirEvidencia(token, nombre, mime, base64) {
  const sesion = Auth.requiereRol(token, [Config.ROLES.ADMIN]);
  return LineasCorrecciones.subirEvidencia(usuarioCorrecciones_(sesion), nombre, mime, base64);
}
