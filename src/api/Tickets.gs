/**
 * api/Tickets.gs — Tickets (TicketsService).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Tickets ---
function apiListarTicketsResumen(token) {
  return TicketsService.listarResumen(token);
}
function apiTicketsCompleto(token) {
  return JSON.stringify(TicketsService.completo(token));
}
function apiBuscarTicketPorId(token, id) {
  return TicketsService.buscarPorId(token, id);
}
function apiCrearTicket(token, datos) {
  return TicketsService.crear(token, datos);
}
function apiActualizarTicket(token, id, cambios) {
  return TicketsService.actualizar(token, id, cambios);
}
function apiEliminarTicket(token, id) {
  return TicketsService.eliminar(token, id);
}

// --- Lista de referencia ---
function apiListarSolicitantesTickets(token) {
  return TicketsService.listarSolicitantes(token);
}
