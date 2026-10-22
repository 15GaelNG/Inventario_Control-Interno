/**
 * api/CambiosMonto.gs — el historial de cambios de monto de Caja Chica (CambiosMontoCCHService).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Historial de cambios de monto (Caja Chica) ---
function apiListarCambiosMontoCCH(token) {
  return CambiosMontoCCHService.listarResumen(token);
}
function apiCambiosMontoCCHCompleto(token) {
  return JSON.stringify(CambiosMontoCCHService.completo(token));
}
function apiCrearCambioMontoCCH(token, datos) {
  return CambiosMontoCCHService.crear(token, datos);
}
function apiEliminarCambioMontoCCH(token, id) {
  return CambiosMontoCCHService.eliminar(token, id);
}

// --- Para la ficha de Caja Chica ---
function apiCambiosMontoPorIdCch(token, idCch) {
  return JSON.stringify(CambiosMontoCCHService.listarPorIdCch(token, idCch));
}
// "Ver completo" desde la ficha de Caja Chica: el registro entero, no el resumen curado.
function apiBuscarCambioMontoPorId(token, id) {
  return CambiosMontoCCHService.buscarPorId(token, id);
}
