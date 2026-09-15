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
 *   DRIVE_FOLDER_ID_VERIFICACIONES          carpeta VERIFICACIONES_Images donde se guardan y
 *                                           buscan los comprobantes (DEV: la de pruebas)
 *   DRIVE_FOLDER_ID_VERIFICACIONES_LECTURA  (opcional) carpeta extra donde también se BUSCAN
 */

const Config = (function () {
  const props = PropertiesService.getScriptProperties();

  function required(key) {
    const value = props.getProperty(key);
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

    DRIVE_FOLDERS: {
      VERIFICACIONES: () => required('DRIVE_FOLDER_ID_VERIFICACIONES'),
      VERIFICACIONES_LECTURA: () => props.getProperty('DRIVE_FOLDER_ID_VERIFICACIONES_LECTURA') || '',
    },

    SESION_DURACION_HORAS: 8,

    ROLES: {
      ADMIN: 'ADMIN',
      OPERADOR: 'OPERADOR',
      LECTURA: 'LECTURA',
    },
  };
})();
