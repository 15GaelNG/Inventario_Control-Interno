/**
 * LineasAdmin.gs
 * Configuración del módulo de Líneas. Se ejecuta desde el editor de Apps Script
 * (lista de funciones → Ejecutar); no se llama desde el cliente.
 */

/**
 * Hoja de Líneas en DEV: la BD de pruebas del equipo, la misma que usan Usuarios, Vehículos y Accesorios
 * (decisión del 25-sep: una sola hoja para todo el sistema).
 */
const LINEAS_DEV_SPREADSHEET_ID = '1fC77Uu1ePVUySNvhgWXMHqWpLhGhBMTZZMEblU2nUhI';
/** Hoja que usaba Líneas antes: la de la copia del AppSheet "COPIA PRUEBAS APPSCRIPT CVT" (referencia de estructura). */
const LINEAS_COPIA_APPSHEET_ID = '1_47fd5nCcg4M6Qnsxmk14r9aTJG2bCPSW86ig_r2478';
/** Carpeta de pruebas de Líneas en Drive: ahí se GUARDA lo nuevo en DEV (inspecciones, fotos, PDF, responsivas). */
const LINEAS_DEV_CARPETA_RAIZ = '1ZNI2tVANe3qBglcQ5sisCctGBe4Qetmk';
/** Carpetas de producción que se LEEN (25-sep): raíz del AppSheet (<TABLA>_Files_, _Images) y NUCOS. */
const LINEAS_DRIVE_APPSHEET_ID = '1FsC5mloJNhi_TR7pBX1KMEjUZfN_M9OM';
const LINEAS_DRIVE_NUCOS_ID = '12SRBi1nZlIzfNx0d2y1fAtzOydA2QrT-';

/** Pestañas del AppSheet que Líneas necesita (las APP_ las crea el sistema cuando hacen falta). */
function pestanasLineas_() {
  const T = LineasRepo.TAB;
  return [T.LINEAS, T.CAMBIOS, T.REASIG, T.DESECHO, T.INSP, T.RESP, T.COLAB, T.LISTAS, T.REACTIVACION, T.SOLICITUD,
    'ACCESORIOS CELULARES', 'MOVIMIENTOS_ACCESORIOS'];
}

/**
 * Compara la estructura de `destinoId` con la copia del AppSheet: pestañas que faltan y columnas que faltan
 * en cada una. No escribe nada.
 */
function diferenciasHojaLineas_(destinoId) {
  const norm = (h) => String(h || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const encabezados = (hoja) => (hoja && hoja.getLastColumn() ? hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(norm).filter(Boolean) : []);
  const destino = SpreadsheetApp.openById(destinoId);
  let referencia = null;
  try { referencia = SpreadsheetApp.openById(LINEAS_COPIA_APPSHEET_ID); } catch (e) { /* sin acceso: solo se revisan las pestañas */ }
  const faltanPestanas = [];
  const faltanColumnas = [];
  pestanasLineas_().forEach((nombre) => {
    const hoja = destino.getSheetByName(nombre);
    if (!hoja) { faltanPestanas.push(nombre); return; }
    if (!referencia) return;
    const tiene = encabezados(hoja);
    const faltan = encabezados(referencia.getSheetByName(nombre)).filter((h) => tiene.indexOf(h) < 0);
    if (faltan.length) faltanColumnas.push(nombre + ': ' + faltan.join(', '));
  });
  return { nombre: destino.getName(), faltanPestanas: faltanPestanas, faltanColumnas: faltanColumnas, conReferencia: !!referencia };
}

/**
 * Deja listas las Script Properties de Líneas en un proyecto DEV personal:
 * SS_ID_TELEFONIA → BD de pruebas del equipo, LINEAS_DRIVE_CARPETA_RAIZ → carpeta de pruebas.
 * Antes de cambiar revisa que la hoja tenga las pestañas y columnas de Líneas; si falta algo, no cambia nada
 * y dice qué falta. No toca las propiedades de los demás módulos. Se niega a correr en el proyecto compartido.
 */
function configurarLineasDev() {
  return apuntarLineasA_(LINEAS_DEV_SPREADSHEET_ID);
}

/** Regresa Líneas a la hoja de la copia del AppSheet (la que usaba antes del 25-sep). */
function usarCopiaAppSheetLineas() {
  return apuntarLineasA_(LINEAS_COPIA_APPSHEET_ID);
}

function apuntarLineasA_(destinoId) {
  if (typeof SCRIPT_ID_COMPARTIDO !== 'undefined' && ScriptApp.getScriptId() === SCRIPT_ID_COMPARTIDO) {
    throw new Error('Esta función es para proyectos DEV personales, no para el proyecto compartido.');
  }
  const revision = destinoId === LINEAS_COPIA_APPSHEET_ID ? null : diferenciasHojaLineas_(destinoId);
  if (revision && (revision.faltanPestanas.length || revision.faltanColumnas.length)) {
    const detalle = (revision.faltanPestanas.length ? 'Pestañas que faltan: ' + revision.faltanPestanas.join(', ') + '. ' : '') +
      (revision.faltanColumnas.length ? 'Columnas que faltan → ' + revision.faltanColumnas.join(' | ') : '');
    Logger.log(detalle);
    throw new Error('No se cambió nada: "' + revision.nombre + '" no tiene la estructura de Líneas. ' + detalle);
  }

  PropertiesService.getScriptProperties().setProperties({
    SS_ID_TELEFONIA: destinoId,
    LINEAS_DRIVE_CARPETA_RAIZ: LINEAS_DEV_CARPETA_RAIZ,
    LINEAS_DRIVE_APPSHEET: LINEAS_DRIVE_APPSHEET_ID,
    LINEAS_DRIVE_NUCOS: LINEAS_DRIVE_NUCOS_ID,
  });

  // Toca la hoja para que Google pida los permisos desde ya.
  const nombre = SpreadsheetApp.openById(destinoId).getName();
  LineasRepo.borrarCaches();
  CacheService.getScriptCache().remove('ln_api_sheets_off');

  // La API de Sheets es opcional (acelera lecturas/escrituras); sin ella se usa SpreadsheetApp.
  let api = 'API de Sheets habilitada.';
  try {
    Sheets.Spreadsheets.get(destinoId, { fields: 'properties.title' });
  } catch (e) {
    api = 'API de Sheets NO habilitada en el proyecto de Google Cloud (se usará SpreadsheetApp, más lento): ' + String(e.message).slice(0, 160);
  }

  const aviso = revision && !revision.conReferencia ? ' (no se pudo abrir la copia del AppSheet para comparar columnas; solo se revisaron las pestañas)' : '';
  const mensaje = 'Listo. Líneas apunta a "' + nombre + '" (' + destinoId + ')' + aviso + '. ' + api;
  Logger.log(mensaje);
  return mensaje;
}

/** Vacía las cachés de Líneas (índices, catálogos y carpetas). */
function recargarDatosLineas() {
  LineasRepo.borrarCaches();
  Logger.log('Cachés de Líneas vaciadas.');
}
