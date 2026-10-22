/**
 * api/FirmaRemota.gs — la firma a distancia por liga, de la Responsiva y el Adherente Vehicular.
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Firma a distancia (Responsiva/Adherente Vehicular) ---
// Sin `token` de sesión: quien firma por la liga puede no tener usuario en el sistema. El
// TOKEN FIRMA (o TOKEN FIRMA JEFE) de la liga ya es la credencial de estas llamadas (ver el
// comentario al inicio de ResponsivaVehicularService.gs). `quien` distingue cuál de las dos
// ligas es (el responsable/adherente, o el jefe directo -- cada uno con la suya).
function apiFirmaRemotaObtener(tipo, quien, tokenFirma) {
  const servicio = tipo === 'adherente' ? AdherenteVehicularService : ResponsivaVehicularService;
  return quien === 'jefe' ? servicio.obtenerPendienteJefePorToken(tokenFirma) : servicio.obtenerPendientePorToken(tokenFirma);
}
function apiFirmaRemotaVistaPrevia(tipo, quien, tokenFirma) {
  const servicio = tipo === 'adherente' ? AdherenteVehicularService : ResponsivaVehicularService;
  return servicio.vistaPrevia(tokenFirma, quien);
}
function apiFirmaRemotaCompletar(tipo, quien, tokenFirma, imagen) {
  const servicio = tipo === 'adherente' ? AdherenteVehicularService : ResponsivaVehicularService;
  return quien === 'jefe' ? servicio.completarFirmaJefe(tokenFirma, imagen) : servicio.completarFirma(tokenFirma, imagen);
}
// Esta SÍ lleva `token` de sesión: la pide el operador desde la ficha ("Copiar liga de
// nuevo"), no quien va a firmar. Se arma siempre en el servidor -- nunca en el navegador,
// donde location.origin es el sandbox de Apps Script, no la URL real (ver ligaDeToken).
function apiFirmaRemotaLiga(token, tipo, quien, tokenFirma) {
  const servicio = tipo === 'adherente' ? AdherenteVehicularService : ResponsivaVehicularService;
  return servicio.ligaDeToken(token, tokenFirma, quien);
}
// "Generar nueva liga" (botón manual en la ficha, ESTADO FIRMA sigue PENDIENTE pero la liga
// anterior venció o se perdió): token nuevo sobre el MISMO registro, sin crear otro.
function apiFirmaRemotaRegenerarLiga(token, tipo, id, quien) {
  const servicio = tipo === 'adherente' ? AdherenteVehicularService : ResponsivaVehicularService;
  return servicio.regenerarLiga(token, id, quien);
}
