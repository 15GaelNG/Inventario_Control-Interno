/**
 * api/Accesorios.gs — los accesorios de la unidad (AccesoriosVehiculoService).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Accesorios de la unidad (AccesoriosVehiculoService) ---
function apiAccesoriosVehiculo(token, idVehiculo) {
  return AccesoriosVehiculoService.deVehiculo(token, idVehiculo);
}
function apiRegistrarAccesorioVehiculo(token, datos) {
  return AccesoriosVehiculoService.registrar(token, datos);
}
