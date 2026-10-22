/**
 * api/Adquisicion.gs — Adquisición Vehicular, el expediente externo de solo lectura (AdquisicionVehicularService).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Adquisición Vehicular (expediente externo, solo lectura) ---
function apiBuscarExpedienteAdquisicion(token, serie) {
  return AdquisicionVehicularService.buscar(token, serie);
}
function apiGuardarExpedienteAdquisicion(token, id, datos) {
  return VehiculosService.guardarExpedienteAdquisicion(token, id, datos);
}
function apiAdquisicionVehicularLista(token) {
  return JSON.stringify(AdquisicionVehicularService.listar(token));
}
function apiAdquisicionVehicularArchivos(token, liga) {
  return JSON.stringify(AdquisicionVehicularService.archivos(token, liga));
}
