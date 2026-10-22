/**
 * api/Listas.gs — las listas de referencia de los formularios (ListasService).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Listas de referencia ---
function apiListarDepartamentos(token) {
  return ListasService.listarDepartamentos(token);
}
function apiListarRazonesSociales(token) {
  return ListasService.listarRazonesSociales(token);
}
function apiListarSedes(token) {
  return ListasService.listarSedes(token);
}
function apiListarOficinasDesarrollo(token) {
  return ListasService.listarOficinasDesarrollo(token);
}
function apiListarSedesVehiculo(token) {
  return ListasService.listarSedesVehiculo(token);
}
function apiListarUbicacionesPorSede(token) {
  return ListasService.listarUbicacionesPorSede(token);
}
function apiListarMarcas(token) {
  return ListasService.listarMarcas(token);
}
function apiListarDepartamentosCCH(token) {
  return ListasService.listarDepartamentosCCH(token);
}
function apiListarSedesCCH(token) {
  return ListasService.listarSedesCCH(token);
}
function apiListarOficinasCCH(token) {
  return ListasService.listarOficinasCCH(token);
}
