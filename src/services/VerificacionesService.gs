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

  /**
   * Edición de UNA celda desde la tabla. Solo estos campos son editables; el resto
   * (ID, placa, fecha de registro, registrado por, comprobante) no.
   * @param {string} campo  FOLIO | FECHA_VERIFICACION | FECHA_PROXIMA
   * @param {string} valor  folio, o fecha "yyyy-MM-dd"
   * @return {Object} la fila actualizada (mismo formato que listar)
   */
  function actualizarCampo(token, id, campo, valor) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    const nombreHoja = hoja_().getName();
    const actual = SheetUtils.findById(ssId(), nombreHoja, id, 'ID_VERIFICACION');
    if (!actual) throw new Error('No se encontró la verificación ' + id);

    const cambios = {};
    if (campo === 'FOLIO') {
      const folio = String(valor || '').trim();
      if (!folio) throw new Error('El folio del vehículo es obligatorio');
      const vehiculo = SheetUtils.findById(ssId(), 'VEHICULOS', folio, 'FOLIO');
      if (!vehiculo) throw new Error('No existe un vehículo con folio ' + folio);
      cambios['FOLIO VEHICULO'] = folio;
      cambios['PLACA'] = vehiculo.data['PLACA'] || '';
    } else if (campo === 'FECHA_VERIFICACION' || campo === 'FECHA_PROXIMA') {
      const fecha = fechaDesdeInput_(valor, campo === 'FECHA_PROXIMA' ? 'fecha de próxima verificación' : 'fecha de verificación');
      const columna = campo === 'FECHA_PROXIMA' ? 'FECHA PROXIMA VERIFICACION' : 'FECHA VERIFICACION';
      const fila = desdeOriginal_(Object.assign({}, actual.data, { [columna]: fecha }));
      if (fila.FECHA_VERIFICACION && fila.FECHA_PROXIMA && fila.FECHA_PROXIMA <= fila.FECHA_VERIFICACION) {
        throw new Error('La próxima verificación debe ser posterior a la fecha de verificación');
      }
      cambios[columna] = fecha;
    } else {
      throw new Error('El campo "' + campo + '" no se puede editar');
    }

    return desdeOriginal_(SheetUtils.update(ssId(), nombreHoja, id, cambios, 'ID_VERIFICACION'));
  }

  /**
   * Borra varias verificaciones — solo ADMIN. Los comprobantes NO se borran de Drive
   * (quedan como respaldo; AppSheet tampoco los borra).
   */
  function eliminar(token, ids) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN]);
    if (!Array.isArray(ids) || !ids.length) throw new Error('No se indicaron registros a eliminar');
    const borradas = SheetUtils.removeMany(ssId(), hoja_().getName(), ids, 'ID_VERIFICACION');
    return { eliminadas: borradas };
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

  /** Imagen del comprobante para el panel de detalle ({url, mimeType, base64|null}). */
  function previsualizarComprobante(token, ruta) {
    Auth.validarSesion(token);
    const vista = DriveUtils.previsualizarRuta(ruta, [
      Config.DRIVE_FOLDERS.VERIFICACIONES(),
      Config.DRIVE_FOLDERS.VERIFICACIONES_LECTURA(),
    ]);
    if (!vista) throw new Error('No se encontró el archivo del comprobante en Drive');
    return vista;
  }

  return { listar, registrar, actualizarCampo, eliminar, urlComprobante, previsualizarComprobante };
})();
