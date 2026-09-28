/**
 * LineasAdmin.gs
 * Configuración del módulo de Líneas. Se ejecuta desde el editor de Apps Script
 * (lista de funciones → Ejecutar); no se llama desde el cliente.
 */

/**
 * Hoja de Líneas en DEV: la BD de pruebas del equipo, la misma que usan Usuarios, Vehículos y Accesorios
 * (decisión del 25-sep: una sola hoja para todo el sistema). Es la hoja de la app AppSheet de pruebas.
 */
const LINEAS_DEV_SPREADSHEET_ID = '1fC77Uu1ePVUySNvhgWXMHqWpLhGhBMTZZMEblU2nUhI';
/**
 * Carpetas de Drive (28-sep): la de la app AppSheet de pruebas ("PruebasCONTROLVEHICYTELEF-172665033", donde se lee
 * y se escribe con las rutas del AppSheet) y NUCOS de producción (solo lectura). Ninguna otra.
 */
const LINEAS_DRIVE_APPSHEET_ID = '1FsC5mloJNhi_TR7pBX1KMEjUZfN_M9OM';
const LINEAS_DRIVE_NUCOS_ID = '12SRBi1nZlIzfNx0d2y1fAtzOydA2QrT-';

/** Pestañas del AppSheet que Líneas necesita (las APP_ las crea el sistema cuando hacen falta). */
function pestanasLineas_() {
  const T = LineasRepo.TAB;
  return [T.LINEAS, T.CAMBIOS, T.REASIG, T.DESECHO, T.INSP, T.RESP, T.COLAB, T.LISTAS, T.REACTIVACION, T.SOLICITUD,
    'ACCESORIOS CELULARES', 'MOVIMIENTOS_ACCESORIOS'];
}

/** Pestañas que le faltan a la hoja. No escribe nada. */
function diferenciasHojaLineas_(destinoId) {
  const destino = SpreadsheetApp.openById(destinoId);
  return { nombre: destino.getName(), faltanPestanas: pestanasLineas_().filter((nombre) => !destino.getSheetByName(nombre)) };
}

/**
 * Deja listas las Script Properties de Líneas en un proyecto DEV personal: SS_ID_TELEFONIA, LINEAS_DRIVE_APPSHEET y
 * LINEAS_DRIVE_NUCOS, y borra LINEAS_DRIVE_CARPETA_RAIZ (la carpeta de pruebas personal que ya no se usa).
 * Si a la hoja le faltan pestañas de Líneas no cambia nada y dice cuáles. No toca las propiedades de los demás
 * módulos. Se niega a correr en el proyecto compartido.
 */
function configurarLineasDev() {
  if (typeof SCRIPT_ID_COMPARTIDO !== 'undefined' && ScriptApp.getScriptId() === SCRIPT_ID_COMPARTIDO) {
    throw new Error('Esta función es para proyectos DEV personales, no para el proyecto compartido.');
  }
  const revision = diferenciasHojaLineas_(LINEAS_DEV_SPREADSHEET_ID);
  if (revision.faltanPestanas.length) {
    throw new Error('No se cambió nada: a "' + revision.nombre + '" le faltan las pestañas ' + revision.faltanPestanas.join(', ') + '.');
  }

  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    SS_ID_TELEFONIA: LINEAS_DEV_SPREADSHEET_ID,
    LINEAS_DRIVE_APPSHEET: LINEAS_DRIVE_APPSHEET_ID,
    LINEAS_DRIVE_NUCOS: LINEAS_DRIVE_NUCOS_ID,
  });
  props.deleteProperty('LINEAS_DRIVE_CARPETA_RAIZ');

  // Toca la hoja y las carpetas para que Google pida los permisos desde ya.
  const nombre = SpreadsheetApp.openById(LINEAS_DEV_SPREADSHEET_ID).getName();
  const app = DriveApp.getFolderById(LINEAS_DRIVE_APPSHEET_ID).getName();
  const nucos = DriveApp.getFolderById(LINEAS_DRIVE_NUCOS_ID).getName();
  LineasRepo.borrarCaches();
  CacheService.getScriptCache().remove('ln_api_sheets_off');

  // La API de Sheets es opcional (acelera lecturas/escrituras); sin ella se usa SpreadsheetApp.
  let api = 'API de Sheets habilitada.';
  try {
    Sheets.Spreadsheets.get(LINEAS_DEV_SPREADSHEET_ID, { fields: 'properties.title' });
  } catch (e) {
    api = 'API de Sheets NO habilitada en el proyecto de Google Cloud (se usará SpreadsheetApp, más lento): ' + String(e.message).slice(0, 160);
  }

  const mensaje = 'Listo. Líneas usa la hoja "' + nombre + '", la carpeta de la app "' + app + '" y NUCOS "' + nucos + '" (solo lectura). ' + api;
  Logger.log(mensaje);
  return mensaje;
}

/** Vacía las cachés de Líneas (índices, catálogos y carpetas). */
function recargarDatosLineas() {
  LineasRepo.borrarCaches();
  Logger.log('Cachés de Líneas vaciadas.');
}
