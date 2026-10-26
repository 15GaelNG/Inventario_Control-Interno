/**
 * api/FirmaRemota.gs — la firma a distancia por liga, de la Responsiva, el Adherente Vehicular y Arqueos.
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Firma a distancia (Responsiva/Adherente Vehicular, Arqueos) ---
// Sin `token` de sesión: quien firma por la liga puede no tener usuario en el sistema. El
// TOKEN FIRMA (o TOKEN FIRMA JEFE/ASISTENTE) de la liga ya es la credencial de estas llamadas
// (ver el comentario al inicio de ResponsivaVehicularService.gs). `quien` distingue cuál de las
// dos ligas es (el responsable/adherente, o el jefe directo/asistente -- cada uno con la suya).
function servicioFirmaRemota_(tipo) {
  if (tipo === 'adherente') return AdherenteVehicularService;
  if (tipo === 'arqueo') return ArqueosService;
  return ResponsivaVehicularService;
}
function apiFirmaRemotaObtener(tipo, quien, tokenFirma) {
  const servicio = servicioFirmaRemota_(tipo);
  if (tipo === 'arqueo') return servicio.obtenerPendienteArqueoPorToken(tokenFirma, quien);
  return quien === 'jefe' ? servicio.obtenerPendienteJefePorToken(tokenFirma) : servicio.obtenerPendientePorToken(tokenFirma);
}
function apiFirmaRemotaVistaPrevia(tipo, quien, tokenFirma) {
  const servicio = servicioFirmaRemota_(tipo);
  return servicio.vistaPrevia(tokenFirma, quien);
}
function apiFirmaRemotaCompletar(tipo, quien, tokenFirma, imagen) {
  const servicio = servicioFirmaRemota_(tipo);
  if (tipo === 'arqueo') return servicio.completarFirmaArqueo(tokenFirma, quien, imagen);
  return quien === 'jefe' ? servicio.completarFirmaJefe(tokenFirma, imagen) : servicio.completarFirma(tokenFirma, imagen);
}
// Esta SÍ lleva `token` de sesión: la pide el operador desde la ficha ("Copiar liga de
// nuevo"), no quien va a firmar. Se arma siempre en el servidor -- nunca en el navegador,
// donde location.origin es el sandbox de Apps Script, no la URL real (ver ligaDeToken).
function apiFirmaRemotaLiga(token, tipo, quien, tokenFirma) {
  const servicio = servicioFirmaRemota_(tipo);
  return tipo === 'arqueo' ? servicio.copiarLigaArqueo(token, tokenFirma, quien) : servicio.ligaDeToken(token, tokenFirma, quien);
}
// "Generar liga"/"Generar nueva liga" (botón manual en la tabla/ficha): token nuevo sobre el
// MISMO registro, sin crear otro -- en Arqueos también sirve para mandar la primera liga de un
// arqueo que ya existe (ver el comentario de generarLigaArqueo en ArqueosService.gs).
// forzar: solo lo usa Arqueos (botón "Generar liga de todas formas" cuando las dos firmas ya
// están o esa parte firmó presencial -- ver el comentario de generarLigaArqueo). Responsiva/
// Adherente ignoran el argumento de más.
function apiFirmaRemotaRegenerarLiga(token, tipo, id, quien, forzar) {
  const servicio = servicioFirmaRemota_(tipo);
  return tipo === 'arqueo' ? servicio.generarLigaArqueo(token, id, quien, forzar) : servicio.regenerarLiga(token, id, quien);
}
