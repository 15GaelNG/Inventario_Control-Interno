/**
 * api/Incidencias.gs — Incidencias (IncidenciasService).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Incidencias ---
function apiListarIncidencias(token) {
  return IncidenciasService.listar(token);
}
function apiIncidenciasCompleto(token) {
  return JSON.stringify(IncidenciasService.completo(token));
}
function apiCrearIncidencia(token, datos) {
  return IncidenciasService.crear(token, datos);
}
function apiCerrarIncidencia(token, id, datos) {
  return IncidenciasService.cerrar(token, id, datos);
}
function apiActualizarIncidencia(token, id, datos) {
  return IncidenciasService.actualizar(token, id, datos);
}
function apiEliminarIncidencia(token, id) {
  return IncidenciasService.eliminar(token, id);
}
function apiDiagnosticoIncidencias(token) {
  return IncidenciasService.diagnostico(token);
}

// --- Para la ficha de Vehículos ---
function apiIncidenciasPorFolio(token, folio) {
  return JSON.stringify(IncidenciasService.listarPorFolio(token, folio));
}
function apiBuscarIncidenciaPorId(token, id) {
  return IncidenciasService.buscarPorId(token, id);
}
