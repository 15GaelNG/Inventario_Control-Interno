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
function apiBuscarVehiculoPorFolio(token, folio) {
  return VehiculosService.buscarPorFolio(token, folio);
}
function apiListarVehiculosResumen(token) {
  return VehiculosService.listarResumen(token);
}
function apiPrevisualizarFolioVehiculo(token, clase) {
  return VehiculosService.previsualizarFolio(token, clase);
}
function apiCrearVehiculo(token, datos) {
  return VehiculosService.crear(token, datos);
}
function apiActualizarVehiculo(token, id, cambios) {
  return VehiculosService.actualizar(token, id, cambios);
}
function apiEliminarVehiculo(token, id) {
  return VehiculosService.eliminar(token, id);
}
function apiSubirArchivoVehiculo(token, nombreArchivo, mimeType, base64Data) {
  return VehiculosService.subirArchivo(token, nombreArchivo, mimeType, base64Data);
}

// --- Uber ---
function apiListarUberResumen(token) {
  return UberService.listarResumen(token);
}
function apiBuscarUberPorId(token, id) {
  return UberService.buscarPorId(token, id);
}
function apiCrearUber(token, datos) {
  return UberService.crear(token, datos);
}
function apiActualizarUber(token, id, cambios) {
  return UberService.actualizar(token, id, cambios);
}
function apiEliminarUber(token, id) {
  return UberService.eliminar(token, id);
}
function apiSubirArchivoUber(token, nombreArchivo, mimeType, base64Data) {
  return UberService.subirArchivo(token, nombreArchivo, mimeType, base64Data);
}

// --- Tickets ---
function apiListarTicketsResumen(token) {
  return TicketsService.listarResumen(token);
}
function apiBuscarTicketPorId(token, id) {
  return TicketsService.buscarPorId(token, id);
}
function apiCrearTicket(token, datos) {
  return TicketsService.crear(token, datos);
}
function apiActualizarTicket(token, id, cambios) {
  return TicketsService.actualizar(token, id, cambios);
}
function apiEliminarTicket(token, id) {
  return TicketsService.eliminar(token, id);
}

// --- Cajas Chicas ---
function apiListarCajasChicasResumen(token) {
  return CajasChicasService.listarResumen(token);
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

// --- Listas de referencia ---
function apiListarDepartamentos(token) {
  return ListasService.listarDepartamentos(token);
}
function apiListarSolicitantesTickets(token) {
  return TicketsService.listarSolicitantes(token);
}
function apiListarRazonesSociales(token) {
  return ListasService.listarRazonesSociales(token);
}
function apiListarSedes(token) {
  return ListasService.listarSedes(token);
}
function apiListarOficinasDesarrollo(token) {
  return ListasService.listarOficinasDesarrollo(token);
}
function apiListarMarcas(token) {
  return ListasService.listarMarcas(token);
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
