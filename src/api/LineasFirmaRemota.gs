/**
 * api/LineasFirmaRemota.gs — la firma a distancia por liga de la Responsiva de Líneas
 * (LineasFirmaRemota.gs), aparte de api/FirmaRemota.gs (Vehicular/Arqueos). Sin `tipo`/`quien`: un
 * solo documento, y el propio token ya dice de quién es (LineasFirmaRemota.buscarPorToken_).
 */

// Sin `token` de sesión: quien firma por la liga puede no tener usuario en el sistema. El TOKEN
// FIRMA[ ROL] de la liga ya es la credencial de estas llamadas (ver el comentario de LineasFirmaRemota.gs).
// Los dos primeros parámetros (tipo, quien) los sigue mandando FirmaExterna.html -- es la misma
// página que usan Vehicular/Arqueos y su JS llama a cualquier tipo con la misma forma (tipo, quien,
// token[, imagen]); aquí no se usan (el token mismo ya dice de quién es), pero aceptarlos evita
// bifurcar ese archivo compartido por tipo.
function apiLineasFirmaRemotaObtener(tipo, quien, tokenFirma) {
  return LineasFirmaRemota.obtenerPendientePorToken(tokenFirma);
}
function apiLineasFirmaRemotaVistaPrevia(tipo, quien, tokenFirma) {
  return LineasFirmaRemota.vistaPrevia(tokenFirma);
}
function apiLineasFirmaRemotaCompletar(tipo, quien, tokenFirma, imagen) {
  return LineasFirmaRemota.completarFirma(tokenFirma, imagen);
}

// Estas SÍ llevan `token` de sesión: las pide quien captura/opera, no quien va a firmar.
function apiLineasFirmaRemotaLiga(token, responsivaId, rol) {
  return LineasFirmaRemota.copiarLiga(token, responsivaId, rol);
}
function apiLineasFirmaRemotaRegenerarLiga(token, responsivaId, rol) {
  return LineasFirmaRemota.regenerarLiga(token, responsivaId, rol);
}
function apiLineasFirmaRemotaEstado(token, responsivaId) {
  return LineasFirmaRemota.estadoLigas(token, responsivaId);
}
