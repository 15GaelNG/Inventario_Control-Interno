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

  function rowToObject_(headers, row) {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  }

  function objectToRow_(headers, obj) {
    return headers.map((h) => (obj[h] !== undefined ? obj[h] : ''));
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
    const idCol = headers.indexOf(idColumn);
    if (idCol === -1) throw new Error('La hoja "' + sheetName + '" no tiene columna "' + idColumn + '"');

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
    if (headers.indexOf('ID') !== -1 && !obj.ID) {
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

    const candidatas = ss.getSheets().filter((sheet) => {
      if (sheet.getLastColumn() === 0) return false;
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
      return columnasRequeridas.every((col) => headers.indexOf(col) !== -1);
    });

    if (candidatas.length === 0) {
      throw new Error('No se encontró ninguna hoja con las columnas: ' + columnasRequeridas.join(', '));
    }

    const hoja = candidatas.length === 1
      ? candidatas[0]
      : candidatas.sort((a, b) => b.getLastRow() - a.getLastRow())[0];

    cache.put(cacheKey, hoja.getName(), 21600); // 6 horas
    return hoja;
  }

  /**
   * Lee solo las columnas dadas de una hoja ya resuelta (no toda la hoja) —
   * regresa {filas, datos: {columna: [valores]}}. Útil para listas/tarjetas
   * donde no se necesitan las decenas de columnas completas de la hoja.
   */
  function leerColumnasDeHoja(sheet, columnas) {
    const lastRow = sheet.getLastRow();
    const headers = getHeaders_(sheet);
    const datos = {};
    columnas.forEach((nombre) => {
      const col = headers.indexOf(nombre);
      datos[nombre] = (col === -1 || lastRow < 2)
        ? []
        : sheet.getRange(2, col + 1, lastRow - 1, 1).getValues().map((f) => f[0]);
    });
    return { filas: Math.max(0, lastRow - 1), datos: datos };
  }

  return { getSheet, getSheetByColumns, getAll, findById, insert, update, remove, leerColumnasDeHoja };
})();
