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
// Temporal, para el arreglo retroactivo de archivos sin compartir (ver
// compartirArchivosExistentes en SetupInicial.gs) — hay que correrla como
// la cuenta que desplegó la app (dueña de los archivos), no como quien esté
// en el editor, así que se llama desde la consola con la app abierta.
function apiCompartirArchivosExistentes(token) {
  return compartirArchivosExistentes(token);
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
function apiPrevisualizarNuccoVehiculo(token) {
  return VehiculosService.previsualizarNucco(token);
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
// Van como JSON.stringify (no el arreglo/objeto directo): con ~500 filas,
// google.script.run pierde la respuesta de forma intermitente (confirmado con
// pruebas — el servidor sí arma las 500 filas, pero a veces el cliente recibe
// vacío). Como texto viaja confiable; el cliente hace JSON.parse().
function apiListarCambiosVehiculos(token) {
  return JSON.stringify(CambiosVehiculosService.listarResumen(token));
}
function apiListarCambiosVehiculosPorFolio(token, folio) {
  return JSON.stringify(CambiosVehiculosService.listarPorFolio(token, folio));
}
function apiListarReasignacionesVehicularesPorFolio(token, folio) {
  return ReasignacionesVehicularesService.listarPorFolio(token, folio);
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

// --- Historial de cambios de monto (Caja Chica) ---
function apiListarCambiosMontoCCH(token) {
  return CambiosMontoCCHService.listarResumen(token);
}
function apiCrearCambioMontoCCH(token, datos) {
  return CambiosMontoCCHService.crear(token, datos);
}
function apiEliminarCambioMontoCCH(token, id) {
  return CambiosMontoCCHService.eliminar(token, id);
}

// --- Reasignaciones Vehiculares ---
function apiListarReasignacionesVehiculares(token) {
  return ReasignacionesVehicularesService.listarResumen(token);
}
function apiCrearReasignacionVehicular(token, datos) {
  return ReasignacionesVehicularesService.crear(token, datos);
}
function apiEliminarReasignacionVehicular(token, id) {
  return ReasignacionesVehicularesService.eliminar(token, id);
}

// --- Arqueos ---
function apiListarAuditItems(token) {
  Permisos.puedeLeer(token, 'arqueos');
  return ArqueosService.AUDIT_ITEMS;
}
function apiListarArqueosResumen(token) {
  return ArqueosService.listarResumen(token);
}
function apiBuscarArqueoPorId(token, id) {
  return ArqueosService.buscarPorId(token, id);
}
function apiPrevisualizarIdArqueo(token, idCch) {
  return ArqueosService.previsualizarIdArqueo(token, idCch);
}
function apiCrearArqueo(token, datos) {
  return ArqueosService.crear(token, datos);
}
function apiActualizarArqueo(token, id, cambios) {
  return ArqueosService.actualizar(token, id, cambios);
}
function apiEliminarArqueo(token, id) {
  return ArqueosService.eliminar(token, id);
}
function apiSubirArchivoArqueo(token, nombreArchivo, mimeType, base64Data) {
  return ArqueosService.subirArchivo(token, nombreArchivo, mimeType, base64Data);
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
function apiListarSedesVehiculo(token) {
  return ListasService.listarSedesVehiculo(token);
}
function apiListarUbicacionesPorSede(token) {
  return ListasService.listarUbicacionesPorSede(token);
}
function apiListarMarcas(token) {
  return ListasService.listarMarcas(token);
}
function apiListarDepartamentosCCH(token) {
  return ListasService.listarDepartamentosCCH(token);
}
function apiListarSedesCCH(token) {
  return ListasService.listarSedesCCH(token);
}
function apiListarOficinasCCH(token) {
  return ListasService.listarOficinasCCH(token);
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

// --- Verificaciones (rama `ayrton`) ---
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
function apiPrevisualizarComprobanteVerificacion(token, ruta) {
  return VerificacionesService.previsualizarComprobante(token, ruta);
}
function apiUrlComprobanteVerificacion(token, ruta) {
  return VerificacionesService.urlComprobante(token, ruta);
}

// --- Instalación de sensores (rama `ayrton`) ---
function apiListarSensores(token) {
  return SensoresService.listar(token);
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

// --- Geotab, solo lectura (rama `ayrton`) ---
function apiGeotabDisponible(token) {
  return SensoresService.geotabDisponible(token);
}
function apiEstadoEnVivoSensores(token) {
  return SensoresService.estadoEnVivo(token);
}
function apiResumenGeotabSensor(token, id, dias) {
  return SensoresService.resumenGeotab(token, id, dias);
}

// --- Hologramas / tarjetas de combustible (rama `ayrton`) ---
function apiListarHologramas(token) {
  return HologramasService.listar(token);
}
function apiCatalogosHologramas(token) {
  return HologramasService.catalogos(token);
}
function apiDatosVehiculoParaHolograma(token, folio) {
  return HologramasService.datosDeVehiculo(token, folio);
}
function apiRegistrarHolograma(token, datos, archivo) {
  return HologramasService.registrar(token, datos, archivo);
}
function apiActualizarCampoHolograma(token, id, campo, valor) {
  return HologramasService.actualizarCampo(token, id, campo, valor);
}
function apiEliminarHologramas(token, ids) {
  return HologramasService.eliminar(token, ids);
}
function apiUrlSolicitudHolograma(token, ruta) {
  return HologramasService.urlSolicitud(token, ruta);
}
function apiSincronizarHologramas(token, ids) {
  return HologramasService.sincronizar(token, ids);
}

// --- Permisos por módulo (rama `ayrton`; ver PermisosService.gs — se apoya en Auth.validarSesion) ---
function apiMisPermisos(token) {
  return Permisos.mios(token);
}
function apiRevisarCatalogoPermisos(token) {
  Permisos.puedeEditar(token, 'usuarios');
  return Permisos.revisarCatalogo();
}

// --- Inspección vehicular (rama `ayrton`) ---
function apiListarInspecciones(token) {
  return InspeccionesService.listar(token);
}
function apiDetalleInspeccion(token, id) {
  return InspeccionesService.detalle(token, id);
}
function apiUrlFormatoInspeccion(token, ruta) {
  return InspeccionesService.urlFormato(token, ruta);
}
function apiPrevisualizarImagenInspeccion(token, ruta) {
  return InspeccionesService.previsualizarImagen(token, ruta);
}
function apiTiposInspeccion(token) {
  return InspeccionesService.tipos(token);
}
function apiEstructuraInspeccion(token, tipo) {
  return InspeccionesService.estructuraDeTipo(token, tipo);
}
function apiRegistrarInspeccion(token, datos, imagenes) {
  return InspeccionesService.registrar(token, datos, imagenes);
}
