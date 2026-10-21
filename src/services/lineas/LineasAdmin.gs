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
 * y se escribe con las rutas del AppSheet). LINEAS_DRIVE_NUCOS_ID es NUCOS de producción: solo para LEER (inventario de
 * INE, LineasIneNucos); nunca se le da a un DEV como LINEAS_DRIVE_NUCOS, porque ahí se ESCRIBE (15-oct).
 */
const LINEAS_DRIVE_APPSHEET_ID = '1FsC5mloJNhi_TR7pBX1KMEjUZfN_M9OM';
const LINEAS_DRIVE_NUCOS_ID = '12SRBi1nZlIzfNx0d2y1fAtzOydA2QrT-';

/** Pestañas del AppSheet que Líneas necesita (las APP_ las crea el sistema cuando hacen falta). */
function pestanasLineas_() {
  const T = LineasRepo.TAB;
  // Sin HISTORIAL_REASIGNACIONES, BITACORA DE DESECHO, REACTIVACION y SOLICITUD: módulos retirados el 30-sep
  return [T.LINEAS, T.CAMBIOS, T.INSP, T.RESP, T.LISTAS, 'ACCESORIOS CELULARES', 'MOVIMIENTOS_ACCESORIOS'];
}

/** Pestañas que le faltan a la hoja. No escribe nada. */
function diferenciasHojaLineas_(destinoId) {
  const destino = SpreadsheetApp.openById(destinoId);
  return { nombre: destino.getName(), faltanPestanas: pestanasLineas_().filter((nombre) => !destino.getSheetByName(nombre)) };
}

/**
 * Deja listas las Script Properties de Líneas en un proyecto DEV personal: SS_ID_TELEFONIA y LINEAS_DRIVE_APPSHEET, y
 * borra LINEAS_DRIVE_CARPETA_RAIZ (la carpeta de pruebas personal que ya no se usa) y LINEAS_DRIVE_NUCOS: hasta el 15-oct
 * apuntaba a NUCOS de producción y desde el 2-oct Líneas escribe ahí sus PDF y fotos. Sin ella, el DEV usa una
 * "NUCOS TELEFONICOS" de pruebas en su raíz (LineasArchivos).
 * Si a la hoja le faltan pestañas de Líneas no cambia nada y dice cuáles. No toca las propiedades de los demás
 * módulos. Se niega a correr en el proyecto compartido.
 */
function configurarLineasDev() {
  soloEditor_();
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
  });
  props.deleteProperty('LINEAS_DRIVE_CARPETA_RAIZ');
  props.deleteProperty('LINEAS_DRIVE_NUCOS');

  // Toca la hoja y las carpetas para que Google pida los permisos desde ya.
  const nombre = SpreadsheetApp.openById(LINEAS_DEV_SPREADSHEET_ID).getName();
  const app = DriveApp.getFolderById(LINEAS_DRIVE_APPSHEET_ID).getName();
  LineasRepo.borrarCaches();
  CacheService.getScriptCache().remove('ln_api_sheets_off');

  // La API de Sheets es opcional (acelera lecturas/escrituras); sin ella se usa SpreadsheetApp.
  let api = 'API de Sheets habilitada.';
  try {
    Sheets.Spreadsheets.get(LINEAS_DEV_SPREADSHEET_ID, { fields: 'properties.title' });
  } catch (e) {
    api = 'API de Sheets NO habilitada en el proyecto de Google Cloud (se usará SpreadsheetApp, más lento): ' + String(e.message).slice(0, 160);
  }

  const mensaje = 'Listo. Líneas usa la hoja "' + nombre + '", la carpeta de la app "' + app + '" y una NUCOS TELEFONICOS de pruebas en la raíz de este proyecto. ' + api;
  Logger.log(mensaje);
  return mensaje;
}

/** Vacía las cachés de Líneas (índices, catálogos y carpetas). */
function recargarDatosLineas() {
  soloEditor_();
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
  // Con token (desde la app): solo ADMIN. Sin token: solo desde el editor (soloEditor_, Code.gs)
  if (token) Permisos.puedeEditar(token, 'usuarios');
  else soloEditor_();
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


// ---------------- Firmas guardadas de Líneas (usuario, 6-oct; LineasFirmas) ----------------
// Quien corre la función crea en su Drive la carpeta «FIRMAS LINEAS (CARGAR)», sin compartir, con un PNG por persona
// nombrado con su correo («ejecutivotelefonia.ci@ciudadmaderas.com.png»). _revisar dice qué se cargaría y qué se quitaría;
// _cargar las guarda cifradas en este proyecto y quita las de quien ya no esté en la carpeta. Se corre en cada proyecto
// (DEV y producción) y al final la carpeta se borra: la firma solo queda cifrada aquí. _agregar guarda las de la carpeta sin
// quitar a nadie (19-oct: para sumar a una persona sin volver a juntar las de todos).

const CARPETA_FIRMAS_LINEAS = 'FIRMAS LINEAS (CARGAR)';

function firmasGuardadas_(aplicar, sinQuitar) {
  const carpetas = DriveApp.getFoldersByName(CARPETA_FIRMAS_LINEAS);
  if (!carpetas.hasNext()) throw new Error('No está la carpeta «' + CARPETA_FIRMAS_LINEAS + '» en tu Drive.');
  const carpeta = carpetas.next();
  if (carpetas.hasNext()) throw new Error('Hay más de una carpeta «' + CARPETA_FIRMAS_LINEAS + '»: deja solo una.');
  const usuarios = {};
  SheetUtils.getAll(Config.SPREADSHEET_IDS.USUARIOS(), 'USUARIOS').forEach((u) => {
    usuarios[String(u.CORREO || '').trim().toLowerCase()] = { nombre: u.NOMBRE, area: u.AREA || u.COORDINACION || '' };
  });
  const salida = { proyecto: ScriptApp.getScriptId(), aplicado: !!aplicar, compartida: carpeta.getSharingAccess() !== DriveApp.Access.PRIVATE || carpeta.getEditors().length + carpeta.getViewers().length > 0,
    cargar: [], quitar: [], errores: [] };
  if (aplicar && salida.compartida) throw new Error('La carpeta está compartida: quítale el acceso a otros antes de cargar.');
  const enCarpeta = {};
  const archivos = carpeta.getFiles();
  while (archivos.hasNext()) {
    const f = archivos.next();
    const m = /^([^\s\/]+@ciudadmaderas\.com)\.png$/i.exec(f.getName());
    if (!m) { salida.errores.push(f.getName() + ': el nombre debe ser el correo + .png'); continue; }
    const correo = m[1].toLowerCase();
    const u = usuarios[correo];
    if (!u) { salida.errores.push(f.getName() + ': ese correo no está en USUARIOS'); continue; }
    const blob = f.getBlob();
    if (blob.getContentType() !== 'image/png') { salida.errores.push(f.getName() + ': no es PNG'); continue; }
    if (blob.getBytes().length > 60 * 1024) { salida.errores.push(f.getName() + ': pesa más de 60 KB'); continue; }
    enCarpeta[correo] = true;
    salida.cargar.push({ correo: correo, nombre: u.nombre, area: u.area, kb: Math.round(blob.getBytes().length / 102.4) / 10 });
    if (aplicar) LineasFirmas.guardar(correo, blob.getBytes());
  }
  LineasFirmas.lista().forEach((g) => {
    if (enCarpeta[g.correo] || sinQuitar) return;
    salida.quitar.push(g.correo);
    if (aplicar) LineasFirmas.quitar(g.correo);
  });
  if (salida.compartida) salida.errores.push('La carpeta está compartida: quítale el acceso a otros antes de cargar.');
  salida.guardadas = LineasFirmas.lista();
  console.log(JSON.stringify(salida, null, 2));
  return salida;
}

function lineasFirmasGuardadas_revisar() {
  soloEditor_();
  return firmasGuardadas_(false);
}
function lineasFirmasGuardadas_cargar() {
  soloEditor_();
  return firmasGuardadas_(true);
}
function lineasFirmasGuardadas_agregar() {
  soloEditor_();
  return firmasGuardadas_(true, true);
}
