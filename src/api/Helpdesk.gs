/**
 * api/Helpdesk.gs — Help Desk de TI (HelpdeskApi, HelpdeskService); cada llamada revisa Config.exigirEncendido('helpdesk').
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Help Desk (helpdesk de TI) ---
// Todos los que tienen sesión; cada quien ve lo que SU token ve allá. Lo que habla con el
// helpdesk es HelpdeskApi (con sus límites); la copia y el registro en Tickets, HelpdeskService.
function apiHelpdeskEstado(token) {
  Config.exigirEncendido('helpdesk');
  return HelpdeskApi.estado(token);
}
function apiHelpdeskConectar(token, tokenHelpdesk) {
  Config.exigirEncendido('helpdesk');
  return HelpdeskApi.conectar(token, tokenHelpdesk);
}
function apiHelpdeskDesconectar(token) {
  Config.exigirEncendido('helpdesk');
  return HelpdeskApi.desconectar(token);
}
function apiHelpdeskFiltros(token) {
  Config.exigirEncendido('helpdesk');
  return HelpdeskApi.filtros(token);
}
function apiHelpdeskTickets(token, filtros, forzar) {
  Config.exigirEncendido('helpdesk');
  return JSON.stringify(HelpdeskApi.listarTickets(token, filtros, forzar));
}
function apiHelpdeskDetalle(token, idTicket) {
  Config.exigirEncendido('helpdesk');
  return JSON.stringify(HelpdeskApi.detalle(token, idTicket));
}
function apiHelpdeskFormulario(token, idTicket, idForm) {
  Config.exigirEncendido('helpdesk');
  return HelpdeskApi.formulario(token, idTicket, idForm);
}
function apiHelpdeskCatalogo(token) {
  Config.exigirEncendido('helpdesk');
  return HelpdeskService.catalogo(token);
}
function apiHelpdeskArchivo(token, idTicket, ruta) {
  Config.exigirEncendido('helpdesk');
  return HelpdeskApi.archivo(token, idTicket, ruta);
}
function apiHelpdeskRegistrados(token, idsTicket) {
  Config.exigirEncendido('helpdesk');
  return HelpdeskService.registrados(token, idsTicket);
}
function apiHelpdeskRegistrarEnTickets(token, idTicket, datos) {
  Config.exigirEncendido('helpdesk');
  return HelpdeskService.registrarEnTickets(token, idTicket, datos);
}
function apiHelpdeskContexto(token, consulta) {
  Config.exigirEncendido('helpdesk');
  return JSON.stringify(HelpdeskService.contexto(token, consulta));
}
function apiHelpdeskGuardados(token) {
  Config.exigirEncendido('helpdesk');
  return JSON.stringify(HelpdeskService.listarGuardados(token));
}
