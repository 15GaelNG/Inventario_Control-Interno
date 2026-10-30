/**
 * api/Inspecciones.gs — Inspección vehicular (InspeccionesService) y lo de inspecciones en el expediente del NUCO.
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Inspección vehicular ---
function apiListarInspecciones(token) {
  return InspeccionesService.listar(token);
}
function apiInspeccionesCompleto(token) {
  return JSON.stringify(InspeccionesService.completo(token));
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
// Vacía la caché de 6h de estructuraDeTipo -- se necesita después de editar una
// plantilla (o su REAGRUPAR_SECCIONES) para verlo de inmediato, sin esperar.
function apiOlvidarTipoInspeccion(token, tipo) {
  return InspeccionesService.olvidarTipo(token, tipo);
}
function apiRegistrarInspeccion(token, datos, imagenes) {
  return InspeccionesService.registrar(token, datos, imagenes);
}
// Editar una inspección ya guardada: checklist/llantas/voltaje/encabezado. No toca firmas ni
// diagramas (se quedan como se firmaron/dibujaron) ni reenvía el aviso por correo. `archivoFormato`
// es opcional: un PDF/foto ya corregido a mano por fuera del sistema, para subirlo tal cual en vez
// de que el sistema regenere el PDF desde la plantilla.
function apiActualizarInspeccion(token, id, datos, archivoFormato) {
  return InspeccionesService.actualizar(token, id, datos, archivoFormato);
}
// Vista de Kike (punto C): pendientes de inspección sin cargar en Help Desk, y su recordatorio
function apiListarPendientesInspeccion(token) {
  return PendientesInspeccionService.listar(token);
}
function apiInspeccionEnviarRecordatorioPendiente(token, id) {
  return PendientesInspeccionService.enviarRecordatorio(token, id);
}
function apiInspeccionVincularTicketHelpdesk(token, id, idTicketHelpdesk) {
  return PendientesInspeccionService.vincularManual(token, id, idTicketHelpdesk);
}

// --- Para la ficha de Vehículos (y el expediente del NUCO) ---
/**
 * Pestaña "Documentos" de la ficha: lo que hay en la carpeta del NUCO (ExpedienteNuco.listar, solo lectura), con
 * permiso de Vehículos. Sin la responsiva (12-oct-2026): tiene su propia pestaña (Responsiva, con sus permisos), y
 * los préstamos y adherentes viven dentro de su carpeta. El vehículo es su NUCO, nunca el folio.
 */
/**
 * Pestaña Inspecciones de la ficha: las inspecciones del expediente del NUCO (4.-INSPECCIONES en Drive), con sus fotos
 * por sección. Con permiso de Inspección vehicular (el mismo de la pestaña). Texto JSON.
 */
function apiInspeccionesExpediente(token, nucco) {
  const sesion = Permisos.puedeLeer(token, 'inspeccion-vehicular');
  exigirNuccoEnAlcance_(sesion, token, nucco);
  const lista = ExpedienteNuco.inspecciones(nucco);
  // La liga a la carpeta de cada inspección, solo con vehiculos.carpetas (los PDF y las fotos sí)
  return JSON.stringify(veCarpetasNuco_(sesion) ? lista : lista.map((d) => Object.assign({}, d, { url: '' })));
}
/** Las fotos de UNA inspección del expediente (solo al abrirla), por sección y con miniatura. Texto JSON. */
function apiFotosInspeccion(token, nucco, carpetaId) {
  exigirNuccoEnAlcance_(Permisos.puedeLeer(token, 'inspeccion-vehicular'), token, nucco);
  return JSON.stringify(ExpedienteNuco.fotosInspeccion(nucco, carpetaId));
}
function apiInspeccionesPorFolio(token, folio) {
  return JSON.stringify(InspeccionesService.listarPorFolio(token, folio));
}
function apiBuscarInspeccionPorId(token, id) {
  return InspeccionesService.buscarPorId(token, id);
}
