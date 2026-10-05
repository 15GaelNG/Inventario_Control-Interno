/**
 * Entornos.gs — la configuración de cada proyecto de Apps Script, en un archivo (el ".env").
 *
 * El mismo código se sube a varios proyectos (DEV de cada quien, LAB, producción) y cada uno
 * necesita sus propios libros y carpetas: por eso cada bloque va bajo el scriptId de SU
 * proyecto (Configuración del proyecto > ID, o el que está en la URL del editor). El código
 * toma el bloque del proyecto en el que está corriendo.
 *
 * Quién manda (leerConfig_):
 *   1. lo que diga este archivo para este proyecto (si no está vacío);
 *   2. si no, la Script Property (así los DEV que ya las tienen siguen igual).
 *
 * Se commitea a propósito, aunque se parezca a un .env: clasp push reemplaza TODOS los
 * archivos del proyecto, y si este solo existiera en una máquina, subir desde otra lo borraría
 * y producción se quedaría sin configuración. Los IDs de libros y carpetas no son secretos
 * (el acceso lo controla Drive). Lo secreto — la contraseña de Geotab — NO va aquí: se queda
 * en Script Properties.
 */

const ENTORNOS = {
  // ---------------------------------------------------------------- PRODUCCIÓN
  '1NbOczw_H8UJ7adxRP4h_jl9VlfyvxM3mANYsaz12U5uo8Gj0BmfIYN3k': {
    ENTORNO: 'PROD',

    // El libro migrado (migrar.py --copiar-produccion, 4-oct-2026, corrida final)
    SS_ID_USUARIOS: '17YrtuMYjGGg5LZm1BxMNrEZyCxTMI2DiUHSVUIldUlc',
    SS_ID_VEHICULOS: '17YrtuMYjGGg5LZm1BxMNrEZyCxTMI2DiUHSVUIldUlc',
    SS_ID_TELEFONIA: '17YrtuMYjGGg5LZm1BxMNrEZyCxTMI2DiUHSVUIldUlc',
    SS_ID_ACCESORIOS: '17YrtuMYjGGg5LZm1BxMNrEZyCxTMI2DiUHSVUIldUlc',
    SS_ID_CAJACHICA: '17YrtuMYjGGg5LZm1BxMNrEZyCxTMI2DiUHSVUIldUlc',

    // Carpetas de Drive (ver qué es cada una en Config.gs)
    DRIVE_FOLDER_ID_RAIZ: '1FsC5mloJNhi_TR7pBX1KMEjUZfN_M9OM',
    DRIVE_FOLDER_ID_REPORTES: '1WLrBWn3kP2va_B-rZxAf4jMVTNRBDLmV',
    DRIVE_FOLDER_ID_VERIFICACIONES: '1iGrxuqmUKKUV9UFIjEOSJ0TEibab3K7C',
    DRIVE_FOLDER_ID_SENSORES: '1EIMbBdhASdi9RIcO6oPb1FBd72g17-LR',
    DRIVE_FOLDER_ID_HOLOGRAMAS_IMAGENES: '1aygt9Qso02GSIyhJgSFa134wTvLUGpCK',
    DRIVE_FOLDER_ID_HOLOGRAMAS_ARCHIVOS: '1VRwPWOVOjZ1Obdm3zuC7bTnh7zHoS0h0',
    DRIVE_FOLDER_ID_INSPECCIONES_IMAGENES: '1FsC5mloJNhi_TR7pBX1KMEjUZfN_M9OM',
    DRIVE_FOLDER_ID_VERIFICACIONES_LECTURA: '',   // opcional
    DRIVE_FOLDER_ID_MODELOS: '1ddRghL8izS63UYWDHn9w_YFHPuRC8bTm',   // opcional: sin esto se usa RAIZ

    // Líneas (opcionales: sin esto usan las carpetas de AppSheet que trae el código)
    LINEAS_DRIVE_APPSHEET: '1FsC5mloJNhi_TR7pBX1KMEjUZfN_M9OM',
    LINEAS_DRIVE_NUCOS: '12SRBi1nZlIzfNx0d2y1fAtzOydA2QrT-',
    LINEAS_APROBADORES_RESGUARDO: '',   // correos separados por coma

    // Geotab (opcional): usuario, base y servidor aquí; GEOTAB_PASSWORD solo en Script Properties
    GEOTAB_USUARIO: 'auxiliar6datos.ci@ciudadmaderas.com',
    GEOTAB_BASE_DATOS: 'ciudad_maderas',
    GEOTAB_SERVIDOR: '',
  },

  // ---------------------------------------------------------------- DEV de Emmanuel (rama emmanuel)
  '1rpvvay1hBTFfm5paVyvy6-Thmx-CQ6uUWVef20Jr8VmHQxkCWZ7UmeOa': {
    ENTORNO: 'DEV',

    // Copia del libro de producción ("DEV EMMANUEL - Copia de produccion 2026-10-05")
    SS_ID_USUARIOS: '1RgtHxKZgo6PFYY1e6ic9coqjBUaNhRlk2X8_Raz6HNQ',
    SS_ID_VEHICULOS: '1RgtHxKZgo6PFYY1e6ic9coqjBUaNhRlk2X8_Raz6HNQ',
    SS_ID_TELEFONIA: '1RgtHxKZgo6PFYY1e6ic9coqjBUaNhRlk2X8_Raz6HNQ',
    SS_ID_ACCESORIOS: '1RgtHxKZgo6PFYY1e6ic9coqjBUaNhRlk2X8_Raz6HNQ',
    SS_ID_CAJACHICA: '1RgtHxKZgo6PFYY1e6ic9coqjBUaNhRlk2X8_Raz6HNQ',

    // Líneas: lo que escribe (inspecciones, responsivas, fotos, PDF firmados) va a una carpeta de pruebas, nunca a
    // NUCOS de producción. Las carpetas de los demás módulos siguen en las Script Properties del DEV.
    LINEAS_DRIVE_APPSHEET: '1tq-jCsFgdsdMAsQqm1WTHdynQkAN05r5',
    LINEAS_DRIVE_NUCOS: '1tq-jCsFgdsdMAsQqm1WTHdynQkAN05r5',

    // Líneas lee las hojas nuevas (LINEAS, EQUIPOS, ASIGNACIONES…) y LINEAS TELEFONICAS ya no existe en la copia, igual
    // que en producción (allá son Script Properties: LineasLectura)
    LINEAS_LECTURA: 'ESTRUCTURA',
    LINEAS_HOJA_VIEJA_RETIRADA: '2026-10-04T00:00:00.000Z',
  },
};

/**
 * Un valor de configuración: el de este archivo para este proyecto o, si no hay, la Script
 * Property. null si no está en ninguno. Se cachea por ejecución.
 */
const configCache_ = {};
function leerConfig_(clave) {
  if (clave in configCache_) return configCache_[clave];
  let valor = null;
  try {
    const mio = ENTORNOS[ScriptApp.getScriptId()] || {};
    if (mio[clave] !== undefined && String(mio[clave]).trim() !== '') valor = String(mio[clave]).trim();
  } catch (e) { /* sin ScriptApp (pruebas): solo Script Properties */ }
  if (valor === null) {
    const prop = PropertiesService.getScriptProperties().getProperty(clave);
    if (prop !== null && String(prop).trim() !== '') valor = String(prop).trim();
  }
  configCache_[clave] = valor;
  return valor;
}

/** De dónde sale un valor ('archivo', 'propiedad' o null): para el diagnóstico */
function origenConfig_(clave) {
  try {
    const mio = ENTORNOS[ScriptApp.getScriptId()] || {};
    if (mio[clave] !== undefined && String(mio[clave]).trim() !== '') return 'archivo';
  } catch (e) { /* no-op */ }
  const prop = PropertiesService.getScriptProperties().getProperty(clave);
  return prop !== null && String(prop).trim() !== '' ? 'propiedad' : null;
}
