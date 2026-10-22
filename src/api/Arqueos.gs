/**
 * api/Arqueos.gs — Arqueos (ArqueosService).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Arqueos ---
function apiListarAuditItems(token) {
  Permisos.puedeLeer(token, 'arqueos');
  return ArqueosService.AUDIT_ITEMS;
}
function apiListarArqueosResumen(token) {
  return ArqueosService.listarResumen(token);
}
function apiArqueosCompleto(token) {
  return JSON.stringify(ArqueosService.completo(token));
}
function apiBuscarArqueoPorId(token, id) {
  return ArqueosService.buscarPorId(token, id);
}
function apiPrevisualizarIdArqueo(token, idCch) {
  return ArqueosService.previsualizarIdArqueo(token, idCch);
}
function apiCrearArqueo(token, datos) {
  return ArqueosService.crear(token, datos);
}
function apiActualizarArqueo(token, id, cambios) {
  return ArqueosService.actualizar(token, id, cambios);
}
function apiEliminarArqueo(token, id) {
  return ArqueosService.eliminar(token, id);
}
function apiSubirArchivoArqueo(token, nombreArchivo, mimeType, base64Data) {
  return ArqueosService.subirArchivo(token, nombreArchivo, mimeType, base64Data);
}
function apiSubirFirmaArqueo(token, nombreArchivo, mimeType, base64Data) {
  return ArqueosService.subirFirma(token, nombreArchivo, mimeType, base64Data);
}
function apiSubirEvidenciaArqueo(token, nombreArchivo, mimeType, base64Data) {
  return ArqueosService.subirEvidencia(token, nombreArchivo, mimeType, base64Data);
}
function apiUrlArchivoArqueo(token, ruta) {
  return ArqueosService.resolverArchivo(token, ruta);
}

// --- Para la ficha de Caja Chica ---
function apiArqueosPorIdCch(token, idCch) {
  return JSON.stringify(ArqueosService.listarPorIdCch(token, idCch));
}
