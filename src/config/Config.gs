/**
 * Config.gs
 * Punto único de configuración: IDs de spreadsheets por módulo, nombre del sistema,
 * duración de sesión, etc. Todo se lee de Script Properties para poder tener
 * ambientes DEV / PROD sin tocar código (Project Settings > Script Properties
 * en el editor de Apps Script, o `clasp` + Apps Script API).
 *
 * Propiedades esperadas en Script Properties:
 *   SS_ID_USUARIOS
 *   SS_ID_VEHICULOS
 *   SS_ID_TELEFONIA
 *   SS_ID_ACCESORIOS
 *   SS_ID_CAJACHICA
 *   ENTORNO            ("DEV" | "PROD")
 *
 * Para los módulos nuevos (rama `ayrton` — Verificaciones/Sensores/Hologramas/
 * Inspección Vehicular), además:
 *   DRIVE_FOLDER_ID_VERIFICACIONES          carpeta VERIFICACIONES_Images donde se guardan y
 *                                           buscan los comprobantes (DEV: la de pruebas)
 *   DRIVE_FOLDER_ID_VERIFICACIONES_LECTURA  (opcional) carpeta extra donde también se BUSCAN
 *   DRIVE_FOLDER_ID_RAIZ                    carpeta raíz de la app (rutas largas de AppSheet)
 *   DRIVE_FOLDER_ID_MODELOS                 (opcional) de dónde se LEEN los dibujos en blanco
 *                                           de MODELOS INSPECCION; sin esto se usa RAIZ
 *   DRIVE_FOLDER_ID_SENSORES                carpeta "INSTALACION DE SENSORES_Files_" (responsivas PDF)
 *   DRIVE_FOLDER_ID_HOLOGRAMAS_ARCHIVOS     carpeta "HOLOGRAMAS_Files_" (solicitudes en PDF)
 *   DRIVE_FOLDER_ID_HOLOGRAMAS_IMAGENES     carpeta "HOLOGRAMAS_Images" (solicitudes en foto)
 *   DRIVE_FOLDER_ID_REPORTES                carpeta donde caen los formatos ya llenados en PDF
 *                                           (la misma que usa AppSheet, no una nueva)
 *   DRIVE_FOLDER_ID_INSPECCIONES_IMAGENES   carpeta de imágenes de Inspección Vehicular
 *
 * Geotab (opcional; sin esto la app funciona igual, solo sin telemetría — ver GeotabService.gs):
 *   GEOTAB_USUARIO, GEOTAB_PASSWORD, GEOTAB_BASE_DATOS, GEOTAB_SERVIDOR
 */

const Config = (function () {
  const props = PropertiesService.getScriptProperties();
  // ssId() se llama en CADA función de CADA Service (a veces varias veces
  // por ejecución) — cachear las propiedades ya leídas evita ir a Properties
  // Service una y otra vez por el mismo valor dentro de una sola ejecución.
  const _propsCache = {};

  function required(key) {
    if (!(key in _propsCache)) {
      _propsCache[key] = props.getProperty(key);
    }
    const value = _propsCache[key];
    if (!value) {
      throw new Error(
        'Falta configurar "' + key + '" en Script Properties ' +
        '(Editor de Apps Script > Configuración del proyecto > Propiedades del script).'
      );
    }
    return value;
  }

  return {
    ENTORNO: props.getProperty('ENTORNO') || 'DEV',

    SPREADSHEET_IDS: {
      USUARIOS: () => required('SS_ID_USUARIOS'),
      VEHICULOS: () => required('SS_ID_VEHICULOS'),
      TELEFONIA: () => required('SS_ID_TELEFONIA'),
      ACCESORIOS: () => required('SS_ID_ACCESORIOS'),
      CAJACHICA: () => required('SS_ID_CAJACHICA'),
    },

    // Aditivo (rama `ayrton`): carpetas de Drive que usan Verificaciones/Sensores/
    // Hologramas/Inspección Vehicular (ver DriveUtils.gs). Ningún módulo existente
    // las toca — quedan sin efecto hasta que se configuren las Script Properties.
    DRIVE_FOLDERS: {
      VERIFICACIONES: () => required('DRIVE_FOLDER_ID_VERIFICACIONES'),
      VERIFICACIONES_LECTURA: () => props.getProperty('DRIVE_FOLDER_ID_VERIFICACIONES_LECTURA') || '',
      // Carpeta raíz de la app: las rutas largas de AppSheet ("CARPETA/SUBCARPETA/archivo")
      // se resuelven a partir de aquí (ver DriveUtils.archivoDeRutaProfunda)
      RAIZ: () => required('DRIVE_FOLDER_ID_RAIZ'),
      // De dónde se LEEN los dibujos en blanco de MODELOS INSPECCION (nunca se escribe ahí).
      // Puede ser la raíz de la app o la carpeta MODELOS INSPECCION misma: si la ruta empieza
      // con el nombre de la carpeta, ese tramo se salta. En DEV apunta a la de producción,
      // porque la copia de pruebas no tiene todos los dibujos. Sin la propiedad, se usa RAIZ.
      MODELOS: () => props.getProperty('DRIVE_FOLDER_ID_MODELOS') || required('DRIVE_FOLDER_ID_RAIZ'),
      SENSORES: () => required('DRIVE_FOLDER_ID_SENSORES'),
      HOLOGRAMAS_ARCHIVOS: () => required('DRIVE_FOLDER_ID_HOLOGRAMAS_ARCHIVOS'),
      HOLOGRAMAS_IMAGENES: () => required('DRIVE_FOLDER_ID_HOLOGRAMAS_IMAGENES'),
      REPORTES: () => required('DRIVE_FOLDER_ID_REPORTES'),
      INSPECCIONES_IMAGENES: () => required('DRIVE_FOLDER_ID_INSPECCIONES_IMAGENES'),
    },

    SESION_DURACION_HORAS: 8,

    ROLES: {
      ADMIN: 'ADMIN',
      OPERADOR: 'OPERADOR',
      LECTURA: 'LECTURA',
    },
  };
})();
