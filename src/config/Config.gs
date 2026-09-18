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

    SESION_DURACION_HORAS: 8,

    ROLES: {
      ADMIN: 'ADMIN',
      OPERADOR: 'OPERADOR',
      LECTURA: 'LECTURA',
    },
  };
})();
