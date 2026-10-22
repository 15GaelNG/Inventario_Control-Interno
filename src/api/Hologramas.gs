/**
 * api/Hologramas.gs — Hologramas y tarjetas de combustible (HologramasService).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Hologramas / tarjetas de combustible ---
function apiListarHologramas(token) {
  return HologramasService.listar(token);
}
function apiHologramasCompleto(token) {
  return JSON.stringify(HologramasService.completo(token));
}
function apiCatalogosHologramas(token) {
  return HologramasService.catalogos(token);
}
function apiDatosVehiculoParaHolograma(token, folio) {
  return HologramasService.datosDeVehiculo(token, folio);
}
function apiRegistrarHolograma(token, datos, archivo) {
  return HologramasService.registrar(token, datos, archivo);
}
function apiActualizarCampoHolograma(token, id, campo, valor) {
  return HologramasService.actualizarCampo(token, id, campo, valor);
}
function apiEliminarHologramas(token, ids) {
  return HologramasService.eliminar(token, ids);
}
function apiUrlSolicitudHolograma(token, ruta) {
  return HologramasService.urlSolicitud(token, ruta);
}
function apiSincronizarHologramas(token, ids) {
  return HologramasService.sincronizar(token, ids);
}

// --- Para la ficha de Vehículos ---
function apiHologramasPorFolio(token, folio) {
  return JSON.stringify(HologramasService.listarPorFolio(token, folio));
}
function apiBuscarHologramaPorId(token, id) {
  return HologramasService.buscarPorId(token, id);
}
