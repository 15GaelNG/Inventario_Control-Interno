/**
 * api/Verificaciones.gs — Verificaciones (VerificacionesService).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Verificaciones ---
function apiListarVerificaciones(token) {
  return VerificacionesService.listar(token);
}
function apiVerificacionesCompleto(token) {
  return JSON.stringify(VerificacionesService.completo(token));
}
function apiRegistrarVerificacion(token, datos, archivo) {
  return VerificacionesService.registrar(token, datos, archivo);
}
function apiActualizarCampoVerificacion(token, id, campo, valor) {
  return VerificacionesService.actualizarCampo(token, id, campo, valor);
}
function apiEliminarVerificaciones(token, ids) {
  return VerificacionesService.eliminar(token, ids);
}
function apiPrevisualizarComprobanteVerificacion(token, ruta) {
  return VerificacionesService.previsualizarComprobante(token, ruta);
}
function apiUrlComprobanteVerificacion(token, ruta) {
  return VerificacionesService.urlComprobante(token, ruta);
}

// --- Para la ficha de Vehículos ---
// Ficha de Vehículos: lo que hay de este folio en otros 5 módulos.
function apiVerificacionesPorFolio(token, folio) {
  return JSON.stringify(VerificacionesService.listarPorFolio(token, folio));
}

// "Ver completo" desde la ficha de Vehículos: el registro entero (todas las columnas
// de la hoja), no el resumen curado que ya traen los *PorFolio de arriba.
function apiBuscarVerificacionPorId(token, id) {
  return VerificacionesService.buscarPorId(token, id);
}
