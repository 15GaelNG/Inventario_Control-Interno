/**
 * DocsLote.gs
 * Llenar las etiquetas de texto de una plantilla de Docs en UNA petición (API de Docs, `replaceAllText`), en vez de una
 * llamada de DocumentApp por etiqueta (6-nov, fase 6 del motor único de PDF adelantada: docs/pdf-motor.md).
 *
 *   const lista = DocsLote.marcadores(copiaId, crono);           // ['<<[NOMBRE]>>', '<<FECHA>>', …] distintos
 *   const r = DocsLote.reemplazar(copiaId, [{ marcador, valor }], crono);   // → { hechos, porMarcador }
 *
 * Solo ACELERA: quien lo usa lo llama sobre la copia ANTES de abrirla con DocumentApp y deja fuera lo que trata aparte
 * (imágenes, bloques If, valores con salto de línea, lo que no se pudo calcular). Lo que el lote no haga se queda en el
 * documento y el camino de siempre lo procesa. Si la API no está (o `PDF_SIN_LOTE = 1`, que ponen `pdfLoteApagar()` y quita `pdfLoteEncender()`,
 * para apagarlo sin desplegar), `disponible()` es false y todo sigue como antes.
 *
 * El texto nuevo toma el formato del primer carácter de la etiqueta (lo hace la API), como antes a mano.
 * Nada corre al cargar.
 */
const DocsLote = (function () {
  const PATRON = /<<[^<>]*>>/g;
  const POR_PETICION = 500;

  function disponible() {
    if (typeof Docs === 'undefined' || !Docs || !Docs.Documents) return false;
    try {
      if (typeof leerConfig_ === 'function' && leerConfig_('PDF_SIN_LOTE') === '1') return false;
    } catch (e) { /* sin propiedades (pruebas): encendido */ }
    return true;
  }

  /** El texto de cada párrafo (cuerpo, tablas anidadas, encabezados, pies y notas), con sus tramos ya juntos. */
  function parrafos_(contenido, salida) {
    (contenido || []).forEach((el) => {
      if (el.paragraph) {
        salida.push((el.paragraph.elements || []).map((x) => (x.textRun && x.textRun.content) || '').join(''));
      } else if (el.table) {
        (el.table.tableRows || []).forEach((fila) => (fila.tableCells || []).forEach((celda) => parrafos_(celda.content, salida)));
      } else if (el.tableOfContents) {
        parrafos_(el.tableOfContents.content, salida);
      }
    });
    return salida;
  }

  /** Las etiquetas distintas del documento, en el orden en que aparecen. Una sola lectura. */
  function marcadores(docId, crono) {
    const doc = Docs.Documents.get(docId, { fields: 'body(content),headers,footers,footnotes' });
    const textos = parrafos_(doc.body && doc.body.content, []);
    ['headers', 'footers', 'footnotes'].forEach((k) => Object.keys(doc[k] || {}).forEach((id) => parrafos_(doc[k][id].content, textos)));
    const vistos = {};
    const lista = [];
    textos.forEach((t) => (t.match(PATRON) || []).forEach((m) => { if (!vistos[m]) { vistos[m] = true; lista.push(m); } }));
    if (crono) crono.marcar('lote: leer');
    return lista;
  }

  /** Reemplaza cada `marcador` (texto literal, distingue mayúsculas) por su `valor` en todo el documento. */
  function reemplazar(docId, pares, crono) {
    const porMarcador = {};
    let hechos = 0;
    const lista = (pares || []).filter((p) => p && p.marcador);
    for (let i = 0; i < lista.length; i += POR_PETICION) {
      const tramo = lista.slice(i, i + POR_PETICION);
      const r = Docs.Documents.batchUpdate({
        requests: tramo.map((p) => ({ replaceAllText: { containsText: { text: p.marcador, matchCase: true }, replaceText: String(p.valor) } })),
      }, docId);
      (r.replies || []).forEach((rep, j) => {
        const n = (rep && rep.replaceAllText && rep.replaceAllText.occurrencesChanged) || 0;
        porMarcador[tramo[j].marcador] = n;
        hechos += n;
      });
    }
    if (crono) crono.marcar('lote: reemplazar');
    return { hechos: hechos, porMarcador: porMarcador };
  }

  return { disponible, marcadores, reemplazar, parrafos_ };
})();

/**
 * Desde el editor: apagar o encender el lote sin escribir la propiedad a mano (6-nov, para medir con y sin lote o
 * apagarlo en prod si algo se ve raro). Encender BORRA la propiedad: no queda otra variable más en la lista.
 */
function pdfLoteApagar() {
  soloEditor_();
  PropertiesService.getScriptProperties().setProperty('PDF_SIN_LOTE', '1');
  console.log('Lote de PDF APAGADO: los PDF se llenan una etiqueta a la vez. Para volver: pdfLoteEncender()');
}

function pdfLoteEncender() {
  soloEditor_();
  PropertiesService.getScriptProperties().deleteProperty('PDF_SIN_LOTE');
  console.log('Lote de PDF ENCENDIDO' + (DocsLote.disponible() ? '.' : ', pero la API de Docs no está disponible en este proyecto.'));
}
