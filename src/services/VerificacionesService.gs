/**
 * VerificacionesService.gs
 * Verificación vehicular: cada fila es una verificación capturada a mano,
 * con su comprobante (imagen).
 *
 * Hoja real "VERIFICACIONES" (misma estructura que producción/AppSheet):
 *   ID_VERIFICACION | FOLIO VEHICULO | PLACA | FECHA REGISTRO |
 *   FECHA VERIFICACION | COMPROBANTE VERIFICACION |
 *   FECHA PROXIMA VERIFICACION | REGISTRADO POR
 *
 * - FECHA PROXIMA VERIFICACION se captura a mano (en AppSheet no hay fórmula).
 * - PLACA se copia del vehículo; REGISTRADO POR es el NOMBRE (no el correo),
 *   igual que en los registros de AppSheet.
 * - La acción RECALCULAR / columna ACTIVADOR de AppSheet no aplica aquí.
 * - COMPROBANTE se guarda como ruta AppSheet (ver DriveUtils.gs).
 */

const VerificacionesService = (function () {
  const TABLA = 'VERIFICACIONES';
  const COL_COMPROBANTE = 'COMPROBANTE VERIFICACION';
  const COLUMNAS = ['ID_VERIFICACION', 'FOLIO VEHICULO', COL_COMPROBANTE];

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }

  function hoja_() {
    return SheetUtils.getSheetByColumns(ssId(), COLUMNAS);
  }

  /**
   * Fechas de la hoja → texto ISO (google.script.run pierde arreglos con Date
   * crudos, ver IncidenciasService). Acepta Date o texto "dd/mm/yyyy[ hh:mm[:ss]]",
   * que es como AppSheet deja algunas celdas.
   */
  function fechaISO_(valor) {
    if (!valor) return '';
    if (valor instanceof Date) return isNaN(valor.getTime()) ? '' : valor.toISOString();
    const m = String(valor).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return '';
    const f = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return isNaN(f.getTime()) ? '' : f.toISOString();
  }

  /**
   * "yyyy-MM-dd" (input type=date) → Date a medianoche en la zona del script.
   * No usar new Date('yyyy-MM-dd'): lo interpreta en UTC y en México cae el día anterior.
   */
  function fechaDesdeInput_(texto, nombreCampo) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(texto || ''))) {
      throw new Error('Falta o es inválida la ' + nombreCampo);
    }
    return Utilities.parseDate(texto, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  function desdeOriginal_(row) {
    return {
      ID: row['ID_VERIFICACION'],
      FOLIO: row['FOLIO VEHICULO'] || '',
      PLACA: row['PLACA'] || '',
      FECHA_REGISTRO: fechaISO_(row['FECHA REGISTRO']),
      FECHA_VERIFICACION: fechaISO_(row['FECHA VERIFICACION']),
      FECHA_PROXIMA: fechaISO_(row['FECHA PROXIMA VERIFICACION']),
      COMPROBANTE: row[COL_COMPROBANTE] || '',
      REGISTRADO_POR: row['REGISTRADO POR'] || '',
    };
  }

  function listar(token) {
    Auth.validarSesion(token);
    return SheetUtils.getAll(ssId(), hoja_().getName())
      .filter((r) => r['ID_VERIFICACION'])
      .map(desdeOriginal_)
      .sort((a, b) => (b.FECHA_REGISTRO || '').localeCompare(a.FECHA_REGISTRO || ''));
  }

  /**
   * @param {{FOLIO: string, FECHA_VERIFICACION: string, FECHA_PROXIMA: string}} datos  fechas "yyyy-MM-dd"
   * @param {{base64: string, mimeType: string}} archivo  comprobante
   */
  function registrar(token, datos, archivo) {
    const sesion = Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);

    const folio = String(datos.FOLIO || '').trim();
    if (!folio) throw new Error('El folio del vehículo es obligatorio');
    const vehiculo = SheetUtils.findById(ssId(), 'VEHICULOS', folio, 'FOLIO');
    if (!vehiculo) throw new Error('No existe un vehículo con folio ' + folio);

    const fechaVerificacion = fechaDesdeInput_(datos.FECHA_VERIFICACION, 'fecha de verificación');
    const fechaProxima = fechaDesdeInput_(datos.FECHA_PROXIMA, 'fecha de próxima verificación');
    if (fechaProxima <= fechaVerificacion) {
      throw new Error('La próxima verificación debe ser posterior a la fecha de verificación');
    }
    if (!archivo || !archivo.base64) throw new Error('Adjunta el comprobante de verificación');

    const id = Utilities.getUuid().slice(0, 8);
    const imagen = DriveUtils.guardarImagenAppSheet({
      carpetaId: Config.DRIVE_FOLDERS.VERIFICACIONES(),
      tabla: TABLA,
      idFila: id,
      columna: COL_COMPROBANTE,
      archivo: archivo,
    });

    try {
      SheetUtils.insert(ssId(), hoja_().getName(), {
        'ID_VERIFICACION': id,
        'FOLIO VEHICULO': folio,
        'PLACA': vehiculo.data['PLACA'] || '',
        'FECHA REGISTRO': new Date(),
        'FECHA VERIFICACION': fechaVerificacion,
        [COL_COMPROBANTE]: imagen.ruta,
        'FECHA PROXIMA VERIFICACION': fechaProxima,
        'REGISTRADO POR': sesion.nombre,
      });
    } catch (err) {
      DriveUtils.eliminar(imagen.fileId); // no dejar imágenes huérfanas
      throw err;
    }
    return { ID: id };
  }

  /** URL de Drive del comprobante: busca en la carpeta de escritura y luego en la de lectura. */
  function urlComprobante(token, ruta) {
    Auth.validarSesion(token);
    const url = DriveUtils.urlDeRuta(ruta, [
      Config.DRIVE_FOLDERS.VERIFICACIONES(),
      Config.DRIVE_FOLDERS.VERIFICACIONES_LECTURA(),
    ]);
    if (!url) throw new Error('No se encontró el archivo del comprobante en Drive');
    return url;
  }

  return { listar, registrar, urlComprobante };
})();
