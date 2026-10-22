/**
 * api/Sensores.gs — Instalación de sensores y Geotab de solo lectura (SensoresService).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Instalación de sensores ---
function apiListarSensores(token) {
  return SensoresService.listar(token);
}
function apiSensoresCompleto(token) {
  return JSON.stringify(SensoresService.completo(token));
}
function apiDatosVehiculoParaSensor(token, folio) {
  return SensoresService.datosParaFormulario(token, folio);
}
function apiRegistrarSensor(token, datos, archivo) {
  return SensoresService.registrar(token, datos, archivo);
}
function apiActualizarCampoSensor(token, id, campo, valor) {
  return SensoresService.actualizarCampo(token, id, campo, valor);
}
function apiEliminarSensores(token, ids) {
  return SensoresService.eliminar(token, ids);
}
function apiUrlResponsivaSensor(token, ruta) {
  return SensoresService.urlResponsiva(token, ruta);
}

// --- Geotab, solo lectura ---
function apiGeotabDisponible(token) {
  return SensoresService.geotabDisponible(token);
}
function apiEstadoEnVivoSensores(token) {
  return SensoresService.estadoEnVivo(token);
}
function apiResumenGeotabSensor(token, id, dias) {
  return SensoresService.resumenGeotab(token, id, dias);
}

// --- Para la ficha de Vehículos ---
function apiSensoresPorFolio(token, folio) {
  return JSON.stringify(SensoresService.listarPorFolio(token, folio));
}
function apiBuscarSensorPorId(token, id) {
  return SensoresService.buscarPorId(token, id);
}
