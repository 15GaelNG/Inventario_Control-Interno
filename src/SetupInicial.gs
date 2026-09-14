/**
 * SetupInicial.gs
 * Script de arranque, se ejecuta UNA sola vez manualmente desde el editor de
 * Apps Script (seleccionar "configurarAmbienteInicial" en el dropdown de
 * funciones y presionar "Ejecutar"). No se llama desde el cliente.
 *
 * Qué hace:
 *   1. Crea una COPIA independiente del spreadsheet de pruebas de AppSheet
 *      (el original nunca se lee para escribir, solo para copiar — jamás se
 *      modifica). Sirve como archivo de referencia, no como base de datos viva.
 *   2. Crea el spreadsheet "Inventario - USUARIOS" con el esquema nuevo
 *      (contraseña con hash+salt) y da de alta al primer usuario ADMIN.
 *   3. Crea el spreadsheet "Inventario - ACCESORIOS" con el catálogo migrado
 *      desde la copia (si lo encuentra) y la hoja de movimientos vacía.
 *   4. Guarda los IDs resultantes en Script Properties automáticamente.
 *
 * Antes de ejecutar, agrega temporalmente estas 2 Script Properties
 * (Configuración del proyecto > Propiedades del script):
 *   ADMIN_CORREO_INICIAL
 *   ADMIN_PASSWORD_INICIAL
 * El script las borra solas después de usarlas — la contraseña en texto
 * plano nunca queda guardada en ningún lado ni se sube a git.
 */

const ORIGINAL_PRUEBAS_SPREADSHEET_ID = '1fC77Uu1ePVUySNvhgWXMHqWpLhGhBMTZZMEblU2nUhI';

function configurarAmbienteInicial() {
  const props = PropertiesService.getScriptProperties();
  const adminCorreo = props.getProperty('ADMIN_CORREO_INICIAL');
  const adminPassword = props.getProperty('ADMIN_PASSWORD_INICIAL');

  if (!adminCorreo || !adminPassword) {
    throw new Error(
      'Faltan las Script Properties temporales ADMIN_CORREO_INICIAL y ' +
      'ADMIN_PASSWORD_INICIAL. Agrégalas en Configuración del proyecto antes de ejecutar.'
    );
  }

  // 1. Copia independiente y segura (solo lectura sobre el original, nunca escritura)
  const copiaFile = DriveApp.getFileById(ORIGINAL_PRUEBAS_SPREADSHEET_ID).makeCopy(
    'COPIA BASE (referencia) - Control Interno - ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm')
  );
  const copiaSS = SpreadsheetApp.openById(copiaFile.getId());

  function hojaConColumnas(columnasRequeridas) {
    return copiaSS.getSheets().find((sheet) => {
      if (sheet.getLastColumn() === 0) return false;
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
      return columnasRequeridas.every((col) => headers.indexOf(col) !== -1);
    });
  }

  const hojaCatalogoOriginal = hojaConColumnas(['ID_Accesorio', 'Categoria', 'Nombre del Articulo']);

  // 2. Spreadsheet nuevo: USUARIOS
  const ssUsuarios = SpreadsheetApp.create('Inventario - USUARIOS');
  const hojaUsuarios = ssUsuarios.getSheets()[0].setName('USUARIOS');
  hojaUsuarios.appendRow(
    ['ID', 'CORREO', 'NOMBRE', 'SALT', 'PASSWORD_HASH', 'ROL', 'ACTIVO', 'DEPARTAMENTO', 'DPTOS_PERMITIDOS']
  );

  const credencialesAdmin = Auth.crearHashParaUsuario(adminPassword);
  hojaUsuarios.appendRow([
    Utilities.getUuid().slice(0, 8),
    adminCorreo,
    'Administrador',
    credencialesAdmin.salt,
    credencialesAdmin.hash,
    Config.ROLES.ADMIN,
    true,
    'CONTROL INTERNO',
    '',
  ]);

  // 3. Spreadsheet nuevo: ACCESORIOS
  const ssAccesorios = SpreadsheetApp.create('Inventario - ACCESORIOS');
  const hojaArticulos = ssAccesorios.getSheets()[0].setName('ARTICULOS');
  hojaArticulos.appendRow(['ID', 'CATEGORIA', 'NOMBRE', 'MARCA', 'STOCK_MINIMO']);

  let articulosMigrados = 0;
  if (hojaCatalogoOriginal) {
    const datos = hojaCatalogoOriginal.getDataRange().getValues();
    const headers = datos[0].map(String);
    const idxCategoria = headers.indexOf('Categoria');
    const idxNombre = headers.indexOf('Nombre del Articulo');
    const idxMarca = headers.indexOf('Marca');

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      if (!fila[idxNombre]) continue;
      hojaArticulos.appendRow([
        Utilities.getUuid().slice(0, 8),
        fila[idxCategoria] || '',
        fila[idxNombre],
        fila[idxMarca] || '',
        0,
      ]);
      articulosMigrados++;
    }
  }

  const hojaMovimientos = ssAccesorios.insertSheet('MOVIMIENTOS');
  hojaMovimientos.appendRow(['ID', 'ID_ARTICULO', 'TIPO', 'CANTIDAD', 'FECHA', 'USUARIO', 'COMENTARIOS']);

  // 4. Wire de Script Properties (para que Config.gs las encuentre)
  props.setProperties({
    ENTORNO: 'DEV',
    SS_ID_USUARIOS: ssUsuarios.getId(),
    SS_ID_ACCESORIOS: ssAccesorios.getId(),
  });

  // 5. Limpieza: la contraseña temporal nunca queda guardada en ningún lado
  props.deleteProperty('ADMIN_CORREO_INICIAL');
  props.deleteProperty('ADMIN_PASSWORD_INICIAL');

  const resumen = {
    copiaReferenciaUrl: copiaFile.getUrl(),
    usuariosSpreadsheetUrl: ssUsuarios.getUrl(),
    accesoriosSpreadsheetUrl: ssAccesorios.getUrl(),
    adminCorreo: adminCorreo,
    articulosMigrados: articulosMigrados,
    catalogoEncontrado: !!hojaCatalogoOriginal,
  };

  Logger.log(JSON.stringify(resumen, null, 2));
  return resumen;
}

/**
 * Inspecciona (SOLO LECTURA) la hoja de Incidencias en el spreadsheet original
 * de AppSheet: regresa su encabezado completo y hasta 3 filas de ejemplo.
 * Se usa una sola vez, desde el editor, para entender la estructura real de
 * ese módulo antes de construirlo — no modifica nada.
 *
 * Ejecutar desde el editor (dropdown de funciones > inspeccionarIncidencias > Ejecutar)
 * y revisar el resultado en el panel de "Ejecuciones" / valor de retorno.
 */
function inspeccionarIncidencias() {
  const ss = SpreadsheetApp.openById(ORIGINAL_PRUEBAS_SPREADSHEET_ID);
  const hoja = ss.getSheets().find((sheet) => {
    if (sheet.getLastColumn() === 0) return false;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    return headers.indexOf('ID_INCIDENCIA') !== -1;
  });

  if (!hoja) {
    const resultado = 'No se encontró ninguna hoja con la columna ID_INCIDENCIA.';
    Logger.log(resultado);
    return resultado;
  }

  const headers = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  const lastRow = hoja.getLastRow();
  const filasEjemplo = lastRow > 1
    ? hoja.getRange(2, 1, Math.min(3, lastRow - 1), hoja.getLastColumn()).getValues()
    : [];

  const resultado = {
    nombreHoja: hoja.getName(),
    totalColumnas: headers.length,
    totalFilas: Math.max(0, lastRow - 1),
    encabezados: headers,
    filasEjemplo: filasEjemplo,
  };

  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

/**
 * Igual que inspeccionarIncidencias(), pero para la hoja de Vehículos —
 * se usa para confirmar nombres exactos de columna antes de programar el
 * autollenado de Incidencias a partir del folio del vehículo.
 */
function inspeccionarVehiculos() {
  const ss = SpreadsheetApp.openById(ORIGINAL_PRUEBAS_SPREADSHEET_ID);
  const hoja = ss.getSheets().find((sheet) => {
    if (sheet.getLastColumn() === 0) return false;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    return headers.indexOf('ID_VEHICULO') !== -1;
  });

  if (!hoja) {
    const resultado = 'No se encontró ninguna hoja con la columna ID_VEHICULO.';
    Logger.log(resultado);
    return resultado;
  }

  const headers = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  const lastRow = hoja.getLastRow();
  const filasEjemplo = lastRow > 1
    ? hoja.getRange(2, 1, Math.min(3, lastRow - 1), hoja.getLastColumn()).getValues()
    : [];

  const resultado = {
    nombreHoja: hoja.getName(),
    totalColumnas: headers.length,
    totalFilas: Math.max(0, lastRow - 1),
    encabezados: headers,
    filasEjemplo: filasEjemplo,
  };

  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

/**
 * Reapunta USUARIOS y ACCESORIOS al spreadsheet ORIGINAL de AppSheet (en vivo),
 * en vez de a las copias creadas por configurarAmbienteInicial(). Decisión
 * explícita del usuario (2026-09-14) — a partir de aquí, cualquier alta o
 * movimiento registrado desde esta app escribe directo en ese archivo real.
 *
 * Ejecutar UNA vez desde el editor (dropdown de funciones > apuntarABdOriginal > Ejecutar).
 */
function apuntarABdOriginal() {
  PropertiesService.getScriptProperties().setProperties({
    SS_ID_USUARIOS: ORIGINAL_PRUEBAS_SPREADSHEET_ID,
    SS_ID_ACCESORIOS: ORIGINAL_PRUEBAS_SPREADSHEET_ID,
    SS_ID_VEHICULOS: ORIGINAL_PRUEBAS_SPREADSHEET_ID,
  });
  const mensaje = 'Listo. USUARIOS, ACCESORIOS y VEHICULOS ahora apuntan al spreadsheet original de AppSheet: ' +
    ORIGINAL_PRUEBAS_SPREADSHEET_ID;
  Logger.log(mensaje);
  return mensaje;
}
