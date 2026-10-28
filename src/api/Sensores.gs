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
  Auth.automatica();   // el estado en vivo se refresca solo: no cuenta como actividad
  // Se pide solo, cada minuto: con la sesión vencida no es un error, se contesta { sesionExpirada } (28-oct). Antes cada
  // pestaña que quedó abierta (también las de antes del arreglo de sensores.html, que no se actualizan solas) dejaba un
  // "Sesión expirada" en el log de producción por minuto.
  try {
    Auth.validarSesion(token);
  } catch (e) {
    if (/sesi[oó]n expirada/i.test(e.message)) return { disponible: false, estados: {}, sesionExpirada: true };
    throw e;
  }
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
