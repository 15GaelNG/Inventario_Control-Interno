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
  const COLUMNAS_FIRMA = ['RAZON SOCIAL', 'NOMBRE COMPLETO', 'ESTAUS USUARIO', 'DIAS AUTORIZADOS'];
  const ID_COLUMN = 'ID';

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }

  function hoja_() {
    return SheetUtils.getSheetByColumns(ssId(), COLUMNAS_FIRMA);
  }

  function limpiarValor_(valor) {
    return valor instanceof Date ? valor.toISOString() : valor;
  }

  const COLUMNAS_RESUMEN = ['ID', 'RAZON SOCIAL', 'NOMBRE COMPLETO', 'ESTAUS USUARIO', 'ROL', 'DEPARTAMENTO', 'PUESTO'];

  /** Catálogo ligero para la tabla (7 columnas, no las 15 completas). */
  function listarResumen(token) {
    Auth.validarSesion(token);
    const sheet = hoja_();
    const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, COLUMNAS_RESUMEN);

    const resultado = [];
    for (let i = 0; i < filas; i++) {
      if (!datos['ID'][i]) continue;
      resultado.push({
        ID: datos['ID'][i],
        RAZON_SOCIAL: datos['RAZON SOCIAL'][i] || '',
        NOMBRE_COMPLETO: datos['NOMBRE COMPLETO'][i] || '',
        ESTATUS: datos['ESTAUS USUARIO'][i] || '',
        ROL: datos['ROL'][i] || '',
        DEPARTAMENTO: datos['DEPARTAMENTO'][i] || '',
        PUESTO: datos['PUESTO'][i] || '',
      });
    }
    return resultado.sort((a, b) => String(a.NOMBRE_COMPLETO).localeCompare(String(b.NOMBRE_COMPLETO)));
  }

  /** Registro completo por ID (para el modal de detalle/editar). */
  function buscarPorId(token, id) {
    Auth.validarSesion(token);
    const encontrado = SheetUtils.findById(ssId(), hoja_().getName(), id, ID_COLUMN);
    if (!encontrado) return null;
    const limpio = {};
    Object.keys(encontrado.data).forEach((k) => { limpio[k] = limpiarValor_(encontrado.data[k]); });
    return limpio;
  }

  function crear(token, datos) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    if (!datos['NOMBRE COMPLETO']) throw new Error('El nombre completo es obligatorio');
    const fila = Object.assign({}, datos);
    fila[ID_COLUMN] = Utilities.getUuid().slice(0, 8);
    SheetUtils.insert(ssId(), hoja_().getName(), fila);
    return { ID: fila[ID_COLUMN] };
  }

  function actualizar(token, id, cambios) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    SheetUtils.update(ssId(), hoja_().getName(), id, cambios, ID_COLUMN);
    return { ID: id };
  }

  function eliminar(token, id) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN]);
    const ok = SheetUtils.remove(ssId(), hoja_().getName(), id, ID_COLUMN);
    if (!ok) throw new Error('No se encontró el usuario con ID=' + id);
    return { ID: id };
  }

  return { listarResumen, buscarPorId, crear, actualizar, eliminar };
})();
