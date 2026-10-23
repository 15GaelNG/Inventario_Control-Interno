/**
 * api/Seguridad.gs — contraseñas y los pasos del inicio de sesión (Credenciales.gs, Auth.gs; 23-oct).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 * Las que no piden token son parte del login: las cuida su reto (un UUID de 10 min, de un solo correo y paso).
 */

// Con una contraseña temporal: la nueva, y con eso la sesión (sin token: todavía no hay sesión)
function apiSeguridadCambiarInicial(reto, nueva) {
  return Auth.cambiarContrasenaInicial(reto, nueva);
}
// Mi perfil: si ya tiene contraseña y cuántos caracteres pide una nueva
function apiSeguridadEstado(token) {
  return Credenciales.estado(token);
}
// Mi perfil: cambiar la propia (pide la actual, si la hay)
function apiSeguridadCambiarMia(token, actual, nueva) {
  return Credenciales.cambiarMia(token, actual, nueva);
}
// Usuarios y permisos (EDICIÓN): una temporal para alguien; se muestra una sola vez
function apiSeguridadRestablecer(token, correo) {
  return Credenciales.restablecer(token, correo);
}
