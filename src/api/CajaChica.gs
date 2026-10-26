/**
 * api/CajaChica.gs — Cajas Chicas: la lista, la ficha en una llamada, alta y edición (CajasChicasService).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Cajas Chicas ---
function apiListarCajasChicasResumen(token) {
  return CajasChicasService.listarResumen(token);
}
function apiCajasChicasCompleto(token) {
  return JSON.stringify(CajasChicasService.completo(token));
}
function apiBuscarCajaChicaPorId(token, id) {
  return CajasChicasService.buscarPorId(token, id);
}
function apiCrearCajaChica(token, datos) {
  return CajasChicasService.crear(token, datos);
}
function apiActualizarCajaChica(token, id, cambios) {
  return CajasChicasService.actualizar(token, id, cambios);
}
function apiEliminarCajaChica(token, id) {
  return CajasChicasService.eliminar(token, id);
}
/**
 * La ficha de una caja chica en UNA llamada (como apiFichaVehiculo): la caja, sus cambios de
 * monto (del mismo módulo) y sus arqueos, que son de su módulo: sin permiso de Arqueos, null y
 * su pestaña no aparece. Si los cambios o los arqueos fallan por otra cosa, salen vacíos.
 */
function apiFichaCajaChica(token, idCch) {
  const parte = partesDeFicha_(token, 'de la caja ' + idCch);
  return JSON.stringify({
    completo: CajasChicasService.buscarPorId(token, idCch),
    cambios: parte('caja-chica.cambios-monto', () => CambiosMontoCCHService.listarPorIdCch(token, idCch)),
    arqueos: parte('arqueos', () => ArqueosService.listarPorIdCch(token, idCch)),
  });
}
