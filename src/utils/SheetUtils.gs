/**
 * SheetUtils.gs
 * Capa genérica de acceso a datos sobre Google Sheets. Todas las funciones
 * asumen: fila 1 = encabezados, cada hoja tiene una columna "ID" única.
 * Los Services de cada módulo usan estas funciones en vez de tocar
 * SpreadsheetApp directamente, así el CRUD queda escrito una sola vez.
 */

const SheetUtils = (function () {

  function getSheet(spreadsheetId, sheetName) {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error('No existe la hoja "' + sheetName + '" en el spreadsheet ' + spreadsheetId);
    }
    return sheet;
  }

  function getHeaders_(sheet) {
    return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  }

  /**
   * Fila → objeto. Las claves van SIN los espacios sobrantes del encabezado ("ID INSPECCION "
   * en la hoja → 'ID INSPECCION'): así el código lee row['ID INSPECCION'] como está escrito.
   * Con la clave cruda, además, update() mezclaba 'ID INSPECCION ' (lo viejo) con
   * 'ID INSPECCION' (lo nuevo) y escribía lo viejo: el cambio se perdía sin aviso.
   * Los acentos y mayúsculas se respetan (la clave sigue siendo el nombre de la columna).
   */
  const claveDeEncabezado_ = (h) => String(h == null ? '' : h).replace(/\s+/g, ' ').trim();

  function rowToObject_(headers, row) {
    const obj = {};
    headers.forEach((h, i) => { obj[claveDeEncabezado_(h)] = row[i]; });
    return obj;
  }

  /** Posición de la columna de ID, tolerante a espacios y acentos; truena claro si no está */
  function columnaId_(headers, idColumn, sheetName) {
    const idCol = indiceDeColumnas(headers, [idColumn])[idColumn];
    if (idCol === -1) throw new Error('La hoja "' + sheetName + '" no tiene columna "' + idColumn + '"');
    return idCol;
  }

  /**
   * Objeto → fila, en el orden de los encabezados. La búsqueda es tolerante a espacios
   * y acentos: con la comparación exacta, un encabezado con un espacio de más hacía que
   * ese dato NO se escribiera, sin error ni aviso.
   */
  function objectToRow_(headers, obj) {
    const datos = obj || {};
    const porNombre = {};
    Object.keys(datos).forEach((clave) => { porNombre[normalizarEncabezado_(clave)] = datos[clave]; });
    return headers.map((h) => {
      if (datos[h] !== undefined) return datos[h];
      const valor = porNombre[normalizarEncabezado_(h)];
      return valor === undefined ? '' : valor;
    });
  }

  /** Devuelve todas las filas como array de objetos {columna: valor} */
  function getAll(spreadsheetId, sheetName) {
    const sheet = getSheet(spreadsheetId, sheetName);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    const headers = getHeaders_(sheet);
    const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    return values.map((row) => rowToObject_(headers, row));
  }

  /** Busca una fila por columna ID. Devuelve {rowIndex, data} o null */
  function findById(spreadsheetId, sheetName, id, idColumn) {
    idColumn = idColumn || 'ID';
    const sheet = getSheet(spreadsheetId, sheetName);
    const headers = getHeaders_(sheet);
    const idCol = columnaId_(headers, idColumn, sheetName);

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

    for (let i = 0; i < values.length; i++) {
      if (String(values[i][idCol]) === String(id)) {
        return { rowIndex: i + 2, data: rowToObject_(headers, values[i]) };
      }
    }
    return null;
  }

  /** Inserta una fila nueva. Si el objeto no trae ID, genera uno (uuid corto). */
  function insert(spreadsheetId, sheetName, obj) {
    const sheet = getSheet(spreadsheetId, sheetName);
    const headers = getHeaders_(sheet);
    if (indiceDeColumnas(headers, ['ID'])['ID'] !== -1 && !obj.ID) {
      obj.ID = Utilities.getUuid().slice(0, 8);
    }
    const row = objectToRow_(headers, obj);
    sheet.appendRow(row);
    return obj;
  }

  /** Actualiza (merge) una fila existente localizada por ID */
  function update(spreadsheetId, sheetName, id, changes, idColumn) {
    const found = findById(spreadsheetId, sheetName, id, idColumn);
    if (!found) throw new Error('No se encontró el registro con ID=' + id + ' en "' + sheetName + '"');

    const sheet = getSheet(spreadsheetId, sheetName);
    const headers = getHeaders_(sheet);
    const merged = Object.assign({}, found.data, changes);
    const row = objectToRow_(headers, merged);
    sheet.getRange(found.rowIndex, 1, 1, headers.length).setValues([row]);
    return merged;
  }

  /** Elimina físicamente una fila por ID (usar con cuidado; preferir "baja lógica") */
  function remove(spreadsheetId, sheetName, id, idColumn) {
    const found = findById(spreadsheetId, sheetName, id, idColumn);
    if (!found) return false;
    getSheet(spreadsheetId, sheetName).deleteRow(found.rowIndex);
    return true;
  }

  /**
   * Elimina físicamente varias filas por ID en una sola pasada. Devuelve cuántas borró.
   * Bloquea el script mientras borra: si alguien inserta/borra a la vez, los números
   * de fila cambiarían entre la búsqueda y el borrado.
   */
  function removeMany(spreadsheetId, sheetName, ids, idColumn) {
    idColumn = idColumn || 'ID';
    const buscados = new Set((ids || []).map(String));
    if (!buscados.size) return 0;

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sheet = getSheet(spreadsheetId, sheetName);
      const idCol = columnaId_(getHeaders_(sheet), idColumn, sheetName);
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return 0;

      const filas = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues()
        .map((v, i) => (buscados.has(String(v[0])) ? i + 2 : null))
        .filter(Boolean);

      // De abajo hacia arriba, agrupando filas contiguas en un solo deleteRows
      for (let i = filas.length - 1; i >= 0;) {
        let inicio = filas[i];
        let cantidad = 1;
        while (i - cantidad >= 0 && filas[i - cantidad] === inicio - 1) { inicio--; cantidad++; }
        sheet.deleteRows(inicio, cantidad);
        i -= cantidad;
      }
      return filas.length;
    } finally {
      lock.releaseLock();
    }
  }

  /**
   * Encuentra, dentro de un spreadsheet, la hoja cuyo encabezado (fila 1)
   * contiene TODAS las columnas dadas (por nombre exacto). Útil cuando no
   * conocemos el nombre real de la pestaña (ej. spreadsheets ajenos, como el
   * de AppSheet) pero sí sabemos qué columnas debe tener.
   *
   * Cachea el nombre de hoja encontrado (CacheService, 6 horas) para no tener
   * que escanear TODAS las pestañas del spreadsheet en cada llamada — en un
   * archivo con ~50 pestañas eso se sentía notablemente lento.
   *
   * Si más de una pestaña comparte esas columnas (ej. una copia/respaldo),
   * se usa la que tiene más filas de datos, asumiendo que la real es la que
   * más se ha usado.
   */
  /**
   * Encabezado listo para comparar: sin acentos, sin espacios de más y en mayúsculas.
   * En las hojas reales sobran espacios al final ("TIPO ") y hay acentos inconsistentes;
   * comparar en crudo hacía que una columna existente se diera por ausente.
   */
  function normalizarEncabezado_(texto) {
    return String(texto == null ? '' : texto)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  /**
   * Posición de cada columna pedida dentro de los encabezados (-1 si no está).
   * Usar SIEMPRE esto en vez de headers.indexOf(nombre): con la comparación exacta, un
   * espacio de más en la hoja devuelve la columna vacía y nadie se entera.
   * @return {Object} { 'NOMBRE PEDIDO': índice }
   */
  function indiceDeColumnas(encabezados, nombres) {
    const normalizados = (encabezados || []).map(normalizarEncabezado_);
    const mapa = {};
    (nombres || []).forEach((nombre) => {
      mapa[nombre] = normalizados.indexOf(normalizarEncabezado_(nombre));
    });
    return mapa;
  }

  /**
   * Lee solo las columnas pedidas, en el MENOR número de llamadas posible.
   *
   * Cada getValues() es un viaje a Sheets, y es lo que más cuesta (bastante más que traer
   * unas celdas de más). Leer 23 columnas una por una eran 23 viajes; aquí se agrupan las
   * que están juntas en la hoja y los huecos cortos se leen de paso: las 23 de
   * INSPECCION VEHICULAR (1–19, 173–178, 195) quedan en 3 lecturas.
   *
   * @param {Sheet} hoja
   * @param {string[]} columnas nombres de encabezado (tolerante a espacios y acentos)
   * @return {{filas: number, datos: Object}} datos = { 'COLUMNA': [valores] }; [] si no existe
   */
  function leerColumnas(hoja, columnas) {
    const HUECO_MAXIMO = 8;   // leer hasta 8 columnas de sobra sale más barato que otro viaje
    const ultimaFila = hoja.getLastRow();
    const filas = Math.max(0, ultimaFila - 1);
    const datos = {};
    columnas.forEach((nombre) => { datos[nombre] = []; });
    if (!filas) return { filas: 0, datos: datos };

    const indices = indiceDeColumnas(getHeaders_(hoja), columnas);
    const posiciones = columnas.map((c) => indices[c]).filter((i) => i !== -1)
      .sort((a, b) => a - b)
      .filter((i, k, arr) => k === 0 || arr[k - 1] !== i);

    // Bloques contiguos [desde, hasta] (índices base 0)
    const bloques = [];
    posiciones.forEach((i) => {
      const ultimo = bloques[bloques.length - 1];
      if (ultimo && i - ultimo[1] - 1 <= HUECO_MAXIMO) ultimo[1] = i;
      else bloques.push([i, i]);
    });

    bloques.forEach(([desde, hasta]) => {
      const valores = hoja.getRange(2, desde + 1, filas, hasta - desde + 1).getValues();
      columnas.forEach((nombre) => {
        const i = indices[nombre];
        if (i >= desde && i <= hasta) datos[nombre] = valores.map((f) => f[i - desde]);
      });
    });
    return { filas: filas, datos: datos };
  }

  function getSheetByColumns(spreadsheetId, columnasRequeridas) {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'hojaPorColumnas_' + spreadsheetId + '_' + columnasRequeridas.join('|');
    const ss = SpreadsheetApp.openById(spreadsheetId);

    const nombreCacheado = cache.get(cacheKey);
    if (nombreCacheado) {
      const hoja = ss.getSheetByName(nombreCacheado);
      if (hoja) return hoja;
      // La hoja cacheada ya no existe (renombrada/eliminada) — se re-escanea abajo.
    }

    const faltantesPorHoja = {};
    const candidatas = ss.getSheets().filter((sheet) => {
      if (sheet.getLastColumn() === 0) return false;
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const indices = indiceDeColumnas(headers, columnasRequeridas);
      const faltantes = columnasRequeridas.filter((col) => indices[col] === -1);
      if (faltantes.length && faltantes.length < columnasRequeridas.length) {
        faltantesPorHoja[sheet.getName()] = faltantes;   // se parece, pero le falta algo
      }
      return faltantes.length === 0;
    });

    if (candidatas.length === 0) {
      // Decir DÓNDE se buscó y qué se encontró: si no, el error obliga a adivinar
      const parecidas = Object.keys(faltantesPorHoja)
        .map((nombre) => '"' + nombre + '" (le faltan: ' + faltantesPorHoja[nombre].join(', ') + ')');
      throw new Error(
        'No se encontró ninguna hoja con las columnas: ' + columnasRequeridas.join(', ') +
        '. Se buscó en "' + ss.getName() + '" (' + ss.getSheets().length + ' hojas)' +
        (parecidas.length ? '. Hojas parecidas: ' + parecidas.join(' · ') : '') + '.'
      );
    }

    const hoja = candidatas.length === 1
      ? candidatas[0]
      : candidatas.sort((a, b) => b.getLastRow() - a.getLastRow())[0];

    cache.put(cacheKey, hoja.getName(), 21600); // 6 horas
    return hoja;
  }

  return {
    getSheet, getSheetByColumns, getAll, leerColumnas, findById, insert, update, remove, removeMany,
    indiceDeColumnas, normalizarEncabezado_, objectToRow_,
  };
})();
