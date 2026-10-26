/**
 * api/Uber.gs — Uber (UberService).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Uber ---
function apiListarUberResumen(token) {
  return UberService.listarResumen(token);
}
function apiUberCompleto(token) {
  return JSON.stringify(UberService.completo(token));
}
function apiBuscarUberPorId(token, id) {
  return UberService.buscarPorId(token, id);
}
function apiCrearUber(token, datos) {
  return UberService.crear(token, datos);
}
function apiActualizarUber(token, id, cambios) {
  return UberService.actualizar(token, id, cambios);
}
function apiEliminarUber(token, id) {
  return UberService.eliminar(token, id);
}
function apiSubirArchivoUber(token, nombreArchivo, mimeType, base64Data) {
  return UberService.subirArchivo(token, nombreArchivo, mimeType, base64Data);
}
function apiUberPanorama(token, forzar) {
  return UberPanorama.panorama(token, forzar);
}
