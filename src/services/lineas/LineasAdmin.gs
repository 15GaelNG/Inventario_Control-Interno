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
  // Sin HISTORIAL_REASIGNACIONES, BITACORA DE DESECHO, REACTIVACION y SOLICITUD: módulos retirados el 30-sep
  return [T.LINEAS, T.CAMBIOS, T.INSP, T.RESP, T.COLAB, T.LISTAS, 'ACCESORIOS CELULARES', 'MOVIMIENTOS_ACCESORIOS'];
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


// ---------------- Retiro de las pestañas de los módulos que ya no existen (30-sep-2026) ----------------
//
// Pedido del usuario: en la BD de pruebas se borran las pestañas de los módulos retirados en la reunión con Líneas,
// para que nadie las limpie en balde. Lo que el sistema todavía usa se migra antes:
//   HISTORIAL_REASIGNACIONES, BITACORA DE DESECHO y REACTIVACION DE LINEAS → APP_MOVIMIENTOS, un movimiento TIPO
//   HISTORICO por renglón con el renglón original completo en DETALLE_JSON ({ hojaAnterior, fila }). El Historial de
//   la ficha y "Números que ha tenido" los leen de ahí (LineasRepo.separarMigrados_).
//   SOLICITUD DE LINEAS no la usa nada: solo queda en el respaldo.
// CAMBIOS LINEAS TELEFONICAS NO se toca: es la bitácora de todo el Historial y del Panorama.
// Antes de migrar se copia todo a un libro de respaldo en Drive (y su .xlsx). En producción no corre.
//
// Se ejecuta desde el editor, en este orden: retirarHojasLineas_revisar → retirarHojasLineas_migrar →
// (revisar el Historial en /dev) → retirarHojasLineas_borrar.

const HOJAS_RETIRADAS_ = {
  'HISTORIAL_REASIGNACIONES': { ref: 'ID Linea', fecha: ['Fecha de Reasignacion'], nuco: 'NUCO', numero: null, migrar: true,
    resumen: (f) => 'Reasignación (AppSheet): ' + (txtAdmin_(f['Responsable Saliente']) || '—') + ' → ' + (txtAdmin_(f['Responsable Entrante']) || '—') },
  'BITACORA DE DESECHO': { ref: 'ID_EQUIPO', fecha: ['FECHA DE DESECHO', 'FECHA DE REGISTRO'], nuco: null, numero: null, migrar: true,
    resumen: (f) => 'Desecho (AppSheet)' + (txtAdmin_(f['FOLIO DESECHO']) ? ' folio ' + txtAdmin_(f['FOLIO DESECHO']) : '') + (txtAdmin_(f['MOTIVO']) ? ': ' + txtAdmin_(f['MOTIVO']) : '') },
  'REACTIVACION DE LINEAS': { ref: 'IMEI', fecha: ['FECHA DE REGISTRO', 'FECHA DE REACTIVACION', 'FECHA DE SUSPENSION'], nuco: null, numero: 'LINIEA SUSPENDIDA', migrar: true,
    resumen: (f) => 'Reactivación (AppSheet)' + (txtAdmin_(f['FOLIO']) ? ' folio ' + txtAdmin_(f['FOLIO']) : '') + (txtAdmin_(f['NUEVO NUMERO']) ? ', nuevo número ' + txtAdmin_(f['NUEVO NUMERO']) : '') },
  'SOLICITUD DE LINEAS': { migrar: false },
};
const PROP_RESPALDO_RETIRADAS_ = 'LINEAS_RESPALDO_HOJAS_RETIRADAS';

function txtAdmin_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

/** Solo en la BD de pruebas: nunca en producción. */
function exigirBdPruebas_() {
  const id = Config.SPREADSHEET_IDS.TELEFONIA();
  if (id !== LINEAS_DEV_SPREADSHEET_ID) throw new Error('Solo se retiran pestañas en la BD de pruebas (' + LINEAS_DEV_SPREADSHEET_ID + '); esta hoja es ' + id + '.');
  return SpreadsheetApp.openById(id);
}

/** Llave de un renglón de una hoja retirada (su ID; si no tiene, su número de fila). */
function llaveRetirada_(hoja, f) { return hoja + '|' + (txtAdmin_(f['ID']) || ('fila ' + f._fila)); }

/** Llaves ya migradas a APP_MOVIMIENTOS (para no migrar dos veces). */
function llavesMigradas_() {
  const salida = {};
  if (!LineasDatos.existeTabla(LineasRepo.TAB.APP_MOV)) return salida;
  LineasDatos.leerTabla(LineasRepo.TAB.APP_MOV).forEach((m) => {
    if (txtAdmin_(m['TIPO']) !== 'HISTORICO') return;
    try {
      const d = JSON.parse(m['DETALLE_JSON'] || '{}');
      if (d.hojaAnterior && d.fila) salida[llaveRetirada_(d.hojaAnterior, d.fila)] = true;
    } catch (e) { /* no es un migrado */ }
  });
  return salida;
}

/** Estado: renglones de cada pestaña, cuántos ya están en APP_MOVIMIENTOS y si ya hay respaldo. No escribe. */
function estadoHojasRetiradas_() {
  const libro = exigirBdPruebas_();
  const migradas = llavesMigradas_();
  const hojas = Object.keys(HOJAS_RETIRADAS_).map((nombre) => {
    const existe = !!libro.getSheetByName(nombre);
    const filas = existe ? LineasDatos.leerTabla(nombre) : [];
    const yaMigrados = filas.filter((f) => migradas[llaveRetirada_(nombre, f)]).length;
    return {
      hoja: nombre, existe: existe, renglones: filas.length, migrar: HOJAS_RETIRADAS_[nombre].migrar, yaMigrados: yaMigrados,
      completa: !HOJAS_RETIRADAS_[nombre].migrar || yaMigrados === filas.length,
    };
  });
  return { respaldo: PropertiesService.getScriptProperties().getProperty(PROP_RESPALDO_RETIRADAS_) || null, hojas: hojas };
}

function retirarHojasLineas_revisar() {
  const e = estadoHojasRetiradas_();
  console.log(JSON.stringify(e, null, 2));
  return e;
}

/** Copia las pestañas que existan a un libro nuevo en Drive y guarda también su .xlsx. Regresa { id, url, xlsx }. */
function respaldarHojasRetiradas_(libro) {
  const props = PropertiesService.getScriptProperties();
  const previo = props.getProperty(PROP_RESPALDO_RETIRADAS_);
  if (previo) return JSON.parse(previo);
  const hoy = Utilities.formatDate(new Date(), LineasDatos.ZONA_APP, 'yyyy-MM-dd HH:mm');
  const respaldo = SpreadsheetApp.create('RESPALDO Líneas · pestañas retiradas · ' + hoy);
  Object.keys(HOJAS_RETIRADAS_).forEach((nombre) => {
    const hoja = libro.getSheetByName(nombre);
    if (hoja) hoja.copyTo(respaldo).setName(nombre);
  });
  respaldo.getSheets().filter((h) => Object.keys(HOJAS_RETIRADAS_).indexOf(h.getName()) < 0).forEach((h) => {
    if (respaldo.getSheets().length > 1) respaldo.deleteSheet(h);
  });
  SpreadsheetApp.flush();
  const xlsx = UrlFetchApp.fetch('https:\/\/docs.google.com/spreadsheets/d/' + respaldo.getId() + '/export?format=xlsx', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true,
  });
  const archivoXlsx = xlsx.getResponseCode() === 200 ? DriveApp.createFile(xlsx.getBlob().setName(respaldo.getName() + '.xlsx')) : null;
  const datos = { id: respaldo.getId(), url: respaldo.getUrl(), xlsx: archivoXlsx ? archivoXlsx.getUrl() : null };
  props.setProperty(PROP_RESPALDO_RETIRADAS_, JSON.stringify(datos));
  return datos;
}

/** Respalda y migra a APP_MOVIMIENTOS lo que falte. No borra nada. Se puede correr varias veces. */
function retirarHojasLineas_migrar() {
  const libro = exigirBdPruebas_();
  const respaldo = respaldarHojasRetiradas_(libro);
  const T = LineasRepo.TAB;
  LineasRepo.asegurarPestanaApp(T.APP_MOV);
  const migradas = llavesMigradas_();
  const resumen = {};
  LineasDatos.conCandado(() => {
    Object.keys(HOJAS_RETIRADAS_).forEach((nombre) => {
      const cfg = HOJAS_RETIRADAS_[nombre];
      if (!cfg.migrar || !libro.getSheetByName(nombre)) return;
      const nuevos = LineasDatos.leerTabla(nombre).filter((f) => !migradas[llaveRetirada_(nombre, f)]).map((f) => {
        const fila = {};
        Object.keys(f).forEach((c) => { if (c !== '_fila' && c !== '' && f[c] !== '' && f[c] !== null && f[c] !== undefined) fila[c] = f[c]; });
        if (!fila['ID']) fila['ID'] = 'fila ' + f._fila; // la llave con la que se reconoce como migrado
        const fecha = cfg.fecha.map((c) => f[c]).filter((v) => v instanceof Date)[0] || '';
        const ref = txtAdmin_(f[cfg.ref]);
        return {
          'FECHA': fecha, 'TIPO': 'HISTORICO', 'REFS': ref ? ',' + ref + ',' : '',
          'NUCO': cfg.nuco ? LineasUtil.nucoVisible(f[cfg.nuco]) || '' : '', 'NUMERO': cfg.numero ? txtAdmin_(f[cfg.numero]) : '',
          'MOTIVO': cfg.resumen(f), 'USUARIO_NOMBRE': txtAdmin_(f['QUIEN REGISTRO']),
          'DETALLE_JSON': JSON.stringify({ hojaAnterior: nombre, fila: fila }),
        };
      });
      for (let i = 0; i < nuevos.length; i += 400) LineasDatos.agregarFilas(T.APP_MOV, nuevos.slice(i, i + 400));
      resumen[nombre] = nuevos.length;
    });
  });
  const salida = { respaldo: respaldo, migradosAhora: resumen, estado: estadoHojasRetiradas_().hojas };
  console.log(JSON.stringify(salida, null, 2));
  return salida;
}

/**
 * Borra las 4 pestañas retiradas, solo si ya hay respaldo y todo lo que se migra está en APP_MOVIMIENTOS.
 * CAMBIOS LINEAS TELEFONICAS nunca se borra (no está en la lista).
 */
function retirarHojasLineas_borrar() {
  const libro = exigirBdPruebas_();
  const estado = estadoHojasRetiradas_();
  if (!estado.respaldo) throw new Error('Primero corre retirarHojasLineas_migrar (hace el respaldo).');
  const incompletas = estado.hojas.filter((h) => h.existe && !h.completa);
  if (incompletas.length) throw new Error('Faltan renglones por migrar: ' + incompletas.map((h) => h.hoja + ' ' + h.yaMigrados + '/' + h.renglones).join(', '));
  const borradas = [];
  Object.keys(HOJAS_RETIRADAS_).forEach((nombre) => {
    const hoja = libro.getSheetByName(nombre);
    if (hoja) { libro.deleteSheet(hoja); borradas.push(nombre); }
    // Los encabezados en caché harían creer a existeTabla que la pestaña sigue ahí (se limpia aunque ya no exista)
    LineasDatos.cacheBorrar('enc_' + nombre);
  });
  LineasRepo.borrarCaches();
  const salida = { borradas: borradas, respaldo: JSON.parse(estado.respaldo) };
  console.log(JSON.stringify(salida, null, 2));
  return salida;
}
