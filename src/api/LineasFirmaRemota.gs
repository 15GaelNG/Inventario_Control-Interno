/**
 * api/LineasFirmaRemota.gs — la firma a distancia por liga de la Responsiva y la Inspección de
 * Líneas (LineasFirmaRemota.gs), aparte de api/FirmaRemota.gs (Vehicular/Arqueos). Sin `quien`: un
 * solo documento por liga, y el propio token ya dice de quién es (LineasFirmaRemota.buscarPorToken_).
 */

/** 'lineas-responsiva' / 'lineas-inspeccion' (FirmaExterna.html) -> el descriptor de ese documento. */
function docDeTipoLiga_(tipo) {
  return tipo === 'lineas-inspeccion' ? LineasFirmaRemota.DOCUMENTOS.INSPECCION : LineasFirmaRemota.DOCUMENTOS.RESPONSIVA;
}
/** 'RESPONSIVA' / 'INSPECCION' (lo que ya sabe la pantalla por cada fila de Documentos) -> el descriptor. */
function docDeTipoPdf_(tipoDoc) {
  return tipoDoc === 'INSPECCION' ? LineasFirmaRemota.DOCUMENTOS.INSPECCION : LineasFirmaRemota.DOCUMENTOS.RESPONSIVA;
}

// Sin `token` de sesión: quien firma por la liga puede no tener usuario en el sistema. El TOKEN
// FIRMA[ ROL] de la liga ya es la credencial de estas llamadas (ver el comentario de LineasFirmaRemota.gs).
// Los dos primeros parámetros (tipo, quien) los sigue mandando FirmaExterna.html -- es la misma
// página que usan Vehicular/Arqueos y su JS llama a cualquier tipo con la misma forma (tipo, quien,
// token[, imagen]); aquí `quien` no se usa (el token mismo ya dice de quién es), pero `tipo` sí
// escoge entre Responsiva e Inspección.
function apiLineasFirmaRemotaObtener(tipo, quien, tokenFirma) {
  return LineasFirmaRemota.obtenerPendientePorToken(docDeTipoLiga_(tipo), tokenFirma);
}
function apiLineasFirmaRemotaVistaPrevia(tipo, quien, tokenFirma) {
  return LineasFirmaRemota.vistaPrevia(docDeTipoLiga_(tipo), tokenFirma);
}
function apiLineasFirmaRemotaCompletar(tipo, quien, tokenFirma, imagen) {
  return LineasFirmaRemota.completarFirma(docDeTipoLiga_(tipo), tokenFirma, imagen);
}

// Estas SÍ llevan `token` de sesión: las pide quien captura/opera, no quien va a firmar. `tipoDoc`
// ('RESPONSIVA'/'INSPECCION') dice en qué tabla buscar `documentoId`.
function apiLineasFirmaRemotaLiga(token, tipoDoc, documentoId, rol) {
  return LineasFirmaRemota.copiarLiga(docDeTipoPdf_(tipoDoc), token, documentoId, rol);
}
function apiLineasFirmaRemotaRegenerarLiga(token, tipoDoc, documentoId, rol) {
  return LineasFirmaRemota.regenerarLiga(docDeTipoPdf_(tipoDoc), token, documentoId, rol);
}
function apiLineasFirmaRemotaEstado(token, tipoDoc, documentoId) {
  return LineasFirmaRemota.estadoLigas(docDeTipoPdf_(tipoDoc), token, documentoId);
}
