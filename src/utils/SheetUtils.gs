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

  return { getSheet, getAll, findById, insert, update, remove };
})();
