/**
 * VerificacionesService.gs
 * Verificación vehicular: cada fila es una verificación capturada a mano,
 * con su comprobante (imagen).
 *
 * Hoja real "VERIFICACIONES" (misma estructura que producción/AppSheet):
 *   ID | FOLIO VEHICULO | PLACA | FECHA REGISTRO |
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

  function desdeOriginal_(row) {
    return {
      ID: row['ID'],
      FOLIO: row['FOLIO VEHICULO'] || '',
      PLACA: row['PLACA'] || '',
      FECHA_REGISTRO: HojaServicio.fechaISO(row['FECHA REGISTRO']),
      FECHA_VERIFICACION: HojaServicio.fechaISO(row['FECHA VERIFICACION']),
      FECHA_PROXIMA: HojaServicio.fechaISO(row['FECHA PROXIMA VERIFICACION']),
      COMPROBANTE: row[COL_COMPROBANTE] || '',
      REGISTRADO_POR: row['REGISTRADO POR'] || '',
    };
  }

  /** La hoja, para HojaServicio */
  const VERIFICACIONES = {
    modulo: 'verificaciones',
    nombre: 'la verificación',
    libro: () => Config.SPREADSHEET_IDS.VEHICULOS(),
    hoja: TABLA,
    // Huella de la pestaña, no llave de renglón (ver la nota en HologramasService)
    huella: ['FOLIO VEHICULO', COL_COMPROBANTE],
    fila: desdeOriginal_,
    orden: { campo: 'FECHA_REGISTRO', desc: true },
  };

  /**
   * @param {{FOLIO: string, FECHA_VERIFICACION: string, FECHA_PROXIMA: string}} datos  fechas "yyyy-MM-dd"
   * @param {{base64: string, mimeType: string}} archivo  comprobante
   */
  function registrar(token, datos, archivo) {
    const sesion = Permisos.puedeEditar(token, 'verificaciones');

    // Trae el ID del vehículo o su folio, según qué tan migrado esté el formulario.
    const folio = String(datos.FOLIO || '').trim();
    if (!folio) throw new Error('Selecciona el vehículo');
    // Resuelve al vehículo y devuelve ya puestas 'ID VEHICULO', 'FOLIO VEHICULO' y 'PLACA'.
    // Truena si no existe, igual que antes.
    const delVehiculo = Relaciones.datosParaNuevo('VERIFICACIONES', folio);

    const fechaVerificacion = HojaServicio.fechaObligatoria(datos.FECHA_VERIFICACION, 'fecha de verificación');
    const fechaProxima = HojaServicio.fechaObligatoria(datos.FECHA_PROXIMA, 'fecha de próxima verificación');
    if (fechaProxima <= fechaVerificacion) {
      throw new Error('La próxima verificación debe ser posterior a la fecha de verificación');
    }
    if (!archivo || !archivo.base64) throw new Error('Adjunta el comprobante de verificación');

    const id = Ids.nuevo(Entidades.prefijo('VERIFICACIONES'));
    const imagen = DriveUtils.guardarImagenAppSheet({
      carpetaId: Config.DRIVE_FOLDERS.VERIFICACIONES(),
      tabla: TABLA,
      idFila: id,
      columna: COL_COMPROBANTE,
      archivo: archivo,
    });
    // "<ID>_VERIFICACION_<fecha>.ext": urlComprobante() busca el archivo por ese nombre exacto
    const rutaComprobante = HojaServicio.renombrarRuta(imagen.fileId, id, 'VERIFICACION', imagen.ruta);

    try {
      SheetUtils.insert(HojaServicio.libro(VERIFICACIONES), HojaServicio.nombreHoja(VERIFICACIONES), Object.assign({}, delVehiculo.datos, {
        'ID': id,
        'FECHA REGISTRO': new Date(),
        'FECHA VERIFICACION': fechaVerificacion,
        [COL_COMPROBANTE]: rutaComprobante,
        'FECHA PROXIMA VERIFICACION': fechaProxima,
        'REGISTRADO POR': sesion.nombre,
      }));
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
    Permisos.puedeEditar(token, 'verificaciones');
    const libro = HojaServicio.libro(VERIFICACIONES);
    const nombreHoja = HojaServicio.nombreHoja(VERIFICACIONES);
    const actual = SheetUtils.findById(libro, nombreHoja, id, 'ID');
    if (!actual) throw new Error('No se encontró la verificación ' + id);

    const cambios = {};
    if (campo === 'FOLIO') {
      const folio = String(valor || '').trim();
      if (!folio) throw new Error('El folio del vehículo es obligatorio');
      const vehiculo = SheetUtils.findById(libro, 'VEHICULOS', folio, 'FOLIO');
      if (!vehiculo) throw new Error('No existe un vehículo con folio ' + folio);
      cambios['FOLIO VEHICULO'] = folio;
      cambios['PLACA'] = vehiculo.data['PLACA'] || '';
    } else if (campo === 'FECHA_VERIFICACION' || campo === 'FECHA_PROXIMA') {
      const fecha = HojaServicio.fechaObligatoria(valor, campo === 'FECHA_PROXIMA' ? 'fecha de próxima verificación' : 'fecha de verificación');
      const columna = campo === 'FECHA_PROXIMA' ? 'FECHA PROXIMA VERIFICACION' : 'FECHA VERIFICACION';
      const fila = desdeOriginal_(Object.assign({}, actual.data, { [columna]: fecha }));
      if (fila.FECHA_VERIFICACION && fila.FECHA_PROXIMA && fila.FECHA_PROXIMA <= fila.FECHA_VERIFICACION) {
        throw new Error('La próxima verificación debe ser posterior a la fecha de verificación');
      }
      cambios[columna] = fecha;
    } else {
      throw new Error('El campo "' + campo + '" no se puede editar');
    }

    return desdeOriginal_(SheetUtils.update(libro, nombreHoja, id, cambios, 'ID'));
  }

  /** Carpetas donde puede estar un comprobante: la de escritura y la de lectura */
  const carpetas_ = () => [Config.DRIVE_FOLDERS.VERIFICACIONES(), Config.DRIVE_FOLDERS.VERIFICACIONES_LECTURA()];

  /** URL de Drive del comprobante: busca en la carpeta de escritura y luego en la de lectura. */
  function urlComprobante(token, ruta) {
    Permisos.puedeLeer(token, 'verificaciones');
    const url = DriveUtils.urlDeRuta(ruta, carpetas_());
    if (!url) throw new Error('No se encontró el archivo del comprobante en Drive');
    return url;
  }

  /** Imagen del comprobante para el panel de detalle ({url, mimeType, base64|null}). */
  function previsualizarComprobante(token, ruta) {
    Permisos.puedeLeer(token, 'verificaciones');
    const vista = DriveUtils.previsualizarRuta(ruta, carpetas_());
    if (!vista) throw new Error('No se encontró el archivo del comprobante en Drive');
    return vista;
  }

  return {
    listar: (token) => HojaServicio.listar(VERIFICACIONES, token),
    /** Verificaciones de un solo vehículo (ficha de Vehículos) */
    listarPorFolio: (token, folio) => HojaServicio.listarPor(VERIFICACIONES, token, 'FOLIO', folio),
    /** Registro completo (todas las columnas) por ID -- "Ver completo" desde la ficha de Vehículos */
    buscarPorId: (token, id) => HojaServicio.buscarPorId(VERIFICACIONES, token, id),
    /** Todas las columnas de TODAS las verificaciones (para exportar completo) */
    completo: (token) => HojaServicio.completo(VERIFICACIONES, token),
    registrar, actualizarCampo,
    /** Borra varias — solo ADMIN. Los comprobantes NO se borran de Drive (quedan de respaldo,
     * AppSheet tampoco los borra). */
    eliminar: (token, ids) => HojaServicio.eliminar(VERIFICACIONES, token, ids),
    urlComprobante, previsualizarComprobante,
  };
})();
