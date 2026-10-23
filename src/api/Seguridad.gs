/**
 * api/Seguridad.gs — contraseñas y los pasos del inicio de sesión (Credenciales.gs, Auth.gs; 23-oct).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 * Las que no piden token son parte del login: las cuida su reto (un UUID de 10 min, de un solo correo y paso).
 */

// Con una contraseña temporal: la nueva, y con eso la sesión (sin token: todavía no hay sesión)
function apiSeguridadCambiarInicial(reto, nueva) {
  return Auth.cambiarContrasenaInicial(reto, nueva);
}
// La pantalla tuvo actividad (clics, teclas) sin llamar al servidor: renueva la sesión (60 min de inactividad, Auth.gs)
function apiSeguridadSigo(token) {
  Auth.validarSesion(token);
  return true;
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

// --- El código por correo (Verificacion.gs): parte del login, sin token ---
function apiSeguridadVerificarCodigo(reto, codigo, recordar) {
  return Auth.verificarCodigo(reto, codigo, recordar);
}
function apiSeguridadReenviarCodigo(reto) {
  return Verificacion.reenviar(reto);
}
// Mi perfil: mis dispositivos recordados (llave: la de este navegador, para marcarlo) y quitar uno
function apiSeguridadMisDispositivos(token, llave) {
  return Verificacion.misDispositivos(token, llave);
}
function apiSeguridadQuitarDispositivo(token, id) {
  return Verificacion.quitar(token, id);
}
// Usuarios y permisos (EDICIÓN): que ninguno de sus dispositivos se salte el código
function apiSeguridadOlvidarDispositivos(token, correo) {
  return Verificacion.olvidarDe(token, correo);
}
// Mi perfil → Dispositivos: "Cerrar en todos los demás" (llave: la de este navegador, que se queda)
function apiSeguridadQuitarOtros(token, llave) {
  return Verificacion.quitarOtros(token, llave);
}
// Mi perfil → Actividad: mis últimos inicios de sesión (hoja ACCESOS)
function apiSeguridadActividad(token) {
  return Accesos.mios(token, 15);
}
