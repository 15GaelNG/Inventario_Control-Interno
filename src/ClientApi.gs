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

// --- Líneas (equipos y líneas telefónicas) ---
function apiLineasPermisos(token) {
  return TelefoniaService.permisos(token);
}
function apiLineasIndice(token) {
  return TelefoniaService.indice(token);
}
function apiLineasEquipo(token, id) {
  return TelefoniaService.equipo(token, id);
}
function apiLineasLinea(token, id) {
  return TelefoniaService.linea(token, id);
}
function apiLineasEvidencias(token, id) {
  return TelefoniaService.evidencias(token, id);
}
function apiLineasHistorial(token, id) {
  return TelefoniaService.historial(token, id);
}
function apiLineasInspeccion(token, id) {
  return TelefoniaService.inspeccion(token, id);
}
function apiLineasCatalogos(token) {
  return TelefoniaService.catalogos(token);
}
function apiLineasColaboradores(token) {
  return TelefoniaService.colaboradores(token);
}
function apiLineasBitacora(token, tipo, opciones) {
  return TelefoniaService.bitacora(token, tipo, opciones);
}
function apiLineasVistaOperativa(token, tipo, opciones) {
  return TelefoniaService.vistaOperativa(token, tipo, opciones);
}
function apiLineasCrearVistaOperativa(token, tipo, datos) {
  return TelefoniaService.crearVistaOperativa(token, tipo, datos);
}
function apiLineasRecargarDatos(token) {
  return TelefoniaService.recargarDatos(token);
}
function apiLineasContextoInspeccion(token, ref) {
  return TelefoniaService.contextoInspeccion(token, ref);
}
function apiLineasContextoResponsiva(token, ref) {
  return TelefoniaService.contextoResponsiva(token, ref);
}
function apiLineasPrepararEvidencia(token, tipo, ref) {
  return TelefoniaService.prepararEvidencia(token, tipo, ref);
}
function apiLineasCancelarEvidencia(token, carpetaId, fotosCarpetaId) {
  return TelefoniaService.cancelarEvidencia(token, carpetaId, fotosCarpetaId);
}
function apiLineasSubirArchivo(token, carpetaId, nombre, mime, base64) {
  return TelefoniaService.subirArchivo(token, carpetaId, nombre, mime, base64);
}
function apiLineasGuardarInspeccion(token, datos) {
  return TelefoniaService.guardarInspeccion(token, datos);
}
function apiLineasGuardarResponsiva(token, datos) {
  return TelefoniaService.guardarResponsiva(token, datos);
}
function apiLineasGenerarPdf(token, tipo, id, forzar) {
  return TelefoniaService.generarPdf(token, tipo, id, forzar);
}
function apiLineasAccesoriosIndice(token) {
  return LineasAccesorios.indice(token);
}
function apiLineasAccesoriosMovimientos(token, id) {
  return LineasAccesorios.movimientosDeArticulo(token, id);
}
function apiLineasAccesoriosAgregarArticulo(token, datos) {
  return LineasAccesorios.agregarArticulo(token, datos);
}
function apiLineasAccesoriosRegistrarMovimiento(token, datos) {
  return LineasAccesorios.registrarMovimiento(token, datos);
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
