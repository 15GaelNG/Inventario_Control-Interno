/**
 * ClientApi.gs
 * Única superficie de funciones globales que el cliente puede llamar vía
 * google.script.run (que solo invoca funciones de nivel superior, no métodos
 * de objetos namespaced). Cada función aquí es un wrapper delgado hacia el
 * Service correspondiente — así el código de negocio real vive en un solo
 * lugar (services/*.gs) y aquí solo se decide qué queda expuesto al cliente.
 */

// --- Auth ---
function apiLogin(correo, password) {
  return Auth.login(correo, password);
}
function apiIdentidadGoogle() {
  return Auth.identidadGoogle();
}
function apiLoginConGoogle() {
  return Auth.loginConGoogle();
}
function apiLogout(token) {
  return Auth.logout(token);
}

// --- Accesorios ---
function apiListarArticulosConStock(token) {
  return AccesoriosService.listarArticulosConStock(token);
}
function apiCrearArticulo(token, articulo) {
  return AccesoriosService.crearArticulo(token, articulo);
}
function apiRegistrarMovimiento(token, idArticulo, tipo, cantidad, comentarios) {
  return AccesoriosService.registrarMovimiento(token, idArticulo, tipo, cantidad, comentarios);
}
function apiHistorialMovimientos(token, idArticulo) {
  return AccesoriosService.historialMovimientos(token, idArticulo);
}

// --- Vehículos ---
function apiListarVehiculosBasico(token) {
  return VehiculosService.listarBasico(token);
}

// --- Verificaciones ---
function apiListarVerificaciones(token) {
  return VerificacionesService.listar(token);
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
function apiUrlComprobanteVerificacion(token, ruta) {
  return VerificacionesService.urlComprobante(token, ruta);
}

// --- Incidencias ---
function apiListarIncidencias(token) {
  return IncidenciasService.listar(token);
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
