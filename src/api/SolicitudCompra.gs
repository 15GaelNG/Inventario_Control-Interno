/**
 * api/SolicitudCompra.gs — Solicitud de compra, el puente hacia Adquisición antes de que exista el vehículo (SolicitudCompraService).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Solicitud de compra (puente hacia Adquisición Vehicular, antes de que exista el vehículo) ---
function apiListarSolicitudesCompra(token) {
  return JSON.stringify(SolicitudCompraService.listar(token));
}
function apiCrearSolicitudCompra(token, datos) {
  return SolicitudCompraService.crear(token, datos);
}
function apiActualizarSolicitudCompra(token, id, datos) {
  return SolicitudCompraService.actualizar(token, id, datos);
}
function apiEliminarSolicitudCompra(token, id) {
  return SolicitudCompraService.eliminar(token, id);
}
function apiSolicitudCompraArchivos(token, id) {
  return JSON.stringify(SolicitudCompraService.archivos(token, id));
}
function apiSolicitudCompraSubirArchivo(token, id, nombreArchivo, mimeType, base64Data) {
  return SolicitudCompraService.subirArchivo(token, id, nombreArchivo, mimeType, base64Data);
}
function apiSolicitudCompraMarcarConvertida(token, id, nucco) {
  return SolicitudCompraService.marcarConvertida(token, id, nucco);
}
