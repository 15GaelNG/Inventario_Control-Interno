/**
 * api/Permisos.gs — Permisos por módulo (PermisosService; se apoya en Auth.validarSesion).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Permisos por módulo (ver PermisosService.gs — se apoya en Auth.validarSesion) ---
function apiMisPermisos(token) {
  return Permisos.mios(token);
}
function apiRevisarCatalogoPermisos(token) {
  // Solo revisa (no escribe)
  Permisos.puedeLeer(token, 'usuarios');
  return Permisos.revisarCatalogo();
}
// Administración > Usuarios y permisos (solo ADMIN): lo que pinta la pantalla, y guardar sus cambios
function apiPermisosPanel(token) {
  return Permisos.panel(token);
}
function apiPermisosGuardar(token, cambios) {
  return Permisos.guardar(token, cambios);
}
