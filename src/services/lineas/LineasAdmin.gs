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

/**
 * Comparte (DOMAIN, VIEW) todos los archivos que ya existían en la carpeta de
 * la app (LINEAS_DRIVE_APPSHEET) antes de que subirArchivo()/
 * guardarComoAppSheet()/generar() empezaran a compartirlos solos —
 * recorre TODAS las subcarpetas ("<TABLA>_Files_", "<TABLA>_Images", …).
 * Solo el DUEÑO de un archivo puede cambiarle el compartir, y "Ejecutar"
 * desde el editor corre con la cuenta que tengas ahí abierta (no
 * necesariamente la que desplegó la app) — por eso también se expone como
 * apiCompartirArchivosLineasExistentes (ClientApi.gs), para correrla desde
 * la consola del navegador con la app abierta:
 *   google.script.run
 *     .withSuccessHandler(r => console.log(r))
 *     .withFailureHandler(e => console.error('FALLÓ:', e.message))
 *     .apiCompartirArchivosLineasExistentes(state.token)
 */
function compartirArchivosLineasExistentes(token) {
  if (token) Permisos.puedeEditar(token, 'usuarios');
  const raizId = LineasArchivos.carpetaAppSheetId();
  if (!raizId) {
    const msg = 'Falta configurar LINEAS_DRIVE_APPSHEET (corre configurarLineasDev()).';
    Logger.log(msg);
    return msg;
  }

  const LIMITE = 4000; // tope de seguridad para no pasarse del tiempo de ejecución
  let revisados = 0, compartidos = 0, yaEstaban = 0, fallaron = 0, primerError = null;

  function recorrer(carpeta) {
    if (revisados >= LIMITE) return;
    const archivos = carpeta.getFiles();
    while (archivos.hasNext() && revisados < LIMITE) {
      const archivo = archivos.next();
      revisados++;
      try {
        const acceso = archivo.getSharingAccess();
        if (acceso === DriveApp.Access.DOMAIN || acceso === DriveApp.Access.ANYONE || acceso === DriveApp.Access.ANYONE_WITH_LINK) {
          yaEstaban++;
        } else {
          archivo.setSharing(DriveApp.Access.DOMAIN, DriveApp.Permission.VIEW);
          compartidos++;
        }
      } catch (err) {
        fallaron++;
        if (!primerError) primerError = archivo.getName() + ': ' + err.message;
      }
    }
    const subcarpetas = carpeta.getFolders();
    while (subcarpetas.hasNext() && revisados < LIMITE) recorrer(subcarpetas.next());
  }

  recorrer(DriveApp.getFolderById(raizId));

  const mensaje = 'Carpeta de Líneas: ' + revisados + ' archivo(s) revisado(s)' +
    (revisados >= LIMITE ? ' (tope alcanzado, corre de nuevo si hace falta)' : '') +
    ' — ' + compartidos + ' recién compartido(s), ' + yaEstaban + ' ya estaban, ' + fallaron + ' fallaron.' +
    (primerError ? '\n  Primer error: ' + primerError : '');
  Logger.log(mensaje);
  return mensaje;
}
