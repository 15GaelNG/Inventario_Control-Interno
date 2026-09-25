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

/** Proyecto de Apps Script compartido (el que recibe lo que está en master). */
const SCRIPT_ID_COMPARTIDO = '1NbOczw_H8UJ7adxRP4h_jl9VlfyvxM3mANYsaz12U5uo8Gj0BmfIYN3k';

/**
 * Deja listas las Script Properties de un proyecto DEV personal (ver README y
 * setup-dev.ps1): todo apunta a la BD de PRUEBAS, nunca a producción.
 *
 * Ejecutar UNA vez desde el editor de TU proyecto DEV
 * (dropdown de funciones > configurarEntornoDev > Ejecutar).
 * Se niega a correr en el proyecto compartido.
 */
function configurarEntornoDev() {
  if (ScriptApp.getScriptId() === SCRIPT_ID_COMPARTIDO) {
    throw new Error('Esta función es para proyectos DEV personales, no para el proyecto compartido.');
  }

  PropertiesService.getScriptProperties().setProperties({
    ENTORNO: 'DEV',
    SS_ID_USUARIOS: ORIGINAL_PRUEBAS_SPREADSHEET_ID,
    SS_ID_VEHICULOS: ORIGINAL_PRUEBAS_SPREADSHEET_ID,
    SS_ID_ACCESORIOS: ORIGINAL_PRUEBAS_SPREADSHEET_ID,
  });

  // Toca la BD de pruebas para que Google pida el permiso de Sheets desde ya
  // y falle aquí (con un mensaje claro) si tu cuenta no tiene acceso.
  const nombreBd = SpreadsheetApp.openById(ORIGINAL_PRUEBAS_SPREADSHEET_ID).getName();

  const mensaje = 'Listo. Entorno DEV configurado contra la BD de pruebas "' + nombreBd + '". ' +
    'Ahora abre Implementar > Probar implementaciones y usa la URL que termina en /dev.';
  Logger.log(mensaje);
  return mensaje;
}

/**
 * Prueba la conexión a Geotab sin pasar por la app (útil al configurar las Script
 * Properties GEOTAB_USUARIO/PASSWORD/BASE_DATOS/SERVIDOR): seleccionar
 * "probarGeotab" en el dropdown de funciones de arriba y presionar "Ejecutar".
 * El resultado sale en Ver > Registros (o Ctrl+Enter). Es de solo lectura, no
 * cambia nada — se puede correr las veces que haga falta.
 */
function probarGeotab() {
  const info = Geotab.probar();
  const mensaje = 'Geotab responde: ' + info.equipos + ' equipos en ' + info.servidor + '.';
  Logger.log(mensaje);
  return mensaje;
}

/**
 * Muestra lo que hay en la hoja PERFILES (perfil → módulo: permiso), agrupado por
 * perfil, y avisa cuáles de los 4 módulos nuevos (verificaciones, instalacion-sensores,
 * hologramas, inspeccion-vehicular) NO tiene ningún perfil configurado todavía.
 * Correr desde el editor: seleccionar "verPerfiles" arriba y "Ejecutar"; el resultado
 * sale en Ver > Registros (Ctrl+Enter). Solo lee PERFIL/MODULO/PERMISO — nunca toca
 * correos ni contraseñas de USUARIOS. No cambia nada.
 */
function verPerfiles() {
  const MODULOS_NUEVOS = ['verificaciones', 'instalacion-sensores', 'hologramas', 'inspeccion-vehicular'];
  const ssId = Config.SPREADSHEET_IDS.USUARIOS();

  let filas;
  try {
    filas = SheetUtils.getAll(ssId, 'PERFILES');
  } catch (e) {
    const msg = 'No existe la hoja "PERFILES" en ese spreadsheet — el sistema está usando el ROL ' +
      'viejo para todos los módulos (ADMIN/SUPER editan todo, USER edita, VIEWER solo lee).';
    Logger.log(msg);
    return msg;
  }

  const porPerfil = {};
  const modulosVistos = new Set();
  filas.forEach((f) => {
    const perfil = String(f['PERFIL'] || '').trim();
    const modulo = String(f['MODULO'] || '').trim();
    const permiso = String(f['PERMISO'] || '').trim();
    if (!perfil || !modulo || !permiso) return;
    if (!porPerfil[perfil]) porPerfil[perfil] = [];
    porPerfil[perfil].push(modulo + ': ' + permiso);
    modulosVistos.add(Modulos.resolver(modulo) || modulo.toLowerCase());
  });

  const lineas = ['Hoja PERFILES — ' + filas.length + ' fila(s):'];
  Object.keys(porPerfil).forEach((perfil) => {
    lineas.push('  · ' + perfil + '  →  ' + porPerfil[perfil].join(', '));
  });

  const faltantes = MODULOS_NUEVOS.filter((m) => !modulosVistos.has(m));
  lineas.push('');
  lineas.push(faltantes.length
    ? 'Módulos NUEVOS sin ningún perfil configurado (usan el ROL viejo mientras tanto): ' + faltantes.join(', ')
    : 'Los 4 módulos nuevos ya tienen al menos un perfil configurado.');

  const mensaje = lineas.join('\n');
  Logger.log(mensaje);
  return mensaje;
}

/**
 * Corre Relaciones.revisar() en modo SOLO REPORTE (corregir: false) — compara lo que
 * copiaron Instalación de Sensores, Verificaciones y Hologramas contra el catálogo
 * de Vehículos y dice cuántas diferencias hay, sin tocar ni una celda. Úsalo antes
 * de decidir si vale la pena activar la corrección automática (ver Relaciones.gs).
 *
 * Correr desde el editor: seleccionar "revisarRelacionesSoloReporte" arriba y
 * "Ejecutar"; el resultado sale en Ver > Registros (Ctrl+Enter) y además queda
 * escrito en la hoja LOG_RELACIONES del spreadsheet de Vehículos (se crea sola la
 * primera vez). No cambia nada — se puede correr las veces que haga falta.
 */
function revisarRelacionesSoloReporte() {
  const resultado = Relaciones.revisar({ corregir: false });
  const lineas = ['Relaciones.revisar({corregir: false}) —', ''];
  Object.keys(resultado).forEach((hoja) => {
    const r = resultado[hoja];
    lineas.push(
      '  · ' + hoja + ': ' + r.revisadas + ' filas revisadas, ' + r.diferencias + ' diferencia(s), ' +
      r.huerfanos + ' huérfana(s)' +
      (r.clavesDuplicadasOmitidas ? ', ' + r.clavesDuplicadasOmitidas + ' con clave duplicada en el origen (no se revisaron)' : '')
    );
  });
  lineas.push('', 'Detalle de cada diferencia: hoja LOG_RELACIONES, en el mismo spreadsheet de Vehículos.');
  const mensaje = lineas.join('\n');
  Logger.log(mensaje);
  return mensaje;
}

/**
 * Diagnóstico de solo lectura para la hoja "CAMBIOS VEHICULOS": cuántas filas tiene,
 * qué encabezados encontró y cuáles de las 8 columnas esperadas SÍ pudo emparejar
 * (mismo problema que ya se vio antes con encabezados casi-duplicados en otras
 * hojas: un espacio o acento de más y la columna se da por "no encontrada" sin
 * avisar). No cambia nada.
 *
 * Correr desde el editor: seleccionar "diagnosticoCambiosVehiculos" arriba y
 * "Ejecutar"; el resultado sale en Ver > Registros (Ctrl+Enter).
 */
function diagnosticoCambiosVehiculos() {
  const ssId = Config.SPREADSHEET_IDS.VEHICULOS();
  const NOMBRE_HOJA = 'CAMBIOS VEHICULOS';
  const ESPERADAS = ['ID_CAMBIO', 'FOLIO', 'TABLA', 'CAMPO', 'ANTES', 'DESPUES', 'ACTUALIZADO POR', 'FECHA ACTUALIZACION'];

  const ss = SpreadsheetApp.openById(ssId);
  const hoja = ss.getSheetByName(NOMBRE_HOJA);
  if (!hoja) {
    const nombres = ss.getSheets().map((s) => s.getName());
    const parecidos = nombres.filter((n) => n.toUpperCase().indexOf('CAMBIOS') !== -1 || n.toUpperCase().indexOf('VEHICULO') !== -1);
    const mensaje = 'No existe una pestaña llamada exactamente "' + NOMBRE_HOJA + '" en ese spreadsheet.\n' +
      'Pestañas parecidas encontradas: ' + (parecidos.length ? parecidos.join(', ') : '(ninguna)');
    Logger.log(mensaje);
    return mensaje;
  }

  const lastRow = hoja.getLastRow();
  const lastCol = hoja.getLastColumn();
  const encabezados = lastCol ? hoja.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const indices = SheetUtils.indiceDeColumnas(encabezados, ESPERADAS);
  const encontradas = ESPERADAS.filter((c) => indices[c] !== -1);
  const faltantes = ESPERADAS.filter((c) => indices[c] === -1);

  const lineas = [
    'Pestaña "' + hoja.getName() + '" — ' + Math.max(0, lastRow - 1) + ' fila(s) de datos, ' + lastCol + ' columna(s).',
    'Encabezados reales (fila 1): ' + JSON.stringify(encabezados),
    '',
    'De las 8 columnas esperadas, encontró ' + encontradas.length + ': ' + (encontradas.join(', ') || '(ninguna)'),
    faltantes.length ? 'NO encontró: ' + faltantes.join(', ') : 'Encontró las 8.',
  ];

  if (lastRow >= 2 && indices['FOLIO'] !== -1) {
    const ultimasFilas = Math.min(5, lastRow - 1);
    const muestra = hoja.getRange(lastRow - ultimasFilas + 1, 1, ultimasFilas, lastCol).getValues();
    lineas.push('', 'Últimas ' + ultimasFilas + ' fila(s) de la hoja (tal cual, sin procesar):');
    muestra.forEach((fila) => lineas.push('  ' + JSON.stringify(fila)));
  }

  // Ahora, la parte que de verdad importa: correr EXACTAMENTE lo mismo que hace
  // CambiosVehiculosService.listarResumen() (mismo leerColumnasDeHoja, mismo
  // bucle de abajo hacia arriba) y ver en qué momento se pierden los datos.
  const ESPERADAS_SERVICIO = ['ID_CAMBIO', 'FOLIO', 'TABLA', 'CAMPO', 'ANTES', 'DESPUES', 'ACTUALIZADO POR', 'FECHA ACTUALIZACION'];
  const leido = SheetUtils.leerColumnasDeHoja(hoja, ESPERADAS_SERVICIO);
  lineas.push('', '--- Simulación de listarResumen() ---');
  lineas.push('leerColumnasDeHoja: filas=' + leido.filas + ', datos.FOLIO.length=' + leido.datos.FOLIO.length);
  lineas.push('Últimos 5 valores de datos.FOLIO (los que debería leer primero, de abajo hacia arriba): ' +
    JSON.stringify(leido.datos.FOLIO.slice(-5)));

  let encontradosEnBucle = 0;
  for (let i = leido.filas - 1; i >= 0 && encontradosEnBucle < 5; i--) {
    if (!leido.datos.FOLIO[i]) continue;
    encontradosEnBucle++;
    lineas.push('  fila índice ' + i + ' → FOLIO="' + leido.datos.FOLIO[i] + '", CAMPO="' + leido.datos.CAMPO[i] + '"');
  }
  lineas.push('Filas que el bucle SÍ hubiera regresado (de las primeras 5 que encontró): ' + encontradosEnBucle);

  const mensaje = lineas.join('\n');
  Logger.log(mensaje);
  return mensaje;
}

/**
 * Diagnóstico del PDF de Inspección Vehicular: InspeccionesService.registrar()
 * GUARDA el PDF dentro de Config.DRIVE_FOLDERS.REPORTES() + subcarpeta del
 * tipo, pero urlFormato() lo BUSCA después caminando desde
 * Config.DRIVE_FOLDERS.RAIZ() + "INSPECCIONES VEHICULARES" + esa subcarpeta —
 * si REPORTES y RAIZ no son la misma carpeta (o una no contiene a la otra
 * con esa estructura exacta), el PDF se genera bien pero nunca se vuelve a
 * encontrar. Esto lo confirma.
 */
function diagnosticoRutaFormatoInspeccion() {
  function terminar(mensaje) {
    Logger.log(mensaje);
    return mensaje;
  }
  const lineas = [];

  let reportesId, raizId;
  try { reportesId = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID_REPORTES'); }
  catch (e) { /* no-op */ }
  try { raizId = Config.DRIVE_FOLDERS.RAIZ(); } catch (e) { /* no-op */ }

  lineas.push('DRIVE_FOLDER_ID_REPORTES = ' + (reportesId || '(no configurado)'));
  lineas.push('DRIVE_FOLDER_ID_RAIZ     = ' + (raizId || '(no configurado)'));
  if (!reportesId || !raizId) return terminar(lineas.join('\n') + '\n\nFalta configurar una de las dos.');

  if (reportesId === raizId) {
    lineas.push('→ Son la MISMA carpeta.');
  } else {
    const reportes = DriveApp.getFolderById(reportesId);
    const raiz = DriveApp.getFolderById(raizId);
    lineas.push('→ Son carpetas DISTINTAS: "' + reportes.getName() + '" vs "' + raiz.getName() + '"');

    const tieneSubcarpeta = raiz.getFoldersByName('INSPECCIONES VEHICULARES');
    if (tieneSubcarpeta.hasNext()) {
      lineas.push('  RAIZ sí tiene una subcarpeta "INSPECCIONES VEHICULARES".');
    } else {
      lineas.push('  ✗ RAIZ NO tiene ninguna subcarpeta "INSPECCIONES VEHICULARES" — ahí se rompe la búsqueda.');
    }
  }

  // Busca una inspección real con PDF ya guardado y prueba a resolverla tal
  // cual lo hace urlFormato().
  const ssId = Config.SPREADSHEET_IDS.VEHICULOS();
  const hoja = SpreadsheetApp.openById(ssId).getSheetByName('INSPECCION VEHICULAR');
  if (!hoja) return terminar(lineas.join('\n') + '\n\nNo existe la pestaña "INSPECCION VEHICULAR".');

  const leido = SheetUtils.leerColumnasDeHoja(hoja, ['ID INSPECCION', 'FORMATO INSPECCION VEHICULAR']);
  let ejemploRuta = null, ejemploId = null;
  for (let i = 0; i < leido.filas; i++) {
    if (leido.datos['FORMATO INSPECCION VEHICULAR'][i]) {
      ejemploRuta = leido.datos['FORMATO INSPECCION VEHICULAR'][i];
      ejemploId = leido.datos['ID INSPECCION'][i];
      break;
    }
  }
  if (!ejemploRuta) {
    lineas.push('', 'Ninguna inspección tiene algo guardado en "FORMATO INSPECCION VEHICULAR" todavía.');
    return terminar(lineas.join('\n'));
  }
  lineas.push('', 'Ejemplo — ID Inspección "' + ejemploId + '", ruta guardada: "' + ejemploRuta + '"');
  const url = DriveUtils.urlDeRutaProfunda(ejemploRuta, raizId);
  lineas.push(url ? '✓ Se resolvió: ' + url : '✗ NO se pudo encontrar ese archivo caminando desde RAIZ.');

  return terminar(lineas.join('\n'));
}

/**
 * Busca un FOLIO de Vehículos cuyos 4 campos de archivo (RESPONSIVA, DOCUMENTO
 * BAJA, POLIZA SEGURO, ARCHIVO TENENCIA) tengan dato en la hoja Y además el
 * archivo exista de verdad en la carpeta de Drive "VEHICULOS_Files_" — para
 * probar la resolución de rutas con un caso que sí debería funcionar.
 */
function diagnosticoBuscarVehiculoConArchivos() {
  function terminar(mensaje) {
    Logger.log(mensaje);
    return mensaje;
  }

  const ssId = Config.SPREADSHEET_IDS.VEHICULOS();
  const hoja = SpreadsheetApp.openById(ssId).getSheetByName('VEHICULOS');
  if (!hoja) return terminar('No existe la pestaña "VEHICULOS".');

  const CAMPOS = ['FOLIO', 'RESPONSIVA', 'DOCUMENTO BAJA', 'POLIZA SEGURO', 'ARCHIVO TENENCIA'];
  const leido = SheetUtils.leerColumnasDeHoja(hoja, CAMPOS);

  // Nombres reales de archivo que SÍ existen en la carpeta (una sola pasada,
  // en vez de un getFilesByName() por candidato).
  const raiz = DriveApp.getFolderById(Config.DRIVE_FOLDERS.RAIZ());
  const subcarpetas = raiz.getFoldersByName('VEHICULOS_Files_');
  if (!subcarpetas.hasNext()) return terminar('No existe la subcarpeta "VEHICULOS_Files_" dentro de la raíz.');
  const carpeta = subcarpetas.next();
  const existentes = new Set();
  const archivos = carpeta.getFiles();
  while (archivos.hasNext()) existentes.add(archivos.next().getName());

  const nombreDe = (ruta) => String(ruta || '').split('/').pop();

  // Por columna (no los 4 a la vez — no siempre aplican los 4 al mismo
  // vehículo): cuántas filas tienen dato, cuántas de esas SÍ existen de
  // verdad en Drive, y un ejemplo de folio que sí funciona.
  const CAMPOS_ARCHIVO = ['RESPONSIVA', 'DOCUMENTO BAJA', 'POLIZA SEGURO', 'ARCHIVO TENENCIA'];
  const lineas = [];
  CAMPOS_ARCHIVO.forEach((campo) => {
    let conDato = 0, existenDeVerdad = 0, ejemplo = null;
    for (let i = 0; i < leido.filas; i++) {
      const ruta = leido.datos[campo][i];
      if (!ruta) continue;
      conDato++;
      if (existentes.has(nombreDe(ruta))) {
        existenDeVerdad++;
        if (!ejemplo) ejemplo = { folio: leido.datos.FOLIO[i], ruta: ruta };
      }
    }
    lineas.push(campo + ': ' + conDato + ' fila(s) con dato, ' + existenDeVerdad + ' con el archivo real en Drive' +
      (ejemplo ? ' — ejemplo: folio "' + ejemplo.folio + '" (' + ejemplo.ruta + ')' : ' — ninguno encontrado'));
  });
  return terminar(lineas.join('\n'));
}

/**
 * Comparte (DOMAIN, VIEW) todos los archivos que YA existen en las 3 carpetas
 * de adjuntos de la app (Uber, Vehículos, Arqueos) — los subidos antes de que
 * subirArchivo() empezara a compartirlos solos quedaron visibles nada más para
 * la cuenta que despliega la app; nadie más podía abrir el link aunque fuera
 * válido (por eso "no dejaba ver los PDF"). Correrla UNA vez desde el editor.
 *
 * A propósito NO toca la carpeta de Reportes (Config.DRIVE_FOLDERS.REPORTES):
 * es la misma que usa AppSheet, compartida y con muchos más archivos que no
 * son nuestros — los reportes nuevos que genera esta app ya se comparten
 * solos (PdfService.gs), pero los viejos habría que revisarlos aparte.
 */
function compartirArchivosExistentes(token) {
  // Solo el dueño de un archivo puede cambiarle el compartir (setSharing) —
  // "Ejecutar" desde el editor corre con la cuenta que tengas abierta ahí,
  // que puede NO ser la que desplegó la app (dueña de los archivos que sube
  // la app en vivo). Por eso esta función también se puede llamar desde la
  // consola del navegador con la app abierta (corre como USER_DEPLOYING,
  // la cuenta correcta):
  //   google.script.run
  //     .withSuccessHandler(r => console.log(r))
  //     .withFailureHandler(e => console.error('FALLÓ:', e.message))
  //     .apiCompartirArchivosExistentes(state.token)
  if (token) Permisos.puedeEditar(token, 'usuarios');
  const CARPETAS = [
    { id: '1lNo-vHXVT8R2ZMgj2FK2awfIcW17JdY8', nombre: 'Uber (solicitudes)' },
    { id: '1gmu5Gs6thEwOv7tcwe0KWQaWTRhFr4-l', nombre: 'Vehículos (adjuntos)' },
    { id: '1UMHf-zKY6sRz-0Zkt_CxnNCPdrJMHF5o', nombre: 'Arqueos (archivos)' },
  ];
  const lineas = [];
  CARPETAS.forEach((c) => {
    let carpeta;
    try {
      carpeta = DriveApp.getFolderById(c.id);
    } catch (err) {
      lineas.push(c.nombre + ': no se pudo abrir la carpeta (' + err.message + ')');
      return;
    }
    let revisados = 0, compartidos = 0, yaEstaban = 0, fallaron = 0, primerError = null;
    const archivos = carpeta.getFiles();
    while (archivos.hasNext()) {
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
    lineas.push(c.nombre + ': ' + revisados + ' archivo(s) — ' + compartidos + ' recién compartido(s), ' +
      yaEstaban + ' ya estaban, ' + fallaron + ' fallaron.' +
      (primerError ? '\n  Primer error: ' + primerError : ''));
  });
  const mensaje = lineas.join('\n');
  Logger.log(mensaje);
  return mensaje;
}

/**
 * Diagnóstico de solo lectura: compara los 4 campos de archivo de Vehículos
 * (RESPONSIVA, DOCUMENTO BAJA, POLIZA SEGURO, ARCHIVO TENENCIA — los nombres
 * que usa el cliente en CAMPOS_VEHICULO) contra los encabezados REALES de la
 * hoja VEHICULOS, y cuenta cuántas filas sí tienen algo guardado en cada uno.
 * Si el nombre no calza exacto (mayúsculas/espacios/acentos distintos), el
 * archivo se sube a Drive pero la URL nunca llega a la columna correcta —
 * el campo se queda vacío para siempre sin ningún error visible.
 */
function diagnosticoArchivosVehiculos() {
  const ssId = Config.SPREADSHEET_IDS.VEHICULOS();
  const NOMBRE_HOJA = 'VEHICULOS';
  const ESPERADOS = ['RESPONSIVA', 'DOCUMENTO BAJA', 'POLIZA SEGURO', 'ARCHIVO TENENCIA'];

  const ss = SpreadsheetApp.openById(ssId);
  const hoja = ss.getSheetByName(NOMBRE_HOJA);
  if (!hoja) return 'No existe una pestaña llamada "' + NOMBRE_HOJA + '".';

  const lastRow = hoja.getLastRow();
  const lastCol = hoja.getLastColumn();
  const encabezados = lastCol ? hoja.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const indices = SheetUtils.indiceDeColumnas(encabezados, ESPERADOS);

  const lineas = ['Encabezados reales de "' + NOMBRE_HOJA + '" (' + lastCol + ' columnas):', JSON.stringify(encabezados), ''];

  ESPERADOS.forEach((clave) => {
    const idx = indices[clave];
    if (idx === -1) {
      lineas.push('✗ "' + clave + '" — NO se encontró ni siquiera con coincidencia tolerante (espacios/acentos). Revisa el nombre real arriba.');
      return;
    }
    const nombreReal = encabezados[idx];
    const coincideExacto = nombreReal === clave;
    let conDato = 0;
    if (lastRow >= 2) {
      const columna = hoja.getRange(2, idx + 1, lastRow - 1, 1).getValues();
      columna.forEach((fila) => { if (fila[0]) conDato++; });
    }
    lineas.push('✓ "' + clave + '" → columna real: "' + nombreReal + '"' +
      (coincideExacto ? ' (coincide exacto)' : ' (¡OJO! coincide solo tolerante, no exacto)') +
      ' — ' + conDato + ' de ' + Math.max(0, lastRow - 1) + ' fila(s) con algo guardado.');
  });

  const mensaje = lineas.join('\n');
  Logger.log(mensaje);
  return mensaje;
}

/**
 * Diagnóstico paso a paso de por qué una ruta tipo AppSheet ("VEHICULOS_Files_/
 * AUT0024.ARCHIVO TENENCIA.181951.pdf") no se resuelve a una URL real —
 * corre exactamente lo mismo que VehiculosService.buscarPorFolio() ahora hace,
 * pero reportando en qué paso se pierde. Correr desde el editor cambiando la
 * variable RUTA de abajo por el valor real que sale en la vista.
 */
function diagnosticoRutaArchivoVehiculo() {
  const RUTA = 'VEHICULOS_Files_/AUT0024.ARCHIVO TENENCIA.181951.pdf';
  const lineas = ['Ruta a resolver: "' + RUTA + '"', ''];

  let raizId;
  try {
    raizId = Config.DRIVE_FOLDERS.RAIZ();
    lineas.push('DRIVE_FOLDER_ID_RAIZ = ' + raizId);
  } catch (err) {
    lineas.push('✗ Config.DRIVE_FOLDERS.RAIZ() falló: ' + err.message);
    lineas.push('  → Falta la Script Property DRIVE_FOLDER_ID_RAIZ. Sin esto no se puede resolver nada.');
    const mensaje = lineas.join('\n');
    Logger.log(mensaje);
    return mensaje;
  }

  let raiz;
  try {
    raiz = DriveApp.getFolderById(raizId);
    lineas.push('Carpeta raíz encontrada: "' + raiz.getName() + '"');
  } catch (err) {
    lineas.push('✗ No se pudo abrir la carpeta raíz (' + raizId + '): ' + err.message);
    const mensaje = lineas.join('\n');
    Logger.log(mensaje);
    return mensaje;
  }

  const partes = RUTA.split('/').map((p) => p.trim()).filter(Boolean);
  lineas.push('Partes de la ruta: ' + JSON.stringify(partes));

  let inicio = 0;
  if (partes[0].toUpperCase() === raiz.getName().toUpperCase()) {
    inicio = 1;
    lineas.push('(La primera parte coincide con el nombre de la raíz, se salta)');
  }

  let carpeta = raiz;
  for (let i = inicio; i < partes.length - 1; i++) {
    const nombreBuscado = partes[i];
    const subcarpetas = carpeta.getFoldersByName(nombreBuscado);
    if (subcarpetas.hasNext()) {
      carpeta = subcarpetas.next();
      lineas.push('✓ Subcarpeta "' + nombreBuscado + '" encontrada dentro de "' + (i === inicio ? raiz.getName() : partes[i - 1]) + '"');
    } else {
      lineas.push('✗ NO se encontró una subcarpeta llamada exactamente "' + nombreBuscado + '" dentro de "' + carpeta.getName() + '"');
      const nombresReales = [];
      const todas = carpeta.getFolders();
      while (todas.hasNext() && nombresReales.length < 30) nombresReales.push(todas.next().getName());
      lineas.push('  Subcarpetas reales que sí hay ahí: ' + (nombresReales.join(', ') || '(ninguna)'));
      const mensaje = lineas.join('\n');
      Logger.log(mensaje);
      return mensaje;
    }
  }

  const nombreArchivo = partes[partes.length - 1];
  const archivos = carpeta.getFilesByName(nombreArchivo);
  if (archivos.hasNext()) {
    const archivo = archivos.next();
    lineas.push('✓ Archivo encontrado: "' + archivo.getName() + '" → ' + archivo.getUrl());
  } else {
    lineas.push('✗ NO se encontró un archivo llamado exactamente "' + nombreArchivo + '" dentro de "' + carpeta.getName() + '"');
    const nombresReales = [];
    const todosArchivos = carpeta.getFiles();
    while (todosArchivos.hasNext() && nombresReales.length < 10) nombresReales.push(todosArchivos.next().getName());
    lineas.push('  Algunos archivos reales que sí hay ahí: ' + (nombresReales.join(', ') || '(ninguno)'));
  }

  const mensaje = lineas.join('\n');
  Logger.log(mensaje);
  return mensaje;
}

/**
 * Igual que revisarRelacionesSoloReporte(), pero además CORRIGE las diferencias que
 * encuentre (sobrescribe la copia con el valor de Vehículos). Correrla una vez ya
 * revisado el log de la corrida en modo reporte — después de esto, se puede dejar
 * en un activador de tiempo nocturno (Activadores > Agregar activador, con esta
 * función, ~2 a.m.) como red de seguridad para cambios que Relaciones.propagar()
 * nunca vio (edición directa en el Excel, o desde AppSheet).
 */
function revisarRelacionesYCorregir() {
  const resultado = Relaciones.revisar({ corregir: true });
  const lineas = ['Relaciones.revisar({corregir: true}) —', ''];
  Object.keys(resultado).forEach((hoja) => {
    const r = resultado[hoja];
    lineas.push('  · ' + hoja + ': ' + r.revisadas + ' filas revisadas, ' + r.diferencias + ' corregida(s), ' + r.huerfanos + ' huérfana(s)');
  });
  const mensaje = lineas.join('\n');
  Logger.log(mensaje);
  return mensaje;
}
