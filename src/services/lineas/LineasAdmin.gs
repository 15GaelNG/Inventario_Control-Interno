/**
 * LineasAdmin.gs
 * Configuración del módulo de Líneas. Se ejecuta desde el editor de Apps Script
 * (lista de funciones → Ejecutar); no se llama desde el cliente.
 */

/** Copia del AppSheet para pruebas de Líneas (datos de prueba y pestañas APP_). */
const LINEAS_DEV_SPREADSHEET_ID = '1_47fd5nCcg4M6Qnsxmk14r9aTJG2bCPSW86ig_r2478';
/** Carpeta de pruebas de Líneas en Drive (inventarios de NUCOS, evidencias de prueba). */
const LINEAS_DEV_CARPETA_RAIZ = '1ZNI2tVANe3qBglcQ5sisCctGBe4Qetmk';

/**
 * Deja listas las Script Properties de Líneas en un proyecto DEV personal:
 * SS_ID_TELEFONIA → copia de pruebas de Líneas, LINEAS_DRIVE_CARPETA_RAIZ → carpeta de pruebas.
 * No toca las propiedades de los demás módulos. Se niega a correr en el proyecto compartido.
 */
function configurarLineasDev() {
  if (typeof SCRIPT_ID_COMPARTIDO !== 'undefined' && ScriptApp.getScriptId() === SCRIPT_ID_COMPARTIDO) {
    throw new Error('Esta función es para proyectos DEV personales, no para el proyecto compartido.');
  }
  PropertiesService.getScriptProperties().setProperties({
    SS_ID_TELEFONIA: LINEAS_DEV_SPREADSHEET_ID,
    LINEAS_DRIVE_CARPETA_RAIZ: LINEAS_DEV_CARPETA_RAIZ,
  });

  // Toca la hoja para que Google pida los permisos desde ya.
  const nombre = SpreadsheetApp.openById(LINEAS_DEV_SPREADSHEET_ID).getName();
  LineasRepo.borrarCaches();
  CacheService.getScriptCache().remove('ln_api_sheets_off');

  // La API de Sheets es opcional (acelera lecturas/escrituras); sin ella se usa SpreadsheetApp.
  let api = 'API de Sheets habilitada.';
  try {
    LineasDatos.sheetsApi('?fields=properties.title');
  } catch (e) {
    api = 'API de Sheets NO habilitada en el proyecto de Google Cloud (se usará SpreadsheetApp, más lento): ' + String(e.message).slice(0, 160);
  }

  const mensaje = 'Listo. Líneas apunta a "' + nombre + '" (' + LINEAS_DEV_SPREADSHEET_ID + '). ' + api;
  Logger.log(mensaje);
  return mensaje;
}

/** Vacía las cachés de Líneas (índices, catálogos y carpetas). */
function recargarDatosLineas() {
  LineasRepo.borrarCaches();
  Logger.log('Cachés de Líneas vaciadas.');
}
