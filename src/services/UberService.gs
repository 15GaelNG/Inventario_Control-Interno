/**
 * UberService.gs
 * Catálogo de usuarios autorizados para usar Uber (viáticos). Vive en el
 * mismo spreadsheet original de AppSheet que Vehículos/Incidencias — la
 * pestaña real se ubica por firma de columnas, no por nombre fijo.
 *
 * Columnas reales (15): ID | RAZON SOCIAL | NOMBRE COMPLETO |
 *   ESTAUS USUARIO | ROL | FECHA DE ALTA | CORREO ELECTRONICO |
 *   NUMERO TELEFONO | SEDE | OFICINA/DESARROLLO | DEPARTAMENTO | PUESTO |
 *   SOLICITUD | DIAS AUTORIZADOS | HORARIO AUTORIZADO
 *
 * (Sí, "ESTAUS" es un typo real de la hoja original — se respeta tal cual,
 * es el nombre exacto de la columna.)
 */

const UberService = (function () {
  // Nombre real ya confirmado ("UBER" — ojo, no confundir con la pestaña
  // "UBER JUANITO", que es otra cosa con otras columnas) — directo por
  // nombre, no por firma de columnas (ver mismo comentario en ArqueosService).
  const NOMBRE_HOJA = 'UBER';
  const ID_COLUMN = 'ID';

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }

  function hoja_() {
    return SheetUtils.getSheet(ssId(), NOMBRE_HOJA);
  }

  function limpiarValor_(valor) {
    return valor instanceof Date ? valor.toISOString() : valor;
  }

  // Las 15 columnas reales completas (antes solo se traían 7 para la tabla y
  // el detalle pedía las otras 8 aparte con buscarPorId) — el catálogo de Uber
  // no es tan grande como el de Vehículos, así que traerlas todas de una vez
  // evita ese segundo viaje solo para pintar el panel de detalle.
  const COLUMNAS_RESUMEN = [
    'ID', 'RAZON SOCIAL', 'NOMBRE COMPLETO', 'ESTAUS USUARIO', 'ROL', 'FECHA DE ALTA',
    'CORREO ELECTRONICO', 'NUMERO TELEFONO', 'SEDE', 'OFICINA/DESARROLLO', 'DEPARTAMENTO',
    'PUESTO', 'SOLICITUD', 'DIAS AUTORIZADOS', 'HORARIO AUTORIZADO',
  ];

  /** Catálogo con las 15 columnas reales (nombres tal cual la hoja). */
  function listarResumen(token) {
    Permisos.puedeLeer(token, 'uber');
    // Guardado mientras la hoja no cambie (CacheHojas): el permiso se revisa antes, siempre
    return CacheHojas.recordar('uber_resumen', [[ssId(), NOMBRE_HOJA]], () => {
      const sheet = hoja_();
      const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, COLUMNAS_RESUMEN);

      const resultado = [];
      for (let i = 0; i < filas; i++) {
        if (!datos['ID'][i]) continue;
        const fila = { NOMBRE_COMPLETO: datos['NOMBRE COMPLETO'][i] || '', RAZON_SOCIAL: datos['RAZON SOCIAL'][i] || '', ESTATUS: datos['ESTAUS USUARIO'][i] || '' };
        COLUMNAS_RESUMEN.forEach((clave) => { fila[clave] = limpiarValor_(datos[clave][i]); });
        resultado.push(fila);
      }
      return resultado.sort((a, b) => String(a.NOMBRE_COMPLETO).localeCompare(String(b.NOMBRE_COMPLETO)));
    });
  }

  /** Todas las columnas de TODOS los usuarios (para "Vista": mostrar/exportar cualquier columna). */
  function completo(token) {
    Permisos.puedeLeer(token, 'uber');
    return SheetUtils.getAll(ssId(), NOMBRE_HOJA);
  }

  /** Registro completo por ID (para el modal de detalle/editar). */
  function buscarPorId(token, id) {
    Permisos.puedeLeer(token, 'uber');
    const encontrado = SheetUtils.findById(ssId(), hoja_().getName(), id, ID_COLUMN);
    if (!encontrado) return null;
    const limpio = {};
    Object.keys(encontrado.data).forEach((k) => { limpio[k] = limpiarValor_(encontrado.data[k]); });
    return limpio;
  }

  /** Renombra en Drive el archivo recién subido a "<ID>_SOLICITUD_<fecha>.ext" (conserva la
   *  extensión que ya traía, puesta por subirArchivo a partir del nombre/tipo original del
   *  cliente). No bloquea el alta/edición si falla -- el archivo ya quedó guardado y accesible
   *  con el nombre que traía, solo no se le pudo poner el nombre bonito. */
  function renombrarSolicitud_(fileId, id) {
    if (!fileId || !id) return;
    try {
      const archivo = DriveApp.getFileById(fileId);
      const extension = (archivo.getName().match(/\.[^.]+$/) || [''])[0];
      const fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      archivo.setName(id + '_SOLICITUD_' + fecha + extension);
    } catch (e) {
      console.warn('No se pudo renombrar el archivo de Solicitud (' + fileId + '): ' + e.message);
    }
  }

  /** Da de alta a un usuario. FECHA DE ALTA siempre es "hoy" (no la manda el cliente). */
  function crear(token, datos) {
    Permisos.puedeEditar(token, 'uber');
    if (!datos['NOMBRE COMPLETO']) throw new Error('El nombre completo es obligatorio');
    const fila = Object.assign({}, datos);
    const archivoSolicitudId = fila.SOLICITUD_FILE_ID;
    delete fila.SOLICITUD_FILE_ID; // no es una columna real, solo viaja para poder renombrar
    // El ID lo pone SheetUtils.insert con el formato del sistema (ver docs/ids-asignacion.md)
    fila['FECHA DE ALTA'] = new Date();
    SheetUtils.insert(ssId(), hoja_().getName(), fila);
    renombrarSolicitud_(archivoSolicitudId, fila[ID_COLUMN]);
    return { ID: fila[ID_COLUMN] };
  }

  function actualizar(token, id, cambios) {
    Permisos.puedeEditar(token, 'uber');
    const datos = Object.assign({}, cambios);
    delete datos['FECHA DE ALTA']; // no se edita, se fija solo al crear
    const archivoSolicitudId = datos.SOLICITUD_FILE_ID;
    delete datos.SOLICITUD_FILE_ID; // no es una columna real, solo viaja para poder renombrar
    SheetUtils.update(ssId(), hoja_().getName(), id, datos, ID_COLUMN);
    renombrarSolicitud_(archivoSolicitudId, id);
    return { ID: id };
  }

  function eliminar(token, id) {
    Permisos.puedeEditar(token, 'uber');
    const ok = SheetUtils.remove(ssId(), hoja_().getName(), id, ID_COLUMN);
    if (!ok) throw new Error('No se encontró el usuario con ID=' + id);
    return { ID: id };
  }

  // Carpeta de Drive para el archivo de "Solicitud" (distinta a la de
  // Vehículos). No se cambia la seguridad del archivo — hereda los permisos
  // que ya tenga esa carpeta compartida.
  const CARPETA_SOLICITUDES_ID = '14TxSIYntjxGCEKN8yMDKJ4oGobmUT8At';
  const TAMANO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

  /** Sube un archivo (PDF/imagen) en base64 a la carpeta de solicitudes y regresa su URL. */
  function subirArchivo(token, nombreArchivo, mimeType, base64Data) {
    Permisos.puedeEditar(token, 'uber');
    if (!base64Data) throw new Error('No se recibió ningún archivo.');

    const bytes = Utilities.base64Decode(base64Data);
    if (bytes.length > TAMANO_MAX_BYTES) {
      throw new Error('El archivo pesa más de 10 MB — súbelo más ligero.');
    }

    const blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', nombreArchivo || 'archivo');
    const cuenta = () => Session.getEffectiveUser().getEmail();
    let carpeta, archivo;
    try {
      carpeta = DriveApp.getFolderById(CARPETA_SOLICITUDES_ID);
    } catch (e) {
      throw new Error('No se pudo abrir la carpeta de solicitudes de Uber en Drive. La cuenta con la que ' +
        'corre la app ahora mismo (' + cuenta() + ') no tiene acceso a esa carpeta.');
    }
    try {
      archivo = carpeta.createFile(blob);
    } catch (e) {
      throw new Error('Se pudo abrir la carpeta de solicitudes de Uber, pero no crear el archivo ahí. La cuenta ' +
        cuenta() + ' necesita permiso de editor (no solo lector) en esa carpeta. Error original: ' + e.message);
    }
    // Mejor esfuerzo, no bloquea el registro: la carpeta de solicitudes ya
    // tiene acceso general configurado, así que casi siempre hereda el
    // compartir sola. Si una política de Workspace bloquea el compartir
    // explícito, no vale la pena tronar todo el registro por eso.
    if (!DriveUtils.compartirLoMasAmplioPosible(archivo)) {
      console.warn('No se pudo compartir explícitamente el archivo de Uber (cuenta ' + cuenta() +
        '); se deja como quedó por default de la carpeta. Archivo: ' + archivo.getUrl());
    }

    return { url: archivo.getUrl(), id: archivo.getId(), nombre: nombreArchivo };
  }

  return { listarResumen, completo, buscarPorId, crear, actualizar, eliminar, subirArchivo };
})();
