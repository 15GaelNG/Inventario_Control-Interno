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

  /** Da de alta a un usuario. FECHA DE ALTA siempre es "hoy" (no la manda el cliente). */
  function crear(token, datos) {
    Permisos.puedeEditar(token, 'uber');
    if (!datos['NOMBRE COMPLETO']) throw new Error('El nombre completo es obligatorio');
    const fila = Object.assign({}, datos);
    fila[ID_COLUMN] = Utilities.getUuid().slice(0, 8);
    fila['FECHA DE ALTA'] = new Date();
    SheetUtils.insert(ssId(), hoja_().getName(), fila);
    return { ID: fila[ID_COLUMN] };
  }

  function actualizar(token, id, cambios) {
    Permisos.puedeEditar(token, 'uber');
    const datos = Object.assign({}, cambios);
    delete datos['FECHA DE ALTA']; // no se edita, se fija solo al crear
    SheetUtils.update(ssId(), hoja_().getName(), id, datos, ID_COLUMN);
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
  const CARPETA_SOLICITUDES_ID = '1lNo-vHXVT8R2ZMgj2FK2awfIcW17JdY8';
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
    const carpeta = DriveApp.getFolderById(CARPETA_SOLICITUDES_ID);
    const archivo = carpeta.createFile(blob);

    return { url: archivo.getUrl(), id: archivo.getId(), nombre: nombreArchivo };
  }

  return { listarResumen, buscarPorId, crear, actualizar, eliminar, subirArchivo };
})();
