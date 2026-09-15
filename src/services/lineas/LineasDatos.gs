/**
 * LineasDatos.gs
 * Acceso a la hoja del AppSheet para el módulo de Líneas (misma estructura que
 * producción: no se renombran, borran ni reordenan columnas existentes).
 *
 * Diferencias con SheetUtils (pensadas para LINEAS TELEFONICAS y su bitácora de ~35 mil filas):
 *   - Encabezados en caché (1 h); las escrituras siempre releen encabezados.
 *   - Búsquedas por columna con TextFinder en vez de leer la pestaña completa.
 *   - Varias filas sueltas en UNA llamada a la API de Sheets (values:batchGetByDataFilter).
 *   - Escrituras de una fila en UNA llamada (values:batchUpdate) y siempre bajo candado.
 *   - Fechas con la hora de México aunque la hoja tenga otra zona horaria.
 *   - Caché JSON comprimida (gzip) en trozos de 90 KB.
 *
 * Spreadsheet: Config.SPREADSHEET_IDS.TELEFONIA() (Script Property SS_ID_TELEFONIA).
 */

const LineasDatos = (function () {
  /** Hoja de producción del AppSheet: bloqueada mientras ENTORNO no sea PROD. */
  const ID_PRODUCCION = '1h5ibDsmVtrG27rwMaOvj-lm08QZUHzDv3woPmkfRQrk';

  /** Zona horaria en la que se leen/escriben las horas (la del AppSheet). La hoja puede tener otra. */
  const ZONA_APP = 'America/Mexico_City';

  const SEG_CACHE_ENCABEZADOS = 3600;

  /**
   * Encabezados que en la hoja están en blanco pero que el AppSheet conoce por posición
   * (índice de columna, base 0).
   */
  const ENCABEZADOS_POR_POSICION = {
    'CAMBIOS LINEAS TELEFONICAS': { 0: 'ID_CAMBIO', 2: 'NUCO' },
  };

  // Estado por ejecución (cada llamada de google.script.run empieza de cero).
  const bd = { id: null, libro: null, tablas: {}, zona: null, apiSheets: undefined };
  const desfasePorDia = {};

  function id() {
    if (bd.id) return bd.id;
    const valor = Config.SPREADSHEET_IDS.TELEFONIA();
    if (valor === ID_PRODUCCION && Config.ENTORNO !== 'PROD') {
      throw new Error('Bloqueado: SS_ID_TELEFONIA apunta a la hoja de producción y ENTORNO no es PROD.');
    }
    return (bd.id = valor);
  }

  function libro() {
    if (!bd.libro) bd.libro = SpreadsheetApp.openById(id());
    return bd.libro;
  }

  // ---------------- Caché JSON ----------------

  function claveCache_(clave) {
    return 'ln_' + clave + '_' + id().slice(0, 10);
  }

  function cacheGuardar(clave, obj, segundos) {
    try {
      const k = claveCache_(clave);
      const texto = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(obj), 'application/json')).getBytes());
      const trozos = {};
      const n = Math.ceil(texto.length / 90000);
      for (let i = 0; i < n; i++) trozos[k + '_' + i] = texto.slice(i * 90000, (i + 1) * 90000);
      trozos[k + '_n'] = String(n);
      CacheService.getScriptCache().putAll(trozos, segundos || 1800);
      return true;
    } catch (e) {
      return false; // Si no cabe, simplemente se vuelve a leer de la hoja.
    }
  }

  function cacheLeer(clave) {
    const k = claveCache_(clave);
    const cache = CacheService.getScriptCache();
    const n = Number(cache.get(k + '_n'));
    if (!n) return null;
    const claves = [];
    for (let i = 0; i < n; i++) claves.push(k + '_' + i);
    const valores = cache.getAll(claves);
    if (Object.keys(valores).length !== n) return null;
    try {
      const bytes = Utilities.base64Decode(claves.map((c) => valores[c]).join(''));
      return JSON.parse(Utilities.ungzip(Utilities.newBlob(bytes, 'application/x-gzip')).getDataAsString());
    } catch (e) {
      return null;
    }
  }

  function cacheBorrar(clave) {
    const k = claveCache_(clave);
    const cache = CacheService.getScriptCache();
    const n = Number(cache.get(k + '_n')) || 0;
    const claves = [k + '_n'];
    for (let i = 0; i < n; i++) claves.push(k + '_' + i);
    cache.removeAll(claves);
  }

  // ---------------- Pestañas y encabezados ----------------

  function normCol(h) {
    return String(h || '').toUpperCase().replace(/\s+/g, ' ').trim();
  }

  function zona() {
    if (!bd.zona) {
      const cache = CacheService.getScriptCache();
      const clave = claveCache_('zona_bd');
      bd.zona = cache.get(clave);
      if (!bd.zona) {
        bd.zona = libro().getSpreadsheetTimeZone() || ZONA_APP;
        cache.put(clave, bd.zona, 21600);
      }
    }
    return bd.zona;
  }

  /**
   * Metadatos de una pestaña: { nombre, encabezados, indice, hoja }.
   * Para lecturas los encabezados salen de caché; las escrituras usan tablaFresca().
   */
  function tabla(nombre) {
    if (bd.tablas[nombre]) return bd.tablas[nombre];
    const enCache = cacheLeer('enc_' + nombre);
    return enCache ? armarTabla_(nombre, enCache, null) : tablaFresca(nombre);
  }

  /** Relee la fila de encabezados de la hoja (una vez por ejecución) y actualiza la caché. */
  function tablaFresca(nombre) {
    if (bd.tablas[nombre] && bd.tablas[nombre].fresca) return bd.tablas[nombre];
    const hoja = libro().getSheetByName(nombre);
    if (!hoja) throw new Error('No existe la pestaña "' + nombre + '" en la base de datos de Líneas.');
    const encabezados = hoja.getRange(1, 1, 1, Math.max(1, hoja.getLastColumn())).getValues()[0]
      .map((h) => String(h).trim());
    const porPosicion = ENCABEZADOS_POR_POSICION[nombre] || {};
    Object.keys(porPosicion).forEach((i) => { if (!encabezados[i]) encabezados[i] = porPosicion[i]; });
    while (encabezados.length && !encabezados[encabezados.length - 1]) encabezados.pop();
    cacheGuardar('enc_' + nombre, encabezados, SEG_CACHE_ENCABEZADOS);
    const t = armarTabla_(nombre, encabezados, hoja);
    t.fresca = true;
    return t;
  }

  function armarTabla_(nombre, encabezados, hoja) {
    const indice = {};
    encabezados.forEach((h, i) => {
      const k = normCol(h);
      if (k && !(k in indice)) indice[k] = i;
    });
    const t = { nombre: nombre, encabezados: encabezados, indice: indice, _hoja: hoja };
    Object.defineProperty(t, 'hoja', {
      get: function () {
        if (!this._hoja) {
          this._hoja = libro().getSheetByName(nombre);
          if (!this._hoja) throw new Error('No existe la pestaña "' + nombre + '" en la base de datos de Líneas.');
        }
        return this._hoja;
      },
    });
    bd.tablas[nombre] = t;
    return t;
  }

  function existeTabla(nombre) {
    if (bd.tablas[nombre] || cacheLeer('enc_' + nombre)) return true;
    return !!libro().getSheetByName(nombre);
  }

  function colIndice(t, columna) {
    const i = t.indice[normCol(columna)];
    return i === undefined ? -1 : i;
  }

  function filaAObjeto_(t, valores, fila) {
    const o = { _fila: fila };
    t.encabezados.forEach((h, i) => {
      if (!h || h in o) return;
      const v = valores[i];
      o[h] = v === undefined || v === null ? '' : (v instanceof Date ? deHoraHoja(v) : v);
    });
    return o;
  }

  // ---------------- Zona horaria ----------------

  /** Diferencia (ms) entre la zona del AppSheet y la de la hoja para una fecha. */
  function desfaseMs_(d) {
    const z = zona();
    if (z === ZONA_APP || isNaN(d.getTime())) return 0;
    const k = Math.floor(d.getTime() / 864e5);
    if (!(k in desfasePorDia)) {
      const offset = (tz) => {
        const s = Utilities.formatDate(d, tz, 'Z');
        return (s.charAt(0) === '-' ? -1 : 1) * (Number(s.substr(1, 2)) * 60 + Number(s.substr(3, 2))) * 60000;
      };
      desfasePorDia[k] = offset(ZONA_APP) - offset(z);
    }
    return desfasePorDia[k];
  }

  /** Fecha leída de la hoja → instante con la misma hora "de reloj" en México. */
  function deHoraHoja(d) { return new Date(d.getTime() - desfaseMs_(d)); }
  /** Instante → fecha que la hoja muestra con la hora de México. */
  function aHoraHoja(d) { return new Date(d.getTime() + desfaseMs_(d)); }

  // ---------------- Lectura ----------------

  /** Todas las filas no vacías de una pestaña. */
  function leerTabla(nombre) {
    const t = tabla(nombre);
    const ultima = t.hoja.getLastRow();
    if (ultima < 2 || !t.encabezados.length) return [];
    const valores = t.hoja.getRange(2, 1, ultima - 1, t.encabezados.length).getValues();
    const filas = [];
    valores.forEach((v, i) => {
      if (v.every((x) => x === '' || x === null)) return;
      filas.push(filaAObjeto_(t, v, i + 2));
    });
    return filas;
  }

  /** Última fila con datos de una pestaña. */
  function ultimaFila(nombre) {
    return tabla(nombre).hoja.getLastRow();
  }

  /** Números de fila cuyo valor en `columna` es `valor` (celda completa, o contiene si `parcial`). */
  function buscarFilas(nombre, columna, valor, parcial) {
    if (valor === null || valor === undefined || String(valor) === '') return [];
    const t = tabla(nombre);
    const c = colIndice(t, columna);
    if (c < 0) throw new Error('La pestaña "' + nombre + '" no tiene la columna "' + columna + '".');
    const ultima = t.hoja.getLastRow();
    if (ultima < 2) return [];
    return t.hoja.getRange(2, c + 1, ultima - 1, 1)
      .createTextFinder(String(valor)).matchEntireCell(!parcial).matchCase(false)
      .findAll().map((r) => r.getRow());
  }

  /** Filas (sin repetir) que contienen `texto` en cualquier columna. */
  function buscarEnTabla(nombre, texto) {
    if (!texto) return [];
    const t = tabla(nombre);
    const ultima = t.hoja.getLastRow();
    if (ultima < 2) return [];
    const filas = {};
    t.hoja.getRange(2, 1, ultima - 1, t.encabezados.length)
      .createTextFinder(String(texto)).matchCase(false)
      .findAll().forEach((r) => { filas[r.getRow()] = true; });
    return Object.keys(filas).map(Number).sort((a, b) => a - b);
  }

  /**
   * Lee filas sueltas de una o varias pestañas.
   * peticiones: [{ tabla, filas: [n, ...] }]  →  [[objetos de la 1a petición], [...], ...]
   */
  function leerFilas(peticiones) {
    const total = peticiones.reduce((s, p) => s + p.filas.length, 0);
    if (!total) return peticiones.map(() => []);

    // Pocas filas: SpreadsheetApp directo (fechas nativas).
    if (total <= 3) {
      return peticiones.map((p) => {
        const t = tabla(p.tabla);
        return p.filas.map((n) => filaAObjeto_(t, t.hoja.getRange(n, 1, 1, t.encabezados.length).getValues()[0], n));
      });
    }

    if (!apiSheetsDisponible_()) return leerFilasSinApi_(peticiones);
    try {
      return leerFilasConApi_(peticiones);
    } catch (e) {
      if (!marcarApiSinHabilitar_(e)) throw e;
      return leerFilasSinApi_(peticiones);
    }
  }

  /**
   * Respaldo sin la API de Sheets: agrupa filas cercanas (hasta 20 de separación) y lee
   * cada grupo como un bloque con SpreadsheetApp.
   */
  function leerFilasSinApi_(peticiones) {
    return peticiones.map((p) => {
      const t = tabla(p.tabla);
      const porFila = {};
      const ordenadas = p.filas.slice().sort((a, b) => a - b);
      let i = 0;
      while (i < ordenadas.length) {
        let j = i;
        while (j + 1 < ordenadas.length && ordenadas[j + 1] - ordenadas[j] <= 20) j++;
        const desde = ordenadas[i];
        const valores = t.hoja.getRange(desde, 1, ordenadas[j] - desde + 1, t.encabezados.length).getValues();
        for (let k = i; k <= j; k++) porFila[ordenadas[k]] = valores[ordenadas[k] - desde];
        i = j + 1;
      }
      return p.filas.map((n) => filaAObjeto_(t, porFila[n], n));
    });
  }

  // ---------------- API de Sheets (opcional) ----------------
  // Si la API no está habilitada en el proyecto de Google Cloud del script, se recuerda 1 h
  // y se usa SpreadsheetApp (más lento con muchas filas, mismo resultado).

  function apiSheetsDisponible_() {
    if (bd.apiSheets === undefined) bd.apiSheets = CacheService.getScriptCache().get('ln_api_sheets_off') !== '1';
    return bd.apiSheets;
  }

  function marcarApiSinHabilitar_(error) {
    if (!/API de Sheets 403/.test(String(error && error.message)) || !/SERVICE_DISABLED|has not been used|is disabled/i.test(String(error.message))) return false;
    bd.apiSheets = false;
    CacheService.getScriptCache().put('ln_api_sheets_off', '1', 3600);
    return true;
  }

  function leerFilasConApi_(peticiones) {
    // Una llamada a la API de Sheets por cada 500 rangos.
    const rangos = [];
    peticiones.forEach((p, ip) => {
      const t = tabla(p.tabla);
      p.filas.forEach((n) => {
        rangos.push({ ip: ip, t: t, fila: n, a1: "'" + t.nombre.replace(/'/g, "''") + "'!A" + n + ':' + letraColumna(t.encabezados.length) + n });
      });
    });
    const resultado = peticiones.map(() => []);
    for (let i = 0; i < rangos.length; i += 500) {
      const lote = rangos.slice(i, i + 500);
      const resp = sheetsApi('/values:batchGetByDataFilter', {
        dataFilters: lote.map((r) => ({ a1Range: r.a1 })),
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
        majorDimension: 'ROWS',
      });
      // La respuesta no garantiza el orden: cada rango se ubica por "hoja + fila" del rango devuelto.
      const porRango = {};
      (resp.valueRanges || []).forEach((vr) => {
        const rango = vr.valueRange && vr.valueRange.range;
        if (!rango) return;
        const m = /^'?(.*?)'?!A(\d+)/.exec(rango);
        if (m) porRango[m[1].replace(/''/g, "'") + '|' + m[2]] = (vr.valueRange.values && vr.valueRange.values[0]) || [];
      });
      lote.forEach((r) => {
        const obj = filaAObjeto_(r.t, porRango[r.t.nombre + '|' + r.fila] || [], r.fila);
        r.t.encabezados.forEach((h) => {
          if (esColumnaFecha(h) && typeof obj[h] === 'string') obj[h] = textoAFecha_(obj[h]);
        });
        r.obj = obj;
      });
    }
    // Se respeta el orden pedido.
    rangos.forEach((r) => { if (r.obj) resultado[r.ip].push(r.obj); });
    return resultado;
  }

  /** Bloque continuo de filas [desde, hasta] (fechas nativas). */
  function leerRango(nombre, desde, hasta) {
    const t = tabla(nombre);
    if (hasta < desde || desde < 2) return [];
    const valores = t.hoja.getRange(desde, 1, hasta - desde + 1, t.encabezados.length).getValues();
    return valores.map((v, i) => filaAObjeto_(t, v, desde + i));
  }

  function esColumnaFecha(h) {
    return /FECHA|INICIO PLAN|FIN PLAN|_EN$/i.test(h);
  }

  /** "14/09/2026 14:35:15" o "14/09/2026" (formato de la hoja, es-MX) → Date. */
  function textoAFecha_(s) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(s).trim());
    if (!m) return s;
    const p = (v) => ('0' + (v || 0)).slice(-2);
    return Utilities.parseDate(m[3] + '-' + p(m[2]) + '-' + p(m[1]) + ' ' + p(m[4]) + ':' + p(m[5]) + ':' + p(m[6]), ZONA_APP, 'yyyy-MM-dd HH:mm:ss');
  }

  function letraColumna(n) {
    let s = '';
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  function sheetsApi(ruta, cuerpo) {
    const resp = UrlFetchApp.fetch('https://sheets.googleapis.com/v4/spreadsheets/' + id() + ruta, {
      method: cuerpo ? 'post' : 'get',
      contentType: 'application/json',
      payload: cuerpo ? JSON.stringify(cuerpo) : undefined,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) throw new Error('API de Sheets ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 300));
    return JSON.parse(resp.getContentText());
  }

  // ---------------- Escritura ----------------

  /**
   * Valor listo para una celda. Los textos solo de dígitos largos (SIM, IMEI, teléfono)
   * o con ceros a la izquierda se guardan como texto para que Sheets no los convierta en número.
   * Las pestañas APP_ ya tienen formato de texto, así que no necesitan el apóstrofo.
   */
  function valorCelda_(v, nombreTabla) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return aHoraHoja(v);
    if (typeof v === 'string' && /^\d+$/.test(v) && (v.length >= 11 || /^0\d/.test(v)) && !/^APP_/.test(nombreTabla || '')) return "'" + v;
    return v;
  }

  /**
   * Cambia celdas de una fila: cambios = { 'COLUMNA': valor }. Columnas inexistentes se ignoran.
   * Todas las celdas van en UNA llamada a la API de Sheets:
   *  - textos y números como RAW (Sheets no los reinterpreta: SIM/IMEI siguen siendo texto),
   *  - fechas como texto ISO "yyyy-MM-dd HH:mm:ss" en hora de México (USER_ENTERED).
   */
  function actualizarFila(nombre, fila, cambios) {
    const t = tablaFresca(nombre);
    const hojaA1 = "'" + nombre.replace(/'/g, "''") + "'!";
    const crudos = [];
    const fechas = [];
    Object.keys(cambios).forEach((col) => {
      const c = colIndice(t, col);
      if (c < 0) return;
      const v = cambios[col];
      const rango = hojaA1 + letraColumna(c + 1) + fila;
      if (v instanceof Date) fechas.push({ range: rango, values: [[Utilities.formatDate(v, ZONA_APP, 'yyyy-MM-dd HH:mm:ss')]] });
      else crudos.push({ range: rango, values: [[v === null || v === undefined ? '' : v]] });
    });
    if (!crudos.length && !fechas.length) return;
    if (apiSheetsDisponible_()) {
      try {
        SpreadsheetApp.flush(); // que no queden escrituras de SpreadsheetApp pendientes antes de escribir por la API
        if (crudos.length) sheetsApi('/values:batchUpdate', { valueInputOption: 'RAW', data: crudos });
        if (fechas.length) sheetsApi('/values:batchUpdate', { valueInputOption: 'USER_ENTERED', data: fechas });
        return;
      } catch (e) {
        // Solo se reintenta sin API si no se escribió nada (la API no está habilitada).
        if (!marcarApiSinHabilitar_(e)) throw e;
      }
    }
    // Respaldo sin API: celda por celda (textos de solo dígitos con apóstrofo para que sigan siendo texto).
    Object.keys(cambios).forEach((c) => {
      const i = colIndice(t, c);
      if (i >= 0) t.hoja.getRange(fila, i + 1).setValue(valorCelda_(cambios[c], nombre));
    });
  }

  /** Agrega filas al final. objetos = [{ 'COLUMNA': valor }]. Devuelve los números de fila. */
  function agregarFilas(nombre, objetos) {
    if (!objetos || !objetos.length) return [];
    const t = tablaFresca(nombre);
    const filas = objetos.map((o) => {
      const fila = t.encabezados.map(() => '');
      Object.keys(o).forEach((k) => {
        const c = colIndice(t, k);
        if (c >= 0) fila[c] = valorCelda_(o[k], nombre);
      });
      return fila;
    });
    const inicio = t.hoja.getLastRow() + 1;
    const faltanFilas = inicio + filas.length - 1 - t.hoja.getMaxRows();
    if (faltanFilas > 0) t.hoja.insertRowsAfter(t.hoja.getMaxRows(), faltanFilas); // heredan el formato de la fila anterior
    t.hoja.getRange(inicio, 1, filas.length, t.encabezados.length).setValues(filas);
    return filas.map((_, i) => inicio + i);
  }

  function eliminarFila(nombre, fila) {
    tablaFresca(nombre).hoja.deleteRow(fila);
  }

  /** Ejecuta fn con el candado del script (las escrituras no se cruzan entre usuarios). */
  function conCandado(fn) {
    const candado = LockService.getScriptLock();
    if (!candado.tryLock(30000)) throw new Error('El sistema está guardando otro cambio; intenta de nuevo en unos segundos.');
    try {
      return fn();
    } finally {
      SpreadsheetApp.flush();
      candado.releaseLock();
    }
  }

  /** ID corto como UNIQUEID() del AppSheet (8 caracteres hex), que Sheets nunca interprete como número. */
  function nuevoIdCorto() {
    let nuevo;
    do { nuevo = Utilities.getUuid().replace(/-/g, '').slice(0, 8); } while (/^\d+$/.test(nuevo) || /^\d+e\d+$/i.test(nuevo));
    return nuevo;
  }

  /**
   * Crea (si no existe) una pestaña propia del nuevo sistema (prefijo APP_) con sus encabezados.
   * Si ya existe, agrega al final los encabezados que falten. AppSheet ignora estas pestañas.
   */
  function asegurarPestana(nombre, encabezados) {
    const lb = libro();
    let hoja = lb.getSheetByName(nombre);
    if (!hoja) {
      hoja = lb.insertSheet(nombre, lb.getSheets().length);
      hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]).setFontWeight('bold');
      hoja.setFrozenRows(1);
      // Todo como texto salvo fechas (evita que IDs o NUCO pierdan ceros).
      encabezados.forEach((h, i) => {
        if (!esColumnaFecha(h)) hoja.getRange(2, i + 1, Math.max(1, hoja.getMaxRows() - 1), 1).setNumberFormat('@');
      });
    } else {
      const t = tablaFresca(nombre);
      const faltan = encabezados.filter((h) => colIndice(t, h) < 0);
      if (faltan.length) hoja.getRange(1, t.encabezados.length + 1, 1, faltan.length).setValues([faltan]).setFontWeight('bold');
    }
    // Fechas con hora (si solo muestran el día, la lectura pierde la hora).
    delete bd.tablas[nombre];
    cacheBorrar('enc_' + nombre);
    tablaFresca(nombre).encabezados.forEach((h, i) => {
      if (esColumnaFecha(h)) hoja.getRange(2, i + 1, Math.max(1, hoja.getMaxRows() - 1), 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    });
    delete bd.tablas[nombre];
    return hoja;
  }

  return {
    ZONA_APP,
    id, libro, zona, normCol, esColumnaFecha, letraColumna, sheetsApi,
    cacheGuardar, cacheLeer, cacheBorrar,
    tabla, tablaFresca, existeTabla, colIndice, deHoraHoja, aHoraHoja,
    leerTabla, ultimaFila, buscarFilas, buscarEnTabla, leerFilas, leerRango,
    actualizarFila, agregarFilas, eliminarFila, conCandado, nuevoIdCorto, asegurarPestana,
  };
})();
