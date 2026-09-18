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
function apiCrearVehiculo(token, datos) {
  return VehiculosService.crear(token, datos);
}
function apiActualizarVehiculo(token, id, cambios) {
  return VehiculosService.actualizar(token, id, cambios);
}
function apiEliminarVehiculo(token, id) {
  return VehiculosService.eliminar(token, id);
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
function apiPrevisualizarComprobanteVerificacion(token, ruta) {
  return VerificacionesService.previsualizarComprobante(token, ruta);
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

// --- Instalación de sensores ---
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

// --- Geotab (solo lectura) ---
function apiGeotabDisponible(token) {
  return SensoresService.geotabDisponible(token);
}
function apiEstadoEnVivoSensores(token) {
  return SensoresService.estadoEnVivo(token);
}
function apiResumenGeotabSensor(token, id, dias) {
  return SensoresService.resumenGeotab(token, id, dias);
}

// --- Hologramas / tarjetas de combustible ---
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

// --- Permisos ---
function apiMisPermisos(token) {
  return Permisos.mios(token);
}
function apiRevisarCatalogoPermisos(token) {
  Permisos.puedeEditar(token, 'usuarios');
  return Permisos.revisarCatalogo();
}

// --- Inspección vehicular ---
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
