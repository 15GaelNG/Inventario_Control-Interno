/**
 * api/CapitalHumano.gs — colaboradores y Capital Humano (CapitalHumano).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Colaboradores y Capital Humano ---
function apiListarColaboradores(token) {
  return CapitalHumano.listarColaboradores(token);
}
// Administración > Capital humano (solo admins): subir la lista de CH. El archivo viaja comprimido (gzip, base64).
function apiCapitalHumanoResumen(token) {
  return CapitalHumano.resumen(token);
}
function apiCapitalHumanoHistorial(token) {
  return CapitalHumano.historial(token);
}
function apiCapitalHumanoCargar(token, comprimido, opciones) {
  return CapitalHumano.cargar(token, comprimido, opciones);
}
