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
 * Carpeta de Drive de PRUEBAS: copia idéntica de la carpeta de la app de AppSheet
 * (con sus *_Images). La usan los proyectos DEV. Producción NO se toca desde DEV.
 */
const DRIVE_FOLDER_PRUEBAS = '1FsC5mloJNhi_TR7pBX1KMEjUZfN_M9OM';

/**
 * Carpeta donde AppSheet deja los formatos YA LLENADOS (no las plantillas), en su ambiente
 * de pruebas. Nuestros PDF se guardan aquí mismo para que todo quede junto, como hasta hoy.
 */
const DRIVE_FOLDER_FORMATOS_PRUEBAS = '1WLrBWn3kP2va_B-rZxAf4jMVTNRBDLmV';

/**
 * Carpeta de archivos de AppSheet ("<TABLA>_Images" o "<TABLA>_Files_") a partir de la
 * raíz de la app. Si la carpeta dada ya ES esa (mismo nombre), la usa directo; si no,
 * busca la subcarpeta y la crea si falta.
 */
function carpetaImagenes_(carpetaId, nombre) {
  const carpeta = DriveApp.getFolderById(carpetaId);
  if (carpeta.getName().toUpperCase() === nombre.toUpperCase()) return carpeta;
  const existentes = carpeta.getFoldersByName(nombre);
  return existentes.hasNext() ? existentes.next() : carpeta.createFolder(nombre);
}

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

  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    ENTORNO: 'DEV',
    SS_ID_USUARIOS: ORIGINAL_PRUEBAS_SPREADSHEET_ID,
    SS_ID_VEHICULOS: ORIGINAL_PRUEBAS_SPREADSHEET_ID,
    SS_ID_ACCESORIOS: ORIGINAL_PRUEBAS_SPREADSHEET_ID,
    // Raíz de la app: desde aquí se resuelven las rutas largas que guarda AppSheet
    DRIVE_FOLDER_ID_RAIZ: DRIVE_FOLDER_PRUEBAS,
    // Comprobantes y responsivas: se guardan y se leen en la carpeta de PRUEBAS, compartida por los 3 DEV.
    DRIVE_FOLDER_ID_VERIFICACIONES: carpetaImagenes_(DRIVE_FOLDER_PRUEBAS, 'VERIFICACIONES_Images').getId(),
    DRIVE_FOLDER_ID_SENSORES: carpetaImagenes_(DRIVE_FOLDER_PRUEBAS, 'INSTALACION DE SENSORES_Files_').getId(),
    // Las solicitudes de holograma pueden ser PDF (carpeta _Files_) o foto (carpeta _Images)
    DRIVE_FOLDER_ID_HOLOGRAMAS_ARCHIVOS: carpetaImagenes_(DRIVE_FOLDER_PRUEBAS, 'HOLOGRAMAS_Files_').getId(),
    DRIVE_FOLDER_ID_HOLOGRAMAS_IMAGENES: carpetaImagenes_(DRIVE_FOLDER_PRUEBAS, 'HOLOGRAMAS_Images').getId(),
    // Formatos ya llenados (inspecciones, arqueos…): la MISMA carpeta que usa AppSheet
    DRIVE_FOLDER_ID_REPORTES: DRIVE_FOLDER_FORMATOS_PRUEBAS,
    // Diagramas marcados y firmas de las inspecciones
    DRIVE_FOLDER_ID_INSPECCIONES_IMAGENES: carpetaImagenes_(DRIVE_FOLDER_PRUEBAS, 'INSPECCION VEHICULAR_Images').getId(),
  });
  // Versiones anteriores de esta función apuntaban la lectura a producción; ya no.
  props.deleteProperty('DRIVE_FOLDER_ID_VERIFICACIONES_LECTURA');

  // Toca la BD de pruebas para que Google pida el permiso de Sheets desde ya
  // y falle aquí (con un mensaje claro) si tu cuenta no tiene acceso.
  const nombreBd = SpreadsheetApp.openById(ORIGINAL_PRUEBAS_SPREADSHEET_ID).getName();

  const mensaje = 'Listo. Entorno DEV configurado contra la BD de pruebas "' + nombreBd + '". ' +
    'Ahora abre Implementar > Probar implementaciones y usa la URL que termina en /dev.';
  Logger.log(mensaje);
  return mensaje;
}

/**
 * Deja lista la hoja PERFILES y las dos columnas de USUARIOS que usan los permisos
 * (ver PermisosService.gs). Se corre UNA vez por spreadsheet, desde el editor.
 *
 * No borra nada: si la hoja o las columnas ya existen, las respeta. Mientras la hoja
 * PERFILES no exista, el sistema sigue funcionando con el ROL viejo.
 */
function configurarPermisos() {
  const ss = SpreadsheetApp.openById(Config.SPREADSHEET_IDS.USUARIOS());
  const hecho = [];

  // 1. Catálogo de módulos: para que la columna MODULO sea una lista desplegable y
  //    nadie tenga que acordarse de cómo se escribe cada id.
  let catalogo = ss.getSheetByName('MODULOS');
  if (!catalogo) {
    catalogo = ss.insertSheet('MODULOS');
    hecho.push('hoja MODULOS creada');
  }
  const modulos = Modulos.todos();
  catalogo.clear();
  catalogo.getRange(1, 1, 1, 3).setValues([['MODULO (escribe este)', 'NOMBRE EN EL MENÚ', 'CONSTRUIDO']])
    .setFontWeight('bold');
  catalogo.getRange(2, 1, modulos.length, 3).setValues(
    modulos.map((m) => [m.id, m.etiqueta, m.listo ? 'SÍ' : 'todavía no'])
  );
  catalogo.setFrozenRows(1);
  catalogo.autoResizeColumns(1, 3);

  let hoja = ss.getSheetByName('PERFILES');
  if (!hoja) {
    hoja = ss.insertSheet('PERFILES');
    hoja.getRange(1, 1, 1, 3).setValues([['PERFIL', 'MODULO', 'PERMISO']]).setFontWeight('bold');
    hoja.setFrozenRows(1);
    // Un perfil de ejemplo con los módulos que ya están construidos
    const ejemplo = [
      ['Control vehicular', 'vehiculos', 'EDICION'],
      ['Control vehicular', 'verificaciones', 'EDICION'],
      ['Control vehicular', 'instalacion-sensores', 'EDICION'],
      ['Control vehicular', 'hologramas', 'EDICION'],
      ['Control vehicular', 'incidencias', 'EDICION'],
      ['Consulta', 'vehiculos', 'LECTURA'],
      ['Consulta', 'verificaciones', 'LECTURA'],
      ['Consulta', 'hologramas', 'LECTURA'],
    ];
    hoja.getRange(2, 1, ejemplo.length, 3).setValues(ejemplo);
    hecho.push('hoja PERFILES creada con 2 perfiles de ejemplo');
  }

  // 2. Listas desplegables en PERFILES: módulo (del catálogo) y permiso
  const FILAS = 500;
  hoja.getRange(2, 2, FILAS).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(catalogo.getRange(2, 1, modulos.length), true)
      .setAllowInvalid(false)
      .setHelpText('Elige un módulo de la hoja MODULOS')
      .build()
  );
  hoja.getRange(2, 3, FILAS).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['LECTURA', 'EDICION'], true)
      .setAllowInvalid(false)
      .setHelpText('LECTURA solo consulta · EDICION captura, corrige y elimina')
      .build()
  );
  hecho.push('listas desplegables de MODULO y PERMISO');

  const usuarios = SheetUtils.getSheetByColumns(Config.SPREADSHEET_IDS.USUARIOS(), ['CORREO', 'ROL']);

  // Antes de escribir: comprobar que la hoja tenga sus columnas conocidas. Una versión
  // anterior de esta función pisaba el encabezado de la última columna con contenido.
  const previos = usuarios.getRange(1, 1, 1, Math.max(1, usuarios.getLastColumn())).getValues()[0];
  const esperadas = SheetUtils.indiceDeColumnas(previos, ['CORREO', 'NOMBRE', 'ROL', 'ACTIVO']);
  const perdidas = Object.keys(esperadas).filter((c) => esperadas[c] === -1);
  if (perdidas.length) {
    throw new Error(
      'A la hoja de usuarios le faltan estos encabezados: ' + perdidas.join(', ') +
      '. Revisa la fila 1 antes de continuar. Encabezados actuales: ' + previos.filter(String).join(' | ')
    );
  }

  ['PERFILES', 'PERMISOS EXTRA'].forEach((columna) => {
    const cabecera = usuarios.getRange(1, 1, 1, Math.max(1, usuarios.getLastColumn())).getValues()[0];
    if (SheetUtils.indiceDeColumnas(cabecera, [columna])[columna] !== -1) return;
    // La columna siguiente a la última CON CONTENIDO: getLastColumn() no crece al
    // insertar una columna vacía, así que usarla para posicionar pisa la anterior
    const destino = cabecera.length + 1;
    if (usuarios.getMaxColumns() < destino) {
      usuarios.insertColumnsAfter(usuarios.getMaxColumns(), destino - usuarios.getMaxColumns());
    }
    usuarios.getRange(1, destino).setValue(columna).setFontWeight('bold');
    hecho.push('columna "' + columna + '" agregada a ' + usuarios.getName());
  });

  const mensaje = hecho.length
    ? 'Listo: ' + hecho.join(' · ') + '. Ahora asigna perfiles en la hoja de usuarios.'
    : 'Todo estaba listo: la hoja PERFILES y las columnas ya existían.';
  Logger.log(mensaje);
  return mensaje;
}

/**
 * Muestra en qué carpeta de Drive está guardando cada módulo sus archivos, con su liga.
 * Sirve para responder rápido "¿dónde quedó lo que subí?" sin adivinar.
 */
function verCarpetas() {
  const props = PropertiesService.getScriptProperties();
  const CARPETAS = [
    ['Comprobantes de verificación', 'DRIVE_FOLDER_ID_VERIFICACIONES'],
    ['Responsivas de sensores (PDF)', 'DRIVE_FOLDER_ID_SENSORES'],
    ['Solicitudes de holograma (PDF)', 'DRIVE_FOLDER_ID_HOLOGRAMAS_ARCHIVOS'],
    ['Solicitudes de holograma (fotos)', 'DRIVE_FOLDER_ID_HOLOGRAMAS_IMAGENES'],
    ['Formatos llenados (PDF)', 'DRIVE_FOLDER_ID_REPORTES'],
  ];

  const lineas = CARPETAS.map(([etiqueta, propiedad]) => {
    const id = props.getProperty(propiedad);
    if (!id) return etiqueta + ': SIN CONFIGURAR (corre configurarEntornoDev)';
    try {
      const carpeta = DriveApp.getFolderById(id);
      return etiqueta + ': "' + carpeta.getName() + '" · ' + carpeta.getUrl();
    } catch (err) {
      return etiqueta + ': el id ' + id + ' no se puede abrir (' + err.message + ')';
    }
  });

  let raiz = '';
  try {
    const padre = DriveApp.getFolderById(DRIVE_FOLDER_PRUEBAS);
    raiz = 'Carpeta raíz (pruebas): "' + padre.getName() + '" · ' + padre.getUrl();
  } catch (err) {
    raiz = 'No se pudo abrir la carpeta raíz de pruebas: ' + err.message;
  }

  const mensaje = [raiz, ''].concat(lineas).join('\n');
  Logger.log(mensaje);
  return mensaje;
}

/**
 * Enlaza cada tipo de unidad con su plantilla de Google Docs y su carpeta de PDF.
 *
 * Agrega a la hoja MODELOS INSPECCION las columnas PLANTILLA y CARPETA, y trata de
 * llenarlas solo, buscando en Drive el documento "FORMATO <TIPO>". Lo que no encuentre
 * lo reporta para capturarlo a mano: es preferible a dejarlo en blanco sin avisar.
 *
 * No pisa lo que ya esté escrito.
 */
function configurarInspecciones() {
  const ss = SpreadsheetApp.openById(Config.SPREADSHEET_IDS.VEHICULOS());
  const hoja = ss.getSheetByName('MODELOS INSPECCION');
  if (!hoja) throw new Error('No existe la hoja MODELOS INSPECCION en ' + ss.getName());

  // Primero se revisa que la hoja siga completa: una corrida anterior de esta función
  // tenía un error que podía pisar el encabezado de la última columna
  const previos = hoja.getRange(1, 1, 1, Math.max(1, hoja.getLastColumn())).getValues()[0];
  const indicesDiagramas = SheetUtils.indiceDeColumnas(previos, ['TIPO', 'FRONTAL', 'TRASERA', 'IZQUIERDA', 'DERECHA']);
  const perdidas = Object.keys(indicesDiagramas).filter((c) => indicesDiagramas[c] === -1);
  if (perdidas.length) {
    throw new Error(
      'A la hoja ' + hoja.getName() + ' le faltan estos encabezados: ' + perdidas.join(', ') +
      '. Revisa la fila 1: es probable que se hayan sobrescrito. Corrígelos y vuelve a correr esta función. ' +
      'Encabezados actuales: ' + previos.filter(String).join(' | ')
    );
  }

  // Escribir en la columna siguiente a la última CON CONTENIDO. Ojo: getLastColumn() no
  // crece al insertar una columna vacía, así que usarla para posicionar pisa la anterior.
  ['PLANTILLA', 'CARPETA'].forEach((columna) => {
    const cabeceraActual = hoja.getRange(1, 1, 1, Math.max(1, hoja.getLastColumn())).getValues()[0];
    if (SheetUtils.indiceDeColumnas(cabeceraActual, [columna])[columna] !== -1) return;
    const destino = cabeceraActual.length + 1;
    if (hoja.getMaxColumns() < destino) {
      hoja.insertColumnsAfter(hoja.getMaxColumns(), destino - hoja.getMaxColumns());
    }
    hoja.getRange(1, destino).setValue(columna).setFontWeight('bold');
  });

  const cabecera = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  const indices = SheetUtils.indiceDeColumnas(cabecera, ['TIPO', 'PLANTILLA', 'CARPETA']);
  const filas = hoja.getRange(2, 1, Math.max(0, hoja.getLastRow() - 1), hoja.getLastColumn()).getValues();

  const encontradas = [];
  const faltantes = [];
  filas.forEach((fila, i) => {
    const tipo = String(fila[indices['TIPO']] || '').trim();
    if (!tipo) return;

    if (!String(fila[indices['CARPETA']] || '').trim()) {
      hoja.getRange(i + 2, indices['CARPETA'] + 1).setValue(InspeccionesService.carpetaDe_(tipo, null));
    }
    if (String(fila[indices['PLANTILLA']] || '').trim()) return;   // ya estaba

    // "contiene" y no "es igual a": en Drive los formatos traen prefijos ("Copia de …")
    const nombre = InspeccionesService.nombrePlantilla_(tipo);
    const encontrados = DriveApp.searchFiles(
      'title contains "' + nombre.replace(/"/g, '\\"') + '" and ' +
      'mimeType = "application/vnd.google-apps.document" and trashed = false'
    );
    const candidatos = [];
    while (encontrados.hasNext()) candidatos.push(encontrados.next());

    if (!candidatos.length) {
      faltantes.push(tipo + ' (se buscó "' + nombre + '")');
      return;
    }
    // Si hay varios, gana el nombre exacto y, si no, el más corto (el que menos le sobra)
    candidatos.sort((a, b) => {
      const exactoA = a.getName().toUpperCase() === nombre.toUpperCase() ? 0 : 1;
      const exactoB = b.getName().toUpperCase() === nombre.toUpperCase() ? 0 : 1;
      return exactoA - exactoB || a.getName().length - b.getName().length;
    });
    const doc = candidatos[0];
    hoja.getRange(i + 2, indices['PLANTILLA'] + 1).setValue(doc.getId());
    encontradas.push(tipo + ' → "' + doc.getName() + '"' +
      (candidatos.length > 1 ? ' (había ' + candidatos.length + ' parecidos; revísalo)' : ''));
  });

  const mensaje = [
    'Plantillas enlazadas: ' + encontradas.length,
  ].concat(encontradas.map((e) => '   ' + e))
    .concat(faltantes.length
      ? ['', 'SIN PLANTILLA (' + faltantes.length + ') — captura el id del documento a mano en la columna PLANTILLA:']
        .concat(faltantes.map((f) => '   ' + f))
      : ['', 'Todos los tipos tienen plantilla.'])
    .join('\n');
  Logger.log(mensaje);
  return mensaje;
}

/**
 * Muestra cómo está organizada la carpeta donde AppSheet deja los formatos llenados:
 * si hay subcarpetas (por tipo de unidad, por año…) y cuántos archivos tiene cada una.
 *
 * Solo reporta NOMBRES DE CARPETAS y conteos, nunca nombres de archivo: esos suelen traer
 * placas y nombres de personas, y este resultado se pega en un chat.
 */
function verFormatosGuardados() {
  const raiz = DriveApp.getFolderById(DRIVE_FOLDER_FORMATOS_PRUEBAS);
  const lineas = ['Carpeta: "' + raiz.getName() + '"'];

  const contar = (carpeta) => {
    let n = 0;
    const archivos = carpeta.getFiles();
    while (archivos.hasNext()) { archivos.next(); n++; }
    return n;
  };

  lineas.push('Archivos sueltos en la raíz: ' + contar(raiz));

  const subcarpetas = raiz.getFolders();
  const encontradas = [];
  while (subcarpetas.hasNext()) {
    const sub = subcarpetas.next();
    let nietas = 0;
    const dentro = sub.getFolders();
    while (dentro.hasNext()) { dentro.next(); nietas++; }
    encontradas.push('   ' + sub.getName() + ' → ' + contar(sub) + ' archivos' +
      (nietas ? ' y ' + nietas + ' subcarpetas' : ''));
  }

  lineas.push('Subcarpetas: ' + encontradas.length);
  const mensaje = lineas.concat(encontradas.sort()).join('\n');
  Logger.log(mensaje);
  return mensaje;
}

/**
 * Genera un PDF de prueba con una de las plantillas que hoy llena AppSheet, para
 * comprobar que se pueden reutilizar tal cual (ver Plantilla.gs y PdfService.gs).
 *
 * Cómo encuentra la plantilla:
 *   1. La propiedad PLANTILLA_DOC_ID_INSPECCION, si está puesta.
 *   2. Si no, busca en tu Drive un Google Doc cuyo nombre contenga "FORMATO AUTOS".
 *
 * Los datos son inventados: se toman los campos que pide el propio documento y se les
 * pone un valor plausible. El PDF se guarda en la carpeta de reportes de PRUEBAS.
 */
function probarPlantillaInspeccion() {
  const props = PropertiesService.getScriptProperties();
  let plantillaId = props.getProperty('PLANTILLA_DOC_ID_INSPECCION');

  if (!plantillaId) {
    const archivos = DriveApp.searchFiles(
      'title contains "FORMATO AUTOS" and mimeType = "application/vnd.google-apps.document" and trashed = false'
    );
    if (!archivos.hasNext()) {
      throw new Error(
        'No encontré ningún Google Doc llamado "FORMATO AUTOS". Abre el formato en Drive, ' +
        'copia el id de la URL (docs.google.com/document/d/ESTE_ID/edit) y ponlo en Script ' +
        'Properties como PLANTILLA_DOC_ID_INSPECCION.'
      );
    }
    const archivo = archivos.next();
    plantillaId = archivo.getId();
    Logger.log('Plantilla encontrada: "' + archivo.getName() + '" (' + plantillaId + ')');
  }

  // Se le pregunta al documento qué campos necesita y se inventan valores plausibles
  const campos = PdfService.camposDePlantilla(plantillaId);
  const datos = {};
  campos.forEach((campo) => {
    if (/LLANTA (DD|DI|TD|TI)/i.test(campo)) datos[campo] = 3.5;
    else if (/^[MB] \d/.test(campo)) datos[campo] = 4;
    else if (/FECHA/i.test(campo)) datos[campo] = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
    else if (/PUNTAJE/i.test(campo)) datos[campo] = 87;
    else if (/OBSERVACION/i.test(campo)) datos[campo] = 'Documento de prueba generado desde Apps Script';
    else if (/GAFETTE|TARJETA|LICENCIA|POLIZA|VERIFICACION|KARDEX/i.test(campo)) datos[campo] = 'PRESENTA';
    else if (/BATERIA INFLADA|DERRAME/i.test(campo)) datos[campo] = 'NO';
    else datos[campo] = 'BUENO';
  });
  datos['RESPONSABLE'] = 'PRUEBA DEL SISTEMA';
  datos['AREA'] = 'CONTROL INTERNO';

  // Mismo nombre que tendrán los reales (responsable, placa y fecha), con PRUEBA al frente
  // para poder distinguirlo y borrarlo después
  const resultado = PdfService.generar({
    plantillaId: plantillaId,
    datos: datos,
    nombre: PdfService.nombreArchivo([
      'PRUEBA INSPECCION', datos['RESPONSABLE'], 'ST0443E', PdfService.fechaParaNombre(new Date()),
    ]),
  });

  const mensaje = 'PDF generado con ' + resultado.marcadores + ' marcadores sustituidos' +
    (resultado.sinResolver.length ? ' · SIN RESOLVER: ' + resultado.sinResolver.join(' | ') : ' · todo resuelto') +
    '\n' + resultado.url;
  Logger.log(mensaje);
  return mensaje;
}

/**
 * Prueba la conexión con Geotab (estado en vivo y métricas de sensores).
 *
 * Antes de correrla, captura en Configuración del proyecto > Propiedades del script:
 *   GEOTAB_USUARIO     tu correo de MyGeotab
 *   GEOTAB_PASSWORD    tu contraseña        ← nunca va en el código ni en git
 *   GEOTAB_BASE_DATOS  nombre de la base de datos en MyGeotab
 *   GEOTAB_SERVIDOR    (opcional) por defecto my.geotab.com
 *
 * Solo se hacen lecturas; la app nunca escribe en Geotab.
 */
function probarGeotab() {
  const info = Geotab.probar();
  const mensaje = 'Geotab responde: ' + info.equipos + ' equipos en ' + info.servidor + '.';
  Logger.log(mensaje);
  return mensaje;
}

/**
 * ¿Por qué alguien no ve módulos? Se corre desde el editor; por defecto revisa a quien
 * la ejecuta (cambia CORREO_A_REVISAR para revisar a otra persona).
 * Borra primero el caché de permisos, así que también sirve para aplicar un cambio YA.
 */
function diagnosticarPermisos() {
  const CORREO_A_REVISAR = '';   // vacío = tu propia cuenta
  const correo = CORREO_A_REVISAR || Session.getActiveUser().getEmail();
  const ssId = Config.SPREADSHEET_IDS.USUARIOS();
  const hoja = SheetUtils.getSheetByColumns(ssId, ['CORREO', 'ROL']);
  const usuario = SheetUtils.getAll(ssId, hoja.getName())
    .find((u) => String(u['CORREO']).trim().toLowerCase() === String(correo).trim().toLowerCase());

  Permisos.olvidar(correo);
  const permisos = Permisos.deCorreo(correo);
  const lineas = [
    'Libro: ' + SpreadsheetApp.openById(ssId).getName() + ' · hoja: ' + hoja.getName(),
    'Correo: ' + correo,
    usuario
      ? 'ROL: ' + usuario['ROL'] + ' · ACTIVO: ' + usuario['ACTIVO'] + ' · PERFILES: "' + (usuario['PERFILES'] || '') + '"'
      : 'NO está en la hoja de usuarios',
    'Módulos con acceso: ' + Object.keys(permisos).length,
    Object.keys(permisos).map((m) => '  ' + m + ' → ' + permisos[m]).join('\n'),
  ];
  Logger.log(lineas.join('\n'));
  return lineas.join('\n');
}
