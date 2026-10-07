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
 *   MODULOS_APAGADOS   (opcional) vistas que este proyecto no enseña ni deja usar, separadas
 *                      por coma (p. ej. "helpdesk" en producción): ver Config.apagado
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
  // Los valores salen de config/Entornos.gs (el bloque de este proyecto) o, si ahí no están,
  // de Script Properties. leerConfig_ los cachea por ejecución: ssId() se llama muchas veces.
  function required(key) {
    const value = leerConfig_(key);
    if (!value) {
      throw new Error(
        'Falta configurar "' + key + '": ponlo en src/config/Entornos.gs (bloque de este proyecto) ' +
        'o en Configuración del proyecto > Propiedades del script.'
      );
    }
    return value;
  }

  return {
    // Getter: se lee al usarse, no al cargar el archivo (Entornos.gs podría cargarse después)
    get ENTORNO() { return leerConfig_('ENTORNO') || 'DEV'; },

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
      VERIFICACIONES_LECTURA: () => leerConfig_('DRIVE_FOLDER_ID_VERIFICACIONES_LECTURA') || '',
      // Carpeta raíz de la app: las rutas largas de AppSheet ("CARPETA/SUBCARPETA/archivo")
      // se resuelven a partir de aquí (ver DriveUtils.archivoDeRutaProfunda)
      RAIZ: () => required('DRIVE_FOLDER_ID_RAIZ'),
      // De dónde se LEEN los dibujos en blanco de MODELOS INSPECCION (nunca se escribe ahí).
      // Puede ser la raíz de la app o la carpeta MODELOS INSPECCION misma: si la ruta empieza
      // con el nombre de la carpeta, ese tramo se salta. En DEV apunta a la de producción,
      // porque la copia de pruebas no tiene todos los dibujos. Sin la propiedad, se usa RAIZ.
      MODELOS: () => leerConfig_('DRIVE_FOLDER_ID_MODELOS') || required('DRIVE_FOLDER_ID_RAIZ'),
      SENSORES: () => required('DRIVE_FOLDER_ID_SENSORES'),
      HOLOGRAMAS_ARCHIVOS: () => required('DRIVE_FOLDER_ID_HOLOGRAMAS_ARCHIVOS'),
      HOLOGRAMAS_IMAGENES: () => required('DRIVE_FOLDER_ID_HOLOGRAMAS_IMAGENES'),
      REPORTES: () => required('DRIVE_FOLDER_ID_REPORTES'),
      INSPECCIONES_IMAGENES: () => required('DRIVE_FOLDER_ID_INSPECCIONES_IMAGENES'),
    },

    // Lo que este proyecto tiene apagado (MODULOS_APAGADOS): el menú no lo pinta (la lista llega
    // en Index.html), el servidor rechaza sus llamadas y revisarEntorno no pide sus hojas
    apagados: () => String(leerConfig_('MODULOS_APAGADOS') || '').split(',').map((s) => s.trim()).filter(Boolean),
    apagado: (id) => Config.apagados().indexOf(id) !== -1,
    exigirEncendido: (id) => {
      if (Config.apagado(id)) throw new Error('Este módulo no está disponible todavía.');
    },

    SESION_DURACION_HORAS: 8,

    ROLES: {
      ADMIN: 'ADMIN',
      OPERADOR: 'OPERADOR',
      LECTURA: 'LECTURA',
    },
  };
})();
