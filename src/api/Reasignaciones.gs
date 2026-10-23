/**
 * api/Reasignaciones.gs — Reasignaciones Vehiculares (ReasignacionesVehicularesService).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Reasignaciones Vehiculares ---
function apiListarReasignacionesVehiculares(token) {
  return ReasignacionesVehicularesService.listarResumen(token);
}
function apiReasignacionesVehicularesCompleto(token) {
  return JSON.stringify(ReasignacionesVehicularesService.completo(token));
}
function apiCrearReasignacionVehicular(token, datos) {
  return ReasignacionesVehicularesService.crear(token, datos);
}
function apiEliminarReasignacionVehicular(token, id) {
  return ReasignacionesVehicularesService.eliminar(token, id);
}

// --- Para la ficha de Vehículos ---
function apiListarReasignacionesVehicularesPorFolio(token, folio) {
  return ReasignacionesVehicularesService.listarPorFolio(token, folio);
}
