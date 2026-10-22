/**
 * api/Lineas.gs — Líneas: equipos y líneas telefónicas, accesorios, resguardos y cancelaciones (TelefoniaService, LineasAccesorios).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Líneas (equipos y líneas telefónicas) ---
function apiLineasIndice(token) {
  return TelefoniaService.indice(token);
}
function apiLineasEquipo(token, id) {
  return TelefoniaService.equipo(token, id);
}
function apiLineasLinea(token, id) {
  return TelefoniaService.linea(token, id);
}
function apiLineasEvidencias(token, id, vista) {
  return TelefoniaService.evidencias(token, id, vista);
}
function apiLineasHistorial(token, id) {
  return TelefoniaService.historial(token, id);
}
function apiLineasAsignaciones(token, id, vista) {
  return TelefoniaService.asignaciones(token, id, vista);
}
function apiLineasInspeccion(token, id) {
  return TelefoniaService.inspeccion(token, id);
}
function apiLineasResponsiva(token, id) {
  return TelefoniaService.responsiva(token, id);
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
// Tabla completa para DataTable (hasta 5000 filas). Viaja como texto JSON:
// google.script.run pierde respuestas grandes de forma intermitente (ver rama jorge, 9196f11).
function apiLineasBitacoraTabla(token, tipo, opciones) {
  return JSON.stringify(TelefoniaService.bitacora(token, tipo, Object.assign({}, opciones, { pagina: 0, porPagina: 5000 })));
}
function apiLineasUltimoDocumentoNuco(token, id, tipo) {
  return TelefoniaService.ultimoDocumentoNuco(token, id, tipo);
}
function apiLineasArchivo(token, ruta) {
  return TelefoniaService.archivo(token, ruta);
}
function apiLineasPatronAppSheet(token, ruta) {
  return TelefoniaService.patronAppSheet(token, ruta);
}
function apiLineasExportarBase(token, modulo, comprimir) {
  return TelefoniaService.exportarBase(token, modulo, comprimir);
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
function apiLineasPrepararEvidencia(token, tipo, ref, idRegistro) {
  return TelefoniaService.prepararEvidencia(token, tipo, ref, idRegistro);
}
function apiLineasCancelarEvidencia(token, carpetaId) {
  return TelefoniaService.cancelarEvidencia(token, carpetaId);
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
function apiLineasIdentificacionesRegistradas(token, personas) {
  return TelefoniaService.identificacionesRegistradas(token, personas);
}
function apiLineasMediciones(token, filas) {
  return TelefoniaService.registrarMediciones(token, filas);
}
function apiLineasMedirServidor(token, que, id) {
  return TelefoniaService.medirServidor(token, que, id);
}
function apiLineasPasosServidor(token, nombre) {
  return TelefoniaService.pasosServidor(token, nombre);
}
function apiLineasGenerarPdf(token, tipo, id, forzar, firmas) {
  return TelefoniaService.generarPdf(token, tipo, id, forzar, firmas);
}
function apiLineasSubirPdfFirmado(token, registroId, tipo, docId, pdfId, base64, vista) {
  return TelefoniaService.subirPdfFirmado(token, registroId, tipo, docId, pdfId, base64, vista);
}
function apiLineasFormularioRegistro(token, id, parte) {
  return TelefoniaService.formularioRegistro(token, id, parte);
}
function apiLineasCrearRegistro(token, datos) {
  return TelefoniaService.crearRegistro(token, datos);
}
function apiLineasEditarRegistro(token, id, datos) {
  return TelefoniaService.editarRegistro(token, id, datos);
}
function apiLineasVincular(token, datos) {
  return TelefoniaService.vincular(token, datos);
}
function apiLineasFotosInspeccion(token, id, accion) {
  return TelefoniaService.fotosInspeccion(token, id, accion);
}
function apiLineasQuitarFotoInspeccion(token, id, archivoId, comentario) {
  return TelefoniaService.quitarFotoInspeccion(token, id, archivoId, comentario);
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
function apiLineasPanorama(token, forzar) {
  return TelefoniaService.panorama(token, forzar);
}
function apiLineasFormularioMasivo(token, accion) {
  return TelefoniaService.formularioMasivo(token, accion);
}
function apiLineasAccionMasiva(token, accion, ids, datos) {
  return TelefoniaService.accionMasiva(token, accion, ids, datos);
}
function apiLineasFormularioResguardo(token, ids) {
  return TelefoniaService.formularioResguardo(token, ids);
}
function apiLineasMandarResguardo(token, ids, datos) {
  return TelefoniaService.mandarResguardo(token, ids, datos);
}
// Bandeja de resguardos: viaja como texto JSON (como las demás tablas grandes)
function apiLineasMandarCancelacion(token, ids, datos) {
  return TelefoniaService.mandarCancelacion(token, ids, datos);
}
function apiLineasBandejaResguardos(token) {
  return TelefoniaService.bandejaResguardos(token);
}
function apiLineasAccionBandejaResguardo(token, accion, ids, datos) {
  return TelefoniaService.accionBandejaResguardo(token, accion, ids, datos);
}
function apiLineasMarcarNotificaciones(token, ids) {
  return TelefoniaService.marcarNotificaciones(token, ids);
}
