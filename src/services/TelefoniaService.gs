/**
 * TelefoniaService.gs
 * Módulo de líneas y equipos telefónicos: altas, reasignaciones, suspensiones,
 * bajas por desecho, e inspección de equipo (checklist de daños + firma).
 * Pendiente de finalizar esquema de columnas.
 *
 * Hojas previstas en Config.SPREADSHEET_IDS.TELEFONIA():
 *   LINEAS_EQUIPOS   — catálogo de línea + equipo asignado
 *   REASIGNACIONES   — historial de cambio de responsable
 *   SUSPENSIONES     — bajas temporales / portabilidad
 *   BAJAS            — desecho definitivo, con evidencia
 *   INSPECCIONES     — checklist de daños del equipo (ver PdfService)
 */

const TelefoniaService = (function () {
  const SHEET_LINEAS_EQUIPOS = 'LINEAS_EQUIPOS';

  function ssId() {
    return Config.SPREADSHEET_IDS.TELEFONIA();
  }

  function listar(token) {
    Auth.validarSesion(token);
    return SheetUtils.getAll(ssId(), SHEET_LINEAS_EQUIPOS);
  }

  function crear(token, registro) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    return SheetUtils.insert(ssId(), SHEET_LINEAS_EQUIPOS, registro);
  }

  function actualizar(token, id, cambios) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    return SheetUtils.update(ssId(), SHEET_LINEAS_EQUIPOS, id, cambios);
  }

  // TODO: reasignarResponsable, suspenderLinea, registrarBaja,
  //       guardarInspeccion (usa PdfService.generarReporteDanios)

  return { listar, crear, actualizar };
})();
