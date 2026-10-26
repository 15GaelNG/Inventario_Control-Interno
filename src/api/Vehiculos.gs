/**
 * api/Vehiculos.gs — Vehículos: la lista, la ficha en una llamada, los documentos del NUCO, alta y edición, y Cambios de Vehículos (VehiculosService, CambiosVehiculosService, ExpedienteNuco).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Vehículos ---
function apiListarVehiculosBasico(token) {
  return VehiculosService.listarBasico(token);
}
function apiBuscarVehiculoPorFolio(token, folio) {
  return VehiculosService.buscarPorFolio(token, folio);
}

/**
 * La ficha de un vehículo en UNA llamada: antes eran 11, y cada llamada cuesta ~1.5–2.5 s aunque
 * no haga nada (Apps Script no las corre todas a la vez). Cada pestaña es de su módulo: sin
 * permiso sale null y no aparece (lo mismo que deModulo en el cliente); si una que sí puede ver
 * falla por otra cosa, sale vacía y las demás siguen. Texto JSON, por la nota de abajo.
 */
function apiFichaVehiculo(token, idVehiculo) {
  // Por el ID del vehículo, nunca por folio (12-oct-2026). Si llega un folio es una página abierta antes del
  // cambio: se busca el vehículo así una vez y todo lo demás va por su ID.
  const completo = VehiculosService.buscar(token, idVehiculo);
  const id = completo ? completo['ID'] : '';
  const parteDe = partesDeFicha_(token, 'del vehículo ' + idVehiculo);
  const parte = (modulo, leer) => (id ? parteDe(modulo, leer) : parteDe(modulo, () => []));
  return JSON.stringify({
    completo: completo,
    cambios: parte('cambios-vehiculos', () => CambiosVehiculosService.listarPorVehiculo(token, id)),
    reasignaciones: parte('reasignaciones-vehiculares', () => ReasignacionesVehicularesService.listarPorVehiculo(token, id)),
    verificaciones: parte('verificaciones', () => VerificacionesService.listarPorVehiculo(token, id)),
    inspecciones: parte('inspeccion-vehicular', () => InspeccionesService.listarPorVehiculo(token, id)),
    sensores: parte('instalacion-sensores', () => SensoresService.listarPorVehiculo(token, id)),
    // Hologramas queda fuera del cambio (se trata aparte): su FOLIO ya sale del catálogo por la serie
    hologramas: parte('hologramas', () => HologramasService.listarPorFolio(token, completo['FOLIO'])),
    incidencias: parte('incidencias', () => IncidenciasService.listarPorVehiculo(token, id)),
    responsivas: parte('vehiculos.responsiva', () => ResponsivaVehicularService.listarPorVehiculo(token, id)),
    adherentes: parte('vehiculos.adherente', () => AdherenteVehicularService.listarPorVehiculo(token, id)),
  });
}
/** Las ligas a las carpetas de Drive del expediente de un NUCO: con su sección (Modulos.gs; un CLIENT no la tiene) */
const veCarpetasNuco_ = (sesion) => !!(sesion.permisos || {})['vehiculos.carpetas'];
/** Rol CLIENT (Permisos.alcanceDe): lo del expediente de un NUCO, solo de un vehículo de su departamento */
function exigirNuccoEnAlcance_(sesion, token, nucco) {
  if (sesion.alcance && !VehiculosService.nuccoEnAlcance(token, nucco)) throw new Error('No tienes acceso a este vehículo.');
}
const DOCUMENTOS_FICHA = ['FACTURA', 'SEGURO', 'ALTA', 'TARJETA', 'TENENCIA'];
// Con su sección de la ficha (vehiculos.documentos); un CLIENT, solo el expediente de un vehículo de su departamento
function apiDocumentosVehiculo(token, nucco) {
  const sesion = Permisos.puedeLeer(token, 'vehiculos.documentos');
  exigirNuccoEnAlcance_(sesion, token, nucco);
  const exp = Object.assign({}, ExpedienteNuco.listar(nucco));
  exp.documentos = exp.documentos.filter((d) => DOCUMENTOS_FICHA.indexOf(d.clave) !== -1);
  // Sin vehiculos.carpetas: los archivos sí, las ligas a las carpetas no (la pantalla esconde la cabecera)
  if (!veCarpetasNuco_(sesion)) {
    exp.url = '';
    exp.carpetas = [];
    exp.documentos = exp.documentos.map((d) => Object.assign({}, d, { url: '' }));
  }
  return JSON.stringify(exp);
}

// JSON.stringify (no el arreglo directo): con FECHA_REGISTRO (Date) en cada fila,
// google.script.run pierde la respuesta de forma intermitente (confirmado con
// pruebas — regresa null aunque el servidor sí arma las filas). Como texto viaja
// confiable; el cliente hace JSON.parse().
function apiListarVehiculosResumen(token) {
  return JSON.stringify(VehiculosService.listarResumen(token));
}
function apiDiagnosticoIdVehiculo(token) {
  return VehiculosService.diagnosticoIds(token);
}
function apiVehiculosCompleto(token) {
  return JSON.stringify(VehiculosService.completo(token));
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
function apiCambiosVehiculosCompleto(token) {
  return JSON.stringify(CambiosVehiculosService.completo(token));
}
function apiListarCambiosVehiculosPorFolio(token, folio) {
  return JSON.stringify(CambiosVehiculosService.listarPorFolio(token, folio));
}
