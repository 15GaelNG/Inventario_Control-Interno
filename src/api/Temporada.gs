/**
 * api/Temporada.gs — la temporada y la ofrenda de Apariencia (TemporadaService).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Temporada y ofrenda (Apariencia) ---
// Decoración de temporada (Día de Muertos): solo ADMIN
function apiTemporadaGuardar(token, valor) {
  return TemporadaService.guardar(token, valor);
}
// La ofrenda colectiva del Inicio: cualquiera con sesión; quitar, la propia o ADMIN
function apiOfrenda(token) {
  return TemporadaService.ofrenda(token);
}
function apiOfrendaEncender(token, memoria) {
  return TemporadaService.encender(token, memoria);
}
function apiOfrendaApagar(token, id) {
  return TemporadaService.apagar(token, id);
}
