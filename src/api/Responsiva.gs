/**
 * api/Responsiva.gs — Responsiva Vehicular (ResponsivaVehicularService).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Responsiva Vehicular ---
function apiListarResponsivasVehicularesPorFolio(token, folio) {
  return JSON.stringify(ResponsivaVehicularService.listarPorFolio(token, folio));
}
function apiBuscarResponsivaVehicularPorId(token, id) {
  // JSON.stringify — igual que las listas grandes: este registro tiene 47+ columnas y
  // google.script.run pierde objetos grandes de forma intermitente si no viajan como texto.
  return JSON.stringify(ResponsivaVehicularService.buscarPorId(token, id));
}
function apiCrearResponsivaVehicular(token, datos, imagenes, opciones) {
  return ResponsivaVehicularService.crear(token, datos, imagenes, opciones);
}
function apiEliminarResponsivaVehicular(token, id) {
  return ResponsivaVehicularService.eliminar(token, id);
}
// Préstamo Vehicular: cierra el préstamo y regresa el vehículo a quien lo tenía antes, sin
// pedir firma ni generar PDF (ver el comentario de devolverPrestamo en el servicio).
function apiDevolverPrestamoVehicular(token, id) {
  return ResponsivaVehicularService.devolverPrestamo(token, id);
}
