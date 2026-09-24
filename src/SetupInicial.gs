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
