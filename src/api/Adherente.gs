/**
 * api/Adherente.gs — Adherente Vehicular (AdherenteVehicularService).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Adherente Vehicular ---
function apiListarAdherentesVehicularesPorFolio(token, folio) {
  return JSON.stringify(AdherenteVehicularService.listarPorFolio(token, folio));
}
function apiBuscarAdherenteVehicularPorId(token, id) {
  return JSON.stringify(AdherenteVehicularService.buscarPorId(token, id));
}
function apiCrearAdherenteVehicular(token, datos, imagenes, opciones) {
  return AdherenteVehicularService.crear(token, datos, imagenes, opciones);
}
// Mientras sigue PENDIENTE de firma (ver el comentario de AdherenteVehicularService.actualizar);
// una vez firmado, ya no se puede.
function apiActualizarAdherenteVehicular(token, id, datos) {
  return AdherenteVehicularService.actualizar(token, id, datos);
}
function apiCambiarEstatusAdherenteVehicular(token, id, estatus) {
  return AdherenteVehicularService.cambiarEstatus(token, id, estatus);
}
function apiEliminarAdherenteVehicular(token, id) {
  return AdherenteVehicularService.eliminar(token, id);
}
